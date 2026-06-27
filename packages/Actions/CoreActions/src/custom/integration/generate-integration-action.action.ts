import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';
import { RegisterClass } from '@memberjunction/global';
import { LogError } from '@memberjunction/core';
import {
    IntegrationActionGenerator,
    type IntegrationActionVerb,
    type GenerateIntegrationActionResult,
} from '@memberjunction/integration-engine';

/** The CRUD verbs an integration action can be minted for. */
const VALID_VERBS: readonly IntegrationActionVerb[] = ['Get', 'Create', 'Update', 'Delete', 'Search', 'List'];

/**
 * Agent-callable action that mints a strongly-typed integration action on demand.
 *
 * An agent (e.g. via `mj ai agents run`) invokes this to generate something like
 * "HubSpot - Get Contact" for a given integration/object/verb. It is the thin
 * action wrapper over the {@link IntegrationActionGenerator} persister service in
 * `@memberjunction/integration-engine` — all generation/idempotency logic lives in
 * that service; this action only extracts params, delegates, and maps results.
 *
 * Params:
 *  - `IntegrationName` (Input, required) — e.g. "HubSpot"
 *  - `ObjectName` (Input, required) — external object, e.g. "contacts"
 *  - `Verb` (Input, optional) — one of Get|Create|Update|Delete|Search|List.
 *     When omitted, ALL applicable verbs for the object are generated.
 *
 * Outputs:
 *  - `GeneratedActionID` / `GeneratedActionIDs` — minted (or reused) Action ID(s)
 *  - `ActionName` / `ActionNames` — deterministic Action name(s)
 *  - `AlreadyExisted` — true when every result reused an existing action
 *  - `Results` — the full per-verb {@link GenerateIntegrationActionResult} array
 *
 * @example
 * ```typescript
 * await runAction({
 *   ActionName: 'Generate Integration Action',
 *   Params: [
 *     { Name: 'IntegrationName', Value: 'HubSpot', Type: 'Input' },
 *     { Name: 'ObjectName', Value: 'contacts', Type: 'Input' },
 *     { Name: 'Verb', Value: 'Get', Type: 'Input' }
 *   ]
 * });
 * ```
 */
@RegisterClass(BaseAction, 'GenerateIntegrationAction')
export class GenerateIntegrationActionAction extends BaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const integrationName = this.getStringParam(params, 'integrationname');
            const objectName = this.getStringParam(params, 'objectname');
            if (!integrationName || !objectName) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_PARAMETER',
                    Message: 'IntegrationName and ObjectName are both required.',
                    Params: params.Params,
                };
            }

            const verb = this.resolveVerb(params);
            if (verb === 'INVALID') {
                return {
                    Success: false,
                    ResultCode: 'INVALID_VERB',
                    Message: `Verb must be one of: ${VALID_VERBS.join(', ')}.`,
                    Params: params.Params,
                };
            }

            const results = await this.generate(integrationName, objectName, verb, params);
            return this.buildResult(results, params);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            LogError(`GenerateIntegrationActionAction error: ${message}`);
            return {
                Success: false,
                ResultCode: 'UNEXPECTED_ERROR',
                Message: `Error generating integration action: ${message}`,
                Params: params.Params,
            };
        }
    }

    // ─── Delegation ──────────────────────────────────────────────────

    /** Delegate to the persister: one verb, or all applicable verbs when none supplied. */
    private async generate(
        integrationName: string,
        objectName: string,
        verb: IntegrationActionVerb | undefined,
        params: RunActionParams,
    ): Promise<GenerateIntegrationActionResult[]> {
        const generator = new IntegrationActionGenerator();
        if (verb) {
            const single = await generator.GenerateAction(
                integrationName, objectName, verb, params.ContextUser, params.Provider,
            );
            return [single];
        }
        return generator.GenerateActionsForObject(
            integrationName, objectName, params.ContextUser, params.Provider,
        );
    }

    // ─── Result Mapping ──────────────────────────────────────────────

    /** Map the persister results to output params + an overall ActionResultSimple. */
    private buildResult(
        results: GenerateIntegrationActionResult[],
        params: RunActionParams,
    ): ActionResultSimple {
        const ids = results.filter(r => r.ActionID).map(r => r.ActionID as string);
        const names = results.filter(r => r.ActionName).map(r => r.ActionName as string);
        const allExisted = results.length > 0 && results.every(r => r.AlreadyExisted);

        this.setOutputParam(params, 'GeneratedActionIDs', ids);
        this.setOutputParam(params, 'ActionNames', names);
        this.setOutputParam(params, 'GeneratedActionID', ids.length === 1 ? ids[0] : null);
        this.setOutputParam(params, 'ActionName', names.length === 1 ? names[0] : null);
        this.setOutputParam(params, 'AlreadyExisted', allExisted);
        this.setOutputParam(params, 'Results', results);

        const anySuccess = results.some(r => r.Success);
        if (!anySuccess) {
            return {
                Success: false,
                ResultCode: 'GENERATION_FAILED',
                Message: this.summarize(results),
                Params: params.Params,
            };
        }

        return {
            Success: true,
            ResultCode: 'SUCCESS',
            Message: this.summarize(results),
            Params: params.Params,
        };
    }

    /** Human-readable summary of each per-verb result. */
    private summarize(results: GenerateIntegrationActionResult[]): string {
        if (results.length === 0) {
            return 'No actions were generated.';
        }
        return results.map(r => `${r.Verb}: ${r.Message}`).join('; ');
    }

    /**
     * Resolve the optional Verb param. Returns:
     *  - the typed verb when a valid one was supplied,
     *  - `undefined` when no Verb was supplied (caller generates all verbs),
     *  - the sentinel `'INVALID'` when a non-empty, unrecognized verb was supplied.
     */
    private resolveVerb(params: RunActionParams): IntegrationActionVerb | undefined | 'INVALID' {
        const raw = this.getStringParam(params, 'verb');
        if (!raw) return undefined;
        const match = VALID_VERBS.find(v => v.toLowerCase() === raw.toLowerCase());
        return match ?? 'INVALID';
    }

    // ─── Parameter Helpers ───────────────────────────────────────────

    private getParamValue(params: RunActionParams, name: string): unknown {
        const param = params.Params?.find(p => p.Name?.trim().toLowerCase() === name.toLowerCase());
        return param?.Value;
    }

    private getStringParam(params: RunActionParams, name: string): string | undefined {
        const value = this.getParamValue(params, name);
        if (value === undefined || value === null) return undefined;
        const str = String(value).trim();
        return str.length > 0 ? str : undefined;
    }

    private setOutputParam(params: RunActionParams, name: string, value: unknown): void {
        const existing = params.Params?.find(p => p.Name?.trim().toLowerCase() === name.toLowerCase());
        if (existing) {
            existing.Value = value;
            existing.Type = existing.Type === 'Input' ? 'Both' : existing.Type || 'Output';
        } else {
            if (!params.Params) {
                params.Params = [];
            }
            const output = new ActionParam();
            output.Name = name;
            output.Value = value;
            output.Type = 'Output';
            params.Params.push(output);
        }
    }
}

/**
 * Tree-shaking prevention — importing this function forces the module to load
 * and the `@RegisterClass` decorator to run. Re-exported via CoreActions' barrel.
 */
export function LoadGenerateIntegrationActionAction(): void {
    // intentionally empty
}
