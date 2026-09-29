// Port of juijs-graph's `src/util/svg/element.path.symbol.js` ("util.svg.element.path.symbol").
// Extends `element.path.ts`'s `PathElement` with small marker-symbol path helpers.

import { PathElement } from "./element.path";
import { registerElementModule } from "./element";

/** The 5 marker-shape path templates `PathSymbolElement.template()` builds, one field per
 * supported `symbol` name (`rect`/`rectangle` are aliases for the same square template). */
export interface SymbolTemplates {
  triangle: string;
  rect: string;
  rectangle: string;
  cross: string;
  circle: string;
}

/**
 * A `PathElement` specialized for drawing small marker symbols (triangle/rect/cross/circle) via
 * its own `add()` accumulator as well as the inherited path-command buffer - see `join()`'s doc
 * comment for the bug this split used to cause (now fixed: `join()` flushes both).
 */
export class PathSymbolElement extends PathElement {
  // A SEPARATE accumulator from `PathElement`'s own private `orders` array - see the `join()`
  // override doc comment below for why this matters (and how `join()` now flushes both).
  private ordersString = "";

  /** Returns raw path-command-string templates (not applied to any element) for each symbol. */
  template(width: number, height: number): SymbolTemplates {
    const r = width;
    const half_width = width / 2;
    const half_r = half_width;
    const half_height = height / 2;

    const start = "a" + half_r + "," + half_r + " 0 1,1 " + r + ",0";
    const end = "a" + half_r + "," + half_r + " 0 1,1 " + -r + ",0";

    const obj: SymbolTemplates = {
      triangle: ["m0," + -half_height, "l" + half_width + "," + height, "l" + -width + ",0", "l" + half_width + "," + -height].join(" "),
      rect: ["m" + -half_width + "," + -half_height, "l" + width + ",0", "l0," + height, "l" + -width + ",0", "l0," + -height].join(" "),
      rectangle: "",
      cross: ["m" + -half_width + "," + -half_height, "l" + width + "," + height, "m0," + -height, "l" + -width + "," + height].join(" "),
      circle: ["m" + -r + ",0", start, end].join(" "),
    };

    obj.rectangle = obj.rect;

    return obj;
  }

  /**
   * Flushes BOTH the inherited `PathElement` command buffer AND this class's own `ordersString`
   * (built only via `.add()`) into the `d` attribute.
   *
   * **Fixed (Tier A - crash-shaped defect: shapes silently never rendered)**: this override used
   * to completely shadow the inherited `PathElement.join()`, which is the ONLY method that ever
   * reads/clears `PathElement`'s own private `orders` array. But `.triangle()`/`.rect()`/
   * `.rectangle()`/`.cross()`/`.circle()` below all build their path data by calling the
   * INHERITED `MoveTo`/`moveTo`/`lineTo`/`arc` (i.e. they push onto `PathElement`'s `orders`, not
   * this class's `ordersString`). Net effect: calling e.g. `.triangle(10, 10, 4, 4)` then
   * `.join()` wrote NOTHING to the `d` attribute - the shape never rendered at all, for every
   * caller of any of those five methods. No plausible demo could be relying on those methods
   * being silent no-ops, so this now calls the inherited `PathElement.join()` (via `super.join()`)
   * first, to flush whatever `orders`-based path is buffered, then appends any `ordersString`
   * (from `.add()`) after it - so both accumulators reach the `d` attribute, whether used
   * separately or together. Verified in `element.path.symbol.spec.ts`.
   */
  join(): void {
    super.join();

    if (this.ordersString.length > 0) {
      const existing = this.attr("d") as string | undefined;
      this.attr({ d: existing ? existing + this.ordersString : this.ordersString });
      this.ordersString = "";
    }
  }

  /** Appends one symbol instance (by raw template string, from `.template()`) at `(cx, cy)`. */
  add(cx: number, cy: number, tpl: string): void {
    this.ordersString += " M" + cx + "," + cy + tpl;
  }

  // The four methods below build path commands via the INHERITED PathElement command builder
  // (see the `join()` doc comment above - `join()` now flushes that inherited buffer too).

  /** Draws a triangle centered at `(cx, cy)`. Its commands land in the inherited `PathElement` buffer, which this class's `join()` now also flushes (see the class doc comment). */
  triangle(cx: number, cy: number, width: number, height: number): this {
    return this.MoveTo(cx, cy).moveTo(0, -height / 2).lineTo(width / 2, height).lineTo(-width, 0).lineTo(width / 2, -height);
  }

  /** Draws a rectangle centered at `(cx, cy)`. Its commands land in the inherited `PathElement` buffer, which this class's `join()` now also flushes (see the class doc comment). */
  rect(cx: number, cy: number, width: number, height: number): this {
    return this.MoveTo(cx, cy).moveTo(-width / 2, -height / 2).lineTo(width, 0).lineTo(0, height).lineTo(-width, 0).lineTo(0, -height);
  }
  /** Alias for `rect()`. */
  rectangle(cx: number, cy: number, width: number, height: number): this {
    return this.rect(cx, cy, width, height);
  }

  /** Draws an X/cross centered at `(cx, cy)`. Its commands land in the inherited `PathElement` buffer, which this class's `join()` now also flushes (see the class doc comment). */
  cross(cx: number, cy: number, width: number, height: number): this {
    return this.MoveTo(cx, cy).moveTo(-width / 2, -height / 2).lineTo(width, height).moveTo(0, -height).lineTo(-width, height);
  }

  /** Draws a circle of radius `r` centered at `(cx, cy)`, as two arcs. Its commands land in the inherited `PathElement` buffer, which this class's `join()` now also flushes (see the class doc comment). */
  circle(cx: number, cy: number, r: number): this {
    return this.MoveTo(cx, cy).moveTo(-r, 0).arc(r / 2, r / 2, 0, 1, 1, r, 0).arc(r / 2, r / 2, 0, 1, 1, -r, 0);
  }
}

// See `Element.is()`'s doc comment in `element.ts`.
registerElementModule("util.svg.element.path.symbol", PathSymbolElement);
