/**
 * @file clone-records.action.ts
 * Core action to clone multiple entity records in bulk.
 * @see plans/record-cloning/README.md §11.2
 */

import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { RegisterClass } from '@memberjunction/global';
import { BaseAction } from '@memberjunction/actions';
import { CompositeKey, Metadata } from '@memberjunction/core';
import { RecordCloneEngine } from '@memberjunction/record-cloning';
import { CloneRequestOptions, RecordCloneRequest } from '@memberjunction/record-cloning-base';

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

            const md = Metadata.Provider;
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

            const dryRun = this.getBooleanParam(params, 'dryrun', false);
            if (dryRun) {
                options.DryRun = true;
            }

            const roots = recordIds.map((id) => {
                const key = CompositeKey.FromRecordID(entityInfo, id);
                return { EntityName: entityName, Key: key };
            });

            const engine = new RecordCloneEngine();

            if (options.DryRun) {
                const plan = await engine.Plan(
                    {
                        Roots: roots,
                        Options: options,
                    },
                    params.ContextUser
                );

                this.pushOutput(params, 'CreatedCount', plan.Counts.Create);
                this.pushOutput(params, 'CloneLogID', null);
                this.pushOutput(params, 'Results', []);
                this.pushOutput(params, 'Warnings', plan.Warnings);

                return {
                    Success: !plan.Blocked,
                    ResultCode: plan.Blocked ? 'BLOCKED' : 'SUCCESS',
                    Message: plan.Blocked
                        ? `Clone plan blocked: ${plan.Warnings.map((w) => w.Message).join('; ')}`
                        : `Plan computed for ${recordIds.length} root records (${plan.Counts.Create} records to create)`,
                };
            }

            const request: RecordCloneRequest = {
                Roots: roots,
                Options: options,
            };

            const result = await engine.Clone(request, params.ContextUser);

            this.pushOutput(params, 'CreatedCount', result.Created?.length ?? 0);
            this.pushOutput(params, 'CloneLogID', result.CloneLogID);
            this.pushOutput(params, 'Results', result.Created ?? []);
            this.pushOutput(params, 'Warnings', result.Warnings ?? []);

            return {
                Success: result.Success,
                ResultCode: result.ResultCode,
                Message: result.Success
                    ? `Successfully cloned ${recordIds.length} root records (${result.Created?.length ?? 0} total records created)`
                    : result.ErrorMessage || `Batch clone failed with status ${result.ResultCode}`,
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
