# Memory by process, idle with 10 loaded tabs

Date: 2026-10-13. Research from data already measured and from source reading. No build, no run, no new measurement. "Unverified" marks anything I inferred.

## Short version

1. Origin v3 uses 984 MB at idle against 1,200 MB for stock Zen (3 runs). The 216 MB gap is 62 MB in the parent, 44 MB in the GPU process and 109 MB in content processes. Utility, RDD, socket and system helpers are identical.
2. The harness cannot tell content process roles apart. Every web, extension and privileged about process has the same last argument, `tab`. I matched roles by size and start order, and every role claim below is unverified.
3. The content gap is most likely the 3 spare processes (about 65 MB, cut by `dom.ipc.processPrelaunch.enabled` false) and the preloaded new tab page (about 36 MB, cut by `browser.newtab.preload` false). Together that is 101 of 109 MB.
4. Firefox 157 starts six built-in add-ons with persistent background pages, so the extension process exists as long as any of them ships. Dropping it means dropping webcompat, form autofill and picture-in-picture. I would not.
5. No about:memory data exists. Batch memory-1 never ran, so item 4 of the brief has no answer from measurements.

## What was read

- Runs: `../Zen-Origin-research/perf.noindex/runs/` batches baseline-1 (zen-stock, firefox, zen-official, 3 runs each), origin-1 (origin 1 run, zen-stock control 1 run), plus test and profiler batches that I did not use.
- File: `idle/r<N>/idle.zostat.jsonl`, 61 samples over the 60 s idle window. I dropped the first sample and averaged the other 60 per process, then averaged over runs.
- Metric: `phys_footprint` (`ri_phys_footprint` from `proc_pid_rusage`, `scripts/perf/zo-stat.swift:104`) for every process in the browser's resource coalition. It is not RSS. It counts compressed and swapped pages, and it can be lower than RSS for shared memory.
- Role: `scripts/perf/zo-stat.swift:50-93` stores the last argv entry as `role`. That gives `gpu`, `socket`, `rdd`, `utility` for the helpers. The parent has the profile path as its last argument. Every content process has `tab`.
- The two utility processes per browser (18 and 17 MB) cannot be told apart either. Audio and generic are the usual pair (unverified).
- "Other" is macOS system services in the coalition: SafariPlatformSupport helper (10 to 11 MB), VTDecoderXPCService (3 MB) and SetStoreUpdateService (2 MB). They appear in every browser and are not Gecko.
- WindowServer's memory is not recorded. `conclave_mem` is 0 and the coalition counters carry no footprint, so I have no WindowServer share.
- Origin has one idle run. Treat differences under about 10 MB as noise. The zen-stock control in origin-1 (1 run, 1,222 MB) sits 22 MB above the baseline-1 mean (1,200 MB, range 1,195 to 1,205).

## 1. Idle footprint per process (MB)

| Process | origin v3 (1 run) | zen-stock (3 runs) | zen-stock control (1 run) | firefox 157 (3 runs) | zen-official (3 runs) |
|---|---|---|---|---|---|
| parent | 226 | 288 | 302 | 307 | 253 |
| GPU | 153 | 198 | 207 | 171 | 196 |
| content processes (count) | 518 (13) | 627 (16) | 626 (16) | 598 (15) | 622 (16) |
| utility (2 processes) | 36 | 36 | 36 | 36 | 36 |
| RDD | 18 | 18 | 18 | 18 | 18 |
| socket | 17 | 17 | 17 | 17 | 17 |
| other (system helpers) | 16 | 16 | 16 | 18 | 16 |
| inference | none | none | none | none | none |
| WindowServer share | not recorded | not recorded | not recorded | not recorded | not recorded |
| total | 984 | 1,200 | 1,222 | 1,165 | 1,158 |

Parent run-to-run spread is 283 to 292 for stock Zen and 300 to 313 for Firefox. The GPU process is steady within 1 MB for Firefox and 4 MB for official Zen.

## 2. Origin against stock Zen and Firefox

| Process | origin less zen-stock (3-run mean) | origin less control | origin less firefox |
|---|---|---|---|
| parent | -62 | -76 | -81 |
| GPU | -44 | -54 | -18 |
| content | -109 | -108 | -80 |
| utility, RDD, socket, other | 0 | 0 | -2 |
| total | -216 | -238 | -181 |

Content processes ranked by size, mean over runs (MB). Sizes are rank by rank, not role by role.

| Rank | origin | zen-stock | firefox |
|---|---|---|---|
| 1 | 67 | 70 | 69 |
| 2 | 64 | 64 | 64 |
| 3 | 62 | 62 | 61 |
| 4 | 45 | 58 | 59 |
| 5 | 40 | 46 | 45 |
| 6 | 36 | 40 | 39 |
| 7 | 34 | 37 | 38 |
| 8 | 33 | 34 | 34 |
| 9 | 33 | 34 | 33 |
| 10 | 31 | 33 | 33 |
| 11 | 29 | 31 | 30 |
| 12 | 23 | 30 | 29 |
| 13 | 22 | 23 | 21 |
| 14 | none | 22 | 21 |
| 15 | none | 22 | 21 |
| 16 | none | 22 | none |

The harness opens 10 distinct sites, so 10 of these are site processes (one per host, site isolation as shipped). The rest are extras.

Reading of the extras, all unverified:

- Stock Zen has 6 extras: one of about 58 MB that starts first (pid right after the socket process, 397 ms CPU), one of about 46 MB that starts late, one of about 23 MB, and three of about 21.7 MB that start last.
- The three 21.7 MB processes match the 3 spare processes (`dom.ipc.processPrelaunch.fission.number` is 3, `StaticPrefList.yaml:3685-3693`), and `prefs/origin/memory.yaml` already describes them as "about 21 MB each". Firefox has the same three.
- The 58 MB process most likely hosts the preloaded about:newtab (Activity Stream) in the privileged about process. Firefox shows the same size at rank 4.
- The 46 MB process most likely is the extension process with the six built-in add-ons. Origin and Firefox both have it at 45 MB.
- Origin has 3 extras: the 45 MB process, and two of about 22 MB. One of the 22 MB ones starts first, where stock Zen starts its 58 MB one. My reading is that it is the same privileged about process, now without a preloaded Activity Stream, which is why it shrank from 58 to 22 MB.
- That reading adds up. Spares 65 MB plus the 36 MB shrink is 101 MB, against a 109 MB content gap. The last 8 MB is small shifts in the site processes.
- Origin v3 still has `browser.startup.homepage` at `about:home` and the new tab page enabled in its bundle (checked in the app's `omni.ja`: `browser.startup.homepage", "about:home"` and `browser.newtabpage.enabled`, true). The blank home page from `prefs/origin/firefox.yaml` is not in v3.

Parent (-62 MB against stock Zen): v3 has Zen's Motion library and several effects that later commits cut, and it has `browser.newtab.preload` false. I did not find a measured cause (unverified). The existing note `docs/research/newtab-2026-10-13.md` lists what the parent builds for Activity Stream at startup.

GPU (-44 MB against stock Zen): v3 has fewer backdrop-filter and vibrancy layers. `docs/research/gpu-memory-2026-10-13.md` says tile and texture memory scale with the number of effect layers. The cause is unverified.

Origin's GPU process (153 MB) is still 18 MB below Firefox (171 MB). Origin's parent (226 MB) is 81 MB below Firefox's 307 MB.

## 3. Processes that exist only because of a feature Origin may not need

Site isolation and the sandbox stay as shipped, so one process per site is not listed.

| Process | In Origin v3 | Controlling switch | Verdict |
|---|---|---|---|
| spare content processes (3 x about 21.7 MB) | gone | `dom.ipc.processPrelaunch.enabled` (`firefox.js:2881-2883`, already false in `prefs/origin/memory.yaml`); count in `dom.ipc.processPrelaunch.fission.number` (`StaticPrefList.yaml:3685`) | done |
| preloaded new tab page (about 36 MB) | gone | `browser.newtab.preload` (already false in `prefs/origin/memory.yaml`) | done |
| privileged about process (about 22 MB left, unverified) | probably present | `browser.tabs.remote.separatePrivilegedContentProcess` (`firefox.js:1157`, true); `dom.ipc.processCount.privilegedabout` is 1 (`all.js:1881`) | goes away on its own once nothing loads an about: page at startup; do not turn the separation off, it is a security split |
| privileged mozilla process | not seen | `browser.tabs.remote.separatePrivilegedMozillaWebContentProcess` (`firefox.js:1162`); domains in `browser.tabs.remote.separatedMozillaDomains` (`all.js:1912`) | starts only on addons.mozilla.org or accounts.firefox.com; nothing to do |
| file process | not seen | `browser.tabs.remote.separateFileUriProcess` (`StaticPrefList.yaml:2193`) | starts only on file:// pages |
| extension process (about 45 MB, unverified) | present | `extensions.webextensions.remote` (`firefox.js:67`, true), `dom.ipc.processCount.extension` is 1 (`all.js:1878`) | see below |
| inference process | not seen | `browser.ml.enable` and `extensions.ml.enabled` | already not running; `prefs/origin/ai.yaml` and `browser.ai.control.default` blocked cover it |

### Built-in add-ons that start in Firefox 157

The app's `chrome://browser/content/built_in_addons.json` (read from the v3 `omni.ja`) lists six add-ons. The list is generated from the `builtin-addons` directories that the build installs (`engine/toolkit/mozapps/extensions/moz.build:25-39`, `gen_built_in_addons.py`). `engine/browser/extensions/moz.build` decides which directories exist.

| Add-on | Background page | What it does | Needed by Origin? |
|---|---|---|---|
| `webcompat@mozilla.org` | yes, many scripts | site fixes (interventions, shims), reads Remote Settings | yes, it fixes broken sites |
| `formautofill@mozilla.org` | yes, a stub (`background.js` only listens to `onUpdateAvailable`) | address and card autofill; its experiment API runs in the parent | probably yes (unverified) |
| `pictureinpicture@mozilla.org` | yes | picture-in-picture overrides; Zen patches PiP (`src/toolkit/components/pictureinpicture/`) | yes |
| `newtab@mozilla.org` | yes, a stub | carries the Activity Stream bundles that about:home and about:newtab load | not for a blank page, but `AboutNewTab.onBrowserReady` waits for it (`newtab-2026-10-13.md`) |
| `addons-search-detection@mozilla.com` | yes | reports when a search-engine add-on is installed (hidden) | no (unverified) |
| `ipp-activator@mozilla.com` | yes, persistent | helper for IP Protection, which Origin removed | no (unverified) |

All six are manifest version 2 with a background page and no `"persistent": false` except where listed, so Gecko starts every one in the extension process at launch (unverified: I did not read the event-page start path in `toolkit/components/extensions`). The extension process needs only one of them to exist. I found no per-add-on pref in `firefox.js`, `all.js`, `StaticPrefList.yaml` or `toolkit/components/extensions` that stops one from starting. The switch is build-level: delete its directory from `engine/browser/extensions/moz.build`.

Consequence for the extension process:

- Dropping `ipp-activator` and `search-detection` saves a few MB inside the extension process and parent (unverified), and the process stays.
- Dropping all six removes the process, about 45 MB. That loses webcompat fixes, autofill and picture-in-picture, and any extension the user installs starts the process again.
- Setting `extensions.webextensions.remote` to false runs extensions in the parent. That moves the memory into the parent instead of saving it, and I did not check that Firefox 157 still supports it. Not recommended.
- My ranking: delete `ipp-activator` first (dead after the IP Protection cut), `search-detection` second, and leave the other four.

## 4. Biggest items in Origin's parent process

Not available. `scripts/perf/memreport` has never run: `../Zen-Origin-research/perf.noindex/memreport/` does not exist, and batch memory-1 is not in `runs/`. The chain stopped on 2026-10-13 07:10 (`PROGRESS.md`). No run holds an about:memory report or `ChromeUtils.requestProcInfo` output.

What would settle items 1 to 3 in one run:

1. `scripts/perf/hold scripts/perf/memreport origin` followed by the same for `zen-stock` and `firefox`.
2. `procinfo.json` from that run gives `type` and `origin` for each pid, which names the extension, privileged about and web processes. Compare against the sizes above.
3. `memreport.md` gives the parent's largest subtrees. `memreport --compare` diffs two browsers.

Until then, the only parent-process hints are in `docs/research/newtab-2026-10-13.md` (Activity Stream feeds, ASRouter and its Remote Settings fetches, all in the parent) and `docs/research/gpu-memory-2026-10-13.md`. Neither has a measured size.
