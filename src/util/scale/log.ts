// Port of juijs-graph's `src/util/scale/log.js` ("util.scale.log").
//
// The log-scale factory module. Like `util/scale/time.js` and `util/scale/circle.js`, it's a
// `jui.include("util.scale.linear")` consumer that wraps a linear scale with a transformed domain
// (via log/pow functions instead of time or circle geometry).
//
// Original used `$.extend(newFunc, func)` (jQuery shallow copy) to copy all linear-scale methods
// onto the wrapper function - replaced here with `Object.assign()`, which is behaviorally
// identical for plain objects. The copy preserves dynamic `this` dispatch, so methods like
// `domain()`/`range()` re-bind correctly to the wrapper (see util/scale/linear.ts's comment on
// `return this` function style). `log()` tests verify this chain works correctly.

import { linear } from './linear'

/** The callable scale object returned by `log()` - see its doc comment. */
export interface LogScale {
  (x: number): number
  cache(): Record<string, number>
  min(): number
  max(): number
  rangeMin(): number
  rangeMax(): number
  rate(value: number, max: number): number
  clamp(isClamp?: boolean): void
  domain(): number[]
  domain(values: number[]): LogScale
  range(): number[]
  range(values: number[]): LogScale
  rangeRound(values: number[]): LogScale
  rangeBand(): number | null
  invert(y: number): number
  ticks(count?: number, isNice?: boolean, intNumber?: number, reverse?: boolean): number[]
  log(): number[]
  base(base: number): LogScale
}

/** Creates a logarithmic scale (transforms domain via log before linear interpolation). */
export function log(base?: number): LogScale {
  const _base = base || 10

  const func = linear()
  let _domain: number[] = []
  let _domainMax: number | null = null
  let _domainMin: number | null = null

  function logValue(value: number): number {
    if (value < 0) {
      return -(Math.log(Math.abs(value)) / Math.log(_base))
    } else if (value > 0) {
      return Math.log(value) / Math.log(_base)
    }

    return 0
  }

  function pow(value: number): number {
    if (value < 0) {
      return -Math.pow(_base, Math.abs(value))
    } else if (value > 0) {
      return Math.pow(_base, value)
    }

    return 0
  }

  function checkMax(value: number): boolean {
    return Math.pow(_base, ((value + '') as any).length - 1) < value
  }

  function getNextMax(value: number): number {
    return Math.pow(_base, ((value + '') as any).length)
  }

  const newFunc = ((x: number): number => {
    let value = x

    if (x > _domainMax!) {
      value = _domainMax!
    } else if (x < _domainMin!) {
      value = _domainMin!
    }

    return func(logValue(value))
  }) as LogScale

  // Copy all linear scale methods to the log scale wrapper (same dynamic `this` dispatch pattern
  // as the original's $.extend, preserved via plain `function`/`return this` in linear.ts).
  Object.assign(newFunc, func)

  newFunc.log = function () {
    const newDomain: number[] = []
    for (let i = 0; i < _domain.length; i++) {
      newDomain[i] = logValue(_domain[i])
    }

    return newDomain
  }

  newFunc.domain = function (this: LogScale, values?: number[]) {
    if (!values) {
      return _domain
    }

    for (let i = 0; i < values.length; i++) {
      _domain[i] = values[i]
    }

    _domainMax = Math.max.apply(Math, _domain)
    _domainMin = Math.min.apply(Math, _domain)

    if (checkMax(_domainMax)) {
      _domain[1] = _domainMax = getNextMax(_domainMax)
    }

    if (checkMax(Math.abs(_domainMin))) {
      const value = getNextMax(Math.abs(_domainMin))
      _domain[0] = _domainMin = _domainMin < 0 ? -value : value
    }

    func.domain(newFunc.log())

    return this
  } as LogScale['domain']

  newFunc.base = function (this: LogScale, _base: number) {
    func.domain(newFunc.log())

    return this
  } as LogScale['base']

  newFunc.invert = function (y: number) {
    // Can't use func.invert() directly because func.domain() has been set to logged values.
    // Instead, manually invert using the range: solve for log value, then pow it.
    const rangeMin = func.rangeMin()
    const rangeMax = func.rangeMax()
    const rangeDist = rangeMax - rangeMin
    const logMin = func.min()
    const logMax = func.max()
    const logDist = logMax - logMin

    // Linear invert: where in [logMin, logMax] does y map to?
    const logValue = logMin + ((y - rangeMin) / rangeDist) * logDist
    return pow(logValue)
  }

  newFunc.ticks = function (
    count?: number,
    isNice?: boolean,
    intNumber?: number
  ): number[] {
    const arr = func.ticks(
      count,
      isNice,
      intNumber || 100000000000000000000,
      true
    )

    if (arr[arr.length - 1] < func.max()) {
      arr.push(func.max())
    }

    const newArr: number[] = []
    for (let i = 0, len = arr.length; i < len; i++) {
      newArr[i] = pow(arr[i])
    }

    return newArr
  }

  return newFunc
}
