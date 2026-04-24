import { ActionParam } from '@memberjunction/actions-base';
import { CodeExecutionService, CodeExecutionResult } from '@memberjunction/code-execution';
import { LogError } from '@memberjunction/core';
import { BaseSingleton } from '@memberjunction/global';
import {
    RuntimeActionExecutionParams,
    RuntimeActionExecutionResult,
    RuntimeActionResultCode
} from './types';

/**
 * Executes `Action.Type='Runtime'` records by running their JavaScript payload
 * inside the shared `CodeExecutionService` sandbox (isolated-vm + child-process
 * worker pool, with memory + timeout enforcement and the approved-library allowlist).
 *
 * ## What this phase delivers (1c)
 *
 * - **Pure-compute Runtime actions.** User code sees `input` (a plain JSON
 *   object built from `RunActionParams.Params` Input/Both entries) and `libs`
 *   (the allowlisted helpers already baked into CodeExecutionService). No
 *   bridge yet — no MJ metadata access, no view execution, no action or
 *   agent invocation.
 * - **Approval gating.** Runtime actions with `CodeApprovalStatus !== 'Approved'`
 *   or `Status !== 'Active'` are refused at the top of `execute()`. This is
 *   the first security layer — the approval gate guarantees that an operator
 *   has eyeballed the code before it can run.
 * - **Return-value → output params mapping.** Whatever the user code returns
 *   becomes the result. If it's an object, each top-level key is surfaced as
 *   an Output `ActionParam` so downstream consumers read it the standard way.
 *
 * ## What arrives in later phases (1d–1g)
 *
 * - **1d** — bidirectional IPC in `WorkerPool` so the sandbox can make async
 *   calls back to the host.
 * - **1e** — the `utilities.md` / `utilities.rv` / `utilities.rq` read-only
 *   bridge handlers.
 * - **1f** — entity CRUD + `utilities.actions.Invoke`.
 * - **1g** — `utilities.agents.Run` + AI prompt/embedding bridges.
 *
 * The executor is a singleton because it owns a persistent `CodeExecutionService`
 * (and its worker pool). Cold-start cost of spinning up isolates is non-trivial,
 * so we amortize it across all Runtime-action invocations.
 */
export class RuntimeActionExecutor extends BaseSingleton<RuntimeActionExecutor> {
    private _codeExecutionService: CodeExecutionService | null = null;

    protected constructor() {
        super();
    }

    public static get Instance(): RuntimeActionExecutor {
        return super.getInstance<RuntimeActionExecutor>();
    }

    /** Lazy-accessor for the sandbox service so we don't spin up isolates until first use. */
    private getCodeExecutionService(): CodeExecutionService {
        if (!this._codeExecutionService) {
            this._codeExecutionService = new CodeExecutionService();
        }
        return this._codeExecutionService;
    }

    /**
     * Executes a single Runtime action. Returns a result shape that
     * `ActionEngineServer.InternalRunAction()` can fold into an `ActionResult`.
     */
    public async execute(
        params: RuntimeActionExecutionParams
    ): Promise<RuntimeActionExecutionResult> {
        const { action } = params;

        if (action.Type !== 'Runtime') {
            return this.failResult(
                params.params,
                RuntimeActionResultCode.INVALID_TYPE,
                `Action '${action.Name}' has Type='${action.Type}' — RuntimeActionExecutor only handles Type='Runtime'.`
            );
        }

        if (!action.Code || action.Code.trim().length === 0) {
            return this.failResult(
                params.params,
                RuntimeActionResultCode.MISSING_CODE,
                `Action '${action.Name}' has no Code — nothing to execute.`
            );
        }

        if (action.Status !== 'Active') {
            return this.failResult(
                params.params,
                RuntimeActionResultCode.INACTIVE,
                `Action '${action.Name}' has Status='${action.Status}' — only Active actions can run.`
            );
        }

        if (action.CodeApprovalStatus !== 'Approved') {
            return this.failResult(
                params.params,
                RuntimeActionResultCode.NOT_APPROVED,
                `Action '${action.Name}' has CodeApprovalStatus='${action.CodeApprovalStatus}'. ` +
                    'Runtime actions must be approved before execution.'
            );
        }

        if (params.abortSignal?.aborted) {
            return this.failResult(
                params.params,
                RuntimeActionResultCode.TIMEOUT,
                `Execution aborted before Runtime action '${action.Name}' could start.`
            );
        }

        // Default timeout/memory while we wait for RuntimeActionConfiguration to
        // feed per-action overrides in 1e+. 30s + 128MB matches the CodeExecution
        // package defaults and the Jan 2026 plan's suggested baseline.
        const timeoutSeconds = 30;
        const memoryLimitMB = 128;

        const input = this.buildInput(params.params);

        // Wrap user code so it executes as an async function body. The
        // CodeExecutionService reads `output` off the sandbox at the end; we
        // set it to whatever the user code returned. `input` and `libs` are
        // already made available by the service's worker boot sequence.
        const wrappedCode = this.wrapUserCode(action.Code);

        let execResult: CodeExecutionResult;
        try {
            execResult = await this.getCodeExecutionService().execute({
                code: wrappedCode,
                language: 'javascript',
                inputData: input,
                timeoutSeconds,
                memoryLimitMB,
                bridgeHandlers: params.bridgeHandlers,
                maxBridgeCalls: params.maxBridgeCalls,
                abortSignal: params.abortSignal
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            LogError(`RuntimeActionExecutor dispatch failure for '${action.Name}': ${message}`);
            return this.failResult(
                params.params,
                RuntimeActionResultCode.UNEXPECTED_ERROR,
                message
            );
        }

        return this.mapExecutionResult(params.params, execResult);
    }

    /**
     * Builds the `input` object exposed to the sandbox. Input / Both params
     * become keys; Output params are excluded so user code can't be confused
     * by half-filled output slots.
     */
    private buildInput(actionParams: ActionParam[] | undefined): Record<string, unknown> {
        const input: Record<string, unknown> = {};
        if (!actionParams) return input;
        for (const p of actionParams) {
            if (!p?.Name) continue;
            if (p.Type === 'Input' || p.Type === 'Both') {
                input[p.Name] = p.Value;
            }
        }
        return input;
    }

    /**
     * Wraps the user-authored code so its side-effects on `output` are
     * captured by the worker's outer wrapper — which reads `output` at
     * the end of the program and surfaces it via `globalThis._output`.
     *
     * The worker's outer wrapper looks like:
     *   (async function() { let output; ${params.code}; globalThis._output = output; })();
     *
     * User code assigns to `output` (either directly via `output = {...}`
     * or through `return` — see below). That assignment reaches the outer
     * `let output` via closure, which is what the worker surfaces.
     *
     * Historical bug: we used to wrap as `output = await (async function...)(input);`.
     * The outer assignment overwrote the closed-over `output` with the inner
     * async function's return value — which was `undefined` whenever the user
     * code assigned to `output` and fell off the end (the documented pattern).
     * Every sandbox execution silently returned undefined, breaking every test
     * case that asserted on output fields.
     *
     * Current wrapping: the inner IIFE's return value is captured and, if
     * defined, assigned to `output` — this supports both `return value`
     * and `output = value` idioms. Bare assignments to `output` inside the
     * IIFE still work via closure; explicit `return` takes precedence if
     * both are used (so callers can switch styles without breakage).
     *
     * Libraries are accessed via `require()` inside user code (lodash,
     * date-fns, mathjs, papaparse, uuid, validator are on the allowlist).
     */
    private wrapUserCode(userCode: string): string {
        return [
            '{',
            '  const __runtimeReturn = await (async function(input) {',
            userCode,
            '  })(input);',
            '  if (typeof __runtimeReturn !== "undefined") output = __runtimeReturn;',
            '}'
        ].join('\n');
    }

    private mapExecutionResult(
        originalParams: ActionParam[],
        execResult: CodeExecutionResult
    ): RuntimeActionExecutionResult {
        if (!execResult.success) {
            const code = this.errorTypeToResultCode(execResult.errorType);
            return {
                success: false,
                resultCode: code,
                message: execResult.error ?? 'Runtime action execution failed.',
                params: originalParams,
                logs: execResult.logs,
                executionTimeMs: execResult.executionTimeMs
            };
        }

        // Successful run — promote the returned value to output ActionParams.
        const outputParams = this.mergeOutputParams(originalParams, execResult.output);

        return {
            success: true,
            resultCode: RuntimeActionResultCode.SUCCESS,
            message: typeof execResult.output === 'object' && execResult.output !== null
                ? undefined
                : `Runtime action completed; output=${JSON.stringify(execResult.output)}`,
            params: outputParams,
            logs: execResult.logs,
            executionTimeMs: execResult.executionTimeMs
        };
    }

    /**
     * If the user code returned an object, surface each top-level key as an
     * Output ActionParam so downstream consumers (`action.Params` after the
     * call) see them in the standard way. If the user returned a scalar we
     * stash it under `result` so there's at least one addressable output.
     */
    private mergeOutputParams(
        originalParams: ActionParam[],
        userOutput: unknown
    ): ActionParam[] {
        const next: ActionParam[] = [...(originalParams ?? [])];

        const upsert = (name: string, value: unknown) => {
            const existing = next.find(
                (p) => p?.Name?.trim().toLowerCase() === name.toLowerCase()
            );
            if (existing) {
                existing.Value = value;
                existing.Type = existing.Type === 'Input' ? 'Both' : existing.Type ?? 'Output';
            } else {
                // Emit a plain-object param rather than `new ActionParam()`.
                // Downstream (the GraphQL resolver) runs result params through
                // `CopyScalarsAndArrays`, which silently drops keys whose values
                // are class instances with `constructor !== Object` and no
                // `toJSON`. Emitting a class instance here would cause every
                // new output param to vanish before it reaches the client.
                next.push({ Name: name, Value: value, Type: 'Output' } as ActionParam);
            }
        };

        if (userOutput && typeof userOutput === 'object' && !Array.isArray(userOutput)) {
            for (const [key, value] of Object.entries(userOutput as Record<string, unknown>)) {
                upsert(key, value);
            }
        } else if (userOutput !== undefined) {
            upsert('result', userOutput);
        }

        return next;
    }

    private errorTypeToResultCode(
        errorType: CodeExecutionResult['errorType']
    ): string {
        switch (errorType) {
            case 'TIMEOUT':
                return RuntimeActionResultCode.TIMEOUT;
            case 'MEMORY_LIMIT':
                return RuntimeActionResultCode.MEMORY_LIMIT;
            case 'SYNTAX_ERROR':
                return RuntimeActionResultCode.SYNTAX_ERROR;
            case 'SECURITY_ERROR':
                return RuntimeActionResultCode.SECURITY_ERROR;
            case 'RUNTIME_ERROR':
            default:
                return RuntimeActionResultCode.RUNTIME_ERROR;
        }
    }

    private failResult(
        originalParams: ActionParam[],
        resultCode: string,
        message: string
    ): RuntimeActionExecutionResult {
        return {
            success: false,
            resultCode,
            message,
            params: originalParams ?? []
        };
    }
}
