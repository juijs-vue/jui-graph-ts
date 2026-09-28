// Port of juijs-graph's `src/base/draw.js` ("chart.draw", extend: null).
//
// `Draw` is an ABSTRACT MIXIN base class, not a usable class on its own: in the original, its
// constructor takes no arguments and defines none of `draw`/`drawBefore`/`drawAfter`/
// `drawAnimate` (a real subclass, via the old `extend:` chain, assigns those itself - e.g. every
// concrete `chart.brush.*`/`chart.widget.*`/`grid.*` class, none of which are ported yet: those
// are Phase C/E of this project's own PORT_STATUS.md). `render()`/`format()`/`calculate3d()` all
// read `this.chart`/`this.axis`/`this.grid`/`this.brush`/`this.widget`/`this.map`, which are
// likewise populated externally (by `base/builder.js`'s `drawBrush`/`drawWidget`, ported
// alongside this file - see `builder.ts`'s `drawBrush`/`drawWidget`, which set `draw.chart`/
// `draw.axis`/`draw.brush`/`draw.widget` on each instance right after construction).
//
// Per Phase 0 rule 2, ported as a real class with method names kept 1:1. The original's
// `_.typeCheck(...)` calls (via `jui.include("util.base")`) are reproduced with a small inlined
// `typeCheck()` (same treatment `util/dom.ts` already established for other Phase A files - the
// function itself is plain, reusable, non-OOP data-checking logic, not part of the
// `inherit()`/registry machinery Phase 0 rules 1/4 drop).
type TypeCheckable = string | number | boolean | symbol | object | null | undefined | Function;

function typeCheck(type: string | string[], value: TypeCheckable): boolean {
  function check(t: string, v: TypeCheckable): boolean {
    if (typeof t !== "string") return false;

    if (t === "string") {
      return typeof v === "string";
    } else if (t === "integer") {
      return typeof v === "number" && v % 1 === 0;
    } else if (t === "float") {
      return typeof v === "number" && v % 1 !== 0;
    } else if (t === "number") {
      return typeof v === "number";
    } else if (t === "boolean") {
      return typeof v === "boolean";
    } else if (t === "undefined") {
      return typeof v === "undefined";
    } else if (t === "null") {
      return v === null;
    } else if (t === "array") {
      return v instanceof Array;
    } else if (t === "date") {
      return v instanceof Date;
    } else if (t === "function") {
      return typeof v === "function";
    } else if (t === "object") {
      return (
        typeof v === "object" && v !== null && !(v instanceof Array) && !(v instanceof Date) && !(v instanceof RegExp)
      );
    }

    return false;
  }

  if (typeof type === "object" && Array.isArray(type)) {
    for (let i = 0; i < type.length; i++) {
      if (check(type[i], value)) return true;
    }
    return false;
  }

  return check(type as string, value);
}

// `util/base.js`'s `startsWith(string, searchString, position)` - `string.lastIndexOf(searchString,
// position) === position`. Behaviorally equivalent to `String.prototype.startsWith` at position 0
// (the only way this file calls it), inlined literally for fidelity rather than substituted.
function startsWith(str: string, searchString: string, position?: number): boolean {
  const pos = position || 0;
  return str.lastIndexOf(searchString, pos) === pos;
}

/** Minimal shape `calculate3d()` needs from `this.axis` (real type: the not-yet-ported `Axis`). */
interface DrawAxisLike {
  area(key: string): any;
  depth: number;
  degree: { x?: number; y?: number; z?: number };
  perspective: any;
  index?: number;
}

/** Minimal shape `on()`/`calculate3d()` need from `this.chart` (real type: `Builder`). */
interface DrawChartLike {
  on(type: string, callback: (...args: any[]) => void, resetType?: string): any;
  axis(index?: number): any;
  format?: (...args: any[]) => any;
}

/** Objects `calculate3d()` rotates - real type: `polygon.core`'s `PolygonCore` (Phase D, unported). */
interface Rotatable {
  perspective: any;
  rotate(depth: number, degree: any, cx: number, cy: number, cz: number): void;
}

/** Port of `chart.draw`'s abstract mixin base - the shared render lifecycle (`render()`, calling
 * `drawBefore`/`draw`/`drawAnimate`/`drawAfter` in that order) every `chart.brush.*`/
 * `chart.widget.*`/`chart.grid.*` leaf type is built on, via `CoreBrush`/`CoreWidget`/`CoreGrid`.
 * Not directly usable on its own: its constructor takes no arguments, and a real subclass is
 * expected to assign its own `draw` (required) and optionally `drawBefore`/`drawAfter`/
 * `drawAnimate`; `chart`/`axis`/`grid`/`brush`/`widget`/`map`/`svg`/`canvas` are all populated
 * externally, by `Builder`'s own `drawBrush()`/`drawWidget()`, right after construction - see each
 * field's own doc comment below for exactly which of those wires it and when. */
export class Draw {
  // Populated externally post-construction (see header comment) - not set by this constructor,
  // matching the original's parameterless `var Draw = function() {}`.

  /** The owning `Builder` instance (`base/builder.ts`'s `drawBrush()`/`drawWidget()` both set this
   * to `this` right after construction) - narrowed here to only what `render()`/`calculate3d()`
   * need (`on()`, `axis(index)`, `format?`); a concrete subclass typically re-types this more
   * widely (e.g. `CoreBrush`'s own `chart: BrushChart`, which also exposes `theme()`/`color()`). */
  chart!: DrawChartLike;
  /** The specific `Axis` instance (one axis GROUP - a single entry of the chart's `axis` array)
   * this brush/widget/grid was configured against, set from `builder.ts`'s own per-group loop.
   * Gives access to that group's own scales (`x`/`y`/`z`/`c`), `data`, `area(key)`, and the 3D
   * projection state (`depth`/`degree`/`perspective`) `calculate3d()` reads - narrowed here to
   * just that subset. */
  axis!: DrawAxisLike;
  /** **Declared but never actually populated for a brush/widget instance** - `builder.ts`'s
   * `drawBrush()`/`drawWidget()` never assign `draw.grid` (confirmed by reading both in full; only
   * `chart`/`axis`/`brush-or-widget`/`svg`/`canvas` are set there). A grid TYPE's own concrete
   * class (e.g. `CoreGrid`'s subclasses) reads its own config a different way, and a brush/widget
   * that needs the active grid config for its axis group should read `this.axis.get(...)` or the
   * axis's own resolved fields instead of this field - kept only for structural parity with the
   * original untyped engine, which also never wrote to the equivalent property on these instance
   * kinds. */
  grid: any;
  /** The brush's own resolved config object (its `XxxBrushOptions` fields, defaults already
   * merged in) - set by `builder.ts`'s `drawBrush()` to that array entry, one per registered
   * `chart.brush.*` instance. Stays `undefined` on a widget/grid instance (never assigned there). */
  brush: any;
  /** The widget's own resolved config object - same shape/assignment as `brush` above, but set by
   * `drawWidget()` for a registered `chart.widget.*` instance instead. Stays `undefined` on a
   * brush/grid instance. */
  widget: any;
  /** **Declared but never actually populated for a brush/widget instance**, same situation as
   * `grid` above - the real per-axis-group map engine lives on `this.axis.map` (a real `Map`
   * instance, set by `Axis`'s own `drawMapType()`/`reload()`), which is what every registered
   * `chart.brush.map.*`/`chart.widget.map.*` type actually reads (e.g.
   * `register/brush/map/bubble.ts`'s own `(this.axis as ...).map(id)` calls) - not this field. */
  map: any;
  /** The shared `SVG` builder handle (`util/svg.ts`) used to construct this draw target's own
   * elements - every `this.svg.rect(...)`/`.circle(...)`/`.path(...)`/`.group(...)`/etc. call a
   * concrete brush/widget/grid makes goes through this. Set to the SAME `Builder.svg` instance for
   * every brush/widget on the chart (`builder.ts`'s `drawBrush()`/`drawWidget()` both assign
   * `draw.svg = this.svg`) - not a private, per-target sub-SVG. */
  svg: any;
  /** The shared 2D canvas rendering context for this draw target's own layer, when the chart was
   * mounted with `canvas: true` (`Builder.setup()`'s default: `false`) - `null`/`undefined`
   * otherwise. Only meaningful for a `chart.brush.canvas.*`/`chart.widget.canvas.*`-family type.
   * A brush gets the double-buffered `buffer` canvas context (`builder.ts`'s `drawBrush()`:
   * `draw.canvas = this._canvas.buffer`); a widget gets the separate `sub` canvas context
   * (`drawWidget()`: `draw.canvas = this._canvas.sub`) - the two draw kinds never share the same
   * canvas layer. */
  canvas: any;

  // Subclasses are expected to define these (see header comment) - `Draw` itself never assigns
  // them, so they stay `undefined` unless a subclass sets them, exactly like the original. Called,
  // in this exact order, by `render()` below - see that method's own body for the full sequence
  // (including the `animate !== false` gate on `drawAnimate`).

  /** REQUIRED (unlike the other 3 hooks) - `render()` throws if this isn't a function. Builds and
   * returns the actual root element (an `SVG`-helper group/shape, or `undefined` for a canvas-only
   * draw target that paints directly with no SVG node of its own) for this brush/widget/grid. */
  draw?: () => any;
  /** Optional setup step run once per `render()`, before `draw()` - typically reads
   * `this.axis`'s area/scales into local fields `draw()` then uses, so per-render geometry isn't
   * recomputed inside per-row loops. */
  drawBefore?: () => void;
  /** Optional post-processing step run once per `render()`, after `draw()`/`drawAnimate()`, given
   * `draw()`'s own return value. `CoreBrush`'s own override, for example, clips the element to the
   * axis's clip-path (unless `brush.clip === false`), stamps a `brush-<type>` CSS class, and
   * translates it to the plot area's origin - a concrete leaf class rarely needs its own. */
  drawAfter?: (obj: any) => void;
  /** Optional animation step run once per `render()`, after `draw()` but before `drawAfter()` -
   * ONLY called when the resolved `grid`/`brush`/`widget`/`map` config's own `animate` field isn't
   * literally `false` (`render()`'s own `draw.animate !== false` gate, checked against whichever
   * of those 4 is actually set on this instance). Given `draw()`'s own return value, same as
   * `drawAfter`. */
  drawAnimate?: (obj: any) => void;

  /**
   * @method render
   * 모든 Draw 객체는 render 함수를 통해서 그려진다.
   */
  render(): any {
    if (!typeCheck("function", this.draw)) {
      throw new Error("JUI_CRITICAL_ERR: 'draw' method must be implemented");
    }

    // Call drawBefore method
    if (typeCheck("function", this.drawBefore)) {
      this.drawBefore!();
    }

    // Call draw method (All)
    const obj = this.draw!();

    // Call drawAnimate method
    if (typeCheck("function", this.drawAnimate)) {
      const draw = this.grid || this.brush || this.widget || this.map;

      if (draw.animate !== false) {
        this.drawAnimate!(obj);
      }
    }

    // Call drawAfter method
    if (typeCheck("function", this.drawAfter)) {
      this.drawAfter!(obj);
    }

    return obj;
  }

  /**
   * @method format
   * Get a default format callback of draw object.
   */
  format(...args: any[]): any {
    const draw = this.grid || this.brush || this.widget;
    const callback = draw.format || this.chart.format;

    return callback.apply(this.chart, args);
  }

  /**
   * @method balloonPoints
   * 말풍선 그리그 메소드
   */
  balloonPoints(type: string, w: number, h: number, anchor: number): string {
    const points: string[] = [];

    if (type === "top") {
      points.push([0, 0].join(","));
      points.push([w, 0].join(","));
      points.push([w, h].join(","));
      points.push([w / 2 + anchor / 2, h].join(","));
      points.push([w / 2, h + anchor].join(","));
      points.push([w / 2 - anchor / 2, h].join(","));
      points.push([0, h].join(","));
      points.push([0, 0].join(","));
    } else if (type === "bottom") {
      points.push([0, anchor].join(","));
      points.push([w / 2 - anchor / 2, anchor].join(","));
      points.push([w / 2, 0].join(","));
      points.push([w / 2 + anchor / 2, anchor].join(","));
      points.push([w, anchor].join(","));
      points.push([w, anchor + h].join(","));
      points.push([0, anchor + h].join(","));
      points.push([0, anchor].join(","));
    } else if (type === "left") {
      points.push([0, 0].join(","));
      points.push([w, 0].join(","));
      points.push([w, h / 2 - anchor / 2].join(","));
      points.push([w + anchor, h / 2].join(","));
      points.push([w, h / 2 + anchor / 2].join(","));
      points.push([w, h].join(","));
      points.push([0, h].join(","));
      points.push([0, 0].join(","));
    } else if (type === "right") {
      points.push([0, 0].join(","));
      points.push([w, 0].join(","));
      points.push([w, h].join(","));
      points.push([0, h].join(","));
      points.push([0, h / 2 + anchor / 2].join(","));
      points.push([0 - anchor, h / 2].join(","));
      points.push([0, h / 2 - anchor / 2].join(","));
      points.push([0, 0].join(","));
    } else {
      points.push([0, 0].join(","));
      points.push([w, 0].join(","));
      points.push([w, h].join(","));
      points.push([0, h].join(","));
      points.push([0, 0].join(","));
    }

    return points.join(" ");
  }

  /**
   * @method on
   * chart.on() 을 쉽게 사용 할 수 있게 해주는 유틸리티 함수
   */
  on(type: string, callback: (...args: any[]) => void): any {
    const self = this;

    return this.chart.on(
      type,
      function (this: any, ...args: any[]) {
        if (startsWith(type, "axis.") && typeCheck("integer", self.axis.index)) {
          const axis = self.chart.axis(self.axis.index);
          const e = args[0];

          if (typeCheck("object", axis)) {
            if (args[1] === self.axis.index) {
              callback.apply(self, [e]);
            }
          }
        } else {
          callback.apply(self, args);
        }
      },
      "render"
    );
  }

  /**
   * @method calculate3d
   *
   * Cross-checked against jui-chart-vue's `usePolygon3d.ts`/`dot3d.js` Phase E writeup
   * (`PORT_STATUS.md` ~L5620-5633 there), which independently derived the exact same two
   * findings from reading this same function: the `depth` argument `rotate()` receives is
   * `Math.max(plotWidth, plotHeight, axis.depth)` - NOT `axis.depth` directly - while the
   * rotation center's `z` is `axis.depth / 2`, a DIFFERENT value in general from the `depth`
   * argument's own halved value. Both are preserved here exactly as in the original (`w`/`h`/`d`
   * below are `axis.area("width")`/`axis.area("height")`/`axis.depth`).
   */
  calculate3d(...list: Rotatable[]): void {
    const w = this.axis.area("width");
    const h = this.axis.area("height");
    const x = this.axis.area("x");
    const y = this.axis.area("y");
    const d = this.axis.depth;
    const r = this.axis.degree;
    const p = this.axis.perspective;

    if (!typeCheck("integer", r.x)) r.x = 0;
    if (!typeCheck("integer", r.y)) r.y = 0;
    if (!typeCheck("integer", r.z)) r.z = 0;

    for (let i = 0; i < list.length; i++) {
      list[i].perspective = p;
      list[i].rotate(Math.max(w, h, d), r, x + w / 2, y + h / 2, d / 2);
    }
  }

  // Return type widened to `Record<string, unknown>` (RECONCILIATION, `grid/core.ts` landing):
  // `grid/core.ts`'s `CoreGrid` is the first real `extends Draw` subclass, and its own
  // `static setup()` (a 1:1 port of the original's `CoreGrid.setup()`, which never included
  // `type`/`animate` keys - see `grid/core.ts`'s header comment on why no automatic
  // static-setup-chain merge actually happens for the `grid.*` family in the original engine
  // either) needs a compatible override return type. The inferred literal `{ type: string | null;
  // animate: boolean }` is real-class static-side covariant-checked by TypeScript (a type-system
  // consequence of `extends`, not present in the original's plain-object-with-a-`.setup`-property
  // registry design) - widening this declared return type changes NO runtime behavior (this method
  // is never called anywhere in the current tree - confirmed via grep) and keeps every subclass's
  // own `static setup()` free to return exactly its own original shape, byte-faithfully.
  static setup(): Record<string, unknown> {
    return {
      /** Specifies the type of a widget/brush/grid to be added. */
      type: null as string | null,
      /** Run the animation effect. */
      animate: false,
    };
  }
}
