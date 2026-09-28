// Port of juijs-graph's `src/util/svg/element.poly.js` ("util.svg.element.poly").
// Extends `element.transform.ts`'s `TransElement` with a `<polyline>`/`<polygon>` point-list builder.

import { TransElement } from "./element.transform";
import { registerElementModule } from "./element";

/** A `TransElement` (`<polyline>`/`<polygon>`) with a fluent point-list builder. */
export class PolyElement extends TransElement {
  private orders: string[] = [];

  /** Appends one `(x,y)` point to the pending points list. */
  point(x: number | string, y: number | string): this {
    this.orders.push(x + "," + y);
    return this;
  }

  /**
   * Flushes the accumulated points into the `points` attribute, closing the shape by repeating
   * the first point at the end ("Firefox 처리" / "Firefox handling" per the original comment -
   * a workaround for older Firefox `<polygon>`/`<polyline>` rendering quirks).
   */
  join(): void {
    if (this.orders.length > 0) {
      const start = this.orders[0];
      this.orders.push(start);

      this.attr({ points: this.orders.join(" ") });
      this.orders = [];
    }
  }
}

// See `Element.is()`'s doc comment in `element.ts`.
registerElementModule("util.svg.element.poly", PolyElement);
