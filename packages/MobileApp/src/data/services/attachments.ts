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
 * ## Backend persistence status
 * MJ *does* have a first-class attachment entity — {@link MJFileEntity}
 * (`MJ: Files`) — and {@link persistAttachment} creates its catalog record via
 * the standard object model. However, uploading the raw *bytes* is a separate,
 * bespoke server capability: MJ's `FileResolver.CreateFile` mutation mints a
 * pre-signed `UploadUrl` that the client then PUTs the bytes to. That flow is a
 * custom GraphQL endpoint, NOT part of the plain `Metadata.GetEntityObject` /
 * `Save` object model, so it is intentionally out of scope here (we do not
 * invent an upload endpoint). Consequently {@link persistAttachment} records the
 * file metadata with `Status = 'Pending'` and leaves byte upload as documented
 * future work. Until that pipeline is wired, the chat composers use the
 * {@link composeMessageWithAttachment} fallback to describe the attachment inline
 * in the message text, so the capture UX is real end-to-end.
 *
 * // TODO(P3.x): once a mobile file-upload path exists (CreateFile pre-signed
 * // URL -> PUT bytes -> mark Uploaded, then link via `MJ: File Entity Record
 * // Links`), have the composers persist + reference the File instead of the
 * // inline text note.
 */
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import { Metadata, RunView, type UserInfo } from '@memberjunction/core';
import type { MJFileEntity } from '@memberjunction/core-entities';

/** Whether a captured attachment is an image (thumbnail-able) or an opaque document. */
export type AttachmentKind = 'image' | 'document';

/**
 * A normalized, transport-agnostic reference to a captured file. Produced by
 * every picker in this module regardless of source (camera / library / Files).
 */
export type CapturedAttachment = {
    /** Local `file://` (or content) URI where the picked bytes live on device. */
    Uri: string;
    /** Display filename, e.g. `IMG_0421.HEIC` or `Q3-report.pdf`. */
    Name: string;
    /** MIME type, e.g. `image/jpeg`, `application/pdf`. */
    MimeType: string;
    /** Size in bytes, when the picker reported it (some sources omit it). */
    size?: number;  // case-violation-ok-legacy-back-compat: optional, and the old name is also read off a value the checker cannot type; renaming it stays assignable and silently yields undefined
    /** Coarse classification driving preview UI (thumbnail vs. filename chip). */
    Kind: AttachmentKind;
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
        Uri: asset.uri,
        Name: asset.fileName ?? deriveName(asset.uri, 'image'),
        MimeType: asset.mimeType ?? 'image/jpeg',
        size: asset.fileSize,
        Kind: 'image',
    };
}

/**
 * Pick an existing image from the device photo library.
 *
 * @returns The chosen image as a {@link CapturedAttachment}, or `null` when the
 *   user cancels, denies library access, or a native error occurs.
 */
export async function PickImageFromLibrary(): Promise<CapturedAttachment | null> {
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

/** @deprecated Use {@link PickImageFromLibrary}. */
export async function pickImageFromLibrary(): Promise<CapturedAttachment | null> {
    return PickImageFromLibrary();
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
export async function CapturePhoto(): Promise<CapturedAttachment | null> {
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

/** @deprecated Use {@link CapturePhoto}. */
export async function capturePhoto(): Promise<CapturedAttachment | null> {
    return CapturePhoto();
}

/**
 * Pick an arbitrary document (PDF, spreadsheet, etc.) via the system Files UI.
 * No runtime permission is required for the document picker.
 *
 * @returns The chosen document as a {@link CapturedAttachment}, or `null` on
 *   cancel / native error.
 */
export async function PickDocument(): Promise<CapturedAttachment | null> {
    try {
        // copyToCacheDirectory guarantees a readable local URI for base64 inlining.
        const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
        if (result.canceled || !result.assets || result.assets.length === 0) return null;
        const asset = result.assets[0];
        return {
            Uri: asset.uri,
            Name: asset.name ?? deriveName(asset.uri, 'document'),
            MimeType: asset.mimeType ?? 'application/octet-stream',
            size: asset.size,
            Kind: 'document',
        };
    } catch {
        return null;
    }
}

/** @deprecated Use {@link PickDocument}. */
export async function pickDocument(): Promise<CapturedAttachment | null> {
    return PickDocument();
}

/**
 * Read a captured attachment's bytes as a base64 string, for callers that need
 * to inline the payload (e.g. an eventual upload body). Uses the `expo-file-system`
 * `File` API.
 *
 * @param att The attachment whose bytes to read.
 * @returns The base64-encoded contents, or `null` if the file can't be read.
 */
export async function ReadAttachmentBase64(att: CapturedAttachment): Promise<string | null> {
    try {
        return await new File(att.Uri).base64();
    } catch {
        return null;
    }
}

/** @deprecated Use {@link ReadAttachmentBase64}. */
export async function readAttachmentBase64(att: CapturedAttachment): Promise<string | null> {
    return ReadAttachmentBase64(att);
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
export function DescribeAttachment(att: CapturedAttachment): string {
    const size = att.size != null ? `, ${formatBytes(att.size)}` : '';
    const label = att.Kind === 'image' ? 'image' : 'file';
    return `[Attached ${label}: ${att.Name} (${att.MimeType}${size})]`;
}

/** @deprecated Use {@link DescribeAttachment}. */
export function describeAttachment(att: CapturedAttachment): string {
    return DescribeAttachment(att);
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
export function ComposeMessageWithAttachment(text: string, att: CapturedAttachment | null): string {
    const trimmed = text.trim();
    if (!att) return trimmed;
    const note = DescribeAttachment(att);
    return trimmed.length > 0 ? `${trimmed}\n\n${note}` : note;
}

/** @deprecated Use {@link ComposeMessageWithAttachment}. */
export function composeMessageWithAttachment(text: string, att: CapturedAttachment | null): string {
    return ComposeMessageWithAttachment(text, att);
}

/**
 * Resolve the highest-priority active file-storage provider's ID, needed as the
 * required `ProviderID` FK on a `MJ: Files` record.
 *
 * @returns The provider ID, or `null` when none is configured / the query fails.
 */
async function resolveActiveStorageProviderId(contextUser?: UserInfo): Promise<string | null> {
    const rv = new RunView();
    const result = await rv.RunView<{ ID: string }>(
        {
            EntityName: 'MJ: File Storage Providers',
            ExtraFilter: 'IsActive=1',
            OrderBy: 'Priority ASC',
            Fields: ['ID'],
            MaxRows: 1,
            ResultType: 'simple',
        },
        contextUser,
    );
    if (!result.Success || !result.Results || result.Results.length === 0) return null;
    return result.Results[0].ID;
}

/**
 * Persist an attachment's *metadata* as an MJ {@link MJFileEntity} (`MJ: Files`)
 * catalog record via the standard object model.
 *
 * IMPORTANT: this creates the catalog row only — it does NOT upload the file
 * bytes. Byte upload is a separate, bespoke server capability (the `CreateFile`
 * pre-signed-URL flow) that lives outside the plain object model; see this
 * module's header. The record is therefore saved with `Status = 'Pending'`.
 * Returns `null` (never throws) when no storage provider is configured or the
 * save fails, so the caller can fall back cleanly to the inline note.
 *
 * @param att The captured attachment to catalog.
 * @param contextUser Optional acting user (falls back to the current user).
 * @returns `{ id }` of the created File record, or `null` on failure.
 */
export async function PersistAttachment(
    att: CapturedAttachment,
    contextUser?: UserInfo,
): Promise<{ id: string } | null> {
    const md = new Metadata();  // global-provider-ok: single-provider mobile client (one MJAPI connection via useMJ()); no per-provider threading
    const currentUser = contextUser ?? md.CurrentUser;

    const providerId = await resolveActiveStorageProviderId(currentUser);
    if (!providerId) return null;

    const file = await md.GetEntityObject<MJFileEntity>('MJ: Files', currentUser);
    file.NewRecord();
    file.Name = att.Name;
    file.ProviderID = providerId;
    file.ContentType = att.MimeType;
    // 'Pending' == catalog row created, bytes not yet uploaded (see header TODO).
    file.Status = 'Pending';

    const saved = await file.Save();
    if (!saved) return null;
    return { id: file.ID };
}

/** @deprecated Use {@link PersistAttachment}. */
export async function persistAttachment(
    att: CapturedAttachment,
    contextUser?: UserInfo,
): Promise<{ id: string } | null> {
    return PersistAttachment(att, contextUser);
}
