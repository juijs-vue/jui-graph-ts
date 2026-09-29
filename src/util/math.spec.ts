import { describe, expect, it } from 'vitest'
import {
  angle,
  degree,
  div,
  fixed,
  getFixed,
  interpolateNumber,
  interpolateRound,
  inverseMatrix3d,
  matrix,
  matrix3d,
  minus,
  multi,
  nice,
  plus,
  radian,
  remain,
  resize,
  rotate,
  round,
  scaleValue,
} from './math'

describe('rotate', () => {
  it('rotates (1,0) by 90 degrees to (~0,1)', () => {
    const r = rotate(1, 0, Math.PI / 2)
    expect(r.x).toBeCloseTo(0)
    expect(r.y).toBeCloseTo(1)
  })

  it('is a no-op at 0 radians', () => {
    expect(rotate(3, 4, 0)).toEqual({ x: 3, y: 4 })
  })
})

describe('radian/degree', () => {
  it('round-trips 180 degrees to PI radians and back', () => {
    expect(radian(180)).toBeCloseTo(Math.PI)
    expect(degree(Math.PI)).toBeCloseTo(180)
  })
})

describe('angle', () => {
  it('computes atan2 of the vector between two points', () => {
    expect(angle(0, 0, 1, 1)).toBeCloseTo(Math.PI / 4)
    expect(angle(0, 0, 1, 0)).toBeCloseTo(0)
  })
})

describe('resize', () => {
  it('shrinks a wide box to maxWidth, scaling height by the same ratio', () => {
    // objectWidth(200) >= maxWidth(100) and ratio(0.5) <= 1
    expect(resize(100, 100, 200, 100)).toEqual({ width: 100, height: 50 })
  })

  it('shrinks a tall box to maxHeight when height is the overflowing dimension', () => {
    // objectWidth(50) < maxWidth(100), so the first branch is skipped; objectHeight(200) >= maxHeight(100)
    expect(resize(100, 100, 50, 200)).toEqual({ width: 25, height: 100 })
  })
})

describe('interpolateNumber / interpolateRound', () => {
  it('interpolates unrounded', () => {
    const f = interpolateNumber(0, 10)
    expect(f(0.5)).toBe(5)
    expect(f(0.25)).toBe(2.5)
  })

  it('interpolates rounded', () => {
    const f = interpolateRound(0, 10)
    expect(f(0.25)).toBe(3)
  })
})

describe('getFixed', () => {
  it('returns the larger of the two operands decimal-place counts', () => {
    expect(getFixed(1.23, 4.5)).toBe(2)
    expect(getFixed(1, 2)).toBe(0)
  })
})

describe('decimal-safe arithmetic (plus/minus/multi/div/remain)', () => {
  it('plus avoids float drift: 0.1 + 0.2 === 0.3', () => {
    expect(plus(0.1, 0.2)).toBe(0.3)
  })

  it('minus avoids float drift: 0.3 - 0.1 === 0.2', () => {
    expect(minus(0.3, 0.1)).toBe(0.2)
  })

  it('multi: 0.1 * 0.2 === 0.02', () => {
    expect(multi(0.1, 0.2)).toBe(0.02)
  })

  it('div: 1 / 3, re-rounded to the raw result decimal precision', () => {
    expect(div(1, 3)).toBe(0.3333333333333333)
  })

  it('remain: 5.5 % 2 === 1.5', () => {
    expect(remain(5.5, 2)).toBe(1.5)
  })

  it('round: rounds to N decimal places', () => {
    expect(round(1.2345, 2)).toBe(1.23)
  })
})

describe('fixed()', () => {
  it('rounds a value to the decimal precision of the seed value', () => {
    const f = fixed(0.1)
    expect(f(1.23)).toBe(1.2)
  })

  it('plus/minus work on a fixed() instance (used by scale ticks stepping)', () => {
    const f = fixed(0.1)
    expect(f.plus(0.1, 0.2)).toBe(0.3)
    expect(f.minus(0.3, 0.1)).toBe(0.2)
  })

  it('multi/remain also work on a fixed() instance (don\'t reference `this`)', () => {
    const f = fixed(0.1)
    expect(f.multi(0.1, 0.2)).toBe(0.02)
    expect(f.remain(5.5, 2)).toBe(1.5)
  })

  it('FIXED: .div() returns a correct fixed-precision division instead of throwing', () => {
    // Previously threw `TypeError: this.getFixed is not a function` - `this` inside `.div` is the
    // `fixed()` instance itself, which has no `getFixed` method. Fixed to call the module-scope
    // `getFixed` directly (mirroring jui-core-ts's own already-correct `fixed().div`).
    const f = fixed(1)
    expect(() => f.div(10, 4)).not.toThrow()
    expect(f.div(10, 4)).toBe(2.5)

    const f2 = fixed(0.01)
    expect(f2.div(1, 4)).toBe(0.25)
  })
})

describe('nice', () => {
  it('divides the range evenly by ticks when isNice is false (default)', () => {
    expect(nice(0, 10, 5)).toEqual({ min: 0, max: 10, range: 10, spacing: 2 })
  })

  it('swaps min/max if given in reverse order', () => {
    expect(nice(10, 0, 5)).toEqual({ min: 0, max: 10, range: 10, spacing: 2 })
  })

  it('CORRECTION: isNice=true does NOT throw - rounds range/spacing to a 1/2/5/10*10^n step', () => {
    // Previously asserted as a "PRESERVED BUG: always throws ReferenceError" - that was wrong.
    // `niceNum()`'s result variable IS assigned via an undeclared identifier in the real upstream
    // source (a typo for a separately-declared-but-unused `nickFraction`), but the real,
    // distributed engine (`www.jui-vue.io/lib/jui/js/core.js`) is a non-strict, non-module script
    // - the undeclared assignment silently creates an implicit global rather than throwing, and
    // the function returns the correct rounded value regardless. Confirmed by loading real
    // `nice: true` demos directly against the live legacy site (no error, correct rendering). See
    // math.ts's header comment.
    expect(nice(0, 97, 5, true)).toEqual({ min: 0, max: 80, range: 100, spacing: 20 })
    expect(nice(1, 100, 10, true)).toEqual({ min: 0, max: 100, range: 100, spacing: 10 })
  })
})

describe('matrix', () => {
  it('matrix-vector product (flat b)', () => {
    expect(matrix([[1, 2], [3, 4]], [5, 6])).toEqual([17, 39])
  })

  it('identity matrix leaves a vector unchanged', () => {
    expect(
      matrix(
        [
          [1, 0, 0],
          [0, 1, 0],
          [0, 0, 1],
        ],
        [7, 8, 9],
      ),
    ).toEqual([7, 8, 9])
  })

  it('deep form (b as an array of vectors) dispatches via Array.isArray(b[0])', () => {
    expect(
      matrix(
        [
          [1, 0],
          [0, 1],
        ],
        [
          [1, 2],
          [3, 4],
        ],
      ),
    ).toEqual([
      [1, 2],
      [3, 4],
    ])
  })
})

describe('matrix3d', () => {
  const identity4 = [
    [1, 0, 0, 0],
    [0, 1, 0, 0],
    [0, 0, 1, 0],
    [0, 0, 0, 1],
  ]

  it('identity * vector = vector', () => {
    const result = matrix3d(identity4, [1, 2, 3, 4]) as Float32Array
    expect(Array.from(result)).toEqual([1, 2, 3, 4])
  })

  it('deep form dispatches on Float32Array/array b[0]', () => {
    const result = matrix3d(identity4, [
      new Float32Array([1, 2, 3, 4]),
      new Float32Array([5, 6, 7, 8]),
      new Float32Array([9, 10, 11, 12]),
      new Float32Array([13, 14, 15, 16]),
    ]) as Float32Array[]

    // identity * B = B (Node-cross-checked; the naive "it must transpose" guess is wrong here).
    expect(result.map((r) => Array.from(r))).toEqual([
      [1, 2, 3, 4],
      [5, 6, 7, 8],
      [9, 10, 11, 12],
      [13, 14, 15, 16],
    ])
  })
})

describe('inverseMatrix3d', () => {
  it('PRESERVED BUG: inverting the identity matrix does NOT return the identity matrix - [3][3] is left at 0', () => {
    // Hand-traced/Node-cross-checked against a literal transcription of the original algorithm
    // (see this project's PORT_STATUS.md Phase A entry). A correct 4x4 inverse of the identity
    // matrix is the identity matrix; this always comes out with a 0 in the bottom-right corner
    // instead, because of the `te[3][4]` (should be `te[3][3]`) typo documented in math.ts.
    const identity4: number[][] = [
      [1, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 1, 0],
      [0, 0, 0, 1],
    ]

    const result = inverseMatrix3d(identity4)

    expect(result.map((r) => Array.from(r))).toEqual([
      [1, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 1, 0],
      [0, 0, 0, 0], // <- would be 1 in a correct inverse
    ])
  })
})

describe('scaleValue', () => {
  it('linearly interpolates value from [minValue,maxValue] into [minScale,maxScale]', () => {
    expect(scaleValue(5, 0, 10, 0, 100)).toBe(50)
  })

  it('extrapolates outside the input range (no clamping)', () => {
    expect(scaleValue(15, 0, 10, 0, 100)).toBe(150)
  })

  it('special-cases minValue === maxValue to avoid a 0/0 divide', () => {
    // minValue===maxValue(5) makes `_minValue` snap to 0, so `maxValue - _minValue` is 5 (not 0)
    // and `per = (value - 0) / 5` - not itself a NaN/Infinity case for this particular value.
    expect(scaleValue(5, 5, 5, 0, 100)).toBe(100)
    expect(scaleValue(0, 5, 5, 0, 100)).toBe(0)
  })
})
