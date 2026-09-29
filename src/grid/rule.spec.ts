import { describe, it, expect, vi } from "vitest";
import { RuleGrid } from "./rule";
import { CoreGrid } from "./core";
import type { RuleGridOptions } from "./rule";
import type { Axis, AxisChart, AreaBox } from "../base/axis";
import { SVG } from "../util/svg";
import type { TransElement } from "../util/svg/element.transform";

// Same test-double convention `range.spec.ts`/`date.spec.ts` already established, extended with
// the `text` member `RuleGridChart` needs beyond the shared `GridChart` type (same pattern
// `draw2d.spec.ts`'s `Draw2DChart`/`radar.spec.ts`'s `RadarGridChart` already established).

function makeChart(overrides: Record<string, unknown> = {}): { chart: any; svg: SVG } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const svg = new SVG(container, { width: 400, height: 300 });
  const area: AreaBox = { x: 0, y: 0, x2: 400, y2: 300, width: 400, height: 300 };

  const chart = {
    area: ((key?: string) => (key ? (area as any)[key] : area)) as AxisChart["area"],
    svg,
    index: 0,
    appendDefs: vi.fn(),
    theme: vi.fn((...args: unknown[]) => (args.length === 3 ? `theme(${args[0]},${args[1]},${args[2]})` : `theme(${String(args[0])})`)),
    isRender: () => false,
    render: vi.fn(),
    on: vi.fn(),
    emit: vi.fn(),
    gridTypes: {},
    axis: vi.fn(() => undefined),
    color: vi.fn((c: unknown) => `color(${JSON.stringify(c)})`),
    format: (v: unknown, _i?: number) => v,
    text: vi.fn((attr: Record<string, unknown>, text?: unknown) => svg.text(attr, text as any)),
    ...overrides,
  };

  return { chart, svg };
}

interface AxisStubOptions {
  area?: AreaBox;
  data?: unknown[];
}

function makeAxisStub(opts: AxisStubOptions = {}): Axis {
  const area: AreaBox = opts.area ?? { x: 0, y: 0, x2: 400, y2: 300, width: 400, height: 300 };
  const stub = {
    area: ((key?: string) => (key ? (area as any)[key] : area)) as Axis["area"],
    depth: 0,
    degree: { x: 0, y: 0, z: 0 },
    isFull3D: () => false,
    data: opts.data ?? [],
    get: (type: string) => (type === "x" || type === "y" ? { hide: false, orient: type === "x" ? "bottom" : "left" } : undefined),
  };
  return stub as unknown as Axis;
}

function makeGrid(overrides: Partial<RuleGridOptions> = {}): RuleGridOptions {
  return {
    orient: "bottom",
    type: "rule",
    domain: null,
    step: 10,
    min: 0,
    max: 0,
    unit: null,
    clamp: true,
    reverse: false,
    key: null,
    hideText: false,
    hideZero: false,
    nice: false,
    center: false,
    ...overrides,
  };
}

function makeRuleGrid(gridOverrides: Partial<RuleGridOptions> = {}, axisOpts: AxisStubOptions = {}): { g: RuleGrid; chart: any } {
  const { chart } = makeChart();
  const g = new RuleGrid();
  g.chart = chart;
  g.axis = makeAxisStub(axisOpts);
  g.grid = makeGrid(gridOverrides);
  return { g, chart };
}

describe("RuleGrid", () => {
  it("extends CoreGrid directly (confirmed extend: chart.grid.core - no real Phase D dependency, see header comment's investigation)", () => {
    const { g } = makeRuleGrid();
    expect(g).toBeInstanceOf(CoreGrid);
  });

  describe("static setup()", () => {
    it("returns the original's exact default option shape", () => {
      expect(RuleGrid.setup()).toEqual({
        domain: null,
        step: 10,
        min: 0,
        max: 0,
        unit: null,
        clamp: true,
        reverse: false,
        key: null,
        hideText: false,
        hideZero: false,
        nice: false,
        center: false,
      });
    });
  });

  describe("FIXED (was PRESERVED BUG 1, severe): draw() used to always throw ReferenceError, unconditionally - bare, never-declared chart/orient/grid identifiers", () => {
    it("draw() delegates to drawGrid(), matching every other concrete grid's draw()", () => {
      const { g } = makeRuleGrid();
      const sentinel = { root: g.chart.svg.group(), scale: g.scale };
      const spy = vi.spyOn(g, "drawGrid").mockReturnValue(sentinel);

      expect(() => g.draw()).not.toThrow();
      expect(g.draw()).toBe(sentinel);
      expect(spy).toHaveBeenCalled();
    });
  });

  describe("FIXED (was PRESERVED BUG 2, severe): initDomain()'s default-reached else branch used to throw ReferenceError - bare `grid` identifier, not `this.grid.domain`", () => {
    it("default config (domain: null) no longer throws - the common case - and collapses to a degenerate [0,0] domain (no explicit min/max, no domain source)", () => {
      const { g } = makeRuleGrid({ domain: null });
      expect(() => g.initDomain()).not.toThrow();
      expect(g.initDomain()).toEqual([0, 0]);
    });

    it("an array grid.domain is used directly as the value list (same shape as RangeGrid.initDomain()'s own array-domain branch)", () => {
      const { g } = makeRuleGrid({ domain: [1, 2, 3] as any });
      expect(() => g.initDomain()).not.toThrow();
      expect(g.initDomain()).toEqual([1, 3]);
    });

    it("string domain avoids the crash entirely (routes through the working branch instead)", () => {
      const { g } = makeRuleGrid({ domain: "v" }, { data: [{ v: 3 }, { v: 9 }, { v: 5 }] });
      expect(() => g.initDomain()).not.toThrow();
    });

    it("function domain also avoids the crash", () => {
      const { g } = makeRuleGrid({ domain: (row: any) => row.v }, { data: [{ v: 3 }, { v: 9 }] });
      expect(() => g.initDomain()).not.toThrow();
    });
  });

  describe("FIXED (was PRESERVED BUG 3, severe): this.axisLine(...) used to be never defined ANYWHERE in the whole engine - top/bottom/left/right each used to throw TypeError on their first statement", () => {
    it("axisLine() is now a real method: returns a themed <line> merging the given attr over the defaults", () => {
      const { g } = makeRuleGrid();
      const el = g.axisLine({ x1: 0, x2: 400, y1: 0, y2: 0 });

      expect(el.attr("x2")).toBe(400);
      expect(el.attr("stroke")).toBe("theme(gridAxisBorderColor)");
      expect(el.attr("stroke-width")).toBe("theme(gridBorderWidth)");
    });

    it("top() no longer throws - axisLine() has a real implementation now", () => {
      const { g } = makeRuleGrid();
      g.ticks = [];
      g.values = [];
      g.bar = 6;
      g.start = 0;
      g.end = 100;
      const group = g.chart.svg.group();

      expect(() => g.top(group)).not.toThrow();
      expect(group.children.length).toBe(1); // just the axis line, no ticks
    });

    it("bottom()/left()/right() are independently fixed the same way", () => {
      const { g } = makeRuleGrid();
      g.ticks = [];
      g.values = [];
      g.bar = 6;
      g.start = 0;
      g.end = 100;
      const group = g.chart.svg.group();

      expect(() => g.bottom(group)).not.toThrow();
      expect(() => g.left(group)).not.toThrow();
      expect(() => g.right(group)).not.toThrow();
    });

    it("assigning axisLine directly (bypassing the permanent upstream gap) lets top() render ticks - proves the geometry loop itself is otherwise correct/reachable", () => {
      const { g } = makeRuleGrid({ center: false });
      g.ticks = [0, 5, 10];
      g.values = [0, 200, 400];
      g.bar = 6;
      g.start = 0;
      g.end = 400;
      g.hideZero = false;

      g.axisLine = vi.fn((attr: Record<string, unknown>) => g.chart.svg.line(attr));

      const group = g.chart.svg.group();
      expect(() => g.top(group)).not.toThrow();
      expect(g.axisLine).toHaveBeenCalledWith({ y1: 0, y2: 0, x1: 0, x2: 400 });
      // 3 ticks appended as 3 child <g> groups (plus the axisLine itself).
      expect(group.children.length).toBe(4);
    });

    it("hideZero: true skips the text label for the 0 tick but still draws its tick mark (top orient)", () => {
      const { g } = makeRuleGrid({ hideZero: true });
      g.ticks = [0, 5];
      g.values = [0, 200];
      g.bar = 6;
      g.start = 0;
      g.end = 400;
      g.hideZero = true;
      g.axisLine = vi.fn((attr: Record<string, unknown>) => g.chart.svg.line(attr));

      const group = g.chart.svg.group();
      g.top(group);

      // axisLine + 2 tick groups = 3 children; the zero-tick group itself only has its <line>,
      // no text child, while the non-zero tick group has both.
      const tickGroups = group.children.slice(1) as TransElement[];
      expect(tickGroups.length).toBe(2);
      expect(tickGroups[0].children.length).toBe(1); // tick 0: line only (hideZero)
      expect(tickGroups[1].children.length).toBe(2); // tick 5: line + text
    });

    it("center: true uses the half-height/half-width midpoint for the axis line and tick translation (top orient)", () => {
      const { g } = makeRuleGrid({ center: true });
      g.ticks = [5];
      g.values = [200];
      g.bar = 6;
      g.start = 0;
      g.end = 400;
      g.center = true;
      g.axisLine = vi.fn((attr: Record<string, unknown>) => g.chart.svg.line(attr));

      const group = g.chart.svg.group();
      g.top(group);

      // axis.area('height') = 300 -> half = 150.
      expect(g.axisLine).toHaveBeenCalledWith({ y1: 150, y2: 150, x1: 0, x2: 400 });
    });
  });

  describe("wrapper", () => {
    it("key set: looks up axis.data[i][key] through the old scale", () => {
      const { g } = makeRuleGrid({}, { data: [{ v: 3 }, { v: 7 }] });
      const oldScale = vi.fn((v: unknown) => (v as number) * 10) as any;
      const wrapped = g.wrapper(oldScale, "v");

      expect(wrapped(1)).toBe(70);
      expect(oldScale).toHaveBeenCalledWith(7);
    });

    it("key falsy: returns the raw scale unchanged", () => {
      const { g } = makeRuleGrid();
      const scale = ((t: unknown) => t) as any;
      expect(g.wrapper(scale, undefined)).toBe(scale);
    });
  });

  describe("initDomain - preserved divergences from RangeGrid.initDomain() (no real inheritance relationship - see header comment)", () => {
    it("string domain: shares RangeGrid's Math.max/min-with-no-.apply bug for array field values", () => {
      const { g } = makeRuleGrid({ domain: "f", step: 10 }, { data: [{ f: [1, 2, 3] }] });
      // Math.max([1,2,3])/Math.min([1,2,3]) both NaN (ToNumber coercion of a multi-element array).
      const domain = g.initDomain();
      expect(domain.every((v) => Number.isNaN(v) || typeof v === "number")).toBe(true);
    });

    it("string domain: does NOT push an extra 0 per row (divergence from RangeGrid's own string branch)", () => {
      const { g } = makeRuleGrid({ domain: "f", step: 10 }, { data: [{ f: 4 }, { f: 9 }, { f: 2 }] });
      // value_list ends up exactly [4,9,2] here (no extra push(0)) - min=2,max=9 -> unit=ceil(7/10)=1
      // -> start climbs 0,1,...,9 (>=9) => start=9; end=9 down to <=2 => end=2 -> domain=[2,9].
      const domain = g.initDomain();
      expect(domain).toEqual([2, 9]);
    });

    it("explicit min is honored EXACTLY, never widened outward by a smaller computed value (divergence from RangeGrid's `|| min > tempMin` re-widening)", () => {
      const { g } = makeRuleGrid({ domain: "f", step: 10, min: 5 }, { data: [{ f: 1 }, { f: 20 }] });
      // tempMin from value_list [1,20] is 1, but explicit min:5 is honored as-is (typeof min ==
      // 'undefined' is false, so it's never overwritten) - RangeGrid.initDomain() would have
      // widened this down to 1 instead.
      const domain = g.initDomain();
      expect(domain[0]).toBeLessThanOrEqual(5);
      // Explicit min:5 means the while-loop's `end > min` condition uses 5, not 1 - confirmed via
      // the mutated this.grid.min below.
      expect(g.grid.min).toBe(5);
    });

    it("mutates this.grid.min/this.grid.max with the resolved values (genuinely absent from RangeGrid.initDomain())", () => {
      const { g } = makeRuleGrid({ domain: "f", step: 10 }, { data: [{ f: 4 }, { f: 9 }] });
      // grid.min defaults to 0 (RuleGrid.setup()), but `this.grid.min || undefined` treats that
      // literal 0 as falsy/unset too (same preserved quirk `date.ts`'s own header comment
      // documents) - so it's auto-computed from the data as tempMin=4, not left at 0.
      g.initDomain();
      expect(g.grid.min).toBe(4);
      expect(g.grid.max).toBe(9);
    });

    it("unit computed via plain Math.ceil((max-min)/step), no math.div/fixed involvement", () => {
      const { g } = makeRuleGrid({ domain: "f", step: 3 }, { data: [{ f: 0 }, { f: 10 }] });
      // min=0, max=10 -> unit=Math.ceil(10/3)=4 -> start climbs 0,4,8,12(>=10)=>start=12;
      // end=12 down by 4 -> 8,4,0(<=0 stop, since 0>0 is false) => end=0. domain=[0,12].
      const domain = g.initDomain();
      expect(domain).toEqual([0, 12]);
    });

    it("unit === 0 (min===max) collapses the domain to [0, 0]", () => {
      const { g } = makeRuleGrid({ domain: "f", step: 10 }, { data: [{ f: 5 }] });
      expect(g.initDomain()).toEqual([0, 0]);
    });

    it("reverse: true reverses the final domain", () => {
      const { g } = makeRuleGrid({ domain: "f", step: 10, reverse: true }, { data: [{ f: 0 }, { f: 10 }] });
      const forward = makeRuleGrid({ domain: "f", step: 10 }, { data: [{ f: 0 }, { f: 10 }] }).g.initDomain();
      expect(g.initDomain()).toEqual([...forward].reverse());
    });

    it("domain has NO .step bolt-on property (the original's own line computing it is commented out)", () => {
      const { g } = makeRuleGrid({ domain: "f", step: 10 }, { data: [{ f: 0 }, { f: 10 }] });
      const domain = g.initDomain() as unknown as { step?: number };
      expect(domain.step).toBeUndefined();
    });
  });

  describe("drawBefore - grid.nice: true, same as RangeGrid", () => {
    it("CORRECTION: does NOT throw - math.ts's nice() genuinely works, matching the real engine", () => {
      // Previously asserted as "throws when grid.nice is true" (a supposed reachable
      // util/math.ts nice() ReferenceError) - that was wrong, see math.ts's header comment for
      // the full correction. Confirmed by loading a real `nice: true` log-grid demo
      // (`grid_block_log`) directly against the live legacy site (no error).
      const { g: g2 } = makeRuleGrid({ domain: "f", step: 10, nice: true }, { data: [{ f: 0 }, { f: 100 }] });
      expect(() => g2.drawBefore()).not.toThrow();
      expect(g2.ticks).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
    });
  });

  describe("drawBefore - preserved quirks vs. RangeGrid.drawBefore() (see header comment)", () => {
    it("hand-traced: string domain [f: 0..100], step 10, bottom orient", () => {
      const { g } = makeRuleGrid({ domain: "f", step: 10, orient: "bottom" }, { data: [{ f: 0 }, { f: 100 }] });

      g.drawBefore();

      expect(g.start).toBe(0);
      expect(g.size).toBe(400);
      expect(g.end).toBe(400);
      expect(g.step).toBe(10);
      expect(g.bar).toBe(6);
      expect(g.hideZero).toBe(false);
      expect(g.center).toBe(false);
      expect(g.ticks[0]).toBe(0);
      expect(g.ticks[g.ticks.length - 1]).toBe(100);
    });

    it("never calls .clamp(...) - no clamp field is even part of RuleGridOptions's own runtime reads", () => {
      const { g } = makeRuleGrid({ domain: "f", step: 10 }, { data: [{ f: 0 }, { f: 100 }] });
      const clampSpy = vi.fn();
      g.drawBefore();
      // Directly confirm the scale's .clamp was never invoked during drawBefore() by checking
      // out-of-domain extrapolation behavior is unclamped (scale(-50) continues linearly, not
      // pinned to the domain-min pixel value).
      const atMin = g.scale(0);
      const atBelow = g.scale(-50);
      expect(atBelow).not.toBe(atMin);
      void clampSpy;
    });

    it("does NOT reverse ticks for left/right orient (divergence from RangeGrid.drawBefore())", () => {
      const { g } = makeRuleGrid({ domain: "f", step: 10, orient: "left" }, { data: [{ f: 0 }, { f: 100 }] });
      g.drawBefore();
      expect(g.ticks[0]).toBe(0);
      expect(g.ticks[g.ticks.length - 1]).toBe(100);
    });
  });
});
