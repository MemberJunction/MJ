import { ActionParam, ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { BaseAction } from "@memberjunction/actions";
import { RecordProcessExecutor } from "@memberjunction/record-set-processor";
import { Metadata } from "@memberjunction/core";
import { type RecordProcessScopeOverride } from "@memberjunction/core-entities";

/**
 * Runs a `MJ: Record Processes` definition — the agent / workflow / low-code surface for the same engine
 * the bulk-update UX drives. Thin by design: it parses params and delegates to {@link RecordProcessExecutor}
 * (never to another action).
 *
 * Parameters:
 *  - `RecordProcessID` (Input, required) — the process to run.
 *  - `Scope` (Input, optional) — a JSON-string `RecordProcessScopeOverride` (`{Kind:'records',RecordIDs:[…]}`
 *     / `{Kind:'view',ViewID}` / `{Kind:'list',ListID}` / `{Kind:'filter',Filter}`). Omit to use the
 *     process's stored Scope.
 *  - `DryRun` (Input, optional) — when true, compute changes without writing (FieldRules work type).
 *  - `OverwriteHumanValues` (Input, optional, default false) — when true, write-back overwrites values a person
 *     entered and retires their Human Feature Values; by default they are kept.
 *  - `ProcessRunID` / `Processed` / `Succeeded` / `Errored` / `Skipped` (Output) — the run summary.
 *
 * @example
 * ```typescript
 * await runAction({
 *   ActionName: 'Run Record Process',
 *   Params: [
 *     { Name: 'RecordProcessID', Value: rpId },
 *     { Name: 'Scope', Value: JSON.stringify({ Kind: 'records', RecordIDs: ids }) },
 *     { Name: 'DryRun', Value: true },
 *   ],
 * });
 * ```
 */
@RegisterClass(BaseAction, "Run Record Process")
export class RunRecordProcessAction extends BaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const recordProcessID = this.getStringParam(params, 'recordprocessid');
            if (!recordProcessID) {
                return { Success: false, ResultCode: "MISSING_PARAMETERS", Message: "RecordProcessID is required" };
            }

            let scope: RecordProcessScopeOverride | undefined;
            const scopeStr = this.getStringParam(params, 'scope');
            if (scopeStr) {
                try {
                    scope = JSON.parse(scopeStr) as RecordProcessScopeOverride;
                } catch (e) {
                    const reason = e instanceof Error ? e.message : String(e);
                    return { Success: false, ResultCode: "INVALID_JSON", Message: `Failed to parse Scope JSON: ${reason}` };
                }
            }

            const dryRun = this.getBooleanParam(params, 'dryrun', false);
            const overwriteHumanValues = this.getBooleanParam(params, 'overwritehumanvalues', false);

            const result = await new RecordProcessExecutor().RunByID(recordProcessID, {
                contextUser: params.ContextUser,
                // RunActionParams.Provider is optional by the action contract (absent = the server's default provider).
                provider: params.Provider || Metadata.Provider, // global-provider-ok: the RunActionParams.Provider contract's documented fallback
                scope,
                dryRun,
                overwriteHumanValues,
                triggeredBy: 'OnDemand',
            });

            this.pushOutput(params, 'ProcessRunID', result.ProcessRunID);
            this.pushOutput(params, 'Processed', result.Processed);
            this.pushOutput(params, 'Succeeded', result.Success);
            this.pushOutput(params, 'Errored', result.Error);
            this.pushOutput(params, 'Skipped', result.Skipped);

            const succeeded = result.Status === 'Completed';
            // Params carries the merged set (inputs + the outputs above) back to the engine, the same contract
            // every other CoreActions action follows — callers read the run summary from result.Params.
            return {
                Success: succeeded,
                ResultCode: succeeded ? "SUCCESS" : "FAILED",
                Params: params.Params,
                Message: succeeded
                    ? `${dryRun ? 'Previewed' : 'Processed'} ${result.Processed} record(s): ${result.Success} ok, ${result.Error} error, ${result.Skipped} skipped`
                    // `||`, not `??`: an empty ErrorMessage says nothing, so the status is the better message.
                    : (result.ErrorMessage || `Run ended with status '${result.Status}'`),
            };
        } catch (error) {
            return {
                Success: false,
                ResultCode: "UNEXPECTED_ERROR",
                Message: `Run Record Process failed: ${error instanceof Error ? error.message : String(error)}`,
            };
        }
    }

    /** Case-insensitive string param (trimmed; empty → undefined). */
    private getStringParam(params: RunActionParams, name: string): string | undefined {
        const value = params.Params.find(p => p.Name.trim().toLowerCase() === name)?.Value;
        if (value == null) return undefined;
        const s = String(value).trim();
        return s.length > 0 ? s : undefined;
    }

    /** Case-insensitive boolean param with a default. */
    private getBooleanParam(params: RunActionParams, name: string, defaultValue: boolean): boolean {
        const value = params.Params.find(p => p.Name.trim().toLowerCase() === name)?.Value;
        if (value == null) return defaultValue;
        if (typeof value === 'boolean') return value;
        const s = String(value).trim().toLowerCase();
        if (s === 'true' || s === '1' || s === 'yes') return true;
        if (s === 'false' || s === '0' || s === 'no') return false;
        return defaultValue;
    }

    /**
     * Sets an Output param: replaces a same-name param already on the list (a caller may pass the declared
     * outputs as placeholders; a duplicate would leave readers that take the first match on the stale value),
     * otherwise appends one.
     */
    private pushOutput(params: RunActionParams, name: string, value: unknown): void {
        const output: ActionParam = { Name: name, Type: 'Output', Value: value };
        const index = params.Params.findIndex(p => p.Name.trim().toLowerCase() === name.toLowerCase());
        if (index >= 0) {
            params.Params[index] = output;
        } else {
            params.Params.push(output);
        }
    }
}
