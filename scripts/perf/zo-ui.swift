// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.
//
// zo-ui: drives browsers for the energy harness the same way for Zen, Firefox and Safari.
// Coordinates are global screen points with a top-left origin. Input goes through the HID event
// tap, so the shell's responsible app needs Accessibility and Screen Recording.
//
//   zo-ui pid <app path> [timeout s] [skip,pids]     wait for the app, print its pids (oldest first)
//   zo-ui front <pid>                                bring the app forward, fail if it stays behind
//   zo-ui frame <pid>                                print the main window frame: x y w h
//   zo-ui setframe <pid> <x> <y> <w> <h>             move and resize the main window
//   zo-ui minimize <pid> | unminimize <pid>
//   zo-ui title <pid>                                print the main window title
//   zo-ui waittitle <pid> <text> <timeout ms>        wait until the window title contains text
//   zo-ui key <pid> <key> [mods] [count] [gap ms]    mods: cmd,opt,shift,ctrl
//   zo-ui type <pid> <text> [chars per second]
//   zo-ui click <pid> <x> <y> [clicks]
//   zo-ui move <x1> <y1> <x2> <y2> <ms> [hz]          pointer glide, no button
//   zo-ui drag <pid> <x1> <y1> <x2> <y2> <ms> [hz]
//   zo-ui scroll <pid> <x> <y> <dy px> <count> <gap ms>
//   zo-ui waitpixel <x> <y> <rrggbb> <tolerance> <timeout ms> [--since <epoch ms>]
//                                                    poll the screen until the pixel matches, print ms
//
// Input commands that take a pid refuse to send anything unless that app is frontmost, so a
// keystroke can never land in another app (the user may be watching this screen).
import AppKit
import ApplicationServices
import CoreGraphics
import Foundation
import ScreenCaptureKit

func fail(_ message: String, _ code: Int32 = 1) -> Never {
    FileHandle.standardError.write(Data((message + "\n").utf8))
    exit(code)
}

let keyCodes: [String: CGKeyCode] = [
    "a": 0, "s": 1, "d": 2, "f": 3, "h": 4, "g": 5, "z": 6, "x": 7, "c": 8, "v": 9, "b": 11, "q": 12,
    "w": 13, "e": 14, "r": 15, "y": 16, "t": 17, "1": 18, "2": 19, "3": 20, "4": 21, "6": 22, "5": 23,
    "=": 24, "9": 25, "7": 26, "-": 27, "8": 28, "0": 29, "]": 30, "o": 31, "u": 32, "[": 33, "i": 34,
    "p": 35, "return": 36, "l": 37, "j": 38, "'": 39, "k": 40, ";": 41, "\\": 42, ",": 43, "/": 44,
    "n": 45, "m": 46, ".": 47, "tab": 48, "space": 49, "`": 50, "delete": 51, "escape": 53,
    "home": 115, "pageup": 116, "end": 119, "pagedown": 121, "left": 123, "right": 124, "down": 125, "up": 126,
]

func app(_ pid: pid_t) -> NSRunningApplication {
    guard let a = NSRunningApplication(processIdentifier: pid) else { fail("no app with pid \(pid)") }
    return a
}

func frontmostPid() -> pid_t? { NSWorkspace.shared.frontmostApplication?.processIdentifier }

/// The user's CandyWrapper demo app must never get input (its pid is in /tmp/cw-demo.pid).
func guardInput(_ pid: pid_t) {
    let front = frontmostPid()
    if let text = try? String(contentsOfFile: "/tmp/cw-demo.pid", encoding: .utf8),
       let demo = pid_t(text.trimmingCharacters(in: .whitespacesAndNewlines)), front == demo {
        fail("refusing input: the user's demo app is frontmost", 3)
    }
    if front != pid { fail("refusing input: pid \(pid) is not frontmost (frontmost is \(front.map { String($0) } ?? "none"))", 3) }
}

func axWindow(_ pid: pid_t) -> AXUIElement {
    let appEl = AXUIElementCreateApplication(pid)
    for attr in [kAXMainWindowAttribute, kAXFocusedWindowAttribute] {
        var v: CFTypeRef?
        if AXUIElementCopyAttributeValue(appEl, attr as CFString, &v) == .success, let w = v { return (w as! AXUIElement) }
    }
    var list: CFTypeRef?
    if AXUIElementCopyAttributeValue(appEl, kAXWindowsAttribute as CFString, &list) == .success,
       let ws = list as? [AXUIElement], let w = ws.first { return w }
    fail("pid \(pid) has no window")
}

func axFrame(_ w: AXUIElement) -> CGRect {
    var p: CFTypeRef?, s: CFTypeRef?
    AXUIElementCopyAttributeValue(w, kAXPositionAttribute as CFString, &p)
    AXUIElementCopyAttributeValue(w, kAXSizeAttribute as CFString, &s)
    var pt = CGPoint.zero, sz = CGSize.zero
    if let p { AXValueGetValue(p as! AXValue, .cgPoint, &pt) }
    if let s { AXValueGetValue(s as! AXValue, .cgSize, &sz) }
    return CGRect(origin: pt, size: sz)
}

func axTitle(_ pid: pid_t) -> String {
    var t: CFTypeRef?
    AXUIElementCopyAttributeValue(axWindow(pid), kAXTitleAttribute as CFString, &t)
    return (t as? String) ?? ""
}

func post(_ e: CGEvent?) { e?.post(tap: .cghidEventTap) }

func mouse(_ type: CGEventType, _ p: CGPoint, clicks: Int64 = 1) {
    let e = CGEvent(mouseEventSource: nil, mouseType: type, mouseCursorPosition: p, mouseButton: .left)
    if type != .mouseMoved { e?.setIntegerValueField(.mouseEventClickState, value: clicks) }
    post(e)
}

/// Moves along a straight line at `hz` events per second, so trackers see a real pointer path.
func glide(_ from: CGPoint, _ to: CGPoint, ms: Double, hz: Double, type: CGEventType) {
    let steps = max(1, Int(ms / 1000 * hz))
    for i in 1...steps {
        let f = Double(i) / Double(steps)
        mouse(type, CGPoint(x: from.x + (to.x - from.x) * f, y: from.y + (to.y - from.y) * f))
        usleep(useconds_t(1_000_000 / hz))
    }
}

func pixel(at p: CGPoint) async -> (Int, Int, Int)? {
    guard let img = try? await SCScreenshotManager.captureImage(in: CGRect(x: p.x, y: p.y, width: 1, height: 1)) else { return nil }
    var px = [UInt8](repeating: 0, count: 4)
    let ctx = CGContext(data: &px, width: 1, height: 1, bitsPerComponent: 8, bytesPerRow: 4,
                        space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
    ctx?.draw(img, in: CGRect(x: 0, y: 0, width: 1, height: 1))
    return (Int(px[0]), Int(px[1]), Int(px[2]))
}

let a = CommandLine.arguments
func arg(_ i: Int) -> String {
    guard i < a.count else { fail("missing argument \(i)", 2) }
    return a[i]
}
func num(_ i: Int) -> Double {
    guard let v = Double(arg(i)) else { fail("argument \(i) must be a number", 2) }
    return v
}
func pidArg(_ i: Int) -> pid_t {
    guard let v = pid_t(arg(i)) else { fail("argument \(i) must be a pid", 2) }
    return v
}
func optional(_ i: Int, _ fallback: Double) -> Double { i < a.count ? (Double(a[i]) ?? fallback) : fallback }
func nowMs() -> Double { Date().timeIntervalSince1970 * 1000 }

switch a.count > 1 ? a[1] : "" {
case "pid":
    // Every running instance at this bundle path, oldest first. `open -n` can start a second
    // instance next to one this harness did not start, so callers diff the list around a launch.
    let path = URL(fileURLWithPath: arg(2)).resolvingSymlinksInPath().path
    let deadline = Date().addingTimeInterval(optional(3, 30))
    let skip = Set((a.count > 4 ? a[4] : "").split(separator: ",").compactMap { pid_t($0) })
    repeat {
        let found = NSWorkspace.shared.runningApplications
            .filter { $0.bundleURL?.resolvingSymlinksInPath().path == path && !skip.contains($0.processIdentifier) }
            .sorted { ($0.launchDate ?? .distantPast) < ($1.launchDate ?? .distantPast) }
        if !found.isEmpty { print(found.map { String($0.processIdentifier) }.joined(separator: " ")); exit(0) }
        usleep(50_000)
    } while Date() < deadline
    fail("\(path) did not start")
case "front":
    let pid = pidArg(2)
    for _ in 0..<40 {
        if frontmostPid() == pid { print("front", pid); exit(0) }
        app(pid).activate()
        AXUIElementSetAttributeValue(AXUIElementCreateApplication(pid), kAXFrontmostAttribute as CFString, kCFBooleanTrue)
        usleep(100_000)
    }
    fail("pid \(pid) did not come forward")
case "frame":
    let f = axFrame(axWindow(pidArg(2)))
    print(Int(f.minX), Int(f.minY), Int(f.width), Int(f.height))
case "setframe":
    let w = axWindow(pidArg(2))
    var p = CGPoint(x: num(3), y: num(4)), s = CGSize(width: num(5), height: num(6))
    AXUIElementSetAttributeValue(w, kAXPositionAttribute as CFString, AXValueCreate(.cgPoint, &p)!)
    AXUIElementSetAttributeValue(w, kAXSizeAttribute as CFString, AXValueCreate(.cgSize, &s)!)
    AXUIElementSetAttributeValue(w, kAXPositionAttribute as CFString, AXValueCreate(.cgPoint, &p)!)
    let f = axFrame(w)
    print(Int(f.minX), Int(f.minY), Int(f.width), Int(f.height))
case "minimize", "unminimize":
    AXUIElementSetAttributeValue(axWindow(pidArg(2)), kAXMinimizedAttribute as CFString,
                                 a[1] == "minimize" ? kCFBooleanTrue : kCFBooleanFalse)
    print(a[1], arg(2))
case "title":
    print(axTitle(pidArg(2)))
case "waittitle":
    let pid = pidArg(2), want = arg(3), start = nowMs()
    while nowMs() - start < num(4) {
        if axTitle(pid).contains(want) { print(Int(nowMs() - start)); exit(0) }
        usleep(100_000)
    }
    fail("title never contained \(want); last: \(axTitle(pid))")
case "key":
    let pid = pidArg(2)
    guard let code = keyCodes[arg(3)] else { fail("unknown key \(arg(3))", 2) }
    var flags: CGEventFlags = []
    for m in (a.count > 4 ? a[4] : "").split(separator: ",") {
        switch m {
        case "cmd": flags.insert(.maskCommand)
        case "opt": flags.insert(.maskAlternate)
        case "shift": flags.insert(.maskShift)
        case "ctrl": flags.insert(.maskControl)
        case "none", "": break
        default: fail("unknown modifier \(m)", 2)
        }
    }
    let count = Int(optional(5, 1)), gap = optional(6, 0)
    for i in 0..<count {
        guardInput(pid)
        for down in [true, false] {
            let e = CGEvent(keyboardEventSource: nil, virtualKey: code, keyDown: down)
            e?.flags = flags
            post(e)
            usleep(20_000)
        }
        if i < count - 1 { usleep(useconds_t(gap * 1000)) }
    }
    print("key", arg(3), count)
case "type":
    let pid = pidArg(2), cps = optional(4, 10)
    let src = CGEventSource(stateID: .hidSystemState)
    for unit in arg(3).utf16 {
        guardInput(pid)
        var u = unit
        for down in [true, false] {
            let e = CGEvent(keyboardEventSource: src, virtualKey: 0, keyDown: down)!
            e.keyboardSetUnicodeString(stringLength: 1, unicodeString: &u)
            e.flags = []  // the HID source can still carry modifiers from an earlier shortcut
            post(e)
        }
        usleep(useconds_t(1_000_000 / cps))
    }
    print("typed", arg(3).count)
case "click":
    let pid = pidArg(2), p = CGPoint(x: num(3), y: num(4))
    guardInput(pid)
    mouse(.mouseMoved, p)
    usleep(50_000)
    for n in 1...Int64(optional(5, 1)) {
        mouse(.leftMouseDown, p, clicks: n); usleep(30_000)
        mouse(.leftMouseUp, p, clicks: n); usleep(60_000)
    }
    print("clicked", Int(p.x), Int(p.y))
case "move":
    glide(CGPoint(x: num(2), y: num(3)), CGPoint(x: num(4), y: num(5)), ms: num(6), hz: optional(7, 60), type: .mouseMoved)
    print("moved")
case "drag":
    let pid = pidArg(2), from = CGPoint(x: num(3), y: num(4)), to = CGPoint(x: num(5), y: num(6))
    guardInput(pid)
    mouse(.mouseMoved, from); usleep(50_000)
    mouse(.leftMouseDown, from); usleep(50_000)
    glide(from, to, ms: num(7), hz: optional(8, 60), type: .leftMouseDragged)
    mouse(.leftMouseUp, to)
    print("dragged")
case "scroll":
    let pid = pidArg(2), p = CGPoint(x: num(3), y: num(4))
    guard let dy = Int32(arg(5)) else { fail("dy must be an integer", 2) }
    let count = Int(num(6)), gap = num(7)
    mouse(.mouseMoved, p); usleep(50_000)
    for _ in 0..<count {
        guardInput(pid)
        let e = CGEvent(scrollWheelEvent2Source: nil, units: .pixel, wheelCount: 1, wheel1: dy, wheel2: 0, wheel3: 0)
        e?.location = p
        post(e)
        usleep(useconds_t(gap * 1000))
    }
    print("scrolled", dy, count)
case "waitpixel":
    let p = CGPoint(x: num(2), y: num(3)), hex = arg(4), tol = Int(num(5)), timeout = num(6)
    guard hex.count == 6, let v = Int(hex, radix: 16) else { fail("colour must be rrggbb", 2) }
    let want = (v >> 16 & 255, v >> 8 & 255, v & 255)
    var since = nowMs()
    if let i = a.firstIndex(of: "--since"), i + 1 < a.count, let s = Double(a[i + 1]) { since = s }
    let sem = DispatchSemaphore(value: 0)
    Task {
        let start = nowMs()
        var last: (Int, Int, Int)?
        while nowMs() - start < timeout {
            if let c = await pixel(at: p) {
                last = c
                if abs(c.0 - want.0) <= tol && abs(c.1 - want.1) <= tol && abs(c.2 - want.2) <= tol {
                    print(Int(nowMs() - since)); exit(0)
                }
            }
            try? await Task.sleep(nanoseconds: 15_000_000)
        }
        fail("pixel never matched; last \(last.map { "\($0)" } ?? "none")")
    }
    sem.wait()
default:
    fail("usage: see the header of scripts/perf/zo-ui.swift", 2)
}
