import { RegisterClass } from '@memberjunction/global';
import { LearnWorldsBaseAction } from '../learnworlds-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';

/**
 * Action to update a user's course progress in LearnWorlds
 */
@RegisterClass(BaseAction, 'UpdateUserProgressAction')
export class UpdateUserProgressAction extends LearnWorldsBaseAction {
    /**
     * Update user progress for a course or lesson
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const { Params, ContextUser } = params;
        this.params = Params; // Set params for base class to use
        
        try {
            // Extract and validate parameters
            const userId = this.getParamValue(Params, 'UserID');
            const courseId = this.getParamValue(Params, 'CourseID');
            const lessonId = this.getParamValue(Params, 'LessonID');
            const progressPercentage = this.getParamValue(Params, 'ProgressPercentage');
            const completed = this.getParamValue(Params, 'Completed');
            const timeSpent = this.getParamValue(Params, 'TimeSpent');
            const score = this.getParamValue(Params, 'Score');
            const notes = this.getParamValue(Params, 'Notes');
            
            if (!userId) {
                return {
                    Success: false,
                    ResultCode: 'VALIDATION_ERROR',
                    Message: 'UserID is required',
                    Params
                };
            }

            if (!courseId) {
                return {
                    Success: false,
                    ResultCode: 'VALIDATION_ERROR',
                    Message: 'CourseID is required',
                    Params
                };
            }

            // Get current enrollment first
            let currentEnrollment: any;
            try {
                currentEnrollment = await this.makeLearnWorldsRequest<any>(
                    `users/${userId}/enrollments/${courseId}`,
                    'GET',
                    undefined,
                    ContextUser
                );
            } catch (error) {
                return {
                    Success: false,
                    ResultCode: 'NOT_ENROLLED',
                    Message: 'User is not enrolled in this course',
                    Params
                };
            }
            let updateResult: any = {};

            // Update lesson progress if lessonId is provided
            if (lessonId) {
                const lessonProgressData: any = {
                    completed: completed !== undefined ? completed : false,
                    progress_percentage: progressPercentage
                };

                if (timeSpent !== undefined) {
                    lessonProgressData.time_spent = timeSpent;
                }

                if (score !== undefined) {
                    lessonProgressData.score = score;
                }

                if (notes) {
                    lessonProgressData.notes = notes;
                }

                try {
                    const lessonUpdateData = await this.makeLearnWorldsRequest<any>(
                        `users/${userId}/courses/${courseId}/lessons/${lessonId}/progress`,
                        'PUT',
                        lessonProgressData,
                        ContextUser
                    );
                    updateResult.lessonProgress = lessonUpdateData;
                } catch (error) {
                    return {
                        Success: false,
                        ResultCode: 'UPDATE_FAILED',
                        Message: error instanceof Error ? error.message : 'Failed to update lesson progress',
                        Params
                    };
                }
            }

            // Update overall course progress if progressPercentage is provided at course level
            if (progressPercentage !== undefined && !lessonId) {
                const courseProgressData: any = {
                    progress_percentage: progressPercentage
                };

                if (completed !== undefined) {
                    courseProgressData.completed = completed;
                }

                if (timeSpent !== undefined) {
                    courseProgressData.total_time_spent = (currentEnrollment.total_time_spent || 0) + timeSpent;
                }

                try {
                    const courseUpdateData = await this.makeLearnWorldsRequest<any>(
                        `users/${userId}/enrollments/${courseId}/progress`,
                        'PUT',
                        courseProgressData,
                        ContextUser
                    );
                    updateResult.courseProgress = courseUpdateData;
                } catch (error) {
                    return {
                        Success: false,
                        ResultCode: 'UPDATE_FAILED',
                        Message: error instanceof Error ? error.message : 'Failed to update course progress',
                        Params
                    };
                }
            }

            // Get updated enrollment details
            let updatedProgress = currentEnrollment;
            try {
                updatedProgress = await this.makeLearnWorldsRequest<any>(
                    `users/${userId}/enrollments/${courseId}`,
                    'GET',
                    undefined,
                    ContextUser
                );
            } catch (error) {
                // If we can't get updated details, use current enrollment
                console.warn('Failed to get updated enrollment details:', error);
            }

            // Format progress details
            const progressDetails = {
                userId: userId,
                courseId: courseId,
                lessonId: lessonId,
                previousProgress: {
                    percentage: currentEnrollment.progress_percentage || 0,
                    completedUnits: currentEnrollment.completed_units || 0,
                    totalTimeSpent: currentEnrollment.total_time_spent || 0
                },
                updatedProgress: {
                    percentage: updatedProgress.progress_percentage || 0,
                    completedUnits: updatedProgress.completed_units || 0,
                    totalUnits: updatedProgress.total_units || 0,
                    totalTimeSpent: updatedProgress.total_time_spent || 0,
                    totalTimeSpentText: this.formatDuration(updatedProgress.total_time_spent || 0),
                    lastAccessedAt: updatedProgress.last_accessed_at || new Date().toISOString(),
                    completed: updatedProgress.completed || false,
                    completedAt: updatedProgress.completed_at
                },
                updateType: lessonId ? 'lesson' : 'course',
                updateResult: updateResult
            };

            // Create summary
            const summary = {
                userId: userId,
                courseId: courseId,
                lessonId: lessonId,
                progressIncreased: (updatedProgress.progress_percentage || 0) > (currentEnrollment.progress_percentage || 0),
                previousPercentage: currentEnrollment.progress_percentage || 0,
                newPercentage: updatedProgress.progress_percentage || 0,
                timeAdded: timeSpent || 0,
                totalTimeSpent: updatedProgress.total_time_spent || 0,
                isCompleted: updatedProgress.completed || false,
                updateType: progressDetails.updateType
            };

            // Update output parameters
            const outputParams = [...Params];
            const progressDetailsParam = outputParams.find(p => p.Name === 'ProgressDetails');
            if (progressDetailsParam) progressDetailsParam.Value = progressDetails;
            const summaryParam = outputParams.find(p => p.Name === 'Summary');
            if (summaryParam) summaryParam.Value = summary;

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Successfully updated ${progressDetails.updateType} progress`,
                Params: outputParams
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            return {
                Success: false,
                ResultCode: 'ERROR',
                Message: `Error updating progress: ${errorMessage}`,
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
                Name: 'CourseID',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'LessonID',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'ProgressPercentage',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'Completed',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'TimeSpent',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'Score',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'Notes',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'ProgressDetails',
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
        return 'Updates a user\'s progress for a course or specific lesson in LearnWorlds';
    }
}