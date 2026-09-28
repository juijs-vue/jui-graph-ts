// Port of juijs-graph's `src/util/svg/base.js` ("util.svg.base").
//
// The tag-builder base class: one method per SVG element tag, each just a thin wrapper around
// `this.create(new <ElementClass>(), "<tag>", attr, callback)`. Ported per Phase 0 rule 2 as a
// real class so that `this.create`/`this.createChild` calls dynamically dispatch to whatever a
// subclass (`base3d.ts`'s `SVG3d`, `svg.ts`'s `SVG`) overrides them with - exactly like the
// original relied on (its own `component()` doc comment lists `util.svg.element*` as
// `@requires`). `SVG.ts`'s `create`/`createChild` overrides are what make e.g. `svg.rect(...)`
// actually attach into the right parent group instead of just constructing a detached element.

import { Element } from "./element";
import { TransElement } from "./element.transform";
import { PathElement } from "./element.path";
import { PathSymbolElement } from "./element.path.symbol";
import { PathRectElement } from "./element.path.rect";
import { PolyElement } from "./element.poly";

type Attr = Record<string, any> | null | undefined;

/** One factory method per SVG element tag; see this file's header comment for how dispatch works. */
export class SVGBase {
  private static globalObj: SVGBase | null = null;

  /**
   * `create`/`createChild` here are the "no-op glue" version: just calls `obj.create(type, attr)`
   * and returns `obj`, ignoring `callback` entirely (deliberately - it exists purely as an
   * override point; `svg.ts`'s `SVG.create()` is the one that actually invokes it).
   */
  create<T extends Element>(obj: T, type: string, attr?: Attr, _callback?: (this: T) => void): T {
    obj.create(type, attr);
    return obj;
  }

  /** Like `create()` but intended for elements that must be nested under a parent (e.g. `<stop>`,
   * `<animate>`) - see `svg.ts`'s `SVG.createChild()` override for the (broken) guard this is meant
   * to plug into; here, at the `SVGBase` level, it's just a passthrough to `create()`. */
  createChild<T extends Element>(obj: T, type: string, attr?: Attr, callback?: (this: T) => void): T {
    return this.create(obj, type, attr, callback);
  }

  /** Creates an element with an arbitrary tag `name` (for tags with no dedicated method below). */
  custom(name: string, attr?: Attr, callback?: (this: Element) => void): Element {
    return this.create(new Element(), name, attr, callback);
  }

  /** Creates a `<defs>` element. */
  defs(callback?: (this: Element) => void): Element {
    return this.create(new Element(), "defs", null, callback);
  }

  /** Creates a `<symbol>` element. */
  symbol(attr?: Attr, callback?: (this: Element) => void): Element {
    return this.create(new Element(), "symbol", attr, callback);
  }

  /** Creates a `<g>` (group) element. */
  group(attr?: Attr, callback?: (this: TransElement) => void): TransElement {
    return this.create(new TransElement(), "g", attr, callback);
  }
  /** @alias group */
  g(attr?: Attr, callback?: (this: TransElement) => void): TransElement {
    return this.group(attr, callback);
  }

  /** Creates a `<marker>` element. */
  marker(attr?: Attr, callback?: (this: Element) => void): Element {
    return this.create(new Element(), "marker", attr, callback);
  }

  /** Creates an `<a>` (hyperlink) element. */
  a(attr?: Attr, callback?: (this: TransElement) => void): TransElement {
    return this.create(new TransElement(), "a", attr, callback);
  }

  /** Creates a `<switch>` element. */
  switch(attr?: Attr, callback?: (this: Element) => void): Element {
    return this.create(new Element(), "switch", attr, callback);
  }

  /** Creates a `<use>` element. */
  use(attr?: Attr): Element {
    return this.create(new Element(), "use", attr);
  }

  /** Creates a `<rect>` element. */
  rect(attr?: Attr, callback?: (this: TransElement) => void): TransElement {
    return this.create(new TransElement(), "rect", attr, callback);
  }

  /** Creates a `<line>` element. */
  line(attr?: Attr, callback?: (this: TransElement) => void): TransElement {
    return this.create(new TransElement(), "line", attr, callback);
  }

  /** Creates a `<circle>` element. */
  circle(attr?: Attr, callback?: (this: TransElement) => void): TransElement {
    return this.create(new TransElement(), "circle", attr, callback);
  }

  /**
   * `text(attr)`, `text(attr, callback)`, or `text(attr, "literal text")` - dispatches on
   * `arguments.length` (2 args at all, even `undefined`) then on whether the 2nd arg is a
   * function, exactly like the original.
   */
  text(attr?: Attr, textOrCallback?: ((this: TransElement) => void) | string): TransElement {
    if (arguments.length === 2) {
      if (typeof textOrCallback === "function") {
        return this.create(new TransElement(), "text", attr, textOrCallback);
      }

      return this.create(new TransElement(), "text", attr).text(textOrCallback as string);
    }

    return this.create(new TransElement(), "text", attr);
  }

  /** Creates a `<textPath>` element; a string `text` sets its text content directly. */
  textPath(attr?: Attr, text?: string): Element {
    if (typeof text === "string") {
      return this.create(new Element(), "textPath", attr).text(text);
    }

    return this.create(new Element(), "textPath", attr);
  }

  /** Creates a `<tref>` element; a string `text` sets its text content directly. */
  tref(attr?: Attr, text?: string): Element {
    if (typeof text === "string") {
      return this.create(new Element(), "tref", attr).text(text);
    }

    return this.create(new Element(), "tref", attr);
  }

  /** Creates a `<tspan>` element; a string `text` sets its text content directly. */
  tspan(attr?: Attr, text?: string): Element {
    if (typeof text === "string") {
      return this.create(new Element(), "tspan", attr).text(text);
    }

    return this.create(new Element(), "tspan", attr);
  }

  /** Creates an `<ellipse>` element. */
  ellipse(attr?: Attr, callback?: (this: TransElement) => void): TransElement {
    return this.create(new TransElement(), "ellipse", attr, callback);
  }

  /** Creates an `<image>` element. */
  image(attr?: Attr, callback?: (this: TransElement) => void): TransElement {
    return this.create(new TransElement(), "image", attr, callback);
  }

  /** Creates a `<path>` element, built via `PathElement`'s command-builder API. */
  path(attr?: Attr, callback?: (this: PathElement) => void): PathElement {
    return this.create(new PathElement(), "path", attr, callback);
  }

  /** Creates a `<path>` element built via `PathSymbolElement`'s marker-symbol helpers. */
  pathSymbol(attr?: Attr, callback?: (this: PathSymbolElement) => void): PathSymbolElement {
    return this.create(new PathSymbolElement(), "path", attr, callback);
  }

  /** Creates a `<path>` element built via `PathRectElement`'s rounded-rectangle helper. */
  pathRect(attr?: Attr, callback?: (this: PathRectElement) => void): PathRectElement {
    return this.create(new PathRectElement(), "path", attr, callback);
  }

  /** Creates a `<polyline>` element, built via `PolyElement`'s point-list builder. */
  polyline(attr?: Attr, callback?: (this: PolyElement) => void): PolyElement {
    return this.create(new PolyElement(), "polyline", attr, callback);
  }

  /** Creates a `<polygon>` element, built via `PolyElement`'s point-list builder. */
  polygon(attr?: Attr, callback?: (this: PolyElement) => void): PolyElement {
    return this.create(new PolyElement(), "polygon", attr, callback);
  }

  /** Creates a `<pattern>` element. */
  pattern(attr?: Attr, callback?: (this: Element) => void): Element {
    return this.create(new Element(), "pattern", attr, callback);
  }

  /** Creates a `<mask>` element. */
  mask(attr?: Attr, callback?: (this: Element) => void): Element {
    return this.create(new Element(), "mask", attr, callback);
  }

  /** Creates a `<clipPath>` element. */
  clipPath(attr?: Attr, callback?: (this: Element) => void): Element {
    return this.create(new Element(), "clipPath", attr, callback);
  }

  /** Creates a `<linearGradient>` element. */
  linearGradient(attr?: Attr, callback?: (this: Element) => void): Element {
    return this.create(new Element(), "linearGradient", attr, callback);
  }

  /** Creates a `<radialGradient>` element. */
  radialGradient(attr?: Attr, callback?: (this: Element) => void): Element {
    return this.create(new Element(), "radialGradient", attr, callback);
  }

  /** Creates a `<filter>` element. */
  filter(attr?: Attr, callback?: (this: Element) => void): Element {
    return this.create(new Element(), "filter", attr, callback);
  }

  /** Creates a `<foreignObject>` element. */
  foreignObject(attr?: Attr, callback?: (this: TransElement) => void): TransElement {
    return this.create(new TransElement(), "foreignObject", attr, callback);
  }

  // Gradient stop element.

  /** Creates a gradient `<stop>` child element (via `createChild()`). */
  stop(attr?: Attr): Element {
    return this.createChild(new Element(), "stop", attr);
  }

  // Animation elements.

  /** Creates an `<animate>` child element (via `createChild()`). */
  animate(attr?: Attr): Element {
    return this.createChild(new Element(), "animate", attr);
  }

  /** Creates an `<animateColor>` child element (via `createChild()`). */
  animateColor(attr?: Attr): Element {
    return this.createChild(new Element(), "animateColor", attr);
  }

  /** Creates an `<animateMotion>` child element (via `createChild()`). */
  animateMotion(attr?: Attr): Element {
    return this.createChild(new Element(), "animateMotion", attr);
  }

  /** Creates an `<animateTransform>` child element (via `createChild()`). */
  animateTransform(attr?: Attr): Element {
    return this.createChild(new Element(), "animateTransform", attr);
  }

  /** Creates an `<mpath>` child element (via `createChild()`). */
  mpath(attr?: Attr): Element {
    return this.createChild(new Element(), "mpath", attr);
  }

  /** Creates a `<set>` child element (via `createChild()`). */
  set(attr?: Attr): Element {
    return this.createChild(new Element(), "set", attr);
  }

  // Filter primitive elements.

  /** Creates a `<feBlend>` child element (via `createChild()`). */
  feBlend(attr?: Attr): Element {
    return this.createChild(new Element(), "feBlend", attr);
  }

  /** Creates a `<feColorMatrix>` child element (via `createChild()`). */
  feColorMatrix(attr?: Attr): Element {
    return this.createChild(new Element(), "feColorMatrix", attr);
  }

  /** Creates a `<feComponentTransfer>` child element (via `createChild()`). */
  feComponentTransfer(attr?: Attr): Element {
    return this.createChild(new Element(), "feComponentTransfer", attr);
  }

  /** Creates a `<feComposite>` child element (via `createChild()`). */
  feComposite(attr?: Attr): Element {
    return this.createChild(new Element(), "feComposite", attr);
  }

  /** Creates a `<feConvolveMatrix>` child element (via `createChild()`). */
  feConvolveMatrix(attr?: Attr): Element {
    return this.createChild(new Element(), "feConvolveMatrix", attr);
  }

  /** Creates a `<feDiffuseLighting>` child element (via `createChild()`). */
  feDiffuseLighting(attr?: Attr): Element {
    return this.createChild(new Element(), "feDiffuseLighting", attr);
  }

  /** Creates a `<feDisplacementMap>` child element (via `createChild()`). */
  feDisplacementMap(attr?: Attr): Element {
    return this.createChild(new Element(), "feDisplacementMap", attr);
  }

  /** Creates a `<feFlood>` child element (via `createChild()`). */
  feFlood(attr?: Attr): Element {
    return this.createChild(new Element(), "feFlood", attr);
  }

  /** Creates a `<feGaussianBlur>` child element (via `createChild()`). */
  feGaussianBlur(attr?: Attr): Element {
    return this.createChild(new Element(), "feGaussianBlur", attr);
  }

  /** Creates a `<feImage>` child element (via `createChild()`). */
  feImage(attr?: Attr): Element {
    return this.createChild(new Element(), "feImage", attr);
  }

  /** Creates a `<feMerge>` child element (via `createChild()`). */
  feMerge(attr?: Attr, callback?: (this: Element) => void): Element {
    return this.createChild(new Element(), "feMerge", attr, callback);
  }

  /** Creates a `<feMergeNode>` child element (via `createChild()`). */
  feMergeNode(attr?: Attr): Element {
    return this.createChild(new Element(), "feMergeNode", attr);
  }

  /** Creates a `<feMorphology>` child element (via `createChild()`). */
  feMorphology(attr?: Attr): Element {
    return this.createChild(new Element(), "feMorphology", attr);
  }

  /** Creates a `<feOffset>` child element (via `createChild()`). */
  feOffset(attr?: Attr): Element {
    return this.createChild(new Element(), "feOffset", attr);
  }

  /** Creates a `<feSpecularLighting>` child element (via `createChild()`). */
  feSpecularLighting(attr?: Attr): Element {
    return this.createChild(new Element(), "feSpecularLighting", attr);
  }

  /** Creates a `<feTile>` child element (via `createChild()`). */
  feTile(attr?: Attr): Element {
    return this.createChild(new Element(), "feTile", attr);
  }

  /** Creates a `<feTurbulence>` child element (via `createChild()`). */
  feTurbulence(attr?: Attr): Element {
    return this.createChild(new Element(), "feTurbulence", attr);
  }

  /** Lazily-created module-singleton entry point, mirroring the original's `SVGBase.create()` static. */
  static create(name: string, attr?: Attr, callback?: (this: Element) => void): Element {
    if (SVGBase.globalObj == null) {
      SVGBase.globalObj = new SVGBase();
    }

    return SVGBase.globalObj.custom(name, attr, callback);
  }
}
