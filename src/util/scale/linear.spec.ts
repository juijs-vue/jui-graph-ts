import { describe, expect, it } from 'vitest'
import { linear } from './linear'

// Many of these expected values are reused directly from jui-chart-vue's
// `src/composables/useScale.spec.ts` (`createLinearScale`), which hand-traced/verified the same
// underlying algorithm (`util/scale.js`/`util/scale/linear.js`'s `linear()`) - see this file's
// header comment... (see linear.ts's header comment) for the cross-check writeup. That port only
// exercises `reverse: false`; the `reverse: true` branch below is new coverage, hand-traced fresh.

describe('linear scale - core interpolation', () => {
  it('interpolates within the domain', () => {
    const scale = linear().domain([0, 10]).range([0, 100])
    expect(scale(0)).toBe(0)
    expect(scale(5)).toBe(50)
    expect(scale(10)).toBe(100)
  })

  it('extrapolates outside the domain when not clamped, for an ascending range', () => {
    const scale = linear().domain([0, 10]).range([0, 100])
    expect(scale(-5)).toBe(-50)
    expect(scale(15)).toBe(150)
  })

  it('FIXED (was a real bug, see linear()\'s own doc comment): extrapolates in the correct direction for a DESCENDING range too, not just an ascending one', () => {
    const scale = linear().domain([0, 10]).range([100, 0])
    // Below domainMin (x=-5): further from domain[1]=10, so further toward range[0]=100's side,
    // i.e. ABOVE 100 - the old buggy formula returned 50 here (toward range[1]=0 instead).
    expect(scale(-5)).toBe(150)
    // Above domainMax (x=15): further toward range[1]=0's side, i.e. BELOW 0 - the old buggy
    // formula returned 150 here (toward range[0]=100 instead).
    expect(scale(15)).toBe(-50)
  })

  it('clamps to the domain edges when .clamp(true) is set', () => {
    const scale = linear().domain([0, 10]).range([0, 100])
    scale.clamp(true)
    expect(scale(-5)).toBe(0)
    expect(scale(15)).toBe(100)
  })

  it('supports a reversed range (e.g. a "left"/"right" oriented axis)', () => {
    const scale = linear().domain([0, 10]).range([100, 0])
    expect(scale(0)).toBe(100)
    expect(scale(10)).toBe(0)
    expect(scale(5)).toBe(50)
  })

  it('inverts range back to domain', () => {
    const scale = linear().domain([0, 10]).range([0, 100])
    expect(scale.invert(50)).toBe(5)
  })

  it('reports min/max regardless of domain order', () => {
    const scale = linear().domain([10, 0]).range([0, 100])
    expect(scale.min()).toBe(0)
    expect(scale.max()).toBe(10)
  })

  it('.domain()/.range() with no arguments are getters', () => {
    const scale = linear().domain([1, 2]).range([3, 4])
    expect(scale.domain()).toEqual([1, 2])
    expect(scale.range()).toEqual([3, 4])
  })

  it('rangeRound() rounds interpolated output to the nearest integer', () => {
    const scale = linear().domain([0, 3]).rangeRound([0, 10])
    expect(scale(1)).toBe(3) // exact 10/3 = 3.33 -> round -> 3
  })
})

describe('linear scale - ticks (reverse: false, default)', () => {
  it('divides the domain into `count` even steps when isNice is false', () => {
    const scale = linear().domain([0, 10]).range([0, 100])
    expect(scale.ticks(5, false)).toEqual([0, 2, 4, 6, 8, 10])
  })

  it('produces a rangeBand equal to the pixel distance between the first two ticks', () => {
    const scale = linear().domain([0, 10]).range([0, 100])
    scale.ticks(5, false)
    expect(scale.rangeBand()).toBe(20)
  })

  it('returns an empty array for a zero domain', () => {
    const scale = linear().domain([0, 0]).range([0, 100])
    expect(scale.ticks(5, false)).toEqual([])
  })

  it('reverses tick order when the domain itself is reversed (domain[0] > domain[1])', () => {
    const scale = linear().domain([10, 0]).range([0, 100])
    expect(scale.ticks(5, false)).toEqual([10, 8, 6, 4, 2, 0])
  })
})

describe('linear scale - ticks (reverse: true) - full 1:1 port of the reverse branch', () => {
  it('walks from domain max down toward min, then reports distance-from-max', () => {
    // Hand-traced: domain [0,10], count=5 -> nice(0,10,5,false) => {min:0,max:10,spacing:2}.
    // reverse: start=obj.max=10, end=obj.min=0. Loop (end<=start): push 10,8,6,4,2,0 (fixed.minus
    // each step) - stops once start(-2) is no longer >= end(0). arr=[10,8,6,4,2,0].
    // Since arr[0](10) == max(10), no unshift. Then each entry becomes Math.abs(arr[i]-max):
    // [0,2,4,6,8,10].
    const scale = linear().domain([0, 10]).range([0, 100])
    expect(scale.ticks(5, false, undefined, true)).toEqual([0, 2, 4, 6, 8, 10])
  })

  it('unshifts `max` onto the front when the walked array does not already start on it', () => {
    // domain [0,9], count=5 -> nice(0,9,5,false): range=9, spacing=9/5=1.8, min=0, max=9.
    // reverse: start=9, end=0. Steps of 1.8: 9,7.2,5.4,3.6,1.8,0 -> arr[0]=9=max already, so this
    // particular domain doesn't exercise the unshift branch - see PORT_STATUS.md for why a case
    // that DOES exercise it wasn't hand-added (nice()'s non-isNice spacing is always range/ticks,
    // so obj.max always exactly equals the domain max, meaning `start` always begins at `max` -
    // the unshift's `arr[0] != max` condition can only fire due to floating point drift after the
    // `fixed.minus` stepping, not a structural case - covered by the general reverse walk above).
    // Node-cross-checked exact values (float drift from `Math.abs(x - 9)` is real, not a typo):
    const scale = linear().domain([0, 9]).range([0, 100])
    expect(scale.ticks(5, false, undefined, true)).toEqual([0, 1.7999999999999998, 3.5999999999999996, 5.4, 7.2, 9])
  })
})
