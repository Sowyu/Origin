# Rebase rehearsal onto Zen's Firefox 158 work, 2026-10-13

I replayed Origin's 34 commits (`upstream..main`, head `f657359`) onto two Zen snapshots in a throwaway clone, using `scripts/sync-upstream` itself. The clone is deleted. Nothing in this repo changed except this file. I built nothing, so "resolved" below means the files merge and parse, not that Origin builds or runs.

## Setup

- Clone: `git clone --no-local` into `/tmp/origin-rebase-test`, with `upstream` fetched from this repo (`bd9a10a Zen 1.23.2b`).
- Zen has no `main` branch. Its default branch is `dev`, head `42d5c34` (2026-10-13 01:04, "gh-14856: Fix unwanted label next to the search icon in urlbar").
- `bfae69f` resolves to `bfae69ff14fbfeaf307018475b6aa36ea925d21d` ("gh-15893: Update to Firefox `158.0`", 2026-10-11). A short SHA cannot be fetched, so I resolved it through the REST API first. `dev` is 3 commits ahead of it.
- `sync-upstream` only fetches `refs/tags/<tag>`. I tagged both fetched commits inside the clone (`zen-ff158`, `zen-dev`) and ran the script with `ZEN_REPO=/tmp/origin-rebase-test --tag zen-ff158`. That way the script did its own `commit-tree` and rebase, unchanged.
- To check the regenerated Firefox patches, I fetched the five patched Firefox files at `FIREFOX_157_0_1_RELEASE` and `FIREFOX_158_0_BUILD1` from github.com/mozilla-firefox/firefox and ran `git apply --check`, which is what surfer runs.

Zen 1.23.2b to `bfae69f` changes 144 files (+6,600, -3,623). `surfer.json` keeps `version` at 157.0.1 and sets `candidate` to 158.0, so the script printed "Firefox 157.0.1 -> 157.0.1" and skipped the security advisory reminder.

## Run 1: Origin onto bfae69f (Firefox 158 update)

Per commit, oldest first:

| commit | result | files |
|---|---|---|
| 493e505 to 009f22d (21 commits: workflows, docs, harness, scripts, research) | clean | |
| 7f22688 Rebrand (holds the cut deletions) | auto-resolved | 24 files kept deleted, listed below |
| 7cefbb5 Origin's additions | conflict | `src/zen/tests/tabs/browser.toml` |
| fcb904b, ca3c044 | clean | |
| 1fc09ba Cut Zen features: edits to kept code | conflict | 16 files, listed below |
| ff26087, c40ee69, 146ffe4 | clean | |
| c3fd9fa Lazy-load Motion, URL bar providers, shortcuts, theme picker | conflict | `src/zen/common/modules/ZenUIManager.mjs` |
| 6da3f26, d64ca1e, 16d4050, 60ae6ab (Phosphor icons), f657359 | clean | |

That is 31 clean, 1 auto-resolved, 3 conflicting. 17 distinct files needed a person, the same 17 the script's `--dry-run` predicted. No `.github` files came up.

The 24 auto-resolved files are Zen edits to features Origin cut: the Library (9 files including its test and locale), Live folders (6), Space routing (5), `ZenMediaController.mjs`, `Components.manifest`, `ZenUIComponent.sys.mjs`, and `src/zen/tabs/moz.build`. The last one is wrong, see silent problems.

### Conflicts and how to resolve them

Times are for a person who knows the cut list, working by hand.

| file | commit | why it conflicts | resolution | time | rule could do it? |
|---|---|---|---|---|---|
| `src/zen/tests/tabs/browser.toml` | 7cefbb5 | Zen added `browser_issue_14534.js` on the line where Origin added `browser_origin_tab_unloader.js`. | Keep both entries. | 1 min | Yes, `merge=union` in `.gitattributes` for `browser.toml`. |
| `Tabbrowser-sys-mjs.patch` | 1fc09ba | 96 conflict blocks. 85 are only `@@` line numbers and `index` hashes, because Zen re-exported every patch for Firefox 158. The other 11 are hunks Origin removed (Glance, Space routing) that Zen rewrote with new context. | Merge at the source level: apply old Zen and Origin patches to Firefox 157, new Zen to Firefox 158, `git merge-file`, re-export. That gave 0 conflicts, no Glance or Space routing lines, and `git apply --check` passed on 158. | 5 min with the tool, 2 hours by hand | Yes, see improvement 1. |
| `SessionStore-sys-mjs.patch` | 1fc09ba | 39 blocks, 36 header-only. 3 are near Glance hunks Origin dropped. | Same source-level merge, 0 conflicts. | 5 min / 45 min | Yes. |
| `BrowserContentHandler-sys-mjs.patch` | 1fc09ba | 3 blocks. Zen added new Space routing calls next to the hunks Origin removed. Zen also added a `--space` command-line flag that Origin keeps. | Same source-level merge, 0 conflicts. It kept `--space` and dropped Space routing. | 5 min / 15 min | Yes. |
| `preferences-js.patch` | 1fc09ba | 3 blocks, 2 header-only, 1 next to a removed pane. | Same source-level merge, 0 conflicts. | 2 min / 10 min | Yes. |
| `tabs-js.patch` (DU) | 1fc09ba | Firefox renamed `tabs.js` to `tabs.mjs` and Zen renamed the patch. Git did not detect the rename even at 20 percent similarity, because the module conversion re-indented every line. Origin's edit removed the Glance block. | `git rm tabs-js.patch`, then delete the 7 Glance lines in `tabs-mjs.patch` and fix the hunk count. It applies to 158. | 10 min | Partly. A rename map (`tabs-js.patch` to `tabs-mjs.patch`) plus a whitespace-blind merge would do it. |
| `zen-assets.jar.inc.mn` | 1fc09ba | Zen dropped the Live folders include from the block Origin deleted. | Keep the block deleted. | 1 min | Yes, see the list rule below. |
| `src/zen/moz.build` | 1fc09ba | Zen added `"tabs"` to `DIRS` next to entries Origin removed. | Keep `"tabs"`, drop the cut dirs. This depends on fixing `src/zen/tabs/moz.build`, see silent problems. | 2 min | Yes, with the list rule. |
| `src/zen/common/moz.build` | 1fc09ba | Zen added `EXTRA_JS_MODULES.zen` (Toasts, VerticalTabsManager) and moved `ZenUIComponent` into the block Origin removed. | Keep Zen's new block, drop the `zen.ui` block. A naive line-set merge also dropped a `]`, so check by eye. | 3 min | Mostly. |
| `ZenPreloadedScripts.js` | 1fc09ba | Zen added `ZenVerticalTabsManager.mjs` and `ZenTabRenamer.mjs` beside Origin's removed Mods, Glance, Media and Share entries. | Keep Zen's additions, drop the cut ones. | 2 min | Yes, list rule. |
| `src/zen/tests/spaces/browser.toml` | 1fc09ba | Zen added `browser_zen_workspace_cmdline.js` after `browser_workspace_bookmarks.js`, which Origin removed. | Keep the new test, drop the bookmarks one. | 1 min | Yes, list rule. |
| `ZenFolders.mjs` | 1fc09ba | Zen edited the Live folders context menu line that Origin deleted. | Keep it deleted. | 2 min | Yes, with a cut-word list. |
| `ZenPinnedTabManager.mjs` | 1fc09ba | Zen switched the tab rename menu item to `gZenTabRenamer` in the block Origin deleted. | Keep it deleted. | 2 min | Yes, with a cut-word list. |
| `ZenSpaceManager.mjs` | 1fc09ba | Origin deleted a Glance check, and Zen added a new `if (!tab.selected)` guard right after it in the same region. | Drop the Glance check, keep Zen's guard. | 5 min | No. A person must spot the new code. |
| `ZenStartup.mjs` | 1fc09ba | Zen switched `promiseInitialized` to `Promise.withResolvers` around code Origin removed (watermark, welcome, bookmark rebuild). | Take Origin's version and re-apply Zen's 5 small edits. | 10 min | No. |
| `ZenUIManager.mjs` | 1fc09ba | Zen split the file into `ZenVerticalTabsManager.mjs`, `ZenUrlbarController.mjs`, `ZenToasts.mjs` and `ZenTabRenamer.mjs` (1,856 lines changed). Origin's 7 cut edits now belong in those new files. | Take Zen's file. Re-apply the Glance edits in `ZenVerticalTabsManager.mjs` and the welcome check in `ZenUrlbarController.mjs`. Port the rename cut into `ZenTabRenamer.start`. | 40 min | No. |
| `zen-sets.js` | 1fc09ba | Zen rewrote the command `switch` into a `ZEN_COMMANDS` map. | Take Zen's file and delete 10 entries again: the Library and Live folders getters, the Library capture listener, both Share commands, Space routing, Live folders, the Library toggle, Glance in TogglePinTab and the Glance fallback. Also drop the new `cmd_zenManageWorkspaces`, which opens the Library. | 20 min | Partly. A cut-word list finds every line, but the edits are by hand. |
| `ZenUIManager.mjs` | c3fd9fa | Same split. Origin's lazy URL bar providers and Motion checks now live elsewhere. | Take Zen's file. Move the `gURLBar.startQuery` wrapper into `ZenUrlbarController.init` and the two `!gZenUIManager.motion` reorders into `ZenVerticalTabsManager.mjs`. | 15 min | No. |

### Silent problems the script did not report

These merged without a conflict or were auto-resolved, and each would break the build or bring back cut code. I found them only by grepping the result for cut feature names.

1. `src/zen/tabs/moz.build` was "kept deleted" by mistake. Zen added it in this release to register `ZenTabRenamer.mjs`. Git's rename detection paired it with Origin's deleted `src/zen/live-folders/jar.inc.mn` (62 percent similar, both are a license header and a short list). The script saw "modified by Zen, deleted by Origin" and removed it. `ZenPreloadedScripts.js` still loads `resource:///modules/zen/ZenTabRenamer.mjs`, so every window would fail to load it.
2. `ZenTabRenamer.mjs` came back. Zen moved tab, folder and space renaming into it. Origin cut tab rename but keeps folder and space rename, so the file has to stay with the tab path cut again. I restored `tabs/moz.build` and applied Origin's `renameTabStart` edit to `ZenTabRenamer.start`.
3. `ZenUrlbarController.mjs` is a new file that still checks `zen-welcome-stage`, from the cut Welcome flow. Harmless, but it is dead code that came back.
4. New Zen tests landed in `src/zen/tests/ui/`. `browser_tab_renamer.js` and `browser_tab_loading_indicator.js` test features Origin cut and would fail. Zen also put `browser_library_closed_tab_icon.js` in `src/zen/tests/library/`, a folder Origin deleted, as an orphan file.

## Run 2: from run 1 onto Zen dev head 42d5c34

I ran this from run 1's result, so it measures one more small week of Zen. It adds 3 commits (15 files, +620, -143).

- 33 commits clean. 1 auto-resolved: 7f22688 kept 3 Library files deleted.
- 1 conflicting: 1fc09ba, 3 files. In `zen-animations.css` Zen rewrote the loading bar keyframes. In `zen-single-components.css` Zen restyled the loading bar. In `ZenDragAndDrop.js` Zen changed the haptic feedback check. Origin deleted all three. I kept them deleted, about 5 minutes in all. The rule would be the same "Zen edited a block Origin deleted" rule as `ZenFolders.mjs`.
- Silent: Zen added 4 C++ files to `src/zen/library/` (`nsZenLibraryFiles.cpp`, `.h`, `.idl`, `components.conf`). They merged cleanly into a folder Origin deleted and sit there unbuilt.

## Cost

By hand, run 1 costs about 3 to 4 hours of a person's time, plus a build and the smoke test. Most of that is the four Firefox patches (about 3 hours of `@@` header edits) and the `ZenUIManager.mjs` split (about 1 hour across both commits). With source-level patch merging, the list rule and a cut-feature grep, I estimate about 1.5 hours, almost all of it the JS refactor. A normal week like run 2 costs 5 to 10 minutes.

Two facts make it cheaper than these counts suggest. All conflicts land in 2 of Origin's 34 commits (7cefbb5 and 1fc09ba) plus c3fd9fa. Every conflict comes from Origin editing a file Zen also changed. No conflicts came from Origin's added files, prefs or scripts.

## Improvements, ranked

1. Merge Zen's Firefox patches at the source level, not as text. When a `*.patch` file conflicts, the script should apply the old Zen patch and Origin's patch to the old Firefox file, the new Zen patch to the new Firefox file, run `git merge-file` and re-export. In this run that turned 141 conflict blocks in 4 patches into 0. It needs only the touched Firefox files at both release tags, which `raw.githubusercontent.com/mozilla-firefox/firefox/FIREFOX_<ver>_RELEASE/<path>` serves. The engine's own git can do the same with surfer's import and export. Better still, Origin could carry its Firefox edits as its own small patch files applied after Zen's (for example `src/origin/*.patch`) instead of editing Zen's patches. Then Zen's re-exports never conflict and only real context changes do.
2. Keep a machine-readable cut list, `docs/cuts.txt`, with one path or identifier per line (`gZenGlanceManager`, `zen-glance-tab`, `SpaceRouting`, `ZenLibrary`, `src/zen/library/`, and so on). With it the script can do three things. It can resolve list-file conflicts in `moz.build`, `jar.inc.mn`, `browser.toml` and `ZenPreloadedScripts.js` by keeping Zen's new entries unless they name something on the list. It can delete new Zen files under cut folders, which here were the 4 Library C++ files and the Library test. After the rebase it can grep the tree for every cut identifier and fail if any is still referenced, which would have caught `ZenTabRenamer`, `zen-welcome-stage` and the new tests.
3. Never let "kept deleted" remove a file that is new in Zen. Run the rebase with `-X no-renames`, or check before `git rm` that the path did not exist in the old `upstream` tree. This was the one case in this run where the script's automatic rule broke the build. In the same change, read `version.candidate` from `surfer.json` when it differs from `version`, so the Firefox advisory reminder fires on Firefox bumps. It did not fire here.

Smaller changes I would also make:

- Add `merge=union` for `src/zen/tests/**/browser.toml`.
- Accept `--ref <sha>` next to `--tag`, so a rehearsal against Zen's `dev` needs no local tags.
- Split 1fc09ba into one commit per cut feature, so a conflict names the feature. This costs nothing at rebase time, and a cut that has become too costly can be dropped as one commit.

## Re-run with the improved script, 2026-10-13

I changed `scripts/sync-upstream` in the three ways ranked above and added `docs/cuts.txt`, then repeated both runs the same way: `git clone --no-local` into `/tmp/origin-rebase-test`, `upstream` fetched from this repo, `bfae69f` and `42d5c34` fetched by full SHA and tagged `zen-ff158` and `zen-dev` inside the clone, and `ZEN_REPO` pointed at the clone. main had grown to 42 commits (head `31c7016`). I added one test-only commit with the new script and cut list, because the script reads the cut list from `main:docs/cuts.txt`. A second clone with the old script stopped at the same first commit with the same 24 "kept deleted" files, `src/zen/tabs/moz.build` among them, so the before numbers above still hold for the bigger main. The clones are deleted. I built nothing.

What changed in the script:

- It rebases with `-X no-renames`, and "kept deleted" only applies to a path that existed in the old `upstream`.
- It reads `version.candidate` from `surfer.json`, so it now prints "Firefox 157.0.1 -> 158.0" and the 3-day advisory reminder.
- It merges a conflicting Zen `.patch` under `src/` at the source level, using the Firefox files from `raw.githubusercontent.com/mozilla-firefox/firefox`, tag `FIREFOX_<ver>_RELEASE` with `FIREFOX_<ver>_BUILD<n>` as the fallback.
- It merges list files (`moz.build`, `*jar.inc.mn`, `browser.toml`, `ZenPreloadedScripts.js`, `*.manifest` and a few more) and drops entries that name a cut.
- It deletes Zen files that land in cut paths, which also covers `.github`.
- At the end it fails with a file and line list if a cut name, or the file name of a cut file, is still referenced in `src`, `prefs`, `locales` or `configs`.
- It copies itself to `.git/sync-upstream` before the rebase, because the working tree holds an older copy of the script while the rebase is stopped, and `--continue` runs from there.

### Run 1 onto bfae69f, before and after

| | old script | new script |
|---|---|---|
| commits that stopped | 3 (7cefbb5, 1fc09ba, c3fd9fa) | 2 (1fc09ba, c3fd9fa) |
| files needing a person | 17 | 8 (7 in 1fc09ba, `ZenUIManager.mjs` again in c3fd9fa) |
| conflict blocks in Firefox patches | 141 in 4 patches | 0, all 4 merged at the source level |
| list files resolved by the script | 0 | 6 (both `browser.toml`, `zen-assets.jar.inc.mn`, `ZenPreloadedScripts.js`, `src/zen/moz.build`, `src/zen/common/moz.build`) |
| files "kept deleted" | 24, one of them wrong | 21, all correct |
| new Zen files in cut paths | left in the tree | 3 deleted (`ZenLiveFoldersUI.sys.mjs`, `ZenSpaceRoutingNavigation.sys.mjs`, the Library test) |
| cut code that came back silently | found by hand afterwards | reported by the script, 29 lines in 11 files |

The four merged patches pass `git apply --check` against `FIREFOX_158_0_BUILD1`. None of them adds a Glance or Space routing line, and `BrowserContentHandler` keeps Zen's `--space` flag. `src/zen/common/moz.build` came out as the rehearsal resolved it by hand: Zen's new `EXTRA_JS_MODULES.zen` block kept, the `zen.ui` block and `ZenActorsManager` dropped. `src/zen/tabs/moz.build` stays, so `ZenTabRenamer.mjs` is registered.

The 8 that still need a person are the ones the table above marks "No" or "Partly": `ZenStartup.mjs` (2 blocks), `ZenUIManager.mjs` (4 blocks, then 3 in c3fd9fa), `zen-sets.js` (2), `ZenFolders.mjs` (1), `ZenSpaceManager.mjs` (1), `ZenPinnedTabManager.mjs` (1) and the `tabs-js.patch` to `tabs-mjs.patch` rename (DU). To reach run 2 I resolved them with a stand-in rule, not by hand. `ZenUIManager.mjs` and `zen-sets.js` took Zen's side, and the others took Origin's side, except that `ZenSpaceManager.mjs` keeps Zen's new `!tab.selected` guard and `ZenStartup.mjs` keeps `#initialized.resolve()`. `tabs-js.patch` was deleted without fixing `tabs-mjs.patch`.

The reference check then listed 29 lines. 13 are in `zen-sets.js` and exist only because my stand-in took Zen's side there. The other 16 are real:

- `ZenTabRenamer.mjs` still has the tab rename menu id and the `zen.tabs.rename-tabs` pref.
- `ZenUrlbarController.mjs` still checks `zen-welcome-stage`.
- `ZenVerticalTabsManager.mjs` checks `zen-glance-tab`, the Glance edit that moved out of `ZenUIManager.mjs`.
- `tabs-mjs.patch` adds 3 lines of `glanceTab` code, the Glance block that Origin had removed from `tabs-js.patch`.
- Zen's new `cmd_zenManageWorkspaces` opens the Library, and it shows up in `zen-commands.inc.xhtml`, `popups.inc` and 2 lines in `ZenSpaceManager.mjs`. Those lines merged cleanly and the first rehearsal missed them.
- 5 lines in Zen's new tests: `src/zen/tests/ui/browser.toml`, `browser_tab_renamer.js` and `browser_zen_commands.js`, which stubs `gZenGlanceManager`.

The check did not catch `browser_tab_loading_indicator.js`, because nothing in it names the cut loading bar.

### Run 2 onto Zen dev 42d5c34, before and after

| | old script | new script |
|---|---|---|
| commits that stopped | 1 (1fc09ba) | 1 (1fc09ba) |
| files needing a person | 3 | 3, the same CSS and JS files |
| files "kept deleted" | 3 | 3 |
| new Library C++ files | 4 left in a deleted folder | 4 deleted |
| new reference check hits | not checked | 0 |

Run 2 had no patch or list-file conflicts, so the new rules had nothing to do there. The three remaining files are blocks Origin deleted and Zen edited, which a cut-word rule could also take over.

### What still needs a person

- About an hour per Firefox-bump week for the Zen JS refactors (`ZenUIManager.mjs` split, `zen-sets.js` command map, `ZenStartup.mjs`) and the 16 reference lines. That replaces the 3 to 4 hours estimated above.
- Firefox file renames such as `tabs.js` to `tabs.mjs`. The script stops on the DU and does not port Origin's edit into the renamed patch.
- Deciding the cut list itself. I added `cmd_zenManageWorkspaces` and `context_zenManageWorkspaces` to the Library cut because they open the Library. A person should confirm that before the next real sync.
