// Port of juijs-graph's `src/grid/radar.js` ("chart.grid.radar", extend: "chart.grid.core").
//
// Extend chain: `RadarGrid extends CoreGrid` (`grid/core.ts`) directly - confirmed via the
// original's own `extend: "chart.grid.core"` field (see PORT_STATUS.md's Phase C dependency map).
// No existing jui-chart-vue reference (jui-chart-vue never built a radar/polar chart type) - full
// independent port/verification, per this task's own assignment.
//
// **Real Phase A dependency**: `util/math.ts`'s `rotate(x, y, radian)` - used throughout to walk
// each domain "spoke" around the circle by `2*PI/count` radians per step, and inside the returned
// per-value `scale()` closure to rotate a value's projected point into place.
//
// Unlike `CoreGrid`'s other direct subclasses (`grid/date.ts`, `grid/grid3d.ts`), `RadarGrid`
// never calls `this.drawGrid()`/`this.top`/`.bottom`/`.left`/`.right`/`.center` at all - `draw()`
// builds its own root/domain-line/split-line SVG tree directly and returns `{root, scale}`
// itself, completely bypassing `CoreGrid`'s `orient`-dispatch mixin machinery (`drawPattern`/
// `drawBaseLine`/`createGridX`/etc, from the not-yet-ported `grid/draw2d.ts`/`grid/draw3d.ts`, are
// never referenced here) - so this file has zero dependency on that unported mixin, unlike
// `grid/date.ts`.
//
// **`GridChart` extension**: `radar.js` calls two `chart`-level members `grid/core.ts`'s own
// `GridChart` type doesn't declare (because `grid/core.js`/`base/axis.js` never call them
// themselves) - `chart.padding(key)` (real `Builder` surface: `src/base/builder.ts` already has
// `padding(key?: string): any`) and `chart.text(attr, text)` (`Builder.text(attr,
// textOrCallback)`). Extended locally via `RadarGridChart = GridChart & {...}` (the same
// `declare chart: <narrower type>` pattern `grid/core.ts` itself already established for `Axis`/
// `GridChart` over `Draw`'s looser field types) rather than widening the shared `GridChart` type
// itself - kept out of `grid/core.ts`'s blast radius per this round's "don't touch other grid
// files" instruction (and `grid/core.ts` is already-shipped Phase C work besides).

import { CoreGrid } from "./core";
import type { GridChart } from "./core";
import { rotate } from "../util/math";
import type { TransElement } from "../util/svg/element.transform";
import type { PathElement } from "../util/svg/element.path";

// ---- inlined `util/base.js` typeCheck (same per-file convention as every other Phase A/B/C file
// in this port - no shared helper module exists) --------------------------------------------------
type TypeCheckable = unknown;

function typeCheck(type: string, value: TypeCheckable): boolean {
  if (type === "string") return typeof value === "string";
  if (type === "function") return typeof value === "function";
  return false;
}

/** This file's own minimal extra slice of `Builder`'s real surface, beyond `GridChart` - see
 * header comment. */
type RadarGridChart = GridChart & {
  padding(key?: string): number;
  text(attr: Record<string, unknown>, text?: string): TransElement;
};

/** One domain spoke's base line endpoints, captured per-`draw()`-call and handed to `scale()`
 * (only ever `position[0]`, the first domain spoke - see `draw()`'s two `return` statements,
 * both `scale: scale(position[0])`, ported verbatim). */
interface RadarSpoke {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** The grid's rendered per-value coordinate resolver, returned as `render()`'s `.scale` (the
 * `GridRenderedScale` a brush layer would call to plot a `(seriesIndex, value)` pair onto the
 * radar). */
type RadarScale = (index: number, value: number) => { x: number; y: number };

/** `grid/radar.js`'s own accepted config shape (`RadarGrid.setup()`'s 8 fields). */
export interface RadarGridConfig {
  domain?: string | ((this: unknown, chart: unknown, grid: unknown) => unknown[]) | unknown[] | null;
  reverse?: boolean;
  max?: number;
  step?: number;
  line?: boolean;
  hideText?: boolean;
  extra?: boolean;
  shape?: "radial" | "circle";
  hide?: boolean;
  [key: string]: unknown;
}

/**
 * Port of `chart.grid.radar`'s `RadarGrid` constructor function as a real ES class (Phase 0 rule
 * 2). No explicit constructor - zero parameters, same as `CoreGrid` itself.
 */
export class RadarGrid extends CoreGrid {
  declare chart: RadarGridChart;
  declare grid: RadarGridConfig;

  /** Resolved axis-label domain (one entry per radar "spoke") - populated by `drawBefore()`. */
  domain: unknown[] = [];

  /** Each spoke's base-line endpoints, captured by `draw()` for `scale()` to close over -
   * `position[0]` specifically is what `render()`'s returned `.scale` ends up resolving through
   * (ported verbatim: the original closes over the SAME module-scope `position` array from both
   * the constructor-level `var position = []` and `draw()`'s reassignment of it). */
  private position: RadarSpoke[] = [];

  /** `drawCircle(root, centerX, centerY, x, y, count)` - draws one "circle"-shape split-line
   * ring. `count` is accepted (matching the original's signature 1:1) but never actually used in
   * its body, exactly like the original. */
  private drawCircle(root: TransElement, centerX: number, centerY: number, _x: number, y: number, _count: number): void {
    const r = Math.abs(y);
    const cx = centerX;
    const cy = centerY;

    root.append(
      this.chart.svg.circle({
        cx,
        cy,
        r,
        "fill-opacity": 0,
        stroke: this.color("gridBorderColor"),
        "stroke-width": this.chart.theme("gridBorderWidth"),
      }),
    );
  }

  /** `drawRadial(root, centerX, centerY, x, y, count, unit)` - draws one "radial"-shape (the
   * default `grid.shape`) split-line polygon by walking `count` spokes around the circle. */
  private drawRadial(root: TransElement, centerX: number, centerY: number, x: number, y: number, count: number, unit: number): void {
    const g = this.chart.svg.group();
    const points: [number, number][] = [];

    points.push([centerX + x, centerY + y]);

    let startX = x;
    let startY = y;

    for (let i = 0; i < count; i++) {
      const obj = rotate(startX, startY, unit);

      startX = obj.x;
      startY = obj.y;

      points.push([centerX + obj.x, centerY + obj.y]);
    }

    const path: PathElement = this.chart.svg.path({
      fill: "none",
      stroke: this.color("gridBorderColor"),
      "stroke-width": this.chart.theme("gridBorderWidth"),
    });

    for (let i = 0; i < points.length; i++) {
      const point = points[i];

      if (i === 0) {
        path.MoveTo(point[0], point[1]);
      } else {
        path.LineTo(point[0], point[1]);
      }
    }

    path.LineTo(points[0][0], points[0][1]);
    // path.ClosePath(); - commented out in the original too, preserved as-is.

    g.append(path);
    root.append(g);
  }

  /** `scale(obj)` - returns the per-`(index, value)` coordinate resolver closure, closing over
   * `obj` (a `RadarSpoke`, always `position[0]` - see `draw()`), `this.grid.max`, and
   * `this.chart.padding('left'/'top')`. */
  private createScale(obj: RadarSpoke): RadarScale {
    const max = this.grid.max as number;

    const dx = this.chart.padding("left");
    const dy = this.chart.padding("top");

    return (index: number, value: number): { x: number; y: number } => {
      const rate = value / max;

      const height = Math.abs(obj.y1) - Math.abs(obj.y2);
      const pos = height * rate;
      const unit = (2 * Math.PI) / this.domain.length;

      const cx = obj.x1;
      const cy = obj.y1;
      const y = -pos;
      const x = 0;

      const o = rotate(x, y, unit * index);

      return {
        x: dx + cx + o.x,
        y: dy + cy + o.y,
      };
    };
  }

  /**
   * @method initDomain
   * Resolves the radar's per-spoke label domain from `grid.domain` (a data-field name string, a
   * `(chart, grid) => value[]` function, or a literal array).
   *
   * **Preserved bug, Node-cross-checked (not obvious from a single read)**: `grid.reverse: true`
   * has NO NET EFFECT for the STRING-domain branch specifically, unlike the function/array
   * branches. The string branch, when `reverse` is set, already walks `data` BACKWARDS (`start =
   * data.length-1, end = 0, step = -1`) to build `domain` - but the shared tail
   * (`if (this.grid.reverse) domain.reverse();`, applied unconditionally after ALL three
   * branches) then reverses that already-backwards-built array AGAIN, landing back at forward
   * order. Node-verified: 3 rows with field values `"a","b","c"`, `reverse: true` -> the walk
   * alone produces `["c","b","a"]`, but the final unconditional reverse flips it back to
   * `["a","b","c"]` - IDENTICAL to what `reverse: false` would have produced. The function/array
   * branches have no such backwards walk, so `reverse: true` DOES visibly reverse their result -
   * only the string-domain branch's `reverse` option is silently a no-op. Preserved exactly, not
   * fixed, per Phase 0 rule 6 - tested in `radar.spec.ts`.
   */
  initDomain(): unknown[] {
    let domain: unknown[] = [];

    if (typeCheck("string", this.grid.domain)) {
      const field = this.grid.domain as string;
      const data = this.data() as Record<string, unknown>[];

      let start: number;
      let end: number;
      let step: number;

      if (this.grid.reverse) {
        start = data.length - 1;
        end = 0;
        step = -1;
      } else {
        start = 0;
        end = data.length - 1;
        step = 1;
      }

      for (let i = start; this.grid.reverse ? i >= end : i <= end; i += step) {
        domain.push(data[i][field]);
      }
    } else if (typeCheck("function", this.grid.domain)) {
      // block 은 배열을 통째로 리턴함 (a block grid returns the whole array at once)
      const domainFn = this.grid.domain as (this: unknown, chart: unknown, grid: unknown) => unknown[];
      domain = domainFn(this.chart, this.grid);
    } else {
      domain = this.grid.domain as unknown[];
    }

    if (this.grid.reverse) {
      domain.reverse();
    }

    return domain;
  }

  /** `Draw.render()` lifecycle hook: resolves this grid's per-spoke label `domain` via
   * `initDomain()`, ahead of `draw()`'s own layout pass. */
  drawBefore = (): void => {
    this.domain = this.initDomain();
  };

  /**
   * @method draw
   * Builds the radar's domain-spoke lines/labels and (when `grid.line` is set, the default)
   * concentric split-line rings/polygons - entirely its own SVG tree, never delegating to
   * `CoreGrid.drawGrid()`/`drawTop`/etc (see header comment).
   */
  draw = (): { root: TransElement; scale: RadarScale } => {
    const width = this.axis.area("width");
    const height = this.axis.area("height");
    let min = width;

    if (height < min) {
      min = height;
    }

    // center
    const w = min / 2;
    const centerX = this.axis.area("x") + width / 2;
    const centerY = this.axis.area("y") + height / 2;

    let startY = -w;
    let startX = 0;
    const count = this.domain.length;
    const step = this.grid.step as number;
    const unit = (2 * Math.PI) / count;
    const h = Math.abs(startY) / step;

    const g = this.chart.svg.group();
    const root = this.chart.svg.group();

    g.append(root);

    // domain line
    this.position = [];

    for (let i = 0; i < count; i++) {
      const x2 = centerX + startX;
      const y2 = centerY + startY;

      root.append(
        this.chart.svg.line({
          x1: centerX,
          y1: centerY,
          x2,
          y2,
          stroke: this.color("gridAxisBorderColor"),
          "stroke-width": this.chart.theme("gridBorderWidth"),
        }),
      );

      this.position[i] = { x1: centerX, y1: centerY, x2, y2 };

      let ty = y2;
      let tx = x2;
      let talign = "middle";

      if (y2 > centerY) {
        ty = y2 + 20;
      } else if (y2 < centerY) {
        ty = y2 - 10;
      }

      if (x2 > centerX) {
        talign = "start";
        tx += 10;
      } else if (x2 < centerX) {
        talign = "end";
        tx -= 10;
      }

      if (!this.grid.hideText) {
        root.append(
          this.chart.text(
            {
              x: tx,
              y: ty,
              "text-anchor": talign,
              "font-size": this.chart.theme("gridCFontSize"),
              "font-weight": this.chart.theme("gridCFontWeight"),
              fill: this.chart.theme("gridCFontColor"),
            },
            this.domain[i] as string,
          ),
        );
      }

      const obj = rotate(startX, startY, unit);

      startX = obj.x;
      startY = obj.y;
    }

    if (!this.grid.line) {
      return {
        root,
        scale: this.createScale(this.position[0]),
      };
    }

    // area split line
    startY = -w;
    let stepBase = 0;
    const stepValue = (this.grid.max as number) / step;

    for (let i = 0; i < step; i++) {
      if (i === 0 && this.grid.extra) {
        startY += h;
        continue;
      }

      if (this.grid.shape === "circle") {
        this.drawCircle(root, centerX, centerY, 0, startY, count);
      } else {
        this.drawRadial(root, centerX, centerY, 0, startY, count, unit);
      }

      if (!this.grid.hideText) {
        root.append(
          this.chart.text(
            {
              x: centerX,
              y: centerY + (startY + h - 5),
              "font-size": this.chart.theme("gridCFontSize"),
              "font-weight": this.chart.theme("gridCFontWeight"),
              fill: this.chart.theme("gridCFontColor"),
            },
            ((this.grid.max as number) - stepBase) + "",
          ),
        );
      }

      startY += h;
      stepBase += stepValue;
    }

    // hide
    if (this.grid.hide) {
      root.attr({ display: "none" });
    }

    return {
      root,
      scale: this.createScale(this.position[0]),
    };
  };

  static setup(): Record<string, unknown> {
    return {
      /** @cfg {String/Array/Function} [domain=null] Sets the value displayed on an axis.*/
      domain: null,
      /** @cfg {Boolean} [reverse=false] Reverses the value on domain values*/
      reverse: false,
      /** @cfg {Number} [max=null] Sets the maximum value of a grid. */
      max: 100,
      /** @cfg {Array} [step=10] Sets the interval of the scale displayed on a grid. */
      step: 10,
      /** @cfg {Boolean} [line=true] Determines whether to display a line on the axis background. */
      line: true,
      /** @cfg {Boolean} [hideText=false] Determines whether to show text across the grid. */
      hideText: false,
      /** @cfg {Boolean} [extra=false] Leaves a certain spacing distance from the grid start point
       * and displays a line where the spacing ends. */
      extra: false,
      /** @cfg {"radial"/"circle"} [shape="radial"] Determines the shape of a grid (radial, circle). */
      shape: "radial", // or circle
    };
  }
}
