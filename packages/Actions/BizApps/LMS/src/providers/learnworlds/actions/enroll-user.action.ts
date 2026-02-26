import { RegisterClass } from '@memberjunction/global';
import { LearnWorldsBaseAction } from '../learnworlds-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';
import { UserInfo } from '@memberjunction/core';
import { EnrollUserParams, EnrollUserResult, EnrollUserSummary, LearnWorldsEnrollment } from '../interfaces';

/**
 * Shape returned by the LearnWorlds enrollment endpoint
 */
interface LWEnrollmentResponse {
  success?: boolean;
  message?: string;
  data?: {
    id?: string;
    user_id?: string;
    course_id?: string;
    enrolled_at?: string;
    created_at?: string;
    starts_at?: string;
    expires_at?: string;
    status?: string;
    price?: number;
    progress_percentage?: number;
    completed_units?: number;
    total_units?: number;
    last_accessed_at?: string;
    certificate_eligible?: boolean;
    certificate_issued_at?: string;
  };
}

/**
 * Shape returned by the LearnWorlds GET /courses/{id} endpoint (partial)
 */
interface LWCourseResponse {
  success?: boolean;
  data?: {
    title?: string;
  };
}

/**
 * Shape returned by the LearnWorlds GET /users/{id} endpoint (partial)
 */
interface LWUserLookupResponse {
  success?: boolean;
  data?: {
    email?: string;
    username?: string;
  };
}

/**
 * Action to enroll a user in a LearnWorlds course or bundle
 */
@RegisterClass(BaseAction, 'EnrollUserAction')
export class EnrollUserAction extends LearnWorldsBaseAction {
  /**
   * Typed public method for direct (non-framework) callers.
   * Supports both course and bundle enrollment via ProductType.
   * Throws on failure.
   */
  public async EnrollUser(params: EnrollUserParams, contextUser: UserInfo): Promise<EnrollUserResult> {
    this.SetCompanyContext(params.CompanyID);

    if (!params.UserID) {
      throw new Error('UserID is required');
    }
    if (!params.CourseID) {
      throw new Error('CourseID is required');
    }

    const price = params.Price ?? 0;
    const justification = params.Justification || 'API Enrollment';
    const notifyUser = params.NotifyUser !== false;
    const productType = params.ProductType || 'course';

    // Build enrollment body and choose endpoint based on product type
    const { endpoint, enrollmentData } = this.buildEnrollmentRequest(
      params.UserID,
      params.CourseID,
      productType,
      price,
      justification,
      notifyUser,
      params.StartDate,
      params.ExpiryDate,
    );

    // Create enrollment
    const enrollmentResponse = await this.makeLearnWorldsRequest<LWEnrollmentResponse>(endpoint, 'POST', enrollmentData, contextUser);

    if (enrollmentResponse.success === false) {
      throw new Error(enrollmentResponse.message || 'Failed to enroll user');
    }

    const enrollment = enrollmentResponse.data;

    // Format enrollment details
    const enrollmentDetails = this.buildEnrollmentDetails(enrollment, params.UserID, params.CourseID, price);

    // Fetch course title and user name in parallel for the summary
    const [courseTitle, userName] = await Promise.all([
      this.fetchCourseTitle(params.CourseID, contextUser),
      this.fetchUserName(params.UserID, contextUser),
    ]);

    // Create summary
    const summary: EnrollUserSummary = {
      enrollmentId: enrollmentDetails.id,
      userId: params.UserID,
      userName: userName,
      courseId: params.CourseID,
      courseTitle: courseTitle,
      enrolledAt: enrollmentDetails.enrolledAt,
      status: enrollmentDetails.status,
      price: enrollmentDetails.price,
      notificationSent: notifyUser,
    };

    return {
      EnrollmentDetails: enrollmentDetails,
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
      const typedParams = this.extractEnrollUserParams(Params);
      const result = await this.EnrollUser(typedParams, ContextUser);

      this.setOutputParam(Params, 'EnrollmentDetails', result.EnrollmentDetails);
      this.setOutputParam(Params, 'Summary', result.Summary);

      return this.buildSuccessResult(`Successfully enrolled user ${result.Summary.userName} in course ${result.Summary.courseTitle}`, Params);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      return this.buildErrorResult('ERROR', `Error enrolling user: ${msg}`, Params);
    }
  }

  /**
   * Extract typed params from the generic ActionParam array
   */
  private extractEnrollUserParams(params: ActionParam[]): EnrollUserParams {
    return {
      CompanyID: this.getRequiredStringParam(params, 'CompanyID'),
      UserID: this.getRequiredStringParam(params, 'UserID'),
      CourseID: this.getRequiredStringParam(params, 'CourseID'),
      ProductType: (this.getOptionalStringParam(params, 'ProductType') || 'course') as 'course' | 'bundle',
      Price: this.getOptionalNumberParam(params, 'Price', 0),
      Justification: this.getOptionalStringParam(params, 'Justification') || 'API Enrollment',
      NotifyUser: this.getOptionalBooleanParam(params, 'NotifyUser', true),
      StartDate: this.getOptionalStringParam(params, 'StartDate'),
      ExpiryDate: this.getOptionalStringParam(params, 'ExpiryDate'),
    };
  }

  /**
   * Build the endpoint and body based on product type (course vs bundle).
   */
  private buildEnrollmentRequest(
    userId: string,
    courseId: string,
    productType: 'course' | 'bundle',
    price: number,
    justification: string,
    notifyUser: boolean,
    startDate?: string,
    expiryDate?: string,
  ): { endpoint: string; enrollmentData: Record<string, unknown> } {
    if (productType === 'bundle') {
      // Bundles use the generic enrollments endpoint with product_type
      return {
        endpoint: 'enrollments',
        enrollmentData: {
          product_id: courseId,
          product_type: 'bundle',
          user_id: userId,
          price: price,
          justification: justification,
          notify_user: notifyUser,
          ...(startDate ? { starts_at: new Date(startDate).toISOString() } : {}),
          ...(expiryDate ? { expires_at: new Date(expiryDate).toISOString() } : {}),
        },
      };
    }

    // Courses use the per-course enrollment endpoint
    const enrollmentData: Record<string, unknown> = {
      user_id: userId,
      justification: justification,
      price: price,
      notify_user: notifyUser,
    };

    if (startDate) {
      enrollmentData.starts_at = new Date(startDate).toISOString();
    }
    if (expiryDate) {
      enrollmentData.expires_at = new Date(expiryDate).toISOString();
    }

    return {
      endpoint: `courses/${courseId}/enrollments`,
      enrollmentData,
    };
  }

  /**
   * Map the raw enrollment response data to our typed LearnWorldsEnrollment shape.
   */
  private buildEnrollmentDetails(enrollment: LWEnrollmentResponse['data'] | undefined, userId: string, courseId: string, price: number): LearnWorldsEnrollment {
    return {
      id: enrollment?.id || '',
      userId: enrollment?.user_id || userId,
      courseId: enrollment?.course_id || courseId,
      enrolledAt: enrollment?.enrolled_at || enrollment?.created_at || new Date().toISOString(),
      startsAt: enrollment?.starts_at,
      expiresAt: enrollment?.expires_at,
      status: enrollment?.status || 'active',
      price: enrollment?.price ?? price,
      progress: {
        percentage: enrollment?.progress_percentage || 0,
        completedUnits: enrollment?.completed_units || 0,
        totalUnits: enrollment?.total_units || 0,
        lastAccessedAt: enrollment?.last_accessed_at,
      },
      certificateEligible: enrollment?.certificate_eligible || false,
      certificateIssuedAt: enrollment?.certificate_issued_at,
    };
  }

  /**
   * Try to fetch the course title for the summary. Falls back to a default.
   */
  private async fetchCourseTitle(courseId: string, contextUser: UserInfo): Promise<string> {
    try {
      const courseResponse = await this.makeLearnWorldsRequest<LWCourseResponse>(`courses/${courseId}`, 'GET', null, contextUser);
      if (courseResponse.success !== false && courseResponse.data) {
        return courseResponse.data.title || 'Unknown Course';
      }
    } catch (error) {
      console.warn(`Failed to fetch course title for ${courseId}:`, error instanceof Error ? error.message : error);
    }
    return 'Unknown Course';
  }

  /**
   * Try to fetch the user display name for the summary. Falls back to a default.
   */
  private async fetchUserName(userId: string, contextUser: UserInfo): Promise<string> {
    try {
      const userResponse = await this.makeLearnWorldsRequest<LWUserLookupResponse>(`users/${userId}`, 'GET', null, contextUser);
      if (userResponse.success !== false && userResponse.data) {
        return userResponse.data.email || userResponse.data.username || 'Unknown User';
      }
    } catch (error) {
      console.warn(`Failed to fetch user name for ${userId}:`, error instanceof Error ? error.message : error);
    }
    return 'Unknown User';
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
        Value: null,
      },
      {
        Name: 'CourseID',
        Type: 'Input',
        Value: null,
      },
      {
        Name: 'ProductType',
        Type: 'Input',
        Value: 'course',
      },
      {
        Name: 'Price',
        Type: 'Input',
        Value: 0,
      },
      {
        Name: 'Justification',
        Type: 'Input',
        Value: 'API Enrollment',
      },
      {
        Name: 'NotifyUser',
        Type: 'Input',
        Value: true,
      },
      {
        Name: 'StartDate',
        Type: 'Input',
        Value: null,
      },
      {
        Name: 'ExpiryDate',
        Type: 'Input',
        Value: null,
      },
      {
        Name: 'EnrollmentDetails',
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
    return 'Enrolls a user in a LearnWorlds course or bundle with optional pricing and notification settings';
  }
}
