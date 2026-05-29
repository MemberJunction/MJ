/**
 * @module form-builder-agent
 *
 * Top-level orchestrator for the new (v2) Form Builder agent. Mirrors
 * the `DatabaseDesignerAgent` pattern — extends `BaseAgent` and overrides
 * `determineNextStep` to **force** specific Designer → Builder transitions
 * deterministically instead of relying on the LLM to choose them.
 *
 * Transition rules (in order):
 *
 *   1. **Designer not yet run** → call Designer sub-agent.
 *   2. **Designer's output is valid (Intent + Spec present) AND
 *      BuilderResult is absent** → call Builder sub-agent.
 *   3. **BuilderResult is set** → terminate with the builder's outcome
 *      (no LLM "summarize" turn — the cockpit's chat already shows the
 *      builder result via the agent run's terminating step).
 *
 * The LLM only ever runs as the Designer. The orchestrator never runs a
 * prompt itself — it's pure routing. Compared to the old loop-style Form
 * Builder this eliminates the "polish forever" failure mode entirely.
 */

import { BaseAgent } from '@memberjunction/ai-agents';
import type {
    ExecuteAgentParams,
    BaseAgentNextStep,
    AIPromptRunResult,
} from '@memberjunction/ai-core-plus';
import type { MJAIAgentTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { LogStatus } from '@memberjunction/core';

import type { FormBuilderPayload } from '../interfaces.js';

const DESIGNER_AGENT_NAME = 'Form Builder - Designer';
const BUILDER_AGENT_NAME  = 'Form Builder - Builder';

/**
 * Hard cap on Designer routings per run. A Designer call that comes back
 * WITHOUT producing valid Intent + Spec (template render failure,
 * sub-agent crash, network error before the LLM even ran, repeated
 * validateSuccessNextStep retries that the framework eventually marks
 * Failed, etc.) would otherwise loop forever because Intercept 3's "no
 * Designer output → call Designer" condition stays true. 3 attempts give
 * the LLM room to recover from transient issues while bounding the
 * worst-case spend.
 */
const MAX_DESIGNER_ATTEMPTS = 3;

const DESIGNER_MESSAGE =
    'Design the requested form. Read appContext.ActiveForm if present and the user request. ' +
    'Emit a complete ComponentSpec into payload.Spec and an Intent envelope into payload.Intent, ' +
    'then return Success. Do NOT call Create / Modify actions — the Builder sub-agent persists.';

const BUILDER_MESSAGE =
    'Persist payload.Spec via Create Interactive Form or Modify Interactive Form based on payload.Intent. ' +
    'On LINT_FAILED / LINEAGE_NAME_MISMATCH, run the lint-fix prompt and retry (up to 3 attempts). ' +
    'Write BuilderResult to payload and terminate.';

@RegisterClass(BaseAgent, 'FormBuilderAgent')
export class FormBuilderAgent extends BaseAgent {

    protected override async determineNextStep<P>(
        params: ExecuteAgentParams,
        agentType: MJAIAgentTypeEntity,
        promptResult: AIPromptRunResult,
        currentPayload: P,
    ): Promise<BaseAgentNextStep<P>> {
        const payload = (currentPayload as unknown as FormBuilderPayload | undefined) ?? {};

        // Intercept 1 — Builder has run, terminate with its outcome.
        if (payload.BuilderResult) {
            const result = payload.BuilderResult;
            const summary = result.Success
                ? this.buildSuccessSummary(payload)
                : this.buildFailureSummary(payload);
            LogStatus(`🔒 FormBuilderAgent: BuilderResult present (Success=${result.Success}) — terminating.`);
            return {
                terminate: true,
                step: result.Success ? 'Success' : 'Failed',
                reasoning: summary,
                message: summary,
                errorMessage: result.Success ? undefined : (result.ErrorMessage ?? summary),
                newPayload: payload as unknown as P,
            };
        }

        // Intercept 2 — Designer's payload is complete (Intent + Spec), no
        // BuilderResult yet → route to Builder.
        if (this.designerOutputReady(payload)) {
            LogStatus(`🔒 FormBuilderAgent: Designer output ready — routing to "${BUILDER_AGENT_NAME}".`);
            return {
                step: 'Sub-Agent',
                terminate: false,
                previousPayload: payload as unknown as P,
                newPayload: payload as unknown as P,
                subAgent: {
                    name: BUILDER_AGENT_NAME,
                    message: BUILDER_MESSAGE,
                    terminateAfter: true,  // FormBuilderAgent's job is done after Builder runs
                },
            };
        }

        // Intercept 3 — No (valid) Designer payload yet → route to Designer.
        // This catches both "first turn" (no Intent/Spec at all) AND the case
        // where the Designer's previous turn left them present-but-empty
        // (which `designerOutputReady` rejected above). Either way we ask
        // the Designer for another pass instead of burning a Builder attempt.
        //
        // Hard budget on Designer routings — if we hit it without ever
        // producing a valid Spec/Intent, terminate with Failed rather than
        // spin forever. Bound case: template-render error on the Designer's
        // prompt makes EVERY sub-agent call fail before the LLM even runs,
        // so the payload never gets filled, so `designerOutputReady` stays
        // false, so we'd otherwise route to Designer again forever.
        if (!this.designerOutputReady(payload)) {
            const attempts = payload.DesignerAttemptCount ?? 0;
            if (attempts >= MAX_DESIGNER_ATTEMPTS) {
                const msg = `Form Builder Designer failed to produce a valid spec after ${attempts} attempts. ` +
                    `Most likely a prompt-template render error or model failover loop — check the agent run's Designer steps for the actual error message and the cockpit's chat transcript.`;
                LogStatus(`🔒 FormBuilderAgent: Designer attempt budget exhausted (${attempts}/${MAX_DESIGNER_ATTEMPTS}) — terminating with Failed.`);
                return {
                    terminate: true,
                    step: 'Failed',
                    reasoning: msg,
                    message: msg,
                    errorMessage: msg,
                    newPayload: payload as unknown as P,
                };
            }
            const nextPayload = { ...payload, DesignerAttemptCount: attempts + 1 };
            LogStatus(`🔒 FormBuilderAgent: no Designer output yet (attempt ${attempts + 1}/${MAX_DESIGNER_ATTEMPTS}) — routing to "${DESIGNER_AGENT_NAME}".`);
            return {
                step: 'Sub-Agent',
                terminate: false,
                previousPayload: payload as unknown as P,
                newPayload: nextPayload as unknown as P,
                subAgent: {
                    name: DESIGNER_AGENT_NAME,
                    message: DESIGNER_MESSAGE,
                    terminateAfter: false,  // Come back after Designer so we can route to Builder
                },
            };
        }

        // Fallback — defer to the base LLM-driven decision. In practice
        // this branch shouldn't fire because the three intercepts cover
        // the lifecycle. If a malformed state arrives the LLM gets a
        // chance to recover.
        return super.determineNextStep(params, agentType, promptResult, currentPayload);
    }

    private designerOutputReady(p: FormBuilderPayload): boolean {
        if (!p.Spec || !p.Intent) return false;
        const spec = p.Spec as unknown as Record<string, unknown>;
        const name = typeof spec.name === 'string' ? spec.name.trim() : '';
        const code = typeof spec.code === 'string' ? spec.code.trim() : '';
        const entity = p.Intent.EntityName?.trim() ?? '';
        // All three must be non-empty. Anything less and we'd route an
        // invalid spec to the Builder — its preconditions would catch it,
        // but we'd rather circle back to the Designer for another design
        // pass instead of burning a Builder attempt on a known-broken
        // payload.
        return name.length > 0 && code.length > 0 && entity.length > 0;
    }

    private buildSuccessSummary(p: FormBuilderPayload): string {
        const r = p.BuilderResult!;
        const entity = p.Intent?.EntityName ?? '<unknown entity>';
        if (r.Mode === 'in-place') {
            return `Updated the Pending v${r.Version ?? '?'} form for **${entity}** in place. ` +
                `Open Form Builder to preview the changes. ${r.LintAttempts > 1 ? `(${r.LintAttempts} attempts)` : ''}`.trim();
        }
        const verb = r.Mode === 'create' ? 'Created' : 'Saved';
        return `${verb} a Pending v${r.Version ?? '?'} of the **${entity}** form. ` +
            `Open Form Builder, find v${r.Version ?? '?'} in the version rail, and click Activate to make it live. ` +
            `Your currently-Active form (if any) is untouched. ${r.LintAttempts > 1 ? `(${r.LintAttempts} lint attempts)` : ''}`.trim();
    }

    private buildFailureSummary(p: FormBuilderPayload): string {
        const r = p.BuilderResult!;
        const entity = p.Intent?.EntityName ?? '<unknown entity>';
        const attempts = r.LintAttempts || 0;
        return `Could not save the **${entity}** form after ${attempts} attempt(s). ` +
            `Last error: ${r.ErrorMessage ?? 'unknown'}. ` +
            `You can refine your request and try again, or open Form Builder to inspect the current Pending version.`;
    }
}

/** Tree-shaking guard. */
export function LoadFormBuilderAgent(): void {
    if (false as boolean) {
        const _: unknown = FormBuilderAgent;
    }
}
