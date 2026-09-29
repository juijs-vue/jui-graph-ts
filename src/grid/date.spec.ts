import { describe, it, expect, vi } from "vitest";
import { DateGrid } from "./date";
import type { DateGridConfig } from "./date";
import type { GridChart } from "./core";
import type { Axis, AxisChart, AreaBox } from "../base/axis";
import { SVG } from "../util/svg";
import { time } from "../util/scale";
import * as timeUtil from "../util/time";

// ---------------------------------------------------------------------------------------------
// Test doubles - same convention `core.spec.ts` already established for `GridChart`/`Axis`.
// ---------------------------------------------------------------------------------------------

function makeChart(overrides: Partial<GridChart> = {}): { chart: GridChart; svg: SVG } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const svg = new SVG(container, { width: 400, height: 300 });

  const area: AreaBox = { x: 0, y: 0, x2: 400, y2: 300, width: 400, height: 300 };

  const chart: GridChart = {
    area: ((key?: string) => (key ? (area as any)[key] : area)) as AxisChart["area"],
    svg,
    index: 0,
    appendDefs: vi.fn(),
    theme: vi.fn(() => "themed") as unknown as GridChart["theme"],
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

  return { chart, svg };
}

interface AxisStubOptions {
  area?: AreaBox;
  depth?: number;
  degree?: { x: number; y: number; z: number };
  isFull3D?: boolean;
  data?: unknown[];
}

function makeAxisStub(opts: AxisStubOptions = {}): Axis {
  const area: AreaBox = opts.area ?? { x: 0, y: 0, x2: 100, y2: 50, width: 100, height: 50 };

  const stub = {
    area: ((key?: string) => (key ? (area as any)[key] : area)) as Axis["area"],
    depth: opts.depth ?? 0,
    degree: opts.degree ?? { x: 0, y: 0, z: 0 },
    isFull3D: () => opts.isFull3D ?? false,
    data: opts.data ?? [],
  };

  return stub as unknown as Axis;
}

function makeGrid(overrides: Partial<DateGridConfig> = {}): DateGridConfig {
  return { orient: "bottom", type: "date", domain: null, interval: 1000, min: null, max: null, reverse: false, key: null, realtime: null, hideText: false, ...overrides };
}

function makeDateGrid(gridOverrides: Partial<DateGridConfig> = {}, axisOpts: AxisStubOptions = {}): { g: DateGrid; chart: GridChart } {
  const { chart } = makeChart();
  const g = new DateGrid();
  g.chart = chart;
  g.axis = makeAxisStub(axisOpts);
  g.grid = makeGrid(gridOverrides);
  return { g, chart };
}

describe("DateGrid", () => {
  describe("static setup", () => {
    it("matches the original's 8-field literal (no CoreGrid base-field merge - see header comment)", () => {
      expect(DateGrid.setup()).toEqual({
        domain: null,
        interval: 1000,
        min: null,
        max: null,
        reverse: false,
        key: null,
        realtime: null,
        hideText: false,
      });
    });
  });

  describe("wrapper", () => {
    it("without a key: returns the old scale unchanged (identity passthrough)", () => {
      const { g } = makeDateGrid();
      const oldScale: any = () => 42;
      expect(g.wrapper(oldScale, undefined)).toBe(oldScale);
    });

    it("with a key: numeric arg resolves through axis.data[i][key], non-numeric arg is +coerced", () => {
      const { g } = makeDateGrid({}, { data: [{ t: 111 }, { t: 222 }] });
      const oldScale = vi.fn((x: number) => x * 2);

      const wrapped = g.wrapper(oldScale, "t");

      expect(wrapped(1)).toBe(444); // index 1 -> data[1].t=222 -> oldScale(222)=444
      expect(oldScale).toHaveBeenLastCalledWith(222);

      wrapped("50");
      expect(oldScale).toHaveBeenLastCalledWith(50); // non-number arg: +("50") = 50
    });

    it("with a key: shallow-copies the old scale's own properties onto the wrapper (Object.assign, per header note)", () => {
      const { g } = makeDateGrid();
      const oldScale: any = () => 1;
      oldScale.domain = () => [0, 1];
      oldScale.marker = "old-scale-own-property";

      const wrapped = g.wrapper(oldScale, "t");

      expect(wrapped).not.toBe(oldScale);
      expect((wrapped as any).marker).toBe("old-scale-own-property");
      expect((wrapped as any).domain()).toEqual([0, 1]);
    });
  });

  describe("initDomain", () => {
    it("string domain: extracts +first/+last row field values as [min, max]", () => {
      const { g } = makeDateGrid({ domain: "t" }, { data: [{ t: "100" }, { t: "500" }, { t: "900" }] });
      expect(g.initDomain()).toEqual([100, 900]);
    });

    it("array domain (explicit): uses the array's own min/max directly", () => {
      const { g } = makeDateGrid({ domain: [0, 1000] });
      expect(g.initDomain()).toEqual([0, 1000]);
    });

    it("function domain returning per-row [min,max] arrays: computes overall min/max despite the interleaved value_list quirk (Node-verified)", () => {
      const rows = [{ v: [1, 5] }, { v: [2, 9] }, { v: [0, 3] }];
      const domainFn = vi.fn(function (this: unknown, row: any) {
        return row.v;
      });
      const { g } = makeDateGrid({ domain: domainFn as any }, { data: rows });

      expect(g.initDomain()).toEqual([0, 9]);
      expect(domainFn).toHaveBeenCalledTimes(3);
    });

    it("reverse: true reverses the final [min, max] domain", () => {
      const { g } = makeDateGrid({ domain: [0, 1000], reverse: true });
      expect(g.initDomain()).toEqual([1000, 0]);
    });

    it("fixed (Tier A defect 1): fully-default config (domain: null, min: null, max: null) no longer throws - auto-computes [min, max] from axis.data's own raw values", () => {
      const { g } = makeDateGrid({ domain: null, min: null, max: null }, { data: [500, 100, 900] });
      expect(() => g.initDomain()).not.toThrow();
      expect(g.initDomain()).toEqual([100, 900]);
    });

    it("fixed (Tier A defect 1): fully-default config with EMPTY axis.data still doesn't throw (min/max stay undefined, not crash or Infinity)", () => {
      const { g } = makeDateGrid({ domain: null, min: null, max: null }, { data: [] });
      expect(() => g.initDomain()).not.toThrow();
      expect(g.initDomain()).toEqual([undefined, undefined]);
    });

    it("array domain (explicit) is still used directly (not confused with the null-domain auto-compute path)", () => {
      const { g } = makeDateGrid({ domain: [3, 7, 9] as any, min: null, max: null }, { data: [500, 100, 900] });
      expect(g.initDomain()).toEqual([3, 9]);
    });

    it("explicit min+max short-circuits past the crash even with domain: null", () => {
      const { g } = makeDateGrid({ domain: null, min: 5, max: 50 });
      expect(g.initDomain()).toEqual([5, 50]);
    });

    it("preserved quirk: min: 0 is falsy, so it's silently ignored in favor of the auto-computed min", () => {
      const { g } = makeDateGrid({ domain: [3, 7, 9], min: 0, max: null });
      // min:0 -> `0 || undefined` -> undefined -> auto-computed as Math.min([3,7,9]) = 3, NOT 0.
      expect(g.initDomain()).toEqual([3, 9]);
    });

    it("interval as a plain number: this.interval is set to it directly", () => {
      const { g } = makeDateGrid({ domain: [0, 1000], interval: 250 });
      g.initDomain();
      expect(g.interval).toBe(250);
    });

    it("interval as a function: called as interval.call(chart, domain), this.interval set from its return", () => {
      const { g, chart } = makeDateGrid({ domain: [0, 1000], interval: vi.fn(function (this: unknown, domain: unknown[]) {
        expect(this).toBe(chart);
        return (domain[1] as number) - (domain[0] as number);
      }) as any });

      g.initDomain();
      expect(g.interval).toBe(1000);
    });
  });

  describe("drawBefore", () => {
    it("hand-traced: builds scale/ticks/values from an explicit array domain (domain [0,1000], interval 250, range [0,100])", () => {
      const { g } = makeDateGrid({ domain: [0, 1000], interval: 250 });

      g.drawBefore();

      expect(g.start).toBe(0);
      expect(g.size).toBe(100);
      expect(g.end).toBe(100);
      expect(g.bar).toBe(6);

      const tickTimes = (g.ticks as Date[]).map((d) => +d);
      expect(tickTimes).toEqual([0, 250, 500, 750, 1000]);
      expect(g.values).toEqual([0, 25, 50, 75, 100]);
    });

    it("invalid grid.realtime falls back to the non-realtime ticks() path (identical result to realtime: null)", () => {
      const { g: gInvalid } = makeDateGrid({ domain: [0, 1000], interval: 250, realtime: "bogus" });
      const { g: gDefault } = makeDateGrid({ domain: [0, 1000], interval: 250, realtime: null });

      gInvalid.drawBefore();
      gDefault.drawBefore();

      expect((gInvalid.ticks as Date[]).map((d) => +d)).toEqual((gDefault.ticks as Date[]).map((d) => +d));
      expect(gInvalid.values).toEqual(gDefault.values);
    });

    it("valid grid.realtime dispatches to scale.realTicks() - cross-checked against directly calling the already-verified util/scale.ts time().realTicks()", () => {
      const d0 = new Date(2024, 0, 1, 0, 0, 0, 0);
      const d1 = new Date(2024, 0, 4, 0, 0, 0, 0);
      const { g } = makeDateGrid({ domain: [+d0, +d1], interval: 1, realtime: "days" });

      g.drawBefore();

      // Independently reproduce the expected result via the same already-tested Phase A
      // primitive (`util/scale.ts`'s `time()`), not by re-deriving realTicks()'s own calendar
      // math by hand here (that's `scale/time.spec.ts`'s job) - this test's OWN job is only to
      // verify DateGrid.drawBefore() dispatches to it and filters/stores the result correctly.
      const referenceScale = time().domain([+d0, +d1]).range([g.start, g.end]);
      const referenceTicks = referenceScale.realTicks("days", 1);
      const expectedTicks: Date[] = [];
      const expectedValues: number[] = [];
      for (const t of referenceTicks) {
        const v = referenceScale(+t as unknown as number);
        if (v >= g.start && v <= g.end) {
          expectedValues.push(v);
          expectedTicks.push(t);
        }
      }

      expect((g.ticks as Date[]).map((d) => +d)).toEqual(expectedTicks.map((d) => +d));
      expect(g.values).toEqual(expectedValues);
    });

    it("grid.format as a string is replaced with a function calling util/time.ts's format() (verified via Draw.format() dispatch)", () => {
      const { g } = makeDateGrid({ domain: [0, 1000], interval: 250, format: "yyyy-MM-dd" });

      g.drawBefore();

      expect(typeof g.grid.format).toBe("function");

      const sample = new Date(2020, 0, 15, 10, 30, 0);
      const expected = timeUtil.format(sample, "yyyy-MM-dd");
      expect((g.grid.format as (v: unknown) => unknown)(sample)).toBe(expected);

      // Draw.format() (inherited) resolves through `draw.format || chart.format` - confirm the
      // reassigned function is actually what a real render pass would call.
      expect(g.format(sample, 0)).toBe(expected);
    });

    it("this.scale.clamp() is invoked with grid.clamp (not part of DateGrid.setup()'s own defaults - ad-hoc field, see DateGridConfig doc)", () => {
      const { g } = makeDateGrid({ domain: [0, 1000], interval: 250, clamp: true });
      const clampSpy = vi.fn();

      // Intercept by wrapping the real time() factory's returned scale's clamp - simplest way to
      // observe the call without mocking the whole scale module: spy after construction isn't
      // possible (scale is built inside drawBefore()), so instead assert the resulting scale is
      // actually clamped by checking out-of-domain extrapolation is clamped to the boundary.
      g.drawBefore();
      const scale = g.scale;
      expect(scale(2000)).toBe(scale(1000)); // clamped: values beyond domain max saturate
      void clampSpy;
    });
  });

  describe("top/bottom/left/right/center", () => {
    function makeRenderableGrid(): { g: DateGrid; group: any; calls: string[] } {
      const { g } = makeDateGrid({ domain: [0, 1000], interval: 250 });
      g.drawBefore();

      const calls: string[] = [];
      g.drawPattern = vi.fn((position: string) => calls.push(`drawPattern:${position}`));
      g.drawBaseLine = vi.fn((position: string) => calls.push(`drawBaseLine:${position}`));
      g.drawCenter = vi.fn(() => calls.push("drawCenter"));
      vi.spyOn(g, "drawTop").mockImplementation(() => calls.push("drawTop") as unknown as void);
      vi.spyOn(g, "drawBottom").mockImplementation(() => calls.push("drawBottom") as unknown as void);
      vi.spyOn(g, "drawLeft").mockImplementation(() => calls.push("drawLeft") as unknown as void);
      vi.spyOn(g, "drawRight").mockImplementation(() => calls.push("drawRight") as unknown as void);

      const group = g.chart.svg.group();
      return { g, group, calls };
    }

    it("top: drawPattern, drawTop, drawBaseLine in order", () => {
      const { g, group, calls } = makeRenderableGrid();
      g.top(group);
      expect(calls).toEqual(["drawPattern:top", "drawTop", "drawBaseLine:top"]);
    });

    it("bottom: drawPattern, drawBottom, drawBaseLine in order", () => {
      const { g, group, calls } = makeRenderableGrid();
      g.bottom(group);
      expect(calls).toEqual(["drawPattern:bottom", "drawBottom", "drawBaseLine:bottom"]);
    });

    it("left: drawPattern, drawLeft, drawBaseLine in order", () => {
      const { g, group, calls } = makeRenderableGrid();
      g.left(group);
      expect(calls).toEqual(["drawPattern:left", "drawLeft", "drawBaseLine:left"]);
    });

    it("right: drawPattern, drawRight, drawBaseLine in order", () => {
      const { g, group, calls } = makeRenderableGrid();
      g.right(group);
      expect(calls).toEqual(["drawPattern:right", "drawRight", "drawBaseLine:right"]);
    });

    it("center: drawCenter, drawBaseLine in order (no drawPattern)", () => {
      const { g, group, calls } = makeRenderableGrid();
      g.center(group);
      expect(calls).toEqual(["drawCenter", "drawBaseLine:center"]);
    });
  });

  describe("draw", () => {
    it("calls this.drawGrid() with no arguments (the original's 'date' argument is dead - see header comment) and returns its result", () => {
      const { g } = makeDateGrid({ domain: [0, 1000], interval: 250 });
      const fakeResult = { root: {} as any, scale: {} as any };
      const spy = vi.spyOn(g, "drawGrid").mockReturnValue(fakeResult);

      const result = g.draw();

      expect(spy).toHaveBeenCalledWith();
      expect(result).toBe(fakeResult);
    });
  });
});
