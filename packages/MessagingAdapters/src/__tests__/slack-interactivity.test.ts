/**
 * Unit tests for slack-interactivity.ts — Slack interactive message handler.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock MJ core dependencies
vi.mock('@memberjunction/core', async (importOriginal) => {
    const orig = await importOriginal<typeof import('@memberjunction/core')>();
    return { ...orig, LogError: vi.fn(), LogStatus: vi.fn() };
});

import { handleSlackInteraction, registerActiveForm } from '../slack/slack-interactivity.js';

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

    // ─── Phase 5b: New test coverage ─────────────────────────────────────────

    describe('handleModalSubmission', () => {
        function createModalSubmissionPayload(fields: Record<string, Record<string, Record<string, { value?: string; selected_option?: { value: string }; selected_options?: Array<{ value: string }> }>>>, metadata?: string): string {
            return JSON.stringify({
                type: 'view_submission',
                trigger_id: 'trigger-modal',
                user: { id: 'U123', name: 'testuser' },
                view: {
                    callback_id: 'mj:form_modal:submit',
                    private_metadata: metadata ?? JSON.stringify({ channelId: 'C123', threadTs: 'thread-ts' }),
                    state: { values: fields }
                },
                token: 'test'
            });
        }

        it('should extract text field values from modal state', async () => {
            const mockChat = { postMessage: vi.fn().mockResolvedValue({ ts: 'new-ts' }) };
            const clientWithChat = { ...mockClient, chat: mockChat };

            const payload = createModalSubmissionPayload({
                mj_form_name: {
                    'mj:form_field:name': { value: 'John Doe' }
                }
            });

            await handleSlackInteraction(payload, clientWithChat as never);

            expect(mockChat.postMessage).toHaveBeenCalledOnce();
            const msgArgs = mockChat.postMessage.mock.calls[0][0];
            expect(msgArgs.channel).toBe('C123');
            expect(msgArgs.thread_ts).toBe('thread-ts');
            expect(msgArgs.text).toContain('John Doe');
        });

        it('should extract selected_option values from modal state', async () => {
            const mockChat = { postMessage: vi.fn().mockResolvedValue({ ts: 'new-ts' }) };
            const clientWithChat = { ...mockClient, chat: mockChat };

            const payload = createModalSubmissionPayload({
                mj_form_color: {
                    'mj:form_field:color': { selected_option: { value: 'blue' } }
                }
            });

            await handleSlackInteraction(payload, clientWithChat as never);

            expect(mockChat.postMessage).toHaveBeenCalledOnce();
            const msgArgs = mockChat.postMessage.mock.calls[0][0];
            expect(msgArgs.text).toContain('blue');
        });

        it('should extract multi-select values from modal state', async () => {
            const mockChat = { postMessage: vi.fn().mockResolvedValue({ ts: 'new-ts' }) };
            const clientWithChat = { ...mockClient, chat: mockChat };

            const payload = createModalSubmissionPayload({
                mj_form_toppings: {
                    'mj:form_field:toppings': {
                        selected_options: [{ value: 'cheese' }, { value: 'pepperoni' }]
                    }
                }
            });

            await handleSlackInteraction(payload, clientWithChat as never);

            expect(mockChat.postMessage).toHaveBeenCalledOnce();
            const msgArgs = mockChat.postMessage.mock.calls[0][0];
            expect(msgArgs.text).toContain('cheese,pepperoni');
        });

        it('should skip submissions with no extractable fields', async () => {
            const mockChat = { postMessage: vi.fn() };
            const clientWithChat = { ...mockClient, chat: mockChat };

            const payload = createModalSubmissionPayload({
                mj_form_empty: {
                    'mj:form_field:empty': {}
                }
            });

            await handleSlackInteraction(payload, clientWithChat as never);

            expect(mockChat.postMessage).not.toHaveBeenCalled();
        });

        it('should skip submissions with missing channel metadata', async () => {
            const mockChat = { postMessage: vi.fn() };
            const clientWithChat = { ...mockClient, chat: mockChat };

            const payload = createModalSubmissionPayload(
                { mj_form_q: { 'mj:form_field:q': { value: 'test' } } },
                'invalid-json'
            );

            await handleSlackInteraction(payload, clientWithChat as never);
            expect(mockChat.postMessage).not.toHaveBeenCalled();
        });
    });

    describe('handleFormChoice', () => {
        it('should parse action_id and post choice back to thread', async () => {
            const mockChat = { postMessage: vi.fn().mockResolvedValue({ ts: 'new-ts' }) };
            const clientWithChat = { ...mockClient, chat: mockChat };

            const payload = createBlockActionsPayload([
                { action_id: 'mj:form_choice:color:blue', block_id: 'b1', type: 'button', value: 'Blue' }
            ]);

            await handleSlackInteraction(payload, clientWithChat as never);

            expect(mockChat.postMessage).toHaveBeenCalledOnce();
            const msgArgs = mockChat.postMessage.mock.calls[0][0];
            expect(msgArgs.channel).toBe('C123');
            expect(msgArgs.text).toContain('Blue');
        });

        it('should handle missing channel gracefully', async () => {
            const mockChat = { postMessage: vi.fn() };
            const clientWithChat = { ...mockClient, chat: mockChat };

            const payload = JSON.stringify({
                type: 'block_actions',
                trigger_id: 'trigger-123',
                user: { id: 'U123', name: 'testuser' },
                // No channel
                message: { ts: 'msg-ts', text: 'text', blocks: [] },
                actions: [{ action_id: 'mj:form_choice:q:val', block_id: 'b1', type: 'button', value: 'Val' }],
                token: 'test'
            });

            await handleSlackInteraction(payload, clientWithChat as never);
            expect(mockChat.postMessage).not.toHaveBeenCalled();
        });
    });

    describe('handleFormModalOpen', () => {
        it('should open modal from button value JSON', async () => {
            const form = {
                title: 'Test',
                submitLabel: 'Go',
                questions: [
                    { id: 'q1', label: 'Q1', required: true, type: { type: 'text' } }
                ]
            };
            const payload = createBlockActionsPayload([
                {
                    action_id: 'mj:form_modal:open',
                    block_id: 'b1',
                    type: 'button',
                    value: JSON.stringify(form)
                }
            ]);

            await handleSlackInteraction(payload, mockClient as never);

            expect(mockClient.views.open).toHaveBeenCalledOnce();
            const viewArgs = mockClient.views.open.mock.calls[0][0];
            expect(viewArgs.view.type).toBe('modal');
            expect(viewArgs.view.callback_id).toBe('mj:form_modal:submit');
        });

        it('should fall back to activeFormStore when button value is "too_large"', async () => {
            const form = {
                title: 'Stored Form',
                submitLabel: 'Submit',
                questions: [
                    { id: 'q1', label: 'Q1', required: true, type: { type: 'text' } }
                ]
            };
            // Register the form in the store
            registerActiveForm('C123', 'msg-ts', form as never);

            const payload = createBlockActionsPayload([
                {
                    action_id: 'mj:form_modal:open',
                    block_id: 'b1',
                    type: 'button',
                    value: 'too_large'
                }
            ]);

            await handleSlackInteraction(payload, mockClient as never);

            expect(mockClient.views.open).toHaveBeenCalledOnce();
            const viewArgs = mockClient.views.open.mock.calls[0][0];
            expect(viewArgs.view.type).toBe('modal');
        });

        it('should post ephemeral when form is expired/not found', async () => {
            const mockChat = {
                postMessage: vi.fn(),
                postEphemeral: vi.fn().mockResolvedValue({})
            };
            const clientWithChat = { ...mockClient, chat: mockChat };

            const payload = createBlockActionsPayload([
                {
                    action_id: 'mj:form_modal:open',
                    block_id: 'b1',
                    type: 'button',
                    value: 'too_large'
                }
            ], {
                channel: { id: 'C999' },
                message: { ts: 'expired-ts', text: 'old', blocks: [] }
            });

            await handleSlackInteraction(payload, clientWithChat as never);

            expect(mockChat.postEphemeral).toHaveBeenCalledOnce();
            expect(mockClient.views.open).not.toHaveBeenCalled();
        });
    });
});
