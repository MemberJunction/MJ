/**
 * @fileoverview Action that stewards a single Feature Pipeline (`MJ: Record Processes` with `WorkType = 'Infer'`)
 * through golden-set evaluation and version backfill via {@link FeaturePipelineVersionSteward}.
 * Invoked per record by the scheduled `'Feature Pipeline Version Steward'` Record Process.
 * @module @memberjunction/feature-pipelines-engine
 */

import { IMetadataProvider, Metadata } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseAction } from '@memberjunction/actions';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { FeaturePipelineVersionSteward } from '../steward/FeaturePipelineVersionSteward';

/** Optional runtime context for {@link StewardFeaturePipelineVersionAction}. */
export interface StewardFeaturePipelineActionContext {
    Provider?: IMetadataProvider;
}

/**
 * Stewards one Active Infer Record Process by ID (`RecordProcessID` input parameter),
 * evaluating an unevaluated candidate version on its golden set and backfilling an activated version.
 */
@RegisterClass(BaseAction, 'Steward Feature Pipeline Version')
export class StewardFeaturePipelineVersionAction extends BaseAction {
    protected async InternalRunAction(
        params: RunActionParams<StewardFeaturePipelineActionContext>,
    ): Promise<ActionResultSimple> {
        const recordProcessID = this.getStringParam(params.Params, 'RecordProcessID');
        if (!recordProcessID) {
            return {
                Success: false,
                ResultCode: 'MISSING_PARAMETERS',
                Message: 'RecordProcessID is required',
                Params: params.Params,
            };
        }

        const provider = params.Context?.Provider ?? Metadata.Provider; // global-provider-ok: fallback when ActionEngineServer runs without a custom provider context
        const outcomes = await FeaturePipelineVersionSteward.Instance.StewardPipelineByID(recordProcessID, {
            ContextUser: params.ContextUser,
            Provider: provider,
        });

        const last = outcomes[outcomes.length - 1];
        const detail = outcomes.map((o) => o.Detail).join('; ');
        this.setOutputParam(params.Params, 'Outcomes', outcomes);
        this.setOutputParam(params.Params, 'Version', last?.Version ?? null);
        this.setOutputParam(params.Params, 'LastAction', last?.Action ?? 'none');
        this.setOutputParam(params.Params, 'Detail', detail);

        const success = outcomes.every((o) => o.Action !== 'error');
        const message = outcomes
            .map((o) => `${o.Name}${o.Version !== null ? ` v${o.Version}` : ''}: ${o.Action} — ${o.Detail}`)
            .join('; ');

        return {
            Success: success,
            ResultCode: success ? 'SUCCESS' : 'STEWARD_ERROR',
            Message: message,
            Params: params.Params,
        };
    }

    private getStringParam(params: ActionParam[] | undefined, name: string): string | undefined {
        const wanted = name.toLowerCase();
        const found = (params ?? []).find((p) => p.Name.toLowerCase() === wanted && p.Type !== 'Output');
        if (found?.Value === undefined || found?.Value === null) {
            return undefined;
        }
        const trimmed = String(found.Value).trim();
        return trimmed.length > 0 ? trimmed : undefined;
    }

    private setOutputParam(params: ActionParam[] | undefined, name: string, value: ActionParam['Value']): void {
        if (!params) {
            return;
        }
        const wanted = name.toLowerCase();
        const existing = params.find((p) => p.Name.toLowerCase() === wanted && (p.Type === 'Output' || p.Type === 'Both'));
        if (existing) {
            existing.Value = value;
        } else {
            params.push({ Name: name, Value: value, Type: 'Output' });
        }
    }
}
