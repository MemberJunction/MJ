/**
 * @module @memberjunction/ai-form-builder/interfaces
 *
 * Payload contracts shared by the Form Builder Designer (LLM) and Builder
 * (deterministic code-agent). The Designer fills the payload; the Builder
 * reads it and persists.
 *
 * **Naming convention**: PascalCase keys throughout — matches the rest of
 * the MJ agent-payload world (AgentSpec, SchemaDesign, etc.) and lets us
 * surface these in the prompt templates without the LLM having to convert
 * case when emitting JSON.
 */

import type { ComponentSpec } from '@memberjunction/interactive-component-types';

/**
 * High-level intent — the Designer LLM fills this from the user's
 * natural-language request and any prior conversation context. The Builder
 * uses it (together with the existing-override state) to decide:
 *   - Create vs Modify
 *   - VersionBumpKind to pass to Modify
 */
export interface FormBuilderIntent {
    /**
     * Whether the result should be a brand-new override (Create) or an
     * update to an existing one (Modify). 'auto' lets the Builder decide
     * based on `ExistingOverride` presence.
     */
    Operation: 'create' | 'modify' | 'auto';

    /** Fully-qualified entity name the form binds to, e.g. "MJ: Applications". */
    EntityName: string;

    /**
     * How to bump the version when calling Modify. 'auto' lets the Builder
     * pick based on source status: Pending→in-place, Active→minor,
     * Inactive→patch. Used only by Modify (not Create).
     */
    VersionBumpKind?: 'in-place' | 'patch' | 'minor' | 'major' | 'auto';

    /** One-line restatement of what the user asked for. Useful for log + Notes. */
    UserPromptSummary: string;
}

/**
 * Identity of an existing override the Designer wants to operate on.
 * Populated by the Designer from `appContext.ActiveForm` when present,
 * or by the Builder's discovery step when it has to look it up.
 */
export interface FormBuilderExistingOverride {
    OverrideID: string;
    ComponentID: string;
    CurrentVersion: string;
    Status: 'Active' | 'Pending' | 'Inactive';
    /** Component.Name — the lineage identity. Must match `Spec.name` on Modify. */
    ComponentName: string;
}

/**
 * Outcome of the Builder's persistence step. Written into the payload so
 * the orchestrator + the chat UI can surface the result.
 */
export interface FormBuilderBuilderResult {
    Success: boolean;
    Mode: 'create' | 'in-place' | 'new-version';
    ComponentID?: string;
    OverrideID?: string;
    Version?: string;
    BumpKind?: 'in-place' | 'patch' | 'minor' | 'major';
    /** Total attempts spent on lint-fix retries (1 = success on first try). */
    LintAttempts: number;
    /** When `Success=false`, the last error returned by the action. */
    ErrorMessage?: string;
    /** Codes seen during the lint-fix retry loop, in order, for diagnostics. */
    LintHistory?: ReadonlyArray<{ Attempt: number; ResultCode: string; Message: string }>;
}

/**
 * The full payload carried between Designer and Builder.
 *
 * The Designer's job is to produce `Intent` + `Spec`. Everything else is
 * either input from the cockpit's app context or output from the Builder.
 */
export interface FormBuilderPayload {
    /**
     * Number of times the orchestrator has routed to the Designer
     * sub-agent in this run. Incremented by `FormBuilderAgent.determineNextStep`
     * before each Designer call. Caps at `MAX_DESIGNER_ATTEMPTS` (3) — past
     * that, the orchestrator terminates the run with Failed instead of
     * looping. Protects against scenarios where the Designer sub-agent
     * itself fails to start (e.g. prompt-template render error) and the
     * "no Designer output → call Designer" intercept would otherwise spin
     * forever.
     */
    DesignerAttemptCount?: number;

    /** Filled by the Designer from the user request. */
    Intent?: FormBuilderIntent;
    /**
     * The final ComponentSpec the Builder should persist. Designer emits
     * this as a fully-formed object with `componentRole: 'form'` set, the
     * function name matching `Spec.name`, libraries declared, etc.
     */
    Spec?: ComponentSpec;
    /**
     * Existing override identity — passed in by the cockpit via
     * `callerContext` (recommended) OR resolved by the Builder via lookup.
     * Optional when the Designer is asked to author a brand-new form.
     */
    ExistingOverride?: FormBuilderExistingOverride;
    /**
     * Optional: pre-fetched curated schema for the target entity. The
     * Designer typically pulls this via `Get Entity Schema For Form`
     * (read-only action) and stores it here so the Builder can lint-check
     * field references.
     */
    EntitySchemaContext?: unknown;
    /** Filled by the Builder once persistence completes (success or fail). */
    BuilderResult?: FormBuilderBuilderResult;
}

/**
 * Status codes the lint-fix retry loop treats as retryable. Anything else
 * surfaces as a terminal failure. Kept narrow on purpose — random "save
 * failed" errors should NOT trigger LLM-fixup loops.
 */
export const RETRYABLE_LINT_CODES: ReadonlyArray<string> = [
    'LINT_FAILED',
    'LINEAGE_NAME_MISMATCH',
];
