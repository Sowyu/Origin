# GPU process memory on macOS (WebRender, native compositor)

Question: what fills the GPU process (171 to 198 MB with 10 loaded tabs, 1440x900 at 1x), what bounds it, and what Origin could lower. Source is `engine/` (Firefox 157.0.1 plus Zen's patches). All paths below are under `engine/`. Anything I did not read in the source or measure is marked "unverified". I ran no builds and no browser.

One caveat applies to every size below: I did not check whether the harness counts IOSurface memory in the GPU process or in WindowServer. Check with a `memreport` run before trusting the tile numbers (unverified).

## 1. What holds memory

### Picture cache tiles (IOSurfaces)

- With the native compositor, picture cache tiles are not WebRender textures. Each tile is a CoreAnimation layer backed by a BGRA IOSurface (`gfx/webrender_bindings/RenderCompositorNative.cpp:399-409`, `gfx/layers/SurfacePoolCA.mm:176-186`).
- Tile size is 1024x512 device pixels on macOS, so 2 MB per surface (`modules/libpref/init/StaticPrefList.yaml:8715-8728`, `gfx/wr/webrender/src/tile_cache/mod.rs:73-78`). Scrollbar tiles are 1024x32 and 32x1024.
- Count scales with the visible area in device pixels. The tile grid covers the screen rect plus one tile height above and below (`gfx/wr/webrender/src/tile_cache/mod.rs:1442-1450`), clipped to the page size.
- Estimate at 1440x900, 1x (unverified): the page takes 2x2 to 2x3 tiles (8 to 12 MB). Zen's sidebar and toolbar are separate slices and add 2 to 6 tiles.
- Each layer keeps a front surface plus back surfaces while WindowServer still uses them. It drops any that stay in use for 10 checks (`gfx/layers/NativeLayerMacSurfaceHandler.mm:131-160`). So one tile costs 1 to 3 surfaces (2 to 6 MB) while content changes.
- Scales with: window size and scale factor (area), content height (inflate margin), number of slices (chrome versus page). It does not scale with tab count when background tabs hide: see section 3.
- Tiles are not recreated at idle and are not shrunk at idle. They go away when the pipeline's display list is cleared, the window is resized smaller, or on memory pressure (`gfx/wr/webrender/src/tile_cache/mod.rs:961-977`).

### Surface pool

- Freed tile surfaces go to a shared pool. It keeps at most 25 free surfaces of any size, enforced at the end of each frame (`gfx/layers/SurfacePoolCA.mm:222-229`, `RenderThread.cpp:1558-1566`, default `gfx.webrender.compositor.surface-pool-size` 25 at `StaticPrefList.yaml:8494`).
- 25 tiles at 2 MB is up to 50 MB of idle IOSurfaces. This is a count cap, not a byte cap, and nothing ages out entries by time. The pool only shrinks when a later frame runs `EnforcePoolSizeLimit` with fewer free entries, or when the shared pool is cleared (`RenderThread.cpp:308`, shutdown).
- Pooled surfaces also keep GL framebuffer wrappers and shared depth buffers (`SurfacePoolCA.mm:291-400`). Depth buffer size and use are unverified.

### Texture cache (images, glyphs, shadows, masks)

- Shared atlases are allocated lazily as square textures: color 2048x2048 (BGRA, 16 MB), color glyphs 2048x2048 (16 MB), alpha glyphs 2048x2048 (R8, 4 MB), alpha 1024x1024 (1 MB), nearest 512x512, alpha16 512x512 (`gfx/wr/webrender/src/texture_cache.rs:534-542`). The main window uses these defaults, set in `gfx/webrender_bindings/src/bindings.rs:2260-2262`. They are not prefs.
- Realistic size with text-heavy pages: 20 to 40 MB (unverified, depends on which atlases get used).
- Standalone textures (large images, oversize glyph runs, anything over the atlas size) are separate. They are evicted once total standalone bytes pass 8 MB and the entry is cold (`texture_cache.rs:1120-1128`).
- Shared atlases evict only above 1/3 of one texture (2/3 for glyphs) and only items not used for 400 down to 1 frames, depending on pressure (`texture_cache.rs:1140-1215`). At most 32 evictions per frame.
- Eviction runs in `begin_frame` (`texture_cache.rs:697-707`). With no frames, nothing evicts. A quiet idle browser keeps its peak atlas size until something redraws or memory pressure arrives.
- Empty atlas textures are freed at frame end (`texture_cache.rs:716-723`). Compaction runs per frame (`texture_cache.rs:758`).
- Scales with: distinct glyphs and font sizes (grows ~4x pixels at 2x scale), images WebRender rasterizes or uploads (blob tiles, gradients, box shadows), number of visible pages. Content-dependent.

### Glyph caches

- The glyph rasterizer on macOS is CoreText on worker threads. The rasterized bitmaps live in the texture cache glyph atlases above. The key map (`gfx/wr/webrender/src/glyph_cache.rs`) is small CPU memory (unverified size).
- The GPU process also keeps font data and the Skia font cache. `gfx.content.skia-font-cache-size` is 5 MB (`StaticPrefList.yaml:7701`), and it applies to Skia canvas painting only.
- No pref bounds the WebRender glyph atlas size.

### Shader cache

- On macOS WebRender compiles GL programs lazily: `gfx.webrender.precache-shaders` false, `gfx.webrender.program-binary-disk` false (`StaticPrefList.yaml:8615-8630`). Compiled programs sit in the driver, outside Gecko's control.
- Size is unverified. My guess is 20 to 50 MB of the GPU process with the shader variants a Zen window needs (many). Measure by comparing GPU process memory at launch with a one-tab page against after the 10-tab load.
- `gfx.webrender.use-optimized-shaders` is true (`StaticPrefList.yaml:8624`). Nothing here shrinks it without an engine change.

### Render target pool (offscreen passes)

- Targets for filters, shadows, opacity groups and clip masks are pooled. The pool keeps up to 64 MB of unused targets and frees older ones only past that, or past a 320 MB red line (`gfx/wr/webrender/src/resource_cache.rs:1866-1870`, `2092-2136`). Both numbers are hardcoded.
- A window-sized target at 1x is 1440x900x4 = 5.2 MB. Scales with window area and the number of offscreen effects. Zen's shadow, radius and vibrancy effects probably create them (unverified, ties to the effects batch).
- GC also runs per frame, so it also does nothing at idle.

### Upload staging

- Texture uploads use PBO or staging pools, 512x512 batch textures (`gfx/wr/webrender/src/renderer/upload.rs:44`). They are freed on memory pressure (`renderer/mod.rs:1260-1261`) and, with the pref below, when the renderer pauses.
- Size is unverified, probably under 10 MB.

### Video frames

- Decoded frames live in the RDD process. The GPU process holds IOSurface-backed frames that WebRender composites, as external native surfaces (`tile_cache/mod.rs:833`). `layers.iosurfaceimage.recycle-limit` is 15 (`StaticPrefList.yaml:10557-10560`).
- The idle scenario has no video. Windowed video adds frames and one extra compositor layer only while playing.

### Canvas and WebGL

- Accelerated 2D canvas is on (`gfx.canvas.accelerated` true, `StaticPrefList.yaml:7316-7327`) and remote WebGL contexts live in the GPU process. The test fixtures have scripts stripped, so this is zero in the harness. Real pages with canvas will add memory the harness does not show.

## 2. Prefs that bound it

| Pref | Default | What it bounds | Restart | Security |
|---|---|---|---|---|
| `gfx.webrender.compositor.surface-pool-size` | 25 | free IOSurface count, up to 50 MB | yes (`mirror: once`) | no |
| `gfx.webrender.picture-tile-width` / `-height` | 1024 / 512 | tile size in device pixels | takes effect at WebRender creation | no |
| `gfx.webrender.trim-paused-renderers.mode` | 2 | render targets and upload buffers when paused | no | no |
| `gfx.webrender.max-shared-surface-size` | 2048 | largest shared offscreen surface | yes | no |
| `gfx.webrender.enable-low-priority-pool` | true | second worker thread pool | yes | no |
| `image.mem.surfacecache.max_size_kb` | 2024*1024 | decoded image cache limit | yes | no |
| `image.mem.surfacecache.size_factor` | 4 | cache is at most 1/4 of RAM | yes | no |
| `image.mem.surfacecache.min_expiration_ms` | 60000 | time before unlocked surfaces expire | yes | no |
| `image.mem.surfacecache.discard_factor` | 1 | share dropped at memory pressure (1 = all) | yes | no |
| `image.mem.discardable` / `image.mem.animated.discardable` | true / true | discard inactive frames, re-decode on demand | no / yes | no |
| `image.cache.size` | 20 MB | compressed bytes of unused images | yes | no |
| `gfx.content.skia-font-cache-size` | 5 | Skia font cache (MB) | yes | no |
| `layers.iosurfaceimage.recycle-limit` | 15 | pooled video IOSurfaces | no | no |

- None of these is a security setting. Safe Browsing, sandbox, site isolation and CRLite are untouched.
- There is no pref for the texture cache atlas sizes, the render target pool limit (64 MB) or the picture tile count. Changing those needs a small patch (`bindings.rs:2260` and `resource_cache.rs:1866`). The CLAUDE.md rule says prefer a pref to a patch, so only do this if the pref route falls short.
- Image decoding (`image.mem.surfacecache.*`) lives in content processes and the parent, not in the GPU process. Decoded surfaces reach the GPU process as shared memory (unverified how much is double counted). The surface cache is already capped at 1/4 of RAM or about 2 GB, which is no bound at all for a 500 MB target. Visible images are locked and never discarded (`image/SurfaceCache.cpp:869-885` and the default comment at `StaticPrefList.yaml:9114-9119`). Unlocked entries expire after 60 s.

## 3. Does Firefox already trim for background tabs, minimizing and idle?

- Background tab: yes, at once. When a tab stops being visible, `BrowserChild::MakeHidden` calls `ClearCachedResources` (`dom/ipc/BrowserChild.cpp:3381-3400`, `3525-3536`). That sends `ClearDisplayList` for the tab's pipeline (`gfx/layers/wr/WebRenderBridgeParent.cpp:2224-2250`) and schedules a frame (`CLEAR_RESOURCES`). The tab's tiles go back to the surface pool and its texture entries become evictable. Evictable is not evicted: textures only drop on later frames under the rules in section 1. So after a tab switch, tile memory moves into the pool (cap 25), and texture cache entries wait for frames.
- Minimized or fully occluded window: `nsCocoaWindow::DispatchOcclusionEvent` reports occlusion (`widget/cocoa/nsCocoaWindow.mm:7152-7200`). Per the comment there it ends in `nsIWidget::PauseOrResumeCompositor`. I did not read that path to its end (unverified). `RendererOGL::Pause` then trims on the pause transition when `gfx.webrender.trim-paused-renderers.mode` is 1 or higher. Default is already 2 (`StaticPrefList.yaml:8169-8175`, `gfx/webrender_bindings/RendererOGL.cpp:365-385`).
  - Mode 1 and 2 free inactive render targets only. They keep persistent caches, tiles and the surface pool (`gfx/wr/webrender/src/render_backend.rs:1374-1425`).
  - Delay: immediate on the occlusion event. A key or main window is never treated as occluded in windowed mode (`nsCocoaWindow.mm:7157-7185`), so only a truly covered or minimized window pauses.
  - Atlases, tiles and the 25-surface pool stay. The harness "minimized" scenario can show this with a before and after sample.
- Idle: nothing in WebRender ages out caches by wall clock time. All its GC runs per frame, and an idle page produces none. The only large drop is a `memory-pressure` notification.
- Memory pressure path: `gfxPlatform::OnMemoryPressure` (`gfx/thebes/gfxPlatform.cpp:414-425`) purges Azure caches, gradient cache, Skia font cache, then sends `NotifyMemoryPressure` to the compositor. WebRender then clears all caches, destroys every compositor tile and resets scratch space (`render_backend.rs:1425-1450`, `tile_cache/mod.rs:961-977`). The code comment calls it drastic. The next frame rebuilds everything.
  - The observer fires on any `memory-pressure` topic notification (`gfx/layers/MemoryPressureObserver.cpp:55-70`). The OS memory-pressure source also feeds it; I did not read the macOS watcher (unverified).
  - Chrome JS can fire it itself: `Services.obs.notifyObservers(null, "memory-pressure", "heap-minimize")`. The same notification makes content processes drop the image surface cache, JS heaps and caches. This is the one existing mechanism for a drop after idle. Whether `heap-minimize` forwards to the GPU process through `GPUChild::RecvFlushMemory` or only from the parent is unverified. The parent path above reaches the compositor.

## 4. Retina (2x) versus this 1x screen, estimate

All unverified, from the formulas above:

- Tile count at 2x for the same window: the page is 2880x1800 device pixels, so 3x4 to 3x5 tiles (12 to 20) against 4 to 6. Tile bytes go up about 3 to 4x: 30 to 45 MB front buffers, 60 to 90 MB with back buffers.
- Pool cap stays at 25 surfaces of 2 MB (50 MB), but it will be full more often, because there are more tiles to recycle.
- Glyph atlases: each glyph has 4x the pixels. Two glyph textures are probably enough but the color glyph atlas will fill sooner. Add 10 to 30 MB.
- Render targets: 4x area, a window-sized target is 20.7 MB. Pool cap stays 64 MB but is reached with 3 targets.
- Shader memory: no change. Texture cache images: up to 4x for rasterized content.
- GPU process on a 2x MacBook, 10 tabs: about 300 to 450 MB against today's 171 to 198 MB. This alone would use most of a 500 MB browser budget. Check the user's MacBook scale and display size with `system_profiler SPDisplaysDataType` before relying on this.

## Ranking by memory saved per energy risk

Energy risk means more redraws, more IOSurface or texture allocation, more WindowServer layers. The harness found WindowServer GPU time to be the main cost, so anything that adds layers ranks low.

1. Idle memory-pressure poke from chrome JS, after N minutes without input or when the window loses focus for N minutes. Saves: probably the biggest single drop, all of the atlases, render targets, tiles (~40 to 100 MB in the GPU process, unverified) plus caches in content processes. Cost: one burst of CPU and GPU on trigger, one full redraw (glyph re-rasterize and tile re-render) on return, and no cost at steady idle. Needs Origin JS, no engine patch, small diff. Risk: a visible hitch when the user comes back, and a poke while a video plays costs a frame glitch (skip if media is playing).
2. `gfx.webrender.compositor.surface-pool-size` 25 to 6: saves up to 38 MB at idle after scrolling or tab switching, 0 if the pool is not full. Cost: a new IOSurface is created on each missed tile allocation during scroll and tab switch (CPU and kernel time, not GPU). Low risk, pref only.
3. Nothing new for `gfx.webrender.trim-paused-renderers.mode`: already 2. Only worth measuring in the minimized scenario.
4. `image.mem.surfacecache.min_expiration_ms` 60000 to 10000 plus `image.mem.surfacecache.max_size_kb` to 128 MB (content processes, not GPU): saves the decoded copies of images off screen or in background tabs. Cost: re-decode when scrolling back (CPU). Low to medium risk. Saves little on the frozen fixtures, which have few images (unverified).
5. `image.cache.size` 20 MB to 5 MB: saves up to 15 MB of compressed images per process that loaded them. Cost: re-fetch or re-decode on revisit. Low risk, small gain.
6. `gfx.webrender.picture-tile-width/height` 512x512 or 256x256: tighter tiles waste fewer pixels at the page edges (maybe 2 to 4 MB). More layers for CoreAnimation mean more WindowServer work. Rank low and run only to confirm the energy cost. Windows ships 512 wide.
7. Engine patches (texture cache atlas 2048 to 1024, render target pool 64 MB to 16 MB): save maybe 20 to 40 MB, but they are diffs against WebRender's Rust that need rebasing each Zen release and slower scroll with more eviction churn. Last resort.

Decoded images in content processes and the 534 to 575 MB outside content (parent 254 to 300 MB) matter more than anything here. Alone, GPU trimming gets about 50 to 100 MB of the 171 to 198 MB. The parent process is the bigger lever.

## Harness variants to try

`scripts/perf/variants.json` has a convention for memory-only variants (no `scenarios`). Suggested entries:

1. `pool-6`: `{"gfx.webrender.compositor.surface-pool-size": 6}`. Measure idle, switch, scroll.
2. `pool-0`: same pref at 0, to bracket the effect and see the energy cost on switch.
3. `imgcache-small`: `{"image.mem.surfacecache.min_expiration_ms": 10000, "image.mem.surfacecache.max_size_kb": 131072, "image.cache.size": 5242880}`. Measure idle and scroll.
4. `tile-512`: `{"gfx.webrender.picture-tile-width": 512, "gfx.webrender.picture-tile-height": 512}`. Measure scroll and split drag to see WindowServer cost.
5. `idle-poke`: needs a profile script or a small Origin JS file, not a pref. After the idle window starts, fire `Services.obs.notifyObservers(null, "memory-pressure", "heap-minimize")` once and sample memory 5 s later and 60 s later. Also record the energy of the next scroll or switch, which pays for the redraw.

Measure each with the GPU process split out. `scripts/perf/memreport` can take an about:memory report. Look for WebRender entries under the GPU process (names unverified) to see which cache shrank. Pool and tile sizes show as IOSurface in `vmmap` of the GPU process (unverified).
