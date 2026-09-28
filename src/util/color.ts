// Port of juijs-graph's `src/util/color.js` ("util.color").
//
// Color-parsing/formatting/gradient/scale utilities. Plain exported functions per PORT_STATUS.md
// Phase 0 rule 3 - this was a grab-bag utility namespace in the original too.
//
// jui-chart-vue's `useColorScale.ts` only AUDITED this file (Phase F: confirmed none of its own
// color-interpolation functions vendor from it, and confirmed `util.color.js`'s own `scale`/
// `map`/`HSVtoRGB`/`RGBtoHSV`/`colorHash` are never called anywhere in the juijs-graph engine
// itself - only `ColorUtil.parse`, for gradient-string parsing in `base/builder.js`, is actually
// used internally). This is therefore the first real 1:1 port of the whole file.
//
// RECONCILED with jui-core-ts (see this project's PORT_STATUS.md "jui-core-ts reconciliation"
// entry): `format`/`rgb`/`scale`/`map`/`HSVtoRGB`/`RGBtoHSV`/`lighten`/`darken`/`colorHash` are
// verified behaviorally identical to jui-core-ts's own `src/utils/color.ts` and now delegate to
// it. `parseGradient`/`parseStop`/`parseAttr` (and the `GradientStop`/`GradientDescriptor`/
// `LinearAttr`/`RadialAttr` shapes) stay fully local: jui-core-ts's `parseStop` puts the parsed
// stop `offset` inside `attr.offset` uniformly, while this file's original - and this port of it -
// preserves a genuine original bug where the interpolation pass reads/writes a *separate*,
// never-populated top-level `stop.offset` field (see `parseStop`'s doc comment and this project's
// PORT_STATUS.md). Reconciling that would change this file's actual output shape, not just its
// implementation, so it wasn't attempted.
//
// Quirks/bugs preserved byte-faithfully (in the functions that stayed local):
//  - `parseGradient()` returns its input unchanged (a bare string, not a gradient descriptor
//    object) when the `linear(...)`/`radial(...)` regex doesn't match.
//  - `parseStop`: see the RECONCILED note above and this function's own doc comment.

import { ColorUtil } from 'jui-core-ts'
const {
  format: coreFormat,
  rgb: coreRgb,
  scale: coreScale,
  map: coreMap,
  HSVtoRGB: coreHSVtoRGB,
  RGBtoHSV: coreRGBtoHSV,
  lighten: coreLighten,
  darken: coreDarken,
  colorHash: coreColorHash,
} = ColorUtil

/** An RGB(A) color, channels `0-255` (`a`, when present, `0-1`). */
export interface RgbColor {
  r: number
  g: number
  b: number
  a?: number
}

/** An HSV color: `h` in `0-360` degrees, `s`/`v` in `0-1`. */
export interface HsvColor {
  h: number
  s: number
  v: number
}

/** Matches a `linear(...)`/`radial(...)` gradient descriptor string. */
export const regex = /(linear|radial)\((.*)\)(.*)/i

/**
 * Converts an `{r,g,b[,a]}` object to a CSS color string.
 *
 *     format({ r: 255, g: 255, b: 255 }, 'hex')  // '#FFFFFF'
 *     format({ r: 255, g: 255, b: 255, a: 0.5 }, 'rgb')  // 'rgba(255,255,255,0.5)'
 *
 * Returns `obj` unchanged for any other `type` (matching the original).
 */
export function format(obj: RgbColor, type?: string): string | RgbColor {
  if (type === 'hex' || type === 'rgb') return coreFormat(obj, type)
  return obj
}

/** Strips leading/trailing whitespace. Treats a falsy `str` (e.g. `undefined`) as `''`. */
export function trim(str: string): string {
  return (str || '').replace(/^\s+|\s+$/g, '')
}

/**
 * Parses a color string to an `{r,g,b,a}` object. Passes non-string input through unchanged, and
 * also passes an unrecognized string (no `rgb(`/`rgba(`/`#` prefix) through unchanged - see this
 * file's header comment.
 */
export function rgb(str: string | RgbColor): RgbColor | string {
  return coreRgb(str) as RgbColor | string
}

/** The callable scale object returned by `scale()` - see its doc comment. */
export interface ColorScale {
  (t: number, type?: string): string | RgbColor
  domain(start: string | RgbColor, end: string | RgbColor): ColorScale
  ticks(n: number): string[]
}

/**
 * Builds a color-interpolation scale.
 *
 *     const c = scale().domain('#FF0000', '#00FF00')
 *     c(0.5)        // middle color, e.g. '#808000' when a `type` of 'hex' is given
 *     c.ticks(20)    // middle color LIST: [startColor, ..., endColor], as hex strings
 */
export function scale(): ColorScale {
  return coreScale() as unknown as ColorScale
}

/** The callable map object exposed as `map` - see its doc comment. */
export interface ColorMap {
  (colorList: (string | RgbColor)[], count?: number): string[]
  parula(count?: number): string[]
  jet(count?: number): string[]
  hsv(count?: number): string[]
  hot(count?: number): string[]
  pink(count?: number): string[]
  bone(count?: number): string[]
  copper(count?: number): string[]
}

/**
 * Builds a color map by chaining `scale().ticks()` across each consecutive pair of
 * `colorList` stops.
 *
 *     const colors = map(['#352a87', '#0f5cdd', '#00b5a6', '#ffc337', '#fdff00'], count)
 */
export const map = coreMap as unknown as ColorMap

/**
 * Converts HSV (H: 0-360, S/V: 0-1) to RGB (0-255 channels, `Math.ceil`-rounded).
 *
 *     HSVtoRGB(0, 0, 1)  // { r: 255, g: 255, b: 255 }
 */
export function HSVtoRGB(H: number, S: number, V: number): RgbColor {
  return coreHSVtoRGB(H, S, V)
}

/** Converts RGB (0-255 channels) to HSV (H: 0-360, S/V: 0-1). */
export function RGBtoHSV(R: number, G: number, B: number): HsvColor {
  return coreRGBtoHSV(R, G, B)
}

/** Lightens (positive `rate`) or darkens (negative `rate`) a `#rrggbb` color string.
 * `rate` defaults to `0` (a no-op passthrough), matching the underlying `jui-core-ts` function
 * this wraps (`lighten(color, rate = 0)`) - this wrapper had dropped that default, making `rate` a
 * required argument here even though real call sites (e.g. legacy `chart.widget.tooltip`'s
 * `ColorUtil.lighten(color)`, ported to this project's `jui-chart-vue` consumer) call it with only
 * one argument. */
export function lighten(color: string, rate = 0): string {
  return coreLighten(color, rate)
}

/** See `lighten()`'s doc comment - `rate` defaults to `0` here too, for the same reason and
 * matching `jui-core-ts`'s own `darken(color, rate = 0)` signature. */
export function darken(color: string, rate = 0): string {
  return coreDarken(color, rate)
}

/** Gradient color string parsing - alias for `parseGradient`. */
export function parse(color: string): GradientDescriptor | string {
  return parseGradient(color)
}

/** Parsed shape of a `linear(...)`/`radial(...)` gradient string, as returned by `parseGradient()`. */
export interface GradientDescriptor {
  type: string
  attr: LinearAttr | RadialAttr
  children: GradientStop[]
}

/** SVG `<linearGradient>` attributes, as computed by `parseAttr('linear', ...)`. */
export interface LinearAttr {
  x1: number
  y1: number
  x2: number
  y2: number
  direction?: string
}

/** SVG `<radialGradient>` attributes, as computed by `parseAttr('radial', ...)`. */
export interface RadialAttr {
  cx: number
  cy: number
  r: number
  fx: number
  fy: number
}

/**
 * Parses a gradient descriptor string, e.g.:
 *
 *      linear(left) #fff,#000
 *      linear(right) #fff,50 yellow,black
 *      radial(50%,50%,50%,50,50)
 *
 * Returns the input string unchanged if it doesn't match the `linear(...)`/`radial(...)` pattern.
 */
export function parseGradient(color: string): GradientDescriptor | string {
  const matches = color.match(regex)

  if (!matches) return color

  const type = trim(matches[1])
  const attr = parseAttr(type, trim(matches[2]))
  const stops = parseStop(trim(matches[3]))

  return { type: type + 'Gradient', attr, children: stops }
}

/** One `<stop>` of a parsed gradient descriptor (`GradientDescriptor.children`) - see this
 * interface's own `offset` field for a real, preserved parsing quirk. */
export interface GradientStop {
  type: string
  attr: Record<string, string | number>
  /**
   * PRESERVED BUG: this is a SEPARATE, top-level field from `attr.offset` (the one actually
   * parsed out of e.g. `"50% yellow"`). The original's interpolation pass (below) reads/writes
   * `stop.offset` directly on the stop object, never `stop.attr.offset` - so it's blind to any
   * offset a stop was actually constructed with, and only ever sees the values it force-assigns
   * to the first (`0`) and last (`1`) stops itself. In practice this means the "interpolate
   * missing offsets evenly between two known ones" logic never consults real percentage-offset
   * stops at all - see this file's header comment and `parseStop`'s doc comment.
   */
  offset?: number
}

/**
 * Splits a comma-separated gradient-stop list (e.g. `"#fff,50% yellow,black"`) into stop
 * descriptors.
 *
 * PRESERVED BUG: the "interpolate any stops between two explicit offsets evenly" pass operates on
 * a top-level `stop.offset` field that is NEVER populated from the actually-parsed `stop.attr.
 * offset` (e.g. `"50%"` on a `"50% yellow"` stop) - only the first/last stops get a top-level
 * `.offset` (force-set to `0`/`1`). Net effect: an explicit percentage offset on a middle stop is
 * silently ignored by this interpolation step (it's invisible to the `typeof stop.offset ==
 * 'undefined'` checks, which only ever see the real `.attr.offset`-having stops as "not needing
 * interpolation" by accident, not by design) - see this project's PORT_STATUS.md for the full
 * writeup and a hand-traced example.
 */
export function parseStop(stop: string): GradientStop[] {
  const stopList = stop.split(',')
  const stops: GradientStop[] = []

  for (let i = 0; i < stopList.length; i++) {
    const arr = stopList[i].split(' ')

    if (arr.length == 0) continue

    if (arr.length == 1) {
      stops.push({ type: 'stop', attr: { 'stop-color': arr[0] } })
    } else if (arr.length == 2) {
      stops.push({ type: 'stop', attr: { offset: arr[0], 'stop-color': arr[1] } })
    } else if (arr.length == 3) {
      stops.push({ type: 'stop', attr: { offset: arr[0], 'stop-color': arr[1], 'stop-opacity': arr[2] } })
    }
  }

  let start = -1
  let end = -1
  for (let i = 0, len = stops.length; i < len; i++) {
    const s = stops[i]

    if (i == 0) {
      if (!s.offset) s.offset = 0
    } else if (i == len - 1) {
      if (!s.offset) s.offset = 1
    }

    if (start == -1 && typeof s.offset == 'undefined') {
      start = i
    } else if (end == -1 && typeof s.offset == 'undefined') {
      end = i

      const count = end - start

      const endOffsetRaw = stops[end].offset as unknown
      const startOffsetRaw = stops[start].offset as unknown

      const endOffset =
        typeof endOffsetRaw == 'string' && (endOffsetRaw as string).indexOf('%') > -1
          ? parseFloat(endOffsetRaw as string) / 100
          : Number(endOffsetRaw)
      const startOffset =
        typeof startOffsetRaw == 'string' && (startOffsetRaw as string).indexOf('%') > -1
          ? parseFloat(startOffsetRaw as string) / 100
          : Number(startOffsetRaw)

      const dist = endOffset - startOffset
      const value = dist / count

      let offset = startOffset + value
      for (let index = start + 1; index < end; index++) {
        stops[index].offset = offset
        offset += value
      }

      start = end
      end = -1
    }
  }

  return stops
}

/**
 * Parses a gradient's direction/coordinate segment (the part between the parens in
 * `linear(...)`/`radial(...)`) into SVG gradient attributes.
 *
 * For `type === 'linear'`, a handful of named directions (`'left'`/`'right'`/`'top'`/`'bottom'`/
 * `'top left'`/`'top right'`/`'bottom left'`/`'bottom right'`, or `''` which behaves like
 * `'left'`) map to fixed `{x1,y1,x2,y2}` corners; anything else is parsed as a raw
 * `"x1,y1,x2,y2"` comma list (percent values, e.g. `"50%"`, are kept as strings; plain numbers
 * are `parseFloat`'d). For any other `type` (i.e. `'radial'`), `str` is always parsed as a raw
 * `"cx,cy,r,fx,fy"` comma list the same way.
 */
export function parseAttr(type: string, str: string): LinearAttr | RadialAttr {
  if (type == 'linear') {
    switch (str) {
      case '':
      case 'left':
        return { x1: 0, y1: 0, x2: 1, y2: 0, direction: str || 'left' }
      case 'right':
        return { x1: 1, y1: 0, x2: 0, y2: 0, direction: str }
      case 'top':
        return { x1: 0, y1: 0, x2: 0, y2: 1, direction: str }
      case 'bottom':
        return { x1: 0, y1: 1, x2: 0, y2: 0, direction: str }
      case 'top left':
        return { x1: 0, y1: 0, x2: 1, y2: 1, direction: str }
      case 'top right':
        return { x1: 1, y1: 0, x2: 0, y2: 1, direction: str }
      case 'bottom left':
        return { x1: 0, y1: 1, x2: 1, y2: 0, direction: str }
      case 'bottom right':
        return { x1: 1, y1: 1, x2: 0, y2: 0, direction: str }
      default: {
        const arr = str.split(',').map((v) => (v.indexOf('%') == -1 ? parseFloat(v) : v)) as unknown as number[]
        return { x1: arr[0], y1: arr[1], x2: arr[2], y2: arr[3] }
      }
    }
  } else {
    const arr = str.split(',').map((v) => (v.indexOf('%') == -1 ? parseFloat(v) : v)) as unknown as number[]
    return { cx: arr[0], cy: arr[1], r: arr[2], fx: arr[3], fy: arr[4] }
  }
}

/**
 * Hashes `name` to a warm-palette RGB color (or feeds the 0-1 hash vector to `callback`, if
 * given).
 */
export function colorHash(name?: string, callback?: (vector: number) => unknown): RgbColor | unknown {
  return callback ? coreColorHash(name, callback) : coreColorHash(name)
}
