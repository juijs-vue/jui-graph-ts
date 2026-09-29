import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Map } from "./map";
import type { MapChart, MapOptions, MapScale } from "./map";
import { Axis } from "./axis";
import type { AxisChart, AxisOptions } from "./axis";
import { SVG } from "../util/svg";
import { Element as SvgElement } from "../util/svg/element";
import { TransElement } from "../util/svg/element.transform";

// ---------------------------------------------------------------------------------------------
// Test fixtures - no jui-chart-vue reference exists for `base/map.js`, so every expected value
// below is either hand-traced from the literal original algorithm or Node-cross-checked against
// it directly (see `map.ts`'s own header/call-site doc comments for the reasoning behind each
// preserved quirk asserted here).
// ---------------------------------------------------------------------------------------------

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

interface Harness {
  chart: MapChart;
  svg: SVG;
  container: HTMLElement;
  emit: ReturnType<typeof vi.fn>;
  themeValues: Record<string, string | number>;
}

function makeChart(themeOverrides: Record<string, string | number> = {}): Harness {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const svg = new SVG(container, { width: 400, height: 300 });

  const emit = vi.fn();
  const themeValues: Record<string, string | number> = {
    mapPathBackgroundColor: "#eeeeee",
    mapPathBackgroundOpacity: 1,
    mapPathBorderColor: "#333333",
    mapPathBorderWidth: 1,
    mapPathBorderOpacity: 1,
    ...themeOverrides,
  };

  const area = { x: 0, y: 0, x2: 400, y2: 300, width: 400, height: 300 };
  const areaFn = ((key?: string) => (key ? (area as any)[key] : area)) as AxisChart["area"];

  const chart = {
    area: areaFn,
    svg,
    index: 0,
    appendDefs: vi.fn(),
    theme: (key: string) => themeValues[key],
    isRender: () => false,
    render: vi.fn(),
    on: vi.fn(),
    emit,
    gridTypes: {},
    root: container,
    padding: (key: string) => (key === "left" ? 10 : key === "top" ? 20 : 0),
  } as unknown as MapChart;

  return { chart, svg, container, emit, themeValues };
}

function makeAxis(chart: MapChart, dataOverride?: Record<string, unknown>[]): Axis {
  const options = defaultAxisOptions(dataOverride ? { data: dataOverride, origin: dataOverride } : {});
  return new Axis(chart as unknown as AxisChart, options, options);
}

function makeMap(chart: MapChart, axis: Axis, mapOverrides: Partial<MapOptions> = {}): Map {
  const map = new Map();
  map.chart = chart;
  map.axis = axis;
  map.svg = chart.svg;
  map.map = { ...Map.setup(), ...mapOverrides };
  return map;
}

/** Minimal fake XHR - synchronously "completes" inside `.send()`, matching `ajax()`'s
 *  `async: false` contract (it reads `xhr.readyState`/`.status` right after `.send()` returns). */
class FakeXHR {
  static responses: Record<string, { status: number; svg?: string; nullXML?: boolean }> = {};
  static sendCount = 0;

  readyState = 0;
  status = 0;
  responseXML: Document | null = null;
  onreadystatechange: (() => void) | null = null;
  private _url = "";

  open(_method: string, url: string, _async: boolean): void {
    this._url = url;
  }

  send(_body: string): void {
    FakeXHR.sendCount++;
    const entry = FakeXHR.responses[this._url] || { status: 200, svg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>' };

    // `nullXML: true` simulates a real server response the browser doesn't recognize as XML (e.g.
    // no/wrong `Content-Type`) - `xhr.responseXML` stays `null` even on a 200 status.
    this.responseXML = entry.nullXML ? null : new DOMParser().parseFromString(entry.svg as string, "image/svg+xml");
    this.readyState = 4;
    this.status = entry.status;
  }
}

beforeEach(() => {
  document.body.innerHTML = "";
  FakeXHR.responses = {};
  FakeXHR.sendCount = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// =================================================================================================
// Map.setup()
// =================================================================================================

describe("Map.setup", () => {
  it("returns the documented defaults", () => {
    expect(Map.setup()).toEqual({
      scale: 1,
      viewX: 0,
      viewY: 0,
      hide: false,
      path: "",
      width: -1,
      height: -1,
    });
  });
});

// =================================================================================================
// The headline finding: no render()
// =================================================================================================

describe("Map.render() (Tier-A fix: bridges draw()/drawAfter(), matching the MapInstance.render() contract)", () => {
  it("calls draw() then drawAfter() (with draw()'s result) and returns that same result, without throwing", () => {
    const { chart } = makeChart();
    const axis = makeAxis(chart);
    const map = makeMap(chart, axis, { path: "m1" });
    (map as any).pathData["m1"] = [{ id: "a", d: "M0 0" }];

    const drawSpy = vi.spyOn(map, "draw");
    const drawAfterSpy = vi.spyOn(map, "drawAfter");

    let result!: { root: TransElement; scale: MapScale };
    expect(() => {
      result = map.render();
    }).not.toThrow();

    expect(drawSpy).toHaveBeenCalledTimes(1);
    expect(drawAfterSpy).toHaveBeenCalledTimes(1);
    expect(drawAfterSpy).toHaveBeenCalledWith(result);

    // draw()'s own effect: a real TransElement root wrapping the loaded path group.
    expect(result.root).toBeInstanceOf(TransElement);
    expect(result.scale).toBe(map.scale);
    // drawAfter()'s own effect actually occurred (not just "was called"): the clip-path attribute
    // it sets is present on the returned root.
    expect(result.root.attributes["clip-path"]).toBe("url(#" + axis.get("clipRectId") + ")");
  });
});

// =================================================================================================
// Constructor arity quirk
// =================================================================================================

describe("Map constructor", () => {
  it("takes zero parameters and ignores anything passed to it (chart/axis/map/svg stay unset)", () => {
    const { chart } = makeChart();
    const axis = makeAxis(chart);
    const MapCtor = Map as unknown as new (chart?: unknown, axis?: unknown, mapOptions?: unknown) => Map;

    const map = new MapCtor(chart, axis, { path: "x" });

    expect((map as unknown as { chart?: unknown }).chart).toBeUndefined();
    expect((map as unknown as { axis?: unknown }).axis).toBeUndefined();
    expect((map as unknown as { map?: unknown }).map).toBeUndefined();
    expect((map as unknown as { svg?: unknown }).svg).toBeUndefined();
    // `this.scale` IS set by the constructor (the only thing it actually does).
    expect(typeof map.scale).toBe("function");
  });
});

// =================================================================================================
// loadArray / getStyleObj (private, exercised via `as any`)
// =================================================================================================

describe("loadArray", () => {
  it("creates a <path> element when `d` is present, <polygon> otherwise", () => {
    const { chart } = makeChart();
    const axis = makeAxis(chart);
    const map = makeMap(chart, axis);

    const result = (map as any).loadArray([
      { id: "p1", d: "M0 0L10 10Z" },
      { id: "p2", points: "0,0 10,10 5,5" },
    ]);

    expect(result).toHaveLength(2);
    expect(result[0].path.element.tagName).toBe("path");
    expect(result[1].path.element.tagName).toBe("polygon");
    expect(result[0].path.element.getAttribute("id")).toBe("p1");
  });

  it("applies theme fill/stroke/opacity attributes to every created element", () => {
    const { chart, themeValues } = makeChart();
    const axis = makeAxis(chart);
    const map = makeMap(chart, axis);

    const result = (map as any).loadArray([{ id: "p1", d: "M0 0" }]);

    expect(result[0].path.attributes.fill).toBe(themeValues.mapPathBackgroundColor);
    expect(result[0].path.attributes["fill-opacity"]).toBe(themeValues.mapPathBackgroundOpacity);
    expect(result[0].path.attributes.stroke).toBe(themeValues.mapPathBorderColor);
    expect(result[0].path.attributes["stroke-width"]).toBe(themeValues.mapPathBorderWidth);
    expect(result[0].path.attributes["stroke-opacity"]).toBe(themeValues.mapPathBorderOpacity);
  });

  it("preserved quirk: theme values clobber the same-named inline `style` properties, but " +
    "unrelated style properties survive, and `style` is deleted from the source object", () => {
    const { chart, themeValues } = makeChart({ mapPathBackgroundColor: "#00ff00" });
    const axis = makeAxis(chart);
    const map = makeMap(chart, axis);

    const datum: any = { id: "p1", points: "0,0 1,1", style: "fill:blue;stroke-dasharray:4,4" };
    const result = (map as any).loadArray([datum]);

    // fill was "blue" in the inline style, but the theme's fill wins.
    expect(result[0].path.attributes.fill).toBe(themeValues.mapPathBackgroundColor);
    expect(result[0].path.attributes.fill).not.toBe("blue");
    // stroke-dasharray isn't one of the 5 theme-driven keys, so it survives untouched.
    expect(result[0].path.attributes["stroke-dasharray"]).toBe("4,4");
    // the source object had its `style` key deleted (mutated in place, matching the original).
    expect(datum.style).toBeUndefined();
  });

  it("skips array entries that aren't plain objects", () => {
    const { chart } = makeChart();
    const axis = makeAxis(chart);
    const map = makeMap(chart, axis);

    const result = (map as any).loadArray([null, 42, "x", { id: "p1", d: "M0 0" }]);

    expect(result).toHaveLength(1);
    expect(result[0].path.element.getAttribute("id")).toBe("p1");
  });
});

describe("getStyleObj (via loadArray)", () => {
  it("parses `key:value;key2:value2` pairs, skipping segments without ':' (no delimiter-adjacent " +
    "whitespace - the unaffected, 'normal' case)", () => {
    const { chart } = makeChart();
    const axis = makeAxis(chart);
    const map = makeMap(chart, axis);

    const result = (map as any).loadArray([{ id: "p1", d: "M0 0", style: "fill:blue;garbage;opacity:0.5" }]);

    expect(result[0].path.attributes.opacity).toBe("0.5");
    // "garbage" had no ':' so it's silently skipped (no crash, no stray key).
    expect(Object.keys(result[0].path.attributes)).not.toContain("garbage");
  });

  it("FIX (Tier A defect B - was: a space before a ':'/';' delimiter truncated the last real " +
    "character of that key/value, e.g. trim('blue ') -> 'blu' - see trim()'s doc comment): every " +
    "key/value survives intact regardless of delimiter-adjacent whitespace", () => {
    const { chart, themeValues } = makeChart();
    const axis = makeAxis(chart);
    const map = makeMap(chart, axis);

    // " fill : blue ; opacity:0.5 " - every token here has a trailing space before its
    // delimiter EXCEPT "opacity" (no space before its ':') and "0.5 " (trailing space before
    // end-of-string, which trim() ALSO treats as "trailing whitespace to strip").
    const result = (map as any).loadArray([{ id: "p1", d: "M0 0", style: " fill : blue ; opacity:0.5 " }]);

    // "fill"/"blue" both survive fully intact now (previously "fil"/"blu") - but the theme's own
    // fill still wins over the inline style's real "fill" key (a DIFFERENT, still-preserved quirk
    // - see loadArray()'s own doc comment), so the attribute value is the theme color, not "blue".
    expect(result[0].path.attributes.fill).toBe(themeValues.mapPathBackgroundColor);
    expect(result[0].path.attributes.fill).not.toBe("blue");
    // "opacity" (no delimiter-adjacent whitespace issue on the key) and its value "0.5" (trailing
    // space before end-of-string correctly stripped, no truncation of the "5").
    expect(result[0].path.attributes.opacity).toBe("0.5");
  });

  it("FIX regression coverage: a single trailing space, or a multi-space run, no longer eats the " +
    "preceding real character (trim('blue ') -> 'blue', not 'blu'; trim('ab  ') -> 'ab', not 'a')", () => {
    const { chart } = makeChart();
    const axis = makeAxis(chart);
    const map = makeMap(chart, axis);

    const result = (map as any).loadArray([
      { id: "p1", d: "M0 0", style: "stroke-dasharray:blue ;other-prop:ab  " },
    ]);

    expect(result[0].path.attributes["stroke-dasharray"]).toBe("blue");
    expect(result[0].path.attributes["other-prop"]).toBe("ab");
  });
});

// =================================================================================================
// isLoadAttribute / replaceXYValue (private)
// =================================================================================================

describe("isLoadAttribute", () => {
  it("whitelists exactly group/id/title/x/y/d/points/class/style", () => {
    const { chart } = makeChart();
    const axis = makeAxis(chart);
    const map = makeMap(chart, axis) as any;

    for (const name of ["group", "id", "title", "x", "y", "d", "points", "class", "style"]) {
      expect(map.isLoadAttribute(name)).toBe(true);
    }
    for (const name of ["fill", "data-foo", "stroke", "width"]) {
      expect(map.isLoadAttribute(name)).toBe(false);
    }
  });
});

describe("replaceXYValue", () => {
  it("parses x/y attribute values to numbers, leaves everything else as a string", () => {
    const { chart } = makeChart();
    const axis = makeAxis(chart);
    const map = makeMap(chart, axis) as any;

    const svgDoc = new DOMParser().parseFromString(
      '<svg xmlns="http://www.w3.org/2000/svg"><path x="12.5" y="7" id="p1" class="c1"/></svg>',
      "image/svg+xml"
    );
    const el = svgDoc.querySelector("path")!;

    expect(map.replaceXYValue(el.attributes.getNamedItem("x"))).toBe(12.5);
    expect(map.replaceXYValue(el.attributes.getNamedItem("y"))).toBe(7);
    expect(map.replaceXYValue(el.attributes.getNamedItem("id"))).toBe("p1");
  });
});

// =================================================================================================
// getPathList (private) - real jsdom-parsed SVG subtrees
// =================================================================================================

describe("getPathList", () => {
  it("preserved dead-code quirk: an id-less <g> root is still fully walked (the " +
    "`!typeCheck('string', root.id)` guard can never actually trip for a real Element)", () => {
    const { chart } = makeChart();
    const axis = makeAxis(chart);
    const map = makeMap(chart, axis) as any;

    const doc = new DOMParser().parseFromString(
      '<svg xmlns="http://www.w3.org/2000/svg"><g><path id="p1" d="M0 0" class="a"/></g></svg>',
      "image/svg+xml"
    );
    const g = doc.querySelector("g")!;
    expect(g.id).toBe(""); // confirms there really is no id attribute

    const result = map.getPathList(g);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("p1");
    expect(result[0].group).toBe(""); // root.id, even though root.id is ""
  });

  it("recurses into nested <g> elements, tagging each path with its DIRECT parent's id as `group`", () => {
    const { chart } = makeChart();
    const axis = makeAxis(chart);
    const map = makeMap(chart, axis) as any;

    const doc = new DOMParser().parseFromString(
      '<svg xmlns="http://www.w3.org/2000/svg">' +
        '<g id="outer">' +
          '<g id="inner"><path id="p1" d="M0 0"/></g>' +
          '<polygon id="p2" points="0,0 1,1 2,2"/>' +
        "</g>" +
      "</svg>",
      "image/svg+xml"
    );
    const outer = doc.querySelector("g")!;

    const result = map.getPathList(outer);

    expect(result).toHaveLength(2);
    const p1 = result.find((r: any) => r.id === "p1");
    const p2 = result.find((r: any) => r.id === "p2");
    expect(p1.group).toBe("inner");
    expect(p2.group).toBe("outer");
  });

  it("only collects whitelisted attributes (isLoadAttribute), dropping e.g. a raw `fill`", () => {
    const { chart } = makeChart();
    const axis = makeAxis(chart);
    const map = makeMap(chart, axis) as any;

    const doc = new DOMParser().parseFromString(
      '<svg xmlns="http://www.w3.org/2000/svg"><g id="g1"><path id="p1" d="M0 0" fill="red" data-foo="bar"/></g></svg>',
      "image/svg+xml"
    );
    const g = doc.querySelector("g")!;

    const result = map.getPathList(g);

    expect(result[0]).toEqual({ group: "g1", id: "p1", d: "M0 0" });
  });

  it("merges a matching axis.data row via getDataById (loose `==` id matching)", () => {
    const { chart } = makeChart();
    const axis = makeAxis(chart, [{ id: 100, dx: 5, dy: -3 }]);
    const map = makeMap(chart, axis) as any;

    const doc = new DOMParser().parseFromString(
      '<svg xmlns="http://www.w3.org/2000/svg"><g id="g1"><path id="100" d="M0 0"/></g></svg>',
      "image/svg+xml"
    );
    const g = doc.querySelector("g")!;

    const result = map.getPathList(g);

    // numeric `id: 100` in axis.data matches the string "100" parsed from the DOM attribute.
    expect(result[0].dx).toBe(5);
    expect(result[0].dy).toBe(-3);
  });
});

// =================================================================================================
// loadPath (private) - cached branch, fetched branch, and both preserved-quirk branches
// =================================================================================================

describe("loadPath", () => {
  it("cached branch: reuses an already-populated pathData[uri] entry without any XHR", () => {
    const { chart } = makeChart();
    const axis = makeAxis(chart);
    const map = makeMap(chart, axis) as any;
    vi.stubGlobal("XMLHttpRequest", FakeXHR);

    map.pathData["cached"] = [{ id: "c1", d: "M0 0" }];
    const result = map.loadPath("cached");

    expect(result).toHaveLength(1);
    expect(FakeXHR.sendCount).toBe(0);
  });

  it("fetched branch: parses the fetched SVG document's <g>/<path>/<polygon> tree and appends " +
    "any <style> tags into the live chart's root <svg> element", () => {
    const { chart } = makeChart();
    const axis = makeAxis(chart);
    const map = makeMap(chart, axis) as any;
    vi.stubGlobal("XMLHttpRequest", FakeXHR);

    FakeXHR.responses["map.svg"] = {
      status: 200,
      svg:
        '<svg xmlns="http://www.w3.org/2000/svg">' +
        '<g id="g1"><path id="US-CA" d="M0 0" class="state"/></g>' +
        "<style>.state{fill:red}</style>" +
        "</svg>",
    };

    const result = map.loadPath("map.svg");

    expect(FakeXHR.sendCount).toBe(1);
    expect(map.pathData["map.svg"]).toEqual([{ group: "g1", id: "US-CA", d: "M0 0", class: "state" }]);
    expect(result).toHaveLength(1);
    expect(result[0].path.element.getAttribute("id")).toBe("US-CA");

    const styleTag = chart.svg.root.element.querySelector("style");
    expect(styleTag).not.toBeNull();
    expect(styleTag!.textContent).toBe(".state{fill:red}");
  });

  it("FIX (Tier A defect C - was: a malformed response left pathData[uri] permanently [], " +
    "silently treated as 'already cached' forever, never retried): a malformed response (not " +
    "exactly one root <svg>) does NOT poison the cache - a later call for the same uri retries " +
    "the fetch instead of silently staying empty forever", () => {
    const { chart } = makeChart();
    const axis = makeAxis(chart);
    const map = makeMap(chart, axis) as any;
    vi.stubGlobal("XMLHttpRequest", FakeXHR);

    FakeXHR.responses["bad.svg"] = { status: 200, svg: "<root><a/><b/></root>" };

    const first = map.loadPath("bad.svg");
    expect(first).toHaveLength(0);
    expect(FakeXHR.sendCount).toBe(1);
    // No permanent `[]` written to the cache - `pathData["bad.svg"]` isn't a cached array.
    expect(Array.isArray(map.pathData["bad.svg"])).toBe(false);

    // Fix the response and retry: a REAL second network request happens (not silently skipped),
    // and it succeeds.
    FakeXHR.responses["bad.svg"] = {
      status: 200,
      svg: '<svg xmlns="http://www.w3.org/2000/svg"><g id="g1"><path id="p1" d="M0 0"/></g></svg>',
    };

    const second = map.loadPath("bad.svg");
    expect(FakeXHR.sendCount).toBe(2);
    expect(second).toHaveLength(1);
    expect(second[0].path.element.getAttribute("id")).toBe("p1");
  });

  it("preserved quirk: a non-200 response triggers the fail callback, which throws", () => {
    const { chart } = makeChart();
    const axis = makeAxis(chart);
    const map = makeMap(chart, axis) as any;
    vi.stubGlobal("XMLHttpRequest", FakeXHR);

    FakeXHR.responses["missing.svg"] = { status: 404, svg: "<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>" };

    expect(() => map.loadPath("missing.svg")).toThrow("JUI_CRITICAL_ERR: Failed to load resource");
  });

  it("FIX (Tier A defect D - was: a null responseXML crashed with an uncaught TypeError deep " +
    "inside the success callback): a response whose responseXML is null surfaces a clear, " +
    "catchable error instead of throwing an uncaught TypeError, and doesn't poison the cache", () => {
    const { chart } = makeChart();
    const axis = makeAxis(chart);
    const map = makeMap(chart, axis) as any;
    vi.stubGlobal("XMLHttpRequest", FakeXHR);

    FakeXHR.responses["null-xml.svg"] = { status: 200, nullXML: true };

    expect(() => map.loadPath("null-xml.svg")).not.toThrow(TypeError);
    expect(() => map.loadPath("null-xml.svg")).toThrow(/JUI_CRITICAL_ERR/);
    // No permanent `[]` poisoning the cache either - same non-poisoning guarantee as defect C.
    expect(Array.isArray(map.pathData["null-xml.svg"])).toBe(false);

    // A later call with a real, well-formed response still succeeds (no permanent damage done).
    FakeXHR.responses["null-xml.svg"] = {
      status: 200,
      svg: '<svg xmlns="http://www.w3.org/2000/svg"><g id="g1"><path id="p1" d="M0 0"/></g></svg>',
    };
    const result = map.loadPath("null-xml.svg");
    expect(result).toHaveLength(1);
  });
});

// =================================================================================================
// getScaleXY (private) - pan/zoom offset math
// =================================================================================================

describe("getScaleXY", () => {
  it("hand-traced: width=200,height=100,scale=2,pathX=5,pathY=-3", () => {
    const { chart } = makeChart();
    const axis = makeAxis(chart);
    const map = makeMap(chart, axis, { width: 200, height: 100 }) as any;
    map.pathScale = 2;
    map.pathX = 5;
    map.pathY = -3;

    // px = ((200*2)-200)/2 = 100; py = ((100*2)-100)/2 = 50
    expect(map.getScaleXY()).toEqual({ x: 105, y: 47 });
  });

  it("footgun documented: default width/height are -1 (unset) - scale != 1 produces a negative offset", () => {
    const { chart } = makeChart();
    const axis = makeAxis(chart);
    const map = makeMap(chart, axis) as any; // width/height stay at Map.setup()'s -1 default
    map.pathScale = 2;

    // px = ((-1*2)-(-1))/2 = -0.5; py = same
    expect(map.getScaleXY()).toEqual({ x: -0.5, y: -0.5 });
  });

  it("scale=1 always yields a zero offset regardless of width/height", () => {
    const { chart } = makeChart();
    const axis = makeAxis(chart);
    const map = makeMap(chart, axis, { width: 999, height: 999 }) as any;

    expect(map.getScaleXY()).toEqual({ x: 0, y: 0 });
  });
});

// =================================================================================================
// makePathGroup (private)
// =================================================================================================

describe("makePathGroup", () => {
  it("builds a TransElement group, appends every loaded path, and indexes only entries with a string id", () => {
    const { chart } = makeChart();
    const axis = makeAxis(chart);
    const map = makeMap(chart, axis, { path: "m1" }) as any;

    map.pathData["m1"] = [
      { id: "a", d: "M0 0" },
      { points: "0,0 1,1" }, // no id - not indexed
    ];

    const group = map.makePathGroup();

    expect(group).toBeInstanceOf(TransElement);
    expect(group.children).toHaveLength(2);
    expect(Object.keys(map.pathIndex)).toEqual(["a"]);
  });
});

// =================================================================================================
// this.scale(id) - the callable
// =================================================================================================

describe("scale(id) - callable", () => {
  function withIndexedPath(): { chart: MapChart; axis: Axis; map: any; fakePath: SvgElement } {
    const { chart } = makeChart();
    const axis = makeAxis(chart);
    const map = makeMap(chart, axis, { width: 100, height: 100 }) as any;
    const fakePath = new SvgElement();
    fakePath.create("path");

    map.pathIndex = { us: { path: fakePath, data: { id: "us", x: 10, y: 20 } } };
    map.pathScale = 2;

    return { chart, axis, map, fakePath };
  }

  it("returns undefined for a non-string id", () => {
    const { map } = withIndexedPath();
    expect(map.scale(123 as unknown as string)).toBeUndefined();
  });

  it("returns all-null fields for an id with no matching pathIndex entry", () => {
    const { map } = withIndexedPath();
    expect(map.scale("missing")).toEqual({ x: null, y: null, path: null, data: null });
  });

  it("hand-traced: resolves x/y via (value*pathScale) - getScaleXY() offset", () => {
    const { map, fakePath } = withIndexedPath();

    // getScaleXY(): width=100,height=100,pathScale=2,pathX=0,pathY=0 -> px=py=50
    // x = (10*2) - 50 = -30 ; y = (20*2) - 50 = -10
    const result = map.scale("us");

    expect(result.x).toBe(-30);
    expect(result.y).toBe(-10);
    expect(result.path).toBe(fakePath);
    expect(result.data).toEqual({ id: "us", x: 10, y: 20 });
  });

  it("factors in axis.getValue's dx/dy when present on the matched data", () => {
    const { chart } = makeChart();
    const axis = makeAxis(chart);
    const map = makeMap(chart, axis, { width: 100, height: 100 }) as any;
    const fakePath = new SvgElement();
    fakePath.create("path");
    map.pathIndex = { us: { path: fakePath, data: { id: "us", x: 10, y: 20, dx: 1, dy: -2 } } };
    map.pathScale = 2;

    const result = map.scale("us");

    // x = ((10+1)*2) - 50 = -28 ; y = ((20-2)*2) - 50 = -14
    expect(result.x).toBe(-28);
    expect(result.y).toBe(-14);
  });
});

// =================================================================================================
// this.scale.each / .size / .scale / .view
// =================================================================================================

describe("scale.each/.size/.scale/.view", () => {
  function setup() {
    const { chart } = makeChart();
    const axis = makeAxis(chart);
    const map = makeMap(chart, axis, { width: 100, height: 100 }) as any;
    const fakePath = new SvgElement();
    fakePath.create("path");
    map.pathIndex = { a: { path: fakePath, data: { id: "a" } } };
    map.pathGroup = chart.svg.group();
    return { chart, map };
  }

  it("each() calls back with `this` bound to the scale function object itself, and (id, entry) args", () => {
    const { map } = setup();
    let capturedThis: unknown;
    let capturedArgs: unknown[] = [];

    map.scale.each(function (this: MapScale, id: string, entry: unknown) {
      capturedThis = this;
      capturedArgs = [id, entry];
    });

    expect(capturedThis).toBe(map.scale);
    expect(capturedArgs[0]).toBe("a");
    expect((capturedArgs[1] as any).data).toEqual({ id: "a" });
  });

  it("size() returns {width, height} from this.map", () => {
    const { map } = setup();
    expect(map.scale.size()).toEqual({ width: 100, height: 100 });
  });

  it("scale(scale) preserved quirk: `0` (like negative values) is treated as falsy/invalid and ignored", () => {
    const { map } = setup();
    map.pathScale = 3;

    expect(map.scale.scale(0)).toBe(3);
    expect(map.scale.scale(-1)).toBe(3);
    expect(map.pathScale).toBe(3);
  });

  it("scale(scale) sets pathScale, applies it to pathGroup, and re-applies the current pan offset", () => {
    const { map } = setup();

    const result = map.scale.scale(2);

    expect(result).toBe(2);
    expect(map.pathScale).toBe(2);
    expect(map.pathGroup.attr("transform")).toContain("scale(2)");
    // view() was also called with the (still 0,0) pathX/pathY, so a translate() is present too.
    expect(map.pathGroup.attr("transform")).toContain("translate(");
  });

  it("view(x,y) with non-number args returns the CURRENT pathX/pathY without mutating anything", () => {
    const { map } = setup();
    map.pathX = 7;
    map.pathY = 8;

    expect(map.scale.view(undefined, undefined)).toEqual({ x: 7, y: 8 });
    expect(map.pathX).toBe(7);
    expect(map.pathY).toBe(8);
  });

  it("view(x,y) with numeric args updates pathX/pathY and translates pathGroup by -getScaleXY()", () => {
    const { map } = setup();
    map.pathScale = 1; // scale=1 -> getScaleXY() offset is always {x:0,y:0} regardless of width/height

    const result = map.scale.view(5, -3);

    expect(result).toEqual({ x: 5, y: -3 });
    expect(map.pathX).toBe(5);
    expect(map.pathY).toBe(-3);
    // pxy = getScaleXY() = {x: 0+5, y: 0-3} = {5,-3} (scale=1 -> px/py both 0) -> translate(-5,3)
    expect(map.pathGroup.attr("transform")).toBe("translate(-5,3)");
  });
});

// =================================================================================================
// draw()
// =================================================================================================

describe("draw", () => {
  it("builds root, loads the path group, appends it, and returns {root, scale: this.scale}", () => {
    const { chart } = makeChart();
    const axis = makeAxis(chart);
    const map = makeMap(chart, axis, { path: "m1" });
    (map as any).pathData["m1"] = [{ id: "a", d: "M0 0" }];

    const result = map.draw();

    expect(result.root).toBeInstanceOf(TransElement);
    expect(result.scale).toBe(map.scale);
    expect(result.root.children).toHaveLength(1); // the pathGroup
    expect((result.root.children[0] as TransElement).children).toHaveLength(1); // the one path
    expect(result.root.attributes.visibility).toBeUndefined();
  });

  it("hides the root when map.hide is true", () => {
    const { chart } = makeChart();
    const axis = makeAxis(chart);
    const map = makeMap(chart, axis, { path: "m1", hide: true });
    (map as any).pathData["m1"] = [];

    const result = map.draw();
    expect(result.root.attributes.visibility).toBe("hidden");
  });

  it("applies an initial scale != 1 via this.scale.scale()", () => {
    const { chart } = makeChart();
    const axis = makeAxis(chart);
    const map = makeMap(chart, axis, { path: "m1", scale: 2 });
    (map as any).pathData["m1"] = [];

    map.draw();

    expect((map as any).pathScale).toBe(2);
    expect((map as any).pathGroup.attr("transform")).toContain("scale(2)");
  });

  it("applies an initial viewX/viewY != 0 via this.scale.view()", () => {
    const { chart } = makeChart();
    const axis = makeAxis(chart);
    const map = makeMap(chart, axis, { path: "m1", viewX: 10, viewY: 20 });
    (map as any).pathData["m1"] = [];

    map.draw();

    expect((map as any).pathX).toBe(10);
    expect((map as any).pathY).toBe(20);
  });
});

// =================================================================================================
// drawAfter()
// =================================================================================================

describe("drawAfter", () => {
  it("sets the clip-path attribute from axis.get('clipRectId') on obj.root", () => {
    const { chart } = makeChart();
    const axis = makeAxis(chart);
    const map = makeMap(chart, axis);
    const root = chart.svg.group();

    map.drawAfter({ root, scale: map.scale });

    expect(root.attr("transform")).toBeUndefined();
    expect(root.attributes["clip-path"]).toBe("url(#" + axis.get("clipRectId") + ")");
  });

  it("wires mouse events onto every pathIndex entry only AFTER a 1ms setTimeout (not synchronously)", () => {
    vi.useFakeTimers();

    const { chart, emit } = makeChart();
    const axis = makeAxis(chart);
    const map = makeMap(chart, axis) as any;

    const pathElem = chart.svg.path({ id: "p1" });
    map.pathIndex = { p1: { path: pathElem, data: { id: "p1" } } };

    const root = chart.svg.group();
    map.drawAfter({ root, scale: map.scale });

    // Before the timer fires, no handler has been attached yet.
    const clickBefore = new MouseEvent("click", { bubbles: true });
    Object.defineProperty(clickBefore, "pageX", { value: 100, configurable: true });
    Object.defineProperty(clickBefore, "pageY", { value: 50, configurable: true });
    pathElem.element.dispatchEvent(clickBefore);
    expect(emit).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);

    const clickAfter = new MouseEvent("click", { bubbles: true });
    Object.defineProperty(clickAfter, "pageX", { value: 100, configurable: true });
    Object.defineProperty(clickAfter, "pageY", { value: 50, configurable: true });
    pathElem.element.dispatchEvent(clickAfter);

    expect(emit).toHaveBeenCalledTimes(1);
    const [eventName, args] = emit.mock.calls[0];
    expect(eventName).toBe("map.click");
    expect(args[0]).toBe(map.pathIndex.p1);
    // pos (offset(chart.root)) is {top:0,left:0} under jsdom -> offsetX=100,offsetY=50;
    // chartX = 100 - padding('left'=10) = 90 ; chartY = 50 - padding('top'=20) = 30
    expect(args[1].bgX).toBe(100);
    expect(args[1].bgY).toBe(50);
    expect(args[1].chartX).toBe(90);
    expect(args[1].chartY).toBe(30);
  });
});

// =================================================================================================
// addEvent (private) - direct coverage of all 8 wired event types
// =================================================================================================

describe("addEvent", () => {
  it("wires click/dblclick/contextmenu(+preventDefault)/mouseover/mouseout/mousemove/mousedown/mouseup, " +
    "each emitting the matching map.* event with (obj, e)", () => {
    const { chart, emit } = makeChart();
    const axis = makeAxis(chart);
    const map = makeMap(chart, axis) as any;

    const pathElem = chart.svg.path({ id: "p1" });
    const entry = { path: pathElem, data: { id: "p1" } };
    map.addEvent(pathElem, entry);

    const cases: Array<[string, string]> = [
      ["click", "map.click"],
      ["dblclick", "map.dblclick"],
      ["contextmenu", "map.rclick"],
      ["mouseover", "map.mouseover"],
      ["mouseout", "map.mouseout"],
      ["mousemove", "map.mousemove"],
      ["mousedown", "map.mousedown"],
      ["mouseup", "map.mouseup"],
    ];

    for (const [domType, mapEvent] of cases) {
      emit.mockClear();
      const event = new MouseEvent(domType, { bubbles: true, cancelable: true });
      Object.defineProperty(event, "pageX", { value: 0, configurable: true });
      Object.defineProperty(event, "pageY", { value: 0, configurable: true });
      const preventDefaultSpy = vi.spyOn(event, "preventDefault");

      pathElem.element.dispatchEvent(event);

      expect(emit).toHaveBeenCalledTimes(1);
      expect(emit.mock.calls[0][0]).toBe(mapEvent);
      expect(emit.mock.calls[0][1][0]).toBe(entry);

      if (domType === "contextmenu") {
        expect(preventDefaultSpy).toHaveBeenCalled();
      }
    }
  });

  it("FIX (Tier A defect E - was: offset(chart.root) returning undefined, e.g. for a detached/" +
    "unmeasurable root, crashed with an uncaught TypeError reading pos.left/pos.top): a missing " +
    "position no longer throws - the event is safely skipped instead of emitting garbage coordinates", () => {
    const { chart, emit } = makeChart();
    // A plain object has no `ownerDocument`, so `offset()` (util/dom.ts) hits its own `if (!doc)
    // return;` guard and returns `undefined` - the exact scenario this defect never handled.
    chart.root = {} as unknown as HTMLElement;
    const axis = makeAxis(chart);
    const map = makeMap(chart, axis) as any;

    const pathElem = chart.svg.path({ id: "p1" });
    const entry = { path: pathElem, data: { id: "p1" } };
    map.addEvent(pathElem, entry);

    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "pageX", { value: 100, configurable: true });
    Object.defineProperty(event, "pageY", { value: 50, configurable: true });

    expect(() => pathElem.element.dispatchEvent(event)).not.toThrow();
    // Skips the event entirely rather than emitting with garbage/NaN coordinates.
    expect(emit).not.toHaveBeenCalled();
  });

  it("still preventDefault()s a contextmenu event even when the position can't be resolved", () => {
    const { chart } = makeChart();
    chart.root = {} as unknown as HTMLElement;
    const axis = makeAxis(chart);
    const map = makeMap(chart, axis) as any;

    const pathElem = chart.svg.path({ id: "p1" });
    map.addEvent(pathElem, { path: pathElem, data: { id: "p1" } });

    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "pageX", { value: 0, configurable: true });
    Object.defineProperty(event, "pageY", { value: 0, configurable: true });
    const preventDefaultSpy = vi.spyOn(event, "preventDefault");

    expect(() => pathElem.element.dispatchEvent(event)).not.toThrow();
    expect(preventDefaultSpy).toHaveBeenCalled();
  });
});
