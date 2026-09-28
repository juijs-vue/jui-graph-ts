// Port of juijs-graph's `src/util/canvas/base.js` ("util.canvas.base").
//
// A grab-bag of `CanvasRenderingContext2D` drawing helpers (lines, dashed lines, rounded rects,
// freeform quads, symbols, a Catmull-Rom-style curve renderer). Not an `extend` chain
// (`extend: null`) - ported per Phase 0 rule 2 as a plain class wrapping a `context` (there's no
// subclassing to preserve, but every method genuinely needs shared `context` state, so a class
// - not a bag of free functions - matches the original's own single-constructor shape).
//
// Cross-checked against jui-chart-vue's `src/composables/canvasPrimitives.ts`: jui-chart-vue
// deliberately wrote its OWN small, purpose-built set of primitives there rather than porting
// this file (its own comments describe it as a minimal helper module, not a port) - so this is
// the first real 1:1 port of `util/canvas/base.js`. The two files share only the general idea of
// "canvas drawing helpers"; none of `canvasPrimitives.ts`'s individual functions are 1:1 named or
// shaped like this file's methods (e.g. it has no `drawBullet`/`drawPage`/Catmull-Rom curve
// renderer at all, and its line/rect helpers take a differently-ordered, options-object style of
// parameters) - nothing to reuse test values from; verified independently by hand-tracing each
// method's `context` calls against the original source instead.

/** An `[x, y]` coordinate pair, as consumed by `drawCurve()`/`getCurvePoints()`. */
export type CurvePoint = readonly [number, number];

/** A wrapper around a `CanvasRenderingContext2D`, providing chart-specific 2D drawing primitives. */
export class CanvasBase {
  private context: CanvasRenderingContext2D;

  constructor(context: CanvasRenderingContext2D) {
    this.context = context;
  }

  /** Clears the entire canvas (`0,0` to the canvas's own `width`/`height`). */
  clearContext(): void {
    const context = this.context;
    context.clearRect(0, 0, context.canvas.width, context.canvas.height);
  }

  /** Draws a straight solid line from `(x1,y1)` to `(x2,y2)`. `color` defaults to `#434d6b`. */
  drawLine(x1: number, y1: number, x2: number, y2: number, color?: string, lineWidth = 1): void {
    color = color || "#434d6b";
    const context = this.context;
    context.beginPath();
    context.moveTo(x1, y1);
    context.lineTo(x2, y2);
    context.lineWidth = lineWidth;
    context.strokeStyle = color;
    context.stroke();
  }

  /**
   * Draws a smooth Catmull-Rom-style spline through `points` (see `getCurvePoints()`, which does
   * the actual math), clamping every interpolated `y` into `[minY, maxY]`.
   */
  drawCurve(points: CurvePoint[], minY: number, maxY: number, tension = 0.5, isClosed = false, numOfSegments = 16): void {
    const context = this.context;
    context.beginPath();

    const pts = points.reduce<number[]>((prev, e) => {
      prev.push(e[0], e[1]);
      return prev;
    }, []);

    const ptsa = this.getCurvePoints(pts, minY, maxY, tension, isClosed, numOfSegments);

    context.moveTo(ptsa[0], ptsa[1]);
    for (let i = 2; i < ptsa.length - 1; i += 2) context.lineTo(ptsa[i], ptsa[i + 1]);
  }

  /**
   * Draws a dashed line from `(x1,y1)` to `(x2,y2)` using `dash` as the `setLineDash()` pattern
   * (default `[3, 3]`), restoring the context's previous dash pattern afterwards. `color`
   * defaults to `#434d6b`.
   */
  drawDashedLine(x1: number, y1: number, x2: number, y2: number, color?: string, dash: number[] = [3, 3], lineWidth = 1): void {
    color = color || "#434d6b";
    const context = this.context;
    context.beginPath();
    context.moveTo(x1, y1);
    context.lineTo(x2, y2);
    context.lineWidth = lineWidth;
    context.strokeStyle = color;
    const originDash = context.getLineDash();
    context.setLineDash(dash);
    context.stroke();
    context.setLineDash(originDash);
  }

  /** Draws a connected polyline through each point in `pos`, in order. `color` defaults to `#434d6b`. */
  drawLines(color: string | undefined, ...pos: CurvePoint[]): void {
    color = color || "#434d6b";
    const context = this.context;
    context.beginPath();
    context.moveTo(pos[0][0], pos[0][1]);
    pos.slice(1).map((e) => context.lineTo(e[0], e[1]));
    context.lineWidth = 1;
    context.strokeStyle = color;
    context.stroke();
  }

  /**
   * Traces (but does not fill/stroke) a rounded-rectangle path with a single `radius` shared by
   * all four corners, from `(x,y)` sized `width` x `height`. Callers apply their own
   * `fillStyle`/`strokeStyle` and call `fill()`/`stroke()` afterwards.
   */
  drawRoundRect(x: number, y: number, width: number, height: number, radius: number): void {
    const context = this.context;
    context.beginPath();
    context.moveTo(x, y + radius);

    // left line
    context.lineTo(x, y + height - radius);
    context.arcTo(x, y + height, x + radius, y + height, radius);

    // bottom line
    context.lineTo(x + width - radius, y + height);
    context.arcTo(x + width, y + height, x + width, y + height - radius, radius);

    // right line
    context.lineTo(x + width, y + radius);
    context.arcTo(x + width, y, x + width - radius, y, radius);

    // top line
    context.lineTo(x + radius, y);
    context.arcTo(x, y, x, y + radius, radius);

    context.closePath();
  }

  /**
   * Fills (and, when `borderColor` is given, also strokes) an arbitrary quadrilateral through
   * the four `(x,y)` corner pairs, in order. `color` defaults to `#ffffff`.
   */
  drawFreeRect(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    x3: number,
    y3: number,
    x4: number,
    y4: number,
    color?: string,
    borderColor: string | null = null
  ): void {
    color = color || "#ffffff";
    const context = this.context;
    context.beginPath();
    context.moveTo(x1, y1);
    context.lineTo(x2, y2);
    context.lineTo(x3, y3);
    context.lineTo(x4, y4);
    context.closePath();
    context.fillStyle = color;
    if (borderColor != null) {
      context.lineWidth = 2;
      context.strokeStyle = borderColor;
      context.stroke();
    }
    context.fill();
  }

  /**
   * Like `drawFreeRect()` but stroke-only (no fill): outlines an arbitrary quadrilateral through
   * the four `(x,y)` corner pairs, in order. `color` defaults to `#ffffff`.
   */
  drawFreeRectStroke(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, x4: number, y4: number, color?: string): void {
    color = color || "#ffffff";
    const context = this.context;
    context.beginPath();
    context.moveTo(x1, y1);
    context.lineTo(x2, y2);
    context.lineTo(x3, y3);
    context.lineTo(x4, y4);
    context.lineWidth = 1;
    context.strokeStyle = color;
    context.stroke();
  }

  /**
   * Fills an upward-pointing triangle centered on `(x1,y1)`: apex at `y1-d`, base corners at
   * `y1+d` spanning `x1-d` to `x1+d`. `color` defaults to `#ffffff`.
   */
  drawTriangle(x1: number, y1: number, d: number, color?: string): void {
    color = color || "#ffffff";
    const context = this.context;
    context.beginPath();
    context.moveTo(x1, y1 - d);
    context.lineTo(x1 - d, y1 + d);
    context.lineTo(x1 + d, y1 + d);
    context.closePath();
    context.fillStyle = color;
    context.fill();
  }

  /** Fills a `2d`-by-`2d` square centered on `(x1,y1)`. `color` defaults to `#ffffff`. */
  drawSquare(x1: number, y1: number, d: number, color?: string): void {
    color = color || "#ffffff";
    const context = this.context;
    context.beginPath();
    context.moveTo(x1 - d, y1 - d);
    context.lineTo(x1 - d, y1 + d);
    context.lineTo(x1 + d, y1 + d);
    context.lineTo(x1 + d, y1 - d);
    context.closePath();
    context.fillStyle = color;
    context.fill();
  }

  /**
   * **Preserved bug**: calls a bare `drawFreeRect(...)` identifier - NOT `this.drawFreeRect(...)`
   * - which was never declared as a local variable anywhere in the original file (only ever
   * assigned as `this.drawFreeRect`). Every real invocation of `drawPage()` therefore throws
   * `ReferenceError: drawFreeRect is not defined` before it draws anything - confirmed by literal
   * transcription, not merely inferred from reading the code once (even setting that aside, the
   * call also passes an extra leading `context` argument `drawFreeRect`'s real 10-parameter
   * signature doesn't have, so it would be mis-shifted even if the reference did resolve).
   * Reading a truly undeclared identifier throws on read in BOTH strict and sloppy mode - a
   * different, still-valid category from `math.ts`'s `niceNum()` and `element.ts`'s `is()`, both
   * of which were previously mis-diagnosed as this kind of bug and have since been corrected (see
   * each file's own header comment) - reproduced here as a literal throw rather than silently
   * wired up to call `this.drawFreeRect(...)` correctly.
   */
  drawPage(_value: number, _x1: number, _y1: number, _color?: string, _border = false): void {
    throw new ReferenceError("drawFreeRect is not defined");
  }

  /** Fills a full circle centered on `(x,y)` with radius `d` (default `1`). `color` defaults to `white`. */
  drawCircle(x: number, y: number, d?: number, color?: string): void {
    color = color || "white";
    d = d || 1;
    const context = this.context;
    context.beginPath();
    context.arc(x, y, d, 0, 2 * Math.PI);
    context.fillStyle = color;
    context.fill();
  }

  /**
   * Draws a "bullet" shape: a small solid circle at `(x,y)` fading, via a linear gradient from
   * opaque `#1074fc` to transparent, into a flat-ended tail `width` pixels long extending to the
   * right. Used for directional indicator/pointer marks.
   */
  drawBullet(x: number, y: number, width = 74): void {
    const context = this.context;
    const grd = context.createLinearGradient(x, y, x + width, y);
    grd.addColorStop(0, "#1074fc");
    grd.addColorStop(1, "rgba(37, 172, 254, 0)");

    context.beginPath();
    context.arc(x, y, 2, Math.PI / 2, (Math.PI / 2) * 3);
    context.lineTo(x + width, y - 2);
    context.lineTo(x + width, y + 2);
    context.closePath();
    context.fillStyle = grd;
    context.fill();
    context.fillStyle = grd;
  }

  /**
   * Catmull-Rom-style spline interpolation over a flat `[x0,y0,x1,y1,...]` point list, clamping
   * every interpolated `y` into `[minY, maxY]`. Used internally by `drawCurve()`; also exposed
   * publicly (matching the original, which attaches it as a public `this.getCurvePoints`
   * alongside the other draw methods despite being a pure geometry helper with no `context` use
   * of its own).
   */
  getCurvePoints(pts: number[], minY: number, maxY: number, tension = 0.5, isClosed = false, numOfSegments = 16): number[] {
    let _pts: number[];
    const res: number[] = [];
    let x: number, y: number;
    let t1x: number, t2x: number, t1y: number, t2y: number;
    let c1: number, c2: number, c3: number, c4: number;
    let st: number, t: number, i: number;

    // clone array so we don't change the original
    _pts = pts.slice(0);

    // The algorithm requires a previous and next point to the actual point array.
    // Check if we will draw closed or open curve.
    // If closed, copy end points to beginning and first points to end
    // If open, duplicate first points to beginning, end points to end
    if (isClosed) {
      _pts.unshift(pts[pts.length - 1]);
      _pts.unshift(pts[pts.length - 2]);
      _pts.unshift(pts[pts.length - 1]);
      _pts.unshift(pts[pts.length - 2]);
      _pts.push(pts[0]);
      _pts.push(pts[1]);
    } else {
      _pts.unshift(pts[1]); // copy 1st point and insert at beginning
      _pts.unshift(pts[0]);
      _pts.push(pts[pts.length - 2]); // copy last point and append
      _pts.push(pts[pts.length - 1]);
    }

    // 1. loop goes through point array
    // 2. loop goes through each segment between the 2 pts + 1 point before and after
    for (i = 2; i < _pts.length - 4; i += 2) {
      for (t = 0; t <= numOfSegments; t++) {
        // calc tension vectors
        t1x = (_pts[i + 2] - _pts[i - 2]) * tension;
        t2x = (_pts[i + 4] - _pts[i]) * tension;

        t1y = (_pts[i + 3] - _pts[i - 1]) * tension;
        t2y = (_pts[i + 5] - _pts[i + 1]) * tension;

        // calc step
        st = t / numOfSegments;

        // calc cardinals
        c1 = 2 * Math.pow(st, 3) - 3 * Math.pow(st, 2) + 1;
        c2 = -(2 * Math.pow(st, 3)) + 3 * Math.pow(st, 2);
        c3 = Math.pow(st, 3) - 2 * Math.pow(st, 2) + st;
        c4 = Math.pow(st, 3) - Math.pow(st, 2);

        // calc x and y coords with common control vectors
        x = c1 * _pts[i] + c2 * _pts[i + 2] + c3 * t1x + c4 * t2x;
        y = c1 * _pts[i + 1] + c2 * _pts[i + 3] + c3 * t1y + c4 * t2y;

        // store points in array
        res.push(x);
        if (y > maxY) res.push(maxY);
        else if (y < minY) res.push(minY);
        else res.push(y);
      }
    }

    return res;
  }
}
