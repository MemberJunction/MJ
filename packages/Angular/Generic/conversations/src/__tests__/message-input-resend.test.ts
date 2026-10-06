/**
 * @fileoverview `MessageInputComponent.SendMessageWithText` with `{ IsResend: true }`, the send an
 * edited message makes on its new branch. The composer's draft must be left alone (its pending
 * attachments are not saved with the message and are not cleared, and the editor is not cleared),
 * and the send must never count as the conversation's first message.
 *
 * Instantiated via the prototype (no constructor/TestBed) with only the members the send touches
 * stubbed — same style as `message-input-streaming.test.ts`.
 *
 * `RerunAgentForMessage` routes an existing user message again (regenerate): no message is saved,
 * the draft is left alone, and `IsSending` is held while the agent turn runs.
 */
import '@angular/compiler'; // JIT support — the component import evaluates Angular decorators in vitest's node env
import { describe, it, expect, vi } from 'vitest';
import type { PendingAttachment } from '@memberjunction/ng-composer';
import type { MJConversationDetailEntity } from '@memberjunction/core-entities';

import { MessageInputComponent } from '../lib/components/message/message-input.component';

interface SendHarness {
    component: MessageInputComponent;
    draft: PendingAttachment;
    saveAttachments: ReturnType<typeof vi.fn>;
    clearEditor: ReturnType<typeof vi.fn>;
    firstMessageFlags: boolean[];
    pendingAttachments: () => PendingAttachment[];
    createDetail: ReturnType<typeof vi.fn>;
    routeMessage: ReturnType<typeof vi.fn>;
}

function buildHarness(): SendHarness {
    const draft: PendingAttachment = {
        id: 'draft-1', file: null, dataUrl: 'data:text/plain;base64,', mimeType: 'text/plain', fileName: 'draft.txt', sizeBytes: 0,
    };
    const detail = {
        ID: 'detail-1', ConversationID: '', Message: '', Role: '', UserID: '', ParentID: null as string | null,
        Save: vi.fn(async () => true),
    };
    const saveAttachments = vi.fn(async () => undefined);
    const clearEditor = vi.fn();
    const firstMessageFlags: boolean[] = [];
    const messageSentStub = { emit: vi.fn() };
    const createDetail = vi.fn(async () => detail);
    const routeMessage = vi.fn(async (_d: unknown, _m: unknown, isFirstMessage: boolean) => {
        firstMessageFlags.push(isFirstMessage);
    });

    const component = Object.create(MessageInputComponent.prototype) as MessageInputComponent;
    const open = component as unknown as Record<string, unknown>;
    Object.assign(open, {
        ReadOnly: false,
        IsSending: false,
        ConversationId: 'conv-1',
        CurrentUser: { ID: 'user-1' },
        pendingAttachments: [draft],
        _conversationHistory: [],
        dataCache: { createConversationDetail: createDetail },
        attachmentService: { saveAttachments },
        UploadStateChanged: { emit: vi.fn() },
        InputBox: { mentionEditor: { clear: clearEditor } },
        MessageSent: messageSentStub,
        messageSent: messageSentStub,
        parseMentionsFromMessage: vi.fn(() => ({ mentions: [], agentMention: null, userMentions: [] })),
        routeMessage,
    });

    return {
        component, draft, saveAttachments, clearEditor, firstMessageFlags,
        pendingAttachments: () => open.pendingAttachments as PendingAttachment[],
        createDetail, routeMessage,
    };
}

describe('MessageInputComponent.SendMessageWithText resend option', () => {
    it('leaves the draft alone and never counts as the first message', async () => {
        const h = buildHarness();

        const sent = await h.component.SendMessageWithText('edited text', undefined, { IsResend: true });

        expect(sent).toBe(true);
        expect(h.saveAttachments).not.toHaveBeenCalled();
        expect(h.pendingAttachments()).toEqual([h.draft]);
        expect(h.clearEditor).not.toHaveBeenCalled();
        expect(h.firstMessageFlags).toEqual([false]);
    });

    it('still takes the draft and counts an empty history as the first message without the option', async () => {
        const h = buildHarness();

        const sent = await h.component.SendMessageWithText('new text');

        expect(sent).toBe(true);
        expect(h.saveAttachments).toHaveBeenCalledWith('detail-1', [h.draft], expect.anything());
        expect(h.pendingAttachments()).toEqual([]);
        expect(h.clearEditor).toHaveBeenCalledTimes(1);
        expect(h.firstMessageFlags).toEqual([true]);
    });
});

describe('MessageInputComponent.RerunAgentForMessage', () => {
    const userMessage = { ID: 'user-msg-1', ConversationID: 'conv-1', Message: 'What is the capital of France?' } as MJConversationDetailEntity;

    it('routes the existing user message again without saving a message or touching the draft', async () => {
        const h = buildHarness();

        const rerun = await h.component.RerunAgentForMessage(userMessage);

        expect(rerun).toBe(true);
        expect(h.routeMessage).toHaveBeenCalledTimes(1);
        expect(h.routeMessage.mock.calls[0][0]).toBe(userMessage);
        expect(h.firstMessageFlags).toEqual([false]);
        expect(h.createDetail).not.toHaveBeenCalled();
        expect(h.saveAttachments).not.toHaveBeenCalled();
        expect(h.pendingAttachments()).toEqual([h.draft]);
        expect(h.clearEditor).not.toHaveBeenCalled();
    });

    it('holds IsSending while the agent turn runs and clears it after', async () => {
        const h = buildHarness();
        let finishTurn: () => void = () => undefined;
        h.routeMessage.mockImplementationOnce(() => new Promise<void>(resolve => { finishTurn = resolve; }));

        const pending = h.component.RerunAgentForMessage(userMessage);
        await vi.waitFor(() => expect(h.routeMessage).toHaveBeenCalledTimes(1));

        expect(h.component.IsSending).toBe(true);
        finishTurn();
        expect(await pending).toBe(true);
        expect(h.component.IsSending).toBe(false);
    });

    it('clears IsSending when the agent turn throws', async () => {
        const h = buildHarness();
        h.routeMessage.mockRejectedValueOnce(new Error('turn failed'));

        await expect(h.component.RerunAgentForMessage(userMessage)).rejects.toThrow('turn failed');

        expect(h.component.IsSending).toBe(false);
    });

    it('returns false without routing while the composer is already sending', async () => {
        const h = buildHarness();
        h.component.IsSending = true;

        const rerun = await h.component.RerunAgentForMessage(userMessage);

        expect(rerun).toBe(false);
        expect(h.routeMessage).not.toHaveBeenCalled();
        expect(h.component.IsSending).toBe(true);
    });

    it('returns false without routing when the composer is read-only', async () => {
        const h = buildHarness();
        h.component.ReadOnly = true;

        const rerun = await h.component.RerunAgentForMessage(userMessage);

        expect(rerun).toBe(false);
        expect(h.routeMessage).not.toHaveBeenCalled();
    });
});
