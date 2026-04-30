import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';
import { RegisterClass } from '@memberjunction/global';
import { IMetadataProvider, LogError, Metadata } from '@memberjunction/core';
import {
    MJActionEntity,
    MJActionParamEntity,
    MJActionResultCodeEntity,
    MJActionEntity_IRuntimeActionConfiguration
} from '@memberjunction/core-entities';
import { RuntimeActionConfigurationSchema } from '@memberjunction/actions-base';

/**
 * Persists a new Runtime action to the Actions catalog with
 * `CodeApprovalStatus='Pending'`. Used by the ActionSmith agent as the
 * last step of the "generate, test, submit for approval" pipeline.
 *
 * Responsibilities:
 *   - Validate the supplied `RuntimeActionConfiguration` against the Zod
 *     schema — invalid configs are rejected before anything hits the DB.
 *   - Create the Action row with Type='Runtime', the author-agent link,
 *     and the JSON-serialized configuration stored via the generated
 *     `RuntimeActionConfigurationObject` accessor.
 *   - Create ActionParam rows for declared inputs and outputs.
 *   - Create ActionResultCode rows for declared result codes.
 *
 * The action record is NOT activated. `CodeApprovalStatus` is 'Pending'
 * until a human reviews the code + permissions through the approval UI.
 */
@RegisterClass(BaseAction, 'Create Runtime Action')
export class CreateRuntimeActionAction extends BaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const name = this.getStringParam(params, 'name');
            const description = this.getStringParam(params, 'description');
            const categoryId = this.getStringParam(params, 'categoryid');
            const code = this.getStringParam(params, 'code');
            const maxExecutionTimeMs = this.getNumericParam(params, 'maxexecutiontimems');
            const createdByAgentId = this.getStringParam(params, 'createdbyagentid');
            const config = this.getObjectParam(params, 'configuration');
            const inputParams = (this.getObjectParam(params, 'inputparams') as ParamSpec[] | null) ?? [];
            const outputParams = (this.getObjectParam(params, 'outputparams') as ParamSpec[] | null) ?? [];
            const resultCodes = (this.getObjectParam(params, 'resultcodes') as ResultCodeSpec[] | null) ?? [];

            if (!name) {
                return fail('MISSING_NAME', 'Name is required to create a runtime action.');
            }
            if (!description) {
                return fail('MISSING_DESCRIPTION', 'Description is required.');
            }
            if (!code) {
                return fail('MISSING_CODE', 'Code is required.');
            }
            if (!config) {
                return fail('MISSING_CONFIG', 'RuntimeActionConfiguration is required.');
            }

            const validated = RuntimeActionConfigurationSchema.safeParse(config);
            if (!validated.success) {
                return fail(
                    'INVALID_CONFIG',
                    `RuntimeActionConfiguration failed validation: ${validated.error.message}`
                );
            }

            const md = params.Provider ?? new Metadata();
            // Entity is registered as 'MJ: Actions' (see entity_subclasses.ts —
            // newer MJ core entities use the 'MJ: ' prefix). Passing 'Actions'
            // silently returned null, so every Create Runtime Action call
            // failed with "Could not instantiate Actions entity" — this
            // permanently blocked ActionSmith from persisting any action.
            const action = await md.GetEntityObject<MJActionEntity>('MJ: Actions', params.ContextUser);
            if (!action) {
                return fail(
                    'ENTITY_LOAD_FAILED',
                    'Could not instantiate MJ: Actions entity. Check that the entity exists and the context user has permission.'
                );
            }
            action.NewRecord();
            action.Name = name;
            action.Description = description;
            action.Type = 'Runtime';
            action.Code = code;
            action.CodeApprovalStatus = 'Pending';
            action.Status = 'Active';
            if (categoryId) {
                action.CategoryID = categoryId;
            }
            if (maxExecutionTimeMs != null) {
                action.MaxExecutionTimeMS = maxExecutionTimeMs;
            }
            if (createdByAgentId) {
                action.CreatedByAgentID = createdByAgentId;
            }
            // Use the typed JSONType accessor emitted by CodeGen — this
            // stringifies the config into RuntimeActionConfiguration behind
            // the scenes and caches the parsed form for subsequent reads.
            action.RuntimeActionConfigurationObject = validated.data as unknown as MJActionEntity_IRuntimeActionConfiguration;

            const saved = await action.Save();
            if (!saved) {
                return fail(
                    'SAVE_FAILED',
                    action.LatestResult?.CompleteMessage ?? `Failed to save action '${name}'.`
                );
            }

            for (const p of [...inputParams, ...outputParams]) {
                const err = await this.createActionParam(md, params, action.ID, p);
                if (err) return err;
            }
            for (const rc of resultCodes) {
                const err = await this.createResultCode(md, params, action.ID, rc);
                if (err) return err;
            }

            this.setOutputParam(params, 'ActionID', action.ID);
            this.setOutputParam(params, 'Name', action.Name);
            this.setOutputParam(params, 'CodeApprovalStatus', action.CodeApprovalStatus);

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Runtime action '${name}' created and awaiting approval.`,
                Params: params.Params
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            LogError(`CreateRuntimeActionAction error: ${message}`);
            return fail('UNEXPECTED_ERROR', message);
        }
    }

    private async createActionParam(
        md: IMetadataProvider | Metadata,
        params: RunActionParams,
        actionId: string,
        spec: ParamSpec
    ): Promise<ActionResultSimple | null> {
        const entity = await md.GetEntityObject<MJActionParamEntity>(
            'MJ: Action Params',
            params.ContextUser
        );
        if (!entity) {
            return fail('PARAM_ENTITY_FAILED', 'Could not instantiate Action Params entity.');
        }
        entity.NewRecord();
        entity.ActionID = actionId;
        entity.Name = spec.name;
        entity.Type = spec.type;
        entity.ValueType = spec.valueType ?? 'Scalar';
        entity.IsArray = Boolean(spec.isArray);
        entity.IsRequired = Boolean(spec.isRequired);
        if (spec.description) entity.Description = spec.description;
        if (spec.defaultValue != null) entity.DefaultValue = String(spec.defaultValue);
        const saved = await entity.Save();
        if (!saved) {
            return fail(
                'PARAM_SAVE_FAILED',
                entity.LatestResult?.CompleteMessage ?? `Failed to save param '${spec.name}'.`
            );
        }
        return null;
    }

    private async createResultCode(
        md: IMetadataProvider | Metadata,
        params: RunActionParams,
        actionId: string,
        spec: ResultCodeSpec
    ): Promise<ActionResultSimple | null> {
        const entity = await md.GetEntityObject<MJActionResultCodeEntity>(
            'MJ: Action Result Codes',
            params.ContextUser
        );
        if (!entity) {
            return fail('RESULT_CODE_ENTITY_FAILED', 'Could not instantiate Result Codes entity.');
        }
        entity.NewRecord();
        entity.ActionID = actionId;
        entity.ResultCode = spec.resultCode;
        entity.IsSuccess = Boolean(spec.isSuccess);
        if (spec.description) entity.Description = spec.description;
        const saved = await entity.Save();
        if (!saved) {
            return fail(
                'RESULT_CODE_SAVE_FAILED',
                entity.LatestResult?.CompleteMessage ??
                    `Failed to save result code '${spec.resultCode}'.`
            );
        }
        return null;
    }

    // --- tiny local param helpers ------------------------------------------

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

    private getNumericParam(params: RunActionParams, name: string): number | undefined {
        const v = this.getParamValue(params, name);
        if (v == null) return undefined;
        const n = Number(v);
        return Number.isFinite(n) ? n : undefined;
    }

    private getObjectParam(params: RunActionParams, name: string): unknown {
        const v = this.getParamValue(params, name);
        if (v == null) return null;
        if (typeof v === 'object') return v;
        if (typeof v === 'string') {
            try {
                return JSON.parse(v);
            } catch {
                return null;
            }
        }
        return null;
    }

    private setOutputParam(params: RunActionParams, name: string, value: unknown): void {
        const existing = params.Params?.find(
            (p) => p.Name?.trim().toLowerCase() === name.toLowerCase()
        );
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
// Local types and helpers
// =========================================================================

interface ParamSpec {
    name: string;
    type: 'Input' | 'Output' | 'Both';
    valueType?: 'Scalar' | 'Simple Object' | 'BaseEntity Sub-Class' | 'Other';
    isArray?: boolean;
    isRequired?: boolean;
    description?: string;
    defaultValue?: unknown;
}

interface ResultCodeSpec {
    resultCode: string;
    isSuccess: boolean;
    description?: string;
}

function fail(resultCode: string, message: string): ActionResultSimple {
    return { Success: false, ResultCode: resultCode, Message: message };
}

/** Tree-shaking prevention hook called from the CoreActions public API. */
export function LoadCreateRuntimeActionAction(): void {
    // intentionally empty
}
