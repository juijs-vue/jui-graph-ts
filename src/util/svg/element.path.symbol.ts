// Port of juijs-graph's `src/util/svg/element.path.symbol.js` ("util.svg.element.path.symbol").
// Extends `element.path.ts`'s `PathElement` with small marker-symbol path helpers.

import { PathElement } from "./element.path";
import { registerElementModule } from "./element";

export interface SymbolTemplates {
  triangle: string;
  rect: string;
  rectangle: string;
  cross: string;
  circle: string;
}

/**
 * A `PathElement` specialized for drawing small marker symbols (triangle/rect/cross/circle) via
 * its own `add()`/`join()` pair rather than the inherited path-command buffer - see `join()`'s
 * doc comment for a real, preserved bug this split causes.
 */
export class PathSymbolElement extends PathElement {
  // A SEPARATE accumulator from `PathElement`'s own private `orders` array - see the `join()`
  // override doc comment below for why this matters.
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
   * Flushes `ordersString` (built only via `.add()`) into the `d` attribute.
   *
   * **Preserved bug, genuine and self-contained** (independent of any module-registry
   * mechanics - see `element.ts`'s header comment on what IS vs. is NOT carried over from the
   * original's inheritance quirks): this override completely shadows the inherited
   * `PathElement.join()`, which is the ONLY method that ever reads/clears `PathElement`'s own
   * private `orders` array. But `.triangle()`/`.rect()`/`.rectangle()`/`.cross()`/`.circle()`
   * below all build their path data by calling the INHERITED `MoveTo`/`moveTo`/`lineTo`/`arc`
   * (i.e. they push onto `PathElement`'s `orders`, not this class's `ordersString`). Net effect:
   * calling e.g. `.triangle(10, 10, 4, 4)` then `.join()` writes NOTHING to the `d` attribute -
   * the triangle's commands sit in the parent's `orders` array forever, unreachable, because the
   * only method that could flush them (`PathElement.join()`) is shadowed here. Only path data
   * added via this class's own `.add()` method (which appends directly to `ordersString`) ever
   * actually reaches the `d` attribute through this override. Verified structurally in
   * `element.path.symbol.spec.ts` (call `.triangle()` then `.join()`, assert `d` stays unset).
   */
  join(): void {
    if (this.ordersString.length > 0) {
      this.attr({ d: this.ordersString });
      this.ordersString = "";
    }
  }

  /** Appends one symbol instance (by raw template string, from `.template()`) at `(cx, cy)`. */
  add(cx: number, cy: number, tpl: string): void {
    this.ordersString += " M" + cx + "," + cy + tpl;
  }

  // The four methods below build path commands via the INHERITED PathElement command builder
  // (see the `join()` doc comment above for why that data is, in practice, never actually
  // flushed to the `d` attribute by this class's own `join()`).

  /** Draws a triangle centered at `(cx, cy)`. See the class doc comment: its commands land in the inherited `PathElement` buffer, which this class's `join()` never flushes. */
  triangle(cx: number, cy: number, width: number, height: number): this {
    return this.MoveTo(cx, cy).moveTo(0, -height / 2).lineTo(width / 2, height).lineTo(-width, 0).lineTo(width / 2, -height);
  }

  /** Draws a rectangle centered at `(cx, cy)`. See the class doc comment: its commands land in the inherited `PathElement` buffer, which this class's `join()` never flushes. */
  rect(cx: number, cy: number, width: number, height: number): this {
    return this.MoveTo(cx, cy).moveTo(-width / 2, -height / 2).lineTo(width, 0).lineTo(0, height).lineTo(-width, 0).lineTo(0, -height);
  }
  /** Alias for `rect()`. */
  rectangle(cx: number, cy: number, width: number, height: number): this {
    return this.rect(cx, cy, width, height);
  }

  /** Draws an X/cross centered at `(cx, cy)`. See the class doc comment: its commands land in the inherited `PathElement` buffer, which this class's `join()` never flushes. */
  cross(cx: number, cy: number, width: number, height: number): this {
    return this.MoveTo(cx, cy).moveTo(-width / 2, -height / 2).lineTo(width, height).moveTo(0, -height).lineTo(-width, height);
  }

  /** Draws a circle of radius `r` centered at `(cx, cy)`, as two arcs. See the class doc comment: its commands land in the inherited `PathElement` buffer, which this class's `join()` never flushes. */
  circle(cx: number, cy: number, r: number): this {
    return this.MoveTo(cx, cy).moveTo(-r, 0).arc(r / 2, r / 2, 0, 1, 1, r, 0).arc(r / 2, r / 2, 0, 1, 1, -r, 0);
  }
}

// See `Element.is()`'s doc comment in `element.ts`.
registerElementModule("util.svg.element.path.symbol", PathSymbolElement);
