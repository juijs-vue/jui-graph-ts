import { describe, it, expect, afterEach } from "vitest";
import { pixelRatio, computePixelRatio, apply, polyfills } from "./hidpi";

// Under jsdom (no real `canvas` npm package installed, matching this project's dependencies),
// `HTMLCanvasElement.getContext('2d')` returns `null` and `window.devicePixelRatio` is `1` - so
// `pixelRatio` always computes to exactly 1 in this test environment, which means
// `polyfillForCanvasRenderingContext2D()`'s own `if (ratio === 1) return;` guard (see hidpi.ts)
// fires on every call that doesn't pass an explicit ratio override. `apply()`'s optional second
// `ratio` argument (default: the module's own `pixelRatio`) exists so this file can force a
// non-1 ratio and actually exercise the patch loop under jsdom.
describe("canvas/hidpi", () => {
    describe("pixelRatio / computePixelRatio", () => {
        it("pixelRatio is a positive finite number, computed once at module load", () => {
            expect(typeof pixelRatio).toBe("number");
            expect(pixelRatio).toBeGreaterThan(0);
            expect(Number.isFinite(pixelRatio)).toBe(true);
        });

        it("under jsdom, pixelRatio is exactly 1 (devicePixelRatio=1, backingStorePixelRatio falls back to 1 since getContext('2d') is null)", () => {
            expect(pixelRatio).toBe(1);
        });

        describe("FIXED: no longer crashes when `document` is unavailable (e.g. SSR)", () => {
            const originalDocument = globalThis.document;

            afterEach(() => {
                (globalThis as any).document = originalDocument;
            });

            it("computePixelRatio() returns 1 and does not throw when `document` is undefined", () => {
                // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
                delete (globalThis as any).document;
                expect(typeof globalThis.document).toBe("undefined");

                let result: number | undefined;
                expect(() => {
                    result = computePixelRatio();
                }).not.toThrow();
                expect(result).toBe(1);
            });
        });
    });

    it("apply() does not throw against a context-shaped stub, and leaves methods unpatched when pixelRatio===1", () => {
        const originalFillRect = () => "sentinel";
        const ctx: any = { fillRect: originalFillRect, stroke: () => {}, fillText: () => {}, strokeText: () => {} };

        expect(() => apply(ctx)).not.toThrow();
        // pixelRatio===1 short-circuits the whole patch loop - the method is untouched.
        expect(ctx.fillRect).toBe(originalFillRect);
    });

    it("polyfills() throws under jsdom: the global CanvasRenderingContext2D class itself doesn't exist without the optional `canvas` npm package", () => {
        // This is a real environment limitation, not a port bug: jsdom defines
        // `HTMLCanvasElement` regardless, but only defines `CanvasRenderingContext2D` as a global
        // when the native `canvas` package (not a dependency of this project) is installed.
        // `polyfills()` references `CanvasRenderingContext2D.prototype` directly - exactly like
        // the original - so it throws a ReferenceError here. `apply()` (tested above) is
        // unaffected since it takes a context object directly rather than reaching for the
        // global class.
        expect(() => polyfills()).toThrow(ReferenceError);
    });

    // With a real pixel ratio (forced via `apply()`'s optional second argument, since jsdom's own
    // `pixelRatio` always computes to 1 - see the top-of-file comment): `ratioArgs.arc = [0,1,2]`
    // means `context.arc(x,y,r,start,end)` gets patched so only ARGUMENT INDICES 0/1/2 (x, y, r)
    // are multiplied by the ratio - start/end angles (indices 3/4) are deliberately left
    // unscaled, which is correct (angles aren't pixel coordinates). `ratioArgs.fillRect = 'all'`
    // instead multiplies EVERY argument - correct there too, since all 4 of fillRect(x,y,w,h) are
    // pixel-space.
    it("FIXED: isPointInPath/isPointInStroke (correctly spelled) get patched and scale their coordinate args by the pixel ratio", () => {
        const calls: { name: string; args: any[] }[] = [];
        const ctx: any = {
            isPointInPath: (...args: any[]) => {
                calls.push({ name: "isPointInPath", args });
                return true;
            },
            isPointInStroke: (...args: any[]) => {
                calls.push({ name: "isPointInStroke", args });
                return false;
            },
        };

        const originalIsPointInPath = ctx.isPointInPath;
        const originalIsPointInStroke = ctx.isPointInStroke;

        apply(ctx, 2);

        // The real, correctly-spelled methods got replaced with wrapped versions...
        expect(ctx.isPointInPath).not.toBe(originalIsPointInPath);
        expect(ctx.isPointInStroke).not.toBe(originalIsPointInStroke);
        // ...and the typo'd keys are never created.
        expect(ctx.isPointinPath).toBeUndefined();
        expect(ctx.isPointinStroke).toBeUndefined();

        // Calling the patched method scales its coordinate args by the pixel ratio (2) before
        // delegating to the original.
        expect(ctx.isPointInPath(10, 20)).toBe(true);
        expect(calls[0]).toEqual({ name: "isPointInPath", args: [20, 40] });

        expect(ctx.isPointInStroke(5, 6)).toBe(false);
        expect(calls[1]).toEqual({ name: "isPointInStroke", args: [10, 12] });
    });
});
