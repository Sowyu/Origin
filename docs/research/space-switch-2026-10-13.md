# What runs when Zen switches spaces

Question: what happens, frame by frame, on Cmd+Opt+Right/Left, and what could do the same with less work. Read-only study of the source in `src/zen/`. Nothing was built or measured for this note, so every cost estimate below is a guess unless marked otherwise.

Measured context (`energy-by-process-2026-10-13.md`): 20 switches in 24 s on a template with 2 spaces of 4 tabs each plus 2 Essentials. Zen's processes draw 63.4 mW (parent 36.7, GPU process 21.0, content 2.4). The Mac's GPU reaches 101 mW and WindowServer 42.7 mW. One switch every 0.96 s with a 250 ms animation, so the window is animating about 26% of the time.

## 1. The path from key to settled UI

1. Cmd+Opt+Right/Left calls `changeWorkspaceShortcut` (`ZenSpaceManager.mjs:3010`), which calls `changeWorkspace` (`:1748`). The Back/Forward handler at `:557-575` is the swipe and mouse route to the same function.
2. `changeWorkspace` completes any running animation and awaits it (`:1752-1756`), then calls `#performWorkspaceChange` (`:1778`).
3. `#performWorkspaceChange` (`:1778-1840`) flips `active` on every space container, runs `makeSureEmptyTabIsFirst` (which loops over every tab in `#fixTabPositions`, `:1855-1890`), invalidates the tab cache twice, and calls `_organizeWorkspaceStripLocations` (`:1922`).
4. `_organizeWorkspaceStripLocations` calls `_fixIndicatorsNames` (`:2086`), which rewrites the indicator icon and name of every space with `innerHTML = ""` (`updateWorkspaceIndicator`, `:2057-2084`). It then snaps each space's `style.transform` to its start position (`:1951-1964`).
5. `_handleTabSelection` picks the tab to show (`:2420-2470`). `gBrowser.warmupTab` runs on it. The real tab swap happens inside `#animateTabs` (`:2285-2290`, `gBrowser.selectedTab = tabToSelect`).
6. `#updateWorkspaceState` (`:2476`) does three things at once:
   - It queues `gZenThemePicker.onWorkspaceChange` in a `requestAnimationFrame` (`:2486-2488`).
   - It calls `#animateTabs` (`:2493`).
   - It fires `gBrowser.tabContainer.observe(... "privacy.userContext.enabled")` first (`:2479-2483`), which recalculates container observers.
7. After the animation resolves: `_organizeWorkspaceStripLocations(workspace, true)`, the change listeners, `updateWorkspaceIndicator`, `#fixCtrlTabBehavior` (`ctrlTab.uninit(); ctrlTab.readPref()`, `:2530-2535`).

Steps 3 to 5 and 7 run once per switch on the main thread. They are DOM and attribute work, small compared with 250 ms of animation, but they all land in the same frame as the first animation frame.

## 2. What animates, and what each frame redraws

`#animateTabs` (`:2100-2335`) starts these animations through Motion v13.2.0 (`gZenUIManager.motion`, `ZenUIManager.mjs:35-42`, `vendor/motion.dep`). All use `type: "spring", bounce: 0, duration: kGlobalAnimationDuration`, where the duration is the pref value in seconds (`:2111-2113`).

| piece | file and line | property | likely driver | redraws |
|---|---|---|---|---|
| Background crossfade, window gradient | `ZenSpaceManager.mjs:2178-2190` | custom property `--zen-background-opacity` 0 to 1 on `browserBackgroundElement` | main thread, every frame (unverified: Motion cannot hand an unregistered custom property to the compositor) | whole window, behind everything |
| Background crossfade, toolbar gradient | same call, second element `toolbarBackgroundElement` | same variable | same | the toolbar and sidebar region |
| Space container slide, outgoing and incoming | `:2203-2240` | `transform: translateX(%)` | WAAPI, probably on the compositor (unverified) | sidebar tab column only |
| Same call also animates `paddingTop` from X to X | `:2221-2225` | `padding-top` with identical start and end | main thread (padding is not compositable) (unverified) | forces restyle of each sliding space every frame, possible layout (unverified) |
| Essentials slide, only if `containerSpecificEssentials` | `:2262-2305` | `transform` | compositor | Essentials strip |
| Grain fade | `zen-browser-ui.css:96-99` | `opacity 0.2s` CSS transition, hardcoded | compositor | window |

How the crossfade works. `onWorkspaceChange` copies the current gradient into `--zen-main-browser-background-old` (`ZenGradientGenerator.mjs:1610-1631`), then writes the new gradient to `--zen-main-browser-background` (`:1781-1790`). The CSS has `::before` (old) and `::after` (new) pseudo-elements on each background element (`zen-browser-ui.css:36-76`). Their opacities are `calc(1 - var(--zen-background-opacity))` and `var(--zen-background-opacity)`. So the gradients are not interpolated per frame, and no colour maths runs per frame. The per-frame work is one variable write on two elements, which restyles four pseudo-elements and repaints them.

Why that is expensive (unverified): `opacity` through `var()` is not a compositor animation, so Gecko rebuilds the display list for those elements each frame. Each layer is a full-size multi-stop `linear-gradient` with `background-blend-mode: lighten` (`:51, :68`), and the container has `contain: strict` and `isolation: isolate` (`:41-42`). Blend modes make WebRender allocate an offscreen surface. The window also uses acrylic/vibrancy, so WindowServer re-blends the whole window every frame. That fits the measured WindowServer 42.7 mW and Mac GPU 101 mW, which sit outside the browser coalition.

The sidebar slide is the cheap part. A `translateX` on a compositor layer should cost almost nothing per frame, except that `#setAnimatingBackground(true)` (`:1912-1920`, `:2149`) sets `animating-background` on `gNavToolbox`. That makes the CSS rule at `zen-workspaces.css:417` stop applying `-moz-subtree-hidden-only-visually` to the inactive spaces, so every space's tab list is painted for the duration, not just two (unverified). With 2 spaces it hardly matters. With 8 it does.

Content area: `gBrowser.selectedTab = tabToSelect` (`:2288`) swaps the selected browser. The new tab's last composited frame is shown, so the content area repaints once with different content. This is a one-frame cost, not per frame. The GPU process 21 mW is probably this plus the two gradient layers (unverified).

## 3. Per-switch work in `onWorkspaceChange`

Runs once, in a rAF, at the start of the animation (`ZenGradientGenerator.mjs:1557-1855`). It does more than it needs to when the theme panel is closed.

- Removes every `.zen-theme-picker-dot` from the panel (`:1594-1599`) and recreates them in `recalculateDots` (`:1851-1853`, `:1948-1952`), so DOM churn in a closed panel.
- Rebuilds the opacity wave SVG path, stops and slider thumb size (`:1651-1698`), the texture handler position (`:1727-1760`) and the 16 texture buttons, `customColorList.innerHTML = ""` (`:1772`). All of this is picker-panel UI that nobody sees. The `textureWrapperWidth` check at `:1727` skips part of it when the panel is closed. The rest runs.
- Writes `--zen-primary-color`, `--toolbox-textcolor`, `--toolbar-color-scheme` on `documentElement` (`:1829-1841`) and toggles `zen-default-theme` and `zen-should-be-dark-mode` attributes (`:1798, :1806-1817`). Custom properties on the root restyle every element in the chrome document that inherits them. This is a full-window restyle once per switch, and a repaint of anything using those colours (unverified how much repaints). It lands in the first animation frame, so it is probably the most expensive single frame.
- `Services.obs.notifyObservers(null, "zen-space-gradient-update")` (`:1846`). I found no listener in `src/zen`, so it is free here.

`gZenUIManager.updateTabsToolbar` (`ZenUIManager.mjs:290-310`) runs at the start of the animation (`:2307-2310`). It reads `window.innerHeight` and `innerWidth` (may flush layout in chrome, unverified) and `getBoundsWithoutFlushing(gURLBar)`, then `recalculateURLBarHeight`. `_preventToolbarRebuild` skips the `updateTabsContainers` timeout on this call.

After the animation, `updateTabsContainers()` runs `onPinnedTabsResize` on every space in a rAF (`:2696-2740`, `:2327`). It reads `getBoundsWithoutFlushing` per container and writes `style.paddingTop` in a rAF (`#updatePaddingTopOnTabs`, `:1892-1911`). One layout pass, once.

I found no layout read inside the animation loop itself. The per-frame costs are the variable write (Motion JS tick) and the constant padding-top write.

## 4. What the pref controls

`zen.workspaces.switch-animation-duration` (default 250, `prefs/zen/workspaces.yaml:26`) is read at `ZenSpaceManager.mjs:2111` and `ZenSpaceCreation.mjs:95`. It sets the duration of all Motion animations above and the safety timeout (`duration * 1000 + 50` ms, `:2312-2314`).

At 0 (unverified, needs one run to confirm):

- Motion should finish immediately, so the background crossfade, slide and padding animations cost nothing.
- Still runs: everything in section 1 and 3, the single content swap, the root variable writes, the post-animation `updateTabsContainers`.
- Still animates: the grain fade (`zen-browser-ui.css:96-99`, 0.2 s, hardcoded, only when grain is on), `padding-top 0.1s` (`zen-workspaces.css:344`), the pinned-area `opacity 0.1s` and `transform 0.1s, opacity 0.15s` rules (`:282, :384, :397, :447`), and the `::before` `background-color` transition with `--inactive-window-transition` (`zen-browser-ui.css:78-80`) once `animating-background` is off.
- The switch becomes a hard cut. The user said it should still look right, so 0 is a measurement tool here, not a proposal.

## 5. Proposals, ranked by likely saving

All savings are guesses until measured. Each can be tested with the harness `spaces` scenario.

1. **Run the crossfade on the compositor.** Replace the animated `--zen-background-opacity` with a real opacity animation on two static layers. Concretely: animate `opacity` on `::before` with `element.animate(..., { pseudoElement: "::before" })`, or give each background element two child divs. Drop the `calc(1 - var())` pairing: the old layer stays at 1 and the new layer fades 0 to 1 over it. Remove `background-blend-mode: lighten` during the animation, or confirm it is a no-op for these single-image layers. Needs JS (the animate call at `ZenSpaceManager.mjs:2178-2190`, and the reset code in `ZenGradientGenerator.mjs:1626-1635` and `ZenSpacesSwipe.mjs:293`) and a small CSS edit. Likely the biggest saving, since it removes the per-frame main-thread restyle and display-list rebuild and could let the compositor skip rasterising the gradients. Risk: the swipe gesture drives the same variable by hand (`ZenSpacesSwipe.mjs`), so it needs a code path for that too.
2. **Cut the duration.** Set `zen.workspaces.switch-animation-duration` to 150. Pref only. Cost scales with frame count, so it should cut the animated portion by about 40%. The CSS grain fade says "keep in sync with kGlobalAnimationDuration" (`zen-browser-ui.css:95`), so change `0.2s` to match if grain is on. Quick to try first, and a run at 0 splits animation cost from state-change cost.
3. **Drop the dummy `paddingTop` animation.** At `ZenSpaceManager.mjs:2221-2225` it animates `paddingTop` from X to X. If Motion drives it on the main thread, that is a per-frame restyle of each sliding space for no visible change (unverified). Delete the lines and check nothing jumps (it may be there to stop `#updatePaddingTopOnTabs` or the `padding-top 0.1s` transition from interfering, unknown). Small JS change, two lines.
4. **Skip the picker-panel rebuild when the panel is closed.** In `onWorkspaceChange`, return before the dot removal, wave path, texture handler, button and `customColorList` work (`:1594-1599`, `:1651-1760`, `:1772`, `:1851-1853`) unless `gZenThemePicker.panel.state !== "closed"` or `editingWorkspaceId` is set, and rebuild when the panel opens (`handlePanelOpen`, `:2053`). JS only. Saves main-thread time once per switch, in the same frame as the first animation frame. Likely small in mW, helps frame pacing.
5. **Write the root variables only when they change.** `--zen-primary-color`, `--toolbox-textcolor`, `--toolbar-color-scheme` (`:1829-1841`) are written on every switch even when two spaces share them. Compare with the current value first. Spaces with different themes still pay. JS only, small.
6. **Leave inactive spaces hidden during the slide.** Keep `-moz-subtree-hidden-only-visually` on every space except the two sliding (`zen-workspaces.css:417`) by tying it to a per-space attribute instead of `animating-background` on the toolbox. Only matters with many spaces, so skip it for the template. Small CSS plus a few JS lines.

Order to try: 2 (pref), then 3 and 4 (small JS), then 1 (the real saving, the most work). If 1 lands, 2 may not be needed.

## 6. Open questions

- Does Motion run the `transform` on the compositor here? `about:support` and a Firefox Profiler run with the "Graphics" and "Power" tracks would show it. The renderer logs could confirm in one switch.
- Is the 36.7 mW parent figure mostly the Motion tick, the first-frame restyle from root variables, or the GPU-bound present waiting? A Gecko profile of 20 switches, `scripts/perf/` style, would split it.
- Whether `padding-top` X to X is skipped by Motion (it may drop identical keyframes). Read `motion.min.mjs` around its value-equal check, or log `animations.length` in a test profile.
