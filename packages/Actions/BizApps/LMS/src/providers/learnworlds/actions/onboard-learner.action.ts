import { RegisterClass } from '@memberjunction/global';
import { LearnWorldsBaseAction } from '../learnworlds-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';
import { UserInfo } from '@memberjunction/core';
import { OnboardLearnerParams, OnboardLearnerResult, OnboardLearnerEnrollmentResult } from '../interfaces';
import { CreateUserAction } from './create-user.action';
import { EnrollUserAction } from './enroll-user.action';
import { SSOLoginAction } from './sso-login.action';

/**
 * Action that orchestrates full learner onboarding:
 * create user, enroll in courses/bundles, and generate SSO URL.
 */
@RegisterClass(BaseAction, 'OnboardLearnerAction')
export class OnboardLearnerAction extends LearnWorldsBaseAction {
  /**
   * Orchestrates the full onboarding flow for a new or existing learner:
   * 1. Find or create user
   * 2. Enroll in courses and bundles
   * 3. Generate SSO login URL
   */
  public async OnboardLearner(params: OnboardLearnerParams, contextUser: UserInfo): Promise<OnboardLearnerResult> {
    this.SetCompanyContext(params.CompanyID);

    // Step 1: Find or create the user
    const { userId, isNewUser, loginUrlFallback } = await this.resolveUser(params, contextUser);

    // Step 2: Enroll in courses and bundles
    const { enrollments, errors } = await this.enrollInProducts(params, userId, contextUser);

    // Step 3: Generate SSO login URL
    const loginURL = await this.generateLoginUrl(params, loginUrlFallback, contextUser);

    const hasEnrollmentErrors = errors.length > 0;
    const allEnrollmentsFailed = enrollments.length > 0 && enrollments.every((e) => !e.success);

    return {
      Success: !allEnrollmentsFailed,
      LoginURL: loginURL,
      LearnWorldsUserId: userId,
      IsNewUser: isNewUser,
      Enrollments: enrollments,
      Errors: hasEnrollmentErrors ? errors : [],
    };
  }

  /**
   * Finds an existing user by email or creates a new one.
   * Returns the user ID, whether they are new, and a fallback login URL from creation.
   */
  private async resolveUser(params: OnboardLearnerParams, contextUser: UserInfo): Promise<{ userId: string; isNewUser: boolean; loginUrlFallback?: string }> {
    const existingUser = await this.FindUserByEmail(params.Email, contextUser);

    if (existingUser) {
      return { userId: existingUser.id, isNewUser: false };
    }

    return this.createNewUser(params, contextUser);
  }

  /**
   * Creates a new user via the CreateUserAction typed public method.
   * Returns the user's ID and login URL.
   */
  private async createNewUser(params: OnboardLearnerParams, contextUser: UserInfo): Promise<{ userId: string; isNewUser: boolean; loginUrlFallback?: string }> {
    const createAction = new CreateUserAction();

    const createResult = await createAction.CreateUser(
      {
        CompanyID: params.CompanyID,
        Email: params.Email,
        FirstName: params.FirstName,
        LastName: params.LastName,
        Role: params.Role || 'student',
        Tags: params.Tags,
        CustomFields: params.CustomFields,
        SendWelcomeEmail: params.SendWelcomeEmail ?? false,
      },
      contextUser,
    );

    if (!createResult.UserDetails.id) {
      throw new Error('User creation succeeded but no user ID was returned');
    }

    return {
      userId: createResult.UserDetails.id,
      isNewUser: true,
      loginUrlFallback: createResult.UserDetails.loginUrl,
    };
  }

  /**
   * Enrolls the user in all specified courses and bundles in parallel,
   * collecting results and errors.
   */
  private async enrollInProducts(
    params: OnboardLearnerParams,
    userId: string,
    contextUser: UserInfo,
  ): Promise<{ enrollments: OnboardLearnerEnrollmentResult[]; errors: string[] }> {
    const courseIDs = params.CourseIDs || [];
    const bundleIDs = params.BundleIDs || [];

    // Fire all enrollment requests in parallel
    const coursePromises = courseIDs.map((courseId) => this.enrollInSingleProduct(params.CompanyID, userId, courseId, 'course', contextUser));
    const bundlePromises = bundleIDs.map((bundleId) => this.enrollInSingleProduct(params.CompanyID, userId, bundleId, 'bundle', contextUser));

    const enrollments = await Promise.all([...coursePromises, ...bundlePromises]);

    const errors = enrollments.filter((e) => e.error).map((e) => e.error!);

    return { enrollments, errors };
  }

  /**
   * Enrolls a user in a single course or bundle, catching errors for partial success.
   */
  private async enrollInSingleProduct(
    companyId: string,
    userId: string,
    productId: string,
    productType: 'course' | 'bundle',
    contextUser: UserInfo,
  ): Promise<OnboardLearnerEnrollmentResult> {
    try {
      const enrollAction = new EnrollUserAction();

      const enrollResult = await enrollAction.EnrollUser(
        {
          CompanyID: companyId,
          UserID: userId,
          CourseID: productId,
          ProductType: productType,
          Price: 0,
          Justification: 'Onboarding enrollment',
          NotifyUser: false,
        },
        contextUser,
      );

      return {
        productId,
        productType,
        success: true,
        enrollmentId: enrollResult.EnrollmentDetails.id,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        productId,
        productType,
        success: false,
        error: `Enrollment failed for ${productType} ${productId}: ${errorMessage}`,
      };
    }
  }

  /**
   * Generates an SSO login URL, falling back to the user creation login URL on failure.
   */
  private async generateLoginUrl(params: OnboardLearnerParams, loginUrlFallback: string | undefined, contextUser: UserInfo): Promise<string | undefined> {
    try {
      const ssoAction = new SSOLoginAction();
      ssoAction.SetCompanyContext(params.CompanyID);

      const ssoResult = await ssoAction.GenerateSSOUrl(
        {
          CompanyID: params.CompanyID,
          Email: params.Email,
          RedirectTo: params.RedirectTo,
        },
        contextUser,
      );

      return ssoResult.LoginURL;
    } catch {
      // SSO generation failed; use fallback from user creation if available
      return loginUrlFallback;
    }
  }

  /**
   * Framework entry point that delegates to the typed public method
   */
  protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    const { Params, ContextUser } = params;
    this.params = Params;

    try {
      const onboardParams: OnboardLearnerParams = {
        CompanyID: this.getRequiredStringParam(Params, 'CompanyID'),
        Email: this.getRequiredStringParam(Params, 'Email'),
        FirstName: this.getOptionalStringParam(Params, 'FirstName'),
        LastName: this.getOptionalStringParam(Params, 'LastName'),
        Role: this.getOptionalStringParam(Params, 'Role'),
        Tags: this.getOptionalStringArrayParam(Params, 'Tags'),
        CustomFields: this.getParamValue(Params, 'CustomFields') as Record<string, unknown> | undefined,
        CourseIDs: this.getOptionalStringArrayParam(Params, 'CourseIDs'),
        BundleIDs: this.getOptionalStringArrayParam(Params, 'BundleIDs'),
        RedirectTo: this.getOptionalStringParam(Params, 'RedirectTo'),
        SendWelcomeEmail: this.getOptionalBooleanParam(Params, 'SendWelcomeEmail', false),
      };

      if (!onboardParams.Email) {
        return this.buildErrorResult('VALIDATION_ERROR', 'Email is required', Params);
      }

      const result = await this.OnboardLearner(onboardParams, ContextUser);

      this.setOutputParam(Params, 'LoginURL', result.LoginURL);
      this.setOutputParam(Params, 'LearnWorldsUserId', result.LearnWorldsUserId);
      this.setOutputParam(Params, 'IsNewUser', result.IsNewUser);
      this.setOutputParam(Params, 'Enrollments', result.Enrollments);
      this.setOutputParam(Params, 'Errors', result.Errors);

      const successCount = result.Enrollments.filter((e) => e.success).length;
      const totalCount = result.Enrollments.length;
      const userStatus = result.IsNewUser ? 'new user created' : 'existing user found';

      if (result.Success) {
        return this.buildSuccessResult(`Onboarding complete (${userStatus}): ${successCount}/${totalCount} enrollment(s) succeeded`, Params);
      }

      return this.buildErrorResult(
        'PARTIAL_FAILURE',
        `Onboarding partially failed (${userStatus}): ${successCount}/${totalCount} enrollment(s) succeeded. Errors: ${result.Errors.join('; ')}`,
        Params,
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      return this.buildErrorResult('ERROR', `Error during onboarding: ${errorMessage}`, Params);
    }
  }

  /**
   * Define the parameters this action expects
   */
  public get Params(): ActionParam[] {
    const baseParams = this.getCommonLMSParams();
    const specificParams: ActionParam[] = [
      { Name: 'Email', Type: 'Input', Value: null },
      { Name: 'FirstName', Type: 'Input', Value: null },
      { Name: 'LastName', Type: 'Input', Value: null },
      { Name: 'Role', Type: 'Input', Value: 'student' },
      { Name: 'Tags', Type: 'Input', Value: null },
      { Name: 'CustomFields', Type: 'Input', Value: null },
      { Name: 'CourseIDs', Type: 'Input', Value: null },
      { Name: 'BundleIDs', Type: 'Input', Value: null },
      { Name: 'RedirectTo', Type: 'Input', Value: null },
      { Name: 'SendWelcomeEmail', Type: 'Input', Value: false },
      { Name: 'LoginURL', Type: 'Output', Value: null },
      { Name: 'LearnWorldsUserId', Type: 'Output', Value: null },
      { Name: 'IsNewUser', Type: 'Output', Value: null },
      { Name: 'Enrollments', Type: 'Output', Value: null },
      { Name: 'Errors', Type: 'Output', Value: null },
    ];
    return [...baseParams, ...specificParams];
  }

  /**
   * Metadata about this action
   */
  public get Description(): string {
    return 'Orchestrates full learner onboarding: create user, enroll in courses/bundles, and generate SSO URL';
  }
}
