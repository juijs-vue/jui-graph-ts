// Port of juijs-graph's `src/util/scale.js` ("util.scale").
//
// This is the "bundle" scale module: unlike `util/scale/{linear,ordinal,circle,log,time}.js`
// (separate, later-registered modules - `./scale/linear.ts` and `./scale/ordinal.ts` are ported
// alongside this file), this single file re-implements `circle`/`ordinal`/`time`/`log`/`linear`
// as independent, only-loosely-related closures, all inlined into one `util.scale` namespace
// object in the original. **This is the module grid code actually consumes**: every `grid/*.js`
// file does `jui.include("util.scale")` (confirmed by grep: `grid/block.js`, `grid/fullblock.js`,
// `grid/date.js`, `grid/dateblock.js`, `grid/log.js`, `grid/range.js`, `grid/rule.js` all use it) -
// none of them ever do `jui.include("util.scale.linear")`/`.ordinal`/etc. (only the standalone
// `util/scale/log.js` and `util/scale/time.js` modules consume `util.scale.linear`, and nothing in
// the engine's own source consumes the standalone `util/scale/ordinal.js` at all - it exists only
// as public API surface for external consumers like `jui-chart`).
//
// **Important discrepancy finding** (this project's PORT_STATUS.md has the full writeup): this
// file's embedded `ordinal()` has a SIMPLE `invert()` (`Math.ceil(x / _rangeBand)`, no
// `rangePoints`-mode branch) that does NOT match the fuller `_isRangePoints`-aware `invert()` in
// the separate `./scale/ordinal.ts` module (ported from `util/scale/ordinal.js`). jui-chart-vue's
// Phase F audit flagged this exact mismatch when cross-checking `useScale.ts`'s
// `createOrdinalScale` (which matches the FULLER version) against only `node_modules/juijs-graph/
// src/util/scale.js` - concluding the fuller version must live only in `jui-chart`'s *compiled*
// `dist/jui-chart.js` bundle, "built from a newer `util.scale.js` than the `node_modules` copy on
// disk". Having now read this project's full clone (`/home/search5/cl/jui-graph`, same package
// version `1.1.4` as jui-chart-vue's `node_modules/juijs-graph` copy - confirmed byte-identical),
// the real explanation is simpler: **both versions already coexist in the checked-in source
// tree**, just in two different files - this file's embedded `ordinal()` (simple) and the separate
// `util/scale/ordinal.js` (full, `rangePoints`-branch-aware). jui-chart's compiled dist bundle
// evidently ends up using the standalone module's version (consistent with `dist/jui-chart.js`'s
// fuller `invert()`), not this file's embedded one. There is no actual source-vs-dist-bundle
// discrepancy for `ordinal()` - jui-chart-vue's audit simply hadn't cross-checked against the
// separate `util/scale/ordinal.js` file, only this one. (Which one real `jui-chart` grid code
// exercises for ordinal - this embedded one, via `grid/block.js`/`grid/fullblock.js` - is a
// question for this project's own Phase C, when those grid files are ported.)
//
// Cross-checked against jui-chart-vue's `useScale.ts` for the shared `linear`/`ordinal` algorithms
// (see `./scale/linear.ts` and `./scale/ordinal.ts`'s own header comments for the detailed
// cross-check write-ups - this file's embedded `linear()`/`ordinal()` are logically identical to
// those standalone modules, just duplicated inline here).
//
// Deviations from the original, both necessitated by real, otherwise-unresolvable dependency
// gaps (documented in detail in PORT_STATUS.md):
//  1. `log()`'s `$.extend(newFunc, func)` assumed a global jQuery (`$`) that is never imported
//     anywhere in the original source tree - a genuine, pre-existing bug/gap in the upstream
//     engine (confirmed live/used: `grid/log.js` calls `UtilScale.log(...)`, i.e. THIS file's
//     `log()`, so a log-scale grid in the original literally cannot function without a jQuery
//     global present on the page). `$.extend(target, source)` with exactly two plain-object
//     arguments is a simple shallow property copy - behaviorally identical to `Object.assign`,
//     which is used here instead. Not a "fix" (no observable behavior changes), just removing an
//     accidental undeclared global dependency that has no place in a framework-agnostic port.
//  2. `time()` needs a `util/time.js`-shaped `add()` + time-unit-string constants. `util/time.js`
//     was ported (concurrently with this file, by a separate iteration of this same batch) to
//     `./time.ts`, which this file now imports `add()` from directly - a private `addTime()`
//     wrapper below just adapts call sites that pass a raw numeric timestamp (matching this
//     file's own `_domain: number[]` representation) into `add()`'s `Date`-typed first parameter,
//     and pins the call to the single (unit, amount) pair form actually used anywhere in this
//     file (never the general multi-pair variadic form `add()` also supports).

import { fixed, interpolateNumber, interpolateRound, nice } from './math'
import { add } from './time'

// ---------------------------------------------------------------------------------------------
// circle
// ---------------------------------------------------------------------------------------------

/** The callable scale object returned by `circle()` - see its doc comment. */
export interface CircleScale {
  (t: number): void
  domain(): number[]
  domain(values: number[]): CircleScale
  range(): number[]
  range(values: number[]): CircleScale
  rangePoints(interval: [number, number], padding?: number): CircleScale
  rangeBands(interval: [number, number], padding?: number, outerPadding?: number): CircleScale
  rangeBand(): number
}

/** Scale for circular/radar coordinates - `func(t)` is a no-op in the original (never assigned). */
export function circle(): CircleScale {
  let _domain: number[] = []
  let _range: number[] = []
  let _rangeBand = 0

  const func = ((_t: number): void => {
    // Intentionally a no-op - matches the original's empty `function func(t) {}` body.
  }) as CircleScale

  // Plain `function`/`return this` (not arrow/`return func`) to match the original's dynamic-
  // `this` `return this;` - see `linear()`'s domain/range comment below for why this matters.
  func.domain = function (this: CircleScale, values?: number[]) {
    if (typeof values == 'undefined') {
      return _domain
    }
    for (let i = 0; i < values.length; i++) {
      _domain[i] = values[i]
    }
    return this
  } as CircleScale['domain']

  func.range = function (this: CircleScale, values?: number[]) {
    if (typeof values == 'undefined') {
      return _range
    }
    for (let i = 0; i < values.length; i++) {
      _range[i] = values[i]
    }
    return this
  } as CircleScale['range']

  func.rangePoints = (interval: [number, number], padding = 0): CircleScale => {
    const step = _domain.length
    const unit = (interval[1] - interval[0] - padding) / step

    const range: number[] = []
    for (let i = 0; i < _domain.length; i++) {
      range[i] = i == 0 ? interval[0] + padding / 2 + unit / 2 : range[i - 1] + unit
    }

    _range = range
    _rangeBand = unit

    return func
  }

  func.rangeBands = (interval: [number, number], _padding = 0, _outerPadding = 0): CircleScale => {
    const count = _domain.length
    const step = count - 1
    const band = (interval[1] - interval[0]) / step

    const range: number[] = []
    for (let i = 0; i < _domain.length; i++) {
      range[i] = i == 0 ? interval[0] : band + range[i - 1]
    }

    _rangeBand = band
    _range = range

    return func
  }

  func.rangeBand = () => _rangeBand

  return func
}

// ---------------------------------------------------------------------------------------------
// ordinal (embedded/simple - see this file's header comment for the discrepancy vs ./scale/ordinal.ts)
// ---------------------------------------------------------------------------------------------

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
  /** Simple form: no `rangePoints`-mode branch - see this file's header comment. */
  invert(x: number): number
}

export function ordinal(): OrdinalScale {
  let _domain: (string | number)[] = []
  let _range: number[] = []
  let _rangeBand = 0
  const _cache: Record<string, number> = {}

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
        _domain[t as number] = t
        _cache[key] = _range[t as number]
        return _range[t as number]
      }

      return null
    }
  }) as OrdinalScale

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
      range[i] = i == 0 ? interval[0] + padding / 2 + unit / 2 : range[i - 1] + unit
    }

    _range = range
    _rangeBand = unit

    return func
  }

  func.rangeBands = (interval: [number, number], _padding = 0, _outerPadding = 0): OrdinalScale => {
    const count = _domain.length
    const step = count - 1
    const band = (interval[1] - interval[0]) / step

    const range: number[] = []
    for (let i = 0; i < _domain.length; i++) {
      range[i] = i == 0 ? interval[0] : band + range[i - 1]
    }

    _rangeBand = band
    _range = range

    return func
  }

  func.rangeBand = () => _rangeBand

  func.invert = (x: number): number => Math.ceil(x / _rangeBand)

  return func
}

// ---------------------------------------------------------------------------------------------
// linear (embedded duplicate of ./scale/linear.ts - see this file's header comment)
// ---------------------------------------------------------------------------------------------

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

/** See `./scale/linear.ts`'s `linear()` - identical algorithm, duplicated here in the original. */
export function linear(): LinearScale {
  let _domain = [0, 1]
  let _range = [0, 1]
  let _isRound = false
  let _isClamp = false
  const _cache: Record<string, number> = {}

  let roundFunction: ((t: number) => number) | null = null
  let numberFunction: ((t: number) => number) | null = null

  let domainMin: number = null as unknown as number
  let domainMax: number = null as unknown as number

  let rangeMin: number = null as unknown as number
  let rangeMax: number = null as unknown as number

  let distDomain: number = null as unknown as number
  let distRange: number = null as unknown as number
  let rate = 0

  let callFunction: ((t: number) => number) | null = null
  let _rangeBand: number | null = null

  const func = ((x: number): number => {
    if (domainMax < x) {
      if (_isClamp) {
        return func(domainMax)
      }
      return _range[0] + Math.abs(x - _domain[0]) * rate
    } else if (domainMin > x) {
      if (_isClamp) {
        return func(domainMin)
      }
      return _range[0] - Math.abs(x - _domain[0]) * rate
    } else {
      const pos = (x - _domain[0]) / distDomain
      return callFunction!(pos)
    }
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

  // `domain`/`range` are written as plain `function` expressions returning `this` (NOT arrow
  // functions closing over `func`) specifically so that `log()`'s `Object.assign(newFunc, func)`
  // reuse works correctly: when these are copied onto `newFunc` and later called as
  // `newFunc.domain(...)`/`newFunc.range(...)`, `this` must dynamically resolve to `newFunc` (the
  // original's own behavior, via its own `return this;`) - an arrow function would instead always
  // return the lexically-captured `func` (the wrong object), silently breaking `log()`'s
  // `.domain(...).range(...)` chaining. Confirmed by a real test failure during this port's own
  // verification - see this project's PORT_STATUS.md.
  func.domain = function (this: LinearScale, values?: number[]) {
    if (!values) return _domain

    for (let i = 0; i < values.length; i++) {
      _domain[i] = values[i]
    }

    domainMin = func.min()
    domainMax = func.max()
    distDomain = _domain[1] - _domain[0]

    return this
  } as LinearScale['domain']

  func.range = function (this: LinearScale, values?: number[]) {
    if (!values) return _range

    for (let i = 0; i < values.length; i++) {
      _range[i] = values[i]
    }

    roundFunction = interpolateRound(_range[0], _range[1])
    numberFunction = interpolateNumber(_range[0], _range[1])

    rangeMin = func.rangeMin()
    rangeMax = func.rangeMax()
    distRange = Math.abs(rangeMax - rangeMin)
    rate = distRange / distDomain
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
      start = reverse ? fixedMath.minus(start, unit) : fixedMath.plus(start, unit)
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

// ---------------------------------------------------------------------------------------------
// time (uses the real `util/time.ts`'s `add()` - see this file's header comment, deviation 2)
// ---------------------------------------------------------------------------------------------

type TimeUnit = 'years' | 'months' | 'days' | 'hours' | 'minutes' | 'seconds' | 'milliseconds' | 'weeks'

/**
 * `util/time.js`'s `add()`, scoped down to the single (unit, amount) pair form actually used
 * anywhere in this file (never the general multi-pair variadic form `add()` also supports) and
 * accepting a numeric timestamp directly (matching `_domain`'s own `number[]` representation,
 * rather than requiring callers to wrap every value in `new Date(...)` first).
 */
function addTime(date: number | Date, type: TimeUnit, amount: number): Date {
  return add(new Date(date), type, amount)
}

/** The callable scale object returned by `time()` - see its doc comment. */
export interface TimeScale {
  (x: number): number
  cache(): Record<string, number>
  min(): number
  max(): number
  rangeMin(): number
  rangeMax(): number
  rate(value: number, max: number): number
  clamp(isClamp?: boolean): void
  domain(): number[]
  domain(values: (number | Date)[]): TimeScale
  range(): number[]
  range(values: number[]): TimeScale
  rangeRound(values: number[]): TimeScale
  ticks(type: TimeUnit, interval: number): Date[]
  realTicks(type: TimeUnit, interval: number): Date[]
  rangeBand(): number
  invert(y: number): Date
}

/** Time scale: a `linear()` scale over numeric (`+date`) domain values, with date-aware ticks. */
export function time(): TimeScale {
  let _domain: number[] = []
  let _rangeBand = 0

  const func = linear() as unknown as TimeScale
  const df = func.domain as (values?: number[]) => number[] | TimeScale

  func.domain = ((domain?: (number | Date)[]) => {
    if (!domain) {
      return df.call(func) as number[]
    }

    for (let i = 0; i < domain.length; i++) {
      _domain[i] = +domain[i]
    }

    return df.call(func, _domain) as TimeScale
  }) as TimeScale['domain']

  func.min = () => Math.min(_domain[0], _domain[_domain.length - 1])
  func.max = () => Math.max(_domain[0], _domain[_domain.length - 1])
  func.rate = (value: number, max: number) => func(func.max() * (value / max))

  func.ticks = (type: TimeUnit, interval: number): Date[] => {
    let start = _domain[0]
    const end = _domain[1]

    const times: Date[] = []
    while (start < end) {
      times.push(new Date(+start))
      start = +addTime(start, type, interval)
    }
    times.push(new Date(+start))

    const first = func(+times[1])
    const second = func(+times[2])
    _rangeBand = second - first

    return times
  }

  func.realTicks = (type: TimeUnit, interval: number): Date[] => {
    const start = _domain[0]
    const end = _domain[1]

    const times: Date[] = []
    const date = new Date(+start)
    let realStart: Date | null = null

    if (type == 'years') {
      realStart = new Date(date.getFullYear(), 0, 1)
    } else if (type == 'months') {
      realStart = new Date(date.getFullYear(), date.getMonth(), 1)
    } else if (type == 'days' || type == 'weeks') {
      realStart = new Date(date.getFullYear(), date.getMonth(), date.getDate())
    } else if (type == 'hours') {
      realStart = new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), 0, 0, 0)
    } else if (type == 'minutes') {
      realStart = new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes(), 0, 0)
    } else if (type == 'seconds') {
      realStart = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        date.getHours(),
        date.getMinutes(),
        date.getSeconds(),
        0,
      )
    } else if (type == 'milliseconds') {
      realStart = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        date.getHours(),
        date.getMinutes(),
        date.getSeconds(),
        date.getMilliseconds(),
      )
    }

    // Fix realtime tick with seconds
    if (type == 'seconds') {
      realStart = addTime(realStart!, type, interval - (realStart!.getSeconds() % interval))
    } else {
      realStart = addTime(realStart!, type, interval)
    }

    while (+realStart < +end) {
      times.push(new Date(+realStart))
      realStart = addTime(realStart, type, interval)
    }

    const first = func(+times[1])
    const second = func(+times[2])
    _rangeBand = second - first

    return times
  }

  func.rangeBand = () => _rangeBand

  func.invert = (y: number): Date => {
    const f = linear()
      .domain(func.range() as number[])
      .range(func.domain() as number[])
    return new Date(f(y))
  }

  return func
}

// ---------------------------------------------------------------------------------------------
// log (embedded, uses `linear()` above - see this file's header comment, deviation 1)
// ---------------------------------------------------------------------------------------------

/** The callable scale object returned by `log()` - see its doc comment. */
export interface LogScale extends Omit<LinearScale, 'domain' | 'invert' | 'ticks'> {
  (x: number): number
  log(): number[]
  domain(): number[]
  domain(values: number[]): LogScale
  base(base?: number): LogScale
  invert(y: number): number
  ticks(count?: number, isNice?: boolean, intNumber?: number): number[]
}

/**
 * Log scale.
 *
 *     const s = log(10).domain([0, 1000000]).range([0, 300])
 *     s(0)  // 0
 *     s.ticks(4)  // [0, 100, 10000, 1000000]
 */
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
    return Math.pow(_base, (value + '').length - 1) < value
  }

  function getNextMax(value: number): number {
    return Math.pow(_base, (value + '').length)
  }

  const newFunc = ((x: number): number => {
    let value = x

    if (_domainMax !== null && x > _domainMax) {
      value = _domainMax
    } else if (_domainMin !== null && x < _domainMin) {
      value = _domainMin
    }

    return func(logValue(value))
  }) as LogScale

  // Deviation 1 (see header comment): the original uses `$.extend(newFunc, func)` (a global
  // jQuery this file never imports) - `Object.assign` is the behaviorally-identical replacement
  // for this simple two-argument shallow-copy call.
  Object.assign(newFunc, func)

  newFunc.log = (): number[] => {
    const newDomain: number[] = []
    for (let i = 0; i < _domain.length; i++) {
      newDomain[i] = logValue(_domain[i])
    }
    return newDomain
  }

  newFunc.domain = ((values?: number[]) => {
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

    return newFunc
  }) as LogScale['domain']

  newFunc.base = (): LogScale => {
    func.domain(newFunc.log())
    return newFunc
  }

  newFunc.invert = (y: number): number => pow(func.invert(y))

  newFunc.ticks = (count?: number, isNice?: boolean, intNumber?: number): number[] => {
    const arr = func.ticks(count, isNice, intNumber || 100000000000000000000, true)

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
