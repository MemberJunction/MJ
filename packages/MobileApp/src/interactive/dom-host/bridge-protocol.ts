/**
 * @fileoverview The message protocol between the native app and the DOM host page.
 *
 * ## Why there is a protocol at all
 *
 * A component rendered in the DOM host runs inside a WebView, which has a real `document`, a real
 * `<canvas>`, and none of this app's session. It cannot call `RunView` — it has no provider, no
 * token, and no business holding one. So the component contract is split across the boundary:
 * rendering happens in the page, and everything that touches MemberJunction is proxied back to the
 * native side, which already owns exactly one authenticated provider.
 *
 * That split is also the security boundary. The page never receives a credential; it receives
 * answers to specific, named requests. A compromised or misbehaving component can ask for data the
 * signed-in user could already read, and nothing more.
 *
 * ## Why the shapes live in their own module
 *
 * Both sides of a bridge drifting apart is the classic failure, and it fails at runtime, in a
 * WebView, where it is hard to see. Declaring the messages once — consumed by the page builder and
 * by the native handler — means a change that breaks one side fails to compile on the other.
 */

/**
 * Methods the page may invoke on the native side, spelled as `namespace.Method`.
 *
 * These are the members of `ComponentUtilities` that survive a JSON boundary — parameters in, a
 * serialisable result out. The two that do not are called out in {@link UNPROXYABLE_UTILITIES}.
 */
export type BridgeMethod =
    | 'rv.RunView'
    | 'rv.RunViews'
    | 'rq.RunQuery'
    | 'md.Entities'
    | 'ai.ExecutePrompt'
    | 'ai.EmbedText'
    | 'ml.listModels'
    | 'ml.score'
    | 'search.Search'
    | 'search.PreviewSearch';

/**
 * Parts of `ComponentUtilities` a DOM-hosted component cannot reach, and why.
 *
 * Two return *live objects with methods* — a `BaseEntity` you then call `Save()` on, and a vector
 * service holding in-memory state. The third is worse: `ResolvePointToLocation` is **synchronous**,
 * and a bridge can only answer asynchronously, so a proxy would hand back a Promise and a component
 * reading `.country` off it would get `undefined` and draw a map with no labels.
 *
 * In every case a lookalike that silently did nothing would be worse than absence: the contract
 * already says a component must cope with an absent capability, and absence is detectable.
 *
 * A natively-rendered component still gets both. This is a real difference between the two
 * renderers rather than a limitation of the platform, and the fix — proxying each object's methods
 * individually — is worth doing deliberately, not inferring.
 */
export const UNPROXYABLE_UTILITIES: Readonly<Record<string, string>> = {
    'md.GetEntityObject': 'returns a live BaseEntity whose methods cannot cross the bridge',
    'ai.VectorService': 'holds in-memory state that cannot cross the bridge',
    'geoDataEngine': 'ResolvePointToLocation is synchronous; a bridge can only answer asynchronously',
};

/** Callbacks the page raises that the native host acts on. */
export type BridgeCallback =
    | 'OpenEntityRecord'
    | 'CreateSimpleNotification'
    | 'NotifyEvent'
    | 'SaveUserSettings';

/** Native → page: everything the component needs to mount. */
export type InitMessage = {
    Type: 'init';
    /** The component spec, already resolved as far as the native side could take it. */
    Spec: unknown;
    /** Library definitions to load, in the registry's own shape (name, globalVariable, CDN URLs). */
    Libraries: DomHostLibrary[];
    /** The theme-resolved `ComponentStyles` the native renderer would have passed. */
    Styles: unknown;
    /** This user's saved settings for the component. */
    SavedUserSettings: Record<string, unknown>;
};

/** Native → page: the result of an earlier {@link RpcMessage}. */
export type RpcResultMessage = {
    Type: 'rpc-result';
    /** Correlates with the originating request. */
    ID: string;
    /** The resolved value, when `Error` is absent. */
    Value?: unknown;
    /** A failure message; the page rejects the pending promise with it. */
    Error?: string;
};

/** Page → native: a data request the page cannot serve itself. */
export type RpcMessage = {
    Type: 'rpc';
    ID: string;
    Method: BridgeMethod;
    Args: unknown[];
};

/** Page → native: a component callback. */
export type CallbackMessage = {
    Type: 'callback';
    Name: BridgeCallback;
    Args: unknown[];
};

/** Page → native: the page is mounted and has rendered. */
export type ReadyMessage = { Type: 'ready' };

/** Page → native: the rendered content's height, so the native container can size to it. */
export type HeightMessage = { Type: 'height'; Pixels: number };

/** Page → native: something failed in a way the page could not recover from. */
export type HostErrorMessage = { Type: 'error'; Message: string };

/** Anything the page may send. */
export type PageMessage = RpcMessage | CallbackMessage | ReadyMessage | HeightMessage | HostErrorMessage;

/** Anything the native side may send. */
export type NativeMessage = InitMessage | RpcResultMessage;

/** A library the page should load, as the component registry describes it. */
export type DomHostLibrary = {
    /** Package name, e.g. `chart.js`. */
    Name: string;
    /** The global the UMD bundle defines, e.g. `Chart`. */
    GlobalVariable: string;
    /** Script URL. */
    CdnUrl: string;
    /** Optional stylesheet the library needs to render correctly. */
    CdnCssUrl?: string | null;
};

/**
 * Parses a raw message from the page.
 *
 * Returns `null` rather than throwing for anything unrecognised: a WebView emits messages this app
 * did not send — injected scripts, devtools, third-party library chatter — and one of those must
 * never take down the screen hosting it.
 *
 * @param raw The `event.nativeEvent.data` string.
 */
export function ParsePageMessage(raw: string | null | undefined): PageMessage | null {
    if (!raw) return null;
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return null;
    }
    if (!parsed || typeof parsed !== 'object') return null;

    const msg = parsed as { Type?: unknown };
    switch (msg.Type) {
        case 'ready':
            return { Type: 'ready' };
        case 'height': {
            const px = (parsed as { Pixels?: unknown }).Pixels;
            return typeof px === 'number' && Number.isFinite(px) && px > 0
                ? { Type: 'height', Pixels: px }
                : null;
        }
        case 'error': {
            const m = (parsed as { Message?: unknown }).Message;
            return { Type: 'error', Message: typeof m === 'string' ? m : 'The component failed to render.' };
        }
        case 'rpc': {
            const { ID, Method, Args } = parsed as { ID?: unknown; Method?: unknown; Args?: unknown };
            if (typeof ID !== 'string' || typeof Method !== 'string') return null;
            return { Type: 'rpc', ID, Method: Method as BridgeMethod, Args: Array.isArray(Args) ? Args : [] };
        }
        case 'callback': {
            const { Name, Args } = parsed as { Name?: unknown; Args?: unknown };
            if (typeof Name !== 'string') return null;
            return { Type: 'callback', Name: Name as BridgeCallback, Args: Array.isArray(Args) ? Args : [] };
        }
        default:
            return null;
    }
}

/**
 * Serialises a native message for injection into the page.
 *
 * Emitted as a `window.__mjReceive(...)` call rather than `postMessage`, because the page needs to
 * receive this identically on both platforms and RN's `injectJavaScript` is the one path that
 * behaves the same on each.
 *
 * @param message The message to deliver.
 */
export function SerializeNativeMessage(message: NativeMessage): string {
    // JSON.stringify twice: once to encode the payload, once to produce a JavaScript string literal
    // that survives injection without any escaping of its own. Without it a component whose data
    // contains a quote or a newline breaks the injected statement.
    return `window.__mjReceive(${JSON.stringify(JSON.stringify(message))}); true;`;
}
