import { RegisterClass } from '@memberjunction/global';
import { BufferBaseAction } from '../buffer-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';

/**
 * Queue reordering for Buffer posts.
 *
 * NOTE: Buffer's GraphQL API (https://developers.buffer.com) does not
 * currently expose a queue reorder mutation. This action returns a clear
 * error until the API adds support. The old v1 REST endpoint
 * (POST /profiles/{id}/updates/reorder.json) no longer accepts new API keys.
 */
@RegisterClass(BaseAction, 'BufferReorderQueueAction')
export class BufferReorderQueueAction extends BufferBaseAction {
  protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    return {
      Success: false,
      ResultCode: 'NOT_SUPPORTED',
      Message:
        'Queue reordering is not available through the current Buffer GraphQL API. ' +
        'The legacy REST endpoint has been deprecated. ' +
        'See https://developers.buffer.com for API status updates.',
      Params: params.Params,
    };
  }

  public get Params(): ActionParam[] {
    return [
      ...this.bufferCommonParams,
      { Name: 'ChannelID', Type: 'Input', Value: null },
      { Name: 'PostIDs', Type: 'Input', Value: null },
      { Name: 'Summary', Type: 'Output', Value: null },
    ];
  }

  public get Description(): string {
    return 'Reorders posts in a Buffer channel queue (currently unavailable — Buffer GraphQL API does not yet expose queue reordering)';
  }
}
