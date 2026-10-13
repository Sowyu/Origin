# Origin

A lean fork of Zen Browser for macOS on Apple Silicon, on Gecko. It should feel like Zen, look as good and use as little energy as a Gecko browser can. Releases go to github.com/Sowyu/Origin. The user renamed the project from Zen Origin to Origin on 2026-10-12. The local folders `Zen-Origin` and `Zen-Origin-research` keep their names, because the object dir, the mach state and this thread's working folder depend on them.

Start every session in this order:

1. Read `PROGRESS.md`. It names the current milestone, what is done, what is next and every open question.
2. Read `docs/spec.md`, the user's brief. It is the source of truth for scope, hard rules and targets. Decisions made later live in `PROGRESS.md`.
3. Before measuring anything, read `docs/benchmarks.md` (method and numbers). The harness is `scripts/perf/` (`run`, `report`, `make-profile`, `serve`); start the fixture server with `scripts/detach serve scripts/perf/serve` first.

Update `PROGRESS.md` before you stop: tick what you finished, add what you learned, and set the next action. A new agent with no chat history must be able to continue from that file alone.

## Hard rules from the user

- The engine stays Gecko. Keep Firefox's security features exactly as they ship: content sandboxing, site isolation, Safe Browsing, CRLite and Remote Settings (CRLite, the add-on blocklist and search config depend on it).
- Back every energy claim with before and after numbers from the harness.
- Keep the diff against upstream Zen small enough to rebase every week. Prefer a pref to a patch, and deleting code to changing it.
- The fork never contacts Zen's servers. Ship none of Zen's logos or icons and none of Mozilla's trademarks.
- Ask before spending money (paid CI, Apple Developer ID) and before any signing key leaves this Mac.
- Until the user decides on the rewrite study, put no deep work into Zen UI code that a rewrite would replace.
- Demo each milestone and wait for the user's OK before starting the next.
- No AI attribution in commits, PRs or release notes.

## Cost rules (the user pays per token)

- Delegate research and mechanical edits to `sonnet-medium`, judgement calls to `opus-medium`.
- Every agent brief says "Do not use the Agent tool".
- Run at most four agents at once and check each shows signs of life within two minutes.
- Read Firefox source in slices with `rg` or Searchfox, never whole large files.

## Machine facts

- Remote Mac mini M4, 10 cores, 16 GB RAM, macOS 27.0.1, no battery, virtual screen 1920x1080 (check the scale with `system_profiler SPDisplaysDataType` before measuring). Shared with CandyWrapper agents; read `../CandyWrapper/CLAUDE.md` for the full machine rules.
- Run one `mach build` at a time. `/tmp/cw-preflight` holds CandyWrapper agents back while any `mach build` runs, so never leave a build hanging.
- CandyWrapper agents stop below 40 GB free. Stay above that and delete old object dirs.
- Launch GUI apps in the user's session with `sudo launchctl asuser 502 sudo -u mrm <cmd>`. Passwordless sudo is allowed only for that and for `powermetrics`.
- `screencapture` works, and `../CandyWrapper/scripts/ui/` can click, scroll and type (build them with its `build` script).
- No `gh`: use the GitHub REST API with the token from `git credential fill`. Never print the token.
- Homebrew installs fail here (`/opt/homebrew/var/log` belongs to root), so tools go into `../Zen-Origin-research/tools`.
- Never write to `~/.t3`. Kill only processes whose PID you started and recorded.
- Official Zen and Firefox copies in `../Zen-Origin-research/builds/` stay byte-identical to their DMGs: editing the bundle breaks the seal and Gatekeeper calls Zen damaged. App updates are off through per-user policy defaults instead (`defaults write app.zen-browser.zen DisableAppUpdate -bool YES`, same for `org.mozilla.firefox`, plus `EnterprisePoliciesEnabled`).
- Safari runs use the user's own Safari data on this Mac. At the user's request I quit the Safari that had run since 2026-10-09 (pid 27252) on 2026-10-12, so the harness now starts the only instance. If a Safari the harness did not start shows up again, ask the user before quitting it.
- Run `scripts/perf/report` only while no batch is measuring. It parses every powermetrics file and keeps a core busy for about a minute per 100 runs.
- Long jobs (builds, measurement batches) must run detached in their own session, because the harness kills background commands at its time limit. Use `scripts/detach`.

## Repo layout

- The repo root is Zen's tree. Branch `upstream` holds one snapshot commit per Zen release (Zen's full history is about 6 GB, so it is not imported). `main` is `upstream` plus our commits. To move to a new Zen tag, add its tree as a new `upstream` commit and `git rebase --onto upstream <old upstream> main`.
- Zen's GitHub workflows are deleted on `main`, because their schedules would run in our public repo. `upstream` stays local: GitHub refuses it because its tree holds workflow files and our token has no `workflow` scope. Rebuild it from Zen's tags when needed (`git fetch --depth 1 <zen> refs/tags/<tag>` and `git commit-tree`).
- `engine/` is a symlink to `engine.noindex/` (Firefox source plus the object dir). Spotlight skips folders ending in `.noindex`; without that it indexed the 400,000 files for hours at a load of 15. Both names are in `.git/info/exclude`, and `.surfer/` is in Zen's `.gitignore`. Large trees, downloads, tools, logs and builds live in `../Zen-Origin-research/`; harness templates and runs in `../Zen-Origin-research/perf.noindex/`.
- `docs/spec.md` is the brief, `docs/benchmarks.md` holds the method and numbers, `docs/cuts.md` lists every removed feature, `docs/research/` holds raw notes with sources. Zen's own docs (`docs/contribute.md` and others) stay where they are.
- `scripts/env.sh` puts the pinned toolchains on PATH (Node 22, Python 3.11, Rust 1.95.0, GNU tar). Source it before any npm, surfer or mach command.

## Writing style

Plain words, active voice, sentence-case headings, no em dashes. Mark deliberate shortcuts in code with `ponytail: <ceiling>, <upgrade trigger>`. Keep the MPL-2.0 headers on every source file. Third-party assets, such as the Phosphor icons, keep their own licence notice instead (see THIRD_PARTY.md).
