import { RegisterClass } from '@memberjunction/global';
import { BufferBaseAction } from '../buffer-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';

/**
 * Deletes a post from Buffer via the GraphQL deletePost mutation.
 */
@RegisterClass(BaseAction, 'BufferDeletePostAction')
export class BufferDeletePostAction extends BufferBaseAction {
  protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    const { Params } = params;

    try {
      const authError = await this.ensureAuthenticated(params);
      if (authError) return authError;

      const postId = this.getParamValue(Params, 'PostID') as string | null;
      if (!postId) throw new Error('PostID is required');

      const success = await this.deleteBufferPost(postId);

      this.setOutputParam(Params, 'Deleted', success);
      this.setOutputParam(Params, 'Summary', { postId, deleted: success, deletedAt: new Date().toISOString() });

      if (success) {
        return { Success: true, ResultCode: 'SUCCESS', Message: `Successfully deleted Buffer post ${postId}`, Params };
      }
      return { Success: false, ResultCode: 'DELETE_FAILED', Message: `Failed to delete Buffer post ${postId}`, Params };
    } catch (error) {
      return this.buildErrorResult(error, 'delete post', Params);
    }
  }

  public get Params(): ActionParam[] {
    return [
      ...this.bufferCommonParams,
      { Name: 'PostID', Type: 'Input', Value: null },
      { Name: 'Deleted', Type: 'Output', Value: false },
      { Name: 'Summary', Type: 'Output', Value: null },
    ];
  }

  public get Description(): string {
    return 'Deletes a pending or sent post from Buffer';
  }
}
