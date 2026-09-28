// Port of juijs-graph's `src/util/svg/base3d.js` ("util.svg.base3d").
// Extends `base.ts`'s `SVGBase` with two composite "pseudo-3D" shape builders (`rect3d`/
// `cylinder3d`) built entirely out of the plain 2D tag methods it inherits.
//
// No jui-chart-vue reference exists for this file (jui-chart-vue uses Vue SFC templates instead
// of this imperative builder tree entirely) - full independent port, per the task assignment.

import { radian } from "../math";
import { lighten, darken } from "../color";
import { TransElement } from "./element.transform";
import { SVGBase } from "./base";

/** Inlined `util/base.js` `createId()` helper - see `element.path.ts`'s copy for the same note. */
function createId(key?: string): string {
  return [key || "id", +new Date(), Math.round(Math.random() * 100) % 100].join("-");
}

/** Adds composite "pseudo-3D" shape builders (`rect3d`/`cylinder3d`) on top of `SVGBase`'s plain 2D tags. */
export class SVG3d extends SVGBase {
  /**
   * Draws a 2.5D "extruded rectangle" (three shaded faces: top, front, side) as a `<g>` of
   * three paths. Relies on `this.group()`'s `callback` actually being invoked - only true when
   * `this` is (transitively) an instance whose `create()` override runs the callback
   * synchronously, i.e. a real `SVG` instance (see `svg.ts`) rather than a bare `SVGBase`/
   * `SVG3d` (whose own `create()` ignores `callback` entirely) - exactly matching the original,
   * where this only ever worked in practice because callers always went through the full `SVG`
   * class.
   */
  rect3d(fill: string, width: number, height: number, degree: number, depth: number): TransElement {
    const self = this;

    const rad = radian(degree);
    const x1 = 0;
    const y1 = 0;
    const w1 = width;
    const h1 = height;

    const x2 = Math.cos(rad) * depth;
    const y2 = Math.sin(rad) * depth;
    const w2 = width + x2;
    const h2 = height + y2;

    const g = self.group({}, function () {
      self
        .path({
          fill: lighten(fill, 0.15),
          stroke: lighten(fill, 0.15),
        })
        .MoveTo(x2, x1)
        .LineTo(w2, y1)
        .LineTo(w1, y2)
        .LineTo(x1, y2);

      self
        .path({
          fill: fill,
          stroke: fill,
        })
        .MoveTo(x1, y2)
        .LineTo(x1, h2)
        .LineTo(w1, h2)
        .LineTo(w1, y2);

      self
        .path({
          fill: darken(fill, 0.2),
          stroke: darken(fill, 0.2),
        })
        .MoveTo(w1, h2)
        .LineTo(w2, h1)
        .LineTo(w2, y1)
        .LineTo(w1, y2);
    });

    return g;
  }

  /**
   * Draws a 2.5D cylinder (bottom ellipse, a gradient-filled body path, top ellipse) as a `<g>`.
   * `rate` (0-1) controls how "open" the top ellipse looks (elliptical squash); `rate === 0` is
   * special-cased to `0.01` rather than `0` outright (an exact `0` radius apparently produces a
   * degenerate/invisible ellipse the original author wanted to avoid) - `rate === undefined`
   * defaults to `1`.
   */
  cylinder3d(fill: string, width: number, height: number, degree: number, depth: number, rate?: number): TransElement {
    const self = this;

    const rad = radian(degree);
    rate = rate === undefined ? 1 : rate === 0 ? 0.01 : rate;
    const r = width / 2;
    const tr = r * rate;
    const l = (Math.cos(rad) * depth) / 2;
    const d = (Math.sin(rad) * depth) / 2;
    const key = createId("cylinder3d");

    const g = self.group({}, function () {
      self
        .ellipse({
          fill: darken(fill, 0.05),
          "fill-opacity": 0.85,
          stroke: darken(fill, 0.05),
          rx: r,
          ry: d,
          cx: r,
          cy: height,
        })
        .translate(l, d);

      self
        .path({
          fill: "url(#" + key + ")",
          "fill-opacity": 0.85,
          stroke: fill,
        })
        .MoveTo(r - tr, d)
        .LineTo(0, height)
        .Arc(r, d, 0, 0, 0, width, height)
        .LineTo(r + tr, d)
        .Arc(r + tr, d, 0, 0, 1, r - tr, d)
        .translate(l, d);

      self
        .ellipse({
          fill: lighten(fill, 0.2),
          "fill-opacity": 0.95,
          stroke: lighten(fill, 0.2),
          rx: r * rate,
          ry: d * rate,
          cx: r,
          cy: d,
        })
        .translate(l, d);

      self.linearGradient(
        {
          id: key,
          x1: "100%",
          x2: "0%",
          y1: "0%",
          y2: "0%",
        },
        function () {
          self.stop({
            offset: "0%",
            "stop-color": lighten(fill, 0.15),
          });
          self.stop({
            offset: "33.333333333333336%",
            "stop-color": darken(fill, 0.2),
          });
          self.stop({
            offset: "66.66666666666667%",
            "stop-color": darken(fill, 0.2),
          });
          self.stop({
            offset: "100%",
            "stop-color": lighten(fill, 0.15),
          });
        }
      );
    });

    return g;
  }
}
