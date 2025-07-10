import { RegisterClass } from '@memberjunction/global';
import { LearnWorldsBaseAction } from '../learnworlds-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';

/**
 * Action to retrieve comprehensive analytics for a LearnWorlds course
 */
@RegisterClass(BaseAction, 'GetCourseAnalyticsAction')
export class GetCourseAnalyticsAction extends LearnWorldsBaseAction {
    /**
     * Get course performance analytics
     */
    public async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const { Params, ContextUser } = params;
        this.params = Params;
        
        try {
            // Extract and validate parameters
            const courseId = this.getParamValue(Params, 'CourseID');
            const dateFrom = this.getParamValue(Params, 'DateFrom');
            const dateTo = this.getParamValue(Params, 'DateTo');
            const includeUserBreakdown = this.getParamValue(Params, 'IncludeUserBreakdown') === true;
            const includeModuleStats = this.getParamValue(Params, 'IncludeModuleStats') !== false;
            const includeRevenue = this.getParamValue(Params, 'IncludeRevenue') !== false;
            
            if (!courseId) {
                return {
                    Success: false,
                    ResultCode: 'VALIDATION_ERROR',
                    Message: 'CourseID is required',
                    Params
                };
            }


            // Build query parameters
            const queryParams: any = {};
            if (dateFrom) {
                queryParams.date_from = new Date(dateFrom).toISOString().split('T')[0];
            }
            if (dateTo) {
                queryParams.date_to = new Date(dateTo).toISOString().split('T')[0];
            }

            // Build query string
            const queryString = Object.keys(queryParams).length > 0 
                ? '?' + new URLSearchParams(queryParams).toString()
                : '';

            // Get course analytics
            const analyticsResponse = await this.makeLearnWorldsRequest(
                `/courses/${courseId}/analytics${queryString}`,
                'GET',
                null,
                ContextUser
            );

            if (!analyticsResponse.success) {
                return {
                    Success: false,
                    ResultCode: 'API_ERROR',
                    Message: analyticsResponse.message || 'Failed to retrieve analytics',
                    Params
                };
            }

            const analyticsData = analyticsResponse.data || {};

            // Format analytics data
            const analytics: any = {
                courseId: courseId,
                period: {
                    from: dateFrom || 'all-time',
                    to: dateTo || 'current'
                },
                enrollment: {
                    totalEnrollments: analyticsData.total_enrollments || 0,
                    newEnrollments: analyticsData.new_enrollments || 0,
                    activeStudents: analyticsData.active_students || 0,
                    enrollmentTrend: analyticsData.enrollment_trend || []
                },
                progress: {
                    averageProgressPercentage: analyticsData.average_progress || 0,
                    completionRate: analyticsData.completion_rate || 0,
                    totalCompletions: analyticsData.total_completions || 0,
                    inProgressCount: analyticsData.in_progress_count || 0,
                    notStartedCount: analyticsData.not_started_count || 0,
                    dropoutRate: analyticsData.dropout_rate || 0
                },
                engagement: {
                    averageTimeSpent: analyticsData.average_time_spent || 0,
                    averageTimeSpentText: this.formatDuration(analyticsData.average_time_spent || 0),
                    totalTimeSpent: analyticsData.total_time_spent || 0,
                    totalTimeSpentText: this.formatDuration(analyticsData.total_time_spent || 0),
                    averageSessionDuration: analyticsData.average_session_duration || 0,
                    lastActivityDate: analyticsData.last_activity_date,
                    dailyActiveUsers: analyticsData.daily_active_users || []
                },
                performance: {
                    averageQuizScore: analyticsData.average_quiz_score || 0,
                    passRate: analyticsData.pass_rate || 0,
                    certificatesIssued: analyticsData.certificates_issued || 0,
                    averageTimeToComplete: analyticsData.average_time_to_complete || 0,
                    averageTimeToCompleteText: this.formatDuration(analyticsData.average_time_to_complete || 0)
                }
            };

            // Get revenue analytics if requested
            if (includeRevenue) {
                const revenueResponse = await this.makeLearnWorldsRequest(
                    `/courses/${courseId}/revenue${queryString}`,
                    'GET',
                    null,
                    ContextUser
                );

                if (revenueResponse.success && revenueResponse.data) {
                    analytics.revenue = {
                        totalRevenue: revenueResponse.data.total_revenue || 0,
                        currency: revenueResponse.data.currency || 'USD',
                        averageOrderValue: revenueResponse.data.average_order_value || 0,
                        totalOrders: revenueResponse.data.total_orders || 0,
                        revenueTrend: revenueResponse.data.revenue_trend || [],
                        topMarkets: revenueResponse.data.top_markets || []
                    };
                }
            }

            // Get module/lesson stats if requested
            if (includeModuleStats) {
                const moduleStatsResponse = await this.makeLearnWorldsRequest(
                    `/courses/${courseId}/modules/analytics`,
                    'GET',
                    null,
                    ContextUser
                );

                if (moduleStatsResponse.success && moduleStatsResponse.data) {
                    analytics.moduleStats = this.formatModuleStats(moduleStatsResponse.data.data || moduleStatsResponse.data);
                }
            }

            // Get user breakdown if requested
            if (includeUserBreakdown) {
                const enrollmentQueryString = '?' + new URLSearchParams({ limit: '1000', include: 'progress' }).toString();
                const userBreakdownResponse = await this.makeLearnWorldsRequest(
                    `/courses/${courseId}/enrollments${enrollmentQueryString}`,
                    'GET',
                    null,
                    ContextUser
                );

                if (userBreakdownResponse.success && userBreakdownResponse.data) {
                    const enrollments = userBreakdownResponse.data.data || userBreakdownResponse.data;
                    analytics.userBreakdown = this.calculateUserBreakdown(enrollments);
                }
            }

            // Create summary
            const summary = {
                courseId: courseId,
                period: analytics.period,
                keyMetrics: {
                    totalEnrollments: analytics.enrollment.totalEnrollments,
                    completionRate: analytics.progress.completionRate,
                    averageProgress: analytics.progress.averageProgressPercentage,
                    activeStudents: analytics.enrollment.activeStudents,
                    averageTimeSpent: analytics.engagement.averageTimeSpentText,
                    certificatesIssued: analytics.performance.certificatesIssued
                },
                trends: {
                    enrollmentGrowth: this.calculateGrowthRate(analytics.enrollment.enrollmentTrend),
                    engagementTrend: this.calculateEngagementTrend(analytics.engagement.dailyActiveUsers),
                    completionTrend: 'stable' // Would calculate from historical data
                }
            };

            // Update output parameters
            const outputParams = [...Params];
            const courseAnalyticsParam = outputParams.find(p => p.Name === 'CourseAnalytics');
            if (courseAnalyticsParam) {
                courseAnalyticsParam.Value = analytics;
            }
            const summaryParam = outputParams.find(p => p.Name === 'Summary');
            if (summaryParam) {
                summaryParam.Value = summary;
            }

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: 'Course analytics retrieved successfully',
                Params: outputParams
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            return {
                Success: false,
                ResultCode: 'EXECUTION_ERROR',
                Message: `Error retrieving course analytics: ${errorMessage}`,
                Params
            };
        }
    }

    /**
     * Format module statistics
     */
    private formatModuleStats(modules: any[]): any[] {
        return modules.map(module => ({
            moduleId: module.id,
            moduleTitle: module.title,
            completionRate: module.completion_rate || 0,
            averageProgress: module.average_progress || 0,
            averageTimeSpent: module.average_time_spent || 0,
            averageTimeSpentText: this.formatDuration(module.average_time_spent || 0),
            studentsStarted: module.students_started || 0,
            studentsCompleted: module.students_completed || 0,
            lessons: module.lessons?.map((lesson: any) => ({
                lessonId: lesson.id,
                lessonTitle: lesson.title,
                completionRate: lesson.completion_rate || 0,
                averageTimeSpent: lesson.average_time_spent || 0,
                viewCount: lesson.view_count || 0
            })) || []
        }));
    }

    /**
     * Calculate user breakdown statistics
     */
    private calculateUserBreakdown(enrollments: any[]): any {
        const progressBuckets = {
            notStarted: 0,
            under25: 0,
            between25And50: 0,
            between50And75: 0,
            between75And99: 0,
            completed: 0
        };

        enrollments.forEach(enrollment => {
            const progress = enrollment.progress_percentage || 0;
            if (progress === 0) progressBuckets.notStarted++;
            else if (progress < 25) progressBuckets.under25++;
            else if (progress < 50) progressBuckets.between25And50++;
            else if (progress < 75) progressBuckets.between50And75++;
            else if (progress < 100) progressBuckets.between75And99++;
            else progressBuckets.completed++;
        });

        return {
            total: enrollments.length,
            progressDistribution: progressBuckets,
            percentageDistribution: {
                notStarted: (progressBuckets.notStarted / enrollments.length * 100).toFixed(1),
                under25: (progressBuckets.under25 / enrollments.length * 100).toFixed(1),
                between25And50: (progressBuckets.between25And50 / enrollments.length * 100).toFixed(1),
                between50And75: (progressBuckets.between50And75 / enrollments.length * 100).toFixed(1),
                between75And99: (progressBuckets.between75And99 / enrollments.length * 100).toFixed(1),
                completed: (progressBuckets.completed / enrollments.length * 100).toFixed(1)
            }
        };
    }

    /**
     * Calculate growth rate from trend data
     */
    private calculateGrowthRate(trend: any[]): string {
        if (!trend || trend.length < 2) return 'insufficient-data';
        
        const recent = trend[trend.length - 1]?.value || 0;
        const previous = trend[trend.length - 2]?.value || 0;
        
        if (previous === 0) return 'new';
        
        const growthRate = ((recent - previous) / previous) * 100;
        if (growthRate > 10) return 'high-growth';
        if (growthRate > 0) return 'growing';
        if (growthRate === 0) return 'stable';
        return 'declining';
    }

    /**
     * Calculate engagement trend
     */
    private calculateEngagementTrend(dailyActiveUsers: any[]): string {
        if (!dailyActiveUsers || dailyActiveUsers.length < 7) return 'insufficient-data';
        
        // Simple trend calculation based on last 7 days
        const recentAvg = dailyActiveUsers.slice(-7).reduce((sum, day) => sum + (day.value || 0), 0) / 7;
        const previousAvg = dailyActiveUsers.slice(-14, -7).reduce((sum, day) => sum + (day.value || 0), 0) / 7;
        
        if (previousAvg === 0) return 'new';
        
        const change = ((recentAvg - previousAvg) / previousAvg) * 100;
        if (change > 5) return 'increasing';
        if (change < -5) return 'decreasing';
        return 'stable';
    }

    /**
     * Define the parameters this action expects
     */
    public get Params(): ActionParam[] {
        const baseParams = this.getCommonLMSParams();
        const specificParams: ActionParam[] = [
            {
                Name: 'CourseID',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'DateFrom',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'DateTo',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'IncludeUserBreakdown',
                Type: 'Input',
                Value: false
            },
            {
                Name: 'IncludeModuleStats',
                Type: 'Input',
                Value: true
            },
            {
                Name: 'IncludeRevenue',
                Type: 'Input',
                Value: true
            },
            {
                Name: 'CourseAnalytics',
                Type: 'Output',
                Value: null
            },
            {
                Name: 'Summary',
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
        return 'Retrieves comprehensive analytics and performance metrics for a LearnWorlds course';
    }
}