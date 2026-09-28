// Port of juijs-graph's `src/util/scale/time.js` ("util.scale.time").
//
// The time-scale factory module. Like `util/scale/log.js` and `util/scale/circle.js`, it wraps
// a linear scale - in this case for time/date domain values. Uses `util/time.ts`'s `add()` and
// time unit constants (already ported in Phase A batch 2) to generate time-based tick marks.
//
// The original's `jui.include("util.time")` becomes a real import from './time.ts', reusing
// the same `add()` logic that phase already ported with full coverage (and matching all existing
// unit constants: `years`, `months`, `days`, `hours`, `minutes`, `seconds`, `milliseconds`,
// `weeks`).

import { linear } from './linear'
import * as timeUtil from '../time'

/** The callable scale object returned by `time()` - see its doc comment. */
export interface TimeScale {
  (x: Date | number): number
  cache(): Record<string, number>
  min(): number
  max(): number
  rangeMin(): number
  rangeMax(): number
  rate(value: number, max: number): number
  clamp(isClamp?: boolean): void
  domain(): number[]
  domain(values: (Date | number)[]): TimeScale
  range(): number[]
  range(values: number[]): TimeScale
  rangeRound(values: number[]): TimeScale
  rangeBand(): number | null
  invert(y: number): Date
  ticks(type: string, interval: number): Date[]
  realTicks(type: string, interval: number): Date[]
}

/** Creates a time scale (domain: Date objects / unix timestamps, range: numeric pixels). */
export function time(): TimeScale {
  const _domain: number[] = []
  let _rangeBand: number | undefined

  const func = linear() as any as TimeScale
  const df = func.domain as (values?: number[]) => any

  // Store original domain method before override
  const originalDomainMethod = df

  // Override domain() to accept Date objects and convert to unix timestamps
  func.domain = function (this: TimeScale, domain?: (Date | number)[]): any {
    if (!domain) {
      return originalDomainMethod.call(func)
    }

    for (let i = 0; i < domain.length; i++) {
      _domain[i] = +domain[i]
    }

    return originalDomainMethod.call(func, _domain)
  } as any

  // Override min/max to use the actual _domain array
  func.min = function () {
    return Math.min(_domain[0], _domain[_domain.length - 1])
  }

  func.max = function () {
    return Math.max(_domain[0], _domain[_domain.length - 1])
  }

  func.rate = function (value: number, max: number) {
    return func(func.max() * (value / max))
  }

  // Generate evenly-spaced time ticks at a given interval
  func.ticks = function (type: string, interval: number): Date[] {
    let start = _domain[0]
    const end = _domain[1]

    const times: Date[] = []
    while (start < end) {
      times.push(new Date(+start))
      start = +(timeUtil.add(new Date(start), type as any, interval))
    }

    times.push(new Date(+start))

    const first = func(times[1])
    const second = func(times[2])

    _rangeBand = second - first

    return times
  } as any

  // Generate time ticks starting from the "real" (calendar-aligned) beginning of the period
  func.realTicks = function (type: string, interval: number): Date[] {
    let start = _domain[0]
    const end = _domain[1]

    const times: Date[] = []
    const date = new Date(+start)
    let realStart: Date | null = null

    if (type === timeUtil.years) {
      realStart = new Date(date.getFullYear(), 0, 1)
    } else if (type === timeUtil.months) {
      realStart = new Date(date.getFullYear(), date.getMonth(), 1)
    } else if (type === timeUtil.days || type === timeUtil.weeks) {
      realStart = new Date(date.getFullYear(), date.getMonth(), date.getDate())
    } else if (type === timeUtil.hours) {
      realStart = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        date.getHours(),
        0,
        0,
        0
      )
    } else if (type === timeUtil.minutes) {
      realStart = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        date.getHours(),
        date.getMinutes(),
        0,
        0
      )
    } else if (type === timeUtil.seconds) {
      realStart = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        date.getHours(),
        date.getMinutes(),
        date.getSeconds(),
        0
      )
    } else if (type === timeUtil.milliseconds) {
      realStart = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        date.getHours(),
        date.getMinutes(),
        date.getSeconds(),
        date.getMilliseconds()
      )
    }

    if (realStart) {
      realStart = timeUtil.add(realStart, type as any, interval)

      while (+realStart < +end) {
        times.push(new Date(+realStart))
        realStart = timeUtil.add(realStart, type as any, interval)
      }
    }

    const first = func(times[1])
    const second = func(times[2])

    _rangeBand = second - first

    return times
  } as any

  func.rangeBand = function (): number | null {
    return _rangeBand ?? null
  }

  func.invert = function (y: number): Date {
    const f = linear().domain(func.range()).range(func.domain())
    return new Date(f(y))
  } as any

  return func
}
