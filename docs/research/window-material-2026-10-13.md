# Window material and compositor cost, 2026-10-13

Question: why Zen's WindowServer and Mac GPU power rise while pages scroll and play video, and the cheapest way to keep the see-through sidebar and the floating rounded page without that cost.

Sources: Zen patches in `src/widget/cocoa/`, the patched Firefox 157.0.1 tree in `engine/` (line numbers are from that tree, which already has Zen's patches applied), Mozilla bug 1574586 (REST API, comments 0 and 10), Zen PR #15006 (GitHub REST API, body, file list and review comments), Apple's NSVisualEffectView page and the macOS 27 SDK header. Nothing was built or launched. Claims marked "unverified" are my reading, not measured.

Numbers this note explains, all from batch baseline-1 (`docs/research/energy-by-process-2026-10-13.md`, section 2):

| scenario | Mac GPU, Zen | Mac GPU, Firefox | WindowServer, Zen | WindowServer, Firefox |
|---|---|---|---|---|
| scroll | 140.7 mW | 56.1 mW | 51.2 mW | 28.2 mW |
| video-windowed | 92.5 mW | 18.2 mW | 32.4 mW | 13.7 mW |

The browsers' own processes are level in both rows. Fullscreen video shows no gap, and min-visual (every Zen effect off) brings WindowServer down to Firefox's level.

## 1. How the window material is built

### Zen's view hierarchy

`nsCocoaWindow::SetWindowClass` runs once for a `navigator:browser` top-level window, registers a callback on `zen.widget.macos.window-vibrancy` and calls `UpdateWindowMaterial` (`src/widget/cocoa/nsCocoaWindow-mm.patch:83-94`, `engine/widget/cocoa/nsCocoaWindow.mm:1403-1414`).

`UpdateWindowMaterial` (patch lines 96-120, engine 1416-1440) makes a `ZenWindowMaterialView`, moves every subview of the old content view into it, and makes it the window's content view. With the pref off it does the same with a plain `NSView`. The result is:

```
NSWindow                      opaque = YES (nsCocoaWindow.mm:5338, Zen leaves it)
└ ZenWindowMaterialView       contentView, NSVisualEffectView, layer-backed, whole window
  │                           blendingMode BehindWindow, material HUDWindow (pref 1),
  │                           state FollowsWindowActiveState (patch 51-76)
  └ ChildView                 Gecko's view, whole window
    ├ mNonDraggableViewsContainer
    ├ mVibrancyViewsContainer  Firefox's per-region vibrancy views (see below)
    └ PixelHostingView         layer-backed, wantsUpdateLayer (4776-4815)
      └ mRootCALayer           NativeLayerRootCA root (1797-1802, 5146-5147)
        └ one wrapping CALayer per WebRender tile and per compositor surface
```

The material view is the bottom of the stack and covers the whole window. Every Gecko pixel, the floating page included, is drawn by CALayers above it. Nothing in the view tracks layout. Its only callbacks are two prefs (patch lines 26-29, 58-60), so it never changes while pages scroll.

Zen's chrome CSS makes the window background transparent on macOS (`src/zen/common/styles/zen-theme.css:297-302`), so WebRender draws the chrome with alpha and the material shows through wherever the chrome is not opaque. The floating page is `.browserSidebarContainer` with `overflow: clip`, `corner-shape: round`, a border radius and `--zen-big-shadow` (`src/zen/common/styles/zen-browser-container.css:6-15`, shadow `rgba(0,0,0,.24) 0 3px 8px` at `zen-theme.css:261`). The `browser` element inside paints an opaque white or `rgb(32,32,32)` background (`zen-browser-container.css:17-19`).

`VibrancyManager-mm.patch` is now only a three-line change: Firefox's own vibrant views follow `zen.view.grey-out-inactive-windows` (`engine/widget/cocoa/VibrancyManager.mm:32-35`). PR #15006 removed the part of it that remapped the sidebar material.

### Which layers are opaque

In `NativeLayerCA::Representation::ApplyChanges`, each layer is three CALayers: a wrapping layer that clips to the tile's visible rect with `masksToBounds`, a rounded-clip layer, and the content layer with the IOSurface (`engine/gfx/layers/NativeLayerCA.mm:1770-1830`). The content layer gets `opaque` and the private `setContentsOpaque:` from WebRender's per-tile flag (`:1813-1818`).

WebRender marks a tile opaque when its slice's opaque backdrop covers the tile's clipped rect (`engine/gfx/wr/webrender/src/tile_cache/mod.rs:494-531`, backdrop rules at `:2803-2890`). For Zen:

- Chrome tiles are not opaque, because the window background is transparent.
- Page tiles are opaque, because the `browser` background is an opaque color. Chrome tiles under them are culled as occluded (`tile_cache/mod.rs:3328-3352`).
- The page's rounded corners do not go into the tiles. WebRender turns a shared rounded-rect clip on a picture cache slice into a compositor clip (`tile_cache/mod.rs:1234-1296`). NativeLayerCA then applies it with `cornerRadius`, `maskedCorners` and `masksToBounds = YES` on the rounded-clip layer of every layer in that slice (`NativeLayerCA.mm:1932-1973`). The rounded-clip layer's bounds are the whole page rect, so every page tile and the video layer carries a rounded mask, even tiles nowhere near a corner. That the page slice actually gets the compositor clip is unverified. The native layer dump below shows it.

### Firefox 157's own vibrancy

Firefox builds vibrancy per region. Layout reports theme geometry for elements with `appearance: -moz-sidebar` or `-moz-window-titlebar` (`engine/widget/cocoa/nsNativeThemeCocoa.mm:1760-1765`). `nsLayoutUtils::PaintFrame` passes it to the widget after each display list build (`engine/layout/base/nsLayoutUtils.cpp:3333-3343`). `nsCocoaWindow::UpdateVibrancy` turns it into regions (`nsCocoaWindow.mm:1250-1293`), and `VibrancyManager` keeps one `MOZVibrantView` per rect inside `mVibrancyViewsContainer`, below the PixelHostingView (`VibrancyManager.mm:120-134`, container order at `nsCocoaWindow.mm:1780-1795`). When a region changes it calls `SuspendAsyncCATransactions` (`:1290-1292`), which forces sync flushes and holds off-main-thread commits until the main thread paints (`:348-364`).

In the stock browser window the only vibrant region is the toolbox, through `#navigator-toolbox::after { -moz-default-appearance: -moz-window-titlebar }` (`engine/browser/themes/shared/browser-shared.css:283-289`). Its blend mode is within-window by default (`widget.macos.titlebar-blend-mode.behind-window` false, `engine/modules/libpref/init/StaticPrefList.yaml:20714-20717`). The page area of a Firefox window has no NSVisualEffectView under it, and the page tiles are opaque rectangles with no rounded mask. Whether Zen's tree still produces this toolbox region is unverified.

The header comment in `engine/widget/cocoa/VibrancyManager.h:30-39` states the model: the window server draws the blur behind the window's contents, and it only shows where those contents are not fully opaque.

## 2. Why scrolling and video cost WindowServer work

Bug 1574586 (Firefox 70) is the reference. Markus Stange wrote in comment 0 that "every composite causes the window server to recompute the vibrancy blur, even if only pixels outside the vibrancy have changed." The fix, comment 10, created "separate NativeLayer objects for opaque and transparent parts of the window", so that "when something changes in an opaque layer, the window server only needs to copy the opaque layer to the screen and can avoid recomputing any window backgrounds for transparent parts of the window." The saving depends on two things: the changing pixels sit in opaque layers, and no vibrancy sits under them.

Zen breaks both conditions in the page area.

1. The backdrop sits under the page. Apple's page says behind-window blending "uses the content behind the window as the background for your visual effect view". In Zen that view spans the whole window, so the page's tiles and the video layer sit directly on the blur. In Firefox nothing vibrant sits under the page.
2. The page layers are not plain opaque rectangles. Each one has a `cornerRadius` mask with `masksToBounds` on its parent CALayer (section 1). My reading is that Core Animation can only treat a layer as an occluder when it is an opaque, unmasked, axis-aligned rectangle, so it has to draw what is under a masked layer, here the backdrop, and blend over it. That is unverified, because Apple documents no occlusion rules for the render server. It is a known Core Animation cost on iOS that `cornerRadius` with `masksToBounds` on a layer with sublayers renders through an extra offscreen pass. Apple's WWDC talks on rendering performance cover it, but I did not fetch the transcript. Whether macOS WindowServer does the same for each Zen tile is also unverified.

Put together, each scroll frame and each video frame damages the page rect. The window server then has to draw the blurred backdrop under the whole damaged rect, mask the tile or video layer, and blend it over. Firefox only copies opaque tiles. This fits every number we have:

- The browser's own processes are level, because WebRender does the same tile work. The extra is all in WindowServer and the Mac's GPU.
- Fullscreen video has no gap. `:root:not([inDOMFullscreen="true"])` drops the radius and shadow (`zen-browser-container.css:6`), the chrome is hidden, and the video covers the screen, so neither condition applies.
- min-visual reaches Firefox's level because it removes both the backdrop and the rounded mask.

What it rules out:

- Gecko does not re-blur the material view by invalidating it. Nothing calls `setNeedsDisplay` on it, and `UpdateWindowMaterial` returns early unless the pref changes (patch lines 102-106). The blur cost comes from the window server compositing over the backdrop, not from Gecko touching the view.
- The page shadow and the gradient layers are in chrome tiles that do not change while the page scrolls. WebRender keeps those tiles cached, so I expect no per-frame cost from them. The no-page-shadow and no-gradient variants test this.
- The content views do not take part in vibrancy blending. No Gecko view overrides `allowsVibrancy`, and Apple says "the presence of a visual effect view in your view hierarchy does not automatically add vibrancy to your content."

Which of the two conditions costs more is the open question. The single-effect variants in section 4 split them: no-vibrancy removes condition 1, and no-page-radius removes condition 2.

## 3. Proposal

The cheapest change that keeps the look is to take the material out from under the page interior and leave everything else alone. If the rounded mask turns out to cost on its own, add a second small patch that puts the mask only on corner tiles. Measure first (section 4). The result decides whether one or both ship.

### A. Cut a hole in the material under the opaque page

Gecko already computes the part of the window that is opaque, and nobody on macOS uses it. `WebRenderCommandBuilder` collects unscrolled background-color items of the parent process's root display list into the window opaque region. It clips them inward through every rounded clip (`engine/gfx/layers/wr/WebRenderCommandBuilder.cpp:2072-2096`). `PaintFrame` hands the region to `nsIWidget::UpdateOpaqueRegion` after every paint (`nsLayoutUtils.cpp:3378-3388`). The default is a no-op (`engine/widget/nsIWidget.h:1240`). GTK uses the same call to tell the Wayland or X compositor what it need not blend (`engine/widget/gtk/nsWindow.cpp:5006-5050`).

The change:

1. Override `UpdateOpaqueRegion` in `nsCocoaWindow`, in Zen's existing `src/widget/cocoa/nsCocoaWindow-h.patch` and `nsCocoaWindow-mm.patch`.
2. Return early if the region equals the last one, as GTK does.
3. Take the region's largest rect, inset it by a safety margin of about 16 points (unverified value), and set `maskImage` on the `ZenWindowMaterialView`. The mask is a tiny NSImage that is opaque at the edges and clear in the middle, with `capInsets` set to the hole's distances from the window edges. The SDK header says to "set this to the smallest mask image possible and properly set the image's capInsets property to stretch it" (`MacOSX27.0.sdk/.../NSVisualEffectView.h:106`).

The browser background is opaque only when the page is not marked `transparent` (`zen-browser-container.css:17-23`). A transparent new tab therefore produces no hole and keeps the full blur. That is correct with no special case. Split view yields several rects; the first version holes only the largest one. The sidebar, the gaps, the shadow and the rounded corners keep the blur, because the hole stops inside the page's inner rect.

About 40 lines in two patches Zen already carries. There is no CSS change and no new pref.

Risks:

- During a sidebar resize or a compact-mode slide, the hole can lag the page by a frame and show the plain window background in a strip at the page edge. The inset margin hides small lags. Check it with screenshots during the sidebar and split scenarios. If it shows, shrink the hole at once and grow it one paint later.
- Mask updates during those animations make the window server rebuild the backdrop mask each frame. That only costs while the layout moves, which the sidebar and split scenarios measure.
- Reduce Transparency and inactive windows are untouched, because the view keeps its material and state.
- `maskImage` on a window's content view also shapes the window shadow, per the header comment. The hole is interior, so the outer shadow should not change. Unverified, so check the screenshot.

How it avoids the problem PR #15006 fixed: the PR body says only "Fixes #12464", and no maintainer wrote down a cost. What it removed was `appearance: -moz-sidebar` on `#zen-browser-background` (`zen-browser-ui.css`, 9 lines) plus the material remap in `VibrancyManager-mm.patch`. That old path ran through theme geometry. Every paint fed the background's rect to `UpdateVibrancy`, every rect in the region became its own `MOZVibrantView`, and every region change called `SuspendAsyncCATransactions`, forcing sync flushes until the main thread painted. My inference, unverified, is that this churn during animations and resizes is what cost CPU in #12464, which was a CPU report. Proposal A keeps the one window-wide view from #15006. It adds no views, uses no theme geometry, never calls `SuspendAsyncCATransactions`, and only sets one property when the opaque rect changes.

### B. Round only the corner tiles

Use this only if no-page-radius alone closes most of the gap in section 4.

In `NativeLayerCA::Representation::ApplyChanges` (`engine/gfx/layers/NativeLayerCA.mm:1932-1973`), set `cornerRadius` and `masksToBounds` on the rounded-clip layer only when the tile's visible rect, `useClipRect`, overlaps one of the four corner squares of the rounded clip. Every other tile and a video layer away from the corners stays a plain opaque layer clipped by its rectangular wrapping layer. The pixels drawn are identical, because the mask only removes pixels inside the corner squares.

This is about 15 lines in a new `src/gfx/layers/NativeLayerCA-mm.patch`. The block already reruns whenever position or clip changes, which covers scrolling. The risk is low, and the change would also help Firefox's own rounded content area in the revamped sidebar, so it could go upstream to Mozilla and leave our diff. Unverified: that WindowServer treats an opaque layer under a rectangular `masksToBounds` as an occluder. Option B rests on it.

### What not to do

- Moving the shadow into a static layer gains nothing I can see, because it already lives in cached chrome tiles. Measure no-page-shadow before touching it.
- Going back to Firefox's per-region `MOZVibrantView` path for the sidebar alone is the very path #15006 removed. It would bring back theme geometry updates and sync flushes on every resize or compact-mode slide.
- An opaque window with no vibrancy loses the see-through sidebar, which `docs/spec.md` says must stay.

## 4. Harness variants to isolate each part

The existing single-effect variants already split the two conditions in section 2. effects-1 runs them, with stock Zen as the interleaved control.

| variant | in variants.json | removes | prediction if section 2 holds |
|---|---|---|---|
| no-vibrancy | yes, line 3 | backdrop under everything | scroll and video WindowServer drop most of the way to Firefox |
| no-page-radius | yes, line 18 | the compositor rounded clip, so all page tiles are unmasked | a drop. If it is as large as no-vibrancy, ship B as well as A |
| no-page-shadow | yes, line 13 | the page shadow | no change in scroll or video |
| no-gradient | yes, line 8 | gradient layers | no change in scroll or video |
| min-visual | yes, line 58 | everything | Firefox's level, already seen |

Three to add before effects-1 starts:

```json
"vibrancy-and-radius-off": {
  "what": "backdrop and rounded page mask both off; tells whether the two costs add up or one hides the other",
  "prefs": {"zen.widget.macos.window-vibrancy": false},
  "userchrome": "#tabbrowser-tabpanels .browserSidebarContainer { border-radius: 0 !important; }\n",
  "scenarios": ["scroll", "video-windowed", "switch", "split"]
},
"material-under-window": {
  "what": "window material 7 (UnderWindowBackground) instead of 1 (HUDWindow); some materials may blur or saturate more",
  "prefs": {"zen.widget.macos.window-material": 7},
  "scenarios": ["scroll", "video-windowed"]
},
"no-wr-compositor": {
  "what": "control for bug 1574586: WebRender draws one window-sized surface instead of native layers; WindowServer should rise in both Zen and Firefox",
  "prefs": {"gfx.webrender.compositor": false},
  "scenarios": ["scroll", "video-windowed"]
}
```

`gfx.webrender.compositor` is `mirror: once` (`StaticPrefList.yaml:8439-8446`), so it needs a fresh launch, which the harness does anyway. The control variant is optional. Skip it if effects-1 runs long.

Two one-off checks need a launch but no energy run. Do them once on stock Zen while scrolling the fixture page:

1. Set `gfx.core-animation.tint-opaque` to true (`StaticPrefList.yaml:7624`) and take a screenshot. Opaque layers show green and transparent ones red (`NativeLayerCA.mm:1829-1838`). The page should be green with a red frame.
2. Set `gfx.webrender.debug.dump-native-layer-tree-to-file` to true (`StaticPrefList.yaml:8677`) for a few frames. Dumps go to `~/Desktop/nativelayerdumps-<pid>/` (`NativeLayerCA.mm:287-300`). Delete them afterwards. They show whether the page tiles carry the rounded clip, which tests the compositor-clip claim in section 1.

After A or B is built, the same scroll, video-windowed, switch, sidebar and split scenarios measure it against stock Zen and min-visual. Expect WindowServer and Mac GPU within a few mW of min-visual in scroll and video, and the sidebar scenario no worse than stock.

## Why fix A cut no hole

### The background that should fill the region

The only opaque background behind the floating page is the `background` on `browser[type="content"]` when the `transparent` attribute is not set. The rule is `light-dark(rgb(255,255,255), rgb(32,32,32))` in `src/zen/common/styles/zen-browser-container.css:17-19`. With Origin's default prefs nothing makes it translucent, so it is opaque for a normal page. A tab with `transparent="true"` uses `--zen-transparent-browser-background` (alpha 0.1 to 0.6) and is not opaque, which is correct. Everything above the `browser` is transparent or paints no background in the page rect: `.browserSidebarContainer`, `#tabbrowser-tabpanels` (`background: transparent !important`, `zen-browser-ui.css:8-10`), `#browser` (`:27-29`), and `#zen-main-app-wrapper` (transparent on macOS, `zen-browser-ui.css:125`, `zen-theme.css:297-302`).

### Ancestors that wrap their children

I found no ancestor with opacity below 1, filter, backdrop-filter, mask, clip-path, mix-blend-mode, isolation, a transform or `will-change` between the `browser` and the root. The `isolation: isolate; contain: strict; will-change: background-color` rule in `zen-browser-ui.css:32-56` is on `.zen-browser-generic-background`, a sibling of the page and not an ancestor. The ancestors `#zen-tabbox-wrapper`, `#tabbrowser-tabbox` and `#zen-appcontent-wrapper` only set `position: relative` and `z-index` (`zen-tabs.css:9-12`, `content-area.css:156-160`, `zen-browser-ui.css:112-114,148-154`). A plain stacking context is flattened away by `FlattenedDisplayListIterator` and does not stop the region. `.browserSidebarContainer` uses `overflow: clip` plus a radius, which only adds a rounded item clip. `ApproximateIntersectInward` handles that. No XUL box adds a wrapping item here. The ancestor chain is not the blocker.

### What stops the region

The blocker is the `browser` element itself. For a remote browser, `nsSubDocumentFrame::BuildDisplayList` calls `WrapBackgroundColorInOwnLayer` (`engine/layout/generic/nsSubDocumentFrame.cpp:303-318`, called at `:341-348`). That moves the background-color item into an `nsDisplayOwnLayer` of type `OwnLayerForSubdoc`. `nsDisplayOwnLayer::ShouldFlattenAway` returns false (`engine/layout/painting/nsDisplayList.h:5539-5541`), so the item becomes a wrapping item. `AutoOpaqueRegionStateTracker` asks `AllowComputingOpaqueRegionAcross`, which accepts only `TYPE_TRANSFORM` (`WebRenderCommandBuilder.cpp:1944-1948`). It returns "no" for the own-layer item, sets `mComputingOpaqueRegion = false` for the wrapped list, and the background-color check at `:2072-2096` never runs for it. So the region never contains the page. This is from reading the code, not from a trace, so it is unverified at runtime. A display list dump would confirm it (`layout.display-list.dump` or `MOZ_LOG=nsDisplayList`, one launch).

The comment on that function says the wrapping exists so the compositor can skip a ColorLayer when remote content is opaque. That reason belongs to the old layers backend. WebRender does not use it.

### Options, smallest first

1. Let the tracker pass through the subdoc own-layer wrapper. Add a case in `AllowComputingOpaqueRegionAcross` for `TYPE_OWN_LAYER` with `GetOwnLayerType() == OwnLayerForSubdoc` (accessor name unverified) that returns offset `nsPoint(0, 0)`. About 6 lines in one file, one new Gecko patch. The wrapped list holds only the background-color item, and the wrapper has no transform, so the offset is zero. The wrapper's clip still applies through the `mOpaqueRegionWrappers` loop. Risk is low. The region only feeds `UpdateOpaqueRegion`, and GTK and Windows already receive it. The Windows `glass` code path and GTK's Wayland path would also see the page rect. Unverified, but both only read the region. Zen's look and animations do not change, and no CSS is touched.
2. Skip the wrapper for the parent process. In `WrapBackgroundColorInOwnLayer`, return early when the background is opaque. About 3 lines, but it changes how the compositor sees remote frame backgrounds, so risk is medium. Option 1 is better.
3. Add the page rect from the frame. In `nsSubDocumentFrame::BuildDisplayList` for a remote frame whose background color is opaque, call `aBuilder->AddWindowOpaqueRegion(this, contentBox)`. About 8 lines, and it ignores clips and ancestor transforms, so risk is medium. It would also add the rect when the frame is hidden behind other items.
4. Use `BrowserParent::mRect`. This does not work. `nsFrameLoader::UpdatePositionAndSize` fills it from `GetWindowDimensions`, which is the tree owner's whole-window position and size (`nsFrameLoader.cpp:2404-2425,2443`), not the page rect. `nsSubDocumentFrame` has the page size (`GetSubdocumentSize`) but the parent process keeps no page origin.
5. Chrome JS passes the rect. No existing `nsIDOMWindowUtils` or widget call sets a window opaque rect. This needs a new IDL method, a JS observer for sidebar, split and compact-mode layout changes, and a frame of lag. Largest and riskiest, and it duplicates what layout already computes. Drop it.

Next step: apply option 1, then rerun the test launch with `MOZ_LOG=nsCocoaWidgets:5` and look for the `UpdateOpaqueRegion hole` line.
