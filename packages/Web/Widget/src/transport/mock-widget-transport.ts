/**
 * @fileoverview An in-memory transport used by unit tests and the offline example
 * page. It echoes a canned support reply so the widget UI can be exercised without a
 * live MJAPI. NOT used in production (the loader wires RuntimeWidgetTransport).
 *
 * @module @memberjunction/web-widget
 */

import type { WidgetSession } from '../types.js';
import type { IWidgetTransport, WidgetProgressCallback, WidgetTurnResult } from './widget-transport.js';

/** Deterministic, dependency-free transport for tests + the demo host page. */
export class MockWidgetTransport implements IWidgetTransport {
    public LastExplicitAgentId: string | null = null;
    public SentMessages: string[] = [];
    private session?: WidgetSession;
    private replyFor: (text: string) => string;

    constructor(replyFor?: (text: string) => string) {
        this.replyFor = replyFor ?? ((t) => `Thanks for your message: "${t}". A support agent will follow up.`);
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
        onProgress?.('Thinking…', 50);
        return { reply: this.replyFor(text), success: true };
    }

    public async Dispose(): Promise<void> {
        this.session = undefined;
    }
}
