/**
 * @fileoverview The embed loader. Reads `data-widget-key` / `data-api-url` from the
 * host page (the mount div or the script tag), mints a guest session, mounts the
 * `<mj-support-widget>` element, registers the runtime notification adapter scoped to
 * the widget, and schedules token refresh. This is the single entry point the
 * `mj-widget.js` bundle auto-runs.
 *
 * @module @memberjunction/web-widget
 */

import { ConversationsRuntime } from '@memberjunction/conversations-runtime';
import type { WidgetMountOptions, WidgetSession } from './types.js';
import { WidgetSessionClient } from './session/widget-session-client.js';
import type { IWidgetTransport } from './transport/widget-transport.js';
import { RuntimeWidgetTransport } from './transport/runtime-widget-transport.js';
import { SupportWidgetElement, defineSupportWidgetElement, WIDGET_TAG_NAME } from './ui/support-widget-element.js';

/** Optional injection points so the loader is unit-testable without a network/runtime. */
export interface WidgetMountDeps {
    /** Builds the session client (defaults to the real fetch-based one). */
    sessionClientFactory?: (apiUrl: string, widgetKey: string) => WidgetSessionClient;
    /** Builds the transport (defaults to RuntimeWidgetTransport; tests inject a mock). */
    transportFactory?: (apiUrl: string) => IWidgetTransport;
    /** Schedules refresh (defaults to setTimeout); tests can stub. */
    scheduler?: (cb: () => void, delayMs: number) => void;
}

/**
 * Mints a guest session and mounts a configured widget element. Returns the element.
 */
export async function mountWidget(options: WidgetMountOptions, deps: WidgetMountDeps = {}): Promise<SupportWidgetElement> {
    defineSupportWidgetElement();

    const client = (deps.sessionClientFactory ?? defaultSessionClient)(options.apiUrl, options.widgetKey);
    const session = await client.Mint();

    const transport = (deps.transportFactory ?? defaultTransport)(options.apiUrl);
    await transport.Initialize(session);

    const element = document.createElement(WIDGET_TAG_NAME) as SupportWidgetElement;
    element.Configure({ title: options.title, greeting: options.greeting });
    element.SetSession(session);
    element.SetTransport(transport);

    resolveMountTarget(options.mountTarget).appendChild(element);
    registerNotificationAdapter(element);
    scheduleRefresh(client, transport, session, deps.scheduler ?? defaultScheduler);
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

function defaultTransport(apiUrl: string): IWidgetTransport {
    return new RuntimeWidgetTransport(apiUrl);
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

/** Routes runtime warnings/errors into the widget transcript as system lines. */
function registerNotificationAdapter(element: SupportWidgetElement): void {
    ConversationsRuntime.Instance.UseNotificationAdapter({
        Notify: (level, message) => {
            if (level === 'error' || level === 'warning') {
                element.ShowSystemMessage(message);
            }
        },
    });
}

/** Refreshes the guest token shortly before expiry and re-arms the timer. */
function scheduleRefresh(
    client: WidgetSessionClient,
    transport: IWidgetTransport,
    session: WidgetSession,
    scheduler: (cb: () => void, delayMs: number) => void,
): void {
    const delay = WidgetSessionClient.MsUntilRefresh(session, Date.now());
    scheduler(() => {
        void (async () => {
            try {
                const refreshed = await client.Refresh();
                transport.UpdateToken(refreshed.token);
                scheduleRefresh(client, transport, refreshed, scheduler);
            } catch {
                // A failed refresh leaves the current (soon-to-expire) token; the next
                // send will surface an auth error the visitor can retry from.
            }
        })();
    }, delay);
}
