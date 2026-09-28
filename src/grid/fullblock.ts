// Port of juijs-graph's `src/grid/fullblock.js` ("chart.grid.fullblock", extend:
// "chart.grid.core").
//
// **`extend:` field grepped directly (not assumed), per this file's own task instructions**:
// `extend: "chart.grid.core"` - i.e. `FullBlockGrid extends CoreGrid` DIRECTLY, the SAME base as
// `grid/block.ts`'s `BlockGrid`, NOT `BlockGrid` itself. There is no `extends BlockGrid`
// relationship anywhere in the original source. The two files are independently-defined sibling
// subclasses of `CoreGrid` that happen to share the same `util/scale.ts` `ordinal()` dependency and
// a near-identical `initDomain()` (byte-for-byte identical to `block.js`'s own `initDomain()`,
// confirmed by diffing the two source files directly) - structurally close, but NOT a real
// inheritance chain. Ported here as a full independent class, per this file's own task instructions
// ("full independent port if it's truly separate" - confirmed separate).
//
// `FullBlockGrid` is a variant of `BlockGrid` that fills each domain item's FULL band width (via
// `ordinal().rangeBands()`, not `.rangePoints()`) rather than placing a single point per item with
// half-band offsets either side - i.e. no gaps between adjacent segments, and no separate trailing
// boundary tick after the draw loop (unlike `BlockGrid`'s `top()`/`bottom()`/`left()`/`right()` -
// see below).
//
// ============================================================================================
// Confirmed identical to `grid/block.ts` (byte-diffed against the original): `initDomain()`
// ============================================================================================
// `initDomain()` below is a byte-for-byte copy of `BlockGrid.initDomain()` in the original source
// (same string/function/array domain-resolution branches, same reverse handling) - ported
// identically here (duplicated, not shared via inheritance, matching the original's own lack of a
// real `extends BlockGrid` relationship). This means `block.ts`'s header-comment quirk 4 (the
// `grid.reverse` flag being a genuine NO-OP for the STRING-domain branch specifically, due to a
// double-reversal cancel-out - Node-cross-checked there) applies here BYTE-IDENTICALLY - re-tested
// directly in `fullblock.spec.ts` rather than only inherited by reference, since this file's own
// `initDomain()` is a real, independent copy of the code, not a call-through to `block.ts`.
//
// ============================================================================================
// Confirmed DIFFERENT from `grid/block.ts` - every other method, each a real, distinct finding
// ============================================================================================
//  1. **`drawBefore()` uses `ordinal().rangeBands(range)`, not `.rangePoints(range)`** - fills the
//     full available width per domain item (no inter-item gap), and sets `half_band` to a HARD
//     `0` (`this.half_band = 0;`), rather than `this.band / 2` (`BlockGrid`'s own computation).
//     `getGridSize()`'s underlying `range` is otherwise built identically (`[obj.start, obj.end]`,
//     no orient-based reversal - same "block-axis-never-reverses" side of the asymmetry `block.ts`
//     documents against jui-chart-vue's `useChartLayout.ts` finding).
//  2. **`center()`/`top()`/`bottom()`/`left()`/`right()` pass a literal `0` as the
//     `moveX`/`moveY`/`moveZ` argument directly** (not `this.half_band`, though it's ALSO always
//     `0` per point 1 above - the original hardcodes the literal regardless), and **`top()`/etc. do
//     NOT draw a trailing boundary tick** after their `drawTop()`/etc. call (unlike `BlockGrid`,
//     which appends one extra `createGridX`/`createGridY` call per orient) - consistent with
//     `rangeBands()` already covering the full axis width with no gap to bound separately.
//  3. **`wrapper()`'s reverse-index arithmetic is OFF BY ONE from `BlockGrid.wrapper()`** - a
//     genuine, previously-undocumented divergence, confirmed by diffing the two files directly:
//     `BlockGrid.wrapper()`'s `new_scale(i)` computes `reverse ? len - i - 1 : i`;
//     `FullBlockGrid.wrapper()`'s own `new_scale(i)` computes `reverse ? len - i : i` (no `- 1`).
//     Since `old_scale`/`ordinal()` is 0-indexed (`_domain[0..len-1]`), `BlockGrid`'s
//     `len - i - 1` maps `i=0` to the LAST domain index (a correct 0-indexed reversal), while
//     `FullBlockGrid`'s `len - i` maps `i=0` to `len` - ONE PAST the last valid domain index
//     (`ordinal()`'s own numeric-index-resolution branch - see `util/scale.ts` - returns `null`
//     for any index with `typeof _range[t] == "undefined"`, so `new_scale(0)` would silently
//     resolve to `null` rather than the expected last band). Preserved exactly (not fixed), tested
//     in `fullblock.spec.ts` alongside `block.ts`'s own correct `- 1` case for direct side-by-side
//     comparison. **Same reachability caveat as `block.ts`'s header-comment quirk 5 applies here
//     too** (worth restating precisely, since it changes how "reachable" this bug really is): this
//     `else` branch (the one containing the off-by-one) only runs when `new_scale` is called with a
//     non-numeric `i` - but `new_scale` itself is only ever returned when `key` is truthy, and
//     `new_scale(i)`'s own first condition (`typeof i == 'number' && key`) wins for every realistic
//     numeric-index call, before this branch is ever reached. Tested via direct unit invocation of
//     `wrapper()`'s returned closure (same "preserved dead code, tested directly" convention), not
//     via a full `drawGrid()` integration path that would never actually exercise it.
//
// No direct jui-chart-vue reference exists for this file specifically (jui-chart-vue's own Phase F
// audit only cross-checked `block.js`/`range.js` against `useAxis.ts`/`useChartLayout.ts`, per its
// own writeup) - `initDomain()`'s cross-check is inherited via the `block.ts`-identical code path
// above; `drawBefore()`/`wrapper()`/orient-methods are independently verified here via hand-traced/
// Node-cross-checked `fullblock.spec.ts` cases.

import { CoreGrid } from './core'
import type { TransElement } from '../util/svg/element.transform'
import { ordinal } from '../util/scale'
import type { OrdinalScale } from '../util/scale'

/** `FullBlockGrid.setup()`'s own `@cfg` fields (a strict subset of `BlockGrid.setup()`'s - no
 * `key`, unlike `BlockGrid`/`RangeGrid`), merged with `CoreGrid.setup()`'s (see `grid/block.ts`'s
 * `BlockGridOptions` for the same convention/reasoning). */
export interface FullBlockGridOptions {
  /** @cfg {String/Array/Function} [domain=null] Sets the value displayed on an axis. */
  domain?: string | (string | number)[] | ((this: unknown) => (string | number)[]) | null
  /** @cfg {Boolean} [reverse=false] Reverses the value on domain values */
  reverse?: boolean
  /** @cfg {Number} [max=10] Sets the maximum value of a grid. */
  max?: number
  /** @cfg {Boolean} [hideText=false] Determines whether to show text across the grid. */
  hideText?: boolean
  orient?: string | null
  type?: string
  hide?: boolean
  color?: unknown
  realtime?: boolean
  [extra: string]: unknown
}

/**
 * Port of `chart.grid.fullblock`'s `FullBlockGrid` constructor function as a real ES class, per
 * Phase 0 rule 2. `extends CoreGrid` (confirmed `extend: "chart.grid.core"` - NOT `BlockGrid`,
 * see header comment).
 */
export class FullBlockGrid extends CoreGrid {
  declare grid: FullBlockGridOptions

  // Set by `drawBefore()` below.
  domain!: (string | number)[]
  points!: number[]
  start!: number
  size!: number
  end!: number
  band!: number
  half_band!: number
  bar!: number
  reverse!: boolean

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

  /** Draws the `"center"` (z-axis, full-3D) orientation: one z-axis tick per domain item via the
   * mixed-in `drawCenter()`, with a literal `0` offset (see header comment point 2 - `half_band`
   * is always `0` for this class anyway, but the original hardcodes the literal regardless), plus
   * the shared base line for this side. */
  center(g: TransElement): void {
    this.drawCenter(g, this.domain, this.points, null, 0)
    this.drawBaseLine('center', g)
  }

  /** Draws the top-oriented grid: the per-tick background pattern (`drawPattern`), the shared
   * per-domain-item tick/label loop (`CoreGrid.drawTop()`), and the base line. Unlike
   * `BlockGrid.top()`, there is no extra trailing boundary tick here - `rangeBands()` (see
   * `drawBefore()` below) already fills the full axis width with no gap left to bound separately
   * (header comment point 2). */
  top(g: TransElement): void {
    this.drawPattern('top', this.domain, this.points)
    this.drawTop(g, this.domain, this.points, null, 0)
    this.drawBaseLine('top', g)
  }

  /** Same as `top()` above, for the bottom edge. */
  bottom(g: TransElement): void {
    this.drawPattern('bottom', this.domain, this.points)
    this.drawBottom(g, this.domain, this.points, null, 0)
    this.drawBaseLine('bottom', g)
  }

  /** Same as `top()` above, for the left edge (`drawLeft` in place of `drawTop`). */
  left(g: TransElement): void {
    this.drawPattern('left', this.domain, this.points)
    this.drawLeft(g, this.domain, this.points, null, 0)
    this.drawBaseLine('left', g)
  }

  /** Same as `left()` above, for the right edge. */
  right(g: TransElement): void {
    this.drawPattern('right', this.domain, this.points)
    this.drawRight(g, this.domain, this.points, null, 0)
    this.drawBaseLine('right', g)
  }

  /** Resolves this grid's ordinal domain array from `grid.domain` - byte-identical logic to
   * `BlockGrid.initDomain()` (see header comment): a string reads that field off each axis data
   * row (forward, or backward when `grid.reverse` is set), a function is called once with
   * `this.chart` and returns the whole domain array at once, an array is used as-is, and the
   * result is then unconditionally reversed again when `grid.reverse` is set - which, exactly as
   * in `BlockGrid`, makes `reverse` a no-op specifically for the string-domain branch (it already
   * iterated backward) while genuinely reversing the function/array branches. */
  initDomain(): (string | number)[] {
    let domain: (string | number)[] = []

    if (typeof this.grid.domain === 'string') {
      const field = this.grid.domain
      const data = this.data() as Record<string, unknown>[]

      let start: number
      let end: number
      let step: number

      if (this.grid.reverse) {
        start = data.length - 1
        end = 0
        step = -1
      } else {
        start = 0
        end = data.length - 1
        step = 1
      }

      for (let i = start; this.grid.reverse ? i >= end : i <= end; i += step) {
        domain.push(data[i][field] as string | number)
      }
    } else if (typeof this.grid.domain === 'function') {
      // block 은 배열을 통째로 리턴함 (block returns the whole array at once)
      domain = (this.grid.domain as (this: unknown) => (string | number)[]).call(this.chart)
    } else if (Array.isArray(this.grid.domain)) {
      domain = this.grid.domain
    }

    if (this.grid.reverse) {
      domain.reverse()
    }

    return domain
  }

  /** Overrides `CoreGrid.wrapper()` (identity there) so index-based scale lookups can resolve
   * through a configured `grid.key` field instead of a raw index - same purpose as
   * `BlockGrid.wrapper()`, but see header comment point 3 for a genuine, preserved OFF-BY-ONE
   * divergence from it: the reverse-index fallback here computes `len - i` (no `- 1`), one past
   * the last valid domain index for a 0-indexed `ordinal()` scale, vs. `BlockGrid`'s correct
   * `len - i - 1`. As with `BlockGrid.wrapper()`, this branch is only reachable when `key` is set
   * but `i` is not a number - not how any real caller in this codebase invokes a grid's scale. */
  wrapper(scale: OrdinalScale, key?: string): OrdinalScale {
    const old_scale = scale
    const self = this
    const len = self.domain.length
    const reverse = self.grid.reverse

    function new_scale(i: string | number): number | null {
      if (typeof i === 'number' && key) {
        return old_scale((self.axis.data[i] as Record<string, unknown>)[key] as string | number)
      } else {
        // PRESERVED BUG (see header comment 3): off by one vs. `BlockGrid.wrapper()`'s
        // `len - i - 1` - no `- 1` here.
        return old_scale(reverse ? len - (i as number) : (i as number))
      }
    }

    // See `grid/block.ts`'s header comment for the full `Object.assign`-equivalence reasoning.
    return key ? (Object.assign(new_scale, old_scale) as OrdinalScale) : old_scale
  }

  // `drawBefore`/`draw` declared as arrow-function CLASS FIELDS, not method syntax - see
  // `grid/block.ts`'s identical note (matching `Draw`'s own optional-instance-PROPERTY shape,
  // TS2425 override-kind requirement, not a behavior change).
  /** `Draw.render()` lifecycle hook: resolves this grid's ordinal scale from `initDomain()` and
   * `getGridSize()`, laying out full-width, gap-free bands across `[obj.start, obj.end]` via
   * `rangeBands()` (unlike `BlockGrid.drawBefore()`'s point-based `rangePoints()`), and caches the
   * resulting `domain`/`points`/`start`/`size`/`end`/`band`/`half_band` (always `0` here)/`bar`/
   * `reverse` fields for `top()`/`bottom()`/`left()`/`right()`/`center()` to read. */
  drawBefore = (): void => {
    const domain = this.initDomain()

    const obj = this.getGridSize()

    // scale 설정 (set up the scale)
    this.scale = ordinal().domain(domain)
    const range: [number, number] = [obj.start, obj.end]

    ;(this.scale as OrdinalScale).rangeBands(range)

    this.start = obj.start
    this.size = obj.size
    this.end = obj.end
    this.points = (this.scale as OrdinalScale).range()
    this.domain = (this.scale as OrdinalScale).domain()

    this.band = (this.scale as OrdinalScale).rangeBand()
    this.half_band = 0
    this.bar = 6
    this.reverse = this.grid.reverse ?? false
  }

  /** `Draw.render()` lifecycle hook: the entry point that actually triggers this grid's SVG
   * rendering, via `CoreGrid.drawGrid()`. */
  draw = (): { root: TransElement; scale: unknown } => {
    // See `grid/block.ts`'s `draw()` for the same dead-argument note (`drawGrid()` never reads
    // any argument - `"fullblock"` was always unused in the original too).
    return this.drawGrid()
  }

  static setup(): Record<string, unknown> {
    return {
      /** @cfg {String/Array/Function} [domain=null] Sets the value displayed on an axis. */
      domain: null,
      /** @cfg {Boolean} [reverse=false] Reverses the value on domain values */
      reverse: false,
      /** @cfg {Number} [max=10] Sets the maximum value of a grid. */
      max: 10,
      /** @cfg {Boolean} [hideText=false] Determines whether to show text across the grid. */
      hideText: false,
    }
  }
}
