import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { LogError, UserInfo } from '@memberjunction/core';
import {
    BaseAgentNextStep,
    ExecuteAgentParams,
    MJAIAgentRunEntityExtended,
    MJAIAgentRunStepEntityExtended
} from '@memberjunction/ai-core-plus';
import { BaseAgent } from '@memberjunction/ai-agents';
import { ActionEngineServer } from '@memberjunction/actions';
import { ActionParam } from '@memberjunction/actions-base';

/**
 * Shape of the payload ActionSmith builds up over the course of a run.
 * All fields are optional in TypeScript because the agent populates them
 * incrementally — the runtime check in `checkRequiredFields` is what
 * guarantees we have what we need before persisting.
 */
interface ActionSmithPayload {
    name?: string;
    description?: string;
    code?: string;
    categoryId?: string;
    inputSchema?: Record<string, unknown>;
    outputSchema?: Record<string, unknown>;
    permissions?: {
        allowedEntities?: Array<{ id?: string; name?: string }>;
        allowedActions?: Array<{ id?: string; name?: string }>;
        allowedAgents?: Array<{ id?: string; name?: string }>;
        allowAnyEntity?: boolean;
        allowAnyAction?: boolean;
        allowAnyAgent?: boolean;
    };
    resultCodes?: Array<{ resultCode: string; isSuccess: boolean; description?: string }>;
    testCases?: Array<{ name: string; input?: unknown; expectedOutput?: unknown }>;
    testResults?: {
        AllPassed?: boolean;
        PassedCount?: number;
        FailedCount?: number;
        TestResults?: Array<{ name: string; passed: boolean; message?: string }>;
    };
    limits?: {
        maxMemoryMB?: number;
        maxBridgeCalls?: number;
        maxExecutionTimeMs?: number;
    };
    actionId?: string;
    approvalStatus?: string;
    iterationsUsed?: number;
    status?: string;
    message?: string;
}

/**
 * Custom BaseAgent subclass for the **ActionSmith Agent**. Keeps the full
 * LLM-driven Loop for the creative work (contract design, Codesmith
 * delegation, test iteration) but adds a deterministic validation +
 * rescue hook at the "I'm done" moment so:
 *
 *   1. The agent cannot return `Success` with an incomplete payload.
 *      If it tries, `validateSuccessNextStep` downgrades the step to
 *      `Retry` with explicit `retryInstructions` telling the LLM
 *      exactly which fields are missing.
 *   2. If tests didn't all pass, `Success` is refused — the LLM is
 *      sent back with the failing test names.
 *   3. If the payload IS valid but the LLM forgot to call
 *      `Create Runtime Action`, the override runs it deterministically
 *      here, stamps `actionId` + `approvalStatus: 'Pending'` onto the
 *      payload, and returns Success. The LLM can't accidentally skip
 *      persistence.
 *
 * Pattern mirrors Skip-Brain's `SoftwareArchitectAgent`
 * (packages/resolvers/src/agents/software-architect-agent.ts) — see
 * `validateSuccessNextStep` there for the reference implementation.
 *
 * Wired into the `ActionSmith Agent` metadata via the `DriverClass`
 * field: `"DriverClass": "ActionSmithAgent"`. No other metadata or
 * prompt changes required — the framework handles the dispatch.
 */
@RegisterClass(BaseAgent, 'ActionSmithAgent')
export class ActionSmithAgent extends BaseAgent {
    /**
     * Gate on `Chat` steps. Chat is legitimate in exactly three cases:
     *   (a) The LLM attached a structured `responseForm` — it's asking for
     *       deliberate user input via a form, not a freeform question. Pass
     *       through.
     *   (b) No code has been generated yet — the pipeline hasn't really
     *       started, so a clarification chat is fine. Pass through.
     *   (c) The action has already been persisted (`actionId` present) —
     *       this is the terminal success-reporting chat. Pass through.
     *
     * Otherwise the Chat is a mid-pipeline stall (the LLM forgot to run the
     * next step, or is bubbling up a sub-agent's clarification request). We
     * either:
     *   - Rescue deterministically: if tests passed and an actionId is the
     *     only thing missing, persist the action ourselves and convert the
     *     Chat step into Success with the populated actionId. The LLM's
     *     intent ("I'm done") is respected; we just finish the job it
     *     forgot to finish.
     *   - Redirect to Retry with explicit guidance: if tests haven't run or
     *     failed, send the LLM back with instructions telling it which
     *     `Actions` step to execute next.
     */
    protected override async validateChatNextStep<P>(
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        currentPayload: P,
        agentRun: MJAIAgentRunEntityExtended,
        currentStep: MJAIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        const base = await super.validateChatNextStep(
            params,
            nextStep,
            currentPayload,
            agentRun,
            currentStep
        );
        if (base.step === 'Retry') {
            return base;
        }

        // Coalesce through empty-object fallback so subsequent `payload.X`
        // field accesses don't throw when the LLM emits a step before any
        // payload has been populated (e.g., early Chat step with no
        // `newPayload` AND no parent currentPayload yet). Hitting an
        // undefined here bubbles up as a generic "Cannot read properties
        // of undefined (reading 'code')" error that surfaces as a failed
        // prompt step — stalling the whole run.
        const payload = (nextStep.newPayload ?? currentPayload ?? {}) as ActionSmithPayload;
        const hasCode = !!payload.code?.trim();
        const hasActionId = !!payload.actionId;
        // Legit structured interaction — the LLM built an actual form, not a
        // freeform "are we good?" question. This is always allowed.
        const hasResponseForm = !!nextStep.responseForm;

        // (a) responseForm present → user-directed structured input. Pass through.
        if (hasResponseForm) {
            return base;
        }

        // (b) No code yet → pipeline hasn't really begun, early clarification is fine.
        if (!hasCode) {
            return base;
        }

        // (c) Action already persisted → terminal reporting chat. Pass through.
        if (hasActionId) {
            return base;
        }

        // ---- Mid-pipeline stall. Decide rescue vs. redirect based on test state. ----
        const testsPassed = payload.testResults?.AllPassed === true;

        // Rescue path: tests passed, actionId just missing. Persist deterministically
        // and convert Chat → Success. Same logic as validateSuccessNextStep's rescue
        // branch — centralizing it would risk coupling the two validators in
        // subtle ways, so we duplicate the 10-line call site rather than abstract.
        if (testsPassed) {
            const missing = this.checkRequiredFields(payload);
            if (missing.length === 0) {
                try {
                    const persisted = await this.persistRuntimeAction(
                        payload,
                        params.contextUser,
                        params.agent?.ID
                    );
                    return {
                        ...base,
                        step: 'Success',
                        terminate: true,
                        newPayload: {
                            ...payload,
                            actionId: persisted.actionId,
                            approvalStatus: 'Pending',
                            status: 'completed',
                            message:
                                payload.message ??
                                `Runtime action '${payload.name}' created (ID ${persisted.actionId}), pending approval.`
                        } as P
                    };
                } catch (err) {
                    const message = err instanceof Error ? err.message : String(err);
                    LogError(
                        `ActionSmithAgent rescue-persist via Chat path failed: ${message}`
                    );
                    return {
                        ...base,
                        step: 'Retry',
                        terminate: false,
                        retryReason: 'Create Runtime Action failed during Chat rescue',
                        retryInstructions:
                            `You attempted to return Chat with tests passing but Create Runtime Action failed: ${message}. ` +
                            `Inspect the error, correct the affected payload fields, and invoke Create Runtime Action again.`,
                        newPayload: payload as P
                    };
                }
            }
        }

        // Redirect path: tests didn't pass (or haven't run). Send the LLM back
        // with explicit guidance on which Actions step to execute next.
        const testsStatus = payload.testResults
            ? payload.testResults.AllPassed
                ? 'passed'
                : 'failed'
            : 'not run';

        let nextInstruction: string;
        if (testsStatus === 'not run') {
            nextInstruction =
                `You have \`code\` in your payload but have not yet invoked Test Runtime Action. ` +
                `Your NEXT step MUST be an \`Actions\` step invoking \`Test Runtime Action\` with the code + configuration + testCases from your payload. Do not return Chat here.`;
        } else if (testsStatus === 'failed') {
            const failing = (payload.testResults?.TestResults ?? [])
                .filter((r) => !r.passed)
                .map((r) => r.name || '(unnamed)')
                .join(', ');
            nextInstruction =
                `You have \`code\` and failing test results (failing cases: ${failing || 'unknown'}) but returned Chat instead of iterating. ` +
                `Call Codesmith again with the failing case details and re-run Test Runtime Action. Do not surface the failure to the user as Chat — resolve it or return a terminal Failed step.`;
        } else {
            // tests passed but we reached here only if checkRequiredFields flagged
            // something missing (e.g., no description). Treat as incomplete payload.
            const missing = this.checkRequiredFields(payload);
            nextInstruction =
                `Tests passed but required payload fields are missing: [${missing.join(', ')}]. ` +
                `Fill those in and then invoke Create Runtime Action.`;
        }

        return {
            ...base,
            step: 'Retry',
            terminate: false,
            retryReason: 'Mid-pipeline Chat blocked',
            retryInstructions: nextInstruction,
            newPayload: payload as P
        };
    }

    /**
     * Gate on `Success` steps. Runs after the LLM claims it's done.
     * Returns either the original nextStep (pass — agent terminates)
     * or a `Retry` step with `retryInstructions` explaining what's
     * still missing. When everything is valid but the LLM forgot to
     * call Create Runtime Action, we call it ourselves.
     */
    protected override async validateSuccessNextStep<P>(
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        currentPayload: P,
        agentRun: MJAIAgentRunEntityExtended,
        currentStep: MJAIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        // 1. Let the base class run its generic checks first
        //    (min execution count, FinalPayloadValidation schema).
        const base = await super.validateSuccessNextStep(
            params,
            nextStep,
            currentPayload,
            agentRun,
            currentStep
        );
        if (base.step === 'Retry') {
            return base;
        }

        // Coalesce through empty-object fallback so subsequent `payload.X`
        // field accesses don't throw when the LLM emits a step before any
        // payload has been populated (e.g., early Chat step with no
        // `newPayload` AND no parent currentPayload yet). Hitting an
        // undefined here bubbles up as a generic "Cannot read properties
        // of undefined (reading 'code')" error that surfaces as a failed
        // prompt step — stalling the whole run.
        const payload = (nextStep.newPayload ?? currentPayload ?? {}) as ActionSmithPayload;

        // 2. Structured completeness check with specific retry guidance.
        const missing = this.checkRequiredFields(payload);
        if (missing.length > 0) {
            return {
                ...base,
                step: 'Retry',
                terminate: false,
                retryReason: 'Incomplete payload',
                retryInstructions:
                    `You returned Success but your payload is missing required fields: [${missing.join(', ')}]. ` +
                    `Complete the pipeline in order: define the contract → delegate to Codesmith (the generated code auto-merges into your payload's \`code\` field) → ` +
                    `invoke Test Runtime Action with that code and confirm \`AllPassed=true\` → then invoke Create Runtime Action. ` +
                    `Do NOT return Success until \`actionId\` is populated in your payload.`,
                newPayload: payload as P
            };
        }

        // 3. Test gate — if the test harness didn't pass, don't persist.
        if (payload.testResults && payload.testResults.AllPassed === false) {
            const failing = (payload.testResults.TestResults ?? [])
                .filter((r) => !r.passed)
                .map((r) => r.name || '(unnamed)')
                .join(', ');
            return {
                ...base,
                step: 'Retry',
                terminate: false,
                retryReason: 'Test failures',
                retryInstructions:
                    `Tests did not all pass (failing: ${failing || 'unknown'}). ` +
                    `Brief Codesmith with the failure details from \`testResults.TestResults\`, ` +
                    `iterate until \`AllPassed=true\`, then re-run Test Runtime Action before returning Success.`,
                newPayload: payload as P
            };
        }

        // 4. Happy path A — the LLM already called Create Runtime Action
        //    and `actionId` is in the payload. Let it through.
        if (payload.actionId) {
            return base;
        }

        // 5. Happy path B — payload is complete + tests passed but
        //    `actionId` is missing. Rather than kicking the LLM back
        //    for another iteration, persist deterministically here.
        try {
            const persisted = await this.persistRuntimeAction(
                payload,
                params.contextUser,
                params.agent?.ID
            );
            return {
                ...base,
                newPayload: {
                    ...payload,
                    actionId: persisted.actionId,
                    approvalStatus: 'Pending',
                    status: payload.status ?? 'completed',
                    message:
                        payload.message ??
                        `Runtime action '${payload.name}' created (ID ${persisted.actionId}), pending approval.`
                } as P
            };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            LogError(`ActionSmithAgent deterministic persist failed: ${message}`);
            return {
                ...base,
                step: 'Retry',
                terminate: false,
                retryReason: 'Create Runtime Action failed',
                retryInstructions:
                    `Attempted to persist your Runtime action on your behalf but Create Runtime Action failed: ${message}. ` +
                    `Inspect the error, correct the affected payload fields, and try again.`,
                newPayload: payload as P
            };
        }
    }

    /**
     * Checks the bare minimum needed to persist a valid Runtime action.
     * Order-sensitive: we return every missing field so the LLM can fix
     * them all in one retry pass rather than chasing them one at a time.
     */
    private checkRequiredFields(p: ActionSmithPayload): string[] {
        const missing: string[] = [];
        if (!p.name?.trim()) missing.push('name');
        if (!p.description?.trim()) missing.push('description');
        if (!p.code?.trim()) missing.push('code');
        if (!p.permissions) missing.push('permissions');
        if (!p.resultCodes || p.resultCodes.length === 0) missing.push('resultCodes');
        if (!p.testResults) missing.push('testResults');
        return missing;
    }

    /**
     * Deterministic fallback persistence path — calls the existing
     * `Create Runtime Action` action via ActionEngineServer, mapping
     * ActionSmith payload fields to its input param names. Keeps the
     * persistence logic in exactly one place (the action itself) so
     * there's no duplication between the agent and the action.
     */
    private async persistRuntimeAction(
        payload: ActionSmithPayload,
        contextUser: UserInfo,
        createdByAgentId: string | null | undefined
    ): Promise<{ actionId: string; approvalStatus: string }> {
        const engine = ActionEngineServer.Instance;
        if (!engine.Actions || engine.Actions.length === 0) {
            await engine.Config(false, contextUser);
        }
        const createAction = engine.Actions.find(
            (a) => a.Name?.trim().toLowerCase() === 'create runtime action'
        );
        if (!createAction) {
            throw new Error(
                'Create Runtime Action record not found in the ActionEngine catalog. ' +
                    'Ensure ActionSmith has access to it or that the metadata is loaded.'
            );
        }

        const runParams: ActionParam[] = [];
        const push = (name: string, value: unknown) => {
            const p = new ActionParam();
            p.Name = name;
            p.Value = value;
            p.Type = 'Input';
            runParams.push(p);
        };

        push('Name', payload.name);
        push('Description', payload.description);
        push('Code', payload.code);
        // `Create Runtime Action` expects the whole RuntimeActionConfiguration
        // JSON — permissions + limits. It re-validates via the Zod schema
        // internally, so a malformed shape surfaces as INVALID_CONFIG there
        // and we catch it as an error thrown on !Success.
        push('Configuration', {
            permissions: payload.permissions ?? {},
            limits: payload.limits ?? {}
        });
        push('InputParams', this.schemaToParamSpec(payload.inputSchema, 'Input'));
        push('OutputParams', this.schemaToParamSpec(payload.outputSchema, 'Output'));
        push('ResultCodes', payload.resultCodes ?? []);
        if (payload.categoryId) push('CategoryID', payload.categoryId);
        if (payload.limits?.maxExecutionTimeMs != null) {
            push('MaxExecutionTimeMS', payload.limits.maxExecutionTimeMs);
        }
        if (createdByAgentId) push('CreatedByAgentID', createdByAgentId);

        const result = await engine.RunAction({
            Action: createAction,
            ContextUser: contextUser,
            Filters: [],
            Params: runParams,
            SkipActionLog: false
        });

        if (!result.Success) {
            throw new Error(
                result.Message ??
                    `Create Runtime Action returned Success=false with no message.`
            );
        }

        const actionId = this.readOutputParam(result.Params, 'ActionID');
        const approvalStatus =
            this.readOutputParam(result.Params, 'CodeApprovalStatus') ?? 'Pending';
        if (!actionId) {
            throw new Error(
                `Create Runtime Action reported Success but did not return an ActionID output.`
            );
        }
        return { actionId, approvalStatus };
    }

    private schemaToParamSpec(
        schema: Record<string, unknown> | undefined,
        type: 'Input' | 'Output'
    ): Array<{ name: string; type: string; description?: string; required?: boolean }> {
        if (!schema) return [];
        return Object.entries(schema).map(([name, rawDef]) => {
            const def = (rawDef ?? {}) as Record<string, unknown>;
            return {
                name,
                type: (def.type as string) ?? 'string',
                description: (def.description as string) ?? undefined,
                required: type === 'Input' ? Boolean(def.required) : false
            };
        });
    }

    private readOutputParam(
        params: ActionParam[] | undefined,
        name: string
    ): string | undefined {
        if (!params) return undefined;
        const hit = params.find(
            (p) =>
                p?.Name?.trim().toLowerCase() === name.toLowerCase() &&
                (p.Type === 'Output' || p.Type === 'Both')
        );
        return hit?.Value == null ? undefined : String(hit.Value);
    }
}

// Silence the unused-import warning — UUIDsEqual is kept for future use
// by subclasses that want to match on action IDs rather than names.
void UUIDsEqual;
