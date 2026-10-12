# Firefox 157 patches, AI prefs and background activity

Research notes, 2026-10-13. Nothing was built or run. Paths are relative to `/Users/mrm/Zen-Origin`.

`engine/` is the working tree with Zen's patches and prefs imported. Line numbers for `engine/` files are from that tree, not from pristine Firefox. `git -C engine diff -- <path>` shows what Zen changed. Where a claim rests on a guess it says "unverified".

## 1. Zen's external Firefox patches

The list is `src/external-patches/manifest.json` (lines 4 to 50). Patch files sit in `src/external-patches/firefox/` and `src/external-patches/librewolf/`. Zen's own note on them is `src/external-patches/firefox/README.md:3`: they are temporary backports and should go once they fail on a new Firefox.

The manifest and patches name no Mozilla bug numbers. "Issue N" means a Zen GitHub issue, and I could not open those, so the reasons below come from reading each patch. D-numbers are Phabricator revisions (`scripts/update_external_patches.py:11` downloads them from `phabricator.services.mozilla.com`).

None of the ten patches touches content sandboxing, site isolation, Safe Browsing, CRLite, OCSP or Remote Settings. I checked the file list of each patch for those subsystems (`security/`, `toolkit/components/url-classifier`, `services/settings`, `security/sandbox`).

### D299584, native macOS popovers fix (`native_macos_popovers_fix.patch`)

- It edits `widget/cocoa/nsCocoaWindow.mm` (hunks at 5597 and 8775), `nsCocoaWindow.h:143` and `toolkit/themes/shared/global-shared.css:83`.
- It lets popovers use the native `NSPopover` even when the popup does not follow its anchor, and reuses the last popover rect when the new one is empty. The patch comment says the empty rect happens "when downloading addons from unofficial sources".
- Zen turns native popovers on: `prefs/zen/macos.yaml` sets `widget.macos.native-popovers` true (`engine/browser/app/profile/zen.js:336`).
- Security: no.
- A macOS build needs it as long as native popovers stay on. Without it, some popovers (add-on install prompts, for one) can appear at the wrong place or not at all. Exact symptom is unverified.

### D323933, "Issue 15123" (`issue_15123.patch`)

- It changes `toolkit/modules/subprocess/subprocess_shared_unix.js:57` so `fcntl` is declared variadic (`"..."`), and wraps the flag arguments in `ctypes.int()` in `subprocess_unix.sys.mjs` and `subprocess_unix.worker.js`. It adds an xpcshell test.
- Apple Silicon passes variadic arguments differently from fixed ones, so the old declaration sets wrong pipe flags. That is my reading of the patch and its test (`test_subprocess_pipe_flags.js`), not something I ran.
- Callers of `Subprocess` that Origin keeps: `toolkit/components/extensions/NativeMessaging.sys.mjs` (extension native messaging, such as password managers), `browser/components/shell/ShellService.sys.mjs`, `toolkit/components/taskscheduler/TaskSchedulerMacOSImpl.sys.mjs`, `toolkit/components/crashes/CrashManager.in.sys.mjs`, `toolkit/modules/Troubleshoot.sys.mjs`.
- Security: no.
- macOS needs it, and Apple Silicon is the target. Dropping it risks native messaging pipes with wrong flags. Keep.

### D327914, backdrop filter reads web content (`backdrop_filter_reads_web_content.patch`, 1,121 lines)

- It lets a CSS `backdrop-filter` in the browser chrome read the web content drawn below it. It changes WebRender (`gfx/wr/webrender/src/{picture,surface,render_target,tile_cache/*,renderer/*}.rs`) and passes a flag from `gfx/webrender_bindings/WebRenderAPI.cpp`.
- The flag is `zen.theme.acrylic-urlbar || zen.theme.acrylic-sidebar` (patch lines 15 to 18). Both prefs default to false in this tree (`engine/modules/libpref/init/zen-static-prefs.inc:20-30`, `engine/browser/app/profile/zen.js:493-495`). They are `mirror: once`, read at startup.
- With the flag false, every new code path checks `backdrop_reads_lower_slices` or `cross_slice_backdrop_filters` and stays off (patch lines 62, 1043, 1115). So in a release build with default prefs the patch is dormant. The earlier note in `docs/research/zen-features-2026-10-12.md:570` called it "needed" because the CSS uses `backdrop-filter`. The acrylic CSS is behind `@media -moz-pref("zen.theme.acrylic-urlbar")` (`src/zen/common/styles/zen-omnibox.css:280`), so that note should be corrected.
- Security: no.
- A macOS build does not need it unless Origin turns acrylic on. If Origin drops the acrylic effects, drop this patch too. It is the largest and the most likely to fail on a rebase. Dropping it also removes the only reader of `StaticPrefs_zen.h` in C++, so the two acrylic prefs can go with it. Unverified: whether any other file includes `StaticPrefs_zen.h`.

### Local: `no_liquid_glass_icon.patch`

- It removes `CFBundleIconName` (`AppIcon`) from `browser/app/macbuild/Contents/Info.plist.in`.
- Zen's release branding ships `Assets.car` (`engine/browser/branding/release/Assets.car`, copied in `engine/browser/app/moz.build:77`). With `CFBundleIconName` present, macOS 26 draws the Liquid Glass icon from that file. Without it, macOS uses `firefox.icns`.
- Security: no.
- Origin needs it, or must replace `Assets.car`, as long as its icon is a flat `.icns`. If the patch goes and `Assets.car` stays, Zen's icon shows on macOS 26. That breaks the rule against shipping Zen's icons. The branding agent should decide. Keep for now.

### LibreWolf `firefox-in-ua.patch`

- It changes the default of `MOZ_APP_UA_NAME` in `toolkit/moz.configure:29-33` from empty to `Firefox`.
- `netwerk/protocol/http/nsHttpHandler.cpp:444-452` takes the app name from `MOZ_APP_UA_NAME`, and from the app's name when it is empty. At lines 1073 to 1085, an app name other than "Firefox" adds an `Origin/<version>` token and drops the `Firefox/157.0` token unless the compat-mode pref is on. The pref name and default are unverified.
- With the patch, the user agent is the plain Firefox one. Sites keep working and the browser does not stand out.
- Security: no. It does cut fingerprinting.
- macOS needs it for site compatibility. Keep. Note that `src/external-patches/librewolf/README.md` says it comes from LibreWolf, and the manifest (lines 22 to 32) rewrites one help string in it.

### D312091, expose tiled attribute to all platforms (`expose_tiled_attribute_to_all_platforms.patch`)

- It reads a private `NSWindow` ivar (`_tilingStateController`) in `nsCocoaWindow.mm` and calls `SetIsTiled` on move and resize, so `:root[tiled]` is set on macOS.
- Firefox's own CSS uses `:root[tiled]` only for GTK window buttons (`engine/browser/themes/shared/browser-shared.css:374-381`, `engine/browser/themes/linux/browser.css:36`). I found no use of `tiled` under `src/` or in Zen's CSS.
- Security: no. It reads private API, but guards it and falls back to false.
- macOS does not need it. Drop it: no behaviour changes, and a private-API read goes away. Unverified: whether Zen's JS reads `tiled` in a file I did not grep (`src/zen` CSS, `.mjs` and `.js` files returned no hit).

### D298708, "Issue 14990" (`issue_14990.patch`)

- It adds a `lengthHint` option to `IOUtils.writeJSON` (`dom/chrome-webidl/IOUtils.webidl`, `xpcom/ioutils/IOUtils.cpp`) and makes `SessionWriter.sys.mjs` pre-size its buffer from the last write (`SessionWriter.sys.mjs` patch lines 80 to 270). The patch comment says it avoids "incremental reallocations".
- The manifest rewrites two lines (manifest lines 38 to 41) because the downloaded patch no longer matches the tree.
- Security: no.
- macOS does not need it. It saves memory reallocations on each session write (every 40 s here, `prefs/firefox/browser.yaml`, `browser.sessionstore.interval`). If Origin drops it, session saving gets slightly slower with many tabs. Origin has no numbers on that, so keep it only if the harness shows a gain. It changes C++ and WebIDL, which is the costly kind to rebase.

### D321446, "Issue 14710" (`issue_14710.patch`)

- It makes picture-in-picture skip auto-toggle when the user closed the window on purpose while the tab was in the background (`toolkit/components/pictureinpicture/PictureInPicture.sys.mjs`, new `weakAutoPipBrowserClosedDeliberately`).
- It only matters when `media.videocontrols.picture-in-picture.enable-when-switching-tabs.enabled` is true. Zen sets it false (`prefs/firefox/pip.yaml`, `zen.js:229`). The patch is dormant on defaults.
- Security: no.
- macOS does not need it with the pref off. Drop it.

### Local: `override_cert_checks_temp.patch`

- It touches only `toolkit/mozapps/update/common/registrycertificates.cpp`. It defines `ZEN_SKIP_ALLOWED_CERTIFICATE_CHECK`, so `DoesBinaryMatchAllowedCertificates` logs and returns TRUE without reading the allowed-certificate registry values.
- The patch comment says it is temporary: after Zen changed its signing certificate, installs still named the old one, the Windows maintenance service refused the new binaries, and updates prompted for elevation every time.
- It is Windows only. The file includes `<windows.h>` (line 5) and `toolkit/mozapps/update/common/moz.build:45` and `:60-63` compile it only under `OS_ARCH == "WINNT"` with `MOZ_MAINTENANCE_SERVICE`. The callers are in `updater.cpp:2672` and `updatehelper.cpp:346`, both Windows paths.
- Does it weaken a security feature on the list? Not on macOS, because the file is not compiled there. On Windows it removes the check that the updater binary is signed by an allowed certificate. That is an update-hardening layer, not one of sandboxing, site isolation, Safe Browsing, CRLite, OCSP or Remote Settings. Update payloads are still checked by the MAR signature, which this patch does not touch. I did not read the MAR code, so that last point is unverified.
- macOS does not need it. Drop it. Nothing breaks.

### D323514, fix HEVC video stutters (`fix_hevc_video_stutters_and_dropped_frames.patch`)

- It makes the Matroska/WebM demuxer use the container's default duration for HEVC streams with B-frames, instead of decode-order timestamps. It adds `H265::ComputeMaxReorderPics` and two gtests. Files: `dom/media/webm/{MatroskaDemuxer,WebMDemuxer}.{cpp,h}`, `dom/media/platforms/agnostic/bytestreams/H265.{cpp,h}`.
- Security: no. It parses the stream's SPS, but only to read one field and it returns 0 on error.
- It affects HEVC in MKV files. Whether macOS 157 plays HEVC-in-MKV through the system decoder is unverified. Dropping it means stutter on those files, which is a niche. Drop unless the user plays MKV video in the browser.

### Summary of what Origin can drop

- Dormant or Windows-only, safe to drop: `override_cert_checks_temp`, `expose_tiled_attribute_to_all_platforms`, `issue_14710`, and `backdrop_filter_reads_web_content` if acrylic stays off.
- Judgement calls: `issue_14990` and `fix_hevc_video_stutters`.
- Keep: `native_macos_popovers_fix`, `issue_15123`, `firefox-in-ua`, and `no_liquid_glass_icon` until the icon work is done.
- Dropping changes `src/external-patches/manifest.json`. `scripts/update_external_patches.py` regenerates the files from it. I did not check how `npm run import` applies them, so the effect of deleting a manifest entry on an already imported `engine/` is unverified.

## 2. Firefox 157 AI features

### The prefs

These are the real gates. Default values are from `engine/browser/app/profile/firefox.js` (fx) and `engine/modules/libpref/init/all.js` (all).

Chatbot sidebar:
- `browser.ml.chat.enabled` (fx:2327, default true) is the master switch. `GenAI.sys.mjs:268-275` shows entry points need it and a non-empty `browser.ml.chat.provider` (fx:2339, default empty).
- `browser.ml.chat.sidebar`, `browser.ml.chat.menu`, `browser.ml.chat.shortcuts`, `browser.ml.chat.shortcuts.custom` (fx:2330-2345) switch off the individual surfaces. Zen sets all five to false (`prefs/firefox/ai.yaml:6-22`, `zen.js:33-41`).

AI window (Smart Window):
- `browser.smartwindow.enabled` (fx:2370) defaults to false. `AIWindow.sys.mjs:1521-1532` makes `isAvailable` equal that pref and not blocked. Zen does not set it, and it needs no setting while the default stays false.
- Nimbus can flip it. See `nimbus.rollouts.enabled` in section 3.
- Related defaults that stay true and only act if the window is on: `browser.smartwindow.agent.enabled` and `browser.smartwindow.autoTabGrouping.enabled` (fx:2397 and the agent block after 2404). `autoTabGrouping.preloadModels` needs `browser.ml.enable` (`AutoTabGroupingSuggestions.sys.mjs:147`).

Link previews:
- `browser.ml.linkPreview.enabled` (fx:2350). `LinkPreview.sys.mjs:44` and `:242` read it. Zen sets it false (`ai.yaml:24`).

Smart tab groups:
- `browser.tabs.groups.smart.enabled`, `.userEnabled`, `.optin` (fx:1179, 1208, 1194). `SmartTabGrouping.sys.mjs:342-349` needs all three plus `browser.ml.enable`. `.optin` defaults to false, so the feature is off for a new profile already.
- Zen sets `browser.tabs.groups.enabled` false (`prefs/firefox/browser.yaml`) and `browser.ml.enable` false, so smart groups cannot run. Setting `.smart.enabled` and `.userEnabled` to false adds a second lock.

Local ML engine:
- `browser.ml.enable` (all:3657, default true). `toolkit/modules/ActorManagerParent.sys.mjs:78` makes it the `enablePreference` of the MLEngine actor. `EngineProcess.sys.mjs:1258` throws from `getMLEngineParent` when it is false. Zen sets it false (`zen.js:43`).
- It also gates the semantic history search (`toolkit/components/places/PlacesSemanticHistoryManager.sys.mjs:414,432`). `places.semanticHistory.featureGate` is false on release (fx:783-785). It is true on beta and earlier builds. Unverified: that Origin's milestone resolves to release.
- `extensions.ml.enabled` (all:1786, default true) is the extension trial ML API (`ext-trial-ml.js:14,22`). Set it false as well. Zen does not.
- `pdfjs.enableAltText` defaults to false (`toolkit/components/pdfjs/PdfJsDefaultPrefs.js:33`).

### Translations keep working

- Translations run in their own engine actor, `TranslationsEngine` (`EngineProcess.sys.mjs:1245-1248`). That function does not check `browser.ml.enable`. So Zen's `browser.ml.enable` false leaves Translations alone.
- Translations are gated by `browser.translations.enable` (fx:2568, true) and `browser.ai.control.translations` (all:3648, "default").
- Do not set `browser.ai.control.default` to "blocked". `TranslationsFeature.block()` sets `browser.translations.enable` false (`TranslationsFeature.sys.mjs:172-173`).

### Recommended set to add to `prefs/firefox/ai.yaml`

It already has the chat, `browser.ml.enable`, `linkPreview.enabled` and `browser.preferences.aiControls` entries. To add:

- `browser.smartwindow.enabled` false, so a flip of the default cannot enable it.
- `browser.tabs.groups.smart.enabled` false and `browser.tabs.groups.smart.userEnabled` false.
- `extensions.ml.enabled` false.
- `browser.ml.chat.page` false (fx:2331, drives the page-level entry points; already moot while `chat.enabled` is false).

### What Zen's two patches do

`src/browser/components/preferences/config/aiFeatures-mjs.patch`:
- It deletes three rows from the AI controls page in `aiFeatures.mjs`: the PDF alt text select, the smart tab groups select and the link preview key points select (patch lines 637 to 678).
- It does not change any pref or any feature code. The rows are hidden. The handlers (`makeAiControlSetting` at `aiFeatures.mjs:~600`) still exist.
- Zen also sets `browser.preferences.aiControls` false (`ai.yaml:36-37`, `zen.js:71`), which hides the whole AI Controls pane. So the patch matters only if the pane comes back.

`src/browser/components/aiwindow/ui/modules/AIWindow-sys-mjs.patch`:
- It adds `return;` at the top of `_updateHamburgerMenuPosition` (patch line 324). That function moves the `PanelUI-button` between toolbars when the user toggles the AI window. Zen has no such button where Firefox expects it, so Zen turns the move into a no-op.
- It does not disable the AI window. `browser.smartwindow.enabled` defaulting false does that.

### Does Firefox's own AI control cover all this with one switch?

- Partly. The "Block AI enhancements" toggle (`aiControlDefaultToggle`, `aiFeatures.mjs:402-428`) calls `updateAiControlDefault` (`aiFeatures.mjs:109-130`). That blocks every feature in `OnDeviceModelManager.features`, sets `browser.ai.control.default` to "blocked" and sets `extensions.ml.enabled` false.
- The feature list includes Translations (`OnDeviceModelManager.mjs:34`, `:142-143`). Blocking Translations sets `browser.translations.enable` false and deletes its models. So the one switch also turns off Translations, which you want kept.
- The switch also needs the pane, which `browser.preferences.aiControls` false hides.
- Verdict: set the individual prefs above. Do not use the global switch.
- There is a policy route as well. `Policies.sys.mjs:136-193` maps an `AIControls` policy to each feature, with per-feature values, so a policy could block everything except Translations. Origin ships no `policies.json` (a bundle edit breaks the seal, `PROGRESS.md:57`), so I did not pursue it.

## 3. Background network and wake sources

Already off through `prefs/privatefox`, `prefs/firefox`, `prefs/zen` (`zen.js` lines in brackets): telemetry and Glean upload (`zen.js:179-181,306-330`; Glean checks `datareporting.healthreport.uploadEnabled` in `toolkit/components/glean/src/init/upload_pref.rs:42,81`), Normandy and studies (2-6), Firefox Suggest (155-163, and `SuggestFeature.sys.mjs:127` shows the backend turns off with `quicksuggest.enabled`), search suggestions (91-93), top sites, top stories, Contile and weather on the new tab page (51-63), CFR add-on and feature recommendations (47-49), `extensions.getAddons.cache.enabled` (183), language pack downloads (223), URL bar trending and weather (167, 175).

Candidates still on, ranked by how much I think they cost:

### Captive portal detection

- Pref: `network.captive-portal-service.enabled`, true (`firefox.js:1474`; `all.js:3267` is the platform default false).
- It sends one request to `http://firefox-portal-detection.com/generate_204` (`captivedetect.canonicalURL`, `all.js:3295`) when the service starts, and again on a network change. After a "not captive" answer it stops polling (`CaptivePortalService.cpp:107-111`, `:193`). Only a captive result starts the 60 s to 25 min backoff timer (`all.js:3263-3266`).
- Turning it off removes the login prompt on hotel Wi-Fi. No listed security feature depends on it. I would turn it off. It is also a startup request to a Mozilla host.

### Connectivity service

- Pref: `network.connectivity-service.enabled`, true (`all.js:3269`).
- It resolves `example.org` and `cloudflare-dns.com` and fetches `http://firefox-portal-detection.com/success.txt?ipv4` and `?ipv6` after idle startup (`NetworkConnectivityService.cpp:229`, `StaticPrefList.yaml:16897`) and on every network change (`:444`). `netwerk/docs/connectivity_checking.md:1-3` says it only infers IPv4 and IPv6 reachability.
- It feeds the DNS code (`netwerk/dns/TRRQuery.cpp:343`). With `network.trr.mode` 0 (default, `StaticPrefList.yaml:16023`) I expect no effect. Unverified: whether the system resolver's IPv6 choice reads it.
- No listed security feature. A reasonable candidate to turn off, but test IPv6-only networks first.

### Push service

- Prefs: `dom.push.enabled` (true, `StaticPrefList.yaml:4281`) and `dom.push.connection.enabled` (true, `all.js:3226`).
- `BrowserGlue.sys.mjs:1103-1107` calls `PushService.ensureReady()` as a late startup task. `PushService.sys.mjs:239` then opens the WebSocket to `wss://push.services.mozilla.com/` (`all.js:3209`) with a 30 minute ping (`all.js:3235`). I saw no check that skips connecting when there are no subscriptions. Unverified whether it connects with zero subscriptions.
- Remote Settings listens on this connection for change broadcasts (`services/settings/remote-settings.sys.mjs:38,763`). With push off, Remote Settings still polls every 24 hours (`all.js:1747`), so CRLite and add-on blocklist updates arrive up to a day late.
- Keep it. Turning it off touches Remote Settings.

### Region detection

- Prefs: `browser.region.update.enabled`, true (`all.js:3105`), and `browser.search.region`, empty.
- If `browser.search.region` is empty, startup fetches `https://location.services.mozilla.com/v1/country` (`all.js:3100`; `Region.sys.mjs:194`). A timer then runs weekly (`Region.sys.mjs:107,179`) and fetches only when the last check is over 14 days old (`:100,:772`).
- Setting `browser.search.region` to a fixed code and `browser.region.update.enabled` false removes both. Side effect: search engine defaults follow the fixed region (`SearchService.sys.mjs:2827`). No listed security feature. Safe. Ask the user which region to fix.

### Nimbus rollouts and ASRouter messages

- Pref: `nimbus.rollouts.enabled`, true (`firefox.js:2252`). Studies are already off, but rollouts are a separate kind: `RemoteSettingsExperimentLoader.sys.mjs:1204-1210` only skips rollouts when `rolloutsEnabled` is false.
- The loader syncs the `nimbus-desktop-experiments` collection (`firefox.js:2223`) from Remote Settings and re-runs on a timer (`RemoteSettingsExperimentLoader.sys.mjs:320`). A rollout can change prefs, including the AI ones in section 2. That undoes Origin's pref choices without an app update.
- Turning the pref off does not turn off Remote Settings. CRLite, the blocklist and the other collections sync as before. Strongly recommended. Whether Mozilla uses rollouts for security fixes is unverified.
- ASRouter providers `cfr`, `message-groups` and `messaging-experiments` (`firefox.js:2041-2044`) have `updateCycleInMs` of 3,600,000, one hour. They fetch promo messages from Remote Settings. Set each provider's JSON `"enabled"` to false. Unverified: how much CPU an hourly provider update costs with nothing to show.

### System add-on updates

- Pref: `extensions.systemAddon.update.enabled`, true (`firefox.js:56`), against `https://aus5.mozilla.org/update/3/SystemAddons/...` (`firefox.js:55`).
- The built-in add-ons are `formautofill`, `newtab`, `pictureinpicture`, `search-detection`, `webcompat` and `ipp-activator` (`engine/browser/extensions/`). This pref only controls updates to those. The daily add-on update check is a different pref, `extensions.update.enabled` (`firefox.js:233`), on a timer of 86,400 s (`firefox.js:236`, `toolkit/mozapps/extensions/extensions.manifest:4`). Keep that one.
- Turning off the system add-on update stops Mozilla replacing built-in add-ons between releases. Webcompat fixes may also arrive through Remote Settings. That is unverified. Not on the security list. Optional.

### New tab page

- Zen leaves on `browser.newtabpage.activity-stream.discoverystream.enabled` (`firefox.js:2056`) and the wallpaper prefs `newtabWallpapers.enabled` and `.v2.enabled` (`zen.js:57-59`).
- Stories are not fetched: `DiscoveryStreamFeed.sys.mjs:286-293` needs the topstories pref, which Zen sets false. Widgets are off by default (`widgets.system.enabled` false, `ActivityStream.sys.mjs:1425-1428`). The ads feed is off (`unifiedAds.adsFeed.enabled` false, `firefox.js:1983`). Sponsored tiles need `feeds.topsites`, which Zen sets false.
- The system tick feed runs every 5 minutes but stops when the user is idle for 5 minutes (`SystemTickFeed.sys.mjs:15-35`), so it does not wake an idle machine.
- Wallpapers load from Remote Settings attachments. I did not trace when `WallpaperFeed` fetches. Unverified.
- The cheapest fix is to not load the page at all. I did not check whether `browser.newtabpage.enabled` false stops Activity Stream from starting. Unverified. `browser.startup.homepage.abouthome_cache.enabled` (`firefox.js:339`) also writes a cache for `about:home`. Unverified whether Zen's startup path uses it.

### DNS over HTTPS rollout

- `network.trr.mode` is 0 (`StaticPrefList.yaml:16023`), but `DoHConfig.sys.mjs:52-53,226-237` syncs the `doh-providers` and `doh-config` collections and `DoHController` can switch DoH on from that config, with network heuristics. Which regions get it in 157 is unverified.
- DoH is not on the protected list, but it changes where DNS goes and when the CPU wakes. Ask the user: pin `network.trr.mode` to 0 or 5, or leave Mozilla's rollout in place.

### Checked and not a problem

- Backup: `browser.backup.scheduled.enabled` is false (`firefox.js:3638`).
- Geolocation requests (`geo.provider.network.url`, `all.js:3081`) run only when a page asks.
- Speculative connections (`network.http.speculative-parallel-limit` 20, `all.js:1229`; `browser.urlbar.speculativeConnect.enabled`, `firefox.js:441`) run on user action, not idle. They save latency and are not worth a diff.
- Must stay as is, per the project rules: Safe Browsing (`browser.safebrowsing.*`, `all.js:3403-3435`), OCSP (`security.OCSP.enabled`, `StaticPrefList.yaml:18908`), CRLite and the blocklist (`extensions.blocklist.enabled`, `all.js:1760`), the 24 hour Remote Settings poll (`services.settings.poll_interval`, `all.js:1747`), and the add-on update check.

### Not covered

- App update and Zen's own URLs. `engine/browser/branding/release/pref/firefox-branding.js:6-18` still points at zen-browser.app, and `zen.js:437` sets `zen.share.base-url`. The branding agent has that task (`PROGRESS.md:11`).
- Idle wakeups from the tab strip, session store and places expiry. These need the profiler, not a code read.

## Next action

Edit `prefs/firefox/ai.yaml` and add the five AI prefs from section 2. Then decide on the section 3 list, starting with `nimbus.rollouts.enabled`, captive portal and region.
