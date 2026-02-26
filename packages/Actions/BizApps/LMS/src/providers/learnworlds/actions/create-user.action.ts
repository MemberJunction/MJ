import { RegisterClass } from '@memberjunction/global';
import { LearnWorldsBaseAction } from '../learnworlds-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';
import { UserInfo } from '@memberjunction/core';
import { CreateUserParams, CreateUserResult, CreateUserDetails, CreateUserEnrollmentResult, CreateUserSummary, LWApiUser } from '../interfaces';

/**
 * Shape returned by the LearnWorlds POST /users endpoint
 */
interface LWCreateUserResponse {
  id: string;
  email: string;
  username?: string;
  first_name?: string;
  last_name?: string;
  role?: string;
  is_active?: boolean;
  tags?: string[];
  custom_fields?: Record<string, unknown>;
  created_at?: string;
  login_url?: string;
  reset_password_url?: string;
}

/**
 * Shape returned by the LearnWorlds POST /courses/{id}/enrollments endpoint
 */
interface LWEnrollmentResponse {
  id?: string;
}

/**
 * Action to create a new user in LearnWorlds
 */
@RegisterClass(BaseAction, 'CreateUserAction')
export class CreateUserAction extends LearnWorldsBaseAction {
  /**
   * Typed public method for direct (non-framework) callers.
   * Throws on failure instead of returning ActionResultSimple.
   */
  public async CreateUser(params: CreateUserParams, contextUser: UserInfo): Promise<CreateUserResult> {
    this.SetCompanyContext(params.CompanyID);

    const email = params.Email;
    if (!email) {
      throw new Error('Email is required');
    }

    const role = params.Role || 'student';
    const isActive = params.IsActive !== false;
    const sendWelcomeEmail = params.SendWelcomeEmail !== false;

    // Prepare user data
    const userData: Record<string, unknown> = {
      email: email,
      role: role,
      is_active: isActive,
    };

    // Add optional fields
    if (params.Username) userData.username = params.Username;
    if (params.Password) userData.password = params.Password;
    if (params.FirstName) userData.first_name = params.FirstName;
    if (params.LastName) userData.last_name = params.LastName;
    userData.send_welcome_email = sendWelcomeEmail;

    // Add tags if provided (expecting comma-separated string or array)
    if (params.Tags) {
      userData.tags = Array.isArray(params.Tags) ? params.Tags : params.Tags.split(',').map((t: string) => t.trim());
    }

    // Add custom fields if provided
    if (params.CustomFields) {
      userData.custom_fields = params.CustomFields;
    }

    // Create user
    const newUser = await this.makeLearnWorldsRequest<LWCreateUserResponse>('users', 'POST', userData, contextUser);

    // Format user details
    const userDetails = this.buildUserDetails(newUser);

    // Enroll in courses if requested
    const enrollmentResults = await this.enrollInCourses(newUser.id, params.EnrollInCourses, contextUser);

    // Create summary
    const summary = this.buildSummary(userDetails, sendWelcomeEmail, enrollmentResults);

    return {
      UserDetails: userDetails,
      EnrollmentResults: enrollmentResults,
      Summary: summary,
    };
  }

  /**
   * Framework entry point -- delegates to the typed public method.
   */
  protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    const { Params, ContextUser } = params;
    this.params = Params;

    try {
      const typedParams = this.extractCreateUserParams(Params);
      const result = await this.CreateUser(typedParams, ContextUser);

      this.setOutputParam(Params, 'UserDetails', result.UserDetails);
      this.setOutputParam(Params, 'EnrollmentResults', result.EnrollmentResults);
      this.setOutputParam(Params, 'Summary', result.Summary);

      return this.buildSuccessResult(`Successfully created user ${result.UserDetails.email}`, Params);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      return this.buildErrorResult('ERROR', `Error creating user: ${msg}`, Params);
    }
  }

  /**
   * Extract typed params from the generic ActionParam array
   */
  private extractCreateUserParams(params: ActionParam[]): CreateUserParams {
    const companyId = this.getParamValue(params, 'CompanyID') as string;
    return {
      CompanyID: companyId,
      Email: this.getParamValue(params, 'Email') as string,
      Username: this.getParamValue(params, 'Username') as string | undefined,
      Password: this.getParamValue(params, 'Password') as string | undefined,
      FirstName: this.getParamValue(params, 'FirstName') as string | undefined,
      LastName: this.getParamValue(params, 'LastName') as string | undefined,
      Role: (this.getParamValue(params, 'Role') as string | undefined) || 'student',
      IsActive: this.getParamValue(params, 'IsActive') as boolean | undefined,
      SendWelcomeEmail: this.getParamValue(params, 'SendWelcomeEmail') as boolean | undefined,
      Tags: this.getParamValue(params, 'Tags') as string | string[] | undefined,
      CustomFields: this.getParamValue(params, 'CustomFields') as Record<string, unknown> | undefined,
      EnrollInCourses: this.getParamValue(params, 'EnrollInCourses') as string | string[] | undefined,
    };
  }

  /**
   * Map the raw LW create-user response to our typed details shape.
   */
  private buildUserDetails(newUser: LWCreateUserResponse): CreateUserDetails {
    return {
      id: newUser.id,
      email: newUser.email,
      username: newUser.username,
      firstName: newUser.first_name,
      lastName: newUser.last_name,
      fullName: `${newUser.first_name || ''} ${newUser.last_name || ''}`.trim(),
      role: newUser.role || 'student',
      status: newUser.is_active ? 'active' : 'inactive',
      tags: newUser.tags || [],
      customFields: newUser.custom_fields || {},
      createdAt: newUser.created_at,
      loginUrl: newUser.login_url,
      resetPasswordUrl: newUser.reset_password_url,
    };
  }

  /**
   * Enroll the newly created user in any requested courses.
   */
  private async enrollInCourses(userId: string, enrollInCourses: string | string[] | undefined, contextUser: UserInfo): Promise<CreateUserEnrollmentResult[]> {
    const enrollmentResults: CreateUserEnrollmentResult[] = [];

    if (!enrollInCourses || (Array.isArray(enrollInCourses) && enrollInCourses.length === 0)) {
      return enrollmentResults;
    }

    const courseIds = Array.isArray(enrollInCourses) ? enrollInCourses : [enrollInCourses];

    for (const courseId of courseIds) {
      try {
        const enrollBody: Record<string, unknown> = {
          user_id: userId,
          justification: 'Enrolled during user creation',
          notify_user: false,
        };

        const enrollData = await this.makeLearnWorldsRequest<LWEnrollmentResponse>(`courses/${courseId}/enrollments`, 'POST', enrollBody, contextUser);

        enrollmentResults.push({
          courseId: courseId,
          success: true,
          enrollmentId: enrollData.id,
        });
      } catch (enrollError) {
        enrollmentResults.push({
          courseId: courseId,
          success: false,
          error: enrollError instanceof Error ? enrollError.message : 'Enrollment failed',
        });
      }
    }

    return enrollmentResults;
  }

  /**
   * Build the summary object from user details and enrollment results.
   */
  private buildSummary(userDetails: CreateUserDetails, sendWelcomeEmail: boolean, enrollmentResults: CreateUserEnrollmentResult[]): CreateUserSummary {
    return {
      userId: userDetails.id,
      email: userDetails.email,
      username: userDetails.username,
      fullName: userDetails.fullName,
      role: userDetails.role,
      status: userDetails.status,
      welcomeEmailSent: sendWelcomeEmail,
      coursesEnrolled: enrollmentResults.filter((r) => r.success).length,
      totalCoursesRequested: enrollmentResults.length,
      loginUrl: userDetails.loginUrl,
    };
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
        Value: null,
      },
      {
        Name: 'Username',
        Type: 'Input',
        Value: null,
      },
      {
        Name: 'Password',
        Type: 'Input',
        Value: null,
      },
      {
        Name: 'FirstName',
        Type: 'Input',
        Value: null,
      },
      {
        Name: 'LastName',
        Type: 'Input',
        Value: null,
      },
      {
        Name: 'Role',
        Type: 'Input',
        Value: 'student',
      },
      {
        Name: 'IsActive',
        Type: 'Input',
        Value: true,
      },
      {
        Name: 'SendWelcomeEmail',
        Type: 'Input',
        Value: true,
      },
      {
        Name: 'Tags',
        Type: 'Input',
        Value: null,
      },
      {
        Name: 'CustomFields',
        Type: 'Input',
        Value: null,
      },
      {
        Name: 'EnrollInCourses',
        Type: 'Input',
        Value: null,
      },
      {
        Name: 'UserDetails',
        Type: 'Output',
        Value: null,
      },
      {
        Name: 'EnrollmentResults',
        Type: 'Output',
        Value: null,
      },
      {
        Name: 'Summary',
        Type: 'Output',
        Value: null,
      },
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
