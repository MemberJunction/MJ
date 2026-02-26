import { RegisterClass } from '@memberjunction/global';
import { LearnWorldsBaseAction } from '../learnworlds-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';
import { UserInfo } from '@memberjunction/core';
import { UpdateUserProgressParams, UpdateUserProgressResult, ProgressDetails, ProgressUpdateSummary, ProgressUpdateResult } from '../interfaces';

// ----------------------------------------------------------------
// File-local interfaces for raw LearnWorlds API shapes
// ----------------------------------------------------------------

/** Shape returned by the enrollment / progress GET endpoints */
interface LWEnrollmentProgress {
  progress_percentage?: number;
  completed_units?: number;
  total_units?: number;
  total_time_spent?: number;
  last_accessed_at?: string;
  completed?: boolean;
  completed_at?: string;
}

/** Request body sent to the lesson-level progress PUT endpoint */
interface LWLessonProgressRequest {
  completed: boolean;
  progress_percentage?: number;
  time_spent?: number;
  score?: number;
  notes?: string;
}

/** Request body sent to the course-level progress PUT endpoint */
interface LWCourseProgressRequest {
  progress_percentage?: number;
  completed?: boolean;
  total_time_spent?: number;
}


/**
 * Action to update a user's course progress in LearnWorlds
 */
@RegisterClass(BaseAction, 'UpdateUserProgressAction')
export class UpdateUserProgressAction extends LearnWorldsBaseAction {
  // ----------------------------------------------------------------
  // Typed public method – can be called directly from code
  // ----------------------------------------------------------------

  /**
   * Update user progress for a course or lesson.
   * Throws on any error.
   */
  public async UpdateProgress(params: UpdateUserProgressParams, contextUser: UserInfo): Promise<UpdateUserProgressResult> {
    this.SetCompanyContext(params.CompanyID);

    const { UserID, CourseID, LessonID, ProgressPercentage, Completed, TimeSpent, Score, Notes } = params;

    // Validate required fields
    if (!UserID) {
      throw new Error('UserID is required');
    }
    if (!CourseID) {
      throw new Error('CourseID is required');
    }

    // Get current enrollment first
    const currentEnrollment = await this.fetchCurrentEnrollment(UserID, CourseID, contextUser);

    const updateResult: ProgressUpdateResult = {};

    // Update lesson progress if lessonId is provided
    if (LessonID) {
      updateResult.lessonProgress = await this.updateLessonProgress(
        UserID,
        CourseID,
        LessonID,
        { Completed, ProgressPercentage, TimeSpent, Score, Notes },
        contextUser,
      );
    }

    // Update overall course progress if progressPercentage is provided at course level
    if (ProgressPercentage !== undefined && !LessonID) {
      updateResult.courseProgress = await this.updateCourseProgress(
        UserID,
        CourseID,
        currentEnrollment,
        { Completed, ProgressPercentage, TimeSpent },
        contextUser,
      );
    }

    // Get updated enrollment details
    const updatedProgress = await this.fetchUpdatedEnrollment(UserID, CourseID, currentEnrollment, contextUser);

    // Build typed result
    const updateType: 'lesson' | 'course' = LessonID ? 'lesson' : 'course';

    const progressDetails = this.buildProgressDetails(UserID, CourseID, LessonID, currentEnrollment, updatedProgress, updateType, updateResult);

    const summary = this.buildProgressSummary(UserID, CourseID, LessonID, currentEnrollment, updatedProgress, TimeSpent, updateType);

    return { ProgressDetails: progressDetails, Summary: summary };
  }

  // ----------------------------------------------------------------
  // Framework wrapper – thin delegation to the public method
  // ----------------------------------------------------------------

  protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    const { Params, ContextUser } = params;
    this.params = Params;

    try {
      const typedParams = this.extractUpdateProgressParams(Params);
      const result = await this.UpdateProgress(typedParams, ContextUser);

      this.setOutputParam(Params, 'ProgressDetails', result.ProgressDetails);
      this.setOutputParam(Params, 'Summary', result.Summary);

      return this.buildSuccessResult(`Successfully updated ${result.ProgressDetails.updateType} progress`, Params);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      return this.buildErrorResult('ERROR', `Error updating progress: ${msg}`, Params);
    }
  }

  // ----------------------------------------------------------------
  // Private helpers
  // ----------------------------------------------------------------

  private extractUpdateProgressParams(params: ActionParam[]): UpdateUserProgressParams {
    return {
      CompanyID: this.getParamValue(params, 'CompanyID') as string,
      UserID: this.getParamValue(params, 'UserID') as string,
      CourseID: this.getParamValue(params, 'CourseID') as string,
      LessonID: this.getParamValue(params, 'LessonID') as string | undefined,
      ProgressPercentage: this.getParamValue(params, 'ProgressPercentage') as number | undefined,
      Completed: this.getParamValue(params, 'Completed') as boolean | undefined,
      TimeSpent: this.getParamValue(params, 'TimeSpent') as number | undefined,
      Score: this.getParamValue(params, 'Score') as number | undefined,
      Notes: this.getParamValue(params, 'Notes') as string | undefined,
    };
  }

  private async fetchCurrentEnrollment(userId: string, courseId: string, contextUser: UserInfo): Promise<LWEnrollmentProgress> {
    try {
      return await this.makeLearnWorldsRequest<LWEnrollmentProgress>(`users/${userId}/enrollments/${courseId}`, 'GET', undefined, contextUser);
    } catch {
      throw new Error('User is not enrolled in this course');
    }
  }

  private async updateLessonProgress(
    userId: string,
    courseId: string,
    lessonId: string,
    data: { Completed?: boolean; ProgressPercentage?: number; TimeSpent?: number; Score?: number; Notes?: string },
    contextUser: UserInfo,
  ): Promise<Record<string, unknown>> {
    const body: LWLessonProgressRequest = {
      completed: data.Completed !== undefined ? data.Completed : false,
      progress_percentage: data.ProgressPercentage,
    };

    if (data.TimeSpent !== undefined) {
      body.time_spent = data.TimeSpent;
    }
    if (data.Score !== undefined) {
      body.score = data.Score;
    }
    if (data.Notes) {
      body.notes = data.Notes;
    }

    return await this.makeLearnWorldsRequest<Record<string, unknown>>(
      `users/${userId}/courses/${courseId}/lessons/${lessonId}/progress`,
      'PUT',
      body,
      contextUser,
    );
  }

  private async updateCourseProgress(
    userId: string,
    courseId: string,
    currentEnrollment: LWEnrollmentProgress,
    data: { Completed?: boolean; ProgressPercentage?: number; TimeSpent?: number },
    contextUser: UserInfo,
  ): Promise<Record<string, unknown>> {
    const body: LWCourseProgressRequest = {
      progress_percentage: data.ProgressPercentage,
    };

    if (data.Completed !== undefined) {
      body.completed = data.Completed;
    }
    if (data.TimeSpent !== undefined) {
      body.total_time_spent = (currentEnrollment.total_time_spent || 0) + data.TimeSpent;
    }

    return await this.makeLearnWorldsRequest<Record<string, unknown>>(
      `users/${userId}/enrollments/${courseId}/progress`,
      'PUT',
      body,
      contextUser,
    );
  }

  private async fetchUpdatedEnrollment(userId: string, courseId: string, fallback: LWEnrollmentProgress, contextUser: UserInfo): Promise<LWEnrollmentProgress> {
    try {
      return await this.makeLearnWorldsRequest<LWEnrollmentProgress>(`users/${userId}/enrollments/${courseId}`, 'GET', undefined, contextUser);
    } catch (error) {
      // If we can't get updated details, use previous enrollment
      console.warn('Failed to get updated enrollment details:', error);
      return fallback;
    }
  }

  private buildProgressDetails(
    userId: string,
    courseId: string,
    lessonId: string | undefined,
    currentEnrollment: LWEnrollmentProgress,
    updatedProgress: LWEnrollmentProgress,
    updateType: 'lesson' | 'course',
    updateResult: ProgressUpdateResult,
  ): ProgressDetails {
    return {
      userId,
      courseId,
      lessonId,
      previousProgress: {
        percentage: currentEnrollment.progress_percentage || 0,
        completedUnits: currentEnrollment.completed_units || 0,
        totalTimeSpent: currentEnrollment.total_time_spent || 0,
      },
      updatedProgress: {
        percentage: updatedProgress.progress_percentage || 0,
        completedUnits: updatedProgress.completed_units || 0,
        totalUnits: updatedProgress.total_units || 0,
        totalTimeSpent: updatedProgress.total_time_spent || 0,
        totalTimeSpentText: this.formatDuration(updatedProgress.total_time_spent || 0),
        lastAccessedAt: updatedProgress.last_accessed_at || new Date().toISOString(),
        completed: updatedProgress.completed || false,
        completedAt: updatedProgress.completed_at,
      },
      updateType,
      updateResult,
    };
  }

  private buildProgressSummary(
    userId: string,
    courseId: string,
    lessonId: string | undefined,
    currentEnrollment: LWEnrollmentProgress,
    updatedProgress: LWEnrollmentProgress,
    timeSpent: number | undefined,
    updateType: 'lesson' | 'course',
  ): ProgressUpdateSummary {
    return {
      userId,
      courseId,
      lessonId,
      progressIncreased: (updatedProgress.progress_percentage || 0) > (currentEnrollment.progress_percentage || 0),
      previousPercentage: currentEnrollment.progress_percentage || 0,
      newPercentage: updatedProgress.progress_percentage || 0,
      timeAdded: timeSpent || 0,
      totalTimeSpent: updatedProgress.total_time_spent || 0,
      isCompleted: updatedProgress.completed || false,
      updateType,
    };
  }

  // ----------------------------------------------------------------
  // Params & Description metadata
  // ----------------------------------------------------------------

  /**
   * Define the parameters this action expects
   */
  public get Params(): ActionParam[] {
    const baseParams = this.getCommonLMSParams();
    const specificParams: ActionParam[] = [
      { Name: 'UserID', Type: 'Input', Value: null },
      { Name: 'CourseID', Type: 'Input', Value: null },
      { Name: 'LessonID', Type: 'Input', Value: null },
      { Name: 'ProgressPercentage', Type: 'Input', Value: null },
      { Name: 'Completed', Type: 'Input', Value: null },
      { Name: 'TimeSpent', Type: 'Input', Value: null },
      { Name: 'Score', Type: 'Input', Value: null },
      { Name: 'Notes', Type: 'Input', Value: null },
      { Name: 'ProgressDetails', Type: 'Output', Value: null },
      { Name: 'Summary', Type: 'Output', Value: null },
    ];
    return [...baseParams, ...specificParams];
  }

  /**
   * Metadata about this action
   */
  public get Description(): string {
    return "Updates a user's progress for a course or specific lesson in LearnWorlds";
  }
}
