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
            const suppliedCases = (this.getObjectParam(params, 'testcases') as TestCase[] | null) ?? [];

            // If the caller didn't supply any test cases, we still run ONE
            // smoke test with empty inputs. This proves the action loads,
            // compiles, and executes without throwing — the bare minimum
            // you want to know before persisting it. Callers that want real
            // assertions supply cases with `expectedOutput`; callers that
            // just want "did it blow up?" can skip cases entirely.
            const testCases: TestCase[] = suppliedCases.length > 0
                ? suppliedCases
                : [{ name: 'smoke-test (no inputs)', input: {} }];
            const smokeOnly = suppliedCases.length === 0;

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
                if (!actionRecord) {
                    // Hit only when `GetEntityObject('MJ: Actions')` returns
                    // null — entity name mismatch or permission issue — so
                    // surface it as ACTION_NOT_FOUND instead of letting a null
                    // MJActionEntity slip into ActionEngine.RunAction and blow
                    // up on `params.Action.MaxExecutionTimeMS`.
                    return fail(
                        'ACTION_NOT_FOUND',
                        'Failed to construct ephemeral MJ: Actions entity for the supplied Code + Configuration.'
                    );
                }
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
            this.setOutputParam(params, 'SmokeTestOnly', smokeOnly);

            const allPassed = passCount === results.length;
            const resultCode = allPassed
                ? (smokeOnly ? 'SMOKE_PASSED' : 'ALL_PASSED')
                : (smokeOnly ? 'SMOKE_FAILED' : 'SOME_FAILED');
            const message = smokeOnly
                ? (allPassed
                    ? 'Smoke test passed — action loaded and executed without throwing. No test cases supplied, so behavior was not asserted.'
                    : `Smoke test failed: ${results[0]?.message ?? 'action failed on empty-input execution.'}`)
                : `${passCount}/${results.length} test cases passed.`;

            return {
                Success: true,
                ResultCode: resultCode,
                Message: message,
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
        const md = params.Provider ?? new Metadata();
        // Entity is registered as 'MJ: Actions' (see entity_subclasses.ts —
        // all newer MJ core entities use the 'MJ: ' prefix). Passing 'Actions'
        // silently returned null, which then crashed ActionEngine downstream.
        const entity = await md.GetEntityObject<MJActionEntity>('MJ: Actions', params.ContextUser);
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
        //   - AND (if expectedOutput provided) the actual output matches the
        //     expected shape as a SUBSET — every key declared in expectedOutput
        //     must be present in the actual output with an equal value, but
        //     extra keys in the actual output are allowed. This lets callers
        //     assert on the fields they care about (result codes, known
        //     values) without having to enumerate every dynamic field
        //     (counts, IDs, timestamps) in their test declaration.
        const expectedPasses = tc.expectedOutput
            ? matchesExpected(outputs, tc.expectedOutput)
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
/**
 * Subset-match semantics for test-case assertions. The `actual` output from
 * the Runtime action must CONTAIN every key declared in `expected` with an
 * equal value — extra keys in `actual` are permitted and ignored. Arrays
 * still require element-for-element match (same length, matching items in
 * order) so callers can meaningfully assert "returns N items" or "third item
 * is X".
 *
 * This is the semantics used by every mature testing framework — Jest's
 * `expect.objectContaining`, Chai's `containSubset`, etc. Strict exact-equal
 * was the previous behavior and made assertions impractical for actions
 * that return dynamic fields (counts, IDs, timestamps, live view rows):
 * every such field would have to be enumerated in `expectedOutput`, and if
 * you couldn't predict its value, you had to drop `expectedOutput` entirely
 * and fall back to "didn't throw" which is not a test.
 *
 * Null/undefined handling:
 *   - `expected: null` matches only `actual === null`
 *   - `expected: undefined` is treated as "don't care" — passes regardless
 *     (so callers can use `{ foo: undefined }` to skip a field if they want)
 */
function matchesExpected(actual: unknown, expected: unknown): boolean {
    // Trivial equality fast-path.
    if (expected === actual) return true;

    // undefined in expected means "don't care" — always pass.
    if (expected === undefined) return true;

    // null in expected means "must be exactly null".
    if (expected === null) return actual === null;

    // Primitive expected value — must strict-equal actual.
    if (typeof expected !== 'object') return expected === actual;

    // If actual is null/undefined but expected is an object, fail.
    if (actual == null || typeof actual !== 'object') return false;

    // Arrays: element-wise match, same length.
    if (Array.isArray(expected)) {
        if (!Array.isArray(actual)) return false;
        if (expected.length !== actual.length) return false;
        for (let i = 0; i < expected.length; i++) {
            if (!matchesExpected(actual[i], expected[i])) return false;
        }
        return true;
    }
    if (Array.isArray(actual)) return false;

    // Plain object: every key in expected must match in actual. Extras in
    // actual are OK — that's the subset semantic.
    const expObj = expected as Record<string, unknown>;
    const actObj = actual as Record<string, unknown>;
    for (const key of Object.keys(expObj)) {
        if (!matchesExpected(actObj[key], expObj[key])) return false;
    }
    return true;
}

/** Tree-shaking prevention hook called from the CoreActions public API. */
export function LoadTestRuntimeActionAction(): void {
    // intentionally empty
}
