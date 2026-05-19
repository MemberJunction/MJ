import { RegisterClass } from '@memberjunction/global';
import { BufferBaseAction } from '../buffer-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { SocialPost } from '../../../base/base-social.action';
import { BaseAction } from '@memberjunction/actions';

function generateSearchStatistics(posts: SocialPost[], extractHashtags: (content: string) => string[]) {
  const stats = {
    postsByChannel: {} as Record<string, number>,
    postsByMonth: {} as Record<string, number>,
    postsByDayOfWeek: {} as Record<string, number>,
    postsWithMedia: 0,
    hashtagFrequency: {} as Record<string, number>,
  };

  for (const post of posts) {
    stats.postsByChannel[post.profileId] = (stats.postsByChannel[post.profileId] || 0) + 1;

    const month = post.publishedAt.toISOString().substring(0, 7);
    stats.postsByMonth[month] = (stats.postsByMonth[month] || 0) + 1;

    const dayOfWeek = post.publishedAt.toLocaleDateString('en-US', { weekday: 'long' });
    stats.postsByDayOfWeek[dayOfWeek] = (stats.postsByDayOfWeek[dayOfWeek] || 0) + 1;

    if (post.mediaUrls.length > 0) stats.postsWithMedia++;

    for (const tag of extractHashtags(post.content)) {
      stats.hashtagFrequency[tag] = (stats.hashtagFrequency[tag] || 0) + 1;
    }
  }

  return stats;
}

/**
 * Searches historical posts in Buffer using the GraphQL posts query with
 * server-side date/channel/status filters. Text and hashtag filtering is
 * applied client-side since the API doesn't support full-text search.
 */
@RegisterClass(BaseAction, 'BufferSearchPostsAction')
export class BufferSearchPostsAction extends BufferBaseAction {
  protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    const { Params } = params;

    try {
      const query = this.getParamValue(Params, 'Query') as string | null;
      const channelIds = this.getParamValue(Params, 'ChannelIDs') as string[] | null;
      const hashtags = this.getParamValue(Params, 'Hashtags') as string[] | null;
      const startDate = this.getParamValue(Params, 'StartDate') as string | null;
      const endDate = this.getParamValue(Params, 'EndDate') as string | null;
      const limit = (this.getParamValue(Params, 'Limit') as number | null) || 100;
      const offset = (this.getParamValue(Params, 'Offset') as number | null) || 0;

      const authError = await this.ensureAuthenticated(params);
      if (authError) return authError;

      const organizationId = await this.resolveOrganizationId(Params);

      const posts = await this.searchPosts({
        query: query || undefined,
        hashtags: hashtags || undefined,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        limit,
        offset,
        channelIds: channelIds || undefined,
        organizationId,
      });

      const statistics = generateSearchStatistics(posts, (content) => this.extractHashtags(content));

      const summary = {
        totalResults: posts.length,
        searchCriteria: {
          query: query || null,
          hashtags: hashtags || [],
          dateRange: { start: startDate || null, end: endDate || null },
          channelIds: channelIds || [],
          limit,
          offset,
        },
        statistics,
        dateRange: {
          earliest: posts.length > 0 ? posts[posts.length - 1].publishedAt : null,
          latest: posts.length > 0 ? posts[0].publishedAt : null,
        },
      };

      this.setOutputParam(Params, 'Posts', posts);
      this.setOutputParam(Params, 'Summary', summary);

      return { Success: true, ResultCode: 'SUCCESS', Message: `Found ${posts.length} posts matching search criteria`, Params };
    } catch (error) {
      return this.buildErrorResult(error, 'search posts', Params);
    }
  }

  public get Params(): ActionParam[] {
    return [
      ...this.bufferCommonParams,
      { Name: 'Query', Type: 'Input', Value: null },
      { Name: 'ChannelIDs', Type: 'Input', Value: null },
      { Name: 'Hashtags', Type: 'Input', Value: null },
      { Name: 'StartDate', Type: 'Input', Value: null },
      { Name: 'EndDate', Type: 'Input', Value: null },
      { Name: 'Limit', Type: 'Input', Value: 100 },
      { Name: 'Offset', Type: 'Input', Value: 0 },
      { Name: 'Posts', Type: 'Output', Value: null },
      { Name: 'Summary', Type: 'Output', Value: null },
    ];
  }

  public get Description(): string {
    return 'Searches historical posts in Buffer across channels with support for date ranges, hashtags, and content queries';
  }
}
