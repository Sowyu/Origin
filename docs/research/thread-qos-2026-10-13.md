# Thread QoS on macOS in Firefox 157

Source tree: `engine/` (Firefox 157.0.1 under Zen 1.23.2b). Web sources are Bugzilla REST pages fetched on 2026-10-13. Anything I did not open or could only guess is marked unverified.

## Summary

- The spec line "every thread at user-initiated QoS" is too broad. Only threads created by `nsThread` get it, and only on macOS 26 and later (Origin's Mac runs macOS 27, so it applies).
- Bug 1999447 asks to limit that default to macOS 26.0. It is open (status NEW, assigned to Markus Stange) with one comment and no patch, so Firefox 157 still has the change on 26.1 and later.
- No pref turns it off. Undoing it takes a small patch to `xpcom/threads/nsThread.cpp`. Mozilla's own data says the change fixed video stalls on 26.0 and that Apple fixed the cause in 26.1.
- Nobody has published an energy number for it. I recommend a pref-gated patch and a harness comparison before deciding.

## 1. Where Firefox 157 sets QoS on macOS

Every call site in the paths I was asked to search, plus ones that turned up:

| Place | File and line | QoS it gets |
|---|---|---|
| Default for every `nsThread` thread (not the main thread) | `xpcom/threads/nsThread.cpp:343-347`, in `ThreadFunc` | `QOS_CLASS_USER_INITIATED`, only if `nsCocoaFeatures::OnTahoeOrLater()` |
| Pool threads with normal priority | `xpcom/threads/nsThreadPool.cpp:301-317` | Keep the default above, because `SetThreadQoS` is only called when the pool's priority differs from normal |
| Background I/O pool (`BgIOThreadPool`) | `xpcom/threads/nsThreadManager.cpp:98`, `nsThread.cpp:983-985` | `QOS_CLASS_BACKGROUND`, if `threads.use_low_power.enabled` is true (default true on macOS) |
| Main thread, restoring after background | `nsThread.cpp:987-990` | `QOS_CLASS_USER_INTERACTIVE` |
| Other non-main threads, restoring | `nsThread.cpp:991` | `QOS_CLASS_DEFAULT` |
| Content process main thread in a background tab | `dom/ipc/ProcessPriorityManager.cpp:764-777, 834-847`, relayed by `dom/ipc/ProcessHangMonitor.cpp:660-700` | `QOS_CLASS_BACKGROUND` when the process priority is BACKGROUND or PREALLOC, back to `USER_INTERACTIVE` when it returns. Both prefs `threads.use_low_power.enabled` and `threads.lower_mainthread_priority_in_background.enabled` default to true on macOS (`StaticPrefList.yaml:19621, 19633`) |
| `ProcessHangMon` thread | `dom/ipc/ProcessHangMonitor.cpp:1213-1218` | `QOS_CLASS_USER_INITIATED`, set explicitly so it runs just below the main thread |
| Shutdown of a content process | `dom/ipc/ContentParent.cpp:1640-1644` | Main thread back to normal so it can exit |

Other facts from the search:

- `setpriority` appears only in chaos mode (`nsThread.cpp:289`) and in NSPR (`nsprpub/pr/src/pthreads/ptthread.c`). Neither runs in a normal macOS build. The `dom.ipc.processPriorityManager.backgroundUsesEcoQoS` pref is Windows-only.
- The main thread of every process is never touched by the 146 change. macOS starts it at user-interactive. Parent main thread QoS is not changed anywhere I found.
- `ipc/glue` only carries the `QoSPriority` enum over IPC. `toolkit/xre` sets no QoS. `js/src/vm/HelperThreads.cpp` sets none, so JS helper threads come from `InternalThreadPool` and depend on how that creates threads (I did not trace it, unverified).
- Threads that do not go through `nsThread` get no explicit class. That includes Rust threads such as WebRender's rayon pools and Stylo, and cubeb's CoreAudio code, which uses `dispatch_get_global_queue(QOS_CLASS_DEFAULT)` (`third_party/rust/coreaudio-sys-utils/src/dispatch.rs:85`). Whether these inherit the creator's class or stay unspecified is unverified. Apple's documentation says `pthread_create` threads inherit the creator's QoS, and I did not re-check it.
- The GPU process and the other child processes run the same `nsThread` code, so their `nsThread` threads get user-initiated too. The GPU process main thread gets no special treatment that I found.

### What changed in 146 and why

Bug 1995638 ("Make nsThreads use QOS_CLASS_USER_INITIATED by default", Markus Stange, 2025-10-21). Sources: https://bugzilla.mozilla.org/show_bug.cgi?id=1995638 and https://bugzilla.mozilla.org/show_bug.cgi?id=1989948.

- Users reported Firefox sluggish on macOS 26 under load, and video that froze or stuttered while audio kept playing. Triggers were a compile in the background, Spotlight or other apps opening.
- Bug 1989948 traced it with Instruments: the `VTDecoderXPCService` thread was ready to run but not scheduled. Mstange's explanation in 1995638: macOS 26 deschedules threads without a defined QoS harder than earlier releases.
- The patch landed in Nightly 146 on 2025-10-21 without XPCOM review sign-off, and was uplifted to beta (2025-10-23) and release (2025-10-24). Bas Schouten noted Chromium also uses user-initiated as its default.
- Bug 1996052 (landed 2025-10-23) limited it to macOS 26 and later, because older releases were untested.
- The existing low-power code (background QoS for the I/O pool and background tab main threads) was kept. The new default only applies when nothing else sets a class.

## 2. Bug 1999447

"Revert macOS QoS default change in macOS 26.1" (title as fetched). Opened 2025-11-11 by haftandilian@mozilla.com, assigned to mstange, status NEW, target milestone unset, see also 1995638. Source: https://bugzilla.mozilla.org/show_bug.cgi?id=1999447.

- Its single comment says the 1995638 workaround was for the 1989948 video freeze, which reproduced on 26.0 but not on 26.1 beta, and that Apple fixed a video decoding thread priority bug in 26.1. So the change should apply to 26.0 only.
- Bug 1995638 comment 16 (2025-11-07, Jeff Muizelaar) says the same. Bug 1989948 comment 64 (2025-11-20, Alastor Wu) confirms Apple's fix in 26.1.
- No patch, no pref name, no energy data. As of the fetch the bug is still open. The REST page may have been cached, so I cannot rule out a later landing. The 157 source shows it has not landed there.
- The bug is about correctness risk, not battery. I found no Mozilla statement that user-initiated costs energy. That link is the spec's guess. Treat the energy effect as unmeasured.

### Smallest change for Origin

There is no pref. The smallest diff adds one static pref and one condition in `xpcom/threads/nsThread.cpp` (around line 343):

```
#ifdef XP_MACOSX
  if (nsCocoaFeatures::OnTahoeOrLater() &&
      StaticPrefs::threads_default_qos_user_initiated_enabled()) {
    pthread_set_qos_class_self_np(QOS_CLASS_USER_INITIATED, 0);
  }
#endif
```

and in `modules/libpref/init/StaticPrefList.yaml` next to `threads.use_low_power.enabled`:

```
- name: threads.default_qos_user_initiated.enabled
  type: RelaxedAtomicBool
  value: true
  mirror: always
```

Notes:

- `nsThread.cpp` already reads `StaticPrefs::threads_use_low_power_enabled()` at line 972, so the include is there.
- Threads created before the pref service loads, in the parent at startup, read the pref's default value, not the user value (unverified for this exact path, since I did not read the static-pref init order). A `user.js` or profile pref would then affect content processes (prefs arrive early over the shared pref map) but could miss early parent threads. For a harness variant that matters: the parent's threads may not change. Setting the default in the yaml and building two binaries avoids the question.
- A build-only alternative is to delete the six lines. That is the smallest diff to carry in a rebase, but it cannot be toggled per run.
- Without that block threads are unspecified again, which is the 145 behaviour. Mozilla's own risk note on 1995638 said explicit QoS "could raise priority of background work (Sync, Safe Browsing updates, session store writes)", so removing it should lower those, which is the energy hypothesis.
- One quirk: `nsThread::SetThreadQoS` returns early when `threads.use_low_power.enabled` is false (`nsThread.cpp:972`). Turning that pref off would leave the I/O pool at user-initiated, so do not use it as a lever.
- The ProcessHangMon thread (`ProcessHangMonitor.cpp:1218`) keeps its own explicit class either way.

## 3. Risks

From Mozilla's bugs:

- Video stalls. This is why the default exists. The 26.0 repro: hardware-decoded YouTube while a CPU-saturating job runs. Without the default, playback paused for seconds. Apple fixed its side in 26.1, so the risk should be gone on macOS 27, but the only evidence is Alastor Wu's note, not a Mozilla retest. A 27.0.1 retest is the harness check below.
- Remaining minor drops. In 1989948 comment 52 Alastor saw 3 to 5 dropped frames at 60 fps with the fix and no audio pops. Whether that gap is the user-initiated default or the other media thread patches is unknown.
- Audio. Comment 24 to 25 in 1989948 report crackles while an iOS Simulator runs. A commenter thought it was a CoreAudio bug unrelated to Firefox. cubeb's audio threads do not come from `nsThread` classes, so a revert should not touch them (unverified).
- UI jank and scroll. Nobody reported any from the change. Reverting could expose it when the Mac is busy, because the 26.0 scheduler was the problem. I cannot judge that from the sources. The parent main thread is user-interactive regardless of this block, so scrolling input handling keeps its class. Compositor, WebRender and IPC I/O threads are the ones that lose the explicit class (the IPC I/O thread is a chromium `base::Thread` in `ipc/chromium`, which I did not find setting QoS, so it may not be covered by this block at all, unverified).
- Background tabs. They already run at BACKGROUND main thread QoS through ProcessPriorityManager, independent of this change. Reverting the default does not change that path.
- Mozilla's own risk rating for the original change was medium on beta, with no automated tests, verified in Nightly only.

## 4. Measuring it with scripts/perf

Use a pref variant on one Origin build, with the pref default left at true so the harness sets it to false. If the early-parent-thread question in section 2 bothers you, build two binaries instead and run them as two browsers in `scripts/perf/browsers.json`.

1. Add the patch above to Origin (another agent owns `src/` and `prefs/` at the moment, so the engine patch waits for them).
2. Add to `scripts/perf/variants.json`:

```
"qos-default": {
  "what": "no explicit user-initiated QoS on nsThread threads (macOS 26+ default from Firefox 146 off)",
  "prefs": {"threads.default_qos_user_initiated.enabled": false},
  "scenarios": ["idle", "bgtimer", "scroll", "video-windowed"]
}
```

3. Run `origin` against `origin+qos-default` interleaved, 3 runs each, as in origin-1, with the same settle time of 150 s.

Scenarios that should show a difference, in order of how likely:

- bgtimer: a 1 s `setInterval` in a background tab. Wakeups and the thread class decide whether the work lands on efficiency cores.
- idle and minimized: timers and I/O pool work in the parent and the tab processes.
- video-windowed: look at power and at dropped frames (`getVideoPlaybackQuality()`), since this is where Mozilla saw the 26.0 failure.
- scroll: look at frame delivery next to power, because jank is the cost of lowering QoS.
- Add a stress run: video-windowed with a CPU hog on 8 of 10 cores (`yes > /dev/null` loops). It reproduces the 1989948 condition and checks that macOS 27 really has no stall. The other agents share this Mac, so run it only when no batch is measuring.

How to see which cores threads use: `powermetrics --samplers cpu_power` already runs in the harness. Compare the E-cluster against the P-cluster active residency. If `zo.py` does not record cluster residency yet, add it before the run (unverified whether it does; I did not read it). `sample` or Instruments can confirm the class of a thread (`qos_class_self()` appears in the profiler's thread info, `tools/profiler/core/platform.cpp:8134`), and the Firefox Profiler shows it for threads.

## App Nap

`toolkit/xre/MacApplicationDelegate.mm:95` sets `NSAppSleepDisabled` for the parent process, called from `nsAppRunner.cpp:4499`. Mozilla's comment says content processes are not put into App Nap and flood a napping parent with IPC, so the parent's App Nap was turned off.

- QoS and App Nap are separate mechanisms. QoS is a per-thread hint for the scheduler. App Nap is a per-process state macOS applies to hidden or occluded apps: timer coalescing, I/O throttling and a lower CPU priority (documented behaviour, unverified against 27).
- They only meet in one way. With App Nap off the parent is never clamped, so the QoS class decides alone how its threads are scheduled. A napping parent would have been demoted whatever the explicit class was (unverified). So a user-initiated default on the parent matters more because App Nap cannot back it up.
- Content processes were never napped, so for them QoS is the only lever, and the background-tab path (BACKGROUND main thread) is the only thing quieting hidden tabs.
- Turning App Nap back on is a separate lead with its own risk, the queued IPC the comment describes. I did not test it.

## Recommended change

1. Do not ship a revert on guesswork. Mozilla's data supports it only for correctness (the 26.1 fix), not for energy.
2. Add the pref-gated patch (about 10 lines, one yaml entry, one condition) to the Origin patch set, default true.
3. Run the `qos-default` variant on idle, bgtimer, scroll and video-windowed, plus the CPU-load video run. Flip the default to false only if bgtimer or idle show a measured drop and the load run shows no frame stalls on macOS 27.

Sources:

- https://bugzilla.mozilla.org/show_bug.cgi?id=1999447
- https://bugzilla.mozilla.org/show_bug.cgi?id=1995638
- https://bugzilla.mozilla.org/show_bug.cgi?id=1996052
- https://bugzilla.mozilla.org/show_bug.cgi?id=1989948
- Local: `engine/xpcom/threads/nsThread.cpp`, `nsThreadPool.cpp`, `nsThreadManager.cpp`, `engine/dom/ipc/ProcessPriorityManager.cpp`, `ProcessHangMonitor.cpp`, `ContentParent.cpp`, `engine/toolkit/xre/MacApplicationDelegate.mm`, `engine/modules/libpref/init/StaticPrefList.yaml`
