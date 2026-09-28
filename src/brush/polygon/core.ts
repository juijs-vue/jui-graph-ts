// Port of juijs-graph's `src/brush/polygon/core.js` (`chart.brush.polygon.core`, `extend:
// "chart.brush.core"`).
//
// ============================================================================================
// EXTEND CHAIN - CONFIRMED FROM SOURCE: `brush/polygon/core.js` line 3, `extend:
// "chart.brush.core"` -> `src/brush/core.ts`'s `CoreBrush` (`extends Draw`). Real chain:
// `PolygonCoreBrush extends CoreBrush extends Draw` - the SVG-side sibling of `brush/canvas/
// core.ts`'s `CanvasCoreBrush` (same immediate parent, different rendering target: this one draws
// real `<polygon>` SVG elements via `this.svg`, `CanvasCoreBrush` draws to a
// `CanvasRenderingContext2D`). Constructor kept 1:1 - zero parameters, same externally-wired-
// after-construction shape every other `chart.brush.*`/`chart.grid.*`/`chart.widget.*` base in
// this engine already established.
//
// ============================================================================================
// CROSS-CHECK AGAINST jui-chart-vue's `column3d.js`/`line3d.js` writeup (`PORT_STATUS.md`
// ~L5869-5919 there), which already documented `createPolygon()` calling `chart.draw.
// calculate3d()` (now `base/draw.ts`'s `Draw.calculate3d()`, already ported) and stamping
// `order = axis.depth - polygon.max().z` for z-sorting, WITHOUT having this actual 25-line
// source file to read directly (jui-chart-vue only had `jui-chart/src/brush/polygon/{column3d,
// line3d}.js`'s own call sites into this base class, not the base class itself, which lives in
// the separate `juijs-graph` package it never cloned) - verified against the real source in full:
//
//   CONFIRMED, precisely, method-for-method: `createPolygon(polygon, callback)` is the ONLY
//   method this file adds (exactly one, matching jui-chart-vue's own count: "adds exactly one
//   method, `createPolygon(polygon, callback)`"). Its body, Node/hand-verified against the
//   literal 25-line source:
//     1. `this.calculate3d(polygon)` - IDENTICAL call shape to `CanvasCoreBrush.addPolygon()`'s
//        own `this.calculate3d(polygon)` (both single-argument, both the SAME inherited
//        `Draw.calculate3d()` - confirmed NOT brush-specific, exactly as jui-chart-vue's writeup
//        already states: "calls the shared `chart.draw` method `this.calculate3d(polygon)`
//        (confirmed IDENTICAL to the one `dot3d.js` already uses - not brush-specific)").
//     2. `var element = callback.call(this, polygon);` - invokes the caller-supplied `callback`
//        WITH `this` bound to the `PolygonCoreBrush` instance (so a leaf brush's `createPolygon`
//        callback can itself call `this.svg...`/`this.color(...)`/etc.), passing the
//        (now-rotated/projected) `polygon` as its sole argument, and captures its return value.
//     3. `if(element) { element.order = axis.depth - polygon.max().z; return element; }` -
//        CONFIRMED, exact match to jui-chart-vue's own already-documented formula
//        (`order = axis.depth - polygon.max().z`, no `Math.max(...)`/`/2` involved here, unlike
//        `calculate3d()`'s OWN internal depth-param formula - this file's `order` stamp is a
//        SEPARATE, simpler post-hoc calculation using `axis.depth` directly, not the
//        `Math.max(plotWidth, plotHeight, axis.depth)` value `calculate3d()` computed internally
//        for its own rotation step). **A real, easy-to-miss detail confirmed by reading the exact
//        source line**: the `element.order = ...` stamp - and therefore the whole
//        `return element` - is GATED behind `if(element)` (truthy-checked, i.e. `callback` must
//        return something). If `callback` returns nothing (`undefined`, e.g. a
//        `line3d.js`-style per-vertex helper that only ever mutates SVG state as a side effect
//        and never returns its own drawn element - confirmed by jui-chart-vue's own writeup:
//        "`line3d.js`'s `createLine` instead makes 4 separate calls each wrapping a
//        single-vertex `PointPolygon`... whose `createPolygon()` callbacks never `return`
//        anything, so `order` is instead computed BY HAND after the loop"), `createPolygon()`
//        itself returns `undefined` too (JS's implicit function-return-nothing, ported here as an
//        explicit `return undefined` for TS clarity - no behavior change) - NO `order` is ever
//        stamped on anything in that case, matching jui-chart-vue's own independent confirmation
//        of this exact code path via `line3d.js`'s real usage. Preserved exactly, not "fixed" to
//        unconditionally return/stamp.
//
//   The `order`-based z-sort itself (jui-chart-vue's own cross-reference to `util/svg.js`'s
//   `appendAll()`, "sorts a `<g>`'s children by `.order` before appending to the DOM whenever any
//   child's `order > 0`") lives in the ALREADY-PORTED `src/util/svg.ts` (Phase A) - confirmed by
//   grep here (`appendAll` sorts `SVGBase`'s queued children by a numeric `.order` field before
//   `Element.appendAll()`ing them, same "SVG-side analog of `chart.brush.canvas.core`'s
//   `addPolygon()`/`drawAfter()`" jui-chart-vue's writeup already names) - this file's own
//   responsibility ends at STAMPING `.order` onto `callback`'s returned element; the actual sort/
//   append happens later, inside `svg.ts`'s own render pipeline, out of this file's scope.
//
//   NO CORRECTIONS NEEDED - jui-chart-vue's `column3d.js`/`line3d.js` writeup's description of
//   this base class (derived entirely from its two concrete SUBCLASSES' call sites, without ever
//   reading this file itself) turns out to be exactly right on every point checked above.
// ============================================================================================
//
// `static setup()` - CONFIRMED present here (unlike `CanvasCoreBrush`, which has none), Node/hand-
// verified against the literal source: `{id: null, clip: false}`. Two real, non-obvious details:
//   - `clip: false` here DIVERGES from `CoreBrush.setup()`'s own `clip: true` default (see
//     `brush/core.ts`'s `static setup()`) - a polygon-drawing SVG brush defaults to NOT clipping
//     its output to the axis's clip-path, the opposite of every plain axis-based SVG brush's own
//     default. Per the SAME already-documented `builder.ts` gap `brush/core.ts`'s own header
//     comment flags (`defineOptions()` only merges the LEAF ctor's own `setup()`, never walking
//     the full `extend` chain), this `clip: false` would ALSO not automatically reach a real leaf
//     `chart.brush.polygon.*` subclass's instances through the current simplified wiring, exactly
//     the same pre-existing gap, not re-documented per-file beyond this note.
//   - `id: null` is a NEW key not present anywhere in `CoreBrush.setup()`'s own 6-key return
//     value (`target`/`colors`/`axis`/`index`/`clip`/`useEvent`) - genuinely additive, not an
//     override of an existing key.
// ============================================================================================

import { CoreBrush } from "../core";

/** Minimal shape `createPolygon()` needs from a 3D polygon primitive - same structural interface
 * `brush/canvas/core.ts`'s `CanvasCoreBrush` already defines for its own `addPolygon()`/
 * `drawAfter()` (the real type in both cases is `polygon.core`'s `PolygonCore` or a subclass -
 * see that file's own doc comment for why this stays a small structural interface rather than a
 * direct `PolygonCore` import). */
export interface PolygonBrushPolygon {
  perspective: unknown;
  rotate(depth: number, degree: unknown, cx: number, cy: number, cz: number): void;
  max(): { x: number; y: number; z: number };
}

/** `createPolygon()`'s return shape - whatever `callback` itself returns (typically a
 * `util/svg.ts` `TransElement`/`Element`, per `column3d.js`'s `this.svg.group(...)`/`line3d.js`'s
 * `this.svg.polygon(...)` real usage), stamped with a numeric `.order` field for `svg.ts`'s
 * `appendAll()` z-sort. Kept as an open index-signature-free generic rather than importing
 * `TransElement` directly, matching the original's own complete lack of a type constraint on
 * `callback`'s return value (plain untyped JS - `callback` could in principle return anything
 * object-shaped, the `if(element)` guard is the only real constraint). */
export type PolygonBrushElement = { order?: number } & Record<string, unknown>;

/** 1:1 shape of `PolygonCoreBrush.setup()`'s real, complete defaults (see header comment - `id`
 * additive, `clip` diverges from `CoreBrush.setup()`'s own `true` default). Left with an index
 * signature, same convention `brush/core.ts`'s `BrushOptions` already established, since a
 * concrete `chart.brush.polygon.*` leaf's own config keys also live on this same object in the
 * original. */
export interface PolygonBrushOptions {
  /** @cfg {String} [id=null] (additive over `CoreBrush.setup()` - not present there at all). */
  id?: string | null;
  /** @cfg {boolean} [clip=false] Diverges from `CoreBrush.setup()`'s own `clip: true` default -
   * see header comment. */
  clip?: boolean;
  [key: string]: unknown;
}

/**
 * Port of `chart.brush.polygon.core`'s `PolygonCoreBrush` constructor function as a real ES
 * class, per Phase 0 rule 2. Constructor kept 1:1 (zero parameters, same externally-wired-after-
 * construction shape `CoreBrush`/`CanvasCoreBrush` already established).
 */
export class PolygonCoreBrush extends CoreBrush {
  /**
   * @method createPolygon
   * Rotates/perspective-projects `polygon` via the inherited `Draw.calculate3d()`, invokes
   * `callback` (bound to `this`) with the now-projected polygon, and - only when `callback`
   * returns a truthy value - stamps `order = axis.depth - polygon.max().z` onto that returned
   * element for `util/svg.ts`'s `appendAll()` z-sort, then returns it. Returns `undefined`
   * (nothing stamped) when `callback` itself returns nothing - see header comment's
   * `line3d.js`-confirmed "no return value" real usage.
   */
  createPolygon<P extends PolygonBrushPolygon, E extends PolygonBrushElement>(
    polygon: P,
    callback: (this: PolygonCoreBrush, polygon: P) => E | undefined
  ): E | undefined {
    this.calculate3d(polygon as any);

    const element = callback.call(this, polygon);

    if (element) {
      element.order = (this.axis.depth as number) - polygon.max().z;
      return element;
    }

    return undefined;
  }

  /**
   * @method setup
   * 1:1 port of `PolygonCoreBrush.setup()`'s static defaults factory: `{ id: null, clip: false }` -
   * see header comment for why `clip` diverges from `CoreBrush.setup()`'s own `true` default and
   * why `id` is additive over it.
   */
  static setup(): PolygonBrushOptions {
    return {
      /** @cfg {String} [id=null] */
      id: null,
      /** @cfg {boolean} [clip=false] */
      clip: false,
    };
  }
}
