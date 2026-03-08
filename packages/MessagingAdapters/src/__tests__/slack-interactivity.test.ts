/**
 * Unit tests for slack-interactivity.ts — Slack interactive message handler.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock MJ core dependencies
vi.mock('@memberjunction/core', async (importOriginal) => {
    const orig = await importOriginal<typeof import('@memberjunction/core')>();
    return { ...orig, LogError: vi.fn(), LogStatus: vi.fn() };
});

import { handleSlackInteraction } from '../slack/slack-interactivity.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createMockClient() {
    return {
        views: {
            open: vi.fn().mockResolvedValue({ ok: true })
        }
    };
}

function createBlockActionsPayload(actions: Record<string, unknown>[] = [], overrides: Record<string, unknown> = {}): string {
    return JSON.stringify({
        type: 'block_actions',
        trigger_id: 'trigger-123',
        user: { id: 'U123', name: 'testuser' },
        channel: { id: 'C123' },
        message: {
            ts: 'msg-ts',
            text: 'Original message',
            blocks: [
                { type: 'section', text: { type: 'mrkdwn', text: 'Some content' } },
                { type: 'context', elements: [{ type: 'mrkdwn', text: 'Footer info' }] }
            ]
        },
        actions,
        token: 'test-token',
        ...overrides
    });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('slack-interactivity', () => {
    let mockClient: ReturnType<typeof createMockClient>;

    beforeEach(() => {
        mockClient = createMockClient();
    });

    describe('handleSlackInteraction', () => {
        it('should handle invalid JSON gracefully', async () => {
            await expect(
                handleSlackInteraction('not-json', mockClient as never)
            ).resolves.toBeUndefined();
        });

        it('should ignore non-block_actions payload types', async () => {
            const payload = JSON.stringify({ type: 'view_submission', trigger_id: 'x' });
            await handleSlackInteraction(payload, mockClient as never);
            expect(mockClient.views.open).not.toHaveBeenCalled();
        });

        it('should handle mj:view_full action by opening a modal', async () => {
            const payload = createBlockActionsPayload([
                { action_id: 'mj:view_full:run-123', block_id: 'block-1', type: 'button' }
            ]);

            await handleSlackInteraction(payload, mockClient as never);

            expect(mockClient.views.open).toHaveBeenCalledOnce();
            const callArgs = mockClient.views.open.mock.calls[0][0];
            expect(callArgs.trigger_id).toBe('trigger-123');
            expect(callArgs.view.type).toBe('modal');
            expect(callArgs.view.title.text).toBe('Full Response');
        });

        it('should extract text content from message blocks into the modal', async () => {
            const payload = createBlockActionsPayload([
                { action_id: 'mj:view_full:run-456', block_id: 'block-1', type: 'button' }
            ]);

            await handleSlackInteraction(payload, mockClient as never);

            const viewBlocks = mockClient.views.open.mock.calls[0][0].view.blocks;
            expect(viewBlocks.length).toBeGreaterThan(0);
            // Should contain the text from the original message blocks
            const allText = viewBlocks.map((b: Record<string, unknown>) =>
                ((b as Record<string, unknown>).text as Record<string, unknown>)?.text ?? ''
            ).join(' ');
            expect(allText).toContain('Some content');
        });

        it('should handle mj:view_artifact as a no-op (URL button)', async () => {
            const payload = createBlockActionsPayload([
                { action_id: 'mj:view_artifact', block_id: 'block-1', type: 'button' }
            ]);

            await handleSlackInteraction(payload, mockClient as never);
            expect(mockClient.views.open).not.toHaveBeenCalled();
        });

        it('should handle custom mj:action_ buttons gracefully', async () => {
            const payload = createBlockActionsPayload([
                { action_id: 'mj:action_0', block_id: 'block-1', type: 'button', value: 'custom' }
            ]);

            await handleSlackInteraction(payload, mockClient as never);
            expect(mockClient.views.open).not.toHaveBeenCalled();
        });

        it('should handle unknown action_ids gracefully', async () => {
            const payload = createBlockActionsPayload([
                { action_id: 'unknown_action', block_id: 'block-1', type: 'button' }
            ]);

            await handleSlackInteraction(payload, mockClient as never);
            expect(mockClient.views.open).not.toHaveBeenCalled();
        });

        it('should handle empty actions array', async () => {
            const payload = createBlockActionsPayload([]);
            await handleSlackInteraction(payload, mockClient as never);
            expect(mockClient.views.open).not.toHaveBeenCalled();
        });

        it('should handle missing message blocks in view_full', async () => {
            const payload = JSON.stringify({
                type: 'block_actions',
                trigger_id: 'trigger-789',
                user: { id: 'U123', name: 'testuser' },
                message: { ts: 'msg-ts', text: 'text', blocks: [] },
                actions: [{ action_id: 'mj:view_full:empty', block_id: 'b1', type: 'button' }],
                token: 'test'
            });

            await handleSlackInteraction(payload, mockClient as never);

            expect(mockClient.views.open).toHaveBeenCalledOnce();
            const viewBlocks = mockClient.views.open.mock.calls[0][0].view.blocks;
            expect(viewBlocks.length).toBeGreaterThan(0);
        });
    });
});
