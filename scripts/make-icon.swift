#!/usr/bin/env swift
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Draws Origin's placeholder mark (an off-white circle on a dark grey
// rounded square) and writes every branding image a macOS build packs into
// configs/branding/release, including the DMG volume icon, the DMG window
// background and Assets.car (needs Xcode's actool). surfer copies them into engine/browser/branding
// on `npm run import`.
//
// Run from the repo root: swift scripts/make-icon.swift [output dir]
//
// ponytail: placeholder art, replace the drawing code once the final icon is
// decided before the first release.

import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

let dark = CGColor(srgbRed: 0.20, green: 0.20, blue: 0.21, alpha: 1)  // #333336
let light = CGColor(srgbRed: 0.96, green: 0.96, blue: 0.95, alpha: 1)  // #F5F5F2
let darkHex = "#333336"
let lightHex = "#F5F5F2"

let out = URL(
  fileURLWithPath: CommandLine.arguments.count > 1
    ? CommandLine.arguments[1] : "configs/branding/release")
let content = out.appendingPathComponent("content")
let tmp = FileManager.default.temporaryDirectory.appendingPathComponent(
  "origin-icon-\(getpid())")
try FileManager.default.createDirectory(at: content, withIntermediateDirectories: true)
try FileManager.default.createDirectory(at: tmp, withIntermediateDirectories: true)

enum Kind {
  case fullBleed  // rounded square fills the canvas (small icons, about pages)
  case macGrid  // Apple's app icon grid: 824/1024 square, 100 px margin
  case document  // page with the mark in the middle (document.icns)
}

// Rounded square with the circle mark, in a box at (x, y) of side s.
func drawMark(_ ctx: CGContext, x: CGFloat, y: CGFloat, s: CGFloat) {
  let square = CGPath(
    roundedRect: CGRect(x: x, y: y, width: s, height: s),
    cornerWidth: s * 0.225, cornerHeight: s * 0.225, transform: nil)
  ctx.setFillColor(dark)
  ctx.addPath(square)
  ctx.fillPath()
  let d = s * 0.5
  ctx.setFillColor(light)
  ctx.fillEllipse(in: CGRect(x: x + (s - d) / 2, y: y + (s - d) / 2, width: d, height: d))
}

func render(_ kind: Kind, width: Int, height: Int? = nil) -> CGImage {
  let w = CGFloat(width)
  let h = CGFloat(height ?? width)
  let ctx = CGContext(
    data: nil, width: width, height: height ?? width, bitsPerComponent: 8, bytesPerRow: 0,
    space: CGColorSpace(name: CGColorSpace.sRGB)!,
    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
  ctx.setShouldAntialias(true)
  switch kind {
  case .fullBleed:
    let s = min(w, h)
    drawMark(ctx, x: (w - s) / 2, y: (h - s) / 2, s: s)
  case .macGrid:
    drawMark(ctx, x: w * 100 / 1024, y: h * 100 / 1024, s: w * 824 / 1024)
  case .document:
    let pw = w * 0.625
    let ph = h * 0.80
    let page = CGPath(
      roundedRect: CGRect(x: (w - pw) / 2, y: (h - ph) / 2, width: pw, height: ph),
      cornerWidth: w * 0.04, cornerHeight: w * 0.04, transform: nil)
    ctx.setFillColor(light)
    ctx.addPath(page)
    ctx.fillPath()
    ctx.setStrokeColor(CGColor(srgbRed: 0.5, green: 0.5, blue: 0.52, alpha: 1))
    ctx.setLineWidth(max(1, w / 256))
    ctx.addPath(page)
    ctx.strokePath()
    let s = w * 0.30
    drawMark(ctx, x: (w - s) / 2, y: (h - s) / 2, s: s)
  }
  return ctx.makeImage()!
}

func writePNG(_ image: CGImage, _ url: URL, dpi: Int = 72) {
  let dest = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil)!
  let props = [kCGImagePropertyDPIWidth: dpi, kCGImagePropertyDPIHeight: dpi] as CFDictionary
  CGImageDestinationAddImage(dest, image, dpi == 72 ? nil : props)
  precondition(CGImageDestinationFinalize(dest), "could not write \(url.path)")
}

func run(_ tool: String, _ args: [String]) {
  let p = Process()
  p.executableURL = URL(fileURLWithPath: tool)
  p.arguments = args
  p.standardOutput = FileHandle.nullDevice
  try! p.run()
  p.waitUntilExit()
  precondition(p.terminationStatus == 0, "\(tool) \(args) failed")
}

func icns(_ kind: Kind, _ name: String) {
  let set = tmp.appendingPathComponent("\(name).iconset")
  try! FileManager.default.createDirectory(at: set, withIntermediateDirectories: true)
  for base in [16, 32, 128, 256, 512] {
    writePNG(render(kind, width: base), set.appendingPathComponent("icon_\(base)x\(base).png"))
    writePNG(render(kind, width: base * 2), set.appendingPathComponent("icon_\(base)x\(base)@2x.png"))
  }
  run("/usr/bin/iconutil", ["-c", "icns", set.path, "-o", out.appendingPathComponent("\(name).icns").path])
}

// App icon and the PNG sizes surfer copies to default<N>.png and icon<N>.png.
for size in [16, 22, 24, 32, 48, 64, 128, 256, 512, 1024] {
  writePNG(render(.fullBleed, width: size), out.appendingPathComponent("logo\(size).png"))
}
writePNG(render(.fullBleed, width: 1024), out.appendingPathComponent("logo.png"))
writePNG(render(.macGrid, width: 1024), out.appendingPathComponent("logo-mac.png"))
icns(.macGrid, "firefox")
icns(.document, "document")
icns(.macGrid, "disk")  // DMG volume icon

// DMG window background: plain dark grey, 720x440 points at 2x like Mozilla's
// file. dsstore points Finder at it and sets the window to that size.
let bgCtx = CGContext(
  data: nil, width: 1440, height: 880, bitsPerComponent: 8, bytesPerRow: 0,
  space: CGColorSpace(name: CGColorSpace.sRGB)!,
  bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
bgCtx.setFillColor(dark)
bgCtx.fill(CGRect(x: 0, y: 0, width: 1440, height: 880))
writePNG(bgCtx.makeImage()!, out.appendingPathComponent("background.png"), dpi: 144)

// Assets.car: browser/app/moz.build and package-manifest.in still pack it,
// though nothing reads it while no_liquid_glass_icon.patch drops
// CFBundleIconName. Compile one from the mark so no Mozilla art ships.
let xcassets = tmp.appendingPathComponent("Assets.xcassets")
let appiconset = xcassets.appendingPathComponent("AppIcon.appiconset")
try FileManager.default.createDirectory(at: appiconset, withIntermediateDirectories: true)
var images: [String] = []
for base in [16, 32, 128, 256, 512] {
  for scale in [1, 2] {
    let file = "icon_\(base)x\(base)\(scale == 2 ? "@2x" : "").png"
    writePNG(render(.macGrid, width: base * scale), appiconset.appendingPathComponent(file))
    images.append(
      #"{"idiom":"mac","size":"\#(base)x\#(base)","scale":"\#(scale)x","filename":"\#(file)"}"#)
  }
}
try #"{"images":[\#(images.joined(separator: ","))],"info":{"version":1,"author":"xcode"}}"#
  .write(to: appiconset.appendingPathComponent("Contents.json"), atomically: true, encoding: .utf8)
try #"{"info":{"version":1,"author":"xcode"}}"#
  .write(to: xcassets.appendingPathComponent("Contents.json"), atomically: true, encoding: .utf8)
let carDir = tmp.appendingPathComponent("car")
try FileManager.default.createDirectory(at: carDir, withIntermediateDirectories: true)
run("/usr/bin/xcrun", [
  "actool", xcassets.path, "--compile", carDir.path, "--platform", "macosx",
  "--minimum-deployment-target", "11.0", "--app-icon", "AppIcon",
  "--output-partial-info-plist", tmp.appendingPathComponent("partial.plist").path,
])
try? FileManager.default.removeItem(at: out.appendingPathComponent("Assets.car"))
try FileManager.default.copyItem(
  at: carDir.appendingPathComponent("Assets.car"), to: out.appendingPathComponent("Assets.car"))

// document.ico is packed into omni.ja on every platform (branding jar.mn).
let docPNG = tmp.appendingPathComponent("document256.png")
writePNG(render(.document, width: 256), docPNG)
run("/usr/bin/sips", ["-s", "format", "ico", docPNG.path, "--out", out.appendingPathComponent("document.ico").path])

// About dialog, about:privatebrowsing and the unofficial "Nightly" about.png.
writePNG(render(.fullBleed, width: 512), content.appendingPathComponent("about-logo.png"))
writePNG(render(.fullBleed, width: 1024), content.appendingPathComponent("about-logo@2x.png"))
writePNG(render(.fullBleed, width: 192), content.appendingPathComponent("about-logo-private.png"))
writePNG(render(.fullBleed, width: 384), content.appendingPathComponent("about-logo-private@2x.png"))
writePNG(render(.fullBleed, width: 300, height: 236), content.appendingPathComponent("about.png"))

let mpl = """
  <!-- This Source Code Form is subject to the terms of the Mozilla Public
     - License, v. 2.0. If a copy of the MPL was not distributed with this
     - file, You can obtain one at http://mozilla.org/MPL/2.0/. -->

  """
let logoSVG = mpl + """
  <svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
    <rect width="1024" height="1024" rx="230" fill="\(darkHex)"/>
    <circle cx="512" cy="512" r="256" fill="\(lightHex)"/>
  </svg>

  """
func wordmark(_ fill: String) -> String {
  mpl + """
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 56">
      <text x="2" y="44" font-family="-apple-system, system-ui, sans-serif" font-size="48" font-weight="600" textLength="156" lengthAdjust="spacingAndGlyphs" fill="\(fill)">Origin</text>
    </svg>

    """
}
for (name, text) in [
  ("about-logo.svg", logoSVG),
  ("about-logo-private.svg", logoSVG),
  ("about-wordmark.svg", wordmark("context-fill #fff")),
  ("firefox-wordmark.svg", wordmark("context-fill #20123a")),
] {
  try text.write(to: content.appendingPathComponent(name), atomically: true, encoding: .utf8)
}

try? FileManager.default.removeItem(at: tmp)
print("Wrote Origin placeholder branding to \(out.path)")
