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

/**
 * The tool families whose step results are eligible for prior-turn carry-forward —
 * single source of the family values. Stamp sites and the eligibility check both
 * derive from this map so a renamed value breaks at compile time, never silently.
 */
export const CarryForwardToolFamily = {
    Conversation: 'conversation',
    Artifact: 'artifact'
} as const;

/** One of the {@link CarryForwardToolFamily} values. */
export type CarryForwardToolFamilyValue = typeof CarryForwardToolFamily[keyof typeof CarryForwardToolFamily];

/**
 * The cross-turn contract persisted in a tool step's `OutputData` by the conversation- and
 * artifact-tool executors and read back by `BaseAgent.BuildPriorTurnToolResultsMessage` on
 * the NEXT run. Write sites construct this type and the reader parses into a Partial of it,
 * so the two sides cannot drift without a compile error.
 */
export interface CarryForwardToolStepOutput {
    /** Structured carry-forward discriminator — StepName is display-only */
    toolFamily: CarryForwardToolFamilyValue;
    /** The tool that produced this result */
    tool: string;
    /** The tool's input object */
    input: unknown;
    /** The tool outcome; only `success === true` results are carried forward */
    result: { success: boolean; data?: unknown; errorMessage?: string };
    /** Invocation duration in milliseconds */
    durationMs?: number;
    /** Artifact-family only: the artifact the tool ran against */
    artifactId?: string;
    /** summarizeRange only: the recursive sub-call's AIPromptRun ID */
    promptRunId?: string;
}

/** The minimal step projection the prior-turn carry-forward loader fetches and the renderer reads. */
export interface CarryForwardStepRecord {
    OutputData: string | null;
}

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
