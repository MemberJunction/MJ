/**
 * @fileoverview Tests for the Before/After cancelable event wiring.
 *
 * Covers the cancel semantics of `BeforeAgentTurnEventArgs` and
 * `BeforeResponseFormSubmittedEventArgs` — the contracts the wiring relies on.
 * The full Angular emit-then-react flow (subscribing on the EventEmitter and
 * having the synchronous cancel propagate through component event re-emit
 * bindings) is integration territory that needs TestBed + DOM, but the
 * per-event contract — "Cancel = false by default, flip to true halts the
 * default behavior, payload fields round-trip" — is what the firing code in
 * message-input + message-item actually depends on. Tested without Angular
 * instantiation here so it runs fast and stays decoupled from the framework.
 */

import { describe, it, expect } from 'vitest';

import {
    BeforeAgentTurnEventArgs,
    AfterAgentTurnEventArgs,
    BeforeResponseFormSubmittedEventArgs,
    AfterResponseFormSubmittedEventArgs,
} from '../lib/events/chat-events';

describe('Before/After event wiring contracts', () => {
    describe('BeforeAgentTurnEventArgs (wired in message-input.component)', () => {
        it('defaults Cancel to false — agent turn proceeds when no listener intervenes', () => {
            const e = new BeforeAgentTurnEventArgs('conv-1', 'hello', 'app-1');
            expect(e.Cancel).toBe(false);
        });

        it('lets a listener flip Cancel to true — wiring should bail before processMessage', () => {
            const e = new BeforeAgentTurnEventArgs('conv-1', 'hello', null);
            // Listener simulation
            e.Cancel = true;
            e.CancelReason = 'rate-limited';
            expect(e.Cancel).toBe(true);
            expect(e.CancelReason).toBe('rate-limited');
        });

        it('payload fields round-trip — listeners can read what was emitted', () => {
            const e = new BeforeAgentTurnEventArgs('conv-xyz', 'send me data', 'app-abc');
            expect(e.ConversationId).toBe('conv-xyz');
            expect(e.MessageText).toBe('send me data');
            expect(e.ApplicationId).toBe('app-abc');
        });

        it('null applicationId is preserved (surfaces with no app context)', () => {
            const e = new BeforeAgentTurnEventArgs('conv-1', 'hi', null);
            expect(e.ApplicationId).toBeNull();
        });

        it('default applicationId is null when omitted (constructor default)', () => {
            const e = new BeforeAgentTurnEventArgs('conv-1', 'hi');
            expect(e.ApplicationId).toBeNull();
        });
    });

    describe('AfterAgentTurnEventArgs (wired in message-input.component)', () => {
        it('carries the agent run id and result payload as readonly fields', () => {
            const result = { success: true, executionTimeMs: 123 } as never;
            const e = new AfterAgentTurnEventArgs('conv-1', 'run-abc', result);
            expect(e.ConversationId).toBe('conv-1');
            expect(e.AgentRunId).toBe('run-abc');
            expect(e.Result).toBe(result);
        });
    });

    describe('BeforeResponseFormSubmittedEventArgs (wired in message-item.component)', () => {
        it('defaults Cancel to false — form submission proceeds when no listener intervenes', () => {
            const e = new BeforeResponseFormSubmittedEventArgs('msg-1', { q1: 'yes' });
            expect(e.Cancel).toBe(false);
        });

        it('lets a listener flip Cancel to true — wiring should skip suggestedResponseSelected emit', () => {
            const e = new BeforeResponseFormSubmittedEventArgs('msg-1', { q1: 'yes' });
            e.Cancel = true;
            e.CancelReason = 'validation failed';
            expect(e.Cancel).toBe(true);
            expect(e.CancelReason).toBe('validation failed');
        });

        it('uses the message ID as the form id (stable per-message identifier)', () => {
            const e = new BeforeResponseFormSubmittedEventArgs('msg-xyz', {});
            expect(e.FormId).toBe('msg-xyz');
        });

        it('carries the submitted values map as a readonly field', () => {
            const vals = { feedback: 'great', rating: 5, agree: true };
            const e = new BeforeResponseFormSubmittedEventArgs('msg-1', vals);
            expect(e.Values).toEqual(vals);
        });
    });

    describe('AfterResponseFormSubmittedEventArgs (wired in message-item.component)', () => {
        it('mirrors the Before event payload (form id + values)', () => {
            const vals = { feedback: 'great', rating: 5 };
            const before = new BeforeResponseFormSubmittedEventArgs('msg-1', vals);
            const after = new AfterResponseFormSubmittedEventArgs(before.FormId, before.Values);
            expect(after.FormId).toBe('msg-1');
            expect(after.Values).toEqual(vals);
        });
    });

    describe('wiring assumptions (documenting the firing-code contract)', () => {
        it('cancel semantics are synchronous — flipping Cancel inside the same call is sufficient', () => {
            // The message-input + message-item firing code calls .emit(event), then checks
            // event.Cancel BEFORE proceeding. This is correct because Angular's EventEmitter
            // is synchronous by default (extends Subject), so all subscribers run before
            // .emit() returns. Verify the contract: mutations to the event during a
            // synchronous "listener" are visible after the synchronous call chain returns.
            const e = new BeforeAgentTurnEventArgs('conv-1', 'hi');
            (function listener(eventArgs: BeforeAgentTurnEventArgs) {
                eventArgs.Cancel = true;
            })(e);
            expect(e.Cancel).toBe(true);
        });
    });
});
