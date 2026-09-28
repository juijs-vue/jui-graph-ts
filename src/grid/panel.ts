// Port of juijs-graph's `src/grid/panel.js` ("chart.grid.panel", extend: "chart.grid.core").
//
// Real dependency: `CoreGrid` only - "nothing extra" beyond `util.base`'s `extend()`, inlined
// per-file (same convention `grid/core.ts` already established; no shared helper module exists in
// this port). Confirmed via the original file itself: its only `jui.include(...)` call is
// `jui.include("util.base")`, used solely for a single `_.extend(...)` call in `custom()`.
//
// Used as the "c"/custom axis grid: `base/axis.ts`'s `drawGridType()` defaults `axis.c.type` to
// `"panel"` and forces `axis.c.orient = "custom"` for that slot (see `axis.ts`'s own
// `drawGridType()`), so `PanelGrid.custom()` is the method `drawGrid()`'s `this[this.grid.orient]`
// lookup actually resolves to for a real chart's z-color axis.
//
// **`draw()`/`drawBefore()` are arrow-function CLASS FIELDS, not method syntax** - same
// TS2425-avoidance reasoning `grid/core.ts`'s own `CoreGrid.drawAfter` doc comment already
// documents: `Draw` declares `draw?`/`drawBefore?` as PROPERTIES (`draw?: () => any;`), not
// methods, so a subclass overriding them with plain method syntax is rejected by TypeScript's
// override-kind check. `custom()` is NOT declared anywhere in the `Draw`/`CoreGrid` chain (only
// ever resolved dynamically via `drawGrid()`'s own `this[this.grid.orient]` lookup), so it has no
// such constraint and stays a normal method.
import { CoreGrid } from "./core";
import type { TransElement } from "../util/svg/element.transform";

// ---- inlined `util/base.js` `extend(origin, add)` (same per-file convention as `grid/core.ts`) --
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

/** `chart.grid.panel` - the auto-registered default "c"/custom axis grid (see this file's own
 * header comment: `base/axis.ts`'s `drawGridType()` defaults `axis.c.type` to `"panel"`), drawing
 * one full-axis-area background rect. See `custom()`'s own doc comment for two harmless-in-this-file
 * preserved quirks (a hardcoded scale index, and an x/y subtraction that always nets to `0`). */
export class PanelGrid extends CoreGrid {
  /**
   * @method custom
   * **PRESERVED QUIRK**: always resolves `this.scale(0)` - the index argument is hardcoded to
   * `0`, not derived from anything. Harmless here specifically because `drawBefore()`'s own
   * `scale` (below) ignores its own `i` parameter entirely and always returns the full
   * axis-area rect regardless - so the hardcoded `0` never actually mattered in this file, but
   * it's still a literal 1:1 port of the original's own `this.scale(0)` call, not a
   * simplification of it.
   *
   * **PRESERVED QUIRK**: `obj.x -= this.axis.area("x")` / `obj.y -= this.axis.area("y")` always
   * nets to exactly `0` for both `x` and `y` - `scale()`'s own `x`/`y` fields ARE
   * `axis.area("x")`/`axis.area("y")`, so this subtracts them right back out. The rendered rect's
   * `x`/`y` are therefore always `0` (chart-svg-local origin), not axis-area-relative as reading
   * just this subtraction in isolation might suggest.
   */
  custom(g: TransElement): void {
    const obj = this.scale(0);

    obj.x -= this.axis.area("x");
    obj.y -= this.axis.area("y");

    g.append(
      this.chart.svg.rect(
        extend(obj, {
          fill: "transparent",
          stroke: "transparent",
        }),
      ),
    );
  }

  /** `Draw.render()` lifecycle hook: builds this grid's `scale` as a function that ignores its own
   * `i` argument entirely and always returns the full `axis.area()` rect (`x`/`y`/`width`/
   * `height`) - the single "panel" rect `custom()` above then draws. */
  drawBefore = (): void => {
    const axis = this.axis;

    this.scale = (_i: number) => ({
      x: axis.area("x"),
      y: axis.area("y"),
      width: axis.area("width"),
      height: axis.area("height"),
    });
  };

  /**
   * @method draw
   * Unconditionally forces `this.grid.hide = true` (mutating the SHARED grid-config object - see
   * `base/axis.ts`'s documented `this.x`/`.y`/`.z`/`.c` two-phase-shaped quirk) before delegating
   * to `drawGrid()` - a real panel grid is ALWAYS hidden (`display:none` on its root), regardless
   * of any user-configured `hide` option.
   *
   * **Adaptation, not a behavior change**: the original calls `this.drawGrid("panel")` - but
   * `grid/core.js`'s real `drawGrid` (despite its own JSDoc listing `chart`/`orient`/`cls`/`grid`
   * params) is actually declared as `function()`, taking ZERO parameters - the `"panel"` argument
   * was already silently discarded by the original engine itself (confirmed by reading
   * `grid/core.js` directly, not assumed). `grid/core.ts`'s ported `drawGrid(): {...}` is
   * therefore correctly 0-arg too, and this file calls it as `this.drawGrid()` - dropping an
   * argument that was already 100% inert upstream, not a new deviation.
   */
  draw = (): { root: TransElement; scale: any } => {
    this.grid.hide = true;
    return this.drawGrid();
  };
}
