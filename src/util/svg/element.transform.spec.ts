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
        it("preserved bug: regex is a negated character class, not a real token matcher", () => {
            const el = makeTrans();
            el.translate(1, 2);
            const text = el.attr("transform") as string;
            expect(text).toBe("translate(1,2)");

            // /[^translate()]+/g matches runs of characters that are NOT any of the letters in
            // "translate()" (t/r/a/n/s/l/e/(/)) - against "translate(1,2)" that's just the
            // digits/comma, i.e. "1,2", not a stripped-down "1,2)" or the whole call. Verified
            // by hand-trace + Node-cross-check against the literal upstream regex.
            expect(el.data("translate")).toBe("1,2");
        });

        it("returns null when no transform attribute is set", () => {
            const el = makeTrans();
            expect(el.data("translate")).toBeNull();
        });
    });
});
