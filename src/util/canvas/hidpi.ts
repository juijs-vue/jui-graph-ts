// Port of juijs-graph's `src/util/canvas/hidpi.js` ("util.canvas.hidpi").
//
// A HiDPI (Retina) canvas polyfill: monkey-patches `CanvasRenderingContext2D.prototype`/
// `HTMLCanvasElement.prototype` methods to multiply coordinate arguments by the detected
// devicePixelRatio/backingStorePixelRatio ratio. Not an `extend`-chain class (`extend: null`;
// `component()` returns a plain `{polyfills, apply, pixelRatio}` object, no constructor at all)
// - ported per Phase 0 rule 3 as plain exported functions/values, not a class wrapper.
//
// **Deliberately not adopted elsewhere in this project's family**: jui-chart-vue explicitly
// evaluated and declined this approach for its own canvas chart composable (`useCanvasChart.ts`)
// - its own PORT_STATUS.md Phase E entry documents why: mutating `CanvasRenderingContext2D
// .prototype`/`HTMLCanvasElement.prototype` directly is a PROCESS-WIDE, irreversible side effect
// (every canvas context in the page, not just the chart's own, gets patched) and is SSR-
// incompatible (no `document`/canvas globals exist at module-evaluation time on a server; see
// this file's own `pixelRatio` computation below, which runs eagerly at import time exactly like
// the original). Ported here faithfully anyway per this project's full-scope goal (PORT_STATUS.md
// Phase 0 rule 8) - jui-chart-vue's own DPR handling should NOT be migrated to depend on this
// file; that non-migration decision stands, this port doesn't reopen it.
//
// **FIXED SSR/non-browser hazard**: `pixelRatio` below used to be computed once, at module
// evaluation, via `document.createElement('canvas')` - importing this module without a real
// `document` threw immediately, exactly like the original. The computation is now factored into
// `computePixelRatio()`, guarded with a `typeof document !== 'undefined'` check that falls back
// to `1` otherwise, so importing this module (or calling `computePixelRatio()` directly) in a
// non-browser environment no longer crashes.

/**
 * Computes the detected device/backing-store pixel ratio. Returns `1` when `document` isn't
 * available (SSR, or a non-browser test environment) instead of throwing.
 */
export function computePixelRatio(): number {
  if (typeof document === "undefined") return 1;

  const pixelRatioCanvas: HTMLCanvasElement = document.createElement("canvas");
  const pixelRatioContext = pixelRatioCanvas.getContext("2d") as (CanvasRenderingContext2D & Record<string, any>) | null;

  const backingStorePixelRatio: number =
    (pixelRatioContext &&
      (pixelRatioContext.backingStorePixelRatio ||
        pixelRatioContext.webkitBackingStorePixelRatio ||
        pixelRatioContext.mozBackingStorePixelRatio ||
        pixelRatioContext.msBackingStorePixelRatio ||
        pixelRatioContext.oBackingStorePixelRatio ||
        pixelRatioContext.backingStorePixelRatio)) ||
    1;

  return (window.devicePixelRatio || 1) / backingStorePixelRatio;
}

/** The detected device/backing-store pixel ratio - computed once, at module load (see header). */
export const pixelRatio: number = computePixelRatio();

type RatioArgSpec = "all" | number[];

/**
 * The list of `CanvasRenderingContext2D` methods to scale coordinate arguments for.
 *
 * **FIXED**: `isPointInPath`/`isPointInStroke` used to be typo'd as `isPointinPath`/
 * `isPointinStroke` (lowercase `in`). Since `prototype[key]` for a typo'd key was `undefined`,
 * the patch loop used to silently create two new, never-called, broken own-properties
 * (`prototype.isPointinPath = function(){ ...; return undefined.apply(...) }`, which would
 * itself throw if ever invoked) while leaving the REAL `isPointInPath`/`isPointInStroke` methods
 * completely unpatched - a genuine functional gap (hit-testing coordinates never got
 * DPR-scaled), not just dead code. Fixed to the correct capitalization.
 */
const ratioArgs: Record<string, RatioArgSpec> = {
  fillRect: "all",
  clearRect: "all",
  strokeRect: "all",
  moveTo: "all",
  lineTo: "all",
  arc: [0, 1, 2],
  arcTo: "all",
  bezierCurveTo: "all",
  isPointInPath: "all",
  isPointInStroke: "all",
  quadraticCurveTo: "all",
  rect: "all",
  translate: "all",
  createRadialGradient: "all",
  createLinearGradient: "all",
};

/**
 * Patches `prototype` (a `CanvasRenderingContext2D` instance or its shared prototype) in place.
 * `ratio` defaults to the module's own `pixelRatio` - the optional override exists so callers
 * (and tests, since jsdom's own `pixelRatio` always computes to `1`) can force a specific ratio.
 */
function polyfillForCanvasRenderingContext2D(prototype: any, ratio: number = pixelRatio): void {
  if (ratio === 1) return;

  Object.keys(ratioArgs).forEach((key) => {
    const value = ratioArgs[key];
    const _super = prototype[key];

    prototype[key] = function (this: any, ...args: any[]) {
      let scaledArgs = args;

      if (value === "all") {
        scaledArgs = args.map((a) => a * ratio);
      } else if (Array.isArray(value)) {
        for (let i = 0, len = value.length; i < len; i++) {
          scaledArgs[value[i]] *= ratio;
        }
      }

      return _super.apply(this, scaledArgs);
    };
  });

  // Stroke lineWidth adjustment
  const _superStroke = prototype.stroke;
  prototype.stroke = function (this: any, ...args: any[]) {
    this.lineWidth *= ratio;
    _superStroke.apply(this, args);
    this.lineWidth /= ratio;
  };

  // Text
  const _superFillText = prototype.fillText;
  prototype.fillText = function (this: any, ...args: any[]) {
    args[1] *= ratio; // x
    args[2] *= ratio; // y

    this.font = this.font.replace(/(\d+)(px|em|rem|pt)/g, (_w: string, m: any, u: string) => m * ratio + u);

    _superFillText.apply(this, args);

    this.font = this.font.replace(/(\d+)(px|em|rem|pt)/g, (_w: string, m: any, u: string) => m / ratio + u);
  };

  const _superStrokeText = prototype.strokeText;
  prototype.strokeText = function (this: any, ...args: any[]) {
    args[1] *= ratio; // x
    args[2] *= ratio; // y

    this.font = this.font.replace(/(\d+)(px|em|rem|pt)/g, (_w: string, m: any, u: string) => m * ratio + u);

    _superStrokeText.apply(this, args);

    this.font = this.font.replace(/(\d+)(px|em|rem|pt)/g, (_w: string, m: any, u: string) => m / ratio + u);
  };
}

function polyfillForHTMLCanvasElement(prototype: any): void {
  const _super = prototype.getContext;

  prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: any[]) {
    const context = _super.call(this, type, ...rest);

    if (type === "2d") {
      if (pixelRatio > 1) {
        this.style.height = this.height + "px";
        this.style.width = this.width + "px";
        this.width *= pixelRatio;
        this.height *= pixelRatio;
      }
    }

    return context;
  };
}

/** Monkey-patches the GLOBAL `CanvasRenderingContext2D.prototype`/`HTMLCanvasElement.prototype`. */
export function polyfills(): void {
  polyfillForCanvasRenderingContext2D(CanvasRenderingContext2D.prototype);
  polyfillForHTMLCanvasElement(HTMLCanvasElement.prototype);
}

/**
 * Applies just the 2D-context patch set to a single context instance (not the shared prototype).
 * `ratio` defaults to the module's own `pixelRatio` - pass it explicitly to force a specific
 * ratio (e.g. in tests, since jsdom's own `pixelRatio` always computes to `1`).
 */
export function apply(context: CanvasRenderingContext2D, ratio: number = pixelRatio): void {
  polyfillForCanvasRenderingContext2D(context, ratio);
}
