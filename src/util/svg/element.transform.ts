// Port of juijs-graph's `src/util/svg/element.transform.js` ("util.svg.element.transform").
// Extends `element.ts`'s `Element` with an SVG `transform="..."` attribute builder.

import { Element, registerElementModule } from "./element";

type TransformKey = "translate" | "scale" | "rotate" | "skew" | "matrix";

/** An `Element` that also tracks and composes an SVG `transform="..."` attribute. */
export class TransElement extends Element {
  // Plain object (not a `Map`) so `for...in` iterates in this EXACT declaration order -
  // `applyOrders()` below composes the final `transform` string by iterating these keys in
  // this fixed order (translate, scale, rotate, skew, matrix) regardless of which order the
  // individual `.translate()`/`.rotate()`/etc. setters were actually called in. Preserved from
  // the original: `elem.rotate(30).translate(1,2)` still produces `"translate(1,2) rotate(30)"`.
  private transformOrders: Record<TransformKey, string | null> = {
    translate: null,
    scale: null,
    rotate: null,
    skew: null,
    matrix: null,
  };

  private applyOrders(): void {
    const orderArr: string[] = [];

    (Object.keys(this.transformOrders) as TransformKey[]).forEach((key) => {
      if (this.transformOrders[key]) orderArr.push(this.transformOrders[key]!);
    });

    this.attr({ transform: orderArr.join(" ") });
  }

  private static getStringArgs(args: unknown[]): string {
    return args.join(",");
  }

  /** Sets/replaces this element's `translate(...)` transform component to `translate(args...)`. */
  translate(...args: unknown[]): this {
    this.transformOrders.translate = "translate(" + TransElement.getStringArgs(args) + ")";
    this.applyOrders();

    return this;
  }

  /**
   * `rotate(angle)` (single arg) or `rotate(angle, x, y)` (three args) are the two documented
   * forms. **Fixed (Tier A - data-corrupting defect)**: any OTHER argument count (e.g.
   * `rotate(angle, x)`, two args) used to fall through both branches, leaving the interpolated
   * value `undefined` - producing the literal string `"rotate(undefined)"`, which got pushed
   * into the composed `transform` attribute and made the ENTIRE attribute invalid (SVG discards a
   * `transform` list containing any unparseable component), silently breaking every OTHER
   * already-set transform component (`translate`/`scale`/`skew`/`matrix`) too. No plausible demo
   * could depend on an unsupported arg count producing a broken `transform` attribute, so an
   * unsupported argument count is now a no-op: the call is ignored and any previously-set
   * `rotate(...)` (and every other transform component) is left untouched instead of being
   * corrupted.
   */
  rotate(...args: unknown[]): this {
    let str: unknown;

    if (args.length === 1) {
      str = args[0];
    } else if (args.length === 3) {
      str = args[0] + " " + args[1] + "," + args[2];
    } else {
      return this;
    }

    this.transformOrders.rotate = "rotate(" + str + ")";
    this.applyOrders();

    return this;
  }

  /** Sets/replaces this element's `scale(...)` transform component to `scale(args...)`. */
  scale(...args: unknown[]): this {
    this.transformOrders.scale = "scale(" + TransElement.getStringArgs(args) + ")";
    this.applyOrders();

    return this;
  }

  /** Sets/replaces this element's `skew(...)` transform component to `skew(args...)`. */
  skew(...args: unknown[]): this {
    this.transformOrders.skew = "skew(" + TransElement.getStringArgs(args) + ")";
    this.applyOrders();

    return this;
  }

  /** Sets/replaces this element's `matrix(...)` transform component to `matrix(args...)`. */
  matrix(...args: unknown[]): this {
    this.transformOrders.matrix = "matrix(" + TransElement.getStringArgs(args) + ")";
    this.applyOrders();

    return this;
  }

  /**
   * Extracts and parses one transform component's argument list out of the current `transform`
   * attribute.
   *
   * **Fixed (Tier A - data-corrupting defect)**: each regex used to be a negated CHARACTER CLASS
   * built from the individual letters of its own name plus parens - e.g.
   * `translate: /[^translate()]+/g` means "one or more characters that are none of the letters
   * t/r/a/n/s/l/e or ( or )", which is nothing like matching the substring `"translate(...)"`.
   * That happened to look right when only ONE transform component was ever set (nothing else to
   * confuse the negated class with), but when multiple components share letters (e.g.
   * `translate`/`rotate` both use "t"/"r"/"a"), the match crossed into the wrong component's text
   * and returned nonsense (verified: garbage output, not even a thrown error, on
   * `"translate(1,2) rotate(30)"`). Now matches the named command's own parenthesized argument
   * list specifically (`` `${type}\(([^)]*)\)` ``) and parses its numeric argument(s), returning
   * a single number for a one-argument component or a number array for a multi-argument one.
   */
  data(type: TransformKey): number | number[] | null {
    const text = this.attr("transform");

    if (typeof text !== "string") return null;

    const match = text.match(new RegExp(`${type}\\(([^)]*)\\)`));
    if (!match) return null;

    const nums = match[1]
      .split(/[\s,]+/)
      .filter((part) => part.length > 0)
      .map(Number);

    return nums.length === 1 ? nums[0] : nums;
  }
}

// See `Element.is()`'s doc comment in `element.ts`.
registerElementModule("util.svg.element.transform", TransElement);
