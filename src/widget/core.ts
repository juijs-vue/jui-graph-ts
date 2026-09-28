// Port of juijs-graph's `src/widget/core.js` ("chart.widget.core", extend: "chart.draw").
//
// ============================================================================================
// REAL EXTEND TARGET IS `base/draw.ts`'s `Draw`, NOT `base/core.ts`'s `Core` - confirmed from
// source, not assumed. `widget/core.js`'s own `extend:` field literally reads `"chart.draw"`
// (line 8 of the original), the exact same target `grid/core.ts`'s `CoreGrid` already
// established for the sibling `grid.*` family (see that file's header comment for the full
// `Core`-vs-`Draw` two-family explanation - `Core` is the per-instance-event-bus/option-merge
// base for top-level UI objects (`Builder`/`Plane`); `Draw` is the render-lifecycle mixin base
// (`render()`/`format()`/`calculate3d()`/`on()`) for anything that gets `chart`/`axis`/`widget`/
// `svg` wired onto it externally by `base/builder.ts`'s `drawWidget()` and produces rendered
// output). `CoreWidget` needs the latter: `render()` (invoking whatever `this.draw` a concrete
// widget subclass assigns), and its own OWN `on()` override below replaces `Draw.on()` entirely
// for the whole `widget.*` family. `class CoreWidget extends Draw` below, constructor kept 1:1
// (the original's own `CoreWidget` constructor function takes ZERO parameters - `chart`/`axis`/
// `widget`/`svg`/`canvas` are wired onto the instance externally by `base/builder.ts`'s
// `drawWidget()`, confirmed by reading that method: `draw.chart = this; draw.axis =
// this._axis[0]; draw.widget = draws[i]; draw.svg = this.svg; draw.canvas =
// this._canvas.sub;`, all AFTER `new Obj(this, this._axis[0], draws[i])` - the constructor
// arguments themselves are never read by `CoreWidget`, matching `CoreGrid`'s identical
// externally-wired-after-construction shape).
//
// ============================================================================================
// CROSS-CHECK AGAINST jui-chart-vue's `widget/polygon/rotate3d.js`/`useRotate3d.ts` WRITEUP
// (`jui-chart-vue/PORT_STATUS.md` ~L6077-6081) - this project's richest existing pre-source
// evidence for this exact class, confirmed CORRECT against the real source read here:
//
//   "Extend chain, confirmed from source: chart.widget.polygon.rotate3d extends
//   chart.widget.polygon.core (a two-line pass-through - empty drawAfter() override, nothing
//   else) extends chart.widget.core (getIndexArray/getScaleToValue/getValueToScale/on()/default
//   drawAfter()) extends chart.draw. rotate3d.js itself only ever uses chart.widget.core's
//   on(type, callback, axisIndex) wrapper - nothing else from the chain."
//
// Every method name listed there (`getIndexArray`/`getScaleToValue`/`getValueToScale`/`on()`/
// `drawAfter()`) matches this file's real, complete method surface EXACTLY - CONFIRMED, not
// corrected: `widget/core.js` defines precisely these five methods (`getIndexArray`,
// `getScaleToValue`, `getValueToScale`, `isRender`, `on`, `drawAfter` - jui-chart-vue's writeup
// omitted `isRender` since `rotate3d.js` itself never calls it, but it IS part of the real
// surface, see below) plus the static `setup()` defaults factory - nothing else. No other Phase D
// widget writeup (`zoom.js`/`dragselect.js`/`selectbox.js`/`focus.js`/`guideline/cross.js`/
// `tooltip.js`/`legend.js`, all `PORT_STATUS.md` Phase D entries there) inferred anything further
// about this base class beyond confirming the same `extend: "chart.widget.core"` chain - none of
// them had this file's real source to read (jui-chart-vue's whole Phase D was a from-scratch
// Vue-idiomatic reimplementation without vendoring `juijs-graph`), so there was nothing else to
// cross-check or correct.
//
// `isRender()` itself (`return (this.widget.render === true) ? true : false` - a real, if
// redundant, ternary-wrapped boolean coercion, preserved verbatim below) is genuinely PART of
// this class's surface and IS actually called - not by `rotate3d.js`, but by `base/builder.ts`'s
// own `drawWidget()` (`if (this._initialize && draw.isRender && !draw.isRender() && isAll !==
// true) { return; }` and `if (draw.isRender && !draw.isRender()) { this.svg.autoRender(elem,
// false); }`) AND by `CoreWidget.on()` itself (`this.isRender() ? "render" : "renderAll"`, see
// below) - so it's load-bearing product logic, not dead surface.
// ============================================================================================
//
// `on(type, callback, axisIndex)`'s EXACT semantics, precisely determined from source (this
// task's own central verification job) - genuinely DIFFERENT from `Draw.on(type, callback)`,
// not just a re-export, in three real ways:
//
//   1. **Third parameter, `axisIndex`, explicit - not `self.axis.index`.** `Draw.on()` (the
//      `grid.*` family's version) always derives the per-axis-scoping index from `self.axis.index`
//      (the single axis instance wired onto the draw object). `CoreWidget.on()` instead takes
//      `axisIndex` as an explicit THIRD ARGUMENT to `on()` itself - because a widget (unlike a
//      grid, which belongs to exactly one axis) is wired to only `this._axis[0]` by
//      `drawWidget()`, but a single widget instance may still want to listen for `"axis.*"`
//      events scoped to a DIFFERENT axis than the one it's attached to (confirmed real: a widget's
//      own `widget.axis` config array, read by callers like `rotate3d.js`, is what a caller passes
//      through as this `axisIndex` argument per-call, once per configured axis index - not
//      resolved automatically from `this.axis`).
//   2. **The reset-type argument to `this.chart.on(...)` is DYNAMIC, not always `"render"`.**
//      `Draw.on()` always passes the literal string `"render"` as its third argument to
//      `this.chart.on(...)`. `CoreWidget.on()` instead passes `this.isRender() ? "render" :
//      "renderAll"` - i.e. a widget configured with `render: true` (drawn on every render pass)
//      resets its bound handler on `"render"`; a widget with the default `render: false` (drawn
//      once, lazily, per `base/builder.ts`'s own `drawWidget()` doc comment: "위젯은 렌더 옵션이
//      false일 때, 최초 한번만 로드함") resets on `"renderAll"` instead - a genuinely different,
//      widget-specific event-rebinding lifecycle from the grid family's always-`"render"` version.
//   3. **The per-axis dispatch guard compares `args[1]` against the explicit `axisIndex`
//      parameter, not `self.axis.index`.** Mirrors point 1 - `Draw.on()`'s inner guard checks
//      `args[1] === self.axis.index`; `CoreWidget.on()`'s checks `args[1] === axisIndex` (the
//      literal third argument passed to `on()` itself). The original source uses loose `==`
//      here (`arguments[1] == axisIndex`), not `===` - preserved as `===` below with NO
//      behavior difference (same precedent as `base/draw.ts`'s own analogous `args[1] ===
//      self.axis.index` comparison, already `===` there): `axisIndex` is guarded by
//      `typeCheck("integer", axisIndex)` immediately above in both branches, so by the time the
//      comparison runs both operands are always numbers - `==`/`===` are behaviorally identical
//      for two same-typed number operands, so no coercion this loose-equality preservation could
//      ever actually exercise is lost.
//
// `drawAfter(obj)`'s only job: `obj.attr({ "class": "widget-" + this.widget.type })` - stamps a
// `widget-<type>` CSS class onto whatever element `this.draw()` returned. Declared as an
// arrow-function CLASS FIELD (not method syntax), matching `Draw`'s own `drawAfter?: (obj: any)
// => void` OPTIONAL PROPERTY declaration (never a prototype method there, mirroring the
// original's own per-instance `this.drawAfter = function(obj){...}` closure assignment) - same
// TS2425 override-kind-matching necessity `grid/core.ts`'s `CoreGrid.drawAfter` already
// documented and required.
//
// `getScaleToValue`/`getValueToScale` are a real inverse pair (confirmed algebraically, not just
// visually similar): `getValueToScale(getScaleToValue(s, ...), ...)` round-trips `s` back
// (modulo the `.toFixed(1)` rounding `getValueToScale` applies, and `getScaleToValue`'s own
// min/max clamping) - a linear scale/value mapping used by slider-like widgets (e.g. a range
// picker) to convert between an axis's tick-scale space and its underlying value domain. Neither
// touches `this` at all (pure functions of their arguments) - ported as ordinary instance methods
// for 1:1 fidelity with the original's `this.getScaleToValue = function(...)` shape, not hoisted
// to module scope (unlike e.g. `base/axis.ts`'s `getRate()`), since nothing about the original
// design suggests these were meant to be free functions - every other `CoreWidget` method is
// likewise an instance method, and there's no reuse-across-files pressure the way `getRate()` had.
//
// `getIndexArray(index)`: normalizes a widget's `index`/`axis` config value (frequently
// `widget.axis` - see `rotate3d.js`'s own read of it) into an array form: an already-`array`
// value passes through unchanged, a single `integer` becomes a 1-element array, anything else
// (including `undefined`, the common "not configured" case) defaults to `[0]` - i.e. "operate on
// axis 0 unless told otherwise". Used by widget subclasses to iterate over one or more configured
// axis indices generically (e.g. `rotate3d.js`'s `draw()` wiring `setScrollEvent()` per configured
// `widget.axis` index, defaulting to `[0]`, per jui-chart-vue's own writeup above).
// ============================================================================================

import { Draw } from "../base/draw";
import type { TransElement } from "../util/svg/element.transform";
import type { SVG } from "../util/svg";

// ---- inlined `util/base.js` typeCheck/startsWith (same per-file convention as `util/dom.ts`,
// `base/axis.ts`, `base/builder.ts`, `base/core.ts`, `base/draw.ts`, `grid/core.ts` - no shared
// helper module exists in this port). Only the checks this file actually calls are included
// (`array`/`integer`/`object`), same "minimal per-file subset" convention `grid/core.ts`
// established. -------------------------------------------------------------------------------
type TypeCheckable = unknown;

function typeCheck(type: string | string[], value: TypeCheckable): boolean {
  function check(t: string, v: TypeCheckable): boolean {
    if (typeof t !== "string") return false;
    if (t === "array") return v instanceof Array;
    if (t === "integer") return typeof v === "number" && v % 1 === 0;
    if (t === "object") {
      return typeof v === "object" && v !== null && !(v instanceof Array) && !(v instanceof Date) && !(v instanceof RegExp);
    }
    return false;
  }
  if (typeof type === "object" && Array.isArray(type)) {
    for (let i = 0; i < type.length; i++) {
      if (check(type[i], value)) return true;
    }
    return false;
  }
  return check(type as string, value);
}

// `util/base.js`'s `startsWith(string, searchString, position)` - `string.lastIndexOf(searchString,
// position) === position`, same inlining `base/draw.ts` already established for its own identical
// use (`startsWith(type, "axis.")`).
function startsWith(str: string, searchString: string, position?: number): boolean {
  const pos = position || 0;
  return str.lastIndexOf(searchString, pos) === pos;
}

/**
 * This file's own minimal slice of the real chart (`Builder`) surface a `chart.widget.*` leaf
 * needs - narrower override of `Draw`'s own `chart!: DrawChartLike` field, the same convention
 * `brush/core.ts`'s `CoreBrush` already established with its own `BrushChart` interface (and
 * `grid/core.ts`'s `CoreGrid` with `GridChart`). Kept as its OWN named interface (not a reuse of
 * `BrushChart`, even though the two currently happen to need an identical member set) since the
 * `chart.brush.*`/`chart.widget.*` families are genuinely separate concerns in the original engine
 * (different `extend:` targets below `Draw`, different `base/builder.ts` wiring methods -
 * `drawBrush()`/`drawWidget()` - different per-instance config field - `brush`/`widget`) and a
 * downstream consumer (a concrete `chart.widget.*` leaf class) should not have to import a
 * "brush"-named type to type its own `this.chart`. Covers every `Builder` member the three
 * currently-registered downstream leaf widgets (title/tooltip/legend, in `jui-chart-vue`) call:
 * `svg`/`text`/`texts`/`theme`/`area`/`padding`/`axis`/`get`/`color`/`emit`/`isRender`/`render`/
 * `updateBrush`/`setCache`/`getCache`, plus `on`/`format?` (inherited, unmodified, from `Draw`'s
 * own `chart.on(...)`/`chart.format` calls - see `Draw`'s and this class's own `on()`).
 */
export interface WidgetChart {
  /** `Draw.on()`'s `this.chart.on(type, handler, resetType)` / `CoreWidget.on()`'s own override
   * of the same call (`this.isRender() ? "render" : "renderAll"` as `resetType`). */
  on(type: string, callback: (...args: any[]) => any, resetType?: string): any;
  /** `Draw.on()`'s per-axis dispatch guard `self.chart.axis(self.axis.index)`; also a widget's own
   * `chart.axis(widget.axis)` lookup (a DIFFERENT axis than `this.axis`, e.g. `chart.widget.title`). */
  axis(index?: number): any;
  /** `Draw.format()`'s fallback when a widget doesn't define its own `format`. */
  format?: (...args: any[]) => any;
  /** Getter form (no key) returns the whole area box; keyed form returns one `x`/`y`/`x2`/`y2`/
   * `width`/`height` value - matches `Builder.area()`'s real overloaded signature. */
  area(): { x: number; y: number; x2: number; y2: number; width: number; height: number };
  area(key: string): number;
  /** Matches `Builder.padding()`'s real overloaded signature. */
  padding(): { top: number; bottom: number; left: number; right: number };
  padding(key: string): number;
  /** The chart's own root `SVG` builder handle - same instance every brush/widget's own `this.svg`
   * (inherited from `Draw`) already is, exposed here too for a widget that specifically needs
   * `this.chart.svg` (e.g. to draw into the chart's shared `<defs>` via `appendDefs()`, not
   * available through the narrower `this.svg`). */
  svg: SVG;
  /** The chart's own root DOM element (what `Builder.mount()` was given). */
  root: HTMLElement;
  /** See `Builder.color()`'s own doc comment - resolves a palette/gradient/pattern color, given a
   * series index or literal color string. */
  color(key1?: any, key2?: any): string;
  /** See `Builder.theme()`'s own doc comment - reads one theme style value (or the whole theme
   * object, or a ternary key pick). */
  theme(key?: any, value?: any, value2?: any): any;
  /** See `Builder.text()`'s own doc comment - draws one `<text>`, resolving `{key}`-style icon
   * placeholders in a string content argument. */
  text(attr: Record<string, any>, textOrCallback?: string | ((this: any) => void)): any;
  /** See `Builder.texts()`'s own doc comment - draws several stacked `<text>` lines in one `<g>`. */
  texts(attr: Record<string, any>, texts: string[], lineBreakRate?: number): any;
  /** `Builder.get("axis"|"brush"|"widget"|"padding"|"area", key?)` - a widget reading e.g. another
   * brush's config (`chart.get("brush", index)`, as `chart.widget.tooltip`/`chart.widget.legend`
   * both do). */
  get(type: string, key?: any): any;
  /** See `Core.emit()`'s own doc comment - fires a custom event to every matching `on()`
   * listener. */
  emit(type: string, args?: any[]): any;
  /** See `Builder.isRender()`'s own doc comment - whether an imperative call should currently
   * trigger an auto-re-render. */
  isRender(): boolean;
  /** See `Builder.render()`'s own doc comment - re-renders the whole chart. */
  render(isAll?: boolean): void;
  /** See `Builder.updateBrush()`'s own doc comment - replaces or merges another brush's config by
   * index, then re-renders (if `isRender()`). Used by e.g. `chart.widget.legend`'s own
   * show/hide-series click handling. */
  updateBrush(index: number, brush: any, isReset?: boolean): void;
  /** See `Builder.setCache()`'s own doc comment - stores a value in the chart's own per-instance
   * cache, surviving across re-renders. */
  setCache(key: string, value: any): void;
  /** See `Builder.getCache()`'s own doc comment - reads a value back, or `defValue` if unset. */
  getCache(key: string, defValue?: any): any;
}

/** Minimal shape `CoreWidget`'s own methods need from `this.widget` (real shape: a widget entry
 * from `BuilderOptions.widget[]`, wired onto the instance by `base/builder.ts`'s `drawWidget()`
 * as `draw.widget = draws[i]`) - `render` (`isRender()`) and `type` (`drawAfter()`'s CSS class).
 * Narrower override of `Draw`'s own `widget: any` field, same convention `grid/core.ts` used for
 * its `declare axis: Axis` override of `Draw`'s `axis!: DrawAxisLike`. */
export interface WidgetConfig {
  /** @cfg {Boolean} [render=false] Determines whether a widget is to be rendered. */
  render?: boolean;
  /** @cfg {String} [type=null] Specifies the type of a widget to be added (inherited default
   * from `Draw.setup()`, per the original's `extend:` chain - `CoreWidget.setup()` itself never
   * redeclares `type`, only `render`/`index`). */
  type?: string;
  /** @property {Number} [index=0] [Read Only] Index which shows the sequence how a widget is
   * drawn. */
  index?: number;
  [key: string]: unknown;
}

/**
 * Port of `chart.widget.core`'s `CoreWidget` constructor function as a real ES class, per Phase 0
 * rule 2. Constructor kept 1:1: the original takes ZERO parameters (see header comment) - real
 * subclasses (`widget/canvas/core.js`/`widget/polygon/core.js`/`widget/map/core.js`, all out of
 * this task's scope per its own instructions - and concrete leaf widgets like `rotate3d.js`) get
 * `chart`/`axis`/`widget`/`svg`/`canvas` wired onto them externally by `base/builder.ts`'s
 * `drawWidget()`, not via construction - the exact same externally-wired-after-construction shape
 * `grid/core.ts`'s `CoreGrid` already established for the sibling `grid.*` family.
 */
export class CoreWidget extends Draw {
  declare chart: WidgetChart;
  declare widget: WidgetConfig;

  /**
   * @method getIndexArray
   * Normalizes an `index`/axis-config value into an array form - see header comment for the full
   * "operate on axis 0 unless told otherwise" semantics.
   */
  getIndexArray(index?: unknown): number[] {
    let list: number[] = [0];

    if (typeCheck("array", index)) {
      list = index as number[];
    } else if (typeCheck("integer", index)) {
      list = [index as number];
    }

    return list;
  }

  /**
   * @method getScaleToValue
   * Converts a tick-scale-space position into its underlying value-domain equivalent, clamped to
   * `[minValue, maxValue]`. Pure function of its own arguments - never touches `this`.
   */
  getScaleToValue(scale: number, minScale: number, maxScale: number, minValue: number, maxValue: number): number {
    const tick = (maxScale - minScale) * 10;
    const step = (maxValue - minValue) / tick;
    const value = maxValue - step * ((scale - minScale) / 0.1);

    if (value < minValue) return minValue;
    else if (value > maxValue) return maxValue;

    return value;
  }

  /**
   * @method getValueToScale
   * Converts a value-domain position into its tick-scale-space equivalent, rounded to 1 decimal
   * place (`.toFixed(1)`, then re-parsed as a float - the original's own rounding, preserved
   * verbatim, NOT clamped to `[minScale, maxScale]` the way `getScaleToValue`'s inverse direction
   * is - an asymmetry in the original design, not a port-introduced gap). Pure function of its
   * own arguments - never touches `this`.
   */
  getValueToScale(value: number, minValue: number, maxValue: number, minScale: number, maxScale: number): number {
    const tick = (maxScale - minScale) * 10;
    const step = (maxValue - minValue) / tick;

    return parseFloat((minScale + ((maxValue - value) / step) * 0.1).toFixed(1));
  }

  /**
   * @method isRender
   * Real, if redundant, ternary-wrapped boolean coercion of `this.widget.render === true`,
   * preserved verbatim (not simplified to a bare `return this.widget.render === true`) for
   * literal fidelity - behaviorally identical either way. Load-bearing: called both by
   * `base/builder.ts`'s `drawWidget()` (gates the "render once unless `render: true`" lazy-draw
   * lifecycle) and by this class's own `on()` below (picks the reset-type argument).
   */
  isRender(): boolean {
    return this.widget.render === true ? true : false;
  }

  /**
   * @method on
   * 1:1 port of `CoreWidget`'s `this.on`, INCLUDING its three real deviations from `Draw.on()`
   * (grid-family version) - see header comment for the full, precisely-determined semantics:
   * explicit `axisIndex` third parameter (not `self.axis.index`), a DYNAMIC chart-level reset
   * type (`"render"` vs `"renderAll"`, via `isRender()`) instead of always `"render"`, and the
   * per-axis dispatch guard comparing `args[1]` against `axisIndex` rather than `self.axis.index`.
   */
  on(type: string, callback: (...args: any[]) => any, axisIndex?: number): any {
    const self = this;

    return this.chart.on(
      type,
      function (this: any, ...args: any[]) {
        if (startsWith(type, "axis.") && typeCheck("integer", axisIndex)) {
          const axis = self.chart.axis(axisIndex);
          const e = args[0];

          if (typeCheck("object", axis)) {
            if (args[1] === axisIndex) {
              callback.apply(self, [e]);
            }
          }
        } else {
          callback.apply(self, args);
        }
      },
      self.isRender() ? "render" : "renderAll",
    );
  }

  /**
   * @method drawAfter
   * Stamps a `widget-<type>` CSS class onto the rendered element. Arrow-function CLASS FIELD, not
   * method syntax - matches `Draw`'s own `drawAfter?: (obj: any) => void` OPTIONAL PROPERTY
   * declaration (a TS2425 override-kind-matching necessity, same as `grid/core.ts`'s
   * `CoreGrid.drawAfter`; also mirrors the original's own per-instance closure-assignment shape,
   * `this.drawAfter = function(obj){...}`, never a prototype method there).
   */
  drawAfter = (obj: TransElement): void => {
    obj.attr({ class: "widget-" + this.widget.type });
  };

  /**
   * @method setup
   * 1:1 port of `CoreWidget.setup()`'s static defaults factory. Return type widened to
   * `Record<string, unknown>` for the same static-side covariant-override reason `grid/core.ts`'s
   * `CoreGrid.setup()` already required against `Draw.setup()`'s own widened return type - zero
   * runtime/behavior change (confirmed via grep: `CoreWidget.setup()` is never called anywhere in
   * the current tree either).
   */
  static setup(): Record<string, unknown> {
    return {
      /** @cfg {Boolean} [render=false] Determines whether a widget is to be rendered. */
      render: false,
      /** @cfg {Number} [index=0] current widget index */
      index: 0,
    };
  }
}
