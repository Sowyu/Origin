# Cuts

Every Zen feature Zen Origin removes, one line each, so the user can veto any of them. Nothing is removed yet: the cuts land in milestone 2. Evidence with file and line numbers is in `docs/research/zen-features-2026-10-12.md`.

Status 2026-10-12: proposed, waiting for the user's review.

## Cut by the spec

- Boosts: per-site colour, font and CSS tweaks; a C++ hook runs on every colour resolution in every content process (12 Gecko patches plus 39 colour-plumbing patches).
- Glance: opens a link in a floating preview card over the current page.
- Zen Mods and the theme store: installs community CSS mods from zen-browser.app and auto-updates them every 20 days.
- Live folders: folders that refill themselves from an RSS feed or GitHub, on timers.
- Space routing: opens chosen sites in chosen workspaces; it runs inside every `addTab` call.
- Library (`src/zen/library/`): Zen's own panel for downloads, history and spaces, opened from the sidebar.
- Share: uploads a space, folder or split view to share.zen-browser.app for others to open.
- Sidebar media controls: the card for playing media at the bottom of the sidebar.
- Welcome flow and its video: first-run onboarding with a 15 MB video packed into every build.

## Also cut, because no kept feature needs them

- Download animation: an icon flies to the downloads button when a download starts.
- Update notice and sidebar notification: a "what's new" card after each update, with a donate link to zen-browser.app.
- Essentials promo: a card that teaches you to drag tabs into Essentials.
- Startup watermark: on official builds the whole UI starts invisible and fades in after launch.
- Loading progress bar: Zen's thin bar while a page loads, two of Zen's nine looping animations. Firefox's tab loading indicator stays.
- Window drag from page content: drag the window by empty areas of a web page.
- Tab rename: double-click a tab to give it your own title.
- Clear tabs button: closes every unpinned tab in a space at once.
- Haptic feedback: trackpad taps while dragging the theme picker's sliders.
- Zen's native share sheet: the macOS share menu behind the copy-link toast. Firefox's own File > Share menu stays.
- Workspace bookmarks: bookmarks that belong to one space, stored in two extra tables in `places.sqlite` and wired in through 6 Places patches.
- Site data panel: Zen's replacement for Firefox's site identity and permissions popup in the URL bar; Firefox's own popup comes back. Check: Firefox's popup must look right beside Zen's URL bar before this one goes.
- Hidden AI settings: Zen hides Firefox's AI controls page. Zen Origin blocks AI by pref (translation stays on) and shows Firefox's page as it ships, so you can see what is off.

## Replace with Firefox's own, after the rewrite study

Firefox 157 ships these, and the spec says to use Firefox's version where it does the job and looks right. Zen turns each one off and runs its own. The rewrite study decides how far this goes, so none of them is cut yet.

- Zen's split view (Firefox has split view since 149; Zen locks `browser.tabs.splitView.enabled` off and replaces it).
- Zen's vertical tab sidebar layout (Firefox has `sidebar.revamp` and vertical tabs since 136; Zen locks both off but reuses Firefox's vertical tab code paths).
- Compact mode's own hover reveal and native pointer tracker (Firefox's sidebar has expand on hover).
- Essentials grid (Firefox has a pinned tab grid in vertical mode; Zen turns off its drag logic).

## Kept, because kept features need them

- Window sync: keeps spaces and Essentials the same in every window; Essentials and spaces call it directly.
- Tab drag and drop: moving tabs into folders, Essentials and split views.
- Emoji picker: the icons of spaces, folders and pinned tabs.
- Menubar integration: the Spaces menu and View > Appearance.
- UI migration: upgrades the prefs and data of older Zen profiles, so a copied Zen profile opens intact.
- Workspace sync over Firefox Sync (`src/zen/sync/`): it syncs spaces, folders and pinned tabs. It imports Live folders, so that link has to be cut out rather than kept. Whether it costs anything at idle gets measured in milestone 2.
- The native window material (`ZenWindowMaterialView`): it is the see-through look; its cost is in `docs/benchmarks.md`.

## Not built on macOS, left alone

Windows Mica, GTK transparency, the Windows pointer tracker and the Windows installer patches never reach a macOS build, so deleting them saves nothing and only makes rebases harder.

## To review in milestone 2 (not cuts)

- `prefs/privatefox` and `prefs/fastfox` are Betterfox-derived prefs. Any of them that changes a shipped Firefox security feature (Safe Browsing, CRLite, OCSP, Remote Settings, sandboxing, site isolation) goes back to Firefox's default.
- Zen's nine external Firefox patches (`src/external-patches`), one by one.
