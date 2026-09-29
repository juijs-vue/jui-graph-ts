import { describe, it, expect, vi, beforeEach } from "vitest";
import { Axis, getRate } from "./axis";
import type { AxisChart, AxisOptions, AreaBox, GridConstructor, GridInstance, GridRenderedScale } from "./axis";
import { SVG } from "../util/svg";
import { TransElement } from "../util/svg/element.transform";
import { CoreGrid } from "../grid/core";

// ---------------------------------------------------------------------------------------------
// Test doubles - NOT the "fake grid implementation" Phase 0/this task's own instructions say not
// to ship in `axis.ts` itself; these are ordinary unit-test fixtures satisfying the
// `GridConstructor`/`GridInstance`/`AxisChart` structural contracts `axis.ts` defines, the same
// way any real Phase C `grid/*.ts` class or Phase B `base/builder.ts` chart eventually will.
// ---------------------------------------------------------------------------------------------

/** A trivial grid stand-in: renders an empty `<g>` and returns a bare scale object. */
class StubGrid implements GridInstance {
    chart: AxisChart;
    axis: Axis;
    grid: Record<string, unknown>;
    svg: SVG;

    static setupCalls = 0;
    static setup(): Record<string, unknown> {
        StubGrid.setupCalls++;
        return { dist: 0 };
    }

    constructor(chart: AxisChart, axis: Axis, gridOptions: Record<string, unknown>) {
        this.chart = chart;
        this.axis = axis;
        this.grid = gridOptions;
        this.svg = chart.svg;
    }

    render(): { root: TransElement; scale: GridRenderedScale } {
        const root = this.svg.group();
        return { root, scale: {} };
    }
}

function defaultAxisOptions(overrides: Partial<AxisOptions> = {}): AxisOptions {
    return {
        data: [],
        origin: [],
        buffer: 10000,
        shift: 1,
        index: 0,
        page: 1,
        start: 0,
        end: 0,
        degree: { x: 0, y: 0, z: 0 },
        depth: 0,
        perspective: 0.9,
        x: null,
        y: null,
        z: null,
        c: null,
        map: null,
        keymap: {},
        area: {},
        padding: { top: 0, bottom: 0, left: 0, right: 0 },
        ...overrides,
    };
}

interface ChartTestHarness {
    chart: AxisChart;
    svg: SVG;
    handlers: Record<string, Array<(e: any) => void>>;
    emit: ReturnType<typeof vi.fn>;
    themeValues: Record<string, string | number>;
    isRenderFlag: boolean;
    renderSpy: ReturnType<typeof vi.fn>;
}

function makeChart(area: AreaBox = { x: 0, y: 0, x2: 400, y2: 300, width: 400, height: 300 }): ChartTestHarness {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const svg = new SVG(container, { width: area.width, height: area.height });

    const handlers: Record<string, Array<(e: any) => void>> = {};
    const emit = vi.fn();
    const renderSpy = vi.fn();
    let isRenderFlag = false;
    const themeValues: Record<string, string | number> = {
        axisBorderWidth: 1,
        axisBorderRadius: 0,
        axisBackgroundColor: "#fff",
        axisBackgroundOpacity: 1,
        axisBorderColor: "#000",
    };

    const areaFn = ((key?: string) => (key ? (area as any)[key] : area)) as AxisChart["area"];

    const chart: AxisChart = {
        area: areaFn,
        svg,
        index: 7,
        appendDefs: vi.fn(),
        theme: (key: string) => themeValues[key],
        isRender: () => isRenderFlag,
        render: renderSpy,
        on: (event, handler) => {
            (handlers[event] ||= []).push(handler);
        },
        emit,
        gridTypes: { block: StubGrid as unknown as GridConstructor },
    };

    return {
        chart,
        svg,
        handlers,
        emit,
        themeValues,
        get isRenderFlag() {
            return isRenderFlag;
        },
        set isRenderFlag(v: boolean) {
            isRenderFlag = v;
        },
        renderSpy,
    } as unknown as ChartTestHarness;
}

beforeEach(() => {
    document.body.innerHTML = "";
    StubGrid.setupCalls = 0;
});

describe("getRate", () => {
    it("resolves a percentage string relative to max", () => {
        expect(getRate("50%", 400)).toBe(200);
        expect(getRate("10%", 250)).toBe(25);
    });

    it("passes a plain number straight through unchanged", () => {
        expect(getRate(300, 400)).toBe(300);
    });

    it("passes a non-percentage string straight through unchanged (no '%' present)", () => {
        expect(getRate("abc", 400)).toBe("abc");
    });
});

describe("Axis - calculatePanel via area()", () => {
    it("computes the default full-chart area with zero padding (400x300 chart)", () => {
        const { chart } = makeChart({ x: 0, y: 0, x2: 400, y2: 300, width: 400, height: 300 });
        const axis = new Axis(chart, defaultAxisOptions(), defaultAxisOptions());
        expect(axis.area()).toEqual({ x: 0, y: 0, x2: 400, y2: 300, width: 400, height: 300 });
    });

    it("matches jui-chart-vue's useChartLayout.spec.ts hand-traced padding case: 400x300 chart, " +
        "padding {top:20,right:24,bottom:32,left:48} -> {x:48,y:20,x2:376,y2:268,width:328,height:248}", () => {
        const { chart } = makeChart({ x: 0, y: 0, x2: 400, y2: 300, width: 400, height: 300 });
        const options = defaultAxisOptions({ padding: { top: 20, right: 24, bottom: 32, left: 48 } });
        const axis = new Axis(chart, options, options);
        expect(axis.area()).toEqual({ x: 48, y: 20, x2: 376, y2: 268, width: 328, height: 248 });
    });

    it("an integer `padding` option is uniformly applied to all four sides", () => {
        const { chart } = makeChart({ x: 0, y: 0, x2: 400, y2: 300, width: 400, height: 300 });
        const options = defaultAxisOptions({ padding: 10 as unknown as AxisOptions["padding"] });
        const axis = new Axis(chart, options, options);
        expect(axis.padding()).toEqual({ top: 10, bottom: 10, left: 10, right: 10 });
        expect(axis.area()).toEqual({ x: 10, y: 10, x2: 390, y2: 290, width: 380, height: 280 });
    });

    it("resolves a percentage `area.width`/`area.x` against the CHART's width, not against " +
        "the box's own current width (Node-verified against the original: getRate(a.width, " +
        "chart.area('width')), not getRate(a.width, a.width))", () => {
        const { chart } = makeChart({ x: 0, y: 0, x2: 400, y2: 300, width: 400, height: 300 });
        const options = defaultAxisOptions({ area: { width: "50%" } });
        const axis = new Axis(chart, options, options);
        // width resolves to 200 (50% of chart width 400); x defaults to 0 (skip:true fill);
        // height defaults to the full chart height (300, unfilled since not requested as %).
        expect(axis.area()).toEqual({ x: 0, y: 0, x2: 200, y2: 300, width: 200, height: 300 });
    });

    it("does not clobber an already-set area.x/y/width/height with the chart-size defaults " +
        "(extend(..., true) only fills UNDEFINED keys)", () => {
        const { chart } = makeChart({ x: 0, y: 0, x2: 400, y2: 300, width: 400, height: 300 });
        const options = defaultAxisOptions({ area: { x: 50, y: 25, width: 100, height: 80 } });
        const axis = new Axis(chart, options, options);
        expect(axis.area()).toEqual({ x: 50, y: 25, x2: 150, y2: 105, width: 100, height: 80 });
    });

    it("area(key) returns a single field, area() with no key returns the whole box", () => {
        const { chart } = makeChart();
        const axis = new Axis(chart, defaultAxisOptions(), defaultAxisOptions());
        expect(axis.area("width")).toBe(400);
        expect(axis.area("x2")).toBe(400);
    });
});

describe("Axis - drawGridType / grid wiring", () => {
    it("resolves a null x/y config as null (no grid drawn) - preserves the original's " +
        "'no object -> return null' short-circuit for x/y/z", () => {
        const { chart } = makeChart();
        const axis = new Axis(chart, defaultAxisOptions(), defaultAxisOptions());
        expect(axis.x).toBeNull();
        expect(axis.y).toBeNull();
    });

    it("defaults x-orient to 'bottom' and y-orient to 'left' when a grid config is given " +
        "(mutates the ORIGINAL config object in place, matches original's drawGridType())", () => {
        const { chart } = makeChart();
        const xConfig: Record<string, unknown> = {};
        const yConfig: Record<string, unknown> = {};
        const options = defaultAxisOptions({ x: xConfig, y: yConfig });
        const axis = new Axis(chart, options, options);

        // axis.get("x")/get("y") read back cloneAxis.x/.y - the SAME object references that were
        // passed in, now mutated with resolved orient/type defaults by drawGridType().
        expect(axis.get("x")).toBe(xConfig);
        expect(xConfig.orient).toBe("bottom");
        expect(xConfig.type).toBe("block");
        expect(yConfig.orient).toBe("left");

        // axis.x itself, by contrast, now holds the RENDERED SCALE (stamped with .type/.root),
        // not the config object anymore - the two-phase-shape quirk documented on the class.
        expect((axis.x as GridRenderedScale).type).toBe("block");
        expect((axis.x as GridRenderedScale).root).toBeInstanceOf(TransElement);
    });

    it("an explicit orient of 'top'/'right' is honored, matching drawGridType()'s coercion", () => {
        const { chart } = makeChart();
        const xConfig: Record<string, unknown> = { orient: "top" };
        const yConfig: Record<string, unknown> = { orient: "right" };
        const options = defaultAxisOptions({ x: xConfig, y: yConfig });
        new Axis(chart, options, options);
        expect(xConfig.orient).toBe("top");
        expect(yConfig.orient).toBe("right");
    });

    it("merges the resolved GridConstructor.setup() defaults onto the grid config via " +
        "extend(..., true) (fills only undefined keys)", () => {
        const { chart } = makeChart();
        const xConfig: Record<string, unknown> = {};
        const options = defaultAxisOptions({ x: xConfig });
        new Axis(chart, options, options);
        expect(StubGrid.setupCalls).toBeGreaterThan(0);
        expect(xConfig.dist).toBe(0);
    });

    it("merges the FULL GridConstructor extend chain leaf-first, not just the leaf class's own " +
        "setup() (regression test for a real, previously-shipped gap - see mergeSetupChain()'s " +
        "doc comment in axis.ts; StubGrid above returns `dist` from its OWN setup() directly, so " +
        "it never exercised a real multi-level CoreGrid-like ancestor chain the way this does)", () => {
        class BaseGridLike extends StubGrid {
            static setup(): Record<string, unknown> {
                return { fromBase: "base-default", overridden: "base-value" };
            }
        }
        class LeafGrid extends BaseGridLike {
            static setup(): Record<string, unknown> {
                return { fromLeaf: "leaf-default", overridden: "leaf-value" };
            }
        }

        const { chart } = makeChart();
        (chart.gridTypes as Record<string, GridConstructor>).block = LeafGrid as unknown as GridConstructor;
        const xConfig: Record<string, unknown> = { type: "block" };
        const options = defaultAxisOptions({ x: xConfig });
        new Axis(chart, options, options);

        // Both the leaf's own default AND its ancestor's (`BaseGridLike`'s) default must be
        // present - not just the leaf's.
        expect(xConfig.fromLeaf).toBe("leaf-default");
        expect(xConfig.fromBase).toBe("base-default");
        // Where both levels declare the same key, the more-leaf value wins.
        expect(xConfig.overridden).toBe("leaf-value");
        // And StubGrid's own `dist: 0` (the "grandparent" level here) still comes through too.
        expect(xConfig.dist).toBe(0);
    });

    it("positions a left-oriented y-grid's root via translate(chart.x + axis.x - dist, chart.y)", () => {
        const { chart } = makeChart({ x: 0, y: 0, x2: 400, y2: 300, width: 400, height: 300 });
        const yConfig: Record<string, unknown> = { orient: "left", dist: 5 };
        const options = defaultAxisOptions({
            y: yConfig,
            padding: { top: 20, right: 24, bottom: 32, left: 48 },
        });
        const axis = new Axis(chart, options, options);
        const root = (axis.y as GridRenderedScale).root!;
        // chart.area("x") = 0 (default AreaBox above), axis.area("x") = 48 (left padding), dist = 5
        expect(root.attr("transform")).toBe("translate(43,0)");
    });
});

describe("Axis - drawMapType", () => {
    it("is null when no map config and no chart.mapType are given", () => {
        const { chart } = makeChart();
        const axis = new Axis(chart, defaultAxisOptions(), defaultAxisOptions());
        expect((axis as any).map).toBeNull();
    });

    it(
        "actually constructs the configured MapConstructor and renders it (bug fix - reload()'s " +
            "extend(this, {map: options.map}) used to overwrite the SAME field drawMapType()'s " +
            "'construct once' cache check reads, so `new MapCtor(...)` was never called and " +
            "`this.map.render` crashed with a TypeError on every real map chart)",
        () => {
            let constructCalls = 0;
            let renderCalls = 0;
            class StubMap {
                chart: AxisChart;
                axis: Axis;
                map: Record<string, unknown>;
                svg: SVG;
                constructor(chart: AxisChart, axis: Axis, mapOptions: Record<string, unknown>) {
                    constructCalls++;
                    this.chart = chart;
                    this.axis = axis;
                    this.map = mapOptions;
                    this.svg = chart.svg;
                }
                render(): { root: TransElement; scale: GridRenderedScale } {
                    renderCalls++;
                    const root = this.svg.group();
                    return { root, scale: { type: "map" } };
                }
            }

            const { chart } = makeChart();
            (chart as unknown as { mapType: unknown }).mapType = StubMap;
            const mapConfig: Record<string, unknown> = { type: "my-map" };
            const options = defaultAxisOptions({ map: mapConfig });

            const axis = new Axis(chart, options, options);

            expect(constructCalls).toBe(1);
            expect(renderCalls).toBe(1);
            expect((axis.get("map") as Record<string, unknown>)).toBe(mapConfig);
            // The rendered scale (`this.map`, distinct from `this.get("map")`'s raw config) is
            // stamped with the config's own `type` - confirming drawMapType() actually reached
            // render() via the newly-constructed MapInstance, not a crash swallowed somewhere.
            expect((axis as unknown as { map: GridRenderedScale }).map.type).toBe("my-map");
        },
    );
});

describe("Axis - paging (setScreen/setZoom/screen/next/prev/zoom/update)", () => {
    function makePagedAxis(data: number[], buffer: number, shift = 1) {
        const { chart } = makeChart();
        const options = defaultAxisOptions({ data, origin: data, buffer, shift });
        const axis = new Axis(chart, options, options);
        return { axis, chart };
    }

    it("init() pages `data` via setScreen(), but reload() (called right after, from the same " +
        "init()) immediately resets start/end/page back to cloneAxis's PRE-paging config values " +
        "- a genuine, Node/hand-traced original quirk (not introduced by this port): " +
        "`init()` calls `setScreen(self.page)` (computing real start/end/page/data), then " +
        "unconditionally calls `self.reload(cloneAxis)`, whose own last lines do `this.start = " +
        "options.start; this.end = options.end; this.page = options.page;` - `cloneAxis` was " +
        "never updated by setScreen(), so those three fields snap back to their raw config " +
        "values (0/0/1) while `data` (never touched by reload()) is left holding the REAL, " +
        "already-paged slice. Result: right after construction, `axis.data` and `axis.start`/" +
        "`axis.end` are silently out of sync with each other.", () => {
        const { axis } = makePagedAxis([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 4);
        expect(axis.data).toEqual([0, 1, 2, 3]); // real paging result, survives the reset
        expect(axis.start).toBe(0); // reset back to cloneAxis.start (0), not setScreen's own 0
        expect(axis.end).toBe(0); // reset back to cloneAxis.end (0) - NOT the paged 4
        expect(axis.page).toBe(1); // reset back to cloneAxis.page (1) - NOT setScreen's page++ -> 2
    });

    it("next() advances the window by `shift` and clamps at the end of the data", () => {
        const { axis } = makePagedAxis([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 4, 2);
        axis.next();
        expect(axis.start).toBe(2);
        expect(axis.end).toBe(6);
        expect(axis.data).toEqual([2, 3, 4, 5]);

        // advance to the end and confirm clamping (isLimit branch)
        axis.next();
        axis.next();
        axis.next();
        expect(axis.end).toBe(10);
        expect(axis.start).toBe(6);
        expect(axis.data).toEqual([6, 7, 8, 9]);
    });

    it("prev() retreats the window by `shift` and clamps at 0", () => {
        const { axis } = makePagedAxis([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 4, 2);
        axis.next();
        axis.next();
        axis.prev();
        expect(axis.start).toBe(2);
        expect(axis.data).toEqual([2, 3, 4, 5]);

        axis.prev();
        axis.prev();
        expect(axis.start).toBe(0);
        expect(axis.end).toBe(4);
        expect(axis.data).toEqual([0, 1, 2, 3]);
    });

    it("zoom(start, end) re-fits data to an explicit index range, no-ops when start === end", () => {
        const { axis, chart } = makePagedAxis([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 10);
        (chart as any).isRender = () => true;
        axis.zoom(2, 5);
        expect(axis.data).toEqual([2, 3, 4]);

        const before = axis.data;
        axis.zoom(3, 3);
        expect(axis.data).toBe(before); // untouched, early return
    });

    it("update(data) resets paging to page 1 and re-screens (wraps a non-array in an array)", () => {
        const { axis } = makePagedAxis([0, 1, 2, 3], 10);
        axis.update(42);
        expect(axis.origin).toEqual([42]);
        expect(axis.data).toEqual([42]);
    });

    it("screen()/next()/prev()/zoom() call chart.render() only when chart.isRender() is true", () => {
        const { axis, chart } = makePagedAxis([0, 1, 2, 3, 4, 5], 2, 1);
        const renderSpy = chart.render as unknown as ReturnType<typeof vi.fn>;
        renderSpy.mockClear();
        axis.next();
        expect(renderSpy).not.toHaveBeenCalled();

        (chart as any).isRender = () => true;
        axis.next();
        expect(renderSpy).toHaveBeenCalledTimes(1);
    });
});

describe("Axis - get/set/updateGrid", () => {
    it("set() with a primitive value overwrites both originAxis and cloneAxis directly", () => {
        const { chart } = makeChart();
        const originAxis = defaultAxisOptions();
        const cloneAxis = defaultAxisOptions();
        const axis = new Axis(chart, originAxis, cloneAxis);
        axis.set("shift", 5);
        expect(originAxis.shift).toBe(5);
        expect(cloneAxis.shift).toBe(5);
    });

    it("set() with an object value merges (extend) into the existing object by default", () => {
        const { chart } = makeChart();
        // originAxis.x and cloneAxis.x are deliberately SEPARATE object literals (not aliased) -
        // only cloneAxis.x is ever wired into `reload()`/`drawGridType()` during construction
        // (which resolves+mutates it in place with orient/type/setup() defaults - see the
        // "drawGridType / grid wiring" describe block above), so only cloneAxis.x picks up
        // `type: "block"` / `dist: 0` as a side effect of construction; originAxis.x stays
        // exactly as given.
        const originAxis = defaultAxisOptions({ x: { orient: "top", hide: false } });
        const cloneAxis = defaultAxisOptions({ x: { orient: "top", hide: false } });
        const axis = new Axis(chart, originAxis, cloneAxis);
        axis.set("x", { hide: true });
        expect(originAxis.x).toEqual({ orient: "top", hide: true });
        expect(cloneAxis.x).toEqual({ orient: "top", hide: true, type: "block", dist: 0 });
    });

    it("set() with isReset=true deep-clones and REPLACES the object wholesale", () => {
        const { chart } = makeChart();
        const originAxis = defaultAxisOptions({ x: { orient: "top", hide: false } });
        const cloneAxis = defaultAxisOptions({ x: { orient: "top", hide: false } });
        const axis = new Axis(chart, originAxis, cloneAxis);
        axis.set("x", { hide: true }, true);
        expect(originAxis.x).toEqual({ hide: true });
        expect(cloneAxis.x).toEqual({ hide: true });
    });

    it("updateGrid is a deprecated alias for set()", () => {
        const { chart } = makeChart();
        const originAxis = defaultAxisOptions();
        const cloneAxis = defaultAxisOptions();
        const axis = new Axis(chart, originAxis, cloneAxis);
        axis.updateGrid("shift", 9);
        expect(cloneAxis.shift).toBe(9);
    });

    it("get() falls through non-special keys to cloneAxis[type]", () => {
        const { chart } = makeChart();
        const cloneAxis = defaultAxisOptions({ buffer: 123 });
        const axis = new Axis(chart, defaultAxisOptions(), cloneAxis);
        expect(axis.get("buffer")).toBe(123);
        expect(axis.get("area")).toEqual(axis.area());
        expect(axis.get("padding")).toEqual(axis.padding());
    });
});

describe("Axis - isFull3D / getValue", () => {
    it("isFull3D() is false when z is null/undefined, true otherwise", () => {
        const { chart } = makeChart();
        const axis = new Axis(chart, defaultAxisOptions(), defaultAxisOptions());
        expect(axis.isFull3D()).toBe(false);

        const options2 = defaultAxisOptions({ z: { orient: "center" } });
        const axis2 = new Axis(chart, options2, options2);
        expect(axis2.isFull3D()).toBe(true);
    });

    it("getValue() resolves via keymap first, then the raw field, then the default", () => {
        const { chart } = makeChart();
        const options = defaultAxisOptions({ keymap: { revenue: "rev" } });
        const axis = new Axis(chart, options, options);

        expect(axis.getValue({ rev: 100 }, "revenue")).toBe(100);
        expect(axis.getValue({ revenue: 50 }, "revenue")).toBe(50);
        expect(axis.getValue({}, "missing", "fallback")).toBe("fallback");
    });
});

describe("Axis - mouse events (checkAxisPoint via chart.on)", () => {
    it("dispatches axis.mouseover on entry and axis.mouseout on exit, and axis.mousemove while inside", () => {
        const { chart, handlers, emit } = makeChart({ x: 0, y: 0, x2: 400, y2: 300, width: 400, height: 300 });
        const options = defaultAxisOptions({ index: 3 });
        new Axis(chart, options, options);

        const moveHandlers = handlers["chart.mousemove"];
        expect(moveHandlers.length).toBe(1);
        const onMouseMove = moveHandlers[0];

        // Inside the axis area (default full 400x300 box, zero padding): (200,150)
        const insideEvent: any = { chartX: 200, chartY: 150 };
        onMouseMove(insideEvent);
        expect(emit).toHaveBeenCalledWith("axis.mouseover", [insideEvent, 3]);
        expect(emit).toHaveBeenCalledWith("axis.mousemove", [insideEvent, 3]);
        expect(insideEvent.axisX).toBe(200);
        expect(insideEvent.axisY).toBe(150);

        emit.mockClear();
        // A second inside move should NOT re-fire mouseover, only mousemove.
        onMouseMove({ chartX: 210, chartY: 150 });
        expect(emit).not.toHaveBeenCalledWith("axis.mouseover", expect.anything());
        expect(emit).toHaveBeenCalledWith("axis.mousemove", expect.anything());

        emit.mockClear();
        // Outside the area -> mouseout, no mousemove.
        onMouseMove({ chartX: -10, chartY: 150 });
        expect(emit).toHaveBeenCalledWith("axis.mouseout", [{ chartX: -10, chartY: 150 }, 3]);
        expect(emit).not.toHaveBeenCalledWith("axis.mousemove", expect.anything());
    });

    it("boundary points (exactly on the edge) are NOT considered inside (strict > / < comparisons)", () => {
        const { chart, handlers, emit } = makeChart({ x: 0, y: 0, x2: 400, y2: 300, width: 400, height: 300 });
        const options = defaultAxisOptions();
        new Axis(chart, options, options);
        const onMouseMove = handlers["chart.mousemove"][0];

        onMouseMove({ chartX: 0, chartY: 150 }); // left == area.x exactly
        expect(emit).not.toHaveBeenCalledWith("axis.mouseover", expect.anything());
    });

    it("chart.mousedown/mouseup/click/dblclick/rclick/mousewheel each re-emit their axis.* " +
        "counterpart only when inside the axis area", () => {
        const { chart, handlers, emit } = makeChart({ x: 0, y: 0, x2: 400, y2: 300, width: 400, height: 300 });
        const options = defaultAxisOptions({ index: 1 });
        new Axis(chart, options, options);

        const pairs: Array<[string, string]> = [
            ["chart.mousedown", "axis.mousedown"],
            ["chart.mouseup", "axis.mouseup"],
            ["chart.click", "axis.click"],
            ["chart.dblclick", "axis.dblclick"],
            ["chart.rclick", "axis.rclick"],
            ["chart.mousewheel", "axis.mousewheel"],
        ];

        for (const [chartEvent, axisEvent] of pairs) {
            emit.mockClear();
            const handler = handlers[chartEvent][0];
            const insideEvent = { chartX: 200, chartY: 150 };
            handler(insideEvent);
            expect(emit).toHaveBeenCalledWith(axisEvent, [insideEvent, 1]);

            emit.mockClear();
            handler({ chartX: -10, chartY: 150 });
            expect(emit).not.toHaveBeenCalled();
        }
    });
});

describe("Axis - drawAxisBackground / createClipPath", () => {
    it("draws the axis background rect sized from the padded area, translated to chart.area(x,y)", () => {
        const { chart } = makeChart({ x: 0, y: 0, x2: 400, y2: 300, width: 400, height: 300 });
        const options = defaultAxisOptions({ padding: { top: 10, right: 10, bottom: 10, left: 10 } });
        const axis = new Axis(chart, options, options);

        expect(axis.root).toBeInstanceOf(TransElement);
        // area = {x:10,y:10,x2:390,y2:290,width:380,height:280}; padding lr=20,tb=20; bw=1 (theme mock)
        expect(axis.root!.attr("width")).toBe(380 + 20 - 1);
        expect(axis.root!.attr("height")).toBe(280 + 20 - 1);
        // area.x(10) - padding.left(10) = 0: `Element.attr(key)`'s already-documented Phase A
        // quirk (element.ts) means a FALSY cached value (the number 0) falls through to
        // `getAttribute()`, which always returns a string - so this reads back as "0", not 0.
        expect(axis.root!.attr("x")).toBe("0");
        expect(axis.root!.attr("y")).toBe("0");
        expect(axis.root!.attr("transform")).toBe("translate(0,0)");
    });

    it("generates axis-scoped clip path ids from chart.index and cloneAxis.index", () => {
        const { chart } = makeChart();
        const options = defaultAxisOptions({ index: 5 });
        const axis = new Axis(chart, options, options);
        expect(axis.get("clipId")).toBe("axis-clip-id-7.5"); // chart.index=7 (see makeChart)
        expect(axis.get("clipRectId")).toBe("axis-clip-rect-id-7");
    });
});

describe("Axis - degree field (GENUINE PORT REGRESSION, found and fixed - see the field's own doc comment)", () => {
    // Root-caused by loading the real bar3d/column3d/cylinder3d/bubble3d/cluster/stack/fullstack
    // family (13 real-site demos, all sharing a single axis with a numeric top-level `degree`/
    // `depth` config plus a `grid3d`-typed "c" axis) directly against the live legacy site via
    // Playwright: the real engine renders real, non-NaN `<path>`/`<g transform>` geometry - this
    // TS port, before the fix, produced NaN throughout (traced to `Axis.degree` wrongly staying
    // `{x:0,y:0,z:0}` - its class-field default - instead of the real numeric config value, for
    // the entire lifetime of the FIRST `reload()` pass, i.e. exactly when `x`/`y`/`c`'s own grids
    // render and read it).
    it("a real numeric `degree` config (not the {x,y,z} object shape) is a real number immediately after construction, not silently reverted to the {x,y,z} default", () => {
        const { chart } = makeChart();
        const options = defaultAxisOptions({ degree: 30 as unknown as AxisOptions["degree"], depth: 20 });
        const axis = new Axis(chart, options, options);

        expect(axis.degree).toBe(30);
        expect(axis.depth).toBe(20);
    });

    it("getGridSize() reads a real (non-NaN) degree/depth DURING the x-grid's own render, mid-reload() - not just after construction fully completes", () => {
        // A manual post-construction getGridSize() call would pass even with the OLD bug, since
        // reload()'s own tail (`this.degree = options.degree`, a direct assignment) always fixes
        // `axis.degree` up by the time construction FINISHES - the actual bug only poisoned grids
        // that read `axis.degree` DURING reload(), before that tail assignment runs (exactly what
        // real x/y grids do inside their own render()/drawBefore()). This grid stand-in captures
        // getGridSize()'s result from INSIDE its own render(), the same timing real grids use.
        let capturedSize: { start: number; size: number; end: number } | null = null;

        class CapturingGrid extends CoreGrid {
            static setup(): Record<string, unknown> {
                return {};
            }
            draw = (): { root: TransElement; scale: Record<string, unknown> } => {
                capturedSize = this.getGridSize();
                const root = this.chart.svg.group();
                return { root, scale: {} };
            };
        }

        const { chart } = makeChart({ x: 0, y: 0, x2: 400, y2: 300, width: 400, height: 300 });
        (chart.gridTypes as Record<string, GridConstructor>).block = CapturingGrid as unknown as GridConstructor;

        const options = defaultAxisOptions({
            degree: 30 as unknown as AxisOptions["degree"],
            depth: 20,
            x: { orient: "bottom" },
        });
        new Axis(chart, options, options);

        expect(capturedSize).not.toBeNull();
        expect(Number.isNaN(capturedSize!.start)).toBe(false);
        expect(Number.isNaN(capturedSize!.size)).toBe(false);
        expect(Number.isNaN(capturedSize!.end)).toBe(false);
    });
});
