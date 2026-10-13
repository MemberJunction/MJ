import type { AgentChatMessage, ClientToolMediaItem, ClientToolResultSummary } from '@memberjunction/ai-core-plus';
import type { ChatMessageContent, ChatMessageContentBlock } from '@memberjunction/ai';

/** Expiration for a client tool result message without images: it is removed after 3 turns. */
export const CLIENT_TOOL_RESULT_EXPIRATION = { expirationTurns: 3, expirationMode: 'Remove' } as const;

/** Expiration for a client tool result message with images: it is removed after 2 turns, so screenshots leave the context soon. */
export const CLIENT_TOOL_IMAGE_RESULT_EXPIRATION = { expirationTurns: 2, expirationMode: 'Remove' } as const;

/** The token estimate for one image block: a high estimate of what vision models charge for a 1280×800 image. */
export const IMAGE_BLOCK_TOKEN_ESTIMATE = 1600;

/** A content block type that carries media: every type other than text and tool results. */
type MediaBlockType = Exclude<ChatMessageContentBlock['type'], 'text' | 'tool_result'>;

/** The stub that replaces each kind of media block in text. */
const MEDIA_BLOCK_STUBS: Record<MediaBlockType, string> = {
    image_url: '[image omitted]',
    file_url: '[file omitted]',
    audio_url: '[audio omitted]',
    video_url: '[video omitted]',
};

/**
 * The character cap for one client tool result from the agent type prompt params.
 * -1 means no cap. Anything that is not a positive integer means no cap.
 */
export function ResolveClientToolResultMaxChars(promptParams: Record<string, unknown> | undefined): number {
    const raw = promptParams?.['clientToolResultMaxChars'];
    return typeof raw === 'number' && Number.isInteger(raw) && raw > 0 ? raw : -1;
}

/**
 * Markdown summary of client tool results for the conversation. Each successful result is
 * included in full, or cut to `maxChars` with a note that says how much was cut. A `maxChars`
 * that is not a positive integer, such as -1 or 0, means no cap.
 */
export function FormatClientToolResults(results: ClientToolResultSummary[], maxChars: number): string {
    const failedCount = results.filter(r => !r.Success).length;
    const header = failedCount > 0
        ? `${failedCount} of ${results.length} client tool(s) failed:`
        : 'Client tool results:';

    const lines = results.map(r => {
        const icon = r.Success ? '✓' : '✗';
        let line = `${icon} **${r.ToolName}**: ${r.Success ? 'succeeded' : 'failed'}`;
        if (r.ErrorMessage) line += ` — ${r.ErrorMessage}`;
        if (r.Success && r.Result != null) {
            line += `\n  Result: ${capResult(r.Result, maxChars)}`;
        }
        return line;
    });

    return `${header}\n${lines.join('\n')}`;
}

/**
 * The conversation message for client tool results. Images come first as `image_url` blocks and
 * the markdown summary follows as a text block, so a vision model sees both. Only successful
 * results contribute images, and each image block carries its tool's name as `fileName`.
 * Without images the content is the plain markdown string.
 */
export function BuildClientToolResultMessage(results: ClientToolResultSummary[], turnAdded: number, maxChars: number): AgentChatMessage {
    const text = FormatClientToolResults(results, maxChars);
    const imageBlocks = results.flatMap(r => (r.Success && r.Media) ? r.Media.map(m => toImageBlock(m, r.ToolName)) : []);
    if (imageBlocks.length === 0) {
        return { role: 'user', content: text, metadata: { turnAdded, messageType: 'client-tool-result', ...CLIENT_TOOL_RESULT_EXPIRATION } };
    }
    return {
        role: 'user',
        content: [...imageBlocks, { type: 'text', content: text }],
        metadata: { turnAdded, messageType: 'client-tool-result', ...CLIENT_TOOL_IMAGE_RESULT_EXPIRATION },
    };
}

/** Whether a content block carries an image, audio, video or file rather than text or a tool result. */
export function IsMediaBlock(block: ChatMessageContentBlock): block is ChatMessageContentBlock & { type: MediaBlockType } {
    return block.type !== 'text' && block.type !== 'tool_result';
}

/**
 * The text of a message with every media block replaced by a stub that names its kind, such as
 * `[image omitted]` or `[file omitted]`. Text and tool result blocks keep their content.
 */
export function ReplaceMediaBlocksWithStubs(content: ChatMessageContent): string {
    if (typeof content === 'string') return content;
    return content.map(block => IsMediaBlock(block) ? MEDIA_BLOCK_STUBS[block.type] : block.content).join('\n');
}

/** An `image_url` block for one client tool image, with the tool's name as its file name. */
function toImageBlock(media: ClientToolMediaItem, toolName: string): ChatMessageContentBlock {
    return { type: 'image_url', content: `data:${media.MimeType};base64,${media.Base64}`, mimeType: media.MimeType, fileName: toolName };
}

/**
 * The result as text. When `maxChars` is a positive integer and the text is longer, the text is
 * cut to `maxChars` and a note says how much was cut. The cut never splits a surrogate pair.
 */
function capResult(result: unknown, maxChars: number): string {
    const text = typeof result === 'string' ? result : JSON.stringify(result);
    if (!Number.isInteger(maxChars) || maxChars <= 0 || text.length <= maxChars) return text;
    const keep = isHighSurrogate(text.charCodeAt(maxChars - 1)) ? maxChars - 1 : maxChars;
    return `${text.slice(0, keep)} [truncated ${text.length - keep} of ${text.length} chars]`;
}

/** Whether a UTF-16 code unit is the first half of a surrogate pair (U+D800 to U+DBFF). */
function isHighSurrogate(codeUnit: number): boolean {
    return codeUnit >= 0xd800 && codeUnit <= 0xdbff;
}
