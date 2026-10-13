# Progress

Update this file at the end of every work session. Newest log entry first.

## Current milestone

Milestone 2, the debloat, started 2026-10-13 at 00:10 on the user's word (see Decisions). Milestone 1's measurements finish inside it; its targets and demo fold into milestone 2's demo.

Next action (pre-release 1.23.2b-origin.3 is out since 2026-10-13 12:43 CEST: https://github.com/Sowyu/Origin/releases/tag/1.23.2b-origin.3, build `builds/origin-release-3`, browser `origin-release-3`):
1. Wait for the user's verdict on pre-release 3: animations (tab open and close slide, space switch, compact mode, split view drop), Translations, the blank new tab, and Activity Monitor after 10 minutes in the background (the memory trim).
2. GPU memory (`docs/research/gpu-memory-retina-2026-10-13.md`): about 200 to 340 MB of the user's GPU process has no reporter. Ask for `footprint -p <GPU pid>` (or `vmmap --summary`) from their MacBook to see whether it is Apple's GL driver. Pool size (`gfx.webrender.compositor.surface-pool-size`) and spare tile buffers are the next memory levers; both cost energy, so they need numbers.
3. Window material (`docs/research/window-material-2026-10-13.md`): fix A or B waits for the no-vibrancy, no-page-radius and vibrancy-and-radius-off variants on scroll and video-windowed. Tests are off until the user says otherwise (2026-10-13 07:10); ask before a batch, since it needs the screen for about two hours.
4. Deferred hot paths (`docs/research/zen-hot-paths-2026-10-13.md`): 3 (about:blank browsers kept by window sync), 8 (spaces sync hashing), 9 (search mode glow), 12 (compact mode hover), 15 (notification box transition).

## Milestones

| # | Milestone | Status |
|---|---|---|
| 1 | Baseline: build stock Zen, measurement harness, measure Zen, Firefox and Safari, cost of each Zen effect, `docs/cuts.md`, DRM and Sync checks | measurements finishing; targets and demo folded into milestone 2 |
| 2 | Debloat: Firefox-level cuts, remove cut Zen features and Zen server calls, own bundle ID and profile folder, measure against the baseline | in progress since 2026-10-13 |
| 3 | Rewrite study (can run beside milestone 2), then wait for the user's decision | study done (docs/research/rewrite-study-2026-10-13.md: trim, don't rewrite); waiting for the user |
| 4 | Lean UI: trim or rewrite as decided, meet the energy targets, side-by-side screenshots | not started |
| 5 | Release: name and icon, signing, update feed, MacBook battery script, `scripts/sync-upstream`, first release | groundwork: `scripts/sync-upstream` tested, README draft, release and licensing research |

## Milestone 1 checklist

- [x] Repo layout: Zen 1.23.2b tree as the `upstream` snapshot commit (local only), `main` on top, pushed to github.com/Sowyu/Origin
- [x] Toolchains in `../Zen-Origin-research/tools`: Node 22.23.3, Python 3.11.17 (uv), Rust 1.95.0 (rustup, ~/.cargo), GNU tar 1.35 (built from source), xz linked from Homebrew
- [x] Official builds downloaded and checksummed, copied unmodified to `../Zen-Origin-research/builds/`: Zen 1.23.2b, Firefox 157.0.1; app updates off through user policy defaults
- [x] Firefox 157.0.1 source in `engine/` (SHA-256 checked against Mozilla's SHA256SUMS)
- [x] Build stock Zen without changes: 23.4 min compile, 31 min in all, 14.2 GB peak memory, about 16.4 GB of disk (`docs/benchmarks.md`); app in `../Zen-Origin-research/builds/zen-1.23.2b-stock/`
- [x] Harness: frozen pages (`scripts/perf/make-fixtures`), loopback server (`serve`), `zo-ui`, `zo-stat`, templates (`make-profile`), runner (`run`), report (`report`); functional test on Firefox idle passed
- [x] Templates: firefox-157.0.1/base, zen-1.23.2b/base
- [x] Templates: split variants for Firefox and Zen, vertical-tabs variant for Firefox
- [x] Functional test of every scenario on Firefox and Zen (batches test-3 and test-4, all 22 runs ok, screenshots checked)
- [x] Calibration (batch calib-1): one-off startup bursts of 250-560 mW with 4-6 MB of writes up to 124 s after launch, then about 0 mW; settle raised to 150 s
- [x] Measure official Zen, official Firefox and self-built stock Zen on all scenarios, 3 runs each (baseline-1: 102 runs, none failed, done 2026-10-12 22:29; preliminary table in "Facts learned")
- [ ] Safari on all scenarios (in baseline-1 since 2026-10-12 22:47, about 2.5 hours; split view is skipped because Safari has none)
- [ ] Profiler runs: RefreshDriverTick markers at idle per Gecko browser
- [ ] Measure each Zen visual effect by turning it off on its own (`scripts/perf/variants.json`)
- [ ] Propose a target per scenario and get the user's OK
- [x] `docs/cuts.md` drafted, waiting for the user's review
- [x] Widevine test page plays in stock Zen built and signed here (Apple Development, `scripts/sign-app`), official Zen and Firefox (`docs/drm-sync.md`)
- [ ] Netflix, Spotify and Sync: need the user's accounts
- [ ] Demo milestone 1

## Decisions made

- 2026-10-13 09:55: The user asked to "cut all that code" and "remove the features nobody asked for" so battery drain and RAM use are minimal. Pass 2 stays inside the spec's keep list and look rules: it removes code the spec bans (Motion, looping animations, CSS backdrop-filter, dormant patches) and applies the spec's turn-off list. Firefox's low-memory unloading is on (`browser.lowMemoryResponseMask` 3), and it acts only at critical memory pressure. The global AI switch is blocked, and Translations stays on because it reads only `browser.translations.enable`.
- 2026-10-13 09:43: The user called timed unloading "dumb because i use my browser alot". `origin.tabs.unload-after-minutes` defaults to 0 now (commit 52aa6aa); the unloader stays in the tree, off.
- 2026-10-13 08:45: The user found pre-release 1 "not even that much faster". It lacked the LTO and PGO that official Zen ships with. `scripts/build-origin-pgo` then ran end to end in about an hour (instrumented build, JetStream3 profiling run, thin LTO build with the profile), and pre-release 1.23.2b-origin.2 ships that build. Release builds use it from now on. Its speed and energy are not measured yet.
- 2026-10-13 07:10: The user said to stop testing for now and publish a release DMG as a GitHub pre-release. Pre-release 1.23.2b-origin.1 is build v3 plus the review fixes, signed with the Apple Development identity (scripts/sign-app), with THIRD_PARTY.md inside the app; notes in docs/releases/1.23.2b-origin.1.md. The measurement chain is stopped; CandyWrapper's UI tests took focus from a third of the overnight runs, and the user declined a shared screen lock for now.
- 2026-10-13 01:50: The user approved replacing Zen's Nucleo icons with the Phosphor set ("yes it looks ok just make sure it looks good"). Build v2 (`builds/origin-1.23.2b-v2`, browser `origin-v2`) carries them with lazy loading, the startup trims, the idle trim (off) and Origin's DMG art. Job `after-build-v2` smoke-tests it and runs `scripts/perf/uicheck` on v2 and stock Zen; compare the screenshots in `perf.noindex/uicheck/` before measuring v2.
- 2026-10-13: Agents share this Mac, so the chain allows a load of 8 and runs stock Zen interleaved with Origin in every scenario. Posting an inline page in this thread woke CandyWrapper's T3 client and stole focus from a run; don't post pages while runs need focus.
- 2026-10-13 00:10: The user wrote "just debloat zen until system resources is minimal and battery usage is also minimal then show me the numbers". I took it as the OK to start milestone 2 with `docs/cuts.md` as drafted (the user struck nothing) and with "as low as the harness can show" as the target. The site data panel and the hidden AI settings page wait, because they need a visual check and pref decisions. The "replace with Firefox's own" items wait for the rewrite study.
- 2026-10-13: Measurements and builds never overlap. `scripts/perf/hold` pauses the chain between runs, and each run's quiet wait keeps it paused.
- 2026-10-12: The repo is Zen's tree at the root with our files added. Zen's history is about 6 GB, so `upstream` holds one parentless snapshot commit per Zen release. GitHub refuses to take `upstream` (its tree has workflow files and the token has no `workflow` scope), so it stays local and can be rebuilt from Zen's tags.
- 2026-10-12: Baseline builds use Zen's release options without LTO and PGO (`ZEN_RELEASE=1 ZEN_DISABLE_LTO=1 ZEN_GA_DISABLE_PGO=1`), with Zen's own SDK pick (MacOSX26.5.sdk from the Command Line Tools, which is also Firefox 157's minimum). Official Zen has thin LTO and PGO, so official against self-built gives a first estimate of what LTO and PGO save.
- 2026-10-12: The stock build is en-US only (`scripts/update_en_US_packs.py`). Zen's `download-language-packs.sh` clones all of firefox-l10n and edits the global git config, so it is skipped.
- 2026-10-12: App bundles stay unmodified. A `policies.json` inside Zen's bundle broke its seal and Gatekeeper called Zen damaged; per-user policy defaults turn app updates off instead.
- 2026-10-12: Frozen pages have their scripts stripped, so idle numbers measure browsers, not page scripts. Each page gets its own `*.localhost` host so Gecko gives each site its own process.
- 2026-10-12: Harness profiles load every tab at startup, including Zen's Essentials (`restore_pinned_tabs_on_demand` false; Zen ships it true), because the spec's idle scenario has 10 loaded tabs.
- 2026-10-12: Zen profiles set `zen.workspaces.continue-where-left-off` true. Zen's default opens its empty tab with the URL bar focused at every launch, which breaks the spec's "no text field focused" and made a split-view drag click a live youtube.com tile.
- 2026-10-12: Every scenario except launch waits 150 s after launch before measuring (calibration, batch calib-1).
- 2026-10-12: Effects run per scenario with stock Zen as an interleaved control, so drift between hours stays out of the differences.
- 2026-10-12: The project is called Origin, not Zen Origin (user). Docs, the spec and `scripts/env.sh` say Origin now. The local folders keep their `Zen-Origin` names, because the object dir, the mach state and the T3 thread depend on those paths. The icon is still to confirm before the first release.
- 2026-10-12: The user wants the least system and battery use, and a browser that never uses more than 500 MB at a time. Batch memory-1 measures how low Gecko goes, and a memory target joins the energy targets.
- 2026-10-12: The user had me quit the Safari that ran since 10-09 (pid 27252). Safari's baseline runs came after the Gecko ones instead of interleaved with them, so `docs/benchmarks.md` must say so. A two-run test (batch test-6) showed a fresh Safari opens only the 10 test tabs, restores nothing and does not pile up tabs between runs.

## Open questions for the user

- Netflix, Spotify and Firefox Sync checks need accounts. How do you want to do them: sign in yourself through Screen Sharing on a build here, or on your MacBook with milestone 2's build, which has its own bundle ID? Today's stock build would open the real Zen profile on the MacBook.
- Safe Browsing needs its own Google key: without one, Origin registers no Google list, so phishing, malware and download blocking are off while Settings still shows them on (docs/research/startup-and-safebrowsing-2026-10-13.md). A free Google Cloud key works technically, but Google's terms bar commercial use without an agreement, so the user decides. Until then the download check still sends each download's URL and hash to Google for nothing; consider `browser.safebrowsing.downloads.remote.enabled` false while keyless.

## Facts learned

- `surfer build` asks "Are you sure you want to continue?" when `src/` holds a different number of patches than `.surfer/patchCount` (written by the last import). Without a terminal it builds nothing and exits 0. On 2026-10-13 a patch added during the PGO build made stage 3 package the instrumented build; `scripts/build-origin-pgo` now checks the count before stage 3. Don't add patches while a build runs.
- Origin v3 at idle with 10 tabs (one run, `phys_footprint`): parent 226 MB, GPU 153, 13 content processes 518, utility, RDD and socket 71, helpers 16, total 984. Stock Zen: 288, 198, 627 in 16 processes, 71, 16. The content gap is the 3 spare processes and the preloaded new tab; the extension process (about 45 MB) stays as long as webcompat, autofill or picture-in-picture ship, or the user installs any add-on. No about:memory data exists yet (`docs/research/memory-by-process-2026-10-13.md`).
- Zen's GPU cost while scrolling and playing video has two suspects: the window-wide material sits under the page, and WebRender gives every page tile a rounded `masksToBounds` mask. Fix A (a hole in the material under the opaque page, about 40 lines) or fix B (mask only the corner tiles, about 15 lines) waits for the no-vibrancy and no-page-radius variants to say which cost is real (`docs/research/window-material-2026-10-13.md`; variants added to `scripts/perf/variants.json`).
- Firefox 146 and later put every `nsThread` at user-initiated QoS on macOS 26 and later (bug 1995638, video stalls on 26.0). No pref undoes it; a pref-gated `nsThread.cpp` patch of about 10 lines would allow a measured A/B (`docs/research/thread-qos-2026-10-13.md`).
- Baseline (batch baseline-1, median of 3 runs, preliminary until Safari is in): idle, minimized, the background timer and fullscreen video sit at the no-browser floor in Firefox and Zen, with machine power at 102 to 117 mW against 108 mW with no browser.
- When content moves, official Zen costs the whole machine 90 to 160 mW more than Firefox. Scroll is 349 against 236 mW, windowed video 264 against 174 and tab switching 365 against 207. The browser's own CPU energy is about the same. The extra is GPU work in WindowServer: scroll takes 33.5 against 21.6 ms of GPU time per second, windowed video 22.1 against 7.6. Window-wide vibrancy is the first suspect, and the effects batch measures it.
- Official Zen beats Firefox at dragging the split-view divider (machine 1,489 against 2,145 mW) and at typing (149 against 167 mW).
- Stock Zen built without LTO and PGO is slower than official Zen: first paint 1,311 against 1,131 ms, split drag 1,579 against 1,013 mW of app power, tab switching 141 against 114 mW. Release builds need LTO and PGO.
- Memory with the 10 loaded tabs, summed over each browser's processes at the end of idle: Firefox 1,165 MB, official Zen 1,159 MB, Safari 528 MB (one run so far). Gecko spends 534 to 575 MB outside its content processes: the parent 254 to 300, the GPU process 171 to 198, utility, RDD and socket about 70. Safari spends 139 MB outside its 11 page processes, and its GPU process takes 18 MB. zo-stat's `name` cuts process names at 16 characters, so split Safari's processes by `role`.
- Firefox keeps 3 spare content processes of about 21 MB each ready (`dom.ipc.processPrelaunch.fission.number`). It unloads tabs only when memory runs low (`browser.tabs.unloadOnLowMemory`). Zen 1.23.2b can unload a space or a folder by hand but has no automatic unloader.
- Zen changes no memory setting: it keeps Firefox's 3 spare processes, the preloaded new tab page (`browser.newtab.preload`), the automatic back-forward cache (`browser.sessionhistory.max_total_viewers` -1, up to 8 pages) and the display's frame rate (`layout.frame_rate` -1). Its fastfox prefs only tune smooth scrolling. Options put to the user on 2026-10-12, best value first: those settings plus cutting Zen's GPU-heavy effects, automatic unloading by timer or memory budget, shrinking the main and GPU processes after an about:memory study, and a 60 fps cap if their MacBook has a 120 Hz screen. Site isolation and the sandboxed processes stay.
- `report`'s RefreshDriverTick count works on raw Gecko profiles. Firefox's parent main thread had 0 ticks in the idle window, and its ticks stop about 32 s after launch (profiler-1, firefox idle r1).
- With no browser running, WindowServer draws 8 mW at 7.8% CPU and the machine 105 mW (batch test-5). WindowServer's CPU is high for an idle virtual screen, probably the remote screen session; it is the same floor under every browser.
- At steady idle on frozen pages, Firefox and Zen both use about 0 mW and 1 to 3 wakeups/s (batch calib-1).
- Widevine 4.10.3050.0 plays Google's test stream in stock Zen built and signed here; `VerifyCdmHost_0 returned true` for all browsers, but only Firefox has the `.sig` files (`docs/drm-sync.md`).

- Official Zen ships no Widevine `.sig` files (official Firefox has five), and Zen's FAQ says Netflix and Spotify don't play (`docs/research/drm-sync-2026-10-12.md`).
- Zen fixed its macOS battery issue #12464 by moving to the window-wide `NSVisualEffectView` in 1.21.15b (PR #15006); nobody posted numbers (`docs/research/zen-issues-2026-10-12.md`).
- Zen has exactly nine looping CSS animations; none runs at idle with nothing playing, loading or boosted (`docs/research/zen-effects-2026-10-12.md`).
- Space routing runs inside every `addTab`; Boosts touches about 50 Gecko files; workspace sync imports Live folders; Glance is called unguarded across the tab code (`docs/research/zen-features-2026-10-12.md`).
- `coalition_info_resource_usage` and `proc_pidinfo` flavor 20 work without root, also for WindowServer's coalition. Per-process energy is `ri_energy_nj`; `ri_billed_energy` is billing, not use.
- Surfer's first commit in `engine/` fails silently without a git identity, which later breaks `mach bootstrap`; `scripts/env.sh` sets one.
- Marionette needs `-remote-allow-system-access` for chrome scripts.
- Zen's `gBrowser.tabs` lists only the current space; `gZenWorkspaces.allStoredTabs` lists all.

## Log

### 2026-10-12

- Read the spec, both recon notes and CandyWrapper's machine rules. Set up CLAUDE.md, PROGRESS.md, `scripts/env.sh`, `scripts/detach`, `scripts/build-zen`.
- Zen 1.23.2b is still the latest stable (tag 185e856, released 2026-10-09, Firefox 157.0.1). Firefox 157's configure requires at least the macOS 26.5 SDK.
- Research agents wrote the issue, feature, effect and DRM/Sync inventories in `docs/research/`; a fixtures agent froze 11 pages and the video.
- Built the harness, the Firefox and Zen templates, `docs/cuts.md` and the method part of `docs/benchmarks.md`.
- Stock build done (23.4 min compile). Spotlight then indexed `engine/` at a load of 15; moved it to `engine.noindex` behind a symlink.
- Functional tests caught: coalition CPU in mach ticks, Zen's empty startup tab, Firefox's hidden sidebar launcher, input pacing. All 22 runs pass now.
- Widevine check passed on the test stream; calibration set the settle time; started the measurement chain.
- Gecko baseline done at 22:29 (102 runs, none failed). At the user's request, quit Safari 27252, tested Safari in the harness (test-6) and restarted the chain with Safari in baseline-1. Renamed the project to Origin in the docs, the spec and `scripts/env.sh`.
