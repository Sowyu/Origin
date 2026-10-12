# Startup work with no pref, and Safe Browsing without a key

Date: 2026-10-13. Research only, read from source plus a little web research. No build, no run, no measurement. "Unverified" marks a guess. Paths under `engine/` are Firefox 157.0.1 source, relative to `/Users/mrm/Zen-Origin`.

## Short version

1. The profiles datastore cannot be skipped by itself. Nimbus and ASRouter open it at every start. Dropping its category entry saves nothing.
2. Nimbus cannot be skipped either. `ExperimentAPI.init()` is the only thing that makes `NimbusFeatures.*.ready()` resolve, and `Normandy.init` calls it even with `app.normandy.enabled` false.
3. Clean wins: the IP Protection graph (2 manifest lines) and `LinkPreview.init` (1 line, runs in every window). ContentRelevancyManager.init is safe to drop (1 line). GenAI.init only moves to the first right-click.
4. Without a Safe Browsing key, Firefox already turns Google list updates off cleanly. No retry loop. But phishing, malware and unwanted-software protection is gone, and the download check still posts every download to Google with a fake key.

## 1. Startup work with no pref

Origin has no pref for any of these. Every entry below is in `engine/browser/components/BrowserComponents.manifest`. The sandbox, site isolation, CRLite, OCSP and Remote Settings code is not touched by any patch here.

### 1.1 Profiles SQLite datastore

Where it starts:
- `BrowserComponents.manifest:165` (`browser-first-window-ready`): `ProfilesDatastoreService.init`.
- `BrowserComponents.manifest:166`: `SelectableProfileService.init`.

What it costs:
- `ProfilesDatastoreService.#init` adds a shutdown blocker, a `DeferredTask`, then opens `<UAppData>/Profile Groups/<storeID>.sqlite` and runs `createTables` (schema version check, `engine/toolkit/profile/ProfilesDatastoreService.sys.mjs:452-488,527-540,574-590`). It generates and writes `toolkit.profiles.storeID` on first run (`:559-566`). Files: the db, plus `-wal` and `-shm`.
- `SelectableProfileService.init` awaits `ProfilesDatastoreService.storeID`, which calls `init()` (`engine/browser/components/profiles/SelectableProfileService.sys.mjs:572`). With `browser.profiles.enabled` false (`prefs/firefox/browser.yaml:53`) it returns right after (`:575-577`). The datastore is already open by then.

Why the entry alone is not worth a patch:
- Nimbus opens it. `NimbusEnrollments.init` calls `getConnection()` (`engine/toolkit/components/nimbus/lib/Enrollments.sys.mjs:222`), and so do `ExperimentStore.sys.mjs:587` and `Migrations.sys.mjs:233`.
- ASRouter opens it. `ASRouter.init` calls `getSharedMessageImpressions()` and `getSharedMessageBlocklist()` (`engine/browser/components/asrouter/modules/ASRouter.sys.mjs:1259-1261`), which call `getConnection()` (`ASRouterStorage.sys.mjs:194,237`). `getConnection()` calls `init()` itself (`ProfilesDatastoreService.sys.mjs:151-154`).
- Normandy's heartbeat action uses it too (`ShowHeartbeatAction.sys.mjs:222`), only if it runs.

Options if the user wants it gone anyway (all need ASRouter and Nimbus handled first):
- Set `nimbus.profilesdatastoreservice.enabled`, `.read.enabled` and `.sync.enabled` to false (`engine/browser/app/profile/firefox.js:2228-2237`). The comment says "Only used by tests" and bug 1967779 will remove them. Nimbus then falls back to its JSON store (`ExperimentStore.sys.mjs:619`). Risk: an untested mode in a shipped build, and ASRouter still opens the db.
- Cut ASRouter (see section 1.6 of `newtab-2026-10-13.md`). Only then does the db stop opening.

Cost of leaving it: one small SQLite file open at startup. I have no number. Unverified: under 10 ms.

Recommendation: no patch. Not worth the risk for one small file.

### 1.2 IP Protection (Mozilla VPN) module graph

Where it starts:
- `BrowserComponents.manifest:169`: `IPProtectionActivator.init` on `browser-first-window-ready`.
- `BrowserComponents.manifest:225`: `IPProtectionActivator.uninit` on quit.

What it costs:
- The entry imports `engine/browser/components/ipprotection/IPProtectionHelpers.sys.mjs`. That file imports six browser helpers at the top (`:34-39`: usage, l10n, onboarding message, opt-out, alert manager, infobar manager) and `IPProtectionActivator`.
- `engine/toolkit/components/ipprotection/IPProtectionActivator.sys.mjs:5-11` statically imports seven more: service, proxy manager, lifecycle helper, Nimbus helper, serverlist, startup cache, session pref manager. Lines `:13-50` also resolve `IPPAutoRestore` and `IPPAutoStart`. `IPProtectionHelpers.sys.mjs:81-90` resolves the FxA auth provider.
- That is about 17 modules, plus whatever those pull in. Unverified: each module is small, so the total is probably a few ms and a few hundred KB of JS heap.
- `IPProtectionActivator.init` calls `setupHelpers` and `IPProtectionService.init()`. The service returns at once when `browser.ipProtection.enabled` is false (`IPProtectionService.sys.mjs:94-99`, default false at `engine/browser/app/profile/firefox.js:3696`). No timers, no network, no files while the pref is false. The cost is the module load only.
- The service also registers a pref observer on `browser.ipProtection.enabled` that starts everything when the pref turns true (`IPProtectionService.sys.mjs:208-225`). Only Nimbus or `about:config` can flip it. Origin sets `nimbus.rollouts.enabled` false (`prefs/origin/background.yaml:10`).

Smallest patch (both lines in `BrowserComponents.manifest`):

```diff
-category browser-first-window-ready moz-src:///browser/components/ipprotection/IPProtectionHelpers.sys.mjs IPProtectionActivator.init
+# Origin: no VPN feature, see docs/research/startup-and-safebrowsing-2026-10-13.md
```
```diff
-category browser-quit-application-granted moz-src:///browser/components/ipprotection/IPProtectionHelpers.sys.mjs IPProtectionActivator.uninit
```

What could break:
- Other code lazy-imports `IPProtection.sys.mjs` and `IPProtectionService` (`browser/components/preferences/privacy.js:78`, `preferences/config/privacy.mjs:31`, `SpecialMessageActions.sys.mjs:51`). They only read prefs or call methods the user triggers. With the activator never run, `IPProtectionService` stays UNINITIALIZED. Preferences code that reads `IPProtectionService.state` sees "uninitialized", which is what a disabled feature shows. Unverified: I did not read the privacy pane code that calls it.
- A user who flips `browser.ipProtection.enabled` in `about:config` gets a half-started service (the pref observer calls `init()` with no helpers set up). Lock the pref at false to close that: add `browser.ipProtection.enabled` false with `locked: true` to `prefs/origin/background.yaml`.
- Rebase cost: two deleted lines in a file Zen does not patch. Low.

### 1.3 ContentRelevancyManager.init

Where it starts: `BrowserComponents.manifest:206` (`browser-idle-startup`).

What it costs:
- `init()` always builds a `RustRelevancyStoreManager` (`engine/toolkit/components/contentrelevancy/ContentRelevancyManager.sys.mjs:88-97,504-516`). That calls `RelevancyStore.init(path, SharedRemoteSettingsService.rustService())`.
- Loading `RustSharedRemoteSettingsService.sys.mjs` constructs the shared Rust Remote Settings service: `RemoteSettingsService.init(<ProfLD>/remote-settings, config)` plus two observers (`engine/toolkit/modules/RustSharedRemoteSettingsService.sys.mjs`, constructor). It also pulls in `Region`.
- The Rust relevancy store path is `<ProfLD>/content-relevancy.sqlite` (`:190-195`). The comment at `:510-520` says the store closes its database connections until a read or write, so I expect no file open yet. Unverified.
- It registers a Nimbus update listener and a shutdown blocker (`:104-122`).
- `shouldEnable` reads only the Nimbus variable `enabled`, default false (`:146-152`). So the timer (`#startUpTimer`, 1 day) never starts. `toolkit.contentRelevancy.enabled` false is set in `firefox.js:3683` and is not even read here.
- The Rust Remote Settings service created here is the same one Suggest uses. With QuickSuggest off, nothing else needs it at startup. Unverified: `QuickSuggest.init` still runs (section 1.5) and may create it too, in which case this patch saves only the relevancy store.

Smallest patch:

```diff
-category browser-idle-startup resource://gre/modules/ContentRelevancyManager.sys.mjs ContentRelevancyManager.init
```

What could break:
- `UrlbarProviderQuickSuggest.sys.mjs:569` calls `ContentRelevancyManager.score(...)`. Not initialized, `getUserInterestVector` returns null and `score` throws "User interest vector not ready". That is already caught (`:568-575`, counts a Glean failure and returns). Quick Suggest is locked off in Origin (`prefs/firefox/urlbar.yaml:35-46`), so it never runs.
- Rebase cost: one deleted line. Low.

### 1.4 GenAI.init

Where it starts: `BrowserComponents.manifest:202` (`browser-idle-startup`).

What it costs:
- Loads `engine/browser/components/genai/GenAI.sys.mjs` and `AIFeature.sys.mjs`. The module also calls `GenAI.init()` itself on first import (last lines of the file). So the manifest entry only forces the import at idle.
- `init()` reads six pref getters (which registers pref observers), reorders the chat provider map, registers a Nimbus `chatbot` update callback, and sets eight Glean values (`GenAI.sys.mjs:280-358`). No timers, no network, no files.

Why a patch saves little:
- The module loads on the first page context menu (`engine/browser/base/content/nsContextMenu.sys.mjs:929`) and on the first tab context menu (`engine/browser/components/tabbrowser/content/tab-context-menu.js:851,861`). Almost every session opens one. So this only moves the cost off startup.
- Unverified: the first right-click gets a few ms slower.

Smallest patch if wanted:

```diff
-category browser-idle-startup resource:///modules/GenAI.sys.mjs GenAI.init
```

What could break: nothing I can see. The Nimbus `chatbot` callback is registered later. Rebase cost: one line.

Recommendation: low value. Skip, or take it with the others since it costs nothing.

### 1.5 Other startup work that serves a feature Origin turned off

Ranked by how much I think each costs, then by how risky it is.

LinkPreview.init, per window (take this one):
- `BrowserComponents.manifest:73` (`browser-window-delayed-startup`) calls `LinkPreview.init(win)` in every window, even with `browser.ml.linkPreview.enabled` false (`prefs/firefox/ai.yaml:24`).
- `engine/browser/components/genai/LinkPreview.sys.mjs:488-515`: reads six pref getters, imports two custom-element modules into the window (`link-preview-card.mjs`, `link-preview-card-onboarding.mjs`), runs `handleNimbusPrefs`, and sets Glean values. It adds event listeners only when enabled (`:511-513`).
- Patch: delete `BrowserComponents.manifest:73`.
- Break risk: `browser-init.js:1142-1145` imports LinkPreview at window close and calls `teardown(window)`. That still works with no `init` (`_windowStates.delete` of a missing key is fine, and the `lazy.enabled` guard skips the listener removal). It loads the module once at close, which is a small cost at shutdown. Turning the pref on later needs a restart or new window. The Settings pane could still offer it (`LinkPreview.sys.mjs:185-208`, `makeAvailable`), so lock the pref: add `locked: true` to `prefs/firefox/ai.yaml:24`. Without the lock, `onEnabledPref` walks `_windowStates` (empty) and nothing happens, so the user sees a toggle that does nothing.

Normandy.init (do not touch):
- `BrowserComponents.manifest:18` (`browser-before-ui-startup`, under `MOZ_NORMANDY`, set by `engine/browser/moz.configure:10`). Runs even with `app.normandy.enabled` false.
- Cost: `NormandyMigrations`, `ExperimentAPI.init()`, three IndexedDB opens (`AddonStudies.init`, `PreferenceRollouts.init`, `AddonRollouts.init`), one JSONFile (`PreferenceExperiments.init`), and `RecipeRunner.init` with its Remote Settings client (`engine/toolkit/components/normandy/Normandy.sys.mjs:43-134`, `lib/RecipeRunner.sys.mjs:84-114`). It waits for the first window or 5 minutes before the main part (`:62-70`).
- Why not: `ExperimentAPI.init()` is the only caller that initializes the Nimbus store, and `store.ready()` never resolves without it (`engine/toolkit/components/nimbus/lib/ExperimentManager.sys.mjs:263-333`, `SharedDataMap.sys.mjs:109`). `QuickSuggest.init` awaits `NimbusFeatures.urlbar.ready()` (`QuickSuggest.sys.mjs:443`), and the newtab and ASRouter code wait on Nimbus too. Cutting Normandy.init as it stands would hang those awaits. Not a safe small patch.
- A real option, for a later milestone: patch `Normandy.finishInit` to keep `ExperimentAPI.init()` and skip the four study and rollout stores and `RecipeRunner.init`. Unverified: other code may read `PreferenceRollouts` state at startup. Needs a read of `Normandy.sys.mjs:142-end` and the `StartupPrefs` code. Saves three IndexedDB databases and a Remote Settings client.

QuickSuggest.init (do not touch without a longer read):
- `BrowserComponents.manifest:204`. With Suggest locked off (`prefs/firefox/urlbar.yaml:35-46`) it still awaits `Region.init()`, Nimbus `urlbar.ready()`, `TelemetryEnvironment.onInitialized()`, then imports about 20 feature classes (`QuickSuggest.sys.mjs:431-495`, `FEATURES` list) and instantiates them.
- Heavy, but 40+ call sites in `browser/components/urlbar` use `QuickSuggest.getFeature*` and `.config` (grep counts above). A missing init likely gives undefined features and null dereferences. Unverified. Worth a separate study.

Smaller items, not worth a patch now:
- `CaptchaDetectionPingUtils.init` (`BrowserComponents.manifest:168`): pref observers plus one idle `maybeSubmitPing` (`CaptchaDetectionPingUtils.sys.mjs:201-225`). Unverified: that function does nothing with telemetry upload off.
- `StartupTelemetry.browserIdleStartup` (`:222`): about a dozen idle tasks that read prefs and set Glean values (`StartupTelemetry.sys.mjs:66-105`). `initFOG` is needed. The rest is telemetry nobody uploads. Unverified cost.
- `SERPCategorization.init` (`:204` area) returns at once when `serpEventTelemetryCategorization` is off (`SERPCategorization.sys.mjs:126-133`). Free.
- `EngineProcess.maybeReportNativeOnnxRuntimeAvailability` returns at once unless telemetry is on and `browser.ml.enable` is on (`EngineProcess.sys.mjs:1276-1282`). Origin has `browser.ml.enable` false. Free.
- BrowserGlue `lateTasks` that are gated or tiny: `BackupService` (pref gate, `BrowserGlue.sys.mjs:1313-1318`), `DAPTelemetrySender` (`MOZ_TELEMETRY_REPORTING` gate, `:1295-1303`), `doh-rollout.trrRacer` (pref check only, `:1186-1210`). Keep `start-orb-javascript-oracle` and `LoginDetection.init` (security).

### Patch list for section 1

1. Delete the two IP Protection lines (`BrowserComponents.manifest:169,225`) and lock `browser.ipProtection.enabled` false.
2. Delete `LinkPreview.init` (`:73`) and lock `browser.ml.linkPreview.enabled` false.
3. Delete `ContentRelevancyManager.init` (`:206`).
4. Optional: delete `GenAI.init` (`:202`). Moves cost to the first right-click.
5. Do not patch: profiles datastore, Normandy.init, QuickSuggest.init.

Measure with the harness before claiming any energy gain. The CLAUDE.md rule requires before and after numbers. My guess is that items 1 to 3 save a few ms of main-thread time per launch and a little memory, nothing visible in watts. Unverified.

## 2. Safe Browsing in a self-built fork

### What our builds do today

- `configs/common/mozconfig` passes `--with-google-safebrowsing-api-keyfile=$HOME/.zen-keys/safebrowsing.dat` only if that file exists. `~/.zen-keys` does not exist on this Mac, so the key is the fallback `no-google-safebrowsing-api-key` (`engine/build/moz.configure/keyfiles.configure:1-30`, `no_key` and the `open()` read).
- The build puts the key in `AppConstants.MOZ_GOOGLE_SAFEBROWSING_API_KEY` (`engine/toolkit/modules/moz.build:299`). `URLFormatter` fills `%GOOGLE_SAFEBROWSING_API_KEY%` from it (`engine/toolkit/components/urlformatter/URLFormatter.sys.mjs:127-128`).
- Origin has no Safe Browsing pref of its own (`grep safebrowsing prefs/` is empty). Everything is Firefox's default.

### What Firefox does without a key

Google lists stop, cleanly:
- `SafeBrowsing.checkGoogleSafeBrowsingKey` returns false for any provider whose name starts with "google" when the key is empty or the fallback string (`engine/toolkit/components/url-classifier/SafeBrowsing.sys.mjs:537-559`).
- `updateProviderURLs` then sets that provider's `updateURL` and `gethashURL` to "" (`:636-643`). `registerTableWithURLs` logs "Invalid update url" and skips the table (`:386-389`). Nothing is registered, so no update timer runs for those tables and no request goes out. No error loop, no backoff cycle. I checked `maybeToggleUpdateChecking`, which stops checkers when no table wants updates (`UrlClassifierListManager.sys.mjs:531-547`).
- This covers providers `google`, `google4` and `google5` (`engine/modules/libpref/init/all.js:3403-3435`). Google 5 is on by default (`:3427`).

What silently stops:
- Phishing, malware, unwanted software and harmful-app blocking: lists `goog-phish-proto`, `goog-malware-proto`, `goog-unwanted-proto`, `goog-harmful-proto`, `googpub-phish-proto` (`all.js:3415,3428`). The Settings checkboxes (`browser.safebrowsing.malware.enabled`, `.phishing.enabled`) still read as on. The user thinks they are protected and they are not.
- The download block list `goog-badbinurl-proto` and the allowlist `goog-downloadwhite-proto`. `urlclassifier.downloadBlockTable` points at the first (`ApplicationReputation.cpp:850,870`).

What keeps working:
- The `mozilla` provider (tracking protection lists, `all.js:3442-3451`). Its `updateURL` is `moz-sbrs:://antitracking`, which comes through Remote Settings, and it is not a Google name so the key check skips it. Its gethash host is `shavar.services.mozilla.com`. Unverified: whether that host is contacted on tracking-list hits.
- CRLite, OCSP, Remote Settings, add-on blocklist. None depend on this key.

What still goes out, and costs privacy:
- The remote download check. `SendRemoteQueryInternal` runs when `browser.safebrowsing.downloads.remote.enabled` is true (default true, `all.js:3391`) and the URL is non-empty (`ApplicationReputation.cpp:1607-1620`). It formats `https://sb-ssl.google.com/safebrowsing/clientreport/download?key=%GOOGLE_SAFEBROWSING_API_KEY%` (`all.js:3393`). Nothing checks the key. So each download that passes the local checks posts the source URL, file name, size and SHA-256 to Google with `key=no-google-safebrowsing-api-key`. Google will almost certainly answer with an error, so there is no protection, only a leak. Timeout is 15 s (`all.js:3392`), and the code fails open. Unverified: the exact HTTP status Google returns.
- This conflicts with the "no key, no Google calls" expectation. If we ship without a key, set `browser.safebrowsing.downloads.remote.enabled` false in `prefs/`.

### Energy cost of running without a key

None that I found. No timers, no retries. The Google tables never register, so there are no database prefix sets to load for them either. A key adds a cost instead: list updates (v5 `hashLists:batchGet` on a schedule), a Rust/C++ prefix-set load, and gethash lookups on hits. Unverified: I did not measure that. A with-key vs no-key harness run would show it.

### How a key gets into a build

- Option: `ac_add_options --with-google-safebrowsing-api-keyfile=/path/file` in the mozconfig. The file holds only the key, stripped of whitespace. Empty file or missing file is a fatal configure error (`keyfiles.configure:17-26`).
- Our mozconfig already reads `$HOME/.zen-keys/safebrowsing.dat` for this. For Origin I would rename the directory, since "zen" is Zen's CI path, and decide where the secret lives for CI. Unverified: how Zen's CI writes the file; I did not read their workflows (deleted on `main`).
- The key ends up in the binary (`AppConstants`) and in every request URL, so anyone can extract it from a release. Treat it as a public, rate-limited identifier, not a secret. `URLFormatter.trimSensitiveURLs` only hides it from logs (`URLFormatter.sys.mjs:180-195`).
- The location service and Mozilla API keys use the same mechanism (`--with-google-location-service-api-keyfile`, `--with-mozilla-api-keyfile`).

### How a fork gets its own key

From Google's docs (https://developers.google.com/safe-browsing/v4/get-started):
1. Make a Google account and a Google Cloud (Developer Console) project.
2. Create an API key on the project.
3. Enable "Safe Browsing APIs" for the project.

Quota and price (https://developers.google.com/safe-browsing/v4/usage-limits, via search summary): no cost, a default quota per project that you read in the console, and an increase request form that needs a contact. I could not get the default number. Unverified: the commonly quoted 10,000 requests per day for the Lookup API. Browsers use the Update API (list downloads) and `fullHashes`, and one key shared by many installs can hit a project quota. The Update API is meant for the case of many clients, but the quota is still per project.

Terms (https://developers.google.com/safe-browsing/terms):
- "Unless you have a separate agreement with Google, you may not use the Safe Browsing API for commercial purposes." Google's usage page points commercial users to Web Risk (paid).
- If we tell users we protect them, we must show a notice before first use and with each warning that "the reliability and accuracy of the service cannot be guaranteed".
- A list hit may only block when we got updates within the last 30 minutes.
- The pages say nothing about browser vendors specifically. Whether a free, open-source browser counts as commercial is unclear to me. A browser that ships to the public through GitHub with no ads or revenue is the best case for "non-commercial", but this is a legal reading, not a fact. The user should decide, or ask Google.

Who owns the key: Mozilla's key is tied to a private agreement. The Mozilla wiki says official builds carry a Mozilla key and self-built ones get a fallback string (https://wiki.mozilla.org/Security/Safe_Browsing and the V4 implementation page, via search). Copying Mozilla's or Zen's key out of a release binary would break their terms and could get that key revoked. Do not do it.

Alternative: Web Risk API. Paid per request, built for commercial use. Its endpoints differ from Safe Browsing v4 and v5 (`webrisk.googleapis.com`), so the provider prefs and Firefox's parsing may not match. Unverified: I did not check protocol compatibility. Not a drop-in.

### What other forks do

- LibreWolf: disables Safe Browsing. Its FAQ says: "to be fully functional, Safe Browsing requires to include a developer key at build time", that this "means that a Google account becomes a hard requirement for anyone building from source", and that it "cannot provide a fully functional Safe Browsing experience at the moment" (https://librewolf.net/docs/faq/). Users can re-enable it with `librewolf.overrides.cfg` (https://librewolf.net/docs/settings).
- Zen: its CI injects a key (given in the task brief). I did not see how they got it. Unverified.
- Floorp: I found nothing. Unverified. Check Floorp's repo for `safebrowsing` in its mozconfig.
- Other forks: not researched.

### Options for Origin

1. Ship with no key, and set the remote download check off. Cleanest for the "never contacts a third party for nothing" rule. Costs real protection, and the Settings page should stop claiming otherwise. Needs a Settings note or a hidden pane (Zen UI work, so deferred per CLAUDE.md).
2. Get an Origin key from a Google Cloud project owned by the project, ship it in the CI build, and keep the notice text Google asks for. Gives protection. Costs the user's Google account, a terms judgment, and a Google dependency. The CLAUDE.md rule on spending money does not apply while it is free. The rule on keys leaving the Mac does not apply to a public key but I would still ask.
3. Both: ship the keyless build to testers now, add a key at release.

My pick: option 1 now (add `browser.safebrowsing.downloads.remote.enabled` false to a new `prefs/origin/safebrowsing.yaml`, or to `background.yaml`), and put option 2 to the user as a decision. Next small step: ask the user whether Origin may use a Google Cloud key under the non-commercial terms.

## Sources

- Google Safe Browsing get started: https://developers.google.com/safe-browsing/v4/get-started
- Google Safe Browsing terms: https://developers.google.com/safe-browsing/terms
- Google Safe Browsing v4 usage limits: https://developers.google.com/safe-browsing/v4/usage-limits
- Mozilla Safe Browsing wiki: https://wiki.mozilla.org/Security/Safe_Browsing
- LibreWolf FAQ: https://librewolf.net/docs/faq/
- LibreWolf settings: https://librewolf.net/docs/settings
