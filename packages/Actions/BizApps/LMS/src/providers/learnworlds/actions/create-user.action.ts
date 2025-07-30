import { RegisterClass } from '@memberjunction/global';
import { LearnWorldsBaseAction } from '../learnworlds-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';

/**
 * Action to create a new user in LearnWorlds
 */
@RegisterClass(BaseAction, 'CreateUserAction')
export class CreateUserAction extends LearnWorldsBaseAction {
    /**
     * Create a new user
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const { Params, ContextUser } = params;
        this.params = Params; // Set params for base class to use
        
        try {
            // Extract and validate parameters
            const email = this.getParamValue(Params, 'Email');
            const username = this.getParamValue(Params, 'Username');
            const password = this.getParamValue(Params, 'Password');
            const firstName = this.getParamValue(Params, 'FirstName');
            const lastName = this.getParamValue(Params, 'LastName');
            const role = this.getParamValue(Params, 'Role') || 'student';
            const isActive = this.getParamValue(Params, 'IsActive') !== false;
            const sendWelcomeEmail = this.getParamValue(Params, 'SendWelcomeEmail') !== false;
            const tags = this.getParamValue(Params, 'Tags');
            const customFields = this.getParamValue(Params, 'CustomFields');
            const enrollInCourses = this.getParamValue(Params, 'EnrollInCourses');
            
            if (!email) {
                return {
                    Success: false,
                    ResultCode: 'VALIDATION_ERROR',
                    Message: 'Email is required',
                    Params
                };
            }

            // Prepare user data
            const userData: any = {
                email: email,
                role: role,
                is_active: isActive
            };

            // Add optional fields
            if (username) userData.username = username;
            if (password) userData.password = password;
            if (firstName) userData.first_name = firstName;
            if (lastName) userData.last_name = lastName;
            if (sendWelcomeEmail !== undefined) userData.send_welcome_email = sendWelcomeEmail;
            
            // Add tags if provided (expecting comma-separated string or array)
            if (tags) {
                userData.tags = Array.isArray(tags) ? tags : tags.split(',').map((t: string) => t.trim());
            }

            // Add custom fields if provided
            if (customFields) {
                userData.custom_fields = customFields;
            }

            // Create user
            const newUser = await this.makeLearnWorldsRequest<any>(
                'users',
                'POST',
                userData,
                ContextUser
            );

            // Format user details
            const userDetails = {
                id: newUser.id,
                email: newUser.email,
                username: newUser.username,
                firstName: newUser.first_name,
                lastName: newUser.last_name,
                fullName: `${newUser.first_name || ''} ${newUser.last_name || ''}`.trim(),
                role: newUser.role,
                status: newUser.is_active ? 'active' : 'inactive',
                tags: newUser.tags || [],
                customFields: newUser.custom_fields || {},
                createdAt: newUser.created_at,
                loginUrl: newUser.login_url,
                resetPasswordUrl: newUser.reset_password_url
            };

            // Enroll in courses if requested
            const enrollmentResults: any[] = [];
            if (enrollInCourses && enrollInCourses.length > 0) {
                const courseIds = Array.isArray(enrollInCourses) ? enrollInCourses : [enrollInCourses];
                
                for (const courseId of courseIds) {
                    try {
                        const enrollData = await this.makeLearnWorldsRequest<any>(
                            `courses/${courseId}/enrollments`,
                            'POST',
                            {
                                user_id: newUser.id,
                                justification: 'Enrolled during user creation',
                                notify_user: false
                            },
                            ContextUser
                        );
                        
                        enrollmentResults.push({
                            courseId: courseId,
                            success: true,
                            enrollmentId: enrollData.id
                        });
                    } catch (enrollError) {
                        enrollmentResults.push({
                            courseId: courseId,
                            success: false,
                            error: enrollError instanceof Error ? enrollError.message : 'Enrollment failed'
                        });
                    }
                }
            }

            // Create summary
            const summary = {
                userId: userDetails.id,
                email: userDetails.email,
                username: userDetails.username,
                fullName: userDetails.fullName,
                role: userDetails.role,
                status: userDetails.status,
                welcomeEmailSent: sendWelcomeEmail,
                coursesEnrolled: enrollmentResults.filter(r => r.success).length,
                totalCoursesRequested: enrollmentResults.length,
                loginUrl: userDetails.loginUrl
            };

            // Update output parameters
            const outputParams = [...Params];
            const userDetailsParam = outputParams.find(p => p.Name === 'UserDetails');
            if (userDetailsParam) userDetailsParam.Value = userDetails;
            const enrollmentResultsParam = outputParams.find(p => p.Name === 'EnrollmentResults');
            if (enrollmentResultsParam) enrollmentResultsParam.Value = enrollmentResults;
            const summaryParam = outputParams.find(p => p.Name === 'Summary');
            if (summaryParam) summaryParam.Value = summary;

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Successfully created user ${userDetails.email}`,
                Params: outputParams
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            return {
                Success: false,
                ResultCode: 'ERROR',
                Message: `Error creating user: ${errorMessage}`,
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
                Name: 'Email',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'Username',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'Password',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'FirstName',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'LastName',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'Role',
                Type: 'Input',
                Value: 'student'
            },
            {
                Name: 'IsActive',
                Type: 'Input',
                Value: true
            },
            {
                Name: 'SendWelcomeEmail',
                Type: 'Input',
                Value: true
            },
            {
                Name: 'Tags',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'CustomFields',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'EnrollInCourses',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'UserDetails',
                Type: 'Output',
                Value: null
            },
            {
                Name: 'EnrollmentResults',
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
        return 'Creates a new user in LearnWorlds with optional course enrollments and welcome email';
    }
}