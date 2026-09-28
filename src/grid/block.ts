// Port of juijs-graph's `src/grid/block.js` ("chart.grid.block", extend: "chart.grid.core").
//
// `extend:` field grepped directly (not assumed) - confirms `class BlockGrid extends CoreGrid`.
// Only extra Phase A dependency beyond `grid/core.ts`: `util/scale.ts`'s embedded `ordinal()` (the
// SIMPLE-invert version, not the fuller `_isRangePoints`-aware `./scale/ordinal.ts` - per this
// project's own Phase A discrepancy writeup, `grid/block.js` is one of the two real call sites,
// alongside `grid/fullblock.js`, that settles which `ordinal()` real grid code actually uses).
//
// `BlockGrid` renders an ORDINAL (category) axis: one evenly-SPACED point per domain item (via
// `ordinal().rangePoints()`), plus one extra trailing boundary tick drawn separately after each
// `top`/`bottom`/`left`/`right` loop (see below) - this is what makes a "block" grid visually
// divide the axis into N even segments with dividers at both ends, unlike a plain N-point scatter.
//
// ============================================================================================
// Cross-check against jui-chart-vue's `useAxis.ts`/`useChartLayout.ts` Phase F writeup - the
// "range-axis-reverses/block-axis-never-does" orientation asymmetry
// ============================================================================================
// jui-chart-vue's `PORT_STATUS.md` (~L6433-6438, auditing `useChartLayout.ts`) already confirmed,
// reading this exact file: `drawBefore()` below always uses `range = [obj.start, obj.end]` with
// **no `orient` check at all** - unlike `grid/range.js`'s `drawBefore()`, which swaps to
// `[obj.end, obj.start]` for `orient == "left"/"right"`. Re-confirmed here directly against this
// file's own `drawBefore()` (see below): still `range = [obj.start, obj.end]`, unconditionally, for
// every orient. No discrepancy from jui-chart-vue's finding - reused directly, not re-derived.
// `useAxis.ts` itself has no block/ordinal-scale equivalent to cross-check (jui-chart-vue's own
// x/y-axis composables only ever build linear scales) - `initDomain()`/`wrapper()` below are full
// independent ports, verified via hand-traced/Node-cross-checked `block.spec.ts` cases instead.
//
// ============================================================================================
// Preserved quirks/bugs (Node/hand-verified against the literal original, not merely inferred)
// ============================================================================================
//  1. **`top()`/`bottom()`/`left()`/`right()`'s trailing boundary-tick call passes `null`, not
//     `false`, as `isActive`** (`this.createGridX("top", this.domain.length, this.end, null,
//     true)`) - `createGridX`'s real body (`grid/draw2d.js`, not yet ported) only ever uses
//     `isActive` as a boolean-context argument to `this.color(isActive, ...)`/theme lookups, where
//     `null` and `false` are behaviorally identical (both falsy) - not a bug, just untyped JS
//     looseness. Reproduced via an explicit cast here (TS requires the declared `boolean` param).
//  2. **`CoreGrid.drawTop()`/`.drawBottom()`/`.drawLeft()`/`.drawRight()`'s own `isLast` check is
//     `i === len - 1 && grid.type !== "block"`** (see `grid/core.ts`) - i.e. for a `BlockGrid`
//     specifically, `isLast` is ALWAYS `false` inside that inner per-domain-item loop, no matter
//     what `i` is. This isn't a `block.ts`-local bug - it's *why* `top()`/etc. below draw one
//     EXTRA `createGridX`/`createGridY` call after the loop (with `isLast: true` explicit): the
//     loop itself structurally can never produce the trailing boundary tick on its own for a block
//     grid. Confirmed by reading both files together, not obvious from either alone.
//  3. **`initDomain()`'s reachable `math.ts` `nice()` `ReferenceError`**: NOT applicable to this
//     file - `BlockGrid` uses `ordinal()`, which has no `nice`/`isNice` concept at all (that's
//     `grid/range.ts`'s concern, via `linear().ticks(step, nice)`). Noted here only to explicitly
//     rule it out for this file, since the dependency map flagged it generically for the
//     `block`+`range` batch.
//  4. **`initDomain()`'s `grid.reverse` flag is a genuine NO-OP for the STRING-domain branch
//     specifically - a real, previously-undocumented finding, Node-cross-checked, not obvious
//     from a single read**: when `reverse` is true, the per-item loop ALREADY iterates `data`
//     backward (`start = data.length-1, end = 0, step = -1`) to build `domain`; then, after the
//     if/else block, the unconditional `if (this.grid.reverse) domain.reverse();` reverses that
//     SAME array a second time - undoing the first reversal exactly. Net effect, verified via a
//     literal Node transcription: `initDomain()` with a string `grid.domain` produces the IDENTICAL
//     final array regardless of `grid.reverse`'s value. This double-reversal-cancels-out quirk is
//     UNIQUE to the string-domain branch - the function-domain and array-domain branches (which
//     build `domain` in natural forward order, with no internal reversal of their own) are
//     genuinely reversed by that same final `domain.reverse()` call, as intended. Preserved
//     exactly (not fixed), tested in `block.spec.ts` (string-domain reverse-is-a-no-op case, next
//     to a function-domain reverse-DOES-work case for direct contrast).
//  5. **`wrapper()`'s own `reverse ? len - i - 1 : i` branch is effectively DEAD CODE for the
//     primary, realistic call pattern - a genuine, previously-undocumented finding**: `wrapper()`
//     only returns the `new_scale` closure (the one containing this reverse-handling branch) when
//     `key` is truthy (`return (key) ? _.extend(new_scale, old_scale) : old_scale;`) - and
//     `new_scale(i)`'s FIRST condition, `typeof i == 'number' && key`, is therefore always `true`
//     whenever `new_scale` itself is even reachable AND `i` is a number (the universal call shape
//     for every real caller in this engine - `i` is always a loop index or row index, never a
//     string). So the reverse-handling `else` branch can only ever run if `new_scale` is called
//     with a non-numeric `i` while `key` is set - not how any consumer in this codebase invokes a
//     grid's exported scale. Preserved and unit-tested directly (per this project's established
//     "preserved dead code, tested via direct invocation" convention, e.g. `grid/core.ts`'s
//     `getLineOption()` split-bug) rather than removed, since it's still real, reachable-in-
//     principle code, not deleted from the port.
//
// `wrapper()`'s `_.extend(new_scale, old_scale)` (real `util.base.extend`, NOT `grid/core.ts`'s own
// narrower local `extend()` helper, which only supports a plain-object `add`): the real
// `util/base.js`'s `extend(origin, add, skip)` accepts `add` typed either `"object"` OR
// `"function"` (`typeCheck(["object","function"], add)`) - `old_scale` here IS a function (the
// `ordinal()` scale, with `.domain`/`.range`/`.rangePoints`/`.rangeBand`/`.invert` as own
// properties). Since `new_scale` starts with none of those properties already set, the real
// `extend()`'s per-key `isRecursive(origin[key])` check is always false (origin[key] is
// `undefined` for every key), so every key gets a plain overwrite - behaviorally identical, for
// this exact call shape, to `Object.assign(new_scale, old_scale)`, used here instead (same
// substitution precedent as `util/scale.ts`'s own `$.extend` -> `Object.assign` deviation).

import { CoreGrid } from './core'
import type { TransElement } from '../util/svg/element.transform'
import { ordinal } from '../util/scale'
import type { OrdinalScale } from '../util/scale'

/** `BlockGrid.setup()`'s own `@cfg` fields, merged (by `base/axis.ts`'s `drawGridType()`, before
 * this class ever sees `this.grid`) with `CoreGrid.setup()`'s fields (`orient`/`hide`/`color`/...
 * - see `grid/core.ts`) plus ad-hoc fields real callers may set that neither `setup()` declares
 * (e.g. `realtime`, read directly by `CoreGrid.checkDrawLineX`/`Y`). Declared as a narrowing
 * override of `Draw`'s own `grid: any` field, same convention `grid/core.ts` uses for
 * `chart`/`axis`. */
export interface BlockGridOptions {
  /** @cfg {String/Array/Function} [domain=null] Sets the value displayed on an axis. */
  domain?: string | (string | number)[] | ((this: unknown) => (string | number)[]) | null
  /** @cfg {Boolean} [reverse=false] Reverses the value on domain values */
  reverse?: boolean
  /** @cfg {Number} [max=10] Sets the maximum value of a grid. */
  max?: number
  /** @cfg {Boolean} [hideText=false] Determines whether to show text across the grid. */
  hideText?: boolean
  /** @cfg {String} [key=null] Sets the value on the grid to the value for the specified key. */
  key?: string | null
  // CoreGrid.setup() + ad-hoc fields real at runtime (merged in by drawGridType()), read by this
  // file's own methods or by CoreGrid's own methods this file calls into.
  orient?: string | null
  type?: string
  hide?: boolean
  color?: unknown
  realtime?: boolean
  [extra: string]: unknown
}

/**
 * Port of `chart.grid.block`'s `BlockGrid` constructor function as a real ES class, per Phase 0
 * rule 2. `extends CoreGrid` (confirmed `extend: "chart.grid.core"`).
 */
export class BlockGrid extends CoreGrid {
  declare grid: BlockGridOptions

  // Set by `drawBefore()` below - this grid's resolved ordinal domain/point layout.
  domain!: (string | number)[]
  points!: number[]
  start!: number
  size!: number
  end!: number
  band!: number
  half_band!: number
  bar!: number
  reverse!: boolean

  // Mixed in externally by `registerGridDraw2D`/`registerGridDraw3D` (see `grid/core.ts`) - NOT
  // declared by `CoreGrid` itself (it only declares the mixin members its OWN methods need);
  // `BlockGrid` calls these directly, so it declares its own definite-assignment slots, same
  // convention. Calling any of these before a mixin has run throws the same "not a
  // function"-shaped `TypeError` the original would too.
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
   * mixed-in `drawCenter()`, offset by `half_band` (the same per-item centering `top()`/`bottom()`/
   * `left()`/`right()` below use), plus the shared base line for this side. Unlike the other four
   * orients, `center` has no trailing boundary tick of its own. */
  center(g: TransElement): void {
    this.drawCenter(g, this.domain, this.points, null, this.half_band)
    this.drawBaseLine('center', g)
  }

  /** Draws the top-oriented grid: the per-tick background pattern (`drawPattern`), the shared
   * per-domain-item tick/label loop (`CoreGrid.drawTop()`), the base line, and finally one extra
   * boundary tick drawn explicitly at `this.end`. That trailing call is required because
   * `CoreGrid.drawTop()`'s own `isLast` check is always `false` for `grid.type === "block"` (see
   * header comment quirk 2) - without it a block grid would never get its final divider. The
   * `null as unknown as boolean` cast preserves the original's `isActive: null` argument there
   * (quirk 1; behaviorally identical to `false` in every real `createGridX` caller). */
  top(g: TransElement): void {
    this.drawPattern('top', this.domain, this.points, true)
    this.drawTop(g, this.domain, this.points, null, this.half_band)
    this.drawBaseLine('top', g)
    // Trailing boundary tick - see header comment quirk 2. `isActive: null` preserved (quirk 1).
    g.append(this.createGridX('top', this.domain.length, this.end, null as unknown as boolean, true))
  }

  /** Same as `top()` above, for the bottom edge. */
  bottom(g: TransElement): void {
    this.drawPattern('bottom', this.domain, this.points, true)
    this.drawBottom(g, this.domain, this.points, null, this.half_band)
    this.drawBaseLine('bottom', g)
    g.append(this.createGridX('bottom', this.domain.length, this.end, null as unknown as boolean, true))
  }

  /** Same as `top()` above, for the left edge (`createGridY`/`drawLeft` in place of
   * `createGridX`/`drawTop`). */
  left(g: TransElement): void {
    this.drawPattern('left', this.domain, this.points, true)
    this.drawLeft(g, this.domain, this.points, null, this.half_band)
    this.drawBaseLine('left', g)
    g.append(this.createGridY('left', this.domain.length, this.end, null as unknown as boolean, true))
  }

  /** Same as `left()` above, for the right edge. */
  right(g: TransElement): void {
    this.drawPattern('right', this.domain, this.points, true)
    this.drawRight(g, this.domain, this.points, null, this.half_band)
    this.drawBaseLine('right', g)
    g.append(this.createGridY('right', this.domain.length, this.end, null as unknown as boolean, true))
  }

  /** Resolves this grid's ordinal domain array from `grid.domain`: a string reads that field off
   * each axis data row (in forward or, when `grid.reverse` is set, backward row order); a
   * function is called once with `this.chart` bound as `this` and is expected to return the whole
   * domain array at once (unlike per-item resolution elsewhere in this engine); an array is used
   * as-is. Whatever the source, the result is then unconditionally reversed again when
   * `grid.reverse` is set - see header comment quirk 4 for why this makes `reverse` a genuine
   * no-op specifically for the string-domain branch (which already iterated backward), while
   * still correctly reversing the function/array branches (which build forward). */
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
   * through a configured `grid.key` field instead of a raw index: when `key` is set, wraps
   * `scale` in a `new_scale(i)` closure that looks up `axis.data[i][key]` and passes that value
   * through the underlying ordinal `scale`. Returns `scale` unwrapped when `key` is not set. See
   * header comment quirk 5: the `reverse`-handling fallback branch (only reachable when `key` is
   * set but `i` is not a number) is effectively dead code for every real caller in this codebase,
   * since a scale is always invoked with a numeric index. */
  wrapper(scale: OrdinalScale, key?: string): OrdinalScale {
    const old_scale = scale
    const self = this
    const len = self.domain.length
    const reverse = self.grid.reverse

    function new_scale(i: string | number): number | null {
      if (typeof i === 'number' && key) {
        return old_scale((self.axis.data[i] as Record<string, unknown>)[key] as string | number)
      } else {
        return old_scale(reverse ? len - (i as number) - 1 : (i as number))
      }
    }

    // See header comment: behaviorally identical, for this call shape, to the real
    // `util.base.extend(new_scale, old_scale)`.
    return key ? (Object.assign(new_scale, old_scale) as OrdinalScale) : old_scale
  }

  // `drawBefore`/`draw` declared as arrow-function CLASS FIELDS, not method syntax - `Draw`
  // declares both as optional instance PROPERTIES (`drawBefore?: () => void; draw?: () => any;`),
  // matching the original's own per-instance closure assignment (`this.drawBefore = function()
  // {...}`), never a prototype method there either. TypeScript's `TS2425` override check requires
  // matching property-vs-method "kind" between base and subclass - same class-ification
  // type-system consequence `grid/core.ts`'s own `drawAfter` field already documents, not a
  // behavior change (arrow-field `this` binding is irrelevant here: both are always invoked as
  // `this.drawBefore()`/`this.draw()`, from `Draw.render()`).
  /** `Draw.render()` lifecycle hook: resolves this grid's ordinal scale from `initDomain()` and
   * `getGridSize()`, laying out one evenly spaced point per domain item across
   * `[obj.start, obj.end]` (unconditionally, regardless of `orient` - see header comment's
   * cross-check note on why this differs from `grid/range.ts`'s left/right-reversing
   * `drawBefore()`), then caches the resulting `domain`/`points`/`start`/`size`/`end`/`band`/
   * `half_band`/`bar`/`reverse` fields for `top()`/`bottom()`/`left()`/`right()`/`center()` to
   * read. */
  drawBefore = (): void => {
    const domain = this.initDomain()
    const obj = this.getGridSize()
    const range: [number, number] = [obj.start, obj.end]

    // scale 설정 (set up the scale)
    this.scale = ordinal().domain(domain)
    ;(this.scale as OrdinalScale).rangePoints(range)

    this.start = obj.start
    this.size = obj.size
    this.end = obj.end
    this.points = (this.scale as OrdinalScale).range()
    this.domain = (this.scale as OrdinalScale).domain()

    this.band = (this.scale as OrdinalScale).rangeBand()
    this.half_band = this.band / 2
    this.bar = 6
    this.reverse = this.grid.reverse ?? false
  }

  /** `Draw.render()` lifecycle hook: the entry point that actually triggers this grid's SVG
   * rendering, via `CoreGrid.drawGrid()`. */
  draw = (): { root: TransElement; scale: unknown } => {
    // Original: `return this.drawGrid("block");` - `drawGrid()` never reads any argument (see
    // `grid/core.ts`), so `"block"` was always dead code there too. Dropped here only to satisfy
    // TS's 0-arg `drawGrid()` signature - not a behavior change (Phase 0 rule 6: documented, not
    // silently deviated).
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
      /** @cfg {String} [key=null] Sets the value on the grid to the value for the specified key. */
      key: null,
    }
  }
}
