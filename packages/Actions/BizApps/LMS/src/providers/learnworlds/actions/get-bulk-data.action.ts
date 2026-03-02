import { RegisterClass } from '@memberjunction/global';
import { LearnWorldsBaseAction } from '../learnworlds-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';
import { UserInfo } from '@memberjunction/core';
import {
  BulkDataParams,
  LearnWorldsSyncPayload,
  SyncError,
  LearnWorldsUser,
  LearnWorldsCourse,
  LearnWorldsBundle,
  LearnWorldsEnrollment,
  LearnWorldsCertificate,
  UserLearningProgress,
} from '../interfaces';
import { FormattedQuizResult } from '../interfaces/quiz.types';
import { GetLearnWorldsUsersAction } from './get-users.action';
import { GetLearnWorldsCoursesAction } from './get-courses.action';
import { GetBundlesAction } from './get-bundles.action';
import { GetUserEnrollmentsAction } from './get-user-enrollments.action';
import { GetLearnWorldsUserProgressAction } from './get-user-progress.action';
import { GetCertificatesAction } from './get-certificates.action';
import { GetQuizResultsAction } from './get-quiz-results.action';

/**
 * Orchestrates bulk data retrieval from all LearnWorlds retrieval actions
 * into a single LearnWorldsSyncPayload for downstream consumers.
 */
@RegisterClass(BaseAction, 'GetLearnWorldsBulkDataAction')
export class GetLearnWorldsBulkDataAction extends LearnWorldsBaseAction {
  /**
   * Retrieves bulk data from LearnWorlds, orchestrating multiple retrieval actions.
   * Each data type is optional and controlled via Include* boolean params.
   * Partial failures are collected into errors without aborting the whole operation.
   */
  public async GetBulkData(params: BulkDataParams, contextUser: UserInfo): Promise<LearnWorldsSyncPayload> {
    this.SetCompanyContext(params.CompanyID);

    const errors: SyncError[] = [];
    let totalApiCalls = 0;
    const includeAll = this.shouldIncludeAll(params);
    const maxResults = params.MaxResultsPerEntity ?? 100;

    // Fetch users first (enrollments and progress depend on user IDs)
    let users: LearnWorldsUser[] | undefined;
    if (includeAll || params.IncludeUsers || params.IncludeEnrollments || params.IncludeProgress) {
      const result = await this.fetchUsers(params.CompanyID, maxResults, contextUser, errors);
      users = result.data;
      totalApiCalls += result.apiCalls;
    }

    // Fetch remaining data types in parallel
    const [coursesResult, bundlesResult, enrollmentsResult, progressResult, certificatesResult, quizResultsResult] = await Promise.all([
      this.shouldFetch(includeAll, params.IncludeCourses) ? this.fetchCourses(params.CompanyID, maxResults, contextUser, errors) : Promise.resolve(undefined),
      this.shouldFetch(includeAll, params.IncludeBundles) ? this.fetchBundles(params.CompanyID, maxResults, contextUser, errors) : Promise.resolve(undefined),
      this.shouldFetch(includeAll, params.IncludeEnrollments) ? this.fetchEnrollmentsForUsers(params.CompanyID, users || [], maxResults, contextUser, errors) : Promise.resolve(undefined),
      this.shouldFetch(includeAll, params.IncludeProgress) ? this.fetchProgressForUsers(params.CompanyID, users || [], contextUser, errors) : Promise.resolve(undefined),
      this.shouldFetch(includeAll, params.IncludeCertificates) ? this.fetchCertificates(params.CompanyID, maxResults, contextUser, errors) : Promise.resolve(undefined),
      this.shouldFetch(includeAll, params.IncludeQuizResults) ? this.fetchQuizResults(params.CompanyID, maxResults, contextUser, errors) : Promise.resolve(undefined),
    ]);

    if (coursesResult) totalApiCalls += coursesResult.apiCalls;
    if (bundlesResult) totalApiCalls += bundlesResult.apiCalls;
    if (enrollmentsResult) totalApiCalls += enrollmentsResult.apiCalls;
    if (progressResult) totalApiCalls += progressResult.apiCalls;
    if (certificatesResult) totalApiCalls += certificatesResult.apiCalls;
    if (quizResultsResult) totalApiCalls += quizResultsResult.apiCalls;

    // Only include user data in output if explicitly requested (not just fetched for enrollments)
    const includeUsersInOutput = includeAll || params.IncludeUsers === true;

    return {
      users: includeUsersInOutput ? users : undefined,
      courses: coursesResult?.data,
      bundles: bundlesResult?.data,
      enrollments: enrollmentsResult?.data,
      progress: progressResult?.data,
      certificates: certificatesResult?.data,
      quizResults: quizResultsResult?.data,
      syncedAt: new Date().toISOString(),
      companyId: params.CompanyID,
      totalApiCalls,
      errors,
    };
  }

  /**
   * If no Include* flags are explicitly set, include everything by default.
   */
  private shouldIncludeAll(params: BulkDataParams): boolean {
    return (
      params.IncludeUsers === undefined &&
      params.IncludeCourses === undefined &&
      params.IncludeBundles === undefined &&
      params.IncludeEnrollments === undefined &&
      params.IncludeProgress === undefined &&
      params.IncludeCertificates === undefined &&
      params.IncludeQuizResults === undefined
    );
  }

  /**
   * Helper to determine if a data type should be fetched.
   */
  private shouldFetch(includeAll: boolean, flag: boolean | undefined): boolean {
    return includeAll || flag === true;
  }

  /**
   * Fetch users, collecting errors on failure.
   */
  private async fetchUsers(
    companyId: string,
    maxResults: number,
    contextUser: UserInfo,
    errors: SyncError[],
  ): Promise<{ data: LearnWorldsUser[]; apiCalls: number }> {
    const action = new GetLearnWorldsUsersAction();
    try {
      const result = await action.GetUsers({ CompanyID: companyId, MaxResults: maxResults }, contextUser);
      return { data: result.Users, apiCalls: action.ApiCallCount };
    } catch (error) {
      this.collectError(errors, 'user', error);
      return { data: [], apiCalls: action.ApiCallCount || 1 };
    }
  }

  /**
   * Fetch courses, collecting errors on failure.
   */
  private async fetchCourses(
    companyId: string,
    maxResults: number,
    contextUser: UserInfo,
    errors: SyncError[],
  ): Promise<{ data: LearnWorldsCourse[]; apiCalls: number }> {
    const action = new GetLearnWorldsCoursesAction();
    try {
      const result = await action.GetCourses({ CompanyID: companyId, MaxResults: maxResults }, contextUser);
      return { data: result.Courses, apiCalls: action.ApiCallCount };
    } catch (error) {
      this.collectError(errors, 'course', error);
      return { data: [], apiCalls: action.ApiCallCount || 1 };
    }
  }

  /**
   * Fetch bundles, collecting errors on failure.
   */
  private async fetchBundles(
    companyId: string,
    maxResults: number,
    contextUser: UserInfo,
    errors: SyncError[],
  ): Promise<{ data: LearnWorldsBundle[]; apiCalls: number }> {
    const action = new GetBundlesAction();
    try {
      const result = await action.GetBundles({ CompanyID: companyId, MaxResults: maxResults }, contextUser);
      return { data: result.Bundles, apiCalls: action.ApiCallCount };
    } catch (error) {
      this.collectError(errors, 'bundle', error);
      return { data: [], apiCalls: action.ApiCallCount || 1 };
    }
  }

  /**
   * Fetch enrollments for all provided users with controlled concurrency.
   * Processes users in batches of CONCURRENCY_LIMIT to avoid overwhelming the API.
   */
  private async fetchEnrollmentsForUsers(
    companyId: string,
    users: LearnWorldsUser[],
    maxResults: number,
    contextUser: UserInfo,
    errors: SyncError[],
  ): Promise<{ data: LearnWorldsEnrollment[]; apiCalls: number }> {
    if (users.length === 0) {
      return { data: [], apiCalls: 0 };
    }

    const allEnrollments: LearnWorldsEnrollment[] = [];
    let apiCalls = 0;

    const results = await this.processInBatches(users, async (user) => {
      const action = new GetUserEnrollmentsAction();
      try {
        const result = await action.GetUserEnrollments(
          { CompanyID: companyId, UserID: user.id, MaxResults: maxResults },
          contextUser,
        );
        apiCalls += action.ApiCallCount;
        return { enrollments: result.Enrollments, userId: user.id, error: null };
      } catch (error) {
        apiCalls += action.ApiCallCount || 1;
        this.collectError(errors, 'enrollment', error, user.id);
        return { enrollments: [], userId: user.id, error };
      }
    });

    for (const result of results) {
      for (const enrollment of result.enrollments) {
        allEnrollments.push({
          id: enrollment.id,
          userId: result.userId,
          courseId: enrollment.courseId,
          enrolledAt: enrollment.enrolledAt || '',
          startsAt: enrollment.startsAt,
          expiresAt: enrollment.expiresAt,
          status: enrollment.status,
          price: 0,
          progress: {
            percentage: enrollment.progress.percentage,
            completedUnits: enrollment.progress.completedUnits,
            totalUnits: enrollment.progress.totalUnits,
            lastAccessedAt: enrollment.progress.lastAccessedAt,
          },
          certificateEligible: enrollment.certificateEligible,
          certificateIssuedAt: enrollment.certificateIssuedAt,
        });
      }
    }

    return { data: allEnrollments, apiCalls };
  }

  /**
   * Fetch learning progress for all provided users with controlled concurrency.
   * Processes users in batches of CONCURRENCY_LIMIT to avoid overwhelming the API.
   */
  private async fetchProgressForUsers(
    companyId: string,
    users: LearnWorldsUser[],
    contextUser: UserInfo,
    errors: SyncError[],
  ): Promise<{ data: UserLearningProgress[]; apiCalls: number }> {
    if (users.length === 0) {
      return { data: [], apiCalls: 0 };
    }

    const allProgress: UserLearningProgress[] = [];
    let apiCalls = 0;

    const results = await this.processInBatches(users, async (user) => {
      const action = new GetLearnWorldsUserProgressAction();
      try {
        const result = await action.GetUserProgress(
          { CompanyID: companyId, UserID: user.id },
          contextUser,
        );
        apiCalls += action.ApiCallCount;
        return { progress: result.UserProgress, error: null };
      } catch (error) {
        apiCalls += action.ApiCallCount || 1;
        this.collectError(errors, 'progress', error, user.id);
        return { progress: null, error };
      }
    });

    for (const result of results) {
      if (result.progress) {
        allProgress.push(result.progress);
      }
    }

    return { data: allProgress, apiCalls };
  }

  /**
   * Fetch certificates, collecting errors on failure.
   */
  private async fetchCertificates(
    companyId: string,
    maxResults: number,
    contextUser: UserInfo,
    errors: SyncError[],
  ): Promise<{ data: LearnWorldsCertificate[]; apiCalls: number }> {
    const action = new GetCertificatesAction();
    try {
      const result = await action.GetCertificates(
        { CompanyID: companyId, MaxResults: maxResults, IncludeDownloadLinks: false },
        contextUser,
      );

      // Map FormattedCertificate to LearnWorldsCertificate
      const certificates: LearnWorldsCertificate[] = result.Certificates.map((cert) => ({
        id: cert.id,
        userId: cert.userId,
        courseId: cert.courseId,
        certificateNumber: cert.certificateNumber,
        issuedAt: cert.issuedAt || '',
        expiresAt: cert.expiresAt,
        status: cert.status,
        grade: cert.grade,
        score: cert.score,
        completionPercentage: cert.completionPercentage,
      }));

      return { data: certificates, apiCalls: action.ApiCallCount };
    } catch (error) {
      this.collectError(errors, 'certificate', error);
      return { data: [], apiCalls: action.ApiCallCount || 1 };
    }
  }

  /**
   * Fetch quiz results, collecting errors on failure.
   */
  private async fetchQuizResults(
    companyId: string,
    maxResults: number,
    contextUser: UserInfo,
    errors: SyncError[],
  ): Promise<{ data: FormattedQuizResult[]; apiCalls: number }> {
    const action = new GetQuizResultsAction();
    try {
      const result = await action.GetQuizResults(
        { CompanyID: companyId, MaxResults: maxResults, IncludeQuestions: false, IncludeAnswers: false },
        contextUser,
      );
      return { data: result.QuizResults, apiCalls: action.ApiCallCount };
    } catch (error) {
      this.collectError(errors, 'quizResult', error);
      return { data: [], apiCalls: action.ApiCallCount || 1 };
    }
  }

  /**
   * Adds a SyncError to the errors collection from a caught exception.
   */
  private collectError(
    errors: SyncError[],
    entity: SyncError['entity'],
    error: unknown,
    entityId: string = '',
  ): void {
    const message = error instanceof Error ? error.message : String(error);
    errors.push({
      entity,
      entityId,
      operation: 'read',
      message,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Framework entry point that delegates to the typed public method
   */
  protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    const { Params, ContextUser } = params;
    this.params = Params;

    try {
      const bulkParams = this.extractBulkDataParams(Params);
      const result = await this.GetBulkData(bulkParams, ContextUser);

      this.setOutputParam(Params, 'SyncPayload', result);
      this.setOutputParam(Params, 'TotalApiCalls', result.totalApiCalls);
      this.setOutputParam(Params, 'Errors', result.errors);

      const dataCounts = this.buildDataCountsSummary(result);

      if (result.errors.length > 0) {
        return this.buildErrorResult(
          'PARTIAL_FAILURE',
          `Bulk data retrieval partially succeeded. ${dataCounts}. ${result.errors.length} error(s) occurred.`,
          Params,
        );
      }

      return this.buildSuccessResult(`Bulk data retrieval complete. ${dataCounts}.`, Params);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      return this.buildErrorResult('ERROR', `Error during bulk data retrieval: ${errorMessage}`, Params);
    }
  }

  /**
   * Extract typed params from the generic ActionParam array
   */
  private extractBulkDataParams(params: ActionParam[]): BulkDataParams {
    return {
      CompanyID: this.getRequiredStringParam(params, 'CompanyID'),
      IncludeUsers: this.getOptionalBooleanParam(params, 'IncludeUsers', undefined),
      IncludeCourses: this.getOptionalBooleanParam(params, 'IncludeCourses', undefined),
      IncludeBundles: this.getOptionalBooleanParam(params, 'IncludeBundles', undefined),
      IncludeEnrollments: this.getOptionalBooleanParam(params, 'IncludeEnrollments', undefined),
      IncludeProgress: this.getOptionalBooleanParam(params, 'IncludeProgress', undefined),
      IncludeCertificates: this.getOptionalBooleanParam(params, 'IncludeCertificates', undefined),
      IncludeQuizResults: this.getOptionalBooleanParam(params, 'IncludeQuizResults', undefined),
      MaxResultsPerEntity: this.getOptionalNumberParam(params, 'MaxResultsPerEntity', undefined),
    };
  }

  /**
   * Builds a human-readable summary of data counts in the payload.
   */
  private buildDataCountsSummary(payload: LearnWorldsSyncPayload): string {
    const parts: string[] = [];
    if (payload.users) parts.push(`${payload.users.length} user(s)`);
    if (payload.courses) parts.push(`${payload.courses.length} course(s)`);
    if (payload.bundles) parts.push(`${payload.bundles.length} bundle(s)`);
    if (payload.enrollments) parts.push(`${payload.enrollments.length} enrollment(s)`);
    if (payload.progress) parts.push(`${payload.progress.length} progress record(s)`);
    if (payload.certificates) parts.push(`${payload.certificates.length} certificate(s)`);
    if (payload.quizResults) parts.push(`${payload.quizResults.length} quiz result(s)`);
    return parts.length > 0 ? `Retrieved: ${parts.join(', ')}` : 'No data retrieved';
  }

  /**
   * Define the parameters this action expects
   */
  public get Params(): ActionParam[] {
    const baseParams = this.getCommonLMSParams();
    const specificParams: ActionParam[] = [
      { Name: 'IncludeUsers', Type: 'Input', Value: null },
      { Name: 'IncludeCourses', Type: 'Input', Value: null },
      { Name: 'IncludeBundles', Type: 'Input', Value: null },
      { Name: 'IncludeEnrollments', Type: 'Input', Value: null },
      { Name: 'IncludeProgress', Type: 'Input', Value: null },
      { Name: 'IncludeCertificates', Type: 'Input', Value: null },
      { Name: 'IncludeQuizResults', Type: 'Input', Value: null },
      { Name: 'MaxResultsPerEntity', Type: 'Input', Value: 100 },
      { Name: 'SyncPayload', Type: 'Output', Value: null },
      { Name: 'TotalApiCalls', Type: 'Output', Value: null },
      { Name: 'Errors', Type: 'Output', Value: null },
    ];
    return [...baseParams, ...specificParams];
  }

  /**
   * Metadata about this action
   */
  public get Description(): string {
    return 'Orchestrates bulk data retrieval from LearnWorlds, fetching users, courses, bundles, enrollments, progress, certificates, and quiz results into a single sync payload';
  }
}
