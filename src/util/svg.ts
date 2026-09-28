// Port of juijs-graph's `src/util/svg.js` ("util.svg").
//
// The top-level SVG document manager: owns the root `<svg>` element plus two permanent child
// `<g>` groups (`main` - the normally-rendered/auto-cleared content, `sub` - content that opts
// out of the per-`render()` clear cycle via `autoRender(elem, false)`), and drives the actual
// DOM-append pass (`render()`/`appendAll()`) that the whole `util/svg/*` builder tree only
// stages in-memory (`Element.children`) until this runs. No jui-chart-vue reference exists for
// this file (Vue SFC templates replace this entirely there) - full independent port.

import { SVG3d } from "./svg/base3d";
import { Element as SvgElement } from "./svg/element";
import { TransElement } from "./svg/element.transform";
import { PathElement } from "./svg/element.path";
import { PolyElement } from "./svg/element.poly";

type Attr = Record<string, any> | null | undefined;

/** A plain-object description of an element tree, as consumed by `SVG.createObject()`. */
interface CreateObjectSpec {
  type: string;
  attr?: Attr;
  children?: CreateObjectSpec[];
}

// Inlined from `util/base.js`'s `browser` feature-sniff object (Phase 0 rule 4 drops
// `util/base.js`'s registry/OOP machinery wholesale, but this file's own `toDataURI()` genuinely
// branches on `browser.mozilla`/`browser.msie` - real, observable behavior, not dead code, so
// verified and kept per rule 4's own "don't assume every call site is dead" instruction). Only
// the two flags this file actually reads are reproduced (not `webkit`/`isTouch`, unused here).
const browser = {
  mozilla: typeof window !== "undefined" && typeof (window as any).mozInnerScreenX !== "undefined",
  msie: typeof window !== "undefined" && window.navigator.userAgent.indexOf("Trident") !== -1,
};

/**
 * Root SVG document manager. Construct with the real DOM element to mount the `<svg>` root into.
 */
export class SVG extends SVG3d {
  /** The root `<svg>` element wrapper (also stored, as in the original, for public access). */
  root!: SvgElement;

  private mainGroup!: TransElement;
  private subGroup!: TransElement;
  private parentStack: Record<number, SvgElement> = {};
  private depth = 0;
  private isFirst = false;
  private rootElem: Element;

  constructor(rootElem: Element, rootAttr?: Attr) {
    super();
    this.rootElem = rootElem;
    this.initRoot(rootAttr);
  }

  private initRoot(rootAttr?: Attr): void {
    this.root = new SvgElement();
    this.mainGroup = new TransElement();
    this.subGroup = new TransElement();

    this.root.create("svg", rootAttr);
    this.mainGroup.create("g");
    this.subGroup.create("g");

    this.mainGroup.translate(0.5, 0.5);
    this.subGroup.translate(0.5, 0.5);

    this.rootElem.appendChild(this.root.element);
    this.root.append(this.mainGroup);
    this.root.append(this.subGroup);
  }

  private appendAll(target: SvgElement): void {
    const childs = target.children;

    // 엘리먼트 렌더링 순서 정하기 (decide element render order)
    if (this.isOrderingChild(childs)) {
      childs.sort((a, b) => a.order - b.order);
    }

    for (let i = 0, len = childs.length; i < len; i++) {
      const child = childs[i];

      if (child) {
        if (child.children.length > 0) {
          this.appendAll(child);
        }

        // PathElement & PathSymbolElement & PathRectElement & PolyElement auto join
        if (child instanceof PathElement || child instanceof PolyElement) {
          child.join();
        }

        if (child.parent === target) {
          target.element.appendChild(child.element);
        }
      }
    }
  }

  /** Only strips listeners from a child that's genuinely still connected to the live DOM (a
   * stale element from a previous render) - see `clear()`'s own doc comment for why this guard,
   * and its call-BEFORE-removal ordering there, both matter. */
  private removeEventAll(target: SvgElement): void {
    const childs = target.children;

    for (let i = 0, len = childs.length; i < len; i++) {
      const child = childs[i];

      if (child && child.element.parentNode) {
        child.off();

        if (child.children.length > 0) {
          this.removeEventAll(child);
        }
      }
    }
  }

  /** true when at least one direct child has an explicit (> 0) render order. */
  private isOrderingChild(childs: SvgElement[]): boolean {
    for (let i = 0, len = childs.length; i < len; i++) {
      if (childs[i].order > 0) {
        return true;
      }
    }

    return false;
  }

  /**
   * Overrides `SVGBase.create()`: actually attaches the built element into the current group
   * (`main`, or whichever ancestor is on top of the `parentStack` while inside a nested
   * `callback`), and - unlike the base version - actually invokes `callback` (synchronously,
   * with `this` bound to `obj`), tracking nesting depth so children created inside the callback
   * attach to `obj` rather than back to `main`.
   */
  override create<T extends SvgElement>(obj: T, type: string, attr?: Attr, callback?: (this: T) => void): T {
    obj.create(type, attr);

    if (this.depth === 0) {
      this.mainGroup.append(obj);
    } else {
      this.parentStack[this.depth].append(obj);
    }

    if (typeof callback === "function") {
      this.depth++;
      this.parentStack[this.depth] = obj;

      callback.call(obj);
      this.depth--;
    }

    return obj;
  }

  /**
   * Overrides `SVGBase.createChild()`: intended to guard against creating a "child-only" element
   * (e.g. `<stop>`, `<animate>`) directly under `main`.
   *
   * **Preserved bug**: the check (`obj.parent === this.mainGroup`) runs BEFORE `this.create()`
   * (i.e. before `obj.create(type, attr)`, the ONLY place `.parent` is ever assigned) - every
   * caller passes a just-`new`'d element whose `.parent` is always `undefined` at this point, so
   * the comparison can never be true and the "Parents are required elements" error can never
   * actually fire. Reproduced as dead code rather than reordered to work as apparently intended.
   */
  override createChild<T extends SvgElement>(obj: T, type: string, attr?: Attr, callback?: (this: T) => void): T {
    if (obj.parent === this.mainGroup) {
      throw new Error("JUI_CRITICAL_ERR: Parents are required elements of the '" + type + "'");
    }

    return this.create(obj, type, attr, callback);
  }

  /** Getter form (no args): current `{width, height}`. Setter form (2 args): sets root attrs. */
  size(): { width: number; height: number };
  size(width: number, height: number): void;
  size(...args: number[]): { width: number; height: number } | void {
    if (args.length === 2) {
      const [w, h] = args;
      this.root.attr({ width: w, height: h });
      return;
    }

    return this.root.size();
  }

  /**
   * Detaches all of `main`'s (and, if `isAll`, `sub`'s) currently-rendered DOM nodes and events.
   *
   * **Ordering matters, and is a deliberate fix (not a preserved-as-is port) over an earlier
   * version of this method**: `removeEventAll()` must run BEFORE the DOM-removal loop below, while
   * a stale (previous-render) child still has a real `parentNode`. `render()` (see its own doc
   * comment) calls this method a SECOND time per render pass - once via `reset()` before drawing,
   * and once (no-argument) on its own right before `appendAll()` - and that second call's
   * `mainGroup.children` holds only THIS render's brand-new elements, which never had a
   * `parentNode` in the first place (not yet inserted into the live DOM). Running
   * `removeEventAll()` first, gated on `parentNode`, lets it tell "genuinely stale, already-live
   * element from a prior render" (strip its listeners) apart from "freshly drawn, not-yet-attached
   * element from the render in progress" (leave its listeners alone) - both cases look identical
   * to `removeEventAll()` if it runs AFTER the removal loop, since `removeChild()` clears
   * `parentNode` on the stale ones too. Confirmed via the real bug this fixes: EVERY brush's mouse
   * event (`click`/`dblclick`/`contextmenu`/hover) was silently non-functional - `addEvent()`
   * genuinely called `elem.on(...)`/`addEventListener()` on every brush element, but by the time
   * this render pass's own trailing `clear()` call ran, `removeEventAll()` had already stripped
   * every one of those just-attached listeners before `appendAll()` ever inserted the elements into
   * the document - reproduced with a real bar/column click never reaching its configured
   * `event.click`/`.on("click"/"rclick", ...)` handler, confirmed fixed (dispatches correctly)
   * after reordering, and confirmed absent on the real legacy engine (a live-site A/B check).
   */
  clear(isAll?: boolean): void {
    const main = this.mainGroup;
    this.removeEventAll(this.mainGroup);

    main.each(function (this: SvgElement) {
      if (this.element.parentNode) {
        main.element.removeChild(this.element);
      }
    });

    if (isAll === true) {
      const sub = this.subGroup;
      this.removeEventAll(this.subGroup);

      sub.each(function (this: SvgElement) {
        if (this.element.parentNode) {
          sub.element.removeChild(this.element);
        }
      });
    }
  }

  /**
   * Like `clear()` but also discards the underlying `children` array(s) afterwards (`main`'s
   * always, `sub`'s only when `isAll` is true) rather than just detaching the DOM nodes - used
   * when starting a fresh render pass that will rebuild the element tree from scratch.
   */
  reset(isAll?: boolean): void {
    this.clear(isAll);
    this.mainGroup.children = [];

    if (isAll === true) {
      this.subGroup.children = [];
    }
  }

  /**
   * Actually appends the in-memory element tree into the live DOM.
   *
   * **Preserved quirk**: always calls `this.clear()` with NO argument (never forwards its own
   * `isAll`), so even `render(true)` only clears stale nodes out of `main`, never `sub` - only
   * the subsequent `appendAll(root)` vs. `appendAll(main)` choice is affected by `isAll`/
   * `isFirst`.
   */
  render(isAll?: boolean): void {
    this.clear();

    if (this.isFirst === false || isAll === true) {
      this.appendAll(this.root);
    } else {
      this.appendAll(this.mainGroup);
    }

    this.isFirst = true;
  }

  /** Triggers a browser download of the current SVG document as a `.svg` file. */
  download(name?: string): void {
    if (typeof name === "string") {
      name = name.split(".")[0];
    }

    const a = document.createElement("a");
    a.download = name ? name + ".svg" : "svg.svg";
    a.href = this.toDataURI();

    document.body.appendChild(a);
    a.click();
    a.parentNode!.removeChild(a);
  }

  /** Rasterizes the current SVG document to a PNG (or `type`) and triggers a browser download. */
  downloadImage(name?: string, type?: string): void {
    type = type || "image/png";

    const img = new Image();
    const size = this.size();
    const uri = this.toDataURI()
      .replace('width="100%"', 'width="' + size.width + '"')
      .replace('height="100%"', 'height="' + size.height + '"');

    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;

      const context = canvas.getContext("2d")!;
      context.drawImage(img, 0, 0);

      const png = canvas.toDataURL(type);

      if (typeof name === "string") {
        name = name.split(".")[0];
      }

      const a = document.createElement("a");
      a.download = name ? name + ".png" : "svg.png";
      a.href = png;

      document.body.appendChild(a);
      a.click();
      a.parentNode!.removeChild(a);
    };

    img.src = uri;
  }

  /** Draws the current SVG document into an existing `<canvas>` element. */
  exportCanvas(canvas: HTMLCanvasElement): void {
    const img = new Image();
    const size = this.size();

    const uri = this.toDataURI()
      .replace('width="100%"', 'width="' + size.width + '"')
      .replace('height="100%"', 'height="' + size.height + '"');

    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;

      const context = canvas.getContext("2d")!;
      context.drawImage(img, 0, 0);
    };

    img.src = uri;
  }

  /** Serializes the mounted DOM (`rootElem.innerHTML`) into a standalone XML document string. */
  toXML(): string {
    let text = this.rootElem.innerHTML;

    text = text.replace('xmlns="http://www.w3.org/2000/svg"', "");

    return ['<?xml version="1.0" encoding="utf-8"?>', text.replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" ')].join("\n");
  }

  /** Converts the current document to a `data:image/svg+xml` URI. */
  toDataURI(): string {
    // Originally only ran `encodeURIComponent` for `browser.mozilla`/`browser.msie` - never for
    // Chrome/Chromium/Safari (the large majority of real usage today). A real Chromium render
    // (jui-vue.io's gallery/gps demo's map.minimap widget) surfaced why that's a genuine bug, not
    // a faithfully-preserved original behavior: any SVG using `url(#someId)` (any gradient/
    // clipPath reference) contains an unescaped `#`, which a data URI reads as its fragment
    // delimiter - everything after it is silently dropped, producing a corrupt SVG payload that
    // fails to render at all (a plainly visible "broken image" glyph, not a subtle glitch).
    // `encodeURIComponent` is safe to apply unconditionally - a correctly percent-encoded data URI
    // works identically in every browser, so there's no real browser-specific behavior to keep.
    const xml = encodeURIComponent(this.toXML());

    if (browser.msie) {
      return "data:image/svg+xml," + xml;
    } else {
      return "data:image/svg+xml;utf8," + xml;
    }
  }

  /** Appends `elem` directly into `main` or `sub` (bypassing the normal `create()` attach path). */
  autoRender(elem: SvgElement, isAuto?: boolean): void {
    if (this.depth > 0) return;

    if (!isAuto) {
      this.subGroup.append(elem);
    } else {
      this.mainGroup.append(elem);
    }
  }

  /** Measures the real pixel size a piece of text would render at, via a throwaway `<svg><text>`. */
  getTextSize(text: string, opt?: { fontSize?: string | number; fontFamily?: string; bold?: string | number; style?: string }): { width: number; height: number } {
    if (text === "") {
      return { width: 0, height: 0 };
    }

    opt = opt || {};

    const bodyElement: Element = document.body || this.root.element;

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttributeNS(null, "width", "500");
    svg.setAttributeNS(null, "height", "100");
    svg.setAttributeNS(null, "x", "-20000");
    svg.setAttributeNS(null, "y", "-20000");

    const el = document.createElementNS("http://www.w3.org/2000/svg", "text");
    el.setAttributeNS(null, "x", "-200");
    el.setAttributeNS(null, "y", "-200");
    el.appendChild(document.createTextNode(text));

    if (opt.fontSize) {
      el.setAttributeNS(null, "font-size", String(opt.fontSize));
    }

    if (opt.fontFamily) {
      el.setAttributeNS(null, "font-family", opt.fontFamily);
    }

    if (opt.bold) {
      el.setAttributeNS(null, "font-weight", String(opt.bold));
    }

    if (opt.style) {
      el.setAttributeNS(null, "font-style", opt.style);
    }

    svg.appendChild(el);

    bodyElement.appendChild(svg);
    const rect = el.getBoundingClientRect();
    bodyElement.removeChild(svg);

    return { width: rect.width, height: rect.height };
  }

  /**
   * Builds a detached `Element` tree from a plain JSON description (`{type, attr, children}`),
   * recursively. Does not attach it to any `SVG` instance's `main`/`sub` groups or the live DOM.
   */
  static createObject(obj: CreateObjectSpec): SvgElement {
    const el = new SvgElement();

    el.create(obj.type, obj.attr);

    if (obj.children instanceof Array) {
      for (let i = 0, len = obj.children.length; i < len; i++) {
        el.append(SVG.createObject(obj.children[i]));
      }
    }

    return el;
  }
}
