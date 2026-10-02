/**
 * @fileoverview The mobile analogue of the runtime's `LibraryLoader`.
 *
 * ## The problem this solves
 *
 * An interactive component spec declares its third-party libraries, and the react-runtime compiler
 * turns each declaration into a binding at the top of the generated factory:
 *
 * ```js
 * const _  = libraries['_'];
 * const ss = libraries['ss'];
 * ```
 *
 * If `libraries` does not carry those keys the bindings are `undefined` and the component throws on
 * its first call. So "compile the component but skip its libraries" is not a degraded mode — it is a
 * guaranteed crash for any component that declares one.
 *
 * ## How the web supplies them, and why mobile cannot copy it directly
 *
 * `ScriptLoaderService` → `LibraryLoader.loadAllLibraries()` appends a `<script>` per library, waits
 * for the UMD bundle to define its global on `window`, and returns a map keyed by **global variable
 * name**: `libraries[lib.globalVariable] = window[lib.globalVariable]`. `AngularReactAdapterService`
 * puts that map straight into `RuntimeContext.libraries`.
 *
 * Every step of that is DOM-bound — `document.createElement('script')`, `window`, a CDN fetch — and
 * none of it exists under Hermes. The compiler knows: it bails with *"Library loading is only
 * supported in browser environments"* when `window` is undefined.
 *
 * ## What mobile does instead
 *
 * The seam is the same one: `RuntimeContext.libraries`, keyed by the same `globalVariable`. The
 * compiler merges `{ ...context.libraries }` before overlaying anything it loaded itself, so a map
 * supplied here is indistinguishable — to the component — from a UMD bundle the browser evaluated
 * into a global. This module builds that map from libraries bundled as ordinary npm dependencies.
 * Loading a UMD into `window.lodash` and importing `lodash` from the bundle are the same act
 * performed by two different module systems.
 *
 * Versions in {@link MOBILE_LIBRARIES} are pinned to the exact versions `__mj.ComponentLibrary`
 * declares, so a component gets the same library behaviour on both surfaces rather than
 * "approximately lodash".
 *
 * ## What mobile honestly cannot provide
 *
 * About half the registry is DOM- or canvas-bound: it draws into an `HTMLCanvasElement`, mounts
 * `HTMLElement`s, or is a React DOM component library. Shimming those would produce a component
 * that renders nothing and reports no error, which is worse than declining. {@link DESKTOP_ONLY}
 * names them with the reason, so the fallback card can say which library forced it instead of the
 * blanket "uses external libraries".
 *
 * ## Cost
 *
 * These are lazily `import()`ed, so nothing is evaluated until a component declares it. Metro still
 * links them into the bundle — that is the price of having them available offline, and it is paid in
 * app size, not in startup time.
 */

import type { ComponentSpec } from '@memberjunction/react-runtime';

/**
 * One entry of a spec's `libraries` array.
 *
 * Derived from `ComponentSpec` rather than imported from `@memberjunction/interactive-component-types`
 * directly: the shape is owned there, and deriving it means this file cannot drift from the spec the
 * compiler actually reads — nor does it add a package dependency for a type the runtime already
 * re-exports.
 */
type ComponentLibraryDependency = NonNullable<ComponentSpec['libraries']>[number];

/**
 * How a module's export shape maps onto the single value a UMD bundle would have parked on
 * `window`.
 *
 * `callable` — the UMD global IS the function (`_`, `dayjs`, `chroma`, `axios`, `moment`); the npm
 * package exposes it as the CommonJS default export.
 *
 * `namespace` — the UMD global is an object of named exports (`luxon.DateTime`, `d3.scaleLinear`,
 * `ss.median`); the npm package is a plain ES module with no default.
 *
 * `object` — the UMD global is an object AND the package also carries a CommonJS default that is
 * that same object (`XLSX`, `topojson`).
 */
export type MobileLibraryShape = 'callable' | 'namespace' | 'object';

/** A library this app can hand to a component. */
export type MobileLibraryEntry = {
    /** The `__mj.ComponentLibrary` name — what a spec's `libraries[].name` carries. */
    Name: string;
    /** The binding the compiler emits, and the key in `RuntimeContext.libraries`. */
    GlobalVariable: string;
    /** The version bundled here; pinned to the version MJ metadata declares. */
    Version: string;
    /** How to reduce the imported module to the value the web would have found on `window`. */
    Shape: MobileLibraryShape;
    /** Imports the module. Lazy so a component that never asks never pays. */
    Import: () => Promise<Record<string, unknown>>;
};

/**
 * Every library mobile can supply, keyed in the registry order metadata lists them.
 *
 * The test suite asserts this list stays a subset of the Active `ComponentLibrary` rows by global
 * variable, so a typo here surfaces as a failing test rather than an `undefined` binding at runtime.
 */
export const MOBILE_LIBRARIES: readonly MobileLibraryEntry[] = [
    { Name: 'lodash', GlobalVariable: '_', Version: '4.17.21', Shape: 'callable', Import: () => import('lodash') },
    { Name: 'dayjs', GlobalVariable: 'dayjs', Version: '1.11.10', Shape: 'callable', Import: () => import('dayjs') },
    { Name: 'moment', GlobalVariable: 'moment', Version: '2.29.4', Shape: 'callable', Import: () => import('moment') },
    { Name: 'chroma-js', GlobalVariable: 'chroma', Version: '2.4.2', Shape: 'callable', Import: () => import('chroma-js') },
    { Name: 'axios', GlobalVariable: 'axios', Version: '1.6.5', Shape: 'callable', Import: () => import('axios') },

    { Name: 'luxon', GlobalVariable: 'luxon', Version: '3.7.1', Shape: 'namespace', Import: () => import('luxon') },
    { Name: 'mathjs', GlobalVariable: 'math', Version: '12.2.1', Shape: 'namespace', Import: () => import('mathjs') },
    { Name: 'simple-statistics', GlobalVariable: 'ss', Version: '7.8.3', Shape: 'namespace', Import: () => import('simple-statistics') },
    { Name: 'uuid', GlobalVariable: 'uuid', Version: '9.0.1', Shape: 'namespace', Import: () => import('uuid') },
    { Name: 'd3', GlobalVariable: 'd3', Version: '7.8.5', Shape: 'namespace', Import: () => import('d3') },
    { Name: 'marked', GlobalVariable: 'marked', Version: '11.1.1', Shape: 'namespace', Import: () => import('marked') },

    { Name: 'topojson-client', GlobalVariable: 'topojson', Version: '3.1.0', Shape: 'object', Import: () => import('topojson-client') },
    { Name: 'xlsx', GlobalVariable: 'XLSX', Version: '0.18.5', Shape: 'object', Import: () => import('xlsx') },
];

/**
 * Libraries in the registry that mobile declines, and why.
 *
 * Keyed by global variable. The reason is written for the person holding the phone, not for a log:
 * it says what the library needs, because "needs a browser canvas" is a fact they can act on
 * (open it on a desktop) while "unsupported" is not.
 */
export const DESKTOP_ONLY: Readonly<Record<string, string>> = {
    Chart: 'Chart.js draws into a browser canvas',
    ApexCharts: 'ApexCharts renders into the browser DOM',
    agGrid: 'AG Grid mounts a browser DOM grid',
    antd: 'Ant Design is a React DOM component library',
    L: 'Leaflet mounts a browser map container',
    mapboxgl: 'Mapbox GL needs browser WebGL',
    MapCore: 'geo-maps targets browser map hosts',
    gsap: 'GSAP animates browser DOM nodes',
    Sortable: 'SortableJS drives browser drag-and-drop',
    Popper: 'Popper.js positions against browser DOM nodes',
    emotionReact: 'Emotion generates browser stylesheets',
    emotionStyled: 'Emotion generates browser stylesheets',
    DOMPurify: 'DOMPurify sanitises against a browser DOM',
    html2canvas: 'html2canvas rasterises a browser DOM tree',
    jspdf: 'jsPDF depends on browser canvas and Blob APIs',
};

/** Index by global variable, which is the key the compiler actually binds. */
const BY_GLOBAL = new Map(MOBILE_LIBRARIES.map((l) => [l.GlobalVariable, l]));

/** Index by lowercased package name, for specs that name a library without a global variable. */
const BY_NAME = new Map(MOBILE_LIBRARIES.map((l) => [l.Name.toLowerCase(), l]));

/**
 * Finds the entry for a spec's library reference.
 *
 * Matches on `globalVariable` first because that is the binding the compiler emits — a spec asking
 * for `_` gets lodash regardless of how it spelled the package name.
 *
 * @param ref One entry from a spec's `libraries` array.
 */
export function FindMobileLibrary(ref: ComponentLibraryDependency): MobileLibraryEntry | undefined {
    return BY_GLOBAL.get(ref.globalVariable) ?? BY_NAME.get((ref.name ?? '').toLowerCase());
}

/**
 * Reduces an imported module to the single value a UMD bundle would have defined on `window`.
 *
 * Bundlers disagree about CommonJS interop — Metro and Node can each decide whether a package
 * surfaces as a namespace with a `default` or as the default alone — so the declared {@link
 * MobileLibraryShape} is the intent and the checks below are the tolerance. A `callable` entry whose
 * default is missing falls back to the namespace rather than handing the component `undefined`.
 *
 * @param module The imported module namespace.
 * @param shape The declared shape for this library.
 */
export function InteropModule(module: Record<string, unknown>, shape: MobileLibraryShape): unknown {
    const fallback = module.default;
    if (shape === 'callable') {
        return typeof fallback === 'function' ? fallback : module;
    }
    if (shape === 'object') {
        return fallback && typeof fallback === 'object' ? fallback : module;
    }
    // A namespace library has no default worth preferring — but if the bundler wrapped it in one
    // anyway, the namespace we were handed carries nothing except `default`, so unwrap it.
    const named = Object.keys(module).filter((k) => k !== 'default' && k !== '__esModule');
    return named.length > 0 ? module : (fallback ?? module);
}

/**
 * Every library declared anywhere in a spec's hierarchy, de-duplicated by global variable.
 *
 * `ComponentManager.loadHierarchy` compiles each component in the tree against *its own*
 * `spec.libraries`, so the root's declarations say nothing about what a child needs. Walking the
 * tree once up front means every compile in the hierarchy finds its bindings already loaded,
 * rather than the first child with an un-loaded library failing at render.
 *
 * Cycles cannot loop the walk: it tracks visited specs by identity, the same way
 * `ComponentManager` guards its own recursion.
 *
 * @param spec The root component spec.
 */
export function CollectHierarchyLibraries(
    spec: ComponentSpec | null | undefined,
): ComponentLibraryDependency[] {
    const out: ComponentLibraryDependency[] = [];
    const seen = new Set<string>();
    const visited = new Set<ComponentSpec>();

    const visit = (node: ComponentSpec | null | undefined): void => {
        if (!node || visited.has(node)) return;
        visited.add(node);
        for (const ref of node.libraries ?? []) {
            const key = ref.globalVariable || ref.name;
            if (!key || seen.has(key)) continue;
            seen.add(key);
            out.push(ref);
        }
        for (const dep of node.dependencies ?? []) {
            visit(dep);
        }
    };

    visit(spec);
    return out;
}

/** What a spec's declared libraries resolved to. */
export type LibraryResolution = {
    /** Global variable → library value, ready to merge into `RuntimeContext.libraries`. */
    Libraries: Record<string, unknown>;
    /** Declared libraries this app cannot provide, as `"name (reason)"` phrases. */
    Missing: string[];
};

/** Cache of already-imported libraries — a library is evaluated at most once per process. */
const loaded = new Map<string, unknown>();

/**
 * Publishes libraries onto the global object under their declared global variable names.
 *
 * ## Why this is required, not optional
 *
 * Filling `RuntimeContext.libraries` alone is not enough, and the reason is a scoping detail of the
 * generated factory. The compiler emits `const _ = libraries['_']` **inside**
 * `DestructureWrapperUserComponent`, but it splices the component's own source in one scope out,
 * next to `createComponent`. So the binding the compiler creates is not in scope for the function
 * that needs it: a component body referencing `_` resolves it as a free variable.
 *
 * On the web that free variable resolves, because `LibraryLoader` got there first — every library is
 * a UMD bundle loaded through a `<script>` tag, and a UMD bundle's entire job is to define
 * `window._`. The component is not reading the runtime's map; it is reading the global the script
 * tag defined. `RuntimeContext.libraries` is the *same value* handed to the runtime separately.
 *
 * Mobile has no script tag, so it has to perform the other half of what one does. Assigning to
 * `globalThis` here is not a shim around the runtime — it is the same act the browser performs, in
 * the module system Hermes actually has.
 *
 * Existing globals are never overwritten, mirroring `LibraryLoader`'s own `if (!window.React)`
 * guard: whatever already owns a name has a better claim to it than a library does.
 *
 * @param libraries Global variable → library value.
 */
export function PublishLibraryGlobals(libraries: Record<string, unknown>): void {
    for (const [globalVariable, value] of Object.entries(libraries)) {
        if (globalVariable in globalThis) continue;
        Object.defineProperty(globalThis, globalVariable, {
            value,
            writable: true,
            configurable: true,
            // Not enumerable: a library global is infrastructure, and code that walks the global
            // object (RN's own dev tooling does) should not have to step over thirteen of them.
            enumerable: false,
        });
    }
}

/**
 * Describes a library mobile cannot supply, preferring the specific reason when one is known.
 *
 * @param ref The unsatisfiable library reference.
 */
function DescribeMissing(ref: ComponentLibraryDependency): string {
    const reason = DESKTOP_ONLY[ref.globalVariable];
    return reason ? `${ref.name} (${reason})` : ref.name;
}

/**
 * Resolves a spec's declared libraries into the map the runtime context expects.
 *
 * Partial by design: a component declaring five libraries where four are providable still gets
 * those four, and {@link LibraryResolution.Missing} names the fifth. The caller decides whether a
 * partial set is worth rendering — {@link AssessSpec} declines before it gets this far, so in
 * practice `Missing` being non-empty means a library was added to a spec that this app has not
 * caught up with.
 *
 * An import that throws is reported as missing rather than propagated: one broken library should
 * cost the component that library, not the whole screen.
 *
 * @param refs The spec's `libraries` array.
 */
export async function ResolveMobileLibraries(
    refs: readonly ComponentLibraryDependency[] | undefined,
): Promise<LibraryResolution> {
    const result: LibraryResolution = { Libraries: {}, Missing: [] };
    if (!refs || refs.length === 0) return result;

    for (const ref of refs) {
        const entry = FindMobileLibrary(ref);
        if (!entry) {
            result.Missing.push(DescribeMissing(ref));
            continue;
        }

        const cached = loaded.get(entry.GlobalVariable);
        if (cached !== undefined) {
            result.Libraries[entry.GlobalVariable] = cached;
            continue;
        }

        try {
            const value = InteropModule(await entry.Import(), entry.Shape);
            loaded.set(entry.GlobalVariable, value);
            result.Libraries[entry.GlobalVariable] = value;
        } catch {
            result.Missing.push(`${entry.Name} (failed to load on this device)`);
        }
    }

    return result;
}
