# Small memory items, 2026-10-13

Source: the user's anonymized about:memory reports in `../Zen-Origin-research/user-reports/2026-10-13-memory/` (`memory-report.json.gz`, parsed with `python3 -I`). Firefox source paths are under `engine/`. Everything not marked as read in source or in the report is a guess and says "unverified".

## 1. Translations language detector (cld-worker.js, 17.5 MB)

### What the report shows

- The Main Process holds `worker(resource://gre/modules/translations/cld-worker.js)` with one 16,777,216 byte ArrayBuffer (`.../class(ArrayBuffer)/objects/malloc-heap/elements/...`) plus 1.2 MB of decommitted GC pages. The 16 MB buffer is the Emscripten heap.
- The heap starts at 2 MB (`-s TOTAL_MEMORY=2097152 -s ALLOW_MEMORY_GROWTH=1`, `toolkit/components/translations/cld2/Makefile:23`). Reaching 16 MB means it grew three times. Emscripten cannot shrink it.
- A page text sample is at most about 4096 code units (`TEXT_SAMPLE_TARGET_CODE_UNITS`, `TranslationsParent.sys.mjs:829`). That cannot grow a 2 MB heap. Something fed the worker a much larger string, or the sample is not a hard cap. Which one is unverified.

### Who calls the detector

- `TranslationsParent.#identifyLanguageFromTextSample` (`actors/TranslationsParent.sys.mjs:4779-4800`) calls `LanguageDetector.detectLanguage(textSample)`.
- It is reached from `#createLangTags` (`:5113-5137`) through `getLangTags` (`:5084`). `#createLangTags` always identifies, even when the page has a valid `lang` attribute. The attribute only decides which result wins afterwards.
- `getLangTags` runs from `#handleTranslationsEnabled` (`:4744-4761`), which `actorCreated` starts (`:1442`) for every top-level page. The actor matches `about:blank`, `file:`, `http(s):` and `moz-extension:` (`toolkit/modules/ActorManagerParent.sys.mjs:625-642`). It is on while `browser.translations.enable` is true.
- So it runs on every top-level page load, in background tabs too (they only cache the result), after the document has loaded. `#requestDocumentLanguageMetadata` returns null for the initial about:blank document, so the empty tab does not trigger it.
- Two rarer callers: `selectTranslationsPanel.js:312` (text selected by the user, can be large) and `AboutTranslationsChild.sys.mjs:319` (about:translations input, can be large, runs in the parent's worker through the shared module).

### Worker size and restart cost

- It is asm.js, not WASM. `cld2/cld-worker.js` is 155,622 bytes and `cld-worker.js.mem` (the data tables) is 1,097,263 bytes.
- A restart costs one `new Worker`, a parse of 155 KB of asm.js, a read of 1.1 MB, and a 2 MB heap. My guess is a few tens of milliseconds, off the main thread. Unverified, nobody measured it.
- The language result of a page is cached per tab (`languageState.detectedLanguages`, `StatePerTab`), so a restart only delays the Translations offer for the next page by that amount.

### Current lifecycle

`WorkerManager.detectLanguage` (`LanguageDetector.sys.mjs:59-80`) calls `flushWorker()` only after a string of 1.5M code units or more (or when a flush is already pending). `flushWorker` terminates the worker after `IDLE_TIMEOUT` of 10 s with an empty queue. In normal browsing it never runs, so the worker lives until quit.

### Smallest change

Flush after every call, with a 30 s idle timeout. The timer restarts on each call, so a burst of page loads keeps one worker and a quiet browser frees 17 MB (heap plus runtime) 30 s after the last page.

```diff
--- a/toolkit/components/translations/LanguageDetector.sys.mjs
+++ b/toolkit/components/translations/LanguageDetector.sys.mjs
@@
-  IDLE_TIMEOUT = 10_000;
+  IDLE_TIMEOUT = 30_000;
@@ async detectLanguage(options) {
-    if (
-      options.text.length >= this.LARGE_STRING ||
-      this.idleTimeoutId != null
-    ) {
-      this.flushWorker();
-    }
+    // ponytail: recycle the worker after every use, CLD2's heap never shrinks and page loads are minutes apart; keep it alive longer if profiles show restart cost
+    this.flushWorker();
```

This is a patch against Firefox source. By the repo's convention it goes in `src/toolkit/components/translations/LanguageDetector-sys-mjs.patch` (unverified that the `src/toolkit` tree exists yet; the tabbrowser patches live in `src/browser/components/tabbrowser/`). The `LARGE_STRING` field becomes unused and can stay, to keep the diff at four lines.

### Trade-off

- Saves up to about 17.5 MB in the Main Process whenever the browser has been idle for 30 s. Not measured.
- Costs one worker start per page load that arrives more than 30 s after the previous one. That load pays the restart before its Translations offer.
- The existing termination code already handles a queued request arriving at timeout (it reschedules). I found no race in it. A page load that lands exactly as the worker terminates gets a new worker through `getWorker()`.
- Needs a harness run to claim the saving: idle profile with and without the patch, `memory-report` after 60 s.

## 2. The 22 MB "Web Content" process and the 21 MB "Privileged Content" process

### What the report shows

- Web Content (pid 57252): `resident-unique` 21.1 MB, `heap-allocated` 5.8 MB, one top window `top(<anonymized-9>, id=10)` with a nearly empty document (pres-shell 14 KB, 2.5 KB of element nodes). The URL is anonymized, so the page is not named.
- Privileged Content (pid 57249): `resident-unique` 19.1 MB, `heap-allocated` 4.4 MB, no window at all. It is idle.
- Window id 10 was created after browser.xhtml (id 3) and before the extension `dummy.xhtml` (id 11) and the extension pages (id 14 and up). So the document is an early startup tab.
- The other content processes are Isolated Web Content (643 MB, real sites) and WebExtensions (253 MB).

### Which tab holds the Web Content process

Most likely the empty tab. Reasons:

1. `about:blank` and `about:srcdoc` are loaded by normal web content (`dom/ipc/ProcessIsolation.cpp:278-283`, `IsolationBehavior::WebContent`). In Firefox 157 this logic lives in C++. `toolkit/modules/E10SUtils.sys.mjs` only lists the remote type names and has no about:blank rule.
2. The empty tab is created at startup with `gBrowser.addTrustedTab("about:blank", { inBackground: true, ... _forZenEmptyTab: true ... })` (`src/zen/spaces/ZenSpaceManager.mjs:244-252`). That makes a real browser and starts the load at once, so it gets a process.
3. With Fission, real sites go to isolated processes. The shared "web" process is only for pages with no site of their own, such as about:blank. I found nothing else in Zen that creates a blank document at startup.

Second candidate: Zen's initial tab. Zen marks the window's first tab for replacement (`handleInitialTab`, `ZenSpaceManager.mjs:1015-1026`) and removes it later (`:941-950`). In Origin it would load the new `about:blank` homepage. If it was removed, its document is gone, so a surviving window points back at the empty tab. The anonymized URL stops me from proving it. Unverified.

### Can the empty tab be lazy

Yes in principle. `addTab` takes `createLazyBrowser` (`Tabbrowser.sys.mjs:3798, 3973`). The tab then has no `<browser>` in the DOM and no process. Firefox uses it for session-restored tabs, and selecting the tab inserts the browser (`#insertBrowser`, `:3357`). An empty tab that is only selected when the user opens a new tab pays the process cost at that moment, which is what the brief asks for.

What in Zen depends on it being loaded (path-limited `rg` over `src/zen`):

- `ZenSpaceManager.mjs:207-214` (`selectEmptyTab`) reads `_emptyTab.documentGlobal`, a tab element property that works for a lazy tab.
- `ZenSpaceManager.mjs:1849-1851` calls `TabStateFlusher.flush(emptyTab.linkedBrowser)`. Whether flushing a lazy browser inserts it is unverified. Any property that the lazy stub does not define makes `#insertBrowser` run (`Tabbrowser.sys.mjs:3319-3335`), which would spawn the process again and defeat the change.
- `ZenWindowSync.sys.mjs:1392-1397` creates an empty tab in the other windows, and `ZenFolders.mjs:681` creates `about:blank` folder tabs. Both would need the same flag.
- Split view uses the empty tab as a partner pane (`ZenViewSplitter.mjs:2518-2575`) and its tests (`src/zen/tests/split_view/browser_split_view_empty.js`, `tests/spaces/browser_change_to_empty.js`) assume a loaded browser. They would show real breakage first.
- `OriginTabUnloader.sys.mjs:96` already skips the empty tab, so unloading does not touch it.
- The Tabbrowser patch already guards `browsingContext` being null on the first two tabs (`Tabbrowser-sys-mjs.patch` near the `hasSiblings` hunk), which is the case a lazy tab produces.
- After a restart the session store may restore the empty tab lazily by itself (`#initializeEmptyTab` reuses it, `ZenSpaceManager.mjs:236-241`). Zen then selects it and opens the urlbar (`:958-985`), which loads it. So the saving is only for sessions where another tab is selected at startup. Unverified.

### Smallest change

One line in `#initializeEmptyTab` (`ZenSpaceManager.mjs:244`): add `createLazyBrowser: true` to the options. The empty tab is created in the background, so nothing selects it until the user presses new tab.

```diff
     this._emptyTab = gBrowser.addTrustedTab("about:blank", {
       inBackground: true,
+      createLazyBrowser: true, // ponytail: no process until first select, upgrade to a full browser if a Zen path touches linkedBrowser early
       userContextId: 0,
```

Check before shipping: run the split view and space tests, watch for the Nightly-only "Lazy browser prematurely inserted" console message, then restart a profile and confirm `procinfo` shows no "web" process until the first Cmd+T. Saves about 21 MB resident-unique per the report, only when no other tab uses the shared web process. Note that the urlbar opens over the tab at startup (`openOnStartup`, default true), which selects the empty tab. If that is the default flow, the saving is zero at startup and only appears when the user opens another tab first. Unverified, check `zen.urlbar.open-on-startup` behaviour in a run.

## 3. Privileged about process at startup with Origin's prefs

Checked against `prefs/origin/firefox.yaml:44-50` and `prefs/origin/memory.yaml:13` (`browser.newtab.preload` false).

- `browser.startup.homepage = about:blank` removes the about:home load of the window's first tab (`HomePage` reads this pref; `AboutHomeStartupCache.sys.mjs:139-148`).
- `browser.startup.page` is already 3 (`prefs/firefox/browser.yaml:5`), so `AboutHomeStartupCache.init` returns early (`willLoadAboutHome` false). It never opens its cache pipes or waits for a privileged process. It still has a `ipc:content-created` observer only when it passes that check, so none here.
- `NewTabPagePreloading` is off through `browser.newtab.preload`, so no hidden about:newtab browser is built.
- `browser.newtabpage.enabled = false` does NOT make about:newtab load in a web process. `AboutNewTabRedirector.sys.mjs:545, 616-620` only swaps the page: with the pref false it serves the plain chrome blank tab page instead of Activity Stream. The page is still `about:newtab`, which still uses the privileged about remote type (unverified for the exact flag, `ProcessIsolation.cpp:300-325` reads the module's `URI_MUST_LOAD_IN_CHILD` / `URI_CAN_LOAD_IN_PRIVILEGEDABOUT_PROCESS`). So the pref saves the Activity Stream memory, not the process, whenever a tab does load about:newtab.
- Nothing in `src/zen` loads about:home or about:newtab at startup. `selectEmptyTab` falls back to the first `browser.startup.homepage` URL (`ZenSpaceManager.mjs:221-224`), which is now about:blank. `ZenUIManager.mjs:619-660` opens the urlbar instead of a page for Cmd+T.
- `BrowserGlue.sys.mjs:1685` opens `about:home` only for the upgrade spotlight (`relatedToCurrent`), not on a normal start. The welcome and override pages are locked to `""` (`prefs/origin/branding.yaml:9-20`).
- Session restore can still bring back about:home, about:newtab, about:preferences or about:addons tabs from an old session. Any of those starts a privileged about process. `SessionStore.sys.mjs:7891` also opens `AboutNewTab.newTabURL` when undoing a closed window. Both are user-driven.

The report's idle Privileged Content process (no window) fits a process that served about:home from a build without these prefs, kept after Zen removed that tab. I cannot tell the build from the report. Unverified. After the next Origin build, check `procinfo` at startup with a clean profile: if a privileged about process is still there, something else loads an about: page.

## Order of work

1. Patch `LanguageDetector.sys.mjs` (4 lines, 17.5 MB idle saving, one harness run).
2. Try `createLazyBrowser: true` on the empty tab and run the Zen split view and space tests.
3. Re-run the startup process list on the next build to confirm the privileged about process is gone.
