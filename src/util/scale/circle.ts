// Port of juijs-graph's `src/util/scale/circle.js` ("util.scale.circle").
//
// The circle-scale factory module. Similar to `util/scale/ordinal.js` (the standalone ordinal
// module - see `ordinal.ts`'s header for the split between two ordinal implementations), this
// defines domain/range/rangePoints/rangeBands geometry. Unlike `util/scale/ordinal.js`, this
// implementation doesn't implement a callable function (the JS original has `function func(t) {}`
// as a no-op), and has simpler factory construction - no numeric-index resolution or caching.

/** The scale object returned by `circle()` - see its doc comment. */
export interface CircleScale {
  domain(): (string | number)[]
  domain(values: (string | number)[]): CircleScale
  range(): number[]
  range(values: number[]): CircleScale
  rangePoints(interval: [number, number], padding?: number): CircleScale
  rangeBands(
    interval: [number, number],
    padding?: number,
    outerPadding?: number
  ): CircleScale
  rangeBand(): number
}

/** Creates a circle scale (domain values mapped to evenly-spaced angle/radius positions). */
export function circle(): CircleScale {
  let _domain: (string | number)[] = []
  let _range: number[] = []
  let _rangeBand = 0

  // Plain no-op function (preserved from original, which has `function func(t) {}`).
  // Unlike `ordinal.ts`, this doesn't provide a callable interface or numeric resolution.
  const func = (() => {}) as any as CircleScale

  // Plain `function`/`return this` (not arrow/`return func`), matching the original's own
  // `return this;` - see `./linear.ts`'s comment for why this matters.
  func.domain = function (this: CircleScale, values?: (string | number)[]) {
    if (typeof values === 'undefined') {
      return _domain
    }

    for (let i = 0; i < values.length; i++) {
      _domain[i] = values[i]
    }

    return this
  } as CircleScale['domain']

  func.range = function (this: CircleScale, values?: number[]) {
    if (typeof values === 'undefined') {
      return _range
    }

    for (let i = 0; i < values.length; i++) {
      _range[i] = values[i]
    }

    return this
  } as CircleScale['range']

  func.rangePoints = (
    interval: [number, number],
    padding = 0
  ): CircleScale => {
    const step = _domain.length
    const unit = (interval[1] - interval[0] - padding) / step

    const range: number[] = []
    for (let i = 0; i < _domain.length; i++) {
      if (i === 0) {
        range[i] = interval[0] + padding / 2 + unit / 2
      } else {
        range[i] = range[i - 1] + unit
      }
    }

    _range = range
    _rangeBand = unit

    return func
  }

  func.rangeBands = (
    interval: [number, number],
    _padding = 0,
    _outerPadding = 0
  ): CircleScale => {
    const count = _domain.length
    const step = count - 1
    const band = (interval[1] - interval[0]) / step

    const range: number[] = []
    for (let i = 0; i < _domain.length; i++) {
      if (i === 0) {
        range[i] = interval[0]
      } else {
        range[i] = band + range[i - 1]
      }
    }

    _rangeBand = band
    _range = range

    return func
  }

  func.rangeBand = () => _rangeBand

  return func
}
