import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { Metadata } from '@memberjunction/core';
import type { ComponentSpec } from '@memberjunction/react-runtime';
import { createRuntimeUtilities, resolveEntityRecordKey } from '@memberjunction/react-runtime';
import type { ComponentUtilities } from '@memberjunction/interactive-component-types';
import { router } from 'expo-router';
import { Colors, Radius, Spacing, Type } from '@/theme/tokens';
import { BuildHostPage } from './host-page';
import {
    ParsePageMessage,
    SerializeNativeMessage,
    type BridgeMethod,
    type DomHostLibrary,
    type InitMessage,
} from './bridge-protocol';

/**
 * @fileoverview The native half of the DOM host: a WebView plus the bridge that serves it.
 *
 * The page renders; this answers. Every MemberJunction call the component makes arrives here as a
 * named request and is executed against the app's own provider — the same `RunView` the native
 * renderer hands components directly. The WebView never holds a token, so a component cannot do
 * anything here that the signed-in user could not already do.
 *
 * Sizing is driven from the page. A chart decides its own height after its first paint, so the
 * container cannot know it up front; the page measures and reports, and this grows to match.
 */

/** What the host needs to mount a component. */
export type DomComponentHostProps = {
    /** The spec to render. */
    Spec: ComponentSpec;
    /** Library definitions from `MJ: Component Libraries`, for the globals the spec declares. */
    Libraries: DomHostLibrary[];
    /** Theme-resolved styles, matching what the native renderer passes. */
    Styles: unknown;
    /** This user's saved settings for the component. */
    SavedUserSettings: Record<string, unknown>;
    /** Called when the component saves settings, so the host persists them the usual way. */
    OnSaveUserSettings: (settings: Record<string, unknown>) => void;
    /** Called when the component raises a notification. */
    OnNotify: (message: string, style: string) => void;
};

/** Height used before the page reports its own — tall enough that a chart is not clipped on arrival. */
const INITIAL_HEIGHT = 260;

/** Upper bound on reported height, so a runaway layout cannot produce an unscrollable screen. */
const MAX_HEIGHT = 4000;

/**
 * The utilities object the native side serves bridge requests from.
 *
 * Built by the same `createRuntimeUtilities()` the natively-rendered path uses, so the two
 * renderers cannot diverge in what a component can do — a capability added there appears here
 * without anyone remembering to mirror it. Memoized because building it configures engines.
 */
let sharedUtilities: ComponentUtilities | null = null;

/** Lazily builds the shared utilities object. */
function Utilities(): ComponentUtilities {
    if (!sharedUtilities) {
        sharedUtilities = createRuntimeUtilities().buildUtilities(false, Metadata.Provider);
    }
    return sharedUtilities;
}

/**
 * Executes one bridged request against this app's provider.
 *
 * Dispatches onto the real `ComponentUtilities` rather than reimplementing each call. The method
 * list is closed on purpose: an open, `eval`-shaped bridge would let page content reach anything the
 * app can reach, so this resolves only the named members of the component contract, and an unknown
 * method is an error rather than a silent no-op.
 *
 * `md.Entities` is trimmed deliberately — the full `EntityInfo` graph is large and self-referential,
 * and a component asking for it wants to know what exists, not to traverse the model.
 *
 * @param method The requested call.
 * @param args Its arguments, as sent by the page.
 */
async function ServeRequest(method: BridgeMethod, args: unknown[]): Promise<unknown> {
    const u = Utilities();

    switch (method) {
        case 'rv.RunView':
            return u.rv.RunView(args[0] as Parameters<typeof u.rv.RunView>[0]);
        case 'rv.RunViews':
            return u.rv.RunViews(args[0] as Parameters<typeof u.rv.RunViews>[0]);
        case 'rq.RunQuery':
            return u.rq.RunQuery(args[0] as Parameters<typeof u.rq.RunQuery>[0]);

        case 'md.Entities':
            return (u.md.Entities ?? []).map((e) => ({
                Name: e.Name,
                SchemaName: e.SchemaName,
                BaseView: e.BaseView,
                Description: e.Description,
            }));

        case 'ai.ExecutePrompt':
            return Require(u.ai, 'ai').ExecutePrompt(args[0] as never);
        case 'ai.EmbedText':
            return Require(u.ai, 'ai').EmbedText(args[0] as never);

        case 'ml.listModels':
            return Require(u.ml, 'ml').listModels(args[0] as never);
        case 'ml.score':
            return Require(u.ml, 'ml').score(args[0] as string, args[1] as never, args[2] as never);

        case 'search.Search':
            return Require(u.search, 'search').Search(args[0] as never);
        case 'search.PreviewSearch':
            return Require(u.search, 'search').PreviewSearch(args[0] as string, args[1] as number | undefined);

        default:
            throw new Error(`Unsupported bridge method: ${String(method)}`);
    }
}

/**
 * Narrows an optional capability, failing with a message a component author can act on.
 *
 * The component contract says these may be absent, so a component should have a fallback — but when
 * it does not, "the ml capability is not available in this environment" beats a `TypeError` on
 * `undefined`.
 *
 * @param value The capability, if the host has one.
 * @param name Its name in `ComponentUtilities`.
 */
function Require<T>(value: T | undefined, name: string): T {
    if (!value) {
        throw new Error(`The ${name} capability is not available in this environment.`);
    }
    return value;
}

/**
 * Renders a component inside a real browser document.
 *
 * @param props See {@link DomComponentHostProps}.
 */
export function DomComponentHost({
    Spec,
    Libraries,
    Styles,
    SavedUserSettings,
    OnSaveUserSettings,
    OnNotify,
}: DomComponentHostProps): React.ReactElement {
    const webRef = useRef<WebView>(null);
    const [height, setHeight] = useState(INITIAL_HEIGHT);
    const [ready, setReady] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Built once per library set: rebuilding the HTML would reload the page and remount the
    // component, discarding whatever state the user had built up in it.
    const html = useMemo(() => BuildHostPage(Libraries), [Libraries]);

    /** Pushes a message into the page. */
    const post = useCallback((message: Parameters<typeof SerializeNativeMessage>[0]) => {
        webRef.current?.injectJavaScript(SerializeNativeMessage(message));
    }, []);

    /** Hands the page everything it needs, once the document has loaded. */
    const sendInit = useCallback(() => {
        const init: InitMessage = {
            Type: 'init',
            Spec: Spec as unknown,
            Libraries,
            Styles,
            SavedUserSettings,
        };
        post(init);
    }, [Spec, Libraries, Styles, SavedUserSettings, post]);

    const onMessage = useCallback(
        (event: WebViewMessageEvent) => {
            const message = ParsePageMessage(event.nativeEvent.data);
            if (!message) return;

            switch (message.Type) {
                case 'ready':
                    setReady(true);
                    return;

                case 'height':
                    setHeight(Math.min(Math.ceil(message.Pixels), MAX_HEIGHT));
                    return;

                case 'error':
                    // Reported, not fatal: the page draws the message itself and may still be
                    // showing a partially working component, so this only records it.
                    setError(message.Message);
                    setReady(true);
                    return;

                case 'rpc':
                    void ServeRequest(message.Method, message.Args)
                        .then((value) => post({ Type: 'rpc-result', ID: message.ID, Value: value }))
                        .catch((e: unknown) =>
                            post({
                                Type: 'rpc-result',
                                ID: message.ID,
                                Error: e instanceof Error ? e.message : String(e),
                            }),
                        );
                    return;

                case 'callback':
                    HandleCallback(message.Name, message.Args, OnSaveUserSettings, OnNotify);
                    return;
            }
        },
        [post, OnSaveUserSettings, OnNotify],
    );

    return (
        <View style={styles.wrap}>
            <WebView
                ref={webRef}
                // `baseUrl` gives the document an origin, without which iOS refuses the
                // cross-origin script loads the whole page depends on.
                source={{ html, baseUrl: 'https://localhost' }}
                originWhitelist={['*']}
                onLoadEnd={sendInit}
                onMessage={onMessage}
                style={[styles.web, { height }]}
                // The component is a panel in a scrolling native screen; its own scrolling would
                // trap the gesture and make the page under it feel stuck.
                scrollEnabled={false}
                nestedScrollEnabled={false}
                javaScriptEnabled
                domStorageEnabled
                // A component must not be able to navigate the host somewhere else.
                setSupportMultipleWindows={false}
                onShouldStartLoadWithRequest={(req) => req.url.startsWith('https://localhost')}
                // The document itself failing to load is the one case the page cannot report,
                // because the page never ran.
                onError={() => setError('This component could not be loaded. It needs a connection the first time it runs.')}
            />

            {!ready ? (
                <View style={styles.overlay} pointerEvents="none">
                    <ActivityIndicator color={Colors.brand} />
                    <Text style={styles.loadingText}>Rendering with desktop libraries…</Text>
                </View>
            ) : null}

            {/* Only when the page never came up: once it is running it renders its own message,
                and showing the same sentence twice reads as two separate failures. */}
            {error && !ready ? <Text style={styles.errorText}>{error}</Text> : null}
        </View>
    );
}

/**
 * Acts on a callback the component raised.
 *
 * `OpenEntityRecord` goes through the runtime's shared resolver, so a record opened from a
 * DOM-hosted component lands in the same place as one opened from a natively rendered one.
 */
function HandleCallback(
    name: string,
    args: unknown[],
    onSaveUserSettings: (settings: Record<string, unknown>) => void,
    onNotify: (message: string, style: string) => void,
): void {
    switch (name) {
        case 'OpenEntityRecord': {
            const entityName = String(args[0] ?? '');
            const provider = Metadata.Provider;
            if (!entityName || !provider) return;
            void resolveEntityRecordKey(entityName, args[1] as never, provider).then((resolved) => {
                if (!resolved) return;
                router.push({
                    pathname: '/explorer/record/[id]',
                    params: { id: resolved.ToCompactURLSegment(), entity: entityName },
                });
            });
            return;
        }
        case 'CreateSimpleNotification':
            onNotify(String(args[0] ?? ''), String(args[1] ?? 'info'));
            return;
        case 'SaveUserSettings':
            onSaveUserSettings((args[0] ?? {}) as Record<string, unknown>);
            return;
        case 'NotifyEvent':
            // Accepted and dropped, matching the native renderer: no host container listens yet.
            return;
    }
}

const styles = StyleSheet.create({
    wrap: { position: 'relative' },
    // Transparent so the native card colour shows through rather than a white block; the page
    // paints no background of its own for the same reason.
    web: { backgroundColor: 'transparent', width: '100%' },
    overlay: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center',
        justifyContent: 'center',
        gap: Spacing.sm,
    },
    loadingText: { fontSize: Type.small, color: Colors.ink3 },
    errorText: {
        marginTop: Spacing.sm,
        padding: Spacing.md,
        fontSize: Type.small,
        color: Colors.ink2,
        backgroundColor: Colors.surface2,
        borderRadius: Radius.lg,
    },
});
