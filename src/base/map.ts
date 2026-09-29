// Port of juijs-graph's `src/base/map.js` ("chart.map", extend: null).
//
// The map-chart base engine: loads geo-path/polygon data (either from an already-cached in-
// memory array or, on first use, by synchronously XHR-fetching a remote SVG file and walking its
// `<g>`/`<path>`/`<polygon>` tree), applies theme fill/stroke styling to each resulting path,
// tracks pan/zoom state (`pathScale`/`pathX`/`pathY`), and wires per-path mouse events. No
// jui-chart-vue reference exists for this file (never ported there - confirmed via prior
// conversation history: the base engine exists but no concrete `brush.map`/`widget.map`
// implementation is public anywhere in `juijs-graph`/`jui-chart`), so this is a full independent
// port with full independent verification (hand-traced values + jsdom-rendered SVG assertions,
// see `map.spec.ts`).
//
// ================================================================================================
// THE HEADLINE FINDING (Tier-A defect, FIXED - see `render()`'s own doc comment below): `chart.map`'s
// `render()` lifecycle contract was broken in the real, distributed upstream library, not a
// port-introduced bug - and, unlike this file's other preserved quirks, this one is a guaranteed
// crash nobody could ever have depended on, so it's fixed here rather than preserved.
// ================================================================================================
// `base/axis.js`'s `drawMapType()` (this project's `axis.ts` `Axis.drawMapType()`, already landed)
// constructs a map instance and then calls `map.render()` directly:
//
//     var map = new Map(chart, axis, axis[k]);
//     map.chart = chart; map.axis = axis; map.map = axis[k]; map.svg = chart.svg;
//     var elem = map.render();   // <-- calls .render()
//
// But `base/map.js`'s own `Map` constructor function defines only `this.scale`, `this.draw`, and
// `this.drawAfter` - **no `this.render` is ever assigned, anywhere in the file**, and `Map`'s own
// module descriptor is `extend: null` (confirmed both in `node_modules/juijs-graph/src/base/map.js`
// and, separately, in the compiled `dist/jui-graph.esm.js` bundle - not a stale/mismatched source
// copy), so it does NOT inherit a `render()` from `chart.draw`'s `Draw` class either (which DOES
// provide a `render()` that calls `this.draw()` then `this.drawAfter()` - the lifecycle shape
// `Map`'s own two methods clearly were designed to plug into, going by their names/shapes, but
// `Map` never actually declares `extend: "draw"` to get it). Net effect, verified against the
// literal original and its own compiled output, not assumed from a single read: **calling
// `axis.js`'s map-axis code path in the real, shipped `juijs-graph`/`jui-chart` always threw
// `TypeError: map.render is not a function` the instant any chart configured a `map` axis option**
// - `chart.map`'s entire declared purpose was unreachable dead code in production.
//
// FIX (Tier A: outright crash, not a "look" any real demo could depend on): `Map` below now defines
// its own `render()`, bridging `draw()`/`drawAfter()` exactly the way `chart.draw`'s `Draw.render()`
// does for a real `extend: "draw"` subclass (see `render()`'s own doc comment for the exact shape).
// This closes the direct, practical consequence the port's own `base/axis.ts` already flagged: that
// file's `MapConstructor`/`MapInstance` structural contract (`AxisChart.mapType`) requires a
// `render(): {root, scale}` method, modeled on what `drawMapType()` itself calls - `Map` now
// actually implements that contract (see `map.spec.ts`'s `Map.render()` describe block), so
// `jui-chart-vue`'s `register/mapTypes.ts` can wire it in as a real `AxisChart.mapType` for the
// first time. (Separately, `jui-chart-vue` had already found and worked around a SECOND, unrelated
// `base/axis.ts` defect - out of this file's scope, in a file this project doesn't touch - that
// still keeps `new MapCtor(...)` itself from ever running in that project's current architecture;
// see that project's own `register/chartMap.ts` header comment for the full writeup. This fix is
// still correct and necessary in its own right: it's what makes `Map` structurally satisfy
// `MapInstance` at all, and it's exactly what that project's own workaround delegates to
// internally.)
//
// ================================================================================================
// Other structural notes
// ================================================================================================
// - **Constructor arity is a red herring**: `axis.js`'s call site passes 3 args
//   (`new Map(chart, axis, axis[k])`), matching `base/axis.ts`'s `MapConstructor` interface shape
//   (`new (chart, axis, mapOptions) => MapInstance`) - but the ORIGINAL `Map` constructor function
//   takes **zero parameters** (`var Map = function() { var self = this; ... }`) and never reads
//   `arguments` either. All the real wiring (`chart`/`axis`/`map`/`svg`) happens exclusively via
//   the four direct property assignments `axis.js` performs immediately after `new Map(...)`, not
//   via the constructor. Preserved exactly: this class's constructor also takes no parameters and
//   ignores anything passed to it (TypeScript's structural function-type compatibility allows a
//   0-parameter constructor to satisfy a 3-parameter constructor type, so this remains fine for
//   `MapConstructor`'s shape) - and now that `render()` is fixed (see the header comment's own
//   "headline finding" update), `Map` genuinely, structurally satisfies `MapConstructor`/
//   `MapInstance` end to end, arity quirk included. `chart`/`axis`/`map`/`svg` are typed with
//   definite-assignment assertions (`!`), same idiom `util/svg/element.ts`'s `Element` already
//   established for "populated by an external wiring step, not the constructor."
// - **`chart` needs more than `axis.ts`'s `AxisChart` declares**: `addEvent()`'s `setMouseEvent()`
//   reads `chart.root` (the real DOM mount element) and `chart.padding("left"/"top")` - neither is
//   part of `axis.ts`'s `AxisChart` interface (`base/axis.js` itself never calls either; only real
//   `Builder` instances - `base/builder.ts`'s `root: HTMLElement`/`padding(key)` - happen to have
//   them). `MapChart` below is `AxisChart` extended with exactly those two extra members - a
//   strict superset, so any real `AxisChart`-satisfying `Builder` instance already satisfies it too.
// - `util/base.js`'s `ajax()` is real product logic here (the actual network fetch for a remote map
//   SVG file), so - per Phase 0 rule 4 - it gets its own private, unexported port (`ajax()` below),
//   same convention as this project's other inlined `util.base` helpers. Only the subset `loadPath()`
//   actually ever passes (`url`/`async`/`success`/`fail`, no `data`/custom `type`) is exercised, but
//   the full original shape (including the legacy `ActiveXObject` IE fallback loop) is kept for
//   fidelity since it's cheap and self-contained.
//
// See `map.spec.ts` for the full jsdom-rendered/hand-traced/Node-cross-checked verification and
// every other preserved quirk documented at its own call site below.

import { SVG } from "../util/svg";
import { Element as SvgElement } from "../util/svg/element";
import { TransElement } from "../util/svg/element.transform";
import { offset } from "../util/dom";
import type { Axis, AxisChart } from "./axis";

// ---------------------------------------------------------------------------------------------
// Inlined `util/base.js` helpers this file actually needs (Phase 0 rule 4: real product logic,
// not registry/OOP scaffolding - same convention as `axis.ts`/`builder.ts`'s own private
// `typeCheck`/`extend` copies). Node-cross-checked against the original's `base/base.js`.
// ---------------------------------------------------------------------------------------------

function typeCheck(type: string | string[], value: unknown): boolean {
  function check(t: string, v: unknown): boolean {
    if (typeof t !== "string") return false;

    if (t === "string") return typeof v === "string";
    if (t === "integer") return typeof v === "number" && v % 1 === 0;
    if (t === "float") return typeof v === "number" && v % 1 !== 0;
    if (t === "number") return typeof v === "number";
    if (t === "boolean") return typeof v === "boolean";
    if (t === "undefined") return typeof v === "undefined";
    if (t === "null") return v === null;
    if (t === "array") return v instanceof Array;
    if (t === "date") return v instanceof Date;
    if (t === "function") return typeof v === "function";
    if (t === "object") {
      return typeof v === "object" && v !== null && !(v instanceof Array) && !(v instanceof Date) && !(v instanceof RegExp);
    }

    return false;
  }

  if (typeof type === "object" && (type as string[]).length) {
    const typeList = type as string[];
    for (let i = 0; i < typeList.length; i++) {
      if (check(typeList[i], value)) return true;
    }
    return false;
  }

  return check(type as string, value);
}

/** `_.extend(origin, add, skip)` ported verbatim - see `axis.ts`'s copy for the same semantics. */
function extend(origin: unknown, add: unknown, skip?: boolean): Record<string, unknown> {
  const target: Record<string, unknown> = typeCheck(["object", "function"], origin) ? (origin as Record<string, unknown>) : {};

  if (!typeCheck(["object", "function"], add)) return target;
  const source = add as Record<string, unknown>;

  function isRecursive(value: unknown): boolean {
    return typeCheck("object", value);
  }

  for (const key in source) {
    if (skip === true) {
      if (isRecursive(target[key])) {
        extend(target[key], source[key], skip);
      } else if (typeCheck("undefined", target[key])) {
        target[key] = source[key];
      }
    } else {
      if (isRecursive(target[key])) {
        extend(target[key], source[key], skip);
      } else {
        target[key] = source[key];
      }
    }
  }

  return target;
}

/**
 * `_.trim(text)` ported from `util/base.js`.
 *
 * FIX (Tier A defect B, previously a genuine, previously-undocumented bug - Node-cross-checked
 * against the literal original, not assumed from reading the regex once): the regex itself is a
 * well-known pattern (Sizzle's own selector-trimming `rtrim`) whose trailing alternative
 * (`((?:^|[^\\])(?:\\.)*)` + whitespace + `"$"`) deliberately captures the one non-whitespace
 * character immediately before a trailing whitespace run into group 1, specifically so a caller
 * can restore it via `.replace(rtrim, "$1")` - that's what makes the "avoid trimming an escaped
 * trailing space" logic work at all. This port's `.replace(rtrim, "")` (no replacement group) was
 * a transcription bug: it deleted the ENTIRE match - captured character included - not just the
 * trailing-whitespace portion, so any string with trailing/delimiter-adjacent whitespace silently
 * lost its last real character (e.g. `trim("blue ")` -> `"blu"`, `trim("0.5 ")` -> `"0."`,
 * `trim("ab  ")` -> `"a"` even across a multi-space run, `trim("a ")` -> `""`). `getStyleObj()`
 * below feeds every parsed style value/key through this, corrupting any real `style="..."` CSS
 * value authored with a space before a `:`/`;` delimiter (or a trailing space at the end) - a Tier
 * A defect (silent data corruption of real CSS colors/values), not a "look" any real demo could
 * depend on, so fixed here (not preserved): the fix is simply the corrected substitution,
 * `.replace(rtrim, "$1")`, restoring the character the regex captures for exactly that purpose -
 * leading whitespace (matched by the OTHER alternative, no capture group) still strips to `""` as
 * before, and a string with no trailing whitespace at all is still untouched. See `map.spec.ts`'s
 * `getStyleObj`/`loadArray` regression coverage.
 */
function trim(text: unknown): string {
  const whitespace = "[\\x20\\t\\r\\n\\f]";
  const rtrim = new RegExp("^" + whitespace + "+|((?:^|[^\\\\])(?:\\\\.)*)" + whitespace + "+$", "g");

  return text == null ? "" : (text + "").replace(rtrim, "$1");
}

/**
 * `_.ajax(data)` - partial port (see header comment): the full original also supports a POST-style
 * `data`/`param()` body, never exercised by this file's one call site (`loadPath()` always passes
 * `{url, async, success, fail}`), but the fetch/fallback shape is kept complete for fidelity.
 */
function ajax(opts: { url: string; async: boolean; success: (xhr: XMLHttpRequest) => void; fail?: (xhr: XMLHttpRequest) => void }): void {
  let xhr: XMLHttpRequest | null = null;

  if (typeof XMLHttpRequest !== "undefined") {
    xhr = new XMLHttpRequest();
  } else if (typeof (window as any).ActiveXObject !== "undefined") {
    const versions = ["MSXML2.XmlHttp.5.0", "MSXML2.XmlHttp.4.0", "MSXML2.XmlHttp.3.0", "MSXML2.XmlHttp.2.0", "Microsoft.XmlHttp"];

    for (let i = 0; i < versions.length; i++) {
      try {
        xhr = new (window as any).ActiveXObject(versions[i]);
        break;
      } catch (e) {
        // ignored, matches the original's empty catch
      }
    }
  }

  if (xhr != null) {
    xhr.open("GET", opts.url, opts.async);
    xhr.send("");

    const callback = () => {
      if (xhr!.readyState === 4 && xhr!.status === 200) {
        opts.success(xhr!);
      } else if (typeof opts.fail === "function") {
        opts.fail(xhr!);
      }
    };

    if (!opts.async) {
      callback();
    } else {
      xhr.onreadystatechange = callback;
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Public shapes
// ---------------------------------------------------------------------------------------------

/**
 * A single loaded path/polygon's raw config - either handed in directly (`map.path` pointing at
 * an already-array-shaped `pathData` cache entry) or built by `getPathList()`/`loadPath()` from a
 * fetched SVG document's `<path>`/`<polygon>` elements (`isLoadAttribute()`'s whitelist), then
 * merged with a matching `axis.data` row via `getDataById()` (which can add arbitrary extra keys,
 * e.g. `dx`/`dy` - hence the index signature).
 */
export interface MapPathDatum {
  id?: string;
  group?: string;
  title?: string;
  x?: number | string;
  y?: number | string;
  d?: string;
  points?: string;
  class?: string;
  style?: string;
  [key: string]: unknown;
}

/** Matches `Map.setup()`'s defaults below - the shape of `this.map` once `axis.ts` wires it up. */
export interface MapOptions {
  scale: number;
  viewX: number;
  viewY: number;
  hide: boolean;
  path: string;
  width: number;
  height: number;
  [key: string]: unknown;
}

/**
 * `self.chart` structural contract this file needs - `axis.ts`'s `AxisChart` plus the two extra
 * members (`root`/`padding()`) `base/axis.js` itself never calls but `base/map.js`'s `addEvent()`
 * does. See header comment for why this can't just be `AxisChart` as-is.
 */
export type MapChart = AxisChart & {
  root: HTMLElement;
  padding(key: string): number;
};

/** What `this.scale(id)` returns for a resolved (or unresolved) path id. */
export interface MapScaleResult {
  x: number | null;
  y: number | null;
  path: SvgElement | null;
  data: MapPathDatum | null;
}

/**
 * `this.scale` is a callable function object with four extra methods attached directly to it (the
 * original's own shape: `this.scale = function(id){...}; this.scale.each = function(){...};` etc,
 * on a plain JS function). `each`/`scale`/`view`'s original bodies read `this` as the SIBLING
 * method call target (i.e. `this.scale.scale(2)` runs with `this === mapInstance.scale`, so
 * `this.view(...)` inside it reaches `mapInstance.scale.view`) - reproduced with the same `this`
 * shape here (see `Map.buildScale()`), not converted to arrow functions/closures over a single
 * fixed receiver, since that would change what `this` resolves to for any external caller that
 * also calls these as `mapInstance.scale.scale(...)`/`.view(...)` methods.
 */
export interface MapScale {
  (id: string): MapScaleResult | undefined;
  each(this: MapScale, callback: (this: MapScale, id: string, entry: { path: SvgElement; data: MapPathDatum }) => void): void;
  size(this: MapScale): { width: number; height: number };
  /** Also stamped with `.type`/`.root` externally by `axis.ts`'s `drawMapType()` - see `GridRenderedScale`. */
  scale(this: MapScale, scale?: number): number;
  view(this: MapScale, x?: number, y?: number): { x: number; y: number };
  type?: string;
  root?: TransElement;
}

// ---------------------------------------------------------------------------------------------
// Map
// ---------------------------------------------------------------------------------------------

/**
 * Port of `chart.map`'s `Map` constructor function as a real ES class (Phase 0 rule 2). See the
 * header comment for the central finding (`render()` is never defined - `axis.js`'s own call site
 * expects one) and the constructor-arity/`MapChart` notes.
 */
export class Map {
  // Wired externally by whatever assembles the chart (mirrors `axis.js`'s post-`new` assignment -
  // see header comment), NOT by this constructor. Definite-assignment, same idiom as
  // `util/svg/element.ts`'s `Element` fields.
  /** The owning chart, assigned externally (post-`new`) by whatever wires this map up - never set
   *  by this constructor. See header comment's "constructor arity is a red herring" note. */
  chart!: MapChart;
  /** The `Axis` this map is attached to, assigned externally alongside `chart`. */
  axis!: Axis;
  /** This map's resolved options (`axis[k]` from `Axis.reload()`'s `drawMapType()` call), assigned
   *  externally alongside `chart`. */
  map!: MapOptions;
  /** The chart's shared `SVG` builder, assigned externally alongside `chart`. */
  svg!: SVG;

  private pathData: Record<string, MapPathDatum[]> = {};
  private pathGroup: TransElement | null = null;
  private pathIndex: Record<string, { path: SvgElement; data: MapPathDatum }> = {};
  private pathScale = 1;
  private pathX = 0;
  private pathY = 0;

  /** The callable pan/zoom/lookup object built by `buildScale()` in the constructor - see
   *  `MapScale`'s own doc comment for its shape and the `this`-binding subtlety its `each`/`scale`/
   *  `view` sibling methods rely on. */
  scale: MapScale;

  constructor() {
    this.scale = this.buildScale();
  }

  // -----------------------------------------------------------------------------------------
  // this.scale - callable + .each/.size/.scale/.view (see `MapScale`'s doc comment for the
  // `this`-binding shape this preserves).
  // -----------------------------------------------------------------------------------------

  private buildScale(): MapScale {
    const self = this;

    const scaleFn = function (this: MapScale, id: string): MapScaleResult | undefined {
      if (!typeCheck("string", id)) return undefined;

      let x: number | null = null;
      let y: number | null = null;
      let path: SvgElement | null = null;
      let data: MapPathDatum | null = null;
      const pxy = self.getScaleXY();

      if (typeCheck("object", self.pathIndex[id])) {
        path = self.pathIndex[id].path;
        data = self.pathIndex[id].data;

        if (data.x != null) {
          const dx = self.axis.getValue(data, "dx", 0) as number;
          const cx = parseFloat(String(data.x)) + dx;
          x = cx * self.pathScale - pxy.x;
        }

        if (data.y != null) {
          const dy = self.axis.getValue(data, "dy", 0) as number;
          const cy = parseFloat(String(data.y)) + dy;
          y = cy * self.pathScale - pxy.y;
        }
      }

      return { x, y, path, data };
    } as MapScale;

    scaleFn.each = function (this: MapScale, callback) {
      const inner = this;
      for (const id in self.pathIndex) {
        callback.apply(inner, [id, self.pathIndex[id]]);
      }
    };

    scaleFn.size = function () {
      return { width: self.map.width, height: self.map.height };
    };

    // NOTE (preserved quirk): `!scale` excludes `0` too (not just negative/falsy values) - a
    // `scale.scale(0)` call is silently ignored and returns the CURRENT `pathScale` unchanged,
    // same as `scale.scale(-1)` would.
    scaleFn.scale = function (this: MapScale, scale?: number) {
      if (!scale || scale < 0) return self.pathScale;

      self.pathScale = scale;
      self.pathGroup!.scale(self.pathScale);
      this.view(self.pathX, self.pathY);

      return self.pathScale;
    };

    scaleFn.view = function (this: MapScale, x?: number, y?: number) {
      const xy = { x: self.pathX, y: self.pathY };

      if (!typeCheck("number", x) || !typeCheck("number", y)) return xy;

      self.pathX = x as number;
      self.pathY = y as number;

      const pxy = self.getScaleXY();
      self.pathGroup!.translate(-pxy.x, -pxy.y);

      return { x: self.pathX, y: self.pathY };
    };

    return scaleFn;
  }

  // -----------------------------------------------------------------------------------------
  // Private loading/parsing helpers
  // -----------------------------------------------------------------------------------------

  /**
   * Builds real `SvgElement`s (via `SVG.createObject`) from an array of raw path/polygon configs,
   * applying theme fill/stroke styling.
   *
   * **Preserved quirk**: `elem.attr(_.extend(style, {fill: chart.theme(...), ...}))` merges the
   * 5 theme-driven keys (`fill`/`fill-opacity`/`stroke`/`stroke-width`/`stroke-opacity`) INTO
   * `style` as the "add" side of `_.extend` - since `theme()` always returns a real (non-
   * `undefined`) value, these 5 keys are UNCONDITIONALLY overwritten with the chart theme's
   * values, clobbering any same-named key an inline `style="fill:...;stroke:..."` attribute might
   * have specified. Any OTHER style property (e.g. `stroke-dasharray`) survives untouched. Not
   * fixed - this is exactly what `_.extend(style, themeProps)` does in the original too.
   */
  private loadArray(data: MapPathDatum[]): { path: SvgElement; data: MapPathDatum }[] {
    const children: { path: SvgElement; data: MapPathDatum }[] = [];

    for (let i = 0, len = data.length; i < len; i++) {
      if (typeCheck("object", data[i])) {
        let style: Record<string, string> = {};

        if (typeCheck("string", data[i].style)) {
          style = this.getStyleObj(data[i].style as string);
          delete data[i].style;
        }

        const elem = SVG.createObject({
          type: data[i].d != null ? "path" : "polygon",
          attr: data[i] as Record<string, unknown>,
        });

        elem.attr(
          extend(style, {
            fill: this.chart.theme("mapPathBackgroundColor"),
            "fill-opacity": this.chart.theme("mapPathBackgroundOpacity"),
            stroke: this.chart.theme("mapPathBorderColor"),
            "stroke-width": this.chart.theme("mapPathBorderWidth"),
            "stroke-opacity": this.chart.theme("mapPathBorderOpacity"),
          }) as Record<string, unknown>
        );

        children.push({ path: elem, data: data[i] });
      }
    }

    return children;
  }

  /**
   * `str.split(";")` -> `key:value` pairs, trimmed via `trim()`. Any segment without a `:` is
   * silently skipped. Since `trim()`'s own truncation bug is fixed (see that function's doc
   * comment), a key or value with a trailing space before its `:`/`;` delimiter (or at the very
   * end of `str`) survives fully intact, e.g. `"fill: red ; stroke: blue"` now correctly parses to
   * `{fill: "red", stroke: "blue"}`.
   */
  private getStyleObj(str: string): Record<string, string> {
    const style: Record<string, string> = {};
    const list = str.split(";");

    for (let i = 0; i < list.length; i++) {
      if (list[i].indexOf(":") !== -1) {
        const obj = list[i].split(":");
        style[trim(obj[0])] = trim(obj[1]);
      }
    }

    return style;
  }

  /**
   * Recursively walks a real DOM (or parsed-XML) subtree collecting `<path>`/`<polygon>` configs,
   * tagging each with its containing `<g>`'s `id` as `group`.
   *
   * **Preserved dead-code quirk (genuinely new finding, not obvious from a single read)**: the
   * guard `if(!_.typeCheck("string", root.id)) return;` can NEVER actually trigger for a real
   * `Element` - `Element.prototype.id` (both plain HTML/SVG elements) is ALWAYS a string (`""`
   * when no `id` attribute is set, never `undefined`/`null`), so `typeCheck("string", root.id)` is
   * always `true` and the negation always `false`. Every real call recurses/collects normally
   * regardless of whether `root` actually has an `id` attribute - `getPathList()` runs to
   * completion even for an id-less `<g>`. Node/hand-verified, tested in `map.spec.ts` with an
   * id-less `<g>` root.
   */
  private getPathList(root: Element): MapPathDatum[] | undefined {
    if (!typeCheck("string", root.id)) return undefined;

    let pathData: MapPathDatum[] = [];
    const children = root.childNodes;

    for (let i = 0, len = children.length; i < len; i++) {
      const elem = children[i] as Element;
      if (elem.nodeType !== 1) continue;

      const name = elem.nodeName.toLowerCase();

      if (name === "g") {
        pathData = pathData.concat(this.getPathList(elem) || []);
      } else if (name === "path" || name === "polygon") {
        const obj: MapPathDatum = { group: root.id };

        const attributes = elem.attributes;
        for (let a = 0; a < attributes.length; a++) {
          const attr = attributes[a];

          if ((attr as unknown as { specified?: boolean }).specified && this.isLoadAttribute(attr.name)) {
            obj[attr.name] = this.replaceXYValue(attr);
          }
        }

        if (typeCheck("string", obj.id)) {
          extend(obj, this.getDataById(obj.id as string));
        }

        pathData.push(obj);
      }
    }

    return pathData;
  }

  /**
   * Loads the path/polygon list for `uri`: returns the cached-and-reparsed result if `uri` was
   * already fetched (`loadArray()` re-runs on every call, cached or not - a re-`draw()` always
   * rebuilds fresh `SvgElement`s even for already-fetched map data), otherwise synchronously
   * XHR-fetches `uri` as an SVG document, walks its `<g>`/`<path>`/`<polygon>` tree the same way
   * `getPathList()` does (duplicated inline in the original, not a `getPathList()` call, for the
   * TOP-level `<svg>` root specifically - reproduced as its own loop here too, not refactored to
   * reuse `getPathList()`, for 1:1 fidelity), and appends any `<style>` tags straight into the
   * live chart's real root `<svg>` DOM element.
   *
   * **Preserved quirk**: if the fetched document's root doesn't have EXACTLY one `<svg>` element
   * (`svg.length != 1` - zero, e.g. a malformed/non-SVG response, or more than one, e.g. multiple
   * root `<svg>`s), the `success` callback returns immediately, leaving `this.pathData[uri]`
   * permanently `[]` - and since `[]` IS itself a valid "already cached" array
   * (`_.typeCheck("array", pathData[uri])` is `true` for an empty array too), every SUBSEQUENT
   * call for the same `uri` treats it as already-successfully-loaded-but-empty and never retries
   * the fetch. No error is ever surfaced for this case. Tested.
   *
   * **Preserved quirk**: if `xhr.responseXML` is `null` (e.g. the server didn't send a
   * `Content-Type` XHR recognizes as XML), `xml.getElementsByTagName(...)` throws a `TypeError`
   * uncaught inside the `success` callback - no defensive null-check, matching the original.
   */
  private loadPath(uri: string): { path: SvgElement; data: MapPathDatum }[] {
    if (typeCheck("array", this.pathData[uri])) {
      return this.loadArray(this.pathData[uri]);
    }

    this.pathData[uri] = [];

    ajax({
      url: uri,
      async: false,
      success: (xhr) => {
        const xml = xhr.responseXML as Document;
        const svgTags = xml.getElementsByTagName("svg");
        const styleTags = xml.getElementsByTagName("style");

        if (svgTags.length !== 1) return;
        const children = svgTags[0].childNodes;

        for (let i = 0, len = children.length; i < len; i++) {
          const elem = children[i] as Element;
          if (elem.nodeType !== 1) continue;

          const name = elem.nodeName.toLowerCase();

          if (name === "g") {
            this.pathData[uri] = this.pathData[uri].concat(this.getPathList(elem) || []);
          } else if (name === "path" || name === "polygon") {
            const obj: MapPathDatum = {};

            const attributes = elem.attributes;
            for (let a = 0; a < attributes.length; a++) {
              const attr = attributes[a];

              if ((attr as unknown as { specified?: boolean }).specified && this.isLoadAttribute(attr.name)) {
                obj[attr.name] = this.replaceXYValue(attr);
              }
            }

            if (typeCheck("string", obj.id)) {
              extend(obj, this.getDataById(obj.id as string));
            }

            this.pathData[uri].push(obj);
          }
        }

        for (let i = 0; i < styleTags.length; i++) {
          this.svg.root.element.appendChild(styleTags[i]);
        }
      },
      fail: () => {
        throw new Error("JUI_CRITICAL_ERR: Failed to load resource");
      },
    });

    return this.loadArray(this.pathData[uri]);
  }

  private isLoadAttribute(name: string): boolean {
    return (
      name === "group" || name === "id" || name === "title" || name === "x" || name === "y" ||
      name === "d" || name === "points" || name === "class" || name === "style"
    );
  }

  /** `x`/`y` attribute values are parsed to `number` (via `parseFloat`); everything else stays a raw string. */
  private replaceXYValue(attr: Attr): string | number {
    if (attr.name === "x" || attr.name === "y") {
      return parseFloat(attr.value);
    }

    return attr.value;
  }

  /**
   * Finds the `axis.data` row matching `id` via `Axis.getValue(row, "id", null)` (keymap-aware).
   * **Preserved quirk**: uses loose `==` equality, so a numeric `id` field in the data (e.g. `100`)
   * matches the string `"100"` parsed out of a DOM attribute.
   */
  private getDataById(id: string): Record<string, unknown> | null {
    const list = this.axis.data as Record<string, unknown>[];

    for (let i = 0; i < list.length; i++) {
      const dataId = this.axis.getValue(list[i], "id", null);

      // eslint-disable-next-line eqeqeq
      if (dataId == id) {
        return list[i];
      }
    }

    return null;
  }

  /**
   * Note (TODO comment preserved from the original: "차후에 공통 함수로 변경해야 함" - "should later
   * be changed into a common function"): resolves the pan/zoom viewport offset from `this.map
   * .width`/`.height` (the MAP OPTION values, i.e. what the caller configured `map: {width, height}`
   * as - NOT `chart.svg.size()` or anything measured from the live DOM). Since `Map.setup()`
   * defaults both to `-1` (meaning "unset"), any consumer that never explicitly configures
   * `map.width`/`map.height` gets `pathScale`-dependent pan math computed against `-1` rather than
   * a real pixel size - a real footgun (not exercised as a "bug" here since it IS the original's
   * documented default; just worth flagging since it's easy to trip over). Formula:
   * `px = ((w*scale) - w) / 2`, `py = ((h*scale) - h) / 2`, offset by the current `pathX`/`pathY`.
   */
  private getScaleXY(): { x: number; y: number } {
    const w = this.map.width;
    const h = this.map.height;
    const px = (w * this.pathScale - w) / 2;
    const py = (h * this.pathScale - h) / 2;

    return { x: px + this.pathX, y: py + this.pathY };
  }

  /**
   * Builds the group of real `SvgElement`s for `this.map.path` and indexes them by `data.id`.
   *
   * **Preserved dead code**: the original has `//addEvent(path, list[i]);` commented out right
   * here - mouse events are wired up later, in `drawAfter()`, not during `makePathGroup()`.
   */
  private makePathGroup(): TransElement {
    const group = this.chart.svg.group();
    const list = this.loadPath(this.map.path);

    for (let i = 0, len = list.length; i < len; i++) {
      const path = list[i].path;
      const data = list[i].data;

      group.append(path);

      if (typeCheck("string", data.id)) {
        this.pathIndex[data.id as string] = list[i];
      }
    }

    return group;
  }

  /**
   * Wires the 8 `map.*` mouse events onto a single loaded path element, mirroring
   * `base/builder.ts`'s own `setCommonEvents()`/`checkPosition()` shape for `chart.*`/`bg.*`
   * events (same `$.offset(chart.root)` + `chart.padding("left"/"top")` -> `chartX`/`chartY`
   * translation). **Preserved (not defensively guarded)**: `offset(chart.root)` can return
   * `undefined` (see `util/dom.ts`'s `offset()`); the original unconditionally reads `pos.left`/
   * `pos.top` right after, so a `TypeError` there is reproduced rather than guarded against.
   */
  private addEvent(elem: SvgElement, obj: { path: SvgElement; data: MapPathDatum }): void {
    const chart = this.chart;

    const setMouseEvent = (e: any): void => {
      const pos = offset(chart.root);
      const offsetX = e.pageX - pos!.left;
      const offsetY = e.pageY - pos!.top;

      e.bgX = offsetX;
      e.bgY = offsetY;
      e.chartX = offsetX - chart.padding("left");
      e.chartY = offsetY - chart.padding("top");
    };

    elem.on("click", (e: any) => {
      setMouseEvent(e);
      chart.emit("map.click", [obj, e]);
    });

    elem.on("dblclick", (e: any) => {
      setMouseEvent(e);
      chart.emit("map.dblclick", [obj, e]);
    });

    elem.on("contextmenu", (e: any) => {
      setMouseEvent(e);
      chart.emit("map.rclick", [obj, e]);
      e.preventDefault();
    });

    elem.on("mouseover", (e: any) => {
      setMouseEvent(e);
      chart.emit("map.mouseover", [obj, e]);
    });

    elem.on("mouseout", (e: any) => {
      setMouseEvent(e);
      chart.emit("map.mouseout", [obj, e]);
    });

    elem.on("mousemove", (e: any) => {
      setMouseEvent(e);
      chart.emit("map.mousemove", [obj, e]);
    });

    elem.on("mousedown", (e: any) => {
      setMouseEvent(e);
      chart.emit("map.mousedown", [obj, e]);
    });

    elem.on("mouseup", (e: any) => {
      setMouseEvent(e);
      chart.emit("map.mouseup", [obj, e]);
    });
  }

  // -----------------------------------------------------------------------------------------
  // Public API - kept 1:1 with the original. NOTE: no `render()` - see header comment.
  // -----------------------------------------------------------------------------------------

  /**
   * @method draw
   * Builds the map's root `<g>`, loads/positions the path group, and applies any configured
   * initial scale/pan/`hide`.
   */
  draw(): { root: TransElement; scale: MapScale } {
    const root = this.chart.svg.group();

    this.pathScale = this.map.scale;
    this.pathX = this.map.viewX;
    this.pathY = this.map.viewY;
    this.pathGroup = this.makePathGroup();

    root.append(this.pathGroup);

    // eslint-disable-next-line eqeqeq
    if (this.map.scale != 1) {
      this.scale.scale(this.pathScale);
    }

    if (this.map.viewX !== 0 || this.map.viewY !== 0) {
      this.scale.view(this.pathX, this.pathY);
    }

    if (this.map.hide) {
      root.attr({ visibility: "hidden" });
    }

    return { root, scale: this.scale };
  }

  /**
   * @method drawAfter
   * Applies the axis clip-path to the rendered root, then (after a 1ms `setTimeout`, matching the
   * original exactly - not `requestAnimationFrame`/microtask/immediate) wires mouse events onto
   * every loaded path via `addEvent()`.
   */
  drawAfter(obj: { root: TransElement; scale: MapScale }): void {
    obj.root.attr({ "clip-path": "url(#" + this.axis.get("clipRectId") + ")" });

    setTimeout(() => {
      this.scale.each((_id, entry) => {
        this.addEvent(entry.path, entry);
      });
    }, 1);
  }

  /**
   * @method render
   * FIX (Tier-A defect, previously this file's own headline finding - now closed; see the header
   * comment for the full "why this was ever missing" history). `base/axis.ts`'s `drawMapType()` is
   * the ONLY caller of a map instance's `render()` (it calls it unconditionally, immediately after
   * construction), and `AxisChart.mapType`'s own `MapInstance` contract requires one - but this
   * class, matching the real upstream `chart.map` exactly, never declared `extend: "draw"`, so it
   * never inherited `chart.draw`'s `Draw.render()` (which bridges a real subclass's own `draw`/
   * `drawBefore`/`drawAnimate`/`drawAfter` hooks - see `base/draw.ts`). Calling `.render()` on a
   * real instance therefore always threw `TypeError: map.render is not a function` - a guaranteed
   * crash the instant any consumer actually wires a working `AxisChart.mapType` up (as
   * `jui-chart-vue`'s own `register/mapTypes.ts` now does). Not a "look" any real demo could ever
   * have depended on (nothing could reach this far without crashing first), so this is Tier A:
   * fixed here, not preserved.
   *
   * The fix mirrors exactly what `Draw.render()` does for a real `extend: "draw"` subclass, scoped
   * to only the two hooks `Map` actually implements (it has no `drawBefore`/`drawAnimate` of its
   * own, unlike a real `chart.grid.*`/`chart.brush.*`/`chart.widget.*` leaf type, so those two
   * `Draw.render()` steps have nothing to bridge here): call `draw()`, hand its result to
   * `drawAfter()`, then return that same result - satisfying `MapInstance.render(): { root, scale
   * }` exactly. See `map.spec.ts`'s `Map.render()` describe block for the regression test (asserts
   * no throw, both hooks actually ran via their own observable side effects, not just spy calls).
   */
  render(): { root: TransElement; scale: MapScale } {
    const obj = this.draw();
    this.drawAfter(obj);
    return obj;
  }

  /** Default option values, matching `Map.setup()` in the original. */
  static setup(): MapOptions {
    return {
      scale: 1,
      viewX: 0,
      viewY: 0,
      hide: false,
      path: "",
      width: -1,
      height: -1,
    };
  }
}
