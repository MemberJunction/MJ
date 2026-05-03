import { RegisterClass } from '@memberjunction/global';
import { BufferBaseAction, BufferPostStatus } from '../buffer-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';

/**
 * Retrieves pending (queued) posts from Buffer.
 * Uses the posts query filtered by status "buffer" (Buffer's term for queued posts).
 */
@RegisterClass(BaseAction, 'BufferGetPendingPostsAction')
export class BufferGetPendingPostsAction extends BufferBaseAction {
  protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    const { Params } = params;

    try {
      const authError = await this.ensureAuthenticated(params);
      if (authError) return authError;

      const channelId = this.getParamValue(Params, 'ChannelID') as string | null;
      const limit = (this.getParamValue(Params, 'Limit') as number | null) || 20;
      const cursor = this.getParamValue(Params, 'After') as string | null;

      const organizationId = await this.resolveOrganizationId(Params);
      const status: BufferPostStatus = 'buffer';
      const filters: { status: BufferPostStatus; channelIds?: string[] } = { status };
      if (channelId) filters.channelIds = [channelId];

      const connection = await this.fetchPosts(organizationId, filters, limit, cursor || undefined);
      const posts = connection.edges.map((edge) => this.normalizePost(edge.node));

      const summary = {
        totalPosts: posts.length,
        totalCount: connection.totalCount,
        hasMore: connection.pageInfo.hasNextPage,
        endCursor: connection.pageInfo.endCursor,
        channelId: channelId || 'all',
        postsByDay: this.groupPostsByDay(posts, 'scheduledFor'),
      };

      this.setOutputParam(Params, 'Posts', posts);
      this.setOutputParam(Params, 'Summary', summary);

      return { Success: true, ResultCode: 'SUCCESS', Message: `Retrieved ${posts.length} pending posts from Buffer`, Params };
    } catch (error) {
      return this.buildErrorResult(error, 'get pending posts', Params);
    }
  }

  public get Params(): ActionParam[] {
    return [
      ...this.bufferCommonParams,
      { Name: 'ChannelID', Type: 'Input', Value: null },
      { Name: 'Limit', Type: 'Input', Value: 20 },
      { Name: 'After', Type: 'Input', Value: null },
      { Name: 'Posts', Type: 'Output', Value: null },
      { Name: 'Summary', Type: 'Output', Value: null },
    ];
  }

  public get Description(): string {
    return 'Retrieves pending (queued) posts from Buffer for a specific channel or all channels';
  }
}
