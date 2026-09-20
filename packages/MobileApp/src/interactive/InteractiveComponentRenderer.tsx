/**
 * @fileoverview Renders an interactive component artifact natively.
 *
 * On mount it lazily initializes the react-runtime (see `runtime-loader.ts`),
 * compiles the spec and its child components through `ComponentManager.loadHierarchy` — the same
 * call the Angular react bridge makes — builds the prop bag those children are handed through, and
 * renders the compiled root inside a runtime error boundary.
 * Every step is wrapped so that any failure — a Hermes eval restriction in a
 * release build, a compile error, a thrown render — degrades gracefully to the
 * {@link DesktopFallback} card instead of crashing the artifact screen.
 */

import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import type { ComponentProps as RuntimeComponentProps, ComponentSpec } from '@memberjunction/react-runtime';
import { Icons } from '@/components/Icon';
import { Colors, Radius, Spacing, Type } from '@/theme/tokens';
import { GetInteractiveRuntime } from './runtime-loader';
import { ShimReact } from './react-native-shim';

/** A compiled interactive component: a React component over the runtime prop bag. */
type CompiledComponent = React.ComponentType<RuntimeComponentProps>;

/** An error-boundary component produced by the runtime's `createErrorBoundary`. */
type BoundaryComponent = React.ComponentType<{ children?: React.ReactNode }>;

/** Internal load state for the async compile pipeline. */
type LoadState =
    | { status: 'loading' }
    | { status: 'ready'; Compiled: CompiledComponent; Boundary: BoundaryComponent; props: RuntimeComponentProps }
    | { status: 'failed'; reason: string };

/**
 * Render an interactive component artifact.
 *
 * @param props.spec The parsed, mobile-safe component spec (see `AssessSpec`).
 */
export function InteractiveComponentRenderer({ spec }: { spec: ComponentSpec }): React.ReactElement {
    const state = useCompiledComponent(spec);

    if (state.status === 'loading') {
        return (
            <View style={styles.center}>
                <ActivityIndicator color={Colors.brand} />
            </View>
        );
    }
    if (state.status === 'failed') {
        return <DesktopFallback reason={state.reason} />;
    }

    const { Compiled, Boundary, props } = state;
    return (
        <Boundary>
            <Compiled {...props} />
        </Boundary>
    );
}

/**
 * Hook that drives the async compile pipeline and returns the current
 * {@link LoadState}. Isolated from the view so the render path stays declarative.
 */
function useCompiledComponent(spec: ComponentSpec): LoadState {
    const [state, setState] = useState<LoadState>({ status: 'loading' });

    useEffect(() => {
        let active = true;
        void compileSpec(spec).then((next) => {
            if (active) {
                setState(next);
            }
        });
        return () => {
            active = false;
        };
    }, [spec]);

    return state;
}

/**
 * Load the runtime, compile the hierarchy, and assemble props + error boundary.
 *
 * ## Deliberately the same call `MJReactComponent` makes
 *
 * The Angular bridge's `loadComponentWithManager()` calls
 * `manager.loadHierarchy(spec, { contextUser, defaultNamespace: 'Global', defaultVersion, returnType: 'both' })`
 * and keeps `result.components` to pass as the `components` prop. This does the same, with the same
 * option values, because that call is what defines how a hierarchy is resolved: the version key it
 * derives, the registry entries it creates, the flat descendant map it returns. Reimplementing any
 * of it — walking `spec.dependencies` here and compiling each child with `loadComponent` — would
 * produce a second answer to a question the runtime already answers, and the two surfaces would
 * drift the first time the runtime's resolution rules changed.
 *
 * `defaultVersion` comes from the runtime's own `generateComponentHierarchyHash`, which the Angular
 * bridge now also delegates to, so both hosts register an unversioned spec under the same key.
 *
 * Any thrown error is caught and reported as a `failed` state.
 */
async function compileSpec(spec: ComponentSpec): Promise<LoadState> {
    try {
        const runtime = await GetInteractiveRuntime();

        // Libraries first, for the WHOLE hierarchy: the compiler emits `const _ = libraries['_']`
        // at the top of each component's factory, so a library that arrives after that component
        // compiles is a library it never sees. `AssessSpec` has already declined anything
        // unprovidable, so a non-empty `missing` here means a spec declared something this build
        // doesn't know about — report it rather than rendering undefined bindings.
        const missing = await runtime.EnsureLibraries(spec);
        if (missing.length > 0) {
            return { status: 'failed', reason: `This component needs ${missing.join(', ')}.` };
        }

        const result = await runtime.manager.loadHierarchy(spec, {
            defaultNamespace: 'Global',
            defaultVersion: spec.version || runtime.generateComponentHierarchyHash(spec),
            returnType: 'both',
        });

        const compiled = UnwrapRootComponent(result.rootComponent);
        if (!result.success || !compiled) {
            return { status: 'failed', reason: describeErrors(result.errors) };
        }

        // `components` is the flat map of every loaded descendant, already unwrapped to plain React
        // components by `loadHierarchy`. The compiler's generated child bindings read it off
        // `props.components`, so a component whose children are missing from this prop renders
        // `undefined` where its children should be.
        const props = {
            ...runtime.buildComponentProps({}, {}, {}, buildCallbacks(), result.components ?? {}, undefined),
            // Passed alongside, exactly as the Angular bridge does, for components that read
            // `libraries.d3` rather than the bare global.
            libraries: runtime.Libraries,
        };

        const Boundary = runtime.createErrorBoundary(ShimReact, {
            fallback: <DesktopFallback reason="This interactive component ran into an error on mobile." />,
        }) as BoundaryComponent;
        return { status: 'ready', Compiled: compiled, Boundary, props };
    } catch {
        return { status: 'failed', reason: 'This interactive component could not be loaded on mobile.' };
    }
}

/**
 * Narrows `loadHierarchy`'s root result to a React component.
 *
 * The root comes back as a `ComponentObject` wrapper — `{ component, print, refresh, … }` — whereas
 * the descendants in `result.components` are already unwrapped. `MJReactComponent` reads
 * `.component` off the root for the same reason. Tolerant of a bare function in case a future
 * runtime version unwraps both.
 *
 * @param root The hierarchy result's root component.
 */
function UnwrapRootComponent(root: unknown): CompiledComponent | null {
    if (typeof root === 'function') return root as CompiledComponent;
    if (root && typeof root === 'object' && 'component' in root) {
        const inner = (root as { component?: unknown }).component;
        if (typeof inner === 'function') return inner as CompiledComponent;
    }
    return null;
}

/** Summarize runtime load errors into a single user-facing line. */
function describeErrors(errors: { componentName?: string; message: string }[] | undefined): string {
    if (errors && errors.length > 0) {
        const first = errors[0];
        // Name the component: in a hierarchy, "X failed" and "its child Y failed" are very
        // different problems and the message is the only thing that distinguishes them.
        return first.componentName ? `${first.componentName}: ${first.message}` : first.message;
    }
    return 'This interactive component could not be compiled on mobile.';
}

/**
 * Build the RN-safe callbacks handed to the component. `OpenEntityRecord`
 * navigates to the native record screen; `CreateSimpleNotification` logs for now
 * (a native toast is a later enhancement); `RegisterMethod` is a no-op since the
 * host doesn't yet invoke component methods on mobile.
 */
function buildCallbacks(): Parameters<InteractiveRuntimeBuildProps>[3] {
    return {
        OpenEntityRecord: (entityName, key) => {
            const id = key.GetValueByIndex(0);
            router.push({ pathname: '/explorer/record/[id]', params: { id: String(id ?? ''), entity: entityName } });
        },
        CreateSimpleNotification: (message, style) => {
            console.log(`[interactive:${style}] ${message}`);
        },
        RegisterMethod: () => {},
    };
}

/** Alias to derive the exact `buildComponentProps` callbacks parameter type. */
type InteractiveRuntimeBuildProps = Awaited<ReturnType<typeof GetInteractiveRuntime>>['buildComponentProps'];

/**
 * Fallback card shown when a component can't or shouldn't render on-device.
 * Matches the muted, single-card treatment used elsewhere in the artifact view.
 *
 * @param props.reason Optional explanation appended under the headline.
 */
export function DesktopFallback({ reason }: { reason?: string }): React.ReactElement {
    return (
        <View style={styles.card}>
            <Icons.Sparkle size={22} color={Colors.brand} strokeWidth={2} />
            <Text style={styles.title}>Best viewed on desktop</Text>
            <Text style={styles.body}>{reason ?? 'This interactive component is best viewed on desktop.'}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    center: { paddingVertical: Spacing.xxxl, alignItems: 'center', justifyContent: 'center' },
    card: {
        backgroundColor: Colors.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: Colors.line2,
        borderRadius: Radius.lg,
        padding: Spacing.xl,
        alignItems: 'center',
        gap: Spacing.sm,
    },
    title: { fontSize: Type.bodyLarge, fontWeight: Type.semibold, color: Colors.ink },
    body: { fontSize: Type.small, color: Colors.ink3, textAlign: 'center', lineHeight: 18 },
});
