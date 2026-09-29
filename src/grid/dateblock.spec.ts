import { describe, it, expect, vi } from "vitest";
import { DateBlockGrid } from "./dateblock";
import { DateGrid } from "./date";
import type { DateBlockGridConfig } from "./dateblock";
import type { GridChart } from "./core";
import type { Axis, AxisChart, AreaBox } from "../base/axis";
import { SVG } from "../util/svg";

// Same test-double convention `date.spec.ts`/`range.spec.ts` already established.

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
  data?: unknown[];
}

function makeAxisStub(opts: AxisStubOptions = {}): Axis {
  const area: AreaBox = opts.area ?? { x: 0, y: 0, x2: 100, y2: 50, width: 100, height: 50 };

  const stub = {
    area: ((key?: string) => (key ? (area as any)[key] : area)) as Axis["area"],
    depth: 0,
    degree: { x: 0, y: 0, z: 0 },
    isFull3D: () => false,
    data: opts.data ?? [],
  };

  return stub as unknown as Axis;
}

function makeGrid(overrides: Partial<DateBlockGridConfig> = {}): DateBlockGridConfig {
  return { orient: "bottom", type: "dateblock", domain: null, interval: 1000, min: null, max: null, reverse: false, key: null, realtime: null, hideText: false, ...overrides };
}

function makeDateBlockGrid(gridOverrides: Partial<DateBlockGridConfig> = {}, axisOpts: AxisStubOptions = {}): { g: DateBlockGrid; chart: GridChart } {
  const { chart } = makeChart();
  const g = new DateBlockGrid();
  g.chart = chart;
  g.axis = makeAxisStub(axisOpts);
  g.grid = makeGrid(gridOverrides);
  return { g, chart };
}

describe("DateBlockGrid", () => {
  describe("extends DateGrid - inherits top/bottom/left/right/center unchanged, overrides only wrapper/initDomain/drawBefore/draw", () => {
    it("is an instance of DateGrid", () => {
      const { g } = makeDateBlockGrid();
      expect(g).toBeInstanceOf(DateGrid);
    });
  });

  describe("static setup() - grid/dateblock.js has NO own .setup(), resolves via real class static inheritance to DateGrid.setup()", () => {
    it("DateBlockGrid.setup() equals the inherited DateGrid.setup()'s exact literal", () => {
      expect(DateBlockGrid.setup()).toEqual(DateGrid.setup());
      expect(DateBlockGrid.setup()).toEqual({
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

  describe("wrapper - a full, non-cooperative override of DateGrid.wrapper() (see header comment)", () => {
    it("mutates the given scale in place by adding a rangeBand() reading this.grid.unit, and returns the SAME scale reference", () => {
      const { g } = makeDateBlockGrid({}, {});
      (g.grid as Record<string, unknown>).unit = 42;

      const scale: any = (x: number) => x * 2;
      const wrapped = g.wrapper(scale, "ignored-key");

      expect(wrapped).toBe(scale); // same reference, not a new wrapper function
      expect(typeof wrapped.rangeBand).toBe("function");
      expect(wrapped.rangeBand()).toBe(42);
    });

    it("the `key` parameter is completely ignored - passing a real axis.data key changes nothing", () => {
      const { g } = makeDateBlockGrid({}, { data: [{ v: 1 }, { v: 2 }] });
      (g.grid as Record<string, unknown>).unit = 7;

      const scaleA: any = (x: number) => x;
      const scaleB: any = (x: number) => x;
      const wrappedA = g.wrapper(scaleA, "v");
      const wrappedB = g.wrapper(scaleB, undefined);

      expect(wrappedA.rangeBand()).toBe(7);
      expect(wrappedB.rangeBand()).toBe(7);
    });
  });

  describe("initDomain - preserved divergences from the inherited DateGrid.initDomain() (see header comment)", () => {
    it("string domain: extracts +first/+last row field values as [min, max] (same as DateGrid)", () => {
      const { g } = makeDateBlockGrid({ domain: "t" }, { data: [{ t: "100" }, { t: "500" }, { t: "900" }] });
      const domain = g.initDomain();
      expect(Array.from(domain)).toEqual([100, 900]);
    });

    it("fixed (Tier A defect 2): string domain with EMPTY data no longer throws - now guarded with `data.length > 0`, same as DateGrid's own copy of this branch", () => {
      const { g } = makeDateBlockGrid({ domain: "t" }, { data: [] });
      expect(() => g.initDomain()).not.toThrow();
      // valueList stays [] (the guard skips both pushes); min/max still resolve via
      // Math.min/max.apply(Math, []) = Infinity/-Infinity here (defect 3, fixed separately below,
      // is what stops THAT from happening) - this test's own job is only the crash fix.
      expect(Array.from(g.initDomain())).toEqual([Infinity, -Infinity]);
    });

    it("preserved quirk 2 (divergence from DateGrid): fully-default config (domain: null) does NOT throw - Math.min/max.apply(Math, null) resolve to [Infinity, -Infinity] instead of crashing (unlike DateGrid's documented null.length TypeError)", () => {
      const { g } = makeDateBlockGrid({ domain: null, min: null, max: null });
      const domain = g.initDomain();
      expect(domain[0]).toBe(Infinity);
      expect(domain[1]).toBe(-Infinity);
    });

    it("function domain: unary + coercion IS applied to scalar return values (divergence from DateGrid's own copy of this branch, which has no unary +)", () => {
      const rows = [{ v: "7" }, { v: "3" }];
      const domainFn = vi.fn(function (this: unknown, row: any) {
        return row.v as string; // returns a STRING, not a number
      });
      const { g } = makeDateBlockGrid({ domain: domainFn as any }, { data: rows });

      const domain = g.initDomain();
      expect(domain[0]).toBe(3);
      expect(domain[1]).toBe(7);
      expect(typeof domain[0]).toBe("number"); // +"3" -> 3, not the string "3"
    });

    it("function domain returning per-row [min,max] arrays: unary + applied to Math.max.apply/.min.apply too", () => {
      const rows = [{ v: [1, 5] }, { v: [2, 9] }];
      const domainFn = vi.fn(function (this: unknown, row: any) {
        return row.v;
      });
      const { g } = makeDateBlockGrid({ domain: domainFn as any }, { data: rows });

      expect(Array.from(g.initDomain())).toEqual(
        expect.arrayContaining([expect.any(Number), expect.any(Number)]),
      );
      const domain = g.initDomain();
      expect(domain[0]).toBe(1);
      expect(domain[1]).toBe(9);
    });

    it("array domain (explicit): uses the array's own min/max directly", () => {
      const { g } = makeDateBlockGrid({ domain: [0, 1000] });
      expect(Array.from(g.initDomain())).toEqual([0, 1000]);
    });

    it("reverse: true reverses the final [min, max] domain", () => {
      const { g } = makeDateBlockGrid({ domain: [0, 1000], reverse: true });
      expect(Array.from(g.initDomain())).toEqual([1000, 0]);
    });

    it("sets domain.interval as a BOLT-ON ARRAY PROPERTY (not this.interval, unlike the inherited DateGrid field)", () => {
      const { g } = makeDateBlockGrid({ domain: [0, 1000], interval: 250 });
      const domain = g.initDomain();
      expect(domain.interval).toBe(250);
      // The inherited DateGrid.interval instance field is never touched by this override.
      expect(g.interval).toBe(0);
    });

    it("interval as a function: called as interval.call(chart, domain), domain.interval set from its return", () => {
      const { g, chart } = makeDateBlockGrid({
        domain: [0, 1000],
        interval: vi.fn(function (this: unknown, domain: unknown[]) {
          expect(this).toBe(chart);
          return (domain[1] as number) - (domain[0] as number);
        }) as any,
      });

      const domain = g.initDomain();
      expect(domain.interval).toBe(1000);
    });
  });

  describe("drawBefore - the defining 'block' behavior: position by INDEX * unit, not by domain value (see header comment)", () => {
    it("hand-traced: domain [0,1000], interval 250, axis area width 100 (5 rows of data)", () => {
      const { g } = makeDateBlockGrid({ domain: [0, 1000], interval: 250 }, { data: [{}, {}, {}, {}, {}] });

      g.drawBefore();

      expect(g.start).toBe(0);
      expect(g.size).toBe(100);
      expect(g.end).toBe(100);
      expect(g.bar).toBe(6);

      // Real time-scale ticks/values - domain evenly divides, so rangeRound doesn't change
      // anything observable here vs. the non-block DateGrid's own equivalent hand-traced case.
      const tickTimes = (g.ticks as Date[]).map((d) => +d);
      expect(tickTimes).toEqual([0, 250, 500, 750, 1000]);
      expect(g.values).toEqual([0, 25, 50, 75, 100]);

      // unit = |range[0]-range[1]| / (axis.data.length - 1) = |0-100| / 4 = 25, and is written
      // back onto the shared grid config object (config-mutated-in-place quirk).
      expect(g.grid.unit).toBe(25);

      // this.scale was REPLACED with an index-based positioner: scale(i) = start + i*unit,
      // NOT the real time-domain value the underlying `time` scale itself would compute.
      expect(g.scale(0)).toBe(0);
      expect(g.scale(1)).toBe(25);
      expect(g.scale(4)).toBe(100);

      // ...but every one of the real time scale's own chainable methods is still available,
      // shallow-copied via Object.assign onto the replacement function.
      expect(g.scale.domain()).toEqual([0, 1000]);
    });

    it("EVERY tick from time.ticks()/.realTicks() is kept, with NO obj.start/obj.end filtering (divergence from DateGrid.drawBefore()'s own filter loop)", () => {
      // A non-evenly-dividing interval so DateGrid's own filtered variant would behave
      // differently in principle - this test's job is just to confirm dateblock keeps
      // everything time.ticks() returns, unconditionally.
      const { g } = makeDateBlockGrid({ domain: [0, 999], interval: 300 }, { data: [{}, {}] });

      g.drawBefore();

      // time().ticks("milliseconds", 300) over [0,999] includes a tick at 900 (< 999) and the
      // loop keeps every one of them - no filter comparing against obj.start/obj.end at all.
      expect(g.ticks.length).toBe(g.values.length);
      expect(g.ticks.length).toBeGreaterThan(0);
    });

    it("preserved quirk: axis.data.length === 1 (len=0) makes unit divide-by-zero -> Infinity", () => {
      const { g } = makeDateBlockGrid({ domain: [0, 1000], interval: 250 }, { data: [{}] });
      g.drawBefore();
      expect(g.grid.unit).toBe(Infinity);
    });

    it("preserved quirk: axis.data.length === 0 (len=-1) silently negates unit", () => {
      const { g } = makeDateBlockGrid({ domain: [0, 1000], interval: 250 }, { data: [] });
      g.drawBefore();
      expect(g.grid.unit).toBe(-100); // |0-100| / -1
    });

    it("string grid.format is converted to a formatter function calling util/time.ts's format()", () => {
      const { g } = makeDateBlockGrid({ domain: [0, 1000], interval: 250, format: "yyyy" as any }, { data: [{}, {}] });
      g.drawBefore();
      expect(typeof g.grid.format).toBe("function");
    });

    it("valid grid.realtime dispatches to scale.realTicks() (same dispatch condition as DateGrid)", () => {
      const d0 = new Date(2024, 0, 1, 0, 0, 0, 0);
      const d1 = new Date(2024, 0, 4, 0, 0, 0, 0);
      const { g } = makeDateBlockGrid({ domain: [+d0, +d1], interval: 1, realtime: "days" }, { data: [{}, {}, {}] });

      g.drawBefore();

      expect((g.ticks as Date[]).length).toBeGreaterThan(0);
      expect((g.ticks as Date[]).every((d) => d instanceof Date)).toBe(true);
    });
  });

  describe("draw", () => {
    it("calls drawGrid() with zero arguments (\"dateblock\" was always dead code in the original)", () => {
      const { g } = makeDateBlockGrid();
      const spy = vi.spyOn(g, "drawGrid").mockReturnValue({ root: {} as any, scale: null });

      g.draw();
      expect(spy).toHaveBeenCalledWith();
    });
  });
});
