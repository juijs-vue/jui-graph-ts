// Port of juijs-graph's `src/grid/date.js` ("chart.grid.date", extend: "chart.grid.core").
//
// Extend chain: `DateGrid extends CoreGrid` (`grid/core.ts`) directly - confirmed via the
// original's own `extend: "chart.grid.core"` field (see PORT_STATUS.md's Phase C dependency map,
// which already grepped this across all 14 remaining `grid/*.js` files). No existing
// jui-chart-vue reference (jui-chart-vue never built a time-axis chart type) - full independent
// port/verification, per this task's own assignment.
//
// **Class shape note for `grid/dateblock.ts` (a future task, `extend: "chart.grid.date"` -
// i.e. it extends THIS class, not `CoreGrid` directly)**: `DateGrid` keeps every original public
// member 1:1 - `center`/`top`/`bottom`/`left`/`right` (the `this[this.grid.orient]` dispatch
// targets `CoreGrid.drawGrid()` looks up), `wrapper()` (overrides `CoreGrid.wrapper()`'s identity
// default), `initDomain()`, `drawBefore`/`draw` (arrow-field-typed, see below), plus the instance
// fields `drawBefore()` populates every render (`scale`/`ticks`/`values`/`start`/`size`/`end`/
// `bar`/`interval`) and the `grid: DateGridConfig` field-type override. `dateblock.ts` should be
// able to extend this class exactly the way `DateGrid extends CoreGrid` does here (override
// `initDomain`/`drawBefore`/`draw`/`top`/etc as needed, inherit the rest) - nothing about this
// port's shape needed to diverge from the original to make that work.
//
// **Real Phase A dependencies, both already-ported, used as real imports**: `util/scale.ts`'s
// `time()` (the SAME "bundle" `util.scale` module `grid/block.js`/`grid/range.js`/etc all consume
// - see `util/scale.ts`'s own header note) for the actual date-domain-to-pixel scale, and
// `util/time.ts` for `format()` (grid.format string-shorthand resolution) and the time-unit-name
// string constants (`years`/`months`/.../`weeks`) used to validate `grid.realtime`.
//
// **`drawPattern`/`drawBaseLine`/`drawCenter` - same not-yet-ported-mixin situation `grid/core.ts`
// already established for `createGridX`/`createGridY`/`drawImage`/`drawValueText`**: `top()`/
// `bottom()`/`left()`/`right()`/`center()` below call `this.drawPattern(...)`/`this.drawBaseLine(
// ...)`/`this.drawCenter(...)` - real `Draw2DGrid`/`Draw3DGrid` mixin methods (`grid/draw2d.js`/
// `grid/draw3d.js`, per PORT_STATUS.md's dependency map: draw2d provides `drawPattern`/
// `drawBaseLine`, draw3d provides `drawBaseLine`/`drawCenter` + a no-op `drawPattern`) that
// `CoreGrid` itself does NOT declare (only `createGridX`/`createGridY`/`drawImage`/`drawValueText`
// are declared there, since those are the only ones `CoreGrid`'s OWN methods reference - these
// three are referenced only by concrete subclasses like this one). Declared here as definite-
// assignment (`!`) fields, same convention/consequence as `grid/core.ts`: calling any of these
// before `registerGridDraw2D`/`registerGridDraw3D`'s mixin has actually run throws the same
// "not a function"-shaped `TypeError` the original would too, never a silent no-op. Per this
// task's own instructions (mirroring the `base/axis.ts`/`grid/core.ts` "minimal structural
// contract, documented for later reconciliation" pattern for an unported dependency) - not a
// blocker, `grid/draw2d.ts`/`grid/draw3d.ts` (concurrent work this same round) need no changes to
// satisfy this once they land, since they mix these exact method names onto the target instance.
//
// **`static setup()` does NOT merge `CoreGrid.setup()`'s own base fields (`dist`/`orient`/`hide`/
// `color`/`title`/`line`/`format`/`image`/`textRotate`) - a real, pre-existing gap at the
// `base/axis.ts`/`grid/core.ts` boundary, not something newly introduced here.** In the real
// original library, `jui`'s `defineOptions()` walks the FULL `extend:` parent chain (via each
// ancestor's own `Module.parent`, set by the dropped `inherit()`/registry machinery) and merges
// every ancestor's `.setup()` output together - so a real `DateGrid` instance's resolved config
// genuinely includes both `CoreGrid`'s base fields AND `DateGrid`'s own eight. This port's
// `base/axis.ts`, however (already shipped, Phase B, out of this task's scope), only ever calls
// `GridCtor.setup()` ONE level deep (`extend(gridCfg, GridCtor.setup(), true)` in
// `drawGridType()`) - it does not walk a parent-class chain, since Phase 0 rule 1 already dropped
// the registry mechanism that chain walk depended on. `DateGrid.setup()` below is therefore kept
// byte-faithful to the ORIGINAL LITERAL file (only this class's own 8 fields, exactly as
// `grid/date.js` itself returns) rather than inventing new chain-merging logic this port doesn't
// have anywhere else either - documented here as the same category of dependency-boundary note
// `grid/core.ts`'s own header comment already uses for `GridConstructor`/`GridInstance`, not a new
// problem this file introduces.

import { CoreGrid } from "./core";
import type { GridChart } from "./core";
import { time } from "../util/scale";
import type { TimeScale } from "../util/scale";
import * as timeUtil from "../util/time";
import type { TransElement } from "../util/svg/element.transform";

// ---- inlined `util/base.js` typeCheck (same per-file convention as `grid/core.ts`/`base/axis.ts`
// /every other Phase A/B/C file - no shared helper module exists in this port) --------------------
type TypeCheckable = unknown;

function typeCheck(type: string | string[], value: TypeCheckable): boolean {
  function check(t: string, v: TypeCheckable): boolean {
    if (typeof t !== "string") return false;
    if (t === "string") return typeof v === "string";
    if (t === "function") return typeof v === "function";
    if (t === "undefined") return typeof v === "undefined";
    if (t === "array") return v instanceof Array;
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

/** Structurally identical to `util/scale.ts`'s own (unexported) `TimeUnit` - a real, separately
 * declared literal union, but TS compares string-literal-union types structurally, so this is
 * mutually assignable with the real (unreachable-by-name) type `TimeScale.ticks`/`.realTicks`
 * actually declare their `type` parameter as. */
type DateGridTimeUnit = "years" | "months" | "days" | "hours" | "minutes" | "seconds" | "milliseconds" | "weeks";

/** `UtilTime[unit] == unit` - the original's own self-referential validity check (every real
 * `util/time.ts` unit constant is a string equal to its own export name, e.g. `timeUtil.days ===
 * "days"`), used to confirm `grid.realtime` names an actual known time unit before calling
 * `scale.realTicks(...)` with it. */
function isValidRealtimeUnit(unit: unknown): unit is DateGridTimeUnit {
  return typeof unit === "string" && (timeUtil as unknown as Record<string, unknown>)[unit] === unit;
}

/** `grid/date.js`'s own accepted config shape (`DateGrid.setup()`'s 8 fields), plus an index
 * signature for the few extra ad-hoc fields the real body also reads that AREN'T in `setup()`'s
 * own defaults (`clamp`, `format`, `orient`) - exactly like the original's untyped plain object. */
export interface DateGridConfig {
  /** Field name (string, resolves per-row) / per-row function (returns a value or `[min,max]`
   * array) / literal 2+ element array - or `null` (the default; see the preserved-crash note
   * above `initDomain()` below). */
  domain?: string | ((this: unknown, row: unknown) => unknown) | unknown[] | null;
  /** Fixed tick spacing in milliseconds, or a function computing it from the resolved domain. */
  interval?: number | ((this: unknown, domain: (number | undefined)[]) => number);
  min?: number | null;
  max?: number | null;
  reverse?: boolean;
  key?: string | null;
  realtime?: string | null;
  hideText?: boolean;
  /** Not part of `DateGrid.setup()`'s own defaults (inherited-chain gap, see header comment) -
   * read directly by `drawBefore()` regardless. */
  clamp?: boolean;
  /** Mutated in place by `drawBefore()` when originally a string (see below). */
  format?: string | ((value: unknown) => unknown) | null;
  orient?: string;
  [key: string]: unknown;
}

/**
 * Port of `chart.grid.date`'s `DateGrid` constructor function as a real ES class (Phase 0 rule 2).
 * No explicit constructor - the original's `DateGrid` constructor function takes zero parameters,
 * same as `CoreGrid` itself (see `grid/core.ts`'s header comment for why: `chart`/`axis`/`grid`/
 * `svg` are wired on externally by `base/axis.ts`'s `drawGridType()`).
 */
export class DateGrid extends CoreGrid {
  declare chart: GridChart;
  declare grid: DateGridConfig;

  /** Resolved tick step (milliseconds, or whatever `grid.interval`'s function returns) -
   * populated by `drawBefore()`, read by `drawBefore()` itself on the next render and by
   * `scale.ticks("milliseconds", this.interval)`/`scale.realTicks(unit, this.interval)`. */
  interval = 0;
  ticks: unknown[] = [];
  values: number[] = [];
  start = 0;
  size = 0;
  end = 0;
  bar = 0;

  // Mixed in externally by `registerGridDraw2D`/`registerGridDraw3D` (`grid/draw2d.ts`/
  // `grid/draw3d.ts`, not yet ported - see header comment). Definite-assignment, same convention/
  // consequence as `grid/core.ts`'s own `createGridX`/`createGridY`/`drawImage`.
  drawPattern!: (position: string, ticks: unknown[], values: number[]) => void;
  drawBaseLine!: (position: string, g: TransElement) => void;
  drawCenter!: (
    g: TransElement,
    ticks: unknown[],
    values: number[],
    checkActive: ((tick: unknown) => boolean) | null | undefined,
    moveX: number,
  ) => void;

  /** Draws the `"center"` (z-axis, full-3D) orientation: one z-axis tick per resolved date via the
   * mixed-in `drawCenter()`, with zero per-tick offset (unlike `BlockGrid.center()`'s
   * `half_band`), plus the shared base line for this side. */
  center(g: TransElement): void {
    this.drawCenter(g, this.ticks, this.values, null, 0);
    this.drawBaseLine("center", g);
  }

  /** Draws the top-oriented grid: the per-tick background pattern (`drawPattern`), the shared
   * per-tick draw loop (`CoreGrid.drawTop()`, using `this.ticks`/`this.values` as populated by
   * `drawBefore()`), and the base line. Unlike `BlockGrid`'s orient methods, there is no extra
   * trailing boundary tick here - `CoreGrid.drawTop()`'s own `isLast` check applies normally since
   * `grid.type` is not `"block"`. */
  top(g: TransElement): void {
    this.drawPattern("top", this.ticks, this.values);
    this.drawTop(g, this.ticks, this.values, null, 0);
    this.drawBaseLine("top", g);
  }

  /** Same as `top()` above, for the bottom edge. */
  bottom(g: TransElement): void {
    this.drawPattern("bottom", this.ticks, this.values);
    this.drawBottom(g, this.ticks, this.values, null, 0);
    this.drawBaseLine("bottom", g);
  }

  /** Same as `top()` above, for the left edge (`drawLeft` in place of `drawTop`). */
  left(g: TransElement): void {
    this.drawPattern("left", this.ticks, this.values);
    this.drawLeft(g, this.ticks, this.values, null, 0);
    this.drawBaseLine("left", g);
  }

  /** Same as `left()` above, for the right edge. */
  right(g: TransElement): void {
    this.drawPattern("right", this.ticks, this.values);
    this.drawRight(g, this.ticks, this.values, null, 0);
    this.drawBaseLine("right", g);
  }

  /**
   * @method wrapper
   * Overrides `CoreGrid.wrapper()`'s identity default: wraps the resolved `time()` scale so it
   * can be called with either a raw domain value (non-number arg, coerced via `+i`) or a data
   * ROW INDEX (a number - resolved through `this.axis.data[i][key]` first).
   *
   * `key ? Object.assign(new_scale, old_scale) : old_scale` - the original's own
   * `_.extend(new_scale, old_scale)` (a shallow property copy from the resolved `TimeScale`'s own
   * method properties, e.g. `.domain`/`.range`/`.ticks`/`.clamp`, onto the new index-aware wrapper
   * function, so callers can still chain them on the wrapped scale). Same
   * `$.extend`/`util.base.extend`-shallow-copy-to-`Object.assign` substitution already
   * established elsewhere in this port (see `util/scale.ts`'s `log()` header note) - behaviorally
   * identical here since none of `TimeScale`'s own properties are nested plain objects that would
   * need `_.extend`'s recursive-merge branch.
   */
  wrapper(scale: any, key?: string): any {
    const oldScale = scale;

    const newScale = (i: unknown): unknown => {
      if (typeof i === "number") {
        const row = (this.axis.data as Record<string, unknown>[])[i];
        return oldScale((row as Record<string, unknown>)[key as string]);
      } else {
        return oldScale(+(i as number));
      }
    };

    return key ? Object.assign(newScale, oldScale) : oldScale;
  }

  /**
   * @method initDomain
   * Resolves the grid's `[min, max]` domain from `grid.domain`/`grid.min`/`grid.max`/
   * `grid.interval`, and sets `this.interval` as a side effect.
   *
   * **FIXED (Tier A defect 1 - was a preserved crash, Node-cross-checked)**: when `grid.domain`
   * is left at its default `null` AND `grid.min`/`grid.max` are ALSO left at their defaults, the
   * old "else" branch set `valueList = this.grid.domain` (i.e. `null`), and the very next line's
   * unconditional `valueList.length` read (inside an `&&`) threw `TypeError: Cannot read
   * properties of null (reading 'length')` - **a `DateGrid` rendered with zero explicit config,
   * the most minimal/naive usage, crashed immediately inside `drawBefore()`.** This was true of
   * the real upstream library too, not a port-introduced restriction, but is Tier A (an outright
   * crash on the most minimal usage, not a look anyone could be depending on) - fixed here, unlike
   * this file's other preserved quirks. Now: a `null`/`undefined` `grid.domain` (kept distinct
   * from a real array-literal domain, which still passes straight through unchanged) falls back to
   * auto-computing `valueList` directly from `axis.data`'s own raw values (each row is expected to
   * be a usable date/timestamp value itself, not a nested object, since no domain field/function
   * was configured to extract one) - mirroring `range.ts`'s own "use the data directly when no
   * field/function is configured" default-path handling. An empty `axis.data` still safely
   * resolves `valueList` to `[]` (guarded by the existing `valueList.length > 0` checks below), so
   * `min`/`max` simply stay `undefined` in that fully-empty case rather than crashing.
   *
   * **Second preserved quirk (harmless, Node-cross-checked)**: the `typeCheck("function", ...)`
   * branch's countdown loop (`while (index--)`) writes each row's MAX at `valueList[index]`
   * (aligned to the countdown index) but PUSHES each row's min onto the END of the array
   * (unrelated to `index`) - the two interleave into a jumbled-looking array as `index` counts
   * down (e.g. for 3 rows, Node-verified: `value_list` ends up `[5, 9, 3, 0, 2, 1]`, not the
   * evidently-intended `[max0, min0, max1, min1, max2, min2]` or similar). Harmless for this
   * function's own purposes - only the OVERALL `Math.min`/`Math.max` across the whole array are
   * read below, and both are order-independent (`min=0, max=9` either way) - preserved verbatim.
   *
   * **Third preserved quirk**: `grid.min || undefined` / `grid.max || undefined` treats an
   * explicit `min: 0` (or `max: 0`) the SAME as unset (`0` is falsy) - it silently falls through
   * to the auto-computed-from-`valueList` value instead of honoring the literal `0` the caller
   * configured. Preserved exactly (`||`, not `??`).
   */
  initDomain(): (number | undefined)[] {
    let min = (this.grid.min || undefined) as number | undefined;
    let max = (this.grid.max || undefined) as number | undefined;

    const data = this.data() as Record<string, unknown>[];
    let valueList: unknown[] = [];

    if (typeCheck("string", this.grid.domain)) {
      if (data.length > 0) {
        const field = this.grid.domain as string;
        valueList.push(+(data[0][field] as number));
        valueList.push(+(data[data.length - 1][field] as number));
      }
    } else if (typeCheck("function", this.grid.domain)) {
      const domainFn = this.grid.domain as (this: unknown, row: unknown) => unknown;
      let index = data.length;

      while (index--) {
        const value = domainFn.call(this.chart, data[index]);

        if (typeCheck("array", value)) {
          const arr = value as number[];
          valueList[index] = Math.max.apply(Math, arr);
          valueList.push(Math.min.apply(Math, arr));
        } else {
          valueList[index] = value;
        }
      }
    } else if (this.grid.domain != null) {
      valueList = this.grid.domain as unknown[];
    } else {
      // FIX (Tier A defect 1, see doc comment above): `grid.domain` left at its default `null` -
      // auto-compute straight from `axis.data`'s own raw values instead of crashing.
      valueList = data.map((row) => +(row as unknown as number));
    }

    if (typeCheck("undefined", min) && valueList.length > 0) min = Math.min.apply(Math, valueList as number[]);
    if (typeCheck("undefined", max) && valueList.length > 0) max = Math.max.apply(Math, valueList as number[]);

    const domain: (number | undefined)[] = [min, max];
    const interval = this.grid.interval;

    if (this.grid.reverse) {
      domain.reverse();
    }

    if (typeCheck("function", interval)) {
      this.interval = (interval as (this: unknown, domain: (number | undefined)[]) => number).call(this.chart, domain);
    } else {
      this.interval = interval as number;
    }

    return domain;
  }

  /**
   * @method drawBefore
   * Resolves the domain/scale/ticks for this render pass. Uses the real, already-ported
   * `util/scale.ts`'s `time()` (the same "bundle" `util.scale` module every other `grid/*.js`
   * consumes) and `util/time.ts`'s `format()`/unit constants.
   */
  drawBefore = (): void => {
    const domain = this.initDomain();

    const obj = this.getGridSize();
    const range: [number, number] = [obj.start, obj.end];

    this.scale = (time() as TimeScale).domain(domain as unknown as (number | Date)[]).range(range);
    this.scale.clamp(this.grid.clamp);

    this.ticks = [];

    const realtimeUnit = this.grid.realtime;
    let ticks: Date[];

    if (realtimeUnit != null && isValidRealtimeUnit(realtimeUnit)) {
      ticks = this.scale.realTicks(realtimeUnit, this.interval);
    } else {
      ticks = this.scale.ticks("milliseconds", this.interval);
    }

    if (typeof this.grid.format === "string") {
      const str = this.grid.format;
      this.grid.format = (value: unknown): unknown => timeUtil.format(value as Date, str);
    }

    this.start = obj.start;
    this.size = obj.size;
    this.end = obj.end;
    this.bar = 6;
    this.values = [];

    for (let i = 0, len = ticks.length; i < len; i++) {
      // `this.scale(ticks[i])` in the original - `ticks[i]` is a `Date`, and `TimeScale`'s
      // callable form is declared `(x: number) => number`, but JS's relational/arithmetic
      // coercion inside `linear()`'s body (`domainMax < x`, `x - _domain[0]`, both via
      // `ToPrimitive`/`valueOf()`) accepts a `Date` transparently at runtime - passing the real
      // `Date` instance through (not pre-converted to a timestamp) for 1:1 fidelity.
      const value = this.scale(ticks[i] as unknown as number);

      if (value >= obj.start && value <= obj.end) {
        this.values.push(value);
        this.ticks.push(ticks[i]);
      }
    }
  };

  /**
   * @method draw
   * The original calls `this.drawGrid("date")` - `CoreGrid.drawGrid()` (in this port, same as the
   * original) takes ZERO parameters (confirmed by reading `grid/core.js` directly: the `"date"`/
   * `"block"`/etc argument every concrete grid's `draw()` passes is dead, never read by
   * `drawGrid()` itself) - so the call here is `this.drawGrid()`, matching `grid/core.ts`'s actual
   * (already-shipped, unchanged-by-this-task) signature.
   */
  draw = (): { root: TransElement; scale: any } => {
    return this.drawGrid();
  };

  /** See header comment: byte-faithful to the original's own literal `DateGrid.setup()` (this
   * class's 8 fields only) - does NOT additionally merge `CoreGrid.setup()`'s base fields, a
   * pre-existing `base/axis.ts`/`grid/core.ts` boundary gap, not newly introduced here. */
  static setup(): Record<string, unknown> {
    return {
      /** @cfg {Array} [domain=null] Sets the value displayed on a grid. */
      domain: null,
      /** @cfg {Number} [interval=1000] Sets the interval of the scale displayed on a grid.*/
      interval: 1000,
      /** @cfg {Number} [min=null] Sets the minimum timestamp of a grid.  */
      min: null,
      /** @cfg {Number} [max=null] Sets the maximum timestamp of a grid. */
      max: null,
      /** @cfg {Boolean} [reverse=false] Reverses the value on domain values*/
      reverse: false,
      /** @cfg {String} [key=null] Sets the value on the grid to the value for the specified key. */
      key: null,
      /** @cfg {"years"/"months"/"days"/"hours"/"minutes"/"seconds"/"milliseconds"} [realtime=""]
       * Determines whether to use as a real-time grid. */
      realtime: null,
      /** @cfg {Boolean} [hideText=false] Determines whether to show text across the grid. */
      hideText: false,
    };
  }
}
