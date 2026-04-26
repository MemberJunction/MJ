import type { MessageAttachment } from '../components/message/message-item.component';

/**
 * Reduce a potentially long artifact-type name to a compact UPPERCASE badge
 * label that fits in ~10 characters. Rules:
 *   1. If the whole name fits in 10 chars, uppercase it.
 *   2. Otherwise take the LAST whitespace-delimited word ("Data Snapshot" → "SNAPSHOT",
 *      "Business Intelligence Dashboard" → "DASHBOARD").
 *   3. If that last word is still too long, truncate to 9 chars + ellipsis.
 * Empty/whitespace input returns the generic fallback "FILE".
 */
export function ShortBadgeText(typeName: string | null | undefined): string {
    const trimmed = (typeName ?? '').trim();
    if (!trimmed) return 'FILE';
    if (trimmed.length <= 10) return trimmed.toUpperCase();
    const lastWord = trimmed.split(/\s+/).pop() ?? '';
    if (lastWord.length <= 10) return lastWord.toUpperCase();
    return lastWord.slice(0, 9).toUpperCase() + '…';
}

/**
 * Pick the text that goes inside an attachment's type badge.
 * Artifact-typed attachments win over file extension so a "Data Snapshot"
 * doesn't just display as "JSON". For plain uploads, the file extension
 * drives the badge; mime type is the final fallback.
 */
export function BadgeTextForAttachment(attachment: MessageAttachment): string {
    if (attachment.artifactTypeName) {
        return ShortBadgeText(attachment.artifactTypeName);
    }
    const name = attachment.fileName ?? '';
    const dot = name.lastIndexOf('.');
    if (dot > 0 && dot < name.length - 1) {
        return name.slice(dot + 1).toUpperCase().slice(0, 10);
    }
    const mimeTail = attachment.mimeType?.split('/').pop()?.split(';')[0]?.trim();
    if (mimeTail) return mimeTail.toUpperCase().slice(0, 10);
    return 'FILE';
}
