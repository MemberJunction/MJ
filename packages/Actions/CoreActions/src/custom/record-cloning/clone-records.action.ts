/**
 * @file clone-records.action.ts
 * Core action to clone multiple entity records in bulk.
 * @see plans/record-cloning/README.md §11.2
 */

import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { RegisterClass } from '@memberjunction/global';
import { BaseAction } from '@memberjunction/actions';
import { CompositeKey, Metadata } from '@memberjunction/core';
import { BATCH_AUTHORIZATION, CloneAuthorizer, RecordCloneEngine, ToRecordKeyString } from '@memberjunction/record-cloning';
import { CloneRequestOptions, CloneWarning } from '@memberjunction/record-cloning-base';

/** One root's outcome in the `Results` output. */
interface CloneRecordsItemResult {
    RecordID: string;
    Success: boolean;
    ResultCode: string;
    NewRecordID: string | null;
    CloneLogID: string | null;
    CreatedCount: number;
    Warnings: CloneWarning[];
    ErrorMessage?: string;
}

@RegisterClass(BaseAction, 'Clone Records')
export class CloneRecordsAction extends BaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const entityName = this.getStringParam(params, 'entityname');
            if (!entityName) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_PARAMETERS',
                    Message: 'EntityName is required',
                };
            }

            const recordIdsParam = this.getParamValue(params, 'recordids');
            if (!recordIdsParam) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_PARAMETERS',
                    Message: 'RecordIDs is required',
                };
            }

            const md = params.Provider ?? new Metadata();
            const entityInfo = md.EntityByName(entityName);
            if (!entityInfo) {
                return {
                    Success: false,
                    ResultCode: 'ENTITY_NOT_FOUND',
                    Message: `Entity '${entityName}' not found in metadata`,
                };
            }

            let recordIds: string[] = [];
            if (Array.isArray(recordIdsParam)) {
                recordIds = (recordIdsParam as unknown[]).map((id) => String(id));
            } else if (typeof recordIdsParam === 'string') {
                try {
                    const parsed = JSON.parse(recordIdsParam) as unknown[];
                    if (Array.isArray(parsed)) {
                        recordIds = parsed.map((id) => String(id));
                    } else {
                        recordIds = recordIdsParam.split(',').map((s) => s.trim()).filter(Boolean);
                    }
                } catch {
                    recordIds = recordIdsParam.split(',').map((s) => s.trim()).filter(Boolean);
                }
            }

            if (recordIds.length === 0) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_PARAMETERS',
                    Message: 'At least one RecordID must be specified',
                };
            }

            let options: CloneRequestOptions = {};
            const optionsRaw = this.getParamValue(params, 'options');
            if (optionsRaw) {
                if (typeof optionsRaw === 'string') {
                    try {
                        options = JSON.parse(optionsRaw) as CloneRequestOptions;
                    } catch (e) {
                        return {
                            Success: false,
                            ResultCode: 'INVALID_JSON',
                            Message: `Failed to parse Options JSON: ${(e as Error).message}`,
                        };
                    }
                } else if (typeof optionsRaw === 'object') {
                    options = optionsRaw as CloneRequestOptions;
                }
            }

            if (this.getBooleanParam(params, 'dryrun', false)) {
                options.DryRun = true;
            }
            const dryRun = options.DryRun === true;

            if (!new CloneAuthorizer(params.Provider ?? Metadata.Provider).CanBatchClone(params.ContextUser)) {
                return {
                    Success: false,
                    ResultCode: 'FORBIDDEN',
                    Message: `Cloning several records at once requires the '${BATCH_AUTHORIZATION}' authorization.`,
                };
            }

            // Each root is its own clone and its own transaction, so one failure doesn't undo the others.
            // Results say which records were cloned, so a retry can target only the failures.
            const engine = new RecordCloneEngine(params.Provider);
            const results: CloneRecordsItemResult[] = [];
            for (const id of recordIds) {
                try {
                    const result = await engine.Clone(
                        { EntityName: entityName, SourceRecordKey: CompositeKey.FromRecordID(entityInfo, id), Options: options },
                        params.ContextUser
                    );
                    results.push({
                        RecordID: id,
                        Success: result.Success,
                        ResultCode: result.ResultCode ?? (result.Success ? 'SUCCESS' : 'FAILED'),
                        NewRecordID: dryRun ? null : ToRecordKeyString(result.Roots?.[0]?.TargetKey) || null,
                        CloneLogID: result.CloneLogID ?? null,
                        CreatedCount: dryRun ? result.Counts?.Create ?? 0 : result.Created?.length ?? 0,
                        Warnings: result.Warnings ?? [],
                        ErrorMessage: result.ErrorMessage,
                    });
                } catch (err) {
                    results.push({ RecordID: id, Success: false, ResultCode: 'FAILED', NewRecordID: null, CloneLogID: null, CreatedCount: 0, Warnings: [], ErrorMessage: (err as Error).message });
                }
            }

            const succeeded = results.filter((r) => r.Success);
            const createdCount = results.reduce((sum, r) => sum + r.CreatedCount, 0);
            this.pushOutput(params, 'CreatedCount', createdCount);
            this.pushOutput(params, 'CloneLogID', succeeded[0]?.CloneLogID ?? null);
            this.pushOutput(params, 'Results', results);
            this.pushOutput(params, 'Warnings', results.flatMap((r) => r.Warnings));

            const allOk = succeeded.length === results.length;
            const verb = dryRun ? 'Planned' : 'Cloned';
            return {
                Success: allOk,
                ResultCode: allOk ? 'SUCCESS' : succeeded.length > 0 ? 'PARTIAL' : results[0]?.ResultCode ?? 'FAILED',
                Message: `${verb} ${succeeded.length} of ${results.length} root records (${createdCount} records ${dryRun ? 'to create' : 'created'}).` +
                    (allOk ? '' : ` Failed: ${results.filter((r) => !r.Success).map((r) => `${r.RecordID} (${r.ErrorMessage ?? r.ResultCode})`).join('; ')}`),
            };
        } catch (error) {
            return {
                Success: false,
                ResultCode: 'FAILED',
                Message: (error as Error).message,
            };
        }
    }

    private getStringParam(params: RunActionParams, name: string): string | undefined {
        const value = params.Params.find((p) => p.Name.trim().toLowerCase() === name)?.Value;
        if (value == null) return undefined;
        const s = String(value).trim();
        return s.length > 0 ? s : undefined;
    }

    private getBooleanParam(params: RunActionParams, name: string, defaultValue: boolean): boolean {
        const value = params.Params.find((p) => p.Name.trim().toLowerCase() === name)?.Value;
        if (value == null) return defaultValue;
        if (typeof value === 'boolean') return value;
        const s = String(value).trim().toLowerCase();
        if (s === 'true' || s === '1' || s === 'yes') return true;
        if (s === 'false' || s === '0' || s === 'no') return false;
        return defaultValue;
    }

    private getParamValue(params: RunActionParams, name: string): unknown {
        return params.Params.find((p) => p.Name.trim().toLowerCase() === name)?.Value;
    }

    private pushOutput(params: RunActionParams, name: string, value: unknown): void {
        params.Params.push({ Name: name, Type: 'Output', Value: value });
    }
}
