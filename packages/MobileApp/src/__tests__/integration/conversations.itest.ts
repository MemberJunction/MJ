/**
 * Integration: conversations service against the live backend.
 *
 * LoadConversations() should surface the seeded "Markdown demo" conversations
 * created during QA. LoadConversation(id) for one of them returns its message
 * thread (user + AI roles) and any artifacts.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initLiveProvider, hasToken, md } from './setup-live';
import { LoadConversations, LoadConversation } from '@/data/services/conversations';
import type { MJConversationDetailEntity, MJConversationEntity } from '@memberjunction/core-entities';

/** Marks fixtures this suite creates, so a stray row is identifiable if teardown ever fails. */
const TAG = '(mj-integration-test — safe to delete)';

describe.skipIf(!hasToken())('integration: conversations', () => {
    let conversationId = '';

    beforeAll(async () => {
        await initLiveProvider();

        // Seed our own fixture rather than asserting against whatever happens to be in the
        // database. The previous version expected a conversation literally named "Markdown demo"
        // to already exist, so it passed only on a database someone had already used and failed
        // on every clean-room run — which is exactly what a from-scratch database is for.
        const conv = await md().GetEntityObject<MJConversationEntity>('MJ: Conversations', md().CurrentUser);
        conv.NewRecord();
        conv.Name = `Conversation fixture ${TAG}`;
        conv.UserID = md().CurrentUser.ID;
        expect(await conv.Save(), `conversation save: ${conv.LatestResult?.CompleteMessage}`).toBe(true);
        conversationId = conv.ID;

        for (const [role, message] of [['User', 'Hello there'], ['AI', 'Hello back']] as const) {
            const detail = await md().GetEntityObject<MJConversationDetailEntity>(
                'MJ: Conversation Details', md().CurrentUser);
            detail.NewRecord();
            detail.ConversationID = conversationId;
            detail.Role = role;
            detail.Message = message;
            detail.Status = 'Complete';
            expect(await detail.Save(), `detail save: ${detail.LatestResult?.CompleteMessage}`).toBe(true);
        }
    }, 60000);

    afterAll(async () => {
        // Best-effort teardown — a cleanup failure must never fail the suite.
        try {
            const c = await md().GetEntityObject<MJConversationEntity>('MJ: Conversations', md().CurrentUser);
            if (conversationId && (await c.Load(conversationId))) await c.Delete();
        } catch { /* ignore */ }
    }, 60000);

    it('LoadConversations returns the conversation this suite created', async () => {
        const conversations = await LoadConversations();
        expect(conversations.length).toBeGreaterThan(0);

        const mine = conversations.filter((c) => (c.entity.Name ?? '').includes(TAG));
        expect(mine.length).toBeGreaterThan(0);

        for (const c of mine) {
            expect(c.entity.ID).toBeTruthy();
            expect(c.LatestAt instanceof Date).toBe(true);
            expect(typeof c.messageCount).toBe('number');
        }
    }, 60000);

    it('LoadConversation returns a message thread with user + AI roles', async () => {
        // Loads the fixture this suite seeded, so the assertions below are about the loader's
        // behaviour rather than about what some earlier session happened to leave behind.
        const load = await LoadConversation(conversationId);
        expect(load).not.toBeNull();
        expect(load!.Conversation.ID).toBe(conversationId);
        expect(load!.Messages.length).toBeGreaterThan(0);

        const roles = new Set(load!.Messages.map((m) => m.detail.Role));
        // The fixture seeds one of each, so both roles must come back.
        expect(roles.has('User')).toBe(true);
        expect(roles.has('AI')).toBe(true);

        // Artifacts array is always present (may be empty).
        expect(Array.isArray(load!.Artifacts)).toBe(true);

        // AI messages resolve an agent name when an AgentID is present.
        for (const m of load!.Messages) {
            if (m.detail.Role === 'AI' && m.detail.AgentID) {
                expect(m.agentName === null || typeof m.agentName === 'string').toBe(true);
            }
        }
    });
});
