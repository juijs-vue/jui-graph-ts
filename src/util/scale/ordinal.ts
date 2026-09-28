// Port of juijs-graph's `src/util/scale/ordinal.js` ("util.scale.ordinal").
//
// The standalone ordinal-scale factory module. Note: `util/scale.js` (this project's
// `../scale.ts`) also has its own separately-duplicated `ordinal()` - but that one's `invert()`
// is a SIMPLER, different implementation (`Math.ceil(x / _rangeBand)`, no `rangePoints` branch)
// than this file's. See `../scale.ts`'s header comment and this project's PORT_STATUS.md for the
// full discrepancy writeup (this was the exact thing jui-chart-vue's Phase F audit flagged as a
// "checked-in source vs. compiled dist bundle" mismatch when it only had `util/scale.js` to check
// against - both versions actually already coexist in this checked-in source tree, in these two
// different files).
//
// Cross-checked against jui-chart-vue's `useScale.ts`'s `createOrdinalScale`/`OrdinalScale.invert`
// (hand-traced/verified in jui-chart-vue's Phase F audit) - `createOrdinalScale` there is a direct
// 1:1 port of THIS file's `rangePoints()` + `invert()` (confirmed by jui-chart-vue's own writeup:
// "the actual match is in `jui-chart/dist/jui-chart.js`... whose `ordinal().invert()` has the
// exact `_isRangePoints` branch `useScale.ts` ports"). `rangeBands()` is intentionally NOT ported
// by jui-chart-vue (see its own doc comment) but IS ported here (full-scope goal, Phase 0 rule 8).
//
// Quirks preserved byte-faithfully:
//  - `func(t)` resolving a numeric index only checks `typeof _range[t] != 'undefined'` - it does
//    NOT also add `t` to `_domain` (the original has this literally commented out: `//_domain[t]
//    = t; // FIXME: 이건 나중에 따로 연산해야할 듯` - "this probably needs to be calculated
//    separately later" - an acknowledged-but-unfixed FIXME in the upstream source itself).
//  - `invert()`'s `rangePoints`-mode branch uses `Math.min(_range[0], _range[1])` - only the first
//    two range entries, not a full-array min. Harmless for a real (monotonically increasing)
//    range, but produces `NaN` for a 1-item domain (`_range[1]` is `undefined`, `Math.min(x,
//    undefined) === NaN`).

/** The callable scale object returned by `ordinal()` - see its doc comment. */
export interface OrdinalScale {
  (t: string | number): number | null
  domain(): (string | number)[]
  domain(values: (string | number)[]): OrdinalScale
  range(): number[]
  range(values: number[]): OrdinalScale
  rangePoints(interval: [number, number], padding?: number): OrdinalScale
  rangeBands(interval: [number, number], padding?: number, outerPadding?: number): OrdinalScale
  rangeBand(): number
  invert(x: number): number
}

/** Creates an ordinal scale (an ordered list of domain values mapped to evenly-spaced positions). */
export function ordinal(): OrdinalScale {
  let _domain: (string | number)[] = []
  let _range: number[] = []
  let _rangeBand = 0
  const _cache: Record<string, number> = {}
  let _isRangePoints = false

  const func = ((t: string | number): number | null => {
    const key = '' + t
    if (typeof _cache[key] != 'undefined') {
      return _cache[key]
    }

    let index = -1
    for (let i = 0; i < _domain.length; i++) {
      if (typeof t == 'string' && _domain[i] === t) {
        index = i
        break
      }
    }

    if (index > -1) {
      _cache[key] = _range[index]
      return _range[index]
    } else {
      if (typeof _range[t as number] != 'undefined') {
        // FIXME (upstream, preserved): `_domain[t] = t` is commented out in the original - the
        // index is never actually recorded into `_domain`. See this file's header comment.
        _cache[key] = _range[t as number]
        return _range[t as number]
      }

      return null
    }
  }) as OrdinalScale

  // Plain `function`/`return this` (not arrow/`return func`), matching the original's own
  // `return this;` - see `../scale/linear.ts`'s equivalent comment for why this matters (it's
  // what makes `Object.assign`-style method reuse, elsewhere in this engine, work correctly).
  func.domain = function (this: OrdinalScale, values?: (string | number)[]) {
    if (typeof values == 'undefined') {
      return _domain
    }

    for (let i = 0; i < values.length; i++) {
      _domain[i] = values[i]
    }

    return this
  } as OrdinalScale['domain']

  func.range = function (this: OrdinalScale, values?: number[]) {
    if (typeof values == 'undefined') {
      return _range
    }

    for (let i = 0; i < values.length; i++) {
      _range[i] = values[i]
    }

    return this
  } as OrdinalScale['range']

  func.rangePoints = (interval: [number, number], padding = 0): OrdinalScale => {
    const step = _domain.length
    const unit = (interval[1] - interval[0] - padding) / step

    const range: number[] = []
    for (let i = 0; i < _domain.length; i++) {
      if (i == 0) {
        range[i] = interval[0] + padding / 2 + unit / 2
      } else {
        range[i] = range[i - 1] + unit
      }
    }

    _range = range
    _rangeBand = unit
    _isRangePoints = true

    return func
  }

  func.rangeBands = (interval: [number, number], _padding = 0, _outerPadding = 0): OrdinalScale => {
    const count = _domain.length
    const step = count - 1
    const band = (interval[1] - interval[0]) / step

    const range: number[] = []
    for (let i = 0; i < _domain.length; i++) {
      if (i == 0) {
        range[i] = interval[0]
      } else {
        range[i] = band + range[i - 1]
      }
    }

    _rangeBand = band
    _range = range
    _isRangePoints = false

    return func
  }

  func.rangeBand = () => _rangeBand

  func.invert = (x: number): number => {
    let min = Math.min(_range[0], _range[1])

    if (_isRangePoints) {
      min -= _rangeBand / 2

      let tempX = x
      if (tempX < min) {
        tempX = min
      }
      const result = Math.abs(tempX - min) / _rangeBand
      return Math.floor(result)
    } else {
      const result = Math.abs(x - min) / _rangeBand
      return Math.ceil(result)
    }
  }

  return func
}
