/**
 * @fileoverview Tests for MessageInputComponent's streamed final-response render
 * branch (createMessageProgressCallback). The service accumulates deltas and
 * delivers full-text-so-far via `progress.streaming`; the component assigns it to
 * the bubble and announces it on MessageStreamed at most once per animation frame,
 * keeps the tasks dropdown on a stable status, skips the plain-progress and
 * TaskOrchestrator formatting, and stays silent once the message has settled.
 * Instantiated via the prototype (no constructor/TestBed) with only the members
 * the callback touches stubbed — same style as the runtime's ConversationStreaming
 * tests. The frame scheduler is stubbed so each test decides when a frame fires.
 */
import '@angular/compiler'; // JIT support — the component import evaluates Angular decorators in vitest's node env
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MessageInputComponent } from '../lib/components/message/message-input.component';
import type { MessageProgressUpdate } from '@memberjunction/conversations-runtime';

interface CallbackHarness {
    component: MessageInputComponent;
    message: { ID: string; Status: string; Message: string };
    /** MessageSent emissions — new/status-changed messages only, never streamed deltas. */
    sent: unknown[];
    /** MessageStreamed emissions — one per fired frame. */
    streamed: unknown[];
    taskStatuses: string[];
    completionTimestamps: Map<string, number>;
    registeredCallbacks: Map<string, unknown>;
    invoke: (progress: MessageProgressUpdate) => Promise<void>;
    /** Fires every frame scheduled so far, in order. */
    flushFrames: () => void;
    pendingFrames: () => number;
}

function buildHarness(messageStatus = 'In-Progress', streamedObserved = true): CallbackHarness {
    const message = { ID: 'detail-1', Status: messageStatus, Message: '' };
    const sent: unknown[] = [];
    const streamed: unknown[] = [];
    const taskStatuses: string[] = [];
    const frames: Array<() => void> = [];
    const completionTimestamps = new Map<string, number>();
    const registeredCallbacks = new Map<string, unknown>([['detail-1', () => undefined]]);
    const messageSentStub = { emit: (m: unknown) => sent.push(m) };
    const component = Object.create(MessageInputComponent.prototype) as MessageInputComponent;
    Object.assign(component as unknown as Record<string, unknown>, {
        dataCache: { getConversationDetail: vi.fn(async () => message) },
        currentUser: undefined,
        completionTimestamps,
        registeredCallbacks,
        // One emitter under both names, as the component itself declares it: the deprecated
        // `messageSent` @Output IS the `MessageSent` EventEmitter, and only the canonical name is
        // ever emitted on. Object.create skips the field initialisers, so both are wired here.
        MessageSent: messageSentStub,
        messageSent: messageSentStub,
        MessageStreamed: { emit: (m: unknown) => streamed.push(m), observed: streamedObserved },
        scheduleFrame: (callback: () => void) => frames.push(callback),
        activeTasks: {
            updateStatusByConversationDetailId: (_id: string, status: string) => taskStatuses.push(status),
        },
    });
    const create = (
        component as unknown as {
            createMessageProgressCallback(id: string): (p: MessageProgressUpdate) => Promise<void>;
        }
    ).createMessageProgressCallback.bind(component);
    const flushFrames = () => {
        const due = frames.splice(0, frames.length);
        due.forEach((frame) => frame());
    };
    return {
        component,
        message,
        sent,
        streamed,
        taskStatuses,
        completionTimestamps,
        registeredCallbacks,
        invoke: create('detail-1'),
        flushFrames,
        pendingFrames: () => frames.length,
    };
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

    it('assigns the accumulated text to the bubble and announces it once the frame fires', async () => {
        const h = buildHarness();
        await h.invoke(streamingUpdate('Hello wor'));
        expect(h.message.Message).toBe('Hello wor');
        expect(h.streamed).toHaveLength(0); // nothing until the frame
        h.flushFrames();
        expect(h.streamed).toEqual([h.message]);
        expect(h.sent).toHaveLength(0); // a streamed delta is not a MessageSent
    });

    it('coalesces every delta inside one frame into a single emission carrying the latest text', async () => {
        const h = buildHarness();
        await h.invoke(streamingUpdate('Hel'));
        await h.invoke(streamingUpdate('Hello'));
        await h.invoke(streamingUpdate('Hello world'));
        expect(h.pendingFrames()).toBe(1);
        h.flushFrames();
        expect(h.streamed).toHaveLength(1);
        expect(h.message.Message).toBe('Hello world');
    });

    it('schedules a fresh frame for deltas that arrive after the previous one fired', async () => {
        const h = buildHarness();
        await h.invoke(streamingUpdate('one'));
        h.flushFrames();
        await h.invoke(streamingUpdate('one two'));
        expect(h.pendingFrames()).toBe(1);
        h.flushFrames();
        expect(h.streamed).toHaveLength(2);
    });

    it('keeps the tasks dropdown on a stable status, once per frame, instead of the growing reply text', async () => {
        const h = buildHarness();
        await h.invoke(streamingUpdate('a long partial reply...'));
        await h.invoke(streamingUpdate('a long partial reply... continued'));
        expect(h.taskStatuses).toEqual(['Responding…']);
    });

    it('falls back to MessageSent for a host that does not observe MessageStreamed', async () => {
        const h = buildHarness('In-Progress', false);
        await h.invoke(streamingUpdate('Hello'));
        h.flushFrames();
        expect(h.streamed).toHaveLength(0);
        expect(h.sent).toEqual([h.message]);
    });

    it('emits nothing from a frame that fires after the message settled', async () => {
        const h = buildHarness();
        await h.invoke(streamingUpdate('almost done'));
        h.message.Status = 'Complete';
        h.flushFrames();
        expect(h.streamed).toHaveLength(0);
    });

    it('emits nothing from a frame that fires after completion was recorded for the message', async () => {
        const h = buildHarness();
        await h.invoke(streamingUpdate('almost done'));
        h.completionTimestamps.set('detail-1', Date.now());
        h.flushFrames();
        expect(h.streamed).toHaveLength(0);
    });

    it('emits nothing from a frame that fires after the callback was unregistered (a frame that slept through completion)', async () => {
        const h = buildHarness();
        await h.invoke(streamingUpdate('almost done'));
        h.registeredCallbacks.delete('detail-1'); // markMessageComplete drops the registration
        h.flushFrames();
        expect(h.streamed).toHaveLength(0);
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
        expect(h.sent).toHaveLength(1); // plain progress still announces on MessageSent
        expect(h.streamed).toHaveLength(0);
        expect(h.taskStatuses).toEqual(['Analyzing response…']); // pre-existing behavior unchanged
    });

    it('ignores streamed updates once the message is complete (race guard)', async () => {
        const h = buildHarness('Complete');
        await h.invoke(streamingUpdate('late chunk'));
        expect(h.message.Message).toBe('');
        expect(h.pendingFrames()).toBe(0);
        expect(h.streamed).toHaveLength(0);
    });
});
