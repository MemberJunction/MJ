import { RegisterClass } from '@memberjunction/global';
import { BufferBaseAction } from '../buffer-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';

/**
 * Analytics retrieval for Buffer posts.
 *
 * NOTE: Buffer's GraphQL API (https://developers.buffer.com) does not
 * currently expose analytics or engagement metrics. This action returns
 * a clear error until the API adds support. The old v1 REST endpoint
 * (GET /updates/{id}/interactions.json) no longer accepts new API keys.
 */
@RegisterClass(BaseAction, 'BufferGetAnalyticsAction')
export class BufferGetAnalyticsAction extends BufferBaseAction {
  protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    return {
      Success: false,
      ResultCode: 'NOT_SUPPORTED',
      Message:
        'Buffer analytics are not available through the current GraphQL API. ' +
        'The legacy REST endpoint has been deprecated. ' +
        'See https://developers.buffer.com for API status updates.',
      Params: params.Params,
    };
  }

  public get Params(): ActionParam[] {
    return [...this.bufferCommonParams, { Name: 'PostID', Type: 'Input', Value: null }, { Name: 'Analytics', Type: 'Output', Value: null }];
  }

  public get Description(): string {
    return 'Retrieves analytics for a Buffer post (currently unavailable — Buffer GraphQL API does not yet expose analytics)';
  }
}
