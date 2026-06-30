/**
 * @fileoverview Locks the cross-conversation bleed guard contract.
 *
 * The chat-area keeps one (hidden) message-input alive per visited conversation, and ALL of
 * them — including a background conversation's still-streaming input after the user swaps —
 * emit their agent-lifecycle events (agentRunDetected / agentRunUpdate / messageComplete /
 * artifactCreated / intentCheckStarted / intentCheckCompleted) to the SINGLE parent chat-area.
 * Each handler drops events whose conversationId doesn't match the ACTIVE conversation, exactly
 * as onMessageSent / onAgentResponse already did. This prevents a background agent's run/artifacts
 * from polluting the displayed conversation's maps + the shared ConversationEngine cache.
 *
 * Instantiating the 155k-line chat-area needs TestBed + DOM (it can't even be imported in a
 * node-env test — Angular's JIT compiler isn't available), so these tests exercise the EXACT
 * production predicates the handlers call — `eventBelongsToConversation` and
 * `resolvePendingMessageTarget` from ../lib/utils/conversation-event-routing — NOT a re-declared
 * mirror. Every guarded handler (onAgentRunDetected / onAgentRunUpdate / onMessageComplete /
 * onArtifactCreated / onIntentCheckStarted / onIntentCheckCompleted) and the
 * EffectivePendingMessageTarget getter call these same functions, so a regression in the routing
 * rule (e.g. swapping UUIDsEqual for ===, or reordering the pending-target fallback) fails here.
 *
 * The UUIDsEqual choice (NOT ===) is load-bearing: SQL Server returns UUIDs uppercase and
 * PostgreSQL lowercase, so the same conversation can arrive in different casing.
 */

import { describe, it, expect } from 'vitest';
import { UUIDsEqual } from '@memberjunction/global';
import {
    eventBelongsToConversation,
    resolvePendingMessageTarget,
} from '../lib/utils/conversation-event-routing';

// Letter-bearing UUIDs so upper/lower casing actually differs as strings.
const CONV_A = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const CONV_B = 'ffffffff-1111-2222-3333-444444444444';

describe('cross-conversation bleed guard contract', () => {
    it('proceeds when the event belongs to the active conversation', () => {
        expect(eventBelongsToConversation(CONV_A, CONV_A)).toBe(true);
    });

    it('drops an event from a background conversation (the bleed case)', () => {
        // Conv A agent finishes after the user swapped to conv B → must NOT mutate B's state.
        expect(eventBelongsToConversation(CONV_A, CONV_B)).toBe(false);
    });

    it('matches across UUID casing (SQL Server upper vs PostgreSQL lower) — must use UUIDsEqual, not ===', () => {
        expect(eventBelongsToConversation(CONV_A.toUpperCase(), CONV_A.toLowerCase())).toBe(true);
        // A plain === would wrongly drop the active conversation's own event under casing skew:
        expect(CONV_A.toUpperCase() === CONV_A.toLowerCase()).toBe(false);
    });

    it('drops events when there is no active conversation', () => {
        expect(eventBelongsToConversation(CONV_A, null)).toBe(false);
    });

    it('drops events with a missing conversationId (defensive — never matches a real active id)', () => {
        expect(eventBelongsToConversation(undefined, CONV_A)).toBe(false);
        expect(eventBelongsToConversation(null, CONV_A)).toBe(false);
    });

    it('intentCheckStarted and intentCheckCompleted route through the SAME predicate (symmetric pair)', () => {
        // The started/completed pair is emitted with the same conversationId; both handlers use
        // eventBelongsToConversation, so a background conversation can neither inject a placeholder
        // into the active conversation nor remove the active conversation's own placeholder.
        const started = eventBelongsToConversation(CONV_A, CONV_B); // bg start → dropped
        const completed = eventBelongsToConversation(CONV_A, CONV_B); // bg complete → dropped
        expect(started).toBe(false);
        expect(completed).toBe(false);
    });
});

/**
 * Locks the pending-message auto-send targeting (the new-conversation first-message bleed).
 *
 * When a new conversation is created from the empty state, its first message round-trips as
 * `pendingMessage` and is auto-sent by the cached input whose conversationId matches the
 * delivery target. If that target were the LIVE-active conversation, swapping conversations
 * during the async auto-send window would let the swapped-to conversation's input grab the
 * pending message and persist it there too — the DB-level cross-conversation bleed.
 *
 * The chat-area resolves the target via EffectivePendingMessageTarget, which calls
 * resolvePendingMessageTarget:
 *   explicit host input  ??  internally-captured new-conversation id  ??  active conversation
 * The internally-captured id (set when the conversation is created) makes this immune to swaps.
 */
describe('pending-message auto-send targeting', () => {
    it('targets the internally-captured new conversation even after the active conversation swaps away', () => {
        // New conv A created (captured), user swaps to B (active) during the send window.
        const target = resolvePendingMessageTarget(null, CONV_A, CONV_B);
        expect(target).toBe(CONV_A); // NOT CONV_B — no bleed into the swapped-to conversation
    });

    it('prefers an explicit host-provided target over everything', () => {
        expect(resolvePendingMessageTarget(CONV_A, CONV_B, CONV_B)).toBe(CONV_A);
    });

    it('falls back to the active conversation only when no target was captured (single-conversation hosts)', () => {
        expect(resolvePendingMessageTarget(null, null, CONV_A)).toBe(CONV_A);
    });

    it('a delivered pending message reaches ONLY the input whose conversationId matches the target', () => {
        const target = resolvePendingMessageTarget(null, CONV_A, CONV_B);
        // The new conversation's input receives it; the swapped-to conversation's input does not.
        expect(UUIDsEqual(CONV_A, target)).toBe(true);
        expect(UUIDsEqual(CONV_B, target)).toBe(false);
    });
});
