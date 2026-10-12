# Benchmarks

How Origin measures energy, and every number it has. Raw data lives in `../Zen-Origin-research/perf.noindex/runs/`; per-batch tables are in `docs/perf/`.

## Method

### Machine

Mac mini M4 (10 cores), 16 GB, macOS 27.0.1, on AC power, no battery. The screen is virtual: 1920 by 1080 points at 1x and 60 Hz (checked with `system_profiler SPDisplaysDataType` on 2026-10-12). A MacBook with a 2x ProMotion screen draws four times the pixels and can refresh at 120 Hz, so it pays more for anything that repaints; the numbers here understate GPU and compositing costs. System appearance is dark mode for every run.

The machine is shared with CandyWrapper agents. Before every launch the harness waits for a quiet machine: no compiler, linker, `xcodebuild` or `mach build` running and the 1-minute load average under 3.5 for 20 s, for at most 15 minutes. A run that could not get quiet is marked noisy in its `meta.json` and in the tables.

### Browsers

| Name | What it is |
|---|---|
| zen-official | Zen 1.23.2b from its universal DMG (thin LTO and two-stage PGO, cross-compiled by Zen's CI) |
| zen-stock | Zen 1.23.2b built here from the 1.23.2b tag without changes, Zen's release options without LTO and PGO |
| firefox | Firefox 157.0.1 en-US from Mozilla's DMG, the version Zen 1.23.2b is based on |
| safari | Safari 27.0.1 as installed |

App bundles stay byte-identical to their DMGs. App updates are off through per-user enterprise policy defaults (`defaults write <bundle id> EnterprisePoliciesEnabled -bool YES` and `DisableAppUpdate -bool YES`), because editing a bundle breaks its seal and Gatekeeper then refuses Zen.

### Pages

Every scenario uses frozen copies of real pages served from this Mac by `scripts/perf/serve` on loopback (`http://<site>.localhost:8765/`), so the network adds no noise. Scripts, iframes and remote requests are stripped when freezing, so pages are static: idle numbers measure the browser, not page scripts. Each page has its own host, which gives Gecko one content process per site as in real browsing. `scripts/perf/fixtures/README.md` lists the pages, the video (Big Buck Bunny 1080p30 H.264, 130 s) and the synthetic pages.

### Profiles

Gecko browsers start every run from a fresh APFS clone of a template profile made by `scripts/perf/make-profile`. The template holds 10 loaded tabs: for Zen, 4 in a Work space and 4 in a Personal space, each with a two-colour gradient, plus 2 Essentials; for Firefox, the same 8 tabs plus 2 pinned tabs. The template idles for 3 minutes after setup so first-run downloads (Remote Settings, Safe Browsing lists, Widevine and OpenH264) finish, and quits cleanly. Marionette builds the template and never runs during measurement. The harness prefs (`scripts/perf/profiles.json`) only skip first-run prompts and make every tab load at startup (`browser.sessionstore.restore_on_demand` and `restore_pinned_tabs_on_demand` false).

Safari opens the same 10 pages as tabs. A Safari that the harness did not start has been running since 2026-10-09, so the harness starts its own instance with `open -n` and never touches the other one.

### Launch and window

Every browser starts through LaunchServices in the user's GUI session (`sudo launchctl asuser 502 sudo -u mrm open -n -a <app>`), so it gets its own coalition. The window is then placed at 120,60 with a size of 1440 by 900 points through the Accessibility API, and the pointer is parked outside the window unless the scenario moves it. Input comes from `zo-ui` as HID events, so browsers see real keys, scrolls and pointer moves.

### What is measured

Each measurement window records, over the same interval:

- `zo-stat` (no root): the kernel's counters for the browser's whole resource coalition (`coalition_info_resource_usage`), which covers every process the browser starts and every system service that works for it (Safari's WebKit processes, video decoding services), including processes that exit during the window. From it: energy (nJ, Apple's per-task energy model), CPU time, interrupt and idle wakeups, GPU time, disk writes. The same counters for WindowServer's coalition, because blur and compositing costs land there and not in the app. Per-process counters (`proc_pid_rusage`) give the split by Gecko process type and the memory footprint.
- `powermetrics` (sudo, 1 s samples, `--show-process-coalition --show-process-energy`): the package's CPU, GPU and ANE power in mW, which covers the whole machine including other agents' work, and per-coalition energy impact for context.
- With `--profiler`, Gecko runs also record a Firefox Profiler trace at a 10 ms interval with the power feature, to count `RefreshDriverTick` markers on the parent process main thread. Profiler runs are kept apart from energy runs, because profiling adds work of its own.

Activity Monitor's Energy Impact is never compared, because it is a blended estimate.

The main number per scenario is the browser's power (its coalition's energy divided by the window length) plus WindowServer's power over the same window. Machine power is reported beside it but moves with whatever else runs on the Mac.

### Scenarios

| Scenario | What happens | Window |
|---|---|---|
| launch | browser not running, file cache warm; time from `open` to the first painted pixel of the selected tab (a solid magenta page), then energy over the first 20 s | 20 s from launch |
| idle | 10 loaded tabs, window visible and frontmost, no text field focused, 45 s after launch | 60 s |
| minimized | same, window minimized | 60 s |
| switch | Ctrl+Tab 50 times at 0.44 s steps; then for Zen, Cmd+Opt+Right and Left alternating 20 times at 1 s steps | 24 s and 22 s |
| sidebar | Zen compact mode: the pointer glides to the window's left edge and back 20 times; Firefox: the same path over vertical tabs set to expand on hover; Safari: Cmd+Shift+L 40 times | 54 s |
| split | two tabs in a split view, divider dragged 250 points left and right 10 times; not available in Safari | 22 s |
| scroll | long frozen Wikipedia article (70,000 px at 1440 px wide), 1,750 wheel events of 40 px at 25 ms | 46 s |
| video-windowed | 1080p30 H.264 video in a 1280 by 720 element, playing with sound | 120 s |
| video-fullscreen | the same video in element fullscreen | 120 s |
| typing | a paragraph of 579 characters typed into a textarea at 10 characters per second | 62 s |
| bgtimer | the idle scenario with an extra background tab running a 1 s `setInterval` | 60 s |

Every scenario runs 3 times per browser, interleaved (run 1 of everything, then run 2, then run 3) so slow drift on the machine spreads over all browsers. Tables report the median and the range.

### Known limits

- Energy figures come from Apple's energy model (the same one powermetrics and Activity Monitor build on), not from a power rail. They compare browsers on this Mac well; absolute battery hours need the MacBook script planned for milestone 5.
- The cold launch is cold for the app, not for the disk: macOS keeps the files in its cache and `purge` needs root, which the harness may not use.
- Frozen pages without scripts make idle numbers lower than on live sites, for every browser alike.

## Results

### Stock Zen build, 2026-10-12

Zen 1.23.2b from its tag without changes, Zen's release options without LTO and PGO (`scripts/build-zen`, stats in `../Zen-Origin-research/logs/build-stats/2026-10-12-141812/`). One build, so no range.

| Phase | Wall time |
|---|---|
| Unpack the 811 MB Firefox source and commit it in `engine/` (surfer download, tarball already cached; the download itself took about 10 s) | 274 s |
| Import Zen's 264 patches and prefs | 5 s |
| `mach bootstrap` (toolchains, about 3.4 GB into `~/.mozbuild`) | 77 s |
| `mach build` | 1,404 s (23 min 24 s) |
| `mach package` (DMG) | 101 s |
| Total from unpacked tarball to DMG | 1,861 s (31 min) |

- Memory: the machine peaked at 14,155 MB used of 16,384 MB (app, wired and compressed memory), the build's own processes at 8,238 MB resident together. Swap grew from 443 MB to 2,965 MB and memory pressure reached the warning level, never critical. Light work ran beside it: two browser profile templates and the CandyWrapper agents' idle load.
- Disk: `engine/` 11.2 GB (Firefox source with Zen's patches 6.3 GB, object dir 4.9 GB), `~/.mozbuild` 3.3 GB, Rust 1.0 GB, cached tarball 0.8 GB, `node_modules` 0.1 GB: about 16.4 GB. Free space went from 134 GB to 116 GB.
- Output: a 125 MB DMG holding a 385 MB arm64 app (the official universal app is 578 MB).
- Spotlight began indexing the 400,000 files of `engine/` after the build and kept the load average near 15. A `.metadata_never_index` file did not stop it; `engine/` is now a symlink to `engine.noindex/`, which Spotlight skips.
