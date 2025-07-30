import { RegisterClass } from '@memberjunction/global';
import { YouTubeBaseAction } from '../youtube-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';

/**
 * Action to get comments from YouTube videos
 */
@RegisterClass(BaseAction, 'YouTubeGetCommentsAction')
export class YouTubeGetCommentsAction extends YouTubeBaseAction {
    /**
     * Get comments from YouTube videos
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const { Params, ContextUser } = params;
        
        try {
            // Initialize OAuth
            const companyIntegrationId = this.getParamValue(Params, 'CompanyIntegrationID');
            if (!companyIntegrationId) {
                throw new Error('CompanyIntegrationID is required');
            }

            const initialized = await this.initializeOAuth(companyIntegrationId);
            if (!initialized) {
                throw new Error('Failed to initialize YouTube OAuth connection');
            }

            // Extract parameters
            const videoId = this.getParamValue(Params, 'VideoID');
            const channelId = this.getParamValue(Params, 'ChannelID');
            const maxResults = this.getParamValue(Params, 'MaxResults') || 100;
            const orderBy = this.getParamValue(Params, 'OrderBy') || 'time';
            const searchTerms = this.getParamValue(Params, 'SearchTerms');
            const includeReplies = this.getParamValue(Params, 'IncludeReplies') ?? true;
            const textFormat = this.getParamValue(Params, 'TextFormat') || 'plainText';
            const pageToken = this.getParamValue(Params, 'PageToken');

            // Validate parameters - need either videoId or channelId
            if (!videoId && !channelId) {
                throw new Error('Either VideoID or ChannelID is required');
            }

            // Build request parameters
            const requestParams: any = {
                part: 'snippet,replies',
                maxResults: Math.min(maxResults, 100), // YouTube max is 100
                order: orderBy,
                textFormat: textFormat
            };

            if (videoId) {
                requestParams.videoId = videoId;
            } else if (channelId) {
                requestParams.allThreadsRelatedToChannelId = channelId;
            }

            if (searchTerms) {
                requestParams.searchTerms = searchTerms;
            }

            if (pageToken) {
                requestParams.pageToken = pageToken;
            }

            // Get comment threads
            const commentsResponse = await this.makeYouTubeRequest<any>(
                '/commentThreads',
                'GET',
                undefined,
                requestParams,
                ContextUser
            );

            // Process comments
            const comments = this.processComments(commentsResponse.items || [], includeReplies);

            // Get video details if videoId provided
            let videoDetails = null;
            if (videoId) {
                const videoResponse = await this.makeYouTubeRequest<any>(
                    '/videos',
                    'GET',
                    undefined,
                    {
                        part: 'snippet,statistics',
                        id: videoId
                    },
                    ContextUser
                );
                if (videoResponse.items && videoResponse.items.length > 0) {
                    videoDetails = videoResponse.items[0];
                }
            }

            // Calculate statistics
            const stats = this.calculateCommentStats(comments);

            // Prepare summary
            const summary = {
                totalComments: comments.length,
                totalThreads: commentsResponse.items?.length || 0,
                statistics: stats,
                videoDetails: videoDetails ? {
                    id: videoDetails.id,
                    title: videoDetails.snippet.title,
                    channelId: videoDetails.snippet.channelId,
                    channelTitle: videoDetails.snippet.channelTitle,
                    viewCount: parseInt(videoDetails.statistics.viewCount || '0'),
                    commentCount: parseInt(videoDetails.statistics.commentCount || '0')
                } : null,
                sentiment: this.analyzeSentiment(comments),
                topCommenters: this.getTopCommenters(comments),
                nextPageToken: commentsResponse.nextPageToken,
                prevPageToken: commentsResponse.prevPageToken,
                quotaCost: this.getQuotaCost('commentThreads.list') + (videoId ? this.getQuotaCost('videos.list') : 0)
            };

            // Update output parameters
            const outputParams = [...Params];
            const commentsParam = outputParams.find(p => p.Name === 'Comments');
            if (commentsParam) commentsParam.Value = comments;
            const summaryParam = outputParams.find(p => p.Name === 'Summary');
            if (summaryParam) summaryParam.Value = summary;
            const nextPageTokenParam = outputParams.find(p => p.Name === 'NextPageToken');
            if (nextPageTokenParam) nextPageTokenParam.Value = commentsResponse.nextPageToken;

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Retrieved ${comments.length} comments from ${commentsResponse.items?.length || 0} threads`,
                Params: outputParams
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            
            return {
                Success: false,
                ResultCode: this.getErrorCode(errorMessage),
                Message: `Failed to get comments: ${errorMessage}`,
                Params
            };
        }
    }

    /**
     * Process raw comment threads into a flat array
     */
    private processComments(threads: any[], includeReplies: boolean): any[] {
        const comments: any[] = [];

        for (const thread of threads) {
            const topComment = thread.snippet.topLevelComment;
            
            // Add top-level comment
            comments.push({
                id: topComment.id,
                threadId: thread.id,
                text: topComment.snippet.textDisplay,
                authorDisplayName: topComment.snippet.authorDisplayName,
                authorChannelId: topComment.snippet.authorChannelId?.value,
                authorProfileImageUrl: topComment.snippet.authorProfileImageUrl,
                likeCount: topComment.snippet.likeCount,
                publishedAt: topComment.snippet.publishedAt,
                updatedAt: topComment.snippet.updatedAt,
                isTopLevel: true,
                replyCount: thread.snippet.totalReplyCount,
                videoId: topComment.snippet.videoId,
                canReply: thread.snippet.canReply,
                isPublic: thread.snippet.isPublic
            });

            // Add replies if requested and available
            if (includeReplies && thread.replies?.comments) {
                for (const reply of thread.replies.comments) {
                    comments.push({
                        id: reply.id,
                        threadId: thread.id,
                        parentId: topComment.id,
                        text: reply.snippet.textDisplay,
                        authorDisplayName: reply.snippet.authorDisplayName,
                        authorChannelId: reply.snippet.authorChannelId?.value,
                        authorProfileImageUrl: reply.snippet.authorProfileImageUrl,
                        likeCount: reply.snippet.likeCount,
                        publishedAt: reply.snippet.publishedAt,
                        updatedAt: reply.snippet.updatedAt,
                        isTopLevel: false,
                        videoId: reply.snippet.videoId
                    });
                }
            }
        }

        return comments;
    }

    /**
     * Calculate comment statistics
     */
    private calculateCommentStats(comments: any[]): any {
        const stats = {
            totalLikes: 0,
            averageLikes: 0,
            topLevelComments: 0,
            replies: 0,
            commentersCount: new Set(),
            averageCommentLength: 0,
            longestComment: 0,
            shortestComment: Infinity
        };

        let totalLength = 0;

        for (const comment of comments) {
            stats.totalLikes += comment.likeCount || 0;
            if (comment.isTopLevel) {
                stats.topLevelComments++;
            } else {
                stats.replies++;
            }
            
            if (comment.authorChannelId) {
                stats.commentersCount.add(comment.authorChannelId);
            }

            const length = comment.text.length;
            totalLength += length;
            stats.longestComment = Math.max(stats.longestComment, length);
            stats.shortestComment = Math.min(stats.shortestComment, length);
        }

        stats.averageLikes = comments.length > 0 ? Math.round(stats.totalLikes / comments.length * 100) / 100 : 0;
        stats.averageCommentLength = comments.length > 0 ? Math.round(totalLength / comments.length) : 0;

        return {
            totalLikes: stats.totalLikes,
            averageLikes: stats.averageLikes,
            topLevelComments: stats.topLevelComments,
            replies: stats.replies,
            uniqueCommenters: stats.commentersCount.size,
            averageCommentLength: stats.averageCommentLength,
            longestComment: stats.longestComment,
            shortestComment: stats.shortestComment === Infinity ? 0 : stats.shortestComment
        };
    }

    /**
     * Basic sentiment analysis (simplified)
     */
    private analyzeSentiment(comments: any[]): any {
        const positiveWords = ['love', 'great', 'amazing', 'awesome', 'excellent', 'fantastic', 'wonderful', 'best', 'perfect', 'thank'];
        const negativeWords = ['hate', 'bad', 'terrible', 'awful', 'worst', 'horrible', 'disgusting', 'trash', 'waste', 'dislike'];
        
        let positive = 0;
        let negative = 0;
        let neutral = 0;

        for (const comment of comments) {
            const text = comment.text.toLowerCase();
            let hasPositive = false;
            let hasNegative = false;

            for (const word of positiveWords) {
                if (text.includes(word)) {
                    hasPositive = true;
                    break;
                }
            }

            for (const word of negativeWords) {
                if (text.includes(word)) {
                    hasNegative = true;
                    break;
                }
            }

            if (hasPositive && !hasNegative) {
                positive++;
            } else if (hasNegative && !hasPositive) {
                negative++;
            } else {
                neutral++;
            }
        }

        const total = comments.length || 1;
        return {
            positive: positive,
            negative: negative,
            neutral: neutral,
            positivePercentage: Math.round((positive / total) * 100),
            negativePercentage: Math.round((negative / total) * 100),
            neutralPercentage: Math.round((neutral / total) * 100)
        };
    }

    /**
     * Get top commenters by frequency
     */
    private getTopCommenters(comments: any[]): any[] {
        const commenterMap = new Map<string, any>();

        for (const comment of comments) {
            if (!comment.authorChannelId) continue;

            const key = comment.authorChannelId;
            if (!commenterMap.has(key)) {
                commenterMap.set(key, {
                    channelId: comment.authorChannelId,
                    displayName: comment.authorDisplayName,
                    profileImage: comment.authorProfileImageUrl,
                    commentCount: 0,
                    totalLikes: 0
                });
            }

            const commenter = commenterMap.get(key);
            commenter.commentCount++;
            commenter.totalLikes += comment.likeCount || 0;
        }

        return Array.from(commenterMap.values())
            .sort((a, b) => b.commentCount - a.commentCount)
            .slice(0, 10);
    }

    /**
     * Get error code from error message
     */
    private getErrorCode(message: string): string {
        if (message.includes('quota')) return 'QUOTA_EXCEEDED';
        if (message.includes('401') || message.includes('unauthorized')) return 'INVALID_TOKEN';
        if (message.includes('403') || message.includes('forbidden')) return 'INSUFFICIENT_PERMISSIONS';
        if (message.includes('404')) return 'NOT_FOUND';
        if (message.includes('rate limit')) return 'RATE_LIMIT';
        if (message.includes('disabled')) return 'COMMENTS_DISABLED';
        return 'ERROR';
    }

    /**
     * Define the parameters this action expects
     */
    public get Params(): ActionParam[] {
        const baseParams = this.commonSocialParams;
        const specificParams: ActionParam[] = [
            {
                Name: 'VideoID',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'ChannelID',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'MaxResults',
                Type: 'Input',
                Value: 100
            },
            {
                Name: 'OrderBy',
                Type: 'Input',
                Value: 'time'
            },
            {
                Name: 'SearchTerms',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'IncludeReplies',
                Type: 'Input',
                Value: true
            },
            {
                Name: 'TextFormat',
                Type: 'Input',
                Value: 'plainText'
            },
            {
                Name: 'PageToken',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'Comments',
                Type: 'Output',
                Value: null
            },
            {
                Name: 'Summary',
                Type: 'Output',
                Value: null
            },
            {
                Name: 'NextPageToken',
                Type: 'Output',
                Value: null
            }
        ];
        return [...baseParams, ...specificParams];
    }

    /**
     * Metadata about this action
     */
    public get Description(): string {
        return 'Gets comments from YouTube videos or channels with sentiment analysis and statistics';
    }
}