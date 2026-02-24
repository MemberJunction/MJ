import { RegisterClass } from '@memberjunction/global';
import { BaseAction } from '@memberjunction/actions';
import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseYMAction } from '../base/base-ym-action';
import type { YMMemberType } from '../types/ym-api-types';

/**
 * Retrieves member type definitions from the YourMembership API.
 */
@RegisterClass(BaseAction, 'GetYMMemberTypesAction')
export class GetYMMemberTypesAction extends BaseYMAction {
    public get Description(): string {
        return 'Retrieves member type definitions from YourMembership';
    }

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const clientId = this.GetClientID(params.Params);
            const apiKey = this.GetAPIKey(params.Params, clientId);

            const response = await this.MakeYMRequest<YMMemberType[]>(
                'MemberTypes', clientId, apiKey
            );
            const memberTypes = response.Result ?? [];

            this.SetOutputParam(params, 'MemberTypes', memberTypes);
            this.SetOutputParam(params, 'TotalCount', memberTypes.length);

            return this.BuildSuccessResult(`Retrieved ${memberTypes.length} member types from YourMembership`);
        } catch (error) {
            return this.BuildErrorResult(
                error instanceof Error ? error.message : String(error),
                'YM_API_ERROR'
            );
        }
    }
}
