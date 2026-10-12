# Progress

Update this file at the end of every work session. Newest log entry first.

## Current milestone

Milestone 1, the baseline, started 2026-10-12.

Next action: build stock Zen 1.23.2b (`scripts/detach build scripts/build-zen`), then finish the measurement harness and measure official Zen 1.23.2b, official Firefox 157.0.1, Safari and the self-built stock Zen.

## Milestones

| # | Milestone | Status |
|---|---|---|
| 1 | Baseline: build stock Zen, measurement harness, measure Zen, Firefox and Safari, cost of each Zen effect, `docs/cuts.md`, DRM and Sync checks | in progress |
| 2 | Debloat: Firefox-level cuts, remove cut Zen features and Zen server calls, own bundle ID and profile folder, measure against the baseline | not started |
| 3 | Rewrite study (can run beside milestone 2), then wait for the user's decision | not started |
| 4 | Lean UI: trim or rewrite as decided, meet the energy targets, side-by-side screenshots | not started |
| 5 | Release: name and icon, signing, update feed, MacBook battery script, `scripts/sync-upstream`, first release | not started |

## Milestone 1 checklist

- [x] Repo layout: Zen 1.23.2b tree as the `upstream` snapshot commit, `main` on top (see CLAUDE.md "Repo layout")
- [x] Toolchains in `../Zen-Origin-research/tools`: Node 22.23.3, Python 3.11.17 (uv), Rust 1.95.0 (rustup, ~/.cargo), GNU tar 1.35 (built from source), xz linked from Homebrew
- [x] Official builds downloaded and checksummed: `../Zen-Origin-research/downloads/zen-1.23.2b.macos-universal.dmg`, `firefox-157.0.1.dmg`
- [x] Firefox 157.0.1 source in `engine/` (811 MB tarball, SHA-256 checked against Mozilla's SHA256SUMS)
- [ ] Build stock Zen without changes; record build time, peak memory and disk use
- [ ] Measurement harness (frozen local pages, procstat, powermetrics, profiler runs, scenario drivers)
- [ ] Measure official Zen, official Firefox, Safari and self-built stock Zen on all 10 scenarios, 3 runs each
- [ ] Measure each Zen visual effect by turning it off on its own
- [ ] Propose a target per scenario and get the user's OK
- [ ] `docs/cuts.md`
- [ ] DRM check (Widevine: Netflix, Spotify, a test page) and Sync check in a build we made and signed
- [ ] Demo milestone 1

## Decisions made

- 2026-10-12: The repo is Zen's tree at the root with our files added, not a separate overlay repo. Zen's history is about 6 GB, so `upstream` holds one parentless snapshot commit per Zen release instead of Zen's history.
- 2026-10-12: Baseline builds use Zen's release options without LTO and PGO (`ZEN_RELEASE=1 ZEN_DISABLE_LTO=1 ZEN_GA_DISABLE_PGO=1`), with Zen's own SDK pick (MacOSX26.5.sdk from the Command Line Tools, which is also Firefox 157's minimum). The official Zen build has thin LTO and PGO, so official versus self-built gives a first estimate of what LTO and PGO save.
- 2026-10-12: The stock build is en-US only (`scripts/update_en_US_packs.py`). Zen's `download-language-packs.sh` clones all of firefox-l10n and edits the global git config, so it is skipped.

## Open questions for the user

- The GitHub repo is now Sowyu/Origin. Is "Origin" the working name, or should the repo keep calling the fork Zen Origin until the naming decision before the first release?
- Our self-built builds have no Google Safe Browsing API key (Zen's CI injects one from secrets). Safe Browsing must work in the fork, so the fork needs its own key from a Google Cloud project. Free, but it needs the user's Google account.

## Log

### 2026-10-12

- Read the spec, both recon notes and CandyWrapper's machine rules. Set up CLAUDE.md, PROGRESS.md, `scripts/env.sh`, `scripts/detach`, `scripts/build-zen`.
- Zen 1.23.2b is still the latest stable (tag 185e856, released 2026-10-09, Firefox 157.0.1). Firefox 157's configure requires at least the macOS 26.5 SDK.
- Surfer needs GNU tar on macOS and its first download came back 420 bytes short; the resumed download matches Mozilla's checksum.
- Research agents wrote `docs/research/zen-issues-2026-10-12.md`; feature, effects and DRM/Sync inventories are in progress.
