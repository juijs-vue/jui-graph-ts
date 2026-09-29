import { describe, it, expect, beforeEach } from "vitest";
import { CanvasBase } from "./base";

// jsdom does not implement a real CanvasRenderingContext2D (getContext('2d') returns null
// without the optional `canvas` npm package, which this project does not depend on). A recording
// mock stands in for the real context - each method just logs its name + args, matching how
// jui-chart-vue's own Phase F test suites verify canvas draw calls without a real renderer.
function makeMockContext() {
    const calls: Array<{ name: string; args: any[] }> = [];
    const record =
        (name: string) =>
        (...args: any[]) => {
            calls.push({ name, args });
        };

    const gradient = { addColorStop: record("gradient.addColorStop") };

    const ctx: any = {
        calls,
        canvas: { width: 300, height: 150 },
        lineWidth: 1,
        strokeStyle: "",
        fillStyle: "",
        beginPath: record("beginPath"),
        closePath: record("closePath"),
        moveTo: record("moveTo"),
        lineTo: record("lineTo"),
        arc: record("arc"),
        arcTo: record("arcTo"),
        stroke: record("stroke"),
        fill: record("fill"),
        clearRect: record("clearRect"),
        getLineDash: () => [],
        setLineDash: record("setLineDash"),
        createLinearGradient: (...args: any[]) => {
            calls.push({ name: "createLinearGradient", args });
            return gradient;
        },
    };

    return ctx;
}

describe("CanvasBase", () => {
    let ctx: ReturnType<typeof makeMockContext>;
    let canvasBase: CanvasBase;

    beforeEach(() => {
        ctx = makeMockContext();
        canvasBase = new CanvasBase(ctx);
    });

    it("clearContext() clears the full canvas size", () => {
        canvasBase.clearContext();
        expect(ctx.calls).toEqual([{ name: "clearRect", args: [0, 0, 300, 150] }]);
    });

    it("drawLine() strokes a straight segment with a default color/width", () => {
        canvasBase.drawLine(0, 0, 10, 10);
        expect(ctx.strokeStyle).toBe("#434d6b");
        expect(ctx.lineWidth).toBe(1);
        const names = ctx.calls.map((c: any) => c.name);
        expect(names).toEqual(["beginPath", "moveTo", "lineTo", "stroke"]);
        expect(ctx.calls[1].args).toEqual([0, 0]);
        expect(ctx.calls[2].args).toEqual([10, 10]);
    });

    it("drawDashedLine() sets and restores the line dash", () => {
        canvasBase.drawDashedLine(0, 0, 10, 0, "#fff", [4, 2]);
        const names = ctx.calls.map((c: any) => c.name);
        expect(names).toEqual(["beginPath", "moveTo", "lineTo", "setLineDash", "stroke", "setLineDash"]);
        expect(ctx.calls[3].args).toEqual([[4, 2]]);
        expect(ctx.calls[5].args).toEqual([[]]); // restores the (empty) original dash
    });

    it("drawLines() connects an arbitrary number of points after the first", () => {
        canvasBase.drawLines("#000", [0, 0], [5, 5], [10, 0]);
        const names = ctx.calls.map((c: any) => c.name);
        expect(names).toEqual(["beginPath", "moveTo", "lineTo", "lineTo", "stroke"]);
    });

    it("drawRoundRect() traces 4 lineTo/arcTo corner pairs then closes the path", () => {
        canvasBase.drawRoundRect(0, 0, 20, 10, 3);
        const names = ctx.calls.map((c: any) => c.name);
        expect(names).toEqual(["beginPath", "moveTo", "lineTo", "arcTo", "lineTo", "arcTo", "lineTo", "arcTo", "lineTo", "arcTo", "closePath"]);
    });

    it("drawFreeRect() fills (and optionally strokes a border around) a quad", () => {
        canvasBase.drawFreeRect(0, 0, 1, 0, 1, 1, 0, 1, "#111", "#222");
        const names = ctx.calls.map((c: any) => c.name);
        expect(names).toEqual(["beginPath", "moveTo", "lineTo", "lineTo", "lineTo", "closePath", "stroke", "fill"]);
        expect(ctx.fillStyle).toBe("#111");
        expect(ctx.strokeStyle).toBe("#222");
    });

    it("drawFreeRect() skips the stroke branch when no borderColor is given", () => {
        canvasBase.drawFreeRect(0, 0, 1, 0, 1, 1, 0, 1);
        const names = ctx.calls.map((c: any) => c.name);
        expect(names).toEqual(["beginPath", "moveTo", "lineTo", "lineTo", "lineTo", "closePath", "fill"]);
        expect(ctx.fillStyle).toBe("#ffffff");
    });

    it("drawTriangle()/drawSquare()/drawCircle() fill simple shapes", () => {
        canvasBase.drawTriangle(5, 5, 2, "#abc");
        expect(ctx.calls.map((c: any) => c.name)).toEqual(["beginPath", "moveTo", "lineTo", "lineTo", "closePath", "fill"]);
        expect(ctx.fillStyle).toBe("#abc");

        ctx.calls.length = 0;
        canvasBase.drawSquare(0, 0, 3, "#def");
        expect(ctx.calls.map((c: any) => c.name)).toEqual(["beginPath", "moveTo", "lineTo", "lineTo", "lineTo", "closePath", "fill"]);

        ctx.calls.length = 0;
        canvasBase.drawCircle(1, 1);
        expect(ctx.calls.map((c: any) => c.name)).toEqual(["beginPath", "arc", "fill"]);
        expect(ctx.calls[1].args).toEqual([1, 1, 1, 0, 2 * Math.PI]); // default d=1
    });

    it("drawBullet() builds a gradient and a rounded lead-in arc", () => {
        canvasBase.drawBullet(0, 0);
        const names = ctx.calls.map((c: any) => c.name);
        expect(names[0]).toBe("createLinearGradient");
        expect(names).toContain("gradient.addColorStop");
        expect(names).toContain("arc");
    });

    describe("drawPage() (fixed)", () => {
        it("does not throw, and draws the legacy folded-corner page quad via drawFreeRect", () => {
            // Previously (preserved bug), drawPage() unconditionally threw
            // `ReferenceError: drawFreeRect is not defined` - and re-cloning the real legacy
            // source (juijs/jui-graph's own src/util/canvas/base.js) confirms this is a genuine
            // bug in the ORIGINAL engine too (it calls a bare `drawFreeRect(context, ...)`,
            // never declared as a standalone variable there either - only ever assigned as
            // `this.drawFreeRect`, with no `context` parameter). Now it calls the real
            // `this.drawFreeRect(...)` with the exact corner offsets the legacy source specifies:
            // (value+x1,y1), (value+x1-20,y1+14), (value+x1-20,y1+52), (value+x1,y1+38).
            expect(() => canvasBase.drawPage(10, 0, 0, "#fff")).not.toThrow();

            const names = ctx.calls.map((c: any) => c.name);
            expect(names).toEqual(["beginPath", "moveTo", "lineTo", "lineTo", "lineTo", "closePath", "fill"]);
            expect(ctx.calls[1].args).toEqual([10, 0]);
            expect(ctx.calls[2].args).toEqual([-10, 14]);
            expect(ctx.calls[3].args).toEqual([-10, 52]);
            expect(ctx.calls[4].args).toEqual([10, 38]);
            expect(ctx.fillStyle).toBe("#fff");
        });

        it("strokes a fixed translucent-white border when border=true (legacy hardcodes 'rgba(255,255,255,0.2)', not `color`)", () => {
            canvasBase.drawPage(10, 0, 0, "#fff", true);
            const names = ctx.calls.map((c: any) => c.name);
            expect(names).toContain("stroke");
            expect(ctx.strokeStyle).toBe("rgba(255,255,255,0.2)");
        });

        it("skips the stroke branch when border=false (default)", () => {
            canvasBase.drawPage(10, 0, 0, "#fff");
            const names = ctx.calls.map((c: any) => c.name);
            expect(names).not.toContain("stroke");
        });
    });

    describe("getCurvePoints()", () => {
        it("open curve: interpolates numOfSegments+1 points per (N-1) segments, clamped to [minY, maxY]", () => {
            // 3 points -> 2 segments (per the original's `for (i=2; i<_pts.length-4; i+=2)` loop
            // over the open-curve-padded array, which pads to length N+4 and steps by 2 -
            // (N+4-4-2)/2+1 = N-1 iterations) -> (N-1)*(numOfSegments+1) output points,
            // hand-checked against a literal transcription of the Catmull-Rom stepping.
            const pts = [0, 0, 10, 20, 20, 0];
            const result = canvasBase.getCurvePoints(pts, 0, 20, 0.5, false, 4);

            expect(result.length).toBe(2 * (4 + 1) * 2);
            // First interpolated point (t=0) reproduces the original segment's start point exactly.
            expect(result[0]).toBeCloseTo(0, 10);
            expect(result[1]).toBeCloseTo(0, 10);
            // All y-values stay within the clamp range.
            for (let i = 1; i < result.length; i += 2) {
                expect(result[i]).toBeGreaterThanOrEqual(0);
                expect(result[i]).toBeLessThanOrEqual(20);
            }
        });

        it("clamps y values above maxY/below minY", () => {
            const pts = [0, 100, 10, -100, 20, 100];
            const result = canvasBase.getCurvePoints(pts, 0, 10, 0.5, false, 4);
            for (let i = 1; i < result.length; i += 2) {
                expect(result[i]).toBeGreaterThanOrEqual(0);
                expect(result[i]).toBeLessThanOrEqual(10);
            }
        });

        it("closed curve wraps around using the last/first points as padding", () => {
            const pts = [0, 0, 10, 10, 20, 0, 10, -10];
            const result = canvasBase.getCurvePoints(pts, -10, 10, 0.5, true, 4);
            expect(result.length).toBeGreaterThan(0);
        });
    });

    it("drawCurve() traces moveTo + lineTo across the interpolated points", () => {
        canvasBase.drawCurve([[0, 0], [10, 10], [20, 0]], 0, 10, 0.5, false, 2);
        const names = ctx.calls.map((c: any) => c.name);
        expect(names[0]).toBe("beginPath");
        expect(names[1]).toBe("moveTo");
        expect(names.slice(2).every((n: string) => n === "lineTo")).toBe(true);
    });
});
