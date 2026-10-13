# Cuts

Every Zen feature Origin removes, one line each, so the user can veto any of them. The cuts are in the working tree and get committed after the first build passes. Evidence with file and line numbers is in `docs/research/zen-features-2026-10-12.md`.

Status 2026-10-13: the user said to go ahead with the debloat, and every cut below is done unless its line says otherwise. The user can still veto any cut, and each one can come back.

## Cut by the spec

- Boosts: per-site colour, font and CSS tweaks. Done, and all 51 of its Firefox C++ patches are gone too.
- Glance: opens a link in a floating preview card over the current page. Done.
- Zen Mods and the theme store: installs community CSS mods from zen-browser.app and auto-updates them every 20 days. Done.
- Live folders: folders that refill themselves from an RSS feed or GitHub, on timers. Done. Workspace sync no longer imports them, and folder records still send `live: null` so Zen clients can read them.
- Space routing: opens chosen sites in chosen workspaces. Done.
- Library (`src/zen/library/`): Zen's own panel for downloads, history and spaces, opened from the sidebar. Done.
- Share: uploads a space, folder or split view to share.zen-browser.app for others to open. Done.
- Sidebar media controls: the card for playing media at the bottom of the sidebar. Done, and its 5 Firefox patches are gone.
- Welcome flow and its video: first-run onboarding with a 15 MB video packed into every build. Done.

## Also cut, because no kept feature needs them

- Download animation: an icon flies to the downloads button when a download starts. Done.
- Update notice and sidebar notification: a "what's new" card after each update, with a donate link to zen-browser.app. Done. `ZenUpdates.mjs` keeps only the window sweep animation, because workspace sync plays it on first sync.
- Startup watermark: on official builds the whole UI starts invisible and fades in after launch. Done.
- Loading progress bar: Zen's thin bar while a page loads, two of Zen's nine looping animations. Done. Firefox's tab loading indicator stays.
- Window drag from page content: drag the window by empty areas of a web page. Done.
- Haptic feedback: trackpad taps while dragging the theme picker's sliders. Done.
- Zen's native share sheet: the macOS share menu behind the copy-link toast. Done, and the whole `src/zen/toolkit` service is gone. Firefox's own File > Share menu stays.
- Workspace bookmarks: bookmarks that belong to one space, wired in through 6 Places patches. Done. The two extra tables stay untouched in existing `places.sqlite` files.
- Tab rename: the context menu item and its pref are gone. Folder and space renaming still use the shared rename code, which keeps the tab branches as dead code behind a `ponytail:` marker. Double-click rename is gone for tabs, and custom titles from a Zen profile stay until you reset the pinned tab or close the tab.
- Clear tabs button: the button is gone. The command and its Accel+Shift+K shortcut stay.
- App updater: Zen's builds update from updates.zen-browser.app. Origin builds with `--disable-updater` (`configs/macos/mozconfig`) until its own signed feed on GitHub Pages exists.
- Twilight brand: Zen's nightly-style brand and its icons in `configs/branding/twilight`. Origin builds only the release brand.
- Mozilla branding art: `scripts/make-icon.swift` now also writes `disk.icns`, `background.png` and `Assets.car` into `configs/branding/release`, replacing the last Mozilla unofficial images. Only Mozilla's `dsstore` remains, which holds the DMG window layout and no artwork.
- Window sync notice: a one-time dialog with a "Learn more" link to docs.zen-browser.app (`_migrateV6` in `ZenUIMigration.sys.mjs`).
- Mozilla's "Want to help?" donate links in the About dialog, hidden with CSS because `aboutDialog.js` still reads the elements.
- Hidden AI settings: Origin turns the remaining AI features off by pref in `prefs/origin/ai.yaml`. That covers smart tab groups, the extensions ML engine and the chatbot page entries. Translations keep working. Zen's patch that hides rows in Firefox's AI controls page is still in, pending a decision.
- Acrylic effect: the blurred see-through urlbar and compact sidebar, only on twilight builds, through `backdrop-filter`. Done. The spec bans backdrop-filter in the UI, and it was off in release builds anyway. The prefs `zen.theme.acrylic-urlbar` and `zen.theme.acrylic-sidebar`, `zen-backdrop-filters.svg` and the `zen-no-acrylic` attribute code are gone. The notification bar and the theme picker's colour deck lost their blur too, with a higher opacity to stay readable.
- External patch `backdrop_filter_reads_web_content`: only did something with acrylic on, so it was dormant. Deleted.
- External patch `expose_tiled_attribute_to_all_platforms`: it sets `:root[tiled]` on macOS through a private `NSWindow` call, and no CSS or JS in Origin reads that attribute. Deleted.
- External patch `issue_14710`: skips picture-in-picture auto-toggle after the user closes it on purpose. It only runs when the tab-switching auto-PiP pref is on, and Zen sets that off, so it was dormant. Deleted.
- External patch `override_cert_checks_temp`: only compiles on Windows. Deleted.
- Firefox's built-in add-ons `ipp-activator` (the helper for IP Protection, which Origin removed) and `search-detection` (reports search-engine changes by add-ons to telemetry, which is off). Both started a background page at launch and listened to tab or request events. Not built anymore (`src/browser/extensions/moz-build.patch`). Webcompat, form autofill, picture-in-picture and the new tab add-on stay.
- Leftover assets of cut features: `zen-branding.css` and its two Junicode fonts (only the cut welcome screen used the `.zen-branding-title` class) and the downloads `archive.svg` (only the cut download animation used it). The stylesheet loaded in every window. Deleted, with Junicode's notice in `THIRD_PARTY.md`.

## Motion and loops

Origin drops the vendored Motion library (`src/zen/vendor/`, 140 KB). Each animation now runs through `gZenUIManager.animate()`, a small wrapper around Gecko's `element.animate()` on transform and opacity only. Motion's springs became fixed `linear()` easings sampled from Motion's own curves, with the same durations. Under Reduce Motion every one of them finishes at once.

- Create button plus icon: Motion rotate, now the same rotate through `element.animate()`.
- URL bar search mode pulse: Motion scale, now the same scale pulse.
- Toasts: Motion scale spring and fade, now the same transform keyframes with the spring as `linear()`.
- Tab and folder open: Motion fade, scale, label blur and a margin that pushed the tabs below down. Now fade and scale, and the visible items below slide down with a transform over the same 120 ms. The label blur is gone.
- Tab and folder close: Motion fade, scale and a margin that pulled the tabs below up. Now fade and scale, and the visible items below slide up with a transform over the same 100 ms, then take the item's place when it is removed.
- Tab rename pulse: Motion scale, now the same scale pulse.
- Window sweep after sync: Motion on `top` and on a gradient position custom property, now two CSS keyframes on transform and opacity with the same timing.
- Theme picker dots: Motion spring on `left` and `top`, now the dot jumps to its place and slides there with a `translate` spring.
- Space switch: Motion's `animateMini` crossfade and slide, now the same keyframes. The slide no longer animates `padding-top`.
- New space form closing: Motion slide, fade and blur with a stagger, now slide and fade with the same stagger and no blur.
- URL bar dim while creating a space, and the reveal after it: Motion fades, now the same fades.
- Compact mode sidebar: Motion on margins, now a transform slide. The page resizes in one step at the end of hiding and at the start of showing.
- Split view drop target: Motion on padding, width and margin, now the page takes its split size at once and the drop target slides and fades in from its edge.
- Split view drop: Motion scale and fade spring, now the same keyframes.
- Feature callout title: the looping gradient sweep is gone, the gradient text stays still. It was the last of Zen's nine loops. The other eight left with the media controls, Boosts, the loading bar, the sidebar notification and the library.

## Hot paths

Smallest fixes from `docs/research/zen-hot-paths-2026-10-13.md`, not measured yet.

- Session save copies `zen-sessions.jsonlz4` to `zen-sessions-backup/clean.jsonlz4` once per launch instead of on every save, and recovery tries `recovery.baklz4` first.
- Window sync skips the viewport snapshot and its stand-in image when the window that loses the page is hidden or minimized.
- Window sync opens its tab copies in other windows with `skipAnimation`, so no open animation plays in windows nobody is looking at.
- URL bar actions keep their Fluent labels until the app locale changes, instead of formatting about 40 strings on every keystroke.
- `zen.session-store.log` is off, so a session save no longer logs a console line.
- Tab label and icon changes reach the pinned tab manager and window sync only when the label or icon really changed.

## Kept after review

- Essentials promo: kept. It is the only drop target while Essentials is empty, so removing it would stop you dragging your first tab into Essentials.
- Site data panel: kept for now, without its Boosts and Share parts. Replacing it with Firefox's popup still needs a visual check beside Zen's URL bar.

## Added, not cut

- Automatic tab unloading (`src/zen/tabs/OriginTabUnloader.sys.mjs`): off since 2026-10-13, because the user switches between many tabs all day. `origin.tabs.unload-after-minutes` turns it on: a background tab then unloads after that many minutes. The selected tab, split view panes and tabs with media or calls stay loaded, and Essentials stay unless `origin.tabs.unload-essentials` is true.
- Memory trim (same file): after 10 minutes without input or with another app in front, one memory-pressure notification drops WebRender's and the pages' caches (`origin.memory.trim-after-idle-minutes`, 0 turns it off). It skips while media plays or a call runs. Back then reloads pages instead of using the back-forward cache.
- Translations' language detector (`src/toolkit/components/translations/LanguageDetector-sys-mjs.patch`): its worker stops after a minute without page loads instead of living for the session. The user's report showed it at 17.5 MB.
- Animation speed (`prefs/origin/ui.yaml`, `origin.ui.animation-speed-percent`): the UI's transitions and animations run 2.5 times as fast as Zen's, at the user's request. 100 is Zen's speed.
- Memory prefs (`prefs/origin/memory.yaml`): no spare content processes and no preloaded new tab page.
- Background prefs (`prefs/origin/background.yaml`): no Nimbus rollouts and no captive portal check, because macOS shows its own Wi-Fi login sheet.
- Startup helpers cut from `BrowserComponents.manifest`: Firefox's IP Protection, link preview and content relevancy no longer start at launch, and their prefs (`browser.ipProtection.enabled`, `browser.ml.linkPreview.enabled`) are locked off in `prefs/origin/startup.yaml` and `prefs/firefox/ai.yaml`.
- Firefox prefs (`prefs/origin/firefox.yaml`): global AI switch blocked with Translations kept available, usage reporting and connectivity checks off, no sponsored new tab content, a blank homepage and new tab page with 12 widget feeds and the wallpaper fetch off, and Firefox's low-memory tab unloading on (`browser.lowMemoryResponseMask` 3, acts only when macOS reports critical memory pressure).

## Replace with Firefox's own, after the rewrite study

Firefox 157 ships these, and the spec says to use Firefox's version where it does the job and looks right. Zen turns each one off and runs its own. The rewrite study decides how far this goes, so none of them is cut yet.

- Zen's split view (Firefox has split view since 149, Zen locks `browser.tabs.splitView.enabled` off and replaces it).
- Zen's vertical tab sidebar layout (Firefox has `sidebar.revamp` and vertical tabs since 136, Zen locks both off but reuses Firefox's vertical tab code paths).
- Compact mode's own hover reveal and native pointer tracker (Firefox's sidebar has expand on hover).
- Essentials grid (Firefox has a pinned tab grid in vertical mode, Zen turns off its drag logic).

## Kept, because kept features need them

- Window sync: keeps spaces and Essentials the same in every window, and Essentials and spaces call it directly.
- Tab drag and drop: moving tabs into folders, Essentials and split views.
- Emoji picker: the icons of spaces, folders and pinned tabs.
- Menubar integration: the Spaces menu and View > Appearance.
- UI migration: upgrades the prefs and data of older Zen profiles, so a copied Zen profile opens intact.
- Workspace sync over Firefox Sync (`src/zen/sync/`): it syncs spaces, folders and pinned tabs. Whether it costs anything at idle gets measured in milestone 2.
- The native window material (`ZenWindowMaterialView`): it is the see-through look, and its cost is in `docs/benchmarks.md`.

## Not built on macOS, left alone

Windows Mica, GTK transparency, the Windows pointer tracker and the Windows installer patches never reach a macOS build, so deleting them saves nothing and only makes rebases harder.

## To review in milestone 2 (not cuts)

These are still open decisions.

- `prefs/privatefox` and `prefs/fastfox` are reviewed (`docs/research/firefox-prefs-2026-10-13.md`) and none of their prefs changes a shipped security feature.
- Zen's external Firefox patches (`src/external-patches`) are reviewed too and none weakens a security feature. Four are deleted, see above.
