# Zen code that still costs energy or memory in normal use, 2026-10-13

Code read of the working tree on 2026-10-13 (Zen 1.23.2b on Firefox 157.0.1, with the cuts in `docs/cuts.md` applied). Nothing here was measured. Every cost figure is an estimate from reading the code and is marked "unverified" where it is a guess.

Scope is `src/zen/**` and the Zen parts of `src/browser/**/*.patch`. I left out the Motion library and its animations and the macOS window material, which other agents own. I also left out what earlier notes already cover, and point to them instead:

- `lazy-load-2026-10-13.md` covers per-window module copies, the keyboard shortcut file rewrite, the URL bar provider load and the theme picker setup.
- `tab-switch-2026-10-13.md` covers the TabSelect listeners, the page container clip and shadow, and the Essentials blur.
- `space-switch-2026-10-13.md` covers `onWorkspaceChange` and the space switch animation.
- `split-view-2026-10-13.md` covers the divider drag.
- `zen-effects-2026-10-12.md` covers the loops, the `backdrop-filter`, `filter` and `will-change` lists and the idle timers.

## What I found at idle

Nothing in Zen's chrome code keeps a timer, rAF loop or animation running on a quiet window. The nine looping animations from `zen-effects-2026-10-12.md` are gone from the tree. A grep for `infinite` in `src/zen` and `src/browser/themes` finds none.

The only repeating timer in `src/zen` is Origin's own `OriginTabUnloader` (`src/zen/tabs/OriginTabUnloader.sys.mjs:72-83`). It is not armed by default, because both `origin.tabs.unload-after-minutes` and `origin.memory.trim-after-idle-minutes` are 0 (`prefs/origin/tabs.yaml:7-19`).

So the gains left in Zen's code are in normal use: page loads (session writes), several windows (window sync), the URL bar and hover. They are not in the idle scenario.

## Top 15, ranked by expected gain for a user with many tabs open all day

### 1. Every session save writes Zen's copy of the session and copies the old one first

Where: `src/browser/components/sessionstore/SessionSaver-sys-mjs.patch:26` calls `ZenSessionStore.saveState(state)` inside Firefox's `_saveState`, right before Firefox writes its own file. `saveState` is at `src/zen/sessionstore/ZenSessionManager.sys.mjs:598-627`.

Trigger and frequency: each Firefox session save. Firefox saves when the state is dirty, at most every 40 s here (`prefs/firefox/browser.yaml:124-126`). Scrolling, typing in forms, navigation and title changes all make it dirty, so a user who browses all day gets close to 90 saves an hour.

What each save does on top of Firefox's own write:

1. `IOUtils.copy` of `zen-sessions.jsonlz4` to `zen-sessions-backup/clean.jsonlz4` (`:606-612`), a full read and write of the file.
2. `this.#file._save()` (`:621-623`) through `JSONFile`, which calls `IOUtils.writeJSON` with `backupFile` set (`:102-113`). That renames the old file to `zen-sessions-backup/recovery.baklz4`, serializes the sidebar to JSON on the main thread, then compresses and writes a `.tmp` file and renames it.

Zen's file holds the full tab state, history entries included. In the harness template `origin-v3/base` it is 21,466 bytes against 22,859 for Firefox's `sessionstore.jsonlz4`, so Zen's file is about the same size as Firefox's. The session disk traffic is about three times Firefox's: Firefox writes once, Zen copies once and writes once. The main thread also serializes the tab data twice per save.

Rough cost, unverified: with 200 to 500 tabs a session file is often 1 to 3 MB compressed. That is 3 to 9 MB of writes per save instead of 1 to 3, and 10 to 30 ms more main-thread JSON work every 40 s while the user browses.

`clean.jsonlz4` and `recovery.baklz4` end up holding the same thing, the previous file, because the copy and the rename both start from it. So the copy buys nothing between saves.

Smallest fix: copy to `clean.jsonlz4` once per launch, on the first save, instead of on every save.

Bigger fix, needs a decision: stop storing tab `entries` in Zen's file and take them from Firefox's state on restore. That is a session format change and it touches restore code, so it is risky.

Risk of the small fix: low. The recovery order at `:135-149` still finds `clean.jsonlz4`, which now holds the state from the start of the session instead of one save back. `recovery.baklz4` still holds the save before the current one.

### 2. A tab moving between windows takes a full-viewport PNG snapshot

Where: `src/zen/sessionstore/ZenWindowSync.sys.mjs:736-758` (`#swapBrowserDocShellsAsync`), `:952-976` (`#styleSwapedBrowsers`), `:984-1003` (`#captureBrowserToURL`) and `:1011-1021` (`#createPseudoImageForBrowser`).

Trigger: with two or more synced windows, selecting a tab in window B whose page lives in window A, or focusing a window whose selected tab's page lives in another window (`#onTabSwitchOrWindowFocus`, `:1118-1170`). Frequency is once per such tab switch or window focus. With one window this never runs.

What it does: `drawSnapshot` of the whole viewport at device pixel ratio, drawing it into an `OffscreenCanvas`, a PNG encode with `convertToBlob`, an object URL, and an `<img>` that is decoded and placed over the old browser at 40% opacity (`src/zen/common/styles/zen-browser-container.css:66-74`). The image stays in that window until the same tab swaps back into it (`#maybeRemovePseudoImageForBrowser`, `:1027-1038`).

Rough cost, unverified: on a 2x MacBook screen the viewport is about 2900 by 1800 pixels. That is a 20 MB readback, a PNG encode of 50 to 150 ms of CPU on a background thread, and a decode. Each image that stays behind keeps its PNG blob, about 1 to 5 MB, alive. Its decoded pixels can be discarded while hidden. Over a day with two windows, each window can collect one image for every tab that ever moved out of it.

Smallest fix: skip the snapshot when the window that loses the page is hidden or minimized (`aOtherTab.documentGlobal.document.hidden`), since nobody sees the stand-in. Encoding at scale 0.5, or as JPEG, would also cut the cost for the visible case.

Risk: low for the hidden-window skip. A window that becomes visible again shows about:blank for a frame instead of the faded snapshot.

### 3. A swap loads about:blank in the losing window and keeps that browser alive

Where: `src/zen/sessionstore/ZenWindowSync.sys.mjs:900-921`, inside `#swapBrowserDocShellsInner`.

Trigger: the same swaps as finding 2. When the browser that ends up in the losing window had a real page, Zen loads about:blank into it with `LOAD_FLAGS_REPLACE_HISTORY`. The TODO comment at `:902-906` says so.

Cost, unverified: one page load per swap, and one live remote browser holding about:blank for each tab that was ever shown in two windows. Each one is a `BrowserParent` plus a document in a content process, guessed at 0.3 to 1 MB. With 50 tabs viewed in both of two windows that is 15 to 50 MB.

Smallest fix: none of one line. Firefox expects a selected tab to have a browser, so Zen cannot just unload it. A real fix discards the losing browser when that tab is not selected in its window. That is design work in window sync, so I list it here for the record and would not do it first.

Risk: medium to high. Window sync is subtle and has many issue numbers in its comments.

### 4. Window sync mirrors every tab into every window

Where: `src/zen/sessionstore/ZenWindowSync.sys.mjs:1366-1408` (`on_TabOpen`). Every tab opened in one window gets an `addTrustedTab("about:blank", { animate: true, createLazyBrowser: true })` copy in every other synced window. Label, icon, move, pin and group changes are copied as well (`:1410-1425`, `:518-560`).

Trigger: each tab open, per extra window. Memory scales with tabs times windows.

Cost, unverified: a tab element with Zen's extra parts (`src/browser/components/tabbrowser/content/tab-js.patch:9-21`) is about 30 elements with their style data and Fluent attributes. I guess 10 to 20 KB per tab per window, so 300 tabs cost 3 to 6 MB in each extra window. `animate: true` also plays the tab open animation in windows the user is not looking at. That animation belongs to the Motion work.

Smallest fix: the pref `zen.window-sync.sync-only-pinned-tabs` already exists (`prefs/zen/window-sync.yaml:17-18`, read at `ZenWindowSync.sys.mjs:32`, `:316`, `:1181`). Setting it to true mirrors only pinned tabs and Essentials. Also pass `animate: false` for the copies at `:1387`.

Risk: the pref changes behaviour, because normal tabs stop showing up in other windows, and Zen users rely on that. It is a feature cut, so ask the user. `animate: false` for copies has no visible effect, because the copies open in other windows.

### 5. Every window loads its own copy of about 610 KB of Zen modules

Covered in `lazy-load-2026-10-13.md`, section 1 and candidates 1, 4 and 5. I list it here only for the ranking: for a user with several windows it is the largest per-window memory item in Zen's own code. The guess there is 1 to 3 MB per window.

### 6. Hovering the top strip may resize the web page for 0.15 s each way

Where: `src/zen/common/styles/zen-browser-container.css:36-61` transitions `margin` on the selected `.browserContainer` while `#tabbrowser-tabpanels[has-toolbar-hovered]` is set. `src/zen/compact-mode/ZenCompactMode.mjs:686-697` sets that attribute when the navbar wrapper gets hover. That wrapper is a hoverable element even with compact mode off (`:605-622`, listeners added from `:89` and `:719-826`).

Trigger: the pointer entering and leaving `#zen-appcontent-navbar-wrapper`, the strip at the top of the window. With Origin's prefs (`zen.view.use-single-toolbar` and `zen.view.hide-window-controls` both true, `prefs/zen/view.yaml:16-26`) the attribute is set only when the wrapper has `should-hide` or the bookmarks toolbar shows. I did not confirm when `should-hide` is set, so whether this fires with default prefs is unverified.

Cost if it fires: `margin` is a layout property on the web view. Each frame of the 0.15 s transition resizes the content area, so the page reflows and gets `resize` events about 9 times on a 60 Hz screen and about 18 times on 120 Hz, twice per hover.

Smallest fix: animate a `transform: translateY()` instead of `margin`, or drop the transition and jump.

Risk: low for the look, since the page moves the same distance. A transform does not change the layout height, so the page's bottom edge would need checking.

### 7. The URL bar actions provider re-formats about 40 strings on every keystroke

Where: `src/zen/urlbar/ZenUBGlobalActions.sys.mjs:281-299`. Each global action has a `label` getter that calls `l10n.formatValueSync` on every read. `ZenUBActionsProvider.sys.mjs:252-282` (`#findMatchingActions`) reads every label for fuzzy scoring. `#getAvailableActions` (`:238-243`) calls `isAvailable`, which does a `getElementById` per action. It also calls `#getExtensionActions` (`:205-232`), which runs `AddonManager.getAddonsByTypes(["extension"])` and one more `formatValueSync` per extension. `#getWorkspaceActions` (`:174-202`) adds one `formatValueSync` per space.

Trigger: every URL bar query longer than 2 characters that is not a URL (`isActive`, `:160-172`). That means every keystroke while typing a search.

Cost, unverified: about 39 actions (39 `l10nId` entries in the file), plus spaces and extensions, so 40 to 60 synchronous Fluent formats and an add-on query per keystroke. I guess 0.5 to 2 ms of parent main thread per keystroke.

Smallest fix: memoize the label in the getter and clear the cache on `intl:app-locales-changed`. Do the same for the two strings at `ZenUBActionsProvider.sys.mjs:190` and `:223`.

Risk: low.

### 8. The Spaces sync engine hashes every record after every session save

Where: `src/zen/sync/ZenSpacesSync.sys.mjs:93-121`. The tracker observes `zen-sidebar-data-collected`, which `ZenSessionManager.saveState` sends on every save (`ZenSessionManager.sys.mjs:616`). It calls `hasPendingChanges` (`ZenSpacesSyncModel.sys.mjs:793-822`), which rebuilds the projections and computes a SHA-256 of the canonical, key-sorted JSON of every tab, folder, space and split record (`#digestAll`, `:712-725`, `recordDigest`, `:130-138`).

Trigger: each session save, but only while Firefox Sync is signed in with the Spaces engine on. The tracker starts only then.

Cost, unverified: with 300 synced tabs, a few hundred sorted clones, stringifications and hashes, guessed at 5 to 20 ms of main thread every 40 s while browsing. The digest cache only helps within one save.

Smallest fix: compare a cheap stamp of the sidebar (tab count plus `lastCollected`, or a dirty flag set by the events that change synced fields) before hashing.

Risk: medium. A missed change means a missed upload, and gh-15426 in the comments shows how easily tombstones go wrong.

### 9. Search mode plays a 1 s box-shadow animation up to a 250 px blur

Where: `src/zen/common/styles/zen-omnibox.css:290-300` and the keyframes at `src/zen/common/styles/zen-animations.css:20-29`. `ZenUIManager.mjs:497-521` sets `animate-searchmode` for 1 s.

Trigger: each search mode change while the URL bar is open, such as picking a search engine, a `@` keyword or the actions mode.

Cost, unverified: 60 frames, or 120 on ProMotion, each redrawing a box-shadow whose blur grows to 250 px around the URL bar. Big blurs are expensive shadow render tasks in WebRender. `zen-effects-2026-10-12.md` lists the effect but does not rank it.

Smallest fix: draw the glow once at its largest size and fade it with `opacity` only, or remove it.

Risk: low. The flash looks a little different.

### 10. Opening a window rewrites the keyboard shortcuts file and rebuilds every window's keys

Covered in `lazy-load-2026-10-13.md`, candidate 2: `ZenKeyboardShortcuts.mjs` `init()` writes `zen-keyboard-shortcuts.json` (35,660 bytes in the harness template) and rebuilds the keyset in every open window each time a window opens. For a user who opens and closes windows all day, that is one disk write and n keyset rebuilds per window.

### 11. The URL bar learner rewrites prefs.js after URL bar sessions

Where: `src/zen/urlbar/ZenUBActionsProvider.sys.mjs:539-551` (`onSearchSessionEnd`) calls `recordExecution`, which always ends in `saveDatabase` (`ZenUBResultsLearner.sys.mjs:55-60`, `:62-84`). That is a `setStringPref` of `zen.urlbar.suggestions-learner`.

Trigger: each URL bar session that ends with a picked result, any result, not only an action. The value changes whenever actions were shown during the session, because shown-but-unused commands get a lower score until they reach -5.

Cost, unverified: a changed pref makes Firefox write the whole `prefs.js`, often 50 to 200 KB, soon after. For a user who searches from the URL bar all day, that is one extra `prefs.js` write per search that showed actions.

Smallest fix: compare the new JSON with the old one and skip `setStringPref` when nothing changed. Moving the data to a `JSONFile` in the profile would keep it out of `prefs.js`.

Risk: low.

### 12. Hover handlers for compact mode run with compact mode off

Where: `src/zen/compact-mode/ZenCompactMode.mjs:89` calls `addMouseActions` at window start whether or not compact mode is on. `:735-758` handles each `mouseover` with a `setTimeout(0)` and then a `requestAnimationFrame`. `:760-821` handles each `mouseleave` with a `setTimeout`, a `:hover` match and another rAF. The `hoverableElements` getter (`:605-622`) builds a new array and reads a pref on every access, and `onLeave` reads it per event (`:807-808`).

Trigger: `mouseover` bubbles, so every time the pointer crosses into a new child of the sidebar, the navbar wrapper or the window buttons. That is tens of times per second while the pointer moves over the tab list.

Cost, unverified: small per event. Each rAF asks the refresh driver for a tick it would mostly run anyway for hover styles, and it toggles `zen-has-hover` on `gNavToolbox`, which restyles the toolbox. I guess under 0.5 mW while the mouse moves, and nothing while it is still.

Smallest fix: return early in `onEnter` when `target.hasAttribute("zen-has-hover")` is already true, before the timeout. Only add the sidebar listeners while compact mode is on, if the non-compact hover attribute is not needed.

Risk: low for the early return. Medium for skipping the listeners, because `zen-has-hover` also drives the top strip and window buttons outside compact mode.

The `ZenHasPolyfill` observer on the navbar wrapper (`ZenCompactMode.mjs:198-230`, `ZenHasPolyfill.mjs:57-87`) watches `childList` and `subtree` with an attribute filter and runs a `querySelector` per batch. It is always connected. With compact mode on, a second one watches the whole `gNavToolbox`, including the tab list. Tab opens, closes and moves then each run a `querySelector` over the sidebar. That is small, but it fires on page loads too if tab label changes count as child list changes (unverified).

### 13. Session backups and debug logging on every save

Where: `ZenSessionManager.sys.mjs:115-117` arms a `DeferredTask` with a 10 minute delay (`:55`) on every save (`:644`). It copies the session file into a 3 hour slot file and lists the backup folder (`:658-707`). `zen.session-store.log` is true (`prefs/zen/session-store.yaml:8-9`, read at `ZenSessionManager.sys.mjs:23-28`), so every save also sends a `console.debug` line into the console service's in-memory store (`:626`).

Cost: one extra full copy of the session file every 10 minutes while browsing, and one console message per save. Both are small next to finding 1.

Smallest fix: set `zen.session-store.log` to false, the same as `zen.window-sync.log`. The backups are worth keeping.

Risk: none for the log pref.

### 14. Each tab label change fires a Zen event and goes through window sync's queue

Where: `src/browser/components/tabbrowser/Tabbrowser-sys-mjs.patch:228-233`. `#setTabLabel` calls `gZenPinnedTabManager.onTabLabelChanged` (`ZenPinnedTabManager.mjs:1140-1144`) before it checks whether the label changed. The `ZenTabLabelChanged` event goes into window sync's promise queue (`ZenWindowSync.sys.mjs:403-427`), and then re-labels the same tab in every other window (`:1419-1425`, `:546-555`). `setIcon` does the same for icons (`Tabbrowser-sys-mjs.patch:162`, `ZenPinnedTabManager.mjs:104-110`, `ZenWindowSync.sys.mjs:1410-1417`).

Trigger: several times per page load, on every title or icon update. Pages that animate their title or favicon, like chat apps with unread counts, trigger it continuously.

Cost: with one window, a `CustomEvent`, a promise and a loop over no windows. That is tiny. With n windows, a label set and restyle in each other window.

Smallest fix: dispatch after the existing "label unchanged" early return in `#setTabLabel`, not before it.

Risk: low. Window sync would stop receiving no-op label events.

### 15. The notification icon box transitions `all`, margin included

Where: `src/zen/common/styles/zen-omnibox.css:320-325`. `#notification-popup-box` gets `transition: all 0.2s` with a negative `margin-inline-start` while hidden.

Trigger: each time a permission or notification anchor shows or hides in the URL bar. Pages that ask for notifications, location or autoplay do this on load.

Cost: a 0.2 s layout transition of the URL bar row, about 12 frames of reflow in the chrome document. Small, but it lands on page loads.

Smallest fix: transition only `opacity` and `margin-inline-start`, or `opacity` with a `translate`.

Risk: low.

## Looked at and found cheap

- `ZenSpaceManager.onLocationChange` on TabSelect, `ZenFolders.on_TabSelect` and `ZenViewSplitter.onTabSelect` are covered in `tab-switch-2026-10-13.md` and stay cheap.
- `updateTabsContainers` runs from TabOpen, TabClose, pin changes and `updateTabsToolbar`, but it collapses into one rAF (`ZenSpaceManager.mjs:2697-2721`). Per run it loops over spaces and their tab lists once. That is fine at hundreds of tabs.
- `recalculateURLBarHeight` is already coalesced to one double rAF (`ZenUIManager.mjs:1266-1280`).
- `allStoredTabs` is cached and cleared through `_invalidateCachedTabs` (`tabs-js.patch:190-193`).
- `ZenPinnedTabManager`'s tabs progress listener only handles `onLocationChange` for pinned tabs (`ZenPinnedTabManager.mjs:911-943`).
- The site data panel listener only toggles one button on location change (`ZenSiteDataPanel.sys.mjs:118-128`).
- `onWorkspaceChange` already skips the closed theme panel's DOM (`ZenGradientGenerator.mjs:1590-1595`), so someone has acted on `space-switch-2026-10-13.md`.
- The emoji data is freed when its panel hides (see `lazy-load-2026-10-13.md`).
- Forced layout reads (`getBoundingClientRect`, `getComputedStyle`) in `src/zen` are almost all in drag and drop, split view resizing and folder animations, so they run only during those actions.
- No favicon colour extraction exists in this tree. Essentials use the icon URL as a CSS variable (`ZenPinnedTabManager.mjs:112-115`) and the blur covered in `tab-switch-2026-10-13.md`.

## Harness scenarios worth adding

`scripts/perf/run` has launch, idle, minimized, switch, sidebar, split, scroll, video, typing and bgtimer. None of them loads pages repeatedly, uses two windows or types into the URL bar, and those are where the findings above live. `zo-stat` already records `bytes_written`, and `report` turns it into `app_disk_kb_s`.

1. Add `pageload`: load 30 fixture pages one after another in one tab, about 2 s apart, then measure 60 s. Report `app_disk_kb_s` and parent CPU. It shows finding 1 directly, with `browser.sessionstore.interval` set to 15 s in the run prefs so a 90 s window holds several saves.
2. Add `windows`: open a second window, select the same tab in both, then alternate focus 20 times. Report parent and content CPU, GPU time and footprint before and after. It covers findings 2 to 4.
3. Add `urlbar`: focus the URL bar and type a 30 character search with `zo.ui type`, then Escape, 10 times. It covers findings 7 and 11 and the cost of the floating URL bar opening.
4. Add `topedge`: with compact mode off, glide the pointer from the page to the top edge and back 20 times. Watch `RefreshDriverTick` markers and content process CPU. If the content process wakes, finding 6 fires with default prefs.
5. Add a `newwindow` variant of launch that opens and closes 5 windows. Report disk writes and parent CPU, for finding 10 and the per-window module load.

A quick check for finding 1 needs no new scenario. Run `scroll` and `video-windowed` for zen-stock and origin and compare `app_disk_kb_s`. Scrolling makes the session dirty, so a save should land inside the 46 s window.

## Finding 6 in detail

Short version: with Origin's default prefs on macOS the margin transition never fires, with compact mode on or off. Finding 6 as ranked above is wrong for defaults. It fires only with the bookmarks toolbar shown or the sidebar on the right.

### When `has-toolbar-hovered` is set

`ZenCompactMode.mjs:686-697` sets it in `_setElementExpandAttribute`, only for `#zen-appcontent-navbar-wrapper`, and only when `zen-has-hover` is being set (`:663-685` returns early if `zen.view.compact.show-sidebar-and-toolbar-on-hover` is false, which is true by default). Then one of these must hold:

- `_hasSetSingleToolbar` and (the wrapper has `should-hide` or the root has `zen-has-bookmarks`).
- The compact-mode pref, `zen.view.compact.hide-toolbar` and not single toolbar. Origin ships single toolbar and `hide-toolbar` false, so this branch is dead.

`should-hide` is set in `ZenUIManager.mjs:1480-1489`. It needs single toolbar and one of: left sidebar with Windows-style buttons, right sidebar with Mac-style buttons, or compact mode with Windows-style buttons. `isWindowsStyledButtons` is false on macOS (`:1027-1035`). `zen.tabs.vertical.right-side` is false (`prefs/zen/zen.yaml:8`). So on a Mac with the defaults `should-hide` is never set.

`zen-has-bookmarks` is set only while the bookmarks toolbar is visible (`ZenUIManager.mjs:252-267`). Origin shows none by default.

The hover listeners run in both modes (`ZenCompactMode.mjs:719-826`), so `zen-has-hover` is set on the wrapper when the pointer enters it. With the defaults nothing reacts to it, and `has-toolbar-hovered` stays unset.

### What the top strip is

With single toolbar the wrapper holds only the window buttons on Windows-style layouts. On macOS the traffic lights stay in the sidebar top buttons, so the wrapper is an empty strip `--zen-element-separation` high (`zen-tabs.css:21-30`). Compact mode changes nothing here: it moves the navbar into the titlebar (`ZenUIManager.mjs:1526-1531`) but does not touch the wrapper. The show/hide rules for the strip (`zen-tabs.css:40`, `vertical-tabs-topbar.inc.css`) apply only under `[should-hide]` or `[zen-has-bookmarks]`.

When they do apply (bookmarks case), the wrapper animates `height` and `opacity`, 0.15 s `ease-in-out`, with a 0.2 s delay (`vertical-tabs-topbar.inc.css:18-20`, `zen-theme.css:204-205`). It goes from `--zen-element-separation` to 34 px (the local `--zen-toolbar-height`) and from opacity 0 to 1.

### Does the margin transition run

Defaults, compact off or on: no. The `margin` transition is declared (`zen-browser-container.css:39-42`) but `margin-top` never changes.

Bookmarks toolbar shown, or sidebar on the right: yes. `margin-top` goes to about `-(34px - separation)` after the same 0.2 s delay. The wrapper's height grows by the same amount in the same frames, so I expect the page's own height to stay constant. The tabbox shrinks while the container is stretched back by the negative margin. I did not verify this, and if the two ever fall out of step the page resizes. Either way, `height` and `margin` are both layout properties, so the parent process runs layout for the window every frame of the transition.

Frames: 0.15 s is 9 frames at 60 Hz and 18 at 120 Hz, after a 0.2 s wait. That is once on enter and once on leave. The leave side waits `HOVER_HACK_DELAY` plus a frame first.

### Smallest change if you want one

Nothing is needed for defaults. For the bookmarks and right-sidebar cases, the margin transition is what cancels the wrapper's height transition, so both must change together or the page resizes. Make both instant and keep the opacity fade:

```css
/* zen-browser-container.css:39 */
transition: none;

/* vertical-tabs-topbar.inc.css:18 */
transition: opacity var(--zen-hidden-toolbar-transition);
```

Both changes land in the same frame, so the net page size and position stay constant. The look changes only in that the strip's background appears at full height at once while its contents fade in. A pure transform and opacity version would need the wrapper taken out of flow (position absolute over the page) and the margin rule deleted. That is a bigger diff against Zen, so I would not do it for a case Origin's defaults never hit.

Risks, all unverified: the bottom edge of the page lifts by the margin if the browser container does not stretch with the negative margin. The rounded corners are on `.browserSidebarContainer` (`zen-browser-container.css:7-15`, `overflow: clip`), a parent of the margin target, so they should not move. Split view panes get the same margin rule (`[zen-split="true"]`), so each pane would jump together, which also needs a look.

### Can the harness see it

`scripts/perf/run` has `sidebar`, which glides the pointer to the left edge with `zo.ui("move", x0, y0, x1, y1, ms)` 20 times (`run:197-215`) and measures with `self.measure(name, seconds, action)`. It runs Zen with `zen.view.compact.enable-at-startup`. There is no top-edge scenario, and `zo.py` has no scenario list, only the helpers.

A `topedge` scenario would copy `s_sidebar`: `inside = (x + 700, y + 400)`, `edge = (x + 700, y + 2)`, glide there and back over 300 ms with a 1 s pause, 20 times, over 54 s. With Origin defaults it would measure nothing, which confirms the "never fires" result. To exercise the transition it needs a variant that sets `browser.toolbars.bookmarks.visibility` to `always` (or `zen.tabs.vertical.right-side` true). Then compare parent CPU and `RefreshDriverTick` counts against the default run. Content process CPU should stay flat if the page size really is constant (unverified).
