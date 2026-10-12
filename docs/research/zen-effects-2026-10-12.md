# Zen visual effects, loops, animations and idle work (macOS, release 1.23.2b)

Source: /Users/mrm/Zen-Origin at tag 1.23.2b, read on 2026-10-12. Paths are relative to the repo root. `src/` is Zen's own code and patches. `engine/` is stock Firefox 157.0.1 with no Zen patches applied, so I used it only to check upstream behavior. I did not run, build or launch anything. "Unverified" marks a guess.

## How to read the switches

- "user.js" means a `user_pref()` line in the profile's user.js.
- "userChrome" means a rule in `<profile>/chrome/userChrome.css`. It needs `toolkit.legacyUserProfileCustomizations.stylesheets = true` and a restart. It reaches the browser window DOM only. It does not reach shadow DOM, about: pages or web content.
- Prefs that default to `@IS_TWILIGHT@` resolve to false in release. `tools/ffprefs/src/main.rs:321-330` reads `.surfer/dynamicConfig.brand.json` and returns true (twilight) when that file is missing. A local build from this checkout without that file would be twilight, so check `about:config` on the binary you measure.
- A fresh release profile has one workspace with the default theme: no gradient colors, texture 0 (`spaces/ZenSpaceManager.mjs:2730` calls `getTheme([])`, defaults in `spaces/ZenGradientGenerator.mjs:~1403`). Compact mode is off. Several effects below only exist once the user sets a gradient, grain or compact mode. Set those first, then switch each off.

## Master switch for motion

`ui.prefersReducedMotion = 1` in user.js. Zen has no reduce-motion code of its own beyond reading `gReduceMotion` and the media query. See section 7. It removes most JS-driven animations and some CSS ones. It does not touch the native window material, gradients, shadows, or many CSS transitions. Do not use it as a per-effect switch.

## 1. Effects on macOS in the default release configuration

### 1.1 Native window material (NSVisualEffectView)

- Built in `src/widget/cocoa/nsCocoaWindow-mm.patch`. `ZenWindowMaterialView : NSVisualEffectView` is at patch lines 18-77. `nsCocoaWindow::UpdateWindowMaterial` is at lines 96-120. It replaces the window's contentView with this view and re-parents the existing views into it.
- Settings the view uses: `blendingMode = BehindWindow` (line 56), `state` is `FollowsWindowActiveState` when `zen.view.grey-out-inactive-windows` is true and `Active` otherwise (lines 71-75), `material` from `zen.widget.macos.window-material` (lines 31-49, 1 hudWindow default).
- Prefs: `prefs/zen/macos.yaml:7-13` (`zen.widget.macos.window-vibrancy`, true, mirror always) and `:21-27` (`window-material`, 1). `prefs/zen/view.yaml` sets `zen.view.grey-out-inactive-windows` true (mirror always).
- Stock Firefox makes non-popup windows opaque (`engine/widget/cocoa/nsCocoaWindow.mm:5223`). Zen's chrome CSS makes `#main-window` and `#zen-main-app-wrapper` transparent on macOS (`src/zen/common/styles/zen-theme.css:306-311`), so what shows through is this material.
- Cost: the blur is done by WindowServer behind the window, not by Gecko. Gecko must composite the window with alpha. It is active whenever the window is on screen. In an inactive window the state is `FollowsWindowActiveState`, so the blur is flat (cheaper). Unverified how much each costs.
- On in release: yes.
- Off switch: user.js `user_pref("zen.widget.macos.window-vibrancy", false);`. It applies live. The pref callback registered at patch lines 91-93 calls `UpdateWindowMaterial` and swaps the view for a plain NSView. Side effect: Gecko still paints the translucent gradient layers, so the window background becomes the plain NSWindow background color (unverified which color). The look changes, only the blur cost goes away.
- Smaller knobs: `zen.widget.macos.window-material` 1 to 7 picks a different material (cost difference unverified). `zen.view.grey-out-inactive-windows = false` keeps the blur active in background windows, which costs more.
- Invalidation: nothing in this view invalidates it. The only callbacks are the two prefs for the material view (`zen.widget.macos.window-material`, `zen.view.grey-out-inactive-windows`, patch lines 26-29) and `window-vibrancy` for the window (lines 91, 152). No timers, no setNeedsDisplay, no per-frame code.
- Confidence that the pref removes the effect completely and nothing else: high for the native view. Medium for "nothing else", because the window background color changes.

### 1.2 See-through sidebar and window background

- This is the material from 1.1 plus the transparent gradient layers. The sidebar has no CSS blur in release.
- Layers: `#zen-browser-background` and `#zen-toolbar-background` both use class `zen-browser-generic-background` (`src/browser/base/content/browser-box-inc-xhtml.patch:12-14`, `navigator-toolbox-inc-xhtml.patch:23-26`). CSS is `src/zen/common/styles/zen-browser-ui.css:36-103`. Each has `::before` and `::after` filling the window. They cross-fade through `--zen-background-opacity`. They carry `isolation: isolate; contain: strict` (lines 44-45) and `will-change: background-color` (line 54).
- Default theme background: `rgba(0,0,0,0.4)` in dark mode, `transparent` in light mode (`spaces/ZenGradientGenerator.mjs:1346-1352`). `canBeTransparent` is always true on macOS (`:1253-1260`).
- `#zen-toolbar-background` is `display: none` unless compact mode floats the sidebar (`compact-mode/zen-compact-mode.css:6-10`, `sidebar.inc.css:~150`).
- Acrylic (CSS backdrop-filter blur) exists only behind `zen.theme.acrylic-sidebar` and `zen.theme.acrylic-urlbar`, both `@IS_TWILIGHT@` (`prefs/zen/theme.yaml:20-30`, mirror once). They are off in release. Rules: `compact-mode/sidebar.inc.css:278-282` and `common/styles/zen-omnibox.css:280-299`. Native side: `external-patches/firefox/backdrop_filter_reads_web_content.patch` (hunks in `gfx/webrender_bindings/WebRenderAPI.cpp` and `bindings.rs`) passes `cross_slice_backdrop_filters` to WebRender only if either pref is true at startup (patch hunk `gfx/webrender_bindings/WebRenderAPI.cpp`). So release builds do not take the cross-slice backdrop path.
- `zen-no-acrylic` is set on `:root` when WebRender is software or in safe mode (`common/modules/ZenUIManager.mjs:83-95`).
- Off switch for the translucency (opaque background, gradient also gone): userChrome
  `#zen-browser-background { --zen-main-browser-background: light-dark(#e9e9e9, #131313) !important; --zen-main-browser-background-old: light-dark(#e9e9e9, #131313) !important; }`
  `#zen-browser-background::before, #zen-browser-background::after { opacity: 1 !important; }`
  The custom properties are set inline by JS (`ZenGradientGenerator.mjs:~1755-1762`), and an `!important` author rule beats inline non-important styles. Confidence medium. The vibrancy view behind still exists, so pair with 1.1 to remove the blur cost.

### 1.3 Workspace gradients and the gradient generator

- JS: `spaces/ZenGradientGenerator.mjs` builds `linear-gradient`/`radial-gradient` strings (`getGradient`, `:1338-1397`) and sets them as inline custom properties on the two background elements. Applied in `updateCurrentWorkspace` (`:~1540-1830`).
- Static CSS gradients on the two pseudo-elements, plus `background-blend-mode: lighten` (`zen-browser-ui.css:61,74`). Cost is repaint of a full-window layer when the gradient or opacity changes. Nothing animates at rest.
- Workspace switch cross-fades by animating the custom property `--zen-background-opacity` on both elements with motion (`spaces/ZenSpaceManager.mjs:2245-2256`), duration `zen.workspaces.switch-animation-duration` (250 ms, `prefs/zen/workspaces.yaml`). This is a non-compositor property, so it repaints each frame (unverified whether Motion drives it through a rAF loop, likely).
- Trackpad swipe between workspaces sets the same property on every swipe event (`ZenSpaceManager.mjs:~2069-2100`).
- The generator panel (`spaces/zen-gradient-generator.css`, 457 lines) is only live while its panel is open. It has `mix-blend-mode: hard-light` at `:400` and animates dot `left`/`top` with motion (`ZenGradientGenerator.mjs:930`, `:1098`).
- On in release: only if the user picked a gradient. Default workspace has none.
- Off switch: user action, pick the default theme in the picker. CSS-only alternative: userChrome `#zen-browser-background::before, #zen-browser-background::after, #zen-toolbar-background::before, #zen-toolbar-background::after { display: none !important; }`. With the default theme in dark mode this also removes the `rgba(0,0,0,0.4)` tint, so the look shifts a little. Confidence high that it removes the gradient layers.

### 1.4 Grain texture

- `div.zen-browser-grain` inside both background elements. CSS at `zen-browser-ui.css:87-103`: a 220x220 PNG tiled (`src/zen/images/grain-bg.png`), `display: flex` only when the parent has `zen-show-grainy-background="true"`, opacity from `--zen-grainy-background-opacity`, `transition: opacity .2s`. Set by `ZenGradientGenerator.updateNoise` (`:1446-1458`).
- No mix-blend-mode on this element. The grain PNG also appears in the welcome screen with `mix-blend-mode: overlay` (`welcome/zen-welcome.css:219-221`) and in the generator panel (`spaces/zen-gradient-generator.css:398-400`).
- On in release: no on a fresh profile (texture 0). On after the user raises the texture slider.
- Off switch: userChrome `.zen-browser-grain { display: none !important; }`. Confidence high, it removes only the grain.

### 1.5 Floating rounded page

- `common/styles/zen-browser-container.css:6-17`, selector `#tabbrowser-tabbox #tabbrowser-tabpanels .browserSidebarContainer`. It sets `overflow: clip` (always), and unless `:root[zen-no-padding]` also `box-shadow: var(--zen-big-shadow)`, `corner-shape: round` and `border-radius: calc(var(--zen-native-inner-radius) / var(--zen-squircle-value))`.
- `--zen-big-shadow` is `rgba(0,0,0,.24) 0 3px 8px` (`common/styles/zen-theme.css:262`). It is small. The same variable is also used by the compact floating sidebar, the split view, glance, the download arc and `#sidebar-box`.
- `--zen-native-inner-radius` is `max(5px, (--zen-border-radius - separation/2) * 1.3)` (`zen-theme.css:279-286`). `--zen-border-radius` is 11px on macOS tahoe, 10px otherwise, set in `common/zenThemeModifier.js:105-133`. The pref `zen.theme.border-radius` can lower it, but the 5px floor stops it from reaching 0.
- Gap size is `zen.theme.content-element-separation` (8, max 12, `zenThemeModifier.js:152-197`). At 0 the gap becomes 0.1px and `zen-no-padding` is set, which removes the radius and shadow but also removes the gap, so layout changes and the comparison is not clean.
- Upstream issue #6302 describes WebRender failing to cache pictures behind a clipped rounded content view (recon notes, `docs/research/zen-recon-2026-10-12.md`). Unverified for 157.
- On in release: yes.
- Off switches, userChrome:
  - Shadow only: `#tabbrowser-tabpanels .browserSidebarContainer { box-shadow: none !important; }`
  - Radius only: `#tabbrowser-tabpanels .browserSidebarContainer { border-radius: 0 !important; }`
  - Both keep the 8px gap, which matters for a clean comparison.
- Confidence high for both rules. Glance and split view reuse the class, so check them if you test those.

### 1.6 Squircle corners everywhere

- `common/styles/zen-theme.css:358-363`: inside `@media (-moz-pref('layout.css.corner-shape.enabled'))`, `*:not(.no-squircles) { corner-shape: superellipse(var(--zen-squircle-value)) }`. The value is 1.3 on macOS. The pref is set true in `prefs/firefox/browser.yaml`. In stock Firefox it is false (`engine/modules/libpref/init/StaticPrefList.yaml:10962`).
- Cost: it is a universal selector, and a superellipse corner needs a shaped clip instead of a plain rounded rect (unverified cost in WebRender).
- Off switch: user.js `user_pref("layout.css.corner-shape.enabled", false);`. It removes the squircle shape everywhere and the page radius shrinks, because the page radius is divided by the squircle value. Confidence high that the shape goes away. It is a wider change than the page, so do not mix it with 1.5.

### 1.7 URL bar (floating) and command palette

- Behavior pref `zen.urlbar.behavior = floating-on-type` (`prefs/zen/zen-urlbar.yaml`). When the bar extends it gets `breakout-extend`.
- CSS at `common/styles/zen-omnibox.css:277-299`: `box-shadow: 0 30px 140px -15px rgba(0,0,0,.8/.6)` (line 289, the largest blur radius in Zen's chrome), `outline`, radius 15px. `backdrop-filter: none` at line 290. The acrylic branch at 295-299 is off in release.
- Search mode flash: `[breakout-extend][animate-searchmode="true"]::before` runs `zen-urlbar-searchmode` for 1s forwards (`zen-omnibox.css:315`, keyframes `common/styles/zen-animations.css:72-81`). It animates `box-shadow` up to 250px blur. It also runs a motion `scale: [1, .98, 1]` on `gURLBar` (`common/modules/ZenUIManager.mjs:470`).
- Firefox urlbar patch adds a 150ms `urlbar-grow` transform animation (`browser/themes/shared/urlbar-css.patch:~288-295`), only under `prefers-reduced-motion: no-preference`.
- Command palette and quick actions use the same urlbar view (`zen/urlbar/ZenUBGlobalActions.sys.mjs`), so they share these styles.
- On in release: yes.
- Off switches, userChrome:
  - Big shadow: `#urlbar[breakout-extend] .urlbar-background { box-shadow: none !important; }`
  - Search mode flash: `#urlbar[animate-searchmode]::before { animation: none !important; }`
  - Both the flash and the scale animation: user.js `ui.prefersReducedMotion = 1` (returns early at `ZenUIManager.mjs:463`). That also changes lots of other things.
- Confidence high for the two rules.

### 1.8 Compact mode: sidebar and toolbar reveal

- Off by default. The state lives in the `zen-compact-mode` attribute on `:root`. `ZenCompactMode.mjs:81-84` reads the hidden pref `zen.view.compact.enable-at-startup` in `preInit`. Toggle it from the sidebar button or the context menu.
- Floating sidebar: `compact-mode/sidebar.inc.css:~75-95` sets `translate` with `transition: translate .15s ease, visibility .15s`. While hovered, `:276` uses `translate var(--zen-compact-mode-time=.25s) var(--zen-compact-mode-func)` where the function is a 100-stop `linear()` spring (`:172-271`). `translate` can run on the compositor.
- Toolbar reveal (only with `zen.view.compact.hide-toolbar`, default false): `compact-mode/toolbar.inc.css:32` transitions `height` (layout), and `:41,48` opacity. `common/styles/zen-browser-container.css:~30-52` transitions `margin` on `.browserContainer` while `has-toolbar-hovered` (layout of the web view).
- Floating background: `.zen-toolbar-background` has `box-shadow: var(--zen-big-shadow)` (`zen-compact-mode.css:15`) and `background-attachment: fixed; background-size: 100vw 100vh` on its pseudo-elements (`:21-22`).
- Toggle animation: motion animates `marginRight`/`marginLeft` on the sidebar for 0.1s (`ZenCompactMode.mjs:478-492`, `:527-545`), gated by `zen.view.compact.animate-sidebar` (true, `:439`).
- Hover logic is JS plus the native mouse tracker (section 6).
- Off switches:
  - Toggle animation: user.js `zen.view.compact.animate-sidebar = false`. Confidence high.
  - Reveal transitions, userChrome: `:root[zen-compact-mode="true"] #navigator-toolbox, :root[zen-compact-mode="true"] #zen-appcontent-navbar-wrapper, :root[zen-compact-mode="true"] #zen-appcontent-navbar-wrapper * { transition: none !important; }`. Confidence medium. `sidebar.inc.css:153` and `toolbar.inc.css` also set transitions on `#titlebar` and children that this rule covers only if they are descendants of those ids.
  - Floating shadow: `:root[zen-compact-mode="true"] .zen-toolbar-background { box-shadow: none !important; }`.

### 1.9 Tab open, close and press animations

- Open: `animateItemOpen` and `_startItemOpenAnimation` in `common/modules/ZenUIManager.mjs:1119-1163`. Motion animates the tab with `opacity`, `transform: scale(.95)->1` and `marginBottom` (layout, 0.12s), and the label with `filter: blur(1px)->blur(0)` (0.1s). Called from `src/browser/components/tabbrowser/Tabbrowser-sys-mjs.patch:417`.
- Close: `animateItemClose` (`ZenUIManager.mjs:1179-1196`): `opacity`, `transform`, `marginBottom` for 0.1s. Called from the same patch at lines 783-784.
- Press: `vertical-tabs.css:341-346` transitions `scale .1s`, and `:366` applies `scale: .985` plus `rotate: .01deg` on `:active`.
- Rename: scale `[1, .98, 1]` (`ZenUIManager.mjs:1734`).
- Tab switching itself: I found no animation on the content area when the selected tab changes. Only the workspace switch (1.10) and split view animate.
- On in release: yes.
- Off switch: user.js `ui.prefersReducedMotion = 1` stops open and close (both check `gReduceMotion`, `ZenUIManager.mjs:1067`, `:1172`). Press scale, userChrome: `.tabbrowser-tab, .tabbrowser-tab .tab-content > image { transition: none !important; scale: none !important; }`. Confidence medium for the CSS rule (unverified that it does not disturb drag styles).

### 1.10 Workspace switch

- `spaces/ZenSpaceManager.mjs:2165-2400`. Motion animates `--zen-background-opacity` on both backgrounds (`:2245`), `transform` plus `paddingTop` on each visible `zen-workspace` (`:2290`, paddingTop is held constant but flagged as an animated layout property), and `transform` on essentials containers (`:2356`). Urlbar fade: `spaces/ZenSpaceCreation.mjs:111-146` (`opacity`). All use `kGlobalAnimationDuration = zen.workspaces.switch-animation-duration / 1000` (`:2176`). A `Promise.race` with a timer of duration + 50 ms guards stuck animations (`:2376`).
- Swipe: `ZenSpacesSwipe.mjs` plus native `spaces/nsZenSwipeOverrides.cpp` and `widget/SwipeTracker-cpp.patch`, per gesture event only.
- Space creation form animates `y`, `opacity`, `filter: blur(0)->blur(2px)` (`ZenSpaceCreation.mjs:376-392`) and `opacity` (`:432`).
- On in release: yes.
- Off switch: user.js `zen.workspaces.switch-animation-duration = 0`. Whether motion treats duration 0 as instant is unverified, so confirm by eye. Alternative: `ui.prefersReducedMotion = 1` makes the space creation paths skip, but `#animateTabs` itself has no `gReduceMotion` check that I found, so it may still animate (unverified).

### 1.11 Essentials

- Selected essentials tab: `vertical-tabs.css:1205-1255`, inside `@media -moz-pref("zen.theme.essentials-favicon-bg")` (default true, `prefs/zen/theme.yaml:17`). It draws a favicon blown up to `inset: -50%` with `filter: blur(20px)` (line 1210), plus a translucent `::before`.
- Grid: `vertical-tabs.css:1127-1141`, `grid-template-columns` auto-fit. Layout only.
- Slide on workspace switch when essentials are per container (`ZenSpaceManager.mjs:313-315`, `zen.workspaces.separate-essentials` true).
- Hover: `vertical-tabs.css:1200-1202`.
- Off switch: user.js `zen.theme.essentials-favicon-bg = false`. It removes the blur and also the custom selected background, because both are inside the same media block. Confidence high.

### 1.12 Split view

- JS: while dragging a tab over the page, `_animateDropEdge` animates `padding` on `gBrowser.tabbox` and `width`/`height`/`margin` on the fake browser, 0.1s (`split-view/ZenViewSplitter.mjs:507-515`, `:616-624`). Those are layout properties. `animateBrowserDrop` animates `scale` and `opacity` with a spring (`:2339-2352`).
- CSS: `zen-split-view.css:24,74` transition `inset` (0.08-0.09s, layout), `:76` opacity, `:144,169`.
- Triggers: `zen.splitView.enable-drag-over-split` after `zen.splitView.drag-over-split-delayMC` 500 ms, and tab drop.
- On in release: yes (the features are on). Active only during drags and split changes.
- Off switch: user.js `zen.splitView.enable-drag-over-split = false` removes the drag-over edge animation. The `inset` transitions, userChrome: `#tabbrowser-tabpanels[zen-split-view="true"] > * { transition: none !important; }`. Confidence medium.

### 1.13 Glance

- `glance/ZenGlanceManager.mjs`. Arc animation through `elementAnimate` with `x`, `y`, `scaleX`, `scaleY` converted to `transform` (`:146`, `:184`, `:719-748`, `:1252`), parent page `scale`+`opacity` through motion (`:625`, `:1200`), overlay buttons `opacity`+`x` (`:436`). All compositor friendly. Duration `zen.glance.animation-duration` 350 ms.
- CSS: `zen-glance.css:13` `will-change: transform, opacity` on the glance sidebar container, `:103,148` big shadow.
- On in release: yes, but only on Alt+click or similar.
- Off switch: user.js `zen.glance.enabled = false` removes the feature. Duration to zero: `zen.glance.animation-duration = 0` (unverified).

### 1.14 Toasts

- `ZenUIManager.showToast` (`:808-860`): motion `scale` spring in (0.5s), `opacity`+`scale` out (0.2s). Container `#zen-toast-container` CSS at `common/styles/zen-popup.css:307-345` with a `22px` blur shadow at `:344`.
- On in release: yes, short.
- Off switch: `ui.prefersReducedMotion = 1` does not reach these (no `gReduceMotion` check, unverified). No dedicated pref.

### 1.15 Download animation

- `downloads/ZenDownloadAnimation.mjs`. An arc sequence (`transform` and `opacity`, built at `:278-345`, run at `:253`) over `zen.downloads.download-animation-duration` 1000 ms, and a box that slides in with `left`/`right` (layout) plus `transform` and `opacity` (`:403-420`, `:466-485`). CSS `downloads/zen-download-arc-animation.css:26` has `box-shadow: var(--zen-big-shadow)`.
- Off switch: user.js `zen.downloads.download-animation = false` (checked at `ZenDownloadAnimation.mjs:40`). Confidence high.

### 1.16 Hover and button effects

- Mostly cheap color and opacity transitions: `vertical-tabs.css:141-247`, `zen-workspaces.css:68-95`. Workspace icons carry `filter: grayscale(1)` plus a 0.2s `filter` transition (`zen-workspaces.css:76-84`), so every non-active workspace icon is filtered while the strip is visible.
- `.zen-big-accent-button` has `will-change: transform` and a hover `scale` plus `brightness` (`common/styles/zen-buttons.css:104-122`), only in the welcome and space creation screens.
- Off switch for workspace icon grayscale, userChrome: `#zen-workspaces-button toolbarbutton { filter: none !important; }`. Confidence medium.

### 1.17 Media controls

- Card enter and exit: `zen-media-controls.css:158-180` uses `filter: blur(0)`, `@starting-style blur(4px)`, `[zen-hiding] blur(2px)`. Show and hide with motion `opacity`+`y` (`media/ZenMediaController.mjs:746`, `:786`).
- Music note sprite (loop 2 below) and title marquee (loop 1).
- A 1 s `setInterval` ticks the position text (section 4).
- Off switch: user.js `zen.mediacontrols.enabled = false` (`ZenMediaController.mjs:479`). Confidence medium: it stops card creation, I did not trace what else uses the controller.

### 1.18 Page loading bar

- `#zen-loading-progress-bar`, JS `common/sys/ui/ZenProgressBar.sys.mjs`, CSS `zen-single-components.css:745-800`. Pulse animation (loop 5) plus a long-load sweep that animates `left` (loop 6, layout) after 3 s.
- Off switch: user.js `zen.view.enable-loading-indicator = false`. CSS hides it with `display: none` (`zen-single-components.css:793`). Confidence high.

### 1.19 Library panel

- `library/ZenLibrary.mjs:518` runs a motion spring on a plain number with an `onUpdate` callback (stiffness 720). The setter at `:163-230` rewrites inline `transform` on the library, `#zen-appcontent-wrapper`, the toast container and `#navigator-toolbox` on every frame. This is per-frame JS, only while the panel opens, closes or is swiped.
- Library tabs use WAAPI in `library/ZenLibraryMediaPreview.mjs:~286-353` (opacity, transform, backgroundColor, boxShadow, borderRadius). Media section is off by default (`zen.library.media.enabled` false, `prefs/zen/library.yaml`).
- Off switch: user.js `zen.library.enabled = false` removes the feature.

### 1.20 Folders

- Expand and collapse use WAAPI `item.animate` in `folders/ZenFolders.mjs:1541-1600`, callers at `:1743`, `:1875-1880`, `:2019`, `:2205-2216`, `:2245`. Properties are `height`, `opacity`, `minHeight`, `marginBottom` (layout). Not the motion library. Static `filter: contrast(125%)` on folder icon SVGs (`folders/zen-folders.css:104`).
- Off switch: `ui.prefersReducedMotion = 1` (unverified that these call sites check it).

### 1.21 Others seen

- Startup watermark fade (`ZenStartup.mjs:129-150`, `zen.watermark.enabled` is `@cond` for official builds so it is on in release). Motion `opacity` 0.1s once.
- Update sweep (`common/modules/ZenUpdates.mjs:73-105`): `top`, `opacity`, `--background-top`. Only after an update. Skipped under reduced motion.
- Sidebar notifications (`common/modules/ZenSidebarNotification.mjs:70`, `:148`, `:161`): WAAPI `scaleX` progress bar, motion `opacity`+`y`.
- Create-new button icon rotation (`ZenUIManager.mjs:258`, `:267`).
- Folder drag and tab move (`drag-and-drop/ZenDragAndDrop.js:1333` `y` offsets, 100 ms). `src/browser/components/tabbrowser/content/drag-and-drop-js.patch:102` replaces `gReduceMotion` with `true || gReduceMotion` at one spot (unverified what path).
- Boosts: editor window effects and a WebGL dissolve loop (`boosts/ZenZapDissolve.sys.mjs:442`, rAF only while a zap runs). Content-process color hook `nsZenBoostsBackend::ResolveStyleColor` (`boosts/nsZenBoostsBackend.cpp:518`) is called through `gfx/layers/AnimationInfo-cpp.patch`, `layout/style/StyleColor-cpp.patch` and similar. It early-outs for transparent colors and in the parent process. It still runs for every resolved color in content (unverified cost). `zen.boosts.enabled` only gates actor loading (`common/sys/ZenActorsManager.sys.mjs:94`), not the C++ hook.
- Native popovers (`widget.macos.native-popovers = true`, `prefs/zen/macos.yaml:31`, patch `external-patches/firefox/native_macos_popovers_fix.patch`). Menus and panels use NSPopover. Off switch: user.js `widget.macos.native-popovers = false` (pref defined in `engine/modules/libpref/init/StaticPrefList.yaml:20680`). Confidence medium.
- Haptic feedback on drag snaps (`zen.haptic-feedback.enabled`, `toolkit/common/cocoa/ZenHapticFeedback.mm:21-30`). Not visual.
- First-run welcome screen: 14 motion calls in `welcome/ZenWelcome.mjs` (`:203`, `:256`, `:301`, `:324`, `:345`, `:376`, `:394`, `:589`, `:798-825`, opacity only in the lines I read) and a video background. Not seen after setup.

## 2. Looping animations

Count: nine `infinite` CSS animations in Zen's own code. That matches the nine you were told. No JS `iterations: Infinity`, no SVG SMIL and no animated GIF/APNG found. The list comes from `rg infinite src` after excluding tests (`src/zen/tests/boosts/browser_boosts_animation.js:26` is a test fixture) and unrelated JS (`Infinity` as a sentinel value). SVG assets: `src/zen/images/boost-indicator.svg` and `note-indicator.svg` are 90-frame sprite strips moved by CSS (loops 2 and 3). `src/browser/themes/shared/zen-icons/common/library/library.svg` has `@keyframes` but each runs once with `forwards`.

| # | File:line | What | Runs when | Properties |
|---|---|---|---|---|
| 1 | `src/zen/media/zen-media-controls.css:89` | `zen-back-and-forth-text` 10s ease-in-out, title marquee | Pointer over `#zen-media-controls-toolbar` and a title label has `[overflow]` | `transform`, `left` (layout) per `zen-animations.css:51-67` |
| 2 | `src/zen/media/zen-media-controls.css:420` | `zen-note-sprite` 3s `steps(90)` on `.zen-media-notes::before` | Declared whenever a media card exists, because `--zen-media-notes-animation` is set unconditionally at `:235`. Visible only for `.playing` cards (`:243-247`). Opacity 0 and `visibility: hidden` otherwise, so it may still tick invisibly (unverified). Also set at `tabs/zen-tabs/vertical-tabs.css:448` for glance tabs with sound | `transform` |
| 3 | `src/browser/themes/shared/zen-icons/icons.css:560` | `zen-boost-sprite` 3s `steps(90)` | `#zen-site-data-icon-button[boosting]`, set by `urlbar/ZenSiteDataPanel.sys.mjs:140` when the current site has a boost. Off under reduced motion (`:562`) | `transform` |
| 4 | `src/zen/common/styles/zen-single-components.css:698` | `zen-text-gradient` 5s on `#feature-callout #mainContentHeader` | Only while a Firefox feature callout shows | `background-position` |
| 5 | `src/zen/common/styles/zen-single-components.css:768` | `zen-progress-bar-pulse` 1s alternate on `#zen-loading-progress-bar` | While the selected tab is `busy`/`progress` (element created and removed by `ZenProgressBar.sys.mjs`), if `zen.view.enable-loading-indicator` | `transform`, `opacity` |
| 6 | `src/zen/common/styles/zen-single-components.css:785` | `zen-progress-bar-long-load` 1s on the bar's `::before` | After 3 s of loading (`WAIT_BEFORE_SHOWING_LONG_LOAD`, `ZenProgressBar.sys.mjs:7`) | `left` (layout), `opacity` |
| 7 | `src/zen/common/styles/zen-sidebar-notification.css:121` | `zen-text-gradient` 2s with `filter: saturate(3)` on a `[special]` link | A sidebar notification with `special` set (`ZenSidebarNotification.mjs:117`). Inside a shadow root, so userChrome cannot reach it | `background-position`, `filter` |
| 8 | `src/zen/library/zen-library.css:357` | `zen-library-media-wait` 1.8s skeleton pulse | Library media section loading. Section is off in release (`zen.library.media.enabled` false) | `opacity` |
| 9 | `src/zen/library/zen-library.css:787` | `zen-library-ring-spin` 1s on `.zen-library-row-progress-arc` | Library open on Downloads with a download that has no progress info (`ZenLibraryDownloadsSection.mjs:708`) | `transform` (rotation, per keyframes at `:790`) |

At idle with the library closed, no media, no boost and no page loading, none of the nine is visibly running. Loop 2 is the only one that may exist while invisible.

Switches, userChrome (library is light DOM, so 9 works; 7 does not):

- 1: `#zen-media-controls-toolbar .zen-media-info-vbox label[overflow] { animation: none !important; }`
- 2: `.zen-media-notes::before { animation: none !important; }`
- 3: `#zen-site-data-icon-button[boosting] .zen-site-data-boost-strip { animation: none !important; }`
- 5 and 6: user.js `zen.view.enable-loading-indicator = false` (preferred), or `#zen-loading-progress-bar, #zen-loading-progress-bar::before { animation: none !important; }`
- 8: nothing to do in release.
- 9: `.zen-library-row[indeterminate] .zen-library-row-progress-arc { animation: none !important; }`
- 4 and 7: no userChrome route. Rare, skip.

Turning a loop into a one-shot instead: replace `infinite` with `1` in the CSS and keep the rule. userChrome can set `animation-iteration-count: 1 !important;` on the same selectors.

Firefox's own looping chrome animations exist in `engine/` and can run inside a Zen window: tab throbber (`browser/themes/shared/tabbrowser/tabs.css:507`, hidden by `zen.theme.hide-tab-throbber` true, `vertical-tabs.css:1355-1362`), sharing icon pulse (`tabs.css:553`), indeterminate download bar (`downloads/progressmeter.css:79`), app menu update banner pulse (`customizableui/panelUI-shared.css:674`), sync spinner (`panelUI-shared.css:800`), tab group loading (`tabs.css:3486`, tab groups disabled in Zen). I did not count these.

## 3. motion.dev usage

- Library: `src/zen/vendor/motion.min.mjs`, version 13.2.0 (`vendor/motion.dep`). Loaded lazily on first use of `gZenUIManager.motion` by `loadSubScript` into the window (`common/modules/ZenUIManager.mjs:35-43`). The wrapper `elementAnimate` (`:106-158`) is plain WAAPI and does not use the library.
- Properties that are not `transform` or `opacity` are flagged with "LAYOUT/PAINT".

| File:line | Element | Properties | Trigger |
|---|---|---|---|
| `common/modules/ZenUIManager.mjs:258`, `:267` | create-new button `image` | `transform` rotate | popup show and hide |
| `ZenUIManager.mjs:470` | `#urlbar` | `scale` | search mode change while extended |
| `ZenUIManager.mjs:811` | toast | `opacity`, `scale` | toast timeout |
| `ZenUIManager.mjs:825` | toast | `scale` | reused toast |
| `ZenUIManager.mjs:849` | toast | `scale` spring | toast shown |
| `ZenUIManager.mjs:1119` | tab or group | `opacity`, `transform`, `marginBottom` LAYOUT | tab open |
| `ZenUIManager.mjs:1144` | tab label | `filter: blur` PAINT | tab open |
| `ZenUIManager.mjs:1179` | tab | `opacity`, `transform`, `marginBottom` LAYOUT | tab close |
| `ZenUIManager.mjs:1734` | tab | `scale` | tab rename finished |
| `spaces/ZenSpaceManager.mjs:2245` | both background elements | `--zen-background-opacity` PAINT (custom property) | workspace switch |
| `ZenSpaceManager.mjs:2290` | each `zen-workspace` | `transform`, `paddingTop` LAYOUT | workspace switch |
| `ZenSpaceManager.mjs:2356` | essentials container | `transform` | workspace switch |
| `spaces/ZenSpaceCreation.mjs:111`, `:132` | `#urlbar` | `opacity` | space switch dim and restore |
| `ZenSpaceCreation.mjs:376` | form elements | `y`, `opacity`, `filter: blur` PAINT | form closes |
| `ZenSpaceCreation.mjs:432` | revealed elements | `opacity` | form closes |
| `spaces/ZenGradientGenerator.mjs:930`, `:1098` | picker dots | `left`, `top` LAYOUT | picker updates, dot moves |
| `compact-mode/ZenCompactMode.mjs:478`, `:527` | `gNavToolbox` | `marginRight`, `marginLeft`, `transform` LAYOUT | compact mode toggled |
| `split-view/ZenViewSplitter.mjs:507`, `:511`, `:616`, `:620` | `gBrowser.tabbox`, fake browser | `padding`, `width`, `height`, `margin` LAYOUT | tab dragged over page and released |
| `ZenViewSplitter.mjs:2339` | browser container | `scale`, `opacity` | tab dropped into split |
| `glance/ZenGlanceManager.mjs:436` | overlay buttons | `opacity`, `x` | glance opens |
| `ZenGlanceManager.mjs:625`, `:1200` | parent browser container | `scale`, `opacity` | glance open and close |
| `ZenGlanceManager.mjs:1153` | sidebar buttons | `opacity` | glance close |
| `downloads/ZenDownloadAnimation.mjs:253` | arc element | `transform`, `opacity` | new download |
| `ZenDownloadAnimation.mjs:403`, `:416`, `:466`, `:477` | box | `left`/`right` LAYOUT, `transform`, `opacity` | download box in and out |
| `media/ZenMediaController.mjs:746`, `:786` | media bar | `opacity`, `y` | cards appear and vanish |
| `common/modules/ZenStartup.mjs:135` | main UI | `opacity` | startup watermark |
| `common/modules/ZenUpdates.mjs:85`, `:95` | update sweep | `top` LAYOUT, `opacity`, `--background-top` PAINT | after an update |
| `common/modules/ZenSidebarNotification.mjs:148`, `:161` | notification | `opacity`, `y` | notification in and out |
| `live-folders/ZenLiveFoldersManager.sys.mjs:321` | folder label | `backgroundPositionX` PAINT | first live folder promotion |
| `library/ZenLibrary.mjs:518` | number `openProgress` | JS `onUpdate` sets `transform` on four elements each frame | library open, close, swipe |
| `welcome/ZenWelcome.mjs:203, 256, 301, 324, 345, 376, 394, 589, 798, 812, 825` | welcome screen | `opacity` (others not read) | first run only |

Not motion but also worth knowing: WAAPI in `ZenFolders.mjs` (height), `ZenLibraryMediaPreview.mjs`, `ZenBoostsEditor.mjs:1480-1510` (`top`, `--background-top`), `ZenSidebarNotification.mjs:70`.

## 4. Timers and observers that can run at idle

"Idle" means a visible window, no input, no media, no load.

| File:line | What | Interval or trigger | Active at idle |
|---|---|---|---|
| `compact-mode/ZenCompactMode.mjs:239`, `common/modules/ZenHasPolyfill.mjs:57,76-87` | MutationObserver on `#zen-appcontent-navbar-wrapper`, `childList`, `subtree`, `attributes` filtered to `panelopen`, `open`, `breakout-extend`, `zen-floating-urlbar` | Fires on any subtree add or remove, runs `querySelector` | Connected always. No callbacks while the DOM is still |
| `ZenCompactMode.mjs:411` | Same polyfill on `gNavToolbox` | Compact mode only | No (compact off) |
| `spaces/ZenSpaceManager.mjs:100,377` | ResizeObserver on each essentials container, callback uses `requestAnimationFrame` | Fires on resize of those boxes | Connected, silent at idle |
| `ZenSpaceManager.mjs:160` | `window` `resize` listener | Fires on resize | Silent |
| `ZenSpaceManager.mjs:175,185` | observers `workspace-bookmarks-updated`, `contextual-identity-deleted` | Event | Silent |
| `common/zenThemeModifier.js:63`, `:35-60` | Pref observers (3 prefs) and capture listeners for fullscreen and compact events | Event | Silent |
| `ZenCompactMode.mjs:98,105,134,140` | Pref observer, `zen-mouse-tracker:exited`, `sizemodechange`, `deactivate` | Event | Silent |
| `ZenCompactMode.mjs:843-850` | `mouseover`, `dragover`, `mouseleave`, `dragleave` on sidebar, navbar wrapper and window buttons, plus `mouseleave` on `documentElement` | Each hover transition does `setTimeout(HOVER_HACK_DELAY=0)` then a `requestAnimationFrame` | Silent while the pointer is still |
| `spaces/ZenGradientGenerator.mjs:1846-1847` | `look-and-feel-changed` and accent pref observer, clears a cache | System appearance change | Silent |
| `common/modules/ZenUIManager.mjs:28-32` | `mousedown` capture on `document` | Each click | Silent |
| `spaces/ZenSpace.mjs:138` | `wheel` capture on each space scrollbox | Each wheel event (also workspace wheel switching) | Silent |
| `media/ZenMediaController.mjs:275-290` | `setInterval` 1000 ms to advance the position label and progress bar | Only while a card exists and `controller.isPlaying`. The tick clears itself when not playing | No (needs media playing) |
| `sessionstore/ZenSessionManager.sys.mjs:117`, `:623-647` | `DeferredTask` for backups plus `JSONFile.saveSoon` | Armed by session changes | Silent |
| Firefox `browser.sessionstore.interval` 40000 (`prefs/firefox/browser.yaml`) | Stock session store timer | 40 s, writes only when dirty (unverified details) | Wakes every 40 s |
| `live-folders/ZenLiveFolder.sys.mjs:40-71` | `DeferredTask` that re-arms itself per live folder; observer `wake_notification` (`ZenLiveFoldersManager.sys.mjs:94`) | Per folder interval (default set by folder type, unverified) | No live folders in a fresh profile |
| `mods/ZenMods.mjs:518` | `requestIdleCallback` then rAF for an update check | At startup, if the last check was over 20 days ago (`zen.mods.auto-update-days`) | No |
| `library/ZenLibrary.mjs:~784-824` | ResizeObserver, keydown, TabOpen | Only while the library is open | No |
| `library/ZenLibrary.mjs:~396-406` | `setTimeout` then `requestIdleCallback` cleanup | After closing the library | No |
| `window-drag/actors/ZenWindowDragChild.sys.mjs:~60-130` | `mousemove` listener in content | Added on a left mousedown in the top part of the page, removed on mouseup or dragstart | No |
| `ZenUIManager.mjs:437` | one-shot `mousemove` on `document` (removes `has-popup-menu`) | After a popup closes | No |
| `ZenCompactMode.mjs:891` | one-shot `mousemove` | After the pointer leaves the window through a tracked edge | No |
| `boosts/ZenZapDissolve.sys.mjs:442` | rAF draw loop | Only during a zap dissolve | No |
| `boosts/actors/ZenBoostsParent.sys.mjs:38`, `urlbar/ZenSiteDataPanel.sys.mjs:103` | observers | Event | Silent |
| Native, `compact-mode/ZenMouseTrackerCocoa.mm:33-46` | Global plus local `NSEvent` monitors for `mouseMoved` and drags | See section 6 | No unless the pointer left through the sidebar edge |

I found no `setInterval`, rAF loop or recurring `setTimeout` in Zen chrome that runs on a quiet window, other than the media tick (needs playback) and live folder tasks (need folders). All `setTimeout` calls I listed in `ZenSpaceManager`, `ZenUIManager`, `ZenGradientGenerator`, `ZenSpace`, `ZenStartup` and `zen-sets.js` are one-shot.

## 5. backdrop-filter, filter, mix-blend-mode, will-change in Zen chrome CSS

"Default" is the default release configuration on a fresh profile.

backdrop-filter

| File:line | Rule | Applies by default |
|---|---|---|
| `compact-mode/sidebar.inc.css:281` | `blur(42px) saturate(110%) brightness(.5) contrast(100%)` on compact floating sidebar | No (`zen.theme.acrylic-sidebar` false) |
| `common/styles/zen-omnibox.css:290` | `backdrop-filter: none` reset on `#urlbar[breakout-extend] .urlbar-background` | Yes, harmless |
| `zen-omnibox.css:297` | `var(--zen-backdrop-underlay) blur(40px)` (SVG filter from `zen-backdrop-filters.svg`) | No (`zen.theme.acrylic-urlbar` false) |
| `common/styles/zen-single-components.css:733` | `blur(10px)` on `.notificationbox-stack[notificationside=top] notification-message` | Yes, when a top notification shows |
| `boosts/zen-boosts.css:675` | `saturate(2) blur(15px)` on a color picker thumb | Boost editor window only |
| `browser/themes/shared/preferences/zen-preferences.css:268` | `blur(15px)` on `#zen-theme-builder-color-picker-deck` | Only if that preferences UI is shown (unverified) |

filter

| File:line | Rule | Applies by default |
|---|---|---|
| `tabs/zen-tabs/vertical-tabs.css:1210` | `blur(20px)` on selected essentials favicon | Yes, pref `zen.theme.essentials-favicon-bg` |
| `spaces/zen-workspaces.css:76,92,112` | `grayscale(1)` on workspace icon buttons, transitions `filter .2s` | Yes |
| `spaces/overflow-icons.inc.css:20` | `saturate(140%) brightness(110%)` on a 4px dot | Only with `icons-overflow` |
| `folders/zen-folders.css:104` | `contrast(125%)` on folder icon SVG | Yes if folders exist |
| `media/zen-media-controls.css:158,168,180` | `blur(0)`, `blur(4px)`, `blur(2px)` on `.zen-media-card` | Yes when a card shows |
| `common/styles/zen-sidebar-notification.css:117` | `saturate(3)` | Only for `[special]` links (loop 7) |
| `common/styles/zen-buttons.css:109,122` | `brightness(1.1)` hover on `.zen-big-accent-button` | Welcome and space creation only |
| `browser/themes/shared/zen-icons/icons.css:322,361` | `grayscale(1)` on chrome identity icons | Chrome pages only |
| `glance/zen-glance.css:91` | `filter: none` | Reset |
| `boosts/zen-selector.css:81`, `zen-zap.css:105,108`, `zen-boosts.css:345,375,578,654,658` | brightness, grayscale, invert | Boost UI only |
| `welcome/zen-welcome.css:73,290` | `brightness(1.1)`, `blur(30px) saturate(1.8)` | First run only |
| JS: `ZenUIManager.mjs:1144`, `ZenSpaceCreation.mjs:380` | animated `filter: blur` | Tab open, space form close |

mix-blend-mode and background-blend-mode

| File:line | Rule | Applies by default |
|---|---|---|
| `boosts/zen-boosts.css:824` | `multiply` on `#import-animation-shadow` | Boost import only |
| `welcome/zen-welcome.css:221` | `overlay` | First run only |
| `spaces/zen-gradient-generator.css:400` | `hard-light` on texture wrapper `::before` | Picker panel open only |
| `common/styles/zen-browser-ui.css:61,74` | `background-blend-mode: lighten` on both background pseudo-elements | Yes, always |
| `library/zen-library.css:1033` | `background-blend-mode: screen` | Library open |

will-change

| File:line | Property | Applies by default |
|---|---|---|
| `common/styles/zen-browser-ui.css:54` | `background-color` on background `::before` and `::after` | Yes, on `#zen-browser-background`. `#zen-toolbar-background` is `display: none` until compact mode |
| `glance/zen-glance.css:13` | `transform, opacity` | Glance only |
| `common/styles/zen-single-components.css:501`, `:605` | `transform` on site data panel pseudo-elements | When the panel exists |
| `common/styles/zen-buttons.css:104` | `transform` | `.zen-big-accent-button` |
| `common/styles/zen-library-widget.css:164` | `transform` | Downloading badge |
| `boosts/zen-selector.css:221` | `left, top, width, height` | Boost selector |
| `welcome/zen-welcome.css:30,68,102,183,326,435` | `opacity` or `transform` | First run |

Large box-shadows, for completeness: `zen-omnibox.css:289` (`0 30px 140px -15px`), `zen-animations.css:74-79` (animated to `0 0 250px`), `library/zen-library.css:394`, `common/styles/zen-library-media-preview.css:28` (`0 24px 60px`), `welcome/zen-welcome.css:393`, `boosts/zen-selector.css:46,143-190` (20px). The floating page, sidebar, glance, split view and download arc use the small `--zen-big-shadow`.

## 6. Native code

### Window material
See 1.1. Setup is one wrapper view, three pref callbacks, no per-frame or per-event code. Nothing invalidates it besides pref changes.

### Compact mode pointer tracker
- Files: `src/zen/compact-mode/ZenMouseTracker.cpp` (246 lines), `ZenMouseTrackerCocoa.mm` (65), `nsIZenMouseTracker.idl`.
- Mechanism: event monitors, no polling. `ZenNativeMouseMonitor::Start` (`ZenMouseTrackerCocoa.mm:30-52`) adds a local and a global `NSEvent` monitor for `MouseMoved` and the three `*MouseDragged` masks. The global monitor sees moves delivered to other apps. The local one sees moves AppKit routes to Zen. Each handler calls `ReportPointerPosition` (`:22-27`), which reads `[NSEvent mouseLocation]` and calls `OnNativePointerMove` (`ZenMouseTracker.cpp:~145-166`).
- Rate: one callback per OS mouse-moved event, so up to the pointer event rate (tens to a few hundred per second) while the pointer moves, zero while it is still. The code stores the latest x and y in atomics and dispatches at most one main-thread runnable at a time (`sPendingEvaluation`), so the main thread does at most one `Evaluate` per event-loop turn.
- `Evaluate` (`:168-196`) walks the tracked windows, converts the point and compares it to the widget bounds plus the allowed offset. When the pointer leaves the allowed zone it posts `zen-mouse-tracker:exited`, which collapses the revealed element. It stops the monitors when the last window unregisters (`OnTrackedListChanged`, `:132-137`).
- Offsets come from `zen.view.compact.outside-window-edge-offset.horizontal` (200) and `.vertical` (100) (`prefs/zen/compact-mode.yaml`). The JS defaults of 250 and 150 at `ZenCompactMode.mjs:36-51` are only fallbacks.
- When it is active: JS calls `registerWindow` from `_trackMouseOutsideWindow` (`ZenCompactMode.mjs:937-950`) when the `mouseleave` handler on `documentElement` (`:850-905`) sees the pointer cross a window edge within 7 px of a hoverable element on that edge. I found no check for compact mode being on in that path, so in a normal non-compact window, leaving through the left edge at sidebar height probably starts tracking too (unverified). It stops on return into the window, on `deactivate`, on `sizemodechange`, on exiting the offset zone, or on window close.
- Off switches: none by pref. Setting `zen.view.compact.outside-window-edge-offset.horizontal = 0` and `.vertical = 0` makes `IsPointerWithinBounds` (`ZenMouseTracker.cpp:~199-231`) return false on the first move outside the window, so the monitors stop after one event. Confidence medium.
- Windows has a separate backend (`ZenMouseTrackerWin.cpp`). Linux returns `NS_ERROR_NOT_AVAILABLE` and JS falls back to a timeout (`ZenCompactMode.mjs:~944-946`).

### Other Zen native code
- `src/zen/drag-and-drop/nsZenDragAndDrop.cpp` and `nsZenDropLandingCocoa.mm`. `zen::PrepareDropLanding` runs in `draggingUpdated:` (`nsCocoaWindow-mm.patch` hunk at line ~3858) so it runs per drag update, and `LandDrop` once on drop. Only during a drag.
- `src/zen/window-drag/nsZenWindowDragUtils.cpp`, `drag-and-drop/nsZenNativeWindowMove.mm`: native window move during the drag-window-from-content gesture. Only during that gesture.
- `src/zen/spaces/nsZenSwipeOverrides.cpp` and `src/widget/SwipeTracker-cpp.patch`: custom swipe thresholds, only during trackpad swipe gestures. The macOS override `zen.widget.macos.override-system-swipe-gestures` (true) is read in `widget/cocoa/nsCocoaUtils-mm.patch` per scroll-wheel event via `Preferences::GetBool` (a hash lookup, small).
- `src/zen/boosts/nsZenBoostsBackend.cpp` color hook (see 1.21).
- `src/gfx/layers/AnimationInfo-cpp.patch`: routes animated `background-color` through the boost hook.
- No `NSTimer`, `CVDisplayLink` or similar in Zen's native code (`rg` over `src/zen`, `src/widget`).

## 7. Reduce Motion and Reduce Transparency

### Reduce Motion
- Source of truth: the CSS media query `prefers-reduced-motion`, which Gecko reads from `NSWorkspace.accessibilityDisplayShouldReduceMotion` (`engine/widget/cocoa/nsLookAndFeel.mm:495-499`). The `ui.prefersReducedMotion` int pref overrides it (`engine/widget/nsXPLookAndFeel.cpp:146`).
- `gReduceMotion` is Firefox's global (`engine/browser/base/content/browser.js:691-702`). It starts as true and an idle task replaces it with the media query result and a change listener (`engine/browser/base/content/browser-init.js:980-990`). Zen declares it in `src/zen/zen.globals.mjs:70,71,305`.
- Zen JS that checks `gReduceMotion` (20 places): `ZenUIManager.mjs:463,1067,1172`, `spaces/ZenSpaceCreation.mjs:122,143,375,427`, `glance/ZenGlanceManager.mjs:1796,1964`, `common/modules/ZenUpdates.mjs:79`, `common/sys/ui/ZenProgressBar.sys.mjs:99`, `drag-and-drop/ZenDragAndDrop.js:1184,1307`, `library/ZenLibraryDragAndDrop.mjs:204`, `library/sections/ZenLibrarySpacesSection.mjs:466`, `boosts/ZenZapOverlayChild.sys.mjs:183`, `boosts/ZenBoostsEditor.mjs:1469`, and `Tabbrowser-sys-mjs.patch:783-784`.
- CSS that honors it: `media/zen-media-controls.css:405` (hides note sprite), `icons.css:536,562` (boost strip), `split-view/zen-split-group.inc.css:11,146`, `folders/zen-folders.css:37`, `tabs/zen-tabs/vertical-tabs.css:141,341`, `spaces/zen-workspaces.css:343`, `library/zen-library.css:206`, `common/styles/zen-library-widget.css:44`, `common/styles/zen-panels/dialog.css:13,18`, `urlbar-css.patch:292`.
- Not covered: workspace switch `#animateTabs` (no check found), toasts, glance open (only `:1796`, `:1964`), compact mode motion calls, download animation, the sprite animation at `zen-media-controls.css:420` is hidden by a `display: none` rule but the loop still has no media query of its own, window background, gradients, shadows, `transition` rules in `zen-omnibox.css`, `sidebar.inc.css`, `toolbar.inc.css`.

### Reduce Transparency
- Media query `prefers-reduced-transparency` is used in only two places, both inside the acrylic rules, which are off in release: `compact-mode/sidebar.inc.css:278` and `common/styles/zen-omnibox.css:280,295`. The upstream gate pref `layout.css.prefers-reduced-transparency.enabled` (false) is not read by the style system in this tree (`rg` found only its definition in `StaticPrefList.yaml:11161`), so the query evaluates from `NSWorkspace.accessibilityDisplayShouldReduceTransparency` (`engine/widget/cocoa/nsLookAndFeel.mm:501-504`) or the override `ui.prefersReducedTransparency` (`nsXPLookAndFeel.cpp:147`).
- `zen-no-acrylic="true"` on `:root`: set by `_markAcrylicSupport` (`ZenUIManager.mjs:83-95`) for software WebRender or safe mode. CSS that reads it: `sidebar.inc.css:279`, `zen-omnibox.css:281,296`.
- Nothing checks reduce transparency for the native window material, the gradient alpha, `--zen-background-opacity`, or `#zen-main-app-wrapper`. macOS itself flattens an `NSVisualEffectView` when the system setting is on (OS behavior, unverified). Forcing `ui.prefersReducedTransparency = 1` in user.js changes nothing visible in release because the only consumers are off.

## What I could not settle

- Whether `visibility: hidden; opacity: 0` stops loop 2 from ticking (needs a profile).
- Whether `zen.workspaces.switch-animation-duration = 0` skips the animation cleanly, and whether `#animateTabs` honors reduced motion (no check found).
- The real cost of squircle clips, `will-change: background-color` on the two background layers, and the NSVisualEffectView. Those need Instruments or a Gecko profile, not source reading.
- Whether the macOS window background after `window-vibrancy = false` is acceptable to measure against (look is unverified).
- Live folder default interval and any other live-folder cost, because I read only the scheduler.
