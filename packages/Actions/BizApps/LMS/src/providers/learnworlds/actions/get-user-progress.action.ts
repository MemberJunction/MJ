import { RegisterClass } from '@memberjunction/global';
import { LearnWorldsBaseAction } from '../learnworlds-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';
import { UserInfo } from '@memberjunction/core';
import {
  GetUserProgressParams,
  GetUserProgressResult,
  CourseProgress,
  UnitProgress,
  LessonProgress,
  UserLearningProgress,
  LWApiProgressData,
} from '../interfaces';

/**
 * Raw API shape for a user info response (subset needed here)
 */
interface LWApiUserInfo {
  email?: string;
}

/**
 * Raw API shape for progress data coming back from LearnWorlds
 */
interface LWApiCourseProgressResponse {
  course_id?: string;
  course?: { id?: string; title?: string };
  course_title?: string;
  enrollment_id?: string;
  id?: string;
  enrolled_at?: string | number;
  created?: string | number;
  last_accessed_at?: string | number;
  progress?: LWApiProgressData;
  completed_lessons?: number;
  total_lessons?: number;
  average_session_time?: number;
  estimated_time_to_complete?: number;
  total_time_spent?: number;
  progress_percentage?: number;
  quiz_score_average?: number;
  assignments_completed?: number;
  assignments_total?: number;
  current_grade?: number;
  grade?: number;
  completed?: boolean;
  completed_at?: string | number;
  expired?: boolean;
  expires_at?: string | number;
  started?: boolean;
  certificate_earned?: boolean;
  certificate_url?: string;
  percentage?: number;
  completed_units?: number;
  total_units?: number;
  time_spent?: number;
}

/**
 * Raw API shape for a unit
 */
interface LWApiUnitData {
  id?: string;
  unit_id?: string;
  title?: string;
  name?: string;
  type?: string;
  order?: number;
  position?: number;
  progress_percentage?: number;
  completed_lessons?: number;
  total_lessons?: number;
  time_spent?: number;
  completed?: boolean;
  started?: boolean;
  started_at?: string | number;
  completed_at?: string | number;
  lessons?: LWApiLessonData[];
}

/**
 * Raw API shape for a lesson
 */
interface LWApiLessonData {
  id?: string;
  lesson_id?: string;
  title?: string;
  name?: string;
  type?: string;
  order?: number;
  position?: number;
  completed?: boolean;
  progress_percentage?: number;
  time_spent?: number;
  started_at?: string | number;
  completed_at?: string | number;
  last_accessed_at?: string | number;
  video_watch_time?: number;
  video_total_time?: number;
  quiz_score?: number;
  quiz_max_score?: number;
  quiz_attempts?: number;
  assignment_submitted?: boolean;
  assignment_grade?: number;
}

/**
 * Raw API shape for enrollment list items
 */
interface LWApiEnrollmentItem {
  course_id?: string;
  course?: { id?: string };
}

type LessonType = 'video' | 'text' | 'quiz' | 'assignment' | 'scorm' | 'interactive';

/**
 * Action to retrieve detailed progress information for a LearnWorlds user
 */
@RegisterClass(BaseAction, 'GetLearnWorldsUserProgressAction')
export class GetLearnWorldsUserProgressAction extends LearnWorldsBaseAction {
  /**
   * Description of the action
   */
  public get Description(): string {
    return 'Retrieves comprehensive learning progress for a user in LearnWorlds, including course completion, time spent, and detailed unit/lesson progress';
  }

  /**
   * Typed public method for direct (non-framework) callers.
   * Sets company context, fetches progress, and returns a strongly-typed result.
   * Throws on error.
   */
  public async GetUserProgress(params: GetUserProgressParams, contextUser: UserInfo): Promise<GetUserProgressResult> {
    this.SetCompanyContext(params.CompanyID);

    const { UserID: userId, CourseID: courseId, IncludeUnitDetails: includeUnitDetails = false, IncludeLessonDetails: includeLessonDetails = false } = params;

    if (!userId) {
      throw new Error('UserID parameter is required');
    }

    this.validatePathSegment(userId, 'UserID');
    if (courseId) {
      this.validatePathSegment(courseId, 'CourseID');
    }

    let userProgress: UserLearningProgress;

    if (courseId) {
      const courseProgress = await this.getCourseProgress(userId, courseId, includeUnitDetails, includeLessonDetails, contextUser);

      userProgress = {
        userId,
        userEmail: '',
        totalCourses: 1,
        coursesCompleted: courseProgress.status === 'completed' ? 1 : 0,
        coursesInProgress: courseProgress.status === 'in_progress' ? 1 : 0,
        coursesNotStarted: courseProgress.status === 'not_started' ? 1 : 0,
        overallProgressPercentage: courseProgress.progressPercentage,
        totalTimeSpent: courseProgress.totalTimeSpent,
        totalCertificatesEarned: courseProgress.certificateEarned ? 1 : 0,
        courses: [courseProgress],
      };
    } else {
      userProgress = await this.getAllCoursesProgress(userId, includeUnitDetails, includeLessonDetails, contextUser);
    }

    // Try to get user email
    try {
      const userInfo = await this.makeLearnWorldsRequest<LWApiUserInfo>(`users/${userId}`, 'GET', undefined, contextUser);
      userProgress.userEmail = userInfo.email || '';
    } catch {
      // Ignore if we can't get user info
    }

    this.calculateLearningAnalytics(userProgress);

    const summary = this.createProgressSummary(userProgress);

    return {
      UserProgress: userProgress,
      Summary: summary,
    };
  }

  /**
   * Framework entry-point – thin wrapper around the typed public method.
   */
  protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    const { Params, ContextUser } = params;
    this.params = Params;

    try {
      const typedParams = this.extractGetUserProgressParams(Params);
      const result = await this.GetUserProgress(typedParams, ContextUser);

      this.setOutputParam(Params, 'UserProgress', result.UserProgress);
      this.setOutputParam(Params, 'Summary', result.Summary);

      const courseId = typedParams.CourseID;
      const message = courseId
        ? `Successfully retrieved progress for course ${courseId}`
        : `Successfully retrieved progress for ${result.UserProgress.totalCourses} courses`;

      return this.buildSuccessResult(message, Params);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error occurred';
      return this.buildErrorResult('ERROR', msg, Params);
    }
  }

  /**
   * Extract typed params from framework ActionParam[]
   */
  private extractGetUserProgressParams(params: ActionParam[]): GetUserProgressParams {
    return {
      CompanyID: this.getRequiredStringParam(params, 'CompanyID'),
      UserID: this.getRequiredStringParam(params, 'UserID'),
      CourseID: this.getOptionalStringParam(params, 'CourseID'),
      IncludeUnitDetails: this.getOptionalBooleanParam(params, 'IncludeUnitDetails', false),
      IncludeLessonDetails: this.getOptionalBooleanParam(params, 'IncludeLessonDetails', false),
    };
  }

  /**
   * Get progress for a specific course
   */
  private async getCourseProgress(
    userId: string,
    courseId: string,
    includeUnits: boolean,
    includeLessons: boolean,
    contextUser: UserInfo,
  ): Promise<CourseProgress> {
    const progressResponse = await this.makeLearnWorldsRequest<LWApiCourseProgressResponse>(
      `users/${userId}/courses/${courseId}/progress`,
      'GET',
      undefined,
      contextUser,
    );

    const progress = this.mapCourseProgress(progressResponse);

    if (includeUnits) {
      try {
        const unitsResponse = await this.makeLearnWorldsRequest<{ data: LWApiUnitData[] }>(
          `users/${userId}/courses/${courseId}/units`,
          'GET',
          undefined,
          contextUser,
        );

        if (unitsResponse.data) {
          progress.unitProgress = await Promise.all(unitsResponse.data.map((unit) => this.mapUnitProgress(unit, includeLessons)));
        }
      } catch {
        // Units endpoint might not be available
      }
    }

    return progress;
  }

  /**
   * Get progress for all user courses
   */
  private async getAllCoursesProgress(userId: string, includeUnits: boolean, includeLessons: boolean, contextUser: UserInfo): Promise<UserLearningProgress> {
    const enrollmentsResponse = await this.makeLearnWorldsRequest<{ data: LWApiEnrollmentItem[] }>(
      `users/${userId}/enrollments`,
      'GET',
      undefined,
      contextUser,
    );

    const courseProgressResults = await this.processInBatches(enrollmentsResponse.data, (enrollment) =>
      this.getCourseProgress(userId, enrollment.course_id || enrollment.course?.id || '', includeUnits, includeLessons, contextUser).catch(() => null),
    );
    const validCourses = courseProgressResults.filter((p): p is CourseProgress => p !== null);

    return this.aggregateCourseProgress(userId, validCourses);
  }

  /**
   * Aggregate individual course progress into overall user learning progress
   */
  private aggregateCourseProgress(userId: string, validCourses: CourseProgress[]): UserLearningProgress {
    const completed = validCourses.filter((c) => c.status === 'completed').length;
    const inProgress = validCourses.filter((c) => c.status === 'in_progress').length;
    const notStarted = validCourses.filter((c) => c.status === 'not_started').length;
    const totalTime = validCourses.reduce((sum, c) => sum + c.totalTimeSpent, 0);
    const totalCerts = validCourses.filter((c) => c.certificateEarned).length;

    let overallProgress = 0;
    if (validCourses.length > 0) {
      const totalProgress = validCourses.reduce((sum, c) => sum + c.progressPercentage, 0);
      overallProgress = Math.round(totalProgress / validCourses.length);
    }

    const coursesWithQuizzes = validCourses.filter((c) => c.quizScoreAverage !== undefined);
    const avgQuizScore =
      coursesWithQuizzes.length > 0 ? coursesWithQuizzes.reduce((sum, c) => sum + (c.quizScoreAverage || 0), 0) / coursesWithQuizzes.length : undefined;

    return {
      userId,
      userEmail: '',
      totalCourses: validCourses.length,
      coursesCompleted: completed,
      coursesInProgress: inProgress,
      coursesNotStarted: notStarted,
      overallProgressPercentage: overallProgress,
      totalTimeSpent: totalTime,
      totalCertificatesEarned: totalCerts,
      averageQuizScore: avgQuizScore,
      courses: validCourses,
    };
  }

  /**
   * Map course progress data from API response
   */
  private mapCourseProgress(data: LWApiCourseProgressResponse): CourseProgress {
    const progressData: LWApiProgressData = {
      percentage: data.progress?.percentage ?? data.percentage,
      completed_units: data.progress?.completed_units ?? data.completed_units,
      total_units: data.progress?.total_units ?? data.total_units,
      time_spent: data.progress?.time_spent ?? data.time_spent,
    };
    const progress = this.calculateProgress(progressData);
    const status = this.determineCourseStatus(data);

    return {
      courseId: data.course_id || data.course?.id || '',
      courseTitle: data.course_title || data.course?.title || 'Unknown Course',
      enrollmentId: data.enrollment_id || data.id || '',
      enrolledAt: this.parseLearnWorldsDate(data.enrolled_at || data.created || ''),
      lastAccessedAt: data.last_accessed_at ? this.parseLearnWorldsDate(data.last_accessed_at) : undefined,

      progressPercentage: progress.percentage,
      completedUnits: progress.completedUnits,
      totalUnits: progress.totalUnits,
      completedLessons: data.completed_lessons || 0,
      totalLessons: data.total_lessons || 0,

      totalTimeSpent: progress.timeSpent,
      averageSessionTime: data.average_session_time || 0,
      estimatedTimeToComplete: this.calculateEstimatedTimeToComplete(data),

      quizScoreAverage: data.quiz_score_average,
      assignmentsCompleted: data.assignments_completed,
      assignmentsTotal: data.assignments_total,
      currentGrade: data.current_grade || data.grade,

      status,
      completedAt: data.completed_at ? this.parseLearnWorldsDate(data.completed_at) : undefined,
      expiresAt: data.expires_at ? this.parseLearnWorldsDate(data.expires_at) : undefined,
      certificateEarned: data.certificate_earned || false,
      certificateUrl: data.certificate_url,
    };
  }

  /**
   * Map unit progress data from API response
   */
  private async mapUnitProgress(unitData: LWApiUnitData, includeLessons: boolean): Promise<UnitProgress> {
    const unitProgress: UnitProgress = {
      unitId: unitData.id || unitData.unit_id || '',
      unitTitle: unitData.title || unitData.name || '',
      unitType: (unitData.type as UnitProgress['unitType']) || 'section',
      order: unitData.order || unitData.position || 0,

      progressPercentage: unitData.progress_percentage || 0,
      completedLessons: unitData.completed_lessons || 0,
      totalLessons: unitData.total_lessons || 0,
      timeSpent: unitData.time_spent || 0,

      status: this.determineUnitStatus(unitData),
      startedAt: unitData.started_at ? this.parseLearnWorldsDate(unitData.started_at) : undefined,
      completedAt: unitData.completed_at ? this.parseLearnWorldsDate(unitData.completed_at) : undefined,
    };

    if (includeLessons && unitData.lessons) {
      unitProgress.lessons = unitData.lessons.map((lesson) => this.mapLessonProgress(lesson));
    }

    return unitProgress;
  }

  /**
   * Map lesson progress data from API response
   */
  private mapLessonProgress(lessonData: LWApiLessonData): LessonProgress {
    return {
      lessonId: lessonData.id || lessonData.lesson_id || '',
      lessonTitle: lessonData.title || lessonData.name || '',
      lessonType: this.mapLessonType(lessonData.type || ''),
      order: lessonData.order || lessonData.position || 0,

      completed: lessonData.completed || false,
      progressPercentage: lessonData.progress_percentage || (lessonData.completed ? 100 : 0),
      timeSpent: lessonData.time_spent || 0,

      startedAt: lessonData.started_at ? this.parseLearnWorldsDate(lessonData.started_at) : undefined,
      completedAt: lessonData.completed_at ? this.parseLearnWorldsDate(lessonData.completed_at) : undefined,
      lastAccessedAt: lessonData.last_accessed_at ? this.parseLearnWorldsDate(lessonData.last_accessed_at) : undefined,

      videoWatchTime: lessonData.video_watch_time,
      videoTotalTime: lessonData.video_total_time,
      quizScore: lessonData.quiz_score,
      quizMaxScore: lessonData.quiz_max_score,
      quizAttempts: lessonData.quiz_attempts,
      assignmentSubmitted: lessonData.assignment_submitted,
      assignmentGrade: lessonData.assignment_grade,
    };
  }

  /**
   * Determine course status from data
   */
  private determineCourseStatus(data: LWApiCourseProgressResponse): 'not_started' | 'in_progress' | 'completed' | 'expired' {
    if (data.expired || (data.expires_at && new Date(data.expires_at as string | number) < new Date())) {
      return 'expired';
    }
    if (data.completed || data.progress_percentage === 100) {
      return 'completed';
    }
    if ((data.progress_percentage != null && data.progress_percentage > 0) || data.started) {
      return 'in_progress';
    }
    return 'not_started';
  }

  /**
   * Determine unit status
   */
  private determineUnitStatus(data: LWApiUnitData): 'not_started' | 'in_progress' | 'completed' {
    if (data.completed || data.progress_percentage === 100) {
      return 'completed';
    }
    if ((data.progress_percentage != null && data.progress_percentage > 0) || data.started) {
      return 'in_progress';
    }
    return 'not_started';
  }

  /**
   * Map lesson type string to typed union
   */
  private mapLessonType(type: string): LessonType {
    const typeMap: Record<string, LessonType> = {
      video: 'video',
      text: 'text',
      quiz: 'quiz',
      exam: 'quiz',
      assignment: 'assignment',
      scorm: 'scorm',
      interactive: 'interactive',
      multimedia: 'interactive',
    };

    return typeMap[type?.toLowerCase()] || 'text';
  }

  /**
   * Calculate estimated time to complete
   */
  private calculateEstimatedTimeToComplete(data: LWApiCourseProgressResponse): number | undefined {
    if (data.estimated_time_to_complete) {
      return data.estimated_time_to_complete;
    }

    if (data.total_time_spent && data.progress_percentage != null && data.progress_percentage > 0 && data.progress_percentage < 100) {
      const timePerPercent = data.total_time_spent / data.progress_percentage;
      const remainingPercent = 100 - data.progress_percentage;
      return Math.round(timePerPercent * remainingPercent);
    }

    return undefined;
  }

  /**
   * Calculate learning analytics
   */
  private calculateLearningAnalytics(progress: UserLearningProgress): void {
    if (progress.courses.length === 0) return;

    const lastDates = progress.courses.map((c) => c.lastAccessedAt).filter((d): d is Date => d !== undefined);

    if (lastDates.length > 0) {
      progress.lastLearningDate = new Date(Math.max(...lastDates.map((d) => d.getTime())));

      const daysSinceLastActivity = Math.floor((new Date().getTime() - progress.lastLearningDate.getTime()) / (1000 * 60 * 60 * 24));
      progress.learningStreak = daysSinceLastActivity <= 1 ? 1 : 0;
    }
  }

  /**
   * Create progress summary
   */
  private createProgressSummary(progress: UserLearningProgress): Record<string, unknown> {
    const activeCourses = progress.courses.filter((c) => c.status === 'in_progress');
    const recentActivity = progress.courses
      .filter((c) => c.lastAccessedAt)
      .sort((a, b) => (b.lastAccessedAt?.getTime() || 0) - (a.lastAccessedAt?.getTime() || 0))
      .slice(0, 5);

    return {
      overview: {
        totalCourses: progress.totalCourses,
        completedCourses: progress.coursesCompleted,
        inProgressCourses: progress.coursesInProgress,
        notStartedCourses: progress.coursesNotStarted,
        overallProgress: `${progress.overallProgressPercentage}%`,
        certificatesEarned: progress.totalCertificatesEarned,
        totalLearningTime: this.formatDuration(progress.totalTimeSpent),
      },
      performance: {
        averageQuizScore: progress.averageQuizScore ? `${Math.round(progress.averageQuizScore)}%` : 'N/A',
        averageCourseProgress: `${progress.overallProgressPercentage}%`,
        completionRate: progress.totalCourses > 0 ? `${Math.round((progress.coursesCompleted / progress.totalCourses) * 100)}%` : '0%',
      },
      currentFocus: activeCourses.map((c) => ({
        courseTitle: c.courseTitle,
        progress: `${c.progressPercentage}%`,
        timeSpent: this.formatDuration(c.totalTimeSpent),
        estimatedTimeToComplete: c.estimatedTimeToComplete ? this.formatDuration(c.estimatedTimeToComplete) : 'N/A',
      })),
      recentActivity: recentActivity.map((c) => ({
        courseTitle: c.courseTitle,
        lastAccessed: c.lastAccessedAt,
        progress: `${c.progressPercentage}%`,
      })),
      achievements: {
        totalCertificates: progress.totalCertificatesEarned,
        coursesWithCertificates: progress.courses
          .filter((c) => c.certificateEarned)
          .map((c) => ({
            courseTitle: c.courseTitle,
            completedAt: c.completedAt,
          })),
      },
    };
  }

  /**
   * Define the parameters for this action
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
        Name: 'IncludeUnitDetails',
        Type: 'Input',
        Value: false,
      },
      {
        Name: 'IncludeLessonDetails',
        Type: 'Input',
        Value: false,
      },
    ];

    return [...baseParams, ...specificParams];
  }
}
