// Port of juijs-graph's `src/util/svg/element.path.rect.js` ("util.svg.element.path.rect").
// Extends `element.path.ts`'s `PathElement` with a single rounded-rectangle path builder.

import { PathElement } from "./element.path";
import { registerElementModule } from "./element";

/** A `PathElement` specialized for building a single rounded-rectangle `<path>`. */
export class PathRectElement extends PathElement {
  /**
   * Builds (and immediately joins) a rounded-rect path, one corner radius per side
   * (`tl`/`tr`/`br`/`bl` = top-left/top-right/bottom-right/bottom-left). Falsy radii (including
   * `undefined`) are normalized to `0`.
   */
  round(width: number, height: number, tl?: number, tr?: number, br?: number, bl?: number): void {
    tl = !tl ? 0 : tl;
    tr = !tr ? 0 : tr;
    br = !br ? 0 : br;
    bl = !bl ? 0 : bl;

    this.MoveTo(0, tl)
      .Arc(tl, tl, 0, 0, 1, tl, 0)
      .HLineTo(width - tr)
      .Arc(tr, tr, 0, 0, 1, width, tr)
      .VLineTo(height - br)
      .Arc(br, br, 0, 0, 1, width - br, height)
      .HLineTo(bl)
      .Arc(bl, bl, 0, 0, 1, 0, height - bl)
      .ClosePath()
      .join();
  }
}

// See `Element.is()`'s doc comment in `element.ts`.
registerElementModule("util.svg.element.path.rect", PathRectElement);
