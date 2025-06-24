import { RegisterClass } from '@memberjunction/global';
import { LearnWorldsBaseAction } from '../learnworlds-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';

/**
 * Action to retrieve all course enrollments for a specific user
 */
@RegisterClass(LearnWorldsBaseAction, 'GetUserEnrollmentsAction')
export class GetUserEnrollmentsAction extends LearnWorldsBaseAction {
    /**
     * Get all enrollments for a user
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const { Params, ContextUser } = params;
        this.params = Params; // Set params for base class to use
        
        try {
            // Extract and validate parameters
            const userId = this.getParamValue(Params, 'UserID');
            const status = this.getParamValue(Params, 'Status');
            const includeExpired = this.getParamValue(Params, 'IncludeExpired') || false;
            const includeCourseDetails = this.getParamValue(Params, 'IncludeCourseDetails') !== false;
            const sortBy = this.getParamValue(Params, 'SortBy') || 'enrolled_at';
            const sortOrder = this.getParamValue(Params, 'SortOrder') || 'desc';
            const maxResults = this.getParamValue(Params, 'MaxResults') || 100;
            
            if (!userId) {
                return {
                    Success: false,
                    ResultCode: 'VALIDATION_ERROR',
                    Message: 'UserID is required',
                    Params
                };
            }

            // Build query parameters
            const queryParams: any = {
                limit: Math.min(maxResults, 100),
                sort: sortBy,
                order: sortOrder
            };

            if (status) {
                queryParams.status = status;
            }

            if (!includeExpired) {
                queryParams.hide_expired = true;
            }

            // Get user enrollments
            const enrollmentsData = await this.makeLearnWorldsPaginatedRequest<any>(
                `users/${userId}/enrollments`,
                queryParams,
                ContextUser
            );

            const enrollments = enrollmentsData || [];
            const formattedEnrollments: any[] = [];

            // Process each enrollment
            for (const enrollment of enrollments) {
                const formattedEnrollment: any = {
                    id: enrollment.id,
                    courseId: enrollment.course_id,
                    enrolledAt: enrollment.enrolled_at || enrollment.created_at,
                    startsAt: enrollment.starts_at,
                    expiresAt: enrollment.expires_at,
                    status: enrollment.status || 'active',
                    progress: {
                        percentage: enrollment.progress_percentage || 0,
                        completedUnits: enrollment.completed_units || 0,
                        totalUnits: enrollment.total_units || 0,
                        completedLessons: enrollment.completed_lessons || 0,
                        totalLessons: enrollment.total_lessons || 0,
                        lastAccessedAt: enrollment.last_accessed_at,
                        totalTimeSpent: enrollment.total_time_spent || 0,
                        totalTimeSpentText: this.formatDuration(enrollment.total_time_spent || 0)
                    },
                    grade: enrollment.grade,
                    certificateEligible: enrollment.certificate_eligible || false,
                    certificateIssuedAt: enrollment.certificate_issued_at,
                    completedAt: enrollment.completed_at
                };

                // Get course details if requested
                if (includeCourseDetails && enrollment.course_id) {
                    try {
                        const course = await this.makeLearnWorldsRequest<any>(
                            `courses/${enrollment.course_id}`,
                            'GET',
                            undefined,
                            ContextUser
                        );
                        formattedEnrollment.course = {
                            id: course.id,
                            title: course.title,
                            description: course.short_description || course.description,
                            imageUrl: course.image_url,
                            level: course.level,
                            duration: course.duration,
                            durationText: this.formatDuration(course.duration),
                            instructorName: course.instructor_name,
                            certificateEnabled: course.certificate_enabled || false
                        };
                    } catch (error) {
                        // Log error but continue processing
                        console.warn(`Failed to get course details for ${enrollment.course_id}:`, error);
                    }
                }

                formattedEnrollments.push(formattedEnrollment);
            }

            // Calculate summary statistics
            const totalEnrollments = formattedEnrollments.length;
            const activeEnrollments = formattedEnrollments.filter(e => e.status === 'active').length;
            const completedEnrollments = formattedEnrollments.filter(e => 
                e.progress.percentage >= 100 || e.completedAt
            ).length;
            const expiredEnrollments = formattedEnrollments.filter(e => e.status === 'expired').length;
            const averageProgress = totalEnrollments > 0 
                ? formattedEnrollments.reduce((sum, e) => sum + e.progress.percentage, 0) / totalEnrollments 
                : 0;
            const totalTimeSpent = formattedEnrollments.reduce((sum, e) => 
                sum + (e.progress.totalTimeSpent || 0), 0
            );
            const certificatesEarned = formattedEnrollments.filter(e => e.certificateIssuedAt).length;

            // Create summary
            const summary = {
                userId: userId,
                totalEnrollments: totalEnrollments,
                activeEnrollments: activeEnrollments,
                completedEnrollments: completedEnrollments,
                expiredEnrollments: expiredEnrollments,
                inProgressEnrollments: activeEnrollments - completedEnrollments,
                averageProgressPercentage: Math.round(averageProgress * 100) / 100,
                totalTimeSpent: totalTimeSpent,
                totalTimeSpentText: this.formatDuration(totalTimeSpent),
                certificatesEarned: certificatesEarned,
                enrollmentsByStatus: {
                    active: activeEnrollments,
                    completed: completedEnrollments,
                    expired: expiredEnrollments
                }
            };

            // Update output parameters
            const outputParams = [...Params];
            const enrollmentsParam = outputParams.find(p => p.Name === 'Enrollments');
            if (enrollmentsParam) enrollmentsParam.Value = formattedEnrollments;
            const totalCountParam = outputParams.find(p => p.Name === 'TotalCount');
            if (totalCountParam) totalCountParam.Value = totalEnrollments;
            const summaryParam = outputParams.find(p => p.Name === 'Summary');
            if (summaryParam) summaryParam.Value = summary;

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Retrieved ${totalEnrollments} enrollments for user`,
                Params: outputParams
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            return {
                Success: false,
                ResultCode: 'ERROR',
                Message: `Error retrieving enrollments: ${errorMessage}`,
                Params
            };
        }
    }

    /**
     * Define the parameters this action expects
     */
    public get Params(): ActionParam[] {
        const baseParams = this.getCommonLMSParams();
        const specificParams: ActionParam[] = [
            {
                Name: 'UserID',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'Status',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'IncludeExpired',
                Type: 'Input',
                Value: false
            },
            {
                Name: 'IncludeCourseDetails',
                Type: 'Input',
                Value: true
            },
            {
                Name: 'SortBy',
                Type: 'Input',
                Value: 'enrolled_at'
            },
            {
                Name: 'SortOrder',
                Type: 'Input',
                Value: 'desc'
            },
            {
                Name: 'MaxResults',
                Type: 'Input',
                Value: 100
            },
            {
                Name: 'Enrollments',
                Type: 'Output',
                Value: null
            },
            {
                Name: 'TotalCount',
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
        return 'Retrieves all course enrollments for a specific LearnWorlds user with detailed progress information';
    }
}