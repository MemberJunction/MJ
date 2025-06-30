import { RegisterClass } from '@memberjunction/global';
import { InstagramBaseAction } from '../instagram-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { LogError } from '@memberjunction/core';

/**
 * Retrieves comments for an Instagram post, including nested replies.
 * Supports filtering, pagination, and sentiment analysis.
 */
@RegisterClass(InstagramBaseAction, 'Instagram - Get Comments')
export class InstagramGetCommentsAction extends InstagramBaseAction {
    
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const companyIntegrationId = this.getParamValue(params.Params, 'CompanyIntegrationID');
            const postId = this.getParamValue(params.Params, 'PostID');
            const includeReplies = this.getParamValue(params.Params, 'IncludeReplies') !== false;
            const includeHidden = this.getParamValue(params.Params, 'IncludeHidden') || false;
            const limit = this.getParamValue(params.Params, 'Limit') || 50;
            const afterCursor = this.getParamValue(params.Params, 'AfterCursor');

            // Initialize OAuth
            if (!await this.initializeOAuth(companyIntegrationId)) {
                return {
                    Success: false,
                    Message: 'Failed to initialize Instagram authentication',
                    ResultCode: 'AUTH_FAILED'
                };
            }

            // Validate inputs
            if (!postId) {
                return {
                    Success: false,
                    Message: 'PostID is required',
                    ResultCode: 'MISSING_PARAMS'
                };
            }

            // Build fields for comment data
            const fields = 'id,text,username,timestamp,like_count,replies{id,text,username,timestamp,like_count}';

            // Build query parameters
            const queryParams: any = {
                fields,
                access_token: this.getAccessToken(),
                limit: Math.min(limit, 100)
            };

            if (afterCursor) {
                queryParams.after = afterCursor;
            }

            // Get comments
            const response = await this.makeInstagramRequest<{
                data: any[];
                paging?: {
                    cursors: {
                        before: string;
                        after: string;
                    };
                    next?: string;
                };
            }>(
                `${postId}/comments`,
                'GET',
                null,
                queryParams
            );

            const comments = response.data || [];

            // Process comments
            const processedComments = await this.processComments(comments, includeReplies);

            // Get hidden comments if requested
            let hiddenComments: any[] = [];
            if (includeHidden) {
                hiddenComments = await this.getHiddenComments(postId);
            }

            // Calculate engagement metrics
            const metrics = this.calculateCommentMetrics(processedComments);

            // Analyze sentiment patterns
            const sentimentAnalysis = this.analyzeSentiment(processedComments);

            // Store result in output params
            const outputParams = [...params.Params];
            outputParams.push({
                Name: 'ResultData',
                Type: 'Output',
                Value: JSON.stringify({
                    postId,
                    comments: processedComments,
                    hiddenComments,
                    metrics,
                    sentimentAnalysis,
                    paging: {
                        hasNext: !!response.paging?.next,
                        afterCursor: response.paging?.cursors?.after
                    }
                })
            });

            return {
                Success: true,
                Message: `Retrieved ${processedComments.length} comments`,
                ResultCode: 'SUCCESS',
                Params: outputParams
            };

        } catch (error: any) {
            LogError('Failed to retrieve Instagram comments', error);
            
            if (error.code === 'RATE_LIMIT') {
                return {
                    Success: false,
                    Message: 'Instagram API rate limit exceeded. Please try again later.',
                    ResultCode: 'RATE_LIMIT'
                };
            }

            if (error.code === 'POST_NOT_FOUND') {
                return {
                    Success: false,
                    Message: 'Instagram post not found or access denied',
                    ResultCode: 'POST_NOT_FOUND'
                };
            }

            return {
                Success: false,
                Message: `Failed to retrieve comments: ${error.message}`,
                ResultCode: 'ERROR'
            };
        }
    }

    /**
     * Process comments and fetch replies if needed
     */
    private async processComments(comments: any[], includeReplies: boolean): Promise<any[]> {
        const processed: any[] = [];

        for (const comment of comments) {
            const processedComment: any = {
                id: comment.id,
                text: comment.text,
                username: comment.username,
                timestamp: comment.timestamp,
                likeCount: comment.like_count || 0,
                replies: [],
                metrics: {
                    wordCount: this.countWords(comment.text),
                    hasEmojis: this.containsEmojis(comment.text),
                    hasMentions: this.containsMentions(comment.text),
                    hasHashtags: this.containsHashtags(comment.text)
                }
            };

            // Process replies if they exist and are requested
            if (includeReplies && comment.replies?.data) {
                processedComment.replies = comment.replies.data.map((reply: any) => ({
                    id: reply.id,
                    text: reply.text,
                    username: reply.username,
                    timestamp: reply.timestamp,
                    likeCount: reply.like_count || 0,
                    metrics: {
                        wordCount: this.countWords(reply.text),
                        hasEmojis: this.containsEmojis(reply.text),
                        hasMentions: this.containsMentions(reply.text),
                        hasHashtags: this.containsHashtags(reply.text)
                    }
                }));
            }

            processed.push(processedComment);
        }

        return processed;
    }

    /**
     * Get hidden comments (comments hidden by the account)
     */
    private async getHiddenComments(postId: string): Promise<any[]> {
        try {
            const response = await this.makeInstagramRequest<{ data: any[] }>(
                `${postId}/comments`,
                'GET',
                null,
                {
                    fields: 'id,text,username,timestamp,hidden',
                    access_token: this.getAccessToken(),
                    filter: 'hidden'
                }
            );

            return response.data || [];
        } catch (error) {
            LogError('Failed to get hidden comments', error);
            return [];
        }
    }

    /**
     * Calculate comment metrics
     */
    private calculateCommentMetrics(comments: any[]): any {
        const metrics = {
            totalComments: comments.length,
            totalReplies: 0,
            avgCommentLength: 0,
            avgLikesPerComment: 0,
            topCommenters: [] as any[],
            engagementRate: 0,
            responseRate: 0
        };

        if (comments.length === 0) return metrics;

        let totalLength = 0;
        let totalLikes = 0;
        const commenterCounts: Record<string, number> = {};

        comments.forEach(comment => {
            totalLength += comment.metrics.wordCount;
            totalLikes += comment.likeCount;
            
            // Count commenters
            commenterCounts[comment.username] = (commenterCounts[comment.username] || 0) + 1;
            
            // Count replies
            metrics.totalReplies += comment.replies.length;
            
            // Add reply stats
            comment.replies.forEach((reply: any) => {
                totalLength += reply.metrics.wordCount;
                totalLikes += reply.likeCount;
                commenterCounts[reply.username] = (commenterCounts[reply.username] || 0) + 1;
            });
        });

        const totalInteractions = comments.length + metrics.totalReplies;
        metrics.avgCommentLength = Math.round(totalLength / totalInteractions);
        metrics.avgLikesPerComment = Math.round(totalLikes / totalInteractions);

        // Get top commenters
        metrics.topCommenters = Object.entries(commenterCounts)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 10)
            .map(([username, count]) => ({ username, count }));

        // Calculate response rate (comments with replies)
        const commentsWithReplies = comments.filter(c => c.replies.length > 0).length;
        metrics.responseRate = (commentsWithReplies / comments.length) * 100;

        return metrics;
    }

    /**
     * Analyze sentiment patterns in comments
     */
    private analyzeSentiment(comments: any[]): any {
        const analysis = {
            positive: 0,
            negative: 0,
            neutral: 0,
            questions: 0,
            keywords: [] as any[],
            emojis: [] as any[]
        };

        const keywordCounts: Record<string, number> = {};
        const emojiCounts: Record<string, number> = {};

        // Simple sentiment analysis based on keywords and patterns
        const positiveWords = ['love', 'amazing', 'beautiful', 'great', 'awesome', 'perfect', 'excellent', 'wonderful', '❤️', '😍', '🔥', '💯'];
        const negativeWords = ['hate', 'awful', 'terrible', 'bad', 'worst', 'ugly', 'disgusting', '😠', '😡', '👎'];
        const questionWords = ['?', 'what', 'where', 'when', 'how', 'why', 'who'];

        comments.forEach(comment => {
            const text = comment.text.toLowerCase();
            
            // Check sentiment
            const hasPositive = positiveWords.some(word => text.includes(word));
            const hasNegative = negativeWords.some(word => text.includes(word));
            const hasQuestion = questionWords.some(word => text.includes(word));

            if (hasQuestion) {
                analysis.questions++;
            }
            
            if (hasPositive && !hasNegative) {
                analysis.positive++;
            } else if (hasNegative && !hasPositive) {
                analysis.negative++;
            } else {
                analysis.neutral++;
            }

            // Extract keywords (simple word frequency)
            const words = text.split(/\s+/).filter(word => word.length > 3);
            words.forEach(word => {
                keywordCounts[word] = (keywordCounts[word] || 0) + 1;
            });

            // Extract emojis
            const emojis = text.match(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]/gu) || [];
            emojis.forEach(emoji => {
                emojiCounts[emoji] = (emojiCounts[emoji] || 0) + 1;
            });

            // Analyze replies too
            comment.replies.forEach((reply: any) => {
                // Similar analysis for replies...
            });
        });

        // Get top keywords and emojis
        analysis.keywords = Object.entries(keywordCounts)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 20)
            .map(([keyword, count]) => ({ keyword, count }));

        analysis.emojis = Object.entries(emojiCounts)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 10)
            .map(([emoji, count]) => ({ emoji, count }));

        return analysis;
    }

    /**
     * Helper methods for text analysis
     */
    private countWords(text: string): number {
        return text.trim().split(/\s+/).length;
    }

    private containsEmojis(text: string): boolean {
        return /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]/u.test(text);
    }

    private containsMentions(text: string): boolean {
        return /@\w+/.test(text);
    }

    private containsHashtags(text: string): boolean {
        return /#\w+/.test(text);
    }

    /**
     * Define the parameters for this action
     */
    public get Params(): ActionParam[] {
        return [
            ...this.commonSocialParams,
            {
                Name: 'PostID',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'IncludeReplies',
                Type: 'Input',
                Value: true
            },
            {
                Name: 'IncludeHidden',
                Type: 'Input',
                Value: false
            },
            {
                Name: 'Limit',
                Type: 'Input',
                Value: 50
            },
            {
                Name: 'AfterCursor',
                Type: 'Input',
                Value: null
            }
        ];
    }

    /**
     * Get the description for this action
     */
    public get Description(): string {
        return 'Retrieves comments for an Instagram post including replies, metrics, and sentiment analysis.';
    }
}