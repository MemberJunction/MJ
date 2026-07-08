/**
 * @fileoverview Renders an interactive component artifact natively.
 *
 * On mount it lazily initializes the react-runtime (see `runtime-loader.ts`),
 * compiles the spec through `ComponentManager.loadComponent`, builds RN-safe
 * props, and renders the compiled component inside a runtime error boundary.
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
import { getInteractiveRuntime } from './runtime-loader';
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
 * @param props.spec The parsed, mobile-safe component spec (see `assessSpec`).
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
 * Load the runtime, compile the spec, and assemble props + error boundary.
 * Any thrown error is caught and reported as a `failed` state.
 */
async function compileSpec(spec: ComponentSpec): Promise<LoadState> {
    try {
        const runtime = await getInteractiveRuntime();
        const result = await runtime.manager.loadComponent(spec);
        const compiled = result.component?.component;
        if (!result.success || typeof compiled !== 'function') {
            return { status: 'failed', reason: describeErrors(result.errors) };
        }
        const Compiled = compiled as CompiledComponent;
        const props = runtime.buildComponentProps({}, {}, {}, buildCallbacks(), {}, undefined);
        const Boundary = runtime.createErrorBoundary(ShimReact, {
            fallback: <DesktopFallback reason="This interactive component ran into an error on mobile." />,
        }) as BoundaryComponent;
        return { status: 'ready', Compiled, Boundary, props };
    } catch {
        return { status: 'failed', reason: 'This interactive component could not be loaded on mobile.' };
    }
}

/** Summarize runtime load errors into a single user-facing line. */
function describeErrors(errors: { message: string }[] | undefined): string {
    if (errors && errors.length > 0) {
        return errors[0].message;
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
type InteractiveRuntimeBuildProps = Awaited<ReturnType<typeof getInteractiveRuntime>>['buildComponentProps'];

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
