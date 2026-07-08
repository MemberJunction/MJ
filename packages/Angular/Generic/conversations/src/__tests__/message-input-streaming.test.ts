/**
 * @fileoverview Tests for MessageInputComponent's streamed final-response render
 * branch (createMessageProgressCallback). The service accumulates deltas and
 * delivers full-text-so-far via `progress.streaming`; the component must assign
 * it to the bubble, emit for UI refresh, keep the tasks dropdown on a stable
 * status, and skip the plain-progress/TaskOrchestrator formatting. Instantiated
 * via the prototype (no constructor/TestBed) with only the members the callback
 * touches stubbed — same style as the runtime's ConversationStreaming tests.
 */
import '@angular/compiler'; // JIT support — the component import evaluates Angular decorators in vitest's node env
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { MessageInputComponent } from '../lib/components/message/message-input.component';
import type { MessageProgressUpdate } from '@memberjunction/conversations-runtime';

interface CallbackHarness {
    component: MessageInputComponent;
    message: { ID: string; Status: string; Message: string };
    emitted: unknown[];
    taskStatuses: string[];
    invoke: (progress: MessageProgressUpdate) => Promise<void>;
}

function buildHarness(messageStatus = 'In-Progress'): CallbackHarness {
    const message = { ID: 'detail-1', Status: messageStatus, Message: '' };
    const emitted: unknown[] = [];
    const taskStatuses: string[] = [];

    const component = Object.create(MessageInputComponent.prototype) as MessageInputComponent;
    Object.assign(component as unknown as Record<string, unknown>, {
        dataCache: { getConversationDetail: vi.fn(async () => message) },
        currentUser: undefined,
        completionTimestamps: new Map<string, number>(),
        messageSent: { emit: (m: unknown) => emitted.push(m) },
        activeTasks: {
            updateStatusByConversationDetailId: (_id: string, status: string) => taskStatuses.push(status),
        },
    });

    const create = (
        component as unknown as {
            createMessageProgressCallback(id: string): (p: MessageProgressUpdate) => Promise<void>;
        }
    ).createMessageProgressCallback.bind(component);

    return { component, message, emitted, taskStatuses, invoke: create('detail-1') };
}

function streamingUpdate(content: string, isPartial = true): MessageProgressUpdate {
    return {
        message: content,
        conversationDetailId: 'detail-1',
        resolver: 'RunAIAgentResolver',
        streaming: { content, isPartial, kind: 'final-response' },
    };
}

describe('MessageInputComponent streamed final-response rendering', () => {
    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => undefined);
    });

    it('assigns the accumulated text to the bubble and emits a UI refresh', async () => {
        const h = buildHarness();

        await h.invoke(streamingUpdate('Hello wor'));
        expect(h.message.Message).toBe('Hello wor');
        expect(h.emitted).toHaveLength(1);

        await h.invoke(streamingUpdate('Hello world'));
        expect(h.message.Message).toBe('Hello world');
        expect(h.emitted).toHaveLength(2);
    });

    it('keeps the tasks dropdown on a stable status instead of the growing reply text', async () => {
        const h = buildHarness();

        await h.invoke(streamingUpdate('a long partial reply...'));

        expect(h.taskStatuses).toEqual(['Responding…']);
    });

    it('does not apply TaskOrchestrator step formatting to streamed content', async () => {
        const h = buildHarness();

        const update = streamingUpdate('streamed text');
        update.resolver = 'TaskOrchestrator';
        update.stepCount = 3;
        await h.invoke(update);

        expect(h.message.Message).toBe('streamed text'); // no "**Step 3**" prefix
    });

    it('still routes plain progress updates through the existing path', async () => {
        const h = buildHarness();

        await h.invoke({
            message: 'Analyzing response…',
            conversationDetailId: 'detail-1',
            resolver: 'RunAIAgentResolver',
        });

        expect(h.message.Message).toBe('Analyzing response…');
        expect(h.taskStatuses).toEqual(['Analyzing response…']); // pre-existing behavior unchanged
    });

    it('ignores streamed updates once the message is complete (race guard)', async () => {
        const h = buildHarness('Complete');

        await h.invoke(streamingUpdate('late chunk'));

        expect(h.message.Message).toBe('');
        expect(h.emitted).toHaveLength(0);
    });
});
