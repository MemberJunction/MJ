import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { LogError, Metadata } from '@memberjunction/core';
import { MJActionEntity } from '@memberjunction/core-entities';
import { ActionEngineServer } from '@memberjunction/actions';

/**
 * Executes a Runtime action against one or more test cases and returns
 * per-case pass/fail results. Used by ActionSmith before submitting an
 * action for human approval — if any case fails, ActionSmith iterates with
 * Codesmith to refine the code.
 *
 * The action being tested can be:
 *   - An existing Runtime action record (identified by ActionID or Name)
 *   - A freshly-generated code payload that hasn't been persisted yet
 *     (Code + RuntimeActionConfiguration passed directly, no DB record
 *     required). This path uses a throwaway in-memory MJActionEntity with
 *     CodeApprovalStatus='Approved' so the executor permits it.
 *
 * Test cases are evaluated in sequence; expected outputs (if provided) are
 * compared to actual outputs with structural deep equality.
 */
@RegisterClass(BaseAction, 'Test Runtime Action')
export class TestRuntimeActionAction extends BaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const actionId = this.getStringParam(params, 'actionid');
            const actionName = this.getStringParam(params, 'actionname');
            const inlineCode = this.getStringParam(params, 'code');
            const inlineConfig = this.getObjectParam(params, 'configuration');
            const testCases = (this.getObjectParam(params, 'testcases') as TestCase[] | null) ?? [];

            if (testCases.length === 0) {
                return fail('MISSING_TEST_CASES', 'At least one test case is required.');
            }

            // Resolve the action record to use.
            let actionRecord: MJActionEntity | null = null;
            if (actionId || actionName) {
                actionRecord = await this.resolveExistingAction(params, actionId, actionName);
                if (!actionRecord) {
                    return fail(
                        'ACTION_NOT_FOUND',
                        `No action matches ${actionId ? `ID '${actionId}'` : `Name '${actionName}'`}.`
                    );
                }
            } else if (inlineCode && inlineConfig) {
                actionRecord = await this.buildEphemeralAction(
                    params,
                    inlineCode,
                    inlineConfig as Record<string, unknown>
                );
            } else {
                return fail(
                    'MISSING_INPUTS',
                    'Test Runtime Action requires either (ActionID/ActionName) or (Code + Configuration).'
                );
            }

            // Run each test case through ActionEngine.RunAction so the full
            // dispatch path (timeout wrapper, bridge, approval gate) is
            // exercised — not just the executor directly.
            const engine = ActionEngineServer.Instance;
            if (!engine.Actions || engine.Actions.length === 0) {
                await engine.Config(false, params.ContextUser);
            }

            const results: CaseResult[] = [];
            let passCount = 0;
            for (const tc of testCases) {
                const caseResult = await this.runCase(engine, actionRecord, params, tc);
                results.push(caseResult);
                if (caseResult.passed) passCount++;
            }

            this.setOutputParam(params, 'TestResults', results);
            this.setOutputParam(params, 'PassedCount', passCount);
            this.setOutputParam(params, 'FailedCount', results.length - passCount);
            this.setOutputParam(params, 'AllPassed', passCount === results.length);

            return {
                Success: true,
                ResultCode: passCount === results.length ? 'ALL_PASSED' : 'SOME_FAILED',
                Message: `${passCount}/${results.length} test cases passed.`,
                Params: params.Params
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            LogError(`TestRuntimeActionAction error: ${message}`);
            return fail('UNEXPECTED_ERROR', message);
        }
    }

    private async resolveExistingAction(
        params: RunActionParams,
        id?: string,
        name?: string
    ): Promise<MJActionEntity | null> {
        const engine = ActionEngineServer.Instance;
        if (!engine.Actions || engine.Actions.length === 0) {
            await engine.Config(false, params.ContextUser);
        }
        if (id) {
            return engine.Actions.find((a) => UUIDsEqual(a.ID, id)) ?? null;
        }
        if (name) {
            const normalized = name.trim().toLowerCase();
            return (
                engine.Actions.find((a) => a.Name?.trim().toLowerCase() === normalized) ?? null
            );
        }
        return null;
    }

    /**
     * Builds an in-memory MJActionEntity instance pre-populated with the
     * supplied inline code + config, flagged as Approved so the executor's
     * approval gate lets it through. This record is NOT saved — it only
     * exists for the duration of this action.
     */
    private async buildEphemeralAction(
        params: RunActionParams,
        code: string,
        config: Record<string, unknown>
    ): Promise<MJActionEntity | null> {
        const md = new Metadata();
        const entity = await md.GetEntityObject<MJActionEntity>('Actions', params.ContextUser);
        if (!entity) return null;
        entity.NewRecord();
        entity.Name = 'Runtime Action Test (ephemeral)';
        entity.Description = 'Ephemeral Runtime action for TestRuntimeAction.';
        entity.Type = 'Runtime';
        entity.Code = code;
        entity.Status = 'Active';
        entity.CodeApprovalStatus = 'Approved';
        // Typed accessor handles JSON serialization.
        entity.RuntimeActionConfigurationObject = config as never;
        return entity;
    }

    private async runCase(
        engine: ActionEngineServer,
        actionRecord: MJActionEntity,
        params: RunActionParams,
        tc: TestCase
    ): Promise<CaseResult> {
        const inputParams: ActionParam[] = Object.entries(tc.input ?? {}).map(([name, value]) => {
            const p = new ActionParam();
            p.Name = name;
            p.Value = value;
            p.Type = 'Input';
            return p;
        });

        const start = Date.now();
        const result = await engine.RunAction({
            Action: actionRecord,
            ContextUser: params.ContextUser,
            Filters: [],
            Params: inputParams,
            SkipActionLog: true,
            AbortSignal: params.AbortSignal
        });
        const elapsed = Date.now() - start;

        const outputs: Record<string, unknown> = {};
        for (const p of result.Params ?? []) {
            if (p.Type === 'Output' || p.Type === 'Both') {
                outputs[p.Name] = p.Value;
            }
        }

        // Pass condition:
        //   - action ran with Success=true
        //   - AND (if expectedOutput provided) the outputs deep-equal it
        const expectedPasses = tc.expectedOutput
            ? deepEqual(outputs, tc.expectedOutput)
            : true;
        const passed = result.Success && expectedPasses;

        return {
            name: tc.name,
            passed,
            success: result.Success,
            message: result.Message ?? null,
            output: outputs,
            expectedOutput: tc.expectedOutput ?? null,
            elapsedMs: elapsed
        };
    }

    // --- param helpers --------------------------------------------------------

    private getParamValue(params: RunActionParams, name: string): unknown {
        const p = params.Params?.find((x) => x.Name?.trim().toLowerCase() === name.toLowerCase());
        return p?.Value;
    }
    private getStringParam(params: RunActionParams, name: string): string | undefined {
        const v = this.getParamValue(params, name);
        if (v == null) return undefined;
        const s = String(v).trim();
        return s.length ? s : undefined;
    }
    private getObjectParam(params: RunActionParams, name: string): unknown {
        const v = this.getParamValue(params, name);
        if (v == null) return null;
        if (typeof v === 'object') return v;
        if (typeof v === 'string') {
            try { return JSON.parse(v); } catch { return null; }
        }
        return null;
    }
    private setOutputParam(params: RunActionParams, name: string, value: unknown): void {
        const existing = params.Params?.find((p) => p.Name?.trim().toLowerCase() === name.toLowerCase());
        if (existing) {
            existing.Value = value;
            existing.Type = existing.Type === 'Input' ? 'Both' : existing.Type || 'Output';
            return;
        }
        if (!params.Params) params.Params = [];
        const p = new ActionParam();
        p.Name = name;
        p.Value = value;
        p.Type = 'Output';
        params.Params.push(p);
    }
}

// =========================================================================
// Local types + helpers
// =========================================================================

interface TestCase {
    name: string;
    input?: Record<string, unknown>;
    expectedOutput?: Record<string, unknown>;
}

interface CaseResult {
    name: string;
    passed: boolean;
    success: boolean;
    message: string | null;
    output: Record<string, unknown>;
    expectedOutput: Record<string, unknown> | null;
    elapsedMs: number;
}

function fail(resultCode: string, message: string): ActionResultSimple {
    return { Success: false, ResultCode: resultCode, Message: message };
}

/**
 * Structural deep-equality sufficient for comparing test outputs. Handles
 * plain objects, arrays, and primitives. Not intended for class instances
 * (which shouldn't cross the sandbox boundary anyway).
 */
function deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (a == null || b == null) return false;
    if (typeof a !== typeof b) return false;
    if (typeof a !== 'object') return a === b;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
            if (!deepEqual(a[i], b[i])) return false;
        }
        return true;
    }
    const aKeys = Object.keys(a as Record<string, unknown>).sort();
    const bKeys = Object.keys(b as Record<string, unknown>).sort();
    if (aKeys.length !== bKeys.length) return false;
    for (let i = 0; i < aKeys.length; i++) {
        if (aKeys[i] !== bKeys[i]) return false;
        if (!deepEqual(
            (a as Record<string, unknown>)[aKeys[i]],
            (b as Record<string, unknown>)[bKeys[i]]
        )) return false;
    }
    return true;
}

/** Tree-shaking prevention hook called from the CoreActions public API. */
export function LoadTestRuntimeActionAction(): void {
    // intentionally empty
}
