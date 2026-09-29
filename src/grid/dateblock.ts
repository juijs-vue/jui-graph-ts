// Port of juijs-graph's `src/grid/dateblock.js` ("chart.grid.dateblock", extend: "chart.grid.date").
//
// Extend chain: `DateBlockGrid extends DateGrid` (`grid/date.ts`), NOT `CoreGrid` directly -
// confirmed via the original's own `extend: "chart.grid.date"` field (per PORT_STATUS.md's Phase C
// dependency map, which flagged this file as needing `grid/date.ts` first - now landed). No
// existing jui-chart-vue reference (jui-chart-vue never built a date-BLOCK chart type either) -
// full independent port/verification.
//
// **What `DateBlockGrid` actually overrides vs. inherits from `DateGrid`**: only `wrapper()`/
// `initDomain()`/`drawBefore`/`draw` are redefined (confirmed by reading `dateblock.js` in full -
// it declares exactly these 4 members and nothing else). `top`/`bottom`/`left`/`right`/`center`
// are NOT redeclared here - they're inherited from `DateGrid` completely unchanged, and continue
// to read `this.ticks`/`this.values` (populated by THIS file's own `drawBefore()` below, not
// `DateGrid`'s).
//
// ============================================================================================
// `wrapper()` - a full, non-cooperative OVERRIDE, not an extension, of `DateGrid.wrapper()`
// ============================================================================================
// `DateGrid.wrapper()` builds an index-vs-raw-value-aware scale wrapper (resolves a numeric `i`
// through `this.axis.data[i][key]` first, falls back to `+i` otherwise) and only copies the old
// scale's own properties onto the new wrapper when a `grid.key` is actually configured. That
// entire design is DISCARDED here, not extended: `DateBlockGrid.wrapper()` ignores `key` entirely
// and instead permanently mutates whatever scale it's given by tacking on a NEW `rangeBand()`
// method (returning `this.grid.unit`, populated by THIS file's own `drawBefore()` below - see
// there) - then returns that SAME scale object unchanged. This makes sense in context: by the time
// `CoreGrid.drawGrid()` calls `this.wrapper(this.scale, this.grid.key)`, `this.scale` is no longer
// a real time scale at all (see `drawBefore()`'s own header note) - it's already the custom
// index-position function `drawBefore()` builds, for which `DateGrid`'s index-vs-raw-value
// resolution logic wouldn't even make sense. Not a bug - a deliberate full replacement, preserved
// faithfully (including the now-completely-unused `key` parameter).
//
// ============================================================================================
// `initDomain()` - a near-duplicate of `DateGrid.initDomain()`, but NOT byte-identical, with two
// real, previously-undocumented divergences (Node-cross-checked, not obvious without diffing both
// files directly)
// ============================================================================================
//  1. **FIXED (Tier A defect 2)**: the string-domain branch never got `DateGrid.initDomain()`'s
//     `if (data.length > 0)` guard. `DateGrid`'s own copy of this branch (see `date.ts`'s header
//     comment) guards `data[0][field]`/`data[data.length-1][field]` behind a length check;
//     `DateBlockGrid`'s copy didn't - `data[0][field]` on an empty `data` array read
//     `undefined[field]`, throwing `TypeError: Cannot read properties of undefined (reading
//     '<field>')`. Node-verified. Now guarded the same way `DateGrid`'s copy always was.
//  2. **FIXED (Tier A defect 3)**: the final `min`/`max` auto-computation never got
//     `DateGrid.initDomain()`'s `&& value_list.length > 0` guard either - and, unlike `DateGrid`'s
//     own (also now-fixed) crash, this one didn't crash: `Math.min.apply(Math, value_list)` with a
//     `null` `value_list` (the fully-default-config case, where the old "else" branch set
//     `value_list = this.grid.domain` = `null`) doesn't throw - `Function.prototype.apply(thisArg,
//     argsList)` treats a `null`/`undefined` `argsList` as "call with zero arguments"
//     (Node-verified: `Math.min.apply(Math, null) === Infinity`, `Math.max.apply(Math, null) ===
//     -Infinity`). So a fully-default-config `DateBlockGrid` never crashed in `initDomain()` the
//     way a fully-default-config `DateGrid` used to - it silently resolved to
//     `domain = [Infinity, -Infinity]` instead (still nonsensical, just non-crashing). Now: the
//     null-domain "else" branch auto-computes `valueList` from `axis.data` directly (same fix as
//     `DateGrid.initDomain()`'s defect 1) and the final computation is guarded by
//     `valueList.length > 0`, so `min`/`max` stay `undefined` instead of resolving to
//     `Infinity`/`-Infinity` when there's nothing to compute from.
// Also, independent of both of the above: the function-domain branch's `+value`/`+Math.max.apply
// (...)`/`+Math.min.apply(...)` unary-`+` coercions ARE present here (unlike `DateGrid`'s own copy
// of this same branch, which has no unary `+` at all - see `date.ts`) - confirmed by direct
// side-by-side reading, not assumed. Harmless in practice (values are already numeric in the
// overwhelmingly common case), but a real textual divergence worth recording precisely.
//
// ============================================================================================
// `drawBefore()` - the real reason this is called "dateBLOCK": position comes from INDEX * unit,
// not from the resolved time domain at all
// ============================================================================================
// Builds the same underlying `time()` scale `DateGrid.drawBefore()` does (via `domain`/`.interval`
// - a bolt-on array property this file's own `initDomain()` sets, completely independent of the
// inherited `DateGrid.interval` instance field, which this file never touches), but:
//   - uses `.rangeRound(range)` instead of `DateGrid`'s `.range(range)` (a real, different
//     `TimeScale` method - rounds interpolated pixel positions to whole numbers).
//   - never calls `.clamp(...)` at all (unlike `DateGrid.drawBefore()`, which explicitly clamps).
//   - never filters `this.ticks`/`this.values` by `obj.start`/`obj.end` the way `DateGrid
//     .drawBefore()`'s own loop does (`if (value >= obj.start && value <= obj.end)`) - EVERY tick
//     `time.ticks(...)`/`.realTicks(...)` returns is kept unconditionally.
//   - computes `unit = this.grid.unit = Math.abs(range[0] - range[1]) / (this.axis.data.length -
//     1)` - MUTATING the shared `grid` config object with a fresh, derived `unit` field every
//     render (same "grid config object mutated in place" category `base/axis.ts`'s two-phase
//     `axis.x`/`axis.y` finding and this file's own `wrapper()`/`rangeBand()` above already rely
//     on - `rangeBand()` reads exactly this field back). **FIXED (Tier A defect 4) - was a
//     preserved division-by-zero/NaN quirk**: `axis.data.length === 1` made the divisor `0` -
//     `Math.abs(...)/0` was `Infinity` (or `NaN` if the numerator was also `0`, i.e. a zero-width
//     grid area) - a single-data-point chart is a completely ordinary, common case, not a
//     contrived edge case. Now: `dataLen === 0` falls back to treating the single point as
//     spanning the whole available pixel range instead of dividing by zero.
//     `axis.data.length === 0` (divisor `-1`, silently negating `unit`) is untouched - out of this
//     defect's scope, not a crash/NaN case. Node-verified both cases, tested.
//   - finally REPLACES `this.scale` entirely with `Object.assign((i) => this.start + i * unit,
//     time)` - a pure INDEX-based linear positioner (ignores its argument's actual date/domain
//     value completely, positions purely by `i * unit` offset from `this.start`), with every one
//     of the real `time` scale's own methods (`.domain`/`.range`/`.ticks`/etc) shallow-copied onto
//     it via `Object.assign` (same `$.extend`-to-`Object.assign` substitution already established
//     across this port - see `util/scale.ts`'s `log()` header note) so callers can still chain
//     them. This is the defining "block" behavior: ticks/labels come from the real time domain,
//     but each tick's SCREEN POSITION comes from its own array INDEX, not its date value - evenly
//     spaced regardless of the actual time gaps between ticks. `this.values[i] = time(this.ticks
//     [i])` (note: calls the RAW `time` scale directly, NOT `this.scale`, and NOT yet reassigned
//     at this point in the method) is computed BEFORE this reassignment, so `this.values` still
//     holds the real (non-block-positioned) pixel values from the underlying time scale - a subtle,
//     easy-to-miss distinction from what `this.scale` itself computes once `drawBefore()` returns.

import { DateGrid } from "./date";
import type { DateGridConfig } from "./date";
import type { GridChart } from "./core";
import { time } from "../util/scale";
import type { TimeScale } from "../util/scale";
import * as timeUtil from "../util/time";
import type { TransElement } from "../util/svg/element.transform";

// ---- inlined `util/base.js` typeCheck (same per-file convention as `grid/date.ts`/`grid/core.ts`
// - no shared helper module exists in this port) --------------------------------------------------
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

/** Same self-referential `UtilTime[unit] == unit` validity check `date.ts` uses (not exported
 * there either - inlined per-file, same convention). */
type DateBlockTimeUnit = "years" | "months" | "days" | "hours" | "minutes" | "seconds" | "milliseconds" | "weeks";

function isValidRealtimeUnit(unit: unknown): unit is DateBlockTimeUnit {
  return typeof unit === "string" && (timeUtil as unknown as Record<string, unknown>)[unit] === unit;
}

/** `initDomain()`'s return value: a 2-element `[min, max]` array carrying a bolt-on `.interval`
 * property (`domain.interval = ...`) - the original's own shape (`var domain = [min, max];` then
 * `domain.interval = ...`, NOT `this.interval` the way `DateGrid.initDomain()` uses - see header
 * comment). Same "array with a bolt-on property" convention `range.ts`'s `RangeDomain` already
 * established. */
interface DateBlockDomain extends Array<number | undefined> {
  interval?: number;
}

/** `grid/dateblock.js` has NO `.setup()` of its own at all (confirmed by reading the original in
 * full - unlike every other concrete grid class ported so far). It reuses `DateGrid`'s own 8
 * fields, plus a `unit` field this file's own `drawBefore()` writes into the shared config object
 * at render time (see header comment) - not part of any static default, but real enough to type. */
export interface DateBlockGridConfig extends DateGridConfig {
  unit?: number;
}

/**
 * Port of `chart.grid.dateblock`'s `DateBlockGrid` constructor function as a real ES class (Phase
 * 0 rule 2). No explicit constructor - same zero-parameter convention every concrete grid class in
 * this port uses (see `grid/core.ts`'s header comment for why).
 */
export class DateBlockGrid extends DateGrid {
  declare chart: GridChart;
  declare grid: DateBlockGridConfig;

  /**
   * @method wrapper
   * Full override (not an extension) of `DateGrid.wrapper()` - see header comment. `key` is
   * accepted (for signature compatibility with `CoreGrid.wrapper()`/`DateGrid.wrapper()`) but,
   * faithfully, never read - the original's own `this.wrapper = function(scale, key) {...}` never
   * references `key` in its body either.
   */
  wrapper(scale: any, _key?: string): any {
    const self = this;

    (scale as { rangeBand?: () => number }).rangeBand = function (): number {
      return self.grid.unit as number;
    };

    return scale;
  }

  /**
   * @method initDomain
   * See header comment for the two real divergences from the inherited `DateGrid.initDomain()`
   * this near-duplicate copy has (missing `data.length > 0` guard on the string-domain branch;
   * missing `value_list.length > 0` guard on the min/max auto-computation, which happens to be
   * harmless here rather than a crash, unlike `DateGrid`'s own documented gap).
   */
  initDomain(): DateBlockDomain {
    let min = (this.grid.min || undefined) as number | undefined;
    let max = (this.grid.max || undefined) as number | undefined;

    const data = this.data() as Record<string, unknown>[];
    let valueList: unknown[] = [];

    if (typeCheck("string", this.grid.domain)) {
      // FIXED (Tier A defect 2 - was a preserved crash): now guarded with the same
      // `data.length > 0` check `DateGrid.initDomain()`'s own copy of this branch already has -
      // previously, `data[0]`/`data[data.length - 1]` on an empty array threw `TypeError: Cannot
      // read properties of undefined`.
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
          valueList[index] = +Math.max.apply(Math, arr);
          valueList.push(+Math.min.apply(Math, arr));
        } else {
          valueList[index] = +(value as number);
        }
      }
    } else if (this.grid.domain != null) {
      valueList = this.grid.domain as unknown[];
    } else {
      // FIX (Tier A defect 3, see doc comment below): `grid.domain` left at its default `null` -
      // auto-compute straight from `axis.data`'s own raw values instead of leaving `valueList`
      // `null`, same fix as `DateGrid.initDomain()`'s own defect-1 fix (see `date.ts`).
      valueList = data.map((row) => +(row as unknown as number));
    }

    // FIXED (Tier A defect 3 - was a preserved quirk): now guarded with `valueList.length > 0`,
    // same as `DateGrid.initDomain()`'s own copy - previously, a fully-default-config grid (no
    // explicit domain/min/max) left `valueList` as `null` (or, since the fix above, an empty `[]`
    // for an empty `axis.data`), and `Math.min.apply`/`Math.max.apply` tolerate that "gracefully"
    // (`Function.prototype.apply` treats a `null`/empty `argsList` as zero arguments) by silently
    // resolving to `Infinity`/`-Infinity` - not a crash, but nonsense bounds poisoning every
    // downstream consumer. Now: `min`/`max` simply stay `undefined` when there's no real value
    // list to compute from, matching `DateGrid.initDomain()`'s own (now-fixed) behavior exactly.
    if (typeCheck("undefined", min) && valueList.length > 0) min = Math.min.apply(Math, valueList as number[]);
    if (typeCheck("undefined", max) && valueList.length > 0) max = Math.max.apply(Math, valueList as number[]);

    const domain: DateBlockDomain = [min, max] as DateBlockDomain;
    const interval = this.grid.interval;

    if (this.grid.reverse) {
      domain.reverse();
    }

    if (typeCheck("function", interval)) {
      domain.interval = (interval as (this: unknown, domain: (number | undefined)[]) => number).call(this.chart, domain);
    } else {
      domain.interval = interval as number;
    }

    return domain;
  }

  /**
   * @method drawBefore
   * See header comment for the full `.rangeRound()`/no-`.clamp()`/no-range-filter/index-based-
   * `this.scale`-replacement behavior - the defining "block" behavior of this grid.
   */
  drawBefore = (): void => {
    const domain = this.initDomain();

    const obj = this.getGridSize();
    const range: [number, number] = [obj.start, obj.end];
    const timeScale = (time() as TimeScale).domain(domain as unknown as (number | Date)[]).rangeRound(range);

    if (this.grid.realtime != null && isValidRealtimeUnit(this.grid.realtime)) {
      this.ticks = timeScale.realTicks(this.grid.realtime, domain.interval as number);
    } else {
      this.ticks = timeScale.ticks("milliseconds", domain.interval as number);
    }

    const dataLen = (this.axis.data as unknown[]).length - 1;
    // FIXED (Tier A defect 4 - was a preserved division-by-zero/NaN quirk): a single data point
    // makes `dataLen` `0`, and the original's unguarded division produced `Infinity` (or `NaN` for
    // a zero-width grid area) - a single-data-point chart is a completely normal, common case, not
    // a contrived edge case anyone chose to accept. Now: `dataLen === 0` falls back to treating the
    // single point as spanning the WHOLE available pixel range (matching the width a genuine
    // 2+-point chart's own per-block `unit` would resolve to in the same minimal case), instead of
    // dividing by zero. `dataLen < 0` (an empty `axis.data`) is untouched - out of this defect's
    // scope, still silently negates `unit` exactly as before.
    const unit = dataLen !== 0 ? Math.abs(range[0] - range[1]) / dataLen : Math.abs(range[0] - range[1]);
    (this.grid as Record<string, unknown>).unit = unit;

    if (typeof this.grid.format === "string") {
      const str = this.grid.format;
      this.grid.format = (value: unknown): unknown => timeUtil.format(value as Date, str);
    }

    this.start = obj.start;
    this.size = obj.size;
    this.end = obj.end;
    this.bar = 6;
    this.values = [];

    for (let i = 0, len = this.ticks.length; i < len; i++) {
      // Calls the RAW `time` scale, not `this.scale` (not yet reassigned below) - see header
      // comment for why this matters.
      this.values[i] = timeScale(this.ticks[i] as unknown as number);
    }

    const self = this;
    this.scale = Object.assign((i: number): number => {
      // area 시작 영역 추가 (add the area's own starting offset)
      return self.start + i * unit;
    }, timeScale);
  };

  /**
   * @method draw
   * The original calls `this.drawGrid("dateblock")` - same dead-string-argument adaptation
   * `date.ts`'s own `draw()` already documents (`CoreGrid.drawGrid()` takes zero parameters).
   */
  draw = (): { root: TransElement; scale: any } => {
    return this.drawGrid();
  };

  // `grid/dateblock.js` has NO `.setup()` of its own (see header comment/`DateBlockGridConfig`'s
  // own doc comment) - deliberately NOT overridden here either, so `DateBlockGrid.setup()`
  // resolves via real ES `class extends` static inheritance straight through to the inherited
  // `DateGrid.setup()`. This is a genuine, deliberate non-1:1 consequence of porting a
  // constructor-function-based registry as real classes (Phase 0 rule 2): the original's registry
  // never automatically inherits a subclass's missing `.setup()` from its `extend:` parent this
  // way (a bare JS function object has no such linkage without the registry's own machinery,
  // itself dropped per Phase 0 rules 1/4) - but since `base/axis.ts`'s `drawGridType()` only ever
  // calls `GridCtor.setup()` one level (already a documented, out-of-scope gap - see `date.ts`'s
  // own header comment), real class static inheritance landing on `DateGrid.setup()` here is a
  // reasonable, behavior-preserving-or-better resolution, not a silent behavior change worth
  // reverting: there's no original behavior to regress from, since the original never exercises a
  // real "DateBlockGrid.setup() call resolves to nothing" case in the first place (some `.setup()`
  // - the parent's, in this port - is strictly more complete than none).
}
