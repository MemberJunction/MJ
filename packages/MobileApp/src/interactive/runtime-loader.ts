/**
 * @fileoverview Lazy, memoized initializer for the interactive-component runtime.
 *
 * The react-runtime + `@babel/standalone` pair is ~3 MB and is only needed the
 * first time a user opens an interactive artifact. Loading it eagerly would tax
 * every cold start of the app, so it's deferred behind a dynamic import and the
 * resulting promise is memoized — Babel is initialized at most once per process.
 *
 * ## The libraries seam
 *
 * `RuntimeContext.libraries` is what the compiler destructures a component's declared libraries
 * out of (`const _ = libraries['_']`), and it is the same field `AngularReactAdapterService` fills
 * from `LibraryLoader`'s CDN loads. The web can fill it once up front because it preloads every
 * approved library into `window`; mobile imports from the bundle instead and only pays for what a
 * component asks for, so the map is filled incrementally by {@link InteractiveRuntime.EnsureLibraries}
 * before each compile.
 *
 * Incremental filling is safe because the object identity never changes: the compiler reads
 * `context.libraries` when it *invokes* the factory, not when the runtime is created, so a key
 * added before `loadHierarchy` is visible to every component in the tree that needed it.
 */

import type { ComponentSpec } from '@memberjunction/react-runtime';
import { ShimReact } from './react-native-shim';
import { CollectHierarchyLibraries, PublishLibraryGlobals, ResolveMobileLibraries } from './library-registry';

/**
 * Static type view of the react-runtime module. `typeof import(...)` is a
 * compile-time-only construct: it yields the module's types without emitting a
 * runtime import, so the heavy package stays out of the eager bundle graph.
 */
type RuntimeModule = typeof import('@memberjunction/react-runtime');

/** The component manager instance produced by `createReactRuntime`. */
type ComponentManager = ReturnType<RuntimeModule['createReactRuntime']>['manager'];

/** The initialized runtime surface the renderer needs. */
export interface InteractiveRuntime {
    /** Compiles + registers component specs and returns executable components. */
    manager: ComponentManager;
    /** Builds the standard `{ data, callbacks, utilities, styles, … }` prop bag. */
    buildComponentProps: RuntimeModule['buildComponentProps'];
    /** Wraps a compiled component in a React error boundary. */
    createErrorBoundary: RuntimeModule['createErrorBoundary'];
    /**
     * Builds the `utilities` prop — `md`, `rv`, `rq`, `ai`, `geoDataEngine`, `ml`.
     *
     * The same factory `MJReactComponent` calls. It resolves through `MJGlobal.ClassFactory`, so a
     * host that registers a subclass gets its own; mobile registers none and gets the base.
     */
    createRuntimeUtilities: RuntimeModule['createRuntimeUtilities'];
    /**
     * Derives the registry version key for a spec that carries no explicit `version`.
     *
     * Re-exposed from the runtime rather than reimplemented here: `MJReactComponent` passes the
     * result of this same function as `defaultVersion`, and two hosts that disagree about a
     * component's version register two copies of it.
     */
    generateComponentHierarchyHash: RuntimeModule['generateComponentHierarchyHash'];
    /**
     * Loads the libraries declared anywhere in a spec's hierarchy into the shared runtime context.
     *
     * Call before `manager.loadHierarchy`. Returns the libraries this app could not supply, so the
     * caller can say which one forced a fallback.
     *
     * @param spec The root spec about to be compiled.
     */
    EnsureLibraries: (spec: ComponentSpec) => Promise<string[]>;
    /**
     * The live libraries map handed to components as the `libraries` prop.
     *
     * `MJReactComponent` reads `runtimeContext.libraries` and passes it straight through as a prop
     * alongside `components`; a component is free to read `libraries.d3` instead of the bare `d3`
     * global, and several do. Exposed rather than rebuilt so the prop and the compiler's bindings
     * can never disagree about what is loaded.
     */
    Libraries: Record<string, unknown>;
}

/** Memoized initialization promise — created on first call, reused thereafter. */
let runtimePromise: Promise<InteractiveRuntime> | null = null;

/**
 * Dynamically import the runtime + Babel and wire them together with `ShimReact`
 * as the runtime context React.
 *
 * The dynamic `import()`s here are a deliberate exception to the static-import
 * rule (CLAUDE.md rule 8, category 3 — genuine bundle-size/startup deferral):
 * both packages are heavy and only reached on the interactive-artifact code
 * path. They remain declared in `dependencies` so the dep graph stays honest.
 */
async function initializeRuntime(): Promise<InteractiveRuntime> {
    const runtime = await import('@memberjunction/react-runtime');
    const babelModule = await import('@babel/standalone');
    const babel = babelModule.default ?? babelModule;

    // One map, filled over time. `createReactRuntime` captures the context object by reference, so
    // every later compile sees whatever has been loaded into it by then.
    const libraries: Record<string, unknown> = {};
    const instance = runtime.createReactRuntime(babel, undefined, { React: ShimReact, libraries });

    return {
        manager: instance.manager,
        buildComponentProps: runtime.buildComponentProps,
        createErrorBoundary: runtime.createErrorBoundary,
        generateComponentHierarchyHash: runtime.generateComponentHierarchyHash,
        createRuntimeUtilities: runtime.createRuntimeUtilities,
        Libraries: libraries,
        EnsureLibraries: async (spec: ComponentSpec): Promise<string[]> => {
            // The whole hierarchy, not just the root: `loadHierarchy` compiles each child against
            // ITS OWN declared libraries, so a child using d3 while its parent uses lodash needs
            // both loaded before any of them compile.
            const resolved = await ResolveMobileLibraries(CollectHierarchyLibraries(spec));
            // Both halves of what a UMD `<script>` tag does on the web: the runtime gets its map,
            // and the component body gets the global it actually reads. See
            // `PublishLibraryGlobals` for why the map alone is not enough.
            Object.assign(libraries, resolved.Libraries);
            PublishLibraryGlobals(resolved.Libraries);
            return resolved.Missing;
        },
    };
}

/**
 * Get the initialized interactive-component runtime, loading it on first use.
 *
 * @returns A promise resolving to the shared {@link InteractiveRuntime}. The
 *   same promise is returned on every call, so the 3 MB Babel bundle is fetched
 *   and initialized only once.
 */
export function GetInteractiveRuntime(): Promise<InteractiveRuntime> {
    if (!runtimePromise) {
        runtimePromise = initializeRuntime();
    }
    return runtimePromise;
}
