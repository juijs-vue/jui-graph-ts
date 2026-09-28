// Port of juijs-graph's `src/util/svg/element.path.js` ("util.svg.element.path").
// Extends `element.transform.ts`'s `TransElement` with an SVG `<path d="...">` command builder.

import { TransElement } from "./element.transform";
import { registerElementModule } from "./element";

/**
 * Inlined from `util/base.js`'s `createId()` (the registry singleton this project doesn't port -
 * Phase 0 rule 4), same treatment `dom.ts` already gave its own small `util.base` helper needs.
 */
function createId(key?: string): string {
  return [key || "id", +new Date(), Math.round(Math.random() * 100) % 100].join("-");
}

/**
 * A `TransElement` (`<path>`) with a fluent SVG path-data command builder: each `xTo`/`XTo` pair
 * accumulates one relative (lowercase-command) or absolute (uppercase-command, via the
 * capitalized method) path segment into an internal buffer, which `join()` flushes into the `d`
 * attribute. Every lowercase method also accepts an optional trailing `type` to override which
 * command letter is emitted (used internally by the capitalized wrappers).
 */
export class PathElement extends TransElement {
  private orders: string[] = [];

  /** Appends a moveto command: `m` (relative) by default, or `type` if given. */
  moveTo(x: number | string, y: number | string, type?: string): this {
    this.orders.push((type || "m") + x + "," + y);
    return this;
  }
  /** Appends an absolute (`M`) moveto command. */
  MoveTo(x: number | string, y: number | string): this {
    return this.moveTo(x, y, "M");
  }

  /** Appends a lineto command: `l` (relative) by default, or `type` if given. */
  lineTo(x: number | string, y: number | string, type?: string): this {
    this.orders.push((type || "l") + x + "," + y);
    return this;
  }
  /** Appends an absolute (`L`) lineto command. */
  LineTo(x: number | string, y: number | string): this {
    return this.lineTo(x, y, "L");
  }

  /** Appends a horizontal lineto command: `h` (relative) by default, or `type` if given. */
  hLineTo(x: number | string, type?: string): this {
    this.orders.push((type || "h") + x);
    return this;
  }
  /** Appends an absolute (`H`) horizontal lineto command. */
  HLineTo(x: number | string): this {
    return this.hLineTo(x, "H");
  }

  /** Appends a vertical lineto command: `v` (relative) by default, or `type` if given. */
  vLineTo(y: number | string, type?: string): this {
    this.orders.push((type || "v") + y);
    return this;
  }
  /** Appends an absolute (`V`) vertical lineto command. */
  VLineTo(y: number | string): this {
    return this.vLineTo(y, "V");
  }

  /** Appends a cubic Bezier curveto command: `c` (relative) by default, or `type` if given. */
  curveTo(x1: number | string, y1: number | string, x2: number | string, y2: number | string, x: number | string, y: number | string, type?: string): this {
    this.orders.push((type || "c") + x1 + "," + y1 + " " + x2 + "," + y2 + " " + x + "," + y);
    return this;
  }
  /** Appends an absolute (`C`) cubic Bezier curveto command. */
  CurveTo(x1: number | string, y1: number | string, x2: number | string, y2: number | string, x: number | string, y: number | string): this {
    return this.curveTo(x1, y1, x2, y2, x, y, "C");
  }

  /** Appends a smooth cubic Bezier curveto command: `s` (relative) by default, or `type` if given. */
  sCurveTo(x2: number | string, y2: number | string, x: number | string, y: number | string, type?: string): this {
    this.orders.push((type || "s") + x2 + "," + y2 + " " + x + "," + y);
    return this;
  }
  /** Appends an absolute (`S`) smooth cubic Bezier curveto command. */
  SCurveTo(x2: number | string, y2: number | string, x: number | string, y: number | string): this {
    return this.sCurveTo(x2, y2, x, y, "S");
  }

  /** Appends a quadratic Bezier curveto command: `q` (relative) by default, or `type` if given. */
  qCurveTo(x1: number | string, y1: number | string, x: number | string, y: number | string, type?: string): this {
    this.orders.push((type || "q") + x1 + "," + y1 + " " + x + "," + y);
    return this;
  }
  /** Appends an absolute (`Q`) quadratic Bezier curveto command. */
  QCurveTo(x1: number | string, y1: number | string, x: number | string, y: number | string): this {
    return this.qCurveTo(x1, y1, x, y, "Q");
  }

  /** Appends a smooth quadratic Bezier curveto command: `t` (relative) by default, or `type` if given. */
  tCurveTo(x1: number | string, y1: number | string, x: number | string, y: number | string, type?: string): this {
    this.orders.push((type || "t") + x1 + "," + y1 + " " + x + "," + y);
    return this;
  }
  /** Appends an absolute (`T`) smooth quadratic Bezier curveto command. */
  TCurveTo(x1: number | string, y1: number | string, x: number | string, y: number | string): this {
    return this.tCurveTo(x1, y1, x, y, "T");
  }

  /**
   * Appends an elliptical arc command: `a` (relative) by default, or `type` if given.
   * `large_arc_flag`/`sweep_flag` are coerced to `1`/`0` via truthiness.
   */
  arc(
    rx: number | string,
    ry: number | string,
    x_axis_rotation: number | string,
    large_arc_flag: unknown,
    sweep_flag: unknown,
    x: number | string,
    y: number | string,
    type?: string
  ): this {
    const largeArcFlag = large_arc_flag ? 1 : 0;
    const sweepFlag = sweep_flag ? 1 : 0;

    this.orders.push((type || "a") + rx + "," + ry + " " + x_axis_rotation + " " + largeArcFlag + "," + sweepFlag + " " + x + "," + y);
    return this;
  }
  /** Appends an absolute (`A`) elliptical arc command. */
  Arc(
    rx: number | string,
    ry: number | string,
    x_axis_rotation: number | string,
    large_arc_flag: unknown,
    sweep_flag: unknown,
    x: number | string,
    y: number | string
  ): this {
    return this.arc(rx, ry, x_axis_rotation, large_arc_flag, sweep_flag, x, y, "A");
  }

  /** Appends a closepath command: `z` (relative) by default, or `type` if given. */
  closePath(type?: string): this {
    this.orders.push(type || "z");
    return this;
  }
  /** Appends an absolute (`Z`) closepath command (SVG treats `z`/`Z` identically, but kept for symmetry with the other pairs). */
  ClosePath(): this {
    return this.closePath("Z");
  }

  /** Flushes the accumulated path commands into the `d` attribute and clears the buffer. */
  join(): void {
    if (this.orders.length > 0) {
      this.attr({ d: this.orders.join(" ") });
      this.orders = [];
    }
  }

  /**
   * Computes the rendered path's total length via a throwaway, temporarily-DOM-attached
   * `<svg><path/></svg>`.
   *
   * **Preserved bug**: the wrapper is created with `document.createElement("svg")` - i.e.
   * plain HTML-namespace element creation, NOT `document.createElementNS(SVG_NS, "svg")` - so
   * it is not really a conforming `SVGSVGElement`. The inner `<path>` node itself IS created
   * correctly via `createElementNS`. Left exactly as-is (not "fixed" to use the namespaced
   * constructor) per Phase 0's preserve-bugs rule.
   *
   * Note: this method is effectively untestable under jsdom - jsdom does not implement
   * `SVGGeometryElement.getTotalLength()` (a real-renderer-only API), so any test exercising it
   * can only assert that it throws/behaves the way jsdom's stub does, not a real numeric length.
   */
  length(): number {
    const id = createId();
    const d = this.orders.join(" ");

    const svg = document.createElement("svg");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");

    path.setAttributeNS(null, "id", id);
    path.setAttributeNS(null, "d", d);
    svg.appendChild(path);

    document.body.appendChild(svg);
    const length = (document.getElementById(id) as unknown as SVGPathElement).getTotalLength();
    document.body.removeChild(svg);

    return length;
  }
}

// See `Element.is()`'s doc comment in `element.ts`.
registerElementModule("util.svg.element.path", PathElement);
