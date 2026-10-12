# Zen feature inventory (Zen 1.23.2b on Firefox 157.0.1), 2026-10-12

Source tree: /Users/mrm/Zen-Origin at commit bd9a10a. Firefox source in /Users/mrm/Zen-Origin/engine (unpacked, Zen patches not applied). All paths are relative to the repo root unless they start with engine/. Line numbers inside a `.patch` file are lines of the patch file itself, not of the Firefox file. "Unverified" marks a guess or an inference I did not confirm by reading the code path.

How to read the status column: keep, cut, or unlisted (not named by the user, so cut unless a kept feature needs it). Where an unlisted item is needed by a kept feature, the table says so.

## 1. Summary table

Line counts come from `wc -l` over the files in each row, excluding images, fonts, vendored libraries and tests. "C++" means .cpp, .h, .mm and .idl. Markup/build means .xhtml, .inc, jar.inc.mn, moz.build, components.conf and similar. Numbers are for src/zen plus the loose Zen files named in the "main paths" column. Zen's patches to Firefox files are counted separately in section 4.

"Loads" values:

- every window means imported by `src/zen/common/ZenPreloadedScripts.js` (loaded by browser.xhtml in every browser window).
- lazy means imported on first use through a lazy getter or `moz-src:` import.
- pref means gated by a pref.
- app startup means registered through `src/zen/ZenComponents.manifest` category entries.

### Features the user named

| Feature | Main paths | JS/MJS | CSS | C++ | Loads | Status |
|---|---|---|---|---|---|---|
| Boosts | src/zen/boosts, 12 Gecko patches, 39 color-plumbing patches | 5262 | 1282 | 726 (+278 gtest) | actor pref (zen.boosts.enabled, not in safe mode); C++ color hook always in content; ZenBoostsManager lazy | cut |
| Glance | src/zen/glance, glance code inside Tabbrowser and tabbox patches | 2343 | 207 | 0 | every window (ZenGlanceManager); actor pref (zen.glance.enabled) | cut |
| Zen Mods and theme store | src/zen/mods, src/browser/components/preferences/zenMarketplace.inc.xhtml, gZenMarketplaceManager in zen-settings.js (lines 18-650, about 633 JS lines, not in the count) | 997 | 0 | 280 | every window (ZenMods); actor on zen-browser.app and about:preferences | cut |
| Live folders | src/zen/live-folders, docs/live-folders-specs.md | 2036 | 0 | 0 | every window (ZenLiveFoldersUI); app startup (ZenLiveFoldersManager) | cut |
| Space routing | src/zen/space-routing, src/zen/common/sys/ui/ZenSpaceRoutingNavigation.sys.mjs | 1298 | 289 | 0 | every window (top of ZenPreloadedScripts.js); app startup category; per-window navigation listener | cut |
| Library | src/zen/library, src/zen/common/styles/zen-library-widget.css, zen-library-media-preview.css | 6579 | 1715 | 0 | lazy (moz-src); toolbar widget registered at startup; CSS for the widget is %included into zen-single-components.css | cut |
| Share (cloud share of spaces, folders, split views) | src/zen/share | 1077 | 259 | 0 | every window (ZenShareManager) | cut |
| Sidebar media controls | src/zen/media, 5 Gecko MediaController patches | 802 | 430 | 0 | every window; init called from ZenUIManager.init; pref zen.mediacontrols.enabled | cut |
| Welcome flow and video | src/zen/welcome (15.4 MB mp4) | 891 | 464 | 0 | script loaded only on first run; CSS and video packaged in every build | cut |
| Workspaces core (spaces, swipe, creation, icons, bookmarks storage) | src/zen/spaces (without the gradient generator) | 5610 | 700 | 58 | every window; elements `zen-workspace*` created lazily | keep |
| Workspace colors and gradients (theme picker) | src/zen/spaces/ZenGradientGenerator.mjs, zen-gradient-generator.css, src/zen/common/zenThemeModifier.js, src/browser/base/content/zen-panels/theme-picker.inc (162 lines) | 2341 | 457 | 0 | ZenGradientGenerator imported with ZenSpaceManager; zenThemeModifier.js loaded by browser-init-js.patch | keep |
| Essentials and pinned tabs | src/zen/tabs/ZenPinnedTabManager.mjs | 1192 | 0 | 0 | every window | keep |
| Vertical tab sidebar | src/zen/tabs/zen-tabs/*, zen-tabs.css, common/styles/zen-sidebar.css, gZenVerticalTabsManager inside ZenUIManager.mjs lines 970-1850 (881 JS lines, counted under core shell) | 0 | 1595 | 0 | every window | keep |
| Folders | src/zen/folders | 2704 | 357 | 0 | every window; `zen-folder` element lazy | keep |
| Split view | src/zen/split-view | 2659 | 452 | 0 | every window | keep |
| Compact mode | src/zen/compact-mode | 1063 | 442 | 543 | every window; init after session restore; mouse tracker is an XPCOM service | keep |
| URL bar and command palette | src/zen/urlbar (without ZenSiteDataPanel), common/styles/zen-omnibox.css, 14 urlbar patches | 1330 | 759 | 0 | providers registered with the urlbar; modules lazy | keep |
| Keyboard shortcuts | src/zen/kbs, zen-keysets.inc.xhtml, zen-commands.inc.xhtml | 1672 | 0 | 0 | every window | keep |
| Session restore for workspaces | src/zen/sessionstore/ZenSessionManager.sys.mjs, src/zen/common/modules/ZenSessionStore.mjs, 8 sessionstore patches | 1117 | 0 | 0 | ZenSessionManager imported from SessionStore patch; ZenSessionStore every window | keep |
| Workspace sync over Firefox Sync | src/zen/sync (4 files) | 2021 | 0 | 0 | lazy: Sync service loads the "Spaces" engine (services/sync/modules/service-sys-mjs.patch) | keep (it is the workspace sync) |

### Unlisted features

| Feature | Main paths | JS/MJS | CSS | C++ | Loads | Status |
|---|---|---|---|---|---|---|
| Window sync (keeps workspaces and essentials identical across windows) | src/zen/sessionstore/ZenWindowSync.sys.mjs | 1773 | 0 | 0 | app startup category | unlisted, but kept features call it directly |
| Tab drag and drop (folders, essentials, split) | src/zen/drag-and-drop, drag-and-drop-js.patch | 2157 | 0 | 370 | every window (loadSubScript) | unlisted, but kept features need it |
| URL bar site data panel | src/zen/urlbar/ZenSiteDataPanel.sys.mjs, zen-panels/site-data.inc | 1026 | in zen-single-components.css | 0 | lazy | unlisted, part of the URL bar; contains Boosts and Share UI |
| Window drag from page content | src/zen/window-drag | 364 | 0 | 151 | actor, pref zen.view.drag-window-from-content | unlisted |
| Download animation | src/zen/downloads | 547 | 73 | 0 | every window | unlisted |
| Emoji picker | src/zen/common/emojis | 306 | 0 | 0 | every window | unlisted, used by workspace, folder and pinned-tab icons |
| Update notice and sidebar notification | ZenUpdates.mjs, ZenSidebarNotification.mjs | 293 | 136 | 0 | imported by ZenStartup | unlisted |
| Essentials promo | src/zen/tabs/ZenEssentialsPromo.mjs | 70 | 50 | 0 | referenced by ZenDragAndDrop.js | unlisted |
| Menubar integration | src/zen/common/modules/ZenMenubar.mjs | 148 | 0 | 0 | ZenUIManager | unlisted |
| UI migration | src/zen/common/sys/ZenUIMigration.sys.mjs | 221 | 0 | 0 | BrowserGlue patch | unlisted |
| Loading progress bar | src/zen/common/sys/ui/ZenProgressBar.sys.mjs, ZenUIComponent.sys.mjs | 199 | 0 | 0 | ZenStartup | unlisted |
| Common utils, native share sheet, haptics | ZenCommonUtils.mjs, src/zen/toolkit/common | 180 | 0 | 407 | XPCOM service `Services.zen` | unlisted (not the Share feature, see section 2) |
| Workspace bookmarks (bookmarks owned by a workspace) | src/zen/spaces/ZenSpaceBookmarksStorage.js, 6 places patches | 218 (inside Workspaces core) | 0 | 0 | every window | unlisted, used by ZenSpaceManager.mjs:777 |
| Core shell (ZenUIManager, ZenStartup, zen-sets, actor manager, CustomizableUI hooks, shared CSS) | src/zen/common, src/zen/images, src/zen/fonts | 3231 | 4139 | 0 | every window | needed by everything |
| macOS vibrancy and window material, Windows Mica, GTK transparency | prefs/zen/macos.yaml, windows.yaml, gtk.yaml, widget/cocoa patches | 0 | 0 | about 360 patch lines | startup | unlisted |
| Branding, installer, update host, packaging | configs/, build/, src/browser/installer, surfer.json | n/a | n/a | n/a | build time | unlisted |
| Firefox debloat prefs (Betterfox derived) | prefs/fastfox, prefs/privatefox | n/a | n/a | n/a | startup | unlisted |
| Nine external Firefox patches | src/external-patches | n/a | n/a | about 2200 patch lines | build time | unlisted |

Totals for the nine cut features in src/zen: about 21,285 JS lines, 4,646 CSS lines and 1,006 C++ lines, plus 278 gtest lines. These exclude the Marketplace pane code in zen-settings.js and the Gecko patches.

### Vendored and generated files (listed separately, not in the counts above)

- src/zen/vendor/motion.min.mjs, 140,697 bytes, 4 lines, Motion v13.2.0 (src/zen/vendor/motion.dep). Used by ZenUIManager (kept).
- src/zen/common/emojis/ZenEmojisData.min.mjs, 185,912 bytes, 5 lines, generated by src/zen/common/emojis/fetch_emojis.py.
- src/zen/@types/lib.gecko.*.d.ts, 79,228 lines of generated Gecko typings. src/zen/@types/zen.d.ts (476 lines) and index.d.ts (42 lines) are hand written.
- src/zen/tests/mochitests, 664 files and 88,108 lines. These look like copies of Firefox tests (alerts, backforward, caps, gesture, linkHandling, readermode, safebrowsing, sessionstore, shell, sync, tabMediaIndicator, tooltiptext, zoom, remote-settings, services-crypto). Origin unverified. scripts/import_external_tests.py exists.
- src/browser/themes/shared/zen-icons/nucleo (155 svg, 620 KB), common/selectable (88 svg, Ionicons, MIT, per CREDITS.md in that folder), common/library (8 svg).
- src/zen/fonts/JunicodeVF-Roman.woff2 and JunicodeVF-Italic.woff2 (22 KB together). Licence unverified.
- tools/virustotal-checker/src/json.hpp (nlohmann json), outside src/.

## 2. Features one by one

### 2.0 How Zen code gets into the browser

- src/browser/base/moz-build.patch:10 adds `DIRS += ["../../zen"]`, which builds src/zen/moz.build (lines 10-26 list the subdirectories).
- src/browser/base/jar-mn.patch:10 includes src/browser/base/content/zen-assets.jar.inc.mn, which includes every `src/zen/*/jar.inc.mn` (lines 5-25 there). The cut features are at line 9 (mods), 13 (glance), 15 (welcome), 16 (media), 21 (boosts), 22 (live-folders), 23 (space-routing), 24 (share) and 25 (library).
- src/browser/themes/shared/jar-inc-mn.patch:10 includes zen-sources.inc.mn, which packs zen-icons and zen-preferences.css.
- src/browser/base/content/browser-xhtml.patch:17 includes zen-preloaded.inc.xhtml (zen-sets.js, ZenHasPolyfill) before global-scripts, and :20 includes zen-assets.inc.xhtml (21 stylesheets and ZenPreloadedScripts.js) after browser-main.js.
- src/zen/common/ZenPreloadedScripts.js:15-32 is the list of modules imported into every browser window: ZenStartup, ZenSpaceManager, ZenCompactMode, ZenUIManager, ZenMods, ZenKeyboardShortcuts, ZenSessionStore, ZenMediaController, ZenGlanceManager, ZenPinnedTabManager, ZenViewSplitter, ZenFolders, ZenEmojiPicker, ZenLiveFoldersUI, ZenDownloadAnimation, ZenShareManager. Lines 8-13 also import gZenSpaceRoutingManager and ZenSpaceBookmarksStorage.js. Line 63 loads ZenDragAndDrop.js. Lines 38-61 register lazy custom elements zen-folder, zen-workspace-creation, zen-workspace, zen-workspace-icons.
- src/zen/ZenComponents.manifest:16-19 includes the component manifests of common, sessionstore, live-folders and space-routing. These register app-startup categories (window sync at browser-before-ui-startup, live folders and space routing at browser-window-delayed-startup, the actor manager at browser-before-ui-startup via src/zen/common/Components.manifest:5).
- JS window actors are registered in one file, src/zen/common/sys/ZenActorsManager.sys.mjs: ZenModsMarketplace (line 22), ZenGlance (line 38), ZenWindowDrag (line 61), ZenBoosts (line 81, only outside safe mode).
- Markup includes inside browser.xhtml: src/browser/base/content/browser-box-inc-xhtml.patch (navigator-toolbox moved into #browser, `<html:zen-library>` at line 10, wrappers `zen-main-app-wrapper`, `zen-appcontent-wrapper`), navigator-toolbox-inc-xhtml.patch (media controls include at line 45, `zen-essentials`, `zen-tabs-wrapper`, sidebar icons), zen-tabbrowser-elements.inc.xhtml (lines 7-8 include the split-view overlay and the glance container), main-popupset-inc-xhtml.patch:28 (zen-popupset.inc.xhtml, which includes theme-picker.inc, emojis-picker.inc, folders-search.inc, site-data.inc, popups.inc), browser-sets-inc-xhtml.patch (zen-keysets), zen-commands.inc.xhtml, zen-locales.inc.xhtml.
- Static prefs: src/modules/libpref/init/StaticPrefList-yaml.patch includes `zen-static-prefs.inc` and src/modules/libpref/moz-build.patch adds "zen". The `ffprefs` tool (package.json script) compiles prefs/*.yaml into it.

### 2.1 Boosts (cut)

Per-site color and CSS tweaks, plus a "zap" tool that removes page elements.

Files
- src/zen/boosts/ (22 files): ZenBoostsEditor.mjs, ZenBoostsManager.sys.mjs, ZenBoostStyles.sys.mjs, ZenSelectorComponent.sys.mjs, ZenZapDissolve.sys.mjs, ZenZapOverlayChild.sys.mjs, actors/ZenBoostsChild.sys.mjs, actors/ZenBoostsParent.sys.mjs, nsZenBoostsBackend.cpp/.h, nsZenBCOverrides.cpp, zen-boosts.css, zen-zap.css, zen-selector.css, zen-advanced-color-options.css, zen-boost-editor.inc.xhtml, zen-boost-editor.js, jar.inc.mn, moz.build, gtest/ (3 test files).
- src/zen/library/sections/ZenLibraryBoostsSection.mjs (282 lines, counted under Library).
- Boost UI inside kept files: src/zen/urlbar/ZenSiteDataPanel.sys.mjs lines 16, 53, 90-142, 236-370, 450, 770-774; src/browser/base/content/zen-panels/site-data.inc:84-102; src/zen/common/styles/zen-single-components.css:409-523 and 646; src/zen/common/styles/zen-popup.css:207; src/zen/urlbar/ZenUBGlobalActions.sys.mjs:147-187.
- Gecko patches (see section 4).

Loading
- Actor ZenBoosts: src/zen/common/sys/ZenActorsManager.sys.mjs:80-94, `enablePreference: "zen.boosts.enabled"`, skipped in safe mode, runs in every web or file frame on DOMDocElementInserted.
- C++: `nsZenBoostsBackend::ResolveStyleColor` is called from `StyleAbsoluteColor::ToColor` (src/layout/style/StyleColor-cpp.patch:61), PresShell, Theme and animations. It exits early when the color is transparent or in the parent process (src/zen/boosts/nsZenBoostsBackend.cpp:520-530), so it adds a branch to every color resolution.
- Editor window: zen-boost-editor.xhtml, opened by `gZenBoostsManager.openBoostWindow`.
- Manager: lazy getter in ZenSiteDataPanel.sys.mjs:16 and import in ZenUBGlobalActions.sys.mjs:179.

Prefs: prefs/zen/boosts.yaml:5 (enabled), :8 (dissolve-on-zap), :11 (invert-channel-floor, static), :17 (disable-on-anonymous-content, static). icons.css:960 also reads zen.boosts.enabled in a `-moz-pref` media query.

Strings: locales/en-US/browser/browser/zen-boosts.ftl (58 lines, 35 ids, prefixes zen-boost-, zen-zap-, zen-select-, zen-unzap-). Loaded by src/browser/base/content/zen-locales.inc.xhtml:12. The site data panel ids `zen-site-data-boosts` and `zen-site-data-create-boost` live in zen-general.ftl. 42 other locales carry their own zen-boosts.ftl.

Icons and images: src/zen/images/boost-indicator.svg (packed at zen/boosts/jar.inc.mn), icons.css:44, 134, 434, 526-568 (indicator animation), 954, 973, 1043-1115 (boost.svg, bolt.svg, sliders.svg, lightbulb.svg, eyedropper.svg and others).

Settings UI: none in about:preferences. The boost editor is its own window and the Library has a Boosts section.

Tests: src/zen/tests/boosts (22 files, 1359 lines), src/zen/boosts/gtest (3 files, 267 lines).

Network: none found in src/zen/boosts.

Depends on
- Gecko: BrowsingContext fields ZenBoostsData, ZenBoostsComplementaryRotation, IsZenBoostsInverted (src/docshell/base/BrowsingContext-h.patch:9-11, src/dom/chrome-webidl/BrowsingContext-webidl.patch:9-11).
- gZenWorkspaces, gZenUIManager and gZenThemePicker (one call each, from `grep` over src/zen/boosts).

Depended on by
- src/zen/urlbar/ZenSiteDataPanel.sys.mjs (URL bar, kept) imports `gZenBoostsManager` at module top (line 16) and listens to the `zen-boosts-update` notification (lines 103, 122).
- src/zen/urlbar/ZenUBGlobalActions.sys.mjs:147-187 defines the "new boost" command palette action.
- src/zen/library/ZenLibrary.mjs:25-28 and :100 register the Boosts library section.
- src/zen/common/sys/ZenActorsManager.sys.mjs:80-94.
- src/zen/downloads/ZenDownloadAnimation.mjs and ZenBoostsManager.sys.mjs:809 share a helper comment only; no code dependency (ZenBoostsManager.sys.mjs:803-810 re-implements `#areTabsOnRightSide`).
- The color-plumbing patches in section 4 (39 files) change function signatures across layout, gfx, widget, dom, accessible and editor so a frame reaches the boost hook.

### 2.2 Glance (cut)

Preview a link in an overlay on top of the current tab, expand it into a tab or send it to split view.

Files
- src/zen/glance/ZenGlanceManager.mjs (2113 lines), zen-glance.css, zen-glance.inc.xhtml (11 lines), actors/ZenGlanceChild.sys.mjs, actors/ZenGlanceParent.sys.mjs, moz.build, jar.inc.mn, tests/GlanceTestUtils.sys.mjs.
- Glance code in Firefox patches: Tabbrowser-sys-mjs.patch, tab-js.patch:166-167, tabs-js.patch:122-127, tabbox-js.patch, browserPlacesViews-js.patch, BrowserDOMWindow-sys-mjs.patch, SearchUIUtils-sys-mjs.patch, nsContextMenu-sys-mjs.patch, TabState-sys-mjs.patch, SessionStore-sys-mjs.patch.

Loading
- Every window: ZenPreloadedScripts.js:24.
- Actor: ZenActorsManager.sys.mjs:38-60, enablePreference zen.glance.enabled, all frames, captures mousedown, keydown and click.
- CSS: zen-assets.inc.xhtml:22. Markup: zen-tabbrowser-elements.inc.xhtml:8.

Prefs: prefs/zen/glance.yaml:5, 8, 11, 14, 17, 20. Synced prefs: prefs/zen/sync.yaml:53 and :56.

Strings: no glance file. Ids are spread in zen-general.ftl (zen-open-link-in-glance) and zen-preferences.ftl (10 ids with prefix zen-glance-).

Icons: icons.css:45, 286, 462 (close.svg, fullscreen.svg, split.svg for `.zen-glance-sidebar-*`).

Settings UI: about:preferences pane paneZenLooks, group zenGlanceGroup, src/browser/components/preferences/zenLooksAndFeel.inc.xhtml:75-102. zen-settings.js:742 adds a restart-prompt observer on zen.glance.enabled.

Tests: src/zen/tests/glance (10 files, 411 lines).

Network: none.

Depends on: gZenUIManager (15 uses), gZenViewSplitter (5), gZenVerticalTabsManager (3), gZenWorkspaces (1), ZenCommonUtils.

Depended on by (all in kept features)
- Tabbrowser-sys-mjs.patch calls `gZenGlanceManager.getTabOrGlanceParent` without a guard at patch lines 136, 162, 643, 688, 1021, 1059 and `manageTabClose` at 756. Patch lines 50-96 also filter `zen-glance-tab` out of tab counts and add a `tabsWithoutGlance` getter (line 95).
- src/zen/spaces/ZenSpaceManager.mjs:976, 1154-1158, 1759-1762, 2433-2446, 2499, 2976, 3019-3039, 3174, 3322-3331, 3459.
- src/zen/split-view/ZenViewSplitter.mjs:177, 1249, 1280-1289, 1340-1354, 1442, 2206, 2526-2530 (disables `cmd_zenGlanceSplit`) and zen-split-view.css:81-85.
- src/zen/folders/ZenFolders.mjs:401, src/zen/tabs/ZenPinnedTabManager.mjs:382-402 (waits up to 3 s for a GlanceClose event), src/zen/compact-mode/ZenCompactMode.mjs:252 and :1022 (`_animating`), src/zen/common/zen-sets.js:154 and :204, src/zen/kbs/ZenKeyboardShortcuts.mjs:1145-1153, src/zen/drag-and-drop/ZenDragAndDrop.js:915, src/zen/sessionstore/ZenWindowSync.sys.mjs:610, src/zen/sync/ZenSpacesSyncModel.sys.mjs:303, src/zen/common/modules/ZenUIManager.mjs:1059-1077, src/zen/common/styles/zen-browser-container.css:11, src/zen/tabs/zen-tabs/vertical-tabs.css:350 and :402-452.
- tabbox-js.patch lines 34, 51, 60, 68, 73 (uses `window.gZenGlanceManager?.` with guards at 34, 51, 68 but an unguarded `gZenGlanceManager.getFocusedTab` at 73).
- Session state fields zenIsGlance and zenGlanceId in TabState-sys-mjs.patch:26-27 and SessionStore-sys-mjs.patch:213-214.

### 2.3 Zen Mods and theme store (cut)

Install CSS "mods" from the Zen store and apply them to the browser chrome.

Files
- src/zen/mods/ZenMods.mjs (769 lines), actors/ZenModsMarketplaceChild.sys.mjs, actors/ZenModsMarketplaceParent.sys.mjs, nsIZenModsBackend.idl, nsZenModsBackend.cpp/.h, ZenStyleSheetCache.cpp/.h, components.conf, moz.build, jar.inc.mn.
- src/browser/components/preferences/zenMarketplace.inc.xhtml (42 lines), zen-settings.js:18-650 (gZenMarketplaceManager), zen-preferences.css (25 matches for mods, lines 284 onward).
- src/dom/base/Document-cpp.patch, src/layout/style/nsStyleSheetService-h.patch.

Loading
- Every window: ZenPreloadedScripts.js:20. `ZenMods extends nsZenPreloadedFeature` (ZenMods.mjs:19), a base class defined in src/zen/common/modules/ZenCommonUtils.mjs.
- Document-cpp.patch appends the mods stylesheet to every chrome document ("The mods sheet is only used in the chrome docshell").
- Actor ZenModsMarketplace: ZenActorsManager.sys.mjs:22-36, matches `zen.injections.match-urls` plus about:preferences.
- Profile file: zen-themes.json (ZenMods.mjs:421).

Prefs: prefs/zen/mods.yaml:5, 8, 11, 17, 22. Runtime-only: zen.mods.last-update, zen.mods.milestone, zen.themes.disable-all (ZenMods.mjs).

Strings: no own file. 20 ids with prefix zen-theme-marketplace- plus pane-zen-marketplace-title in locales/en-US/browser/browser/preferences/zen-preferences.ftl:141-180.

Settings UI: its own pane, `paneZenMarketplace` ("Zen Mods"). Category button in preferences-xhtml.patch, module registered in preferences-js.patch (`register_module("paneZenMarketplace", gZenMarketplaceManager)`), template in zenMarketplace.inc.xhtml:5-42.

Tests: none under src/zen/tests for mods (no directory).

Network (see section 5): https://zen-browser.github.io/theme-store/themes/<id>/theme.json (ZenMods.mjs:323, fetched at :344 and :739), then asset URLs named in that JSON (HTTPS only, ZenMods.mjs:336-337). Link to https://zen-browser.app/mods/ at zenMarketplace.inc.xhtml:20.

Depends on: `gZenOperatingSystemCommonUtils` (ZenCommonUtils.mjs), `nsZenPreloadedFeature`.

Depended on by: nothing in kept features except startup wiring (ZenPreloadedScripts.js:20, ZenActorsManager.sys.mjs:22) and the preferences pane list. I found no kept code reading `gZenMods`.

### 2.4 Live folders (cut)

Folders filled automatically from GitHub pull requests, GitHub issues or RSS feeds.

Files
- src/zen/live-folders/ZenLiveFolder.sys.mjs, ZenLiveFoldersManager.sys.mjs (723 lines), ZenLiveFoldersUI.mjs, providers/GithubLiveFolder.sys.mjs, providers/RssLiveFolder.sys.mjs, LiveFoldersComponents.manifest, moz.build, jar.inc.mn. Spec: docs/live-folders-specs.md.
- Markup in kept files: zen-panels/popups.inc:42-47, zen-commands.inc.xhtml:72, ZenFolders.mjs:80-92.

Loading
- App startup: ZenComponents manifest category browser-window-delayed-startup (src/zen/live-folders/LiveFoldersComponents.manifest) and browser-quit-application-granted.
- Every window: ZenLiveFoldersUI imported at ZenPreloadedScripts.js:29 and `gZenLiveFoldersUI.init()` called unguarded in ZenUIManager.mjs:62.

Prefs: prefs/zen/live-folders.yaml:5. Runtime only: zen.live-folders.promotion.shown.

Strings: locales/en-US/browser/browser/zen-live-folders.ftl (104 lines, 31 ids, prefix zen-live-folder-). Loaded at zen-locales.inc.xhtml:13.

Icons and images: src/zen/images/favicons/github.svg (GithubLiveFolder.sys.mjs:140, 178, 227). CSS in zen-folders.css:184-192.

Settings UI: none.

Tests: src/zen/tests/live-folders (4 files, 868 lines).

Network: github.com/pulls and /issues/assigned (GithubLiveFolder.sys.mjs:16-17), github.com/login check (:393), user-supplied RSS URLs (RssLiveFolder.sys.mjs:31, :181). These are third-party hosts.

Depends on: gZenWorkspaces (6), ZenWindowSync (6), gZenEmojiPicker (4), gZenFolders, gZenVerticalTabsManager (ZenLiveFoldersManager.sys.mjs:341).

Depended on by
- src/zen/folders/ZenFolders.mjs:80-92, 124, 262-266, 358, 577-581, 772, 1273, 1315, and ZenFolder.mjs:7-8, 279-280, 303.
- src/zen/sync/ZenSpacesSyncModel.sys.mjs:12-13, 640-660 and ZenSpacesSyncApplier.sys.mjs:34-35, 454-516. The sync record format has a `live` field.
- src/zen/sessionstore/ZenSessionManager.sys.mjs:11-12 and :627 (`ZenLiveFoldersManager.saveState`), ZenWindowSync.sys.mjs:562-575.
- src/zen/common/modules/ZenSessionStore.mjs:20-21, src/zen/common/zen-sets.js:184-188, src/zen/drag-and-drop/ZenDragAndDrop.js:927-928 and :1523-1529, src/zen/split-view/ZenViewSplitter.mjs:357-366 and :1401-1408, src/browser/components/sessionstore/TabState-sys-mjs.patch:30.

### 2.5 Space routing (cut)

Rules that open chosen sites in chosen workspaces.

Files
- src/zen/space-routing/ZenSpaceRoutingManager.sys.mjs (672 lines), ZenSpaceRoutingDialog.mjs, zen-space-routing.inc.xhtml, zen-space-routing.js, zen-space-routing.css, SpaceRoutingComponents.manifest, moz.build, jar.inc.mn.
- src/zen/common/sys/ui/ZenSpaceRoutingNavigation.sys.mjs (150 lines; registered in src/zen/common/moz.build:13).

Loading
- ZenPreloadedScripts.js:8-11 defines a getter, so it is lazy until first use, but Tabbrowser.addTab touches it for every new tab.
- App startup: category browser-window-delayed-startup (SpaceRoutingComponents.manifest) calls `onDelayedBrowserStartup`, which adds a menu entry.
- Per window: ZenStartup.mjs:161 lists "ZenSpaceRoutingNavigation" in `kUIComponents`, started after gZenWorkspaces.init().
- Dialog window: zen-space-routing.xhtml, opened from `cmd_zenOpenSpaceRoutingSettings` (zen-sets.js:177-178).
- Profile file: zen-space-routing.jsonlz4 (ZenSpaceRoutingManager.sys.mjs:19).

Prefs: none in prefs/. Routes are stored in the profile file.

Strings: locales/en-US/browser/browser/zen-space-routing.ftl (33 lines, 15 ids, prefix zen-space-routing-; one tab-context-zen id). Loaded at zen-locales.inc.xhtml:14.

Settings UI: none in about:preferences. Menu item `context_zenSpaceRoutingSettings` at zen-panels/popups.inc:38 and command at zen-commands.inc.xhtml:47. Command palette action at ZenUBGlobalActions.sys.mjs:142-143.

Tests: src/zen/tests/space_routing (12 files, 1941 lines).

Network: none.

Depends on: gZenWorkspaces (11 uses, for example ZenSpaceRoutingDialog.mjs:401), BrowserWindowTracker.

Depended on by (kept code)
- src/browser/components/tabbrowser/Tabbrowser-sys-mjs.patch:337, 343, 347, 430 call `onBeforeAddTab`, `shouldDeferTabSelection`, `shouldUseRouteContainer` and `onAfterAddTab` with no guard inside `addTab`. The `else if` branch on line 348 right after them holds the kept workspace container logic (`gZenWorkspaces.getContextIdIfNeeded`).
- src/browser/components/BrowserContentHandler-sys-mjs.patch:9-10 and :57 (`getWindowForExternalUri` decides which window opens an external link).
- src/zen/common/modules/ZenStartup.mjs:161, src/zen/compact-mode/ZenCompactMode.mjs:1045 (toast id zen-space-routing-tab-routed-toast), src/zen/urlbar/ZenUBGlobalActions.sys.mjs:142-143, src/zen/common/zen-sets.js:177.

### 2.6 Library (cut)

An in-window panel that replaces History, Downloads, Media and Spaces management.

Files
- src/zen/library/ZenLibrary.mjs (1030 lines), ZenLibraryWidget.sys.mjs, ZenLibraryUtils.sys.mjs, ZenLibraryDragAndDrop.mjs, ZenLibraryMediaPreview.mjs, sections/ (Boosts, Downloads, History, Media, Search, Spaces), zen-library.css (1256 lines), moz.build (uses `MOZ_SRC_FILES`, supported by engine/python/mozbuild/mozbuild/frontend/context.py:1783), jar.inc.mn.
- src/zen/common/styles/zen-library-widget.css (354 lines), zen-library-media-preview.css (105 lines), both pulled in by `%include` at zen-single-components.css:825-826.
- Markup: `<html:zen-library hidden="true">` in browser-box-inc-xhtml.patch:10.
- src/browser/themes/shared/zen-icons/common/library (8 svg).

Loading
- Lazy: `moz-src:///zen/library/ZenLibrary.mjs` (zen-sets.js:11, ZenCompactMode.mjs:66, ZenSpaceManager.mjs:18, ZenSpaceCreation.mjs:13, ZenSpaceAddSwipe.mjs:11, ZenSpacesSwipe.mjs:19).
- At startup: the library toolbar widget is registered by `CustomizableUIInternal.createBuiltinWidget(lazy.ZenLibraryWidget)` (ZenCustomizableUI.sys.mjs:29, called from CustomizableUI-sys-mjs.patch:40).
- Every window: zen-sets.js:16-33 intercepts the commands Browser:ShowAllHistory, key_gotoHistory and Tools:Downloads in the capture phase when zen.library.enabled is true.

Prefs: prefs/zen/library.yaml:5, 8, 11, 14, 17. Runtime: zen.library.migrated-downloads-button (ZenUIMigration.sys.mjs:58).

Strings: locales/en-US/browser/browser/zen-library.ftl (142 lines, 88 ids; prefixes library-history-, library-downloads-, library-media-, library-spaces-, zen-library-button). Loaded at zen-locales.inc.xhtml:16.

Icons: icons.css:93, 172, 300, 313, 819-820 (library.svg and shared downloads and history icons).

Settings UI: none.

Tests: src/zen/tests/library (2 files, 179 lines).

Network: link to https://www.zen-browser.app/donate (ZenLibrary.mjs:915).

Depends on: gZenWorkspaces (22 uses), gZenBoostsManager (9), gZenFolders (7), gZenVerticalTabsManager (5), Services.zen (4), gZenThemePicker, gZenGlanceManager.

Depended on by (kept code)
- src/zen/spaces/ZenSpacesSwipe.mjs:167-299 (11 calls: startSwipe, swipeProgress, stopSwipe, swipeReset and others). Swiping past the last workspace opens the library.
- src/zen/spaces/ZenSpaceAddSwipe.mjs:85 and :98, ZenSpaceCreation.mjs:158 (`ZenLibrary.close()`), ZenSpaceManager.mjs:2882, ZenCompactMode.mjs:168.
- src/zen/common/sys/ZenCustomizableUI.sys.mjs:20-30. Line 21 calls `Services.prefs.getBoolPref("zen.library.enabled")` with no default, so deleting the pref throws. It picks `zen-library-button` or `downloads-button` as the first sidebar icon.
- src/zen/common/sys/ZenUIMigration.sys.mjs:56-64, src/zen/downloads/ZenDownloadAnimation.mjs:152, src/zen/kbs/ZenKeyboardShortcuts.mjs:1325-1334, src/zen/urlbar/ZenUBGlobalActions.sys.mjs:19 and :48-49, src/zen/common/styles/zen-animations.css:31, src/zen/tabs/zen-tabs/vertical-tabs.css:87, zen-single-components.css:802-826.
- The `library` removal path already exists: with zen.library.enabled false the sidebar uses the stock downloads button.

### 2.7 Share (cut)

Share a space, folder or split view as a link through a Zen server.

Files
- src/zen/share/ZenShareManager.mjs (812 lines), ZenShareClient.sys.mjs, share.schema.json, zen-share-confirm.inc.xhtml, zen-share-confirm.js, zen-share.css, moz.build, jar.inc.mn.

Loading: every window, ZenPreloadedScripts.js:31. Confirm dialog window zen-share-confirm.xhtml.

Prefs: prefs/zen/share.yaml:5 (base-url), :8 (secret-key), :11 (display-name), :15 (sync pref for display-name), :18 (dont-ask-before-sharing).

Strings: locales/en-US/browser/browser/zen-share.ftl (43 lines, 29 ids, prefix zen-share-). Loaded at zen-locales.inc.xhtml:15.

Settings UI: none.

Tests: src/zen/tests/share (7 files, 763 lines).

Network: https://share.zen-browser.app (prefs/zen/share.yaml:6), REST calls at ZenShareClient.sys.mjs:111, 159, 195, 231 (`/api/shares/<id>`).

Not the same thing: src/zen/toolkit/common/ZenShareInternal.h, cocoa/ZenShareInternal.mm and windows/ZenShareInternal.cpp are the native OS share sheet (`Services.zen.canShare()` and `Services.zen.share()`, nsIZenCommonUtils.idl:14-30). The URL bar's copy-link toast uses it (ZenCommonUtils.mjs:103-111). Despite the name it is not the cloud Share feature.

Depended on by (kept code)
- Context menu items: zen-panels/popups.inc:35 (`context_zenShareWorkspace`) and :59 (`context_zenShareFolder`); ZenFolders.mjs:189-190; ZenViewSplitter.mjs:1189-1190, 1211-1214, 1269; ZenSpaceManager.mjs:3098; zen-sets.js:74 and :126; zen-commands.inc.xhtml:19 and :44.
- src/zen/urlbar/ZenSiteDataPanel.sys.mjs:801 and site-data.inc:17-19 (header share button; whether it uses the cloud Share or the native sheet is unverified).

### 2.8 Sidebar media controls (cut)

Media cards (play, pause, next, mute, mic and camera state, picture-in-picture) in the sidebar.

Files
- src/zen/media/ZenMediaController.mjs (802 lines), zen-media-controls.css (430), zen-media-controls.inc.xhtml (50), jar.inc.mn.
- Gecko: src/dom/chrome-webidl/MediaController-webidl.patch, src/dom/media/mediacontrol/MediaController-cpp.patch (adds getPositionState), MediaController-h.patch, MediaStatusManager-cpp.patch, src/dom/media/mediaelement/HTMLMediaElement-cpp.patch.
- Firefox JS: src/browser/actors/WebRTCParent-sys-mjs.patch:9 (`gZenMediaController.updateMediaSharing`), src/browser/components/tabbrowser/content/tab-js.patch:13 (`<box class="zen-media-notes"/>` inside every tab).

Loading: every window (ZenPreloadedScripts.js:23). `gZenMediaController.init()` runs unguarded at ZenUIManager.mjs:60. The controller checks zen.mediacontrols.enabled at ZenMediaController.mjs:479. Markup is included from navigator-toolbox-inc-xhtml.patch:45. CSS loaded at zen-assets.inc.xhtml:29.

Prefs: prefs/zen/zen.yaml:35 (zen.mediacontrols.enabled). Note: prefs/zen/media.yaml holds image.jxl.enabled, svg.context-properties.content.enabled and media.eme.enabled, which are not media-controls prefs.

Strings: none in a dedicated file (unverified; the card uses stock Firefox strings).

Icons and images: icons.css:642-646 and :841-892 (media-play, media-pause, media-next, media-previous, media-mute, media-unmute, microphone and video icons, screen.svg), src/zen/images/note-indicator.svg (zen-media-controls.css:415).

Settings UI: none.

Tests: src/zen/tests/media (7 files, 408 lines).

Network: none.

Depended on by: ZenSidebarNotification.mjs:10-12 anchors every sidebar notification after `#zen-media-controls-toolbar`; src/zen/tabs/zen-tabs/vertical-tabs.css:443-448 (`.zen-media-notes` tab decoration); the Gecko patches are used only by this feature (inferred from the names; the new getPositionState and webidl dictionary appear in nothing else under src/).

### 2.9 Welcome flow (cut)

First-run screen: pick import, default browser, theme, essentials and a workspace layout.

Files: src/zen/welcome/ZenWelcome.mjs (891 lines), zen-welcome.css (464), welcome-background.mp4 (15,452,319 bytes), jar.inc.mn. Favicons used by it: src/zen/images/favicons/*.svg (8 files, packed at images/jar.inc.mn).

Loading
- Script: loaded with `loadSubScript` only when pref zen.welcome-screen.seen is false (ZenStartup.mjs:170-189).
- CSS: zen-welcome.css loads in every window (zen-assets.inc.xhtml:28). The mp4 and favicons are in every build (welcome/jar.inc.mn, images/jar.inc.mn).

Prefs: prefs/zen/welcome.yaml:5 (zen.welcome-screen.seen). The test profiles set it true (src/testing/profiles/mochitest/user-js.patch and profileserver/user-js.patch).

Strings: locales/en-US/browser/browser/zen-welcome.ftl (37 lines, 25 ids, prefix zen-welcome-). Loaded by `insertFTLIfNeeded` (ZenWelcome.mjs:106), not by zen-locales.inc.xhtml. Note that crowdin.yml lists it.

Settings UI: none.

Tests: src/zen/tests/welcome (3 files, 251 lines).

Network: none from Zen code. ZenWelcome.mjs:22-30 holds third-party site URLs used for the essentials it creates.

Depended on by
- ZenStartup.mjs:60 and :170-189. This is the only place that seeds `zen.updates.last-build-id` and `zen.updates.last-version`; the else branch runs the update animation.
- `zen-welcome-stage` attribute checked in ZenUIManager.mjs:545 and ZenSpaceManager.mjs:1020.
- `reorganizeTabsAfterWelcome` (ZenSpaceManager.mjs:3385) is called only by the welcome script (ZenWelcome.mjs:374).
- The welcome flow calls kept APIs: gZenFolders.createFolder (:407), gZenPinnedTabManager.addToEssentials (:444), gZenThemePicker.panel (:565, :585), MigrationUtils (:549).

### 2.10 Workspaces, colors and gradients (keep)

Files
- src/zen/spaces: ZenSpaceManager.mjs (3577 lines, defines `gZenWorkspaces`), ZenSpace.mjs, ZenSpaceCreation.mjs, ZenSpaceIcons.mjs, ZenSpaceBookmarksStorage.js, ZenSpaceAddSwipe.mjs, ZenSpacesSwipe.mjs, nsZenSwipeOverrides.cpp, ZenGradientGenerator.mjs (2123, defines `gZenThemePicker`), zen-workspaces.css, create-workspace-form.css, zen-gradient-generator.css, overflow-icons.inc.css.
- Markup: zen-panels/theme-picker.inc, zen-sidebar-icons.inc.xhtml (workspace icon strip), 22 workspace commands in zen-commands.inc.xhtml.
- Gecko: dom/events/SimpleGestureEvent-h.patch and SimpleGestureEvent-webidl.patch, widget/SwipeTracker-cpp.patch and -h.patch, widget/TouchEvents-h.patch (swipeSuccessThreshold fields used at ZenSpacesSwipe.mjs:65-68).
- Firefox JS patches with workspace code (changed-line counts by keyword): Tabbrowser-sys-mjs.patch (65 hits), PlacesUIUtils-sys-mjs.patch (58), editBookmark-js.patch (51), SessionStore-sys-mjs.patch (21), tabs-js.patch (16), UrlbarShared-mjs.patch (13), plus ContainerCreationPanel-mjs.patch, CustomizeMode, URILoadingHelper, BrowserWindowTracker, arrowscrollbox-js.patch, and others.

Loading: every window (ZenPreloadedScripts.js:17). Gradient generator is imported by the space manager.

Prefs: prefs/zen/workspaces.yaml:5-44 (zen.workspaces.*), prefs/zen/theme.yaml:5-14 (accent, gradient), prefs/zen/zen.yaml:29 (dnd-switch-space-delay).

Strings: zen-workspaces.ftl (103 lines, 39 ids), zen-general.ftl (zen-panel-ui-gradient-generator-custom-color and others), prefs ftl ids with prefix zen-workspace- and zen-settings-workspaces-.

Settings UI: pane paneZenTabManagement, workspaces group at zenTabsManagement.inc.xhtml:19-45; zen-settings.js:719-767.

Tests: src/zen/tests/spaces (19 files, 2026 lines), container_essentials (4), device_sync (7), window_sync (6).

Depends on cut features: Glance (section 2.2), Library (2.6), Share (2.7), Welcome (2.9), Boosts (gZenThemePicker is referenced once from src/zen/boosts), Live folders (none direct).

### 2.11 Essentials and pinned tabs (keep)

Files: src/zen/tabs/ZenPinnedTabManager.mjs (1192 lines); essentials container `#zen-essentials` (navigator-toolbox-inc-xhtml.patch); Firefox patches tab-js.patch (attribute `zen-essential` on the tab, lines 32, 41, 44), drag-and-drop-js.patch:259 (`tab.pinned && false` disables Firefox's pinned grid drag), tabs-js.patch:82-130 and :195-215, SessionStore-sys-mjs.patch (10 essentials hits), Tabbrowser-sys-mjs.patch (31 hits).

Prefs: prefs/zen/zen.yaml:14 (essentials.max), :44, :50, :53; prefs/zen/workspaces.yaml:38 (separate-essentials), :48-57 (pinned-tab-manager.*); prefs/zen/theme.yaml:17.

Settings UI: pane paneZenTabManagement, pinned group zenTabsManagement.inc.xhtml:47-82; zen-settings.js:719-767.

Tests: src/zen/tests/pinned (13 files, 1118 lines), container_essentials.

Dependencies on unlisted and cut code: gZenWindowSync (ZenPinnedTabManager.mjs:241, :291), gZenEmojiPicker, ZenEssentialsPromo (referenced by ZenDragAndDrop.js), Glance (:382-402).

### 2.12 Folders (keep)

Files: src/zen/folders (ZenFolders.mjs 2373, ZenFolder.mjs 331, zen-folders.css, zen-folder-icon.inc.css), zen-panels/folders-search.inc, tabgroup-mjs.patch (269 lines), drag-and-drop-js.patch.

`nsZenFolder extends MozTabbrowserTabGroup` (ZenFolder.mjs:11), defined as `zen-folder` (:331). It extends Firefox's tab group class.

Prefs: prefs/zen/folders.yaml:5, 8, 11, 14; prefs/zen/zen.yaml:26. Strings: zen-folders.ftl (32 lines, 10 ids). Tests: src/zen/tests/folders (17 files, 1066 lines).

Depends on cut code: Live folders, Share, Glance, Library (all listed in sections 2.2 to 2.6). Also gZenEmojiPicker.

### 2.13 Split view (keep)

Files: src/zen/split-view (ZenViewSplitter.mjs 2659, zen-split-view.css, zen-split-group.inc.css, zen-splitview-overlay.inc.xhtml), tab-context-menu-js.patch, tabs-css.patch, nsContextMenu-sys-mjs.patch:10.

Zen builds a split as a Firefox tab group with attribute `split-view-group` (ZenViewSplitter.mjs:2406-2411 calls `gBrowser.addTabGroup(..., {forSplitView: true})`; Tabbrowser-sys-mjs.patch:462-487). Prefs: prefs/zen/split-view.yaml:5-23. Strings: zen-split-view.ftl (19 lines). Tests: src/zen/tests/split_view (9 files, 744 lines).

Depends on cut code: Glance (19 hits), Live folders (ZenViewSplitter.mjs:357-366, 1401-1408), Share (:1189-1269).

### 2.14 Compact mode (keep)

Files: src/zen/compact-mode (ZenCompactMode.mjs 1063; ZenMouseTracker.cpp/.h, ZenMouseTrackerCocoa.mm, ZenMouseTrackerWin.cpp, nsIZenMouseTracker.idl, components.conf; sidebar.inc.css, toolbar.inc.css, windows-captions-fix-*.inc.css; zen-compact-mode.css). Contract `@mozilla.org/zen/mouse-tracker;1` (ZenCompactMode.mjs:56-57). Patches: panel-js.patch, PopupNotifications-sys-mjs.patch, urlbar-css.patch and others.

Loading: every window (ZenPreloadedScripts.js:18). `gZenCompactModeManager.init()` runs after session restore (ZenStartup.mjs:86). Prefs: prefs/zen/compact-mode.yaml:5-44. Settings UI: zenLooksAndFeel.inc.xhtml:56-63. Strings: prefs ftl prefix zen-compact-mode-, `zen-toggle-compact-mode-button` in zen-general.ftl. Tests: src/zen/tests/compact_mode (2 files, 81 lines).

Depends on cut code: Glance (ZenCompactMode.mjs:252, :1022), Library (:66, :168), Space routing (:1045).

### 2.15 Vertical tab sidebar, URL bar, command palette, shortcuts, theme picker panel (keep)

- Vertical tabs: CSS in src/zen/tabs/zen-tabs (vertical-tabs.css 1374 lines), manager code in ZenUIManager.mjs:970-1850, Firefox patches Tabbrowser, tabs-js.patch, tab-js.patch, CustomizableUI-sys-mjs.patch (292 lines), AppWindow-cpp.patch. Settings: zenLooksAndFeel.inc.xhtml:8-47, zen-settings.js:654-717. Prefs: prefs/zen/zen.yaml:5-23, prefs/zen/view.yaml:5-70.
- URL bar: src/zen/urlbar plus UrlbarInputBase-mjs.patch (705 lines), UrlbarShared-mjs.patch, UrlbarView-mjs.patch, UrlbarMuxerStandard, UrlbarProvidersManager, UrlbarValueFormatter, UrlbarPrefs, UrlbarChildController, urlbar-css.patch (301 lines). Prefs: prefs/zen/zen-urlbar.yaml:5-43, prefs/firefox/urlbar.yaml. Strings: zen-command-palette.ftl (45 lines, 41 ids). Tests: src/zen/tests/urlbar (7), ub-actions (3), site_control (8). Settings: zenLooksAndFeel.inc.xhtml:104-127.
- Command palette actions that point at cut features: Library (ZenUBGlobalActions.sys.mjs:48-49), Space routing (:142-143), Boost (:147-187).
- Keyboard shortcuts: src/zen/kbs/ZenKeyboardShortcuts.mjs (1672 lines), shortcuts for Glance (:1145-1153) and Library (:1325-1334) must go. It also disables Firefox's `key_addTabSplitView` (:1307-1311). Settings: pane paneZenCKS, zenKeyboardShortcuts.inc.xhtml:5-22, zen-settings.js:769-1261. Prefs: prefs/zen/kbs.yaml:5, 8.
- Theme picker panel: theme-picker.inc (162 lines), command `cmd_zenOpenZenThemePicker`.

### 2.16 Session restore and workspace sync (keep)

- ZenSessionManager.sys.mjs writes `zen-sessions.jsonlz4` (:48) with backups; imports ZenLiveFoldersManager (:11) and window sync prefs (:20-21). Patches: SessionFile, SessionSaver, SessionStartup, SessionStore (418 lines), TabState, TabGroupState, TabStateFlusher. Prefs: prefs/zen/session-store.yaml:5-14.
- src/zen/sync registers the "Spaces" Sync engine (services/sync/modules/service-sys-mjs.patch). It syncs spaces, folders, pinned and essential tabs; normal tabs only if zen.spaces-sync.normal-tabs (prefs/zen/sync.yaml:12). `services.sync.engine.spaces` has default "@cond" with condition `@IS_TWILIGHT@` (sync.yaml:5-7), so it may be off in release builds (unverified how the macro resolves). UI: sync-inc-xhtml.patch, account-sync-mjs.patch, syncChooseWhatToSync-js/-xhtml.patch, sync-engines-list-mjs.patch. Tests: src/zen/tests/device_sync (7 files, 624 lines).
- Sync depends on Live folders (ZenSpacesSyncModel.sys.mjs:12-13, 640-660; ZenSpacesSyncApplier.sys.mjs:34-35, 454-516), window sync (ZenSpacesSyncApplier.sys.mjs:33) and ZenSessionManager (ZenSpacesSyncModel.sys.mjs:11).

### 2.17 Unlisted features in detail

- Window sync (src/zen/sessionstore/ZenWindowSync.sys.mjs, prefs/zen/window-sync.yaml:5-17, tests/window_sync). Callers in kept code: ZenPinnedTabManager.mjs:241 and :291, ZenSpaceManager.mjs:1439, ZenSpace.mjs:434-437, Tabbrowser-sys-mjs.patch:1194, SessionStore-sys-mjs.patch:22 and :171, BrowserContentHandler-sys-mjs.patch (the `--blank-window` flag sets `_zenStartupSyncFlag`), ZenSessionManager.sys.mjs:20-21.
- Tab drag and drop (ZenDragAndDrop.js plus nsZenDragAndDrop.cpp, nsDragService-mm.patch, nsDragSessionSource-cpp.patch, nsCocoaWindow-mm.patch). Handles folder, essentials and split-view drops; it has hooks for Glance, Live folders and Essentials promo.
- Site data panel (ZenSiteDataPanel.sys.mjs) replaces Firefox's identity and permissions popup in the URL bar. It imports the Boosts manager at the top, so it needs editing when Boosts goes.
- Native share sheet: see section 2.7.
- Updates and sidebar notification: ZenStartup.mjs:5-8 imports ZenUpdates.mjs at module top. It shows a notification and links to https://www.zen-browser.app/donate (ZenUpdates.mjs:40).
- Download animation: ZenDownloadAnimation.mjs, prefs/zen/downloads.yaml:5-11.
- Emoji picker: used by ZenSpaceManager, ZenSpaceCreation, ZenFolders, ZenPinnedTabManager, ZenEssentialsPromo, RssLiveFolder, ZenLibrarySpacesSection.
- Window drag: actor and nsZenWindowDragUtils, pref zen.view.drag-window-from-content (view.yaml:46).
- Workspace bookmarks: ZenSpaceBookmarksStorage.js creates tables `zen_bookmarks_workspaces` and `zen_bookmarks_workspaces_changes` in places.sqlite (:30-40), plus patches to PlacesUIUtils, editBookmark, browserPlacesViews, editBookmarkPanel and organizer css.
- Platform styling: prefs/zen/macos.yaml:7, 21, 31, 35; windows.yaml:6, 13; gtk.yaml:6, 12; widget/cocoa/VibrancyManager-mm.patch, nsCocoaWindow-mm.patch (156 lines, `ZenWindowMaterialView`).
- Watermark (prefs/zen/watermark.yaml:5, ZenStartup.mjs:20 and :117), haptics (prefs/zen/static.yaml:5 and zen.yaml:38, same pref twice), tab rename (zen.yaml:11), "clear tabs" button (view.yaml:58).
- Empty tab (`zen-empty-tab` attribute) appears in ext-browser-js.patch, TabsList-sys-mjs.patch, findbar-js.patch and others. It backs the "URL bar replaces new tab" behavior (prefs/zen/zen-urlbar.yaml:5). Unverified how widely kept code relies on it; Tabbrowser patch references it.
- Stale locale files: locales/de/browser/browser/ still has zen-web-side-panels.ftl, zenAppExtensionFields.ftl and zenNewWebPanel.ftl, which have no en-US source. Unverified whether other locales have them.

## 3. Firefox-native equivalents

Zen's pref overrides are in prefs/firefox/browser.yaml. Firefox defaults are in engine/browser/app/profile/firefox.js.

| Area | Firefox 157 default | Zen setting | Verdict |
|---|---|---|---|
| Sidebar revamp | `sidebar.revamp` true (firefox.js:2279) | false and locked (browser.yaml:32-34) | Disabled |
| Native vertical tabs | `sidebar.verticalTabs` false (firefox.js:2290) | false and locked (browser.yaml:36-38) | Disabled, replaced by `zen.tabs.vertical` |
| Tab groups | `browser.tabs.groups.enabled` true (firefox.js:1173) | false (browser.yaml:56-57) | Class reused, UI off |
| Split view | `browser.tabs.splitView.enabled` true (firefox.js:2842) | false and locked (browser.yaml:86-88) | Replaced |
| Sidebar expand on hover | `sidebar.expandOnHover` true (firefox.js:2302) | not set | Not used |
| Pinned tabs grid | stock vertical pinned grid | `browser.tabs.dragDrop.dragToPin.enabled` false and locked (browser.yaml:76-78) | Replaced by Essentials |

Vertical tab sidebar
- Zen replaces the sidebar but reuses the tab strip. `AppWindow-cpp.patch` changes `settings.verticalTabs` to read `zen.tabs.vertical` instead of `sidebar.verticalTabs`.
- ZenStartup.mjs:95-97 sets `orient="vertical"` on `#tabbrowser-arrowscrollbox`, which turns on Firefox's `verticalMode` getter in tabs.js (engine/browser/components/tabbrowser/content/tabs.js:851-853). So Zen builds on Firefox's vertical tab code paths in tabs.js and drag-and-drop.js, and overrides pieces of them.
- Zen's tabs-js.patch replaces the arrow scrollbox children with `gZenWorkspaces.tabboxChildren` (patch line 86), so tab order depends on the workspace manager.
- Firefox's `sidebar-main` markup stays in browser-box-inc-xhtml.patch but `#sidebar-container` is hidden. browser-sidebar-js.patch:5 retargets the `browser` element to `tabbrowser-tabbox`. Zen's own `gZenVerticalTabsManager` (ZenUIManager.mjs:970) lays out the sidebar.

Folders and tab groups
- Zen builds on Firefox's implementation. `nsZenFolder extends MozTabbrowserTabGroup` (ZenFolder.mjs:11). tabgroup-mjs.patch (269 lines) edits Firefox's tabgroup.mjs and Tabbrowser-sys-mjs.patch edits `addTabGroup`.
- `browser.tabs.groups.enabled` is read in engine only by firefox.js, preferences and asrouter files (rg over engine/browser). The tabbrowser code does not read it, so turning it off hides Firefox's tab group UI without disabling the class Zen extends.

Split view
- Zen replaces Firefox's split view. Firefox's native pref is off and locked, `ZenKeyboardShortcuts.mjs:1307-1311` disables `key_addTabSplitView` and `key_separateTabSplitView`, and Tabbrowser-sys-mjs.patch:8-9 makes `splitViewBrowsers` return `gZenViewSplitter.splitViewBrowsers`.
- Zen keeps Firefox's `tab-split-view-wrapper` code in the patched files but its own splits are tab groups with `split-view-group` (ZenViewSplitter.mjs:2406-2411).
- tab-js.patch:157 replaces the pref check `browser.tabs.splitView.enabled` with `true` for alt-click handling, so that branch of Firefox's code runs regardless of the pref.

Compact mode and expand on hover
- Zen replaces it. ZenCompactMode.mjs and the C++ mouse tracker are independent of Firefox's `sidebar.expandOnHover`. A search of src/zen, src/browser, src/toolkit and prefs for expandOnHover, sidebar.visibility and sidebar.animation finds only one hit, tabs-js.patch:213, which is an unchanged context line `!this.expandOnHover`.

Pinned tabs and Essentials
- Zen builds on Firefox's `pinned` state and adds its own `zen-essential` attribute and container. It disables Firefox's pinned-grid drag logic (drag-and-drop-js.patch:259) and changes `isContainerVerticalPinnedGrid` to test `zen-essential` (tabs-js.patch:206-215).
- Firefox's `browser.sessionstore.restore_pinned_tabs_on_demand` is set true (browser.yaml:8-9).

## 4. Zen patches to Firefox files that exist for cut or unlisted features

Counts are changed lines (added plus removed) from `grep '^[+-]'`. Patches that mix cut and kept code are in the "mixed" list. "Confirmed" means the patch names the feature. "Inferred" means the patch only adds a frame parameter that reaches `StyleAbsoluteColor::ToColor(aFrame)` (src/layout/style/StyleColor-cpp.patch:99-133), which calls the boost hook. I did not trace each caller.

### Boosts, confirmed (12 files, 177 changed lines)

- src/docshell/base/BrowsingContext-h.patch
- src/dom/chrome-webidl/BrowsingContext-webidl.patch
- src/gfx/layers/AnimationInfo-cpp.patch
- src/image/AutoRestoreSVGState-h.patch
- src/layout/base/PresShell-cpp.patch
- src/layout/base/nsPresContext-h.patch
- src/layout/style/StyleColor-cpp.patch
- src/layout/svg/SVGImageContext-cpp.patch
- src/layout/svg/SVGImageContext-h.patch
- src/servo/ports/geckolib/cbindgen-toml.patch
- src/widget/Theme-cpp.patch
- src/layout/painting/nsImageRenderer-cpp.patch (also carries gradient frame parameters)

### Boosts, inferred (color plumbing, 39 files, 239 changed lines)

- src/layout/style: ComputedStyle-cpp, ComputedStyle-h, GeckoBindings-cpp, ServoCSSParser-cpp, StyleAnimationValue-cpp, StyleColorInlines-h, nsStyleStruct-cpp
- src/layout/generic: nsContainerFrame-cpp, nsIFrame-h, nsImageFrame-cpp, nsTextFrame-cpp, nsTextPaintStyle-cpp
- src/layout/painting: nsCSSRendering-cpp, nsCSSRenderingBorders-cpp, nsCSSRenderingGradients-cpp, nsCSSRenderingGradients-h
- src/layout/svg: FilterInstance-cpp, SVGContextPaint-cpp, SVGGradientFrame-cpp, SVGTextFrame-cpp, SVGUtils-cpp, SVGUtils-h
- src/layout/mathml/nsMathMLChar-cpp, src/layout/tables/nsTableFrame-cpp, src/layout/xul/tree/nsTreeBodyFrame-cpp
- src/gfx/thebes/gfxUtils-cpp and -h, src/gfx/layers/CompositorAnimationStorage-cpp
- src/widget: ThemeColors-cpp, Theme-h, ScrollbarDrawing-cpp, ScrollbarDrawingCocoa-cpp, ScrollbarDrawingWin11-cpp
- src/accessible/base/TextAttrs-cpp, src/accessible/windows/ia2/ia2AccessibleComponent-cpp
- src/dom/base/nsAttrValue-cpp, src/dom/canvas/CanvasRenderingContext2D-cpp, src/dom/html/HTMLInputElement-cpp, src/editor/libeditor/HTMLAbsPositionEditor-cpp

All of these changed lines match color-resolution patterns (ToColor, CalcColor, GetVisitedDependentColor, aFrame). A script flagged only signature continuation lines as odd.

### Zen Mods (confirmed)

- src/dom/base/Document-cpp.patch (adds the mods sheet to chrome documents)
- src/layout/style/nsStyleSheetService-h.patch (`ZenMarkStylesAsChanged`)

### Sidebar media controls (confirmed, 39 changed lines in 6 files)

- src/dom/chrome-webidl/MediaController-webidl.patch
- src/dom/media/mediacontrol/MediaController-cpp.patch, MediaController-h.patch, MediaStatusManager-cpp.patch
- src/dom/media/mediaelement/HTMLMediaElement-cpp.patch
- src/browser/actors/WebRTCParent-sys-mjs.patch (one line)

### Other cut features, whole patch

- Library: none whole. `<html:zen-library>` is one line in src/browser/base/content/browser-box-inc-xhtml.patch:10.
- Space routing, Glance, Live folders, Share: no whole patch file. Only hunks (next list).
- Welcome: user-js lines in src/testing/profiles/mochitest/user-js.patch and profileserver/user-js.patch (shared with other test prefs).

### Mixed patches that carry cut-feature hunks

- src/browser/components/tabbrowser/Tabbrowser-sys-mjs.patch: Glance (patch lines 50-96, 136, 162, 643, 688, 756, 1021, 1059-1082), Space routing (337-347, 430).
- src/toolkit/content/widgets/tabbox-js.patch: Glance (34, 51, 60, 68, 73).
- src/browser/components/tabbrowser/content/tab-js.patch: Glance (166-167), media (13).
- src/browser/components/tabbrowser/content/tabs-js.patch: Glance (122-127).
- src/browser/components/places/content/browserPlacesViews-js.patch: Glance (36, 118, 127).
- src/browser/modules/BrowserDOMWindow-sys-mjs.patch: Glance only (whole file, 6 changed lines).
- src/browser/components/search/SearchUIUtils-sys-mjs.patch: Glance only (one line).
- src/browser/base/content/nsContextMenu-sys-mjs.patch: Glance line 10, split-view line 9.
- src/browser/components/BrowserContentHandler-sys-mjs.patch: Space routing (lines 9-10, 57); the `--blank-window` hunks relate to window sync.
- src/browser/components/sessionstore/TabState-sys-mjs.patch: Glance (26-27), Live folders (30).
- src/browser/components/sessionstore/SessionStore-sys-mjs.patch: Glance (213-214).
- src/browser/components/preferences: zenLooksAndFeel.inc.xhtml (Glance 75-102), zen-settings.js (Mods 18-650, Glance), zenMarketplace.inc.xhtml (whole file, Mods), preferences-xhtml.patch and preferences-js.patch (Marketplace pane hooks).

### Unlisted-only patches (delete with the unlisted feature)

- Window drag: none outside src/zen.
- Platform window styling: widget/cocoa/VibrancyManager-mm.patch, nsCocoaWindow-h.patch, nsCocoaWindow-mm.patch, nsCocoaUtils-mm.patch, VibrancyManager, browser/themes/osx/browser-css.patch, windows/browser-css.patch, linux/browser-css.patch.
- Installer and uninstall survey: browser/installer/windows/nsis/* (4 files), browser/installer/package-manifest-in.patch, browser/locales/en-US/installer/custom-properties.patch, toolkit/mozapps/installer/windows/nsis/makensis-mk.patch.
- Branding and update host: build/moz-build.patch, toolkit/moz-configure.patch, toolkit/modules/AppConstants-sys-mjs.patch, UpdateUtils-sys-mjs.patch, docshell/base/nsAboutRedirector-cpp.patch, browser/base/content/aboutDialog-*.patch, security/mac/hardenedruntime/production/firefox-browser-xml.patch.
- AI settings hiding: browser/components/preferences/config/aiFeatures-mjs.patch (46 changed lines), browser/components/aiwindow/ui/modules/AIWindow-sys-mjs.patch.
- Servo `-moz-bool-pref` string feature: servo/components/style/gecko/media_features-rs.patch, queries/feature-rs.patch, queries/feature_expression-rs.patch (about 31 lines). No Zen CSS uses `-moz-bool-pref`; the CSS uses the built-in `-moz-pref(...)` (for example vertical-tabs.css:57). Firefox already parses `-moz-pref` (engine/servo/components/style/queries/condition.rs:966). So these three patches look unused. Unverified.
- Test and lint plumbing: eslint-*.patch, -stylelint*.patch, -prettierignore.patch, testing/*, tools/lint/*, python/mozlint, build/pgo/profileserver-py.patch.
- External patches (src/external-patches/manifest.json): backdrop_filter_reads_web_content (533 changed lines, used by backdrop-filter CSS in zen-omnibox.css, compact-mode/sidebar.inc.css and others; those are kept features, so treat it as needed), expose_tiled_attribute_to_all_platforms, fix_hevc_video_stutters_and_dropped_frames, issue_14710 (picture-in-picture), issue_14990 (SessionWriter), issue_15123 (subprocess), native_macos_popovers_fix, no_liquid_glass_icon, override_cert_checks_temp, plus librewolf firefox-in-ua.

## 5. Contacts with Zen-run servers

Zen-run hosts and where they appear:

- https://share.zen-browser.app: prefs/zen/share.yaml:6, used by src/zen/share/ZenShareClient.sys.mjs:62-65, 111, 159, 195, 231.
- https://zen-browser.github.io/theme-store/themes/<id>/theme.json: src/zen/mods/ZenMods.mjs:323 (fetch at :344 and :739).
- https://zen-browser.app/* injected actor match: prefs/zen/mods.yaml:18 (release builds, locked) and :23 (`http://localhost/*` otherwise); consumed at src/zen/common/sys/ZenActorsManager.sys.mjs:33.
- https://zen-browser.app/mods/: src/browser/components/preferences/zenMarketplace.inc.xhtml:20.
- https://www.zen-browser.app/donate: src/zen/common/modules/ZenUpdates.mjs:40 and src/zen/library/ZenLibrary.mjs:915.
- https://docs.zen-browser.app/user-manual/window-sync: src/zen/common/sys/ZenUIMigration.sys.mjs:186.
- https://updates.zen-browser.app: src/build/moz-build.patch:10 (`MOZ_APPUPDATE_HOST`) and surfer.json:56 (`updateHostname`). docs/spec.md:174 says the feed is served through GitHub Pages from `zen-browser/updates-server`. How the final update URL is assembled (surfer or a pref) I did not trace. Unverified.
- https://zen-browser.app/about/ and /about: src/docshell/base/nsAboutRedirector-cpp.patch:10 (about:credits) and src/browser/base/content/aboutDialog-xhtml.patch:21.
- https://www.zen-browser.app/privacy-policy/: aboutDialog-xhtml.patch:38.
- https://github.com/zen-browser/desktop: aboutDialog-xhtml.patch:27, configs/common/mozconfig:23, package.json:40-48, surfer.json:25 and :45 (GitHub release repo).
- https://links.zen-browser.app/uninstall-feedback: src/browser/installer/windows/nsis/uninstaller-nsi.patch:12.
- https://github.com/zen-browser/flatpak, windows-binaries, releases: build/flatpak/app.zen_browser.zen.yml.template:60, 67, 74; build/windows/sign.ps1:21, 50, 219 (build time only).
- npm package @zen-browser/surfer and @zen-browser/prettier: package.json:51-52, scripts/update-surfer.sh:12-13.
- scripts/remove-failed-jobs.sh:7 uses the zen-browser GitHub org (CI helper).

Not Zen-run but contacted by Zen code: github.com (live folders, GithubLiveFolder.sys.mjs:16-17, 393), user RSS hosts, Firefox Sync servers (workspace sync), codeberg.org/librewolf (src/external-patches/manifest.json:26, build time), phabricator.services.mozilla.com (scripts/update_external_patches.py:11, build time), hg.mozilla.org and github.com/mozilla-l10n (scripts, build time).

I found no Zen-run server in prefs/ other than the two prefs above, none in configs/ (only the distribution id `app.zen-browser`, configs/common/mozconfig:16), and none in locales/en-US.

## 6. Open questions I could not settle by reading

- Whether `grep` found every dynamic use of a cut module, for example strings built at runtime. I searched identifiers, not call graphs.
- Whether the color-plumbing patches in section 4 serve only Boosts. The `aFrame` parameter is only consumed by the boost hook in the code I read.
- Whether `zen-sets.js` guards on missing `gZenGlanceManager`, `gZenLiveFoldersUI` and similar globals. Most call sites are unguarded.
- The final value of `services.sync.engine.spaces` in release builds, and how surfer builds the update URL from `updateHostname`.
