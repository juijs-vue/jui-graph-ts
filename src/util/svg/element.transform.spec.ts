import { describe, it, expect } from "vitest";
import { TransElement } from "./element.transform";

function makeTrans(): TransElement {
    const el = new TransElement();
    el.create("g");
    return el;
}

describe("TransElement", () => {
    describe("translate()/scale()/skew()/matrix()", () => {
        it("applies a translate transform", () => {
            const el = makeTrans();
            el.translate(1, 2);
            expect(el.element.getAttribute("transform")).toBe("translate(1,2)");
        });

        it("applies a scale transform", () => {
            const el = makeTrans();
            el.scale(2, 3);
            expect(el.element.getAttribute("transform")).toBe("scale(2,3)");
        });

        it("applies a skew transform", () => {
            const el = makeTrans();
            el.skew(10);
            expect(el.element.getAttribute("transform")).toBe("skew(10)");
        });

        it("applies a matrix transform", () => {
            const el = makeTrans();
            el.matrix(1, 0, 0, 1, 5, 5);
            expect(el.element.getAttribute("transform")).toBe("matrix(1,0,0,1,5,5)");
        });

        it("preserved ordering quirk: composed transform string is always translate,scale,rotate,skew,matrix order, not call order", () => {
            const el = makeTrans();
            el.rotate(30).translate(1, 2);
            expect(el.element.getAttribute("transform")).toBe("translate(1,2) rotate(30)");
        });
    });

    describe("rotate()", () => {
        it("1-arg form: rotate(angle)", () => {
            const el = makeTrans();
            el.rotate(45);
            expect(el.element.getAttribute("transform")).toBe("rotate(45)");
        });

        it("3-arg form: rotate(angle, x, y)", () => {
            const el = makeTrans();
            el.rotate(45, 10, 20);
            expect(el.element.getAttribute("transform")).toBe("rotate(45 10,20)");
        });

        it("fixed: unsupported arg count no longer corrupts the transform attribute", () => {
            const el = makeTrans();
            el.translate(1, 2);
            (el.rotate as any)(45, 10); // unsupported 2-arg form

            const transform = el.element.getAttribute("transform")!;
            expect(transform).not.toContain("undefined");
            // The already-set translate() component must survive intact.
            expect(transform).toContain("translate(1,2)");
        });

        it("fixed: unsupported arg count (0 args) does not corrupt the transform attribute", () => {
            const el = makeTrans();
            (el.rotate as any)();
            expect(el.element.getAttribute("transform") || "").not.toContain("undefined");
        });

        it("fixed: unsupported arg count (4+ args) does not corrupt the transform attribute", () => {
            const el = makeTrans();
            el.scale(2, 2);
            (el.rotate as any)(1, 2, 3, 4);

            const transform = el.element.getAttribute("transform")!;
            expect(transform).not.toContain("undefined");
            expect(transform).toContain("scale(2,2)");
        });
    });

    describe("data()", () => {
        it("fixed: extracts and parses this command's own parenthesized args (single component)", () => {
            const el = makeTrans();
            el.translate(1, 2);
            const text = el.attr("transform") as string;
            expect(text).toBe("translate(1,2)");

            // Previously (preserved bug), each regex was a negated CHARACTER CLASS built from the
            // individual letters of its own name (e.g. `/[^translate()]+/g`), which coincidentally
            // produced the right-looking answer here (there being only one component to confuse it
            // with) but was not actually matching "the substring inside this command's parens" -
            // see the test below for where that mixup broke down for real.
            expect(el.data("translate")).toEqual([1, 2]);
        });

        it("returns null when no transform attribute is set", () => {
            const el = makeTrans();
            expect(el.data("translate")).toBeNull();
        });

        it("fixed: correctly reads each component when multiple transform components share letters", () => {
            const el = makeTrans();
            // translate() and rotate() share letters ("t", "r", "a") - the old negated-character-
            // class regex would match across component boundaries here and return garbage (or
            // throw, on no match at all). The full transform string ends up
            // "translate(1,2) rotate(30)" (fixed translate/scale/rotate/skew/matrix ordering).
            el.translate(1, 2);
            el.rotate(30);
            expect(el.element.getAttribute("transform")).toBe("translate(1,2) rotate(30)");

            expect(el.data("rotate")).toBe(30);
            expect(el.data("translate")).toEqual([1, 2]);
        });
    });
});
