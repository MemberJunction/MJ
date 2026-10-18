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
 * {@link ComposeMessageWithAttachment} is still used alongside this — not as a
 * fallback for missing upload, but because a chat message should *say* that it
 * carries an attachment. The note is the human-readable half; the File record and
 * its link are the machine-readable half.
 */
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import type { UserInfo } from '@memberjunction/core';
import { AttachCapturedFileToMessage, type AttachResult } from './attachment-storage';
import { DescribeAttachment, type AttachmentKind, type CapturedAttachment } from './attachment-meta';

// Re-exported so existing call sites keep one import for the whole attachment surface.
// Intra-package re-export — the no-re-export rule governs crossing package boundaries.
export {
    type AttachmentKind,
    type CapturedAttachment,
    DescribeAttachment,
    ComposeMessageWithAttachment,
} from './attachment-meta';
export {
    AttachCapturedFileToMessage,
    LinkFileToRecord,
    Base64SizeBytes,
    type AttachResult,
} from './attachment-storage';



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
export async function ReadAttachmentBase64(att: CapturedAttachment): Promise<string | null> {
    try {
        return await new File(att.uri).base64();
    } catch {
        return null;
    }
}

/**
 * Reads a captured file's bytes and attaches it to a chat message.
 *
 * The only part of the attachment path that needs a device: `expo-file-system` reads the bytes,
 * then `attachment-storage` — which has no Expo dependency and therefore can be tested against a
 * live server — decides how to store them and writes the row.
 *
 * @param att The captured attachment.
 * @param conversationDetailId The message to attach it to.
 * @param contextUser Optional context user; defaults to the signed-in user.
 */
export async function AttachCapturedFile(
    att: CapturedAttachment,
    conversationDetailId: string,
    contextUser?: UserInfo,
): Promise<AttachResult> {
    const base64 = await ReadAttachmentBase64(att);
    if (!base64) {
        return { ok: false, reason: 'invalid', message: 'The file could not be read from this device.' };
    }
    return AttachCapturedFileToMessage(conversationDetailId, att, base64, null, contextUser);
}
