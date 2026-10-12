// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.
//
// zo-stat: kernel counters for an app's whole resource coalition (every process it spawned or
// that the system runs for it, such as Safari's WebKit services) and for WindowServer's, plus a
// per-process breakdown. No root needed. Based on CandyWrapper's procstat.swift.
//
// Usage: zo-stat sample <pid>                      one JSON line
//        zo-stat watch <pid> <seconds> <interval>  one JSON line per interval, first and last included
//
// Coalition counters come from coalition_info_resource_usage, which also counts processes that
// exited. Field order follows xnu's struct coalition_resource_usage (bsd/sys/coalition.h);
// field 23 must be 7 (the thread QoS count), which the tool checks before trusting the rest.
import Darwin
import Foundation

let coalitionFields = [
    "tasks_started", "tasks_exited", "time_nonempty_ns", "cpu_time_ns", "interrupt_wakeups",
    "platform_idle_wakeups", "bytes_read", "bytes_written", "gpu_time_ns", "cpu_time_billed_to_me_ns",
    "cpu_time_billed_to_others_ns", "energy_nj", "logical_immediate_writes", "logical_deferred_writes",
    "logical_invalidated_writes", "logical_metadata_writes", "", "", "", "",
    "energy_billed_to_me_nj", "energy_billed_to_others_nj", "cpu_ptime_ns", "qos_count",
    "", "", "", "", "", "", "",
    "cpu_instructions", "cpu_cycles", "fs_metadata_writes", "pm_writes", "cpu_pinstructions", "cpu_pcycles",
    "conclave_mem", "ane_mach_time", "ane_energy_nj", "gpu_energy_nj", "gpu_energy_billed_to_me_nj",
    "gpu_energy_billed_to_others_nj",
]

var timebase = mach_timebase_info_data_t()
mach_timebase_info(&timebase)
func ns(_ t: UInt64) -> UInt64 { t * UInt64(timebase.numer) / UInt64(timebase.denom) }

typealias CoalitionInfo = @convention(c) (UInt64, UnsafeMutableRawPointer, Int) -> Int32
let coalitionInfo = unsafeBitCast(dlsym(dlopen(nil, RTLD_NOW), "coalition_info_resource_usage")!, to: CoalitionInfo.self)

/// Resource coalition id of a process (proc_pidinfo flavor 20, PROC_PIDCOALITIONINFO).
func coalition(of pid: pid_t) -> UInt64? {
    var ids = [UInt64](repeating: 0, count: 5)
    let n = ids.withUnsafeMutableBytes { proc_pidinfo(pid, 20, 0, $0.baseAddress, Int32($0.count)) }
    return n > 0 ? ids[0] : nil
}

func coalitionUsage(_ id: UInt64) -> [String: UInt64]? {
    var raw = [UInt64](repeating: 0, count: 64)
    let rc = raw.withUnsafeMutableBytes { coalitionInfo(id, $0.baseAddress!, $0.count) }
    guard rc == 0, raw[23] == 7 else { return nil }
    var out: [String: UInt64] = [:]
    for (i, name) in coalitionFields.enumerated() where !name.isEmpty { out[name] = raw[i] }
    // The CPU times arrive in mach ticks (41.67 ns on Apple Silicon; a 2 s busy loop added
    // 49.8 million), the other times in ns. Convert so every *_ns field means nanoseconds.
    for k in ["cpu_time_ns", "cpu_ptime_ns", "cpu_time_billed_to_me_ns", "cpu_time_billed_to_others_ns"] {
        out[k] = out[k].map(ns)
    }
    return out
}

func allPids() -> [pid_t] {
    var pids = [pid_t](repeating: 0, count: 8192)
    let n = proc_listallpids(&pids, Int32(pids.count * MemoryLayout<pid_t>.size))
    return n > 0 ? Array(pids.prefix(Int(n))).filter { $0 > 0 } : []
}

/// Short command name through sysctl, which also works for other users' processes (WindowServer).
func name(_ pid: pid_t) -> String {
    var mib = [CTL_KERN, KERN_PROC, KERN_PROC_PID, pid]
    var info = kinfo_proc()
    var size = MemoryLayout<kinfo_proc>.stride
    guard sysctl(&mib, 4, &info, &size, nil, 0) == 0, size > 0 else { return "" }
    return withUnsafeBytes(of: info.kp_proc.p_comm) { String(decoding: $0.prefix { $0 != 0 }, as: UTF8.self) }
}

/// argv[0] tells Gecko's process types apart (the type is the last argument of a child).
func commandLine(_ pid: pid_t) -> [String] {
    var mib = [CTL_KERN, KERN_PROCARGS2, pid]
    var size = 0
    guard sysctl(&mib, 3, nil, &size, nil, 0) == 0, size > 0 else { return [] }
    var buf = [UInt8](repeating: 0, count: size)
    guard sysctl(&mib, 3, &buf, &size, nil, 0) == 0, size > 4 else { return [] }
    let argc = Int(buf.withUnsafeBytes { $0.load(as: Int32.self) })
    var parts: [String] = [], cur: [UInt8] = []
    var i = 4
    while i < size && buf[i] != 0 { i += 1 }  // executable path
    while i < size && buf[i] == 0 { i += 1 }
    while i < size && parts.count < argc {
        if buf[i] == 0 { parts.append(String(decoding: cur, as: UTF8.self)); cur = [] } else { cur.append(buf[i]) }
        i += 1
    }
    return parts
}

func processUsage(_ pid: pid_t) -> [String: Any]? {
    var info = rusage_info_v6()
    let rc = withUnsafeMutablePointer(to: &info) { ptr in
        ptr.withMemoryRebound(to: rusage_info_t?.self, capacity: 1) { proc_pid_rusage(pid, RUSAGE_INFO_V6, $0) }
    }
    guard rc == 0 else { return nil }
    let args = commandLine(pid)
    return ["pid": Int(pid), "name": name(pid), "role": args.last ?? "",
            "cpu_ns": ns(info.ri_user_time) + ns(info.ri_system_time),
            "pkg_idle_wakeups": info.ri_pkg_idle_wkups, "interrupt_wakeups": info.ri_interrupt_wkups,
            "energy_nj": info.ri_energy_nj, "penergy_nj": info.ri_penergy_nj,
            "billed_energy_nj": info.ri_billed_energy, "serviced_energy_nj": info.ri_serviced_energy,
            "footprint": info.ri_phys_footprint, "lifetime_max_footprint": info.ri_lifetime_max_phys_footprint,
            "disk_bytes_written": info.ri_diskio_byteswritten, "instructions": info.ri_instructions,
            "cycles": info.ri_cycles, "start_abstime": ns(info.ri_proc_start_abstime)]
}

let windowServer = allPids().first { name($0) == "WindowServer" }

func sample(_ pid: pid_t) -> [String: Any] {
    var out: [String: Any] = ["t_ns": clock_gettime_nsec_np(CLOCK_UPTIME_RAW), "pid": Int(pid)]
    if let c = coalition(of: pid) {
        out["coalition_id"] = c
        out["coalition"] = coalitionUsage(c) ?? [:]
        out["processes"] = allPids().filter { coalition(of: $0) == c }.compactMap(processUsage)
    }
    if let ws = windowServer, let c = coalition(of: ws) {
        out["windowserver"] = coalitionUsage(c) ?? [:]
    }
    return out
}

func emit(_ obj: [String: Any]) {
    let data = try! JSONSerialization.data(withJSONObject: obj, options: [.sortedKeys])
    FileHandle.standardOutput.write(data + Data("\n".utf8))
}

let a = CommandLine.arguments
switch (a.count > 1 ? a[1] : "", a.count) {
case ("sample", 3):
    guard let pid = pid_t(a[2]) else { exit(2) }
    emit(sample(pid))
case ("watch", 5):
    guard let pid = pid_t(a[2]), let seconds = Double(a[3]), let interval = Double(a[4]) else { exit(2) }
    let end = Date().addingTimeInterval(seconds)
    emit(sample(pid))
    while Date() < end {
        Thread.sleep(forTimeInterval: min(interval, max(0, end.timeIntervalSinceNow)))
        emit(sample(pid))
    }
default:
    FileHandle.standardError.write(Data("usage: zo-stat sample <pid> | zo-stat watch <pid> <seconds> <interval>\n".utf8))
    exit(2)
}
