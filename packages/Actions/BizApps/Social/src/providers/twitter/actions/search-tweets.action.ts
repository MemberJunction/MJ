import { RegisterClass } from '@memberjunction/global';
import { TwitterBaseAction, Tweet, TwitterSearchParams } from '../twitter-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { LogStatus, LogError } from '@memberjunction/core';
import { SocialPost, SearchParams } from '../../../base/base-social.action';

/**
 * Action to search for tweets on Twitter/X with advanced operators and historical data
 */
@RegisterClass(BaseAction, 'TwitterSearchTweetsAction')
export class TwitterSearchTweetsAction extends TwitterBaseAction {
    /**
     * Search for tweets on Twitter
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const { Params, ContextUser } = params;
        
        try {
            // Initialize OAuth
            const companyIntegrationId = this.getParamValue(Params, 'CompanyIntegrationID');
            if (!await this.initializeOAuth(companyIntegrationId)) {
                throw new Error('Failed to initialize OAuth connection');
            }

            // Extract parameters
            const query = this.getParamValue(Params, 'Query');
            const hashtags = this.getParamValue(Params, 'Hashtags');
            const fromUser = this.getParamValue(Params, 'FromUser');
            const toUser = this.getParamValue(Params, 'ToUser');
            const mentionUser = this.getParamValue(Params, 'MentionUser');
            const startDate = this.getParamValue(Params, 'StartDate');
            const endDate = this.getParamValue(Params, 'EndDate');
            const language = this.getParamValue(Params, 'Language');
            const hasMedia = this.getParamValue(Params, 'HasMedia');
            const hasLinks = this.getParamValue(Params, 'HasLinks');
            const isRetweet = this.getParamValue(Params, 'IsRetweet');
            const isReply = this.getParamValue(Params, 'IsReply');
            const isQuote = this.getParamValue(Params, 'IsQuote');
            const isVerified = this.getParamValue(Params, 'IsVerified');
            const minLikes = this.getParamValue(Params, 'MinLikes');
            const minRetweets = this.getParamValue(Params, 'MinRetweets');
            const minReplies = this.getParamValue(Params, 'MinReplies');
            const place = this.getParamValue(Params, 'Place');
            const maxResults = this.getParamValue(Params, 'MaxResults') || 100;
            const sortOrder = this.getParamValue(Params, 'SortOrder') || 'recency';

            // Build search query with advanced operators
            const searchQuery = this.buildAdvancedSearchQuery({
                query,
                hashtags,
                fromUser,
                toUser,
                mentionUser,
                language,
                hasMedia,
                hasLinks,
                isRetweet,
                isReply,
                isQuote,
                isVerified,
                minLikes,
                minRetweets,
                minReplies,
                place
            });

            // Validate query
            if (!searchQuery.trim()) {
                throw new Error('At least one search parameter must be provided');
            }

            // Twitter search query length limit
            if (searchQuery.length > 512) {
                throw new Error(`Search query exceeds Twitter's 512 character limit (current: ${searchQuery.length} characters)`);
            }

            // Build search parameters
            const searchParams: TwitterSearchParams = {
                query: searchQuery,
                max_results: Math.min(maxResults, 100), // API limit per request
                sort_order: sortOrder as 'recency' | 'relevancy'
            };

            // Add date filters
            if (startDate) {
                searchParams.start_time = this.formatTwitterDate(startDate);
            }
            if (endDate) {
                searchParams.end_time = this.formatTwitterDate(endDate);
            }

            // Perform search
            LogStatus(`Searching tweets with query: ${searchQuery.substring(0, 100)}${searchQuery.length > 100 ? '...' : ''}`);
            const tweets = await this.searchTweetsInternal(searchParams, maxResults);

            // Convert to normalized format
            const normalizedPosts: SocialPost[] = tweets.map(tweet => this.normalizePost(tweet));

            // Analyze search results
            const analysis = this.analyzeSearchResults(tweets, normalizedPosts);

            // Update output parameters
            const outputParams = [...Params];
            const postsParam = outputParams.find(p => p.Name === 'Posts');
            if (postsParam) postsParam.Value = normalizedPosts;
            const tweetsParam = outputParams.find(p => p.Name === 'Tweets');
            if (tweetsParam) tweetsParam.Value = tweets;
            const analysisParam = outputParams.find(p => p.Name === 'Analysis');
            if (analysisParam) analysisParam.Value = analysis;
            const actualQueryParam = outputParams.find(p => p.Name === 'ActualQuery');
            if (actualQueryParam) actualQueryParam.Value = searchQuery;

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Successfully found ${normalizedPosts.length} tweets matching search criteria`,
                Params: outputParams
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            
            return {
                Success: false,
                ResultCode: this.getErrorCode(error),
                Message: `Failed to search tweets: ${errorMessage}`,
                Params
            };
        }
    }

    /**
     * Build advanced search query with Twitter operators
     */
    private buildAdvancedSearchQuery(params: any): string {
        const parts: string[] = [];

        // Basic query
        if (params.query) {
            parts.push(params.query);
        }

        // Hashtags
        if (params.hashtags && Array.isArray(params.hashtags) && params.hashtags.length > 0) {
            const hashtagQuery = params.hashtags
                .map((tag: string) => tag.startsWith('#') ? tag : `#${tag}`)
                .join(' OR ');
            parts.push(`(${hashtagQuery})`);
        }

        // User filters
        if (params.fromUser) {
            parts.push(`from:${params.fromUser}`);
        }
        if (params.toUser) {
            parts.push(`to:${params.toUser}`);
        }
        if (params.mentionUser) {
            parts.push(`@${params.mentionUser}`);
        }

        // Language filter
        if (params.language) {
            parts.push(`lang:${params.language}`);
        }

        // Media and link filters
        if (params.hasMedia === true) {
            parts.push('has:media');
        } else if (params.hasMedia === false) {
            parts.push('-has:media');
        }

        if (params.hasLinks === true) {
            parts.push('has:links');
        } else if (params.hasLinks === false) {
            parts.push('-has:links');
        }

        // Tweet type filters
        if (params.isRetweet === true) {
            parts.push('is:retweet');
        } else if (params.isRetweet === false) {
            parts.push('-is:retweet');
        }

        if (params.isReply === true) {
            parts.push('is:reply');
        } else if (params.isReply === false) {
            parts.push('-is:reply');
        }

        if (params.isQuote === true) {
            parts.push('is:quote');
        } else if (params.isQuote === false) {
            parts.push('-is:quote');
        }

        // Verified filter
        if (params.isVerified === true) {
            parts.push('is:verified');
        } else if (params.isVerified === false) {
            parts.push('-is:verified');
        }

        // Engagement filters (Note: These require Academic Research access)
        if (params.minLikes && params.minLikes > 0) {
            parts.push(`min_faves:${params.minLikes}`);
        }
        if (params.minRetweets && params.minRetweets > 0) {
            parts.push(`min_retweets:${params.minRetweets}`);
        }
        if (params.minReplies && params.minReplies > 0) {
            parts.push(`min_replies:${params.minReplies}`);
        }

        // Place filter
        if (params.place) {
            parts.push(`place:"${params.place}"`);
        }

        return parts.join(' ');
    }

    /**
     * Internal method to search tweets with pagination
     */
    private async searchTweetsInternal(searchParams: TwitterSearchParams, maxResults: number): Promise<Tweet[]> {
        const tweets: Tweet[] = [];
        let nextToken: string | undefined;
        
        const queryParams: Record<string, any> = {
            'query': searchParams.query,
            'tweet.fields': 'id,text,created_at,author_id,conversation_id,public_metrics,attachments,entities,referenced_tweets,lang,possibly_sensitive',
            'user.fields': 'id,name,username,profile_image_url,description,created_at,verified',
            'media.fields': 'url,preview_image_url,type,width,height',
            'expansions': 'author_id,attachments.media_keys,referenced_tweets.id,referenced_tweets.id.author_id',
            'max_results': searchParams.max_results,
            'sort_order': searchParams.sort_order
        };

        // Add time filters
        if (searchParams.start_time) {
            queryParams['start_time'] = searchParams.start_time;
        }
        if (searchParams.end_time) {
            queryParams['end_time'] = searchParams.end_time;
        }

        while (tweets.length < maxResults) {
            if (nextToken) {
                queryParams['next_token'] = nextToken;
            }

            try {
                const response = await this.axiosInstance.get('/tweets/search/recent', {
                    params: queryParams
                });

                if (response.data.data && Array.isArray(response.data.data)) {
                    tweets.push(...response.data.data);
                }

                // Check if we've reached the desired number of results
                if (tweets.length >= maxResults) {
                    return tweets.slice(0, maxResults);
                }

                // Check for more pages
                nextToken = response.data.meta?.next_token;
                if (!nextToken) {
                    break;
                }

            } catch (error) {
                // If we get a 400 error, it might be due to unsupported operators
                if ((error as any).response?.status === 400) {
                    const errorDetail = (error as any).response?.data?.detail || '';
                    if (errorDetail.includes('min_faves') || errorDetail.includes('min_retweets') || errorDetail.includes('min_replies')) {
                        LogStatus('Note: Engagement filters (min_likes, min_retweets, min_replies) require Academic Research access');
                        // Retry without engagement filters
                        const cleanedQuery = searchParams.query
                            .replace(/min_faves:\d+\s*/g, '')
                            .replace(/min_retweets:\d+\s*/g, '')
                            .replace(/min_replies:\d+\s*/g, '')
                            .trim();
                        
                        if (cleanedQuery !== searchParams.query) {
                            queryParams['query'] = cleanedQuery;
                            continue;
                        }
                    }
                }
                throw error;
            }
        }

        return tweets;
    }

    /**
     * Implement searchPosts for base class
     */
    protected async searchPosts(params: SearchParams): Promise<SocialPost[]> {
        const searchParams: TwitterSearchParams = {
            query: this.buildSearchQuery(params),
            max_results: params.limit || 100
        };

        if (params.startDate) {
            searchParams.start_time = this.formatTwitterDate(params.startDate);
        }
        if (params.endDate) {
            searchParams.end_time = this.formatTwitterDate(params.endDate);
        }

        const tweets = await this.searchTweetsInternal(searchParams, params.limit || 100);
        return tweets.map(tweet => this.normalizePost(tweet));
    }

    /**
     * Analyze search results
     */
    private analyzeSearchResults(tweets: Tweet[], normalizedPosts: SocialPost[]): any {
        const analysis = {
            totalResults: tweets.length,
            dateRange: {
                earliest: null as string | null,
                latest: null as string | null
            },
            languages: {} as Record<string, number>,
            tweetTypes: {
                original: 0,
                replies: 0,
                retweets: 0,
                quotes: 0
            },
            topHashtags: [] as Array<{ tag: string; count: number }>,
            topMentions: [] as Array<{ username: string; count: number }>,
            engagementStats: {
                totalLikes: 0,
                totalRetweets: 0,
                totalReplies: 0,
                totalQuotes: 0,
                averageEngagement: 0
            },
            topEngagedTweets: [] as any[]
        };

        // Track hashtags and mentions
        const hashtagCounts = new Map<string, number>();
        const mentionCounts = new Map<string, number>();

        tweets.forEach((tweet, index) => {
            // Date range
            const createdAt = tweet.created_at;
            if (!analysis.dateRange.earliest || createdAt < analysis.dateRange.earliest) {
                analysis.dateRange.earliest = createdAt;
            }
            if (!analysis.dateRange.latest || createdAt > analysis.dateRange.latest) {
                analysis.dateRange.latest = createdAt;
            }

            // Language
            const lang = (tweet as any).lang || 'unknown';
            analysis.languages[lang] = (analysis.languages[lang] || 0) + 1;

            // Tweet types
            if (tweet.referenced_tweets) {
                const types = tweet.referenced_tweets.map(ref => ref.type);
                if (types.includes('replied_to')) analysis.tweetTypes.replies++;
                else if (types.includes('retweeted')) analysis.tweetTypes.retweets++;
                else if (types.includes('quoted')) analysis.tweetTypes.quotes++;
            } else {
                analysis.tweetTypes.original++;
            }

            // Hashtags
            if (tweet.entities?.hashtags) {
                tweet.entities.hashtags.forEach(hashtag => {
                    const tag = hashtag.tag.toLowerCase();
                    hashtagCounts.set(tag, (hashtagCounts.get(tag) || 0) + 1);
                });
            }

            // Mentions
            if (tweet.entities?.mentions) {
                tweet.entities.mentions.forEach(mention => {
                    const username = mention.username.toLowerCase();
                    mentionCounts.set(username, (mentionCounts.get(username) || 0) + 1);
                });
            }

            // Engagement stats
            if (tweet.public_metrics) {
                analysis.engagementStats.totalLikes += tweet.public_metrics.like_count || 0;
                analysis.engagementStats.totalRetweets += tweet.public_metrics.retweet_count || 0;
                analysis.engagementStats.totalReplies += tweet.public_metrics.reply_count || 0;
                analysis.engagementStats.totalQuotes += tweet.public_metrics.quote_count || 0;
            }
        });

        // Calculate average engagement
        if (tweets.length > 0) {
            const totalEngagement = 
                analysis.engagementStats.totalLikes +
                analysis.engagementStats.totalRetweets +
                analysis.engagementStats.totalReplies +
                analysis.engagementStats.totalQuotes;
            analysis.engagementStats.averageEngagement = Math.round(totalEngagement / tweets.length);
        }

        // Top hashtags
        analysis.topHashtags = Array.from(hashtagCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([tag, count]) => ({ tag, count }));

        // Top mentions
        analysis.topMentions = Array.from(mentionCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([username, count]) => ({ username, count }));

        // Top engaged tweets
        analysis.topEngagedTweets = normalizedPosts
            .filter(post => post.analytics)
            .sort((a, b) => (b.analytics?.engagements || 0) - (a.analytics?.engagements || 0))
            .slice(0, 5)
            .map(post => ({
                id: post.id,
                content: post.content.substring(0, 100) + (post.content.length > 100 ? '...' : ''),
                engagement: post.analytics?.engagements,
                metrics: post.analytics
            }));

        return analysis;
    }

    /**
     * Get error code based on error type
     */
    private getErrorCode(error: any): string {
        if (error instanceof Error) {
            if (error.message.includes('Rate Limit')) return 'RATE_LIMIT';
            if (error.message.includes('Unauthorized')) return 'INVALID_TOKEN';
            if (error.message.includes('character limit')) return 'QUERY_TOO_LONG';
            if (error.message.includes('Academic Research')) return 'INSUFFICIENT_ACCESS';
        }
        return 'ERROR';
    }

    /**
     * Define the parameters this action expects
     */
    public get Params(): ActionParam[] {
        return [
            ...this.commonSocialParams,
            {
                Name: 'Query',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'Hashtags',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'FromUser',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'ToUser',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'MentionUser',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'StartDate',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'EndDate',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'Language',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'HasMedia',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'HasLinks',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'IsRetweet',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'IsReply',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'IsQuote',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'IsVerified',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'MinLikes',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'MinRetweets',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'MinReplies',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'Place',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'MaxResults',
                Type: 'Input',
                Value: 100
            },
            {
                Name: 'SortOrder',
                Type: 'Input',
                Value: 'recency' // 'recency' or 'relevancy'
            },
            {
                Name: 'Posts',
                Type: 'Output',
                Value: null
            },
            {
                Name: 'Tweets',
                Type: 'Output',
                Value: null
            },
            {
                Name: 'Analysis',
                Type: 'Output',
                Value: null
            },
            {
                Name: 'ActualQuery',
                Type: 'Output',
                Value: null
            }
        ];
    }

    /**
     * Get action description
     */
    public get Description(): string {
        return 'Searches for tweets on Twitter/X using advanced operators and filters, with comprehensive analysis of results including historical data';
    }
}