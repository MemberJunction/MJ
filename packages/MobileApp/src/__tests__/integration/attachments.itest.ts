import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { CompositeKey, RunView } from '@memberjunction/core';
import type { MJConversationDetailEntity, MJConversationEntity, MJFileEntity } from '@memberjunction/core-entities';
import { initLiveProvider, hasToken, md } from './setup-live';
import {
    uploadAttachmentBytes,
    attachFileToConversationDetail,
    linkAttachmentToRecord,
    type CapturedAttachment,
} from '../../data/services/attachments';

/**
 * Live integration coverage for the attachment upload pipeline (G2).
 *
 * Unit tests prove the mapping; only a live run proves the pipeline. This exercises the real
 * path end to end against MJAPI: bytes → MJ Storage → an `MJ: Files` catalog row → a
 * first-class `MJ: Conversation Detail Attachments` row that an agent can actually consume.
 *
 * Unlike the older suites in this folder, this one **seeds and cleans up its own fixtures** —
 * it creates the conversation and message it attaches to, and deletes them afterwards. Suites
 * that assert against ambient data only pass on a database someone has already used, which is
 * exactly how a from-scratch database catches them.
 *
 * Gated on `MJ_TEST_JWT` like the rest of the folder.
 */
const TAG = '(mj-integration-test — safe to delete)';

describe.runIf(hasToken())('integration: attachments', () => {
    let conversationId = '';
    let detailId = '';
    const createdFileIds: string[] = [];

    /** A tiny but genuinely valid 1×1 PNG, so the server sees real bytes rather than junk. */
    const PNG_BASE64 =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

    beforeAll(async () => {
        await initLiveProvider();

        const conv = await md().GetEntityObject<MJConversationEntity>('MJ: Conversations', md().CurrentUser);
        conv.NewRecord();
        conv.Name = `Attachment pipeline ${TAG}`;
        conv.UserID = md().CurrentUser.ID;
        const convSaved = await conv.Save();
        expect(convSaved, `conversation save: ${conv.LatestResult?.CompleteMessage}`).toBe(true);
        conversationId = conv.ID;

        const detail = await md().GetEntityObject<MJConversationDetailEntity>('MJ: Conversation Details', md().CurrentUser);
        detail.NewRecord();
        detail.ConversationID = conversationId;
        detail.Message = `Attachment carrier ${TAG}`;
        detail.Role = 'User';
        const detailSaved = await detail.Save();
        expect(detailSaved, `detail save: ${detail.LatestResult?.CompleteMessage}`).toBe(true);
        detailId = detail.ID;
    }, 60000);

    it('uploads real bytes and creates an MJ: Files record', async () => {
        const att = makeAttachment();
        const result = await uploadAttachmentBytes(att, PNG_BASE64);
        expect(result, 'upload returned null — check MJ Storage provider configuration').not.toBeNull();
        expect(result!.id).toMatch(/^[0-9A-Fa-f-]{36}$/);
        createdFileIds.push(result!.id);

        // The record must really exist — a returned id proves the mutation answered, not that it wrote.
        const rv = new RunView();
        const found = await rv.RunView<{ ID: string; Name: string }>({
            EntityName: 'MJ: Files',
            ExtraFilter: `ID='${result!.id}'`,
            Fields: ['ID', 'Name'],
            ResultType: 'simple',
        });
        expect(found.Success).toBe(true);
        expect(found.Results?.length).toBe(1);
    }, 60000);

    it('attaches an uploaded file to a message as a consumable multimodal attachment', async () => {
        const att = makeAttachment();
        // `uploadAndAttachToMessage` is the composer's entry point, but it reads bytes through
        // expo-file-system; from Node we drive its two steps directly against the same code.
        const stored = await uploadAttachmentBytes(att, PNG_BASE64);
        expect(stored, 'upload returned null').not.toBeNull();
        createdFileIds.push(stored!.id);
        const attached = await attachFileToConversationDetail(stored!.id, detailId, att);
        expect(attached, 'file uploaded but did not attach').toBe(true);

        const rv = new RunView();
        const rows = await rv.RunView<{ ID: string; FileID: string; MimeType: string; ModalityID: string }>({
            EntityName: 'MJ: Conversation Detail Attachments',
            ExtraFilter: `ConversationDetailID='${detailId}'`,
            Fields: ['ID', 'FileID', 'MimeType', 'ModalityID'],
            ResultType: 'simple',
        });
        expect(rows.Success).toBe(true);
        const mine = (rows.Results ?? []).find((r) => r.FileID === stored!.id);
        expect(mine, 'no attachment row found for the uploaded file').toBeTruthy();
        expect(mine!.MimeType).toBe('image/png');
        // The modality is the part that makes this reachable by a vision model rather than an opaque blob.
        expect(mine!.ModalityID).toMatch(/^[0-9A-Fa-f-]{36}$/);
    }, 60000);

    it('links a file to an arbitrary record without assuming an ID column', async () => {
        const att = makeAttachment();
        const uploaded = await uploadAttachmentBytes(att, PNG_BASE64);
        expect(uploaded).not.toBeNull();
        createdFileIds.push(uploaded!.id);

        const linked = await linkAttachmentToRecord(
            uploaded!.id,
            'MJ: Conversations',
            CompositeKey.FromID(conversationId), // first-pk-ok: MJ core entity, single-column key
        );
        expect(linked).toBe(true);
    }, 60000);

    afterAll(async () => {
        // Self-cleaning, per the folder's rule: a suite that leaves fixtures behind makes the
        // next from-scratch run less meaningful and pollutes whatever database it touched.
        // Teardown is best-effort throughout — a cleanup failure must never fail the suite.
        for (const fileId of createdFileIds) {
            try {
                const f = await md().GetEntityObject<MJFileEntity>('MJ: Files', md().CurrentUser);
                if (await f.Load(fileId)) await f.Delete();
            } catch { /* ignore */ }
        }
        if (detailId) {
            try {
                const d = await md().GetEntityObject<MJConversationDetailEntity>('MJ: Conversation Details', md().CurrentUser);
                if (await d.Load(detailId)) await d.Delete();
            } catch { /* ignore */ }
        }
        if (conversationId) {
            try {
                const c = await md().GetEntityObject<MJConversationEntity>('MJ: Conversations', md().CurrentUser);
                if (await c.Load(conversationId)) await c.Delete();
            } catch { /* ignore */ }
        }
    }, 120000);

    it('reports failure rather than throwing for a nonexistent conversation detail', async () => {
        const att = makeAttachment();
        const uploaded = await uploadAttachmentBytes(att, PNG_BASE64);
        expect(uploaded).not.toBeNull();
        createdFileIds.push(uploaded!.id);

        const ok = await attachFileToConversationDetail(
            uploaded!.id,
            '00000000-0000-0000-0000-000000000000',
            att,
        );
        expect(ok).toBe(false);
    }, 60000);

    /**
     * A captured attachment pointing at a data URI. `readAttachmentBase64` goes through
     * `expo-file-system`, which does not exist under Node — so this suite exercises the
     * upload and attach steps with bytes supplied directly, and leaves byte *reading* to the
     * on-device tests where that module actually runs.
     */
    function makeAttachment(): CapturedAttachment {
        return {
            uri: `data:image/png;base64,${PNG_BASE64}`,
            name: `pixel-${Date.now()}.png`,
            mimeType: 'image/png',
            size: 68,
            kind: 'image',
        };
    }
});
