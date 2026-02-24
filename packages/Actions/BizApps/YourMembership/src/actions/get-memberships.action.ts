import { RegisterClass } from '@memberjunction/global';
import { BaseAction } from '@memberjunction/actions';
import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseYMAction } from '../base/base-ym-action';
import type { YMMembership } from '../types/ym-api-types';

/**
 * Retrieves membership definitions from the YourMembership API.
 */
@RegisterClass(BaseAction, 'GetYMMembershipsAction')
export class GetYMMembershipsAction extends BaseYMAction {
    public get Description(): string {
        return 'Retrieves membership definitions from YourMembership';
    }

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const clientId = this.GetClientID(params.Params);
            const apiKey = this.GetAPIKey(params.Params, clientId);

            const response = await this.MakeYMRequest<YMMembership[]>(
                'Memberships', clientId, apiKey
            );
            const memberships = response.Result ?? [];

            this.SetOutputParam(params, 'Memberships', memberships);
            this.SetOutputParam(params, 'TotalCount', memberships.length);

            return this.BuildSuccessResult(`Retrieved ${memberships.length} memberships from YourMembership`);
        } catch (error) {
            return this.BuildErrorResult(
                error instanceof Error ? error.message : String(error),
                'YM_API_ERROR'
            );
        }
    }
}
