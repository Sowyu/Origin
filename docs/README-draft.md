<!--
   - This Source Code Form is subject to the terms of the Mozilla Public
   - License, v. 2.0. If a copy of the MPL was not distributed with this
   - file, You can obtain one at http://mozilla.org/MPL/2.0/.
   -->
<!--
Draft for review. Not the repo README; the root README.md is still Zen's.
Open points for the reviewer:
- The name and icon are not confirmed (spec: confirm with the user before the first public release).
- No Origin build has been measured yet. The numbers below are stock Zen against Firefox. Replace that section once batch origin-1 is in docs/benchmarks.md.
- Install steps for macOS 15 and later come from Apple's documented flow. Nobody has tried them on macOS 27 yet (unverified).
- Download link, file name and the update behaviour assume milestone 5 is done. Cut the "Updates" section if the first release ships without the updater.
- The privacy list (telemetry, studies, sponsored content, Suggest, crash reporting) follows the spec. docs/cuts.md only confirms the Nimbus, captive portal and AI prefs, so check the rest against prefs/origin/ before publishing.
- Widevine DRM and Firefox Sync are listed as kept because the spec keeps them. The sign-in checks are still open in PROGRESS.md.
-->

# Origin

Origin is a lean fork of Zen Browser for macOS on Apple Silicon. It keeps what makes Zen feel like Zen and cuts the rest, so it draws less power and carries less code.

It runs on Gecko, the same engine as Firefox. It is for people who like Zen's workspaces and sidebar and want a browser that stays quiet on a laptop battery.

Origin is based on [Zen Browser](https://github.com/zen-browser/desktop), which is based on Firefox. Origin is not affiliated with, endorsed by or sponsored by Zen Browser or Mozilla.

## What stays

- Workspaces, with their colours and gradients
- Essentials, the pinned icon grid
- Folders
- Split view
- Compact mode
- The vertical tab sidebar, the URL bar, the command palette and Zen's keyboard shortcuts
- Session restore for workspaces
- Firefox Sync, Widevine DRM and page translation
- Add-ons from addons.mozilla.org

A copy of a profile from the matching Zen release is meant to open in Origin with its workspaces, Essentials, folders and pinned tabs intact. Origin has its own bundle ID and profile folder, so it runs next to Zen without touching Zen's profile.

## What was cut

Origin removes Boosts, Glance, Zen Mods and the theme store, live folders, space routing, Zen's library panel, Share, the sidebar media controls and the welcome flow. It also removes smaller things that no kept feature needs, such as the download animation, the loading bar and the "what's new" card.

It turns off telemetry, studies and Nimbus rollouts, sponsored new tab content, Firefox Suggest, crash reporting and the captive portal check. It also turns off every AI feature except translation.

The full list, one line per cut, is in [docs/cuts.md](cuts.md).

## Security and privacy

The engine stays Gecko. Content sandboxing, site isolation, Safe Browsing, CRLite and Remote Settings are exactly as Firefox ships them. Remote Settings stays on because CRLite, the add-on blocklist and search configuration depend on it.

Origin never contacts Zen's servers, and it ships none of Zen's logos or icons and none of Mozilla's trademarks.

## Numbers

Every energy claim in this project comes from the harness in `scripts/perf/`, which reads Apple's per-process energy counters on a Mac mini M4. The method, the machine and every result are in [docs/benchmarks.md](benchmarks.md).

Origin has no measured results of its own yet. The baseline, taken on 2026-10-12 and 13 with 3 runs per scenario, is stock Zen against Firefox 157.0.1:

- With nothing moving, every Gecko browser sits at the no-browser floor. Whole-Mac idle power is 107 mW for official Zen 1.23.2b, 109 mW for Firefox and 108 mW with no browser running.
- While content moves, official Zen costs the Mac more than Firefox. Scrolling is 349 mW against 236 mW, windowed video 264 mW against 174 mW, and tab switching 365 mW against 207 mW.
- The extra comes from WindowServer's GPU work, not from the browser's own CPU.
- Zen beats Firefox at dragging the split view divider (1,489 mW against 2,145 mW) and at typing.

Origin aims to land at or below Firefox in every scenario. These are the numbers to beat, not results for Origin.

## Install

Origin builds are not notarized, because the project has no Apple Developer ID. macOS blocks the first launch, and you have to allow it once. Origin is signed with a free Apple Development certificate, which Gatekeeper does not accept on its own.

1. Download the DMG from the [latest release](https://github.com/Sowyu/Origin/releases/latest).
2. Check it against the SHA-256 sums on the release page with `shasum -a 256 <file>.dmg`.
3. Open the DMG and drag Origin into your Applications folder.
4. Eject the DMG and open Origin from Applications. macOS says it cannot verify the app. Click Done, not Move to Trash.
5. Open System Settings, then Privacy & Security, and scroll down to the Security section.
6. Click Open Anyway next to the message about Origin, then enter your password or use Touch ID.
7. Click Open in the next dialog. macOS remembers the choice, so this happens once per install.

If the Open Anyway button is missing, try to open Origin again, then go back to Privacy & Security. The button shows up only after a blocked attempt. Apple describes this flow in [Open a Mac app from an unknown developer](https://support.apple.com/guide/mac-help/mh40617/mac).

Control-clicking the app and choosing Open no longer skips the warning on macOS 15 and later.

Terminal users can remove the download flag instead of steps 4 to 7:

```sh
xattr -dr com.apple.quarantine /Applications/Origin.app
```

Run Origin from Applications, not from the DMG or the Downloads folder. A quarantined app that runs from another folder is moved to a temporary read-only path, and the updater cannot replace it there.

## Updates

Origin uses Firefox's built-in updater with its own signing key. Updates come from a feed on GitHub Pages, and the files come from this repository's releases. The updater checks the signature on every update before it installs anything. Origin does not use Zen's update server.

Origin follows Zen releases. A release that carries a Firefox security fix ships within 3 days of the matching Zen release.

## Build from source

Origin builds on a Mac with Apple Silicon. A build needs about 80 GB of free disk and 16 GB of RAM, and it ran for 31 minutes from source to DMG on a Mac mini M4 for the stock Zen build in docs/benchmarks.md.

1. Clone the repository and open a shell in it.
2. Source the pinned toolchains with `. scripts/env.sh`. It puts Node 22, Python 3.11, Rust 1.95.0 and GNU tar first on `PATH`, and expects them under `../Zen-Origin-research/tools`.
3. Install the Node packages with `npm ci`.
4. Run `scripts/build-origin`. It resets `engine/` to pristine Firefox, imports Zen's patches and Origin's prefs, builds and packages.
5. Find the DMG in `dist/`.

`scripts/build-origin` accepts phase names (`import`, `locales`, `build`, `package`) if you want to run only part of the chain. The tooling and the measurement harness are described in [docs/benchmarks.md](benchmarks.md). Zen's contribution guide is [docs/contribute.md](contribute.md).

Run only one `mach build` at a time. The build peaks at about 14 GB of memory on a 16 GB Mac.

## License

Origin is licensed under the Mozilla Public License 2.0, the same as Zen and Firefox. See [LICENSE](../LICENSE). Every source file keeps its MPL-2.0 header.

Origin contains code from Zen Browser and Mozilla Firefox. Their names and logos belong to their owners.
