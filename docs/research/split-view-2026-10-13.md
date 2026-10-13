# What Zen's split view does while the divider is dragged

Question: what does Zen do on every pointer move during a divider drag, beyond what Firefox does, and what is the cheapest way to cut the chrome work. Read-only study of `src/zen/split-view/` and Firefox's split view in `engine/`. Nothing was built or measured for this note, so every cost claim is a guess unless marked otherwise.

Measured context (`energy-by-process-2026-10-13.md`, split rows): 10 drags of 250 px over 22 s. Zen's parent draws 204 mW against 115, WindowServer 156 against 70, and Zen's content processes 570 against 1576 mW. That note already warns the row may not be like-for-like. The pointer script sends events at 60 Hz by default (`scripts/perf/zo-ui.swift:101-107`, `glide`), so about 1300 moves per run, one per frame.

## 1. Zen's drag path

All in `src/zen/split-view/ZenViewSplitter.mjs`.

1. `createSplitter` (`:1738-1747`) makes a plain `div.zen-split-view-splitter` with a `mousedown` listener. It lives in an overlay (`zen-splitview-overlay.inc.xhtml`) and is positioned with a percent `style.inset` (`:1723-1725`).
2. `handleSplitterMouseDown` (`:1820`) sets `zen-split-resizing` on the tabpanels, copies the starting sizes, sets the cursor with `window.setCursor` (`:1880`) and adds a `mousemove` listener on `document` (`:1881`). `mouseup` removes it and the attribute (`:1883-1888`).
3. Every `mousemove` calls `dragFunc` (`:1841`), which wraps all its work in its own `requestAnimationFrame` (`:1842`). There is no "latest event wins" flag, so each event queues one callback.
4. Inside the callback: reset every child size, then `this.tabBrowserPanel.getBoundingClientRect()[dimension]` (`:1849`), then the redistribution loop (`:1853-1873`), then `applyGridLayout(splitNode)` (`:1876`).
5. `applyGridLayout` (`:1677-1729`) recurses through the whole split tree. For every leaf it writes `browserContainer.style.inset = "T% R% B% L%"` (`:1688`) and does a `closest()` lookup. For every inner node it writes each splitter's `style.inset` (`:1723-1725`). It ends with `maybeDisableOpeningTabOnSplitView()` (`:1729`, `:2461-2466`), which does a `getElementById` and a `toggleAttribute` on every call, and each recursive call repeats it.

What it does not do: no CSS variable writes, no grid template (the name is historical; panes are absolutely positioned with percent insets), no flex values, no per-event class toggles. Reads in the loop: one `getBoundingClientRect` per callback. That read comes after the previous callback's `style.inset` writes. If two callbacks run in the same frame, the second one forces a synchronous layout. At 60 Hz with one move per frame this rarely happens. With a real mouse at higher rates it could (unverified: whether Gecko coalesces `mousemove` to the refresh tick for chrome documents).

Writes are not skipped when unchanged. In a two-pane split, both panes get a new `style.inset` string each event, which is correct, since both change. In a three-pane split the untouched pane is rewritten with the same value (Gecko probably drops identical declarations cheaply, unverified).

## 2. CSS the panes carry during the drag

- Transitions are already off. `zen-split-view.css:71-77` only applies `transition: inset 0.09s` when `[zen-split-resizing]` is absent, and `ZenViewSplitter.mjs:1821` sets that attribute on mousedown. So there is no per-frame transition work.
- Small glitch: the last queued rAF can run after `mouseup` removed the attribute (`:1887`). That final `inset` write then animates for 90 ms. Cosmetic, one frame of extra work.
- Each pane has `box-shadow: var(--zen-big-shadow)` (`rgba(0,0,0,.24) 0 3px 8px`, `zen-theme.css:262`), `border-radius` and `overflow: clip` (`src/zen/common/styles/zen-browser-container.css:7-16`). The shadow rule is skipped only when `zen-no-padding` is on.
- Moving the pane's `inset` changes its layout box on every frame, so the shadow is re-rasterised and its damage rect covers the pane plus 8 px of blur on all sides, for both panes. The window is translucent (vibrancy), so WindowServer has to re-blend that area. That matches the WindowServer gap (156 against 70 mW) but is a guess (unverified).
- The active pane has a 2 px `outline` (`zen-split-view.css:79-81`). Firefox has one too, so this is no difference.
- No `backdrop-filter` or `filter` on the panes. `.zen-view-splitter-header` has a small `box-shadow` (`zen-split-view.css:129`), but it is `opacity: 0` until hover, so it is cheap while dragging, unless the pointer is over a pane header (unverified).
- The splitter div has no CSS of its own for the vertical case in this file (only `[orient="horizontal"]` at `:107-110`). The vertical rule is in a different file I did not open (unverified). It has no transition.
- `corner-shape: round` is the default value, so it adds nothing (unverified, from memory of the spec).

## 3. Firefox's split view

- The splitter is a real `<splitter>` XUL element, created in `engine/toolkit/content/widgets/tabbox.js:436-452` with `resizebefore="sibling"` and `resizeafter="none"`. Panes are flex children of the tabpanels (`engine/browser/themes/shared/tabbrowser/content-area.css:385-392`, `.split-view-panel { flex: 1; width: 49.4% }`).
- Dragging runs in C++: `nsSplitterFrameInner::MouseDrag` (`engine/layout/xul/nsSplitterFrame.cpp:409-483`) computes the new size from the pointer and calls `AdjustChildren` (`:1021-1038`). `SetPreferredSize` (`:1057-1083`) sets the `width` attribute and the inline `width: Npx` on the left pane. No JS runs per move, only a MutationObserver on the splitter's `state` attribute at drag start and end (`tabbox.js:303-322`).
- Flex layout then moves the right pane. Two DOM writes per move, one pane.
- Firefox puts a transition on that same width. `content-area.css:473-478`: `.split-view-panel[width] { flex: none; transition: width 50ms ease-out }` unless reduced motion is on. Every move restarts a 50 ms width transition, so the pane animates through intermediate widths and the content may reflow more often than the pointer moves (unverified, depends on whether the transition ticks between refreshes).
- Firefox's chrome is lighter: no shadow on the panes, a small radius with `overflow: clip` (`content-area.css:492-496`), a 1 px outline on the unselected pane. Nothing here forces a large translucent-window re-blend.

## 4. Why Firefox's content processes work harder

I cannot explain the 3x gap from the source alone. These are the candidates.

1. The 50 ms width transition in Firefox (`content-area.css:473-478`) causes extra intermediate resizes. Zen has no such transition during the drag. (unverified)
2. Both browsers resize the content viewport on every move, because Zen's panes also change size, not only position. So Zen does not scale or delay the page. Reflow cost per move should match. (unverified, no profile)
3. Zen applies the size one frame late, because it writes inside a rAF from a mousemove. If the content process is busy, Zen's resize messages may merge. (unverified)
4. The fixtures may load differently in the two split setups, for example a pane that is not live in Zen. The energy note flags this itself. Check `scripts/perf/make-fixtures` and the split steps before trusting the content gap.

For the proposals below this does not matter: they only touch the parent and compositor part, which is where Zen is worse.

## 5. Proposals, ranked by likely saving

Saving guesses are unverified. Measure each with the split scenario in `scripts/perf/` before claiming anything.

1. Drop the pane shadow while resizing. CSS only. Add in `zen-split-view.css`: `#tabbrowser-tabpanels[zen-split-resizing] .browserSidebarContainer[zen-split="true"] { box-shadow: none; }`. It needs enough specificity to beat `zen-browser-container.css:7-12` (the selector there has an `#id`, a `:root` and a `:not` chain, so a plain `!important` is the simple route). Likely the biggest saving on WindowServer and GPU, since it removes a blurred, translucent-window edge from every frame. Cost: the shadow disappears while dragging and comes back on release, a visible change. If that looks wrong, keep the shadow and test shortening it to `0 0 0 transparent` only on the axis being dragged. That is not worth the work unless the plain version shows a saving.
2. Coalesce moves to one update per frame and read the size once. JS only, about 15 lines in `handleSplitterMouseDown`. Store the latest event in a variable, queue a rAF only if none is pending, and read `getBoundingClientRect()[dimension]` once at mousedown instead of per callback. This removes the forced layout and any duplicate work with a fast mouse. Saving on the 60 Hz benchmark is small, since it already sends one move per frame. It matters for real mice at 125 to 1000 Hz, which the benchmark does not cover. Do it anyway: it is cheap and fixes a real hazard. Also flush the pending update on `mouseup`, so the last frame is not applied after the attribute is gone (fixes the 90 ms glitch in section 2).
3. Do less in `applyGridLayout` while dragging. JS only. Hoist `maybeDisableOpeningTabOnSplitView()` out of the recursion, so it runs once per drag start rather than per node per event. Skip rewriting `style.inset` for panes whose size did not change (compare against the last string). Small saving in a two-pane split, larger for three or four panes. Mark with `ponytail: string compare, per-pane dirty flag if profiles show style recalc`.
4. Hide the pane headers during a drag. CSS, one line: `[zen-split-resizing] .zen-view-splitter-header-container { opacity: 0; transition: none; }`. Only matters if the pointer rests on a pane header, which the benchmark probably does not do. Low value, near zero cost.
5. Set `will-change` on the panes, or `contain: layout paint` on each `.browserSidebarContainer[zen-split]` during the drag. CSS. Might isolate invalidation to the pane. Might also create extra surfaces and cost more. Try only if 1 to 3 leave a gap, and expect a mixed result.

Not recommended: freezing the page at its old size during the drag and resizing on release (a snapshot or `transform: scale`). That would cut content work but changes how the drag feels, and content is already the cheaper side in Zen.

## 6. Open questions

1. Are the content processes in the Zen run really resizing on every move? Look at a profile with `scripts/perf/run` stack features, or count `ResizeObserver` callbacks in a fixture page.
2. Is the Zen parent cost mostly restyle and reflow of the chrome, or paint of the shadows? A one-off profile with the shadow rule from proposal 1 applied answers both at once.
3. Does the rAF per `mousemove` actually fire more than once per frame in Gecko for a hardware mouse? A counter in `dragFunc` in a dev build would show it.
