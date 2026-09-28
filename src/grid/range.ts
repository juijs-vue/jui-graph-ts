// Port of juijs-graph's `src/grid/range.js` ("chart.grid.range", extend: "chart.grid.core").
//
// `extend:` field grepped directly (not assumed) - confirms `class RangeGrid extends CoreGrid`.
// Extra Phase A deps beyond `grid/core.ts`: `util/math.ts` (`div`/`fixed`) and `util/scale.ts`'s
// embedded `linear()`.
//
// `RangeGrid` renders a LINEAR (numeric) axis: computes a `[min, max]` domain from the configured
// data/domain/step, builds a `linear()` scale over it, and draws one tick per `scale.ticks(step,
// nice)` result - the "value axis" counterpart to `grid/block.ts`'s ordinal "category axis".
//
// ============================================================================================
// Cross-check against jui-chart-vue's `useAxis.ts`/`useChartLayout.ts` Phase F writeup - the
// "range-axis-reverses/block-axis-never-does" orientation asymmetry (the other half, from this
// file's side)
// ============================================================================================
// jui-chart-vue's `PORT_STATUS.md` (~L6433-6438) confirmed, reading this exact file's
// `drawBefore()`: `if (orient=="left"||"right") arr = [obj.end, obj.start] else [obj.start,
// obj.end]` - i.e. `RangeGrid` REVERSES its range for left/right orient (top/bottom does not),
// unlike `grid/block.ts`'s `BlockGrid`, which never reverses regardless of orient. Re-confirmed
// directly against this file's own `drawBefore()` below (`this.grid.orient == "left" || "right"`
// branch) - matches exactly, reused jui-chart-vue's finding directly, not re-derived. Net visual
// effect: a left/right-oriented range grid's SCREEN-pixel range runs high-to-low (so a larger
// domain value ends up physically higher/further-right on screen, matching normal chart Y-axis
// convention), while top/bottom always runs low-to-high in screen-pixel terms - and this asymmetry
// is genuinely NOT mirrored by `BlockGrid`'s own `drawBefore()`, which ignores `orient` for its
// own range entirely. `useAxis.ts`'s `resolveAxisOrient()` doesn't itself need to know about this
// (it just resolves top/bottom/left/right defaults) - the reversal is purely this file's own
// `drawBefore()` concern, confirmed by direct reading, no discrepancy found.
//
// ============================================================================================
// `util/math.ts`'s `nice()` - reachable from here directly (CORRECTED, see math.ts's own header)
// ============================================================================================
// `drawBefore()` below does `this.ticks = this.scale.ticks(this.step, this.nice)`, where
// `this.nice = this.grid.nice` (a real, user-settable `@cfg`, default `false`). `util/scale.ts`'s
// `linear().ticks(count, isNice)` calls `math.ts`'s `nice(min, max, ticks, isNice)`, which
// genuinely computes a real 1/2/5/10-rounded tick range/spacing whenever `isNice` is truthy - a
// previous pass here mis-diagnosed this as always throwing `ReferenceError: niceFraction is not
// defined` (see `math.ts`'s own header comment for the full correction, including why loading
// this file's own real `nice: true` demos - e.g. `grid_block_log`'s log-grid, which reaches this
// same code path via `LogGrid extends RangeGrid` - directly against the live legacy site never
// throws). So: any real `RangeGrid`/`LogGrid` configured with `nice: true` renders correctly, in
// both the original engine and this port. Tested below (`drawBefore()` with `nice: true` does not
// throw and produces the expected ticks).
//
// ============================================================================================
// Preserved bugs/quirks found and documented (Node/hand-verified against the literal original,
// not merely inferred from a single read) - `initDomain()`'s value-list construction
// ============================================================================================
//  1. **The string-domain branch's per-item array handling is genuinely buggy, unlike the
//     sibling function-domain branch**: for a string `grid.domain` (a field name), each data
//     row's field value may itself be an array (e.g. a [min,max] range per row). The STRING
//     branch computes `Math.max(value)`/`Math.min(value)` - calling `Math.max`/`Math.min` on the
//     ARRAY DIRECTLY, with no `.apply`/spread. `Math.max([1,2,3])` coerces the array via
//     `ToNumber` (`Number([1,2,3])` is `NaN` for any array with more than one element - only a
//     single-element array like `[5]` coerces successfully, to `5`) - so this branch produces
//     `NaN` for any real multi-element per-row array. The FUNCTION-domain branch (a few lines
//     below, same file) computes the exact same thing correctly, via `Math.max.apply(Math,
//     value)`/`Math.min.apply(Math, value)`. Confirmed by directly comparing both branches in the
//     literal original source, not obvious from reading either branch alone. Preserved exactly
//     (not fixed), tested in `range.spec.ts` (both the single-element-array "accidentally works"
//     case and the multi-element-array NaN case).
//  2. **The string-domain branch pushes an extra `0` onto `value_list` for EVERY non-array row**
//     (unconditional `value_list.push(0)` in its `else` branch), while the function-domain branch
//     only pushes `0` ONCE total, guarded by an `isCheck` flag. Both branches exist to ensure `0`
//     is always a candidate min/max bound (so a domain of all-positive or all-negative values
//     still includes `0`) - but the string-domain branch does it far more heavily than necessary
//     (harmless for the final `Math.min`/`Math.max` result itself, since extra `0`s don't change
//     the min/max, but it does mean `value_list`'s length differs substantially between the two
//     branches for equivalent inputs - a real, previously-undocumented asymmetry). Preserved,
//     tested (`value_list`'s min/max is unaffected, but the asymmetry is noted/tested via a spy
//     wrapping `Math.min`/`Math.max` to record the array length passed in).

import { CoreGrid } from './core'
import type { TransElement } from '../util/svg/element.transform'
import { linear } from '../util/scale'
import type { LinearScale } from '../util/scale'
import { div, fixed, multi } from '../util/math'

/** `RangeGrid.setup()`'s own `@cfg` fields, merged with `CoreGrid.setup()`'s (see
 * `grid/block.ts`'s `BlockGridOptions` for the same convention/reasoning). */
export interface RangeGridOptions {
  /** @cfg {String/Array/Function} [domain=null] Sets the value displayed on an axis. */
  domain?: string | number[] | ((this: unknown, row: unknown) => number | number[]) | null
  /** @cfg {Array} [step=10] Sets the interval of the scale displayed on a grid. */
  step?: number
  /** @cfg {Number} [min=0] Sets the minimum value of a grid. */
  min?: number
  /** @cfg {Number} [max=0] Sets the maximum value of a grid. */
  max?: number
  /** @cfg {Number} [unit=null] Multiplies the axis value to be displayed. */
  unit?: number | ((this: unknown, grid: RangeGridOptions) => number) | null
  /** @cfg {Boolean} [clamp=true] */
  clamp?: boolean
  /** @cfg {Boolean} [reverse=false] Reverses the value on domain values */
  reverse?: boolean
  /** @cfg {String} [key=null] Sets the value on the grid to the value for the specified key. */
  key?: string | null
  /** @cfg {Boolean} [hideText=false] Determines whether to show text across the grid. */
  hideText?: boolean
  /** @cfg {Boolean} [nice=false] Automatically sets the value of a specific section. */
  nice?: boolean
  orient?: string | null
  type?: string
  hide?: boolean
  color?: unknown
  realtime?: boolean
  [extra: string]: unknown
}

/** `initDomain()`'s return value: a 2-element `[min, max]` `Array` carrying an extra, non-index
 * `step` property (`domain.step = ...`) - same "array with a bolt-on property" shape the original
 * itself builds (`var domain = [end, start]; domain.step = ...;`). */
interface RangeDomain extends Array<number> {
  step?: number
}

/**
 * Port of `chart.grid.range`'s `RangeGrid` constructor function as a real ES class, per Phase 0
 * rule 2. `extends CoreGrid` (confirmed `extend: "chart.grid.core"`).
 */
export class RangeGrid extends CoreGrid {
  declare grid: RangeGridOptions

  // Set by `drawBefore()` below.
  start!: number
  size!: number
  end!: number
  step!: number
  nice!: boolean
  ticks!: number[]
  values!: number[]
  bar!: number

  // Mixed in externally, same convention as `grid/block.ts` - see there for the full rationale.
  drawPattern!: (position: string, ticks: unknown[], values: number[], isMove?: boolean) => void
  drawBaseLine!: (position: string, g: TransElement) => void
  drawCenter!: (
    g: TransElement,
    ticks: unknown[],
    values: number[],
    checkActive: ((tick: unknown) => boolean) | null,
    moveZ: number,
  ) => void

  /** Draws the `"center"` (z-axis, full-3D) orientation: one z-axis tick per resolved value via
   * the mixed-in `drawCenter()`, with an active-tick check that highlights the `0` tick
   * specifically (but only when `0` isn't also the scale's own `min()`/`max()`, avoiding a
   * doubled-up highlight at the domain's own edge), plus the shared base line for this side. */
  center(g: TransElement): void {
    const min = (this.scale as LinearScale).min()
    const max = (this.scale as LinearScale).max()

    this.drawCenter(
      g,
      this.ticks,
      this.values,
      (tick: unknown) => tick == 0 && tick != min && tick != max,
      0,
    )
    this.drawBaseLine('center', g)
  }

  /** Draws the top-oriented grid: the per-tick background pattern (`drawPattern`), the shared
   * per-tick draw loop (`CoreGrid.drawTop()`, using `this.ticks`/`this.values` as populated by
   * `drawBefore()`) with the same `0`-tick active-highlight check as `center()` above, and the
   * base line. */
  top(g: TransElement): void {
    this.drawPattern('top', this.ticks, this.values)
    const min = (this.scale as LinearScale).min()
    const max = (this.scale as LinearScale).max()

    this.drawTop(g, this.ticks, this.values, (tick: unknown) => tick == 0 && tick != min && tick != max, 0)
    this.drawBaseLine('top', g)
  }

  /** Same as `top()` above, for the bottom edge. */
  bottom(g: TransElement): void {
    this.drawPattern('bottom', this.ticks, this.values)
    const min = (this.scale as LinearScale).min()
    const max = (this.scale as LinearScale).max()

    this.drawBottom(g, this.ticks, this.values, (tick: unknown) => tick == 0 && tick != min && tick != max, 0)
    this.drawBaseLine('bottom', g)
  }

  /** Same as `top()` above, for the left edge (`drawLeft` in place of `drawTop`). */
  left(g: TransElement): void {
    this.drawPattern('left', this.ticks, this.values)
    const min = (this.scale as LinearScale).min()
    const max = (this.scale as LinearScale).max()

    this.drawLeft(g, this.ticks, this.values, (tick: unknown) => tick == 0 && tick != min && tick != max, 0)
    this.drawBaseLine('left', g)
  }

  /** Same as `left()` above, for the right edge. */
  right(g: TransElement): void {
    this.drawPattern('right', this.ticks, this.values)
    const min = (this.scale as LinearScale).min()
    const max = (this.scale as LinearScale).max()

    this.drawRight(g, this.ticks, this.values, (tick: unknown) => tick == 0 && tick != min && tick != max, 0)
    this.drawBaseLine('right', g)
  }

  /** Overrides `CoreGrid.wrapper()` (identity there) so index-based scale lookups can resolve
   * through a configured `grid.key` field instead of a raw index: when `key` is set, wraps `scale`
   * in a `new_scale(i)` closure that looks up `axis.data[i][key]` and passes that value through the
   * underlying linear `scale`. Returns `scale` unwrapped when `key` is not set. Unlike
   * `BlockGrid.wrapper()`/`FullBlockGrid.wrapper()`, there is no numeric-index fallback branch here
   * at all - `new_scale` always resolves through `key`, faithfully matching the original (which has
   * no reverse-handling `else` branch for this file). */
  wrapper(scale: LinearScale, key?: string): LinearScale {
    const old_scale = scale
    const self = this

    function new_scale(i: number): number {
      return old_scale((self.axis.data[i] as Record<string, unknown>)[key as string] as number)
    }

    // Behaviorally identical, for this call shape, to the real `util.base.extend(new_scale,
    // old_scale)` - see `grid/block.ts`'s header comment for the full reasoning (same substitution).
    return key ? (Object.assign(new_scale, old_scale) as LinearScale) : old_scale
  }

  /** Resolves this grid's `[min, max]` numeric domain (as a `RangeDomain` - the pair plus a
   * bolt-on `.step` count) from `grid.domain`/`grid.min`/`grid.max`/`grid.unit`/`grid.step`. A
   * string `grid.domain` reads that field off every axis data row (each value may itself be a
   * `[min,max]`-shaped array - see header comment quirk 1 for a real, preserved `NaN` bug specific
   * to this branch); a function is called once per row and may likewise return a value or an
   * array; an array is used directly as the value list. Whichever source ran (or none, the
   * min/max-only usage mode - see the inline FIX note below), the result feeds into `unit`
   * (explicit `grid.unit`, or auto-computed via `div(max-min, step)` and rounded to a "nice"
   * step), which in turn is walked outward from `0` (via `fixed(unit).plus`/`.minus`) to produce
   * the final snapped `[end, start]` domain and its `.step` count. See header comment quirk 2 for
   * an extra, harmless `value_list` length asymmetry between the string- and function-domain
   * branches, and the inline FIX note for a genuine bug (now fixed, unlike this file's other
   * preserved quirks) in how a `null`/`undefined` `grid.domain` used to be handled. */
  initDomain(): RangeDomain {
    let domain: RangeDomain = []
    let min = this.grid.min || undefined
    let max = this.grid.max || undefined
    const data = this.data() as Record<string, unknown>[]
    let value_list: number[] = []
    let isArray = false
    // Tracks whether ANY of the three `grid.domain` branches below actually ran (string/function/
    // array) - distinct from `value_list.length > 0`, which a real string/function domain could
    // still legitimately reach with an empty array (e.g. `data.length === 0`) and whose existing
    // behavior in that edge case (`Math.min/max.apply(Math, [])` = `Infinity`/`-Infinity`,
    // preserved as-is) this fix does not touch - only the previously-unhandled "domain is null/
    // undefined entirely" case is new here (see FIX note below).
    let hasDomainSource = false

    if (typeof this.grid.domain === 'string') {
      hasDomainSource = true
      const field = this.grid.domain

      value_list = new Array(data.length)
      let index = data.length
      while (index--) {
        const value = data[index][field]

        if (Array.isArray(value)) {
          // PRESERVED BUG (see header comment 1): no `.apply`/spread - `Math.max`/`Math.min`
          // coerce the array directly via `ToNumber`, which is `NaN` for any array with more
          // than one element.
          value_list[index] = Math.max(value as unknown as number)
          value_list.push(Math.min(value as unknown as number))
        } else {
          value_list[index] = value as number
          // PRESERVED QUIRK (see header comment 2): unconditional, unlike the function-domain
          // branch's single `isCheck`-guarded push below.
          value_list.push(0)
        }
      }
    } else if (typeof this.grid.domain === 'function') {
      hasDomainSource = true
      value_list = new Array(data.length)

      let isCheck = false
      let index = data.length
      while (index--) {
        const value = (this.grid.domain as (this: unknown, row: unknown) => number | number[]).call(
          this.chart,
          data[index],
        )

        if (Array.isArray(value)) {
          value_list[index] = Math.max.apply(Math, value)
          value_list.push(Math.min.apply(Math, value))
        } else {
          value_list[index] = value

          if (!isCheck) {
            value_list.push(0)
            isCheck = true
          }
        }
      }
    } else if (Array.isArray(this.grid.domain)) {
      hasDomainSource = true
      value_list = this.grid.domain as number[]
      isArray = true
    }
    // else: `domain` is `null`/`undefined` (its own documented default, `RangeGrid.setup()`'s
    // `domain: null`) - the "min/max-only" usage mode, see FIX note below. `value_list` stays `[]`
    // and neither branch below runs; `min`/`max` fall through unchanged from the `this.grid.min`/
    // `this.grid.max` reads above (defaulting to `0` next, matching `RangeGrid.setup()`'s own
    // `min: 0, max: 0` defaults).

    // FIX (previously a real, verified bug - RangeGrid-specific, NOT a blanket fix of the
    // analogous-shaped `DateGrid.initDomain()` issue, which stays intentionally preserved/
    // undocumented-as-fixed per this project's own precedent): the `else` branch above used to
    // fire for ANY non-string/non-function `domain` value - including `null`/`undefined`, not just
    // a real array - unconditionally setting `isArray = true` and computing `Math.min/max.apply(
    // Math, value_list)` against a `null`/`undefined` `value_list`. Per the ECMAScript spec,
    // `Function.prototype.apply(thisArg, null | undefined)` means "call with zero arguments", so
    // this silently evaluated to `Math.min()`/`Math.max()` = `Infinity`/`-Infinity` - which then
    // UNCONDITIONALLY OVERWROTE any real, explicitly-configured `min`/`max` (the documented,
    // intended way to use a range axis without a `domain` array at all), collapsing the scale's
    // domain to `[0, 0]` (verified: `unit = div(max-min, step)` with `max=-Infinity, min=Infinity`
    // drives both the `while (start < max)` and `while (end > min)` loops to never execute) and
    // producing `NaN` for any non-zero input value. Confirmed via a downstream consumer
    // (`jui-chart-vue`) hitting this in real, otherwise-correctly-configured charts - and via
    // Node-tracing that NONE of this file's own `range.spec.ts` tests ever left `domain` at its
    // real default (every test explicitly overrode it to a string/function/array before calling
    // `initDomain()`), so this exact case had zero test coverage. Now: the array-only branch is
    // gated on `Array.isArray(this.grid.domain)`, and a `null`/`undefined` domain takes neither
    // branch, leaving `value_list` empty and `min`/`max` untouched by this step - handled by the
    // `hasDomainSource` guard below instead of the previous unconditional `Math.min/max.apply`
    // call (guarding on `hasDomainSource`, not `value_list.length`, so a real string/function
    // domain that happens to produce an empty `value_list` - e.g. no data rows - still takes the
    // exact same `Math.min/max.apply(Math, [])` path it always did, unchanged).
    if (hasDomainSource) {
      const tempMin = Math.min.apply(Math, value_list)
      const tempMax = Math.max.apply(Math, value_list)

      if (isArray) {
        min = tempMin
        max = tempMax
      } else {
        if (typeof min == 'undefined' || min > tempMin) min = tempMin
        if (typeof max == 'undefined' || max < tempMax) max = tempMax
      }
    } else {
      if (typeof min == 'undefined') min = 0
      if (typeof max == 'undefined') max = 0
    }

    let unit: number
    if (typeof this.grid.unit === 'function') {
      unit = (this.grid.unit as (this: unknown, grid: RangeGridOptions) => number).call(this.chart, this.grid)
    } else if (typeof this.grid.unit === 'number') {
      unit = this.grid.unit
    } else {
      if (min > 0) {
        min = Math.floor(min)
      }

      unit = div(max - min, this.grid.step as number) // (max - min) / this.grid.step

      if (unit > 1) {
        unit = Math.ceil(unit)
      } else if (0 < unit && unit < 1) {
        unit = div(Math.ceil(multi(unit, 10)), 10)
      }
    }

    if (unit == 0) {
      domain = [0, 0]
    } else {
      let start = 0

      const fixedMath = fixed(unit)
      while (start < max) {
        start = fixedMath.plus(start, unit)
      }

      let end = start
      while (end > min) {
        end = fixedMath.minus(end, unit)
      }

      domain = [end, start]
      domain.step = Math.abs(end - start) / unit
    }

    if (this.grid.reverse) {
      domain.reverse()
    }

    return domain
  }

  /** `Draw.render()` lifecycle hook: resolves this grid's `linear()` scale from `initDomain()` and
   * `getGridSize()`, reversing the pixel range to `[obj.end, obj.start]` specifically for
   * `"left"`/`"right"` orient (unlike `grid/block.ts`'s `BlockGrid`, which never reverses - see
   * header comment's cross-check note), applies `grid.clamp`, and caches the resulting
   * `start`/`size`/`end`/`step`/`nice`/`ticks`/`values`/`bar` fields (reversing `ticks` too, for
   * the same left/right orients) for `top()`/`bottom()`/`left()`/`right()`/`center()` to read. */
  // `drawBefore`/`draw` declared as arrow-function CLASS FIELDS, not method syntax - see
  // `grid/block.ts`'s identical note (matching `Draw`'s own optional-instance-PROPERTY shape,
  // TS2425 override-kind requirement, not a behavior change).
  drawBefore = (): void => {
    const domain = this.initDomain()

    const obj = this.getGridSize()

    this.scale = linear().domain(domain)

    let arr: [number, number]
    if (this.grid.orient == 'left' || this.grid.orient == 'right') {
      arr = [obj.end, obj.start]
    } else {
      arr = [obj.start, obj.end]
    }

    ;(this.scale as LinearScale).range(arr)
    ;(this.scale as LinearScale).clamp(this.grid.clamp)

    this.start = obj.start
    this.size = obj.size
    this.end = obj.end
    this.step = domain.step as number
    this.nice = this.grid.nice ?? false
    this.ticks = (this.scale as LinearScale).ticks(this.step, this.nice)

    if (this.grid.orient == 'left' || this.grid.orient == 'right') {
      this.ticks.reverse()
    }

    this.bar = 6

    this.values = []

    for (let i = 0, len = this.ticks.length; i < len; i++) {
      this.values[i] = (this.scale as LinearScale)(this.ticks[i])
    }
  }

  /** `Draw.render()` lifecycle hook: the entry point that actually triggers this grid's SVG
   * rendering, via `CoreGrid.drawGrid()`. */
  draw = (): { root: TransElement; scale: unknown } => {
    // See `grid/block.ts`'s `draw()` for the same dead-argument note (`drawGrid()` never reads
    // any argument - `"range"` was always unused in the original too).
    return this.drawGrid()
  }

  static setup(): Record<string, unknown> {
    return {
      /** @cfg {String/Array/Function} [domain=null] Sets the value displayed on an axis. */
      domain: null,
      /** @cfg {Array} [step=10] Sets the interval of the scale displayed on a grid. */
      step: 10,
      /** @cfg {Number} [min=0] Sets the minimum value of a grid. */
      min: 0,
      /** @cfg {Number} [max=0] Sets the maximum value of a grid. */
      max: 0,
      /** @cfg {Number} [unit=null] Multiplies the axis value to be displayed. */
      unit: null,
      /**
       * @cfg {Boolean} [clamp=true]
       *
       * max 나 min 을 넘어가는 값에 대한 체크,
       * true 이면 넘어가는 값도 min, max 에서 조정, false 이면  비율로 계산해서 넘어가는 값 적용
       */
      clamp: true,
      /** @cfg {Boolean} [reverse=false] Reverses the value on domain values */
      reverse: false,
      /** @cfg {String} [key=null] Sets the value on the grid to the value for the specified key. */
      key: null,
      /** @cfg {Boolean} [hideText=false] Determines whether to show text across the grid. */
      hideText: false,
      /** @cfg {Boolean} [nice=false] Automatically sets the value of a specific section. */
      nice: false,
    }
  }
}
