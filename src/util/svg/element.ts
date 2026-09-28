// Port of juijs-graph's `src/util/svg/element.js` ("util.svg.element").
//
// The root of the whole SVG element-builder class chain: `element.js` (this file) -> `element
// .transform.js` -> `element.path.js` -> `element.path.rect.js`/`element.path.symbol.js`, and
// separately `element.transform.js` -> `element.poly.js`. Ported per PORT_STATUS.md Phase 0 rule
// 2 as a real `class`, not a closure-based constructor.
//
// **A note on what "real class" changes vs. preserves**: the original relies on JUI's own
// `inherit()` helper (`base/base.js`), which does `ctor.prototype = new superCtor()` - i.e. it
// creates each subclass's prototype by calling the PARENT constructor exactly ONCE, at module-
// registration time (when `JUI.use()` runs), not once per instance. Any inherited method the
// original wrote as `this.method = function(){...}` (own-property assignment inside a
// constructor) that closes over a private local variable (e.g. this file's `events` array) ends
// up, for every subclass that does NOT itself redefine that method (e.g. `TransElement`/
// `PathElement`/`PathRectElement`/`PathSymbolElement`/`PolyElement` all inherit `on`/`off`/
// `hover` unshadowed), sharing that ONE prototype-seed instance's private closure - meaning every
// element in an entire chart's SVG tree that never overrides `on`/`off`/`hover` would, in the
// original, silently share a single global event-bookkeeping array across unrelated element
// instances (each `.element.addEventListener(...)` call still targets the correct real DOM node,
// but the `{type, callback}` list used by `.off()` to find/remove them is shared and cross-
// contaminated). This is an artifact of the OLD prototype-seeding registry mechanism Phase 0
// rules 1/2/4 already authorize dropping outright (same category as `util/base.js`'s `inherit()`/
// `typeCheck()` machinery) - it is not "real product logic" the way e.g. `math.ts`'s `niceNum()`
// 1/2/5/10-rounding logic or `color.ts`'s `parseStop()` bug are (both self-contained within a
// single function, independent of the module system). A real ES `class Foo extends Bar`, which
// Phase 0 rule 2 explicitly directs this port to use, does not have this bug by construction -
// every instance gets its own fully-initialized copy of inherited private state. Not preserved;
// documented here rather than silently deviating, per Phase 0's own instruction.
//
// Distinct from the above: `element.path.symbol.ts`'s `join()`-shadowing bug (see that file's
// header) IS a genuine, self-contained, single-class design bug independent of the registry
// mechanics, and IS preserved faithfully.

/** Namespace URI constants used throughout the SVG element builder tree. */
export const SVG_NS = "http://www.w3.org/2000/svg";
export const XLINK_NS = "http://www.w3.org/1999/xlink";

interface EventRecord {
  type: string;
  callback: (this: SVGElement, e: Event) => void;
}

/**
 * Wraps a single SVG DOM node plus the bookkeeping (children/parent/attributes/styles/events)
 * the rest of this builder tree needs to compose/append/serialize a tree of them.
 *
 * Mirrors the original: none of the public fields (`element`/`children`/`parent`/`styles`/
 * `attributes`/`order`) are populated until `.create()` is called (same as the original, which
 * only ever set them inside `create()`, never in the top-level constructor) - typed here with
 * definite-assignment assertions (`!`) to preserve that same "usable only after create()"
 * runtime contract rather than papering over it with placeholder defaults.
 */
export class Element {
  element!: SVGElement;
  children!: Element[];
  parent!: Element | null;
  styles!: Record<string, any>;
  attributes!: Record<string, any>;
  order!: number;

  private events: EventRecord[] = [];

  /** (Re)initializes this wrapper around a freshly created `<type>` SVG DOM node. */
  create(type: string, attr?: Record<string, any> | null): void {
    this.element = document.createElementNS(SVG_NS, type) as unknown as SVGElement;
    this.children = [];
    this.parent = null;
    this.styles = {};
    this.attributes = {};
    this.order = 0;

    this.attr(attr as any);
  }

  /** Invokes `callback` (with `this`/2nd arg bound to the child) for each direct child, in order. */
  each(callback: (this: Element, index: number, child: Element) => void): Element[] | undefined {
    if (typeof callback !== "function") return;

    for (let i = 0, len = this.children.length; i < len; i++) {
      const self = this.children[i];
      callback.apply(self, [i, self]);
    }

    return this.children;
  }

  /** Returns the direct child at `index`, or `null` if there isn't one. */
  get(index: number): Element | null {
    if (this.children[index]) {
      return this.children[index];
    }

    return null;
  }

  /** Returns `obj`'s position among this element's direct children, or `-1` if it isn't one. */
  index(obj: Element): number {
    for (let i = 0; i < this.children.length; i++) {
      if (obj === this.children[i]) {
        return i;
      }
    }

    return -1;
  }

  /** Appends `elem` as this element's last child, detaching it from any prior parent first. */
  append(elem: Element): this {
    if (elem instanceof Element) {
      if (elem.parent) {
        elem.remove();
      }

      this.children.push(elem);
      elem.parent = this;
    }

    return this;
  }

  /** Inserts `elem` as this element's first child (shorthand for `insert(0, elem)`). */
  prepend(elem: Element): this {
    return this.insert(0, elem);
  }

  /** Inserts `elem` as a direct child at `index`, detaching it from any prior parent first. */
  insert(index: number, elem: Element): this {
    if (elem.parent) {
      elem.remove();
    }

    this.children.splice(index, 0, elem);
    elem.parent = this;

    return this;
  }

  /**
   * Detaches this element from its parent's `children` array.
   *
   * **Preserved bug**: the original computes `index` (the position of `this` within the
   * parent's `children`) but never actually uses it to splice just that one entry out. Instead
   * it rebuilds the parent's `children` from only the entries strictly BEFORE the match (the
   * loop `break`s as soon as it finds `this`, having pushed only prior siblings into `nChild`),
   * then assigns that truncated array back - silently dropping every sibling that came AFTER
   * `this` too, not just `this` itself. Node-cross-checked: `parent.children = [A, B, C]`,
   * `B.remove()` leaves `parent.children = [A]`, not `[A, C]`. Not fixed here.
   */
  remove(): this {
    let index = 0;
    const nChild: Element[] = [];
    const pChild = this.parent!.children;

    for (let i = 0; i < pChild.length; i++) {
      if (pChild[i] === this) {
        index = i;
        break;
      }

      nChild.push(pChild[i]);
    }
    void index; // computed but unused in the original too - see doc comment above

    this.parent!.children = nChild;

    return this;
  }

  /** Gets a single attribute (string arg) or sets many (object arg); returns `this` when setting. */
  attr(attr?: string): string | undefined;
  attr(attr: Record<string, any>): this;
  attr(attr?: string | Record<string, any> | null): string | undefined | this {
    // Note: falsy `attr` (including `""`) returns `undefined` without even checking the
    // "getter" string branch - preserved from the original's `if(!attr) return;` ordering.
    if (typeof attr === "undefined" || !attr) return undefined;

    if (typeof attr === "string") {
      return this.attributes[attr] || this.element.getAttribute(attr) || undefined;
    }

    for (const k in attr) {
      this.attributes[k] = attr[k];

      if (k.indexOf("xlink:") !== -1) {
        this.element.setAttributeNS(XLINK_NS, k, attr[k]);
      } else {
        this.element.setAttribute(k, attr[k]);
      }
    }

    return this;
  }

  /** Merges `css` properties into this element's tracked style map, then writes them all as a single `style` attribute (`"key:value;..."`). */
  css(css: Record<string, any>): this {
    const list: string[] = [];

    for (const k in css) {
      this.styles[k] = css[k];
    }

    for (const k in css) {
      list.push(k + ":" + css[k]);
    }

    this.attr({ style: list.join(";") });

    return this;
  }

  /** @deprecated kept from the original, which itself flags this deprecated. */
  html(html: string): this {
    this.element.innerHTML = html;

    return this;
  }

  /**
   * Replaces this element's text content.
   *
   * **Preserved bug**: iterates `this.element.childNodes` (a LIVE NodeList) while removing
   * from it inside the loop, without adjusting the index - each removal shifts every
   * subsequent node down by one, so only every other existing child node actually gets
   * removed when there are 2+ (e.g. 4 children -> only indices 0 and 2 are removed, leaving
   * indices "1" and "3" - now shifted to 0 and 1 - behind). Harmless in the overwhelmingly
   * common case (freshly-created element with 0 existing children), reproduced exactly rather
   * than switched to a safe `while (firstChild) removeChild(firstChild)` pattern.
   */
  text(text: string): this {
    const children = this.element.childNodes;

    for (let i = 0; i < children.length; i++) {
      this.element.removeChild(children[i]);
    }

    this.element.appendChild(document.createTextNode(text));
    return this;
  }

  /** Attaches a `type` DOM event listener to the underlying SVG element, tracked so `off()` can remove it later. A missing/non-function `handler` is silently accepted as a no-op listener. */
  on(type: string, handler?: (this: SVGElement, e: Event) => void): this {
    const callback = function (this: SVGElement, e: Event) {
      if (typeof handler === "function") {
        handler.call(this, e);
      }
    };

    this.element.addEventListener(type, callback, false);
    this.events.push({ type, callback });

    return this;
  }

  /** Removes previously-`on()`-attached listeners: all of them if `type` is omitted, or only those registered for `type`. */
  off(type?: string): this {
    if (!type) {
      for (let i = 0, len = this.events.length; i < len; i++) {
        const e = this.events.shift()!;

        this.element.removeEventListener(e.type, e.callback, false);
      }
    } else {
      const newEvents: EventRecord[] = [];

      for (let i = 0, len = this.events.length; i < len; i++) {
        const e = this.events[i];

        if (e.type !== type) {
          newEvents.push(e);
        } else {
          this.element.removeEventListener(e.type, e.callback, false);
        }
      }

      this.events = newEvents;
    }

    return this;
  }

  /** Attaches `mouseover`/`mouseout` listeners (each tracked for `off()`, like `on()`). Either handler may be omitted. */
  hover(overHandler?: (this: SVGElement, e: Event) => void, outHandler?: (this: SVGElement, e: Event) => void): this {
    const callback1 = function (this: SVGElement, e: Event) {
      if (typeof overHandler === "function") {
        overHandler.call(this, e);
      }
    };

    const callback2 = function (this: SVGElement, e: Event) {
      if (typeof outHandler === "function") {
        outHandler.call(this, e);
      }
    };

    this.element.addEventListener("mouseover", callback1, false);
    this.element.addEventListener("mouseout", callback2, false);
    this.events.push({ type: "mouseover", callback: callback1 });
    this.events.push({ type: "mouseout", callback: callback2 });

    return this;
  }

  /**
   * Measures this element's rendered box, falling back to summed computed-style box-model
   * properties when `getBoundingClientRect()` reports a zero-by-zero box (as jsdom's SVG
   * support generally does).
   *
   * **Preserved type-looseness quirk**: when the computed-style fallback sums to `0`, the
   * original falls back to the raw `width`/`height` DOM attribute value via `getAttribute()`,
   * which returns a `string | null` - so `size().width`/`.height` can genuinely come back as a
   * string (or `null`) at runtime, not just `number`, despite the method's implied numeric
   * contract. `isNaN(null)` is `false` (`Number(null) === 0`), so a `null` attribute value
   * survives the final `isNaN` guard unmolested rather than being coerced to `0`. Preserved via
   * an `any`-typed intermediate.
   */
  size(): { width: number; height: number } {
    const size: any = { width: 0, height: 0 };
    const rect = this.element.getBoundingClientRect();

    if (!rect || (rect.width === 0 && rect.height === 0)) {
      const height_list = ["height", "paddingTop", "paddingBottom", "borderTopWidth", "borderBottomWidth"];
      const width_list = ["width", "paddingLeft", "paddingRight", "borderLeftWidth", "borderRightWidth"];

      const computedStyle: any = window.getComputedStyle(this.element);

      for (let i = 0; i < height_list.length; i++) {
        size.height += parseFloat(computedStyle[height_list[i]]);
      }

      for (let i = 0; i < width_list.length; i++) {
        size.width += parseFloat(computedStyle[width_list[i]]);
      }

      size.width = size.width || this.element.getAttribute("width");
      size.height = size.height || this.element.getAttribute("height");
    } else {
      size.width = rect.width;
      size.height = rect.height;
    }

    if (isNaN(size.width)) size.width = 0;
    if (isNaN(size.height)) size.height = 0;

    return size;
  }

  /**
   * CORRECTION (this was previously mis-diagnosed as a preserved "always throws" bug - it is
   * NOT one): the real engine's own `util.svg.element.js` defines `this.is = function(moduleId) {
   * return this instanceof jui.include(moduleId); }` (confirmed directly against
   * `www.jui-vue.io/lib/jui/js/core.js`, the real uncompressed legacy bundle this whole port
   * cross-checks against). `jui` here is NOT "a bare, never-imported global" - it's the real
   * module-registry singleton every `jui.define(...)`-wrapped file in the actual distributed
   * engine runs under (attached to `window.jui`, always present at runtime) - `jui.include(
   * moduleId)` legitimately resolves the registered constructor for `moduleId` and this genuinely
   * works, confirmed by loading real `animate: true` demos (`overlap_bar`/`active_bar`/
   * `overlap_column`/`active_column`/`dashboard4`) directly against the live legacy site: none of
   * them throw or log any error. Reproduced here via `elementModuleRegistry` below - this port has
   * no dynamic module registry (Phase 0 rule 4 drops that machinery deliberately), so each
   * concrete `Element` subclass file self-registers its own real ES class under its own moduleId
   * at import time instead (`registerElementModule()`), and `is()` does the equivalent `this
   * instanceof ctor` check against whatever's registered.
   */
  is(moduleId: string): boolean {
    const ctor = elementModuleRegistry[moduleId];
    return ctor != null && this instanceof ctor;
  }
}

/**
 * Backs `Element.is()` above - see its doc comment. Keyed by the same dotted moduleId strings the
 * real engine's `jui.define(moduleId, ...)` calls use (`"util.svg.element.transform"` etc.).
 * Populated by each concrete subclass FILE itself (`registerElementModule()`, called at module
 * scope in `element.transform.ts`/`element.path.ts`/`element.poly.ts`/`element.path.rect.ts`/
 * `element.path.symbol.ts`) rather than imported directly here, which would create an import
 * cycle (those files already import `Element` FROM this file).
 */
const elementModuleRegistry: Record<string, abstract new (...args: never[]) => unknown> = {};

/** See `elementModuleRegistry`'s own doc comment. */
export function registerElementModule(moduleId: string, ctor: abstract new (...args: never[]) => unknown): void {
  elementModuleRegistry[moduleId] = ctor;
}

registerElementModule("util.svg.element", Element);
