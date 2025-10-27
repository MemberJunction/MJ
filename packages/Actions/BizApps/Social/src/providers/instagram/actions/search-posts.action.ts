import { RegisterClass } from '@memberjunction/global';
import { InstagramBaseAction } from '../instagram-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { LogError } from '@memberjunction/global';
import { SocialPost, SearchParams } from '../../../base/base-social.action';
import { BaseAction } from '@memberjunction/actions';

/**
 * Searches for historical Instagram posts from the business account.
 * Instagram API only allows searching within your own business account's posts.
 * Supports filtering by date range, hashtags, and content.
 */
@RegisterClass(BaseAction, 'Instagram - Search Posts')
export class InstagramSearchPostsAction extends InstagramBaseAction {
  protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    try {
      const companyIntegrationId = this.getParamValue(params.Params, 'CompanyIntegrationID');
      const query = this.getParamValue(params.Params, 'Query');
      const hashtags = this.getParamValue(params.Params, 'Hashtags') as string[];
      const startDate = this.getParamValue(params.Params, 'StartDate');
      const endDate = this.getParamValue(params.Params, 'EndDate');
      const mediaType = this.getParamValue(params.Params, 'MediaType');
      const minEngagement = this.getParamValue(params.Params, 'MinEngagement') || 0;
      const limit = this.getParamValue(params.Params, 'Limit') || 100;
      const includeArchived = this.getParamValue(params.Params, 'IncludeArchived') || false;

      // Initialize OAuth
      if (!(await this.initializeOAuth(companyIntegrationId))) {
        return {
          Success: false,
          Message: 'Failed to initialize Instagram authentication',
          ResultCode: 'AUTH_FAILED',
        };
      }

      // Build search parameters
      const searchParams: SearchParams = {
        query,
        hashtags,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        limit,
      };

      // Perform search
      const posts = await this.searchPosts(searchParams);

      // Filter by media type if specified
      let filteredPosts = posts;
      if (mediaType) {
        filteredPosts = posts.filter((post) => post.platformSpecificData.mediaType === mediaType);
      }

      // Filter by minimum engagement
      if (minEngagement > 0) {
        filteredPosts = filteredPosts.filter((post) => {
          const totalEngagement = (post.analytics?.likes || 0) + (post.analytics?.comments || 0);
          return totalEngagement >= minEngagement;
        });
      }

      // Include archived posts if requested
      if (includeArchived) {
        const archivedPosts = await this.getArchivedPosts(searchParams);
        filteredPosts = [...filteredPosts, ...archivedPosts];
      }

      // Sort posts by relevance
      const sortedPosts = this.sortByRelevance(filteredPosts, query, hashtags);

      // Analyze search results
      const analysis = this.analyzeSearchResults(sortedPosts, searchParams);

      // Store result in output params
      const outputParams = [...params.Params];
      outputParams.push({
        Name: 'ResultData',
        Type: 'Output',
        Value: JSON.stringify({
          posts: sortedPosts.slice(0, limit),
          totalFound: sortedPosts.length,
          searchCriteria: {
            query,
            hashtags,
            dateRange: {
              start: startDate,
              end: endDate,
            },
            mediaType,
            minEngagement,
          },
          analysis,
          suggestions: this.generateSearchSuggestions(sortedPosts, searchParams),
        }),
      });

      return {
        Success: true,
        Message: `Found ${sortedPosts.length} matching posts`,
        ResultCode: 'SUCCESS',
        Params: outputParams,
      };
    } catch (error: any) {
      LogError('Failed to search Instagram posts', error);

      if (error.code === 'RATE_LIMIT') {
        return {
          Success: false,
          Message: 'Instagram API rate limit exceeded. Please try again later.',
          ResultCode: 'RATE_LIMIT',
        };
      }

      return {
        Success: false,
        Message: `Failed to search posts: ${error.message}`,
        ResultCode: 'ERROR',
      };
    }
  }

  /**
   * Search posts implementation (Instagram only allows searching own posts)
   */
  protected async searchPosts(params: SearchParams): Promise<SocialPost[]> {
    // Instagram doesn't have a public search API, so we fetch all posts
    // and filter them client-side
    const allPosts = await this.fetchAllAccountPosts(params.startDate, params.endDate);

    // Filter posts based on search criteria
    let filtered = allPosts;

    // Filter by query in caption
    if (params.query) {
      const queryLower = params.query.toLowerCase();
      filtered = filtered.filter((post) => post.content.toLowerCase().includes(queryLower));
    }

    // Filter by hashtags
    if (params.hashtags && params.hashtags.length > 0) {
      const searchHashtags = params.hashtags.map((tag) => (tag.startsWith('#') ? tag.toLowerCase() : `#${tag}`.toLowerCase()));

      filtered = filtered.filter((post) => {
        const postHashtags = this.extractHashtags(post.content);
        return searchHashtags.some((searchTag) => postHashtags.includes(searchTag));
      });
    }

    return filtered.slice(0, params.limit || 100);
  }

  /**
   * Fetch all posts from the account within date range
   */
  private async fetchAllAccountPosts(startDate?: Date, endDate?: Date): Promise<SocialPost[]> {
    const posts: SocialPost[] = [];
    let hasNext = true;
    let afterCursor: string | undefined;

    while (hasNext) {
      const queryParams: any = {
        fields: 'id,caption,media_type,media_url,permalink,timestamp,like_count,comments_count',
        access_token: this.getAccessToken(),
        limit: 100,
      };

      if (afterCursor) {
        queryParams.after = afterCursor;
      }

      if (startDate) {
        queryParams.since = Math.floor(startDate.getTime() / 1000);
      }
      if (endDate) {
        queryParams.until = Math.floor(endDate.getTime() / 1000);
      }

      const response = await this.makeInstagramRequest<{
        data: any[];
        paging?: {
          cursors: { after: string };
          next?: string;
        };
      }>(`${this.instagramBusinessAccountId}/media`, 'GET', null, queryParams);

      if (response.data) {
        const normalizedPosts = response.data.map((post) => this.normalizePost(post));
        posts.push(...normalizedPosts);
      }

      if (response.paging?.next && response.paging?.cursors?.after) {
        afterCursor = response.paging.cursors.after;
      } else {
        hasNext = false;
      }

      // Stop if we've reached the date range limit
      if (posts.length > 0 && startDate) {
        const oldestPost = posts[posts.length - 1];
        if (oldestPost.publishedAt < startDate) {
          hasNext = false;
        }
      }
    }

    return posts;
  }

  /**
   * Get archived posts (if any)
   */
  private async getArchivedPosts(params: SearchParams): Promise<SocialPost[]> {
    try {
      // Instagram API doesn't have a specific endpoint for archived posts
      // This would require additional implementation or different API access
      return [];
    } catch (error) {
      LogError('Failed to get archived posts', error);
      return [];
    }
  }

  /**
   * Extract hashtags from content
   */
  private extractHashtags(content: string): string[] {
    const hashtagRegex = /#[\w\u0590-\u05ff]+/g;
    const matches = content.match(hashtagRegex) || [];
    return matches.map((tag) => tag.toLowerCase());
  }

  /**
   * Sort posts by relevance
   */
  private sortByRelevance(posts: SocialPost[], query?: string, hashtags?: string[]): SocialPost[] {
    return posts.sort((a, b) => {
      let scoreA = 0;
      let scoreB = 0;

      // Score based on query match position
      if (query) {
        const queryLower = query.toLowerCase();
        const posA = a.content.toLowerCase().indexOf(queryLower);
        const posB = b.content.toLowerCase().indexOf(queryLower);

        if (posA === 0)
          scoreA += 10; // Starts with query
        else if (posA > 0) scoreA += 5; // Contains query

        if (posB === 0) scoreB += 10;
        else if (posB > 0) scoreB += 5;
      }

      // Score based on hashtag matches
      if (hashtags && hashtags.length > 0) {
        const hashtagsA = this.extractHashtags(a.content);
        const hashtagsB = this.extractHashtags(b.content);

        hashtags.forEach((tag) => {
          const searchTag = tag.startsWith('#') ? tag.toLowerCase() : `#${tag}`.toLowerCase();
          if (hashtagsA.includes(searchTag)) scoreA += 3;
          if (hashtagsB.includes(searchTag)) scoreB += 3;
        });
      }

      // Score based on engagement
      const engagementA = (a.analytics?.likes || 0) + (a.analytics?.comments || 0);
      const engagementB = (b.analytics?.likes || 0) + (b.analytics?.comments || 0);

      scoreA += Math.log10(engagementA + 1);
      scoreB += Math.log10(engagementB + 1);

      // Sort by score (descending) then by date (descending)
      if (scoreA !== scoreB) {
        return scoreB - scoreA;
      }
      return b.publishedAt.getTime() - a.publishedAt.getTime();
    });
  }

  /**
   * Analyze search results
   */
  private analyzeSearchResults(posts: SocialPost[], params: SearchParams): any {
    const analysis = {
      totalPosts: posts.length,
      dateRange: {
        earliest: null as Date | null,
        latest: null as Date | null,
      },
      mediaTypes: {
        IMAGE: 0,
        VIDEO: 0,
        CAROUSEL_ALBUM: 0,
        REELS: 0,
      },
      engagement: {
        totalLikes: 0,
        totalComments: 0,
        avgLikesPerPost: 0,
        avgCommentsPerPost: 0,
        topPost: null as any,
      },
      hashtagFrequency: {} as Record<string, number>,
      postingPatterns: {
        byDayOfWeek: {} as Record<string, number>,
        byHour: {} as Record<number, number>,
      },
    };

    if (posts.length === 0) return analysis;

    // Find date range
    const dates = posts.map((p) => p.publishedAt.getTime());
    analysis.dateRange.earliest = new Date(Math.min(...dates));
    analysis.dateRange.latest = new Date(Math.max(...dates));

    // Analyze posts
    let topEngagement = 0;
    posts.forEach((post) => {
      // Media types
      const mediaType = post.platformSpecificData.mediaType;
      if (analysis.mediaTypes[mediaType] !== undefined) {
        analysis.mediaTypes[mediaType]++;
      }

      // Engagement
      const likes = post.analytics?.likes || 0;
      const comments = post.analytics?.comments || 0;
      const totalEngagement = likes + comments;

      analysis.engagement.totalLikes += likes;
      analysis.engagement.totalComments += comments;

      if (totalEngagement > topEngagement) {
        topEngagement = totalEngagement;
        analysis.engagement.topPost = {
          id: post.id,
          content: post.content.substring(0, 100) + '...',
          engagement: totalEngagement,
          publishedAt: post.publishedAt,
        };
      }

      // Hashtags
      const hashtags = this.extractHashtags(post.content);
      hashtags.forEach((tag) => {
        analysis.hashtagFrequency[tag] = (analysis.hashtagFrequency[tag] || 0) + 1;
      });

      // Posting patterns
      const dayOfWeek = post.publishedAt.toLocaleDateString('en-US', { weekday: 'long' });
      const hour = post.publishedAt.getHours();

      analysis.postingPatterns.byDayOfWeek[dayOfWeek] = (analysis.postingPatterns.byDayOfWeek[dayOfWeek] || 0) + 1;
      analysis.postingPatterns.byHour[hour] = (analysis.postingPatterns.byHour[hour] || 0) + 1;
    });

    // Calculate averages
    analysis.engagement.avgLikesPerPost = Math.round(analysis.engagement.totalLikes / posts.length);
    analysis.engagement.avgCommentsPerPost = Math.round(analysis.engagement.totalComments / posts.length);

    return analysis;
  }

  /**
   * Generate search suggestions based on results
   */
  private generateSearchSuggestions(posts: SocialPost[], params: SearchParams): any {
    const suggestions = {
      relatedHashtags: [] as string[],
      optimalPostingTimes: [] as any[],
      contentThemes: [] as string[],
      performanceInsights: [] as string[],
    };

    if (posts.length === 0) {
      suggestions.performanceInsights.push('No posts found matching your criteria. Try broadening your search.');
      return suggestions;
    }

    // Related hashtags (most frequently used)
    const hashtagCounts: Record<string, number> = {};
    posts.forEach((post) => {
      const hashtags = this.extractHashtags(post.content);
      hashtags.forEach((tag) => {
        if (!params.hashtags?.includes(tag)) {
          hashtagCounts[tag] = (hashtagCounts[tag] || 0) + 1;
        }
      });
    });

    suggestions.relatedHashtags = Object.entries(hashtagCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([tag]) => tag);

    // Optimal posting times (based on engagement)
    const timeEngagement: Record<string, { total: number; count: number }> = {};
    posts.forEach((post) => {
      const hour = post.publishedAt.getHours();
      const day = post.publishedAt.toLocaleDateString('en-US', { weekday: 'long' });
      const key = `${day} ${hour}:00`;

      if (!timeEngagement[key]) {
        timeEngagement[key] = { total: 0, count: 0 };
      }

      const engagement = (post.analytics?.likes || 0) + (post.analytics?.comments || 0);
      timeEngagement[key].total += engagement;
      timeEngagement[key].count++;
    });

    suggestions.optimalPostingTimes = Object.entries(timeEngagement)
      .map(([time, data]) => ({
        time,
        avgEngagement: Math.round(data.total / data.count),
      }))
      .sort((a, b) => b.avgEngagement - a.avgEngagement)
      .slice(0, 5);

    // Performance insights
    const avgEngagement =
      posts.reduce((sum, post) => sum + (post.analytics?.likes || 0) + (post.analytics?.comments || 0), 0) / posts.length;

    suggestions.performanceInsights.push(
      `Average engagement per post: ${Math.round(avgEngagement)}`,
      `Most successful media type: ${this.getMostSuccessfulMediaType(posts)}`,
      `Posts with questions get ${this.getQuestionEngagementBoost(posts)}% more engagement`
    );

    return suggestions;
  }

  /**
   * Get most successful media type
   */
  private getMostSuccessfulMediaType(posts: SocialPost[]): string {
    const typeEngagement: Record<string, { total: number; count: number }> = {};

    posts.forEach((post) => {
      const type = post.platformSpecificData.mediaType;
      if (!typeEngagement[type]) {
        typeEngagement[type] = { total: 0, count: 0 };
      }

      const engagement = (post.analytics?.likes || 0) + (post.analytics?.comments || 0);
      typeEngagement[type].total += engagement;
      typeEngagement[type].count++;
    });

    let bestType = 'IMAGE';
    let bestAvg = 0;

    Object.entries(typeEngagement).forEach(([type, data]) => {
      const avg = data.total / data.count;
      if (avg > bestAvg) {
        bestAvg = avg;
        bestType = type;
      }
    });

    return bestType;
  }

  /**
   * Calculate engagement boost for posts with questions
   */
  private getQuestionEngagementBoost(posts: SocialPost[]): number {
    const withQuestions = posts.filter((p) => p.content.includes('?'));
    const withoutQuestions = posts.filter((p) => !p.content.includes('?'));

    if (withQuestions.length === 0 || withoutQuestions.length === 0) {
      return 0;
    }

    const avgWithQuestions =
      withQuestions.reduce((sum, post) => sum + (post.analytics?.likes || 0) + (post.analytics?.comments || 0), 0) / withQuestions.length;

    const avgWithoutQuestions =
      withoutQuestions.reduce((sum, post) => sum + (post.analytics?.likes || 0) + (post.analytics?.comments || 0), 0) /
      withoutQuestions.length;

    if (avgWithoutQuestions === 0) return 0;

    return Math.round(((avgWithQuestions - avgWithoutQuestions) / avgWithoutQuestions) * 100);
  }

  /**
   * Define the parameters for this action
   */
  public get Params(): ActionParam[] {
    return [
      ...this.commonSocialParams,
      {
        Name: 'Query',
        Type: 'Input',
        Value: null,
      },
      {
        Name: 'Hashtags',
        Type: 'Input',
        Value: null,
      },
      {
        Name: 'StartDate',
        Type: 'Input',
        Value: null,
      },
      {
        Name: 'EndDate',
        Type: 'Input',
        Value: null,
      },
      {
        Name: 'MediaType',
        Type: 'Input',
        Value: null,
      },
      {
        Name: 'MinEngagement',
        Type: 'Input',
        Value: 0,
      },
      {
        Name: 'Limit',
        Type: 'Input',
        Value: 100,
      },
      {
        Name: 'IncludeArchived',
        Type: 'Input',
        Value: false,
      },
    ];
  }

  /**
   * Get the description for this action
   */
  public get Description(): string {
    return 'Searches historical Instagram posts from your business account with filters for date range, hashtags, content, and engagement metrics.';
  }
}
