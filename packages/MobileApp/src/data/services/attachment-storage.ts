/**
 * @fileoverview Attachment persistence — turning captured bytes into a conversation attachment
 * MemberJunction (and an agent) can actually use.
 *
 * ## Why this is thin
 *
 * The interesting decisions here are **not mobile's to make**, and MJ already makes them:
 * `ConversationUtility` (`@memberjunction/ai-core-plus`) owns attachment-type classification,
 * limit validation, and the inline-vs-storage threshold. This module supplies only the
 * persistence, so mobile and web reach the same verdicts from the same code.
 *
 * ## Inline vs MJStorage — and why mobile is usually inline
 *
 * `MJ: Conversation Detail Attachments` documents the contract in its own field descriptions:
 * `InlineData` holds small attachments as base64, `FileID` references large ones in MJStorage,
 * and **exactly one must be populated**. `ConversationUtility.ShouldStoreInline` picks, honouring
 * an agent's `InlineStorageThresholdBytes` override before the 1 MB system default.
 *
 * That split matches the permission model exactly. A stock `UI`-role user has `CanCreate` on
 * `MJ: Conversation Detail Attachments` but **not** on `MJ: Files` — so an end user can attach a
 * photo inline, and only a Developer/Integration-role caller can push bytes into MJStorage. An
 * earlier version of this module uploaded everything through MJStorage and was denied for every
 * ordinary user; the schema was telling us the right answer the whole time.
 *
 * Large attachments therefore return a clear, actionable failure rather than a generic denial, and
 * the caller can tell the user the file is too big to attach from mobile.
 *
 * @see {@link https://github.com/MemberJunction/MJ} `ConversationAttachmentService` in
 * `@memberjunction/aiengine` is the fuller server-side equivalent (thumbnails, download URLs,
 * storage cleanup). It is unusable here only because it statically imports
 * `@memberjunction/storage`, which pulls the AWS/Azure/Dropbox SDKs into the bundle — see the
 * refactor proposed in `plans/mobile-app-react-native/PHASE4-V6-REALTIME.md`.
 */
import { CompositeKey, Metadata, RunView, type UserInfo } from '@memberjunction/core';
import {
    ConversationUtility,
    DEFAULT_INLINE_STORAGE_THRESHOLD_BYTES,
} from '@memberjunction/ai-core-plus';
import type {
    MJConversationDetailAttachmentEntity,
    MJFileEntityRecordLinkEntity,
} from '@memberjunction/core-entities';
import type { CapturedAttachment } from './attachment-meta';

/** Outcome of attaching a captured file to a message. */
export type AttachResult =
    | { ok: true; attachmentId: string; storedInline: true }
    | { ok: false; reason: 'too-large' | 'invalid' | 'save-failed'; message: string };

/** Byte length of a base64 payload, without allocating the decoded buffer. */
export function base64SizeBytes(base64: string): number {
    const clean = base64.replace(/=+$/, '');
    return Math.floor((clean.length * 3) / 4);
}

/**
 * Maps an MJ attachment type onto the `MJ: AI Modalities` name used by the attachment row.
 *
 * The modality is what lets an agent *consume* an attachment rather than hold an opaque pointer —
 * a photo filed as `Image` reaches a vision model, the same bytes filed as `File` do not.
 */
function modalityNameForAttachmentType(type: string): 'Image' | 'Audio' | 'Video' | 'File' {
    switch (type) {
        case 'Image':
            return 'Image';
        case 'Audio':
            return 'Audio';
        case 'Video':
            return 'Video';
        default:
            return 'File';
    }
}

/** Resolves an `MJ: AI Modalities` row id by name, or `null` when the deployment lacks it. */
async function resolveModalityId(name: string, contextUser: UserInfo): Promise<string | null> {
    const result = await new RunView().RunView<{ ID: string }>(
        {
            EntityName: 'MJ: AI Modalities',
            ExtraFilter: `Name='${name.replace(/'/g, "''")}'`,
            Fields: ['ID'],
            MaxRows: 1,
            ResultType: 'simple',
        },
        contextUser,
    );
    return result.Success && result.Results?.length ? result.Results[0].ID : null;
}

/**
 * Attaches captured bytes to a chat message as a first-class conversation attachment.
 *
 * @param conversationDetailId The message the attachment belongs to.
 * @param att Metadata for the captured file.
 * @param base64 The file contents, already read by the caller (reading is the device's job).
 * @param agentInlineThresholdBytes Optional agent override of the inline-storage threshold.
 * @param contextUser Optional context user; defaults to the signed-in user.
 */
export async function attachCapturedFileToMessage(
    conversationDetailId: string,
    att: CapturedAttachment,
    base64: string,
    agentInlineThresholdBytes?: number | null,
    contextUser?: UserInfo,
): Promise<AttachResult> {
    try {
        const md = new Metadata();  // global-provider-ok: single-provider mobile client (one MJAPI connection via useMJ()); no per-provider threading
        const user = contextUser ?? md.CurrentUser;

        const sizeBytes = att.size ?? base64SizeBytes(base64);

        // MJ owns this decision, not mobile — same thresholds as every other surface.
        const storeInline = ConversationUtility.ShouldStoreInline(
            sizeBytes,
            agentInlineThresholdBytes ?? null,
            DEFAULT_INLINE_STORAGE_THRESHOLD_BYTES,
        );
        if (!storeInline) {
            return {
                ok: false,
                reason: 'too-large',
                message: 'This file is too large to attach from mobile.',
            };
        }

        const attachmentType = ConversationUtility.GetAttachmentTypeFromMime(att.mimeType);
        const modalityId = await resolveModalityId(modalityNameForAttachmentType(attachmentType), user);
        if (!modalityId) {
            return { ok: false, reason: 'invalid', message: 'This deployment has no matching modality configured.' };
        }

        const row = await md.GetEntityObject<MJConversationDetailAttachmentEntity>(
            'MJ: Conversation Detail Attachments',
            user,
        );
        row.NewRecord();
        row.ConversationDetailID = conversationDetailId;
        row.ModalityID = modalityId;
        row.MimeType = att.mimeType;
        row.FileName = att.name;
        row.FileSizeBytes = sizeBytes;
        row.DisplayOrder = 0;
        // Exactly one of InlineData / FileID must be set. This is the inline branch, so FileID
        // stays null.
        row.InlineData = base64;

        const saved = await row.Save();
        if (!saved) {
            return {
                ok: false,
                reason: 'save-failed',
                message: row.LatestResult?.CompleteMessage ?? 'The attachment could not be saved.',
            };
        }
        return { ok: true, attachmentId: row.ID, storedInline: true };
    } catch (error) {
        return { ok: false, reason: 'save-failed', message: error instanceof Error ? error.message : String(error) };
    }
}

/**
 * Relates an already-stored `MJ: Files` record to an arbitrary entity row, via
 * `MJ: File Entity Record Links`.
 *
 * For non-conversation records, where no modality applies. The key is built through
 * {@link CompositeKey} rather than assuming a column named `ID`, so this holds for entities mapped
 * from external schemas and for composite keys.
 */
export async function linkFileToRecord(
    fileId: string,
    entityName: string,
    recordKey: CompositeKey,
    contextUser?: UserInfo,
): Promise<boolean> {
    try {
        const md = new Metadata();  // global-provider-ok: single-provider mobile client (one MJAPI connection via useMJ()); no per-provider threading
        const user = contextUser ?? md.CurrentUser;

        const entity = md.EntityByName(entityName);
        if (!entity) return false;

        const link = await md.GetEntityObject<MJFileEntityRecordLinkEntity>('MJ: File Entity Record Links', user);
        link.NewRecord();
        link.FileID = fileId;
        link.EntityID = entity.ID;
        link.RecordID = recordKey.ToCompactURLSegment();

        return await link.Save();
    } catch {
        return false;
    }
}
