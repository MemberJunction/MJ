/**
 * @fileoverview Tests for the Before/After cancelable chat event arg classes.
 *
 * Asserts:
 *   - CancellableChatEventArgs base class default: Cancel = false.
 *   - Each Before* class extends CancellableChatEventArgs and carries its
 *     readonly payload fields.
 *   - Each After* class carries its payload as readonly fields.
 *   - Listeners can set Cancel = true on Before events.
 *
 * Pure logic — no Angular runtime needed. Vitest-ready.
 */

import { describe, it, expect } from 'vitest';

import {
    CancellableChatEventArgs,
    BeforeAgentTurnEventArgs,
    AfterAgentTurnEventArgs,
    BeforeToolInvokedEventArgs,
    AfterToolInvokedEventArgs,
    BeforeResponseFormSubmittedEventArgs,
    AfterResponseFormSubmittedEventArgs,
    SessionStartedEventArgs,
    SessionChannelStateChangedEventArgs,
    SessionEndedEventArgs,
} from '../lib/events/chat-events';

describe('CancellableChatEventArgs (base class)', () => {
    it('defaults Cancel to false', () => {
        const e = new CancellableChatEventArgs();
        expect(e.Cancel).toBe(false);
    });

    it('lets listeners flip Cancel to true', () => {
        const e = new CancellableChatEventArgs();
        e.Cancel = true;
        e.CancelReason = 'rate-limited';
        expect(e.Cancel).toBe(true);
        expect(e.CancelReason).toBe('rate-limited');
    });
});

describe('BeforeAgentTurnEventArgs', () => {
    it('extends CancellableChatEventArgs and carries its payload', () => {
        const e = new BeforeAgentTurnEventArgs('conv-1', 'hello', 'app-1');
        expect(e).toBeInstanceOf(CancellableChatEventArgs);
        expect(e.ConversationId).toBe('conv-1');
        expect(e.MessageText).toBe('hello');
        expect(e.ApplicationId).toBe('app-1');
        expect(e.Cancel).toBe(false);
    });

    it('applicationId defaults to null when omitted', () => {
        const e = new BeforeAgentTurnEventArgs('conv-1', 'hello');
        expect(e.ApplicationId).toBeNull();
    });
});

describe('AfterAgentTurnEventArgs', () => {
    it('carries its payload as readonly fields', () => {
        const result = { success: true, executionTimeMs: 100 } as never;
        const e = new AfterAgentTurnEventArgs('conv-1', 'run-1', result);
        expect(e.ConversationId).toBe('conv-1');
        expect(e.AgentRunId).toBe('run-1');
        expect(e.Result).toBe(result);
    });
});

describe('BeforeToolInvokedEventArgs', () => {
    it('extends CancellableChatEventArgs and carries tool name + args', () => {
        const e = new BeforeToolInvokedEventArgs('NavigateToRecord', { id: '1' });
        expect(e).toBeInstanceOf(CancellableChatEventArgs);
        expect(e.ToolName).toBe('NavigateToRecord');
        expect(e.Args).toEqual({ id: '1' });
    });
});

describe('AfterToolInvokedEventArgs', () => {
    it('carries tool name + args + result', () => {
        const e = new AfterToolInvokedEventArgs('NavigateToRecord', { id: '1' }, { ok: true });
        expect(e.ToolName).toBe('NavigateToRecord');
        expect(e.Args).toEqual({ id: '1' });
        expect(e.Result).toEqual({ ok: true });
    });
});

describe('BeforeResponseFormSubmittedEventArgs', () => {
    it('extends CancellableChatEventArgs and carries form id + values', () => {
        const e = new BeforeResponseFormSubmittedEventArgs('form-1', { q1: 'yes' });
        expect(e).toBeInstanceOf(CancellableChatEventArgs);
        expect(e.FormId).toBe('form-1');
        expect(e.Values).toEqual({ q1: 'yes' });
    });
});

describe('AfterResponseFormSubmittedEventArgs', () => {
    it('carries form id + values as readonly fields', () => {
        const e = new AfterResponseFormSubmittedEventArgs('form-1', { q1: 'yes' });
        expect(e.FormId).toBe('form-1');
        expect(e.Values).toEqual({ q1: 'yes' });
    });
});

describe('Session* informational events', () => {
    it('SessionStartedEventArgs carries session id + channel kinds', () => {
        const e = new SessionStartedEventArgs('sess-1', ['text', 'voice']);
        expect(e.SessionId).toBe('sess-1');
        expect(e.ChannelKinds).toEqual(['text', 'voice']);
    });

    it('SessionChannelStateChangedEventArgs carries session id + channel kind + state', () => {
        const e = new SessionChannelStateChangedEventArgs('sess-1', 'voice', 'open');
        expect(e.SessionId).toBe('sess-1');
        expect(e.ChannelKind).toBe('voice');
        expect(e.State).toBe('open');
    });

    it('SessionEndedEventArgs carries session id + narrowed reason', () => {
        const e = new SessionEndedEventArgs('sess-1', 'explicit');
        expect(e.SessionId).toBe('sess-1');
        expect(e.Reason).toBe('explicit');
    });

    it('SessionEndedEventArgs accepts all narrowed reason values', () => {
        // Compile-time check: the narrowed union should permit exactly these three.
        const explicit = new SessionEndedEventArgs('sess-1', 'explicit');
        const error = new SessionEndedEventArgs('sess-1', 'error');
        const unknown = new SessionEndedEventArgs('sess-1', 'unknown');
        expect(explicit.Reason).toBe('explicit');
        expect(error.Reason).toBe('error');
        expect(unknown.Reason).toBe('unknown');
    });
});
