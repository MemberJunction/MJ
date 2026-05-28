/**
 * @module form-builder-designer-agent
 *
 * LLM-driven sub-agent responsible for the **design phase** of form
 * authoring. Reads the user's natural-language request + the cockpit's
 * `appContext.ActiveForm` payload, produces a complete `ComponentSpec`
 * and `FormBuilderIntent` into the agent payload, and stops.
 *
 * **Crucial contract**: this agent does NOT call `Create Interactive
 * Form` / `Modify Interactive Form`. It only fills the payload. The
 * top-level `FormBuilderAgent` orchestrator routes the result to the
 * deterministic `FormBuilderBuilderAgent` to persist.
 *
 * Termination is gated by `validateSuccessNextStep` — if the payload is
 * incomplete or the spec fails a structural pre-lint, we return
 * `step: 'Retry'` with explicit guidance instead of letting the LLM mark
 * the work as done. This is the same pattern Agent Manager's Architect
 * uses to keep agents from "Success"-ing with garbage.
 */

import { BaseAgent } from '@memberjunction/ai-agents';
import type {
    ExecuteAgentParams,
    BaseAgentNextStep,
    MJAIAgentRunEntityExtended,
    MJAIAgentRunStepEntityExtended,
} from '@memberjunction/ai-core-plus';
import { RegisterClass } from '@memberjunction/global';

import type { FormBuilderPayload, FormBuilderIntent } from '../interfaces.js';

@RegisterClass(BaseAgent, 'FormBuilderDesignerAgent')
export class FormBuilderDesignerAgent extends BaseAgent {

    /**
     * Validate the Designer's output before letting the framework mark
     * the step as Success. Failures return `step: 'Retry'` with explicit
     * remediation guidance — the LLM gets another pass to fix the spec
     * without us calling the Builder on bad data.
     */
    protected override async validateSuccessNextStep<P>(
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        currentPayload: P,
        agentRun: MJAIAgentRunEntityExtended,
        currentStep: MJAIAgentRunStepEntityExtended,
    ): Promise<BaseAgentNextStep<P>> {
        // Run base validation first (handles schema-level checks).
        const base = await super.validateSuccessNextStep(params, nextStep, currentPayload, agentRun, currentStep);
        if (base.step === 'Retry') return base;

        // The Designer's effective payload is the post-change snapshot —
        // either nextStep.newPayload (when the LLM emitted payloadChangeRequest)
        // or the currentPayload (when it didn't).
        const effective = (nextStep.newPayload ?? currentPayload) as unknown as FormBuilderPayload;
        const errors = this.validateDesignerPayload(effective);
        if (errors.length > 0) {
            return {
                ...nextStep,
                step: 'Retry',
                retryInstructions: this.formatRetry(errors),
                newPayload: nextStep.newPayload,
            };
        }
        return nextStep;
    }

    /**
     * Structural validation of the Designer's payload. Each rule returns
     * a short, actionable error string when the rule fails.
     *
     * We pre-lint here (not the full lint that the Builder runs) so the
     * LLM can fix obvious mistakes — missing `componentRole`, function-
     * name/Spec.name mismatch, no `code` field, missing Intent fields —
     * in-loop, without bouncing through a failed Builder attempt.
     */
    private validateDesignerPayload(p: FormBuilderPayload): string[] {
        const errors: string[] = [];

        // ── Intent envelope ────────────────────────────────────────────
        const intent = p.Intent;
        if (!intent) {
            errors.push(`❌ payload.Intent is missing. Emit an Intent object with { Operation, EntityName, VersionBumpKind, UserPromptSummary }.`);
        } else {
            if (!intent.Operation) {
                errors.push(`❌ payload.Intent.Operation is missing. Allowed: 'create' | 'modify' | 'auto'.`);
            } else if (!['create', 'modify', 'auto'].includes(intent.Operation)) {
                errors.push(`❌ payload.Intent.Operation='${intent.Operation}' is not allowed. Use 'create' | 'modify' | 'auto'.`);
            }
            if (!intent.EntityName?.trim()) {
                errors.push(`❌ payload.Intent.EntityName is missing. Set the fully-qualified entity name (e.g. "MJ: Applications").`);
            }
            if (!intent.UserPromptSummary?.trim()) {
                errors.push(`❌ payload.Intent.UserPromptSummary is missing. One-line restatement of what the user asked for.`);
            }
            if (intent.VersionBumpKind && !['in-place', 'patch', 'minor', 'major', 'auto'].includes(intent.VersionBumpKind)) {
                errors.push(`❌ payload.Intent.VersionBumpKind='${intent.VersionBumpKind}' is not allowed. Use 'in-place' | 'patch' | 'minor' | 'major' | 'auto' (or omit for auto).`);
            }
        }

        // ── ComponentSpec structural pre-lint ──────────────────────────
        const spec = p.Spec as unknown as Record<string, unknown> | undefined;
        if (!spec) {
            errors.push(`❌ payload.Spec is missing. Emit the full ComponentSpec the Builder should persist.`);
        } else {
            const name = typeof spec.name === 'string' ? spec.name.trim() : '';
            const code = typeof spec.code === 'string' ? spec.code.trim() : '';
            const role = spec.componentRole;
            const role_ok = role === 'form';

            if (!name) {
                errors.push(`❌ payload.Spec.name is missing. Set it to the Component lineage name.`);
            }
            if (!code) {
                errors.push(`❌ payload.Spec.code is missing. Emit the full JSX function body.`);
            }
            if (!role_ok) {
                errors.push(`❌ payload.Spec.componentRole must be exactly 'form'. Got: ${JSON.stringify(role)}.`);
            }

            // function-name matches Spec.name (avoids component-name-mismatch lint later)
            if (name && code) {
                const fnMatch = /function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/.exec(code);
                if (!fnMatch) {
                    errors.push(`❌ payload.Spec.code must declare a top-level function. Expected \`function ${name}(...) { ... }\`.`);
                } else if (fnMatch[1] !== name) {
                    errors.push(`❌ payload.Spec.code declares \`function ${fnMatch[1]}(...)\` but Spec.name is "${name}". They MUST match — rename the function to "${name}".`);
                }
            }

            // Lineage guard: if we have an ExistingOverride, the spec name must match.
            const existing = p.ExistingOverride;
            if (existing?.ComponentName && name && existing.ComponentName !== name) {
                errors.push(`❌ Lineage mismatch: payload.ExistingOverride.ComponentName="${existing.ComponentName}" but payload.Spec.name="${name}". Modify operates on the existing lineage — set Spec.name (and the function declaration in Spec.code) to "${existing.ComponentName}".`);
            }

            // Defensive — well-known bogus RunView shapes seen in the wild.
            if (code) {
                if (/utilities\.rv\.RunView\([^)]*\bFilters\s*:/.test(code)) {
                    errors.push(`❌ Invalid RunView call: \`Filters: [...]\` is not a property. Use \`ExtraFilter: '<SQL fragment>'\` instead.`);
                }
                if (/utilities\.rv\.RunView\([^)]*\bFilter\s*:/.test(code) && !/ExtraFilter/.test(code)) {
                    errors.push(`❌ Invalid RunView call: \`Filter: ...\` is not a property. The valid property is \`ExtraFilter: '<SQL fragment>'\`.`);
                }
                if (/utilities\.React\b/.test(code)) {
                    errors.push(`❌ \`utilities.React\` does not exist. React is a runtime-injected global — use \`React.useState\`, \`React.useEffect\` directly. Valid utilities are exactly: rv, rq, md, ai.`);
                }
                if (/^\s*import\s+/m.test(code)) {
                    errors.push(`❌ Top-level \`import\` statements are forbidden. All dependencies are injected via the function arguments (utilities, components, libraries, etc.).`);
                }
            }
        }

        // ── Operation/ExistingOverride consistency ──────────────────────
        if (intent?.Operation === 'modify' && !p.ExistingOverride) {
            // 'auto' is fine without ExistingOverride — the Builder will look one up.
            // But explicit 'modify' without an OverrideID is ambiguous.
            errors.push(`❌ payload.Intent.Operation='modify' requires payload.ExistingOverride to be populated. Use 'auto' if you want the Builder to discover the override.`);
        }
        if (intent?.Operation === 'create' && p.ExistingOverride) {
            errors.push(`⚠️ payload.Intent.Operation='create' but payload.ExistingOverride is set. If you intend to overwrite the existing form, use 'modify' or 'auto'. If you intend to create a brand-new override for a different entity, clear ExistingOverride.`);
        }

        return errors;
    }

    private formatRetry(errors: string[]): string {
        return [
            'Your Designer output is incomplete or invalid. Fix the issues below and re-emit the payload.',
            'Remember: you do NOT call Create / Modify actions yourself. Just fill payload.Spec + payload.Intent and return Success — the Builder takes over from there.',
            '',
            ...errors.map((e, i) => `${i + 1}. ${e}`),
        ].join('\n');
    }
}

/** Tree-shaking guard. */
export function LoadFormBuilderDesignerAgent(): void {
    if (false as boolean) {
        const _: unknown = FormBuilderDesignerAgent;
    }
}

// Re-export the payload type from interfaces for prompt-template generators
// that read this file's exports.
export type { FormBuilderPayload, FormBuilderIntent };
