import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { RunView } from '@memberjunction/core';
import type {
    MJConversationDetailAttachmentEntity,
    MJConversationDetailEntity,
    MJConversationEntity,
} from '@memberjunction/core-entities';
import { initLiveProvider, hasToken, md } from './setup-live';
import {
    AttachCapturedFileToMessage,
    Base64SizeBytes,
} from '../../data/services/attachment-storage';
import type { CapturedAttachment } from '../../data/services/attachment-meta';

/**
 * Live coverage for the attachment pipeline (G2), against a real MJAPI.
 *
 * Unit tests prove the mapping; only a live run proves the pipeline — and this one caught two
 * things a mock never would. First, a stock `UI`-role user has `CanCreate` on
 * `MJ: Conversation Detail Attachments` but **not** on `MJ: Files`, so an implementation that
 * pushed every attachment through MJStorage was denied for every ordinary user. Second, the
 * entity's own field descriptions say `InlineData` and `FileID` are mutually exclusive, with
 * inline being the small-attachment path — which is exactly what the permission model expects.
 *
 * This suite **seeds and cleans up its own fixtures**, unlike the older suites in this folder,
 * which assert against ambient data and therefore only pass on a database someone has already
 * used.
 */
const TAG = '(mj-integration-test — safe to delete)';

describe.runIf(hasToken())('integration: attachments', () => {
    let conversationId = '';
    let detailId = '';
    const createdAttachmentIds: string[] = [];

    /** A genuinely valid 1×1 PNG, so the server sees real bytes rather than junk. */
    const PNG_BASE64 =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

    beforeAll(async () => {
        await initLiveProvider();

        const conv = await md().GetEntityObject<MJConversationEntity>('MJ: Conversations', md().CurrentUser);
        conv.NewRecord();
        conv.Name = `Attachment pipeline ${TAG}`;
        conv.UserID = md().CurrentUser.ID;
        expect(await conv.Save(), `conversation save: ${conv.LatestResult?.CompleteMessage}`).toBe(true);
        conversationId = conv.ID;

        const detail = await md().GetEntityObject<MJConversationDetailEntity>('MJ: Conversation Details', md().CurrentUser);
        detail.NewRecord();
        detail.ConversationID = conversationId;
        detail.Message = `Attachment carrier ${TAG}`;
        detail.Role = 'User';
        expect(await detail.Save(), `detail save: ${detail.LatestResult?.CompleteMessage}`).toBe(true);
        detailId = detail.ID;
    }, 60000);

    afterAll(async () => {
        // Self-cleaning: a suite that leaves fixtures behind makes the next from-scratch run less
        // meaningful. Best-effort throughout — teardown must never fail the suite.
        for (const id of createdAttachmentIds) {
            try {
                const a = await md().GetEntityObject<MJConversationDetailAttachmentEntity>(
                    'MJ: Conversation Detail Attachments', md().CurrentUser);
                if (await a.Load(id)) await a.Delete();
            } catch { /* ignore */ }
        }
        try {
            const d = await md().GetEntityObject<MJConversationDetailEntity>('MJ: Conversation Details', md().CurrentUser);
            if (detailId && await d.Load(detailId)) await d.Delete();
        } catch { /* ignore */ }
        try {
            const c = await md().GetEntityObject<MJConversationEntity>('MJ: Conversations', md().CurrentUser);
            if (conversationId && await c.Load(conversationId)) await c.Delete();
        } catch { /* ignore */ }
    }, 120000);

    it('attaches a small image inline, as a real UI-role user can', async () => {
        const att = makeAttachment();
        const result = await AttachCapturedFileToMessage(detailId, att, PNG_BASE64);
        expect(result.ok, result.ok ? '' : `attach failed: ${result.message}`).toBe(true);
        if (!result.ok) return;
        createdAttachmentIds.push(result.attachmentId);
        expect(result.storedInline).toBe(true);
    }, 60000);

    it('writes a row an agent can consume — inline bytes plus a resolved modality', async () => {
        const att = makeAttachment();
        const result = await AttachCapturedFileToMessage(detailId, att, PNG_BASE64);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        createdAttachmentIds.push(result.attachmentId);

        const rows = await new RunView().RunView<{
            ID: string; MimeType: string; ModalityID: string; InlineData: string; FileID: string | null; FileSizeBytes: number;
        }>({
            EntityName: 'MJ: Conversation Detail Attachments',
            ExtraFilter: `ID='${result.attachmentId}'`,
            Fields: ['ID', 'MimeType', 'ModalityID', 'InlineData', 'FileID', 'FileSizeBytes'],
            ResultType: 'simple',
        });
        expect(rows.Success).toBe(true);
        const row = rows.Results?.[0];
        expect(row).toBeTruthy();
        expect(row!.MimeType).toBe('image/png');
        expect(row!.InlineData).toBe(PNG_BASE64);
        // Mutually exclusive by contract: the inline branch must leave FileID null.
        expect(row!.FileID ?? null).toBeNull();
        // The modality is what makes this reachable by a vision model rather than an opaque blob.
        expect(row!.ModalityID).toMatch(/^[0-9A-Fa-f-]{36}$/);
    }, 60000);

    it('refuses an oversized attachment with an actionable reason, not a permission error', async () => {
        const att = { ...makeAttachment(), size: 5 * 1024 * 1024 };
        const result = await AttachCapturedFileToMessage(detailId, att, PNG_BASE64);
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.reason).toBe('too-large');
    }, 60000);

    it('honours an agent threshold override below the system default', async () => {
        const att = makeAttachment();
        // 10 bytes — smaller than our PNG, so the override must force the storage path.
        const result = await AttachCapturedFileToMessage(detailId, att, PNG_BASE64, 10);
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.reason).toBe('too-large');
    }, 60000);

    it('reports a save failure rather than throwing for a nonexistent message', async () => {
        const result = await AttachCapturedFileToMessage(
            '00000000-0000-0000-0000-000000000000', makeAttachment(), PNG_BASE64);
        expect(result.ok).toBe(false);
    }, 60000);

    it('computes base64 size without decoding', () => {
        expect(Base64SizeBytes(PNG_BASE64)).toBeGreaterThan(60);
        expect(Base64SizeBytes(PNG_BASE64)).toBeLessThan(100);
    });

    function makeAttachment(): CapturedAttachment {
        return {
            uri: `data:image/png;base64,${PNG_BASE64}`,
            name: `pixel-${Date.now()}.png`,
            mimeType: 'image/png',
            size: Base64SizeBytes(PNG_BASE64),
            kind: 'image',
        };
    }
});
