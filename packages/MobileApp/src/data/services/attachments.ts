/**
 * Photo / file capture + attachment service (Phase 3 / P3.1).
 *
 * A thin, defensively-typed layer over the three Expo capture modules —
 * `expo-image-picker` (camera + photo library), `expo-document-picker`
 * (arbitrary files), and `expo-file-system` (reading captured bytes) — plus an
 * MJ object-model persistence primitive for the {@link MJFileEntity} catalog.
 *
 * Design goals:
 *   - Every picker/permission path degrades gracefully. A denied permission, a
 *     user cancel, a simulator with no camera, or a native error all resolve to
 *     `null` — they NEVER throw. Callers can treat `null` uniformly as "no
 *     attachment was chosen".
 *   - The pickers return a single normalized {@link CapturedAttachment} shape so
 *     UI code doesn't care whether an item came from the camera, the library, or
 *     the Files app.
 *
 * ## Backend persistence
 * Bytes are uploaded through `GraphQLFileStorageClient.UploadFile`, which posts the
 * base64 payload to MJ Storage's server-side subsystem. That one call uploads the
 * bytes *and* creates the `MJ: Files` catalog record, so the client never needs to
 * mint a pre-signed URL, PUT to it, and then reconcile the record's status — three
 * steps that previously had no mobile implementation and left every attachment
 * stranded at `Status = 'Pending'`.
 *
 * {@link linkAttachmentToRecord} then relates the stored file to whatever record it
 * belongs to (a `Conversation Detail`, an entity row) via `MJ: File Entity Record
 * Links`, which is what makes an attachment discoverable from the record rather
 * than only from the file catalog.
 *
 * {@link composeMessageWithAttachment} is still used alongside this — not as a
 * fallback for missing upload, but because a chat message should *say* that it
 * carries an attachment. The note is the human-readable half; the File record and
 * its link are the machine-readable half.
 */
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import { CompositeKey, Metadata, RunView, type UserInfo } from '@memberjunction/core';
import { GraphQLDataProvider, GraphQLFileStorageClient } from '@memberjunction/graphql-dataprovider';
import type { MJConversationDetailAttachmentEntity, MJFileEntityRecordLinkEntity } from '@memberjunction/core-entities';

/** Whether a captured attachment is an image (thumbnail-able) or an opaque document. */
export type AttachmentKind = 'image' | 'document';

/**
 * A normalized, transport-agnostic reference to a captured file. Produced by
 * every picker in this module regardless of source (camera / library / Files).
 */
export type CapturedAttachment = {
    /** Local `file://` (or content) URI where the picked bytes live on device. */
    uri: string;
    /** Display filename, e.g. `IMG_0421.HEIC` or `Q3-report.pdf`. */
    name: string;
    /** MIME type, e.g. `image/jpeg`, `application/pdf`. */
    mimeType: string;
    /** Size in bytes, when the picker reported it (some sources omit it). */
    size?: number;
    /** Coarse classification driving preview UI (thumbnail vs. filename chip). */
    kind: AttachmentKind;
};

/** Minimal shape shared by every Expo permission response we consult. */
type PermissionState = { granted: boolean; canAskAgain?: boolean };

/**
 * Resolve a permission, prompting only when it's still askable. Any native
 * error resolves to `false` so callers never see a throw.
 *
 * @param get Reads the current permission status without prompting.
 * @param request Prompts the user for the permission.
 * @returns `true` only when the permission is (or becomes) granted.
 */
async function ensurePermission(
    get: () => Promise<PermissionState>,
    request: () => Promise<PermissionState>,
): Promise<boolean> {
    try {
        const current = await get();
        if (current.granted) return true;
        // Respect a permanent denial — re-prompting is a no-op the OS ignores.
        if (current.canAskAgain === false) return false;
        const requested = await request();
        return requested.granted === true;
    } catch {
        return false;
    }
}

/**
 * Derive a filename from a URI when the picker didn't supply one (rare, but the
 * camera occasionally omits `fileName`).
 */
function deriveName(uri: string, kind: AttachmentKind): string {
    const tail = uri.split('/').pop()?.split('?')[0];
    if (tail && tail.length > 0) {
        try {
            return decodeURIComponent(tail);
        } catch {
            return tail;
        }
    }
    return kind === 'image' ? 'image.jpg' : 'document';
}

/** Map an `expo-image-picker` result to a {@link CapturedAttachment} (or `null` if cancelled/empty). */
function imageResultToAttachment(result: ImagePicker.ImagePickerResult): CapturedAttachment | null {
    if (result.canceled || !result.assets || result.assets.length === 0) return null;
    const asset = result.assets[0];
    return {
        uri: asset.uri,
        name: asset.fileName ?? deriveName(asset.uri, 'image'),
        mimeType: asset.mimeType ?? 'image/jpeg',
        size: asset.fileSize,
        kind: 'image',
    };
}

/**
 * Pick an existing image from the device photo library.
 *
 * @returns The chosen image as a {@link CapturedAttachment}, or `null` when the
 *   user cancels, denies library access, or a native error occurs.
 */
export async function pickImageFromLibrary(): Promise<CapturedAttachment | null> {
    const allowed = await ensurePermission(
        () => ImagePicker.getMediaLibraryPermissionsAsync(),
        () => ImagePicker.requestMediaLibraryPermissionsAsync(),
    );
    if (!allowed) return null;
    try {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            quality: 0.8,
        });
        return imageResultToAttachment(result);
    } catch {
        return null;
    }
}

/**
 * Capture a new photo with the camera.
 *
 * Degrades gracefully where no camera exists: the iOS simulator has no camera
 * hardware, so `launchCameraAsync` rejects — that (and camera-permission denial)
 * resolves to `null` rather than surfacing an error.
 *
 * @returns The captured photo as a {@link CapturedAttachment}, or `null`.
 */
export async function capturePhoto(): Promise<CapturedAttachment | null> {
    const allowed = await ensurePermission(
        () => ImagePicker.getCameraPermissionsAsync(),
        () => ImagePicker.requestCameraPermissionsAsync(),
    );
    if (!allowed) return null;
    try {
        const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
        return imageResultToAttachment(result);
    } catch {
        // No camera hardware (simulator) or a native failure — degrade to null.
        return null;
    }
}

/**
 * Pick an arbitrary document (PDF, spreadsheet, etc.) via the system Files UI.
 * No runtime permission is required for the document picker.
 *
 * @returns The chosen document as a {@link CapturedAttachment}, or `null` on
 *   cancel / native error.
 */
export async function pickDocument(): Promise<CapturedAttachment | null> {
    try {
        // copyToCacheDirectory guarantees a readable local URI for base64 inlining.
        const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
        if (result.canceled || !result.assets || result.assets.length === 0) return null;
        const asset = result.assets[0];
        return {
            uri: asset.uri,
            name: asset.name ?? deriveName(asset.uri, 'document'),
            mimeType: asset.mimeType ?? 'application/octet-stream',
            size: asset.size,
            kind: 'document',
        };
    } catch {
        return null;
    }
}

/**
 * Read a captured attachment's bytes as a base64 string, for callers that need
 * to inline the payload (e.g. an eventual upload body). Uses the `expo-file-system`
 * `File` API.
 *
 * @param att The attachment whose bytes to read.
 * @returns The base64-encoded contents, or `null` if the file can't be read.
 */
export async function readAttachmentBase64(att: CapturedAttachment): Promise<string | null> {
    try {
        return await new File(att.uri).base64();
    } catch {
        return null;
    }
}

/** Human-readable byte size, e.g. `842 B`, `12 KB`, `3.4 MB`. */
function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${Math.round(kb)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
}

/**
 * A short, human-readable description of an attachment, used as the inline
 * fallback note appended to a message when there's no byte-upload pipeline.
 *
 * @example `[Attached image: IMG_0421.jpg (image/jpeg, 245 KB)]`
 */
export function describeAttachment(att: CapturedAttachment): string {
    const size = att.size != null ? `, ${formatBytes(att.size)}` : '';
    const label = att.kind === 'image' ? 'image' : 'file';
    return `[Attached ${label}: ${att.name} (${att.mimeType}${size})]`;
}

/**
 * Compose the outbound message text for a send that may carry an attachment.
 * When an attachment is present, its {@link describeAttachment} note is appended
 * (the documented fallback until byte upload exists); otherwise the text is
 * returned unchanged (trimmed).
 *
 * @param text The user-typed message body.
 * @param att The chosen attachment, or `null`.
 * @returns The message text to actually send (never empty when an attachment is set).
 */
export function composeMessageWithAttachment(text: string, att: CapturedAttachment | null): string {
    const trimmed = text.trim();
    if (!att) return trimmed;
    const note = describeAttachment(att);
    return trimmed.length > 0 ? `${trimmed}\n\n${note}` : note;
}


/**
 * Uploads a captured attachment's bytes and creates its `MJ: Files` catalog record.
 *
 * Delegates to MJ Storage's `UploadFile`, which performs both halves server-side — so
 * there is no window where a catalog row exists without its bytes. The storage account
 * is chosen by the server when {@link accountId} is omitted, which is the normal case;
 * mobile has no business picking a storage backend.
 *
 * Best-effort by contract, like every other function in this module: a read failure,
 * a transport error, or a server-side rejection all resolve to `null`. An attachment
 * that cannot be uploaded must never take the message with it — the composer still
 * sends the text, and the user still sees their note.
 *
 * @param att The captured attachment to upload.
 * @param contextUser Optional context user; defaults to the signed-in user.
 * @param accountId Optional specific `MJ: File Storage Accounts` id.
 * @returns The new `MJ: Files` record id, or `null` if anything went wrong.
 */
export async function uploadAttachment(
    att: CapturedAttachment,
    contextUser?: UserInfo,
    accountId?: string,
): Promise<{ id: string } | null> {
    const base64 = await readAttachmentBase64(att);
    if (!base64) return null;
    return uploadAttachmentBytes(att, base64, accountId);
}

/**
 * Uploads attachment bytes that the caller has already read.
 *
 * Split out from {@link uploadAttachment} so the upload step does not depend on the device
 * filesystem: reading bytes is `expo-file-system`'s job and only works on a device, while the
 * upload itself is plain GraphQL and works anywhere. That separation is what lets the pipeline
 * be tested against a live server from Node, instead of only on a simulator.
 *
 * @param att Metadata describing the attachment (name, MIME type, size).
 * @param base64 The already-read file contents.
 * @param accountId Optional specific `MJ: File Storage Accounts` id; the server chooses when omitted.
 * @returns The new `MJ: Files` record id, or `null` on any failure. Never throws.
 */
export async function uploadAttachmentBytes(
    att: CapturedAttachment,
    base64: string,
    accountId?: string,
): Promise<{ id: string } | null> {
    try {
        const client = new GraphQLFileStorageClient(GraphQLDataProvider.Instance);
        const result = await client.UploadFile({
            FileName: att.name,
            Base64Data: base64,
            MimeType: att.mimeType,
            AccountID: accountId,
            Description: describeAttachment(att),
        });

        if (!result?.Success || !result.FileID) {
            console.warn('[attachments] upload failed:', result?.ErrorMessage ?? 'no FileID returned');
            return null;
        }
        return { id: result.FileID };
    } catch (error) {
        console.warn('[attachments] upload threw:', error);
        return null;
    }
}

/**
 * Relates an uploaded file to the record it belongs to, via `MJ: File Entity Record Links`.
 *
 * This is what makes an attachment reachable *from the record* — a conversation message,
 * an account, a work order — rather than only from the file catalog. Without it an upload
 * is orphaned: stored, but findable by nobody who wasn't already looking for it.
 *
 * The record key is built through {@link CompositeKey} rather than assuming a column named
 * `ID`, so this works for entities mapped from external schemas and for composite keys.
 *
 * @param fileId The `MJ: Files` id returned by {@link uploadAttachment}.
 * @param entityName The entity the record belongs to, e.g. `'MJ: Conversation Details'`.
 * @param recordKey The target record's primary key.
 * @param contextUser Optional context user; defaults to the signed-in user.
 * @returns `true` when the link row saved, `false` otherwise. Never throws.
 */
export async function linkAttachmentToRecord(
    fileId: string,
    entityName: string,
    recordKey: CompositeKey,
    contextUser?: UserInfo,
): Promise<boolean> {
    try {
        const md = new Metadata();  // global-provider-ok: single-provider mobile client (one MJAPI connection via useMJ()); no per-provider threading
        const currentUser = contextUser ?? md.CurrentUser;

        const entity = md.EntityByName(entityName);
        if (!entity) {
            console.warn(`[attachments] unknown entity for link: ${entityName}`);
            return false;
        }

        const link = await md.GetEntityObject<MJFileEntityRecordLinkEntity>('MJ: File Entity Record Links', currentUser);
        link.NewRecord();
        link.FileID = fileId;
        link.EntityID = entity.ID;
        link.RecordID = recordKey.ToCompactURLSegment();

        const saved = await link.Save();
        if (!saved) {
            console.warn('[attachments] link save failed:', link.LatestResult?.CompleteMessage ?? 'unknown error');
        }
        return saved;
    } catch (error) {
        console.warn('[attachments] link threw:', error);
        return false;
    }
}

/**
 * Uploads an attachment and links it to a record in one step — the call the chat
 * composers actually want.
 *
 * Returns the file id even when linking fails: the bytes are safely stored either way,
 * and losing the link is a lesser failure than discarding the upload. The caller decides
 * whether a partial success is worth surfacing.
 *
 * @returns `{ id, linked }`, or `null` if the upload itself failed.
 */
export async function uploadAndLinkAttachment(
    att: CapturedAttachment,
    entityName: string,
    recordKey: CompositeKey,
    contextUser?: UserInfo,
): Promise<{ id: string; linked: boolean } | null> {
    const uploaded = await uploadAttachment(att, contextUser);
    if (!uploaded) return null;
    const linked = await linkAttachmentToRecord(uploaded.id, entityName, recordKey, contextUser);
    return { id: uploaded.id, linked };
}

/**
 * Maps a MIME type onto an `MJ: AI Modalities` name.
 *
 * The modality is what lets an agent treat an attachment as something it can *reason about*
 * rather than an opaque blob — a photo routed as `Image` reaches a vision model, where the same
 * bytes filed as `File` would not. Anything we cannot classify falls back to `File`, which is
 * honest: the bytes are attached and downloadable, they are just not claimed to be interpretable.
 */
function modalityNameForMimeType(mimeType: string): 'Image' | 'Audio' | 'Video' | 'File' {
    const m = mimeType.toLowerCase();
    if (m.startsWith('image/')) return 'Image';
    if (m.startsWith('audio/')) return 'Audio';
    if (m.startsWith('video/')) return 'Video';
    return 'File';
}

/** Resolves an `MJ: AI Modalities` row id by name, or `null` when the deployment lacks it. */
async function resolveModalityId(name: string, contextUser?: UserInfo): Promise<string | null> {
    const rv = new RunView();
    const result = await rv.RunView<{ ID: string }>(
        {
            EntityName: 'MJ: AI Modalities',
            ExtraFilter: `Name='${name.replace(/'/g, "''")}'`,
            Fields: ['ID'],
            MaxRows: 1,
            ResultType: 'simple',
        },
        contextUser,
    );
    if (!result.Success || !result.Results?.length) return null;
    return result.Results[0].ID;
}

/**
 * Attaches an uploaded file to a chat message as a first-class conversation attachment.
 *
 * This writes `MJ: Conversation Detail Attachments` — MJ's purpose-built multimodal attachment
 * model — rather than the generic `MJ: File Entity Record Links`. The distinction matters: the
 * conversation model carries `ModalityID`, dimensions and size, which is what allows an agent to
 * *consume* the attachment (a photo reaching a vision model) instead of merely having a pointer
 * to a file it cannot open. Use {@link linkAttachmentToRecord} for non-conversation records, where
 * the generic link is the right shape.
 *
 * @param fileId The `MJ: Files` id from {@link uploadAttachment}.
 * @param conversationDetailId The message this attachment belongs to.
 * @param att The captured attachment, for its metadata.
 * @param displayOrder Position among a message's attachments; defaults to 0.
 * @param contextUser Optional context user; defaults to the signed-in user.
 * @returns `true` when the attachment row saved. Never throws.
 */
export async function attachFileToConversationDetail(
    fileId: string,
    conversationDetailId: string,
    att: CapturedAttachment,
    displayOrder = 0,
    contextUser?: UserInfo,
): Promise<boolean> {
    try {
        const md = new Metadata();  // global-provider-ok: single-provider mobile client (one MJAPI connection via useMJ()); no per-provider threading
        const currentUser = contextUser ?? md.CurrentUser;

        const modalityId = await resolveModalityId(modalityNameForMimeType(att.mimeType), currentUser);
        if (!modalityId) {
            console.warn('[attachments] no AI Modality row resolved; cannot attach to conversation');
            return false;
        }

        const row = await md.GetEntityObject<MJConversationDetailAttachmentEntity>(
            'MJ: Conversation Detail Attachments',
            currentUser,
        );
        row.NewRecord();
        row.ConversationDetailID = conversationDetailId;
        row.FileID = fileId;
        row.ModalityID = modalityId;
        row.MimeType = att.mimeType;
        row.FileName = att.name;
        // Size is required but some pickers omit it; 0 is truthful ("unreported") and keeps the
        // row valid rather than blocking an otherwise good attachment on a missing nicety.
        row.FileSizeBytes = att.size ?? 0;
        row.DisplayOrder = displayOrder;

        const saved = await row.Save();
        if (!saved) {
            console.warn('[attachments] conversation attachment save failed:', row.LatestResult?.CompleteMessage ?? 'unknown error');
        }
        return saved;
    } catch (error) {
        console.warn('[attachments] conversation attachment threw:', error);
        return false;
    }
}

/**
 * Uploads an attachment and attaches it to a chat message — the call the composers want.
 *
 * Returns the file id even when the attach step fails, for the same reason
 * {@link uploadAndLinkAttachment} does: stored-but-unattached beats discarded.
 */
export async function uploadAndAttachToMessage(
    att: CapturedAttachment,
    conversationDetailId: string,
    contextUser?: UserInfo,
): Promise<{ id: string; attached: boolean } | null> {
    const uploaded = await uploadAttachment(att, contextUser);
    if (!uploaded) return null;
    const attached = await attachFileToConversationDetail(uploaded.id, conversationDetailId, att, 0, contextUser);
    return { id: uploaded.id, attached };
}
