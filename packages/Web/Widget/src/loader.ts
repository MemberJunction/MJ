/**
 * @fileoverview The embed loader. Reads `data-widget-key` / `data-api-url` from the
 * host page (the mount div or the script tag), mints a guest session, mounts the
 * `<mj-support-widget>` element, registers the runtime notification adapter scoped to
 * the widget, and schedules token refresh. This is the single entry point the
 * `mj-widget.js` bundle auto-runs.
 *
 * @module @memberjunction/web-widget
 */

import type { WidgetMountOptions, WidgetSession } from './types.js';
import { WidgetSessionClient } from './session/widget-session-client.js';
import { readVisitorKey, writeVisitorKey, clearVisitorKey } from './session/visitor-key-cookie.js';
import type { IWidgetTransport } from './transport/widget-transport.js';
import type { IVoiceController } from './voice/voice-controller.js';
import { DEFAULT_VOICE_LIMITS, type VoiceAbuseLimits } from './voice/voice-abuse-guard.js';
import { SupportWidgetElement, defineSupportWidgetElement, WIDGET_TAG_NAME } from './ui/support-widget-element.js';

/** Optional injection points so the loader is unit-testable without a network/runtime. */
export interface WidgetMountDeps {
    /** Builds the session client (defaults to the real fetch-based one). */
    sessionClientFactory?: (apiUrl: string, widgetKey: string) => WidgetSessionClient;
    /** Builds the transport (defaults to RuntimeWidgetTransport; tests inject a mock). May be async (the default lazy-loads). */
    transportFactory?: (apiUrl: string) => IWidgetTransport | Promise<IWidgetTransport>;
    /** Builds the voice controller for voice-enabled instances (defaults to RealtimeVoiceController). May be async (the default lazy-loads). */
    voiceControllerFactory?: (session: WidgetSession) => IVoiceController | Promise<IVoiceController>;
    /** Schedules refresh (defaults to setTimeout); tests can stub. */
    scheduler?: (cb: () => void, delayMs: number) => void;
}

/**
 * Mints a guest session and mounts a configured widget element. Returns the element.
 */
export async function mountWidget(options: WidgetMountOptions, deps: WidgetMountDeps = {}): Promise<SupportWidgetElement> {
    defineSupportWidgetElement();

    const client = (deps.sessionClientFactory ?? defaultSessionClient)(options.apiUrl, options.widgetKey);

    // Returning-visitor anchor (RV1): present the durable cookie (if any) so the server can chain this
    // visit to the visitor's prior conversation. Gated server-side on the widget's RememberReturningVisitors
    // toggle — when off, the server returns no visitorKey and we set no cookie below.
    const presentedVisitorKey = readVisitorKey(options.widgetKey);
    const session = await client.Mint(presentedVisitorKey);
    if (session.rememberReturningVisitors && session.visitorKey) {
        writeVisitorKey(options.widgetKey, session.visitorKey);
    }

    const transport = await (deps.transportFactory ?? defaultTransport)(options.apiUrl);
    await transport.Initialize(session);

    const element = document.createElement(WIDGET_TAG_NAME) as SupportWidgetElement;
    element.Configure({ title: options.title, greeting: options.greeting });
    element.SetSession(session);
    element.SetTransport(transport);

    if (session.modality === 'Voice' || session.modality === 'Both') {
        element.SetVoiceController(await (deps.voiceControllerFactory ?? defaultVoiceController)(session));
    }

    // RV5 "forget me": only wired when the widget remembers returning visitors and a durable key exists.
    // Archives the visitor's server-side memory, then clears the first-party cookie so no linkage remains.
    if (session.rememberReturningVisitors && session.visitorKey) {
        const visitorKey = session.visitorKey;
        element.SetForgetHandler(async () => {
            const result = await client.Forget(visitorKey);
            if (!result.success) {
                throw new Error(result.error ?? 'forget failed');
            }
            clearVisitorKey(options.widgetKey);
        });
    }

    resolveMountTarget(options.mountTarget).appendChild(element);
    registerNotificationAdapter(element);
    scheduleRefresh(client, transport, element, session, deps.scheduler ?? defaultScheduler);
    return element;
}

/** Reads data-attributes from the host and mounts. Safe to call once on script load. */
export async function bootstrapFromDocument(doc: Document = document): Promise<SupportWidgetElement | null> {
    const mountEl = doc.querySelector<HTMLElement>('[data-widget-key]');
    const widgetKey = mountEl?.dataset.widgetKey;
    const apiUrl = mountEl?.dataset.apiUrl;
    if (!mountEl || !widgetKey || !apiUrl) {
        // Nothing to mount — the host hasn't placed a configured element. Not an error.
        return null;
    }
    return mountWidget({
        widgetKey,
        apiUrl,
        mountTarget: mountEl,
        title: mountEl.dataset.title,
        greeting: mountEl.dataset.greeting,
    });
}

function defaultSessionClient(apiUrl: string, widgetKey: string): WidgetSessionClient {
    return new WidgetSessionClient(apiUrl, widgetKey);
}

/**
 * Default transport. DYNAMIC import (CLAUDE rule 8, category 3 — bundle-size deferral): the runtime
 * transport pulls in `@memberjunction/graphql-dataprovider` + `@memberjunction/conversations-runtime`
 * (the heaviest dependency in the bundle). Loading it on demand keeps it OUT of the embed entry chunk
 * so the launcher button paints before the runtime is fetched. Declared in `dependencies`.
 */
async function defaultTransport(apiUrl: string): Promise<IWidgetTransport> {
    const { RuntimeWidgetTransport } = await import('./transport/runtime-widget-transport.js');
    return new RuntimeWidgetTransport(apiUrl);
}

/**
 * Default voice controller. DYNAMIC import (CLAUDE rule 8, category 3): the realtime controller pulls
 * in `@memberjunction/ai-realtime-client` + provider drivers, needed ONLY for Voice/Both widgets — so
 * a text-only widget never pays for the voice chunk. Declared in `dependencies`.
 */
async function defaultVoiceController(session: WidgetSession): Promise<IVoiceController> {
    const [{ RealtimeVoiceController }, { createGuestVoiceMint }, { createGuestToolRelay }] = await Promise.all([
        import('./voice/realtime-voice-controller.js'),
        import('./voice/guest-voice-mint.js'),
        import('./voice/guest-tool-relay.js'),
    ]);
    return new RealtimeVoiceController(
        createGuestVoiceMint(session),
        voiceLimitsForSession(session),
        // Phase 2: the interactive channels this widget may attach (Whiteboard, …) + the live relay for
        // non-channel tool calls. Empty enabledChannels (the default) leaves voice behavior unchanged.
        session.enabledChannels,
        createGuestToolRelay(),
    );
}

/**
 * Derives the client-side voice ceilings from the widget instance's configured
 * VoiceMaxSessionMinutes (surfaced on the minted session). When the deployment sets no
 * per-widget cap, the guard's built-in defaults apply. This is defense-in-depth — the
 * authoritative cap is enforced server-side at the realtime mint (the ephemeral session's
 * bounded TTL), so a tampered client cannot exceed the deployment's limit.
 */
function voiceLimitsForSession(session: WidgetSession): VoiceAbuseLimits | undefined {
    if (session.voiceMaxSessionMinutes && session.voiceMaxSessionMinutes > 0) {
        return { ...DEFAULT_VOICE_LIMITS, maxSessionMinutes: session.voiceMaxSessionMinutes };
    }
    return undefined;
}

function defaultScheduler(cb: () => void, delayMs: number): void {
    setTimeout(cb, delayMs);
}

/** Resolves a selector/element/undefined to the mount parent (falls back to <body>). */
function resolveMountTarget(target: WidgetMountOptions['mountTarget']): HTMLElement {
    if (target instanceof HTMLElement) return target;
    if (typeof target === 'string') {
        const found = document.querySelector<HTMLElement>(target);
        if (found) return found;
    }
    return document.body;
}

/**
 * Routes runtime warnings/errors into the widget transcript as system lines. DYNAMIC import
 * (CLAUDE rule 8, category 3): `ConversationsRuntime` is part of the heavy runtime chunk; importing
 * it here (rather than statically at module top) keeps it out of the embed entry chunk. Fire-and-forget
 * — adapter registration is best-effort and must not block the mount. Declared in `dependencies`.
 */
function registerNotificationAdapter(element: SupportWidgetElement): void {
    void import('@memberjunction/conversations-runtime').then(({ ConversationsRuntime }) => {
        ConversationsRuntime.Instance.UseNotificationAdapter({
            Notify: (level, message) => {
                if (level === 'error' || level === 'warning') {
                    element.ShowSystemMessage(message);
                }
            },
        });
    });
}

/** Refreshes the guest token shortly before expiry and re-arms the timer. */
function scheduleRefresh(
    client: WidgetSessionClient,
    transport: IWidgetTransport,
    element: SupportWidgetElement,
    session: WidgetSession,
    scheduler: (cb: () => void, delayMs: number) => void,
): void {
    const delay = WidgetSessionClient.MsUntilRefresh(session, Date.now());
    scheduler(() => {
        void (async () => {
            try {
                const refreshed = await client.Refresh(session.visitorKey);
                transport.UpdateToken(refreshed.token);
                scheduleRefresh(client, transport, element, refreshed, scheduler);
            } catch {
                // A failed refresh leaves the current (soon-to-expire) token. Surface the
                // connection-lost banner so the visitor can retry the refresh; on success
                // the banner clears and the refresh timer re-arms (graceful degradation, W6).
                element.ShowConnectionError('Connection to support was lost.', () =>
                    scheduleRefresh(client, transport, element, session, scheduler),
                );
            }
        })();
    }, delay);
}
