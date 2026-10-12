# Zen issue tracker: macOS performance and battery, read 2026-10-12

Source: GitHub REST API, zen-browser/desktop, issues #8932, #12464, #14793, #9727, every comment read (175, 18, 0, 44). Two Bugzilla bugs and one PR were fetched as follow-ups. Screenshots were not viewable, so numbers that only appear in images are marked unverified. Comment URLs use the form `https://github.com/zen-browser/desktop/issues/N#issuecomment-ID`.

Our base is Zen 1.23.2b (git bd9a10a). It already contains the #12464 fix described below.

## #12464 Battery Drain MacOS - High CPU usage

- State: closed as completed by mr-cheffy on 2026-08-17. Opened 2026-02-22 by Huggybear43. Labels: Bug, platform: macOS.
- Versions: 1.18.10b reported at open. Hardware named: M3 Max, M4 Pro, M1, M1 Max, M2 Air. All aarch64.
- Fix: PR #15006 "gh-12464: Implement a more efficient way of adding macos translucency", commit e2e1ab4e6d, merged 2026-08-17. First release containing it is 1.21.15b (2026-08-19). 1.21.14b does not contain it (checked with the compare API).

### Symptoms

- Battery life roughly halved versus Safari (opener, no numbers). One user says "my macbook pro doesn't last more than 2 hours" (that one is in #8932).
- High CPU in Activity Monitor and about:performance with a few tabs. All the numbers are in screenshots, so the actual values are unverified.
- Bensaski (M4 Pro 14 inch) says the Activity Monitor "12 hour power" for Zen is typically in the 500 to 600 range, screenshot only. Comment: `#issuecomment-4226727454`.
- AtzeDeVries (M1 Max) saw about:performance CPU go back to normal only after a full macOS reboot, not a Zen restart. `#issuecomment-4165436328`.
- Loligrame reproduced in troubleshooting mode on 2026-07-22 and said the AV1 workaround did not help. `#issuecomment-5042165828`.

### Measurements posted

- None as text. Only screenshots of Activity Monitor and about:processes (unverified).
- No profiler links in this thread.

### Causes

- Confirmed by the fix: the old way of getting macOS translucency. The PR removed the CSS rule on `#zen-browser-background` (`-moz-default-appearance: -moz-sidebar; appearance: auto;`) and the `VibrancyManager.mm` patch that remapped the sidebar vibrancy material. It added a `ZenWindowMaterialView : NSVisualEffectView` in `widget/cocoa/nsCocoaWindow.mm` that backs the whole window.
- The old pref `widget.macos.sidebar-blend-mode.behind-window` is replaced by `zen.widget.macos.window-vibrancy` (default true). A UI migration (`ZenUIMigration.sys.mjs`, version 7) copies a user's old `false` value into the new pref.
- The PR body only says "Fixes #12464". There is no maintainer text that says how much CPU it saves. Measured gain: unverified.
- Not confirmed: media playback. mmatviyiv saw high CPU "when video (YouTube for instance) is paused and minimized to the player on the left panel" (`#issuecomment-4489614762`). IlyasYOY (M2 Air) confirmed that state costs about 20% GPU and that closing the sidebar video info card returned energy to normal (`#issuecomment-4634170247`). Steps: play YouTube, open as floating window, close the window, a video card stays at the bottom of the sidebar, close that card. No maintainer reply.

### Workarounds reported

- ZimneJonas (M1 Pro): force H.264 with the enhanced-h264ify add-on, or set `media.av1.enabled=false`. M1 has no AV1 hardware decode (about:support, Media, Codec Support). `#issuecomment-4812033714`. Loligrame said it did not fix his case.
- Closing the sidebar media card (IlyasYOY, above).
- Maintainer asks: test in troubleshooting mode, remove mods and add-ons (`#issuecomment-4085377713`, `#issuecomment-4268040674`). sadsuite used six mods (Better Active Tab, SuperPins, Trackpad Animation and others) and Dark Reader, Bitwarden, uBlock Origin and more. Bensaski removed his two mods and saw no change.

### Maintainer quotes

- mr-cheffy: "We would need more info than just a screenshot of task manager unfortunately, maybe check about:processes?" `#issuecomment-4085377713`
- mr-cheffy: "Does it happen in troubleshooting mode as well? Might be due to some mod, theme or addon" `#issuecomment-4268040674`

### Still open

- The fix shipped but nobody posted before and after numbers. The close was by the PR, with no confirmation from reporters. Whether the CPU and energy problem is gone: unverified.
- Sidebar video card energy cost (IlyasYOY) has no tracked fix.
- The 1.18.10b reports were all made before the translucency change, so none of them tell us about 1.21.15b or later.

## #14793 Zen GPU Helper intermittently consumes ~700% CPU on macOS

- State: open. Opened 2026-07-30 by swe. Labels: Bug, component: performance, platform: macOS. Zero comments, no timeline links, no maintainer reply.
- Version 1.21.9b, MacBook Pro M5, 10 logical cores. This version is before the #12464 fix (1.21.15b).
- Measurement (from the issue text): Zen GPU Helper about 689% CPU, sometimes up to 900%. Total CPU 81.5%. Load average 8.33 (1 min), 10.75 (5 min), 8.93 (15 min). Tool: a system monitor screenshot, not named in the text.
- Trigger: none found. The reporter says "no obvious workload", several tabs, browser left open for a while. Restarting Zen stops it for a time and it returns.
- Cause: unverified. No profile, no about:support, no logs. Reporter did not say whether the issue also happens in Firefox (the checkbox was ticked that it cannot be reproduced in Firefox).
- Workarounds: none posted.
- Open: everything. Nobody has retested on 1.21.15b or later.

## #9727 "ZenCP Isolated Web Content" process pegs all cores after media playback on MacOS

- State: open. Opened 2025-08-02 by togume. Labels: Bug, component: performance, platform: macOS. 44 comments, last on 2026-10-05.
- Version at open: 1.14.9b (Firefox 141.0), M3 Max. Other reports: M1 Pro, M2 Air 8 GB (1.19.8b), M3 Pro 18 GB (macOS 14.8.5), Intel Ventura 13.7.8 (1.18.2b).
- The title is misleading. Most of the 44 comments describe memory (RAM) use in Isolated Web Content processes, not CPU.

### Symptoms

- Opener: a process pegs the CPU, "doesn't resolve until I restart the application", happens multiple times a week, linked to YouTube and X video, remains after the video tabs are closed. Machine "pretending to be a helicopter". No numbers in text.
- Zeta611: ZenCP Isolated Web Content totals over 18 GB (screenshot). `#issuecomment-3164768421`
- keshri-prasanjeet (M2 Air 8 GB, 1.19.8b): single process over 2.5 GB, with only Notion and GitHub tabs. `#issuecomment-4213284863`
- thegrumpyenby: one process 1.26 GB, typing delay. jacopo-derrico (Intel Ventura): Figma and WordPress Elementor pages, only killing the process in Activity Monitor helps.
- rennokki (M1 Pro): after several days of uptime and sleep, Zen restart does not clear it, a macOS reboot does. `#issuecomment-3269464008`
- papertree0 (M3 Pro, macOS 14.8.5, 1.2x): YouTube playback, CPU about 300%, "YouTube consuming 90% of my CPU for just playing a video". Profile: https://share.firefox.dev/4yp6lZI. `#issuecomment-5933647243`
- jovanazpetkovic (M3 Pro, 18 GB): "draining both my CPU and battery", started recently, no data. `#issuecomment-5572651988`

### Measurements posted

- keshri-prasanjeet profile of the Notion tab: https://share.firefox.dev/4tJm3wj (`#issuecomment-4228293006`). Propheticus had pointed to Bugzilla 2021840 for Notion. I did not fetch that bug, so its status is unverified.
- papertree0 profile above, with 5 s Activity Monitor view showing CPU high at all times. Result: Ghostery.
- Process counts: illegalnumbers says the number of processes matches the number of workspaces (11 workspaces, one with over 100 tabs). jacopo-derrico disagrees (4 workspaces, still hit). Unverified.
- No energy impact numbers, no powermetrics output.

### Causes

- Confirmed by profile: the Ghostery extension on YouTube (October 2026). Propheticus: "This extension is currently the cause of major Youtube issues." `#issuecomment-5941325799`. mr-cheffy: "Seems like Ghostery is having issues with youtube lately?" `#issuecomment-5947373203`. papertree0 confirmed removing it fixed it `#issuecomment-6003472775`. Propheticus linked three r/firefox threads (no Bugzilla number).
- Confirmed by profile: Notion page (keshri-prasanjeet).
- Propheticus: a severe memory leak in the Wappalyzer extension affects many users `#issuecomment-4401085663`.
- Suspected, no confirmation: external monitor. rennokki asked if everyone had one connected, and five of six respondents said yes (joaofonsecapromptly, declanblanc, thegrumpyenby, VladyslavHontar via DisplayLink, jacopo-derrico "usually yes" but the bug hit without it). mr-cheffy: "This may simply be an issue with upstram firefox ... Isolated web content shouldn't care about rendering though?" `#issuecomment-3849072776`. declanblanc says the same thing happens on stock Firefox as "Firefox CP Isolated Web Content". rennokki also noted macOS WindowServer RAM growth with the browser open.
- Suspected: Essentials (pinned) tabs refreshing in the background (joaofonsecapromptly, `#issuecomment-3754990032`). He killed the process in Activity Monitor and the Essentials unloaded without a Zen crash. He said he would test removing Essentials. No result posted.
- Suspected: sleep or long uptime. rennokki links it to 3+ days of uptime and sleeping the Mac, fixed only by a macOS reboot (`#issuecomment-3269464008`). No test.
- Maintainer question: mr-cheffy asked if `browser.sessionstore.restore_pinned_tabs_on_demand` is disabled `#issuecomment-4029641422`. No answer posted.
- Propheticus on `gfx.webrender.layer-compositor` (Betterfox sets it): turn it off if you set it. mr-cheffy: "`layer-compositor` is specifically disabled in macos due to performance issues AFAIK, staying on the default configs is the safest option" `#issuecomment-4133026871`.
- Propheticus: Apple fixed video decoding problems in macOS 26.1 (Nov 2025), and M1 or older Macs have no AV1 hardware decode while YouTube prefers AV1 `#issuecomment-4132928658`.
- Explanation from Propheticus: one Isolated Web Content process is one site (or a few tabs of one site in one container), so use the Zen process manager (Shift+Esc) to find the site `#issuecomment-4217816924`.

### Workarounds reported

- Remove Ghostery or Wappalyzer.
- `media.av1.enabled=false` or enhanced-h264ify on M1 and older.
- Set `gfx.webrender.layer-compositor` back to false if a user.js changed it.
- Killing the ZenCP process in Activity Monitor (page reload recovers).
- macOS reboot (rennokki). Zen restart does not help.
- Remove Essentials (joaofonsecapromptly, untested outcome).

### Still open

- No Zen-side cause or fix. The maintainers treat it as upstream or extension-caused. No commit, PR or Bugzilla fix is named for the original "pegs all cores after media playback" case.
- The M3 Max opener never got a profile.

## #8932 [META] Performance, consumption and memory leaks

- State: open, opened 2025-06-08 by mr-cheffy. Label: component: performance. 175 comments, last 2026-10-11. It is a collection thread, mixed OS (Windows, Linux, macOS). I kept only what matters for macOS energy and CPU.
- The thread asks for about:support, an about:memory file and a https://profiler.firefox.com profile, with addons, themes and mods disabled.
- mr-cheffy, 2025-12-02: "There isn't a single root cause here ... This issue likely won't ever be closed or resolved, because it isn't meant to address one specific bug." `#issuecomment-3604176832`
- mr-cheffy, 2026-02-14: "Issues related to the engines, addons, websites, etc would rather be more productive to sending it to firefox as we dont really have the resources to do all of those fixes that doesnt *directly* affect us." `#issuecomment-3901372523`

### macOS reports in this thread

- cmvalma, MacBook Air M1 16 GB, macOS 15.5, 1.12.10b: 142 tabs, "Remote Processes: 157", 142 Isolated Web Content processes, 4917 MB resident unique (Propheticus's table, `#issuecomment-2997719150`).
- ozer85, M4 Pro Mac mini 24 GB, 1.14.1b: slows within 15 min, then dies. Crash report says Footprint 36.07 GB, 97 threads, CPU time 5.3 s. Add-ons disabled. `#issuecomment-3037260240`
- treffendharm, Air M3 16 GB: Zen is the top process, system lag after hours.
- Matteoverzotti, MacBook Pro, 2026-02-02: "Having a few tabs open consumes more energy than my heavy docker containers", "doesn't last more than 2 hours with Zen open". Energy screenshot, no numbers in text. mr-cheffy answered that Dark Reader is "known for being really intensive" and asked to test troubleshooting mode `#issuecomment-3870739384`. No result posted.
- diegopluna: "causing my mac to go from around 40C to 72C" with high battery use (2026-01-20). No other data.
- AwesomesuperDan0927 (Mac): memory worse since 1.18.2b, restarts several times a day.
- zhuxining (macOS 26): high memory, hang, crash on exit. Propheticus linked Bugzilla 1982717 (Firefox locks up on macOS 26, closed as duplicate of 1979283, where cleaning up bookmarks fixed it for reporters) and 1943005 (Quota Manager crash, still NEW). I read 1982717 only.
- enfinders (macOS 15.6): memory about double Safari.

### Measurements and profiles posted by maintainers

- mr-cheffy, 2026-03-22: themes that add `will-change: transform` to the browser view hurt performance "exponentially". Without: https://share.firefox.dev/4spRgnI. With: https://share.firefox.dev/4uKp8gF. No numbers in text. `#issuecomment-4106761419`
- mr-cheffy, 2025-09-27: "Last version fixed a memory leak related to folder icons where the refresh tick would be called on ever frame." (A per-frame refresh is also an energy cost.) Release was around 1.15.x, exact version unverified. `#issuecomment-3341512718`
- Propheticus explains: Essentials and pinned tabs exist as empty processes at startup (34 MB mapped, about 10 MB resident unique), and reach 150 MB or more when loaded. `browser.sessionstore.restore_pinned_tabs_on_demand` is true in Zen and false in Firefox. `#issuecomment-3002044712`
- Propheticus on privacy: container and Total Cookie Protection isolation duplicates data per site and costs memory. A user who set ETP to Custom (LibreWolf style) saw 1.2 GB drop to 900 MB (Windows or Linux, platform unverified). Propheticus warned this disables Total Cookie Protection. `#issuecomment-3679324636`
- Propheticus: ETP strict mode and ClearURLs can change reload behaviour and RAM.

### Causes found in this thread (mostly not macOS)

- Extension leaks: Wappalyzer, "buykers" coupons extension (8 GB), Adguard (many string copies), Dark Reader, Bitwarden autofill on AWS console, ClearURLs, Session Buddy plus Tab Session Manager, Allow CORS extension, Refined GitHub.
- Sites: YouTube (shorts, playlist shuffle loop in a profile, queue feature after 1.22.2b), Notion, Discord calls (about 400 MB per minute), ChatGPT tab (22 GB, maybe Bugzilla 2076013 map rendering), AWS console, dune.com, Elegoo store.
- Hardware acceleration disabled helped a Windows or Linux user from 13.5 GB to 1.6 GB (`#issuecomment-3301958751`). That points at a GPU process leak. Platform unverified.
- `gfx.webrender.compositor=false` helped some Nvidia users with freezes on Windows (Bugzilla 2027413) `#issuecomment-5355723394`. This pref is set by us in `prefs/firefox/performance.yaml` for macOS.
- Wrong blocklist entries: `gfx.blacklist.video-overlay.failureid` was recorded wrongly in the past because Zen queried with the Zen version number instead of the Firefox base version (Windows overlay path, but the root cause could affect other gfx feature checks on macOS). Propheticus tells people to delete the stored value `#issuecomment-5722127182`.
- Main-process window object leak in 1.23.1b (2026-10-08): XeynQ4 and mennatawfiq on Windows, memory fills in minutes, gone after downgrade to 1.23b. Split into issue #15823 (not read). The user ran Sine. We are on 1.23.2b, so check whether #15823 is fixed. Unverified.
- mr-cheffy: the memory number in tools often differs (RSS vs unique set size). igads3d noted Resources shows the sum of RSS and the memory report shows PSS. Use resident-unique, not summed RSS.

### Still open

- The whole thread. Maintainers say no single root cause and that it will not close.

## Leads for our harness

Ranked by how much evidence points at them for Apple Silicon energy.

1. Window translucency (`zen.widget.macos.window-vibrancy`, `zen.widget.macos.window-material`). It is the only confirmed fix tied to a macOS battery and CPU issue (PR #15006 for #12464). Run the same idle workload with `zen.widget.macos.window-vibrancy` true and false, and with each `window-material` value (default 1 in our tree). Measure energy impact for the main process, the GPU helper and WindowServer. Also check inactive-window behaviour, because the new view watches `zen.view.grey-out-inactive-windows`.
2. GPU helper CPU at idle (#14793: 689% on M5, 1.21.9b, no cause). Sample the GPU process every few seconds over a long idle run with several tabs, with tabs hidden, and after minimising. Capture a Firefox Profiler trace with the GPU process thread included when it spikes. Record whether it spikes on 1.23.2b at all.
3. Paused or minimised media in the sidebar (IlyasYOY: about 20% GPU with a paused video card in the left panel, gone when the card was closed). Test: play YouTube, pop out Picture-in-Picture, close PiP, leave the sidebar media card, measure energy, then close the card. Compare with and without the card.
4. Browser CSS compositing cost. mr-cheffy's profiles show `will-change: transform` on the browser view hurts a lot, and "per frame refresh tick" bugs have shipped (folder icons). Run the harness with our UI CSS, and grep our CSS for `will-change`, infinite animations and per-frame JS timers. Check for work done while the window is idle.
5. Codec path. M1 and older have no AV1 hardware decode and YouTube prefers AV1. Measure a fixed 5 minute YouTube clip with `media.av1.enabled` true and false, and note the codec (Stats for nerds: av01, vp09, avc1). Test on M2 or newer too, because the thread says newer chips decode in hardware and this needs checking. Also record `gfx.webrender.layer-compositor` (should stay at the default) and `gfx.webrender.compositor`.
6. State after media playback. #9727's title says CPU stays high after video tabs close. Play media for 10 minutes, close the tab, then record every process for 10 minutes. Check Isolated Web Content, RDD, GPU and Utility AppleMedia, which show up in about:support remote process lists.
7. Long uptime plus sleep. rennokki: after 3+ days and Mac sleep, a Zen restart does not clear the load but a macOS reboot does. Add a harness case that sleeps and wakes the Mac a few times and then measures idle energy. This is a single-user claim, so treat it as unverified.
8. External display attached or detached. Five #9727 reporters had an external monitor connected at some point. Run the idle test with a second display, and again after unplugging it. mr-cheffy doubted that the content process is affected, so also record WindowServer and GPU process.
9. Essentials and pinned tabs. They exist as empty processes at startup (`browser.sessionstore.restore_pinned_tabs_on_demand` is true in our `prefs/firefox/browser.yaml`). One reporter thinks Essentials refresh in the background. Compare idle energy with 0, 5 and 10 Essentials, and with the pref false.
10. Process count. Fission gives one Isolated Web Content process per site. Log process counts by type (the thread's about:support tables show 142 isolated processes for 142 tabs) next to energy, with and without Total Cookie Protection or containers.
11. Extension control. Run every energy test in a clean profile with no add-ons. Add uBlock Origin alone as the second case. Ghostery, Wappalyzer, Dark Reader and Adguard are the extensions reported as heavy.
12. A fixed list of sites as a stress set. Notion, YouTube with a playlist and shuffle, ChatGPT in a long chat, Discord call. These are the pages named in the thread that blow up CPU or memory, and a lean fork still inherits Gecko's behaviour on them.

Measurement note from the threads: use a profiler trace (profiler.firefox.com) plus `about:processes`, not Activity Monitor screenshots. Maintainers dismiss screenshots. For memory use resident-unique, not summed RSS.

Unverified items: the impact size of PR #15006, the contents of every screenshot, issue #15823, Bugzilla 2021840, 2076013, 2027413, 1931717 and 1865437 (cited but not fetched), and the exact release for the folder icon leak fix.
