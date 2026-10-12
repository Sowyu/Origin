# Origin spec

Written 2026-10-12 from my answers in chat. This file is the source of truth for scope and hard rules. Decisions made later go in `PROGRESS.md`.

## Goal

Build Origin, a fork of Zen Browser for macOS on Apple Silicon, released publicly on GitHub. It should feel like Zen, look great and use as little energy as a Gecko browser can. Zen today is bloated, so cut everything I don't use and make the rest lean.

Also find out whether rewriting Zen's UI layer would beat trimming it in place. Bring me numbers and a recommendation before you start any rewrite.

## Hard rules

- The engine stays Gecko, so don't propose another engine.
- Keep Firefox's security features exactly as they ship.
- Back every energy claim with before and after numbers from the harness below.
- Keep the diff against upstream small enough to rebase every week.
- Prefer a pref to a patch, and deleting code to changing it.
- The fork never contacts Zen's servers.
- Ship none of Zen's logos or icons and none of Mozilla's trademarks.
- Ask me before spending money, such as on paid CI runners or an Apple Developer ID.
- Ask me before any signing key leaves this Mac.
- Leave AI attribution out of commits, PRs and release notes.

Firefox's security features include content sandboxing, site isolation, Safe Browsing, CRLite and Remote Settings. CRLite, the add-on blocklist and search config all depend on Remote Settings, so it stays on.

Since Firefox 155, Mozilla ships a major release every two weeks and dot releases about weekly. Zen follows each one within about two days, so the fork will rebase more than 40 times a year.

## What stays

Keep these Zen features and make each one lean:

- Workspaces, with their colors and gradients
- Essentials, the pinned icon grid
- Folders
- Split view
- Compact mode

Also keep what they depend on: the vertical tab sidebar, the URL bar and command palette, keyboard shortcuts, the workspace theme picker and session restore for workspaces. Keep `src/zen/sync/` if it's what syncs workspaces across devices and it costs nothing at idle.

Firefox has had its own vertical tabs since 136, tab groups since 138 and split view since 149. Where Firefox's version does the job and looks right beside Zen's, use it and delete Zen's.

Keep three Firefox services: Firefox Sync, Widevine DRM for Netflix and Spotify, and page translation. Add-ons from addons.mozilla.org must keep working.

## What goes

Remove these Zen features with their code, prefs, strings, icons, CSS, settings pages and tests:

- Boosts
- Glance
- Zen Mods and its theme store
- Live folders
- Space routing, which opens chosen sites in chosen workspaces
- The library in `src/zen/library/`
- Share
- Sidebar media controls
- The welcome flow and its video

Cut any other Zen feature that the kept ones don't need. List every cut in `docs/cuts.md` with one line on what it did, so I can veto it. Removing features should leave the UI cleaner, with no empty menus, buttons or settings sections behind.

Turn these Firefox features off, with prefs or policies where they exist:

- Telemetry and every other kind of data reporting
- Studies and Nimbus experiments and rollouts
- Every AI feature except translation
- Sponsored content and ads on the new tab page
- Firefox Suggest
- Mozilla promos and feature recommendations
- Crash reporting
- Captive portal and connectivity checks, since macOS detects captive portals itself

Setting `browser.ai.control.default` to `"blocked"` turns off every AI feature in current Firefox, and per-feature prefs such as `browser.ai.control.translations` exist. Check that translation still works after you flip the switch. Zen already locks telemetry, Normandy and Firefox Suggest off, but leaves Nimbus rollouts, sponsored new tab content, `datareporting.usage.uploadEnabled` and smart tab groups at Firefox's defaults.

Leave every other Firefox feature as it ships. If one costs energy while unused, show me the numbers and ask before cutting it.

## Look and feel

The fork should feel like Zen to a Zen user. That means the same layout, the floating rounded page, the see-through sidebar, workspace gradients, the same shortcuts and similar motion. I won't pick which effects matter, so measure what each one costs, keep the look and build it the cheapest way. Before you call a UI milestone done, show me side-by-side screenshots against stock Zen in light and dark.

Rules for the browser UI:

- Transparency comes only from native `NSVisualEffectView` layers, like the window material Zen already uses.
- No CSS `backdrop-filter` anywhere in the browser UI.
- Remove the vendored motion.dev library and animate with CSS transitions and keyframes on `transform` and `opacity` only.
- No looping animations except Firefox's own loading indicators, and Zen has nine loops to remove or turn into one-shots.
- Nothing may keep the refresh driver ticking while the screen is still.
- Gradients and the grain texture are static, and a workspace switch may only cross-fade them.
- Follow Reduce Motion and Reduce Transparency from System Settings.
- Load each feature's code when it's first used, not at startup.

Zen's window material is the `ZenWindowMaterialView` class in `src/widget/cocoa/nsCocoaWindow-mm.patch`, set by `zen.widget.macos.window-vibrancy` and `zen.widget.macos.window-material` in `prefs/zen/macos.yaml`. The window server blurs native vibrancy on the GPU. In Mozilla bug 1995379, a CSS `backdrop-filter: blur(10px)` on new tab cards took 98% of the renderer's CPU on an M4 Pro, and Mozilla dropped the effect.

Firefox 70 stopped the window server from re-blurring vibrancy on every frame by keeping vibrant areas in their own layers, in bug 1574586. Check that the fork's vibrant areas stay untouched while pages scroll and play video. Compact mode tracks the pointer with native code in `src/zen/compact-mode/`, so measure what it costs while the mouse moves.

## Energy

First measure the latest stable Zen, the official Firefox it's based on and Safari on every scenario below. Then propose a target for each scenario, no worse than Firefox and clearly better than Zen, and get my OK. Measure the fork against a stock Zen you built with the same options, and keep the official builds for context.

These rules hold whatever the numbers say:

- At idle, with the window visible and no text field focused, the parent process shows no `RefreshDriverTick` markers and close to zero CPU.
- A hidden or minimized window paints nothing.
- Video plays through hardware decoding and the native macOS compositor.
- Background tabs run throttled timers.
- Every kept visual effect has its measured cost in `docs/benchmarks.md`.

Firefox turns App Nap off for its parent process in `toolkit/xre/MacApplicationDelegate.mm`, so macOS never quiets the browser for you. Any idle timer or animation in the UI code costs full wakeups.

Turn on Firefox's low-memory tab unloading. It never fires on macOS today, because `browser.lowMemoryResponseMask` ships as 0 outside Nightly, as Zen issue #15619 found. Firefox has no time-based unloading, so measure what idle background tabs cost before you build one.

Leads worth measuring, keeping only what the numbers support:

- Firefox 146 runs every thread at user-initiated QoS on macOS 26 and later, and bug 1999447 proposes undoing that from 26.1.
- `widget.macos.native-popovers` draws arrow panels as native popovers, and Firefox's own pref comment expects Zen-like browsers to turn it on.
- Zen writes session state every 40 seconds through `browser.sessionstore.interval`, and a longer interval means fewer disk writes.
- Chrome JS can read battery state through `navigator.getBattery()`, though Firefox has no power saver mode and ignores Low Power Mode.

Speculative connections, the network predictor and link prefetch each trade energy for speed, so measure them too. If animations or effects turn out to cost real energy, a lean mode on battery is a candidate. Propose it with numbers before you build it.

Read Zen issues #8932, #12464, #14793 and #9727 before you start profiling.

Run each scenario against frozen local copies of real pages served from this Mac, so the network adds no noise:

1. Cold launch to first paint.
2. Idle for 60 seconds with the window visible and 10 loaded tabs across 2 workspaces.
3. The same idle with the window minimized.
4. Switching tabs 50 times and workspaces 20 times.
5. Showing and hiding the compact mode sidebar 20 times.
6. Opening split view and dragging its divider.
7. Scrolling a long article from top to bottom.
8. Playing 2 minutes of 1080p video from a local file, windowed and then fullscreen.
9. Typing a paragraph into a text area.
10. Idling with a background tab that runs a 1-second timer.

Scenario 8 covers both window modes because Gecko's low-power video path on macOS only works in fullscreen.

## How to measure

- Run `sudo powermetrics` with `--show-process-coalition` and `--show-process-energy` for power in milliwatts and energy per app.
- Launch every browser with `open`, so each one gets its own coalition instead of sitting under the shell's.
- Copy `../CandyWrapper/scripts/procstat.swift`, which reads per-process CPU time, wakeups, billed energy and memory from kernel counters.
- Always include WindowServer, because CandyWrapper found that blur costs land there and not in the app.
- Use the Firefox Profiler's power feature for per-process energy and `RefreshDriverTick` markers.
- Don't compare Activity Monitor's Energy Impact numbers, which are a blended estimate.
- Follow the quiet-machine rule in `../CandyWrapper/docs/perf/README.md`, and report the median and range of three runs.

Sample the profiler every 5 to 10 ms for power runs, since its default 1 ms rate adds wakeups of its own. `MOZ_LOG=nsRefreshDriver:5` logs why the refresh driver keeps running. Passwordless sudo works on this Mac, and you may use it only for `powermetrics` and for launching GUI apps in my session.

This Mac mini has no battery. Before the first public release, write one script I can run on my MacBook that compares the fork with stock Zen on battery and prints the result in plain words. Ask me which MacBook I have, because a 120 Hz ProMotion screen doubles the cost of any running animation.

## Rewrite study

Zen's UI layer is about 66,000 lines of JS and CSS in `src/zen/`, plus 263 patches to Firefox files. Compare three options, all on Gecko:

1. Trim Zen in place by deleting the cuts and fixing what costs energy.
2. Rewrite Zen's UI layer from scratch for the kept features under the rules above, keeping only the Firefox patches they need.
3. Build a thin layer on upstream Firefox that reuses its vertical tabs, tab groups and split view and adds only what's missing.

Natsumi and the Sine mod loader already put a Zen-like UI on stock Firefox, so read them before you prototype option 3. Native work such as Zen's window material and compact mode's pointer tracking still needs patches on every path.

Judge the options on energy per scenario, closeness to Zen's look, lines of code, number of Firefox patches, time to rebase onto a new release and time to a usable build. For options 2 and 3, prototype the sidebar with workspaces and compact mode, capped at about two days of agent work, and measure it against Zen's. Write the result in `docs/rewrite-study.md` as one page plus the numbers, end with a recommendation and wait for my decision.

Until I decide, put no deep work into Zen UI code that a rewrite would replace. Do the work that carries over first: the Firefox-level cuts, the build, the measurement harness and the release pipeline.

## Build, release and updates

These facts come from recon on 2026-10-12, and Zen moves fast, so check them:

- Zen 1.23.2b was the latest stable, released 2026-10-09 on Firefox 157.0.1.
- Zen builds with surfer through `npm run download`, `npm run import` and `npm run build`.
- Zen's own code is in `src/zen/`, its Firefox patches mirror the Firefox tree under `src/`, and default prefs are YAML files in `prefs/`.
- The repo pins Node 22, Rust 1.95.0 and Python 3.11, while this Mac has Node 26.11.1, Python 3.14 and no Rust.
- Zen's CI cross-compiles macOS from Linux with ThinLTO and two-stage PGO.
- Zen's local release config accepts only the macOS 26.4 or 26.5 SDK, and this Mac has Xcode 27 with SDK 27.0.
- Zen serves its update feed from GitHub Pages through `zen-browser/updates-server`.

Rules:

- Before any UI work, find the fastest edit-and-run loop, such as artifact builds or `mach build faster`.
- Run one `mach build` at a time, because this Mac has 16 GB of RAM.
- If SDK 27 breaks the build, install a supported SDK beside Xcode the way Mozilla's toolchain scripts do.
- Leave the installed Xcode alone, since CandyWrapper agents build with it.
- Measure what LTO and PGO save in energy before you pay their build cost.
- Try Zen's CI recipe on free GitHub runners for release builds before you ask me about paid ones.
- Sign with my Apple Development identity, Team ID `8Q677AYRU7`, as `../CandyWrapper/docs/release.md` describes.
- Take the entitlements from Firefox's own hardened runtime files.
- Use Firefox's built-in updater with the fork's own MAR signing key and an update feed on GitHub Pages.
- Keep the MAR private key in the release keychain like CandyWrapper's Sparkle key, never in the repo.
- Publish releases at github.com/Sowyu/Origin with an arm64 DMG and SHA-256 sums.
- Give the fork its own bundle ID and profile folder, so it runs beside stock Zen.
- A copy of a profile from the matching Zen release must open in the fork with workspaces, Essentials, folders and pinned tabs intact.
- Ship the fork within 3 days of each Zen release that carries a Firefox security fix.
- When a rebase applies cleanly, the release runs without an agent.
- Keep the MPL-2.0 headers and license.

I have no Developer ID, so builds aren't notarized. Explain in the README how to open an app that isn't notarized. Say in About and in the README that the fork is based on Zen and Firefox and isn't affiliated with either.

Check early that Widevine plays Netflix, Spotify and a Widevine test page in a build you made and signed. If it needs Google's VMP signing, find out what that takes and tell me. Check that Firefox Sync signs in and syncs as well.

The repo calls the fork Origin. Confirm the final name and icon with me before the first public release, because Zen has no written trademark policy and a name with "Zen" in it could draw a complaint.

## This machine

- It's a remote Mac mini M4 with 10 cores, 16 GB of RAM and macOS 27.0.1, and I use a MacBook day to day.
- It had 136 GB free on 2026-10-12, and a Zen build needs about 80 GB once toolchains and a second object dir are counted.
- CandyWrapper agents share this disk and stop below 40 GB free, so stay above that and delete old object dirs.
- `/tmp/cw-preflight` holds CandyWrapper agents back while any `mach build` runs, so never leave a build hanging.
- Launch GUI apps in my session with `sudo launchctl asuser 502 sudo -u mrm <cmd>`.
- `screencapture` works, and `../CandyWrapper/scripts/ui/` can click, scroll and type.
- The screen is virtual at 1920x1080, so check its scale with `system_profiler SPDisplaysDataType` before measuring.
- There's no `gh`, so use the GitHub REST API through `git credential fill` as CandyWrapper's release script does.
- Homebrew installs can fail because `/opt/homebrew/var/log` belongs to root, so install tools into user folders.
- Never write to `~/.t3`, and kill only processes whose PID you started and recorded.

## How to work

- Read `../CandyWrapper/CLAUDE.md` first, because its machine rules apply here too.
- Set up `CLAUDE.md`, `PROGRESS.md` and `docs/` the way `../CandyWrapper` does.
- Update `PROGRESS.md` before you stop, so a new agent with no chat history can continue from it.
- Keep the Firefox source, object dirs and other large trees out of git, in ignored folders or `../Zen-Origin-research/`.
- Delegate research and mechanical edits to `sonnet-medium`, and judgement calls to `opus-medium`.
- Every agent brief says "Do not use the Agent tool".
- Run at most four agents at once, and check that each shows signs of life within two minutes.
- Read Firefox source in slices with `rg` or Searchfox, never whole large files.
- Commit and push as work lands, and fetch and rebase first so you never overwrite my edits on GitHub.
- Share test builds through `filedrop` so I can try them on my MacBook.
- Demo each milestone and wait for my OK before starting the next.

`docs/research/` holds recon notes from 2026-10-12 with sources. Agents wrote them fast, so verify a fact before you build on it.

## Milestones

### 1. Baseline

Build the latest stable Zen from source without changes, and record the build time, peak memory and disk use. Build the measurement harness, then measure stock Zen, the official Firefox it's based on and Safari on every scenario. Measure each Zen visual effect by turning it off on its own. Write `docs/cuts.md`, then run the DRM and Sync checks.

### 2. Debloat

Apply the Firefox-level cuts, and remove the Zen features on the cut list along with every call to Zen's servers. Give the fork its own bundle ID and profile folder, then measure it against the baseline.

### 3. Rewrite study

Run the study above and wait for my decision. It can run alongside milestone 2.

### 4. Lean UI

Trim or rewrite the kept features the way I decided. Meet the energy targets and match Zen in side-by-side screenshots.

### 5. Release

Settle the name and icon with me, then set up signing, the update feed and the MacBook battery script. Write `scripts/sync-upstream`, which rebases onto a new Zen tag, builds, runs a smoke test and stops on conflicts. Run it daily from a scheduled job that tells me the result, then publish the first release.
