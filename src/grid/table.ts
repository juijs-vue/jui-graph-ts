// Port of juijs-graph's `src/grid/table.js` ("chart.grid.table", extend: "chart.grid.core").
//
// ============================================================================================
// THE 3-PARAMETER-CONSTRUCTOR CURIOSITY - investigated precisely, per this batch's own assignment
//
// The original's constructor reads `var TableGrid = function(chart, axis, grid) {...}` - THREE
// declared parameters, unlike every other real `CoreGrid` subclass in the whole `grid/*.js` family
// (confirmed via `grid/panel.ts`/`grid/overlap.ts`, both `function()`, plus `grid/core.ts`'s own
// header comment, which already flagged this file as the one documented exception when it first
// mapped the dependency graph). Two questions needed settling: (1) is `new Grid(...)` actually
// CALLED with 3 real arguments anywhere real, and (2) even if so, are `chart`/`axis`/`grid` ever
// actually USED as those closure-captured parameters inside the constructor body, or only via the
// externally-wired `this.chart`/`this.axis`/`this.grid` instance properties every subclass uses.
//
// (1) YES, confirmed via `/home/search5/cl/jui-graph/src/base/axis.js`'s real `drawGridType()`:
// `var obj = new Grid(chart, axis, axis[k]);` is called UNCONDITIONALLY for every grid type on
// every axis slot (`x`/`y`/`z`/`c`) - not something table-specific. Every other concrete subclass
// (`PanelGrid`/`OverlapGrid`, and per `grid/core.ts`'s dependency map, every one of the other 10
// direct `chart.grid.core` subclasses) receives the exact same 3 real arguments at this exact call
// site - they simply never bothered declaring formal parameters to catch them (JS silently
// discards uncaptured extra arguments). `table.js`'s 3-parameter signature is therefore NOT a
// special code path reachable only for table grids; every grid constructor is always invoked this
// way.
//
// (2) NO - grepped `chart`/`axis`/`grid` (the closure parameters) against every reference inside
// the constructor body: `custom()`/`drawBefore()`/`draw()` exclusively use `this.chart`/
// `this.axis`/`this.grid` (assigned onto the instance by `drawGridType()` AFTER construction,
// exactly like every other subclass), never the bare `chart`/`axis`/`grid` identifiers the
// constructor itself declared. The declared parameters are 100% dead weight: they exist as named
// bindings that are never read anywhere in the function body.
//
// **Conclusion: NOT a real behavioral difference - vestigial/dead, not reachable in any
// behaviorally meaningful sense.** Ported here with the SAME 0-arg (implicit, inherited) default
// constructor every other `CoreGrid` subclass uses, satisfying `base/axis.ts`'s `GridConstructor`
// exactly the way `grid/core.ts`'s own `gridConstructorTypeCheck` already proved a 0-arg
// constructor legitimately satisfies a 3-required-arg constructor TYPE (TypeScript's "implementation
// may ignore trailing parameters" assignability rule) - re-verified below via this file's own
// `tableGridConstructorTypeCheck`, not just asserted in prose.
// ============================================================================================
//
// A SEPARATE, GENUINELY NEW FINDING surfaced while tracing the above (not assumed from a single
// read - see `custom()`'s own doc comment below for the full trail): `custom()`'s entire loop body
// is unreachable dead code, due to a real `var`-scoping bug independent of the constructor-param
// question - a `this.row`/`this.column` instance-field pair that `drawBefore()` never actually
// assigns to (it computes its OWN, differently-scoped local `row`/`column` instead).
//
// Real dependency: `CoreGrid` only - "nothing extra" beyond `util.base`'s `extend()` - though
// notably, UNLIKE `grid/panel.ts`/`grid/overlap.ts`, the original `table.js` never even declares
// `var _ = jui.include("util.base");` in the first place (confirmed: no such line anywhere in the
// file) - a second, independent bug on top of the dead-loop one (see `custom()`'s doc comment).
import { CoreGrid } from "./core";
import type { TransElement } from "../util/svg/element.transform";
import type { GridConstructor } from "../base/axis";

// ---- inlined `util/base.js` `extend(origin, add)` (same per-file convention) -------------------
// Used here purely for structural/compile fidelity of `custom()`'s dead branch (see its doc
// comment) - harmless either way since that branch can never execute, but kept so the ported code
// shape still visibly mirrors the original's own (bugged) `_.extend(...)` call site.
function typeCheck(type: string, value: unknown): boolean {
  if (type === "object") {
    return typeof value === "object" && value !== null && !(value instanceof Array) && !(value instanceof Date) && !(value instanceof RegExp);
  }
  return false;
}

function extend(origin: Record<string, unknown>, add: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!typeCheck("object", add)) return origin;
  for (const key in add) {
    origin[key] = add![key];
  }
  return origin;
}

/** `chart.grid.table` - builds a row/column table-cell scale (via `drawBefore()`'s own `this.scale`
 * closure, which works correctly) for use as an axis group's "c"/custom grid. Its own `custom()`
 * draw method is genuinely dead code, though - see that method's own doc comment for the full,
 * newly-found "PRESERVED BUG" investigation (a `var`-shadowing bug means its guiding loop can never
 * run a single iteration). See this file's own header comment for a related investigation into its
 * unusual 3-parameter constructor signature (a legacy curiosity, resolved to not actually matter at
 * runtime). */
export class TableGrid extends CoreGrid {
  // Mirrors the original's constructor-top-level `var rowUnit, columnUnit, outerPadding, row,
  // column;` - declared as instance fields for the same reason `drawBefore()`'s own claimed
  // `row`/`column` computation ISN'T what `custom()` actually reads (see `custom()`'s doc comment
  // below): `drawBefore()` computes its OWN same-named LOCAL `const`s instead of ever assigning
  // to `this.row`/`this.column`, a real `var`-shadowing bug in the original faithfully reproduced
  // here by keeping these two "slots" genuinely distinct (never merged/simplified away).
  // `rowUnit`/`columnUnit`/`outerPadding` are NOT similarly kept as fields: `rowUnit`/`columnUnit`
  // are read ONLY inside `drawBefore()`'s own local scope in the original (never by `custom()`),
  // so they're plain local `const`s in `drawBefore()` below with no bug to preserve; `outerPadding`
  // is never referenced ANYWHERE in the original at all (an apparent leftover/typo, unlike `row`/
  // `column` which `custom()` DOES genuinely read from their perpetually-unassigned slot) - dropped
  // here as truly inert.
  private row: number | undefined;
  private column: number | undefined;

  /**
   * @method custom
   * **PRESERVED BUG, genuinely new (not previously documented anywhere), found via this batch's
   * own dead-code trace - not assumed from a single read**: `drawBefore()` (below) declares its
   * OWN local `row`/`column` (`var row = this.grid.rows;` in the original - a plain local variable
   * of `drawBefore`'s own function scope, NOT an assignment to any outer/instance `row`/`column`).
   * This class's `row`/`column` FIELDS (mirroring the original's constructor-top-level `var row,
   * column;`, declared above) are therefore never assigned by anything, ever - they stay
   * `undefined` for the lifetime of the instance. `for (let r = 0; r < (this.row as number); r++)`
   * with `this.row === undefined` is always `false` (`r < undefined` is a `NaN` comparison, always
   * `false`) - **so this method's entire body is dead code: it can never execute a single loop
   * iteration in real usage**, despite `row`/`column`/`padding` being correctly, genuinely
   * computed and used by `this.scale` (a SEPARATE closure inside `drawBefore()`, entirely
   * unaffected by this shadowing bug - see `drawBefore()` below, and `table.spec.ts`'s passing
   * `scale()` tests).
   *
   * Doubly (arguably triply) unreachable, independent of the above: (a) the original `table.js`
   * never declares `var _ = jui.include("util.base");` at all (unlike `grid/panel.ts`'s/
   * `grid/overlap.ts`'s originals, which both do) - so its `_.extend(...)` call would throw
   * `ReferenceError: _ is not defined` if this line were ever actually reached (reading a truly
   * undeclared identifier, which throws on read regardless of strict/sloppy mode - a different,
   * still-valid category from `util/math.ts`'s `niceNum()`/`util/svg/element.ts`'s `is()`, both of
   * which were previously mis-diagnosed as this kind of bug and have since been corrected, see
   * each file's own header comment - not reproduced as a literal throw here since there's no
   * reachable call site to attach it to, the loop above already never runs); (b) even
   * setting both of those aside, the created rect (`var rect = this.chart.svg.rect(...)`) is never
   * appended anywhere - the original's own `g.append(rect);` line is literally commented out
   * (`//g.append(rect);`) - and its `fill` value is typo'd (`"tranparent"`, missing an `s`).
   * Ported here as a structurally-faithful but provably-dead loop body (see `table.spec.ts` for
   * the test proving `chart.svg.rect` is NEVER called via `custom()`).
   */
  custom(_g?: TransElement): void {
    for (let r = 0; r < (this.row as unknown as number); r++) {
      for (let c = 0; c < (this.column as unknown as number); c++) {
        const index = r * (this.column as unknown as number) + c;
        const obj = this.scale(index);

        obj.x -= this.axis.area("x");
        obj.y -= this.axis.area("y");

        this.chart.svg.rect(
          extend(obj, {
            fill: "tranparent", // preserved typo (should be "transparent") - dead code either way
            stroke: "black",
          }),
        );

        // g.append(rect); // commented out in the original too - the rect was never attached.
      }
    }
  }

  /**
   * @method drawBefore
   * Computes real, correct `row`/`column`/`padding`/`rowUnit`/`columnUnit` values and a working
   * `this.scale(i)` - entirely unaffected by `custom()`'s dead-loop bug above (these are genuinely
   * separate local bindings, not the `this.row`/`this.column` fields `custom()` reads).
   */
  drawBefore = (): void => {
    const row = this.grid.rows as number;
    const column = this.grid.columns as number;
    const padding = this.grid.padding as number;

    const columnUnit = (this.axis.area("width") - (column - 1) * padding) / column;
    const rowUnit = (this.axis.area("height") - (row - 1) * padding) / row;

    const axis = this.axis;

    this.scale = (i: number) => {
      const r = Math.floor(i / column);
      const c = i % column;

      const x = c * columnUnit;
      const y = r * rowUnit;

      const space = padding * c;
      const rspace = padding * r;

      return {
        x: axis.area("x") + x + space,
        y: axis.area("y") + y + rspace,
        width: columnUnit,
        height: rowUnit,
      };
    };
  };

  /**
   * @method draw
   * Same "always forces `this.grid.hide = true`" behavior, and the same
   * `this.drawGrid("table")` → `this.drawGrid()` argument-dropping adaptation, as
   * `grid/panel.ts`'s `draw()` - see its doc comment for the full evidence that `drawGrid`'s own
   * string argument was already discarded by the original engine.
   */
  draw = (): { root: TransElement; scale: any } => {
    this.grid.hide = true;
    return this.drawGrid();
  };

  static setup(): Record<string, unknown> {
    return {
      /** @cfg {Number} [rows=1] row count in table */
      rows: 1,
      /** @cfg {Number} [column=1] column count in table */
      columns: 1,
      /** @cfg {Number} [padding=1] padding in table */
      padding: 10,
    };
  }
}

// Compile-time-only re-verification (same convention `grid/core.ts`'s own
// `gridConstructorTypeCheck` established) that `TableGrid`'s implicit, inherited 0-arg
// constructor - deliberately NOT overridden with an explicit 3-param one, per the investigation
// above - still satisfies `GridConstructor`'s declared 3-required-arg constructor shape.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const tableGridConstructorTypeCheck: GridConstructor = TableGrid;
void tableGridConstructorTypeCheck;
