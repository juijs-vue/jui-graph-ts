// Port of juijs-graph's `src/grid/overlap.js` ("chart.grid.overlap", extend: "chart.grid.core").
//
// Real dependency: `CoreGrid` only - "nothing extra" beyond `util.base`'s `extend()`, inlined
// per-file (same convention as `grid/panel.ts`/`grid/core.ts`). Confirmed via the original file
// itself: its only `jui.include(...)` call is `jui.include("util.base")`.
//
// **`draw()`/`drawBefore()` are arrow-function CLASS FIELDS, not method syntax** - same
// TS2425-avoidance reasoning as `grid/panel.ts`/`grid/core.ts`'s `drawAfter` (overriding `Draw`'s
// property-shaped `draw?`/`drawBefore?`, not a method-shaped member).
import { CoreGrid } from "./core";
import type { TransElement } from "../util/svg/element.transform";

// ---- inlined `util/base.js` `extend(origin, add)` (same per-file convention) -------------------
function typeCheck(type: string, value: unknown): boolean {
  if (type === "object") {
    return typeof value === "object" && value !== null && !(value instanceof Array) && !(value instanceof Date) && !(value instanceof RegExp);
  }
  return false;
}

function extend(origin: Record<string, unknown>, add: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!typeCheck("object", add)) return origin;
  for (const key in add) {
    origin[key] = add![key];
  }
  return origin;
}

export class OverlapGrid extends CoreGrid {
  /**
   * @method custom
   * **GENUINE, PREVIOUSLY-UNDOCUMENTED BUG (not merely dead code - the geometry loop itself IS
   * reachable)**: the original declares `this.custom = function() {...}` with **ZERO** parameters
   * - unlike `grid/panel.ts`'s `custom(g)` (which DOES capture and `g.append(...)` its rect).
   * `drawGrid()` always invokes the resolved orient method as `func.call(this, root)`, passing
   * `root` as the first argument - since `custom()` here never declares a parameter to receive
   * it, `root` is simply discarded at the call boundary. Every `this.chart.svg.rect(...)` created
   * inside the loop below IS actually constructed (the loop genuinely runs, unlike
   * `grid/table.ts`'s dead loop - `this.axis.data.length` is a real, populated value) but is
   * NEVER appended anywhere: no `g.append(...)`/`root.append(...)` call exists anywhere in the
   * original body. Net effect: `OverlapGrid` computes real per-row geometry and constructs real,
   * live SVG rect elements every render, all of which are immediately orphaned (never attached to
   * the returned `root`, so never part of the chart's actual DOM/SVG tree) - the rendered overlap
   * grid is, in every real invocation, a completely empty `<g>`. Preserved byte-faithfully (not
   * fixed) per Phase 0 rule 6; the parameter is genuinely omitted here too (not merely unused) to
   * match the original's exact signature. Tested in `overlap.spec.ts` (spies on `chart.svg.rect`
   * to show it *is* called `axis.data.length` times, and separately confirms the returned group
   * ends up with zero children).
   */
  custom(): void {
    for (let i = 0, len = this.axis.data.length; i < len; i++) {
      const obj = this.scale(i);

      obj.x -= this.axis.area("x");
      obj.y -= this.axis.area("y");

      this.chart.svg.rect(
        extend(obj, {
          fill: "transparent",
          stroke: "transparent",
        }),
      );
    }
  }

  /** `Draw.render()` lifecycle hook: builds this grid's `scale` as an index-based function
   * producing `size` (`grid.count`, or `axis.data.length`, or `1`) concentric rects - the full
   * axis-area rect at `i = 0`, shrinking symmetrically toward the area's center as `i` approaches
   * `size` - the geometry `custom()` above iterates over, per row, before discarding every result
   * (see `custom()`'s own doc comment for why nothing ends up rendered). */
  drawBefore = (): void => {
    const size = (this.grid.count as number | undefined) || this.axis.data.length || 1;
    const widthUnit = this.axis.area("width") / 2 / size;
    const heightUnit = this.axis.area("height") / 2 / size;
    const width = this.axis.area("width");
    const height = this.axis.area("height");
    const axis = this.axis;

    this.scale = (i: number) => {
      const x = i * widthUnit;
      const y = i * heightUnit;

      return {
        x: axis.area("x") + x,
        y: axis.area("y") + y,
        width: Math.abs(width / 2 - x) * 2,
        height: Math.abs(height / 2 - y) * 2,
      };
    };
  };

  /**
   * @method draw
   * Same "always forces `this.grid.hide = true`" behavior as `grid/panel.ts`'s `draw()` - see its
   * doc comment. Same `this.drawGrid("overlap")` → `this.drawGrid()` argument-dropping adaptation
   * too (the string was already discarded by the original `drawGrid`, a 0-arg function despite
   * its own misleading JSDoc - see `grid/panel.ts`'s doc comment for the full evidence).
   */
  draw = (): { root: TransElement; scale: any } => {
    this.grid.hide = true;
    return this.drawGrid();
  };

  static setup(): Record<string, unknown> {
    return {
      /** @cfg {Number} [count=null] Splited count */
      count: null,
    };
  }
}
