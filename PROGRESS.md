# Progress

Update this file at the end of every work session. Newest log entry first.

## Current milestone

Milestone 1, the baseline, started 2026-10-12.

Next action: the measurement chain `scripts/perf/m1-batches` runs detached as job `m1` (log `../Zen-Origin-research/logs/m1.log`, pid in `m1.pid`) in this order: baseline-1, profiler-1, effects-1. It was restarted on 2026-10-12 at 22:47 with Safari added to baseline-1 and should end about 08:30 on 10-13. It resumes where it stopped if rerun. When it ends, run `scripts/perf/report baseline-1 --out docs/perf/2026-10-13-baseline` and the same for profiler-1 and effects-1, write the results into `docs/benchmarks.md`, then propose targets.

## Milestones

| # | Milestone | Status |
|---|---|---|
| 1 | Baseline: build stock Zen, measurement harness, measure Zen, Firefox and Safari, cost of each Zen effect, `docs/cuts.md`, DRM and Sync checks | in progress |
| 2 | Debloat: Firefox-level cuts, remove cut Zen features and Zen server calls, own bundle ID and profile folder, measure against the baseline | not started |
| 3 | Rewrite study (can run beside milestone 2), then wait for the user's decision | not started |
| 4 | Lean UI: trim or rewrite as decided, meet the energy targets, side-by-side screenshots | not started |
| 5 | Release: name and icon, signing, update feed, MacBook battery script, `scripts/sync-upstream`, first release | not started |

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
- 2026-10-12: The user had me quit the Safari that ran since 10-09 (pid 27252). Safari's baseline runs came after the Gecko ones instead of interleaved with them, so `docs/benchmarks.md` must say so. A two-run test (batch test-6) showed a fresh Safari opens only the 10 test tabs, restores nothing and does not pile up tabs between runs.

## Open questions for the user

- Netflix, Spotify and Firefox Sync checks need accounts. How do you want to do them: sign in yourself through Screen Sharing on a build here, or on your MacBook with milestone 2's build, which has its own bundle ID? Today's stock build would open the real Zen profile on the MacBook.
- Self-built builds have no Google Safe Browsing API key (Zen's CI injects one). Safe Browsing must work in the fork, so it needs its own key from a Google Cloud project (free, needs a Google account).

## Facts learned

- Baseline (batch baseline-1, median of 3 runs, preliminary until Safari is in): idle, minimized, the background timer and fullscreen video sit at the no-browser floor in Firefox and Zen, with machine power at 102 to 117 mW against 108 mW with no browser.
- When content moves, official Zen costs the whole machine 90 to 160 mW more than Firefox. Scroll is 349 against 236 mW, windowed video 264 against 174 and tab switching 365 against 207. The browser's own CPU energy is about the same. The extra is GPU work in WindowServer: scroll takes 33.5 against 21.6 ms of GPU time per second, windowed video 22.1 against 7.6. Window-wide vibrancy is the first suspect, and the effects batch measures it.
- Official Zen beats Firefox at dragging the split-view divider (machine 1,489 against 2,145 mW) and at typing (149 against 167 mW).
- Stock Zen built without LTO and PGO is slower than official Zen: first paint 1,311 against 1,131 ms, split drag 1,579 against 1,013 mW of app power, tab switching 141 against 114 mW. Release builds need LTO and PGO.
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
