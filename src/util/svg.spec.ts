import { describe, it, expect, beforeEach } from "vitest";
import { SVG } from "./svg";
import { Element as SvgElement } from "./svg/element";
import { TransElement } from "./svg/element.transform";
import { PathElement } from "./svg/element.path";

describe("SVG", () => {
    let container: HTMLDivElement;

    beforeEach(() => {
        document.body.innerHTML = "";
        container = document.createElement("div");
        document.body.appendChild(container);
    });

    describe("constructor", () => {
        it("mounts a root <svg> DOM node immediately, and stages (not yet DOM-attached) main/sub <g> groups", () => {
            const svg = new SVG(container, { width: 100, height: 100 });

            // The root <svg> is attached to the real DOM immediately (`rootElem.appendChild(...)`
            // in the original), but `main`/`sub` are only staged into `root`'s own (non-DOM)
            // `.children` bookkeeping via `.append()` - they don't become real DOM children of
            // the <svg> element until the first `render()` call actually walks the tree.
            expect(container.children.length).toBe(1);
            const rootEl = container.children[0];
            expect(rootEl.tagName).toBe("svg");
            expect(rootEl.getAttribute("width")).toBe("100");
            expect(rootEl.children.length).toBe(0);

            expect(svg.root).toBeInstanceOf(SvgElement);
            expect(svg.root.children.length).toBe(2);
            expect(svg.root.children[0].element.tagName).toBe("g");
            expect(svg.root.children[0].element.getAttribute("transform")).toBe("translate(0.5,0.5)");
            expect(svg.root.children[1].element.tagName).toBe("g");

            svg.render();
            expect(rootEl.children.length).toBe(2);
            expect(rootEl.children[0].tagName).toBe("g");
        });
    });

    describe("create()/createChild() (overridden)", () => {
        it("depth 0: attaches directly to the main group", () => {
            const svg = new SVG(container);
            const rect = svg.rect({ width: 5 });
            expect(rect.parent).toBeDefined();

            svg.render();
            const mainG = (container.querySelector("svg") as SVGElement).children[0];
            expect(mainG.children.length).toBe(1);
            expect(mainG.children[0].tagName).toBe("rect");
        });

        it("nested callback: children created inside a group() callback attach to that group, not main", () => {
            const svg = new SVG(container);
            let innerRect: TransElement | null = null;

            svg.group({}, function () {
                innerRect = svg.rect({ width: 1 });
            });

            expect(innerRect!.parent).not.toBeNull();
            svg.render();

            const mainG = (container.querySelector("svg") as SVGElement).children[0];
            expect(mainG.children.length).toBe(1);
            expect(mainG.children[0].tagName).toBe("g");
            expect(mainG.children[0].children.length).toBe(1);
            expect(mainG.children[0].children[0].tagName).toBe("rect");
        });

        it("preserved bug: createChild()'s parent guard can never actually fire", () => {
            const svg = new SVG(container);
            // stop() uses createChild() internally - if the guard worked as apparently
            // intended, calling it directly under main (depth 0) might be expected to throw;
            // it never does, because obj.parent is always undefined at check-time (before
            // obj.create() has run).
            expect(() => svg.stop({ offset: "0%" })).not.toThrow();
        });
    });

    describe("size()", () => {
        it("getter/setter", () => {
            const svg = new SVG(container, { width: 10, height: 20 });
            svg.size(200, 100);
            const rootEl = container.querySelector("svg")!;
            expect(rootEl.getAttribute("width")).toBe("200");
            expect(rootEl.getAttribute("height")).toBe("100");

            const size = svg.size();
            expect(String(size.width)).toBe("200");
            expect(String(size.height)).toBe("100");
        });
    });

    describe("render()/clear()/reset()", () => {
        it("render() appends staged elements into the live DOM", () => {
            const svg = new SVG(container);
            svg.rect({ width: 1 });
            svg.circle({ r: 1 });
            svg.render();

            const mainG = container.querySelector("svg")!.children[0];
            expect(mainG.children.length).toBe(2);
        });

        it("clear() detaches main's rendered nodes but keeps them staged in .children", () => {
            const svg = new SVG(container);
            svg.rect({ width: 1 });
            svg.render();

            const mainG = container.querySelector("svg")!.children[0];
            expect(mainG.children.length).toBe(1);

            svg.clear();
            expect(mainG.children.length).toBe(0);
        });

        it("reset() clears AND empties the staged children array", () => {
            const svg = new SVG(container);
            svg.rect({ width: 1 });
            svg.render();
            svg.reset();

            // Nothing left to render.
            svg.render();
            const mainG = container.querySelector("svg")!.children[0];
            expect(mainG.children.length).toBe(0);
        });

        it("auto-joins PathElement/PolyElement children during render()", () => {
            const svg = new SVG(container);
            const path = svg.path({ fill: "red" });
            path.MoveTo(0, 0).LineTo(10, 10);
            expect(path.element.getAttribute("d")).toBeNull();

            svg.render();
            expect(path.element.getAttribute("d")).toBe("M0,0 L10,10");
        });

        it("respects explicit render order (higher .order renders later/later-in-DOM)", () => {
            const svg = new SVG(container);
            const a = svg.rect({ id: "a" });
            const b = svg.rect({ id: "b" });
            a.order = 2;
            b.order = 1;

            svg.render();
            const mainG = container.querySelector("svg")!.children[0];
            expect(mainG.children[0].getAttribute("id")).toBe("b");
            expect(mainG.children[1].getAttribute("id")).toBe("a");
        });
    });

    describe("autoRender()", () => {
        it("appends to sub (isAuto falsy) or main (isAuto truthy) at depth 0", () => {
            const svg = new SVG(container);

            const el = new SvgElement();
            el.create("rect");
            svg.autoRender(el, false);

            // Staged into `sub`'s own bookkeeping immediately...
            expect(svg.root.children[1].children.length).toBe(1);

            // ...but not yet a real DOM child until a render(true) pass walks `root` (a plain
            // render() only walks `main`, per isFirst/isAll - see render()'s own doc comment).
            const rootEl = container.querySelector("svg")!;
            expect(rootEl.children.length).toBe(0);

            svg.render(true);
            expect(rootEl.children[1].children.length).toBe(1);
            expect(rootEl.children[1].children[0].tagName).toBe("rect");
        });
    });

    describe("toXML()/toDataURI()", () => {
        it("produces a namespaced XML document string", () => {
            const svg = new SVG(container, { width: 10, height: 10 });
            const xml = svg.toXML();
            expect(xml.startsWith('<?xml version="1.0" encoding="utf-8"?>')).toBe(true);
            expect(xml).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
        });

        it("produces a data:image/svg+xml URI", () => {
            const svg = new SVG(container);
            const uri = svg.toDataURI();
            expect(uri.startsWith("data:image/svg+xml")).toBe(true);
        });

        it("percent-encodes the XML so an unescaped '#' (e.g. from url(#gradient-id)) can't truncate the URI at a fragment boundary", () => {
            // Real bug, found via a real Chromium render (jui-vue.io's gallery/gps demo's
            // map.minimap widget - the ONLY thing anywhere in this whole project that calls
            // toDataURI() with real content): the original only ran `encodeURIComponent` for
            // `browser.mozilla`/`browser.msie`, never for Chrome/Chromium/Safari (the large
            // majority of real usage today) - an unescaped `#` in the XML (any element using
            // `fill="url(#someId)"`, which any SVG with a gradient/clipPath reference does) gets
            // read as the URI's fragment delimiter, silently truncating everything after it - the
            // resulting data URI's SVG payload is corrupt/incomplete and fails to render at all
            // (a real, plainly visible "broken image" glyph in the browser, not a subtle glitch).
            const svg = new SVG(container);
            svg.rect({ fill: "url(#some-gradient-id)" });
            svg.render();

            const uri = svg.toDataURI();
            const payload = uri.slice(uri.indexOf(",") + 1);
            expect(payload).not.toContain("#");
            expect(decodeURIComponent(payload)).toContain("url(#some-gradient-id)");
        });
    });

    describe("getTextSize()", () => {
        it("returns {width:0, height:0} for an empty string without touching the DOM", () => {
            const svg = new SVG(container);
            expect(svg.getTextSize("")).toEqual({ width: 0, height: 0 });
        });

        it("returns a numeric width/height object for non-empty text (jsdom reports 0-size boxes)", () => {
            const svg = new SVG(container);
            const size = svg.getTextSize("hello", { fontSize: 12 });
            expect(typeof size.width).toBe("number");
            expect(typeof size.height).toBe("number");
        });
    });

    describe("rect3d()/cylinder3d() (inherited from SVG3d/SVGBase) via a real SVG instance", () => {
        it("actually builds child paths, unlike a bare SVG3d (see base3d.spec.ts)", () => {
            const svg = new SVG(container);
            const g = svg.rect3d("#ff0000", 10, 10, 30, 5);
            expect(g.children.length).toBe(3);
            expect(g.children.every((c) => c instanceof PathElement)).toBe(true);
        });
    });

    describe("static SVG.createObject()", () => {
        it("recursively builds a detached Element tree from a JSON spec", () => {
            const el = SVG.createObject({
                type: "pattern",
                attr: { x: 0, y: 0 },
                children: [{ type: "rect", attr: { width: 20 } }, { type: "rect", attr: { width: 10 } }],
            });

            expect(el.element.tagName).toBe("pattern");
            expect(el.children.length).toBe(2);
            expect(el.children[0].element.tagName).toBe("rect");
            expect(el.children[0].element.getAttribute("width")).toBe("20");
        });
    });

    describe("download()", () => {
        it("creates, clicks, and removes a temporary <a download> element without throwing", () => {
            const svg = new SVG(container, { width: 5, height: 5 });
            expect(() => svg.download("chart.png")).not.toThrow();
            // The temporary anchor is removed synchronously after click().
            expect(document.querySelectorAll("a[download]").length).toBe(0);
        });
    });
});
