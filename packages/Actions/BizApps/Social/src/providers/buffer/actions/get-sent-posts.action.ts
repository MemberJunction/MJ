import { RegisterClass } from '@memberjunction/global';
import { BufferBaseAction, BufferPostStatus } from '../buffer-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';

/**
 * Retrieves sent (published) posts from Buffer.
 * Uses the posts query filtered by status "sent".
 */
@RegisterClass(BaseAction, 'BufferGetSentPostsAction')
export class BufferGetSentPostsAction extends BufferBaseAction {
  protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    const { Params } = params;

    try {
      const authError = await this.ensureAuthenticated(params);
      if (authError) return authError;

      const channelId = this.getParamValue(Params, 'ChannelID') as string | null;
      const limit = (this.getParamValue(Params, 'Limit') as number | null) || 20;
      const cursor = this.getParamValue(Params, 'After') as string | null;
      const startDate = this.getParamValue(Params, 'StartDate') as string | null;
      const endDate = this.getParamValue(Params, 'EndDate') as string | null;

      const organizationId = await this.resolveOrganizationId(Params);
      const status: BufferPostStatus = 'sent';
      const filters: { status: BufferPostStatus; channelIds?: string[]; startDate?: string; endDate?: string } = { status };
      if (channelId) filters.channelIds = [channelId];
      if (startDate) filters.startDate = new Date(startDate).toISOString();
      if (endDate) filters.endDate = new Date(endDate).toISOString();

      const connection = await this.fetchPosts(organizationId, filters, limit, cursor || undefined);
      const posts = connection.edges.map((edge) => this.normalizePost(edge.node));

      const summary = {
        totalPosts: posts.length,
        totalCount: connection.totalCount,
        hasMore: connection.pageInfo.hasNextPage,
        endCursor: connection.pageInfo.endCursor,
        channelId: channelId || 'all',
        dateRange: {
          earliest: posts.length > 0 ? posts[posts.length - 1].publishedAt : null,
          latest: posts.length > 0 ? posts[0].publishedAt : null,
        },
        postsByDay: this.groupPostsByDay(posts, 'publishedAt'),
      };

      this.setOutputParam(Params, 'Posts', posts);
      this.setOutputParam(Params, 'Summary', summary);

      return { Success: true, ResultCode: 'SUCCESS', Message: `Retrieved ${posts.length} sent posts from Buffer`, Params };
    } catch (error) {
      return this.buildErrorResult(error, 'get sent posts', Params);
    }
  }

  public get Params(): ActionParam[] {
    return [
      ...this.bufferCommonParams,
      { Name: 'ChannelID', Type: 'Input', Value: null },
      { Name: 'Limit', Type: 'Input', Value: 20 },
      { Name: 'After', Type: 'Input', Value: null },
      { Name: 'StartDate', Type: 'Input', Value: null },
      { Name: 'EndDate', Type: 'Input', Value: null },
      { Name: 'Posts', Type: 'Output', Value: null },
      { Name: 'Summary', Type: 'Output', Value: null },
    ];
  }

  public get Description(): string {
    return 'Retrieves sent (published) posts from Buffer with optional date range filtering';
  }
}
