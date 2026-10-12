# Licensing and trademark audit for a public macOS build

Date: 2026-10-13. Scope: Zen 1.23.2b tree in `/Users/mrm/Zen-Origin` plus the generated `engine/browser/branding/release`. Nothing was built or launched. "Unverified" marks guesses.

## Blockers for a public release

1. Nucleo icons (132 files in `src/browser/themes/shared/zen-icons/nucleo`, all 132 packed on macOS). Nucleo forbids redistribution and caps open source use at 100 icons.
2. Mozilla's "unofficial" branding art still ships because the build merges `configs/branding/release` over `engine/browser/branding/unofficial`. `Assets.car`, `disk.icns` and `background.png` are Mozilla's, not the placeholder.
3. Nothing ships the license text or notices a third party needs: no OFL text for Junicode, no MIT notice for Motion, no Ionicons MIT text in the built app. This is easy to fix but must happen before release.

Not a license issue but found on the way: `startup.homepage_*` and `app.update.url.*` in the generated `firefox-branding.js` still point at zen-browser.app (see item 8).

## 1. Icon sets

### Nucleo, `src/browser/themes/shared/zen-icons/nucleo` (133 files, 132 SVG)

- Where recorded: `nucleo/nucleo-copyright-notice.html` (Nucleo notice v1.2, 23 Nov 2023) and `zen-icons/fluent/NOTE.md`, `zen-icons/sf/NOTE.md` ("icons are using Nucleo icons"). No credit in the root of the repo. The notice file is not packed in the build.
- What the notice says: "The Nucleo icons are copyrighted. Redistribution is not permitted. Use in source and binary forms, with or without modification, is permitted only if you possess a Nucleo license."
- What the vendor says now (https://nucleoapp.com/license, fetched 2026-10-13): you cannot "sublicense, resell, share, or redistribute the icons or modified versions". Use inside an application is allowed. Open source projects, themes and templates may use "a maximum of 100 Nucleo icons" and must include the copyright notice. One project may use up to 250 icons. The page does not mention browsers or publishing SVG source in a public repo. I read the repo case as covered by the redistribution ban (unverified, ask Nucleo to be sure).
- Build count: `zen-icons/jar.inc.mn` has three blocks. The `XP_MACOSX` block (lines 139 to 272) packs 132 Nucleo SVGs and nothing else. Windows packs the same 132, Linux 132. Plus `common/` extras (urlbar-arrow, blank) and `icons.css`.
- Risk: high. The git repo itself republishes 133 Nucleo files, and the packed count of 132 is over the 100 cap even if Zen had a license. Zen's own license does not pass to a fork (unverified, Zen has no written statement).
- Smallest fix, pick one:
  1. Replace all 132 with an MIT/ISC set that has the same names, for example Lucide (ISC) or Phosphor (MIT). Same file names mean `jar.inc.mn` and `icons.css` stay as they are. Needs a visual pass.
  2. Drop Zen's override and let Firefox's own icons show. This changes more CSS and fights rebases (unverified how many selectors break).
  3. Buy a Nucleo license and keep at most 100 icons. Spec says to ask before spending money, and the redistribution ban stays, so I would not.
- Either way, delete `nucleo/` from `main`, including the notice file, so the public repo holds no Nucleo files. Note `git` history on `main` starts from the `upstream` snapshot commit, which holds them too. The `upstream` branch stays local, but `main` is rebased onto it, so the first public push contains the files in history (unverified how the push is planned). Squash or start the public history from a commit without them.

### Ionicons, `src/browser/themes/shared/zen-icons/common/selectable` (87 SVG plus CREDITS.md)

- Where recorded: `common/selectable/CREDITS.md` ("Credit to Ionicons by Ionic Framework, used under the MIT License").
- Vendor terms: MIT, "Copyright (c) 2015-present Ionic" (https://github.com/ionic-team/ionicons/blob/main/LICENSE, fetched 2026-10-13).
- Build count: all 87 are packed (`jar.inc.mn` lines 409 to 496, outside the platform blocks). The emoji picker is under "Kept" in `docs/cuts.md`, so they stay.
- Risk: low. MIT needs the copyright and permission text kept with copies. CREDITS.md links to the license but does not contain the text, and it is not packed.
- Smallest fix: keep, and add the MIT text to a `THIRD_PARTY.md` and to the about:license page or a file in the app bundle. `logo-github.svg` shows the GitHub mark, which is GitHub's trademark. Low risk as an icon choice, remove it if you want zero marks (unverified).

### Other icon sets

- `zen-icons/fluent` and `zen-icons/sf` hold only a NOTE.md. Nothing to ship.
- `zen-icons/common/urlbar-arrow.svg`, `blank.svg`: MPL header, Zen-made. Keep.
- `zen-icons/common/library/*` is already deleted (staged).
- `src/zen/images/downloads/archive.svg`, `src/zen/common/styles/zen-backdrop-filters.svg`: MPL header, no external credit. Keep.

## 2. Zen logos, wordmarks and branded images

- `configs/branding/release` (34 files): replaced by the placeholder, uncommitted. Commit it. `git status` also shows the whole `configs/branding/twilight` deletion staged, good.
- Zen artwork in git history: `main` history includes Zen's old logos. Same history point as above.
- `src/zen/images/grain-bg.png` (texture), `layouts/collapsed.png`, `multiple-toolbar.png`, `single-toolbar.png`: screenshots and a texture packed via `src/zen/images/jar.inc.mn`. They show Zen's UI, no logo. Licence not stated, they sit under the repo MPL-2.0 (unverified for the layout images, which may show wallpaper or other content). Risk low. Fix: keep, or regenerate the three layout images from Origin later.
- `src/browser/themes/shared/privatebrowsing/favicon.svg` and `src/toolkit/themes/shared/icons/indicator-private-browsing.svg`: purple private-browsing glyphs with MPL headers. They look like Firefox's private mask (unverified). The mask is a Firefox UI glyph under MPL, not a logo. Keep.
- `src/browser/components/newtab` and `aboutwelcome`: only patches, no images. The welcome flow strings are deleted (`zen-welcome.ftl` removed in every locale).
- `src/zen/tests/**` images and `gizmo.mp4`, `audio.ogg`: test fixtures, not packed in the app. Check they are absent from the public repo or fine under MPL (unverified).
- Uninstaller patch `src/browser/installer/windows/nsis/uninstaller-nsi.patch` still names `links.zen-browser.app`. Windows only, never built here. Leave.
- DMG art: no source in `src/` or `configs/`. It comes from Mozilla's unofficial branding, see item 4.

## 3. Fonts and other non-MPL files under src

- `src/zen/fonts/JunicodeVF-Roman.woff2`, `JunicodeVF-Italic.woff2`. Packed through `src/zen/fonts/jar.inc.mn`, used only by `src/zen/common/styles/zen-branding.css` as `Zen-Junicode` and `Zen-Junicode-Italic`.
- Licence: SIL Open Font License 1.1 (https://github.com/psb1558/Junicode-font lists "OFL-1.1"). I could not confirm a reserved font name from the page (unverified).
- OFL allows bundling and redistribution, including inside software, if you keep the copyright and license text with the font and do not sell the font alone. The tree has no OFL.txt or copyright file for it.
- Risk: low. Fix: add OFL.txt and the Junicode copyright line to `THIRD_PARTY.md`. Or delete the font and `zen-branding.css` rules if no kept UI uses them (check which selectors use `Zen-Junicode`, not done).
- `src/zen/vendor/motion.min.mjs` is Motion v13.2.0 (`motion.dep`), MIT upstream (unverified here, from memory of the package). The file header was replaced with the MPL header and the comment says "Ignore license". No MIT notice remains in the file (grep found none). MIT requires the notice. Risk low. Fix: add Motion's MIT text to `THIRD_PARTY.md`.
- `src/external-patches/`: Phabricator patches (MPL, Mozilla) and one LibreWolf patch (`firefox-in-ua.patch`, MPL, unverified). Nothing to attribute beyond keeping headers.
- No other non-MPL files turned up in a grep of `src/` (excluding patches and `node_modules`) for MIT, Apache, BSD, GPL or CC text. The grep was coarse.
- Repo `LICENSE` is MPL-2.0.

## 4. Mozilla trademarks in a build

Mozilla policy (https://www.mozilla.org/en-US/foundation/trademarks/policy/, fetched 2026-10-13): an open source project must "choose branding, logos, and trademarks that denote your own unique identity" and must not "use any Mozilla trademark in connection with the user-facing name or branding of your project". If you say the project is based on Mozilla technology, add "[Brand Name] and [Product Name] are not officially associated with Mozilla or its products". Firefox distribution policy has further rules (page not read, unverified).

What the macOS build really contains: `engine/browser/branding/release` is `engine/browser/branding/unofficial` with the 34 files from `configs/branding/release` copied over it (I compared hashes). The files below are still Mozilla's unofficial set.

- `Assets.car` (757 KB): packed into `Resources/Assets.car` by `browser/app/moz.build` line 77 and listed in `package-manifest.in`. It holds the "AppIcon" layers of the unofficial icon. `no_liquid_glass_icon.patch` removes `CFBundleIconName`, so macOS should not draw it, but it still ships and Dock or Finder could pick it up (unverified). Risk: medium. Fix: generate a placeholder catalog with `actool`, or patch the line out of `moz.build` and the manifest (unverified that the build tolerates a missing file).
- `disk.icns` and `background.png`: the DMG volume icon and the DMG window background (purple sphere). `dsstore` positions the window. Mozilla unofficial art, not Firefox's logo. Risk: low to medium, it is Mozilla artwork not made for your product. Fix: replace with Origin images made by `scripts/make-icon.swift`, or draw a plain background.
- `content/document_pdf.svg`: generic PDF document glyph. Keep.
- Windows-only and not built here: `newtab.ico`, `newwindow.ico`, `wizHeader*.bmp`, `stubinstaller/bgstub.jpg`, `msix/Assets/*`, `*.VisualElementsManifest.xml`. Ignore.
- File names `firefox.icns`, `firefox-wordmark.svg`, `firefox.ico` hold Origin art now. The name is internal, not user visible. Keep.
- Brand strings: `brand.ftl`, `brand.dtd` and `brand.properties` say "Origin". Good. `trademarkInfo` is blank.
- Firefox name in kept engine strings: pages such as about:rights, about:license, preferences text and links to "Firefox Relay", "Mozilla VPN" or support.mozilla.org mention Mozilla products. Nominative use is normally fine, but I did not count them (unverified, never searched `engine/` as told). Fix: add the Mozilla disclaimer line to the README and the about dialog, and run a targeted grep of the built `omni.ja` strings before release.
- `about:license` and `about:rights` ship Mozilla's text. Leave them, they carry the third-party notices for Gecko itself.

## 8. Related, not licensing

- `engine/browser/branding/release/pref/firefox-branding.js` (generated) still has `startup.homepage_override_url`, `startup.homepage_welcome_url` and `app.update.url.*` pointing at zen-browser.app. `prefs/origin/branding.yaml` is meant to override them. Check the override wins in a built profile (about:config) before release, because the spec says the fork never contacts Zen's servers.

## Smallest plan

1. Replace or delete the Nucleo set and scrub `nucleo/` from the public history. This is the only item that needs design work.
2. Replace `Assets.car`, `disk.icns`, `background.png` and `dsstore` in `configs/branding/release` so the merge overrides them. Same mechanism as the other 34 files.
3. Add `THIRD_PARTY.md` with Ionicons MIT, Motion MIT and Junicode OFL texts, and pack it in the app.
4. Add the Mozilla "not officially associated" line to README and about.
5. Commit `configs/branding/release` and the `twilight` deletion.

## Sources

- https://nucleoapp.com/license
- `src/browser/themes/shared/zen-icons/nucleo/nucleo-copyright-notice.html`
- https://github.com/ionic-team/ionicons/blob/main/LICENSE
- https://github.com/psb1558/Junicode-font
- https://www.mozilla.org/en-US/foundation/trademarks/policy/
- https://www.mozilla.org/en-US/foundation/licensing/website-content/ (logos are not covered by the content license)
