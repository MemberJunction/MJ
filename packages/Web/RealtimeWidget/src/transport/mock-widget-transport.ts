/**
 * @fileoverview An in-memory transport used by unit tests and the offline example
 * page. It echoes a canned support reply so the widget UI can be exercised without a
 * live MJAPI. NOT used in production (the loader wires RuntimeWidgetTransport).
 *
 * @module @memberjunction/realtime-widget
 */

import type { WidgetSession } from '../types.js';
import type { IWidgetTransport, WidgetProgressCallback, WidgetTurnResult } from './widget-transport.js';

/** Deterministic, dependency-free transport for tests + the demo host page. */
export class MockWidgetTransport implements IWidgetTransport {
    public LastExplicitAgentId: string | null = null;
    public SentMessages: string[] = [];
    private session?: WidgetSession;
    private replyFor: (text: string) => string;
    /** When set, the NEXT SendMessage fails with this error (one-shot) — exercises the offline banner. */
    private failNextError: string | null = null;

    constructor(replyFor?: (text: string) => string) {
        this.replyFor = replyFor ?? ((t) => `Thanks for your message: "${t}". A support agent will follow up.`);
    }

    /** Arms a one-shot failure on the next SendMessage (test helper for graceful-degradation paths). */
    public FailNextSend(error: string): void {
        this.failNextError = error;
    }

    public async Initialize(session: WidgetSession): Promise<void> {
        this.session = session;
    }

    public UpdateToken(_token: string): void {
        /* no-op for the mock */
    }

    public async SendMessage(text: string, onProgress?: WidgetProgressCallback): Promise<WidgetTurnResult> {
        this.LastExplicitAgentId = this.session?.pinnedAgentId ?? null;
        this.SentMessages.push(text);
        if (this.failNextError) {
            const error = this.failNextError;
            this.failNextError = null; // one-shot: a retry succeeds
            return { reply: '', success: false, error };
        }
        onProgress?.('Thinking…', 50);
        return { reply: this.replyFor(text), success: true };
    }

    public async Dispose(): Promise<void> {
        this.session = undefined;
    }
}
