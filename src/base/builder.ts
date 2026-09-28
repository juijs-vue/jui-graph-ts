// Port of juijs-graph's `src/base/builder.js` ("chart.builder", extend: "core").
//
// ============================================================================================
// RECONCILIATION NOTE (base/core.ts has landed): `Builder` now really `extends Core`
// (`src/base/core.ts`). The temporary "Core stand-in" block this file used to carry (duplicate
// `root`/`options`/`event`/`index`/`emit`/`off` fields plus a local `mount()`) has been DELETED -
// `Builder` now inherits all of that for real from `Core`: `root`/`options`/`event`/`index`/
// `timestamp`, `emit()`/`off()`/`setOption()`/`destroy()` (unmodified in the original - `builder.js`
// never redefines any of these, confirmed by grep), `mount()` (Core's own bridging device, see its
// header comment), and the `setup()`-chain option-merge (now genuinely walks `Builder.setup()` THEN
// `Core.setup()`, so `options.event` binding - `for (key in opts.event) uiObj.on(key, ...)` in the
// original's `createUIObject` - is now real, not missing, since `Core.setup()`'s `{event: {}}`
// default is what makes that key exist at all). `Builder` still defines its OWN `on(type, callback,
// resetType)` below (overriding `Core.on()`, exactly like the original - `builder.js` DOES redefine
// `this.on`, confirmed by grep, to add the `_handler.render`/`_handler.renderAll` bookkeeping).
//
// One real (not cosmetic) behavior change from the pre-Core stand-in, explained precisely: the old
// stand-in's local `mount()` never bound `options.event` entries via `on()` at all (that logic
// only existed in the original's `createUIObject`, which nothing here could reference before
// `core.ts` existed) - `Core.mount()` now does, matching the real original engine. Unobservable in
// every existing test here (none pass an `options.event` map), verified additive-only.
//
// `Axis` (`base/axis.ts`) is STILL a temporary forward-reference, unrelated to this reconciliation
// - `axis.ts` exists on disk now but wiring a static import here is a separate follow-up, not this
// task's scope; kept exactly as `registerAxis()` below, unchanged.
// ============================================================================================
//
// Original struct notes below (kept for the remaining still-open stand-ins):
//   2. `Axis` (`JUI.include("chart.axis")`): resolved through `registerAxis()` (see below)
//      instead of a static import, since `axis.ts` doesn't exist on this branch yet. Once it
//      does, the intended reconciliation is a real `import { Axis } from './axis'` replacing the
//      registry indirection entirely.
//   3. `chart.brush.*` / `chart.widget.*` / `chart.theme.*` / `chart.icon.*` (all resolved via
//      `JUI.include(...)` string lookups in the original): this is Builder's OWN real,
//      declarative-API product behavior (users configure `brush: [{type: "line", ...}]` arrays;
//      resolving `type` strings to constructors at render time is the entire point of the
//      "chart.builder" feature) - not OOP inherit()/typeCheck() scaffolding, so Phase 0 rules
//      1/4 don't call for dropping it. But the *concrete* things it resolves don't exist as TS
//      modules: `chart.brush.*`/`chart.widget.*` are Phase C-E of this project (unstarted);
//      `chart.theme.*`/`chart.icon.*` aren't even part of `juijs-graph`'s own source tree at all
//      (confirmed: no `src/theme/`, no `src/icon/` directory anywhere in the original repo -
//      they're supplied by the downstream `jui-chart` consumer package). Rather than reproducing
//      the original's implicit global string-keyed registry, this port exposes small explicit,
//      typed registration functions (`registerBrush`/`registerWidget`/`registerTheme`/
//      `registerIcon`) that later phases (and, for theme/icon, a downstream package) are meant to
//      call. Nothing calls them yet, so any chart config that references an unregistered
//      brush/widget/theme/icon type throws a clear, named error at that exact call site.
//
// The original's module-level `_.resize(function(){ ... JUI.get("chart.builder") ... }, 1000)`
// (a single global debounced `window.resize` listener that walks the OLD registry's "chart.builder"
// instance list calling `.resize()` on each) is DROPPED outright, not stood in for: `Builder`
// itself never defines an instance `.resize()` method anywhere in this file, so - taken on its
// own, independent of the registry it's implemented with - this dispatcher is inert dead
// machinery even in the original (same "registry artifact, not reachable product logic" category
// Phase 0 rules 1/2/4 already authorize dropping, per this project's Phase A precedent for the
// `inherit()` prototype-sharing bug).
// ============================================================================================

import { SVG } from "../util/svg";
import { Element as SvgElement } from "../util/svg/element";
import { find, offset } from "../util/dom";
import * as ColorUtil from "../util/color";
import * as HidpiUtil from "../util/canvas/hidpi";
import { Core, type CoreOptions } from "./core";

// ---- inlined `util/base.js` plain-data helpers (typeCheck/extend/deepClone) -------------------
// Same treatment as `util/dom.ts`/`base/draw.ts`: these are plain, reusable data utilities (not
// part of the `inherit()`/registry OOP machinery Phase 0 rules 1/4 drop), inlined per-file rather
// than imported from a shared module (no such shared module exists in this port).
type TypeCheckable = string | number | boolean | symbol | object | null | undefined | Function;

function typeCheck(type: string | string[], value: TypeCheckable): boolean {
  function check(t: string, v: TypeCheckable): boolean {
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

  if (typeof type === "object" && Array.isArray(type)) {
    for (let i = 0; i < type.length; i++) {
      if (check(type[i], value)) return true;
    }
    return false;
  }
  return check(type as string, value);
}

function isRecursive(value: any): boolean {
  return typeCheck("object", value);
}

function extend(origin: any, add: any, skip?: boolean): any {
  if (!typeCheck(["object", "function"], origin)) origin = {};
  if (!typeCheck(["object", "function"], add)) return origin;

  for (const key in add) {
    if (skip === true) {
      if (isRecursive(origin[key])) {
        extend(origin[key], add[key], skip);
      } else if (typeCheck("undefined", origin[key])) {
        origin[key] = add[key];
      }
    } else {
      if (isRecursive(origin[key])) {
        extend(origin[key], add[key], skip);
      } else {
        origin[key] = add[key];
      }
    }
  }

  return origin;
}

function deepClone(obj: any, emit?: Record<string, boolean>): any {
  let value: any = null;
  emit = emit || {};

  if (typeCheck("array", obj)) {
    value = new Array(obj.length);
    for (let i = 0, len = obj.length; i < len; i++) {
      value[i] = deepClone(obj[i], emit);
    }
  } else if (typeCheck("date", obj)) {
    value = obj;
  } else if (typeCheck("object", obj)) {
    value = {};
    for (const key in obj) {
      if (emit[key]) {
        value[key] = obj[key];
      } else {
        value[key] = deepClone(obj[key], emit);
      }
    }
  } else {
    value = obj;
  }

  return value;
}

/** Approximates `jui.defineOptions(Ctor, options)`: fills in only the keys missing from
 * `options`, recursively, walking `Ctor`'s ENTIRE static `setup()` chain leaf-first - `Ctor`'s own
 * `setup()` first, then each ancestor class's own `setup()` in turn (via the real JS static-side
 * prototype chain, `Object.getPrototypeOf(ctor)`), each merged with `skip: true` so an earlier
 * (more-leaf) level's value always wins and a later (more-ancestor) level only fills in whatever's
 * still missing. This is the same walk `Core.mergeOptions()` (`base/core.ts`) already does for
 * `Builder`/`Plane` themselves - `jui.defineOptions` itself lives in `base/manager.js` (unported),
 * but its well-documented behavior (`getOptions()`'s parent-chain walk in the real original) is
 * exactly this, not a one-level-only merge.
 *
 * FIX (previously a real, documented gap - now closed): this function used to call ONLY
 * `ctor.setup()` (the leaf class's own defaults), never walking up to e.g. `CoreBrush.setup()`/
 * `CoreWidget.setup()`/`Draw.setup()` - meaning any concrete `chart.brush.*`/`chart.widget.*` leaf
 * registered via `registerBrush`/`registerWidget` never automatically received `CoreBrush`'s
 * `clip: true`/`useEvent: true`/etc. or `CoreWidget`'s `render: false`/`index: 0` or `Draw`'s
 * `type: null`/`animate: false` defaults unless the leaf's own `setup()` duplicated them by hand.
 * Also used by `drawAxis()` below for `AxisImpl` (a single-level `Axis` class with no parent, so
 * unaffected in practice there) and by `drawBrush()`/`drawWidget()` for every registered brush/
 * widget (the actually-affected call sites). */
function defineOptions(ctor: { setup?: () => any }, options: any): any {
  const result = options || {};
  let current: any = ctor;

  while (typeof current === "function") {
    if (Object.prototype.hasOwnProperty.call(current, "setup") && typeof current.setup === "function") {
      extend(result, current.setup(), true);
    }
    current = Object.getPrototypeOf(current);
  }

  return result;
}

// ---- forward-reference stand-in for base/axis.js (concurrent, unported) -----------------------
/** The minimal shape `Builder` itself needs from a real `Axis` instance - satisfied by the actual
 * `Axis` class (`base/axis.ts`) once registered via `registerAxis()`. Kept narrow/decoupled so
 * `builder.ts` doesn't need to import `axis.ts` directly. */
export interface AxisLike {
  data?: any[];
  index?: number;
  reload(options: any): void;
}
/** Constructor shape `registerAxis()` expects - satisfied by the real `Axis` class. */
export interface AxisConstructor {
  new (chart: Builder, rawOptions: any, mergedOptions: any): AxisLike;
  setup?: () => any;
}
let AxisImpl: AxisConstructor | undefined;
/** Registers the real `Axis` implementation once `base/axis.ts` lands. See header comment. */
export function registerAxis(ctor: AxisConstructor): void {
  AxisImpl = ctor;
}

// ---- forward-reference registries for chart.brush.* / chart.widget.* / chart.theme.* / chart.icon.* ----
/** The minimal shape `Builder` needs from a registered brush/widget instance to drive its render
 * lifecycle - satisfied by `Draw` (and therefore every `CoreBrush`/`CoreWidget`/`CoreGrid`
 * subclass), kept narrow/decoupled so `builder.ts` doesn't need to import those directly. */
export interface DrawLike {
  chart: any;
  axis: any;
  svg: any;
  canvas: any;
  render(): any;
  isRender?(): boolean;
  format?: any;
}
/** Constructor shape `registerBrush()`/`registerWidget()` expect - satisfied by any class
 * extending `Draw` with a parameterless-or-trailing-args-ignored constructor (see `CoreBrush`'s
 * own header comment on why a 0-arg subclass still satisfies this 3-parameter type). */
export interface DrawConstructor {
  new (chart: Builder, axis: AxisLike | undefined, options: any): DrawLike;
  setup?: () => any;
}

const brushRegistry = new Map<string, DrawConstructor>();
const widgetRegistry = new Map<string, DrawConstructor>();
const themeRegistry = new Map<string, Record<string, any>>();
const iconRegistry = new Map<string, Record<string, string>>();

/** Registers a `chart.brush.<type>` constructor (e.g. `registerBrush('bar', BarBrush)`) - `type`
 * is what a chart's own `brush: [{ type: '<type>', ... }]` config looks up. */
export function registerBrush(type: string, ctor: DrawConstructor): void {
  brushRegistry.set(type, ctor);
}
/** Same as `registerBrush()`, for a `chart.widget.<type>` constructor. */
export function registerWidget(type: string, ctor: DrawConstructor): void {
  widgetRegistry.set(type, ctor);
}
/** Registers a named theme's full style-value object (e.g. `registerTheme('classic',
 * classicTheme)`) - looked up by a chart's own `theme: '<name>'` string option. */
export function registerTheme(name: string, style: Record<string, any>): void {
  themeRegistry.set(name, style);
}
/** Registers a named icon set's `{iconName: codepoint}` map (e.g. `registerIcon('classic',
 * classicIcons)`) - looked up by a chart's own `icon: { type: '<name>' }` option, and resolved
 * per-name by `Builder.icon()`. */
export function registerIcon(type: string, icons: Record<string, string>): void {
  iconRegistry.set(type, icons);
}

function requireBrush(type: string): DrawConstructor {
  const ctor = brushRegistry.get(type);
  if (!ctor) throw new Error(`JUI_CRITICAL_ERR: brush type '${type}' is not registered (call registerBrush first)`);
  return ctor;
}
function requireWidget(type: string): DrawConstructor {
  const ctor = widgetRegistry.get(type);
  if (!ctor) throw new Error(`JUI_CRITICAL_ERR: widget type '${type}' is not registered (call registerWidget first)`);
  return ctor;
}

let instanceCount = 0;

interface Padding {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

interface ChartArea {
  width: number;
  height: number;
  x: number;
  y: number;
  x2: number;
  y2: number;
}

/** The full config shape a `Builder.mount(root, options)` call accepts (`Builder.setup()`'s own
 * defaults are noted per-field below) - this is exactly what `<Chart>`'s own props assemble into
 * (see `jui-chart-vue`'s `Chart.vue`), one field per prop of the same name. */
export interface BuilderOptions extends CoreOptions {
  width: number | string;
  height: number | string;
  padding: number | Padding;
  theme: string | Record<string, any>;
  style: Record<string, any>;
  brush: any[];
  widget: any[];
  axis: any[];
  bind: any;
  format: ((...args: any[]) => any) | null;
  render: boolean;
  icon: { type: string; path: string | string[] | null };
  canvas: boolean;
  [key: string]: any;
}

/** The top-level engine object one real chart is built from - owns the root SVG/canvas surfaces,
 * the resolved theme, every axis/brush/widget instance, and the whole render lifecycle
 * (`render()`, `drawAxis()`/`drawBrush()`/`drawWidget()`). This is what `jui-chart-vue`'s
 * `<Chart>` component constructs and calls `.mount(root, options)` on (via its own `ChartBuilder`
 * subclass - see `jui-chart-vue`'s `register/chartMap.ts`) - see `BuilderOptions` for the full
 * config shape it accepts. `Builder` really `extends Core` (see this file's header comment) -
 * `root`/`options`/`event`/`index`/`timestamp`, `emit()`/`off()`/`setOption()`/`destroy()`, and
 * `mount()` all come from `Core` unmodified; only `on()` is overridden below (the original
 * redefines it too). */
export class Builder extends Core<BuilderOptions> {
  svg!: SVG;

  private _axis: AxisLike[] = [];
  private _brush: any[] = [];
  private _widget: any[] = [];
  private _defs: SvgElement | null = null;
  private _padding!: Padding;
  private _area!: ChartArea;
  private _theme: Record<string, any> = {};
  private _hash: Record<string, string> = {};
  private _initialize = false;
  private _options!: BuilderOptions;
  private _handler: { render: Array<(...args: any[]) => void>; renderAll: Array<(...args: any[]) => void> } = {
    render: [],
    renderAll: [],
  };
  private _canvas: { main: CanvasRenderingContext2D | null; buffer: CanvasRenderingContext2D | null; sub: CanvasRenderingContext2D | null } = {
    main: null,
    buffer: null,
    sub: null,
  };
  private _cache: Record<string, any> = {};

  private calculate(): void {
    const max = this.svg.size();

    const chartArea: ChartArea = {
      width: max.width - (this._padding.left + this._padding.right),
      height: max.height - (this._padding.top + this._padding.bottom),
      x: this._padding.left,
      y: this._padding.top,
      x2: 0,
      y2: 0,
    };

    // chart 크기가 마이너스일 경우 (엘리먼트가 hidden 상태)
    if (chartArea.width < 0) chartArea.width = 0;
    if (chartArea.height < 0) chartArea.height = 0;

    // _chart 영역 계산
    chartArea.x2 = chartArea.x + chartArea.width;
    chartArea.y2 = chartArea.y + chartArea.height;

    this._area = chartArea;
  }

  private drawBefore(): void {
    this._brush = deepClone(this._options.brush);
    this._widget = deepClone(this._options.widget);

    // defs 엘리먼트 생성
    this._defs = this.svg.defs();

    // 해쉬 코드 초기화
    this._hash = {};
  }

  private drawAxis(): void {
    if (!AxisImpl) {
      throw new Error("JUI_CRITICAL_ERR: no Axis implementation registered (call registerAxis first)");
    }

    // 엑시스 리스트 얻어오기
    const axisList: any[] = deepClone(this._options.axis, { data: true, origin: true });

    for (let i = 0; i < axisList.length; i++) {
      defineOptions(AxisImpl, axisList[i]);

      // 엑시스 인덱스 설정
      axisList[i].index = i;

      if (!this._axis[i]) {
        this._axis[i] = new AxisImpl(this, this._options.axis[i], axisList[i]);
      } else {
        this._axis[i].reload(axisList[i]);
      }
    }
  }

  private drawBrush(): void {
    const draws = this._brush;

    if (draws != null) {
      for (let i = 0; i < draws.length; i++) {
        const Obj = requireBrush(draws[i].type);

        // 브러쉬 기본 옵션과 사용자 옵션을 합침
        defineOptions(Obj, draws[i]);
        const axis = this._axis[draws[i].axis];

        // 타겟 프로퍼티 설정
        if (!draws[i].target) {
          const target: string[] = [];

          if (axis && axis.data && axis.data[0]) {
            for (const key in axis.data[0]) {
              target.push(key);
            }
          }

          draws[i].target = target;
        } else if (typeCheck("string", draws[i].target)) {
          draws[i].target = [draws[i].target];
        }

        // 브러쉬 인덱스 설정
        draws[i].index = i;

        // 브러쉬 기본 프로퍼티 정의
        const draw = new Obj(this, axis, draws[i]);
        draw.chart = this;
        draw.axis = axis;
        (draw as any).brush = draws[i];
        draw.svg = this.svg;
        draw.canvas = this._canvas.buffer;

        // 브러쉬 렌더링
        draw.render();
      }
    }
  }

  private drawWidget(isAll?: boolean): void {
    const draws = this._widget;

    if (draws != null) {
      for (let i = 0; i < draws.length; i++) {
        const Obj = requireWidget(draws[i].type);

        // 위젯 기본 옵션과 사용자 옵션을 합침
        defineOptions(Obj, draws[i]);

        // 위젯 인덱스 설정
        draws[i].index = i;

        // 위젯 기본 프로퍼티 정의
        const draw = new Obj(this, this._axis[0], draws[i]);
        draw.chart = this;
        draw.axis = this._axis[0];
        (draw as any).widget = draws[i];
        draw.svg = this.svg;
        draw.canvas = this._canvas.sub;

        // 위젯은 렌더 옵션이 false일 때, 최초 한번만 로드함 (연산 + 드로잉)
        // 하지만 isAll이 true이면, 강제로 연산 및 드로잉을 함 (테마 변경 및 리사이징 시)
        if (this._initialize && draw.isRender && !draw.isRender() && isAll !== true) {
          return;
        }

        const elem = draw.render();
        if (draw.isRender && !draw.isRender()) {
          this.svg.autoRender(elem, false);
        }
      }
    }
  }

  private setCommonEvents(elem: SvgElement | { on(type: string, handler: (e: any) => void): any }): void {
    let isMouseOver = false;
    const self = this;

    elem.on("click", (e: any) => {
      if (!checkPosition(e)) {
        self.emit("bg.click", [e]);
      } else {
        self.emit("chart.click", [e]);
      }
    });

    elem.on("dblclick", (e: any) => {
      if (!checkPosition(e)) {
        self.emit("bg.dblclick", [e]);
      } else {
        self.emit("chart.dblclick", [e]);
      }
    });

    elem.on("contextmenu", (e: any) => {
      if (!checkPosition(e)) {
        self.emit("bg.rclick", [e]);
      } else {
        self.emit("chart.rclick", [e]);
      }
      e.preventDefault();
    });

    elem.on("mousemove", (e: any) => {
      if (!checkPosition(e)) {
        if (isMouseOver) {
          self.emit("chart.mouseout", [e]);
          isMouseOver = false;
        }
        self.emit("bg.mousemove", [e]);
      } else {
        if (isMouseOver) {
          self.emit("chart.mousemove", [e]);
        } else {
          self.emit("chart.mouseover", [e]);
          isMouseOver = true;
        }
      }
    });

    elem.on("mousedown", (e: any) => {
      if (!checkPosition(e)) {
        self.emit("bg.mousedown", [e]);
      } else {
        self.emit("chart.mousedown", [e]);
      }
    });

    elem.on("mouseup", (e: any) => {
      if (!checkPosition(e)) {
        self.emit("bg.mouseup", [e]);
      } else {
        self.emit("chart.mouseup", [e]);
      }
    });

    elem.on("mouseover", (e: any) => {
      if (!checkPosition(e)) {
        self.emit("bg.mouseover", [e]);
      }
    });

    elem.on("mouseout", (e: any) => {
      if (!checkPosition(e)) {
        self.emit("bg.mouseout", [e]);
      }
    });

    elem.on("mousewheel", (e: any) => {
      if (!checkPosition(e)) {
        self.emit("bg.mousewheel", [e]);
      } else {
        self.emit("chart.mousewheel", [e]);
      }
    });

    function checkPosition(e: any): boolean | undefined {
      const pos = offset(self.root);
      const offsetX = e.pageX - (pos ? pos.left : 0);
      const offsetY = e.pageY - (pos ? pos.top : 0);

      e.bgX = offsetX;
      e.bgY = offsetY;
      e.chartX = offsetX - self.padding("left");
      e.chartY = offsetY - self.padding("top");

      if (e.chartX < 0) return;
      if (e.chartX > self.area("width")) return;
      if (e.chartY < 0) return;
      if (e.chartY > self.area("height")) return;

      return true;
    }
  }

  private resetCustomEvent(isAll?: boolean): void {
    for (let i = 0; i < this._handler.render.length; i++) {
      this.off(this._handler.render[i]);
    }
    this._handler.render = [];

    if (isAll === true) {
      for (let i = 0; i < this._handler.renderAll.length; i++) {
        this.off(this._handler.renderAll[i]);
      }
      this._handler.renderAll = [];
    }
  }

  private createGradient(obj: any, hashKey?: string): string {
    if (!typeCheck("undefined", hashKey) && this._hash[hashKey as string]) {
      return "url(#" + this._hash[hashKey as string] + ")";
    }

    const id = "gradient-" + this.index;
    obj.attr.id = id;

    const g = SVG.createObject(obj);
    this._defs!.append(g);

    if (!typeCheck("undefined", hashKey)) {
      this._hash[hashKey as string] = id;
    }

    return "url(#" + id + ")";
  }

  private createPattern(obj: any): string | false {
    if (typeCheck("string", obj)) {
      obj = obj.replace("url(#", "").replace(")", "");

      if (this._hash[obj]) {
        return "url(#" + obj + ")";
      }

      // already pattern id
      if (obj.indexOf("pattern-") === -1) {
        return false;
      }

      const arr = obj.split("-");
      const method = arr.pop();
      const patternKey = arr.join(".");

      // Original: `JUI.include("chart." + arr.join("."))` - a registry lookup for a named
      // pattern-definition module. No such registry exists in this port; nothing populates one,
      // so (as originally documented as a plugin extension point) this always misses here.
      const pattern = themeRegistry.get(patternKey) as any;
      if (!pattern) {
        return false;
      }

      let patternElement = pattern[method as string];
      if (typeof patternElement === "function") {
        patternElement = patternElement.call(patternElement);
      }

      if (patternElement.attr && !patternElement.attr.id) {
        patternElement.attr.id = obj;
      }

      patternElement = SVG.createObject(patternElement);
      this._defs!.append(patternElement);
      this._hash[obj] = obj;

      return "url(#" + obj + ")";
    } else {
      obj.attr.id = obj.attr.id || "pattern-" + this.index;

      if (this._hash[obj.attr.id]) {
        return "url(#" + obj.attr.id + ")";
      }

      const patternElement = SVG.createObject(obj);
      this._defs!.append(patternElement);
      this._hash[obj.attr.id] = obj.attr.id;

      return "url(#" + obj.attr.id + ")";
    }
  }

  private createColor(color: any): string {
    if (typeCheck("undefined", color)) {
      return "none";
    }

    if (typeCheck("object", color)) {
      if (color.type === "pattern") {
        return this.createPattern(color) as string;
      }
      return this.createGradient(color);
    }

    if (typeof color === "string") {
      const url = this.createPattern(color);
      if (url) {
        return url;
      }
    }

    const parsedColor = ColorUtil.parse(color);
    if (parsedColor === color) return color;

    return this.createGradient(parsedColor, color);
  }

  private setThemeStyle(theme: any): void {
    const style: Record<string, any> = {};

    if (typeCheck("string", theme)) {
      extend(style, themeRegistry.get(theme) || {});
      extend(style, this._options.style);
    } else if (typeCheck("object", theme)) {
      extend(this._theme, this._options.style);
      extend(this._theme, theme);
      extend(style, this._theme);
    }

    this._theme = style;
  }

  private setDefaultOptions(): void {
    // 일부 옵션을 제외하고 클론
    this._options = deepClone(this.options, { data: true, bind: true });

    const padding = this._options.padding;

    if (typeCheck("integer", padding)) {
      this._padding = { left: padding as number, right: padding as number, bottom: padding as number, top: padding as number };
    } else if (typeCheck("object", padding)) {
      this._padding = padding as Padding;
    } else {
      // BUGFIX (genuine engine gap, not a preserved quirk): the original has no real special-case
      // for non-object/non-integer `padding` values (e.g. the legacy magic string `"empty"`, used
      // by several real site demos - `mini_bar`/`mini_column`/`mini_line`/`fill_custom_gauge` -
      // clearly intending "no padding"). It relies entirely on `padding.left || 0`-style reads
      // elsewhere treating a missing property as 0 - but `calculate()` below does `this._padding.left
      // + this._padding.right` (a real addition, not `||`'d), which is `undefined + undefined =
      // NaN` for any non-object value, not 0 - propagating into `<rect width="NaN">` and a hard
      // console error. Node/hand-verified this NaN happens in the real shipped `chart.min.js` too
      // (identical `x.left+x.right` pattern) - so "empty" never actually worked there either; this
      // normalizes any such value to explicit zero padding, the only sensible reading of "empty".
      this._padding = { left: 0, right: 0, bottom: 0, top: 0 };
    }

    if (!typeCheck("array", this._options.axis)) {
      this._options.axis = [this._options.axis];
    }
    if (!typeCheck("array", this._options.brush)) {
      this._options.brush = [this._options.brush];
    }
    if (!typeCheck("array", this._options.widget)) {
      this._options.widget = [this._options.widget];
    }

    if (this._options.axis.length === 0) {
      this._options.axis.push({ data: [] });
    }

    for (let i = 0; i < this._options.axis.length; i++) {
      const axis = this._options.axis[i];
      extend(axis, this._options.axis[axis.extend], true);
    }
  }

  /** The marker attribute used to find/tag the `<style>` this method injects - see this method's
   * own doc comment for why (deduplication) it's needed, and why a marker attribute rather than
   * re-parsing an existing rule's `cssText`/`font-family`. */
  private static readonly ICON_STYLE_MARKER = "data-jui-icon-type";

  /**
   * Injects an `@font-face` rule for `this._options.icon.type`/`.path` so `chart.text()`'s
   * `{key}`-style icon placeholders (`parseIconInText()`) have a font backing their Private-Use-
   * Area codepoints. Deviates from the real original engine's own technique in two ways - not a
   * routine port:
   *
   * 1. **No `CSSStyleSheet.insertRule()`.** The real original (`base/builder.js`) - and this port,
   *    until now, byte-for-byte identically - creates an EMPTY `<style>`, appends it to
   *    `document.head`, THEN calls `.sheet.insertRule(rule, 0)` on it a moment later: two separate
   *    CSSOM mutations. This method instead sets the FULL rule text via `.textContent` BEFORE the
   *    element is appended - one atomic mutation, and a strictly more conventional way to build a
   *    stylesheet than mutating an already-live one. **This change is NOT a confirmed fix for
   *    anything** - see the OPEN ISSUE note below.
   * 2. **A deduplication guard, CONFIRMED FIXED.** Neither the real original engine nor this port
   *    (until now) had any guard against calling this more than once for the same `icon.type` -
   *    `Builder.init()` (this method's own single call site) runs unconditionally on every
   *    `mount()`, and a downstream consumer that constructs a fresh `Builder` per reactive
   *    re-render (e.g. `jui-chart-vue`'s `<Chart>`, which never cleans up `document.head` on
   *    unmount/remount) would accumulate one orphaned `<style>`/`@font-face` per mount
   *    indefinitely - confirmed empirically as 44 duplicate entries on a 44-`<Chart>` demo page,
   *    and confirmed fixed (down to exactly 1) after this change. A marker attribute (not
   *    re-parsing an existing rule's serialized `cssText`, which is both fragile - the CSSOM can
   *    normalize/reorder property text - and, in this project's own test environment, doesn't even
   *    round-trip an `@font-face`'s `src` value) lets this method cheaply recognize "a style for
   *    this exact `icon.type` already exists" and skip re-injecting a redundant, identical rule.
   *
   * **OPEN ISSUE, NOT FIXED - icon glyphs still render as "tofu" (missing-glyph boxes) in real
   * Chromium, despite this change.** An earlier investigation claimed switching away from
   * `insertRule()` fixed this (based on an isolated repro that appeared to confirm it), but a
   * later, more rigorous controlled A/B re-test DISPROVED that: `insertRule()` and this method's
   * current `.textContent` technique both paint the glyph correctly OR both fail, depending on
   * something else entirely (bisected to an unrelated artifact of the minimal repro's own HTML
   * structure, not present in a real app's `index.html`) - the original "confirmed" finding was a
   * confounded test, not a real fix. The real root cause of the glyph-painting failure is UNKNOWN.
   * Every other layer is independently confirmed correct: codepoint resolution, font file loading
   * (`document.fonts` reports `status: "loaded"`), and the `@font-face` rule's own presence/content
   * in `document.head` (exactly once, per the dedup fix above). This method is kept as written
   * (dropping `insertRule()` is at worst neutral, and the dedup guard is independently valuable)
   * but should NOT be read as having resolved glyph painting - see `jui-chart-vue`'s
   * `register/icon/classic.ts` header comment for the consumer-facing version of this same note.
   *
   * Both changes are additive to the real original's OWN behavior wherever `icon.path` was never
   * configured at all (the existing `typeCheck(["string","array"], icon.path)` early return, kept
   * unchanged below) - i.e. nothing changes for a chart that doesn't use icon fonts.
   */
  private setVectorFontIcons(): void {
    const icon = this._options.icon;
    if (!typeCheck(["string", "array"], icon.path)) return;

    if (document.head.querySelector(`style[${Builder.ICON_STYLE_MARKER}="${icon.type}"]`)) return;

    const pathList: string[] = typeCheck("string", icon.path) ? [icon.path as string] : (icon.path as string[]);
    const urlList: string[] = [];

    for (let i = 0; i < pathList.length; i++) {
      const path = pathList[i];
      let url = "url(" + path + ") ";

      if (path.indexOf(".eot") !== -1) {
        url += "format('embedded-opentype')";
      } else if (path.indexOf(".woff") !== -1) {
        url += "format('woff')";
      } else if (path.indexOf(".ttf") !== -1) {
        url += "format('truetype')";
      } else if (path.indexOf(".svg") !== -1) {
        url += "format('svg')";
      }

      urlList.push(url);
    }

    const fontFace = "font-family: " + icon.type + "; font-weight: normal; font-style: normal; src: " + urlList.join(",");
    const rule = "@font-face {" + fontFace + "}";

    const style = document.createElement("style");
    style.setAttribute(Builder.ICON_STYLE_MARKER, icon.type);
    // Full rule text set BEFORE appending to `document.head` - see this method's own doc comment,
    // point 1, for why this exact ordering (not "append then set `textContent`", which reproduces
    // the same broken two-step timing as the dropped `insertRule()` technique) is load-bearing.
    style.textContent = rule;
    document.head.appendChild(style);
  }

  private parseIconInText(text: string): string {
    const regex = /{([^{}]+)}/g;
    const result = text.match(regex);

    if (result != null) {
      for (let i = 0; i < result.length; i++) {
        const key = result[i].substring(1, result[i].length - 1);
        text = text.replace(result[i], this.icon(key));
      }
    }

    return text;
  }

  private getCanvasRealSize(): { width: number; height: number } {
    const size = this.svg.size();

    return {
      width: typeCheck("integer", this._options.width) ? (this._options.width as number) : size.width,
      height: typeCheck("integer", this._options.height) ? (this._options.height as number) : size.height,
    };
  }

  private initRootStyles(root: HTMLElement): void {
    root.style.position = "relative";
    (root.style as any).userSelect = "none";
    (root.style as any).webkitUserSelect = "none";
    (root.style as any).MozUserSelect = "none";
    root.setAttribute("unselectable", "on");
  }

  private initCanvasElement(): void {
    const size = this.getCanvasRealSize();
    const ratio = HidpiUtil.pixelRatio;

    for (const key of Object.keys(this._canvas) as Array<keyof typeof this._canvas>) {
      const elem = document.createElement("CANVAS") as HTMLCanvasElement;
      elem.width = size.width * ratio;
      elem.height = size.height * ratio;
      elem.style.position = "absolute";
      elem.style.left = "0px";
      elem.style.top = "0px";
      elem.style.width = `${size.width}px`;
      elem.style.height = `${size.height}px`;

      if (elem.getContext) {
        this._canvas[key] = elem.getContext("2d");
        if (this._canvas[key]) {
          HidpiUtil.apply(this._canvas[key] as CanvasRenderingContext2D);
        }

        if (key !== "buffer") {
          this.root.appendChild(elem);
        }
      }

      if (key === "sub") {
        (elem as any).on = function (type: string, handler: (e: any) => void) {
          const callback = function (this: any, e: any) {
            if (typeof handler === "function") {
              handler.call(this, e);
            }
          };
          elem.addEventListener(type, callback, false);
          return this;
        };
      }
    }
  }

  private resetCanvasElement(type: "main" | "buffer" | "sub"): void {
    const ratio = HidpiUtil.pixelRatio;
    const size = this.getCanvasRealSize();
    const context = this._canvas[type]!;

    context.restore();
    context.clearRect(0, 0, size.width * ratio, size.height * ratio);
    context.save();

    if (type === "main") {
      context.translate(this._area.x, this._area.y);
    }
  }

  /**
   * @method init
   * Lifecycle hook - in the real engine, called by `base/core.js`'s factory right after it wires
   * `root`/`options`. Here, call `mount(root, options)` instead of calling this directly.
   */
  init(): void {
    // TODO: 차트 인덱스 설정 - replaces `JUI.size()` (a global registry count) with a private
    // per-module incrementing counter; preserves the "unique, incrementing per-instance id"
    // behavior without the registry it rode on (Phase 0 rule 1/4 territory).
    this.index = instanceCount++;

    this.setDefaultOptions();
    this.setThemeStyle(this._options.theme);
    this.initRootStyles(this.root);

    this.svg = new SVG(this.root, {
      width: this._options.width,
      height: this._options.height,
      "buffered-rendering": "dynamic",
    });

    if (this._options.canvas) {
      this.initCanvasElement();
      const canvases = find(this.root, "CANVAS");
      this.setCommonEvents(canvases[1] as any as { on(type: string, handler: (e: any) => void): any });
    } else {
      this.setCommonEvents(this.svg.root);
    }

    this.setVectorFontIcons();

    this.render();
  }

  /** Reads one of the chart's own resolved config buckets - the whole bucket when `key` is
   * omitted/not found in it, or one keyed entry within it (`get("brush", 0)` for the first
   * brush's own config, `get("area", "width")` for one area-box field, etc). Used by
   * `chart.widget.tooltip`/`chart.widget.legend` (via `WidgetChart.get`) to read another
   * brush/widget's own config, e.g. the brush a tooltip is attached to. */
  get(type: "axis" | "brush" | "widget" | "padding" | "area", key?: any): any {
    const obj: Record<string, any> = {
      axis: this._axis,
      brush: this._brush,
      widget: this._widget,
      padding: this._padding,
      area: this._area,
    };

    if (obj[type][key]) {
      return obj[type][key];
    }

    return obj[type];
  }

  /** Every array (no `key`) or one `Axis` instance by its index in the chart's own `axis` config
   * array - the same array a brush/widget's own numeric `axis` field indexes into. */
  axis(key?: number): any {
    return arguments.length === 0 ? this._axis : this._axis[key as number];
  }

  /** The whole plot-area box (no `key`: `{x, y, x2, y2, width, height}`) or one of its fields
   * (`key`: `"width"`/`"height"`/etc) - the chart's outer `width`/`height` minus `padding` on each
   * side, i.e. where axes/brushes/widgets actually get drawn. */
  area(key?: string): any {
    return key === undefined || typeCheck("undefined", (this._area as any)[key]) ? this._area : (this._area as any)[key];
  }

  /** The whole resolved padding object (no `key`) or one side's value (`key`: `"top"`/`"bottom"`/
   * `"left"`/`"right"`) - the `padding` prop/option after `Builder.setup()`'s own
   * `{top:50,bottom:50,left:50,right:50}` default is merged in. */
  padding(key?: string): any {
    return key === undefined || typeCheck("undefined", (this._padding as any)[key]) ? this._padding : (this._padding as any)[key];
  }

  /** Resolves a color for a brush/widget to use, from the active theme's own `colors` palette
   * array (cycling via `nextColor()` below once past the array's own length) - or, when `key` is
   * already a literal color string, returns it verbatim. A single-argument call
   * (`color(seriesIndex)`) is the common case; the 2-argument form additionally supports an
   * explicit per-call `colors` override array/object (a brush's own `colors` config) instead of
   * the theme's default palette. If the resolved color happens to be a registered gradient/pattern
   * name (`this._hash`, populated by `createColor()`'s own gradient/pattern-descriptor handling),
   * returns the `url(#...)` SVG reference to it instead of the raw color string. */
  color(key?: any, colors?: any[]): string {
    let color: any = null;
    const self = this;

    if (arguments.length === 1) {
      if (typeCheck("string", key)) {
        color = key;
      } else if (typeCheck("integer", key)) {
        color = nextColor(key);
      }
    } else {
      if (typeCheck(["array", "object"], colors)) {
        color = (colors as any)[key];
        if (typeCheck("integer", color)) {
          color = nextColor(color);
        }
      } else {
        color = nextColor();
      }
    }

    if (this._hash[color]) {
      return "url(#" + this._hash[color] + ")";
    }

    function nextColor(newIndex?: number): any {
      const c = self._theme["colors"];
      const index = newIndex !== undefined ? newIndex : key;
      return index > c.length - 1 ? c[c.length - 1] : c[index];
    }

    return this.createColor(color);
  }

  /** Resolves a `{key}`-style icon placeholder (`chart.text()`'s own `parseIconInText()` is what
   * actually scans text for these) to the real Private-Use-Area codepoint string registered for
   * that name under the chart's own `icon.type` (`registerIcon(type, icons)` - e.g.
   * `register/icon/classic.ts`'s `classicIcons`). Throws if `icon.type` itself was never
   * registered - the codepoint map, not the actual font FILE (`icon.path`, a separate concern -
   * see `Chart.vue`'s own `icon` prop doc), is what's missing when this throws. */
  icon(key: string): string {
    const icons = iconRegistry.get(this._options.icon.type);
    if (!icons) {
      throw new Error(`JUI_CRITICAL_ERR: icon type '${this._options.icon.type}' is not registered (call registerIcon first)`);
    }
    return icons[key];
  }

  /** Draws one `<text>` element via `this.svg.text(attr, content)`, after resolving any
   * `{key}`-style icon placeholder in a string `textOrCallback` through `parseIconInText()` first
   * (a function value is passed straight through unresolved - `SVG.text()`'s own callback-content
   * form). An omitted `textOrCallback` draws an empty text node (not `undefined`/`"undefined"`). */
  text(attr: Record<string, any>, textOrCallback?: string | ((this: any) => void)): any {
    if (typeCheck("string", textOrCallback)) {
      textOrCallback = this.parseIconInText(textOrCallback as string);
    } else if (typeCheck("undefined", textOrCallback)) {
      textOrCallback = "";
    }

    return this.svg.text(attr, textOrCallback as any);
  }

  /** Draws one `<text>` (via `this.text()` above, so icon placeholders resolve the same way) per
   * entry in `texts`, stacked vertically - each line's own `y` offset is `index *
   * (attr["font-size"] ?? 10) * lineBreakRate` (default line spacing when `lineBreakRate` is
   * omitted: exactly one font-size per line), all inside one returned `<g>`. A non-string entry in
   * `texts` is silently skipped (no line drawn for it, but the index gap still shifts every LATER
   * line's own `y` the same as if it had been a real line). */
  texts(attr: Record<string, any>, texts: string[], lineBreakRate?: number): any {
    const g = this.svg.group();

    for (let i = 0; i < texts.length; i++) {
      if (typeCheck("string", texts[i])) {
        const size = (attr["font-size"] || 10) * (lineBreakRate || 1);

        g.append(
          this.svg.text(extend({ y: i * size }, attr, true), this.parseIconInText(texts[i]))
        );
      }
    }

    return g;
  }

  /** The whole active theme object (no arguments), one style value by key (`theme("barFontSize")`
   * - the common case, what every registered brush/widget's own `this.chart.theme(key)` call
   * uses), or (3-argument form) a ternary style pick: `theme(condition, keyIfTrue, keyIfFalse)`
   * resolves whichever of the two keys `condition` selects. Any key whose name contains `"Color"`
   * is additionally run through `createColor()` (so a theme's own gradient/pattern-descriptor
   * color values resolve to a real `url(#...)` reference here too, not just via `color()` above) -
   * this is why `register/theme/types.ts`'s `ChartThemeOptions` types every `*Color` field as a
   * plain `string`, not the richer gradient/pattern descriptor shape some colors config accepts:
   * this method already resolves that for the caller. */
  theme(key?: any, value?: any, value2?: any): any {
    if (arguments.length === 0) {
      return this._theme;
    } else if (arguments.length === 1) {
      if (key.indexOf("Color") > -1 && this._theme[key] != null) {
        return this.createColor(this._theme[key]);
      }
      return this._theme[key];
    } else if (arguments.length === 3) {
      const val = key ? value : value2;
      if (val.indexOf("Color") > -1 && this._theme[val] != null) {
        return this.createColor(this._theme[val]);
      }
      return this._theme[val];
    }
  }

  /** The chart-level `format` option, applied to `args` (`this` bound to the `Builder`) when it's
   * a function - the fallback `Draw.format()` uses for a brush/widget that doesn't define its own
   * `format`. With no `format` option configured, returns `args[0]` unchanged (a no-op pass-
   * through, not `undefined`). Called with zero arguments returns `undefined` regardless. */
  format(...args: any[]): any {
    if (args.length === 0) return;
    const callback = this._options.format;

    if (typeCheck("function", callback)) {
      return (callback as (...a: any[]) => any).apply(this, args);
    }

    return args[0];
  }

  /** Registers `callback` for a custom event `type` (case-insensitive, matched by `emit()` -
   * inherited from `Core`, unmodified here) - same as `Core.on()`, plus an optional `resetType`:
   * `"render"`/`"renderAll"` makes this a SELF-EXPIRING listener, additionally tracked in
   * `this._handler.render`/`.renderAll` - it responds to every matching `emit()` normally, right
   * up until the next `render()` (for `"render"`) or `render(true)` (for `"renderAll"` too) call,
   * whose own `resetCustomEvent()` step `off()`s (fully deregisters, doesn't invoke) every handler
   * queued that way. Useful for a one-render-cycle-scoped listener that shouldn't keep firing
   * after the chart redraws. */
  on(type: string, callback: (...args: any[]) => void, resetType?: "render" | "renderAll"): any {
    if (!typeCheck("string", type) || !typeCheck("function", callback)) return;

    // PRESERVED QUIRK: unlike `Core.on()` (which sets `unique: false`), the original `builder.js`
    // pushes its event entries WITHOUT a `unique` property at all (Node/hand-verified against the
    // literal original) - harmless in practice since nothing anywhere reads `.unique` (see
    // `core.ts`'s `CoreEvent` doc comment), but kept exactly as-is rather than "completed" to match
    // `Core.on()`'s shape.
    this.event.push({ type: type.toLowerCase(), callback } as any);

    if (resetType === "render" || resetType === "renderAll") {
      this._handler[resetType].push(callback);
    }
  }

  /** Re-renders the whole chart from its current option state: resets the SVG/canvas surfaces
   * (and any `"render"`/`"renderAll"`-scoped `on()` listeners - see that method), recalculates
   * layout, then redraws axes, brushes, and widgets in that order, finally re-applying the theme's
   * `fontFamily`/`backgroundColor` to the root and emitting a `"render"` event. `isAll` additionally
   * resets the `sub` canvas layer (canvas-family widgets) and `"renderAll"`-scoped listeners -
   * plain `render()`/`render(false)` leaves both alone, a lighter "just redraw with what's there"
   * pass. The very FIRST call (before `this._initialize` is set) always runs regardless of the
   * `render` option (see `isRender()`'s own doc) - every call after that respects it. */
  render(isAll?: boolean): void {
    this.svg.reset(isAll);
    this.resetCustomEvent(isAll);
    this.calculate();

    if (this.options.canvas) {
      this.resetCanvasElement("main");
      this.resetCanvasElement("buffer");
      if (isAll) {
        this.resetCanvasElement("sub");
      }
    }

    this.drawBefore();
    this.drawAxis();
    this.drawBrush();
    this.drawWidget(isAll);

    if (this.options.canvas) {
      this._canvas.main!.drawImage((this._canvas.buffer as any).canvas, 0, 0);
    }

    this.svg.root.css({
      "font-family": this.theme("fontFamily") + "," + this._options.icon.type,
      background: this.theme("backgroundColor"),
    });

    this.svg.render(isAll);

    this.emit("render", [this._initialize]);

    this._initialize = true;
  }

  /** Appends `elem` into the chart's shared `<defs>` element (gradients/patterns/clip-paths a
   * brush/widget/theme registers via `createGradient()`/`createPattern()`, not user-facing on its
   * own). */
  appendDefs(elem: SvgElement): void {
    this._defs!.append(elem);
  }

  /** Appends one more brush config to the end of the chart's own `brush` array and re-renders
   * (only if `isRender()` is currently true - see that method) - the imperative equivalent of
   * adding an entry to `<Chart :brush="[...]">`'s own array reactively. */
  addBrush(brush: any): void {
    this._options.brush.push(brush);
    if (this.isRender()) this.render();
  }

  /** Removes the brush at `index` from the chart's own `brush` array and re-renders (only if
   * `isRender()` is currently true). */
  removeBrush(index: number): void {
    this._options.brush.splice(index, 1);
    if (this.isRender()) this.render();
  }

  /** Updates the brush config at `index` and re-renders (only if `isRender()` is currently true).
   * `isReset: true` REPLACES the whole config object; omitted/`false` shallow-MERGES `brush`'s own
   * keys onto the existing config instead (`extend()`'s in-place merge, not a reactive Vue prop
   * write - matches `Builder.updateBrush()`'s WidgetChart re-declaration `chart.widget.legend`/
   * `chart.widget.tooltip` call to toggle another brush's own config from a widget). */
  updateBrush(index: number, brush: any, isReset?: boolean): void {
    if (isReset === true) {
      this._options.brush[index] = brush;
    } else {
      extend(this._options.brush[index], brush);
    }
    if (this.isRender()) this.render();
  }

  /** Same as `addBrush()` above, but for the chart's own `widget` array. */
  addWidget(widget: any): void {
    this._options.widget.push(widget);
    if (this.isRender()) this.render();
  }

  /** Same as `removeBrush()` above, but for the chart's own `widget` array. */
  removeWidget(index: number): void {
    this._options.widget.splice(index, 1);
    if (this.isRender()) this.render();
  }

  /** Same replace-vs-merge split as `updateBrush()` above, but for the chart's own `widget`
   * array. */
  updateWidget(index: number, widget: any, isReset?: boolean): void {
    if (isReset === true) {
      this._options.widget[index] = widget;
    } else {
      extend(this._options.widget[index], widget);
    }
    if (this.isRender()) this.render();
  }

  /** Swaps the active theme (a registered theme name, or a plain style-value object merged the
   * same way `setThemeStyle()`'s own string-vs-object branch handles the initial `theme`
   * option/prop) and, only if `isRender()` is currently true, does a FULL re-render
   * (`render(true)`, not plain `render()`) - a theme change touches every drawn element's own
   * style, unlike `addBrush()`/`updateWidget()`/etc's lighter `render()`. */
  setTheme(theme: any): void {
    this.setThemeStyle(theme);
    if (this.isRender()) this.render(true);
  }

  /** With both arguments, sets the chart's own `width`/`height` option first; either way, applies
   * the resolved size to the root `SVG` (`this.svg.size(...)`) and, when the chart was mounted
   * with `canvas: true`, resizes every `<canvas>` element to match (accounting for
   * `HidpiUtil.pixelRatio`, so canvas content stays crisp on a high-DPI display) - then, only if
   * `isRender()` is currently true, does a full `render(true)`. Called with no arguments, this
   * re-measures/re-applies whatever
   * `width`/`height` already is (e.g. after the container's own CSS size changed) rather than
   * setting a new one - see `resize()` below, which does exactly that on window resize. */
  setSize(width?: number, height?: number): void {
    if (arguments.length === 2) {
      this._options.width = width as number;
      this._options.height = height as number;
    }

    this.svg.size(this._options.width as number, this._options.height as number);

    if (this._options.canvas) {
      const ratio = HidpiUtil.pixelRatio;
      const list = find(this.root, "CANVAS");
      const size = this.getCanvasRealSize();

      for (let i = 0; i < list.length; i++) {
        const el = list[i] as HTMLCanvasElement;
        el.width = size.width * ratio;
        el.height = size.height * ratio;
        el.style.width = `${size.width}px`;
        el.style.height = `${size.height}px`;
      }
    }

    if (this.isRender()) this.render(true);
  }

  // PRESERVED BUG (not fixed): the `if` branch's condition (`width == "100%" || height ==
  // "100%"`) is dead - both branches `return true`, so `isFullSize()` ALWAYS returns `true`
  // regardless of the configured width/height. Node/hand-verified against the literal original.
  isFullSize(): boolean {
    if (this._options.width === "100%" || this._options.height === "100%") return true;
    return true;
  }

  /** Meant to be called on a window/container resize - re-measures/re-applies the chart's own
   * `width`/`height` via `setSize()` (only when `isFullSize()`, i.e. a percentage-based size that
   * actually needs re-measuring - see that method's own "PRESERVED BUG" note: it always returns
   * `true` in the current source, so this check is currently a no-op gate). **PRESERVED QUIRK**:
   * the trailing `if (!this.isRender())` is inverted from what the name suggests - it forces a
   * full `render(true)` specifically when `isRender()` is FALSE (i.e. when the `render` option is
   * off), not when it's on; kept exactly as the original engine has it, not "fixed" to `if
   * (this.isRender())`. */
  resize(): void {
    if (this.isFullSize()) {
      this.setSize();
    }
    if (!this.isRender()) {
      this.render(true);
    }
  }

  /** Whether the chart should currently auto-re-render on an imperative call (`axis(i).update()`/
   * `.zoom()`/etc, `addBrush()`/`updateWidget()`/etc above) - the resolved `render` option, EXCEPT
   * the very first check ever made (before this chart's first real `render()` call sets
   * `this._initialize`), which always returns `true` regardless of the configured `render` option
   * - so the chart's own initial draw is never skippable, only subsequent auto-renders are. */
  isRender(): boolean {
    return !this._initialize ? true : this._options.render;
  }

  /** Stores an arbitrary value under `key` in the chart's own private cache
   * (`chart.getCache`/`setCache` - a brush/widget's own per-instance state that needs to survive
   * across re-renders without living on the brush/widget config object itself, e.g.
   * `canvas.activebubble`'s own running bubble-simulation state). Cleared only by constructing a
   * new `Builder` - `render()` never touches it. */
  setCache(key: string, value: any): void {
    this._cache[key] = value;
  }

  /** Reads back a value `setCache()` stored under `key`, or `defValue` (default: `undefined`) if
   * nothing was ever stored there. */
  getCache(key: string, defValue?: any): any {
    if (this._cache[key] === undefined) return defValue;
    return this._cache[key];
  }

  static setup(): BuilderOptions {
    return {
      width: "100%",
      height: "100%",
      padding: { top: 50, bottom: 50, left: 50, right: 50 },
      theme: "classic",
      style: {},
      brush: [],
      widget: [],
      axis: [],
      bind: null,
      format: null,
      render: true,
      icon: { type: "classic", path: null },
      canvas: false,
    };
  }
}
