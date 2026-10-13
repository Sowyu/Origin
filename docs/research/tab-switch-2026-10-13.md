# What runs when Zen switches tabs

Question: when the selected tab changes in Zen's vertical sidebar, what does Zen do beyond Firefox, and what could be cut without changing how a tab switch looks. Read-only study of `src/` and the patched tree in `engine/` (specific files only). Nothing was built or measured for this note, so every cost statement is a guess unless marked otherwise.

Measured context (`energy-by-process-2026-10-13.md` section 1 and 2): 50 switches with Ctrl+Tab in 24 s, one every 0.4 s (`scripts/perf/run:189`). Zen against Firefox: GPU process 58.1 against 48.5 mW, content 31.7 against 20.8, parent 24.1 against 25.1, WindowServer 32.9 against 17.5, Mac GPU 54.8 against 21.0. The parent is level, so Zen's JS on a switch is not where the energy goes. Of the 69 mW gap, 20 mW is inside the browser and 49 mW is outside it.

## 1. Summary

I found no CSS transition, animation or panel that runs when the selected tab changes. Zen adds a handful of cheap JS handlers, all level with Firefox in parent power. The gap most likely comes from how the page is composited (translucent window, rounded and shadowed page container), not from anything the tab switch itself triggers. That cause is inferred, not measured.

## 2. The path from key to settled UI

1. Ctrl+Tab runs Firefox's `advanceSelectedTab`, which sets `gBrowser.selectedTab`. Firefox's default `browser.ctrlTab.sortByRecentlyUsed` is false (`engine/browser/app/profile/firefox.js:1267`), and neither `prefs/` nor `scripts/perf/profiles.json` changes it. So there is no Ctrl+Tab preview panel in Zen or in Firefox. Zen's two patches to `browser-ctrlTab.js` only filter pending and `zen-empty-tab` tabs from the list and add `--panel-shadow-margin: 0` to the panel CSS, and both are inert while the panel is off.
2. `selectedTab` setter calls `gZenWorkspaces.onBeforeTabSelect(val)` first (`engine/.../Tabbrowser.sys.mjs:679`, Zen function at `src/zen/spaces/ZenSpaceManager.mjs:2354-2371`). For a tab in the active space or an Essential it returns false after two attribute reads. A tab in another space starts a space switch instead (see `space-switch-2026-10-13.md`).
3. `updateCurrentBrowser` (`Tabbrowser.sys.mjs:1909`) runs Firefox's `AsyncTabSwitcher.requestTab` (`:1928`). Zen adds one clause to `shouldDeactivateDocShell` (`src/browser/components/tabbrowser/AsyncTabSwitcher-sys-mjs.patch`, `|| browser?.zenModeActive`), which is a property read.
4. Inside the same function Zen patched in three small things (`Tabbrowser-sys-mjs.patch`, hunks near patched lines 185 to 207): `newTab.removeAttribute("unread")`, a call to `gURLBar._zenHandleUrlbarClose(true)` that exists only while Zen's new-tab URL bar is open (`ZenUIManager.mjs:595`, cleared at `:639`), and an extra condition on re-focusing the URL bar. All are no-ops on a normal switch.
5. `TabSelect` is dispatched (`Tabbrowser.sys.mjs:2100`). Section 3 lists the listeners.
6. Firefox then fires `TabAttrModified` twice (`:2112-2113`) and `tabContainer._handleTabSelect()` (`tabs.js:1405`). Zen adds `if (!selectedTab) return` and `gZenCompactModeManager.flashSidebarIfNecessary(aInstant)` (`:1410`). The flash only runs when compact mode is on and `zen.view.compact.toolbar-flash-popup` is true (`src/zen/compact-mode/ZenCompactMode.mjs:233-246`). Origin's default for that pref is false (`prefs/zen/compact-mode.yaml:11`) and compact mode is off by default, so it does nothing here.
7. `#ensureTabIsVisible` scrolls the selected tab into view only if the tab strip overflows (`tabs.js:1418`). Zen swaps the target scrollbox to `this.arrowScrollbox`. With 4 tabs per space it does not overflow.

## 3. TabSelect listeners in `src/zen`

| listener | file and line | work per switch |
|---|---|---|
| `ZenSpaceManager.onLocationChange` | `spaces/ZenSpaceManager.mjs:828` (bound), body `:2904-2942` | `#changeToEmptyTab` (`:2895-2902`): one `toggleAttribute` on the sidebar and one `setAttribute("zen-has-empty-tab", "true"/"false")` on the root. The root value is the same string on every switch unless an empty tab is involved, so I expect no restyle (unverified, Gecko may still notify). Then `lastSelectedWorkspaceTabs[uuid] = tab` and a space comparison. |
| `ZenViewSplitter.onTabSelect` | `split-view/ZenViewSplitter.mjs:118` (bound), `:184-193` | Calls `onLocationChange` (`:1303-1322`): `disableTabRearrangeView` (returns at once), `updateSplitView` (`:1490-1501`, returns at once when neither tab is in a split), `tab.linkedBrowser.docShellIsActive = true`, `_maybeRemoveFakeBrowser` (`:2067-2085`, two `removeAttribute` calls), and a `getElementById` plus attribute write on `cmd_zenNewEmptySplit`. The `docShellIsActive` write is redundant with `AsyncTabSwitcher.sys.mjs:273-279`, which already does it for a loading tab (unverified that it never changes ordering). |
| `ZenFolders.on_TabSelect` | `folders/ZenFolders.mjs:213`, `:375-397` | Returns at once unless the tab sits in a collapsed folder. The template has no folders. |
| `ZenWindowSync.on_TabSelect` | `sessionstore/ZenWindowSync.sys.mjs:1538-1547`, instant path `:399-402` | Enqueues a promise that runs `#onTabSwitchOrWindowFocus` (`:1118-1170`). With one window it checks `_zenContentsVisible` and walks the window list once. Pref `zen.window-sync.enabled` is true (`prefs/zen/window-sync.yaml:1`). |
| `ZenSiteDataPanel` | `urlbar/ZenSiteDataPanel.sys.mjs:712` | One-shot listener for an empty-tab check. |
| `tabgroup.mjs` and the URL bar | `tabgroup-mjs.patch:50-52`, `UrlbarInputBase-mjs.patch` | Firefox's own handlers, touched only to adjust group and URL bar behaviour. |

I found no MutationObserver that fires on selection. `ZenHasPolyfill` observes only `panelopen`, `open`, `breakout-extend` and `zen-floating-urlbar` (`compact-mode/ZenCompactMode.mjs:198-230`). `ZenPinnedTabManager` and `ZenUIManager` have no TabSelect handler. `ZenGradientGenerator` runs only on space change.

Other Zen code that gets walked on every switch because Zen patched it: `tab.visible` now climbs the parent groups (`tab-js.patch` lines 50-73), and `tabContainer.ariaFocusableItems` builds from Zen's workspace strips (`tabs-js.patch` lines 140-165). Those are cached and only rebuilt after `_invalidateCachedTabs`, which a plain switch does not call. Both are parent-side and the parent measures level with Firefox.

## 4. CSS and animation on the selected tab, sidebar and content area

No selection-driven transition exists. Details by file:

- Tab background. Firefox's `tabs.css` has no transition on `.tab-background` for selection (the only background transition is during drag, `engine/.../tabs.css:1133`). Zen's selected colour is a static translucent value: `--tab-background-color-selected` and `--tab-box-shadow-selected` on `zen-workspace` (`spaces/zen-workspaces.css:336-341`, shadow `0 0.8px 1.5px`). Zen's `&[selected] .tab-background { border-color: transparent }` is static (`tabs/zen-tabs/vertical-tabs.css:799-801`).
- Tab transitions. `.tabbrowser-tab` and its icon transition `scale 0.1s` plus `margin-inline-start 0.1s` (`vertical-tabs.css:281-287`). `scale` only changes on `:active` (`:300-307`), which is a mouse press, and Ctrl+Tab never presses. Margin changes only with folder indent.
- Essentials. The selected Essential draws a blurred favicon: `filter: blur(20px)` on a `::after` at `inset: -50%` (`vertical-tabs.css:1075-1093`, blur at `:1079`), so a layer four times the tab's area. A `::before` has `transition: background 0.1s` (`:1113`). Both are in the `zen.theme.essentials-favicon-bg` block, default true (`prefs/zen/theme.yaml:17`). `filter` and `background` transitions run on the main thread. The harness cycle probably passes through the 2 Essentials on every lap (unverified; `visibleTabs` should include them). So each lap pays a blur raster and a 0.1 s background fade twice.
- Sidebar. `zen-workspace` has `transition: padding-top 0.1s` (`zen-workspaces.css:343-345`), which fires only when `paddingTop` is written (space switch, pinned resize). The pinned-section transitions (`vertical-tabs.css:141-146`, `:178-183`) fire on drag and separator changes.
- Page container. Every `.browserSidebarContainer` gets `overflow: clip`, `border-radius` and `box-shadow: var(--zen-big-shadow)` (`0 3px 8px rgba(0,0,0,.24)`, `common/styles/zen-theme.css:262`) at `common/styles/zen-browser-container.css:7-16`, unless `zen-no-padding` is set (`common/zenThemeModifier.js:179-183`, when `zen.theme.content-element-separation` is at its minimum). Static, no transition. A tab switch swaps which container is visible, so the new page is drawn inside a rounded clip every time. Firefox has no clip. That is my main suspect for extra GPU and compositor work (unverified).
- Margin transition. `.deck-selected .browserContainer { transition: margin var(--zen-hidden-toolbar-transition) }` (`zen-browser-container.css:36-42`) is active with Origin's prefs (`zen.view.hide-window-controls` true, `shift-down-site-on-hover` false, `prefs/zen/view.yaml:25,49`). The margin changes only when `#tabbrowser-tabpanels[has-toolbar-hovered]` is set, so nothing animates on a tab switch.
- Window background. `.zen-browser-generic-background` (`common/styles/zen-browser-ui.css:36-80`) is untouched by a tab switch: `--zen-background-opacity` and the gradient variables change only on space change. It does keep `will-change: background-color` on its `::before` and `::after` (`:49`), `contain: strict`, `isolation: isolate` and `background-blend-mode: lighten` (`:41-42, :57, :74`). Those pseudo-elements never set `background-color` (they set `background:` images), so the `will-change` hint looks dead. It may still keep the layers promoted (unverified).
- Translucent window. `zen.widget.macos.window-vibrancy` is true with material 1 (`prefs/zen/macos.yaml:7-18`). The window is an `NSVisualEffectView`, so WindowServer blends the whole window with the blurred backdrop on every presented frame (`zen-effects-2026-10-12.md`). Firefox's window is opaque.
- Other transitions in the shared files (grain `opacity 0.2s` at `zen-browser-ui.css:97`, splitter `opacity` at `:289`, URL bar fades) do not touch the selected tab.

## 5. Per-switch JS in the managers, in one list

- `ZenUIManager`: nothing on TabSelect. `updateTabsToolbar` is called from space switching only.
- `ZenSpaceManager`: section 3.
- `ZenPinnedTabManager`: nothing on TabSelect. `onTabIconChanged` and `onTabLabelChanged` run on icon and label changes.
- `ZenViewSplitter`: section 3.
- `ZenFolders`: section 3.
- Compact mode: the flash in section 2, off by default.
- Window sync: section 3.
- Origin's `OriginTabUnloader`: a one-minute timer, not a TabSelect handler.

## 6. Does the content area frame change?

The content area's geometry does not change on a plain tab switch. No class, margin or size is written on the container. What changes is which `.browserSidebarContainer` is `deck-selected`, so one full-page repaint with different content, drawn inside the rounded clip and over the shadow. Firefox does the same repaint without the clip, the shadow or the translucent window behind it.

Content processes: I could not find why Zen's cost +10.9 mW. The switcher, the page and the process model are Firefox's. Candidates, all unverified: the first paint after reactivation going through a more expensive clip path, or the `docShellIsActive = true` write in the split handler. A profile of the `tabs` scenario would settle it.

## 7. Proposals, ranked by likely saving

All savings are guesses until measured. The harness `switch` scenario (`scripts/perf/run:187-190`) runs the `tabs` and `spaces` windows in one run, so every variant below can use it.

1. **Window vibrancy off** (pref: `zen.widget.macos.window-vibrancy` false). Likeliest owner of the 49 mW outside the browser, since WindowServer must re-blend a translucent window each frame. It changes how the whole window looks (the sidebar and toolbar lose the blurred backdrop), not how a tab switch looks. Variant `no-vibrancy` already exists in `scripts/perf/variants.json` and lists `switch`. Run it first.
2. **Page container shadow and radius** (CSS, `zen-browser-container.css:7-16`). Drop `box-shadow` first: 3px offset, 8px blur at 24% is hard to see and costs a blur render task. Then test dropping `border-radius` plus `overflow: clip`. Variants `no-page-shadow` and `no-page-radius` exist but list `idle`, `scroll` and `video-windowed` only. Add `switch` to both (one JSON edit) so the tab and space windows measure them. Radius is a defining part of Zen's look, so treat it as a trade, shadow as free.
3. **Essentials blur** (pref `zen.theme.essentials-favicon-bg` false, or CSS: remove only the `::after` blur at `vertical-tabs.css:1075-1093` and keep the translucent `::before`). Only costs when an Essential is the selected tab, so the saving scales with how often the user lands on one. The pref also removes the custom selected colour (`zen-effects-2026-10-12.md` section 1.11), so the CSS route keeps the look closer. Variant `no-essentials-bg` exists and lists `switch`.
4. **Remove `will-change: background-color`** (CSS, `zen-browser-ui.css:49`). No visible change. May let WebRender drop two layers per background. Saving probably small.
5. **Turn off window sync** (pref `zen.window-sync.enabled` false). Removes an async handler per switch. Parent is already level with Firefox, so expect under 1 mW. It also removes Zen's multi-window sync, so it is a feature cut and not for Origin by default.
6. **Guard the split handler's `docShellIsActive = true`** (JS, `ZenViewSplitter.mjs:1308`: set it only when `updateSplitView` activated a split). Removes a write the tab switcher already makes. Tiny, and a risk if split view relies on it. Skip unless a profile points at it.

JS is not where the tab switch costs energy. Nothing in the JS list is worth a patch before items 1 to 3 are measured.

## 8. Open questions

- Which of vibrancy, rounded clip and shadow explains the 49 mW outside the browser? Run `no-vibrancy`, `no-page-shadow` and `no-page-radius` with `switch`, then `min-visual`. If `min-visual` closes the gap and no single variant does, the cost is the combination.
- Do the harness's 50 Ctrl+Tab presses cross space boundaries? If the cycle ever leaves the active space, some switches are space switches. `visibleTabs` in a Zen window should cover the active space plus Essentials only (`tabs-js.patch` lines 85-130), but I did not run it.
- Why do content processes use 10.9 mW more? A Gecko profile with the Graphics track (`run` accepts profiler features, commit `165bdd4`) on the `tabs` window of both browsers, then compare paint counts per switch.
- Does the root `setAttribute("zen-has-empty-tab", ...)` with an unchanged value cause a restyle? A profile showing restyle count per switch would tell. If yes, guard it with a value check (one line at `ZenSpaceManager.mjs:2901`).
