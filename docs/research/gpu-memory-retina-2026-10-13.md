# GPU process memory on a Retina MacBook, 2026-10-13

Question: why the user's MacBook GPU process has 533 MB phys_footprint (57 MB resident-unique) when the Mac mini harness shows 153 MB, and how to cut it. This note adds to `gpu-memory-2026-10-13.md` and does not repeat it. Source is `engine/` (Firefox 157.0.1 plus Zen patches) and the two reports in `../Zen-Origin-research/user-reports/2026-10-13-memory/`. I built and launched nothing. Anything I did not read in source or in the reports is marked "unverified". Paths are under `engine/` unless they start with `src/`.

## Findings from the reports

I read the GPU process rows of both reports.

- `swap-chains` is 58.3 MB in both reports. It is not an allocation. `RendererOGL::AccumulateMemoryReport` computes window width x height x 4 x 2 and adds it (`gfx/webrender_bindings/RendererOGL.cpp:581-594`). `UseTripleBuffering()` is false for the native compositor (`RenderCompositor.h:89`), and in native mode the window has no swap chain, because `mNativeLayerForEntireWindow` is only created when the native compositor is off (`RenderCompositorNative.cpp:68-80`). So 58.3 MB is a pure formula and the real "reported" graphics memory is smaller than the user thought: atlas 37 + render targets 24 + texture hosts 4 = 65 MB, not 130 MB.
- The formula gives the window size. 58.27 MiB is 61.1 million bytes, divided by 8 is 7.64 million pixels, and 3456 x 2210 is 7,637,760. So the window is a 16-inch MacBook Pro at 2x, filling the screen below the menu bar (1728 x 1105 points). This is a derived fit, not a reading, so treat the 16-inch as unverified until the user confirms.
- Footprint minus resident-unique is 533 - 57 = 476 MB of memory that is not in the process's own pages. This is IOSurface and GPU driver memory. Subtracting the 65 MB of real named textures leaves about 410 MB with no reporter. The 310 MB in the brief assumed the fake 58 MB was real.
- Minimizing freed 60 MB of footprint (533 to 473). Atlas fell 37 to 21 MB, standalone 1.9 to 0, render-texture-hosts 4 to 2.6, which is about 19 MB. Resident-unique did not move (56.7 to 57.0), so the heap pages that jemalloc returned (madvised 12.5 to 0.4 MB) are not part of the footprint drop. About 41 MB has no reporter. `render-targets` stayed at 24 MB, so the render target pool did not shrink either.
- The footprint scales with pixels almost exactly. Fit footprint = F + k x megapixels through the two machines: 533 MB at 7.64 Mpx and 153 MB at 2.07 Mpx give F of about 12 MB and k of about 70 MB per megapixel. Two points make a line through anything, so this is only a hint, but it says nearly all of the 533 MB is allocated per window pixel. That fits tiles, render targets and driver surfaces. It does not fit shader caches or the heap.

## 1. What the macOS native compositor allocates per window

### Picture cache tiles

- Each tile is one `NativeLayerCA` backed by BGRA IOSurfaces, created in `RenderCompositorNative::CreateTile` (`RenderCompositorNative.cpp:399-409`).
- Tile size is 1024 x 512 device pixels on macOS, so 4 bytes x 524,288 = 2 MiB per surface (`modules/libpref/init/StaticPrefList.yaml:8715-8729`). Edge tiles are not smaller. The IOSurface is always the full tile size, even when only a sliver of the tile holds content (`CreateTile` passes `surface.TileSize()`).
- Scrollbar slices use 1024 x 32 and 32 x 1024 tiles, about 128 KB each (`gfx/wr/webrender/src/tile_cache/mod.rs:73-90`). They are small enough to ignore.
- A slice's tile grid covers its screen rect inflated by one tile height above and below, clipped to the slice's picture rect (`tile_cache/mod.rs:1371-1393`).
- A tile only gets an IOSurface when it is visible and not fully occluded. The comment at `tile_cache/mod.rs:625-628` says the surface is allocated after occlusion culling "so that only visible tiles allocate GPU memory". Inflated tiles that never came on screen get none (`:1424-1428`). A tile with no primitives gets none (`:465-485`). Tiles that scrolled off keep their surface until the grid is resized.
- The native path has no "simple color tile" shortcut: the code comment at `tile_cache/mod.rs:560-563` says the native compositor interface does not support it. A tile of flat colour still costs 2 MB.
- Occlusion uses the opaque page tiles. For a slice with a rounded compositor clip, only the inner rect of the rounded rectangle counts (`composite.rs:847-878`). Chrome tiles that sit entirely inside the page's inner rect are culled. Chrome tiles on the page's edge strip stay.

### IOSurfaces per tile: front, back, in flight

- `NativeLayerMacSurfaceHandler` keeps one front surface plus a list of earlier surfaces (`gfx/layers/NativeLayerMacSurfaceHandler.mm:253-290`). On each update `NextSurface` takes the one unused surface it has, or asks the pool for a new one (`:57-83`).
- `GetUnusedSurfaceAndCleanUp` keeps only the most recent unused surface and returns older ones to the pool (`:129-165`). WindowServer still using a surface keeps it in the list, for at most 10 checks.
- So a tile that never changes costs 1 surface (2 MB). A tile that changed at least twice costs 2 (4 MB). A tile that is redrawn every frame while WindowServer holds the previous one can briefly cost 3.
- Partial updates copy the still-valid part of the old front surface into the new one (`:99-125`), which is why the spare is kept.

### Surface pool

- One pool is shared by every window and popup in the GPU process (`RenderThread.cpp:1558-1566`). Pref `gfx.webrender.compositor.surface-pool-size` is 25, `mirror: once`, so it needs a restart (`StaticPrefList.yaml:8494-8497`).
- The limit is a count of free surfaces of any size, enforced at the end of each frame (`gfx/layers/SurfacePoolCA.mm:222-229`, `:420-423`). 25 tile-size entries is 50 MB. Entries have no time limit, so they stay while the browser idles.
- A pooled entry keeps its GL texture and framebuffer wrapper (`SurfacePoolCA.mm:291-373`). Depth and stencil buffers are shared among framebuffers of one size while any framebuffer still uses them (`:360-399`). That is one 1024 x 512 buffer, about 2 MB, so it is small.
- The pool only clears when the render thread shuts down (`RenderThread.cpp:308`, `:1569`). A memory-pressure event does not clear it. It destroys the tiles, the tiles' surfaces go into the pool, and the next frame takes them out again.
- `SurfacePoolCA::LockedPool::EstimateTotalMemory` (`:120-140`) already sums pool memory, but I found no caller that reports it. A short grep of `gfx/webrender_bindings` and `gfx/layers` for it found only the profiler marker at `:103`.

### Compositor surfaces for video

- A video that WebRender promotes is an external compositor surface. It wraps the decoder's own IOSurface, so it adds a native layer but no pool surface (`tile_cache/mod.rs:1997-2007`, `create_compositor_external_surface`).
- A promoted surface that is not an external image gets its own 1-tile surface of the full video size from the pool (`tile_cache/mod.rs:2018-2034`). Idle pages have neither.

### What `swap-chains` counts in this mode

Nothing real, as shown above. If `gfx.webrender.compositor` were off, it would be a good estimate, because then the window has a real double-buffered IOSurface of window size.

### Which of these have no memory reporter

- Tile IOSurfaces, in use and spare. None.
- Pool entries and their GL wrappers and the shared depth buffer. None.
- Video and external compositor surfaces. None.
- Driver-side allocations for GL textures and framebuffers. None, and I cannot see them from Gecko. The GL context is the native CGL one, because `UseWebRenderANGLE` is only set for Windows in my reading of `gfx/thebes/gfxPlatform.cpp:2618` (unverified on macOS). `CreateGLContextCGL` (`RenderThread.cpp:1772-1778`) makes a headless Apple OpenGL context, so Apple's GL-on-Metal driver holds memory Gecko cannot count.
- The WebRender render target pool (24 MB) does have a reporter.

## 2. Picture cache slices in an Origin window

WebRender cuts slices at scroll roots, root iframes, fixed-position content with a scrolling sibling, scrollbar containers and some blend containers (`tile_cache/slice_builder.rs:272-392`, `scene_building.rs:1020-1030`, `1250-1258`, `2118-2140`). I read the cutting rules but not a live slice dump. The counts below are expected, not measured.

An Origin window with one tab has roughly these slices, in z order:

1. Chrome behind the page. It holds the window gradient (`.zen-browser-generic-background`, `src/zen/common/styles/zen-browser-ui.css:25-83`), the sidebar and the toolbars. This slice spans the whole window.
2. The sidebar tab list, if the tab arrowscrollbox is its own scroll root. About 600 x 1700 pixels. Unverified.
3. The page. A remote browser is a root iframe, so WebRender forces a barrier before and after it (`scene_building.rs:1250-1258`). Pages with several scroll containers or fixed headers add one slice each.
4. Page scrollbars, when shown. These are tiny.
5. Chrome painted after the page in z order: the breakout URL bar, toasts, the find bar, a split-view divider. Each open one adds a slice sized to its bounds.

That is about 4 to 6 in the idle case. Firefox's window has the same pattern. The difference is in slice 1.

- In Firefox 157 the chrome around the page paints a few strips (tab bar, toolbar). The window background is the canvas colour sent with the display list, not a primitive, so slice 1's picture rect is the strip and few tiles exist. Unverified, I did not read the Firefox chrome display list.
- In Origin, `.zen-browser-generic-background` is `position: absolute; inset: 0` with two pseudo-elements that paint a window-sized background each, one with opacity `var(--zen-background-opacity)` and one with the complement (`zen-browser-ui.css:48-72`). `#zen-main-app-wrapper` also paints a background (`:125-127`). So every tile in the window has primitives, and slice 1 reaches every tile in the window grid, except the ones the page covers.
- Slice 1 is not opaque. The window background is transparent on macOS so the vibrancy view shows (`src/zen/common/styles/zen-theme.css:297-306`). Opacity does not change memory. IOSurfaces are BGRA either way. It changes whether the tile can occlude and how much work WindowServer does (see `window-material-2026-10-13.md`).
- The page slice is opaque, with a rounded compositor clip and shadow. The clip does not add slices. WebRender turns the shared clip into a layer property (`tile_cache/mod.rs:1234-1296`). The shadow is in chrome tiles.
- `.zen-browser-generic-background` has `isolation: isolate`, a `background-blend-mode: lighten` on both pseudo-elements, and `will-change: background-color`. Gecko turns a non-normal `background-blend-mode` into a blend container. If the blend container is not the first thing in an empty slice, WebRender renders it into an offscreen surface sized to the element (`scene_building.rs:2118-2140`). That would be a window-sized render target, up to 30 MB at 3456 x 2210. The 24 MB `render-targets` row is the right size for it, but I cannot tell from the report which pass owns it. Unverified, and the single best lead for the render-target row.
- The grain image uses `mix-blend-mode: hard-light` (`src/zen/spaces/zen-gradient-generator.css:396-406`) but only paints when `--zen-grainy-background-opacity` is above 0. Default is 0.
- There is no `backdrop-filter` left in the UI (`docs/cuts.md`).
- Split view and Glance add one page slice per visible browser. Each adds the page tile count below.

## 3. Estimates for one window at 2x

Assumptions, all unverified: sidebar 300 points wide (600 px), 8 point (16 px) gap around the page, tile grid starting at the window origin for chrome and at the page origin for the page, tab list slice 1 tile wide. Pool full at 25 x 2 MB. Spare buffers only for tiles that changed.

| | 14-inch, 3024 x 1964 | 16-inch, 3456 x 2234 | Mac mini, 1920 x 1080 at 1x |
|---|---|---|---|
| Pixels | 5.94 M | 7.72 M | 2.07 M |
| Page tiles, first view | 12 | 15 | 6 |
| Page tiles, after scrolling a long page | 18 | 21 | 10 |
| Chrome slice tiles, not culled | 10 | 14 | 6 |
| Tab list slice tiles | 4 | 4 | 2 |
| Front surfaces only | 52 MB | 66 MB | 28 MB |
| After scrolling | 64 MB | 78 MB | 36 MB |
| Every tile with a spare | 128 MB | 156 MB | 72 MB |
| Pool on top of tiles | up to 50 MB | up to 50 MB | up to 50 MB |
| Render targets | unverified | 24 MB (reported) | unverified |
| Texture atlas | unverified | 37 MB (reported) | unverified |

The 16-inch user report shows atlas 37 MB and render targets 24 MB, which are real. So tile IOSurfaces plus pool for the 16-inch come to between 66 and 206 MB. Add 65 MB of named textures, 57 MB resident-unique and the pool, and the total is 190 to 330 MB. The report says 533 MB. So code reading explains roughly half, and about 200 to 340 MB has no explanation yet.

### Which part matches the unreported memory

- About 66 to 206 MB of the unreported 410 MB is tile surfaces and the pool. This is the best-supported part, because the code allocates it per pixel and has no reporter.
- The 41 MB freed by minimizing fits the spare back buffers. The 16-inch has about 39 tiles. If about half carried a spare, that is about 20 surfaces of 2 MB. Memory pressure destroys every tile, and fresh tiles have no spare until they change twice. This match is a guess, but the number lines up (unverified).
- The remaining 200 to 340 MB I cannot place from source. The candidates are Apple's GL driver (per texture and per framebuffer allocations, command buffers, pipeline variants), shader variants, and a window-sized offscreen target that is cached outside the render-target pool. All unverified. Per-pixel scaling between the two machines favors the first and third.
- The Mac mini's 153 MB is what the model predicts at 2.07 Mpx. The footprint line through both machines has a fixed part of only about 12 MB, which means shader memory is not the big part.

### The measurement that settles it

The code cannot settle the split. Ask the user to run this in Terminal while Origin is open, then paste the output:

```
vmmap --summary $(pgrep -f 'Origin.*gpu' | head -1) | head -60
footprint -p $(pgrep -f 'Origin.*gpu' | head -1) | head -40
```

`vmmap --summary` shows the rows `IOSurface`, `IOAccelerator` and `IOKit` with swapped and dirty sizes. `IOSurface` is the tile set and pool. The other two are driver memory. The pgrep pattern is a guess for the GPU process name. The user can also pick the pid from Activity Monitor (unverified). The same two commands on the Mac mini during a harness run give the 1x baseline for free.

## 4. Options to cut it

Memory is estimated for the 16-inch window. Energy and smoothness costs are my reading unless noted. Nothing here touches sandboxing, site isolation, Safe Browsing, CRLite or Remote Settings.

### 1. Trim when the window is hidden and has been idle (JS only)

- Fire `Services.obs.notifyObservers(null, "memory-pressure", "heap-minimize")` when the window is occluded or minimized for N minutes. The path from the parent's observer to the compositor is `gfxPlatform::OnMemoryPressure` then `NotifyMemoryPressure` (`gfx/thebes/gfxPlatform.cpp:414-425`, `gfx/layers/ipc/CompositorBridgeParent.cpp:1244-1251`).
- The reports show why it must be hidden. Minimizing in the report ran with the window still visible, so the next frame rebuilt every tile from the pool and only the spares, the atlas and standalone textures went away (60 MB). With the window hidden no frame runs, so the tiles stay gone. Expected saving is the whole tile set minus pool: 66 to 156 MB, plus atlas 37 MB and render targets 24 MB if they empty. Total 100 to 200 MB (unverified).
- Cost. The window redraws every tile on return, which is one frame of 30 to 40 tiles plus glyph re-rasterization. Content processes also drop the image surface cache and run a GC, so pages re-decode their images on return. Nothing runs while hidden.
- Risk. Low to medium. No engine patch. Skip it while media plays. Pair it with option 2 so the pool does not keep 50 MB through the trim.

### 2. Lower `gfx.webrender.compositor.surface-pool-size`

- Set 25 to 4. Saves up to 42 MB on the 16-inch window, since pool entries are 2 MB each. Pure pref, restart needed.
- Cost. Every tile redraw that finds the pool empty calls `IOSurfaceCreate` (`SurfacePoolCA.mm:176-190`), which is CPU and kernel time rather than GPU time. The harness variants `pool-6` and `pool-0` in the earlier note measure it on scroll and tab switch.
- Risk. Low. The pool is only a free-list. A value of 0 still works.

### 3. Spare buffer limit on tiles (small engine patch)

- Make `GetUnusedSurfaceAndCleanUp` drop the spare after N frames without a change (`NativeLayerMacSurfaceHandler.mm:129-165`). Saves the spare half of every tile that changed once, up to 78 MB, and probably the 41 MB seen on minimize (unverified).
- Cost. The next update allocates or takes a surface from the pool and copies the valid region, a one-time cost.
- Risk. Medium. It is a new diff in a file Zen does not touch, so it rebases cleanly but we carry it. Rank it below 1 and 2 because it is code. Add a `ponytail:` marker with the idle frame count.

### 4. Fewer or smaller chrome tiles

- Chrome slice 1 holds 14 tiles on the 16-inch window, about 28 MB, even though it is mostly a flat colour. Stop the window-wide gradient from being a primitive in every tile. For instance, set the sidebar and toolbar backgrounds on their own elements and leave the wrapper transparent.
- Saves up to 28 MB. Cost. That changes Zen UI code and the look of themes, and the project rule is to put no deep work into Zen UI code that a rewrite would replace. Rank low until the rewrite study is decided.
- The blend container on `.zen-browser-generic-background` is a separate lead. If it is the source of the 24 MB render target, replacing `background-blend-mode: lighten` removes it. Check first with a profiler render-target dump.

### 5. Tile size prefs

- `gfx.webrender.picture-tile-width` and `-height` change the grid (`StaticPrefList.yaml:8715-8729`). Because tile surfaces are full size even at the edge, a 1024 x 256 tile on the 16-inch page (2800 x 2180 px) saves one half row: about 3 MB. Smaller tiles add native layers, and the CALayer count drives WindowServer work.
- Saves under 10 MB for a real energy risk. Do not ship. Windows already uses 512 wide.

### 6. `gfx.webrender.compositor` off

- The window then gets one real double-buffered window-sized surface (61 MB at 3456 x 2210), and tiles become WebRender textures that stay in GPU memory. Saves nothing certain, and the earlier note and the `no-wr-compositor` variant treat it as a control for the WindowServer cost. Bug 1574586 is the reason Firefox moved to the native compositor. Expect WindowServer to rise.
- Reject for memory. The variant remains useful as a control.

### Ranking by memory saved per unit of risk

1. Hidden-window trim (option 1). 100 to 200 MB while hidden, low risk, no engine code.
2. Pool size 25 to 4 (option 2). Up to 42 MB, low risk, one pref.
3. Spare-buffer limit (option 3). Up to 78 MB, medium risk, small patch.
4. Chrome gradient and blend container (option 4). Up to 28 MB plus maybe 24 MB, blocked by the rewrite rule.
5. Tile size (option 5). Under 10 MB, energy risk.
6. Compositor off (option 6). No saving, high energy risk.

## What Firefox already does under pressure

- Background tab: clears the tab's display list, tiles go to the pool, textures wait for eviction (earlier note, section 3).
- Hidden or occluded window: pauses the renderer and frees inactive render targets only. It keeps tiles, atlases and the pool (earlier note, section 3, `gfx.webrender.trim-paused-renderers.mode` 2).
- OS memory pressure on macOS: the Mac watcher responds at the critical level by default, and `browser.lowMemoryResponseOnWarn` is false (`xpcom/base/AvailableMemoryWatcherMac.cpp:38`, `:136-137`). A 16 GB machine seldom reaches critical, so the destroy-all path rarely fires without our help.
- The pool is never cleared on pressure, only when the render thread ends.

## Next steps

1. Ask the user for the `vmmap --summary` and `footprint` output above, plus the window size in points and the sidebar width.
2. Add harness variants `pool-4` and `idle-trim-hidden` to `scripts/perf/variants.json`. The earlier note lists `pool-6` and `pool-0`.
3. Dump slices on the Mac mini with the WebRender profiler (`gfx.webrender.debug.profiler-ui` counters, "picture cache slices") to replace the slice counts in section 2.
