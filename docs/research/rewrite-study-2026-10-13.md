# Rewrite study notes (2026-10-13)

Question from `docs/spec.md:150-160`: would rewriting Zen's UI layer beat trimming it in place? These notes study the tree as it stands after today's uncommitted cuts (`git status` on `main`), Firefox 157.0.1 in `engine/` (read with `git -C engine show HEAD:<path>`, so Zen's applied patches are left out), and the baseline-1 numbers. Nothing was built or launched for this note. Guesses are marked "unverified". The one-page decision document the spec asks for (`docs/rewrite-study.md`) should be written from these notes once the experiments at the end have run.

Method for line counts: `wc -l` on files under `src/zen/` without `tests/`. Patch counts cover the 188 Zen patch files under `src/` without `src/external-patches/`. A hunk is one `@@` block, and changed lines are `+` and `-` lines without the file headers. Hunks were tagged to features by keyword (split, folder, essential, workspace and so on, script in `/tmp/zo-study/classify.py`). Keyword tagging is rough: a hunk that mentions two features counts once, under the first match, so treat per-feature hunk counts as plus or minus 30% (unverified).

## Where the tree stands after the cuts

| | before cuts (HEAD) | working tree |
|---|---|---|
| Zen patch files to Firefox | 254 | 188 |
| hunks | 822 | 666 |
| changed lines in patches | 4,407 | 3,518 (2,648 added, 870 removed) |
| JS and CSS in `src/zen/` without tests | 65,935 | 36,691 |
| C++, Objective-C++ and IDL in `src/zen/` without tests | not counted | 971 (51 of them Windows only) |

Zen files outside `src/zen/` add 2,567 lines: the settings pages (`src/browser/components/preferences/zen-settings.js`, 598 lines, and four `.inc.xhtml` files), `zen-preferences.css` (350), `zen-icons/icons.css` (875) and the panel and command markup in `src/browser/base/content/zen-*.inc.xhtml` and `zen-panels/`.

Where the 666 hunks sit in Firefox:

| Firefox area | patch files | hunks | changed lines |
|---|---|---|---|
| tab strip (`Tabbrowser.sys.mjs`, `tabs.js`, `tab.js`, `tabgroup.mjs`, `drag-and-drop.js`, `tabs.css` and neighbours) | 15 | 211 | 1,025 |
| URL bar (`UrlbarInputBase.mjs`, `urlbar.css`, providers, identity block) | 16 | 87 | 794 |
| session store | 9 | 59 | 195 |
| Firefox Sync and its settings | 6 | 10 | 59 |
| native code (`widget/`, `servo/`, `dom/`, `xpfe/`) | 15 | 40 | 326 |
| build, branding, installer, lint, tests, profile dir | 48 | 69 | 327 |
| other chrome JS (CustomizableUI, add-ons panel, PiP, places, about dialog) | 53 | 135 | 572 |
| settings, markup, other CSS | 25 | 54 | 218 |

Four files hold 180 of the 666 hunks: `Tabbrowser-sys-mjs.patch` (96), `SessionStore-sys-mjs.patch` (39), `UrlbarInputBase-mjs.patch` (34) and `urlbar-css.patch` (11). They are also the files Firefox changes most. On GitHub's `mozilla-firefox/firefox` main branch since 2026-07-13 (GitHub API, counts include backouts): `Tabbrowser.sys.mjs` 110 commits, `UrlbarInputBase.mjs` more than 100, `SessionStore.sys.mjs` 73, `urlbar.css` 68, `browser-sidebar.js` 47, `drag-and-drop.js` 24, `tabs.js` 15, `tabgroup.mjs` 10, `tabsplitview.mjs` 7.

The 69 build, branding and lint hunks and most of the 40 native hunks stay in every option, so about 110 hunks are a floor no rewrite removes.

## 1. Inventory of what is left

"Every window" means loaded when a browser window opens: `src/browser/base/content/zen-assets.inc.xhtml` links 17 stylesheets and `ZenPreloadedScripts.js` (line 37), which imports the modules listed at `src/zen/common/ZenPreloadedScripts.js:8-19` and loads `ZenDragAndDrop.js` (line 53). The custom elements at lines 27-32 load on first use, but a window with spaces creates `zen-workspace` and `zen-folder` elements at once, so they load at startup too. "Per process" means a `.sys.mjs` module loaded once for the app.

| feature | JS lines | CSS lines | C++ lines | loads in every window | Firefox patches (keyword tagged hunks, changed lines) |
|---|---|---|---|---|---|
| spaces | 5,172 (`ZenSpaceManager.mjs` 3,416, `ZenSpace.mjs` 451, `ZenSpaceIcons.mjs` 269, two swipe files 587, `ZenSpaceCreation.mjs` 449) | 700 (`zen-workspaces.css` with includes) | 58 (`nsZenSwipeOverrides.cpp`) | all but `ZenSpaceCreation.mjs` | 57 hunks, 254 lines, 32 of them in the tab strip. Swipe patches in `widget/SwipeTracker*`, `TouchEvents-h`, `SimpleGestureEvent*` add 12 hunks, 55 lines |
| theme picker | 2,116 (`ZenGradientGenerator.mjs`) plus 218 (`zenThemeModifier.js`) | 457 | 0 | yes, imported by `ZenSpaceManager.mjs` | 6 hunks, 13 lines |
| Essentials | 1,217 (`ZenPinnedTabManager.mjs` 1,147, `ZenEssentialsPromo.mjs` 70) | 50 plus part of `vertical-tabs.css` | 0 | yes | 25 hunks, 243 lines, plus 14 "pinned" hunks, 46 lines |
| folders | 2,642 (`ZenFolders.mjs` 2,337, `ZenFolder.mjs` 305) | 344 | 0 | yes | 9 hunks, 185 lines (101 of them a mis-tagged Windows installer hunk, so about 8 hunks, 84 lines) |
| split view | 2,593 (`ZenViewSplitter.mjs`) | 444 | 0 | yes | 40 hunks, 340 lines, 33 of them in the tab strip |
| compact mode | 1,037 (`ZenCompactMode.mjs`) | 457 | 492 on macOS (`ZenMouseTracker*.{cpp,h,mm}`, new files, not patches) | yes | 10 hunks, 81 lines |
| vertical tab sidebar | most of `ZenUIManager.mjs` (1,846, shared) and `ZenCustomizableUI.sys.mjs` (348, per process) | 1,509 (`zen-tabs.css` with `vertical-tabs.css` 1,243) | 0 | yes | 16 hunks, 53 lines, plus much of the 24-hunk `CustomizableUI-sys-mjs.patch` |
| URL bar and command palette | 2,037 (`urlbar/`, of which `ZenSiteDataPanel.sys.mjs` 770) | 759 (`zen-omnibox.css`) | 0 | providers and the site data panel are imported in `ZenUIManager.mjs:214-221` at window init | URL bar area: 87 hunks, 794 lines |
| keyboard shortcuts | 1,648 (`ZenKeyboardShortcuts.mjs`) | 0 | 0 | yes | 3 hunks, 7 lines |
| session restore | 1,111 (`ZenSessionManager.sys.mjs` 1,060 per process, `ZenSessionStore.mjs` 51) | 0 | 0 | the window part | session area: 59 hunks, 195 lines |
| window sync | 1,734 (`ZenWindowSync.sys.mjs`, per process) | 0 | 0 | per process | 4 hunks, 31 lines |
| drag and drop | 2,102 (`ZenDragAndDrop.js`) | 0 | 313 (`nsZenDragAndDrop*`, `nsZenDropLandingCocoa.mm`, `nsZenNativeWindowMove.mm`) | yes | 21 hunks. `drag-and-drop-js.patch` 26 hunks, 126 lines, `nsDragService-mm.patch` 5 hunks, 106 lines |
| workspace sync | 1,997 (`sync/`) | 0 | 0 | no, registered as a Sync engine in `services/sync/modules/service-sys-mjs.patch` (when it loads is unverified) | 10 hunks, 59 lines in the Sync area |
| shared base | `ZenUIManager.mjs` rest, `ZenCommonUtils.mjs` 159, `ZenMenubar.mjs` 148, `ZenEmojiPicker.mjs` 306, `zen-sets.js` 166, `ZenHasPolyfill.mjs` 100, `ZenUIMigration.sys.mjs` 180, `OriginTabUnloader.sys.mjs` 148 | about 2,600 in `common/styles/` | 0 | yes | the 386 hunks the keyword pass could not tag are mostly this glue |
| window material | 0 | 0 | patch only | native | `nsCocoaWindow-mm.patch` 5 hunks, 117 lines, plus `nsCocoaWindow-h` and, `VibrancyManager-mm` 4 hunks, 9 lines |

Totals that load in every window: 28 JS files with 22,147 lines and about 700 KB of source, plus about 7,500 lines of CSS (6,648 counted through includes and imports, plus `icons.css`). Two big files wait until first use: the emoji table (`ZenEmojisData.min.mjs`, 186 KB, `ZenEmojiPicker.mjs:88-99`) and the vendored motion library (141 KB, `ZenUIManager.mjs:35`). Per process: 9 modules with 4,589 lines, 150 KB.

The spec's rule "load each feature's code when it's first used" (`docs/spec.md:88`) is broken by almost everything above. Split view, folders, the theme picker's 2,116 lines and the shortcut editor all load whether or not they are used. That is a trim-in-place fix: move imports behind lazy getters, as Zen already does for the emoji table.

## 2. What Firefox 157 ships for each feature

Zen locks Firefox's versions off in `prefs/firefox/browser.yaml`: `sidebar.revamp` and `sidebar.verticalTabs` (lines 32-38), `browser.tabs.groups.enabled` (56, not locked), `browser.tabs.splitView.enabled` (86) and `browser.nova.enabled` (116). Firefox 157 ships all of them on except vertical tabs (`browser/app/profile/firefox.js:1173, 2215, 2279, 2290, 2842`).

| feature | Firefox 157 | how far it is from Zen |
|---|---|---|
| split view | `tabsplitview.mjs` (498 lines), `split-view-footer.js`, `addTabSplitView` at `Tabbrowser.sys.mjs:4020`, a splitter styled in `content-area.css:85-117`. Two panes side by side: `reverseTabs` at `tabsplitview.mjs:441-446` swaps exactly two tabs and the selected column is 0 or 1. Session restore keeps it (`Tabbrowser.sys.mjs:5049`). | Zen allows 4 panes (`ZenViewSplitter.mjs:87`) in grid, vertical and horizontal layouts (`calculateLayoutTree`, line 1581), splits by dragging a tab onto the page and shows the split as a group in the sidebar. Firefox has no grid, no stacked layout and no drag-to-split. Measured: Firefox's divider drag costs 2,086 mW (app plus WindowServer) against Zen's 1,169 mW, with content processes at 1,576 against 570 mW (baseline-1, roles). |
| vertical tabs and the sidebar revamp | `sidebar.verticalTabs`, `sidebar-main.mjs` (940 lines), `browser-sidebar.js` (3,046 lines). A launcher column with tool icons, tabs inside it, the nav bar stays on top. | Zen already runs Firefox's vertical tab code paths: `tabs-js.patch` keeps `verticalMode` and `AppWindow-cpp.patch:10` reads `zen.tabs.vertical` for the skeleton UI. What Zen adds is the layout: toolbar, URL bar and space switcher inside the sidebar, the floating page and per-space tab containers (`tabs-js.patch` routes `newTabButton` and the child list through `gZenWorkspaces`). Firefox's revamp brings Nova styling and a tool launcher that Zen does not have. |
| tab groups | `tabgroup.mjs` (806 lines), `tabgroup-menu.js` (1,513), saved and closed groups, colours, collapse. | Zen's folders are already Firefox tab groups: `nsZenFolder extends MozTabbrowserTabGroup` (`ZenFolder.mjs:5`). Zen adds nesting (`zen.folders.max-subfolders`, `ZenFolders.mjs:39`), icons, folders in the pinned area and a collapsed folder that still shows its active tab. Firefox groups are one level and cannot hold pinned tabs. |
| pinned tab grid | `tabs.css:2750-2795`: in expanded vertical mode pinned tabs sit in an auto-fit grid. | Close in look. Essentials differ in behaviour: they stay visible across spaces and can be per container. Zen turns off Firefox's pinned drag logic (`drag-and-drop-js.patch:259`, `&& false`). Firefox has no spaces, so the "across spaces" half has no Firefox counterpart. |
| expand on hover | `sidebar.visibility` = `expand-on-hover` (`firefox.js:2293-2297`), `toggleExpandOnHover` with JS `MousePosTracker` (`browser-sidebar.js:2751-2785`), 400 ms animation after a 200 ms delay (`firefox.js:2282-2283`). | Firefox keeps a column of icons visible and widens it on hover. `hide-sidebar` hides the launcher but has no hover reveal. Zen's compact mode hides the sidebar and optionally the toolbar completely, reveals them at the window edge and tracks the pointer natively (`ZenMouseTrackerCocoa.mm:34-45`). Measured, the sidebar scenario costs the same: Firefox expand-on-hover 47 mW (25 app plus 22 WindowServer), Zen compact mode 47 mW (20 plus 27). |
| URL bar and command palette | Quick actions and global actions (`browser/components/urlbar/ActionsProviderQuickActions.sys.mjs`, `UrlbarProviderGlobalActions.sys.mjs`, `ActionsProviderTabGroups.sys.mjs`), on by default (`firefox.js:493`). | Zen's command palette is its own provider set (`urlbar/ZenUB*.sys.mjs`) and could register through Firefox's provider manager. The floating URL bar look is the bigger part: `UrlbarInputBase-mjs.patch` (34 hunks, 431 lines) and `urlbar-css.patch` (11 hunks, 193 lines). Firefox has no floating mode. |
| keyboard shortcuts | `browser/components/customkeys/` (CustomKeys.sys.mjs and an about:keyboard page) lets users rebind keys. | Zen's 1,648-line editor stores its own shortcut file and handles Zen's commands. Firefox's could rebind Zen commands if they are plain `<key>` elements (unverified). |
| session restore | Restores tab groups, split views and pinned tabs. | Zen keeps spaces, Essentials and folders in its own `zen-sessions.jsonlz4` with dated backups (`ZenSessionManager.sys.mjs:46, 684`) and patches `SessionStore` in 39 hunks. |
| window sync | none | Firefox windows are independent. |
| drag and drop | `drag-and-drop.js` (2,961 lines) handles groups, splits and pinned tabs. | Zen subclasses it for spaces, Essentials, folders and drag-to-split, plus a native drop landing on macOS. |
| workspace sync | Firefox Sync's tabs engine lists other devices' tabs, read only. | No Firefox counterpart for spaces, folders and pinned tabs. |
| theme picker | Lightweight themes and the Nova theme picker (`firefox.js:83-85`). | No per-space gradient. |

Firefox ships nothing for spaces, Essentials across spaces, window sync, workspace sync or the gradient picker. Those are about 13,700 of the 36,691 lines (with Essentials) and they drive most of the tab strip hunks.

## 3. Cost of rebuilding each feature on Firefox's version

Effort is in agent days with an agent like the ones on this project, for Zen parity unless the row says otherwise. All effort figures are guesses (unverified). "Removes" is what leaves the weekly rebase.

| feature | effort | risk | removes from the rebase |
|---|---|---|---|
| split view on Firefox's | 3 days for two panes with Zen styling. 10 days or more for Zen's four panes and layouts, which means new patches to `tabsplitview.mjs` and `showSplitViewPanels` (`Tabbrowser.sys.mjs:4090`). | High. Firefox's divider drag drew 1.8 times Zen's power in baseline-1. Zen profiles store splits as `tab-group[split-view-group]` (`ZenFolders.mjs:1182`), so a migration is needed. | 2,593 JS and 444 CSS lines, about 33 tab strip hunks (302 lines) and 3 `tabgroup` hunks. Four panes would add some back. |
| sidebar on Firefox's revamp | 8 to 12 days to put toolbar, URL bar and spaces inside Firefox's launcher and restyle Nova to match. | High. CSS over `sidebar-main` and `browser-sidebar.js`, which got 47 upstream commits in 3 months, breaks silently instead of failing as a patch conflict. | Part of `vertical-tabs.css` (1,243), `ZenCustomizableUI.sys.mjs` (348) and maybe 20 of the 24 `CustomizableUI` hunks (unverified). |
| folders as plain tab groups | 2 days, but nesting, icons and pinned folders go, which the spec keeps. With Zen's behaviour kept, nothing changes, because folders already are tab groups. | Low for the lossy version, none otherwise. | Lossy version: 2,986 lines and about 8 hunks. |
| Essentials on Firefox's pinned grid | 3 to 5 days, and only after spaces exist in some form. | Medium. Profiles mark Essentials with Zen attributes in session data. | About 19 tab strip and 5 session hunks, part of `ZenPinnedTabManager.mjs`. |
| compact mode on expand-on-hover | 1 day to switch to Firefox's behaviour (icons stay visible). 5 to 7 days for Zen's full hide on Firefox's tracker. | Medium. The behaviour changes and the energy stays the same (47 against 47 mW). | About 10 hunks. The 492 lines of native tracker are new files, so they cost the rebase almost nothing today. |
| spaces | 15 to 25 days to rewrite, for example on `gBrowser.hideTab` instead of per-space tab containers. | High. Hidden tabs interact with the extension `tabs.hide` API, Ctrl+Tab and session restore (unverified details). | Most of the 32 tab strip hunks tagged to spaces and much of the untagged glue in `Tabbrowser-sys-mjs.patch`, maybe 60 hunks in all (unverified). |
| URL bar and command palette | 4 to 6 days: register the palette through Firefox's provider API and keep the floating bar as a smaller patch. | Medium. | Maybe 40 of the 87 URL bar hunks (unverified). This is the area with the most upstream churn. |
| shortcuts on `customkeys` | 2 to 3 days. | Medium. Users' Zen shortcut files must migrate. | About 6 hunks and 1,648 lines. Code goes, the rebase barely changes. |
| session restore on Firefox's custom values | 6 to 10 days, storing spaces through SessionStore's per-window and per-tab custom values (fit unverified). | High. Data loss, and `docs/spec.md:190` requires a copied Zen profile to open intact. | Up to 50 of the 59 session hunks (unverified). |
| window sync | No Firefox base. Keep, or 3 to 5 days to port. | Medium. | 4 hunks. |
| drag and drop on Firefox's | 5 to 8 days, and only together with spaces, Essentials and folders. | Medium. | 26 `drag-and-drop-js` hunks, maybe the `nsDragService-mm` patch. |
| workspace sync | No Firefox base. Keep, 2 to 4 days to port. | Low. | 1 hunk in Sync's service plus settings hunks. |
| theme picker | No Firefox base. Keep, 2 to 3 days to port. | Low. | 6 hunks. |

Summed, a Zen-parity layer on Firefox's features (option 3) is about 60 to 100 agent days, and a from-scratch rewrite of the same features (option 2) is in the same range, because Firefox's versions cover only split view, groups and the pinned grid well. Both would leave about 110 floor hunks plus the patches spaces, the URL bar and Essentials still need: a guess of 250 to 350 hunks against today's 666 (unverified).

Two facts weigh against the hunk count. First, Zen ports its 188 patches to each Firefox release within about two days. Zen's commit `bfae69f` (2026-10-11, "Update to Firefox 158.0") changed 23 patch files and rewrote `tabs-js.patch` as `tabs-mjs.patch` because Firefox renamed the file. Under option 1 Origin takes that work for free and only resolves conflicts between its own edits and Zen's commits. Origin's own diff against `upstream` is 93 modified files and 314 deleted ones (`git diff --diff-filter=M|D upstream -- src prefs`). Under options 2 and 3 Origin carries every Firefox release alone, every two weeks.

Second, the same Zen commit refactored the UI layer at the same time: `ZenUIManager.mjs` changed by 1,860 lines and was split into `ZenVerticalTabsManager.mjs`, `ZenUrlbarController.mjs` and `ZenToasts.mjs`. Origin has edited `ZenUIManager.mjs`, so the next rebase onto Zen's Firefox 158 release will conflict there. That is the real cost of option 1: Zen's own churn, 40 commits on `ZenSpaceManager.mjs` alone since 2026-07-13.

For scale, Natsumi, which puts a Zen-like look on stock Firefox with CSS and chrome JS, is 730 KB of JS and 735 KB of CSS (GitHub languages API, 2026-10-13). Origin's remaining Zen layer is 933 KB of JS and 206 KB of CSS. A thin layer does not come out much smaller. I did not compare Natsumi's features with Zen's (unverified).

## 4. What a rewrite could save

The parent process is where Zen's UI JS runs. Its power in baseline-1 (median of 3, `roles_mw` in `docs/perf/2026-10-13-baseline.json`):

| scenario | Zen parent mW | Firefox parent mW | Zen GPU process mW | Firefox GPU process mW | WindowServer GPU ms/s, Zen against Firefox |
|---|---|---|---|---|---|
| launch (20 s) | 403 | 480 | 63 | 62 | n/a |
| idle | 0.0 | 0.0 | 0.0 | 0.0 | 0.2 against 0.2 |
| switch tabs | 24.1 | 25.1 | 58.1 | 48.5 | 11.3 against 4.7 |
| sidebar | 10.5 | 13.4 | 8.3 | 10.3 | 7.5 against 8.2 |
| split | 204 | 115 | 239 | 322 | 26.1 against 10.6 |
| scroll | 8.9 | 7.6 | 13.9 | 13.6 | 33.5 against 21.6 |
| video windowed | 2.6 | 2.4 | 4.3 | 4.1 | 22.1 against 7.6 |
| typing | 4.0 | 28.3 | 2.6 | 2.8 | 7.1 against 3.3 |

Energy: Zen's parent process uses no more power than Firefox's in any scenario except split view, where Zen's whole browser still uses half of Firefox's. Idle, minimized, the background timer and fullscreen video already sit at the no-browser floor (machine 102 to 117 mW against 108 mW with no browser). A rewrite cannot lower a floor it is already on. Zen's extra 90 to 160 mW when content moves is WindowServer's GPU work and some GPU process work, which comes from what the chrome draws (window material, gradients, shadows, rounded page), not from how its JS is organised. Prefs and CSS reach that, and the effects batch (`scripts/perf/variants.json`, `min-visual` and the single effects) measures how much. A rewrite that keeps Zen's look keeps that cost, and one that drops the look gets the same saving the prefs give.

The one place where code shape might matter is tab switching: Zen's content processes use 31.7 against Firefox's 20.8 mW and the GPU process 58 against 49. Neither is the parent, so Zen's switch handlers are not the cause. Why is unverified.

Memory: Zen's parent process is 253 MB against Firefox's 307 MB at idle (median of 3, zen-official against firefox). Zen's UI layer already costs less than Firefox's own UI with Nova, the sidebar revamp and its new tab machinery. The GPU process is the bigger Zen extra: 195 against 171 MB, which follows the drawn layers, not the JS. The most a rewrite could take from the parent is the heap of Zen's own chrome JS. With 700 KB of source loaded per window, that is perhaps 5 to 20 MB (unverified guess), 0.4 to 1.7% of the 1,159 MB total. Stock Zen built here without LTO and PGO has a 290 MB parent, so build options move the parent more than any UI rewrite would.

Launch: Zen's first paint is 1,131 ms against Firefox's 1,142 ms and its launch energy 16.8 against 18.1 J. Loading 22,000 lines of chrome JS per window does not show in first paint today. Making it lazy is still worth doing for new windows and memory, and that is a trim.

What a rewrite would save is rebase surface and code to read: perhaps 300 to 400 of 666 hunks and 15,000 to 25,000 lines (unverified). It would not save energy at idle, minimized, with a background timer or in fullscreen video, and it would not save the WindowServer cost unless the look changes, which prefs already allow.

## 5. Recommendation

Trim in place (option 1). Do not start option 2 or 3. Swap in a Firefox version only where the swap keeps Zen's behaviour and deletes a high-churn patch, and measure first.

1. Keep Zen's split view. Firefox's has two panes only and drew 1.8 times the power while dragging the divider.
2. Keep compact mode. Firefox's expand-on-hover costs the same energy and behaves differently.
3. Keep spaces, Essentials, folders, window sync, workspace sync and the theme picker. Firefox has nothing for spaces, and folders already reuse Firefox's tab groups.
4. Make the per-window imports lazy: split view, folders, the gradient generator, the shortcut editor and the site data panel load at window open today.
5. Candidates for later Firefox swaps, each one small: the command palette through Firefox's provider API, shortcuts through `customkeys`. Both touch little rebase surface, so they wait until the rebase cost is measured.

The energy work goes into the effects (WindowServer GPU), with prefs and CSS, measured by the effects batch. The spec's prototype of options 2 and 3 (`docs/spec.md:160`) can be replaced by experiment 2 below, which measures the floor a thin layer on Firefox could reach without building one. If that floor is no better than Origin with `min-visual`, a prototype cannot win on energy.

## Experiments that would confirm it

Each runs with `scripts/perf/` after the fixture server is up (`scripts/detach serve scripts/perf/serve`), through `scripts/perf/hold` while any build runs, and is reported with `scripts/perf/report` and `scripts/perf/compare`.

1. Effects close the gap. The effects batch (`effects-1`, queued in `scripts/perf/m1-batches`) runs `min-visual` and each single effect against stock Zen. The recommendation holds if `min-visual` brings scroll and windowed video within noise of Firefox (WindowServer GPU near 21.6 and 7.6 ms/s). Then run Origin with it: `scripts/perf/run --batch rewrite-1 --browsers origin --variant min-visual --scenarios switch,scroll,video-windowed,sidebar,split --runs 3`.
2. The thin-layer floor. Firefox with its own vertical tabs, expand-on-hover and split view is the best case for option 3. The `sidebar` scenario already uses Firefox's `vertical` template. The other scenarios need either a variant in `scripts/perf/variants.json` with `sidebar.verticalTabs` true and `sidebar.visibility` set to `expand-on-hover`, or a `--template` option in `run` (whether prefs alone give the same layout as the template is unverified). Run `scripts/perf/run --batch rewrite-2 --browsers firefox --variant <that variant> --scenarios idle,switch,scroll,video-windowed,typing,bgtimer --runs 3` and compare it with experiment 1. The recommendation holds if Origin with `min-visual` is within noise or better.
3. How much of the parent is Zen's JS. `scripts/perf/run --batch rewrite-3 --browsers origin,firefox --scenarios switch,split --runs 1 --profiler`, then read the share of parent main-thread samples in `zen-components/` and `modules/zen/` files in the Firefox Profiler. `report` gives RefreshDriverTick counts, but the per-file share has to be read in the profiler by hand. The recommendation holds if Zen's files take under 10% of parent CPU in tab switching, which bounds a rewrite's saving at about 2.5 mW.
4. What deleting code saved in memory. Today's cuts deleted 29,244 lines of JS and CSS. Compare the parent footprint per role at idle: `scripts/perf/run --batch rewrite-4 --browsers origin,zen-stock --scenarios idle --runs 3` (zen-stock has the same build options). If 44% fewer lines saved under 10 MB, a full rewrite cannot save more than about 20 MB.
5. Split view on Origin against Firefox. `scripts/perf/run --batch rewrite-5 --browsers origin,firefox --scenarios split --runs 3`, once the Origin split template exists. This confirms that keeping Zen's split view is right on Origin's build too.

One more check sits outside the harness: replay Origin's commits onto Zen's Firefox 158 commit (`bfae69f`) or the next Zen tag, and count conflicting files and the hours to fix them. That gives option 1's real weekly cost, which is the only number that could still change this recommendation.
