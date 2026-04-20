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
import { UpdateUserProgressAction } from '../providers/learnworlds/actions/update-user-progress.action';
import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';

/**
 * Helper to create a mock UserInfo for test context
 */
function createMockContextUser(): UserInfo {
  return { ID: 'test-user-id', Name: 'Test User', Email: 'test@example.com' } as unknown as UserInfo;
}

/**
 * Creates a mock enrollment progress object as returned by LW API
 */
function createMockEnrollment(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    progress_percentage: 40,
    completed_units: 4,
    total_units: 10,
    total_time_spent: 3600,
    last_accessed_at: '2024-06-20T12:00:00Z',
    completed: false,
    completed_at: undefined,
    ...overrides,
  };
}

describe('UpdateUserProgressAction', () => {
  let action: UpdateUserProgressAction;
  let contextUser: UserInfo;

  beforeEach(() => {
    action = new UpdateUserProgressAction();
    contextUser = createMockContextUser();
  });

  describe('UpdateProgress() typed method', () => {
    it('should update lesson progress successfully', async () => {
      const currentEnrollment = createMockEnrollment();
      const lessonUpdateResult = { success: true };
      const updatedEnrollment = createMockEnrollment({
        progress_percentage: 50,
        completed_units: 5,
        total_time_spent: 4200,
        last_accessed_at: '2024-06-21T10:00:00Z',
      });

      vi.spyOn(action as never, 'makeLearnWorldsRequest')
        .mockResolvedValueOnce(currentEnrollment as never) // fetchCurrentEnrollment
        .mockResolvedValueOnce(lessonUpdateResult as never) // updateLessonProgress
        .mockResolvedValueOnce(updatedEnrollment as never); // fetchUpdatedEnrollment

      const result = await action.UpdateProgress(
        {
          CompanyID: 'comp-1',
          UserID: 'user-1',
          CourseID: 'course-1',
          LessonID: 'lesson-1',
          ProgressPercentage: 100,
          Completed: true,
          TimeSpent: 600,
        },
        contextUser,
      );

      expect(result.ProgressDetails.userId).toBe('user-1');
      expect(result.ProgressDetails.courseId).toBe('course-1');
      expect(result.ProgressDetails.lessonId).toBe('lesson-1');
      expect(result.ProgressDetails.updateType).toBe('lesson');
      expect(result.ProgressDetails.previousProgress.percentage).toBe(40);
      expect(result.ProgressDetails.updatedProgress.percentage).toBe(50);
      expect(result.ProgressDetails.updatedProgress.completedUnits).toBe(5);
    });

    it('should update course progress successfully', async () => {
      const currentEnrollment = createMockEnrollment();
      const courseUpdateResult = { success: true };
      const updatedEnrollment = createMockEnrollment({
        progress_percentage: 75,
        completed_units: 7,
        total_time_spent: 5400,
      });

      vi.spyOn(action as never, 'makeLearnWorldsRequest')
        .mockResolvedValueOnce(currentEnrollment as never) // fetchCurrentEnrollment
        .mockResolvedValueOnce(courseUpdateResult as never) // updateCourseProgress
        .mockResolvedValueOnce(updatedEnrollment as never); // fetchUpdatedEnrollment

      const result = await action.UpdateProgress(
        {
          CompanyID: 'comp-1',
          UserID: 'user-1',
          CourseID: 'course-1',
          ProgressPercentage: 75,
          TimeSpent: 1800,
        },
        contextUser,
      );

      expect(result.ProgressDetails.updateType).toBe('course');
      expect(result.ProgressDetails.updatedProgress.percentage).toBe(75);
      expect(result.Summary.progressIncreased).toBe(true);
      expect(result.Summary.previousPercentage).toBe(40);
      expect(result.Summary.newPercentage).toBe(75);
    });

    it('should throw error when ProgressPercentage is out of range (negative)', async () => {
      await expect(
        action.UpdateProgress(
          { CompanyID: 'comp-1', UserID: 'user-1', CourseID: 'course-1', ProgressPercentage: -5 },
          contextUser,
        ),
      ).rejects.toThrow('ProgressPercentage must be between 0 and 100');
    });

    it('should throw error when ProgressPercentage is out of range (over 100)', async () => {
      await expect(
        action.UpdateProgress(
          { CompanyID: 'comp-1', UserID: 'user-1', CourseID: 'course-1', ProgressPercentage: 150 },
          contextUser,
        ),
      ).rejects.toThrow('ProgressPercentage must be between 0 and 100');
    });

    it('should throw error when UserID is missing', async () => {
      await expect(
        action.UpdateProgress({ CompanyID: 'comp-1', UserID: '', CourseID: 'course-1' }, contextUser),
      ).rejects.toThrow('UserID is required');
    });

    it('should throw error when CourseID is missing', async () => {
      await expect(
        action.UpdateProgress({ CompanyID: 'comp-1', UserID: 'user-1', CourseID: '' }, contextUser),
      ).rejects.toThrow('CourseID is required');
    });

    it('should throw user not enrolled error including original error message', async () => {
      vi.spyOn(action as never, 'makeLearnWorldsRequest').mockRejectedValueOnce(new Error('404 Not Found'));

      await expect(
        action.UpdateProgress(
          { CompanyID: 'comp-1', UserID: 'user-1', CourseID: 'course-1' },
          contextUser,
        ),
      ).rejects.toThrow('User is not enrolled in this course: 404 Not Found');
    });

    it('should use fallback enrollment when updated enrollment fetch fails', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const currentEnrollment = createMockEnrollment({ progress_percentage: 30 });
      const courseUpdateResult = { success: true };

      vi.spyOn(action as never, 'makeLearnWorldsRequest')
        .mockResolvedValueOnce(currentEnrollment as never) // fetchCurrentEnrollment
        .mockResolvedValueOnce(courseUpdateResult as never) // updateCourseProgress
        .mockRejectedValueOnce(new Error('Fetch updated enrollment failed')); // fetchUpdatedEnrollment fails

      const result = await action.UpdateProgress(
        { CompanyID: 'comp-1', UserID: 'user-1', CourseID: 'course-1', ProgressPercentage: 50 },
        contextUser,
      );

      // Should fall back to the original enrollment data
      expect(result.ProgressDetails.updatedProgress.percentage).toBe(30);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to get updated enrollment details'),
        expect.anything(),
      );

      warnSpy.mockRestore();
    });

    it('should compute progressIncreased and isCompleted in summary correctly', async () => {
      const currentEnrollment = createMockEnrollment({ progress_percentage: 90 });
      const updatedEnrollment = createMockEnrollment({
        progress_percentage: 100,
        completed: true,
        completed_at: '2024-06-21T15:00:00Z',
      });

      vi.spyOn(action as never, 'makeLearnWorldsRequest')
        .mockResolvedValueOnce(currentEnrollment as never) // fetchCurrentEnrollment
        .mockResolvedValueOnce({ success: true } as never) // updateCourseProgress
        .mockResolvedValueOnce(updatedEnrollment as never); // fetchUpdatedEnrollment

      const result = await action.UpdateProgress(
        { CompanyID: 'comp-1', UserID: 'user-1', CourseID: 'course-1', ProgressPercentage: 100, Completed: true },
        contextUser,
      );

      expect(result.Summary.progressIncreased).toBe(true);
      expect(result.Summary.previousPercentage).toBe(90);
      expect(result.Summary.newPercentage).toBe(100);
      expect(result.Summary.isCompleted).toBe(true);
      expect(result.ProgressDetails.updatedProgress.completed).toBe(true);
      expect(result.ProgressDetails.updatedProgress.completedAt).toBe('2024-06-21T15:00:00Z');
    });
  });

  describe('InternalRunAction()', () => {
    it('should return success when UpdateProgress succeeds', async () => {
      vi.spyOn(action, 'UpdateProgress').mockResolvedValue({
        ProgressDetails: {
          userId: 'user-1',
          courseId: 'course-1',
          lessonId: 'lesson-1',
          previousProgress: { percentage: 40, completedUnits: 4, totalTimeSpent: 3600 },
          updatedProgress: {
            percentage: 60,
            completedUnits: 6,
            totalUnits: 10,
            totalTimeSpent: 5400,
            totalTimeSpentText: '1h 30m 0s',
            lastAccessedAt: '2024-06-21T10:00:00Z',
            completed: false,
          },
          updateType: 'lesson',
          updateResult: { lessonProgress: { success: true } },
        },
        Summary: {
          userId: 'user-1',
          courseId: 'course-1',
          lessonId: 'lesson-1',
          progressIncreased: true,
          previousPercentage: 40,
          newPercentage: 60,
          timeAdded: 600,
          totalTimeSpent: 5400,
          isCompleted: false,
          updateType: 'lesson',
        },
      });

      const runParams: RunActionParams = {
        Params: [
          { Name: 'CompanyID', Type: 'Input', Value: 'comp-1' },
          { Name: 'UserID', Type: 'Input', Value: 'user-1' },
          { Name: 'CourseID', Type: 'Input', Value: 'course-1' },
          { Name: 'LessonID', Type: 'Input', Value: 'lesson-1' },
        ],
        ContextUser: contextUser,
      } as unknown as RunActionParams;

      const result = (await action['InternalRunAction'](runParams)) as ActionResultSimple;

      expect(result.Success).toBe(true);
      expect(result.ResultCode).toBe('SUCCESS');
      expect(result.Message).toContain('Successfully updated lesson progress');
    });

    it('should return error result when UpdateProgress throws', async () => {
      vi.spyOn(action, 'UpdateProgress').mockRejectedValue(new Error('User is not enrolled in this course'));

      const runParams: RunActionParams = {
        Params: [
          { Name: 'CompanyID', Type: 'Input', Value: 'comp-1' },
          { Name: 'UserID', Type: 'Input', Value: 'user-1' },
          { Name: 'CourseID', Type: 'Input', Value: 'course-1' },
        ],
        ContextUser: contextUser,
      } as unknown as RunActionParams;

      const result = (await action['InternalRunAction'](runParams)) as ActionResultSimple;

      expect(result.Success).toBe(false);
      expect(result.ResultCode).toBe('ERROR');
      expect(result.Message).toContain('Error updating progress');
      expect(result.Message).toContain('User is not enrolled in this course');
    });
  });
});
