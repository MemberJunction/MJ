import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies (same pattern as get-bundles.action.test.ts)
vi.mock('@memberjunction/actions', () => ({
  BaseAction: class BaseAction {
    protected async InternalRunAction(): Promise<unknown> {
      return {};
    }
  },
}));

vi.mock('@memberjunction/global', () => ({
  RegisterClass: () => (target: unknown) => target,
}));

vi.mock('@memberjunction/core', () => ({
  UserInfo: class UserInfo {},
  Metadata: vi.fn(),
  RunView: vi.fn().mockImplementation(() => ({
    RunView: vi.fn().mockResolvedValue({ Success: true, Results: [] }),
  })),
}));

vi.mock('@memberjunction/core-entities', () => ({
  MJCompanyIntegrationEntity: class MJCompanyIntegrationEntity {
    CompanyID: string = '';
    APIKey: string | null = null;
    AccessToken: string | null = null;
    ExternalSystemID: string | null = null;
    CustomAttribute1: string | null = null;
  },
}));

vi.mock('@memberjunction/actions-base', () => ({
  ActionParam: class ActionParam {
    Name: string = '';
    Value: unknown = null;
    Type: string = 'Input';
  },
}));

import { UserInfo } from '@memberjunction/core';
import { GetLearnWorldsUserProgressAction } from '../providers/learnworlds/actions/get-user-progress.action';
import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { GetUserProgressResult, UserLearningProgress } from '../providers/learnworlds/interfaces';

/**
 * Helper to create a mock UserInfo for test context
 */
function createMockContextUser(): UserInfo {
  return { ID: 'test-user-id', Name: 'Test User', Email: 'test@example.com' } as unknown as UserInfo;
}

/**
 * Helper to build a raw LW API course progress response
 */
function createRawCourseProgress(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    course_id: 'course-1',
    course_title: 'Intro to TypeScript',
    enrollment_id: 'enroll-1',
    enrolled_at: '2024-01-15T10:00:00Z',
    last_accessed_at: '2024-06-01T14:30:00Z',
    // percentage is read by mapCourseProgress for progress calculation
    percentage: 65,
    // progress_percentage is read by determineCourseStatus for status logic
    progress_percentage: 65,
    completed_lessons: 13,
    total_lessons: 20,
    completed_units: 3,
    total_units: 5,
    total_time_spent: 7200,
    time_spent: 7200,
    average_session_time: 1800,
    quiz_score_average: 85,
    assignments_completed: 2,
    assignments_total: 3,
    current_grade: 88,
    completed: false,
    expired: false,
    started: true,
    certificate_earned: false,
    ...overrides,
  };
}

/**
 * Helper to build a raw LW API enrollment item
 */
function createRawEnrollment(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    course_id: 'course-1',
    ...overrides,
  };
}

/**
 * Helper to build a raw LW API unit data
 */
function createRawUnit(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'unit-1',
    title: 'Getting Started',
    type: 'section',
    order: 1,
    progress_percentage: 80,
    completed_lessons: 4,
    total_lessons: 5,
    time_spent: 3600,
    completed: false,
    started: true,
    started_at: '2024-01-20T09:00:00Z',
    ...overrides,
  };
}

/**
 * Helper to build a raw LW API lesson data
 */
function createRawLesson(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'lesson-1',
    title: 'Introduction to Variables',
    type: 'video',
    order: 1,
    completed: true,
    progress_percentage: 100,
    time_spent: 600,
    started_at: '2024-01-20T09:00:00Z',
    completed_at: '2024-01-20T09:10:00Z',
    last_accessed_at: '2024-01-20T09:10:00Z',
    video_watch_time: 580,
    video_total_time: 600,
    ...overrides,
  };
}

describe('GetLearnWorldsUserProgressAction', () => {
  let action: GetLearnWorldsUserProgressAction;
  let contextUser: UserInfo;

  beforeEach(() => {
    action = new GetLearnWorldsUserProgressAction();
    contextUser = createMockContextUser();
  });

  describe('GetUserProgress() typed method', () => {
    it('should get single course progress (with courseId)', async () => {
      const rawProgress = createRawCourseProgress();

      vi.spyOn(action as never, 'makeLearnWorldsRequest')
        .mockResolvedValueOnce(rawProgress as never) // course progress
        .mockResolvedValueOnce({ email: 'user@example.com' } as never); // user info

      const result = await action.GetUserProgress(
        { CompanyID: 'comp-1', UserID: 'user-123', CourseID: 'course-1' },
        contextUser,
      );

      expect(result.UserProgress.userId).toBe('user-123');
      expect(result.UserProgress.userEmail).toBe('user@example.com');
      expect(result.UserProgress.totalCourses).toBe(1);
      expect(result.UserProgress.courses).toHaveLength(1);

      const course = result.UserProgress.courses[0];
      expect(course.courseId).toBe('course-1');
      expect(course.courseTitle).toBe('Intro to TypeScript');
      expect(course.progressPercentage).toBe(65);
      expect(course.completedLessons).toBe(13);
      expect(course.totalLessons).toBe(20);
      expect(course.status).toBe('in_progress');
      expect(course.certificateEarned).toBe(false);
      expect(course.quizScoreAverage).toBe(85);
    });

    it('should get all courses progress (no courseId)', async () => {
      const enrollment1 = createRawEnrollment({ course_id: 'course-1' });
      const enrollment2 = createRawEnrollment({ course_id: 'course-2' });

      const progress1 = createRawCourseProgress({ course_id: 'course-1', course_title: 'Course 1', percentage: 100, progress_percentage: 100, completed: true });
      const progress2 = createRawCourseProgress({ course_id: 'course-2', course_title: 'Course 2', percentage: 30, progress_percentage: 30 });

      const makeRequestSpy = vi.spyOn(action as never, 'makeLearnWorldsRequest');
      // getCourseProgress calls for each enrollment
      makeRequestSpy
        .mockResolvedValueOnce(progress1 as never) // course 1 progress
        .mockResolvedValueOnce(progress2 as never) // course 2 progress
        .mockResolvedValueOnce({ email: 'user@example.com' } as never); // user info

      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest')
        .mockResolvedValue([enrollment1, enrollment2] as never);

      const result = await action.GetUserProgress(
        { CompanyID: 'comp-1', UserID: 'user-123' },
        contextUser,
      );

      expect(result.UserProgress.totalCourses).toBe(2);
      expect(result.UserProgress.courses).toHaveLength(2);
      expect(result.UserProgress.coursesCompleted).toBe(1);
      expect(result.UserProgress.coursesInProgress).toBe(1);
    });

    it('should include unit details when IncludeUnitDetails is true', async () => {
      const rawProgress = createRawCourseProgress();
      const rawUnit = createRawUnit();
      const unitsResponse = { data: [rawUnit] };

      vi.spyOn(action as never, 'makeLearnWorldsRequest')
        .mockResolvedValueOnce(rawProgress as never) // course progress
        .mockResolvedValueOnce(unitsResponse as never) // units endpoint
        .mockResolvedValueOnce({ email: 'user@example.com' } as never); // user info

      const result = await action.GetUserProgress(
        { CompanyID: 'comp-1', UserID: 'user-123', CourseID: 'course-1', IncludeUnitDetails: true },
        contextUser,
      );

      const course = result.UserProgress.courses[0];
      expect(course.unitProgress).toBeDefined();
      expect(course.unitProgress).toHaveLength(1);
      expect(course.unitProgress![0].unitId).toBe('unit-1');
      expect(course.unitProgress![0].unitTitle).toBe('Getting Started');
      expect(course.unitProgress![0].progressPercentage).toBe(80);
      expect(course.unitProgress![0].status).toBe('in_progress');
    });

    it('should include lesson details when IncludeLessonDetails is true', async () => {
      const rawLesson = createRawLesson();
      const rawUnit = createRawUnit({ lessons: [rawLesson] });
      const rawProgress = createRawCourseProgress();
      const unitsResponse = { data: [rawUnit] };

      vi.spyOn(action as never, 'makeLearnWorldsRequest')
        .mockResolvedValueOnce(rawProgress as never) // course progress
        .mockResolvedValueOnce(unitsResponse as never) // units endpoint
        .mockResolvedValueOnce({ email: 'user@example.com' } as never); // user info

      const result = await action.GetUserProgress(
        { CompanyID: 'comp-1', UserID: 'user-123', CourseID: 'course-1', IncludeUnitDetails: true, IncludeLessonDetails: true },
        contextUser,
      );

      const unit = result.UserProgress.courses[0].unitProgress![0];
      expect(unit.lessons).toBeDefined();
      expect(unit.lessons).toHaveLength(1);
      expect(unit.lessons![0].lessonId).toBe('lesson-1');
      expect(unit.lessons![0].lessonTitle).toBe('Introduction to Variables');
      expect(unit.lessons![0].lessonType).toBe('video');
      expect(unit.lessons![0].completed).toBe(true);
      expect(unit.lessons![0].videoWatchTime).toBe(580);
      expect(unit.lessons![0].videoTotalTime).toBe(600);
    });

    it('should detect expired course status', async () => {
      const rawProgress = createRawCourseProgress({
        expired: true,
        expires_at: '2024-01-01T00:00:00Z',
        percentage: 50,
        progress_percentage: 50,
      });

      vi.spyOn(action as never, 'makeLearnWorldsRequest')
        .mockResolvedValueOnce(rawProgress as never) // course progress
        .mockResolvedValueOnce({ email: 'user@example.com' } as never); // user info

      const result = await action.GetUserProgress(
        { CompanyID: 'comp-1', UserID: 'user-123', CourseID: 'course-1' },
        contextUser,
      );

      expect(result.UserProgress.courses[0].status).toBe('expired');
    });

    it('should return zero counts for empty enrollments', async () => {
      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest')
        .mockResolvedValue([] as never);

      vi.spyOn(action as never, 'makeLearnWorldsRequest')
        .mockResolvedValueOnce({ email: 'user@example.com' } as never); // user info

      const result = await action.GetUserProgress(
        { CompanyID: 'comp-1', UserID: 'user-123' },
        contextUser,
      );

      expect(result.UserProgress.totalCourses).toBe(0);
      expect(result.UserProgress.coursesCompleted).toBe(0);
      expect(result.UserProgress.coursesInProgress).toBe(0);
      expect(result.UserProgress.coursesNotStarted).toBe(0);
      expect(result.UserProgress.overallProgressPercentage).toBe(0);
      expect(result.UserProgress.totalTimeSpent).toBe(0);
      expect(result.UserProgress.totalCertificatesEarned).toBe(0);
      expect(result.UserProgress.courses).toEqual([]);
    });

    it('should log warning but not fail when user info fetch fails', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const rawProgress = createRawCourseProgress();

      vi.spyOn(action as never, 'makeLearnWorldsRequest')
        .mockResolvedValueOnce(rawProgress as never) // course progress
        .mockRejectedValueOnce(new Error('User not found')); // user info fails

      const result = await action.GetUserProgress(
        { CompanyID: 'comp-1', UserID: 'user-123', CourseID: 'course-1' },
        contextUser,
      );

      expect(result.UserProgress.userEmail).toBe('');
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to fetch user info for userId user-123'),
        expect.stringContaining('User not found'),
      );

      consoleWarnSpy.mockRestore();
    });

    it('should log warning but not fail when units endpoint fails', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const rawProgress = createRawCourseProgress();

      vi.spyOn(action as never, 'makeLearnWorldsRequest')
        .mockResolvedValueOnce(rawProgress as never) // course progress
        .mockRejectedValueOnce(new Error('Units not available')) // units endpoint fails
        .mockResolvedValueOnce({ email: 'user@example.com' } as never); // user info

      const result = await action.GetUserProgress(
        { CompanyID: 'comp-1', UserID: 'user-123', CourseID: 'course-1', IncludeUnitDetails: true },
        contextUser,
      );

      // Should still return progress, just without unit details
      expect(result.UserProgress.courses[0].courseId).toBe('course-1');
      expect(result.UserProgress.courses[0].unitProgress).toBeUndefined();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Units endpoint unavailable for user user-123, course course-1'),
        expect.stringContaining('Units not available'),
      );

      consoleWarnSpy.mockRestore();
    });

    it('should propagate errors from the API', async () => {
      vi.spyOn(action as never, 'makeLearnWorldsRequest')
        .mockRejectedValue(new Error('LearnWorlds API error: 500 Internal Server Error'));

      await expect(
        action.GetUserProgress(
          { CompanyID: 'comp-1', UserID: 'user-123', CourseID: 'course-1' },
          contextUser,
        ),
      ).rejects.toThrow('LearnWorlds API error: 500 Internal Server Error');
    });

    it('should calculate analytics (lastLearningDate, learningStreak)', async () => {
      const now = new Date();
      const recentDate = new Date(now.getTime() - 12 * 60 * 60 * 1000); // 12 hours ago
      const rawProgress = createRawCourseProgress({
        last_accessed_at: recentDate.toISOString(),
        progress_percentage: 75,
        started: true,
      });

      vi.spyOn(action as never, 'makeLearnWorldsRequest')
        .mockResolvedValueOnce(rawProgress as never) // course progress
        .mockResolvedValueOnce({ email: 'user@example.com' } as never); // user info

      const result = await action.GetUserProgress(
        { CompanyID: 'comp-1', UserID: 'user-123', CourseID: 'course-1' },
        contextUser,
      );

      expect(result.UserProgress.lastLearningDate).toBeDefined();
      expect(result.UserProgress.lastLearningDate).toBeInstanceOf(Date);
      // Accessed within the last day, so learningStreak should be 1
      expect(result.UserProgress.learningStreak).toBe(1);
    });

    it('should validate summary structure (overview, performance, achievements sections)', async () => {
      const rawProgress = createRawCourseProgress({
        percentage: 100,
        progress_percentage: 100,
        completed: true,
        completed_at: '2024-05-01T00:00:00Z',
        certificate_earned: true,
        certificate_url: 'https://example.com/cert',
      });

      vi.spyOn(action as never, 'makeLearnWorldsRequest')
        .mockResolvedValueOnce(rawProgress as never) // course progress
        .mockResolvedValueOnce({ email: 'user@example.com' } as never); // user info

      const result = await action.GetUserProgress(
        { CompanyID: 'comp-1', UserID: 'user-123', CourseID: 'course-1' },
        contextUser,
      );

      const summary = result.Summary;

      // overview section
      expect(summary).toHaveProperty('overview');
      const overview = summary['overview'] as Record<string, unknown>;
      expect(overview).toHaveProperty('totalCourses');
      expect(overview).toHaveProperty('completedCourses');
      expect(overview).toHaveProperty('inProgressCourses');
      expect(overview).toHaveProperty('notStartedCourses');
      expect(overview).toHaveProperty('overallProgress');
      expect(overview).toHaveProperty('certificatesEarned');
      expect(overview).toHaveProperty('totalLearningTime');

      // performance section
      expect(summary).toHaveProperty('performance');
      const performance = summary['performance'] as Record<string, unknown>;
      expect(performance).toHaveProperty('averageQuizScore');
      expect(performance).toHaveProperty('averageCourseProgress');
      expect(performance).toHaveProperty('completionRate');

      // achievements section
      expect(summary).toHaveProperty('achievements');
      const achievements = summary['achievements'] as Record<string, unknown>;
      expect(achievements).toHaveProperty('totalCertificates');
      expect(achievements).toHaveProperty('coursesWithCertificates');

      // currentFocus and recentActivity sections
      expect(summary).toHaveProperty('currentFocus');
      expect(summary).toHaveProperty('recentActivity');
    });

    it('should handle learningStreak as 0 when last access was more than a day ago', async () => {
      const oldDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000); // 5 days ago
      const rawProgress = createRawCourseProgress({
        last_accessed_at: oldDate.toISOString(),
      });

      vi.spyOn(action as never, 'makeLearnWorldsRequest')
        .mockResolvedValueOnce(rawProgress as never) // course progress
        .mockResolvedValueOnce({ email: 'user@example.com' } as never); // user info

      const result = await action.GetUserProgress(
        { CompanyID: 'comp-1', UserID: 'user-123', CourseID: 'course-1' },
        contextUser,
      );

      expect(result.UserProgress.learningStreak).toBe(0);
    });

    it('should detect completed course status when progress is 100%', async () => {
      const rawProgress = createRawCourseProgress({
        percentage: 100,
        progress_percentage: 100,
        completed: true,
        completed_at: '2024-03-01T12:00:00Z',
        certificate_earned: true,
      });

      vi.spyOn(action as never, 'makeLearnWorldsRequest')
        .mockResolvedValueOnce(rawProgress as never) // course progress
        .mockResolvedValueOnce({ email: 'user@example.com' } as never); // user info

      const result = await action.GetUserProgress(
        { CompanyID: 'comp-1', UserID: 'user-123', CourseID: 'course-1' },
        contextUser,
      );

      const course = result.UserProgress.courses[0];
      expect(course.status).toBe('completed');
      expect(result.UserProgress.coursesCompleted).toBe(1);
      expect(result.UserProgress.totalCertificatesEarned).toBe(1);
    });

    it('should detect not_started course status', async () => {
      const rawProgress = createRawCourseProgress({
        percentage: 0,
        progress_percentage: 0,
        completed: false,
        started: false,
        expired: false,
      });

      vi.spyOn(action as never, 'makeLearnWorldsRequest')
        .mockResolvedValueOnce(rawProgress as never) // course progress
        .mockResolvedValueOnce({ email: 'user@example.com' } as never); // user info

      const result = await action.GetUserProgress(
        { CompanyID: 'comp-1', UserID: 'user-123', CourseID: 'course-1' },
        contextUser,
      );

      expect(result.UserProgress.courses[0].status).toBe('not_started');
      expect(result.UserProgress.coursesNotStarted).toBe(1);
    });
  });

  describe('InternalRunAction()', () => {
    it('should return success when GetUserProgress succeeds', async () => {
      const mockProgress: UserLearningProgress = {
        userId: 'user-123',
        userEmail: 'user@example.com',
        totalCourses: 2,
        coursesCompleted: 1,
        coursesInProgress: 1,
        coursesNotStarted: 0,
        overallProgressPercentage: 75,
        totalTimeSpent: 14400,
        totalCertificatesEarned: 1,
        courses: [],
      };

      vi.spyOn(action, 'GetUserProgress').mockResolvedValue({
        UserProgress: mockProgress,
        Summary: { overview: {}, performance: {}, achievements: {} },
      });

      const runParams: RunActionParams = {
        Params: [
          { Name: 'CompanyID', Type: 'Input', Value: 'comp-1' },
          { Name: 'UserID', Type: 'Input', Value: 'user-123' },
          { Name: 'CourseID', Type: 'Input', Value: undefined },
          { Name: 'IncludeUnitDetails', Type: 'Input', Value: false },
          { Name: 'IncludeLessonDetails', Type: 'Input', Value: false },
        ],
        ContextUser: contextUser,
      } as unknown as RunActionParams;

      const result = (await action['InternalRunAction'](runParams)) as ActionResultSimple;

      expect(result.Success).toBe(true);
      expect(result.ResultCode).toBe('SUCCESS');
      expect(result.Message).toContain('Successfully retrieved progress for 2 courses');
    });

    it('should return success with course-specific message when CourseID is provided', async () => {
      const mockProgress: UserLearningProgress = {
        userId: 'user-123',
        userEmail: 'user@example.com',
        totalCourses: 1,
        coursesCompleted: 0,
        coursesInProgress: 1,
        coursesNotStarted: 0,
        overallProgressPercentage: 50,
        totalTimeSpent: 3600,
        totalCertificatesEarned: 0,
        courses: [],
      };

      vi.spyOn(action, 'GetUserProgress').mockResolvedValue({
        UserProgress: mockProgress,
        Summary: { overview: {}, performance: {}, achievements: {} },
      });

      const runParams: RunActionParams = {
        Params: [
          { Name: 'CompanyID', Type: 'Input', Value: 'comp-1' },
          { Name: 'UserID', Type: 'Input', Value: 'user-123' },
          { Name: 'CourseID', Type: 'Input', Value: 'course-42' },
          { Name: 'IncludeUnitDetails', Type: 'Input', Value: false },
          { Name: 'IncludeLessonDetails', Type: 'Input', Value: false },
        ],
        ContextUser: contextUser,
      } as unknown as RunActionParams;

      const result = (await action['InternalRunAction'](runParams)) as ActionResultSimple;

      expect(result.Success).toBe(true);
      expect(result.ResultCode).toBe('SUCCESS');
      expect(result.Message).toContain('Successfully retrieved progress for course course-42');
    });

    it('should return error result when GetUserProgress throws', async () => {
      vi.spyOn(action, 'GetUserProgress').mockRejectedValue(new Error('API connection failed'));

      const runParams: RunActionParams = {
        Params: [
          { Name: 'CompanyID', Type: 'Input', Value: 'comp-1' },
          { Name: 'UserID', Type: 'Input', Value: 'user-123' },
        ],
        ContextUser: contextUser,
      } as unknown as RunActionParams;

      const result = (await action['InternalRunAction'](runParams)) as ActionResultSimple;

      expect(result.Success).toBe(false);
      expect(result.ResultCode).toBe('ERROR');
      expect(result.Message).toContain('API connection failed');
    });
  });
});
