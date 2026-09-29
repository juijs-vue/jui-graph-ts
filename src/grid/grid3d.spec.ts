import { describe, it, expect, vi } from "vitest";
import { Grid3D } from "./grid3d";
import type { Grid3DConfig } from "./grid3d";
import type { GridChart } from "./core";
import type { Axis, AxisChart, AreaBox } from "../base/axis";
import { SVG } from "../util/svg";
import { radian } from "../util/math";
import type { TransElement } from "../util/svg/element.transform";

// ---------------------------------------------------------------------------------------------
// Test doubles - same convention `core.spec.ts`/`date.spec.ts`/`radar.spec.ts` already
// established.
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
  get?: (type: string) => unknown;
  x?: unknown;
  y?: unknown;
  orient?: string;
}

function makeAxisStub(opts: AxisStubOptions = {}): Axis {
  const area: AreaBox = { x: 0, y: 0, x2: 200, y2: 100, width: 200, height: 100 };

  const stub = {
    area: ((key?: string) => (key ? (area as any)[key] : area)) as Axis["area"],
    depth: 0,
    degree: { x: 0, y: 0, z: 0 },
    isFull3D: () => false,
    data: [],
    get: opts.get ?? (() => undefined),
    x: opts.x,
    y: opts.y,
  };

  return stub as unknown as Axis;
}

function makeGrid(overrides: Partial<Grid3DConfig> = {}): Grid3DConfig {
  return { orient: "center", type: "grid3d", domain: null, ...overrides };
}

function makeScaleStub(chart: GridChart, root: TransElement, offset = 0): { (v: unknown): number; root: TransElement } {
  const fn = ((v: unknown) => (v as number) + offset) as { (v: unknown): number; root: TransElement };
  fn.root = root;
  void chart;
  return fn;
}

function makeGrid3D(gridOverrides: Partial<Grid3DConfig> = {}, axisOpts: AxisStubOptions = {}): { g: Grid3D; chart: GridChart } {
  const { chart } = makeChart();
  const g = new Grid3D();
  g.chart = chart;
  g.axis = makeAxisStub(axisOpts);
  g.grid = makeGrid(gridOverrides);
  return { g, chart };
}

describe("Grid3D", () => {
  describe("static setup", () => {
    it("matches the original's 1-field literal", () => {
      expect(Grid3D.setup()).toEqual({ domain: null });
    });
  });

  describe("drawBefore", () => {
    it("fixed (Tier A defect 5): standard axis.degree object ({x,y,z}) no longer poisons radian to NaN - resolves via degree.z instead of coercing the raw object", () => {
      const { g } = makeGrid3D({}, { get: (type) => (type === "depth" ? 10 : type === "degree" ? { x: 0, y: 0, z: 0 } : undefined) });

      g.drawBefore();

      expect((g as any).depth).toBe(10);
      expect((g as any).degree).toEqual({ x: 0, y: 0, z: 0 });
      expect((g as any).radian).not.toBeNaN();
      expect((g as any).radian).toBeCloseTo(radian(360 - 0), 10);
      expect((g.scale as any).radian).not.toBeNaN();
      expect((g.scale as any).depth).toBe(10);
      // `scale.degree` still carries the RAW resolved value (unchanged shape/consumers elsewhere -
      // only the internal `radian` computation was fixed to use a real number).
      expect((g.scale as any).degree).toEqual({ x: 0, y: 0, z: 0 });
    });

    it("fixed (Tier A defect 5): a NON-uniform axis.degree object resolves radian via degree.z specifically (not .x/.y)", () => {
      const { g } = makeGrid3D({}, { get: (type) => (type === "depth" ? 10 : type === "degree" ? { x: 11, y: 22, z: 33 } : undefined) });

      g.drawBefore();

      expect((g as any).radian).toBeCloseTo(radian(360 - 33), 10);
    });

    it("with an atypical numeric axis.degree override, radian is computed correctly (confirms the bug is object-vs-number coercion, not a hard crash)", () => {
      const { g } = makeGrid3D({}, { get: (type) => (type === "depth" ? 10 : type === "degree" ? 30 : undefined) });

      g.drawBefore();

      expect((g as any).radian).toBeCloseTo(radian(360 - 30), 10);
    });

    it("this.scale(x, y): z undefined -> delegates directly to axis.x(x)/axis.y(y), depth = this.depth/1", () => {
      const xFn = makeScaleStub({} as GridChart, {} as TransElement, 100);
      const yFn = makeScaleStub({} as GridChart, {} as TransElement, 200);
      const { g } = makeGrid3D({}, { get: (type) => (type === "depth" ? 10 : type === "degree" ? 30 : undefined), x: xFn, y: yFn });

      g.drawBefore();

      const result = (g.scale as any)(5, 7);
      expect(result).toEqual({ x: 105, y: 207, depth: 10 });
    });

    it("this.scale(x, y, z, count): multi-step branch - hand-traced against the real, already-verified util/math.ts radian()", () => {
      const xFn = makeScaleStub({} as GridChart, {} as TransElement, 0);
      const yFn = makeScaleStub({} as GridChart, {} as TransElement, 0);
      const { g } = makeGrid3D({}, { get: (type) => (type === "depth" ? 20 : type === "degree" ? 30 : undefined), x: xFn, y: yFn });

      g.drawBefore();

      const step = 2;
      const split = 20 / step;
      const r = radian(360 - 30);
      const c = split * 3; // z = 3
      const top = Math.sin(r) * split;
      const expectedX = xFn(5) + Math.cos(r) * c;
      const expectedY = yFn(7) + Math.sin(r) * c + top;

      const result = (g.scale as any)(5, 7, 3, step);
      expect(result).toEqual({ x: expectedX, y: expectedY, depth: split });
    });

    it("count: undefined defaults step to 1 (not typeCheck-integer), so the z-branch is skipped even with z set", () => {
      const xFn = makeScaleStub({} as GridChart, {} as TransElement, 1);
      const yFn = makeScaleStub({} as GridChart, {} as TransElement, 2);
      const { g } = makeGrid3D({}, { get: (type) => (type === "depth" ? 10 : type === "degree" ? 30 : undefined), x: xFn, y: yFn });

      g.drawBefore();

      // count is `undefined` -> typeCheck("integer", undefined) is false -> step defaults to 1
      // -> `step == 1` short-circuits the z-projection branch even though z (3) is defined.
      const result = (g.scale as any)(5, 7, 3, undefined);
      expect(result).toEqual({ x: xFn(5), y: yFn(7), depth: 10 });
    });
  });

  describe("getElementAttr (private, exercised via bracket access)", () => {
    it("returns the attributes of the first direct <line> child, or null if none found", () => {
      const { g, chart } = makeGrid3D();
      const root = chart.svg.group();

      const groupChild = chart.svg.group();
      root.append(groupChild);
      expect((g as any).getElementAttr(root)).toBeNull();

      const lineChild = chart.svg.line({ x1: 1, y1: 2, x2: 3, y2: 4 });
      root.append(lineChild);
      expect((g as any).getElementAttr(root)).toEqual({ x1: 1, y1: 2, x2: 3, y2: 4 });
    });

    it("preserved quirk: with MULTIPLE direct <line> children, returns the LAST one's attributes, not the first (no early break)", () => {
      const { g, chart } = makeGrid3D();
      const root = chart.svg.group();

      root.append(chart.svg.line({ x1: 1, y1: 2, x2: 3, y2: 4 }));
      root.append(chart.svg.line({ x1: 10, y1: 20, x2: 30, y2: 40 }));

      expect((g as any).getElementAttr(root)).toEqual({ x1: 10, y1: 20, x2: 30, y2: 40 });
    });
  });

  describe("draw", () => {
    // Numeric `degree` override (30) keeps this test's geometry hand-traceable (non-NaN) -
    // the default object-shaped `degree` (NaN radian) is covered by its own dedicated
    // `drawBefore` test above.
    const depth = 10;
    const degreeOverride = 30;

    function buildFixture() {
      const { g, chart } = makeGrid3D({}, { get: (type) => (type === "depth" ? depth : type === "degree" ? degreeOverride : undefined) });

      // yRoot: one direct <line> child (triggers the "is a line" branch) + one direct <g> child
      // (triggers the "fetch xRoot's line attrs, append two lines onto this group" branch).
      const yRoot = chart.svg.group();
      const yLineChild = chart.svg.line({ y2: 42 });
      const yGroupChild = chart.svg.group();
      yRoot.append(yLineChild);
      yRoot.append(yGroupChild);

      // xRoot: index 0 is a <g> wrapping one <line> (skipped by the `i > 0` guard, but its attr
      // is still unconditionally computed via `.get(0)`, so it needs a real child); index 1 is a
      // direct <line> (gets two depth lines appended, since i > 0).
      const xRoot = chart.svg.group();
      const xChild0Inner = chart.svg.line({ x1: 0, y1: 90 });
      const xChild0 = chart.svg.group();
      xChild0.append(xChild0Inner);
      const xChild1 = chart.svg.line({ x1: 50, y1: 100, x2: 80, y2: 120 });
      xRoot.append(xChild0);
      xRoot.append(xChild1);

      const xFn = makeScaleStub(chart, xRoot);
      const yFn = makeScaleStub(chart, yRoot);
      g.axis = makeAxisStub({ get: (type) => (type === "depth" ? depth : type === "degree" ? degreeOverride : undefined), x: xFn, y: yFn });
      g.drawBefore();

      return { g, chart, xRoot, yRoot, yLineChild, yGroupChild, xChild0, xChild1 };
    }

    it("appends a new line onto yRoot when its child is a <line> (base-axis-line branch)", () => {
      const { g, yRoot, yLineChild } = buildFixture();
      const childCountBefore = yRoot.children.length;

      g.draw();

      expect(yRoot.children.length).toBe(childCountBefore + 1);
      const appended = yRoot.children[yRoot.children.length - 1];

      const r = radian(360 - degreeOverride);
      const x2 = Math.cos(r) * depth;
      const y2 = Math.sin(r) * depth;

      expect(appended.attr("x1")).toBe(x2);
      expect(appended.attr("x2")).toBe(x2);
      // `y1: 0` is falsy in the internal attribute cache, so it falls through to
      // `getAttribute()` (always a string) - the already-documented Phase A `Element.attr()`
      // quirk (`util/svg/element.ts`), not new here.
      expect(appended.attr("y1")).toBe("0");
      expect(appended.attr("y2")).toBe(y2 + (yLineChild.attributes.y2 as number));
    });

    it("appends two depth lines onto yRoot's non-<line> (group) child, reading xRoot's line attrs via getElementAttr", () => {
      const { g, yGroupChild, xChild1 } = buildFixture();

      g.draw();

      expect(yGroupChild.children.length).toBe(2);

      const r = radian(360 - degreeOverride);
      const x2 = Math.cos(r) * depth;
      const y2 = Math.sin(r) * depth;

      const [first, second] = yGroupChild.children;
      // Both `x1`/`y1` are the literal `0` - falsy in the attribute cache, so `.attr()` falls
      // through to `getAttribute()` (a string) - same already-documented Phase A quirk as above.
      expect(first.attr("x1")).toBe("0");
      expect(first.attr("y1")).toBe("0");
      expect(first.attr("x2")).toBe(x2);
      expect(first.attr("y2")).toBe(y2);

      expect(second.attr("x1")).toBe(x2);
      expect(second.attr("y1")).toBe(y2);
      expect(second.attr("x2")).toBe(x2 + (xChild1.attributes.x2 as number));
      expect(second.attr("y2")).toBe(y2);
    });

    it("skips xRoot's index 0 (no lines appended to it), appends two depth lines to index > 0", () => {
      const { g, xChild0, xChild1 } = buildFixture();

      g.draw();

      // xChild0 (index 0) started with 1 child (`xChild0Inner`, from the fixture) and gains
      // NONE from draw() - the `i > 0` guard skips index 0 entirely.
      expect(xChild0.children.length).toBe(1);
      expect(xChild1.children.length).toBe(2);

      const r = radian(360 - degreeOverride);
      const outerX2 = Math.cos(r) * depth;
      const outerY2 = Math.sin(r) * depth;
      const rowY2 = (xChild1.attributes.y1 as number) + Math.sin(r) * depth;
      const rowX2 = (xChild1.attributes.x1 as number) + Math.cos(r) * depth;

      const [first, second] = xChild1.children;
      expect(first.attr("x1")).toBe(xChild1.attributes.x1);
      expect(first.attr("y1")).toBe(xChild1.attributes.y1);
      expect(first.attr("x2")).toBe(rowX2);
      expect(first.attr("y2")).toBe(rowY2);

      // **Preserved quirk (see `getElementAttr()`'s doc comment)**: by the time this `xRoot.each()`
      // pass runs, `yRoot` has TWO direct `<line>` children - the fixture's original `yLineChild`
      // (`y2: 42`) AND the one `yRoot.each()`'s own EARLIER pass (see the first `it()` above)
      // already appended onto `yRoot` itself (`y2: outerY2 + 42`). `getElementAttr()` doesn't
      // break on the first match - it returns the LAST one, i.e. the freshly-appended line, not
      // the original. Node-cross-checked expected value below (58.00000000000001, not the
      // "naively expected" 53 a first read might assume).
      const lastYRootLineY2 = outerY2 + 42;
      expect(second.attr("x1")).toBe(rowX2);
      expect(second.attr("y1")).toBe(rowY2);
      expect(second.attr("x2")).toBe(rowX2);
      expect(second.attr("y2")).toBe(-(lastYRootLineY2 - rowY2));
      void outerX2;
    });

    it("returns this.drawGrid()'s result (empty root, since Grid3D defines no top/bottom/left/right/center - see header comment)", () => {
      const { g } = buildFixture();
      const result = g.draw();

      expect(result.root).toBeDefined();
      expect(result.scale).toBe(g.scale);
    });
  });
});
