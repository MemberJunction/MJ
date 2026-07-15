/**
 * @fileoverview Single source of truth for the markdown tool-result section shape
 * rendered back into the LLM's context:
 *
 * ```
 * ### [ordinal. ][prefix.]tool({...input})
 * ```json
 * ...result data...
 * ```
 * ```
 *
 * Three call sites feed this shape to the model — same-turn conversation-tool
 * injection, same-turn artifact-tool injection, and the prior-turn carry-forward
 * message — and the loop-agent system prompt teaches the model to read it. All of
 * them must render through these functions so the contract cannot drift between
 * paths. Callers own size-capping policy; these functions only own the shape.
 *
 * @module @memberjunction/ai-agents
 */

/** Identifies one tool call within a rendered result section. */
export interface ToolResultSectionParts {
    /** The tool name, e.g. `getMessageBySequence` */
    tool: string;
    /** The tool's input object (rendered as compact JSON in the heading) */
    input: unknown;
    /** 1-based ordinal when rendering a numbered multi-result message */
    ordinal?: number;
    /** Signature prefix for target-scoped tools, e.g. an artifact ID (`{prefix}.{tool}(...)`) */
    signaturePrefix?: string;
}

function formatHeading(parts: ToolResultSectionParts): string {
    const ordinal = parts.ordinal !== undefined ? `${parts.ordinal}. ` : '';
    const prefix = parts.signaturePrefix ? `${parts.signaturePrefix}.` : '';
    return `### ${ordinal}${prefix}${parts.tool}(${JSON.stringify(parts.input || {})})`;
}

/** Renders result data for the fenced block: strings pass through, everything else pretty-JSON. */
export function RenderToolResultData(data: unknown): string {
    return typeof data === 'string' ? data : JSON.stringify(data, null, 2);
}

/** One successful tool-result section: heading + fenced JSON body (body already capped by the caller). */
export function FormatToolResultSection(parts: ToolResultSectionParts, body: string): string {
    return `${formatHeading(parts)}\n\`\`\`json\n${body}\n\`\`\``;
}

/** One failed tool-result section: heading + bolded error line. */
export function FormatToolErrorSection(parts: ToolResultSectionParts, errorMessage: string | undefined): string {
    return `${formatHeading(parts)}\n**Error:** ${errorMessage}`;
}
