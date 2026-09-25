/**
 * @file clone-record.action.ts
 * Core action to clone a single entity record.
 * @see plans/record-cloning/README.md §11.2
 */

import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { RegisterClass } from '@memberjunction/global';
import { BaseAction } from '@memberjunction/actions';
import { CompositeKey, Metadata } from '@memberjunction/core';
import { RecordCloneEngine, ToRecordKeyString } from '@memberjunction/record-cloning';
import { CloneRequestOptions } from '@memberjunction/record-cloning-base';

@RegisterClass(BaseAction, 'Clone Record')
export class CloneRecordAction extends BaseAction {
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

            const recordId = this.getStringParam(params, 'recordid');
            if (!recordId) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_PARAMETERS',
                    Message: 'RecordID is required',
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

            const key = CompositeKey.FromRecordID(entityInfo, recordId);
            const result = await new RecordCloneEngine(params.Provider).Clone(
                { EntityName: entityName, SourceRecordKey: key, Options: options },
                params.ContextUser
            );

            // Nothing below may throw: once Clone returns, a committed clone must be reported as one,
            // or a retry would create duplicates.
            const dryRun = options.DryRun === true;
            const newRecordId = dryRun ? null : ToRecordKeyString(result.Roots?.[0]?.TargetKey) || null;
            this.pushOutput(params, 'NewRecordID', newRecordId);
            this.pushOutput(params, 'CloneLogID', result.CloneLogID ?? null);
            this.pushOutput(params, 'CreatedCount', dryRun ? result.Counts?.Create ?? 0 : result.Created?.length ?? 0);
            this.pushOutput(params, 'Warnings', result.Warnings ?? []);

            return {
                Success: result.Success,
                ResultCode: result.ResultCode ?? (result.Success ? 'SUCCESS' : 'FAILED'),
                Message: !result.Success
                    ? result.ErrorMessage || `Clone failed with status ${result.ResultCode}`
                    : dryRun
                      ? `Plan computed: ${result.Counts?.Create ?? 0} records to create`
                      : `Successfully cloned record ${recordId} to ${newRecordId}`,
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
