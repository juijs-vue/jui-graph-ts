// Port of juijs-graph's `src/base/core.js` ("core", extend: null) - the base class every
// brush/widget/builder ultimately extends (`extend: "core"` in the original registry). This is
// THE foundational UI component base class: a self-contained per-instance event bus
// (emit/on/off), dynamic option mutation (setOption), and a (documented-inert, see below)
// destroy() - plus the construction/lifecycle wiring every `extend: "core"` subclass needs.
//
// ============================================================================================
// WHAT'S REAL 1:1 PRODUCT LOGIC vs. REGISTRY GLUE (read before touching this file)
//
// `base/core.js`'s `component()` factory returns TWO very different things, bundled together in
// the original only because of how the old string-keyed registry worked:
//
//   1. `UICore` the CONSTRUCTOR ITSELF: `this.emit`/`this.on`/`this.off`/`this.setOption`/
//      `this.destroy`, assigned as own-instance closures. This is genuine, self-contained,
//      per-instance product logic - a private event bus scoped to `this.event` (an array on the
//      instance), with ZERO reference to `base/manager.js`'s global instance registry or
//      `base/collection.js` - confirmed by reading `core.js` in full, it imports neither. Ported
//      1:1 below as real `Core` instance methods.
//   2. `UICore.build(UI)` / `UICore.init(UI)`: STATIC factory helpers used ONLY by the registry's
//      `jui.redefineUI()` machinery to turn a `{name, class}` descriptor into the public
//      `jui.include("chart.builder")` factory function - i.e. what actually gets called as
//      `chart.builder(selector, options)`. Tracing what these two methods actually DO
//      (`base/base.js`'s `createUIObject`, `UIManager.add`/`addClass`, `UICollection`) confirms
//      they are 100% registry glue: DOM-selector-based multi-element instantiation
//      (`$.find(selector)`, one instance per matched element), and wiring each instance into
//      `base/manager.js`'s global instance list. `base/manager.js`/`base/collection.js` are a
//      concurrent agent's assignment this same iteration (explicitly out of scope here) and
//      `base/base.js` itself (home of `createUIObject`, the registry engine) is not, and will
//      never be, a ported file at all per Phase 0 rule 1 (it's the registry itself, not a
//      `{name, extend, component}` UI descriptor) - so `UICore.build`/`UICore.init` are NOT
//      ported here. This is the same "registry artifact, not reachable product logic" category
//      Phase 0 rules 1/2/4 already authorize dropping wholesale (same precedent as the already-
//      documented `inherit()` prototype-sharing bug in `util/svg/element.ts`, and the dropped
//      module-level `_.resize(...)` dispatcher in `base/builder.ts`).
//
// What `createUIObject` genuinely wires onto each instance BEFORE the registry ever calls it
// (`root`, `options` [merged against the whole `extend` chain's `setup()`s, leaf-first], `event`,
// `index`, `timestamp`, plus binding each `options.event` entry via `.on()`) is real, necessary
// per-instance setup that has to happen SOMEWHERE for a `Core` subclass to be usable - it just
// isn't literally IN `core.js` in the original, because the registry did it externally. Since
// `base/base.js`/`manager.js`/`collection.js` aren't available to reconstruct that externally
// here, `Core` itself takes over that duty via `mount(root, options)` (see below) - a method name
// that does NOT exist on the original `UICore` (documented, not misrepresented as 1:1), but which
// `base/builder.ts`/`base/plane.ts` already independently invented as their own temporary
// stand-in before this file existed. Promoting it to `Core` (rather than duplicating it per
// subclass) is this reconciliation's central design decision - see those two files' updated
// header comments for the before/after.
// ============================================================================================

// ---- inlined `util/base.js` typeCheck/extend (same per-file convention as util/dom.ts,
// base/axis.ts, base/builder.ts, base/plane.ts - no shared helper module exists in this port) ---
type TypeCheckable = string | number | boolean | symbol | object | null | undefined | Function;

function typeCheck(type: string | string[], value: TypeCheckable): boolean {
  function check(t: string, v: TypeCheckable): boolean {
    if (typeof t !== "string") return false;
    if (t === "string") return typeof v === "string";
    if (t === "function") return typeof v === "function";
    if (t === "undefined") return typeof v === "undefined";
    if (t === "object") {
      return typeof v === "object" && v !== null && !(v instanceof Array) && !(v instanceof Date) && !(v instanceof RegExp);
    }
    return false;
  }
  if (typeof type === "object" && Array.isArray(type)) {
    for (let i = 0; i < type.length; i++) {
      if (check(type[i], value)) return true;
    }
    return false;
  }
  return check(type as string, value);
}

function isRecursive(value: any): boolean {
  return typeCheck("object", value);
}

/** 1:1 port of `util.base`'s `extend(origin, add, skip)` - see `base/builder.ts`'s copy for the
 * full semantics (recursive merge; `skip: true` only fills keys `origin` doesn't already have). */
function extend(origin: any, add: any, skip?: boolean): any {
  if (!typeCheck(["object", "function"], origin)) origin = {};
  if (!typeCheck(["object", "function"], add)) return origin;

  for (const key in add) {
    if (skip === true) {
      if (isRecursive(origin[key])) {
        extend(origin[key], add[key], skip);
      } else if (typeCheck("undefined", origin[key])) {
        origin[key] = add[key];
      }
    } else {
      if (isRecursive(origin[key])) {
        extend(origin[key], add[key], skip);
      } else {
        origin[key] = add[key];
      }
    }
  }

  return origin;
}

/** Mirrors `UICore`'s own `this.event.push({type, callback, unique: false})` shape 1:1 -
 * `unique` is set by the original but never read anywhere in `core.js` itself (grepped the whole
 * `juijs-graph` tree: nothing reads a `.unique` property off an event entry either) - kept as a
 * field for shape-fidelity, genuinely inert/dead in the original too, not a port-introduced gap. */
export interface CoreEvent {
  type: string;
  callback: (...args: any[]) => any;
  unique: boolean;
}

/** Base config shape every `Core` subclass's own options extend (`Builder`'s `BuilderOptions`,
 * `Plane`'s `PlaneOptions`) - just the one `event` field `Core` itself reads at construction. */
export interface CoreOptions {
  /** @cfg {Object} [event={}] Defines a DOM/custom event map to be bound at construction time -
   * `Core.setup()`'s only default (see header comment: this default only ever reached a real
   * `Builder`/`Plane` instance via the registry's `getOptions()` parent-chain walk in the
   * original). */
  event?: Record<string, (...args: any[]) => any>;
  [key: string]: any;
}

/**
 * Port of `base/core.js`'s `UICore`. Every `extend: "core"` class in the original (`Builder`,
 * `Plane`, and - future Phase B/E items not yet ported - `brush/core.js`/`widget/core.js`)
 * becomes a real `class ... extends Core` per Phase 0 rule 2.
 */
export class Core<TOptions extends CoreOptions = CoreOptions> {
  /** @property {HTMLElement} root - wired by `mount()`, mirrors `createUIObject`'s
   * `mainObj.init.prototype.root = elem`. */
  root!: HTMLElement;
  /** @property {Object} options - wired by `mount()`, mirrors `createUIObject`'s
   * `mainObj.init.prototype.options = jui.defineOptions(...)`. */
  options!: TOptions;
  /** @property {Array} event - Custom events. Own-instance array (per `UICore`'s own doc: "A
   * callback function defined as an on method is run when an emit method is called") - genuinely
   * self-contained per instance, no relation to `base/manager.js`'s global instance registry. */
  event: CoreEvent[] = [];
  /** @property {Integer} index - mirrors `createUIObject`'s `mainObj.init.prototype.index`
   * (position within a selector's matched-element list in the original; always `0` here since
   * this port's `mount()` takes a real `HTMLElement`, not a selector string - no DOM-selector
   * multi-instantiation, per Phase 0 rule 1). Real `Builder`/`Plane` subclasses may overwrite this
   * themselves in their own `init()` for unrelated reasons (`Builder.init()` does, with its own
   * per-module instance counter - see `builder.ts`). */
  index = 0;
  /** @property {Integer} timestamp - mirrors `createUIObject`'s
   * `mainObj.init.prototype.timestamp = new Date().getTime()`. */
  timestamp = 0;

  /**
   * @method emit
   * 1:1 port of `UICore`'s `this.emit`. Generates a custom event: the first parameter is the
   * event type, matched case-insensitively; every matching handler is invoked (not just the
   * first), and the LAST matching handler's return value wins (later handlers silently overwrite
   * `result` - preserved, not "fixed").
   */
  emit(type: string, args?: any[]): any {
    if (!typeCheck("string", type)) return;
    let result: any;

    for (let i = 0; i < this.event.length; i++) {
      const e = this.event[i];

      if (e.type === type.toLowerCase()) {
        const arrArgs = Array.isArray(args) ? args : [args];
        result = e.callback.apply(this, arrArgs);
      }
    }

    return result;
  }

  /**
   * @method on
   * 1:1 port of `UICore`'s `this.on`. Registers a callback for `type`, run on a matching `emit()`.
   */
  on(type: string, callback: (...args: any[]) => any): void {
    if (!typeCheck("string", type) || !typeCheck("function", callback)) return;
    this.event.push({ type: type.toLowerCase(), callback, unique: false });
  }

  /**
   * @method off
   * 1:1 port of `UICore`'s `this.off`, INCLUDING its preserved quirk: passing anything other than
   * a `string` (remove-by-type) or a `function` (remove-by-callback-identity) matches NEITHER
   * branch of the original's `if` for every entry, so `event` collapses to `[]` - i.e.
   * `off()`/`off(undefined)`/`off(123)` unconditionally wipes ALL registered events, not just a
   * no-op. Node/hand-verified against the literal original before porting. Tested.
   */
  off(type: string | ((...args: any[]) => any)): void {
    const event: CoreEvent[] = [];

    for (let i = 0; i < this.event.length; i++) {
      const e = this.event[i];

      if (
        (typeCheck("function", type) && e.callback !== type) ||
        (typeCheck("string", type) && e.type !== (type as string).toLowerCase())
      ) {
        event.push(e);
      }
    }

    this.event = event;
  }

  /**
   * @method setOption
   * 1:1 port of `UICore`'s `this.setOption`. Dynamically defines/overwrites one or many option
   * keys directly on `this.options` (no validation against `setup()` - same as the original).
   */
  setOption(key: string | Record<string, any>, value?: any): void {
    if (typeCheck("object", key)) {
      for (const k in key as Record<string, any>) {
        (this.options as any)[k] = (key as Record<string, any>)[k];
      }
    } else {
      (this.options as any)[key as string] = value;
    }
  }

  /**
   * @method destroy
   * Literal transcription of `UICore`'s `this.destroy`: `if(this.__proto__) { for (var key in
   * this.__proto__) { delete this.__proto__[key]; } }`.
   *
   * PRESERVED-STRUCTURE, NOT PRESERVED-EFFECT (documented per Phase 0's `inherit()`-registry-
   * artifact rule): in the ORIGINAL engine this is a severe, real bug rooted entirely in the old
   * registry's one-time prototype-seeding (`ctor.prototype = new superCtor()`, called ONCE at
   * module-registration time - the same `inherit()` mechanism already documented and
   * intentionally not reproduced in `util/svg/element.ts`). Because `UICore`'s own constructor
   * assigns `emit`/`on`/`off`/`setOption`/`destroy` as OWN properties of `this` (not prototype
   * methods), and `inherit()` makes every `extend: "core"` subclass's ENTIRE prototype literally
   * BE that one seed `UICore` instance, `this.__proto__` for a real `Builder`/`Plane` instance IS
   * that shared seed object - so this loop actually deletes `emit`/`on`/`off`/`setOption`/
   * `destroy` off the ONE object every instance of that class shares, permanently breaking event
   * handling for every other existing AND future instance of the same class the moment any one
   * instance calls `.destroy()`. Per Phase 0's explicit instruction ("this... registry artifact -
   * don't reproduce it, just document if encountered"), this port does NOT reproduce that cross-
   * instance corruption: with a real `class Core`, methods live as NON-ENUMERABLE properties on
   * `Core.prototype` (a JS language guarantee for class-body method syntax), so `for...in
   * Object.getPrototypeOf(this)` enumerates NOTHING here - the literal transcription below is a
   * verified, intentional no-op under real class semantics (confirmed in `core.spec.ts`: calling
   * `destroy()` neither throws nor removes any method, on the same instance or a sibling one).
   */
  destroy(): void {
    const proto = Object.getPrototypeOf(this);
    if (proto) {
      for (const key in proto) {
        delete (proto as any)[key];
      }
    }
  }

  /**
   * @method init
   * Lifecycle hook. NOT literally defined on `UICore` in the original (every `extend: "core"`
   * subclass defines its OWN `this.init = function(){...}` inside its own `component()` closure -
   * `Builder.init()`/`Plane.init()`, both already ported 1:1 in `builder.ts`/`plane.ts`).
   * Declared here purely as an overridable virtual hook so `mount()` below can invoke it
   * generically without knowing the concrete subclass - a TypeScript-shape necessity, not a
   * fabricated behavior: every real subclass overrides it exactly as before, unchanged.
   */
  init(): void {}

  /**
   * @method mount
   * NOT a method on the original `UICore` (documented, not misrepresented as 1:1 - see this
   * file's header comment). Stands in for what the dropped registry's `createUIObject()` +
   * `UICore.init()`/`.build()` factory chain did to turn a bare `new Builder()`/`new Plane()`
   * allocation into a working instance: wires `root`, merges `options` against the FULL `setup()`
   * chain (this subclass's own `static setup()` first, then every ancestor's - leaf-first, same
   * priority order as the original's `getOptions()` parent-chain walk, so `Core.setup()`'s own
   * `{event: {}}` default only ever fills in `options.event` when the concrete subclass's own
   * `setup()` doesn't already define it - true for both `Builder.setup()`/`Plane.setup()` today),
   * binds each `options.event` entry via `on()` (a genuine `createUIObject` behavior: `for (var
   * key in opts.event) uiObj.on(key, opts.event[key]);` - this is exactly what `Core.setup()`'s
   * own `event: {}` default option exists to support), then calls the subclass's real `init()`.
   */
  mount(root: HTMLElement, options?: Partial<TOptions>): this {
    this.root = root;
    this.options = this.mergeOptions(options) as TOptions;
    this.timestamp = Date.now();

    for (const key in this.options.event) {
      this.on(key, (this.options.event as Record<string, (...args: any[]) => any>)[key]);
    }

    this.init();
    return this;
  }

  /** Walks this instance's actual constructor chain (leaf subclass first, then each ancestor up
   * to and including `Core`), applying every level's own `static setup()` (`hasOwnProperty` guard
   * so a subclass that doesn't define its own `setup()` doesn't re-apply an inherited one twice) -
   * a faithful, chain-length-agnostic port of `base/base.js`'s `getOptions()` recursive walk
   * (`Module.setup()` first, `skip: true` merge, then `getOptions(Module.parent, options)`),
   * minus that function's registry-only "unknown option key throws" validation (relies on walking
   * the OLD registry's own `Module.parent` bookkeeping across the whole app, not reconstructible
   * without `base/base.js`, which per Phase 0 rule 1 is never ported). Mutates and returns the
   * passed-in `options` object directly (falling back to a fresh `{}`), matching the original's
   * own `utility.extend(options, defOpts, true)` (mutate-in-place, not a defensive copy) - same
   * convention `base/builder.ts`'s own `defineOptions()` helper already established. */
  protected mergeOptions(options?: Partial<TOptions>): TOptions {
    const result: any = options || {};
    let ctor: any = this.constructor;

    while (typeof ctor === "function") {
      if (Object.prototype.hasOwnProperty.call(ctor, "setup") && typeof ctor.setup === "function") {
        extend(result, ctor.setup(), true);
      }
      ctor = Object.getPrototypeOf(ctor);
    }

    return result as TOptions;
  }

  /**
   * @method setup
   * 1:1 port of `UICore.setup()`'s static defaults factory.
   */
  static setup(): CoreOptions {
    return {
      event: {},
    };
  }
}
