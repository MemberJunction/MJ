/**
 * Role of a rendered message at the LLM API layer.
 * Mirrors the `role` field on the ChatMessage shape MJ's AIPromptRunner expects
 * inside `AIPromptParams.conversationMessages`.
 */
export type BLAMessageRole = 'system' | 'user' | 'assistant';

/**
 * A single ChatMessage destined for `AIPromptParams.conversationMessages`.
 * Kept narrow on purpose so the BLA layer doesn't entangle with the broader
 * ChatMessage type evolution in @memberjunction/ai-core-plus.
 */
export interface BLAChatMessage {
    role: BLAMessageRole;
    content: string;
}

/**
 * Database-shape row from betty.PromptComponent. Used internally by
 * BLAPromptAssembler — the action layer never sees this type directly.
 */
export interface BLAPromptComponentRow {
    ID: string;
    PromptID: string;
    Name: string;
    Description: string | null;
    Text: string;
    Sort: number;
    Role: 'System' | 'User' | 'Assistant';
    OrganizationID: string | null;
    InstanceID: string | null;
}

/**
 * Inputs to BLAPromptAssembler.Assemble. PromptID is resolved by the caller
 * before invoking (the action layer turns PromptName into PromptID via
 * a lookup on __mj.AIPrompt).
 */
export interface BLAAssembleParams {
    PromptID: string;
    OrganizationID?: string | null;
    InstanceID?: string | null;
    ConversationHistory: BLAChatMessage[];
}

/**
 * Outputs of BLAPromptAssembler.Assemble.
 *
 * - AssembledSystemText: all System-role matched components concatenated by
 *   Sort with '\n\n' separators. Goes into `AIPromptParams.data.BettyPrompt`
 *   so the seed Template's `{{BettyPrompt}}` placeholder has something to
 *   substitute (useful for auditability via the rendered prompt on the
 *   AIPromptRun record).
 * - AssembledMessages: the actual structured payload — caller-supplied
 *   ConversationHistory first, then every matched component in Sort order
 *   keeping its original Role. This is what the LLM sees as
 *   `conversationMessages`.
 * - SelectedComponentCount: count of distinct (Name) winners after the
 *   specificity cascade. Surfaced as an output param for telemetry.
 */
export interface BLAAssembleResult {
    AssembledSystemText: string;
    AssembledMessages: BLAChatMessage[];
    SelectedComponentCount: number;
}
