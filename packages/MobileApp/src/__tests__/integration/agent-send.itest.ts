/**
 * Integration (OPTIONAL, SLOW): end-to-end agent send.
 *
 * Creates a real conversation, sends a message, triggers a real Sage run, and
 * polls `getConversationDetailStatus` until the AI reply is persisted.
 *
 * This test is `.skip`ped BY DEFAULT because it drives a live LLM agent run:
 * it is slow (tens of seconds), costs tokens, and can be flaky if the agent
 * infrastructure is under load. To enable it locally, change `describe.skip`
 * below to `describe` (or `describe.skipIf(!hasToken())`) and run:
 *
 *   MJ_TEST_JWT=... npm run test:integration
 *
 * It creates its own conversation fixture; it does not clean it up (the reply
 * needs to persist to be asserted). Delete the "[mj-integration-test]" chat
 * afterward if you want a tidy DB.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { initLiveProvider } from './setup-live';
import { createConversation, sendMessage, getConversationDetailStatus } from '@/data/services/agents';

// NOTE: `.skip` on purpose — see file header for how to enable.
describe.skip('integration (slow, opt-in): agent send', () => {
    beforeAll(async () => {
        await initLiveProvider();
    });

    it('createConversation + sendMessage yields a persisted AI reply', async () => {
        const conv = await createConversation('[mj-integration-test] agent send');
        expect(conv).not.toBeNull();

        const send = await sendMessage({
            conversationId: conv!.id,
            text: '@sage say hello in one short sentence.',
        });
        expect(send.success).toBe(true);
        expect(send.userMessageId).toBeTruthy();
        expect(send.aiMessageId).toBeTruthy();

        // Poll the AI detail until it finalizes (Complete/Error) or we time out.
        const aiId = send.aiMessageId!;
        const deadline = Date.now() + 90_000;
        let status: string | null = null;
        while (Date.now() < deadline) {
            status = await getConversationDetailStatus(aiId);
            if (status && status !== 'In-Progress') break;
            await new Promise((r) => setTimeout(r, 3_000));
        }

        expect(status).toBe('Complete');
    });
});
