/**
 * Integration: conversations service against the live backend.
 *
 * loadConversations() should surface the seeded "Markdown demo" conversations
 * created during QA. loadConversation(id) for one of them returns its message
 * thread (user + AI roles) and any artifacts.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { initLiveProvider, hasToken } from './setup-live';
import { loadConversations, loadConversation } from '@/data/services/conversations';

describe.skipIf(!hasToken())('integration: conversations', () => {
    beforeAll(async () => {
        await initLiveProvider();
    });

    it('loadConversations returns the seeded "Markdown demo" conversations', async () => {
        const conversations = await loadConversations();
        expect(conversations.length).toBeGreaterThan(0);

        const markdownDemos = conversations.filter((c) =>
            (c.Entity.Name ?? '').toLowerCase().includes('markdown demo'),
        );
        expect(markdownDemos.length).toBeGreaterThan(0);

        // List-item shape check on the demos.
        for (const c of markdownDemos) {
            expect(c.Entity.ID).toBeTruthy();
            expect(c.LatestAt instanceof Date).toBe(true);
            expect(typeof c.MessageCount).toBe('number');
        }
    });

    it('loadConversation returns a message thread with user + AI roles', async () => {
        const conversations = await loadConversations();
        const demo =
            conversations.find((c) => (c.Entity.Name ?? '').toLowerCase().includes('markdown demo')) ??
            conversations[0];
        expect(demo).toBeTruthy();

        const load = await loadConversation(demo.Entity.ID);
        expect(load).not.toBeNull();
        expect(load!.Conversation.ID).toBe(demo.Entity.ID);
        expect(load!.Messages.length).toBeGreaterThan(0);

        const roles = new Set(load!.Messages.map((m) => m.detail.Role));
        // A demo conversation should have at least a user message; AI replies too.
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
