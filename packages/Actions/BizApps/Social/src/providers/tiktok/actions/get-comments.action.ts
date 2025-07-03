import { RegisterClass } from '@memberjunction/global';
import { TikTokBaseAction } from '../tiktok-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';

/**
 * Comment data structure
 */
interface TikTokComment {
    comment_id: string;
    text: string;
    create_time: number;
    user: {
        open_id: string;
        display_name: string;
        avatar_url: string;
    };
    like_count: number;
    reply_count: number;
    parent_comment_id?: string;
}

/**
 * Action to get comments from TikTok videos
 */
@RegisterClass(BaseAction, 'GetCommentsAction')
export class GetCommentsAction extends TikTokBaseAction {
    
    /**
     * Get comments from TikTok videos
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const { Params } = params;
        
        try {
            // Initialize OAuth
            const companyIntegrationId = this.getParamValue(Params, 'CompanyIntegrationID');
            if (!companyIntegrationId) {
                throw new Error('CompanyIntegrationID is required');
            }
            
            await this.initializeOAuth(companyIntegrationId);
            
            // Extract parameters
            const videoId = this.getParamValue(Params, 'VideoID');
            const maxComments = this.getParamValue(Params, 'MaxComments') || 100;
            const includeReplies = this.getParamValue(Params, 'IncludeReplies') !== false;
            const sortBy = this.getParamValue(Params, 'SortBy') || 'time'; // time or likes
            
            if (!videoId) {
                throw new Error('VideoID is required');
            }
            
            // Get comments from TikTok API
            const response = await this.makeTikTokRequest<any>(
                `/v2/video/comment/list/`,
                'GET',
                undefined,
                {
                    video_id: videoId,
                    max_count: Math.min(maxComments, 100), // API limit
                    sort_by: sortBy
                }
            );
            
            const comments: TikTokComment[] = response.data?.comments || [];
            
            // Process comments
            const processedComments = comments.map(comment => ({
                id: comment.comment_id,
                text: comment.text,
                author: {
                    id: comment.user.open_id,
                    username: comment.user.display_name,
                    avatarUrl: comment.user.avatar_url
                },
                createdAt: new Date(comment.create_time * 1000),
                likes: comment.like_count,
                replies: comment.reply_count,
                isReply: !!comment.parent_comment_id,
                parentCommentId: comment.parent_comment_id,
                sentiment: this.analyzeSentiment(comment.text),
                containsQuestion: this.containsQuestion(comment.text),
                length: comment.text.length
            }));
            
            // Separate top-level comments and replies
            const topLevelComments = processedComments.filter(c => !c.isReply);
            const replies = processedComments.filter(c => c.isReply);
            
            // Calculate engagement metrics
            const engagementMetrics = {
                totalComments: comments.length,
                topLevelComments: topLevelComments.length,
                totalReplies: replies.length,
                averageLikes: comments.length > 0 
                    ? Math.round(comments.reduce((sum, c) => sum + c.like_count, 0) / comments.length)
                    : 0,
                mostLikedComment: processedComments.length > 0
                    ? processedComments.reduce((max, c) => c.likes > max.likes ? c : max)
                    : null,
                sentimentBreakdown: this.calculateSentimentBreakdown(processedComments),
                questionsCount: processedComments.filter(c => c.containsQuestion).length,
                averageCommentLength: processedComments.length > 0
                    ? Math.round(processedComments.reduce((sum, c) => sum + c.length, 0) / processedComments.length)
                    : 0
            };
            
            // Identify notable comments (high engagement, questions, etc.)
            const notableComments = this.identifyNotableComments(processedComments);
            
            // Create summary
            const summary = {
                videoId,
                totalCommentsRetrieved: processedComments.length,
                hasMoreComments: response.data?.has_more || false,
                engagementMetrics,
                notableComments,
                topCommenters: this.getTopCommenters(processedComments),
                timeDistribution: this.analyzeTimeDistribution(processedComments)
            };
            
            // Update output parameters
            const outputParams = [...Params];
            const commentsParam = outputParams.find(p => p.Name === 'Comments');
            if (commentsParam) commentsParam.Value = includeReplies ? processedComments : topLevelComments;
            const summaryParam = outputParams.find(p => p.Name === 'Summary');
            if (summaryParam) summaryParam.Value = summary;
            const rawDataParam = outputParams.find(p => p.Name === 'RawData');
            if (rawDataParam) rawDataParam.Value = comments;
            
            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Retrieved ${processedComments.length} comments from TikTok video`,
                Params: outputParams
            };
            
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            
            return {
                Success: false,
                ResultCode: this.isAuthError(error) ? 'INVALID_TOKEN' : 'ERROR',
                Message: `Failed to get TikTok comments: ${errorMessage}`,
                Params
            };
        }
    }
    
    /**
     * Simple sentiment analysis
     */
    private analyzeSentiment(text: string): 'positive' | 'negative' | 'neutral' {
        const lowerText = text.toLowerCase();
        
        // Positive indicators
        const positiveWords = ['love', 'amazing', 'great', 'awesome', 'fantastic', 'excellent', 'good', '❤️', '😍', '🔥', '👏', '💯'];
        const negativeWords = ['hate', 'terrible', 'awful', 'bad', 'worst', 'disappointing', 'trash', '👎', '😠', '😡'];
        
        const positiveScore = positiveWords.filter(word => lowerText.includes(word)).length;
        const negativeScore = negativeWords.filter(word => lowerText.includes(word)).length;
        
        if (positiveScore > negativeScore) return 'positive';
        if (negativeScore > positiveScore) return 'negative';
        return 'neutral';
    }
    
    /**
     * Check if comment contains a question
     */
    private containsQuestion(text: string): boolean {
        return text.includes('?') || 
               /\b(what|when|where|who|why|how|is|are|can|could|would|should)\b/i.test(text);
    }
    
    /**
     * Calculate sentiment breakdown
     */
    private calculateSentimentBreakdown(comments: any[]): Record<string, number> {
        const breakdown = {
            positive: 0,
            negative: 0,
            neutral: 0
        };
        
        comments.forEach(comment => {
            breakdown[comment.sentiment]++;
        });
        
        return breakdown;
    }
    
    /**
     * Identify notable comments
     */
    private identifyNotableComments(comments: any[]): any[] {
        const notable: any[] = [];
        
        // High engagement comments
        const avgLikes = comments.length > 0 
            ? comments.reduce((sum, c) => sum + c.likes, 0) / comments.length
            : 0;
        
        comments.forEach(comment => {
            const reasons: string[] = [];
            
            if (comment.likes > avgLikes * 2) {
                reasons.push('high_engagement');
            }
            if (comment.containsQuestion) {
                reasons.push('contains_question');
            }
            if (comment.replies > 5) {
                reasons.push('many_replies');
            }
            if (comment.text.length > 200) {
                reasons.push('detailed_feedback');
            }
            
            if (reasons.length > 0) {
                notable.push({
                    ...comment,
                    notableReasons: reasons
                });
            }
        });
        
        // Return top 10 notable comments
        return notable.sort((a, b) => b.likes - a.likes).slice(0, 10);
    }
    
    /**
     * Get top commenters
     */
    private getTopCommenters(comments: any[]): any[] {
        const commenterMap = new Map<string, any>();
        
        comments.forEach(comment => {
            const key = comment.author.id;
            if (!commenterMap.has(key)) {
                commenterMap.set(key, {
                    ...comment.author,
                    commentCount: 0,
                    totalLikes: 0
                });
            }
            
            const commenter = commenterMap.get(key)!;
            commenter.commentCount++;
            commenter.totalLikes += comment.likes;
        });
        
        return Array.from(commenterMap.values())
            .sort((a, b) => b.commentCount - a.commentCount)
            .slice(0, 5);
    }
    
    /**
     * Analyze time distribution of comments
     */
    private analyzeTimeDistribution(comments: any[]): any {
        if (comments.length === 0) return null;
        
        const now = new Date();
        const hourBuckets: Record<string, number> = {};
        
        comments.forEach(comment => {
            const hoursSincePost = Math.floor((now.getTime() - comment.createdAt.getTime()) / (1000 * 60 * 60));
            
            let bucket: string;
            if (hoursSincePost < 1) bucket = '< 1 hour';
            else if (hoursSincePost < 24) bucket = '1-24 hours';
            else if (hoursSincePost < 168) bucket = '1-7 days';
            else bucket = '> 7 days';
            
            hourBuckets[bucket] = (hourBuckets[bucket] || 0) + 1;
        });
        
        return hourBuckets;
    }
    
    /**
     * Define the parameters this action expects
     */
    public get Params(): ActionParam[] {
        return [
            ...this.commonSocialParams,
            {
                Name: 'VideoID',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'MaxComments',
                Type: 'Input',
                Value: 100
            },
            {
                Name: 'IncludeReplies',
                Type: 'Input',
                Value: true
            },
            {
                Name: 'SortBy',
                Type: 'Input',
                Value: 'time'
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
                Name: 'RawData',
                Type: 'Output',
                Value: null
            }
        ];
    }
    
    /**
     * Metadata about this action
     */
    public get Description(): string {
        return 'Retrieves and analyzes comments from TikTok videos including sentiment, engagement metrics, and notable comments';
    }
}