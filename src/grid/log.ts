// Port of juijs-graph's `src/grid/log.js` ("chart.grid.log", extend: "chart.grid.range").
//
// Extend chain: `LogGrid extends RangeGrid` (`grid/range.ts`), NOT `CoreGrid` directly - confirmed
// via the original's own `extend: "chart.grid.range"` field (per PORT_STATUS.md's Phase C
// dependency map, which flagged this file as needing `grid/range.ts` first - now landed). No
// existing jui-chart-vue reference (jui-chart-vue never built a log-scale chart type) - full
// independent port/verification. Cross-checked against Phase A's already-ported `util/scale/
// log.ts` (`log()`'s `ticks()` delegates to the wrapped `linear()` scale's own `ticks()`, so the
// already-documented `math.ts` `nice()` `ReferenceError` bug - reachable from `RangeGrid` - is
// reachable from here too, via the exact same `this.scale.ticks(this.step, this.nice)` call
// shape).
//
// **What `LogGrid` actually overrides vs. inherits from `RangeGrid`**: only `drawBefore`/`draw`
// are redefined (confirmed by reading `log.js` in full - it declares exactly these 2 members,
// plus its own `static setup()`). `center`/`top`/`bottom`/`left`/`right`/`wrapper`/`initDomain`
// are NOT redeclared here - they're inherited from `RangeGrid` completely unchanged, including
// `RangeGrid`'s own `this.scale.min()`/`.max()` calls in the orient methods (satisfied by
// `LogScale.min()`/`.max()`, per `util/scale/log.ts`'s own interface - same callable-plus-`.min()`
// /`.max()` shape `LinearScale` has, so no override was needed for those to keep working against a
// `LogScale` instead).
//
// ============================================================================================
// Preserved bugs/quirks in `drawBefore()` (Node/hand-verified against the literal original, not
// merely inferred from a single read)
// ============================================================================================
//  1. **`this.grid.unit = false` (mutating the shared config object - same category `base/axis.ts`
//     's two-phase `axis.x`/`.y` finding and `dateblock.ts`'s own `grid.unit` mutation already
//     document) is forced BEFORE calling `initDomain()` (inherited from `RangeGrid`) - a genuine,
//     previously-undocumented quirk.** `RangeGrid.initDomain()`'s own unit-resolution only takes
//     its `typeof === 'function'`/`typeof === 'number'` branches for a real function/number
//     `grid.unit` - `false` matches neither, so `LogGrid` ALWAYS falls through to the
//     auto-computed-from-`step` branch, silently discarding any numeric/function `unit` a caller
//     explicitly configures on a log grid (a config field `RangeGridOptions`/`LogGridOptions`
//     otherwise fully support). Node-verified, tested.
//  2. **`LogGrid.drawBefore()` never calls `.clamp(...)` at all**, unlike `RangeGrid.drawBefore()`
//     (its own parent, which this file fully REPLACES rather than extends), which explicitly calls
//     `this.scale.clamp(this.grid.clamp)`. A log grid's scale is therefore never clamped,
//     regardless of the `grid.clamp` config (inherited from `RangeGridOptions`, default `true`).
//     Confirmed by reading the original directly, not a port-introduced omission.
//  3. **`this.step = this.grid.step` reads the raw CONFIGURED step directly, NOT `domain.step`**
//     (the auto-computed "nice" step count `RangeGrid.initDomain()` itself computes and sets as a
//     bolt-on array property) - a real, previously-undocumented divergence from
//     `RangeGrid.drawBefore()`'s own `this.step = domain.step`. `LogGrid`'s inherited
//     `initDomain()` still computes `domain.step`, but `LogGrid.drawBefore()` deliberately ignores
//     it in favor of the raw `grid.step` (default `4`, per this file's own `static setup()` -
//     distinct from `RangeGrid.setup()`'s own default of `10`). Confirmed by direct reading, not
//     assumed from the structural similarity to `range.ts`.
//  4. **`LogGrid.setup()` does NOT merge `RangeGrid.setup()`'s own fields** (`domain`/`min`/`max`/
//     `unit`/`clamp`/`reverse`/`key`) - same category "one-level-deep `GridCtor.setup()` merge" gap
//     `date.ts`'s own header comment already documents for `DateGrid`/`CoreGrid`. Verified this
//     specific gap is BENIGN for every affected `LogGrid` field, unlike `DateGrid`'s crash-risk
//     case: `grid.min`/`grid.max`/`grid.reverse`/`grid.key` are all read via `||`/truthy checks
//     that treat `undefined` identically to their own documented default (`0`/`0`/`false`/`null`,
//     all falsy either way); `grid.domain` defaulting to `undefined` instead of `null` produces the
//     same `Math.min/max.apply(Math, undefined)` no-crash behavior `Function.prototype.apply`
//     already gives `null` (see `dateblock.ts`'s own header comment for the same `apply(fn, null)`
//     finding); `grid.unit` is irrelevant regardless, since quirk 1 above forces it to `false`
//     before it's ever read; `grid.clamp` is irrelevant too, since quirk 2 above means it's never
//     read either. Noted for completeness/consistency with the established gap-tracking
//     convention, not because it changes any observable behavior here.

import { RangeGrid } from "./range";
import type { RangeGridOptions } from "./range";
import type { TransElement } from "../util/svg/element.transform";
import { log } from "../util/scale/log";
import type { LogScale } from "../util/scale/log";

/** `LogGrid.setup()`'s own `@cfg` fields (`base`/`step`/`nice`/`hideText`), layered onto
 * `RangeGridOptions` (the full set of fields `RangeGrid`'s own inherited methods - `initDomain()`/
 * `center`/`top`/`bottom`/`left`/`right`/`wrapper` - actually read, even though `LogGrid.setup()`
 * itself doesn't provide defaults for most of them; see header comment quirk 4). */
export interface LogGridOptions extends RangeGridOptions {
  /** @cfg {Number} [base=10] log's base */
  base?: number;
}

/**
 * Port of `chart.grid.log`'s `LogGrid` constructor function as a real ES class, per Phase 0 rule
 * 2. `extends RangeGrid` (confirmed `extend: "chart.grid.range"`). No explicit constructor - same
 * zero-parameter convention every concrete grid class in this port uses.
 */
export class LogGrid extends RangeGrid {
  declare grid: LogGridOptions;

  /** `Draw.render()` lifecycle hook: fully replaces (not extends) `RangeGrid.drawBefore()` -
   * resolves a `log()`-based scale (instead of `linear()`) from the inherited `initDomain()`, sets
   * up its range (reversed for `"left"`/`"right"` orient, same as `RangeGrid`), and computes
   * `this.ticks`/`this.values` from it. See header comment quirks 1-3 for the three real
   * divergences from `RangeGrid.drawBefore()`: `grid.unit` is forced to `false` before
   * `initDomain()` even runs (silently discarding any configured numeric/function `unit`), the
   * scale is never `.clamp()`-ed, and `this.step` is read directly from the raw `grid.step` config
   * rather than `initDomain()`'s own auto-computed `domain.step`. */
  // `drawBefore`/`draw` declared as arrow-function CLASS FIELDS, not method syntax - same
  // TS2425-avoidance convention every other concrete grid subclass in this port already
  // established (`Draw` declares both as optional instance PROPERTIES, matching the original's
  // own per-instance closure assignment).
  drawBefore = (): void => {
    // PRESERVED QUIRK 1 (see header comment): forces `grid.unit = false` before `initDomain()`
    // (inherited from `RangeGrid`) ever reads it.
    (this.grid as unknown as Record<string, unknown>).unit = false;

    const domain = this.initDomain();
    const obj = this.getGridSize();

    this.scale = log(this.grid.base).domain(domain);

    let arr: [number, number];
    if (this.grid.orient == "left" || this.grid.orient == "right") {
      arr = [obj.end, obj.start];
    } else {
      arr = [obj.start, obj.end];
    }
    (this.scale as LogScale).range(arr);

    // PRESERVED QUIRK 2 (see header comment): no `.clamp(...)` call here, unlike the inherited
    // `RangeGrid.drawBefore()`'s own explicit `this.scale.clamp(this.grid.clamp)`.

    this.start = obj.start;
    this.size = obj.size;
    this.end = obj.end;
    // PRESERVED QUIRK 3 (see header comment): reads `this.grid.step` directly, NOT
    // `domain.step` (the value `RangeGrid.drawBefore()`'s own copy of this line uses).
    this.step = this.grid.step as number;
    this.nice = this.grid.nice ?? false;
    this.ticks = (this.scale as LogScale).ticks(this.step, this.nice);

    if (this.grid.orient == "left" || this.grid.orient == "right") {
      this.ticks.reverse();
    }

    this.bar = 6;
    this.values = [];

    for (let i = 0, len = this.ticks.length; i < len; i++) {
      this.values[i] = (this.scale as LogScale)(this.ticks[i]);
    }
  };

  /** `Draw.render()` lifecycle hook: the entry point that actually triggers this grid's SVG
   * rendering, via `CoreGrid.drawGrid()` (inherited orient dispatch - `top`/`bottom`/`left`/
   * `right`/`center`/`wrapper` all come from `RangeGrid`, unchanged). */
  draw = (): { root: TransElement; scale: unknown } => {
    // Same dead-string-argument adaptation every other concrete grid's `draw()` already documents
    // (`CoreGrid.drawGrid()` takes zero parameters - the original's own `this.drawGrid("log")`
    // argument was always discarded).
    return this.drawGrid();
  };

  /** Byte-faithful to the original's own literal `LogGrid.setup()` (this class's 4 fields only) -
   * does NOT additionally merge `RangeGrid.setup()`'s base fields (see header comment quirk 4). */
  static setup(): Record<string, unknown> {
    return {
      /** @cfg {Number} [base=10] log's base */
      base: 10,
      step: 4,
      nice: false,
      /** @cfg {Boolean} [hideText=false] Determines whether to show text across the grid. */
      hideText: false,
    };
  }
}
