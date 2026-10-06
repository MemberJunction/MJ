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

import { useCallback, useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Metadata } from '@memberjunction/core';
import { resolveEntityRecordKey } from '@memberjunction/react-runtime';
import type { ComponentProps as RuntimeComponentProps, ComponentSpec } from '@memberjunction/react-runtime';
import { Icons } from '@/components/Icon';
import { Colors, Radius, Spacing, Type } from '@/theme/tokens';
import { GetInteractiveRuntime } from './runtime-loader';
import { ShimReact } from './react-native-shim';
import { BuildMobileComponentStyles } from './component-styles';
import { BuildSaveUserSettings, LoadUserSettings } from './user-settings';
import { ResolveHierarchy } from './hierarchy-resolver';
import { CapturedData, WrapUtilitiesWithCapture } from './captured-data';
import { CapturedDataFallback } from './CapturedDataFallback';

/** A message a component raised through `callbacks.CreateSimpleNotification`. */
type ComponentNotice = { Message: string; Style: string };

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
    const [notice, setNotice] = useState<ComponentNotice | null>(null);

    // Held in a ref so the callback handed to the component is stable across renders. A new
    // callbacks object would change the prop identity on every notification, and components key
    // effects off `callbacks` — a self-retriggering render loop is the usual result.
    const notify = useRef((message: string, style: string) => {
        setNotice({ Message: message, Style: style });
    }).current;

    const dismiss = useCallback(() => setNotice(null), []);
    const state = useCompiledComponent(spec, notify);

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
        <View>
            {notice ? <ComponentNoticeBanner Notice={notice} OnDismiss={dismiss} /> : null}
            <Boundary>
                <Compiled {...props} />
            </Boundary>
        </View>
    );
}

/**
 * Renders a `CreateSimpleNotification` message.
 *
 * The web routes these to MJ's notification service. This app has no toast layer, and inventing a
 * global one for a single caller would be the wrong shape — so the message appears above the
 * component that raised it, which is also where the reader is looking. Dismissed by tap rather
 * than by timer: a component reporting a failed save should not have it disappear unread.
 */
function ComponentNoticeBanner({ Notice, OnDismiss }: { Notice: ComponentNotice; OnDismiss: () => void }) {
    const tone = NOTICE_TONES[Notice.Style] ?? NOTICE_TONES.info;
    return (
        <Pressable
            style={[styles.notice, { backgroundColor: tone.Background, borderColor: tone.Border }]}
            accessibilityRole="button"
            accessibilityLabel={`Dismiss notification: ${Notice.Message}`}
            onPress={OnDismiss}
        >
            <Text style={[styles.noticeText, { color: tone.Text }]}>{Notice.Message}</Text>
            <Icons.X size={15} color={tone.Text} strokeWidth={2} />
        </Pressable>
    );
}

/** Colour families for the notification styles the component contract defines. */
const NOTICE_TONES: Readonly<Record<string, { Background: string; Border: string; Text: string }>> = {
    success: { Background: '#ecfdf5', Border: '#a7f3d0', Text: '#065f46' },
    error: { Background: '#fef2f2', Border: '#fecaca', Text: '#991b1b' },
    warning: { Background: '#fffbeb', Border: '#fde68a', Text: '#92400e' },
    info: { Background: Colors.brandSoft, Border: Colors.line2, Text: Colors.ink },
    none: { Background: Colors.surface2, Border: Colors.line2, Text: Colors.ink2 },
};

/**
 * Hook that drives the async compile pipeline and returns the current
 * {@link LoadState}. Isolated from the view so the render path stays declarative.
 */
function useCompiledComponent(spec: ComponentSpec, notify: (message: string, style: string) => void): LoadState {
    const [state, setState] = useState<LoadState>({ status: 'loading' });

    useEffect(() => {
        let active = true;
        void compileSpec(spec, notify).then((next) => {
            if (active) {
                setState(next);
            }
        });
        return () => {
            active = false;
        };
    }, [spec, notify]);

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
async function compileSpec(
    spec: ComponentSpec,
    notify: (message: string, style: string) => void,
): Promise<LoadState> {
    try {
        const runtime = await GetInteractiveRuntime();

        // Resolve registry-backed children first. A spec routinely names its children instead of
        // carrying their code, and those children declare libraries of their own that are invisible
        // until the registry is read — see `hierarchy-resolver.ts` for why that has to happen
        // before anything compiles.
        const user = Metadata.Provider?.CurrentUser;
        const hierarchy = await ResolveHierarchy(spec, user);

        // Libraries for the WHOLE resolved hierarchy: the compiler emits `const _ = libraries['_']`
        // at the top of each component's factory, so a library that arrives after that component
        // compiles is a library it never sees. `AssessSpec` screened the spec's own libraries; this
        // is the first point at which the children's are knowable.
        const missing = await runtime.EnsureLibraries(spec, hierarchy.Libraries);
        if (missing.length > 0) {
            return { status: 'failed', reason: `This component needs ${missing.join(', ')}.` };
        }

        const result = await runtime.Manager.loadHierarchy(spec, {
            defaultNamespace: 'Global',
            defaultVersion: spec.version || runtime.GenerateComponentHierarchyHash(spec),
            returnType: 'both',
        });

        const compiled = UnwrapRootComponent(result.rootComponent);
        if (!result.success || !compiled) {
            // Name the parts that could not be obtained when that is what went wrong — "DataGrid
            // could not be loaded" is actionable in a way that a compiler message is not.
            if (hierarchy.Unresolved.length > 0) {
                return {
                    status: 'failed',
                    reason: `This component is built from parts that couldn't be loaded: ${hierarchy.Unresolved.join(', ')}.`,
                };
            }
            return { status: 'failed', reason: describeErrors(result.errors) };
        }

        // The rest of the prop bag `MJReactComponent` assembles, built the same way.
        //
        // `utilities` is the data surface — `rv.RunView`, `rq.RunQuery`, `md`, `ai`, `ml` — and it
        // comes from the runtime's `createRuntimeUtilities`, the same factory the Angular bridge
        // calls, so a component's query behaves identically on both. It was `{}` here, which meant
        // any component with data requirements had nothing to fetch with.
        const savedUserSettings = await LoadUserSettings(spec, user);

        // Recorded as the component fetches, so a crash mid-render can still show the rows it
        // already had rather than a dead card. See `captured-data.ts`.
        const captured = new CapturedData();

        const props = {
            // `components` is the flat map of every loaded descendant, already unwrapped to plain
            // React components by `loadHierarchy`. The compiler's generated child bindings read it
            // off `props.components`, so a component whose children are missing from this prop
            // renders `undefined` where its children should be.
            ...runtime.BuildComponentProps(
                {},
                savedUserSettings,
                WrapUtilitiesWithCapture(
                    runtime.CreateRuntimeUtilities().buildUtilities(false, Metadata.Provider),
                    captured,
                ),
                buildCallbacks(notify),
                result.components ?? {},
                BuildMobileComponentStyles(spec),
            ),
            // Passed alongside, exactly as the Angular bridge does, for components that read
            // `libraries.d3` rather than the bare global.
            libraries: runtime.Libraries,
            savedUserSettings,
            onSaveUserSettings: BuildSaveUserSettings(spec, user, savedUserSettings),
        };

        const Boundary = runtime.CreateErrorBoundary(ShimReact, {
            // The fallback is resolved when it renders, not when the boundary is built — by which
            // point the component has usually finished fetching, so the captured rows are there.
            fallback: <ComponentErrorFallback Captured={captured} />,
            // Matches the bridge: log the error, and offer a retry rather than leaving the reader
            // on a dead card after a transient failure.
            logErrors: true,
            recovery: 'retry',
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
 * Build the callbacks handed to the component — the full set `MJReactComponent` provides.
 *
 * `OpenEntityRecord` resolves the key through the runtime's `resolveEntityRecordKey` before
 * navigating. That matters more than it looks: a component routinely knows a record by something
 * that is not its primary key — an email, a code — because that is what its query returned, and the
 * previous implementation read `key.GetValueByIndex(0)` and navigated to whatever came out. The
 * shared resolver coerces the three shapes a component may pass and runs the lookup when the field
 * is not a primary key, so both hosts open the same record.
 *
 * `RegisterMethod` stays a no-op: the compiler's wrapper registers methods into its own registry,
 * and this host does not yet invoke them. Same as the bridge, whose implementation is also a
 * placeholder comment.
 */
function buildCallbacks(notify: (message: string, style: string) => void): Parameters<InteractiveRuntimeBuildProps>[3] {
    return {
        OpenEntityRecord: async (entityName, key) => {
            const provider = Metadata.Provider;
            if (!provider) return;
            const resolved = await resolveEntityRecordKey(entityName, key, provider);
            if (!resolved) return;
            // The record screen addresses a record by a single id, which is what MJ core entities
            // use; a composite key is carried as its URL segment so the screen can read it back.
            router.push({
                pathname: '/explorer/record/[id]',
                params: { id: resolved.ToCompactURLSegment(), entity: entityName },
            });
        },
        CreateSimpleNotification: (message, style) => {
            notify(message, style ?? 'info');
        },
        NotifyEvent: async () => {
            // The bridge re-emits these as an Angular output for a host container to handle. This
            // app has no such container yet, so the event is accepted and dropped rather than
            // throwing — a component that fires one must not break because nobody is listening.
        },
        RegisterMethod: () => {},
    };
}

/** Alias to derive the exact `buildComponentProps` callbacks parameter type. */
type InteractiveRuntimeBuildProps = Awaited<ReturnType<typeof GetInteractiveRuntime>>['BuildComponentProps'];

/**
 * What a failed component shows: its data when it got that far, an explanation when it did not.
 *
 * Read at render time rather than captured when the boundary is built — a component typically
 * throws after its data has arrived, so deciding earlier would always decide "no data".
 *
 * @param props.Captured The recorder the component's utilities were writing to.
 */
function ComponentErrorFallback({ Captured }: { Captured: CapturedData }): React.ReactElement {
    if (Captured.HasData) {
        return <CapturedDataFallback Tables={Captured.ToTables()} />;
    }
    return <DesktopFallback reason="This interactive component ran into an error on mobile." />;
}

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
    notice: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: Spacing.sm,
        marginBottom: Spacing.md,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: Radius.lg,
    },
    noticeText: { flex: 1, fontSize: Type.small, lineHeight: 19 },
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
