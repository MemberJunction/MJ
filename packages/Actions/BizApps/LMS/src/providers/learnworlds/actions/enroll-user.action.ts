import { RegisterClass } from '@memberjunction/global';
import { LearnWorldsBaseAction } from '../learnworlds-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';

/**
 * Action to enroll a user in a LearnWorlds course
 */
@RegisterClass(BaseAction, 'EnrollUserAction')
export class EnrollUserAction extends LearnWorldsBaseAction {
    /**
     * Enroll a user in a course
     */
    public async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const { Params, ContextUser } = params;
        this.params = Params;
        
        try {
            // Extract and validate parameters
            const userId = this.getParamValue(Params, 'UserID');
            const courseId = this.getParamValue(Params, 'CourseID');
            const price = this.getParamValue(Params, 'Price') || 0;
            const justification = this.getParamValue(Params, 'Justification') || 'API Enrollment';
            const notifyUser = this.getParamValue(Params, 'NotifyUser') !== false;
            const startDate = this.getParamValue(Params, 'StartDate');
            const expiryDate = this.getParamValue(Params, 'ExpiryDate');
            
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


            // Prepare enrollment data
            const enrollmentData: any = {
                user_id: userId,
                justification: justification,
                price: price,
                notify_user: notifyUser
            };

            if (startDate) {
                enrollmentData.starts_at = new Date(startDate).toISOString();
            }

            if (expiryDate) {
                enrollmentData.expires_at = new Date(expiryDate).toISOString();
            }

            // Create enrollment
            const enrollmentResponse = await this.makeLearnWorldsRequest(
                `/courses/${courseId}/enrollments`,
                'POST',
                enrollmentData,
                ContextUser
            );

            if (!enrollmentResponse.success) {
                return {
                    Success: false,
                    ResultCode: 'API_ERROR',
                    Message: enrollmentResponse.message || 'Failed to enroll user',
                    Params
                };
            }

            const enrollment = enrollmentResponse.data;

            // Format enrollment details
            const enrollmentDetails = {
                id: enrollment.id,
                userId: enrollment.user_id || userId,
                courseId: enrollment.course_id || courseId,
                enrolledAt: enrollment.enrolled_at || enrollment.created_at,
                startsAt: enrollment.starts_at,
                expiresAt: enrollment.expires_at,
                status: enrollment.status || 'active',
                price: enrollment.price || price,
                progress: {
                    percentage: enrollment.progress_percentage || 0,
                    completedUnits: enrollment.completed_units || 0,
                    totalUnits: enrollment.total_units || 0,
                    lastAccessedAt: enrollment.last_accessed_at
                },
                certificateEligible: enrollment.certificate_eligible || false,
                certificateIssuedAt: enrollment.certificate_issued_at
            };

            // Get course and user details for summary
            let courseTitle = 'Unknown Course';
            let userName = 'Unknown User';

            // Try to get course details
            const courseResponse = await this.makeLearnWorldsRequest(
                `/courses/${courseId}`,
                'GET',
                null,
                ContextUser
            );

            if (courseResponse.success && courseResponse.data) {
                courseTitle = courseResponse.data.title || courseTitle;
            }

            // Try to get user details
            const userResponse = await this.makeLearnWorldsRequest(
                `/users/${userId}`,
                'GET',
                null,
                ContextUser
            );

            if (userResponse.success && userResponse.data) {
                const user = userResponse.data;
                userName = user.email || user.username || userName;
            }

            // Create summary
            const summary = {
                enrollmentId: enrollmentDetails.id,
                userId: userId,
                userName: userName,
                courseId: courseId,
                courseTitle: courseTitle,
                enrolledAt: enrollmentDetails.enrolledAt,
                status: enrollmentDetails.status,
                price: enrollmentDetails.price,
                notificationSent: notifyUser
            };

            // Update output parameters
            const outputParams = [...Params];
            const enrollmentDetailsParam = outputParams.find(p => p.Name === 'EnrollmentDetails');
            if (enrollmentDetailsParam) {
                enrollmentDetailsParam.Value = enrollmentDetails;
            }
            const summaryParam = outputParams.find(p => p.Name === 'Summary');
            if (summaryParam) {
                summaryParam.Value = summary;
            }

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Successfully enrolled user ${userName} in course ${courseTitle}`,
                Params: outputParams
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            return {
                Success: false,
                ResultCode: 'EXECUTION_ERROR',
                Message: `Error enrolling user: ${errorMessage}`,
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
                Name: 'Price',
                Type: 'Input',
                Value: 0
            },
            {
                Name: 'Justification',
                Type: 'Input',
                Value: 'API Enrollment'
            },
            {
                Name: 'NotifyUser',
                Type: 'Input',
                Value: true
            },
            {
                Name: 'StartDate',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'ExpiryDate',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'EnrollmentDetails',
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
        return 'Enrolls a user in a LearnWorlds course with optional pricing and notification settings';
    }
}