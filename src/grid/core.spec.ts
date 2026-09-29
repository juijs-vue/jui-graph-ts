import { describe, it, expect, vi, beforeEach } from "vitest";
import { CoreGrid, registerGridDraw2D, registerGridDraw3D, __resetGridDrawMixinsForTesting } from "./core";
import type { GridChart } from "./core";
import type { Axis, AxisChart, AreaBox, GridConstructor } from "../base/axis";
import { SVG } from "../util/svg";
import type { TransElement } from "../util/svg/element.transform";
import { radian } from "../util/math";

// ---------------------------------------------------------------------------------------------
// Test doubles - ordinary unit-test fixtures satisfying `GridChart`/`Axis`'s real structural
// shape, the same convention `base/axis.spec.ts` already established for `AxisChart`/
// `GridConstructor`. `axis` is cast (`as unknown as Axis`) since `Axis` is a real class with
// private fields - genuinely un-fakeable via a plain object literal, same reasoning `Axis` itself
// can't be constructed here without a full `AxisChart` (circular test-setup weight this file's own
// scope doesn't need - `CoreGrid`'s own methods only ever call `axis.area()`/`.depth`/`.degree`/
// `.isFull3D()`/`.data`/`.get()`, all covered by the stub below).
// ---------------------------------------------------------------------------------------------

function makeChart(overrides: Partial<GridChart> = {}): { chart: GridChart; svg: SVG; themeSpy: ReturnType<typeof vi.fn> } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const svg = new SVG(container, { width: 400, height: 300 });

  const themeValues: Record<string, string | number> = {
    gridBorderColor: "#ccc",
    gridBorderWidth: 1,
    gridBorderDashArray: "none",
    gridBorderOpacity: 1,
  };

  const themeSpy = vi.fn((...args: unknown[]) => {
    if (args.length === 3) {
      const [isActive, activeKey, inactiveKey] = args as [boolean, string, string];
      return isActive ? `active:${activeKey}` : `inactive:${inactiveKey}`;
    }
    return themeValues[args[0] as string];
  });

  const area: AreaBox = { x: 0, y: 0, x2: 400, y2: 300, width: 400, height: 300 };

  const chart: GridChart = {
    area: ((key?: string) => (key ? (area as any)[key] : area)) as AxisChart["area"],
    svg,
    index: 0,
    appendDefs: vi.fn(),
    theme: themeSpy as unknown as GridChart["theme"],
    isRender: () => false,
    render: vi.fn(),
    on: vi.fn(),
    emit: vi.fn(),
    gridTypes: {},
    axis: vi.fn(() => undefined),
    color: vi.fn((c: unknown) => `color(${JSON.stringify(c)})`),
    format: (v: unknown) => v,
    ...overrides,
  };

  return { chart, svg, themeSpy };
}

interface AxisStubOptions {
  area?: AreaBox;
  depth?: number;
  degree?: { x: number; y: number; z: number };
  isFull3D?: boolean;
  data?: unknown[];
  get?: (type: string) => unknown;
}

function makeAxisStub(opts: AxisStubOptions = {}): Axis {
  const area: AreaBox = opts.area ?? { x: 10, y: 20, x2: 110, y2: 220, width: 100, height: 200 };

  const stub = {
    area: ((key?: string) => (key ? (area as any)[key] : area)) as Axis["area"],
    depth: opts.depth ?? 0,
    degree: opts.degree ?? { x: 0, y: 0, z: 0 },
    isFull3D: () => opts.isFull3D ?? false,
    data: opts.data ?? [],
    get: opts.get ?? ((type: string) => (type === "x" || type === "y" ? { hide: false, orient: type === "x" ? "bottom" : "left" } : undefined)),
  };

  return stub as unknown as Axis;
}

function makeGrid(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { orient: "bottom", type: "block", ...overrides };
}

beforeEach(() => {
  document.body.innerHTML = "";
  __resetGridDrawMixinsForTesting();
});

describe("CoreGrid", () => {
  describe("wrapper", () => {
    it("is the identity function (subclasses override it)", () => {
      const g = new CoreGrid();
      const scale = () => 42;
      expect(g.wrapper(scale, "key")).toBe(scale);
    });
  });

  describe("line", () => {
    it("merges themed defaults with the given attr, attr winning on overlap", () => {
      const { chart } = makeChart();
      const g = new CoreGrid();
      g.chart = chart;
      g.grid = makeGrid();

      const line = g.line({ x2: 50 });

      // `.attr()`'s already-documented Phase A quirk (`util/svg/element.ts`): a truthy CACHED
      // value (e.g. a number) is returned as-is, not stringified via `getAttribute()`.
      expect(line.attr("stroke")).toBe("#ccc");
      expect(line.attr("stroke-width")).toBe(1);
      expect(line.attr("x2")).toBe(50);
      // `y2: 0` is falsy in the cache, so this one DOES fall through to `getAttribute()` (a string).
      expect(line.attr("y2")).toBe("0");
    });
  });

  describe("color", () => {
    it("1-arg form: uses chart.color(grid.color) when grid.color is set", () => {
      const { chart } = makeChart();
      const g = new CoreGrid();
      g.chart = chart;
      g.grid = makeGrid({ color: "red" });

      expect(g.color("gridBorderColor")).toBe('color("red")');
      expect(chart.color).toHaveBeenCalledWith("red");
    });

    it("1-arg form: falls back to chart.theme(key) when grid.color is null", () => {
      const { chart, themeSpy } = makeChart();
      const g = new CoreGrid();
      g.chart = chart;
      g.grid = makeGrid({ color: null });

      expect(g.color("gridBorderColor")).toBe("#ccc");
      expect(themeSpy).toHaveBeenCalledWith("gridBorderColor");
    });

    it("3-arg form forwards all 3 arguments to chart.theme via .apply (grid.color null)", () => {
      const { chart, themeSpy } = makeChart();
      const g = new CoreGrid();
      g.chart = chart;
      g.grid = makeGrid({ color: null });

      const result = g.color(true, "gridActiveBorderColor", "gridXAxisBorderColor");

      expect(result).toBe("active:gridActiveBorderColor");
      expect(themeSpy).toHaveBeenCalledWith(true, "gridActiveBorderColor", "gridXAxisBorderColor");
    });

    it("3-arg form still prefers chart.color(grid.color) when grid.color is set", () => {
      const { chart } = makeChart();
      const g = new CoreGrid();
      g.chart = chart;
      g.grid = makeGrid({ color: "blue" });

      expect(g.color(true, "a", "b")).toBe('color("blue")');
    });
  });

  describe("data", () => {
    it("returns the field value at axis.data[index] when both exist", () => {
      const g = new CoreGrid();
      g.axis = makeAxisStub({ data: [{ v: 10 }, { v: 20 }] });

      expect(g.data(1, "v")).toBe(20);
    });

    it("returns the whole row when field is missing/falsy on it", () => {
      const g = new CoreGrid();
      const row = { v: 0 };
      g.axis = makeAxisStub({ data: [row] });

      // `row.v || row` - `0` is falsy, so the whole row wins (preserved `||` fallback quirk).
      expect(g.data(0, "v")).toBe(row);
    });

    it("returns the whole axis.data array when called with no arguments", () => {
      const data = [{ v: 1 }, { v: 2 }];
      const g = new CoreGrid();
      g.axis = makeAxisStub({ data });

      expect(g.data()).toBe(data);
    });

    it("returns an empty array when axis.data itself is falsy", () => {
      const g = new CoreGrid();
      g.axis = makeAxisStub({ data: undefined as unknown as unknown[] });

      expect(g.data()).toEqual([]);
    });
  });

  describe("getGridSize", () => {
    it("uses axis.area('x')/'width' for top/bottom orient", () => {
      const g = new CoreGrid();
      g.grid = makeGrid({ orient: "bottom" });
      g.axis = makeAxisStub({ area: { x: 5, y: 7, x2: 105, y2: 107, width: 100, height: 100 } });

      expect(g.getGridSize()).toEqual({ start: 5, size: 100, end: 105 });
    });

    it("uses axis.area('y')/'height' for left/right orient", () => {
      const g = new CoreGrid();
      g.grid = makeGrid({ orient: "left" });
      g.axis = makeAxisStub({ area: { x: 5, y: 7, x2: 105, y2: 107, width: 100, height: 100 } });

      expect(g.getGridSize()).toEqual({ start: 7, size: 100, end: 107 });
    });

    it("center orient under isFull3D() resets start/size/end to the z-depth range", () => {
      const g = new CoreGrid();
      g.grid = makeGrid({ orient: "center" });
      g.axis = makeAxisStub({ isFull3D: true, depth: 40 });

      expect(g.getGridSize()).toEqual({ start: 0, size: 40, end: 40 });
    });

    it(
      "fixed (Tier A defect 6): depth>0 with !isFull3D() and a standard {x,y,z} degree object no longer produces NaN - resolves via degree.z instead of coercing the whole object",
      () => {
        const g = new CoreGrid();
        g.grid = makeGrid({ orient: "left" });
        g.axis = makeAxisStub({
          area: { x: 0, y: 0, x2: 100, y2: 100, width: 100, height: 100 },
          depth: 50,
          degree: { x: 0, y: 0, z: 0 },
          isFull3D: false,
        });

        const result = g.getGridSize();
        expect(Number.isFinite(result.start)).toBe(true);
        expect(Number.isFinite(result.size)).toBe(true);
        expect(result.end).toBe(100); // untouched by the "left" branch
      },
    );

    it("fixed (Tier A defect 6): a NON-uniform {x,y,z} degree object resolves via degree.z specifically", () => {
      const g = new CoreGrid();
      g.grid = makeGrid({ orient: "bottom" });
      g.axis = makeAxisStub({
        area: { x: 0, y: 0, x2: 100, y2: 100, width: 100, height: 100 },
        depth: 50,
        degree: { x: 11, y: 22, z: 33 },
        isFull3D: false,
      });

      const rad = radian(360 - 33);
      const expectedX2 = Math.cos(rad) * 50;

      const result = g.getGridSize();
      expect(result.end).toBeCloseTo(100 - expectedX2, 10);
    });

    it("leaves start/size/end untouched when depth===0 and !isFull3D() (the common case)", () => {
      const g = new CoreGrid();
      g.grid = makeGrid({ orient: "left" });
      g.axis = makeAxisStub({ area: { x: 0, y: 0, x2: 100, y2: 100, width: 100, height: 100 }, depth: 0 });

      expect(g.getGridSize()).toEqual({ start: 0, size: 100, end: 100 });
    });
  });

  describe("getDefaultOffset", () => {
    it("mirrors getGridSize's axis pick but reads straight off axis.area() (no depth/degree adjustment)", () => {
      const g = new CoreGrid();
      g.grid = makeGrid({ orient: "bottom" });
      g.axis = makeAxisStub({ area: { x: 5, y: 7, x2: 105, y2: 107, width: 100, height: 100 }, depth: 999 });

      expect(g.getDefaultOffset()).toEqual({ start: 5, size: 100, end: 105 });
    });
  });

  describe("getTextRotate", () => {
    function makeTextEl(chart: GridChart): TransElement {
      return chart.svg.text({ x: 3, y: 4 }, "hi");
    }

    it("passes the element through unchanged when grid.textRotate is null", () => {
      const { chart } = makeChart();
      const g = new CoreGrid();
      g.chart = chart;
      g.grid = makeGrid({ textRotate: null });

      const el = makeTextEl(chart);
      expect(g.getTextRotate(el)).toBe(el);
      expect(el.attr("transform")).toBeUndefined();
    });

    it("applies a numeric textRotate directly via rotate(rotate, x, y)", () => {
      const { chart } = makeChart();
      const g = new CoreGrid();
      g.chart = chart;
      g.grid = makeGrid({ textRotate: 30 });

      const el = makeTextEl(chart);
      g.getTextRotate(el);

      // `TransElement.rotate(angle, x, y)`'s own 3-arg format is `"angle x,y"` (space before x,
      // comma before y) - not a uniform comma-joined arg list.
      expect(el.attr("transform")).toBe("rotate(30 3,4)");
    });

    it("resolves a function textRotate (called with chart as `this`, [textElement] as args) before rotating", () => {
      const { chart } = makeChart();
      const g = new CoreGrid();
      g.chart = chart;
      const rotateFn = vi.fn(function (this: unknown) {
        return 45;
      });
      g.grid = makeGrid({ textRotate: rotateFn });

      const el = makeTextEl(chart);
      g.getTextRotate(el);

      expect(rotateFn).toHaveBeenCalledWith(el);
      expect(rotateFn.mock.instances[0]).toBe(chart);
      expect(el.attr("transform")).toBe("rotate(45 3,4)");
    });
  });

  describe("getLineOption", () => {
    it("wraps a string into { type: string }", () => {
      const g = new CoreGrid();
      g.grid = makeGrid({ line: "dashed" });
      expect(g.getLineOption()).toEqual({ type: "dashed" });
    });

    it("empty string falls back to 'solid'", () => {
      const g = new CoreGrid();
      g.grid = makeGrid({ line: "" });
      expect(g.getLineOption()).toEqual({ type: "solid" });
    });

    it("wraps a number into { type: 'solid', 'stroke-width': number }", () => {
      const g = new CoreGrid();
      g.grid = makeGrid({ line: 2 });
      expect(g.getLineOption()).toEqual({ type: "solid", "stroke-width": 2 });
    });

    it("true becomes { type: 'solid' }, falsy non-object values become false", () => {
      const g = new CoreGrid();

      g.grid = makeGrid({ line: true });
      expect(g.getLineOption()).toEqual({ type: "solid" });

      g.grid = makeGrid({ line: false });
      expect(g.getLineOption()).toBe(false);

      // `typeof undefined === "undefined"` (not "object"), so this hits the same
      // boolean-coercion branch as `false` above (`0`/other numbers hit the NUMBER branch instead
      // - see the dedicated number-wrapping test above).
      g.grid = makeGrid({ line: undefined });
      expect(g.getLineOption()).toBe(false);
    });

    it(
      "PRESERVED BUG: an already-object line config's multi-word `.type` string is NEVER split " +
        "into an array (`!line.type == \"string\"` is dead code - always false)",
      () => {
        const g = new CoreGrid();
        g.grid = makeGrid({ line: { type: "dashed rect", fill: "red" } });

        const result = g.getLineOption() as { type: unknown; fill: unknown };
        expect(result.type).toBe("dashed rect");
        expect(typeof result.type).toBe("string");
        expect(Array.isArray(result.type)).toBe(false);
        expect(result.fill).toBe("red");
      },
    );
  });

  describe("checkDrawLineY", () => {
    it("returns false for index 0 on a left-orient, non-realtime y axis", () => {
      const g = new CoreGrid();
      g.grid = makeGrid({ realtime: false });
      g.axis = makeAxisStub({ get: () => ({ hide: false, orient: "left" }) });

      expect(g.checkDrawLineY(0, false)).toBe(false);
      expect(g.checkDrawLineY(1, false)).toBe(true);
    });

    it("index 0 on a left-orient y axis DOES draw when grid.realtime is true", () => {
      const g = new CoreGrid();
      g.grid = makeGrid({ realtime: true });
      g.axis = makeAxisStub({ get: () => ({ hide: false, orient: "left" }) });

      expect(g.checkDrawLineY(0, false)).toBe(true);
    });

    it("returns false for the last tick on a right-orient y axis", () => {
      const g = new CoreGrid();
      g.grid = makeGrid();
      g.axis = makeAxisStub({ get: () => ({ hide: false, orient: "right" }) });

      expect(g.checkDrawLineY(5, true)).toBe(false);
      expect(g.checkDrawLineY(5, false)).toBe(true);
    });

    it("always true when the y axis is hidden", () => {
      const g = new CoreGrid();
      g.grid = makeGrid();
      g.axis = makeAxisStub({ get: () => ({ hide: true, orient: "left" }) });

      expect(g.checkDrawLineY(0, false)).toBe(true);
    });
  });

  describe("checkDrawLineX", () => {
    it("returns false for index 0 on a top-orient x axis", () => {
      const g = new CoreGrid();
      g.grid = makeGrid();
      g.axis = makeAxisStub({ get: () => ({ hide: false, orient: "top" }) });

      expect(g.checkDrawLineX(0, false)).toBe(false);
    });

    it("returns false for the last tick on a bottom-orient, non-realtime x axis", () => {
      const g = new CoreGrid();
      g.grid = makeGrid({ realtime: false });
      g.axis = makeAxisStub({ get: () => ({ hide: false, orient: "bottom" }) });

      expect(g.checkDrawLineX(3, true)).toBe(false);
    });

    it("last tick on a bottom-orient x axis DOES draw when grid.realtime is true", () => {
      const g = new CoreGrid();
      g.grid = makeGrid({ realtime: true });
      g.axis = makeAxisStub({ get: () => ({ hide: false, orient: "bottom" }) });

      expect(g.checkDrawLineX(3, true)).toBe(true);
    });
  });

  describe("drawTop/drawBottom/drawLeft/drawRight", () => {
    function setupDrawable() {
      const { chart, svg } = makeChart();
      const g = new CoreGrid();
      g.chart = chart;
      g.grid = makeGrid({ type: "range" }); // non-"block" so isLast can be true
      g.axis = makeAxisStub();

      const created = svg.group();
      g.createGridX = vi.fn(() => svg.group()) as any;
      g.createGridY = vi.fn(() => svg.group()) as any;
      g.drawImage = vi.fn();
      g.drawValueText = vi.fn();

      return { g, svg, created };
    }

    it("drawTop: draws every tick with a non-null/undefined domain, marks the last tick isLast", () => {
      const { g } = setupDrawable();
      const gGroup = g.chart.svg.group();

      g.drawTop(gGroup, ["a", "b", "c"], [0, 10, 20], null, 5);

      expect(g.drawImage).toHaveBeenCalledTimes(3);
      expect(g.createGridX).toHaveBeenCalledTimes(3);
      // last tick: index 2, x = 20 - 5 = 15, isLast = true (type !== "block")
      expect(g.createGridX).toHaveBeenNthCalledWith(3, "top", 2, 15, false, true);
      expect(g.drawValueText).toHaveBeenCalledTimes(3);
    });

    it("drawBottom: skips ticks whose format() result is falsy AND not exactly 0", () => {
      const { g } = setupDrawable();
      g.chart.format = undefined;
      g.grid.format = (v: unknown) => (v === "skip" ? null : v);

      const gGroup = g.chart.svg.group();
      g.drawBottom(gGroup, ["skip", "keep"], [0, 10], null, 0);

      // drawImage still runs for both (unconditional), but createGridX/drawValueText only for "keep"
      expect(g.drawImage).toHaveBeenCalledTimes(2);
      expect(g.createGridX).toHaveBeenCalledTimes(1);
      expect(g.drawValueText).toHaveBeenCalledTimes(1);
    });

    it("drawBottom: a domain of exactly 0 is NOT skipped (the `domain !== 0` escape hatch)", () => {
      const { g } = setupDrawable();
      g.grid.format = () => 0;

      const gGroup = g.chart.svg.group();
      g.drawBottom(gGroup, ["x"], [0], null, 0);

      expect(g.createGridX).toHaveBeenCalledTimes(1);
    });

    it("drawLeft/drawRight use createGridY, not createGridX", () => {
      const { g } = setupDrawable();
      const gGroup = g.chart.svg.group();

      g.drawLeft(gGroup, ["a"], [5], null, 0);
      g.drawRight(gGroup, ["a"], [5], null, 0);

      expect(g.createGridY).toHaveBeenCalledTimes(2);
      expect(g.createGridX).not.toHaveBeenCalled();
    });

    it("invokes checkActive(tick) per-tick when provided as a function", () => {
      const { g } = setupDrawable();
      const checkActive = vi.fn((tick: unknown) => tick === "b");
      const gGroup = g.chart.svg.group();

      g.drawTop(gGroup, ["a", "b"], [0, 1], checkActive, 0);

      expect(checkActive).toHaveBeenCalledTimes(2);
      expect(g.createGridX).toHaveBeenNthCalledWith(1, "top", 0, 0, false, false);
      // index 1 is also the LAST tick here (len 2, grid.type "range" !== "block"), so isLast=true.
      expect(g.createGridX).toHaveBeenNthCalledWith(2, "top", 1, 1, true, true);
    });
  });

  describe("drawGrid", () => {
    it("throws the documented error when the orient resolves to a function but no mixin is registered", () => {
      const { chart } = makeChart();
      const g = new CoreGrid();
      g.chart = chart;
      g.grid = makeGrid({ orient: "top" });
      g.axis = makeAxisStub();
      (g as any).top = vi.fn();

      expect(() => g.drawGrid()).toThrow(/mixin not registered/);
    });

    it("applies the 2D mixin and calls the resolved orient function when axis is not full3D", () => {
      const { chart } = makeChart();
      const g = new CoreGrid();
      g.chart = chart;
      g.grid = makeGrid({ orient: "top" });
      g.axis = makeAxisStub({ isFull3D: false });

      const mixinSpy = vi.fn((target) => {
        target.createGridX = vi.fn();
      });
      registerGridDraw2D(mixinSpy);
      const draw3DSpy = vi.fn();
      registerGridDraw3D(draw3DSpy);

      const topFn = vi.fn();
      (g as any).top = topFn;

      const result = g.drawGrid();

      expect(mixinSpy).toHaveBeenCalledWith(g);
      expect(draw3DSpy).not.toHaveBeenCalled();
      expect(topFn).toHaveBeenCalledTimes(1);
      expect(topFn.mock.instances[0]).toBe(g);
      expect(result.root).toBeDefined();
      expect(result.scale).toBe(g.scale);
    });

    it("applies the 3D mixin when axis.isFull3D() is true", () => {
      const { chart } = makeChart();
      const g = new CoreGrid();
      g.chart = chart;
      g.grid = makeGrid({ orient: "center" });
      g.axis = makeAxisStub({ isFull3D: true });

      const draw2DSpy = vi.fn();
      const draw3DSpy = vi.fn();
      registerGridDraw2D(draw2DSpy);
      registerGridDraw3D(draw3DSpy);
      (g as any).center = vi.fn();

      g.drawGrid();

      expect(draw3DSpy).toHaveBeenCalledWith(g);
      expect(draw2DSpy).not.toHaveBeenCalled();
    });

    it("never invokes any mixin when grid.orient doesn't resolve to a defined method (preserved original guard)", () => {
      const { chart } = makeChart();
      const g = new CoreGrid();
      g.chart = chart;
      g.grid = makeGrid({ orient: "nonexistent" });
      g.axis = makeAxisStub();

      const draw2DSpy = vi.fn();
      registerGridDraw2D(draw2DSpy);

      expect(() => g.drawGrid()).not.toThrow();
      expect(draw2DSpy).not.toHaveBeenCalled();
    });

    it("calls wrapper(scale, grid.key) and hides the root when grid.hide is set", () => {
      const { chart } = makeChart();
      const g = new CoreGrid();
      g.chart = chart;
      g.grid = makeGrid({ orient: "top", hide: true, key: "field" });
      g.axis = makeAxisStub();
      g.scale = "raw-scale";
      const wrapperSpy = vi.spyOn(g, "wrapper");

      registerGridDraw2D(vi.fn());
      registerGridDraw3D(vi.fn());
      (g as any).top = vi.fn();

      const result = g.drawGrid();

      expect(wrapperSpy).toHaveBeenCalledWith("raw-scale", "field");
      expect(result.root.attr("display")).toBe("none");
    });
  });

  describe("drawAfter", () => {
    it("sets the class attr from grid.type and translates by chart.area(x)/(y)", () => {
      const { chart } = makeChart();
      const g = new CoreGrid();
      g.chart = chart;
      g.grid = makeGrid({ type: "block" });

      const root = chart.svg.group();
      g.drawAfter({ root, scale: {} });

      expect(root.attr("class")).toBe("grid-block");
      expect(root.attr("transform")).toBe("translate(0,0)");
    });
  });

  describe("render() (inherited from Draw) - CoreGrid is abstract, matching the original", () => {
    it("throws because CoreGrid never assigns `this.draw` (real subclasses, Phase C, do)", () => {
      const g = new CoreGrid();
      expect(() => g.render()).toThrow(/'draw' method must be implemented/);
    });
  });

  describe("static setup()", () => {
    it("returns the original's exact default option shape", () => {
      expect(CoreGrid.setup()).toEqual({
        dist: 0,
        orient: null,
        hide: false,
        color: null,
        title: null,
        line: false,
        format: null,
        image: null,
        textRotate: null,
      });
    });
  });

  describe("GridConstructor compatibility", () => {
    it("a 0-arg CoreGrid subclass-shaped constructor is assignable to GridConstructor", () => {
      const ctor: GridConstructor = CoreGrid;
      expect(typeof ctor).toBe("function");
    });
  });
});
