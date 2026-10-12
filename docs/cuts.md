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

## Kept after review

- Essentials promo: kept. It is the only drop target while Essentials is empty, so removing it would stop you dragging your first tab into Essentials.
- Site data panel: kept for now, without its Boosts and Share parts. Replacing it with Firefox's popup still needs a visual check beside Zen's URL bar.

## Added, not cut

- Automatic tab unloading (`src/zen/tabs/OriginTabUnloader.sys.mjs`): a background tab unloads after 10 minutes, set by `origin.tabs.unload-after-minutes` (0 turns it off). The selected tab, split view panes and tabs with media or calls stay loaded, and Essentials stay unless `origin.tabs.unload-essentials` is true.
- Memory prefs (`prefs/origin/memory.yaml`): no spare content processes and no preloaded new tab page.
- Background prefs (`prefs/origin/background.yaml`): no Nimbus rollouts and no captive portal check, because macOS shows its own Wi-Fi login sheet.
- Startup helpers cut from `BrowserComponents.manifest`: Firefox's IP Protection, link preview and content relevancy no longer start at launch, and their prefs (`browser.ipProtection.enabled`, `browser.ml.linkPreview.enabled`) are locked off in `prefs/origin/startup.yaml` and `prefs/firefox/ai.yaml`.

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
- Zen's ten external Firefox patches (`src/external-patches`) are reviewed too and none weakens a security feature.
- `override_cert_checks_temp` only compiles on Windows.
- `backdrop_filter_reads_web_content` stays dormant while acrylic is off.
