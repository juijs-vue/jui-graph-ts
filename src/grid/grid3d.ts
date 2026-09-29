// Port of juijs-graph's `src/grid/grid3d.js` ("chart.grid.grid3d", extend: "chart.grid.core").
//
// Extend chain: `Grid3D extends CoreGrid` (`grid/core.ts`) directly - confirmed via the original's
// own `extend: "chart.grid.core"` field (see PORT_STATUS.md's Phase C dependency map). This is a
// "2D/3D-shared grid variant" per this task's own framing, but is really the Z-AXIS depth-line
// renderer: registered as `axis.z`'s grid type (`base/axis.ts`'s `drawGridType()` forces
// `gridCfg.orient = "center"` for `k === "z"`), it does not draw its OWN visible axis text/lines
// the way `grid/date.ts`/`grid/block.ts`/etc do - instead its `draw()` reaches directly into the
// ALREADY-RENDERED x/y grids' root elements (`this.axis.x.root`/`this.axis.y.root`, from a prior
// 2D render pass) and appends the diagonal "3D depth" connector lines onto THEM, then returns its
// own (essentially empty) `drawGrid()` result as its own render output.
//
// **No `top`/`bottom`/`left`/`right`/`center` methods defined** (genuinely absent in the original
// too, not an omission here): `CoreGrid.drawGrid()`'s `this[this.grid.orient]` lookup (`orient`
// forced to `"center"` for a z-axis grid, per above) resolves to `this["center"]` - `Grid3D`
// doesn't define `this.center` and neither does `CoreGrid` (abstract, see `grid/core.ts`'s header
// comment) - so `drawGrid()`'s own `typeCheck("function", func)` guard is FALSE, and its whole
// mixin-registration/`func.call(this, root)` block is skipped entirely (matching the original's
// own already-proven "orient-doesn't-resolve-skips-mixin" quirk, tested in `core.spec.ts`). Net
// effect: `this.drawGrid()` (called by `draw()` below, with no argument - see `grid/date.ts`'s
// identical note on the original's dead `"date"`/etc argument) just returns an empty `<g>` root +
// `this.scale`, with ZERO dependency on the not-yet-ported `grid/draw2d.ts`/`grid/draw3d.ts` mixin
// methods (`drawPattern`/`createGridX`/etc) - unlike `grid/date.ts`, this file needs no
// definite-assignment placeholder fields for them at all.
//
// **Real Phase A dependency**: `util/math.ts`'s `radian(degree)` only (no `rotate()` here, unlike
// `grid/radar.ts`).
//
// **Phase D (`polygon/`) boundary**: NONE. Despite being the "2D/3D-shared" grid and living
// alongside `grid/draw3d.ts` (which DOES have a hard, documented `polygon/{grid,line,point}.js`
// dependency, per PORT_STATUS.md's Phase C dependency map), `grid/grid3d.js` itself never
// references `polygon/*.js` at all (confirmed by reading the original in full - no `jui.include`
// of anything polygon-related, no `import`). It only draws plain 2D `<line>` elements (via
// `CoreGrid.line()`, already-shipped) positioned with trig math, not an actual 3D polygon mesh. No
// Phase D structural-interface stand-in was needed for this file - the "if it has a hard
// dependency on unported Phase D files" contingency this task was briefed to consider does not
// apply here.
//
// **FIXED (Tier A defect 5) - was a severe, previously-undocumented bug, Node-cross-checked (see
// `grid3d.spec.ts`)**: `drawBefore()`'s `degree = this.axis.get("degree")` - `Axis.get("degree")`
// (per `base/axis.ts`, already shipped) is not one of the four private-state keys `get()`
// special-cases (`area`/`padding`/`clipId`/`clipRectId`), so it falls through to
// `this.cloneAxis["degree"]` - the RAW CONFIG value, whose documented/default shape (per
// `Axis.setup()`, already shipped: `degree: {x:0,y:0,z:0}`) is an OBJECT, not a number. The old
// `radian = math.radian(360 - degree)` computed `360 - {x,y,z}` directly - JS's
// `ToPrimitive`/`ToNumber` coercion on the object (no custom `valueOf`, falls through to
// `toString()` -> `"[object Object]"` -> `NaN`) made this `NaN` in EVERY real, standard-schema
// configuration (Node-verified: `360 - {x:0,y:0,z:0}` is exactly `NaN`, not a thrown error) -
// `math.radian(NaN)` was `NaN` too. This is the SAME category of bug `grid/core.ts`'s
// `getGridSize()` also had (`degree > 0` object-vs-number coercion, fixed alongside this one - see
// that file's own header/doc-comment update), but a DIFFERENT code path (`axis.get("degree")` here
// vs. the live `axis.degree` FIELD there) and a much more severe consequence: `this.radian`
// (poisoned to `NaN`) fed directly into `draw()`'s `x2`/`y2` depth-line-endpoint computation
// (`Math.sin(radian)*depth`/`Math.cos(radian)*depth`, both always `NaN`) AND into `this.scale`'s
// own multi-step z-projection branch (`Math.cos(radian)*c`/`Math.sin(radian)*c`) - meaning
// `Grid3D`'s entire depth-line rendering and z-axis projection were silently broken (`NaN`
// coordinates) for any chart using the standard `axis.degree` config object, not a contrived edge
// case. Tier A (not preserved): `resolveDegree()` (see below) now resolves this to a real, finite
// number before it reaches `radian(360 - degree)`.

import { CoreGrid } from "./core";
import type { GridChart } from "./core";
import { radian } from "../util/math";
import type { TransElement } from "../util/svg/element.transform";
import type { Element } from "../util/svg/element";

// ---- inlined `util/base.js` typeCheck (same per-file convention as every other Phase A/B/C file
// in this port) -------------------------------------------------------------------------------
function typeCheckInteger(value: unknown): boolean {
  return typeof value === "number" && value % 1 === 0;
}

/** Tier A fix (defects 5/6 - this file's `drawBefore()` and `grid/core.ts`'s `getGridSize()`,
 * the same root defect family): resolves `axis.get("degree")`/`axis.degree` to a genuine, finite
 * NUMBER before it's used in `radian(360 - degree)`-shaped arithmetic. When `degree` is already a
 * plain number (the majority real-world config - e.g. every `bar3d`/`column3d`/`cylinder3d`/
 * `bubble3d`/cluster/stack/fullstack brush family's own top-level `degree: 30`-style config, per
 * `base/axis.ts`'s own doc comment on that regression fix), it's returned unchanged. When it's the
 * raw `{x,y,z}` object `Axis.setup()`'s own documented/default shape uses (an unconfigured
 * `axis.degree`, or a full-3D-rotation config), no single component is uniquely "correct" for this
 * single-angle 2D math - `base/draw.ts`'s own `calculate3d()` is the one place that legitimately
 * needs all three components independently, for real 3D rotation, and neither this call site nor
 * `grid/core.ts`'s is that. Picking `degree.z` (arbitrary among the three, but applied consistently
 * at every one of this port's `degree`-as-object-coerced-to-NaN call sites) at least yields a real,
 * finite number instead of `NaN` - the common unconfigured `{x:0,y:0,z:0}` case resolves to `0`,
 * matching this same field's own plain-number-config default (`Axis.js`'s original `@cfg {Number}
 * [degree=0]`). */
function resolveDegree(degree: unknown): number {
  if (typeof degree === "number") return degree;
  if (degree && typeof degree === "object" && typeof (degree as { z?: unknown }).z === "number") {
    return (degree as { z: number }).z;
  }
  return 0;
}

/** The shape `this.axis.x`/`this.axis.y` are ACTUALLY rendered into by the time a `Grid3D`
 * z-axis render runs (post-`reload()`, per `base/axis.ts`'s own documented "two-phase" `x`/`y`/
 * `z`/`c` field note): a callable projection function (`GridRenderedScale`'s real shape, per
 * `base/axis.ts`'s header comment) with a `.root` (the rendered grid's `<g>` element) attached.
 * `Axis.x`/`.y` are typed `unknown` there precisely because of this two-phase shape - cast to
 * this local interface here rather than widening `base/axis.ts` itself (out of this task's scope,
 * already-shipped Phase B work). */
interface RenderedAxisScale {
  (value: unknown): number;
  root: TransElement;
}

/** `Grid3D`'s own rendered `.scale` shape - a callable `(x, y, z, count) => {x, y, depth}`
 * projection function, with `.depth`/`.degree`/`.radian` stamped on afterward (mirroring the
 * original's own `this.scale.depth = depth; this.scale.degree = degree; this.scale.radian =
 * radian;` tail). */
export interface Grid3DScale {
  (x: unknown, y: unknown, z?: unknown, count?: number): { x: number; y: number; depth: number };
  depth: number;
  /** Whatever `this.axis.get("degree")` actually returned - `unknown` (not `number`) because, per
   * the preserved-bug note above, this is normally an OBJECT (`{x,y,z}`), not a number, despite
   * every downstream arithmetic use treating it as one. */
  degree: unknown;
  radian: number;
}

/** `grid/grid3d.js`'s own accepted config shape (`Grid3D.setup()`'s one field). */
export interface Grid3DConfig {
  domain?: unknown;
  [key: string]: unknown;
}

/**
 * Port of `chart.grid.grid3d`'s `Grid3D` constructor function as a real ES class (Phase 0 rule
 * 2). No explicit constructor - zero parameters, same as `CoreGrid` itself.
 */
export class Grid3D extends CoreGrid {
  declare chart: GridChart;
  declare grid: Grid3DConfig;

  /** `depth`/`degree`/`radian` - module-scope closure variables in the original (`var depth = 0,
   * degree = 0, radian = 0;`, shared by `drawBefore()` and `draw()` via closure), ported as
   * private instance fields per Phase 0 rule 2 (no observable behavior change: both are
   * effectively "per-render-pass instance state" either way, and this class is never
   * instantiated more than once per z-axis slot in real usage, same as every other concrete grid
   * here). */
  private depth = 0;
  private degree: unknown = 0;
  private radian = 0;

  /** `getElementAttr(root)` - returns the `.attributes` of the LAST direct `<line>` child of
   * `root` (or `null` if none found - the original leaves `attr` at its initial `null` and simply
   * returns that when `root.each()`'s callback never matches, ported verbatim rather than
   * throwing on an unmatched case).
   *
   * **Preserved quirk, Node-cross-checked, not obvious from a single read (see
   * `grid3d.spec.ts`)**: the original's own `root.each()` callback never `break`s/returns early -
   * it keeps OVERWRITING `attr` for every matching `<line>` child, so if `root` has more than one
   * direct `<line>` child, this returns the LAST one's attributes, not the first. This is
   * genuinely reachable in `draw()` below: `yRoot.each()` runs FIRST and, in its own "is a line"
   * branch, APPENDS A NEW `<line>` directly onto `yRoot` itself - so by the time `xRoot.each()`
   * later calls `getElementAttr(yRoot)`, `yRoot` can have TWO direct `<line>` children (the
   * original pre-existing one plus the just-appended one), and this returns the freshly-appended
   * one's (already depth-transformed) `y2`, not the original axis line's - silently changing
   * `xRoot`'s own depth-line geometry based on render-order rather than the pre-existing axis
   * line alone. Preserved exactly, not fixed, per Phase 0 rule 6. */
  private getElementAttr(root: TransElement): Record<string, unknown> | null {
    let attr: Record<string, unknown> | null = null;

    root.each((_i: number, elem: Element) => {
      if (elem.element.nodeName === "line") {
        attr = elem.attributes;
      }
    });

    return attr;
  }

  /**
   * @method drawBefore
   * Resolves `depth`/`degree`/`radian` from `this.axis`, and builds `this.scale` - the z-axis
   * projection function (see `Grid3DScale` above). See header comment for the preserved
   * `degree`-is-an-object `NaN` bug this poisons `radian` with in the standard config case.
   */
  drawBefore = (): void => {
    this.depth = this.axis.get("depth") as number;
    this.degree = this.axis.get("degree");
    this.radian = radian(360 - resolveDegree(this.degree));

    const axis = this.axis;
    const depth = this.depth;
    const radianValue = this.radian;

    const scaleFn = ((x: unknown, y: unknown, z?: unknown, count?: number): { x: number; y: number; depth: number } => {
      const step = typeCheckInteger(count) ? (count as number) : 1;
      const split = depth / step;

      if (z === undefined || step === 1) {
        return {
          x: (axis.x as RenderedAxisScale)(x),
          y: (axis.y as RenderedAxisScale)(y),
          depth: split,
        };
      } else {
        const zVal = z === undefined ? 0 : (z as number);
        const c = split * zVal;
        const top = Math.sin(radianValue) * split;

        return {
          x: (axis.x as RenderedAxisScale)(x) + Math.cos(radianValue) * c,
          y: (axis.y as RenderedAxisScale)(y) + Math.sin(radianValue) * c + top,
          depth: split,
        };
      }
    }) as Grid3DScale;

    scaleFn.depth = depth;
    scaleFn.degree = this.degree;
    scaleFn.radian = radianValue;

    this.scale = scaleFn;
  };

  /**
   * @method draw
   * Appends the diagonal "3D depth" connector lines directly onto the ALREADY-RENDERED x/y grids'
   * root elements (see header comment), then returns `this.drawGrid()`'s own (empty, since
   * `Grid3D` defines no `top`/`bottom`/`left`/`right`/`center` - see header comment) result.
   */
  draw = (): { root: TransElement; scale: any } => {
    const xRoot = (this.axis.x as RenderedAxisScale).root;
    const yRoot = (this.axis.y as RenderedAxisScale).root;

    const y2 = Math.sin(this.radian) * this.depth;
    const x2 = Math.cos(this.radian) * this.depth;

    yRoot.each((_i: number, elem: Element) => {
      if (elem.element.nodeName === "line") {
        yRoot.append(
          this.line({
            x1: x2,
            y1: 0,
            x2: x2,
            y2: y2 + (elem.attributes.y2 as number),
          }),
        );
      } else {
        // X축 라인 속성 가져오기 (fetch the X-axis line's attributes)
        const xAttr = this.getElementAttr(xRoot);

        elem.append(this.line({ x1: 0, y1: 0, x2, y2 }));

        elem.append(
          this.line({
            x1: x2,
            y1: y2,
            x2: x2 + ((xAttr ? xAttr.x2 : undefined) as number),
            y2,
          }),
        );
      }
    });

    xRoot.each((i: number, elem: Element) => {
      const attr = (elem.element.nodeName === "line" ? elem.attributes : elem.get(0)!.attributes) as Record<string, unknown>;
      const rowY2 = (attr.y1 as number) + Math.sin(this.radian) * this.depth;
      const rowX2 = (attr.x1 as number) + Math.cos(this.radian) * this.depth;

      if (i > 0) {
        // Y축 라인 속성 가져오기 (fetch the Y-axis line's attributes)
        const yAttr = this.getElementAttr(yRoot);

        elem.append(this.line({ x1: attr.x1 as number, y1: attr.y1 as number, x2: rowX2, y2: rowY2 }));

        elem.append(
          this.line({
            x1: rowX2,
            y1: rowY2,
            x2: rowX2,
            y2: -(((yAttr ? yAttr.y2 : undefined) as number) - rowY2),
          }),
        );
      }
    });

    return this.drawGrid();
  };

  static setup(): Record<string, unknown> {
    return {
      /** @cfg {Array} [domain=null] */
      domain: null,
    };
  }
}
