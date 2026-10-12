# Progress

Update this file at the end of every work session. Newest log entry first.

## Current milestone

Milestone 1, the baseline, started 2026-10-12.

Next action: the measurement chain `scripts/perf/m1-batches` runs detached (log `../Zen-Origin-research/logs/m1.log`): baseline-1, effects-1, profiler-1. It resumes where it stopped if rerun. When it ends, run `scripts/perf/report baseline-1 --out docs/perf/2026-10-13-baseline` and the same for effects-1 and profiler-1, write the results into `docs/benchmarks.md`, propose targets. Safari waits for the user's answer about the Safari that is already running.

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
- [ ] Calibration run (5 minutes of idle per browser) to confirm the 45 s settle time
- [ ] Measure official Zen, official Firefox, Safari and self-built stock Zen on all scenarios, 3 runs each
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

## Open questions for the user

- A Safari has been running on this Mac since 2026-10-09 (pid 27252) that this work did not start. May I quit it before the Safari runs? Two Safari instances share one data folder.
- Netflix, Spotify and Firefox Sync checks need accounts. How do you want to do them: sign in yourself through Screen Sharing on a build here, or on your MacBook with a build shared through filedrop?
- The GitHub repo is now Sowyu/Origin. Is "Origin" the working name, or should the repo keep calling the fork Zen Origin until the naming decision before the first release?
- Self-built builds have no Google Safe Browsing API key (Zen's CI injects one). Safe Browsing must work in the fork, so it needs its own key from a Google Cloud project (free, needs a Google account).

## Facts learned

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
