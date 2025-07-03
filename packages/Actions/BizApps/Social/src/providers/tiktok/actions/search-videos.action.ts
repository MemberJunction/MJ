import { RegisterClass } from '@memberjunction/global';
import { TikTokBaseAction, TikTokVideo } from '../tiktok-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { SocialPost, SearchParams } from '../../../base/base-social.action';

/**
 * Action to search for videos on TikTok
 * Note: TikTok API only allows searching within authenticated user's own videos
 */
@RegisterClass(BaseAction, 'SearchVideosAction')
export class SearchVideosAction extends TikTokBaseAction {
    
    /**
     * Search for videos on TikTok
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
            
            // Extract search parameters
            const query = this.getParamValue(Params, 'Query');
            const hashtags = this.getParamValue(Params, 'Hashtags') || [];
            const startDate = this.getParamValue(Params, 'StartDate');
            const endDate = this.getParamValue(Params, 'EndDate');
            const minViews = this.getParamValue(Params, 'MinViews');
            const minEngagement = this.getParamValue(Params, 'MinEngagement');
            const sortBy = this.getParamValue(Params, 'SortBy') || 'date';
            const sortOrder = this.getParamValue(Params, 'SortOrder') || 'desc';
            const limit = this.getParamValue(Params, 'Limit') || 50;
            const offset = this.getParamValue(Params, 'Offset') || 0;
            
            // Build search params
            const searchParams: SearchParams = {
                query,
                hashtags,
                startDate: startDate ? new Date(startDate) : undefined,
                endDate: endDate ? new Date(endDate) : undefined,
                limit,
                offset
            };
            
            // Note about TikTok limitations
            const apiLimitation = {
                notice: 'TikTok API only allows searching within your own videos',
                recommendation: 'For broader search capabilities, use TikTok\'s web interface or mobile app',
                alternativeApproach: 'This search filters your own video library based on the provided criteria'
            };
            
            // Get all user videos to search through
            const allVideos = await this.getUserVideos();
            
            // Apply search filters
            let filteredVideos = this.filterVideos(allVideos, {
                query,
                hashtags,
                startDate,
                endDate,
                minViews,
                minEngagement
            });
            
            // Sort results
            filteredVideos = this.sortVideos(filteredVideos, sortBy, sortOrder);
            
            // Apply pagination
            const paginatedVideos = filteredVideos.slice(offset, offset + limit);
            
            // Convert to social posts
            const socialPosts: SocialPost[] = paginatedVideos.map(video => this.normalizePost(video));
            
            // Analyze search results
            const searchAnalytics = this.analyzeSearchResults(filteredVideos, paginatedVideos);
            
            // Create time-based insights for historical analysis
            const historicalInsights = this.generateHistoricalInsights(filteredVideos, startDate, endDate);
            
            // Generate content insights
            const contentInsights = this.generateContentInsights(filteredVideos, query, hashtags);
            
            // Create summary
            const summary = {
                totalResults: filteredVideos.length,
                returnedResults: paginatedVideos.length,
                searchCriteria: {
                    query,
                    hashtags,
                    dateRange: startDate && endDate ? {
                        start: startDate,
                        end: endDate,
                        daysSpanned: Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24))
                    } : null,
                    filters: {
                        minViews,
                        minEngagement
                    }
                },
                analytics: searchAnalytics,
                historicalInsights,
                contentInsights,
                apiLimitation,
                pagination: {
                    offset,
                    limit,
                    hasMore: offset + limit < filteredVideos.length,
                    totalPages: Math.ceil(filteredVideos.length / limit)
                }
            };
            
            // Update output parameters
            const outputParams = [...Params];
            const videosParam = outputParams.find(p => p.Name === 'Videos');
            if (videosParam) videosParam.Value = socialPosts;
            const summaryParam = outputParams.find(p => p.Name === 'Summary');
            if (summaryParam) summaryParam.Value = summary;
            const rawDataParam = outputParams.find(p => p.Name === 'RawData');
            if (rawDataParam) rawDataParam.Value = paginatedVideos;
            
            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Found ${filteredVideos.length} videos matching search criteria (showing ${paginatedVideos.length})`,
                Params: outputParams
            };
            
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            
            return {
                Success: false,
                ResultCode: this.isAuthError(error) ? 'INVALID_TOKEN' : 'ERROR',
                Message: `Failed to search TikTok videos: ${errorMessage}`,
                Params
            };
        }
    }
    
    /**
     * Filter videos based on search criteria
     */
    private filterVideos(videos: TikTokVideo[], filters: any): TikTokVideo[] {
        return videos.filter(video => {
            // Query filter
            if (filters.query) {
                const query = filters.query.toLowerCase();
                const matchesQuery = video.title.toLowerCase().includes(query) ||
                                   video.description.toLowerCase().includes(query);
                if (!matchesQuery) return false;
            }
            
            // Hashtag filter
            if (filters.hashtags && filters.hashtags.length > 0) {
                const videoHashtags = this.extractHashtags(video.description);
                const hasMatchingHashtag = filters.hashtags.some((tag: string) => {
                    const cleanTag = tag.replace('#', '').toLowerCase();
                    return videoHashtags.includes(cleanTag);
                });
                if (!hasMatchingHashtag) return false;
            }
            
            // Date range filter
            if (filters.startDate) {
                const startTime = new Date(filters.startDate).getTime() / 1000;
                if (video.create_time < startTime) return false;
            }
            
            if (filters.endDate) {
                const endTime = new Date(filters.endDate).getTime() / 1000;
                if (video.create_time > endTime) return false;
            }
            
            // View count filter
            if (filters.minViews && video.view_count < filters.minViews) {
                return false;
            }
            
            // Engagement filter
            if (filters.minEngagement) {
                const engagement = video.like_count + video.comment_count + video.share_count;
                if (engagement < filters.minEngagement) return false;
            }
            
            return true;
        });
    }
    
    /**
     * Sort videos based on criteria
     */
    private sortVideos(videos: TikTokVideo[], sortBy: string, order: string): TikTokVideo[] {
        const sorted = [...videos];
        
        sorted.sort((a, b) => {
            let aValue: number;
            let bValue: number;
            
            switch (sortBy) {
                case 'views':
                    aValue = a.view_count;
                    bValue = b.view_count;
                    break;
                case 'likes':
                    aValue = a.like_count;
                    bValue = b.like_count;
                    break;
                case 'comments':
                    aValue = a.comment_count;
                    bValue = b.comment_count;
                    break;
                case 'shares':
                    aValue = a.share_count;
                    bValue = b.share_count;
                    break;
                case 'engagement':
                    aValue = a.like_count + a.comment_count + a.share_count;
                    bValue = b.like_count + b.comment_count + b.share_count;
                    break;
                case 'date':
                default:
                    aValue = a.create_time;
                    bValue = b.create_time;
                    break;
            }
            
            return order === 'desc' ? bValue - aValue : aValue - bValue;
        });
        
        return sorted;
    }
    
    /**
     * Analyze search results
     */
    private analyzeSearchResults(allResults: TikTokVideo[], displayedResults: TikTokVideo[]): any {
        if (allResults.length === 0) {
            return {
                totalViews: 0,
                totalEngagement: 0,
                averageViews: 0,
                averageEngagement: 0,
                topPerformer: null
            };
        }
        
        const totalViews = allResults.reduce((sum, v) => sum + v.view_count, 0);
        const totalEngagement = allResults.reduce((sum, v) => 
            sum + v.like_count + v.comment_count + v.share_count, 0
        );
        
        return {
            totalViews,
            totalEngagement,
            averageViews: Math.round(totalViews / allResults.length),
            averageEngagement: Math.round(totalEngagement / allResults.length),
            engagementRate: totalViews > 0 ? ((totalEngagement / totalViews) * 100).toFixed(2) + '%' : '0%',
            topPerformer: allResults.reduce((best, current) => 
                current.view_count > best.view_count ? current : best
            ),
            performanceDistribution: this.calculatePerformanceDistribution(allResults)
        };
    }
    
    /**
     * Generate historical insights
     */
    private generateHistoricalInsights(videos: TikTokVideo[], startDate?: string, endDate?: string): any {
        if (videos.length === 0) return null;
        
        // Group videos by time period
        const timeGroups = this.groupVideosByTimePeriod(videos);
        
        // Calculate trends
        const viewTrend = this.calculateTrend(timeGroups, 'views');
        const engagementTrend = this.calculateTrend(timeGroups, 'engagement');
        
        // Find best performing periods
        const bestPeriods = Object.entries(timeGroups)
            .map(([period, vids]) => ({
                period,
                totalViews: vids.reduce((sum, v) => sum + v.view_count, 0),
                videoCount: vids.length
            }))
            .sort((a, b) => b.totalViews - a.totalViews)
            .slice(0, 3);
        
        return {
            timeRange: {
                start: startDate || new Date(Math.min(...videos.map(v => v.create_time)) * 1000),
                end: endDate || new Date(Math.max(...videos.map(v => v.create_time)) * 1000)
            },
            totalVideosInPeriod: videos.length,
            trends: {
                views: viewTrend,
                engagement: engagementTrend
            },
            bestPerformingPeriods: bestPeriods,
            postingFrequency: this.calculatePostingFrequency(videos),
            seasonalPatterns: this.identifySeasonalPatterns(timeGroups)
        };
    }
    
    /**
     * Generate content insights
     */
    private generateContentInsights(videos: TikTokVideo[], query?: string, hashtags?: string[]): any {
        if (videos.length === 0) return null;
        
        // Analyze content themes
        const commonHashtags = this.findCommonHashtags(videos);
        const contentLength = this.analyzeContentLength(videos);
        
        return {
            searchRelevance: {
                query: query || 'all content',
                matchingVideos: videos.length,
                averageRelevanceScore: this.calculateRelevanceScore(videos, query, hashtags)
            },
            contentPatterns: {
                commonHashtags: commonHashtags.slice(0, 10),
                averageDescriptionLength: contentLength.average,
                optimalLength: contentLength.optimal,
                titlePatterns: this.analyzeTitlePatterns(videos)
            },
            performanceCorrelations: {
                hashtagsToViews: this.correlateHashtagsToPerformance(videos),
                lengthToEngagement: contentLength.correlation,
                timeOfDayImpact: this.analyzeTimeOfDayImpact(videos)
            }
        };
    }
    
    /**
     * Group videos by time period
     */
    private groupVideosByTimePeriod(videos: TikTokVideo[]): Record<string, TikTokVideo[]> {
        const groups: Record<string, TikTokVideo[]> = {};
        
        videos.forEach(video => {
            const date = new Date(video.create_time * 1000);
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            
            if (!groups[monthKey]) {
                groups[monthKey] = [];
            }
            groups[monthKey].push(video);
        });
        
        return groups;
    }
    
    /**
     * Calculate performance trend
     */
    private calculateTrend(timeGroups: Record<string, TikTokVideo[]>, metric: string): string {
        const periods = Object.keys(timeGroups).sort();
        if (periods.length < 2) return 'insufficient_data';
        
        const recentPeriod = periods[periods.length - 1];
        const previousPeriod = periods[periods.length - 2];
        
        let recentValue: number;
        let previousValue: number;
        
        if (metric === 'views') {
            recentValue = timeGroups[recentPeriod].reduce((sum, v) => sum + v.view_count, 0);
            previousValue = timeGroups[previousPeriod].reduce((sum, v) => sum + v.view_count, 0);
        } else {
            recentValue = timeGroups[recentPeriod].reduce((sum, v) => 
                sum + v.like_count + v.comment_count + v.share_count, 0
            );
            previousValue = timeGroups[previousPeriod].reduce((sum, v) => 
                sum + v.like_count + v.comment_count + v.share_count, 0
            );
        }
        
        const changePercent = previousValue > 0 
            ? ((recentValue - previousValue) / previousValue) * 100
            : 100;
        
        if (changePercent > 20) return 'increasing';
        if (changePercent < -20) return 'decreasing';
        return 'stable';
    }
    
    /**
     * Calculate posting frequency
     */
    private calculatePostingFrequency(videos: TikTokVideo[]): any {
        if (videos.length < 2) return { average: 0, pattern: 'insufficient_data' };
        
        const timestamps = videos.map(v => v.create_time).sort();
        const daysBetweenPosts: number[] = [];
        
        for (let i = 1; i < timestamps.length; i++) {
            const daysDiff = (timestamps[i] - timestamps[i-1]) / (60 * 60 * 24);
            daysBetweenPosts.push(daysDiff);
        }
        
        const avgDaysBetween = daysBetweenPosts.reduce((sum, days) => sum + days, 0) / daysBetweenPosts.length;
        
        let pattern: string;
        if (avgDaysBetween < 1) pattern = 'multiple_daily';
        else if (avgDaysBetween <= 1.5) pattern = 'daily';
        else if (avgDaysBetween <= 3.5) pattern = 'every_few_days';
        else if (avgDaysBetween <= 7.5) pattern = 'weekly';
        else pattern = 'irregular';
        
        return {
            averageDaysBetween: avgDaysBetween.toFixed(1),
            pattern,
            postsPerWeek: (7 / avgDaysBetween).toFixed(1)
        };
    }
    
    /**
     * Find common hashtags
     */
    private findCommonHashtags(videos: TikTokVideo[]): any[] {
        const hashtagCount = new Map<string, number>();
        
        videos.forEach(video => {
            const hashtags = this.extractHashtags(video.description);
            hashtags.forEach(tag => {
                hashtagCount.set(tag, (hashtagCount.get(tag) || 0) + 1);
            });
        });
        
        return Array.from(hashtagCount.entries())
            .map(([tag, count]) => ({ hashtag: `#${tag}`, count, percentage: (count / videos.length * 100).toFixed(1) }))
            .sort((a, b) => b.count - a.count);
    }
    
    /**
     * Analyze content length
     */
    private analyzeContentLength(videos: TikTokVideo[]): any {
        const lengths = videos.map(v => (v.description || '').length);
        const avgLength = lengths.reduce((sum, len) => sum + len, 0) / lengths.length;
        
        // Find optimal length (videos with above-average performance)
        const avgViews = videos.reduce((sum, v) => sum + v.view_count, 0) / videos.length;
        const highPerformers = videos.filter(v => v.view_count > avgViews);
        const optimalLength = highPerformers.length > 0
            ? highPerformers.reduce((sum, v) => sum + (v.description || '').length, 0) / highPerformers.length
            : avgLength;
        
        return {
            average: Math.round(avgLength),
            optimal: Math.round(optimalLength),
            correlation: optimalLength > avgLength ? 'longer_performs_better' : 'shorter_performs_better'
        };
    }
    
    /**
     * Calculate relevance score
     */
    private calculateRelevanceScore(videos: TikTokVideo[], query?: string, hashtags?: string[]): number {
        if (!query && (!hashtags || hashtags.length === 0)) return 100;
        
        let totalScore = 0;
        
        videos.forEach(video => {
            let score = 0;
            
            if (query) {
                const queryLower = query.toLowerCase();
                if (video.title.toLowerCase().includes(queryLower)) score += 50;
                if (video.description.toLowerCase().includes(queryLower)) score += 30;
            }
            
            if (hashtags && hashtags.length > 0) {
                const videoHashtags = this.extractHashtags(video.description);
                const matchingHashtags = hashtags.filter(tag => 
                    videoHashtags.includes(tag.replace('#', '').toLowerCase())
                );
                score += (matchingHashtags.length / hashtags.length) * 20;
            }
            
            totalScore += score;
        });
        
        return videos.length > 0 ? Math.round(totalScore / videos.length) : 0;
    }
    
    /**
     * Analyze title patterns
     */
    private analyzeTitlePatterns(videos: TikTokVideo[]): any {
        const patterns = {
            questions: videos.filter(v => v.title.includes('?')).length,
            exclamations: videos.filter(v => v.title.includes('!')).length,
            emojis: videos.filter(v => /[\u{1F600}-\u{1F64F}]/u.test(v.title)).length,
            numbers: videos.filter(v => /\d/.test(v.title)).length,
            allCaps: videos.filter(v => v.title === v.title.toUpperCase() && v.title.length > 3).length
        };
        
        return {
            ...patterns,
            mostCommonPattern: Object.entries(patterns)
                .sort(([, a], [, b]) => b - a)[0][0]
        };
    }
    
    /**
     * Correlate hashtags to performance
     */
    private correlateHashtagsToPerformance(videos: TikTokVideo[]): any[] {
        const hashtagPerformance = new Map<string, { views: number; count: number }>();
        
        videos.forEach(video => {
            const hashtags = this.extractHashtags(video.description);
            hashtags.forEach(tag => {
                const current = hashtagPerformance.get(tag) || { views: 0, count: 0 };
                current.views += video.view_count;
                current.count += 1;
                hashtagPerformance.set(tag, current);
            });
        });
        
        return Array.from(hashtagPerformance.entries())
            .map(([tag, data]) => ({
                hashtag: `#${tag}`,
                averageViews: Math.round(data.views / data.count),
                usageCount: data.count
            }))
            .sort((a, b) => b.averageViews - a.averageViews)
            .slice(0, 5);
    }
    
    /**
     * Analyze time of day impact
     */
    private analyzeTimeOfDayImpact(videos: TikTokVideo[]): any {
        const hourBuckets: Record<number, { views: number; count: number }> = {};
        
        videos.forEach(video => {
            const hour = new Date(video.create_time * 1000).getHours();
            if (!hourBuckets[hour]) {
                hourBuckets[hour] = { views: 0, count: 0 };
            }
            hourBuckets[hour].views += video.view_count;
            hourBuckets[hour].count += 1;
        });
        
        const hourlyPerformance = Object.entries(hourBuckets)
            .map(([hour, data]) => ({
                hour: parseInt(hour),
                averageViews: Math.round(data.views / data.count),
                postCount: data.count
            }))
            .sort((a, b) => b.averageViews - a.averageViews);
        
        return {
            bestHours: hourlyPerformance.slice(0, 3).map(h => h.hour),
            worstHours: hourlyPerformance.slice(-3).map(h => h.hour),
            recommendation: this.generateTimeRecommendation(hourlyPerformance)
        };
    }
    
    /**
     * Generate time posting recommendation
     */
    private generateTimeRecommendation(hourlyPerformance: any[]): string {
        if (hourlyPerformance.length === 0) return 'Insufficient data for recommendations';
        
        const bestHour = hourlyPerformance[0].hour;
        const timeOfDay = bestHour < 12 ? 'morning' : bestHour < 17 ? 'afternoon' : 'evening';
        
        return `Best posting time appears to be ${bestHour}:00 (${timeOfDay}) based on historical performance`;
    }
    
    /**
     * Calculate performance distribution
     */
    private calculatePerformanceDistribution(videos: TikTokVideo[]): any {
        const viewBuckets = {
            '0-1k': 0,
            '1k-10k': 0,
            '10k-100k': 0,
            '100k-1M': 0,
            '1M+': 0
        };
        
        videos.forEach(video => {
            const views = video.view_count;
            if (views < 1000) viewBuckets['0-1k']++;
            else if (views < 10000) viewBuckets['1k-10k']++;
            else if (views < 100000) viewBuckets['10k-100k']++;
            else if (views < 1000000) viewBuckets['100k-1M']++;
            else viewBuckets['1M+']++;
        });
        
        return viewBuckets;
    }
    
    /**
     * Identify seasonal patterns
     */
    private identifySeasonalPatterns(timeGroups: Record<string, TikTokVideo[]>): string[] {
        const patterns: string[] = [];
        
        // Simple seasonal analysis
        const monthlyAvgs: Record<number, number[]> = {};
        
        Object.entries(timeGroups).forEach(([period, videos]) => {
            const month = parseInt(period.split('-')[1]);
            if (!monthlyAvgs[month]) monthlyAvgs[month] = [];
            
            const avgViews = videos.reduce((sum, v) => sum + v.view_count, 0) / videos.length;
            monthlyAvgs[month].push(avgViews);
        });
        
        // Find high-performing months
        const monthPerformance = Object.entries(monthlyAvgs)
            .map(([month, avgs]) => ({
                month: parseInt(month),
                avgPerformance: avgs.reduce((sum, avg) => sum + avg, 0) / avgs.length
            }))
            .sort((a, b) => b.avgPerformance - a.avgPerformance);
        
        if (monthPerformance.length > 0) {
            const bestMonth = monthPerformance[0].month;
            const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            patterns.push(`${monthNames[bestMonth - 1]} shows strongest performance historically`);
        }
        
        return patterns;
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
                Value: []
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
                Name: 'MinViews',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'MinEngagement',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'SortBy',
                Type: 'Input',
                Value: 'date'
            },
            {
                Name: 'SortOrder',
                Type: 'Input',
                Value: 'desc'
            },
            {
                Name: 'Limit',
                Type: 'Input',
                Value: 50
            },
            {
                Name: 'Offset',
                Type: 'Input',
                Value: 0
            },
            {
                Name: 'Videos',
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
        return 'Searches historical TikTok videos with advanced filtering, date ranges, and performance analytics (searches within your own videos only due to API limitations)';
    }
}