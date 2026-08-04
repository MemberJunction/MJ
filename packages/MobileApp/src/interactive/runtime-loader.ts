/**
 * @fileoverview Lazy, memoized initializer for the interactive-component runtime.
 *
 * The react-runtime + `@babel/standalone` pair is ~3 MB and is only needed the
 * first time a user opens an interactive artifact. Loading it eagerly would tax
 * every cold start of the app, so it's deferred behind a dynamic import and the
 * resulting promise is memoized — Babel is initialized at most once per process.
 */

import { ShimReact } from './react-native-shim';

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

    const instance = runtime.createReactRuntime(babel, undefined, { React: ShimReact });

    return {
        manager: instance.manager,
        buildComponentProps: runtime.buildComponentProps,
        createErrorBoundary: runtime.createErrorBoundary,
    };
}

/**
 * Get the initialized interactive-component runtime, loading it on first use.
 *
 * @returns A promise resolving to the shared {@link InteractiveRuntime}. The
 *   same promise is returned on every call, so the 3 MB Babel bundle is fetched
 *   and initialized only once.
 */
export function getInteractiveRuntime(): Promise<InteractiveRuntime> {
    if (!runtimePromise) {
        runtimePromise = initializeRuntime();
    }
    return runtimePromise;
}
