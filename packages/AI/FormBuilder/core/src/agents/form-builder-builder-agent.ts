/**
 * @module form-builder-builder-agent
 *
 * Deterministic code-agent that **persists** the Designer's `ComponentSpec`
 * via `Create Interactive Form` or `Modify Interactive Form`. Bypasses the
 * LLM loop entirely (`executeAgentInternal` override).
 *
 * **Lint-fix retry loop**: when the persistence action returns a retryable
 * code (LINT_FAILED, LINEAGE_NAME_MISMATCH), instead of failing immediately
 * the Builder runs a focused **lint-fix prompt** (a SINGLE prompt
 * invocation via `AIPromptRunner`, NOT a nested agent run) to fix the spec
 * and retries the action. Up to 3 attempts. Each attempt is logged as its
 * own `MJ: AI Agent Run Step` row for traceability.
 *
 * **No iteration logic** for "polish the form some more" — the Builder
 * always terminates after the first SUCCESS or the retry budget runs out.
 */

import { BaseAgent } from '@memberjunction/ai-agents';
import { ActionEngineServer } from '@memberjunction/actions';
import type {
    ExecuteAgentParams,
    AgentConfiguration,
    BaseAgentNextStep,
    AIPromptRunResult,
} from '@memberjunction/ai-core-plus';
import { AIPromptParams } from '@memberjunction/ai-core-plus';
import { AIPromptRunner } from '@memberjunction/ai-prompts';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { LogError, LogStatus, Metadata, RunView } from '@memberjunction/core';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import type { ComponentSpec } from '@memberjunction/interactive-component-types';
import type { MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';

import { BaseFormBuilderCodeAgent } from './base-form-builder-code-agent.js';
import {
    type FormBuilderPayload,
    type FormBuilderBuilderResult,
    type FormBuilderExistingOverride,
    RETRYABLE_LINT_CODES,
} from '../interfaces.js';

/**
 * Max lint-fix attempts. Each attempt = (run lint-fix prompt → retry the
 * action). Set to 3 because most lint errors are mechanical (one method
 * misnamed, one missing import) and fixable in one pass; 3 covers cases
 * where the fix introduces a SECOND, different lint error. Anything past
 * 3 is almost always architectural and should surface to the user instead
 * of burning more tokens.
 */
const MAX_LINT_ATTEMPTS = 3;

/** Name of the prompt that fixes lint errors on a ComponentSpec. */
const LINT_FIX_PROMPT_NAME = 'Form Builder - Lint Fix';

@RegisterClass(BaseAgent, 'FormBuilderBuilderAgent')
export class FormBuilderBuilderAgent extends BaseFormBuilderCodeAgent {

    protected override async executeAgentInternal<P = FormBuilderPayload>(
        params: ExecuteAgentParams,
        _config: AgentConfiguration,
    ): Promise<{ finalStep: BaseAgentNextStep<P>; stepCount: number }> {
        const payload = (params.payload as FormBuilderPayload | undefined) ?? {};
        LogStatus(`🔨 Form Builder Builder: starting persistence`);

        // ── Pre-conditions ────────────────────────────────────────────
        const guard = this.validatePreconditions(payload);
        if (guard) {
            const newPayload = this.attachResult(payload, {
                Success: false,
                Mode: 'create',
                LintAttempts: 0,
                ErrorMessage: guard,
            });
            return this.buildCodeFailure(guard, newPayload as P);
        }

        // ── Provider + user ───────────────────────────────────────────
        const provider: IMetadataProvider =
            (params.provider ?? Metadata.Provider) as unknown as IMetadataProvider;
        const user = params.contextUser as UserInfo | undefined;
        if (!user) {
            const msg = 'No contextUser on params — Builder cannot persist.';
            return this.buildCodeFailure(msg, this.attachResult(payload, {
                Success: false, Mode: 'create', LintAttempts: 0, ErrorMessage: msg,
            }) as P);
        }

        // ── Resolve the operation (Create vs Modify) ──────────────────
        // The Designer may have set Operation='auto' or omitted ExistingOverride;
        // discover via RunView when needed.
        let existing = payload.ExistingOverride ?? null;
        let operation: 'create' | 'modify' = 'create';
        const intent = payload.Intent!;
        if (intent.Operation === 'modify') {
            if (!existing) {
                // Designer asked for modify but didn't supply ExistingOverride —
                // this shouldn't happen (Designer's validator rejects it) but
                // fall through to discovery for safety.
                existing = await this.discoverExistingOverride(provider, user, intent.EntityName);
            }
            if (!existing) {
                const msg = `Intent.Operation='modify' but no User-scope override found for entity '${intent.EntityName}'. Did you mean Operation='create'?`;
                return this.buildCodeFailure(msg, this.attachResult(payload, {
                    Success: false, Mode: 'create', LintAttempts: 0, ErrorMessage: msg,
                }) as P);
            }
            operation = 'modify';
        } else if (intent.Operation === 'create') {
            operation = 'create';
        } else {
            // 'auto' — discover and route
            existing = existing ?? await this.discoverExistingOverride(provider, user, intent.EntityName);
            operation = existing ? 'modify' : 'create';
        }

        // ── Lint-fix retry loop ──────────────────────────────────────
        const lintHistory: Array<{ Attempt: number; ResultCode: string; Message: string }> = [];
        let workingSpec = this.normalizeSpec(payload.Spec!, existing);
        let lastError = '';
        let lastResultCode = '';

        for (let attempt = 1; attempt <= MAX_LINT_ATTEMPTS; attempt++) {
            LogStatus(`🔨 Form Builder Builder: attempt ${attempt}/${MAX_LINT_ATTEMPTS} (${operation})`);
            const actionResult = await this.callPersistAction(
                params, provider, user, operation, workingSpec, intent, existing);

            if (actionResult.success) {
                const result: FormBuilderBuilderResult = {
                    Success: true,
                    Mode: actionResult.mode,
                    ComponentID: actionResult.componentID,
                    OverrideID: actionResult.overrideID,
                    Version: actionResult.version,
                    BumpKind: actionResult.bumpKind,
                    LintAttempts: attempt,
                    LintHistory: lintHistory.length ? lintHistory : undefined,
                };
                const newPayload = this.attachResult(payload, result);
                return this.buildCodeSuccess(
                    newPayload as P,
                    `Persisted ${actionResult.mode === 'in-place' ? 'in place' : `new version ${actionResult.version}`} for "${intent.EntityName}" after ${attempt} attempt(s).`,
                );
            }

            // Failed. If retryable AND we have attempts left, run the
            // lint-fix prompt and try again.
            lastError = actionResult.error;
            lastResultCode = actionResult.resultCode;
            lintHistory.push({ Attempt: attempt, ResultCode: lastResultCode, Message: lastError });

            const isRetryable = RETRYABLE_LINT_CODES.includes(lastResultCode);
            const hasBudget = attempt < MAX_LINT_ATTEMPTS;
            if (!isRetryable || !hasBudget) break;

            // Run the lint-fix prompt (single prompt invocation, NOT an agent run).
            const fixed = await this.runLintFixPrompt(
                params, user, workingSpec, lastResultCode, lastError, attempt);
            if (!fixed) {
                // Lint-fix prompt failed itself — abandon the retry loop.
                lastError = `${lastError}\n\n(Lint-fix prompt attempt ${attempt} could not produce a corrected spec; aborting retries.)`;
                break;
            }
            workingSpec = this.normalizeSpec(fixed, existing);
        }

        // ── Out of attempts — terminate with failure ─────────────────
        // Predicted mode for the failure record — best-effort for the cockpit
        // to render an "intended X but failed" message. We don't actually
        // know which mode the (failed) action would have chosen, so we pick
        // the most likely one based on intent.
        const failedMode: 'create' | 'in-place' | 'new-version' =
            operation === 'create' ? 'create' : 'in-place';
        const failResult: FormBuilderBuilderResult = {
            Success: false,
            Mode: failedMode,
            LintAttempts: lintHistory.length,
            ErrorMessage: lastError,
            LintHistory: lintHistory.length ? lintHistory : undefined,
        };
        const failPayload = this.attachResult(payload, failResult);
        return this.buildCodeFailure(
            `Form persistence failed after ${lintHistory.length} attempts. Last error (${lastResultCode}): ${lastError}`,
            failPayload as P,
        );
    }

    // ─── Pre-condition gates ────────────────────────────────────────────────

    private validatePreconditions(p: FormBuilderPayload): string | null {
        if (!p.Intent) return 'payload.Intent is missing — Designer must populate Operation + EntityName.';
        if (!p.Intent.EntityName?.trim()) return 'payload.Intent.EntityName is empty.';
        if (!p.Spec) return 'payload.Spec is missing — Designer must populate the ComponentSpec.';
        const spec = p.Spec as unknown as Record<string, unknown>;
        if (!spec.name || typeof spec.name !== 'string') return 'payload.Spec.name is missing or invalid.';
        if (!spec.code || typeof spec.code !== 'string') return 'payload.Spec.code is missing or invalid.';
        return null;
    }

    /**
     * Pin the Spec to the lineage's existing Component.Name when modifying
     * — defensively enforce what the Designer should have already done.
     * Also stamp componentRole/location/title defensively, matching the
     * cockpit's PreviewSpec contract.
     */
    private normalizeSpec(spec: ComponentSpec, existing: FormBuilderExistingOverride | null): ComponentSpec {
        const out = { ...spec } as Record<string, unknown>;
        out.componentRole = 'form';
        if (!out.location) out.location = 'embedded';
        if (existing?.ComponentName) {
            out.name = existing.ComponentName;
            if (!out.title) out.title = existing.ComponentName;
        }
        if (!out.title && typeof out.name === 'string') out.title = out.name;
        return out as unknown as ComponentSpec;
    }

    /** Discover an Active or Pending User-scope override for the entity. */
    private async discoverExistingOverride(
        provider: IMetadataProvider, user: UserInfo, entityName: string,
    ): Promise<FormBuilderExistingOverride | null> {
        try {
            const entityInfo = provider.EntityByName(entityName);
            if (!entityInfo?.ID) return null;
            const rv = RunView.FromMetadataProvider(provider);
            const result = await rv.RunView<{
                ID: string; ComponentID: string; Status: string;
            }>({
                EntityName: 'MJ: Entity Form Overrides',
                ExtraFilter: `EntityID='${entityInfo.ID}' AND UserID='${user.ID}' AND Scope='User' AND Status IN ('Active', 'Pending')`,
                Fields: ['ID', 'ComponentID', 'Status'],
                ResultType: 'simple',
                MaxRows: 1,
                // Prefer Active over Pending.
                OrderBy: `CASE WHEN Status='Active' THEN 0 WHEN Status='Pending' THEN 1 ELSE 2 END, __mj_UpdatedAt DESC`,
            }, user);
            if (!result.Success || !result.Results?.length) return null;
            const row = result.Results[0];
            // Component lookup to get Name + Version (needed for lineage + Builder output).
            const compResult = await rv.RunView<{ Name: string; Version: string }>({
                EntityName: 'MJ: Components',
                ExtraFilter: `ID='${row.ComponentID}'`,
                Fields: ['Name', 'Version'],
                ResultType: 'simple',
                MaxRows: 1,
            }, user);
            const comp = compResult.Success && compResult.Results?.[0] ? compResult.Results[0] : null;
            return {
                OverrideID: row.ID,
                ComponentID: row.ComponentID,
                CurrentVersion: comp?.Version ?? '1.0.0',
                Status: (row.Status as 'Active' | 'Pending'),
                ComponentName: comp?.Name ?? '',
            };
        } catch (err) {
            LogError(`FormBuilderBuilderAgent.discoverExistingOverride: ${err instanceof Error ? err.message : String(err)}`);
            return null;
        }
    }

    // ─── Action invocation ──────────────────────────────────────────────────

    /**
     * Call either `Create Interactive Form` or `Modify Interactive Form`
     * via `ActionEngineServer.RunAction`. Returns a structured outcome the
     * caller's retry loop can react to.
     */
    private async callPersistAction(
        params: ExecuteAgentParams,
        provider: IMetadataProvider,
        user: UserInfo,
        operation: 'create' | 'modify',
        spec: ComponentSpec,
        intent: FormBuilderPayload['Intent'],
        existing: FormBuilderExistingOverride | null,
    ): Promise<{
        success: boolean;
        mode: 'create' | 'in-place' | 'new-version';
        resultCode: string;
        error: string;
        componentID?: string;
        overrideID?: string;
        version?: string;
        bumpKind?: 'in-place' | 'patch' | 'minor' | 'major';
    }> {
        const actionEngine = ActionEngineServer.Instance;
        await actionEngine.Config(false, user);

        const actionName = operation === 'create' ? 'Create Interactive Form' : 'Modify Interactive Form';
        const actionEntity = actionEngine.Actions.find(a => a.Name === actionName);
        if (!actionEntity) {
            return { success: false, mode: operation === 'create' ? 'create' : 'in-place',
                resultCode: 'ACTION_NOT_FOUND',
                error: `Action '${actionName}' not registered with ActionEngineServer.` };
        }

        const stepNumber = await this.nextStepNumber(params);
        const step = await this.createRunStep(params, stepNumber, 'Actions',
            `Execute Action: ${actionName}`,
            { actionName, operation, entityName: intent!.EntityName, overrideID: existing?.OverrideID },
            actionEntity.ID);

        const actionParams = operation === 'create' ? [
            { Name: 'EntityName', Type: 'Input' as const, Value: intent!.EntityName },
            { Name: 'Spec',       Type: 'Input' as const, Value: spec },
            { Name: 'Name',       Type: 'Input' as const, Value: (spec as unknown as Record<string, unknown>).name ?? intent!.EntityName },
            { Name: 'Description',Type: 'Input' as const, Value: (spec as unknown as Record<string, unknown>).description ?? null },
            { Name: 'Notes',      Type: 'Input' as const, Value: intent!.UserPromptSummary ?? null },
        ] : [
            { Name: 'OverrideID',      Type: 'Input' as const, Value: existing!.OverrideID },
            { Name: 'Spec',            Type: 'Input' as const, Value: spec },
            { Name: 'Notes',           Type: 'Input' as const, Value: intent!.UserPromptSummary ?? null },
            { Name: 'VersionBumpKind', Type: 'Input' as const, Value: this.resolveBumpKind(intent!.VersionBumpKind, existing!.Status) },
        ];

        try {
            const result = await actionEngine.RunAction({
                Action: actionEntity,
                Params: actionParams,
                ContextUser: user,
                Filters: [],
                SkipActionLog: false,
                Context: { AgentID: params.agent.ID },
            });

            // RunAction returns { Success, Message, ResultCode? } via ActionResultSimple shape.
            const success = result.Success === true;
            const message = result.Message ?? '';
            // Parse the action's SUCCESS message (JSON) for ComponentID / OverrideID / Version.
            let componentID: string | undefined;
            let overrideID: string | undefined;
            let version: string | undefined;
            let mode: 'create' | 'in-place' | 'new-version' = operation === 'create' ? 'create' : 'in-place';
            let bumpKind: 'in-place' | 'patch' | 'minor' | 'major' | undefined;
            if (success && message) {
                try {
                    const parsed = JSON.parse(message) as Record<string, unknown>;
                    componentID = typeof parsed.ComponentID === 'string' ? parsed.ComponentID : undefined;
                    overrideID  = typeof parsed.OverrideID  === 'string' ? parsed.OverrideID  : undefined;
                    version     = typeof parsed.Version     === 'string' ? parsed.Version     : undefined;
                    if (parsed.Mode === 'in-place' || parsed.Mode === 'new-version') mode = parsed.Mode;
                    if (parsed.BumpKind === 'in-place' || parsed.BumpKind === 'patch'
                        || parsed.BumpKind === 'minor' || parsed.BumpKind === 'major') {
                        bumpKind = parsed.BumpKind;
                    }
                } catch {
                    // Message wasn't structured — that's fine, plain SUCCESS still works.
                }
            }

            // Find ResultCode — RunAction puts it on `result.Result` in some
            // server versions and `result.ResultCode` in others.
            const resultCode = ((result as unknown as { ResultCode?: string }).ResultCode)
                ?? ((result as unknown as { Result?: { ResultCode?: string } }).Result?.ResultCode)
                ?? (success ? 'SUCCESS' : 'UNKNOWN');

            await this.finalizeRunStep(step, success, {
                success, resultCode, mode, componentID, overrideID, version, bumpKind,
            }, undefined, success ? undefined : message);

            return {
                success,
                mode,
                resultCode,
                error: success ? '' : message,
                componentID,
                overrideID,
                version,
                bumpKind,
            };
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            await this.finalizeRunStep(step, false, undefined, undefined, msg);
            return { success: false, mode: operation === 'create' ? 'create' : 'in-place',
                resultCode: 'EXCEPTION', error: msg };
        }
    }

    private resolveBumpKind(
        requested: 'in-place' | 'patch' | 'minor' | 'major' | 'auto' | undefined,
        sourceStatus: 'Active' | 'Pending' | 'Inactive',
    ): string {
        if (requested && requested !== 'auto') return requested;
        // 'auto' or unset → default by source status, matching the action's
        // own auto-route (see Modify Interactive Form's routing matrix).
        if (sourceStatus === 'Pending') return 'in-place';
        if (sourceStatus === 'Active') return 'minor';
        return 'patch';
    }

    // ─── Lint-fix prompt invocation (the key new piece) ─────────────────────

    /**
     * Run a SINGLE focused prompt to repair a spec that just failed lint.
     * Returns the corrected spec, or null on failure.
     *
     * This is a direct `AIPromptRunner.ExecutePrompt` call — NOT a nested
     * agent run. We don't want the framework overhead, and we don't want
     * the LLM to start "deciding" anything. It gets exactly one message
     * with the broken spec + the lint error, and emits exactly one fixed
     * spec back. The whole thing logs as an `Actions`-typed run step so
     * it shows up in the run trace.
     */
    private async runLintFixPrompt(
        params: ExecuteAgentParams,
        user: UserInfo,
        spec: ComponentSpec,
        resultCode: string,
        errorMessage: string,
        attempt: number,
    ): Promise<ComponentSpec | null> {
        try {
            await AIEngineBase.Instance.Config(false, user);
            const prompt = AIEngineBase.Instance.Prompts.find(
                (p: MJAIPromptEntityExtended) => p.Name === LINT_FIX_PROMPT_NAME);
            if (!prompt) {
                LogError(`FormBuilderBuilderAgent: lint-fix prompt '${LINT_FIX_PROMPT_NAME}' not found in AIEngine`);
                return null;
            }

            const stepNumber = await this.nextStepNumber(params);
            const step = await this.createRunStep(params, stepNumber, 'Prompt',
                `Lint Fix Attempt ${attempt}`,
                { resultCode, attempt, specName: (spec as unknown as Record<string, unknown>).name },
                prompt.ID);

            const promptParams = new AIPromptParams();
            promptParams.prompt = prompt;
            promptParams.data = {
                spec: JSON.stringify(spec, null, 2),
                resultCode,
                errorMessage,
                attempt,
                maxAttempts: MAX_LINT_ATTEMPTS,
            };
            promptParams.contextUser = user;
            promptParams.attemptJSONRepair = true;

            const runner = new AIPromptRunner();
            const result = await runner.ExecutePrompt<{ spec: ComponentSpec; notes?: string }>(promptParams);

            // The prompt returns JSON, but depending on its OutputType the runner
            // hands us either a parsed object or the raw string (frequently wrapped
            // in a ```json markdown fence). Normalize every shape so a correct LLM
            // fix is never thrown away over a serialization detail.
            const payload = this.extractLintFixPayload(result);
            const fixed = payload?.spec ?? null;

            await this.finalizeRunStep(step, result.success, {
                success: result.success,
                hasSpec: !!fixed,
                notes: payload?.notes,
            }, result.promptRun?.ID, result.errorMessage || undefined);

            if (!result.success || !fixed || typeof fixed !== 'object') return null;
            // Defensive — keep componentRole + location pinned.
            (fixed as unknown as Record<string, unknown>).componentRole = 'form';
            if (!(fixed as unknown as Record<string, unknown>).location) {
                (fixed as unknown as Record<string, unknown>).location = 'embedded';
            }
            return fixed;
        } catch (err) {
            LogError(`FormBuilderBuilderAgent.runLintFixPrompt: ${err instanceof Error ? err.message : String(err)}`);
            return null;
        }
    }

    /**
     * Normalize a lint-fix prompt result into its `{ spec, notes }` payload.
     *
     * The runner may return the payload as a parsed object (OutputType 'object')
     * or as a raw string (OutputType 'string' — often a ```json-fenced blob). We
     * accept both, and fall back to the run's `rawResult` if `result` is empty.
     */
    private extractLintFixPayload(
        result: AIPromptRunResult<{ spec: ComponentSpec; notes?: string }>,
    ): { spec?: ComponentSpec; notes?: string } | null {
        const direct = result.result;
        if (direct && typeof direct === 'object') return direct;
        const text = typeof direct === 'string' ? direct : result.rawResult;
        return typeof text === 'string' ? this.parseFencedJsonObject(text) : null;
    }

    /**
     * Parse a JSON object from text, tolerating a leading/trailing markdown code
     * fence (```json … ``` or ``` … ```). Returns null on any parse failure.
     */
    private parseFencedJsonObject(text: string): { spec?: ComponentSpec; notes?: string } | null {
        const unfenced = text
            .trim()
            .replace(/^```(?:json)?\s*/i, '')
            .replace(/\s*```$/i, '')
            .trim();
        try {
            const parsed = JSON.parse(unfenced) as { spec?: ComponentSpec; notes?: string };
            return parsed && typeof parsed === 'object' ? parsed : null;
        } catch {
            return null;
        }
    }

    // ─── Helpers ────────────────────────────────────────────────────────────

    private attachResult(payload: FormBuilderPayload, result: FormBuilderBuilderResult): FormBuilderPayload {
        return { ...payload, BuilderResult: result };
    }

    /**
     * Pick the next StepNumber for an agent run step row. We scan existing
     * rows for the run and pick max+1 to avoid colliding with the
     * framework's own step writes. Falls back to 1 if no rows exist yet.
     */
    private async nextStepNumber(params: ExecuteAgentParams): Promise<number> {
        const agentRunID = params.parentRun?.ID;
        if (!agentRunID) return 1;
        try {
            const md: IMetadataProvider = (params.provider ?? new Metadata()) as unknown as IMetadataProvider;
            const rv = RunView.FromMetadataProvider(md);
            const result = await rv.RunView<{ StepNumber: number }>({
                EntityName: 'MJ: AI Agent Run Steps',
                ExtraFilter: `AgentRunID='${agentRunID}'`,
                Fields: ['StepNumber'],
                OrderBy: 'StepNumber DESC',
                MaxRows: 1,
                ResultType: 'simple',
            }, params.contextUser as UserInfo);
            if (result.Success && result.Results?.[0]) return (result.Results[0].StepNumber ?? 0) + 1;
        } catch {
            // best-effort
        }
        return 1;
    }
}

// Avoid unused warning when tree-shaking pruners trim the import.
void UUIDsEqual;

/** Tree-shaking guard. */
export function LoadFormBuilderBuilderAgent(): void {
    if (false as boolean) {
        const _: unknown = FormBuilderBuilderAgent;
    }
}
