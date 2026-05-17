/**
 * Pure helpers for how artifact content is stored and unwrapped across the
 * upload, gather, and resolver paths. Living in MJCoreEntities so both the
 * server-side entity hook (MJConversationDetailAttachmentEntityServer) and
 * the agent runtime (AgentRunner.gatherConversationArtifacts) share a single
 * source of truth — and so they're unit-testable without mounting either
 * the entity stack or the agent runtime.
 */

const TEXTY_NON_TEXT_PREFIXED_MIMES = new Set([
    'application/json',
    'application/xml',
    'application/javascript',
    'application/typescript',
    'application/sql',
    'application/csv',
]);

/**
 * Returns true when bytes for this MIME should be stored as raw UTF-8 text
 * (so artifact tool libraries can JSON.parse / split-by-line directly).
 * Returns false for binary types whose tools work with the data-URL wrapper
 * or a FileID reference.
 */
export function IsTextyMime(mime: string): boolean {
    const lower = mime.toLowerCase();
    if (lower.startsWith('text/')) return true;
    return TEXTY_NON_TEXT_PREFIXED_MIMES.has(lower);
}

/**
 * Decides how to store inline content on the paired ArtifactVersion for a
 * given MIME + base64 InlineData input. Text-y MIMEs get decoded to UTF-8
 * so artifact tool libraries can parse directly; binary MIMEs keep the
 * `data:<mime>;base64,…` wrapper so the resolver can recognize media for
 * inline routing and the gather path can re-decode to a Buffer for binary
 * tool libraries (xlsx, docx, pdf).
 */
export function DecideInlineStorage(mime: string, inlineData: string | null | undefined): {
    contentMode: 'Text';
    content: string;
} {
    if (!inlineData) return { contentMode: 'Text', content: '' };
    if (IsTextyMime(mime)) {
        return { contentMode: 'Text', content: Buffer.from(inlineData, 'base64').toString('utf-8') };
    }
    return { contentMode: 'Text', content: `data:${mime};base64,${inlineData}` };
}

/**
 * Builds the user-facing error string returned when an attachment's MIME
 * isn't registered with any ArtifactType.
 */
export function BuildUnregisteredMimeError(fileName: string | null | undefined, _mime: string): string {
    const safeName = fileName ?? 'this file';
    return `"${safeName}" can't be attached — its file type isn't supported here. Try a PDF, Word, Excel, image, audio, video, JSON, CSV, XML, or plain-text file.`;
}

/**
 * Decodes a `data:<mime>;base64,<payload>` URL into a raw Buffer when the
 * input matches that shape. Returns the input unchanged otherwise. Used by
 * the AgentRunner gather path so binary tool libraries (xlsx, docx, pdf)
 * receive a parseable Buffer instead of the wrapped data URL string.
 */
export function ExtractBase64FromDataUrl(input: string): string | Buffer {
    const match = /^data:[^;]+;base64,(.*)$/s.exec(input);
    if (!match) return input;
    return Buffer.from(match[1], 'base64');
}
