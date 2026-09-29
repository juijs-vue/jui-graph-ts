// Port of juijs-graph's `src/util/scale/linear.js` ("util.scale.linear").
//
// The standalone linear-scale factory module - `util/scale/log.js` and `util/scale/time.js`
// both build on this one (`jui.include("util.scale.linear")`), per the original's module
// registry (dropped here per PORT_STATUS.md Phase 0 rule 1). Note: `util/scale.js` (this
// project's `../scale.ts`) has its OWN separately-duplicated `linear()` implementation, byte-
// identical in logic to this one - see `../scale.ts`'s header comment for why both exist and
// which one grid code actually consumes.
//
// Cross-checked against jui-chart-vue's `src/composables/useScale.ts` (`createLinearScale`,
// already hand-traced/verified in jui-chart-vue's Phase F audit against `util/scale.js` lines
// 490-684, which is this same algorithm). jui-chart-vue's port intentionally only implements the
// `reverse: false` code path (its own comment: "always the non-reversed code path (reverse=false
// in the original was only used by unported 3d/z-axis code)") and folds `domain`/`range`/`clamp`
// into getters/setters instead of the original's `.domain(values)`/`.range(values)` builder-style
// calls. This port is the first FULL 1:1 port of `ticks()`'s `reverse` branch.

import { fixed, interpolateNumber, interpolateRound, nice } from '../math'

/** The callable scale object returned by `linear()` - see its doc comment. */
export interface LinearScale {
  (x: number): number
  cache(): Record<string, number>
  min(): number
  max(): number
  rangeMin(): number
  rangeMax(): number
  rate(value: number, max: number): number
  clamp(isClamp?: boolean): void
  domain(): number[]
  domain(values: number[]): LinearScale
  range(): number[]
  range(values: number[]): LinearScale
  rangeRound(values: number[]): LinearScale
  rangeBand(): number | null
  invert(y: number): number
  ticks(count?: number, isNice?: boolean, intNumber?: number, reverse?: boolean): number[]
}

/** Creates a linear numeric scale (`domain` -> `range`, both `[start, end]`, either order).
 *
 * FIXED (was a real bug, shared with `../scale.ts`'s own embedded `linear()` - see that copy's doc
 * comment for the full writeup, including why it was reachable and why it's fixed here rather than
 * left preserved): the out-of-domain extrapolation branches used to always add/subtract a strictly
 * non-negative rate, which is only correct for an ASCENDING `range` - for a DESCENDING one (e.g. a
 * left/right-orient grid's pixel range) it extrapolated backwards, toward the wrong edge. Fixed by
 * reusing the exact same signed linear formula the in-domain branch already uses (`pos =
 * (x-domain[0])/distDomain; callFunction(pos)`), which is correct for any domain/range direction
 * and for any `x`, in-domain or not - the two out-of-domain branches now only decide whether to
 * clamp first, not how to interpolate. Byte-identical to the real upstream engine before this fix,
 * not a port regression. */
export function linear(): LinearScale {
  let _domain = [0, 1]
  let _range = [0, 1]
  let _isRound = false
  let _isClamp = false
  const _cache: Record<string, number> = {}

  let roundFunction: ((t: number) => number) | null = null
  let numberFunction: ((t: number) => number) | null = null

  // These all start out `null` in the original (not e.g. `0`) and rely on JS's implicit
  // `null -> 0` coercion in arithmetic/comparison if `func(x)` is ever called before `.domain()`/
  // `.range()` populate them - preserved via a `null`-at-runtime-but-typed-`number` cast rather
  // than changing the actual comparison/arithmetic logic below.
  let domainMin: number = null as unknown as number
  let domainMax: number = null as unknown as number

  let distDomain: number = null as unknown as number

  // Also starts `null`; unlike the numeric fields above, calling a still-null `callFunction`
  // throws (matching the original - `.range()` must be called before the scale is invoked).
  let callFunction: ((t: number) => number) | null = null
  let _rangeBand: number | null = null

  const func = ((x: number): number => {
    if (domainMax < x) {
      if (_isClamp) {
        return func(domainMax)
      }
    } else if (domainMin > x) {
      if (_isClamp) {
        return func(domainMin)
      }
    }

    const pos = (x - _domain[0]) / distDomain

    return callFunction!(pos)
  }) as LinearScale

  func.cache = () => _cache

  func.min = () => Math.min.apply(Math, _domain)

  func.max = () => Math.max.apply(Math, _domain)

  func.rangeMin = () => Math.min.apply(Math, _range)

  func.rangeMax = () => Math.max.apply(Math, _range)

  func.rate = (value: number, max: number) => func(func.max() * (value / max))

  func.clamp = (isClamp?: boolean) => {
    _isClamp = isClamp || false
  }

  // Plain `function`/`return this` (not arrow/`return func`) matching the original's own
  // `return this;` - preserves correct dynamic dispatch if these are ever copied onto another
  // object via `Object.assign`/`$.extend` (as `util/scale/log.js`/`util/scale/time.js` do to this
  // exact module's `linear()`) - a real, test-caught bug in this project's own `../scale.ts`
  // embedded duplicate during verification, see PORT_STATUS.md.
  func.domain = function (this: LinearScale, values?: number[]) {
    if (!values) {
      return _domain
    }

    for (let i = 0; i < values.length; i++) {
      _domain[i] = values[i]
    }

    domainMin = func.min()
    domainMax = func.max()

    distDomain = _domain[1] - _domain[0]

    return this
  } as LinearScale['domain']

  func.range = function (this: LinearScale, values?: number[]) {
    if (!values) {
      return _range
    }

    for (let i = 0; i < values.length; i++) {
      _range[i] = values[i]
    }

    roundFunction = interpolateRound(_range[0], _range[1])
    numberFunction = interpolateNumber(_range[0], _range[1])

    callFunction = _isRound ? roundFunction : numberFunction

    return this
  } as LinearScale['range']

  func.rangeRound = (values: number[]): LinearScale => {
    _isRound = true

    return func.range(values)
  }

  func.rangeBand = () => _rangeBand

  func.invert = (y: number): number => {
    const f = linear().domain(_range).range(_domain)
    return f(y)
  }

  func.ticks = (count?: number, isNice?: boolean, /** @deprecated */ _intNumber?: number, reverse = false): number[] => {
    const max = func.max()

    if (_domain[0] == 0 && _domain[1] == 0) {
      return []
    }

    const obj = nice(_domain[0], _domain[1], count || 10, isNice || false)

    const arr: number[] = []

    let start = reverse ? obj.max : obj.min
    const end = reverse ? obj.min : obj.max
    const unit = obj.spacing
    const fixedMath = fixed(unit)

    while (reverse ? end <= start : start <= end) {
      arr.push(start)

      if (reverse) {
        start = fixedMath.minus(start, unit)
      } else {
        start = fixedMath.plus(start, unit)
      }
    }

    if (reverse) {
      if (arr[0] != max) {
        arr.unshift(max)
      }

      for (let i = 0, len = arr.length; i < len; i++) {
        arr[i] = Math.abs(arr[i] - max)
      }
    } else {
      if (arr[arr.length - 1] != end && start > end) {
        arr.push(end)
      }

      if (_domain[0] > _domain[1]) {
        arr.reverse()
      }
    }

    const first = func(arr[0])
    const second = func(arr[1])

    _rangeBand = Math.abs(second - first)

    return arr
  }

  return func
}
