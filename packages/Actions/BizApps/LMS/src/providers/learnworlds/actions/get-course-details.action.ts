import { RegisterClass } from '@memberjunction/global';
import { LearnWorldsBaseAction } from '../learnworlds-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';

/**
 * Action to retrieve comprehensive course details including curriculum structure
 */
@RegisterClass(BaseAction, 'GetLearnWorldsCourseDetailsAction')
export class GetLearnWorldsCourseDetailsAction extends LearnWorldsBaseAction {
    /**
     * Get comprehensive details about a specific course including curriculum
     */
    public async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const { Params, ContextUser } = params;
        this.params = Params;
        
        try {
            // Extract and validate parameters
            const courseId = this.getParamValue(Params, 'CourseID');
            const includeModules = this.getParamValue(Params, 'IncludeModules') !== false;
            const includeInstructors = this.getParamValue(Params, 'IncludeInstructors') !== false;
            const includeStats = this.getParamValue(Params, 'IncludeStats') !== false;
            
            if (!courseId) {
                return {
                    Success: false,
                    ResultCode: 'VALIDATION_ERROR',
                    Message: 'CourseID is required',
                    Params
                };
            }


            // Get course details
            const courseResponse = await this.makeLearnWorldsRequest(
                `/courses/${courseId}`,
                'GET',
                null,
                ContextUser
            );

            if (!courseResponse.success || !courseResponse.data) {
                return {
                    Success: false,
                    ResultCode: 'API_ERROR',
                    Message: courseResponse.message || 'Failed to retrieve course details',
                    Params
                };
            }

            const course = courseResponse.data;
            const courseDetails: any = {
                id: course.id,
                title: course.title,
                slug: course.slug,
                description: course.description,
                shortDescription: course.short_description,
                status: course.status || 'published',
                price: course.price || 0,
                originalPrice: course.original_price,
                currency: course.currency || 'USD',
                level: course.level || 'all',
                language: course.language || 'en',
                duration: course.duration,
                durationText: this.formatDuration(course.duration),
                totalEnrollments: course.total_enrollments || 0,
                averageRating: course.average_rating,
                totalRatings: course.total_ratings || 0,
                tags: course.tags || [],
                categories: course.categories || [],
                imageUrl: course.image_url,
                videoUrl: course.video_url,
                certificateEnabled: course.certificate_enabled || false,
                createdAt: course.created_at,
                updatedAt: course.updated_at,
                publishedAt: course.published_at
            };

            // Get curriculum/modules if requested
            if (includeModules) {
                const modulesResponse = await this.makeLearnWorldsRequest(
                    `/courses/${courseId}/sections`,
                    'GET',
                    null,
                    ContextUser
                );

                if (modulesResponse.success && modulesResponse.data) {
                    courseDetails.modules = this.formatModules(modulesResponse.data.data || modulesResponse.data);
                    courseDetails.totalModules = courseDetails.modules.length;
                    courseDetails.totalLessons = courseDetails.modules.reduce((sum: number, module: any) => 
                        sum + (module.lessons?.length || 0), 0
                    );
                }
            }

            // Get instructors if requested
            if (includeInstructors) {
                const instructorsResponse = await this.makeLearnWorldsRequest(
                    `/courses/${courseId}/instructors`,
                    'GET',
                    null,
                    ContextUser
                );

                if (instructorsResponse.success && instructorsResponse.data) {
                    courseDetails.instructors = this.formatInstructors(instructorsResponse.data.data || instructorsResponse.data);
                }
            }

            // Get additional stats if requested
            if (includeStats) {
                const statsResponse = await this.makeLearnWorldsRequest(
                    `/courses/${courseId}/stats`,
                    'GET',
                    null,
                    ContextUser
                );

                if (statsResponse.success && statsResponse.data) {
                    courseDetails.stats = {
                        totalEnrollments: statsResponse.data.total_enrollments || courseDetails.totalEnrollments,
                        activeStudents: statsResponse.data.active_students || 0,
                        completionRate: statsResponse.data.completion_rate || 0,
                        averageProgressPercentage: statsResponse.data.average_progress || 0,
                        averageTimeToComplete: statsResponse.data.average_time_to_complete,
                        totalRevenue: statsResponse.data.total_revenue || 0
                    };
                }
            }

            // Create summary
            const summary = {
                courseId: courseDetails.id,
                title: courseDetails.title,
                status: courseDetails.status,
                level: courseDetails.level,
                duration: courseDetails.durationText,
                totalModules: courseDetails.totalModules || 0,
                totalLessons: courseDetails.totalLessons || 0,
                totalEnrollments: courseDetails.totalEnrollments,
                averageRating: courseDetails.averageRating || 0,
                certificateEnabled: courseDetails.certificateEnabled,
                price: courseDetails.price,
                currency: courseDetails.currency
            };

            // Update output parameters
            const outputParams = [...Params];
            const courseDetailsParam = outputParams.find(p => p.Name === 'CourseDetails');
            if (courseDetailsParam) {
                courseDetailsParam.Value = courseDetails;
            }
            const summaryParam = outputParams.find(p => p.Name === 'Summary');
            if (summaryParam) {
                summaryParam.Value = summary;
            }

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: 'Course details retrieved successfully',
                Params: outputParams
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            return {
                Success: false,
                ResultCode: 'EXECUTION_ERROR',
                Message: `Error retrieving course details: ${errorMessage}`,
                Params
            };
        }
    }

    /**
     * Format course modules/sections data
     */
    private formatModules(modules: any[]): any[] {
        return modules.map(module => ({
            id: module.id,
            title: module.title,
            description: module.description,
            order: module.order || module.position || 0,
            duration: module.duration,
            durationText: this.formatDuration(module.duration),
            totalLessons: module.total_lessons || module.lessons?.length || 0,
            lessons: module.lessons?.map((lesson: any) => ({
                id: lesson.id,
                title: lesson.title,
                type: lesson.type || 'video',
                duration: lesson.duration,
                durationText: this.formatDuration(lesson.duration),
                order: lesson.order || lesson.position || 0,
                isFree: lesson.is_free || false,
                hasVideo: lesson.has_video || false,
                hasQuiz: lesson.has_quiz || false,
                hasAssignment: lesson.has_assignment || false
            })) || []
        })).sort((a, b) => a.order - b.order);
    }

    /**
     * Format instructor data
     */
    private formatInstructors(instructors: any[]): any[] {
        return instructors.map(instructor => ({
            id: instructor.id,
            name: instructor.name || `${instructor.first_name || ''} ${instructor.last_name || ''}`.trim(),
            email: instructor.email,
            bio: instructor.bio,
            title: instructor.title,
            imageUrl: instructor.image_url || instructor.avatar_url,
            totalCourses: instructor.total_courses || 0,
            totalStudents: instructor.total_students || 0,
            averageRating: instructor.average_rating || 0
        }));
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
                Name: 'IncludeModules',
                Type: 'Input',
                Value: true
            },
            {
                Name: 'IncludeInstructors',
                Type: 'Input',
                Value: true
            },
            {
                Name: 'IncludeStats',
                Type: 'Input',
                Value: true
            },
            {
                Name: 'CourseDetails',
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
        return 'Retrieves comprehensive details about a specific LearnWorlds course including curriculum structure';
    }
}