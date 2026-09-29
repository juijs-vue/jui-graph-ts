import { describe, it, expect } from "vitest";
import { PathSymbolElement } from "./element.path.symbol";

function makeSymbol(): PathSymbolElement {
    const el = new PathSymbolElement();
    el.create("path");
    return el;
}

describe("PathSymbolElement", () => {
    describe("template()", () => {
        it("builds raw command-string templates for each symbol shape", () => {
            const el = makeSymbol();
            const tpl = el.template(10, 10);

            expect(tpl.triangle).toBe("m0,-5 l5,10 l-10,0 l5,-10");
            expect(tpl.rect).toBe("m-5,-5 l10,0 l0,10 l-10,0 l0,-10");
            expect(tpl.rectangle).toBe(tpl.rect);
            expect(tpl.cross).toBe("m-5,-5 l10,10 m0,-10 l-10,10");
            expect(tpl.circle).toBe("m-10,0 a5,5 0 1,1 10,0 a5,5 0 1,1 -10,0");
        });
    });

    describe("add()/join()", () => {
        it("accumulates symbol instances added via add() and flushes them on join()", () => {
            const el = makeSymbol();
            const tpl = el.template(4, 4);

            el.add(0, 0, tpl.circle);
            el.add(10, 10, tpl.circle);

            expect(el.element.getAttribute("d")).toBeNull();
            el.join();

            expect(el.element.getAttribute("d")).toBe(" M0,0" + tpl.circle + " M10,10" + tpl.circle);
        });
    });

    describe("fixed: join() no longer shadows PathElement's own accumulator", () => {
        it("triangle()/rect()/cross()/circle() build path data via the inherited command builder, and join() now flushes it", () => {
            const el = makeSymbol();
            el.triangle(5, 5, 4, 4);

            el.join();

            // Previously (preserved bug), PathSymbolElement's own join() override only ever read/
            // wrote `ordersString` (populated only by `.add()`) - the inherited MoveTo/moveTo/
            // lineTo calls made by triangle() went into PathElement's own private `orders` array
            // instead, which the override never looked at, so `d` was never actually set. Now
            // join() also flushes the inherited orders buffer (via `super.join()`), so triangle()
            // (and rect()/rectangle()/cross()/circle()) actually render.
            const d = el.element.getAttribute("d");
            expect(d).not.toBeNull();
            expect(d).not.toBe("");
            expect(d).toBe("M5,5 m0,-2 l2,4 l-4,0 l2,-4");
        });

        it("rect() also renders now", () => {
            const el = makeSymbol();
            el.rect(1, 1, 2, 2);
            el.join();

            expect(el.element.getAttribute("d")).toBe("M1,1 m-1,-1 l2,0 l0,2 l-2,0 l0,-2");
        });

        it("mixing add() and rect() flushes BOTH accumulators", () => {
            const el = makeSymbol();
            const tpl = el.template(4, 4);

            el.add(1, 1, tpl.rect);
            el.rect(9, 9, 4, 4); // previously silently discarded, per the fixed bug above
            el.join();

            expect(el.element.getAttribute("d")).toBe("M9,9 m-2,-2 l4,0 l0,4 l-4,0 l0,-4" + " M1,1" + tpl.rect);
        });
    });
});
