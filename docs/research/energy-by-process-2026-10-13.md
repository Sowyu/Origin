# Energy by process, baseline-1

Source: batch baseline-1 (3 runs per scenario), `docs/perf/2026-10-13-baseline.json` and the raw runs in `../Zen-Origin-research/perf.noindex/runs/baseline-1/`. Script: `/tmp/ebp.py` (per-process energy, wakeups, CPU and footprint from the first and last `zostat` sample of each window; powermetrics plists for whole-Mac `gpu_power` and `cpu_power`). My role sums match the report's `app_mw` to 0.01 mW. All numbers are medians of 3 runs. Run-to-run spread is under 5% for the differences quoted below unless noted.

Roles: parent is the main process, gpu is the GPU helper, tab is the sum of all content processes, other is system helpers that work for the browser (video decoder service and similar). rdd, socket and utility are under 1.6 mW everywhere and fold into other in the first table.

## 1. Power by role, official Zen against Firefox (mW)

| scenario | browser | parent | gpu | content | rdd, socket, utility, other | browser total |
|---|---|---|---|---|---|---|
| switch tabs | Zen | 24.1 | 58.1 | 31.7 | 0.2 | 114.1 |
| switch tabs | Firefox | 25.1 | 48.5 | 20.8 | 0.1 | 94.5 |
| switch spaces | Zen | 36.7 | 21.0 | 2.4 | 3.2 | 63.4 |
| sidebar | Zen | 10.5 | 8.4 | 0.6 | 0.0 | 19.5 |
| sidebar | Firefox | 13.4 | 10.3 | 1.6 | 0.0 | 25.4 |
| split | Zen | 204.4 | 238.5 | 570.0 | 0.0 | 1012.9 |
| split | Firefox | 115.1 | 321.8 | 1575.5 | 4.6 | 2016.6 |
| scroll | Zen | 8.9 | 13.9 | 4.1 | 0.0 | 27.0 |
| scroll | Firefox | 7.6 | 13.6 | 4.4 | 0.0 | 25.6 |
| video-windowed | Zen | 2.6 | 4.4 | 3.7 | 5.4 | 16.1 |
| video-windowed | Firefox | 2.4 | 4.1 | 3.5 | 5.1 | 15.2 |
| typing | Zen | 4.0 | 2.6 | 1.6 | 0.0 | 8.2 |
| typing | Firefox | 28.3 | 2.8 | 1.8 | 0.0 | 32.7 |

Where Zen differs from Firefox:

- Switch tabs: Zen spends 9.6 mW more in the GPU process (58.1 against 48.5) and 10.9 mW more in content processes (31.7 against 20.8). The parent is level. Zen's tab switch repaints more than Firefox's.
- Scroll and windowed video: the browser's own processes are level within 1.4 mW and 0.9 mW. The whole difference is outside the browser (section 2).
- Sidebar: Zen is cheaper by 5.9 mW, mostly in the parent (10.5 against 13.4) and content (0.6 against 1.6). Zen's compact mode costs less inside the browser than Firefox's vertical tabs, but more in WindowServer (+4.4 mW).
- Split: Zen is half of Firefox in total (1013 against 2017 mW), because Firefox's content processes burn 1576 mW against 570. Zen's parent is 89 mW higher. I did not check that the Firefox split view does the same work as Zen's, so treat this row as not like-for-like.
- Typing: Firefox's parent uses 28.3 mW against Zen's 4.0. That is a Firefox-side cost, not something Origin can win back.
- Switch spaces exists only in Zen. The parent is 58% of the browser's 63 mW there, and it is Zen's workspace code.

## 2. WindowServer and whole-Mac GPU

WindowServer power (mW) and GPU time (ms per second), and powermetrics `gpu_power` for the whole Mac (mW, includes everything running, so only the Zen against Firefox gap is meaningful; the floor is 0.3 to 0.4 at idle).

| scenario | browser | WindowServer mW | WindowServer GPU ms/s | Mac gpu_power mW |
|---|---|---|---|---|
| switch tabs | Zen | 32.9 | 11.3 | 54.8 |
| switch tabs | Firefox | 17.5 | 4.7 | 21.0 |
| switch spaces | Zen | 42.7 | 12.6 | 101.0 |
| sidebar | Zen | 26.6 | 7.5 | 37.3 |
| sidebar | Firefox | 22.2 | 8.2 | 33.0 |
| split | Zen | 156.4 | 26.1 | 224.8 |
| split | Firefox | 69.6 | 10.6 | 91.4 |
| scroll | Zen | 51.2 | 33.5 | 140.7 |
| scroll | Firefox | 28.2 | 21.6 | 56.1 |
| video-windowed | Zen | 32.4 | 22.1 | 92.5 |
| video-windowed | Firefox | 13.7 | 7.6 | 18.2 |
| typing | Zen | 16.1 | 7.1 | 24.2 |
| typing | Firefox | 13.2 | 3.3 | 10.9 |

Zen is higher than Firefox in every scenario where both run, except sidebar. In scroll, windowed video, tab switching and split, Zen adds 14 to 87 mW of WindowServer power and 34 to 74 mW of whole-Mac GPU power on top of its own processes. For windowed video the browser itself costs the same as Firefox (16.1 against 15.2 mW), yet the Mac's GPU draws 92.5 mW against 18.2. That 74 mW sits in no browser coalition. The likely cause is the compositor blending Zen's translucent window and sidebar over the page, every frame. That is inferred from the fullscreen result below, not measured directly. The fullscreen video scenario shows it: the same video in fullscreen has Mac GPU power 1.2 mW and WindowServer 2.8 mW, the same as Firefox, because the translucent chrome is gone.

The coalition counters therefore understate Zen's cost. The Mac's GPU stays at idle levels when nothing moves (0.2 to 0.4 mW).

## 3. Wakeups per second per role

Interrupt wakeups per second, summed over all processes of a role (the idle row is the whole browser).

| scenario | browser | parent | gpu | content | package-idle wakeups, parent | CPU total, percent of one core |
|---|---|---|---|---|---|---|
| idle | Zen | 0.2 | 0.3 | 0.4 | 0.1 | 0.05 |
| idle | Firefox | 0.3 | 0.3 | 0.5 | 0.1 | 0.06 |
| minimized | Zen | 0.2 | 0.3 | 0.4 | 0.0 | 0.05 |
| minimized | Firefox | 0.3 | 0.3 | 0.5 | 0.1 | 0.08 |
| bgtimer | Zen | 15.0 | 3.0 | 3.8 | 9.0 | 1.35 |
| bgtimer | Firefox | 15.0 | 3.0 | 3.9 | 4.1 | 1.29 |
| scroll | Zen | 73.5 | 10.5 | 12.3 | 41.3 | 25.97 |
| scroll | Firefox | 65.3 | 10.5 | 12.1 | 12.9 | 32.2 |

- The spec's rule holds. At idle Zen shows 0.9 wakeups per second and 0.05% CPU in total, equal to Firefox. Power is 0.04 mW for the browser.
- One background tab with a 1 s timer lifts the browser from 0.04 to 1.07 mW and from 0.9 to 22 wakeups per second. The parent alone takes 15 wakeups per second for a 1 Hz timer, and the GPU process wakes 3 times per second. Firefox does the same, so this is a Gecko cost.
- Zen's parent brings the package out of idle twice as often as Firefox's during the timer (9.0 against 4.1 per second) and 3.2 times as often in scroll (41.3 against 12.9). Interrupt counts are the same, so Zen's wakeups arrive more spread out. I have not found the cause.

## 4. Memory per role at idle (footprint, MB)

| role | Zen official | Zen stock | Firefox |
|---|---|---|---|
| parent | 253 | 290 | 307 |
| gpu | 195 | 198 | 171 |
| content | 622 | 627 | 597 |
| rdd | 18 | 18 | 18 |
| socket | 17 | 17 | 17 |
| utility | 36 (2 processes) | 36 | 36 |
| other | 16 | 16 | 18 |
| total | 1159 | 1201 | 1165 |
| content processes | 16 | 16 | 15 |

Content is 54% of the total at 38 to 39 MB per process, and the GPU process is 15 to 17%. Zen's parent is 54 MB smaller than Firefox's but its GPU process is 24 MB larger. Both run 15 to 16 content processes for 10 loaded tabs. I did not check what the extra ones are.

## 5. Leads for Origin

1. Cut the compositor cost of Zen's translucent chrome. Windowed video: the Mac's GPU draws 92.5 mW in Zen against 18.2 in Firefox, and WindowServer 32.4 against 13.7, while the browser's own processes are level (16.1 against 15.2 mW). Scroll shows the same: GPU 140.7 against 56.1 mW, WindowServer 51.2 against 28.2. Fullscreen video has no gap, so the translucent window and sidebar layers are the cause. Test: an opaque window background (no vibrancy) and measure `gpu_power` in the video-windowed and scroll scenarios. Potential: about 75 mW in video and 85 mW in scroll, at least 5 times the browser's own power in those scenarios.
2. Find what makes tab switching repaint more in Zen. GPU process 58.1 against 48.5 mW and content 31.7 against 20.8 mW, plus WindowServer 32.9 against 17.5 and Mac GPU 54.8 against 21.0. The gap is 20 mW inside the browser and 49 mW outside. The tab-switch animation, per-tab gradient and blur are the suspects. The effects-1 batch (each effect off on its own) measures this.
3. Reduce Zen's workspace switching cost. Switching spaces costs 36.7 mW in the parent (58% of the browser's 63.4) and drives the Mac's GPU to 101 mW and WindowServer to 42.7 mW, the highest of any short scenario. There is no Firefox equivalent, so the target is Zen's own transition code and compositing, measured against tab switching at 24.1 mW parent.
4. Make Zen's split view cheaper in the parent, and check the content cost. Zen's parent draws 204 mW against 115 in Firefox, and WindowServer 156 against 70 mW. Zen's content is cheaper than Firefox's (570 against 1576 mW), so the parent and compositor part is the thing Origin can change. Keep the caveat in section 1.
5. Cut the cost of one background timer and the parent's package wakeups. A single 1 Hz timer in a background tab takes the browser from 0.04 to 1.07 mW, with 15 parent wakeups and 3 GPU wakeups per second. This is the same in Firefox, so it needs a Gecko-level change (throttle or batch background timers and stop the GPU process waking for them). Separately, Zen's parent has 3.2 times Firefox's package-idle wakeups in scroll (41.3 against 12.9 per second) at the same count of interrupts, so look for a timer in Zen's parent that fires out of step with the refresh driver. Small in mW (about 1 to 2) but it is the only place Zen is worse at idle-like states.

Nothing to chase: idle, minimized, fullscreen video and the sidebar are level with or better than Firefox.
