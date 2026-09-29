// jui-graph-ts public entry point.
// Populated incrementally as PORT_STATUS.md's phases complete.
//
// Exported as namespaces (`export * as X`), not a flat `export *`, because several original
// source files independently define same-named symbols (e.g. `linear()`/`LinearScale` exist in
// BOTH `util/scale.ts` and `util/scale/linear.ts` - two real, separately-registered modules in the
// original engine with logically-identical but distinct implementations - see `util/scale.ts`'s
// header comment). Namespacing avoids export collisions now and keeps the convention consistent
// as later phases (base/grid/polygon/brush/widget) add their own same-named `core`/`domain`/etc.
// symbols.

export * as mathUtil from './util/math'
export * as colorUtil from './util/color'
export * as scaleUtil from './util/scale'
export * as linearScaleUtil from './util/scale/linear'
export * as ordinalScaleUtil from './util/scale/ordinal'
export * as logScaleUtil from './util/scale/log'
export * as timeScaleUtil from './util/scale/time'
export * as circleScaleUtil from './util/scale/circle'
export * as domUtil from './util/dom'
export * as timeUtil from './util/time'
export * as transformUtil from './util/transform'
export * as svgElementUtil from './util/svg/element'
export * as svgTransformElementUtil from './util/svg/element.transform'
export * as svgPathElementUtil from './util/svg/element.path'
export * as svgPathRectElementUtil from './util/svg/element.path.rect'
export * as svgPathSymbolElementUtil from './util/svg/element.path.symbol'
export * as svgPolyElementUtil from './util/svg/element.poly'
export * as svgBaseUtil from './util/svg/base'
export * as svgBase3dUtil from './util/svg/base3d'
export * as svgUtil from './util/svg'
export * as canvasBaseUtil from './util/canvas/base'
export * as canvasHidpiUtil from './util/canvas/hidpi'

// Phase B - base engine layer (`base/`). These are real `extend`-chain classes (Phase 0 rule 2),
// exported directly (not namespaced) since there's no same-name collision risk the way Phase A's
// util namespaces had.
export { Vector } from './base/vector'
export { Draw } from './base/draw'
export { Core } from './base/core'
export type { CoreEvent, CoreOptions } from './base/core'
export {
  Builder,
  registerAxis,
  registerBrush,
  registerWidget,
  registerTheme,
  registerIcon,
} from './base/builder'
export type { AxisLike, AxisConstructor, DrawLike, DrawConstructor, BuilderOptions } from './base/builder'
export { Plane } from './base/plane'
export type { PlaneOptions } from './base/plane'

// Phase B - base engine layer.
export { Axis, getRate } from './base/axis'
export type {
  AxisChart,
  AxisOptions,
  AxisPadding,
  AreaBox,
  AreaInput,
  GridConstructor,
  GridInstance,
  GridRenderedScale,
  MapConstructor,
  MapInstance,
} from './base/axis'

// `base/animation.js` ("chart.animation", extend: "core") - the RAF-polling real-time chart
// wrapper. No `collection`/`manager` exports alongside it: both were evaluated and found to be
// pure global-registry artifacts with nothing worth porting - see PORT_STATUS.md's Phase B entries
// for `base/collection.js`/`base/manager.js` for the full evidence-backed judgment call.
export { Animation } from './base/animation'
export type { AnimationOptions } from './base/animation'

// `base/map.js` ("chart.map", extend: null) - the map-chart base engine (path/polygon loading +
// theme styling + pan/zoom state). Note: does NOT implement `AxisChart.mapType`'s
// `MapConstructor`/`MapInstance` contract (no `render()` - see `map.ts`'s header comment for the
// preserved upstream defect this reproduces), so it is exported standalone, not wired into
// `Axis`/`Builder` anywhere yet.
export { Map } from './base/map'
export type { MapPathDatum, MapOptions, MapChart, MapScale, MapScaleResult } from './base/map'

// Phase C - grid layer (`grid/`). `CoreGrid` ("chart.grid.core") is the real base every concrete
// `grid/*.ts` class extends (confirmed via `extend:` field, NOT `base/core.ts`'s `Core` - see
// `grid/core.ts`'s header comment) - genuinely abstract on its own (never assigns `this.draw`, nor
// the `top`/`bottom`/`left`/`right`/`center`/`custom` orient methods `drawGrid()` looks up), so it
// is exported for concrete Phase C subclasses (unstarted) to extend, not for direct use.
export {
  CoreGrid,
  registerGridDraw2D,
  registerGridDraw3D,
} from './grid/core'
export type { GridChart, GridDrawMixinApplier } from './grid/core'

// `grid/date.ts` ("chart.grid.date", extend: "chart.grid.core") - the time-axis grid. Exported
// cleanly (class + config type) since the future `grid/dateblock.ts` extends this class directly.
export { DateGrid } from './grid/date'
export type { DateGridConfig } from './grid/date'

// `grid/dateblock.ts` ("chart.grid.dateblock", extend: "chart.grid.date") - extends `DateGrid`
// directly (NOT `CoreGrid` - confirmed via `extend:` field), overriding `wrapper`/`initDomain`/
// `drawBefore`/`draw` to reposition ticks by INDEX * a derived pixel `unit` instead of by their
// real time-domain value (see `dateblock.ts`'s header comment for the full divergence-from-
// `DateGrid` breakdown, including two previously-undocumented bugs distinct from `DateGrid`'s own
// already-documented ones).
export { DateBlockGrid } from './grid/dateblock'
export type { DateBlockGridConfig } from './grid/dateblock'

// `grid/log.ts` ("chart.grid.log", extend: "chart.grid.range") - extends `RangeGrid` directly (NOT
// `CoreGrid` - confirmed via `extend:` field), overriding `drawBefore`/`draw` to use a `log()`
// scale (`util/scale/log.ts`, Phase A) instead of `linear()`. See `log.ts`'s header comment for
// preserved quirks: forces `grid.unit = false` before `initDomain()` runs (silently discarding any
// configured numeric/function unit), never clamps, and reads `grid.step` directly rather than the
// inherited `initDomain()`'s own computed `domain.step`.
export { LogGrid } from './grid/log'
export type { LogGridOptions } from './grid/log'

// `grid/radar.ts` ("chart.grid.radar", extend: "chart.grid.core") - the radar/polar chart grid.
export { RadarGrid } from './grid/radar'
export type { RadarGridConfig } from './grid/radar'

// `grid/grid3d.ts` ("chart.grid.grid3d", extend: "chart.grid.core") - the z-axis 3D depth-line
// grid.
export { Grid3D } from './grid/grid3d'
export type { Grid3DConfig, Grid3DScale } from './grid/grid3d'

// `grid/block.js`/`grid/range.js`/`grid/fullblock.js` ("chart.grid.block"/"chart.grid.range"/
// "chart.grid.fullblock") - all three `extend: "chart.grid.core"` directly (confirmed via `extend:`
// field, NOT a `BlockGrid`/`FullBlockGrid` inheritance chain - see `grid/fullblock.ts`'s header
// comment). `BlockGrid`/`RangeGrid` are the ordinal/linear axis renderers `base/axis.ts`'s
// `AxisChart.gridTypes` is meant to be populated with (e.g. `{ block: BlockGrid, range: RangeGrid,
// fullblock: FullBlockGrid }`); `FullBlockGrid` is `BlockGrid`'s full-band-width sibling variant.
export { BlockGrid } from './grid/block'
export type { BlockGridOptions } from './grid/block'
export { RangeGrid } from './grid/range'
export type { RangeGridOptions } from './grid/range'
export { FullBlockGrid } from './grid/fullblock'
export type { FullBlockGridOptions } from './grid/fullblock'

// `grid/panel.js`/`grid/overlap.js`/`grid/table.js` ("chart.grid.panel"/"chart.grid.overlap"/
// "chart.grid.table") - all three `extend: "chart.grid.core"` directly, needing "nothing extra"
// beyond `CoreGrid` itself (no additional Phase A utility dependency). `PanelGrid` is the "c"/
// custom-axis default grid (`base/axis.ts`'s `drawGridType()` defaults `axis.c.type` to `"panel"`)
// - a single, always-hidden full-plot-area rect. `OverlapGrid`/`TableGrid` both have a genuine,
// previously-undocumented preserved bug where their computed geometry/rects are never actually
// attached to the rendered tree (see each file's own header/method doc comments for the full
// evidence trail) - `TableGrid`'s original constructor also has a 3-parameter signature
// (`TableGrid(chart, axis, grid)`), investigated and confirmed vestigial/dead (never referenced in
// the constructor body - see `table.ts`'s header comment) - ported with the same 0-arg constructor
// every other `CoreGrid` subclass uses, re-verified via its own `tableGridConstructorTypeCheck`.
export { PanelGrid } from './grid/panel'
export { OverlapGrid } from './grid/overlap'
export { TableGrid } from './grid/table'

// `grid/rule.ts` ("chart.grid.rule", extend: "chart.grid.core") - extends `CoreGrid` directly.
// Investigated precisely for a possible Phase D (`polygon/`) dependency (a concurrent agent's
// report had flagged this as a maybe) and confirmed to have NONE - `rule.js` never references
// `polygon/*.js` anywhere; the false trail was `this.axisLine(...)`, which merely resembles
// `grid/draw3d.js`'s own differently-named/differently-shaped `drawAxisLine` mixin method. The
// original engine had THREE independent Tier A crashes here (`axisLine` never defined anywhere; a
// bare, never-declared `grid` identifier reference in `initDomain()`'s default-reached branch;
// three bare, never-declared `chart`/`orient`/`grid` identifiers in `draw()`) plus a Tier A `NaN`
// bug (a multi-element array domain value coerced via `Math.max`/`Math.min` with no `.apply`) that
// together meant a real `RuleGrid` could never successfully render through any orient - all four
// have since been FIXED (a real, previously unreachable-by-crash grid type, now also registered in
// `jui-chart-vue`'s `GRID_TYPES` under `"rule"`) - see `rule.ts`'s header comment for the full,
// Node-verified bug trail and each fix's own red→green test.
export { RuleGrid } from './grid/rule'
export type { RuleGridOptions } from './grid/rule'

// `grid/draw2d.js` ("chart.grid.draw2d", extend: "chart.draw") - a SIBLING to `grid/core.ts`
// (both `extend: "chart.draw"`), NOT a `CoreGrid` subclass. The real 2D-drawing-method mixin
// `grid/core.ts`'s `registerGridDraw2D()` hook was built to receive - `createGridX`/`createGridY`/
// `fillRectObject`/`drawAxisLine`/`drawPattern`/`drawBaseLine`/`drawValueLine`/`drawValueText`/
// `drawImage`. Importing this module has the side effect of calling
// `registerGridDraw2D(applyDraw2DGridMixin)` at module-load time (see `draw2d.ts`'s header comment
// for why self-registration on import is the right translation here, unlike the genuinely
// pluggable `registerAxis`/`registerBrush`/`registerWidget` hooks) - so importing `jui-graph-ts`'s
// public entry point is now enough to make any 2D-rendering `CoreGrid` subclass instance (e.g.
// `PanelGrid`/`OverlapGrid`/`TableGrid` above, or `BlockGrid`/`RangeGrid`/`FullBlockGrid`) actually
// drawable via `.render()`, closing the loop `grid/core.ts` left open.
export { applyDraw2DGridMixin } from './grid/draw2d'

// Phase D - polygon layer (`polygon/`). `PolygonCore` ("chart.polygon.core", extend: null) is the
// real 3D rotation + perspective-projection engine every `polygon/*.ts` primitive (`point.ts`/
// `line.ts`/`cube.ts`/`grid.ts`, unstarted) is built on top of via `extends PolygonCore` - exported
// here for those future subclasses, not for direct standalone use (its `vertices`/`vectors` fields
// are populated by a subclass, not this class itself - see `core.ts`'s header comment).
export { PolygonCore } from './polygon/core'
export type { PolygonVertex, Degree3, Point3 } from './polygon/core'

// `polygon/point.ts` ("chart.polygon.point", extend: "chart.polygon.core") - single-vertex
// primitive, shared by `dot3d.js` (single point) AND `line3d.js` (4 separate `PointPolygon` calls
// per ribbon-quad segment - it does NOT use `LinePolygon` despite its name, see `line.ts`'s header
// comment).
export { PointPolygon } from './polygon/point'

// `polygon/line.ts` ("chart.polygon.line", extend: "chart.polygon.core") - two-vertex primitive.
// No jui-chart-vue reference exists (jui-chart-vue never wraps 3D grid-mesh rendering), but IS real
// live code in the original engine - consumed by `grid/draw3d.js` (out of this task's scope; see
// `line.ts`'s header comment for the full grep-verified finding).
export { LinePolygon } from './polygon/line'

// `polygon/cube.ts` ("chart.polygon.cube", extend: "chart.polygon.core") - 8-vertex/6-face box
// primitive, used by `column3d.js`'s `createColumn`. Cross-checked directly against jui-chart-vue's
// `usePolygon3d.ts`'s `cubeVertices()`/`CUBE_FACES` (added specifically as a port of this file - see
// `cube.ts`'s header comment).
export { CubePolygon } from './polygon/cube'

// `polygon/grid.ts` ("chart.polygon.grid", extend: "chart.polygon.core") - single rectangular quad
// face of a 3D grid box (one of "center"/"horizontal"/"vertical"). No jui-chart-vue reference
// exists (its 3D charts use a simplified linear/ordinal z-axis, not a real ported 3D grid mesh) -
// full independent port. Real consumer: `grid/draw3d.js`'s `drawAxisLine()` (out of this task's
// scope; see `grid.ts`'s header comment for the grep-verified call-site contract).
export { GridPolygon } from './polygon/grid'
export type { GridPolygonType } from './polygon/grid'

// `grid/draw3d.js` ("chart.grid.draw3d", extend: "chart.draw") - a SIBLING to `grid/core.ts` (both
// `extend: "chart.draw"`), NOT a `CoreGrid` subclass. The real 3D-drawing-method mixin
// `grid/core.ts`'s `registerGridDraw3D()` hook was built to receive - `createGridX`/`createGridY`/
// `drawCenter`/`drawBaseLine`/`drawAxisLine`/`drawValueLine`/`drawValueLineCenter`/`drawValueText`/
// `drawValueTextCenter` (+ no-op `drawPattern`/`drawImage`). Needed `polygon/grid.ts`'s
// `GridPolygon`/`polygon/line.ts`'s `LinePolygon`/`polygon/point.ts`'s `PointPolygon` (Phase D,
// above) - now satisfied, closing out Phase C in full. Importing this module has the side effect of
// calling `registerGridDraw3D(applyDraw3DGridMixin)` at module-load time (same self-registration
// convention `draw2d.ts` already established) - so importing `jui-graph-ts`'s public entry point is
// now enough to make any full-3D-rendering `CoreGrid` subclass instance (`axis.isFull3D() ===
// true`, e.g. `BlockGrid`/`RangeGrid`/`FullBlockGrid`/`DateGrid`'s own `center()` orient method)
// actually drawable via `.render()`. See `draw3d.ts`'s own header comment for the preserved
// `drawAxisLine()` "face polygon never gets `.join()`'d" bug and every other preserved quirk.
export { applyDraw3DGridMixin } from './grid/draw3d'

// Phase E - Brush/Widget base classes. `CoreWidget` ("chart.widget.core", extend: "chart.draw" -
// confirmed from source, NOT `Core` - same `Draw`-family precedent `grid/core.ts`'s `CoreGrid`
// already established) is the real base every concrete `widget/*.ts` extends
// (`widget/canvas/core.ts`/`widget/polygon/core.ts`/`widget/map/core.ts`, all future Phase E
// items, plus leaf widgets like a ported `rotate3d.ts`). Cross-checked against jui-chart-vue's
// `widget/polygon/rotate3d.js`/`useRotate3d.ts` Phase E writeup (its richest pre-source evidence
// for this class) - CONFIRMED correct: `getIndexArray`/`getScaleToValue`/`getValueToScale`/`on()`/
// default `drawAfter()` is exactly this file's real method surface (plus `isRender()`, omitted
// from that writeup only because `rotate3d.js` itself never calls it directly - it IS real,
// load-bearing surface, used by `base/builder.ts`'s `drawWidget()` and by `on()` itself). See
// `widget/core.ts`'s header comment for `on(type, callback, axisIndex)`'s exact, non-`Draw.on()`
// semantics (explicit `axisIndex` param, dynamic `"render"`/`"renderAll"` reset type via
// `isRender()`).
export { CoreWidget } from './widget/core'

// `CoreBrush` ("chart.brush.core", extend: "chart.draw" - confirmed from source, NOT `Core`; same
// `Draw`-family precedent `CoreGrid`/`CoreWidget` already established) is the real base every
// concrete `brush/*.ts` extends (`brush/canvas/core.ts`/`brush/polygon/core.ts`/`brush/map/core.ts`,
// all future Phase E items, plus every leaf brush like a future `bar.ts`/`line.ts`). Cross-checked
// against jui-chart-vue's accumulated `chart.brush.core` inferences across its whole Phase A-E
// (`eachData`/`getValue`/`addEvent`/`color`/`offset`/`curvePoints` all CONFIRMED byte-exact; two
// corrections: `getCache`/`setCache` belong to `base/builder.ts`'s `Builder`, not this class, and
// `getIndexArray()` belongs to `widget/core.ts`'s `CoreWidget`, not this one - see `brush/core.ts`'s
// header comment for the full writeup, including the real `_.loop()`-interleaved-row-order finding
// in `getXY()` and the preserved `eachData(callback, reverse)` swapped-argument-order quirk.
export { CoreBrush } from './brush/core'
export type { BrushChart, BrushOptions, BrushAxisScale, BrushData, BrushEventPayload, BrushMouseEvent, BrushSeriesXY, BrushTooltip } from './brush/core'
export type { WidgetChart, WidgetConfig } from './widget/core'

// `chart.brush.canvas.core`/`chart.brush.polygon.core`/`chart.brush.map.core` - the three
// `CoreBrush`-derived bases every concrete `chart.brush.*` leaf ultimately extends (SVG-side
// `brush/polygon/core.ts`, canvas-side `brush/canvas/core.ts`, and the empty `brush/map/core.ts`
// extension point). Cross-checked against jui-chart-vue's `ChartCanvasBase.vue`/
// `useCanvasChart.ts` (that Phase E infrastructure turns out to be ENTIRELY jui-chart-vue's own
// invention - this real 45-line source file has ZERO canvas-context/DPI/RAF-loop logic of any
// kind, confirming jui-chart-vue's own indirect "confirmed absent by grepping the ENTIRE tree"
// finding directly) and against its `column3d.js`/`line3d.js` writeup (`createPolygon()`'s
// `calculate3d()` + `order = axis.depth - polygon.max().z` stamp, CONFIRMED byte-exact, no
// corrections needed). See each file's own header comment for the full writeup, including
// `CanvasCoreBrush.drawAfter()`'s real, previously-undocumented complete shadowing of
// `CoreBrush.drawAfter()`'s clip-path/CSS-class/translate wiring (not composed, replaced - same
// constructor-assignment-order semantics the original's own `extend` chain produces).
export { CanvasCoreBrush } from './brush/canvas/core'
export type { CanvasPolygon, CanvasPolygonEntry } from './brush/canvas/core'
export { PolygonCoreBrush } from './brush/polygon/core'
export type { PolygonBrushPolygon, PolygonBrushElement, PolygonBrushOptions } from './brush/polygon/core'
export { MapCoreBrush } from './brush/map/core'

// `chart.widget.canvas.core`/`chart.widget.polygon.core` - both byte-identical two-line
// pass-throughs over `CoreWidget` (confirmed via `diff` against the real source): a zero-param
// constructor (inherited) plus a completely EMPTY `drawAfter(obj)` override, shadowing
// `CoreWidget.drawAfter`'s `widget-<type>` CSS-class stamp entirely. `PolygonCoreWidget` is the
// exact class jui-chart-vue's `widget/polygon/rotate3d.js`/`useRotate3d.ts` Phase E writeup
// already described as "a two-line pass-through - empty drawAfter() override, nothing else" -
// CONFIRMED correct against the real source (not a correction). `CanvasCoreWidget` has no
// existing jui-chart-vue reference (its opt-in canvas composables like `usePickerWidget.ts` were
// never built as a `chart.widget.*`-family subclass) - first independent port, same shape found.
export { CanvasCoreWidget } from './widget/canvas/core'
export { PolygonCoreWidget } from './widget/polygon/core'

// `chart.widget.map.core` - an empty extension-point stub with ZERO concrete subclasses anywhere
// public in the real engine (confirmed via grep across the whole source tree), same category as
// `brush/map/core.ts`. Unlike the canvas/polygon siblings above, it does NOT override `drawAfter`
// at all (so it still inherits `CoreWidget`'s real CSS-class-stamping behavior) - it only adds a
// vestigial 3-parameter (`chart, axis, widget`, all unused in the body - real wiring happens
// externally via `base/builder.ts`'s `drawWidget()`, same as every other Phase E base class)
// constructor and a `static setup()` override returning `{ axis: 0 }`, MERGED with (not replacing)
// `CoreWidget.setup()`/`Draw.setup()`'s own defaults via `defineOptions()`'s full-chain walk (see
// `base/builder.ts`'s `defineOptions()` doc comment).
export { MapCoreWidget } from './widget/map/core'
