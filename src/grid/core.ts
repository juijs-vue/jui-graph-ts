// Port of juijs-graph's `src/grid/core.js` ("chart.grid.core", extend: "chart.draw").
//
// ============================================================================================
// REAL EXTEND TARGET IS `base/draw.ts`'s `Draw`, NOT `base/core.ts`'s `Core` (a finding this
// file's own assignment specifically had to verify, not assume)
//
// The original's own `extend: "chart.draw"` field (confirmed by grep across ALL 14 remaining
// `grid/*.js` files too - see PORT_STATUS.md's Phase C dependency map) settles this precisely:
// `CoreGrid` extends `Draw` (`base/draw.js`'s "chart.draw", already ported), not `Core`
// (`base/core.js`'s "core", the base every `chart.builder`/`chart.plane`-family class extends).
// These are two ENTIRELY SEPARATE inheritance families in the original engine - `Core` is the
// per-instance-event-bus/option-merge base for top-level UI objects (`Builder`/`Plane`, and
// future `brush/core.js`/`widget/core.js`); `Draw` is the render-lifecycle mixin base
// (`render()`/`format()`/`calculate3d()`/`on()`) for anything that gets `chart`/`axis`/`grid`/
// `svg` wired onto it externally and produces SVG output (`grid.*`, and future `brush/*/core.js`/
// `widget/*/core.js`). `CoreGrid` needs the LATTER: `render()` (via `Draw`, invoking whatever
// `this.draw` a concrete grid subclass assigns), `calculate3d()` (used by 3D grid subclasses,
// Phase C future items), and `on()` (unused by `CoreGrid` itself but inherited for subclasses).
// `class CoreGrid extends Draw` below, constructor kept 1:1 (the original's own `CoreGrid`
// constructor function takes ZERO parameters - `chart`/`axis`/`grid`/`svg` are wired onto the
// instance externally, by `base/axis.ts`'s `drawGridType()`, AFTER `new GridCtor(...)` - see the
// "GridConstructor/GridInstance reconciliation" section below for why a 0-arg constructor still
// satisfies `GridConstructor`'s declared `new (chart, axis, gridOptions) => GridInstance` shape).
//
// ============================================================================================
// `CoreGrid` IS GENUINELY ABSTRACT - never meant to be instantiated directly, in the original too
//
// Reading `grid/core.js` in full (`this.wrapper`/`this.line`/`this.color`/`this.data`/
// `this.getGridSize`/`this.getDefaultOffset`/`this.getTextRotate`/`this.getLineOption`/
// `this.checkDrawLineY`/`this.checkDrawLineX`/`this.drawTop`/`this.drawBottom`/`this.drawLeft`/
// `this.drawRight`/`this.drawGrid`/`this.drawAfter`) shows it NEVER assigns `this.draw` (the one
// field `Draw.render()` requires to be a function, or it throws
// `"JUI_CRITICAL_ERR: 'draw' method must be implemented"`), and `this.drawGrid()` itself looks up
// `this[this.grid.orient]` (i.e. `this.top`/`this.bottom`/`this.left`/`this.right`/`this.center`/
// `this.custom`, depending on config) - NONE of which `CoreGrid` defines either. Both are always
// supplied by a concrete leaf subclass (confirmed via `grid/block.js`, Phase C's first real
// subclass to read: `BlockGrid` defines `this.draw = function(){ return this.drawGrid("block"); }`
// plus `this.top`/`.bottom`/`.left`/`.right`/`.center`, each calling back into `CoreGrid`'s own
// `this.drawTop`/`.drawBottom`/`.drawLeft`/`.drawRight`). Every concrete grid subclass is Phase C
// future work (this task's own scope is `grid/core.ts` ONLY, per its instructions) - `CoreGrid` is
// therefore correctly abstract here too: constructing a bare `new CoreGrid()` and calling
// `.render()` throws the same `Error` the original would via the exact same `Draw.render()` guard,
// not a port-introduced restriction.
//
// ============================================================================================
// THE `draw2d.js`/`draw3d.js` RUNTIME METHOD-MIXIN (a real, load-bearing product mechanism -
// preserved via an explicit registration hook, NOT a registry artifact to drop)
//
// `this.drawGrid()`'s own body (see below) does `var draw = (this.axis.isFull3D()) ? Draw3D :
// Draw2D; ... draw.call(this);` where `Draw2D`/`Draw3D` are `jui.include("chart.grid.draw2d")`/
// `jui.include("chart.grid.draw3d")` - i.e. the `Draw2DGrid`/`Draw3DGrid` CONSTRUCTOR FUNCTIONS
// themselves (not instances). Calling `Draw2DGrid.call(this)` with `this` bound to the `CoreGrid`
// instance runs that constructor's body, which does nothing but `this.createGridX = function(){...}`
// / `this.createGridY = ...` / `this.drawPattern = ...` / etc. - i.e. it MIXES that whole 2D-or-3D
// method set onto the grid instance, monkeypatching over whichever set (if any) was mixed in by a
// PRIOR render pass. This is genuine, real, per-render-call product behavior (dynamically
// switching a grid's line/text/pattern-drawing implementation between the 2D and 3D variants based
// on `axis.isFull3D()`) - NOT the string-keyed `jui.include(...)` registry pattern Phase 0 rules
// 1/4 authorize dropping (the STRING LOOKUP that resolved `Draw2D`/`Draw3D` in the first place is
// the registry artifact; the resulting `.call(this)` mixin-application is real behavior once
// resolved, same distinction `base/axis.ts`'s own `GridConstructor`/`MapConstructor` header comment
// already draws for grid/map type resolution).
//
// `grid/draw2d.js`/`grid/draw3d.js` are this task's OWN assignment to map (not port) - see
// PORT_STATUS.md's Phase C dependency map; they don't exist as `.ts` files yet. Resolved via an
// explicit, typed registration hook (`registerGridDraw2D`/`registerGridDraw3D` below), the same
// established pattern `base/builder.ts` already used for its own not-yet-ported `Axis`
// (`registerAxis`) and not-yet-ported `chart.brush.*`/`chart.widget.*` (`registerBrush`/
// `registerWidget`) sibling dependencies. `drawGrid()` throws a clear, named error if neither has
// been registered yet by the time a concrete grid subclass actually needs one (matching the
// original's own behavior exactly for an unresolved `jui.include(...)` call: a hard failure, not a
// silent no-op) - preserving, too, the original's exact structural quirk that the mixin is applied
// ONLY inside the `if(_.typeCheck("function", func))` guard (i.e. never invoked at all if
// `this.grid.orient` doesn't resolve to a defined orient-method - see `drawGrid()` below).
// Intended reconciliation once `grid/draw2d.ts`/`grid/draw3d.ts` land: each registers its own
// mixin-applier via these hooks (e.g. `registerGridDraw2D((target) => Object.assign(target, new
// Draw2DGrid()))`), no change needed here.
//
// ============================================================================================
// `GridConstructor`/`GridInstance` (`base/axis.ts`) RECONCILIATION - precisely what needed
// adjusting and why
//
// `axis.ts`'s `GridConstructor`/`GridInstance` were written before ANY `grid/*.ts` file existed,
// as a minimal structural placeholder for "whatever a real grid class turns out to need". Now that
// `CoreGrid` (the real base every concrete grid extends) exists, two real gaps surfaced,
// resolved WITHOUT touching `axis.ts` itself (kept deliberately out of this task's blast radius -
// its own `AxisChart` interface is precisely the minimal slice `axis.js` itself calls, and
// `axis.js` never calls `chart.axis(...)`/`chart.color(...)`/`chart.theme(a,b,c)` - only
// `grid/core.js`'s OWN methods do, via `Draw.on()`'s `self.chart.axis(...)` and `CoreGrid.color()`'s
// `this.chart.color(...)`/3-arg `this.chart.theme(...)` forwarding):
//   1. `GridConstructor`'s declared `new (chart, axis, gridOptions) => GridInstance` shape assumes
//      a 3-parameter constructor - but the REAL `CoreGrid` (and, per `grid/block.js`, every real
//      subclass but `grid/table.js`'s `TableGrid(chart, axis, grid)` - a genuine, documented
//      per-file exception, see PORT_STATUS.md's dependency map) takes ZERO constructor parameters,
//      matching `base/axis.ts`'s own `drawGridType()` which wires `chart`/`axis`/`grid`/`svg` onto
//      the instance via property assignment AFTER `new GridCtor(...)`, not via the constructor
//      arguments it nonetheless (redundantly, harmlessly) passes. No interface CHANGE was needed
//      here - TypeScript already allows a fewer-parameter constructor to satisfy a
//      more-parameter constructor type (the same "implementation may ignore trailing parameters"
//      rule ordinary function assignability uses) - confirmed via the compile-time check
//      `gridConstructorTypeCheck` below, not just asserted.
//   2. `GridInstance.chart: AxisChart` / `.axis: Axis` are too NARROW for what `CoreGrid`'s real
//      `extend: "chart.draw"` base (`Draw`) needs from `this.chart` (`Draw.on()`'s
//      `self.chart.axis(self.axis.index)`, `Draw.format()`'s `this.chart.format` fallback) and
//      what `CoreGrid`'s OWN methods need (`color()`'s `this.chart.color(colorConfig)` and its
//      3-argument `this.chart.theme(isActive, activeKey, inactiveKey)` form) - none of which
//      `axis.js` itself ever calls, so `AxisChart` correctly never declared them. Resolved via a
//      local `GridChart` type (`AxisChart` intersected with exactly these extra members, defined
//      below) used ONLY as this file's own `chart` field override type - `AxisChart` itself is
//      untouched. Confirmed these extra members are real, already-present `Builder` (the concrete
//      `AxisChart` implementation) surface, not invented: `src/base/builder.ts` already has
//      `axis(key?: number): any`, `color(key?: any, colors?: any[]): string`, and
//      `theme(key?: any, value?: any, value2?: any): any` (already loosely 3-arg-capable) - so a
//      real `Builder` instance satisfies `GridChart` today, with zero changes needed there either.
// ============================================================================================

import { Draw } from "../base/draw";
import type { Axis, AxisChart, GridConstructor, GridInstance } from "../base/axis";
import type { TransElement } from "../util/svg/element.transform";
import { radian } from "../util/math";

// ---- inlined `util/base.js` typeCheck/extend (same per-file convention as `util/dom.ts`,
// `base/axis.ts`, `base/builder.ts`, `base/core.ts`, `base/draw.ts` - no shared helper module
// exists in this port) --------------------------------------------------------------------------
type TypeCheckable = unknown;

/** Tier A fix (defect 6 - same root defect family as `grid3d.ts`'s defect 5): resolves
 * `axis.degree` to a genuine, finite NUMBER before it's used in `radian(360 - degree)`-shaped
 * arithmetic below. See `grid3d.ts`'s own `resolveDegree()` doc comment for the full reasoning
 * (Node/legacy-source-cross-checked: the real engine has no existing convention anywhere for
 * reducing the raw `{x,y,z}` config object to a single scalar for this kind of 2D-angle math -
 * `degree.z` is picked arbitrarily but applied consistently at both of this port's
 * degree-object-coerced-to-NaN call sites). Duplicated per-file rather than shared, matching this
 * port's own established per-file-inlined-helper convention (see `typeCheck`/`extend` above). */
function resolveDegree(degree: unknown): number {
  if (typeof degree === "number") return degree;
  if (degree && typeof degree === "object" && typeof (degree as { z?: unknown }).z === "number") {
    return (degree as { z: number }).z;
  }
  return 0;
}

function typeCheck(type: string | string[], value: TypeCheckable): boolean {
  function check(t: string, v: TypeCheckable): boolean {
    if (typeof t !== "string") return false;
    if (t === "string") return typeof v === "string";
    if (t === "function") return typeof v === "function";
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

/** 1:1 port of `util.base`'s `extend(origin, add)` (non-`skip` overwrite form - the only form
 * `grid/core.js` itself ever calls, via `line()`'s attribute-default merge). */
function extend(origin: Record<string, unknown>, add: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!typeCheck("object", add)) return origin;
  for (const key in add) {
    origin[key] = add![key];
  }
  return origin;
}

// ---------------------------------------------------------------------------------------------
// GridConstructor/GridInstance reconciliation - see header comment for the full "why".
// ---------------------------------------------------------------------------------------------

/** This file's own minimal extra slice of the real chart (`Builder`) surface `CoreGrid`'s
 * `extend: "chart.draw"` base (`Draw.on()`/`Draw.format()`) and `CoreGrid.color()` need, beyond
 * what `axis.ts`'s narrower `AxisChart` declares (which `axis.js` itself never calls). */
export type GridChart = AxisChart & {
  /** `Draw.on()`'s `self.chart.axis(self.axis.index)` - multi-axis lookup by index. */
  axis(index?: number): unknown;
  /** `Draw.format()`'s fallback when a grid doesn't define its own `format`. */
  format?: (...args: unknown[]) => unknown;
  /** `CoreGrid.color()`'s `this.chart.color(color)` - resolves a grid's configured `color`
   * (string/object/palette-index) through the chart's color palette. */
  color(colorConfig: unknown): string;
  /** `CoreGrid.color()`'s 3-argument forwarding form (`this.chart.theme.apply(this.chart,
   * arguments)` when `color()` itself is called with 3 arguments, e.g.
   * `this.color(isActive, "gridActiveBorderColor", "gridXAxisBorderColor")` in `grid/draw2d.js`). */
  theme(isActive: boolean, activeKey: string, inactiveKey: string): string | number;
};

/** Applies a `grid/draw2d.ts`/`grid/draw3d.ts` mixin (once ported, Phase C) onto a `CoreGrid`
 * instance - the real-import-based replacement for the original's `Draw2DGrid.call(this)` /
 * `Draw3DGrid.call(this)` runtime method-mixin (see header comment). */
export type GridDrawMixinApplier = (target: CoreGrid) => void;

let draw2DMixin: GridDrawMixinApplier | null = null;
let draw3DMixin: GridDrawMixinApplier | null = null;

/** Registers `grid/draw2d.ts`'s mixin applier (Phase C, not yet ported). */
export function registerGridDraw2D(mixin: GridDrawMixinApplier): void {
  draw2DMixin = mixin;
}

/** Registers `grid/draw3d.ts`'s mixin applier (Phase C, not yet ported). */
export function registerGridDraw3D(mixin: GridDrawMixinApplier): void {
  draw3DMixin = mixin;
}

/** Test-only escape hatch (mirrors the pattern a real app would never need, but a spec file
 * re-running across multiple `it()` blocks does, since the module-level mixin slots above are
 * otherwise permanent process-wide state once registered). Not part of the original 1:1 surface. */
export function __resetGridDrawMixinsForTesting(): void {
  draw2DMixin = null;
  draw3DMixin = null;
}

// ---------------------------------------------------------------------------------------------
// CoreGrid
// ---------------------------------------------------------------------------------------------

/**
 * Port of `chart.grid.core`'s `CoreGrid` constructor function as a real ES class, per Phase 0
 * rule 2. Constructor kept 1:1: the original takes ZERO parameters (see header comment) - real
 * subclasses (Phase C, e.g. `BlockGrid`) get `chart`/`axis`/`grid`/`svg` wired onto them
 * externally by `base/axis.ts`'s `drawGridType()`, not via construction.
 */
export class CoreGrid extends Draw implements GridInstance {
  // Narrower/extra-member overrides of `Draw`'s own `chart!: DrawChartLike`/`axis!: DrawAxisLike`
  // fields - see header comment's reconciliation section for exactly why these are needed (and
  // confirmed assignable both ways: `GridChart`/`Axis` are subtypes of `Draw`'s own field types,
  // legal TS field-override narrowing, AND `GridChart`/`Axis` satisfy `GridInstance.chart`/`.axis`).
  declare chart: GridChart;
  declare axis: Axis;

  /** The grid's resolved scale function (e.g. an `ordinal()`/`linear()` scale from
   * `util/scale.ts`, Phase A) - set by a concrete subclass's own `drawBefore()` (e.g.
   * `BlockGrid.drawBefore()` sets `this.scale = UtilScale.ordinal().domain(...)`), read/rewrapped
   * by `wrapper()`/`drawGrid()` below. `any` (not a Phase A scale type) since `CoreGrid` itself is
   * agnostic to which concrete scale shape a subclass chooses (ordinal/linear/time/log/circle all
   * appear across the real `grid/*.js` family - see PORT_STATUS.md's dependency map). */
  scale: any;

  /** Builds one x-axis grid line/tick element at `position` (`"top"`/`"bottom"`) - mixed in
   * externally by `registerGridDraw2D`/`registerGridDraw3D`'s applier (see header comment) before
   * first use; calling it before a mixin has run throws the same "not a function"-shaped
   * `TypeError` the original untyped engine would too (never a silent no-op - definite-assignment
   * `!`, matching `Draw`'s own `chart!`/`axis!` convention). */
  createGridX!: (position: string, index: number, x: number, isActive: boolean, isLast: boolean) => TransElement;
  /** Same as `createGridX` above, for a y-axis grid line/tick at `position` (`"left"`/`"right"`). */
  createGridY!: (position: string, index: number, y: number, isActive: boolean, isLast: boolean) => TransElement;
  /** Draws one tick's own background/pattern image (`grid.image`), if configured - mixed in the
   * same way as `createGridX`/`createGridY` above. */
  drawImage!: (orient: string, g: TransElement, tick: unknown, index: number, x: number, y: number) => void;

  /**
   * @method wrapper
   * scale wrapper - identity in `CoreGrid` itself (real subclasses, e.g. `BlockGrid`, override
   * this to wrap `this.scale` so index-based lookups can resolve through a configured `grid.key`
   * field instead of a raw index - see the original's own doc comment, preserved verbatim above
   * this method... er, below, in the class body).
   * @protected
   */
  wrapper(scale: any, _key?: string): any {
    return scale;
  }

  /**
   * @method line
   * theme 이 적용된 line 리턴 (returns a themed `<line>` element).
   * @protected
   */
  line(attr?: Record<string, unknown>): TransElement {
    return this.chart.svg.line(
      extend(
        {
          x1: 0,
          y1: 0,
          x2: 0,
          y2: 0,
          stroke: this.color("gridBorderColor"),
          "stroke-width": this.chart.theme("gridBorderWidth"),
          "stroke-dasharray": this.chart.theme("gridBorderDashArray"),
          "stroke-opacity": this.chart.theme("gridBorderOpacity"),
        },
        attr,
      ),
    );
  }

  /**
   * @method color
   * grid 에서 color 를 위한 유틸리티 함수 (grid color-resolution utility).
   *
   * Kept as a variadic, `arguments`-reading method (not a rest-param signature) for 1:1 fidelity
   * with the original's own `arguments.length == 3` branch, which callers (e.g. `grid/draw2d.js`'s
   * `this.color(isActive, "gridActiveBorderColor", "gridXAxisBorderColor")`) genuinely rely on.
   */
  color(theme: unknown, _activeKey?: string, _inactiveKey?: string): unknown {
    const color = (this.grid as Record<string, unknown>).color;

    if (arguments.length === 3) {
      return color != null
        ? this.chart.color(color)
        : (this.chart.theme as (...args: unknown[]) => unknown).apply(this.chart, arguments as unknown as unknown[]);
    }

    return color != null ? this.chart.color(color) : this.chart.theme(theme as string);
  }

  /**
   * @method data
   * get data for axis
   * @protected
   */
  data(index?: number, field?: string): unknown {
    const axisData = this.axis.data as unknown[];

    if (axisData && index !== undefined && axisData[index] !== undefined) {
      const row = axisData[index] as Record<string, unknown>;
      return (field !== undefined ? row[field] : undefined) || row;
    }

    return axisData || [];
  }

  /** The grid line's own start/size/end extent along its perpendicular axis (e.g. a `"left"`/
   * `"right"`-oriented grid's vertical extent comes from `axis.area("y")`/`"height"`, a `"top"`/
   * `"bottom"` one from `"x"`/`"width"`) - used to size the grid's own border/tick lines. See the
   * inline comment just below for a Tier A fix (defect 6) to a `NaN`-poisoning bug the
   * 3D-rotation branch's non-full-3D case used to hit for an object-shaped `axis.degree`. */
  getGridSize(): { start: number; size: number; end: number } {
    const orient = (this.grid as Record<string, unknown>).orient as string;
    const depth = this.axis.depth;
    const degree = this.axis.degree;
    const axisPos = orient === "left" || orient === "right" ? this.axis.area("y") : this.axis.area("x");
    const max = orient === "left" || orient === "right" ? this.axis.area("height") : this.axis.area("width");
    const start = axisPos;
    const size = max;
    const end = start + size;

    const result = { start, size, end };

    if (!this.axis.isFull3D()) {
      // FIXED (Tier A defect 6) - was documented here as a preserved bug: `depth > 0 || degree >
      // 0` used to compare the raw `degree` value against the number `0` - when `degree`
      // genuinely IS an object (`{x,y,z}`, the shape `Axis.setup()`'s own documented default
      // uses), JS's abstract relational comparison coerces it via `ToPrimitive`/`ToNumber` (no
      // custom `valueOf`, falls through to `toString()` -> `"[object Object]"` -> `NaN`), so
      // `degree > 0` was `false` and, if this branch ran anyway (because `depth > 0`),
      // `math.radian(360 - degree)` performed the SAME coercion (`360 - NaN` = `NaN`) - `x2`/`y2`
      // below were `NaN`, silently poisoning `result.start`/`result.size`/`result.end`. Confirmed
      // byte-identical in the real engine's own `chart.js`/`grid/core.js` (Node/legacy-source-
      // cross-checked directly - same `_.extend`/coercion behavior, no existing fallback anywhere
      // in the original for this exact object-shaped case) - reachable whenever a 2D (non-full-3D)
      // grid shares an axis with an ACTUAL object-shaped `degree` config, i.e. the default,
      // un-overridden case.
      //
      // `degree` is NOT always an object in practice - the extremely common case (the
      // `bar3d`/`column3d`/`cylinder3d`/`bubble3d`/cluster/stack/fullstack family's own top-level
      // `degree: 30`-style numeric config) is a real NUMBER here, and this branch already handled
      // that correctly (`30 > 0` is `true`, `radian(360-30)` is a real angle, `x2`/`y2` are real
      // numbers) - see `base/axis.ts`'s `degree` field doc comment for the GENUINE PORT
      // REGRESSION (now fixed) that used to make this TS port's `Axis.degree` wrongly stay an
      // object even for a numeric config, poisoning this exact branch with `NaN` for that whole
      // brush family. Now: `resolveDegree()` (see above) resolves the object-shaped case to a
      // real, finite number (`degree.z`) instead of leaving it to coerce to `NaN` - same fix
      // (same helper design, applied consistently) as `grid3d.ts`'s own defect-5 fix. Tested (both
      // the now-fixed object-degree case and the already-correct numeric-degree case).
      const degreeNum = resolveDegree(degree);

      if (depth > 0 || degreeNum > 0) {
        const rad = radian(360 - degreeNum);
        const x2 = Math.cos(rad) * depth;
        const y2 = Math.sin(rad) * depth;

        if (orient === "left") {
          result.start = result.start - y2;
          result.size = result.size - y2;
        } else if (orient === "bottom") {
          result.end = result.end - x2;
          result.size = result.size - x2;
        }
      }
    } else {
      if (orient === "center") {
        // z축 (z-axis)
        result.start = 0;
        result.size = depth;
        result.end = depth;
      }
    }

    return result;
  }

  /**
   * @method getDefaultOffset
   * get real size of grid
   */
  getDefaultOffset(): { start: number; size: number; end: number } {
    const orient = (this.grid as Record<string, unknown>).orient as string;
    const area = this.axis.area();

    const width = area.width;
    const height = area.height;
    const axisPos = orient === "left" || orient === "right" ? area.y : area.x;
    const max = orient === "left" || orient === "right" ? height : width;
    const start = axisPos;
    const size = max;
    const end = start + size;

    return { start, size, end };
  }

  /**
   * @method getTextRotate
   * implement text rotate in grid text
   * @protected
   */
  getTextRotate(textElement: TransElement): TransElement {
    let rotate = (this.grid as Record<string, unknown>).textRotate as unknown;

    if (rotate == null) {
      return textElement;
    }

    if (typeCheck("function", rotate)) {
      rotate = (rotate as (...args: unknown[]) => unknown).apply(this.chart, [textElement]);
    }

    const x = textElement.attr("x");
    const y = textElement.attr("y");

    textElement.rotate(rotate, x, y);

    return textElement;
  }

  /** Normalizes the grid's own `line` config into a `{type, ...}` object: a string becomes
   * `{type: line}`, a number becomes `{type: "solid", "stroke-width": line}`, any other truthy
   * value becomes `{type: "solid"}`, and a falsy value stays falsy (no line drawn at all). See the
   * inline comment just below on a real, preserved dead-code bug in the multi-word-`type`-splitting
   * branch. */
  getLineOption(): unknown {
    let line: any = (this.grid as Record<string, unknown>).line;

    if (typeof line === "string") {
      line = { type: line || "solid" };
    } else if (typeof line === "number") {
      line = { type: "solid", "stroke-width": line };
    } else if (typeof line !== "object") {
      line = !!line;

      if (line) {
        line = { type: "solid" };
      }
    }

    // **Preserved bug, Node/hand-verified, not obvious from a single read**: `!line.type ==
    // "string"` parses as `(!line.type) == "string"` (`!` binds tighter than `==`) - `!line.type`
    // is always a `boolean`, and `boolean == "string"` is always `false` (`ToNumber("string")` is
    // `NaN`, and neither `0` nor `1` equals `NaN`). So this branch is DEAD CODE: `line.type` is
    // NEVER actually split into an array, despite the evident intent (splitting a multi-word type
    // string like `"dashed rect"` into `["dashed", "rect"]`). Harmless in practice - every real
    // reader of `line.type` (`grid/draw2d.js`'s `.indexOf("gradient")`/`.indexOf("rect")`/
    // `.indexOf("dashed")`) does a SUBSTRING search, which still matches correctly against the
    // un-split string. Preserved exactly, not "fixed", per Phase 0 rule 6. Tested.
    if (line && !line.type == ("string" as unknown as boolean)) {
      line.type = line.type.split(/ /g);
    }

    return line;
  }

  /** Whether the y-axis grid LINE at `index` should actually be drawn - `false` specifically for
   * the line that would sit exactly on the y-axis itself (the first line when `orient` is
   * `"left"`, unless `grid.realtime`; the last line when `orient` is `"right"`), since that edge
   * already gets the axis's own border line instead of a separate grid line. */
  checkDrawLineY(index: number, isLast: boolean): boolean {
    const y = this.axis.get("y") as Record<string, unknown>;

    if (!y.hide) {
      if (y.orient === "left" && index === 0 && !(this.grid as Record<string, unknown>).realtime) {
        return false;
      } else if (y.orient === "right" && isLast) {
        return false;
      }
    }

    return true;
  }

  /** Same edge-skip logic as `checkDrawLineY()` above, for the x-axis (`"top"`-oriented: skips
   * `index === 0`; `"bottom"`-oriented: skips the last index, unless `grid.realtime`). */
  checkDrawLineX(index: number, isLast: boolean): boolean {
    const x = this.axis.get("x") as Record<string, unknown>;

    if (!x.hide) {
      if (x.orient === "top" && index === 0) {
        return false;
      } else if (x.orient === "bottom" && isLast && !(this.grid as Record<string, unknown>).realtime) {
        return false;
      }
    }

    return true;
  }

  /**
   * @method drawTop
   * draw top
   */
  drawTop(g: TransElement, ticks: unknown[], values: number[], checkActive: ((tick: unknown) => boolean) | null | undefined, moveX: number): void {
    for (let i = 0, len = ticks.length; i < len; i++) {
      const domain = this.format(ticks[i], i);
      const x = values[i] - moveX;
      const isLast = i === len - 1 && (this.grid as Record<string, unknown>).type !== "block";
      let isActive = false;

      // 그리드 이미지 그리기 (draw the grid image)
      this.drawImage("top", g, ticks[i], i, x, 0);

      // 도메인이 없으면 그리지 않음 (skip if there's no domain)
      if (!domain && domain !== 0) {
        continue;
      }

      // 액티브 라인 체크 (active-line check)
      if (typeCheck("function", checkActive)) {
        isActive = checkActive!(ticks[i]);
      }

      const axis = this.createGridX("top", i, x, isActive, isLast);
      this.drawValueText("top", axis, i, values[i], domain, moveX, isActive);

      g.append(axis);
    }
  }

  /** Same per-tick draw loop as `drawTop()` above (tick image + label + active-state check), for
   * the bottom edge. */
  drawBottom(g: TransElement, ticks: unknown[], values: number[], checkActive: ((tick: unknown) => boolean) | null | undefined, moveX: number): void {
    for (let i = 0, len = ticks.length; i < len; i++) {
      const domain = this.format(ticks[i], i);
      const x = values[i] - moveX;
      const isLast = i === len - 1 && (this.grid as Record<string, unknown>).type !== "block";
      let isActive = false;

      this.drawImage("bottom", g, ticks[i], i, x, 0);

      if (!domain && domain !== 0) {
        continue;
      }

      if (typeCheck("function", checkActive)) {
        isActive = checkActive!(ticks[i]);
      }

      const axis = this.createGridX("bottom", i, x, isActive, isLast);
      this.drawValueText("bottom", axis, i, values[i], domain, moveX, isActive);

      g.append(axis);
    }
  }

  /** Same per-tick draw loop as `drawTop()` above, for the left edge (using `createGridY`/vertical
   * `moveY` offset instead of `createGridX`/horizontal `moveX`). */
  drawLeft(g: TransElement, ticks: unknown[], values: number[], checkActive: ((tick: unknown) => boolean) | null | undefined, moveY: number): void {
    for (let i = 0, len = ticks.length; i < len; i++) {
      const domain = this.format(ticks[i], i);
      const y = values[i] - moveY;
      const isLast = i === len - 1 && (this.grid as Record<string, unknown>).type !== "block";
      let isActive = false;

      this.drawImage("left", g, ticks[i], i, 0, y);

      if (!domain && domain !== 0) {
        continue;
      }

      if (typeCheck("function", checkActive)) {
        isActive = checkActive!(ticks[i]);
      }

      const axis = this.createGridY("left", i, y, isActive, isLast);
      this.drawValueText("left", axis, i, values[i], domain, moveY, isActive);

      g.append(axis);
    }
  }

  /** Same per-tick draw loop as `drawLeft()` above, for the right edge. */
  drawRight(g: TransElement, ticks: unknown[], values: number[], checkActive: ((tick: unknown) => boolean) | null | undefined, moveY: number): void {
    for (let i = 0, len = ticks.length; i < len; i++) {
      const domain = this.format(ticks[i], i);
      const y = values[i] - moveY;
      const isLast = i === len - 1 && (this.grid as Record<string, unknown>).type !== "block";
      let isActive = false;

      this.drawImage("right", g, ticks[i], i, 0, y);

      if (!domain && domain !== 0) {
        continue;
      }

      if (typeCheck("function", checkActive)) {
        isActive = checkActive!(ticks[i]);
      }

      const axis = this.createGridY("right", i, y, isActive, isLast);
      this.drawValueText("right", axis, i, values[i], domain, moveY, isActive);

      g.append(axis);
    }
  }

  /**
   * @method drawValueText
   * NOT defined by `CoreGrid` in the original either - mixed in by `grid/draw2d.js`/
   * `grid/draw3d.js`, exactly like `createGridX`/`createGridY`/`drawImage` above. Declared here
   * (definite-assignment) purely so `drawTop`/`drawBottom`/`drawLeft`/`drawRight` type-check;
   * calling it before a mixin has run throws the same `TypeError` the original would.
   */
  drawValueText!: (position: string, axis: TransElement, index: number, xy: number, domain: unknown, move: number, isActive: boolean) => void;

  /**
   * @method drawGrid
   * draw base grid structure
   * @protected
   */
  drawGrid(): { root: TransElement; scale: any } {
    // create group
    const root = this.chart.svg.group();
    const func = (this as unknown as Record<string, ((g: TransElement) => void) | undefined>)[(this.grid as Record<string, unknown>).orient as string];
    const isFull3D = this.axis.isFull3D();

    // wrapped scale
    this.scale = this.wrapper(this.scale, (this.grid as Record<string, unknown>).key as string | undefined);

    // render axis
    if (typeCheck("function", func)) {
      const mixin = isFull3D ? draw3DMixin : draw2DMixin;
      if (!mixin) {
        throw new Error(
          "JUI_CRITICAL_ERR: grid draw2d/draw3d mixin not registered - call registerGridDraw2D()/registerGridDraw3D() before rendering a grid (see grid/draw2d.ts/grid/draw3d.ts, Phase C)",
        );
      }
      mixin(this);
      func!.call(this, root);
    }

    // hide grid
    if ((this.grid as Record<string, unknown>).hide) {
      root.attr({ display: "none" });
    }

    return {
      root,
      scale: this.scale,
    };
  }

  /**
   * @method drawAfter
   *
   * Declared as an arrow-function CLASS FIELD, not method syntax - `Draw` declares `drawAfter` as
   * an optional instance PROPERTY (`drawAfter?: (obj: any) => void`), matching the original's own
   * `this.drawAfter = function(obj){...}` per-instance-closure assignment (never a prototype
   * method there either). TypeScript's static override check (`TS2425`) requires matching
   * property-vs-method "kind" between base and subclass, so method syntax here would be rejected -
   * this is purely a class-ification type-system consequence (see `base/draw.ts`'s
   * `static setup()` reconciliation note above for the same category of issue), not a behavior
   * change: arrow-field `this` binding is irrelevant here since `drawAfter` is always invoked as
   * `this.drawAfter(obj)` (from `Draw.render()`), exactly like every other call site.
   */
  drawAfter = (obj: { root: TransElement; scale: any }): void => {
    obj.root.attr({ class: "grid-" + (this.grid as Record<string, unknown>).type });
    obj.root.translate(this.chart.area("x"), this.chart.area("y"));
  };

  static setup(): Record<string, unknown> {
    /** @property {chart.builder} chart */
    /** @property {chart.axis} axis */
    /** @property {Object} grid */

    return {
      /**  @cfg {Number} [dist=0] Able to change the locatn of an axis.  */
      dist: 0,
      /**  @cfg {"top"/"left"/"bottom"/"right"} [orient=null] Specifies the direction in which an axis is shown (top, bottom, left or right). */
      orient: null,
      /** @cfg {Boolean} [hide=false] Determines whether to display an applicable grid.  */
      hide: false,
      /** @cfg {String/Object/Number} [color=null] Specifies the color of a grid. */
      color: null,
      /** @cfg {String} [title=null] Specifies the text shown on a grid.*/
      title: null,
      /** @cfg {Boolean} [hide=false] Determines whether to display a line on the axis background. */
      line: false,
      /** @cfg {Function} [format=null]  Determines whether to format the value on an axis. */
      format: null,
      /** @cfg {Function} [image=null]  Determines whether to image the value on an axis. */
      image: null,
      /** @cfg {Number} [textRotate=null] Specifies the slope of text displayed on a grid. */
      textRotate: null,
    };
  }
}

// Compile-time-only verification that `CoreGrid` satisfies `GridConstructor` (constructor-shape
// check - see header comment's reconciliation section point 1: a 0-arg constructor legitimately
// satisfies a 3-required-arg constructor TYPE). Never invoked; exists purely so a future,
// accidental signature drift fails `npm run typecheck` immediately.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const gridConstructorTypeCheck: GridConstructor = CoreGrid;
void gridConstructorTypeCheck;
