// Port of juijs-graph's `src/util/math.js` ("util.math").
//
// Pure math/geometry utility functions used across scales, axes, and the 3D polygon engine. Kept
// as plain exported functions per PORT_STATUS.md Phase 0 rule 3 - this was a grab-bag utility
// namespace in the original too, never part of an `extend` chain.
//
// Cross-checked against jui-chart-vue's `src/composables/mathUtil.ts` (a hand-port of a subset of
// this exact file, already hand-traced/verified for `nice`/`fixed`/`div`/`radian`/`rotate`/
// `scaleValue` in jui-chart-vue's own Phase F audit - see that project's PORT_STATUS.md). This
// file ports the FULL original, including the matrix helpers and `resize`/`degree`/`angle`/
// `interpolateRound`/`round`/`multi`/`remain` that jui-chart-vue never needed.
//
// RECONCILED with jui-core-ts (see this project's PORT_STATUS.md "jui-core-ts reconciliation"
// entry): functions below verified byte-identical to jui-core-ts's own `src/utils/math.ts` (no
// preserved-bug divergence) now delegate to it, so there's one shared implementation instead of
// two hand-maintained copies. `fixed`/`nice`/`matrix`/`matrix3d`/`inverseMatrix3d` stay fully
// local - jui-core-ts's port of these either fixed the original's bugs outright (jui-core-ts is
// not bound by this project's Phase 0 rule 6) or uses incompatible types (`matrix3d`'s `Mat4`
// tuple type vs jui-core-ts's plain `Float32Array[]`), so delegating would silently change this
// project's actual runtime output and break the PRESERVED BUG tests in math.spec.ts.
//
// Bugs/quirks preserved byte-faithfully (Phase 0 rule 6) in the functions that stayed local - see
// this project's PORT_STATUS.md for the full writeup:
//  1. CORRECTION (this was previously mis-diagnosed as a preserved "always throws" bug - it is
//     NOT one, see below): `niceNum()`'s inner result variable IS assigned via the undeclared
//     identifier `niceFraction` (a genuine typo in the original - a *different*, unused variable
//     `nickFraction` is the one actually declared with `var`). But the REAL, distributed engine
//     this project targets (`www.jui-vue.io/lib/jui/js/core.js`, the same uncompressed legacy
//     bundle this whole port cross-checks against elsewhere - e.g. `chartMap.ts`'s "site diverges
//     from the raw npm package" precedent) is a classic `jui.define(...)`-wrapped script, NOT an
//     ES module - it has no `"use strict"` directive anywhere (confirmed by inspection) and runs
//     in ordinary sloppy mode. In sloppy mode, assigning to an undeclared identifier does NOT
//     throw - it silently creates an implicit global (`window.niceFraction`) and execution
//     continues normally, with the correct value already sitting in that identifier by the time
//     `return niceFraction * Math.pow(10, exponent)` reads it back. Net effect: the real engine's
//     `niceNum()` runs to completion and returns the intended 1/2/5/10-rounded value every time -
//     no crash, ever, confirmed by loading real `nice:true` demos (`grid_block_log`, plus
//     `overlap_bar`/`active_bar`/`overlap_column`/`active_column`/`dashboard4` for quirk-1-style
//     `Element.is()` below) directly against the live legacy site. The earlier "always throws"
//     diagnosis assumed the separate, ES-module `juijs-graph` npm package's own strict-mode
//     `dist/*.js` bundles were the right cross-check target - they're a different, never-actually-
//     deployed-by-the-real-site build, same distinction `chartMap.ts` already draws for `chart.map`
//     - not the real target here. Ported below as the straightforward, non-throwing 1/2/5/10
//     rounding algorithm (functionally identical to what the implicit-global version actually
//     computes), not as a literal throw.
//  2. FIXED (Tier A - outright crash, no plausible demo could depend on a throw): `fixed(x).div(a,
//     b)` used to throw a `TypeError` at runtime (`this.getFixed` is not a function). `.div` was
//     written assuming `this` is the top-level `util.math` namespace object (true for the
//     standalone `math.div()`, which also calls `this.getFixed`), but `this` is actually the
//     `fixed()` instance it's attached to, which has no `getFixed` property. `.plus`/`.minus`/
//     `.multi`/`.remain` on a `fixed()` instance all work fine (none of them reference `this`).
//     Fixed by calling the module-scope `getFixed` function directly instead of `this.getFixed`,
//     mirroring jui-core-ts's own already-correct `fixed().div`.
//  3. FIXED (Tier A - data-corrupting defects, no plausible demo could depend on either):
//     `inverseMatrix3d()` had two independent bugs, both now fixed:
//     a. Two of its cofactor assignments targeted `te[3][4]` instead of `te[3][3]` (a
//        transcription typo). `te` is a 4-element `Float32Array` per row (valid indices 0-3), so
//        writing index 4 was a silent no-op (typed arrays ignore out-of-range writes) and reading
//        it back was `undefined`. Net effect: `te[3][3]` (the bottom-right element of the result)
//        was always left at its default `0` instead of the expected ~`1` for an affine transform.
//        Fixed by changing both assignments to `te[3][3]`.
//     b. The singular-matrix fallback (`if (det === 0) { ...identity... }`) could never trigger
//        for an actually-singular matrix: `det` was computed as `1 / sum`, so a singular matrix
//        (whose cofactor-weighted `sum` is `0`) produced `det = Infinity`, not `0`. Fixed by
//        checking `sum === 0` *before* taking the reciprocal, and falling back to the identity
//        matrix in that case (previously a singular matrix fell through to the `else` branch and
//        every element got multiplied by `Infinity`, producing `Infinity`/`NaN` entries).

// math's functions are only namespace-exported from jui-core-ts (it collides with `resize` in
// jui-core-ts's own dom.ts), so import the namespace rather than flat names.
import { MathUtil } from 'jui-core-ts'
const {
  rotate: coreRotate,
  resize: coreResize,
  radian: coreRadian,
  degree: coreDegree,
  angle: coreAngle,
  interpolateNumber: coreInterpolateNumber,
  interpolateRound: coreInterpolateRound,
  getFixed: coreGetFixed,
  round: coreRound,
  plus: corePlus,
  minus: coreMinus,
  multi: coreMulti,
  div: coreDiv,
  remain: coreRemain,
  scaleValue: coreScaleValue,
} = MathUtil

/** A 2D point, as returned by `rotate()`. */
export interface Point2D {
  x: number
  y: number
}

/** Rotates point (x, y) by `radian` around the origin. */
export function rotate(x: number, y: number, radianValue: number): Point2D {
  return coreRotate(x, y, radianValue)
}

/** A `{width, height}` box, as returned by `resize()`. */
export interface ResizedBox {
  width: number
  height: number
}

/** Scales (objectWidth, objectHeight) down/up to fit within (maxWidth, maxHeight), keeping ratio. */
export function resize(maxWidth: number, maxHeight: number, objectWidth: number, objectHeight: number): ResizedBox {
  return coreResize(maxWidth, maxHeight, objectWidth, objectHeight)
}

/** Converts degrees to radians. */
export function radian(degree: number): number {
  return coreRadian(degree)
}

/** Converts radians to degrees. */
export function degree(radianValue: number): number {
  return coreDegree(radianValue)
}

/** Angle (radians) of the vector from (x1,y1) to (x2,y2), via `Math.atan2`. */
export function angle(x1: number, y1: number, x2: number, y2: number): number {
  return coreAngle(x1, y1, x2, y2)
}

/** Builds a linear-interpolation callback between `a` and `b` (t in [0,1], unrounded). */
export function interpolateNumber(a: number, b: number): (t: number) => number {
  return coreInterpolateNumber(a, b)
}

/** Same as `interpolateNumber`, rounded to the nearest integer. */
export function interpolateRound(a: number, b: number): (t: number) => number {
  return coreInterpolateRound(a, b)
}

/** Number of decimal places needed to represent `a` or `b` exactly, whichever needs more. */
export function getFixed(a: number | string, b: number | string): number {
  return coreGetFixed(a, b)
}

/**
 * The decimal-precision-safe arithmetic object returned by `fixed()`. Calling it directly
 * (`fixedMath(value)`) rounds `value` to the same decimal precision as the `fixedValue` it was
 * built from; `.plus`/`.minus`/`.multi`/`.remain` perform that operation on two raw operands
 * (scaled up by, then back down from, that same precision) to avoid floating-point rounding
 * artifacts (e.g. `0.1 + 0.2`).
 */
export interface FixedMath {
  (value: number): number
  plus(a: number, b: number): number
  minus(a: number, b: number): number
  multi(a: number, b: number): number
  /**
   * Decimal-precision-safe division. Fixed (see this file's header comment, formerly quirk 2) -
   * used to throw a `TypeError` at runtime (`this.getFixed` is not a function).
   */
  div(a: number, b: number): number
  remain(a: number, b: number): number
}

/** Returns decimal-precision-safe arithmetic helpers, fixed to `fixedValue`'s own decimal precision. */
export function fixed(fixedValue: number): FixedMath {
  const fixedNumber = getFixed(fixedValue, 0)
  const pow = Math.pow(10, fixedNumber)

  const func = ((value: number) => Math.round(value * pow) / pow) as FixedMath

  func.plus = (a, b) => Math.round(a * pow + b * pow) / pow
  func.minus = (a, b) => Math.round(a * pow - b * pow) / pow
  func.multi = (a, b) => Math.round(a * pow * (b * pow)) / (pow * pow)

  func.div = (a, b) => {
    const result = (a * pow) / (b * pow)
    // Fixed (was quirk 2 above): call the module-scope `getFixed` directly instead of the
    // nonexistent `this.getFixed` - mirrors jui-core-ts's own already-correct `fixed().div`.
    const pow2 = Math.pow(10, getFixed(result, 0))
    return Math.round(result * pow2) / pow2
  }

  func.remain = (a, b) => Math.round((a * pow) % (b * pow)) / pow

  return func
}

/** Rounds `num` to `fixedPlaces` decimal places. */
export function round(num: number, fixedPlaces: number): number {
  return coreRound(num, fixedPlaces)
}

/** Decimal-safe addition: `a + b`, re-rounded to the decimal precision needed by `a`/`b`. */
export function plus(a: number, b: number): number {
  return corePlus(a, b)
}

/** Decimal-safe subtraction: `a - b`, re-rounded to the decimal precision needed by `a`/`b`. */
export function minus(a: number, b: number): number {
  return coreMinus(a, b)
}

/** Decimal-safe multiplication: `a * b`, re-rounded to the decimal precision needed by `a`/`b`. */
export function multi(a: number, b: number): number {
  return coreMulti(a, b)
}

/** Decimal-safe division: `a / b`, re-rounded to the decimal precision of the raw result. */
export function div(a: number, b: number): number {
  return coreDiv(a, b)
}

/** Decimal-safe modulo: `a % b`, re-rounded to the decimal precision needed by `a`/`b`. */
export function remain(a: number, b: number): number {
  return coreRemain(a, b)
}

/** The result of `nice()`: a rounded `[min, max]` range and the per-tick `spacing` within it. */
export interface NiceResult {
  min: number
  max: number
  range: number
  spacing: number
}

/**
 * Rounds `range` to a "nice" 1/2/5/10 * 10^exponent step - see quirk 1 in this file's header
 * comment for why this is a real (non-throwing) implementation rather than a preserved
 * `ReferenceError`, despite the original source's own `niceFraction`/`nickFraction` typo.
 */
function niceNum(range: number, round: boolean): number {
  const exponent = Math.floor(Math.log(range) / Math.LN10)
  const fraction = range / Math.pow(10, exponent)
  let niceFraction: number

  if (round) {
    if (fraction < 1.5) niceFraction = 1
    else if (fraction < 3) niceFraction = 2
    else if (fraction < 7) niceFraction = 5
    else niceFraction = 10
  } else {
    if (fraction <= 1) niceFraction = 1
    else if (fraction <= 2) niceFraction = 2
    else if (fraction <= 5) niceFraction = 5
    else niceFraction = 10
  }

  return niceFraction * Math.pow(10, exponent)
}

/**
 * Computes a "nice" tick range/spacing for [min, max] split into roughly `ticks` steps.
 * `isNice: true` rounds the spacing to a 1/2/5/10 * 10^n step instead of dividing evenly.
 */
export function nice(min: number, max: number, ticks: number, isNice = false): NiceResult {
  const _min = min > max ? max : min
  const _max = min > max ? min : max

  const range = isNice ? niceNum(_max - _min, false) : _max - _min
  const spacing = isNice ? niceNum(range / ticks, true) : range / ticks
  const niceMin = isNice ? Math.floor(_min / spacing) * spacing : _min
  const niceMax = isNice ? Math.floor(_max / spacing) * spacing : _max

  return { min: niceMin, max: niceMax, range, spacing }
}

function matrixVector(a: number[][], b: number[]): number[] {
  const m: number[] = []

  for (let i = 0; i < a.length; i++) {
    let sum = 0
    for (let j = 0; j < a[i].length; j++) {
      sum += a[i][j] * b[j]
    }
    m.push(sum)
  }

  return m
}

function deepMatrix(a: number[][], b: number[][]): number[][] {
  const m: number[][] = []
  const nm: number[][] = []

  for (let i = 0; i < b.length; i++) {
    m[i] = []
    nm[i] = []
  }

  for (let i = 0; i < b.length; i++) {
    for (let j = 0; j < b[i].length; j++) {
      m[j].push(b[i][j])
    }
  }

  for (let i = 0; i < m.length; i++) {
    const mm = matrixVector(a, m[i])
    for (let j = 0; j < mm.length; j++) {
      nm[j].push(mm[j])
    }
  }

  return nm
}

/**
 * 2x1/3x1/NxN-style matrix-vector product. `b` may be a flat vector (`number[]`) or a "vector of
 * vectors" (`number[][]`, dispatched to the deep/`NxN` variant) - matching the original's
 * `_.typeCheck("array", b[0])` dispatch, ported here as `Array.isArray(b[0])`.
 */
export function matrix(a: number[][], b: number[] | number[][]): number[] | number[][] {
  if (Array.isArray(b[0])) {
    return deepMatrix(a, b as number[][])
  }

  return matrixVector(a, b as number[])
}

type Vec4 = number[] | Float32Array
type Mat4 = [Float32Array, Float32Array, Float32Array, Float32Array]

function matrix3dVector(a: number[][], b: Vec4): Float32Array {
  const m = new Float32Array(4)

  m[0] = a[0][0] * b[0] + a[0][1] * b[1] + a[0][2] * b[2] + a[0][3] * b[3]
  m[1] = a[1][0] * b[0] + a[1][1] * b[1] + a[1][2] * b[2] + a[1][3] * b[3]
  m[2] = a[2][0] * b[0] + a[2][1] * b[1] + a[2][2] * b[2] + a[2][3] * b[3]
  m[3] = a[3][0] * b[0] + a[3][1] * b[1] + a[3][2] * b[2] + a[3][3] * b[3]

  return m
}

function deepMatrix3d(a: number[][], b: Vec4[]): Mat4 {
  const nm: Mat4 = [new Float32Array(4), new Float32Array(4), new Float32Array(4), new Float32Array(4)]

  const m: Mat4 = [
    new Float32Array([b[0][0], b[1][0], b[2][0], b[3][0]]),
    new Float32Array([b[0][1], b[1][1], b[2][1], b[3][1]]),
    new Float32Array([b[0][2], b[1][2], b[2][2], b[3][2]]),
    new Float32Array([b[0][3], b[1][3], b[2][3], b[3][3]]),
  ]

  nm[0][0] = a[0][0] * m[0][0] + a[0][1] * m[0][1] + a[0][2] * m[0][2] + a[0][3] * m[0][3]
  nm[1][0] = a[1][0] * m[0][0] + a[1][1] * m[0][1] + a[1][2] * m[0][2] + a[1][3] * m[0][3]
  nm[2][0] = a[2][0] * m[0][0] + a[2][1] * m[0][1] + a[2][2] * m[0][2] + a[2][3] * m[0][3]
  nm[3][0] = a[3][0] * m[0][0] + a[3][1] * m[0][1] + a[3][2] * m[0][2] + a[3][3] * m[0][3]

  nm[0][1] = a[0][0] * m[1][0] + a[0][1] * m[1][1] + a[0][2] * m[1][2] + a[0][3] * m[1][3]
  nm[1][1] = a[1][0] * m[1][0] + a[1][1] * m[1][1] + a[1][2] * m[1][2] + a[1][3] * m[1][3]
  nm[2][1] = a[2][0] * m[1][0] + a[2][1] * m[1][1] + a[2][2] * m[1][2] + a[2][3] * m[1][3]
  nm[3][1] = a[3][0] * m[1][0] + a[3][1] * m[1][1] + a[3][2] * m[1][2] + a[3][3] * m[1][3]

  nm[0][2] = a[0][0] * m[2][0] + a[0][1] * m[2][1] + a[0][2] * m[2][2] + a[0][3] * m[2][3]
  nm[1][2] = a[1][0] * m[2][0] + a[1][1] * m[2][1] + a[1][2] * m[2][2] + a[1][3] * m[2][3]
  nm[2][2] = a[2][0] * m[2][0] + a[2][1] * m[2][1] + a[2][2] * m[2][2] + a[2][3] * m[2][3]
  nm[3][2] = a[3][0] * m[2][0] + a[3][1] * m[2][1] + a[3][2] * m[2][2] + a[3][3] * m[2][3]

  nm[0][3] = a[0][0] * m[3][0] + a[0][1] * m[3][1] + a[0][2] * m[3][2] + a[0][3] * m[3][3]
  nm[1][3] = a[1][0] * m[3][0] + a[1][1] * m[3][1] + a[1][2] * m[3][2] + a[1][3] * m[3][3]
  nm[2][3] = a[2][0] * m[3][0] + a[2][1] * m[3][1] + a[2][2] * m[3][2] + a[2][3] * m[3][3]
  nm[3][3] = a[3][0] * m[3][0] + a[3][1] * m[3][1] + a[3][2] * m[3][2] + a[3][3] * m[3][3]

  return nm
}

/**
 * 4x4-style matrix product for homogeneous-coordinate 3D transforms. `b` may be a single
 * 4-vector (`number[] | Float32Array`) or an array of four such vectors (dispatched to the deep
 * `4x4` variant) - matching the original's `b[0] instanceof Array || b[0] instanceof Float32Array`
 * dispatch.
 */
export function matrix3d(a: number[][], b: Vec4 | Vec4[]): Float32Array | Mat4 {
  if (Array.isArray(b[0]) || b[0] instanceof Float32Array) {
    return deepMatrix3d(a, b as Vec4[])
  }

  return matrix3dVector(a, b as Vec4)
}

/**
 * Inverts a 4x4 matrix (adjugate/determinant method). See this file's header comment (formerly
 * quirk 3) for two now-fixed bugs: the `[3][3]` entry used to always be left at `0`, and the
 * singular-matrix identity fallback used to never actually trigger.
 */
export function inverseMatrix3d(me: Vec4[]): Mat4 {
  let te: Mat4 = [new Float32Array(4), new Float32Array(4), new Float32Array(4), new Float32Array(4)]

  const n11 = me[0][0]
  const n12 = me[0][1]
  const n13 = me[0][2]
  const n14 = me[0][3]
  const n21 = me[1][0]
  const n22 = me[1][1]
  const n23 = me[1][2]
  const n24 = me[1][3]
  const n31 = me[2][0]
  const n32 = me[2][1]
  const n33 = me[2][2]
  const n34 = me[2][3]
  const n41 = me[3][0]
  const n42 = me[3][1]
  const n43 = me[3][2]
  const n44 = me[3][3]

  te[0][0] = n23 * n34 * n42 - n24 * n33 * n42 + n24 * n32 * n43 - n22 * n34 * n43 - n23 * n32 * n44 + n22 * n33 * n44
  te[0][1] = n14 * n33 * n42 - n13 * n34 * n42 - n14 * n32 * n43 + n12 * n34 * n43 + n13 * n32 * n44 - n12 * n33 * n44
  te[0][2] = n13 * n24 * n42 - n14 * n23 * n42 + n14 * n22 * n43 - n12 * n24 * n43 - n13 * n22 * n44 + n12 * n23 * n44
  te[0][3] = n14 * n23 * n32 - n13 * n24 * n32 - n14 * n22 * n33 + n12 * n24 * n33 + n13 * n22 * n34 - n12 * n23 * n34
  te[1][0] = n24 * n33 * n41 - n23 * n34 * n41 - n24 * n31 * n43 + n21 * n34 * n43 + n23 * n31 * n44 - n21 * n33 * n44
  te[1][1] = n13 * n34 * n41 - n14 * n33 * n41 + n14 * n31 * n43 - n11 * n34 * n43 - n13 * n31 * n44 + n11 * n33 * n44
  te[1][2] = n14 * n23 * n41 - n13 * n24 * n41 - n14 * n21 * n43 + n11 * n24 * n43 + n13 * n21 * n44 - n11 * n23 * n44
  te[1][3] = n13 * n24 * n31 - n14 * n23 * n31 + n14 * n21 * n33 - n11 * n24 * n33 - n13 * n21 * n34 + n11 * n23 * n34
  te[2][0] = n22 * n34 * n41 - n24 * n32 * n41 + n24 * n31 * n42 - n21 * n34 * n42 - n22 * n31 * n44 + n21 * n32 * n44
  te[2][1] = n14 * n32 * n41 - n12 * n34 * n41 - n14 * n31 * n42 + n11 * n34 * n42 + n12 * n31 * n44 - n11 * n32 * n44
  te[2][2] = n12 * n24 * n41 - n14 * n22 * n41 + n14 * n21 * n42 - n11 * n24 * n42 - n12 * n21 * n44 + n11 * n22 * n44
  te[2][3] = n14 * n22 * n31 - n12 * n24 * n31 - n14 * n21 * n32 + n11 * n24 * n32 + n12 * n21 * n34 - n11 * n22 * n34
  te[3][0] = n23 * n32 * n41 - n22 * n33 * n41 - n23 * n31 * n42 + n21 * n33 * n42 + n22 * n31 * n43 - n21 * n32 * n43
  te[3][1] = n12 * n33 * n41 - n13 * n32 * n41 + n13 * n31 * n42 - n11 * n33 * n42 - n12 * n31 * n43 + n11 * n32 * n43
  te[3][2] = n13 * n22 * n41 - n12 * n23 * n41 - n13 * n21 * n42 + n11 * n23 * n42 + n12 * n21 * n43 - n11 * n22 * n43
  // Fixed (was quirk 3a above): was `te[3][4]` (out-of-range write, silently dropped).
  te[3][3] = n12 * n23 * n31 - n13 * n22 * n31 + n13 * n21 * n32 - n11 * n23 * n32 - n12 * n21 * n33 + n11 * n22 * n33

  // Fixed (was quirk 3b above): check the pre-reciprocal sum for zero, instead of checking
  // `det === 0` after taking the reciprocal (which produces `Infinity`, never exactly `0`, for a
  // genuinely singular matrix).
  const sum = n11 * te[0][0] + n21 * te[0][1] + n31 * te[0][2] + n41 * te[0][3]

  if (sum === 0) {
    te = [
      new Float32Array([1, 0, 0, 0]),
      new Float32Array([0, 1, 0, 0]),
      new Float32Array([0, 0, 1, 0]),
      new Float32Array([0, 0, 0, 1]),
    ]
  } else {
    const det = 1 / sum
    te[0][0] *= det
    te[0][1] *= det
    te[0][2] *= det
    te[0][3] *= det
    te[1][0] *= det
    te[1][1] *= det
    te[1][2] *= det
    te[1][3] *= det
    te[2][0] *= det
    te[2][1] *= det
    te[2][2] *= det
    te[2][3] *= det
    te[3][0] *= det
    te[3][1] *= det
    te[3][2] *= det
    // Fixed (was quirk 3a above): was `te[3][4]` - read back `undefined` (NaN * det), then the
    // write to index 4 was silently dropped.
    te[3][3] *= det
  }

  return te
}

/**
 * Linear interpolation of `value` from `[minValue, maxValue]` into `[minScale, maxScale]` (no
 * clamping - values outside `[minValue, maxValue]` extrapolate, matching the original).
 * `minValue === maxValue` is special-cased to `0` (matching the original's
 * `minValue = (minValue == maxValue) ? 0 : minValue` guard, avoiding a `0/0` divide - not
 * obviously "correct" in general, just preserved).
 */
export function scaleValue(value: number, minValue: number, maxValue: number, minScale: number, maxScale: number): number {
  return coreScaleValue(value, minValue, maxValue, minScale, maxScale)
}
