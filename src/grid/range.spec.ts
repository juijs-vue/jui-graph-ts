import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RangeGrid } from './range'
import type { Axis, AxisChart, AreaBox } from '../base/axis'
import type { GridChart } from './core'
import { SVG } from '../util/svg'
import type { TransElement } from '../util/svg/element.transform'

// Same test-double conventions `grid/core.spec.ts`/`grid/block.spec.ts` already established.

function makeChart(overrides: Partial<GridChart> = {}): { chart: GridChart; svg: SVG } {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const svg = new SVG(container, { width: 400, height: 300 })
  const area: AreaBox = { x: 0, y: 0, x2: 400, y2: 300, width: 400, height: 300 }

  const chart: GridChart = {
    area: ((key?: string) => (key ? (area as any)[key] : area)) as AxisChart['area'],
    svg,
    index: 0,
    appendDefs: vi.fn(),
    theme: vi.fn(() => 'themed') as unknown as GridChart['theme'],
    isRender: () => false,
    render: vi.fn(),
    on: vi.fn(),
    emit: vi.fn(),
    gridTypes: {},
    axis: vi.fn(() => undefined),
    color: vi.fn((c: unknown) => `color(${JSON.stringify(c)})`),
    format: (v: unknown) => v,
    ...overrides,
  }

  return { chart, svg }
}

interface AxisStubOptions {
  area?: AreaBox
  data?: unknown[]
}

function makeAxisStub(opts: AxisStubOptions = {}): Axis {
  const area: AreaBox = opts.area ?? { x: 0, y: 0, x2: 400, y2: 300, width: 400, height: 300 }
  const stub = {
    area: ((key?: string) => (key ? (area as any)[key] : area)) as Axis['area'],
    depth: 0,
    degree: { x: 0, y: 0, z: 0 },
    isFull3D: () => false,
    data: opts.data ?? [],
    get: (type: string) => (type === 'x' || type === 'y' ? { hide: false, orient: type === 'x' ? 'bottom' : 'left' } : undefined),
  }
  return stub as unknown as Axis
}

function makeGrid(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    orient: 'bottom',
    type: 'range',
    domain: null,
    step: 10,
    min: 0,
    max: 0,
    unit: null,
    clamp: true,
    reverse: false,
    key: null,
    hideText: false,
    nice: false,
    ...overrides,
  }
}

beforeEach(() => {
  document.body.innerHTML = ''
})

function makeRangeGrid(): RangeGrid {
  const g = new RangeGrid()
  const { chart } = makeChart()
  g.chart = chart
  g.grid = makeGrid() as any
  g.axis = makeAxisStub()
  return g
}

describe('RangeGrid', () => {
  describe('initDomain - array domain (real min/max computed from the array itself)', () => {
    it('[3, 27] with step 10: unit=2.4 -> ceil to 3, domain snapped out to [3, 27], step=8', () => {
      const g = makeRangeGrid()
      g.grid = makeGrid({ domain: [3, 27], step: 10 }) as any

      const domain = g.initDomain()
      expect(Array.from(domain)).toEqual([3, 27])
      expect(domain.step).toBe(8)
    })

    it('[0, 10] with step 10: unit=1, domain=[0,10], step=10', () => {
      const g = makeRangeGrid()
      g.grid = makeGrid({ domain: [0, 10], step: 10 }) as any

      const domain = g.initDomain()
      expect(Array.from(domain)).toEqual([0, 10])
      expect(domain.step).toBe(10)
    })

    it('reverses the domain when grid.reverse is set', () => {
      const g = makeRangeGrid()
      g.grid = makeGrid({ domain: [0, 10], step: 10, reverse: true }) as any

      expect(Array.from(g.initDomain())).toEqual([10, 0])
    })

    it('unit=0 (min===max) collapses the domain to [0, 0]', () => {
      const g = makeRangeGrid()
      g.grid = makeGrid({ domain: [5, 5], step: 10 }) as any

      expect(g.initDomain()).toEqual([0, 0])
    })

    it('numeric grid.unit overrides the computed step entirely', () => {
      const g = makeRangeGrid()
      g.grid = makeGrid({ domain: [0, 10], unit: 5 }) as any

      const domain = g.initDomain()
      expect(domain.step).toBe(2) // |0-10|/5
    })
  })

  describe('initDomain - min/max-only mode (domain left at its own null default) - regression ' +
    'tests for a real, previously-shipped bug: the array-domain branch used to fire for ANY ' +
    'non-string/non-function domain, including null, computing Math.min/max.apply(Math, null) ' +
    '(= Infinity/-Infinity per the ECMAScript "apply with null/undefined args" rule) and ' +
    'unconditionally overwriting any real configured min/max, collapsing the domain to [0,0] and ' +
    'producing NaN for any real axis value. See initDomain()\'s own FIX comment for the full trace. ' +
    'None of this describe block\'s scenarios were previously covered anywhere in this file - every ' +
    'other test explicitly sets a string/function/array domain before calling initDomain().', () => {
    it('domain: null with explicit non-zero min/max: resolves from the REAL configured bounds ' +
      '(snapped out to whole `unit` multiples, same snapping every other domain form already ' +
      'does - contrast the [3,27]->[3,27]/step=8 array-domain test above), not [0,0]', () => {
      const g = makeRangeGrid()
      g.grid = makeGrid({ domain: null, min: 10, max: 90, step: 10 }) as any

      // unit = ceil((90-10)/10) = 8; start snaps up from 0 by 8s past 90 -> 96; end snaps down
      // from 96 by 8s past 10 -> 8. domain = [end, start] = [8, 96], step = |8-96|/8 = 11.
      const domain = g.initDomain()
      expect(Array.from(domain)).toEqual([8, 96])
      expect(domain.step).toBe(11)
    })

    it('domain: null with min: 0 (the "explicit 0 is falsy" quirk, shared with DateGrid and left ' +
      'untouched by this fix) still resolves max correctly, not [0,0]/NaN', () => {
      const g = makeRangeGrid()
      g.grid = makeGrid({ domain: null, min: 0, max: 100, step: 10 }) as any

      const domain = g.initDomain()
      expect(Array.from(domain)).toEqual([0, 100])
      expect(domain.step).toBe(10)
    })

    it('domain: null with BOTH min/max left at their own 0 defaults: degrades gracefully to [0, 0] ' +
      '(no domain configured at all) rather than the previous Infinity/-Infinity/NaN collapse', () => {
      const g = makeRangeGrid()
      g.grid = makeGrid({ domain: null, min: 0, max: 0 }) as any

      expect(g.initDomain()).toEqual([0, 0])
    })

    it('the resulting scale produces REAL numeric output for a real value (not NaN) end-to-end ' +
      'through drawBefore(), matching a real <Chart> axis config of {type: "range", min, max} with ' +
      'no domain array', () => {
      const g = makeRangeGrid()
      g.grid = makeGrid({ domain: null, min: 10, max: 90, step: 10, orient: 'bottom' }) as any
      g.axis = makeAxisStub({ area: { x: 0, y: 0, x2: 400, y2: 300, width: 400, height: 300 } })

      g.drawBefore()

      expect(Number.isNaN((g.scale as any)(50))).toBe(false)
      expect(typeof (g.scale as any)(50)).toBe('number')
    })
  })

  describe(
    'initDomain - string domain: (1) FIXED - Math.max/min used to be called directly on a per-row ' +
      'array value (no .apply/spread - NaN for multi-element arrays), unlike the function-domain ' +
      "branch; (2) PRESERVED QUIRK - still pushes an extra 0 for EVERY non-array row, not just once",
    () => {
      it('single-element array field value: Math.max([5])/Math.min([5]) happen to coerce correctly (both 5)', () => {
        const g = makeRangeGrid()
        // A second, non-array row gives tempMin/tempMax something non-degenerate to work with
        // (Node-verified: value_list ends up [5, 30, 0] via the string branch's per-row
        // resolution, min=0/max=30 -> unit=div(30,10)=3 -> domain=[0,30], step=10).
        g.axis = makeAxisStub({ data: [{ f: [5] }, { f: 30 }] })
        g.grid = makeGrid({ domain: 'f', step: 10 }) as any

        const domain = g.initDomain()
        expect(Array.from(domain)).toEqual([0, 30])
        expect(domain.step).toBe(10)
      })

      it(
        'multi-element array field value: Math.max.apply/.min.apply resolve correctly (bug fix - ' +
          'used to be NaN via Math.max([1,2,3]) coercing the whole array, collapsing the domain to [0,0])',
        () => {
          const g = makeRangeGrid()
          g.axis = makeAxisStub({ data: [{ f: [1, 2, 3] }] })
          g.grid = makeGrid({ domain: 'f', step: 10 }) as any

          const domain = g.initDomain()
          expect(Number.isNaN(domain.step)).toBe(false)
          expect(Array.from(domain)).not.toEqual([0, 0])
        },
      )

      it('non-array field values: min/max still resolve correctly despite the extra push(0) per row', () => {
        const g = makeRangeGrid()
        g.axis = makeAxisStub({ data: [{ f: 4 }, { f: 9 }, { f: 2 }] })
        g.grid = makeGrid({ domain: 'f', step: 10 }) as any

        // value_list ends up [4,9,2,0,0,0] (extra 0 per non-array row) - min/max unaffected (0/9).
        const domain = g.initDomain()
        expect(domain[1]).toBe(9)
      })
    },
  )

  describe(
    'initDomain - function domain, the CORRECT array handling (contrast with the string-domain bug above)',
    () => {
      it('multi-element array return value: Math.max.apply/.min.apply resolve correctly (no NaN)', () => {
        const g = makeRangeGrid()
        g.axis = makeAxisStub({ data: [{ id: 1 }] })
        g.grid = makeGrid({ domain: (_row: unknown) => [1, 2, 3], step: 10 }) as any

        const domain = g.initDomain()
        expect(Number.isNaN(domain[0])).toBe(false)
        expect(Number.isNaN(domain[1])).toBe(false)
      })

      it('pushes 0 only ONCE across all non-array rows (isCheck guard), unlike the string-domain branch', () => {
        const g = makeRangeGrid()
        g.axis = makeAxisStub({ data: [{ v: 4 }, { v: 9 }] })
        const domainFn = vi.fn(function (this: unknown, row: any) {
          return row.v as number
        })
        g.grid = makeGrid({ domain: domainFn, step: 10 }) as any

        const domain = g.initDomain()
        expect(domain[1]).toBe(9)
        expect(domainFn.mock.instances[0]).toBe(g.chart)
      })
    },
  )

  describe('grid.nice: true (via linear().ticks(step, true))', () => {
    it('CORRECTION: drawBefore() does NOT throw when grid.nice is true - math.ts\'s nice() genuinely works, matching the real engine', () => {
      // Previously asserted as "a real, reachable crash in the original engine too" - that was
      // wrong (see math.ts's header comment for the full correction). Confirmed by loading a real
      // `nice: true` range-grid demo directly against the live legacy site (no error).
      const g = makeRangeGrid()
      g.axis = makeAxisStub({ area: { x: 0, y: 0, x2: 400, y2: 300, width: 400, height: 300 } })
      g.grid = makeGrid({ domain: [0, 10], step: 10, nice: true }) as any

      expect(() => g.drawBefore()).not.toThrow()
      expect(g.ticks).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    })
  })

  describe('drawBefore', () => {
    it('bottom orient: builds a linear scale [0,10]->[0,400], generates 11 ticks (0..10), values (0..400 step 40)', () => {
      const g = makeRangeGrid()
      g.axis = makeAxisStub({ area: { x: 0, y: 0, x2: 400, y2: 300, width: 400, height: 300 } })
      g.grid = makeGrid({ domain: [0, 10], step: 10, orient: 'bottom' }) as any

      g.drawBefore()

      expect(g.step).toBe(10)
      expect(g.ticks).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
      expect(g.values[0]).toBeCloseTo(0)
      expect(g.values[10]).toBeCloseTo(400)
      expect(g.bar).toBe(6)
    })

    it(
      'left/right orient: the "range-axis-reverses" asymmetry vs. BlockGrid - range() gets [end,start] ' +
        'and ticks is reversed afterward (cross-checked against jui-chart-vue\'s useChartLayout.ts finding)',
      () => {
        const g = makeRangeGrid()
        g.axis = makeAxisStub({ area: { x: 0, y: 0, x2: 400, y2: 300, width: 400, height: 300 } })
        g.grid = makeGrid({ domain: [0, 10], step: 10, orient: 'left' }) as any

        g.drawBefore()

        // ticks() itself is unaffected by orient (still ascending internally), but drawBefore()
        // manually reverses the FINAL ticks array for left/right.
        expect(g.ticks).toEqual([10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0])
        // left/right orient uses axis.area('y')/('height') (0/300), not ('x')/('width') - so
        // obj.end here is 300, not 400. range = [obj.end, obj.start] = [300, 0], so scale(10)=0
        // and scale(0)=300.
        expect(g.values[0]).toBeCloseTo(0) // scale(ticks[0]=10)
        expect(g.values[10]).toBeCloseTo(300) // scale(ticks[10]=0)
      },
    )

    it('bottom orient never reverses ticks (contrast case for the same orientation asymmetry)', () => {
      const g = makeRangeGrid()
      g.axis = makeAxisStub({ area: { x: 0, y: 0, x2: 400, y2: 300, width: 400, height: 300 } })
      g.grid = makeGrid({ domain: [0, 10], step: 10, orient: 'bottom' }) as any

      g.drawBefore()
      expect(g.ticks[0]).toBe(0)
      expect(g.ticks[g.ticks.length - 1]).toBe(10)
    })
  })

  describe('draw', () => {
    it('calls drawGrid() with zero arguments ("range" was always dead code in the original)', () => {
      const g = makeRangeGrid()
      const spy = vi.spyOn(g, 'drawGrid').mockReturnValue({ root: {} as TransElement, scale: null })

      g.draw()
      expect(spy).toHaveBeenCalledWith()
    })
  })

  describe('orient methods (top/bottom/left/right/center) - checkActive(tick==0 && tick!=min && tick!=max)', () => {
    function setupDrawable() {
      const g = makeRangeGrid()
      g.ticks = [0, 5, 10]
      g.values = [0, 200, 400]
      g.scale = Object.assign((x: number) => x, { min: () => 0, max: () => 10 })

      g.drawPattern = vi.fn()
      g.drawBaseLine = vi.fn()
      g.drawCenter = vi.fn()
      g.drawTop = vi.fn() as any
      g.drawBottom = vi.fn() as any
      g.drawLeft = vi.fn() as any
      g.drawRight = vi.fn() as any

      const container = g.chart.svg.group()
      return { g, container }
    }

    it('top(): drawPattern (3 args, no isMove), then drawTop with a checkActive closing over scale.min()/max()', () => {
      const { g, container } = setupDrawable()

      g.top(container)

      expect(g.drawPattern).toHaveBeenCalledWith('top', g.ticks, g.values)
      expect(g.drawBaseLine).toHaveBeenCalledWith('top', container)
      expect(g.drawTop).toHaveBeenCalledTimes(1)

      const checkActive = (g.drawTop as any).mock.calls[0][3] as (tick: unknown) => boolean
      // tick 0 is both the min AND would satisfy `tick==0` - `tick != min` excludes it.
      expect(checkActive(0)).toBe(false)
      // tick 5 is neither min nor max, but isn't `== 0` either.
      expect(checkActive(5)).toBe(false)
      const moveArg = (g.drawTop as any).mock.calls[0][4]
      expect(moveArg).toBe(0)
    })

    it('checkActive(0) is true only when 0 is neither the scale min nor max', () => {
      const { g, container } = setupDrawable()
      g.scale = Object.assign((x: number) => x, { min: () => -5, max: () => 10 })

      g.top(container)
      const checkActive = (g.drawTop as any).mock.calls[0][3] as (tick: unknown) => boolean
      expect(checkActive(0)).toBe(true)
    })

    it('center(): uses drawCenter with moveZ=0 (not scale-dependent)', () => {
      const { g, container } = setupDrawable()

      g.center(container)

      expect(g.drawCenter).toHaveBeenCalledTimes(1)
      const call = (g.drawCenter as any).mock.calls[0]
      expect(call[0]).toBe(container)
      expect(call[1]).toBe(g.ticks)
      expect(call[2]).toBe(g.values)
      expect(call[4]).toBe(0)
      expect(g.drawBaseLine).toHaveBeenCalledWith('center', container)
    })

    it('left()/right() use drawLeft/drawRight respectively', () => {
      const { g, container } = setupDrawable()

      g.left(container)
      expect(g.drawLeft).toHaveBeenCalledTimes(1)

      g.right(container)
      expect(g.drawRight).toHaveBeenCalledTimes(1)
    })
  })

  describe('wrapper', () => {
    it('key set: looks up axis.data[i][key] through the old scale', () => {
      const g = makeRangeGrid()
      g.axis = makeAxisStub({ data: [{ v: 3 }, { v: 7 }] })

      const oldScale = vi.fn((v: unknown) => (v as number) * 10) as any
      const wrapped = g.wrapper(oldScale, 'v')

      expect(wrapped(1)).toBe(70)
      expect(oldScale).toHaveBeenCalledWith(7)
    })

    it('key falsy: returns the raw scale unchanged', () => {
      const g = makeRangeGrid()
      const scale = ((t: unknown) => t) as any
      expect(g.wrapper(scale, undefined)).toBe(scale)
    })

    it("copies old_scale's own properties onto the wrapped function (Object.assign-equivalent)", () => {
      const g = makeRangeGrid()
      g.axis = makeAxisStub({ data: [{ v: 1 }] })

      const oldScale = ((t: unknown) => t) as any
      oldScale.min = () => 0
      const wrapped = g.wrapper(oldScale, 'v') as any

      expect(wrapped.min()).toBe(0)
    })
  })

  describe('static setup()', () => {
    it("returns the original's exact default option shape", () => {
      expect(RangeGrid.setup()).toEqual({
        domain: null,
        step: 10,
        min: 0,
        max: 0,
        unit: null,
        clamp: true,
        reverse: false,
        key: null,
        hideText: false,
        nice: false,
      })
    })
  })
})
