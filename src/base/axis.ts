// Port of juijs-graph's `src/base/axis.js` ("chart.axis").
//
// The real axis engine: panel-area layout math (`calculatePanel()`), x/y/z/c grid + map
// registration/positioning, data paging (screen/zoom/next/prev), and the mouse-event-to-axis-
// coordinate translation every chart component relies on. Ported per Phase 0 rule 2 as a real
// `class Axis` (constructor params/method names kept 1:1 with the original: `chart, originAxis,
// cloneAxis`, `getValue`/`reload`/`area`/`padding`/`get`/`set`/`updateGrid`/`update`/`screen`/
// `next`/`prev`/`zoom`/`isFull3D`).
//
// **The grid/map dependency-boundary decision (this file's own assigned scope)**: the original's
// `drawGridType()`/`drawMapType()` resolve a concrete `Grid`/`Map` constructor via the dropped
// string-keyed registry (`jui.include("chart.grid." + type)` / `jui.include("chart.map")`).
// `grid/*.js` (Phase C) and `base/map.js` (excluded from this task, ported separately) don't exist
// as TS modules yet, so this file cannot `import` them directly without creating a circular/
// premature dependency. Per Phase 0 rule 1 ("no runtime registry... real import/export") the
// registry can't just be reproduced as-is either. The resolution: `drawGridType`/`drawMapType`'s
// OWN logic (merge grid options via `.setup()`, construct, wire `chart`/`axis`/`grid`/`svg`
// properties, call `.render()`, position the returned root, stamp `.type`/`.root` onto the
// returned scale) is fully implemented here, unchanged from the original - only the "which
// concrete class for this type string" lookup is abstracted behind two small structural
// interfaces this file defines: `GridConstructor`/`GridInstance` (keyed by grid-type string, via
// `AxisChart.gridTypes`) and `MapConstructor`/`MapInstance` (single slot, via
// `AxisChart.mapType`, mirroring the original's single unconditional `jui.include("chart.map")`).
// When Phase C's `grid/*.ts` files and the separately-ported `base/map.ts` exist, whatever
// assembles the real chart (Phase B's `base/builder.ts`, not touched by this task) builds a real
// `Record<string, GridConstructor>` out of real `import`s (`import { BlockGrid } from
// '../grid/block'`, etc.) and passes it in - real ES module wiring, not a runtime string
// registry; the map only exists because `axis[k].type` is a runtime string in the original's own
// design (`grid.type` config option), not an artifact of the registry itself. Grid/Map classes
// must satisfy `GridConstructor`/`MapConstructor` (constructible as `new Ctor(chart, axis,
// options)`, exposing mutable `chart`/`axis`/`grid` (or `map`)/`svg` fields, and a `render()`
// method returning `{ root: TransElement; scale: GridRenderedScale }`) - noted here as a
// contract for Phase C / `base/map.ts` to satisfy, not blocking on either being done first.
//
// **The chart dependency**: `chart` (the constructor's first param, ported from `base/builder.js`
// by a different, concurrent task) is likewise typed as a minimal structural interface
// (`AxisChart`) covering exactly what this file calls on it (`area()`, `svg`, `index`,
// `appendDefs()`, `theme()`, `isRender()`/`render()`, `on()`/`emit()`, plus the `gridTypes`/
// `mapType` resolution slots above) - not the full `base/builder.js` surface. `chart.svg` is
// typed as the REAL, already-ported `util/svg.ts` `SVG` class (Phase A), not an interface, since
// that port already exists and this file's `chart.svg.rect(...)`/`.clipPath(...)` calls need its
// actual `TransElement`/`Element` return types.
//
// Cross-checked against jui-chart-vue's `useAxis.ts`/`useChartLayout.ts` (Phase F already audited
// `calculatePanel()`'s layout arithmetic and the range-axis-reverses/block-axis-never-does
// orientation asymmetry against this exact file - see this port's `axis.spec.ts` for the reused
// hand-traced values and header notes below for match/discrepancy detail).
//
// Depends on Phase A's already-ported utilities only incidentally: this file itself never calls
// `util.scale`/`util.math` directly (only `grid/*.js` does, per the original) - the one real
// dependency is `util.base`'s `extend`/`deepClone`/`typeCheck`, which (per Phase 0 rule 4's own
// "verify per-file before dropping" instruction) are genuine product logic here (config merging/
// cloning in `reload()`/`set()`/`update()`, not OOP scaffolding) and are NOT already exported by
// any Phase A file (`util/dom.ts`/`util/math.ts`/`util/svg/element.ts` each keep their own private,
// unexported copy of `typeCheck` for the same reason - same convention followed here).

import type { SVG } from "../util/svg";
import type { Element } from "../util/svg/element";
import type { TransElement } from "../util/svg/element.transform";

// ---------------------------------------------------------------------------------------------
// Inlined `util/base.js` helpers this file actually needs (Phase 0 rule 4: real product logic,
// not registry/OOP scaffolding - kept, same convention as `util/dom.ts`/`util/math.ts`/
// `util/svg/element.ts`'s own private `typeCheck` copies). Node-cross-checked against the
// original's `base/base.js` (`extend`/`deepClone`/`typeCheck`), transcribed verbatim.
// ---------------------------------------------------------------------------------------------

type TypeCheckable = unknown;

function typeCheck(type: string | string[], value: TypeCheckable): boolean {
  function check(t: string, v: TypeCheckable): boolean {
    if (typeof t !== "string") return false;

    if (t === "string") {
      return typeof v === "string";
    } else if (t === "integer") {
      return typeof v === "number" && v % 1 === 0;
    } else if (t === "float") {
      return typeof v === "number" && v % 1 !== 0;
    } else if (t === "number") {
      return typeof v === "number";
    } else if (t === "boolean") {
      return typeof v === "boolean";
    } else if (t === "undefined") {
      return typeof v === "undefined";
    } else if (t === "null") {
      return v === null;
    } else if (t === "array") {
      return v instanceof Array;
    } else if (t === "date") {
      return v instanceof Date;
    } else if (t === "function") {
      return typeof v === "function";
    } else if (t === "object") {
      // Same as the original: excludes array/date/regexp/null from "object" specifically.
      return (
        typeof v === "object" &&
        v !== null &&
        !(v instanceof Array) &&
        !(v instanceof Date) &&
        !(v instanceof RegExp)
      );
    }

    return false;
  }

  if (typeof type === "object" && (type as string[]).length) {
    const typeList = type as string[];
    for (let i = 0; i < typeList.length; i++) {
      if (check(typeList[i], value)) return true;
    }
    return false;
  }

  return check(type as string, value);
}

/**
 * `_.extend(origin, add, skip)` - ported verbatim from `base/base.js`. `skip !== true`: plain
 * (recursive-on-nested-objects) overwrite merge. `skip === true`: only fills keys that are
 * currently `undefined` on `origin` (still recurses into nested objects either way) - used by
 * `reload()`'s `calculatePanel()` call to apply chart-computed x/y/width/height defaults onto a
 * user-supplied `axis.area` WITHOUT clobbering any percentage/value the user already set.
 */
function extend(origin: unknown, add: unknown, skip?: boolean): Record<string, unknown> {
  const target: Record<string, unknown> = typeCheck(["object", "function"], origin)
    ? (origin as Record<string, unknown>)
    : {};

  if (!typeCheck(["object", "function"], add)) return target;
  const source = add as Record<string, unknown>;

  function isRecursive(value: unknown): boolean {
    return typeCheck("object", value);
  }

  for (const key in source) {
    if (skip === true) {
      if (isRecursive(target[key])) {
        extend(target[key], source[key], skip);
      } else if (typeCheck("undefined", target[key])) {
        target[key] = source[key];
      }
    } else {
      if (isRecursive(target[key])) {
        extend(target[key], source[key], skip);
      } else {
        target[key] = source[key];
      }
    }
  }

  return target;
}

/**
 * Approximates `jui.defineOptions(Ctor, options)` for a grid/map constructor: fills in keys
 * missing from `options`, walking `ctor`'s ENTIRE static `setup()` chain leaf-first (its own
 * `setup()` first, then each ancestor's own `setup()`, via the real JS static-side prototype
 * chain) - the same walk `base/core.ts`'s `Core.mergeOptions()` and `base/builder.ts`'s
 * `defineOptions()` already do for `Builder`/`Plane`/registered brushes/widgets.
 *
 * FIX (previously a real, documented gap - now closed): `drawGridType()`/`drawMapType()` below
 * used to merge ONLY the concrete `GridCtor`/`MapCtor`'s own `setup()` (e.g. `BlockGrid.setup()`,
 * which never declares `dist`/`orient`/`hide`/`color`/`realtime` at all) - never walking up to
 * `CoreGrid.setup()` (where those actually live) or `Draw.setup()` - so `gridCfg.dist` stayed
 * `undefined` unless a caller set it explicitly, producing a `NaN` grid transform (`chart.area("y")
 * + area("y2") + undefined`) for every grid, every time. Verified via a downstream consumer
 * (`jui-chart-vue`) hitting exactly this in a real rendered chart.
 */
function mergeSetupChain(ctor: { setup?: () => unknown } | null | undefined, options: Record<string, unknown>): Record<string, unknown> {
  // `any`, not `unknown`, deliberately: mirrors `base/builder.ts`'s own `defineOptions()` (the
  // analogous brush/widget-side fix) - walking a constructor's static prototype chain via
  // `Object.getPrototypeOf` has no type-safe representation in TS (each level's real static shape
  // is a different, unrelated constructor type), so this stays loosely typed like that file's own
  // equivalent loop rather than fighting the type system with intermediate `unknown` casts.
  let current: any = ctor;

  while (typeof current === "function") {
    if (Object.prototype.hasOwnProperty.call(current, "setup") && typeof current.setup === "function") {
      extend(options, current.setup(), true);
    }
    current = Object.getPrototypeOf(current);
  }

  return options;
}

/** `_.deepClone(obj, emit)` - ported verbatim from `base/base.js`. */
function deepClone(obj: unknown, emit?: Record<string, boolean>): unknown {
  const skip = emit || {};

  if (typeCheck("array", obj)) {
    const arr = obj as unknown[];
    const value = new Array(arr.length);
    for (let i = 0; i < arr.length; i++) {
      value[i] = deepClone(arr[i], skip);
    }
    return value;
  } else if (typeCheck("date", obj)) {
    return obj;
  } else if (typeCheck("object", obj)) {
    const source = obj as Record<string, unknown>;
    const value: Record<string, unknown> = {};
    for (const key in source) {
      value[key] = skip[key] ? source[key] : deepClone(source[key], skip);
    }
    return value;
  }

  return obj;
}

// ---------------------------------------------------------------------------------------------
// Grid/Map dependency-boundary contract (see header comment).
// ---------------------------------------------------------------------------------------------

/**
 * What `drawGridType()`/`drawMapType()` stamp onto (and read back from) a rendered grid/map's
 * returned scale (`elem.scale.type = axis[k].type; elem.scale.root = elem.root;`). The real
 * value is one of Phase A's `util/scale.ts`/`util/scale/*.ts` scale objects (or a further Phase C
 * wrapper around one) - modeled here only by the two fields this file itself touches, so it
 * doesn't need to know Phase C's exact scale shape.
 */
export interface GridRenderedScale {
  type?: string;
  root?: TransElement;
}

/** Structural contract a Phase C `grid/*.ts` class must satisfy to plug into `drawGridType()`. */
export interface GridInstance {
  chart: AxisChart;
  axis: Axis;
  grid: Record<string, unknown>;
  svg: SVG;
  render(): { root: TransElement; scale: GridRenderedScale };
}

/**
 * Constructs a `GridInstance` for one grid-type string (e.g. `"block"`/`"panel"`), as resolved
 * from `AxisChart.gridTypes[gridCfg.type]` - the real-import-built stand-in for the original's
 * dropped `jui.include("chart.grid." + type)` string registry. See header comment.
 */
export interface GridConstructor {
  new (chart: AxisChart, axis: Axis, gridOptions: Record<string, unknown>): GridInstance;
  /** Mirrors the original's `Grid.setup()` static (default option values merged via
   *  `jui.defineOptions`) - optional here since not every stand-in needs it for tests. */
  setup?: () => Record<string, unknown>;
}

/** Structural contract the separately-ported `base/map.ts` must satisfy to plug into `drawMapType()`. */
export interface MapInstance {
  chart: AxisChart;
  axis: Axis;
  map: Record<string, unknown>;
  svg: SVG;
  render(): { root: TransElement; scale: GridRenderedScale };
}

/**
 * Constructs the single `MapInstance` for this chart, as resolved from `AxisChart.mapType` - the
 * real-import-built stand-in for the original's dropped, single, unconditional
 * `jui.include("chart.map")`. See header comment.
 */
export interface MapConstructor {
  new (chart: AxisChart, axis: Axis, mapOptions: Record<string, unknown>): MapInstance;
  setup?: () => Record<string, unknown>;
}

/** `x`/`y`/`x2`/`y2`/`width`/`height` plot-rect shape shared by `Axis.area()`/`chart.area()`. */
export interface AreaBox {
  x: number;
  y: number;
  x2: number;
  y2: number;
  width: number;
  height: number;
}

/**
 * Pre-`getRate()`-resolution shape of an `axis.area` config: `x`/`y`/`width`/`height` may be a
 * percentage string (e.g. `"50%"`) or a plain number, matching `getRate()`'s own accepted input.
 * `calculatePanel()` resolves these down to `AreaBox`'s plain-`number` shape.
 */
export interface AreaInput {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  height?: number | string;
  x2?: number;
  y2?: number;
}

/**
 * Minimal structural contract this file needs from `base/builder.ts`'s `Chart` class (ported
 * separately, not by this task - see header comment). Only the members `axis.js` itself calls.
 */
export interface AxisChart {
  area(): AreaBox;
  area(key: "x" | "y" | "width" | "height"): number;
  svg: SVG;
  index: number;
  appendDefs(elem: Element): void;
  theme(key: string): string | number;
  isRender(): boolean;
  render(): void;
  on(event: string, handler: (e: any) => void): void;
  emit(event: string, args: unknown[]): void;
  /** Real-import-built type->constructor map replacing the dropped `jui.include("chart.grid."+type)`. */
  gridTypes: Record<string, GridConstructor>;
  /** Replaces the dropped, single, unconditional `jui.include("chart.map")`. */
  mapType?: MapConstructor;
}

/** Per-side padding, as read from `AxisOptions.padding` (or synthesized from a single integer). */
export interface AxisPadding {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/**
 * Shape of the plain config object passed as `originAxis`/`cloneAxis` (and read back via
 * `reload(options)`/`get()`/`set()`) - matches `Axis.setup()`'s own defaults below. `x`/`y`/`z`/`c`
 * start out as grid-config objects (or `null`) but, importantly, `keymap`/`area` aside, this
 * shape is also what ends up stored on the LIVE `Axis` instance's own same-named fields
 * mid-`reload()` (see `AxisXYZC` below) - kept as an open index signature (`get(type)`/`set(type,
 * value)` take a dynamic string key) rather than a closed interface, matching the original's
 * untyped-object design.
 */
export interface AxisOptions {
  data?: unknown[];
  origin?: unknown[];
  buffer?: number;
  shift?: number;
  index?: number;
  page?: number;
  start?: number;
  end?: number;
  degree?: { x: number; y: number; z: number };
  depth?: number;
  perspective?: number;
  x?: Record<string, unknown> | null;
  y?: Record<string, unknown> | null;
  z?: Record<string, unknown> | null;
  c?: Record<string, unknown> | null;
  map?: Record<string, unknown> | null;
  keymap?: Record<string, string>;
  area?: AreaInput & Record<string, unknown>;
  padding?: number | AxisPadding;
  [key: string]: unknown;
}

interface MouseAxisEvent {
  chartX: number;
  chartY: number;
  axisX?: number;
  axisY?: number;
}

// ---------------------------------------------------------------------------------------------
// getRate - hoisted to module scope (see below). `calculatePanel` itself stays a private
// `Axis` method (see the class body) - re-reading the original more carefully, it is NOT pure:
// its `a.x`/`a.y`/`a.width`/`a.height` percentage resolutions all go through `chart.area('width')`
// / `chart.area('height')` directly (not `a`'s own `width`/`height` fields), so it genuinely
// closes over the constructor's `chart` parameter, same as every other private helper below.
// ---------------------------------------------------------------------------------------------

/**
 * Turns a percentage string (e.g. `"50%"`) relative to `max` into a plain number; any other value
 * (including a plain number) passes through unchanged. Ported verbatim from `getRate()`.
 *
 * **Hoisted out of the constructor closure to module scope** (deviation from the original, which
 * defines this as a closure inside the `Axis` constructor function): unlike `calculatePanel()`
 * (see below), `getRate()` truly is a pure function of its two parameters in the original too -
 * it never references `self`/`chart`/any other constructor-closure variable - so hoisting it
 * changes nothing observable and makes it directly hand-traceable/unit-testable in isolation.
 */
export function getRate(value: unknown, max: number): unknown {
  if (typeCheck("string", value) && (value as string).indexOf("%") > -1) {
    return max * (parseFloat((value as string).replace("%", "")) / 100);
  }

  return value;
}

// ---------------------------------------------------------------------------------------------
// Axis
// ---------------------------------------------------------------------------------------------

/**
 * Port of `chart.axis`'s `Axis` constructor function as a real ES class. Constructor params kept
 * 1:1: `(chart, originAxis, cloneAxis)`.
 */
export class Axis {
  private chart: AxisChart;
  private originAxis: AxisOptions;
  private cloneAxis: AxisOptions;

  // FIXED (Tier A - genuine port regression, confirmed against the real legacy source): the
  // original's `Axis` constructor keeps the map-instance memoization in a private CLOSURE
  // variable (`var map = null`), entirely separate from the public `this.map` property that
  // `reload()`/`drawMapType()` also read/write (the raw map config, then the rendered scale).
  // This port had collapsed both into a single `private map` class field sharing the SAME
  // storage as `axis["map"]` (since `drawMapType()` is always called with `axis === this`) - so
  // `reload()`'s `extend(this, {map: options.map})` overwrote this cache with the raw config
  // BEFORE `drawMapType()`'s `if (this.map == null)` guard ran, making it permanently see a
  // non-null (but non-`MapInstance`) value and never call `new MapCtor(...)` - real map charts
  // crashed on `this.map.render is not a function`. Restored as its own field, decoupled from
  // the `axis["map"]` config/scale slot.
  private mapInstance: MapInstance | null = null;

  private _area: AreaBox = { x: 0, y: 0, x2: 0, y2: 0, width: 0, height: 0 };
  private _padding: AxisPadding = { top: 0, bottom: 0, left: 0, right: 0 };
  private _clipId = "";
  private _clipPath: Element | null = null;
  private _clipRectId = "";
  private _clipRect: Element | null = null;

  // Mirrors of `cloneAxis`'s paging/3d fields, copied onto the instance by `init()`/`reload()`.
  /** The currently-displayed page's data slice out of `origin` (`origin.slice(start, end)`), kept
   *  in sync by `setScreen()`/`setZoom()`/`next()`/`prev()`/`update()`. See `init()`'s own doc
   *  comment for a preserved quirk where this can briefly be out of sync with `start`/`end`/`page`
   *  right after construction. */
  data: unknown[] = [];
  /** The full, unpaged dataset for this axis (aliased from `cloneAxis.data` during `init()`, then
   *  replaced wholesale by `update()`). `data` is always a slice of this. */
  origin: unknown[] = [];
  /** Page size (max rows per page) used by `setScreen()`'s paging math. Defaults to `10000`. */
  buffer = 10000;
  /** Number of rows `next()`/`prev()` step the window by. */
  shift = 1;
  /** This axis's index within the chart's `axis` array (mirrors `cloneAxis.index`). */
  index = 0;
  /** Current 1-based page number, as tracked/incremented by `setScreen()`. */
  page = 1;
  /** Start offset (inclusive) of `data` within `origin`. */
  start = 0;
  /** End offset (exclusive) of `data` within `origin`. */
  end = 0;
  // GENUINE PORT REGRESSION, found and fixed (not a preserved upstream bug - see below for the
  // full writeup): `degree` must NOT have an eager object-literal initializer like every other
  // field on this line, even though its declared TYPE is the same `{x,y,z}` shape `plane.ts`'s
  // own `this.baseAxis.degree.x = 0` etc. needs to keep compiling. The real engine's own
  // closure-based `Axis` constructor (`var Axis = function(chart, originAxis, cloneAxis) { var
  // self = this; ... }`, confirmed by reading the whole constructor body in
  // `www.jui-vue.io/lib/jui/js/chart.js`) never assigns `self.degree` to ANYTHING before `init()`
  // runs - `self.degree` is genuinely `undefined` at that point. `init()`'s own `_.extend(self, {
  // degree: cloneAxis.degree, ... })` (real engine AND this port, byte-identical `extend()`
  // implementations - see `util/base.js`'s `isRecursive()`/`extend()`) only takes the "recurse
  // into the existing object" branch when `isRecursive(origin[key])` - i.e. when `self.degree` is
  // ALREADY an object at the time of that call. Since it's `undefined` there in the real engine,
  // `isRecursive(undefined)` is `false`, so `self.degree = cloneAxis.degree` is a plain, DIRECT
  // assignment - works correctly for a real, standard-schema numeric `degree` config (e.g. the
  // `bar3d`/`column3d`/`cylinder3d`/`bubble3d` demo family's own top-level `degree: 30`), not just
  // the `{x,y,z}` object shape.
  //
  // This TS port previously declared `degree: {...} = { x: 0, y: 0, z: 0 }` - a real object,
  // eagerly assigned at construction, BEFORE `init()`'s own `extend()` call ever runs. That makes
  // `isRecursive(this.degree)` TRUE at that point (it's already a real object), so `extend()`
  // recurses INTO it instead of assigning directly: `extend(this.degree, cloneAxis.degree=30,
  // skip)` - and since `30` fails `typeCheck(["object","function"], 30)`, that recursive call
  // returns its target UNCHANGED, silently discarding the real `30` - `this.degree` stays `{x:0,
  // y:0,z:0}` forever after `init()`. `reload()`'s own tail (`this.degree = options.degree`, a
  // plain assignment, not `extend()`) DOES later correctly set it to `30` - but only AFTER `x`/
  // `y`/`z`/`c` have ALREADY drawn using the wrong, still-default `degree` earlier in that SAME
  // `reload()` call (see `reload()`'s own body: grids draw at lines ~847-851, `this.degree`/
  // `this.depth` aren't assigned until line ~859-860) - poisoning `CoreGrid.getGridSize()`'s
  // `depth > 0` branch (`radian(360 - degree)` where `degree` is still the stale `{x,y,z}` object
  // -> `NaN`) for any 2D (non-full-3D) grid sharing this axis with a `grid3d`/`c`-axis sibling -
  // this is what was producing the real, previously-unexplained NaN `d`/`transform` SVG attributes
  // across the entire `bar3d`/`column3d`/`cylinder3d`/`bubble3d`/cluster/stack/fullstack family
  // (13 real-site demos), traced via direct Playwright + instrumented-build debugging, NOT
  // inferred from a single read.
  //
  // Fix: drop the eager initializer (definite-assignment `!`, same "populated later externally"
  // idiom this file's own `root: TransElement | undefined`/`util/svg/element.ts`'s `element!`
  // already establish) so `this.degree` genuinely starts `undefined`, exactly like the real
  // engine's `self.degree` - `init()`'s `extend()` then takes the correct direct-assignment path
  // for a real numeric `degree` config, matching real, observed site behavior (Playwright-
  // verified against the live legacy site: these demos render correctly there, not NaN). This is
  // the "genuine port-introduced divergence, not a preserved bug" case explicitly called out by
  // this project's own rules - `getGridSize()`'s own header comment (grid/core.ts) documents the
  // DOWNSTREAM `NaN`-coercion behavior as a preserved bug in its own right (real engine: e.g. a
  // z-axis full-3D chart that ALSO configures a raw `{x,y,z}` object `degree` - that combination
  // genuinely does still coerce to `NaN` in both the real engine and this port, unaffected by this
  // fix) - this fix only corrects WHICH value `degree` actually holds by the time grids read it
  // for the extremely common "single numeric `degree`" config shape, not that downstream
  // NaN-coercion logic itself.
  degree!: { x: number; y: number; z: number };
  /** 3D depth factor read by grid rendering (`CoreGrid.getGridSize()`) when this axis is full-3D
   *  (see `isFull3D()`). */
  depth = 0;
  /** Perspective factor (0-1, where `1` means no perspective foreshortening) used by 3D grid
   *  rendering. Defaults to `0.9`. */
  perspective = 0.9;

  /** `this.root` - the axis background rect, set by `drawAxisBackground()` inside `reload()`. */
  root: TransElement | undefined;

  /**
   * `this.x`/`.y`/`.z`/`.c`/`.map` - genuinely two-phase-shaped, exactly like the original:
   * mid-`reload()` each is briefly the raw grid-config object (aliased from `options.x`/etc, via
   * `_.extend(this, {...})`), which `drawGridType()`/`drawMapType()` then mutate IN PLACE
   * (defaulting `.orient`/`.type`) - but by the time `reload()` returns, each has been
   * REASSIGNED to that grid's RENDERED scale (`elem.scale`, stamped with `.type`/`.root`), a
   * completely different shape than the config object it started as. `axis.get("x")` (which
   * reads `cloneAxis.x`, untouched by this reassignment) is what still returns the
   * (now-defaulted, since it's the SAME mutated object) config - not `axis.x` itself. Typed
   * `unknown` to reflect this honestly rather than picking one shape and lying about the other;
   * documented instead of "fixed" per Phase 0 rule 6.
   */
  x: unknown;
  y: unknown;
  z: unknown;
  c: unknown;

  constructor(chart: AxisChart, originAxis: AxisOptions, cloneAxis: AxisOptions) {
    this.chart = chart;
    this.originAxis = originAxis;
    this.cloneAxis = cloneAxis;

    this.init();
  }

  // -----------------------------------------------------------------------------------------
  // Private helpers (closures in the original, private methods here - all close over instance
  // state, unlike calculatePanel/getRate above).
  // -----------------------------------------------------------------------------------------

  /**
   * The core axis panel-layout arithmetic: resolves `a.x`/`a.y`/`a.width`/`a.height` (percentage
   * strings or plain numbers, via `getRate()`) against `this.chart.area('width'/'height')` -
   * **not** against `a`'s own `width`/`height` fields, even for resolving `a.width`/`a.height`
   * themselves (Node/hand-verified against the original: `a.width = getRate(a.width,
   * chart.area('width'))`, so both `a.x`/`a.width` and `a.y`/`a.height` percentage-resolve
   * against the SAME two chart maxes) - then derives `x2`/`y2` from the resolved box, shrinks it
   * inward by `padding` on each side, and recomputes `width`/`height` from the padded `x2`/`y2`.
   * Mutates and returns `a`.
   *
   * Cross-checked against jui-chart-vue's `useChartLayout.ts`'s `area` computed - its own Phase F
   * audit already matched this exact formula (`x:left, y:top, x2:width-right, y2:height-bottom`,
   * `width`/`height` derived from the padded box) - see `axis.spec.ts` for the reused hand-traced
   * values (`{x:48,y:20,x2:376,y2:268,width:328,height:248}` for a 400x300 chart with
   * `{top:20,right:24,bottom:32,left:48}` padding).
   */
  private calculatePanel(a: AreaInput & Record<string, unknown>, padding: Partial<AxisPadding>): AreaBox {
    const box = a as unknown as AreaBox;

    box.x = getRate(box.x, this.chart.area("width")) as number;
    box.y = getRate(box.y, this.chart.area("height")) as number;
    box.width = getRate(box.width, this.chart.area("width")) as number;
    box.height = getRate(box.height, this.chart.area("height")) as number;

    box.x2 = box.x + box.width;
    box.y2 = box.y + box.height;

    // 패딩 개념 추가 (add the padding concept)
    box.x += padding.left || 0;
    box.y += padding.top || 0;

    box.x2 -= padding.right || 0;
    box.y2 -= padding.bottom || 0;

    box.width = box.x2 - box.x;
    box.height = box.y2 - box.y;

    return box;
  }

  private drawGridType(axis: Record<string, unknown>, k: "x" | "y" | "z" | "c"): GridRenderedScale | null {
    if ((k === "x" || k === "y" || k === "z") && !typeCheck("object", axis[k])) return null;

    // 축 위치 설정 (set axis position)
    axis[k] = (axis[k] as Record<string, unknown>) || {};
    const gridCfg = axis[k] as Record<string, unknown>;

    if (k === "x") {
      gridCfg.orient = gridCfg.orient === "top" ? "top" : "bottom";
    } else if (k === "y") {
      gridCfg.orient = gridCfg.orient === "right" ? "right" : "left";
    } else if (k === "z") {
      gridCfg.orient = "center";
    } else if (k === "c") {
      gridCfg.type = gridCfg.type || "panel";
      gridCfg.orient = "custom";
    }

    gridCfg.type = gridCfg.type || "block";
    const GridCtor = this.chart.gridTypes[gridCfg.type as string];
    if (!GridCtor) return null;

    // 그리드 기본 옵션과 사용자 옵션을 합침 (merge grid defaults with user options) - walks the
    // FULL GridCtor -> CoreGrid -> Draw static setup() chain, not just GridCtor's own (see
    // `mergeSetupChain()`'s doc comment).
    mergeSetupChain(GridCtor, gridCfg);

    // 엑시스 기본 프로퍼티 정의 (define axis base properties)
    const obj = new GridCtor(this.chart, this, gridCfg);
    obj.chart = this.chart;
    obj.axis = this;
    obj.grid = gridCfg;
    obj.svg = this.chart.svg;

    const elem = obj.render();

    // 그리드 별 위치 선정하기 (z축이 없을 때) (position each grid, when there's no z-axis)
    if (!this.isFull3D()) {
      if (gridCfg.orient === "left") {
        elem.root.translate(this.chart.area("x") + this.area("x") - (gridCfg.dist as number), this.chart.area("y"));
      } else if (gridCfg.orient === "right") {
        elem.root.translate(this.chart.area("x") + this.area("x2") + (gridCfg.dist as number), this.chart.area("y"));
      } else if (gridCfg.orient === "bottom") {
        elem.root.translate(this.chart.area("x"), this.chart.area("y") + this.area("y2") + (gridCfg.dist as number));
      } else if (gridCfg.orient === "top") {
        elem.root.translate(this.chart.area("x"), this.chart.area("y") + this.area("y") - (gridCfg.dist as number));
      } else {
        if (elem.root) elem.root.translate(this.chart.area("x") + this.area("x"), this.chart.area("y") + this.area("y"));
      }
    }

    elem.scale.type = gridCfg.type as string;
    elem.scale.root = elem.root;

    return elem.scale;
  }

  private drawMapType(axis: Record<string, unknown>, k: "map"): GridRenderedScale | null {
    if (k === "map" && !typeCheck("object", axis[k])) return null;

    axis[k] = (axis[k] as Record<string, unknown>) || {};
    const mapCfg = axis[k] as Record<string, unknown>;

    const MapCtor = this.chart.mapType;
    if (!MapCtor) return null;

    // Same full-chain merge as `drawGridType()` above, applied consistently here too.
    mergeSetupChain(MapCtor, mapCfg);

    // 맵 객체는 한번만 생성함 (only construct the map object once)
    if (this.mapInstance == null) {
      this.mapInstance = new MapCtor(this.chart, this, mapCfg);
    }

    this.mapInstance.chart = this.chart;
    this.mapInstance.axis = this;
    this.mapInstance.map = mapCfg;
    this.mapInstance.svg = this.chart.svg;

    const elem = this.mapInstance.render();
    elem.root.translate(this.chart.area("x") + this.area("x"), this.chart.area("y") + this.area("y"));
    elem.scale.type = mapCfg.type as string;
    elem.scale.root = elem.root;

    return elem.scale;
  }

  private setScreen(pNo: number): void {
    const dataList = this.origin;
    const limit = this.buffer;
    const maxPage = Math.ceil(dataList.length / limit);

    // 최소 & 최대 페이지 설정 (clamp min/max page)
    if (pNo < 1) {
      this.page = 1;
    } else {
      this.page = pNo > maxPage ? maxPage : pNo;
    }

    this.start = (this.page - 1) * limit;
    this.end = this.start + limit;

    // 마지막 페이지 처리 (handle the last page)
    if (this.end > dataList.length) {
      this.start = dataList.length - limit;
      this.end = dataList.length;
    }

    if (this.end <= dataList.length) {
      this.start = this.start < 0 ? 0 : this.start;
      this.data = dataList.slice(this.start, this.end);

      if (dataList.length > 0) this.page++;
    }
  }

  private setZoom(start: number, end: number): void {
    const dataList = this.origin;

    this.end = end > dataList.length ? dataList.length : end;
    this.start = start < 0 ? 0 : start;
    this.data = dataList.slice(this.start, this.end);
  }

  private createClipPath(): void {
    // clippath with x, y
    if (this._clipPath) {
      this._clipPath.remove();
      this._clipPath = null;
    }

    this._clipId = "axis-clip-id-" + this.chart.index + "." + this.cloneAxis.index;

    this._clipPath = this.chart.svg.clipPath({ id: this._clipId }, () => {
      this.chart.svg.rect({
        x: this._area.x,
        y: this._area.y,
        width: this._area.width,
        height: this._area.height,
      });
    });
    this.chart.appendDefs(this._clipPath);

    // clippath without x, y
    if (this._clipRect) {
      this._clipRect.remove();
      this._clipRect = null;
    }

    this._clipRectId = "axis-clip-rect-id-" + this.chart.index;

    this._clipRect = this.chart.svg.clipPath({ id: this._clipRectId }, () => {
      this.chart.svg.rect({
        x: 0,
        y: 0,
        width: this._area.width,
        height: this._area.height,
      });
    });

    this.chart.appendDefs(this._clipRect);
  }

  private checkAxisPoint(e: MouseAxisEvent): boolean {
    const top = this.area("y");
    const left = this.area("x");

    if (e.chartY > top && e.chartY < top + this.area("height") && e.chartX > left && e.chartX < left + this.area("width")) {
      e.axisX = e.chartX - left;
      e.axisY = e.chartY - top;

      return true;
    }

    return false;
  }

  private setAxisMouseEvent(): void {
    let isMouseOver = false;
    const index = this.cloneAxis.index;

    this.chart.on("chart.mousemove", (e: MouseAxisEvent) => {
      if (this.checkAxisPoint(e)) {
        if (!isMouseOver) {
          this.chart.emit("axis.mouseover", [e, index]);
          isMouseOver = true;
        }
      } else {
        if (isMouseOver) {
          this.chart.emit("axis.mouseout", [e, index]);
          isMouseOver = false;
        }
      }

      if (this.checkAxisPoint(e)) {
        this.chart.emit("axis.mousemove", [e, index]);
      }
    });

    this.chart.on("bg.mousemove", (e: MouseAxisEvent) => {
      if (!this.checkAxisPoint(e) && isMouseOver) {
        this.chart.emit("axis.mouseout", [e, index]);
        isMouseOver = false;
      }
    });

    this.chart.on("chart.mousedown", (e: MouseAxisEvent) => {
      if (!this.checkAxisPoint(e)) return;
      this.chart.emit("axis.mousedown", [e, index]);
    });

    this.chart.on("chart.mouseup", (e: MouseAxisEvent) => {
      if (!this.checkAxisPoint(e)) return;
      this.chart.emit("axis.mouseup", [e, index]);
    });

    this.chart.on("chart.click", (e: MouseAxisEvent) => {
      if (!this.checkAxisPoint(e)) return;
      this.chart.emit("axis.click", [e, index]);
    });

    this.chart.on("chart.dblclick", (e: MouseAxisEvent) => {
      if (!this.checkAxisPoint(e)) return;
      this.chart.emit("axis.dblclick", [e, index]);
    });

    this.chart.on("chart.rclick", (e: MouseAxisEvent) => {
      if (!this.checkAxisPoint(e)) return;
      this.chart.emit("axis.rclick", [e, index]);
    });

    this.chart.on("chart.mousewheel", (e: MouseAxisEvent) => {
      if (!this.checkAxisPoint(e)) return;
      this.chart.emit("axis.mousewheel", [e, index]);
    });
  }

  private drawAxisBackground(): TransElement {
    const bw = this.chart.theme("axisBorderWidth") as number;
    const lr = this._padding.left + this._padding.right;
    const tb = this._padding.top + this._padding.bottom;

    const bg = this.chart.svg.rect({
      rx: this.chart.theme("axisBorderRadius"),
      ry: this.chart.theme("axisBorderRadius"),
      fill: this.chart.theme("axisBackgroundColor"),
      "fill-opacity": this.chart.theme("axisBackgroundOpacity"),
      stroke: this.chart.theme("axisBorderColor"),
      "stroke-width": bw,
      width: this._area.width + lr - bw,
      height: this._area.height + tb - bw,
      x: this._area.x - this._padding.left,
      y: this._area.y - this._padding.top,
    });

    bg.translate(this.chart.area("x"), this.chart.area("y"));

    return bg;
  }

  /**
   * **Preserved quirk, Node/hand-traced against the original, not introduced by this port**: the
   * `setScreen(this.page)`/`setZoom(...)` call below computes REAL `start`/`end`/`page`/`data`
   * values - but the very next call, `this.reload(cloneAxis)`, ends with `this.start =
   * options.start; this.end = options.end; this.page = options.page;` (see `reload()` below),
   * unconditionally snapping those three fields back to `cloneAxis`'s raw, PRE-paging config
   * values (`cloneAxis` is never updated by `setScreen`/`setZoom`, which only mutate `this`).
   * Net effect: right after construction, `this.data` holds the real, already-paged slice, while
   * `this.start`/`this.end`/`this.page` have been reset out from under it - the two are silently
   * out of sync until the next explicit `screen()`/`next()`/`prev()`/`zoom()` call. Verified in
   * `axis.spec.ts`.
   */
  private init(): void {
    const cloneAxis = this.cloneAxis;

    extend(this, {
      data: cloneAxis.data,
      origin: cloneAxis.origin,
      buffer: cloneAxis.buffer,
      shift: cloneAxis.shift,
      index: cloneAxis.index,
      page: cloneAxis.page,
      start: cloneAxis.start,
      end: cloneAxis.end,
      degree: cloneAxis.degree,
      depth: cloneAxis.depth,
      perspective: cloneAxis.perspective,
    });

    // 원본 데이터 설정 (set the original data)
    this.origin = this.data;

    // 페이지 초기화 (initialize paging)
    if (this.start > 0 || this.end > 0) {
      this.setZoom(this.start, this.end);
    } else {
      this.setScreen(this.page);
    }

    // 엑시스 이벤트 설정 (set up axis events)
    this.setAxisMouseEvent();

    // Grid 및 Area 설정 (set up grid + area)
    this.reload(cloneAxis);
  }

  // -----------------------------------------------------------------------------------------
  // Public API - kept 1:1 with the original.
  // -----------------------------------------------------------------------------------------

  /**
   * @method getValue
   * Maps a specific field's value out of a data row, resolving through `cloneAxis.keymap` first.
   */
  getValue(data: Record<string, unknown>, fieldString: string, defaultValue?: unknown): unknown {
    let value = data[this.cloneAxis.keymap?.[fieldString] as string];
    if (!typeCheck("undefined", value)) {
      return value;
    }

    value = data[fieldString];
    if (!typeCheck("undefined", value)) {
      return value;
    }

    return defaultValue;
  }

  /**
   * @method reload
   * (Re)builds the axis's x/y/z/c grids (and map) and recomputes its display area.
   */
  reload(options: AxisOptions): void {
    const area = this.chart.area();

    extend(this, {
      x: options.x,
      y: options.y,
      z: options.z,
      c: options.c,
      map: options.map,
    });

    // 패딩 옵션 설정 (set padding option)
    if (typeCheck("integer", options.padding)) {
      const p = options.padding as number;
      this._padding = { left: p, right: p, bottom: p, top: p };
    } else if (typeCheck("object", options.padding)) {
      this._padding = options.padding as AxisPadding;
    } else {
      // BUGFIX (genuine engine gap, not a preserved quirk) - see `base/builder.ts`'s
      // `setDefaultOptions()` for the full explanation: a non-object/non-integer `padding` (e.g.
      // the legacy magic string `"empty"`) must normalize to explicit zero padding, not fall
      // through to `drawAxisBackground()`'s `this._padding.left + this._padding.right` producing
      // NaN (`undefined + undefined`) and a `<rect width="NaN">` console error.
      this._padding = { left: 0, right: 0, bottom: 0, top: 0 };
    }

    this._area = this.calculatePanel(
      extend(options.area, { x: 0, y: 0, width: area.width, height: area.height }, true),
      this._padding,
    );

    // 클립 패스 설정 (set up the clip path)
    this.createClipPath();

    this.root = this.drawAxisBackground();
    this.x = this.drawGridType(this as unknown as Record<string, unknown>, "x");
    this.y = this.drawGridType(this as unknown as Record<string, unknown>, "y");
    this.z = this.drawGridType(this as unknown as Record<string, unknown>, "z");
    this.c = this.drawGridType(this as unknown as Record<string, unknown>, "c");
    (this as unknown as Record<string, unknown>).map = this.drawMapType(this as unknown as Record<string, unknown>, "map");

    this.buffer = options.buffer as number;
    this.shift = options.shift as number;
    this.index = options.index as number;
    this.page = options.page as number;
    this.start = options.start as number;
    this.end = options.end as number;
    this.degree = options.degree as { x: number; y: number; z: number };
    this.depth = options.depth as number;
    this.perspective = options.perspective as number;
  }

  /**
   * @method area
   * Returns the axis's display area (or a single `x`/`y`/`width`/`height` value from it).
   */
  area(): AreaBox;
  area(key: "x" | "y" | "x2" | "y2" | "width" | "height"): number;
  area(key?: string): AreaBox | number {
    return typeCheck("undefined", key ? (this._area as unknown as Record<string, unknown>)[key] : undefined)
      ? this._area
      : (this._area as unknown as Record<string, unknown>)[key as string] as number;
  }

  /** Gets the top, bottom, left and right margin values. */
  padding(): AxisPadding;
  padding(key: "top" | "bottom" | "left" | "right"): number;
  padding(key?: string): AxisPadding | number {
    return typeCheck("undefined", key ? (this._padding as unknown as Record<string, unknown>)[key] : undefined)
      ? this._padding
      : (this._padding as unknown as Record<string, unknown>)[key as string] as number;
  }

  /**
   * @method get
   * Returns axis option info: `area`/`padding`/`clipId`/`clipRectId` from private state, anything
   * else falls through to `cloneAxis[type]` (the ORIGINAL config, distinct from the live `this.x`/
   * etc - see the field doc comments above).
   */
  get(type: string): unknown {
    const obj: Record<string, unknown> = {
      area: this._area,
      padding: this._padding,
      clipId: this._clipId,
      clipRectId: this._clipRectId,
    };

    return obj[type] || this.cloneAxis[type];
  }

  /**
   * @method set
   * Updates a key property of the axis (mutates both `originAxis` and `cloneAxis`, then
   * re-renders if the chart is already rendered).
   */
  set(type: string, value: unknown, isReset?: boolean): void {
    if (typeCheck("object", value)) {
      if (isReset === true) {
        this.originAxis[type] = deepClone(value);
        this.cloneAxis[type] = deepClone(value);
      } else {
        extend(this.originAxis[type], value);
        extend(this.cloneAxis[type], value);
      }
    } else {
      this.originAxis[type] = value;
      this.cloneAxis[type] = value;
    }

    if (this.chart.isRender()) this.chart.render();
  }

  /**
   * @deprecated
   * @method updateGrid
   * Alias for `set()`, kept for backward compatibility (matches the original's `this.updateGrid =
   * this.set;`).
   */
  updateGrid(type: string, value: unknown, isReset?: boolean): void {
    this.set(type, value, isReset);
  }

  /**
   * @method update
   * Replaces the axis's data and resets paging back to page 1.
   */
  update(data: unknown): void {
    this.origin = typeCheck("array", data) ? (data as unknown[]) : [data];
    this.page = 1;
    this.start = 0;
    this.end = 0;

    this.screen(1);
  }

  /**
   * @method screen
   * Pages the displayed data.
   */
  screen(pNo: number): void {
    this.setScreen(pNo);

    if (this.end <= this.origin.length) {
      if (this.chart.isRender()) this.chart.render();
    }
  }

  /** @method next */
  next(): void {
    const dataList = this.origin;
    const limit = this.buffer;
    const step = this.shift;

    this.start += step;

    const isLimit = this.start + limit > dataList.length;

    this.end = isLimit ? dataList.length : this.start + limit;
    this.start = isLimit ? dataList.length - limit : this.start;
    this.start = this.start < 0 ? 0 : this.start;
    this.data = dataList.slice(this.start, this.end);

    if (this.chart.isRender()) this.chart.render();
  }

  /** @method prev */
  prev(): void {
    const dataList = this.origin;
    const limit = this.buffer;
    const step = this.shift;

    this.start -= step;

    const isLimit = this.start < 0;

    this.end = isLimit ? limit : this.start + limit;
    this.start = isLimit ? 0 : this.start;
    this.data = dataList.slice(this.start, this.end);

    if (this.chart.isRender()) this.chart.render();
  }

  /**
   * @method zoom
   * Re-fits the data to a specific index range.
   */
  zoom(start: number, end: number): void {
    if (start === end) return;

    this.setZoom(start, end);
    if (this.chart.isRender()) this.chart.render();
  }

  /**
   * @method isFull3D
   * Whether this axis has a configured z-grid: `true` whenever `this.z` (the rendered scale
   * `drawGridType()` produced for the `"z"` slot in `reload()`) is neither `undefined` nor `null`.
   * `drawGridType()` only returns a non-`null` scale for `"z"` when `axis.z` was itself a real
   * config object, so this effectively answers "did this axis configure a z-axis" - used by
   * `drawGridType()` itself to decide whether x/y/z/c grids get individually positioned (2D
   * layout) or left for the 3D rotation pipeline to place instead.
   */
  isFull3D(): boolean {
    return !typeCheck(["undefined", "null"], this.z);
  }

  /**
   * Default option values, matching `Axis.setup()` in the original (used by whatever assembles
   * the chart to merge user-supplied axis config with these defaults before construction - kept
   * as a static for parity, not invoked internally by this file itself, same as the original).
   */
  static setup(): AxisOptions & { extend: number | null } {
    return {
      extend: null,
      x: null,
      y: null,
      z: null,
      c: null,
      map: null,
      data: [],
      origin: [],
      keymap: {},
      area: {},
      padding: {
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
      },
      buffer: 10000,
      shift: 1,
      page: 1,
      start: 0,
      end: 0,
      degree: {
        x: 0,
        y: 0,
        z: 0,
      },
      depth: 0,
      perspective: 0.9,
    };
  }
}
