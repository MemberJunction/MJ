/**
 * @fileoverview Attachment metadata — the parts of the attachment model that describe a file
 * rather than touch one.
 *
 * Split out from `attachments.ts` so that code which only needs to *describe* or *persist* an
 * attachment does not transitively import `expo-image-picker` / `expo-document-picker` /
 * `expo-file-system`. Those drag in `expo-modules-core`, which expects React Native globals and
 * throws under plain Node — which made the storage pipeline untestable against a live server even
 * though not one line of it touches a device.
 *
 * Nothing here imports Expo or MemberJunction. It is pure data and string formatting.
 */

/** Whether a captured attachment is an image (thumbnail-able) or an opaque document. */
export type AttachmentKind = 'image' | 'document';

/**
 * A normalized, transport-agnostic reference to a captured file. Produced by
 * every picker in this module regardless of source (camera / library / Files).
 */
export type CapturedAttachment = {
    /** Local `file://` (or content) URI where the picked bytes live on device. */
    uri: string;  // case-violation-ok-legacy-back-compat: the type crosses a serialization boundary (JSON / HTTP body), so this member name is part of a wire or on-disk shape
    /** Display filename, e.g. `IMG_0421.HEIC` or `Q3-report.pdf`. */
    name: string;  // case-violation-ok-legacy-back-compat: the type crosses a serialization boundary (JSON / HTTP body), so this member name is part of a wire or on-disk shape
    /** MIME type, e.g. `image/jpeg`, `application/pdf`. */
    mimeType: string;  // case-violation-ok-legacy-back-compat: the type crosses a serialization boundary (JSON / HTTP body), so this member name is part of a wire or on-disk shape
    /** Size in bytes, when the picker reported it (some sources omit it). */
    size?: number;  // case-violation-ok-legacy-back-compat: the type crosses a serialization boundary (JSON / HTTP body), so this member name is part of a wire or on-disk shape
    /** Coarse classification driving preview UI (thumbnail vs. filename chip). */
    kind: AttachmentKind;  // case-violation-ok-legacy-back-compat: the type crosses a serialization boundary (JSON / HTTP body), so this member name is part of a wire or on-disk shape
};

/** Human-readable byte size, e.g. `842 B`, `12 KB`, `3.4 MB`. */
function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${Math.round(kb)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
}

export function DescribeAttachment(att: CapturedAttachment): string {
    const size = att.size != null ? `, ${formatBytes(att.size)}` : '';
    const label = att.kind === 'image' ? 'image' : 'file';
    return `[Attached ${label}: ${att.name} (${att.mimeType}${size})]`;
}

export function ComposeMessageWithAttachment(text: string, att: CapturedAttachment | null): string {
    const trimmed = text.trim();
    if (!att) return trimmed;
    const note = DescribeAttachment(att);
    return trimmed.length > 0 ? `${trimmed}\n\n${note}` : note;
}
