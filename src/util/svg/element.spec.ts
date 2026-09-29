import { describe, it, expect } from "vitest";
import { Element } from "./element";

function makeElement(type = "rect", attr?: Record<string, any> | null): Element {
    const el = new Element();
    el.create(type, attr);
    return el;
}

describe("Element", () => {
    describe("create()", () => {
        it("creates a real SVG-namespaced DOM node and resets bookkeeping fields", () => {
            const el = makeElement("circle", { r: 5 });
            expect(el.element.namespaceURI).toBe("http://www.w3.org/2000/svg");
            expect(el.element.tagName).toBe("circle");
            expect(el.children).toEqual([]);
            expect(el.parent).toBeNull();
            expect(el.order).toBe(0);
            // The getter branch returns the raw stored value from `.attributes` (here, the
            // original number `5`) when truthy, not the DOM-serialized string - only falling
            // back to `element.getAttribute()` (always a string) when `.attributes[key]` is
            // itself falsy.
            expect(el.attr("r")).toBe(5);
        });
    });

    describe("attr()", () => {
        it("sets multiple attributes and returns `this`", () => {
            const el = makeElement("rect");
            const ret = el.attr({ x: 1, y: 2 });
            expect(ret).toBe(el);
            expect(el.element.getAttribute("x")).toBe("1");
            expect(el.element.getAttribute("y")).toBe("2");
        });

        it("sets xlink: attributes via setAttributeNS", () => {
            const el = makeElement("use");
            el.attr({ "xlink:href": "#foo" });
            expect(el.element.getAttributeNS("http://www.w3.org/1999/xlink", "href")).toBe("#foo");
        });

        it("gets a single attribute by name", () => {
            const el = makeElement("rect", { width: 10 });
            expect(el.attr("width")).toBe(10);
        });

        it("preserved quirk: falsy attr (including empty string) returns undefined without attempting a get", () => {
            const el = makeElement("rect", { width: 10 });
            // "" is falsy, so the original's `if(!attr) return;` fires before the typeof/string
            // getter branch is ever reached - getAttribute("") is never called.
            expect(el.attr("" as any)).toBeUndefined();
            expect(el.attr(undefined as any)).toBeUndefined();
        });
    });

    describe("css()", () => {
        it("builds and applies a style attribute string", () => {
            const el = makeElement("rect");
            el.css({ fill: "red", stroke: "blue" });
            expect(el.element.getAttribute("style")).toBe("fill:red;stroke:blue");
            expect(el.styles).toEqual({ fill: "red", stroke: "blue" });
        });
    });

    describe("text()", () => {
        it("sets text content on a fresh element", () => {
            const el = makeElement("text");
            el.text("hello");
            expect(el.element.textContent).toBe("hello");
        });

        it("preserved bug: only every-other pre-existing child node is removed (live NodeList iteration)", () => {
            const el = makeElement("text");
            // Manually attach 4 existing child text nodes (bypassing .text(), which itself only
            // ever appends one) to demonstrate the live-NodeList removal bug.
            for (let i = 0; i < 4; i++) {
                el.element.appendChild(document.createTextNode("n" + i));
            }
            expect(el.element.childNodes.length).toBe(4);

            el.text("new");

            // Removing while iterating a live NodeList without adjusting the index skips every
            // other node - 2 of the original 4 nodes survive, plus the newly appended text node.
            expect(el.element.childNodes.length).toBe(3);
        });
    });

    describe("on()/off()/hover()", () => {
        it("registers and invokes an event handler with `this` bound to the DOM element", () => {
            const el = makeElement("rect");
            let receivedThis: any = null;
            el.on("click", function (this: SVGElement) {
                receivedThis = this;
            });

            el.element.dispatchEvent(new (globalThis as any).Event("click"));
            expect(receivedThis).toBe(el.element);
        });

        it("off(type) removes only matching-type listeners", () => {
            const el = makeElement("rect");
            let clicks = 0;
            let overs = 0;
            el.on("click", () => clicks++);
            el.on("mouseover", () => overs++);

            el.off("click");

            el.element.dispatchEvent(new (globalThis as any).Event("click"));
            el.element.dispatchEvent(new (globalThis as any).Event("mouseover"));

            expect(clicks).toBe(0);
            expect(overs).toBe(1);
        });

        it("off() with no type removes all listeners", () => {
            const el = makeElement("rect");
            let count = 0;
            el.on("click", () => count++);
            el.on("mouseover", () => count++);

            el.off();

            el.element.dispatchEvent(new (globalThis as any).Event("click"));
            el.element.dispatchEvent(new (globalThis as any).Event("mouseover"));

            expect(count).toBe(0);
        });

        it("hover() registers mouseover/mouseout handlers", () => {
            const el = makeElement("rect");
            let over = false;
            let out = false;
            el.hover(
                () => (over = true),
                () => (out = true)
            );

            el.element.dispatchEvent(new (globalThis as any).Event("mouseover"));
            el.element.dispatchEvent(new (globalThis as any).Event("mouseout"));

            expect(over).toBe(true);
            expect(out).toBe(true);
        });
    });

    describe("each()/get()/index()/append()/prepend()/insert()", () => {
        it("append() adds a child and sets parent", () => {
            const parent = makeElement("g");
            const child = makeElement("rect");
            parent.append(child);

            expect(parent.children).toEqual([child]);
            expect(child.parent).toBe(parent);
        });

        it("get()/index() locate children by position/reference", () => {
            const parent = makeElement("g");
            const a = makeElement("rect");
            const b = makeElement("circle");
            parent.append(a).append(b);

            expect(parent.get(0)).toBe(a);
            expect(parent.get(1)).toBe(b);
            expect(parent.get(5)).toBeNull();
            expect(parent.index(b)).toBe(1);
            expect(parent.index(makeElement("line"))).toBe(-1);
        });

        it("prepend() inserts at the front", () => {
            const parent = makeElement("g");
            const a = makeElement("rect");
            const b = makeElement("circle");
            parent.append(a);
            parent.prepend(b);

            expect(parent.children).toEqual([b, a]);
        });

        it("each() invokes callback with (index, child) and `this` = child", () => {
            const parent = makeElement("g");
            const a = makeElement("rect");
            const b = makeElement("circle");
            parent.append(a).append(b);

            const seen: Array<[number, Element]> = [];
            parent.each(function (i, child) {
                seen.push([i, child]);
                expect(this).toBe(child);
            });

            expect(seen).toEqual([
                [0, a],
                [1, b],
            ]);
        });

        it("fixed: remove() drops only the removed element, keeping siblings on both sides", () => {
            const parent = makeElement("g");
            const a = makeElement("rect");
            const b = makeElement("circle");
            const c = makeElement("line");
            parent.append(a).append(b).append(c);

            b.remove();

            // Previously (preserved bug), `remove()` only kept elements strictly BEFORE the
            // removed one, silently dropping every later sibling (`c`) too - leaving `[a]`. Now
            // fixed: only `b` itself is dropped, `[a, c]` remains.
            expect(parent.children).toEqual([a, c]);
        });
    });

    describe("size()", () => {
        it("falls back to attribute values when getBoundingClientRect is zero (jsdom default)", () => {
            const el = makeElement("rect", { width: 50, height: 20 });
            const size = el.size();
            // jsdom reports a zero rect and zero computed style, so the final fallback is the
            // raw (string) width/height attribute values.
            expect(String(size.width)).toBe("50");
            expect(String(size.height)).toBe("20");
        });
    });

    describe("is()", () => {
        it("CORRECTION: does NOT throw - resolves via the real engine's module-registry instanceof check", () => {
            // Previously asserted as a "preserved bug: always throws ReferenceError" - that was
            // wrong. The real engine's own `is()` does `return this instanceof jui.include(moduleId)`,
            // a genuinely working registry lookup (`jui` is the real, always-present module
            // registry singleton, not an undefined global) - confirmed by loading real
            // `animate: true` demos directly against the live legacy site (no error). See
            // `is()`'s own doc comment.
            const el = makeElement("rect");
            expect(el.is("util.svg.element")).toBe(true);
            expect(el.is("util.svg.element.path")).toBe(false);
            expect(el.is("util.svg.element.nonexistent")).toBe(false);
        });
    });
});
