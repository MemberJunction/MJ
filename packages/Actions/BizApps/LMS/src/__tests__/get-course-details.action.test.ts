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
import { GetLearnWorldsCourseDetailsAction } from '../providers/learnworlds/actions/get-course-details.action';
import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';

/**
 * Helper to create a mock UserInfo for test context
 */
function createMockContextUser(): UserInfo {
  return { ID: 'test-user-id', Name: 'Test User', Email: 'test@example.com' } as unknown as UserInfo;
}

/**
 * Creates a raw LW course API response
 */
function createRawCourseData(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'course-1',
    title: 'Intro to TypeScript',
    slug: 'intro-typescript',
    description: 'A comprehensive course on TypeScript',
    short_description: 'Learn TS basics',
    access: 'published',
    original_price: 99.99,
    final_price: 79.99,
    currency: 'USD',
    level: 'beginner',
    language: 'en',
    duration: 3600,
    total_enrollments: 250,
    average_rating: 4.5,
    total_ratings: 80,
    tags: ['typescript', 'programming'],
    categories: ['Development'],
    courseImage: 'https://example.com/img.jpg',
    certificate_enabled: true,
    created: 1700000000,
    modified: 1700100000,
    ...overrides,
  };
}

/**
 * Creates a raw LW sections/modules API response
 */
function createRawSectionsResponse(): Record<string, unknown> {
  return {
    data: [
      {
        id: 'mod-1',
        title: 'Getting Started',
        description: 'Introduction module',
        order: 1,
        duration: 1200,
        total_lessons: 3,
        lessons: [
          { id: 'les-1', title: 'Welcome', type: 'video', duration: 300, order: 1, is_free: true, has_video: true, has_quiz: false, has_assignment: false },
          { id: 'les-2', title: 'Setup', type: 'text', duration: 600, order: 2, is_free: false, has_video: false, has_quiz: false, has_assignment: false },
          { id: 'les-3', title: 'Quiz 1', type: 'quiz', duration: 300, order: 3, is_free: false, has_video: false, has_quiz: true, has_assignment: false },
        ],
      },
      {
        id: 'mod-2',
        title: 'Advanced Topics',
        description: 'Deep dive',
        order: 2,
        duration: 1800,
        total_lessons: 2,
        lessons: [
          { id: 'les-4', title: 'Generics', type: 'video', duration: 900, order: 1, is_free: false, has_video: true, has_quiz: false, has_assignment: false },
          { id: 'les-5', title: 'Assignment 1', type: 'assignment', duration: 900, order: 2, is_free: false, has_video: false, has_quiz: false, has_assignment: true },
        ],
      },
    ],
  };
}

/**
 * Creates a raw LW instructors API response
 */
function createRawInstructorsResponse(): Record<string, unknown> {
  return {
    data: [
      {
        id: 'instr-1',
        name: 'Jane Doe',
        email: 'jane@example.com',
        bio: 'Expert in TypeScript',
        title: 'Senior Instructor',
        image_url: 'https://example.com/jane.jpg',
        total_courses: 5,
        total_students: 1000,
        average_rating: 4.8,
      },
    ],
  };
}

/**
 * Creates a raw LW stats API response
 */
function createRawStatsResponse(): Record<string, unknown> {
  return {
    success: true,
    data: {
      total_enrollments: 300,
      active_students: 120,
      completion_rate: 55,
      average_progress: 70,
      average_time_to_complete: 7200,
      total_revenue: 15000,
    },
  };
}

describe('GetLearnWorldsCourseDetailsAction', () => {
  let action: GetLearnWorldsCourseDetailsAction;
  let contextUser: UserInfo;

  beforeEach(() => {
    action = new GetLearnWorldsCourseDetailsAction();
    contextUser = createMockContextUser();
  });

  describe('GetCourseDetails() typed method', () => {
    it('should return course details with modules, instructors, and stats', async () => {
      const courseData = createRawCourseData();
      const sectionsResponse = createRawSectionsResponse();
      const instructorsResponse = createRawInstructorsResponse();
      const statsResponse = createRawStatsResponse();

      vi.spyOn(action as never, 'makeLearnWorldsRequest')
        .mockResolvedValueOnce(courseData as never) // course details
        .mockResolvedValueOnce(sectionsResponse as never) // sections/modules
        .mockResolvedValueOnce(instructorsResponse as never) // instructors
        .mockResolvedValueOnce(statsResponse as never); // stats

      const result = await action.GetCourseDetails(
        { CompanyID: 'comp-1', CourseID: 'course-1', IncludeModules: true, IncludeInstructors: true, IncludeStats: true },
        contextUser,
      );

      // Verify base course details
      expect(result.CourseDetails.id).toBe('course-1');
      expect(result.CourseDetails.title).toBe('Intro to TypeScript');
      expect(result.CourseDetails.slug).toBe('intro-typescript');
      expect(result.CourseDetails.price).toBe(79.99);
      expect(result.CourseDetails.currency).toBe('USD');
      expect(result.CourseDetails.level).toBe('beginner');
      expect(result.CourseDetails.certificateEnabled).toBe(true);
      expect(result.CourseDetails.tags).toEqual(['typescript', 'programming']);

      // Verify modules
      expect(result.CourseDetails.modules).toBeDefined();
      expect(result.CourseDetails.modules).toHaveLength(2);
      expect(result.CourseDetails.totalModules).toBe(2);
      expect(result.CourseDetails.totalLessons).toBe(5);

      // Verify instructors
      expect(result.CourseDetails.instructors).toBeDefined();
      expect(result.CourseDetails.instructors).toHaveLength(1);
      expect(result.CourseDetails.instructors![0].name).toBe('Jane Doe');
      expect(result.CourseDetails.instructors![0].totalCourses).toBe(5);

      // Verify stats
      expect(result.CourseDetails.stats).toBeDefined();
      expect(result.CourseDetails.stats!.totalEnrollments).toBe(300);
      expect(result.CourseDetails.stats!.completionRate).toBe(55);
      expect(result.CourseDetails.stats!.totalRevenue).toBe(15000);

      // Verify summary
      expect(result.Summary.courseId).toBe('course-1');
      expect(result.Summary.title).toBe('Intro to TypeScript');
      expect(result.Summary.totalModules).toBe(2);
      expect(result.Summary.totalLessons).toBe(5);
    });

    it('should return course details without modules when IncludeModules is false', async () => {
      const courseData = createRawCourseData();
      const instructorsResponse = createRawInstructorsResponse();
      const statsResponse = createRawStatsResponse();

      vi.spyOn(action as never, 'makeLearnWorldsRequest')
        .mockResolvedValueOnce(courseData as never) // course details
        .mockResolvedValueOnce(instructorsResponse as never) // instructors
        .mockResolvedValueOnce(statsResponse as never); // stats

      const result = await action.GetCourseDetails(
        { CompanyID: 'comp-1', CourseID: 'course-1', IncludeModules: false, IncludeInstructors: true, IncludeStats: true },
        contextUser,
      );

      expect(result.CourseDetails.id).toBe('course-1');
      expect(result.CourseDetails.modules).toBeUndefined();
      expect(result.CourseDetails.instructors).toBeDefined();
      expect(result.CourseDetails.stats).toBeDefined();
    });

    it('should return course details without instructors when IncludeInstructors is false', async () => {
      const courseData = createRawCourseData();
      const sectionsResponse = createRawSectionsResponse();
      const statsResponse = createRawStatsResponse();

      vi.spyOn(action as never, 'makeLearnWorldsRequest')
        .mockResolvedValueOnce(courseData as never) // course details
        .mockResolvedValueOnce(sectionsResponse as never) // sections
        .mockResolvedValueOnce(statsResponse as never); // stats

      const result = await action.GetCourseDetails(
        { CompanyID: 'comp-1', CourseID: 'course-1', IncludeModules: true, IncludeInstructors: false, IncludeStats: true },
        contextUser,
      );

      expect(result.CourseDetails.id).toBe('course-1');
      expect(result.CourseDetails.modules).toBeDefined();
      expect(result.CourseDetails.instructors).toBeUndefined();
      expect(result.CourseDetails.stats).toBeDefined();
    });

    it('should return course details without stats when IncludeStats is false', async () => {
      const courseData = createRawCourseData();
      const sectionsResponse = createRawSectionsResponse();
      const instructorsResponse = createRawInstructorsResponse();

      vi.spyOn(action as never, 'makeLearnWorldsRequest')
        .mockResolvedValueOnce(courseData as never) // course details
        .mockResolvedValueOnce(sectionsResponse as never) // sections
        .mockResolvedValueOnce(instructorsResponse as never); // instructors

      const result = await action.GetCourseDetails(
        { CompanyID: 'comp-1', CourseID: 'course-1', IncludeModules: true, IncludeInstructors: true, IncludeStats: false },
        contextUser,
      );

      expect(result.CourseDetails.id).toBe('course-1');
      expect(result.CourseDetails.modules).toBeDefined();
      expect(result.CourseDetails.instructors).toBeDefined();
      expect(result.CourseDetails.stats).toBeUndefined();
    });

    it('should log warning and continue when sections endpoint fails', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const courseData = createRawCourseData();
      const instructorsResponse = createRawInstructorsResponse();
      const statsResponse = createRawStatsResponse();

      vi.spyOn(action as never, 'makeLearnWorldsRequest')
        .mockResolvedValueOnce(courseData as never) // course details
        .mockRejectedValueOnce(new Error('Sections endpoint not found')) // sections fail
        .mockResolvedValueOnce(instructorsResponse as never) // instructors
        .mockResolvedValueOnce(statsResponse as never); // stats

      const result = await action.GetCourseDetails(
        { CompanyID: 'comp-1', CourseID: 'course-1', IncludeModules: true, IncludeInstructors: true, IncludeStats: true },
        contextUser,
      );

      expect(result.CourseDetails.id).toBe('course-1');
      expect(result.CourseDetails.modules).toBeUndefined();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Sections endpoint unavailable'),
        expect.stringContaining('Sections endpoint not found'),
      );
      // Instructors and stats should still be present
      expect(result.CourseDetails.instructors).toBeDefined();
      expect(result.CourseDetails.stats).toBeDefined();

      warnSpy.mockRestore();
    });

    it('should log warning and continue when instructors endpoint fails', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const courseData = createRawCourseData();
      const sectionsResponse = createRawSectionsResponse();
      const statsResponse = createRawStatsResponse();

      vi.spyOn(action as never, 'makeLearnWorldsRequest')
        .mockResolvedValueOnce(courseData as never) // course details
        .mockResolvedValueOnce(sectionsResponse as never) // sections
        .mockRejectedValueOnce(new Error('Instructors API error')) // instructors fail
        .mockResolvedValueOnce(statsResponse as never); // stats

      const result = await action.GetCourseDetails(
        { CompanyID: 'comp-1', CourseID: 'course-1', IncludeModules: true, IncludeInstructors: true, IncludeStats: true },
        contextUser,
      );

      expect(result.CourseDetails.id).toBe('course-1');
      expect(result.CourseDetails.instructors).toBeUndefined();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Instructors endpoint unavailable'),
        expect.stringContaining('Instructors API error'),
      );
      expect(result.CourseDetails.modules).toBeDefined();
      expect(result.CourseDetails.stats).toBeDefined();

      warnSpy.mockRestore();
    });

    it('should log warning and continue when stats endpoint fails', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const courseData = createRawCourseData();
      const sectionsResponse = createRawSectionsResponse();
      const instructorsResponse = createRawInstructorsResponse();

      vi.spyOn(action as never, 'makeLearnWorldsRequest')
        .mockResolvedValueOnce(courseData as never) // course details
        .mockResolvedValueOnce(sectionsResponse as never) // sections
        .mockResolvedValueOnce(instructorsResponse as never) // instructors
        .mockRejectedValueOnce(new Error('Stats service down')); // stats fail

      const result = await action.GetCourseDetails(
        { CompanyID: 'comp-1', CourseID: 'course-1', IncludeModules: true, IncludeInstructors: true, IncludeStats: true },
        contextUser,
      );

      expect(result.CourseDetails.id).toBe('course-1');
      expect(result.CourseDetails.stats).toBeUndefined();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Stats endpoint unavailable'),
        expect.stringContaining('Stats service down'),
      );
      expect(result.CourseDetails.modules).toBeDefined();
      expect(result.CourseDetails.instructors).toBeDefined();

      warnSpy.mockRestore();
    });

    it('should throw error when CourseID is missing', async () => {
      await expect(
        action.GetCourseDetails({ CompanyID: 'comp-1', CourseID: '' }, contextUser),
      ).rejects.toThrow('CourseID is required');
    });

    it('should correctly format modules and lessons', async () => {
      const courseData = createRawCourseData();
      const sectionsResponse = createRawSectionsResponse();

      vi.spyOn(action as never, 'makeLearnWorldsRequest')
        .mockResolvedValueOnce(courseData as never)
        .mockResolvedValueOnce(sectionsResponse as never);

      const result = await action.GetCourseDetails(
        { CompanyID: 'comp-1', CourseID: 'course-1', IncludeModules: true, IncludeInstructors: false, IncludeStats: false },
        contextUser,
      );

      const modules = result.CourseDetails.modules!;
      expect(modules[0].id).toBe('mod-1');
      expect(modules[0].title).toBe('Getting Started');
      expect(modules[0].order).toBe(1);
      expect(modules[0].totalLessons).toBe(3);
      expect(modules[0].lessons).toHaveLength(3);

      // Check first lesson details
      const firstLesson = modules[0].lessons[0];
      expect(firstLesson.id).toBe('les-1');
      expect(firstLesson.title).toBe('Welcome');
      expect(firstLesson.type).toBe('video');
      expect(firstLesson.isFree).toBe(true);
      expect(firstLesson.hasVideo).toBe(true);
      expect(firstLesson.hasQuiz).toBe(false);

      // Check second module
      expect(modules[1].id).toBe('mod-2');
      expect(modules[1].order).toBe(2);
      expect(modules[1].lessons).toHaveLength(2);
    });

    it('should build correct summary structure', async () => {
      const courseData = createRawCourseData();
      const sectionsResponse = createRawSectionsResponse();
      const instructorsResponse = createRawInstructorsResponse();
      const statsResponse = createRawStatsResponse();

      vi.spyOn(action as never, 'makeLearnWorldsRequest')
        .mockResolvedValueOnce(courseData as never)
        .mockResolvedValueOnce(sectionsResponse as never)
        .mockResolvedValueOnce(instructorsResponse as never)
        .mockResolvedValueOnce(statsResponse as never);

      const result = await action.GetCourseDetails(
        { CompanyID: 'comp-1', CourseID: 'course-1', IncludeModules: true, IncludeInstructors: true, IncludeStats: true },
        contextUser,
      );

      expect(result.Summary).toEqual({
        courseId: 'course-1',
        title: 'Intro to TypeScript',
        status: 'published',
        level: 'beginner',
        duration: expect.any(String),
        totalModules: 2,
        totalLessons: 5,
        totalEnrollments: 250,
        averageRating: 4.5,
        certificateEnabled: true,
        price: 79.99,
        currency: 'USD',
      });
    });
  });

  describe('InternalRunAction()', () => {
    it('should return success when GetCourseDetails succeeds', async () => {
      vi.spyOn(action, 'GetCourseDetails').mockResolvedValue({
        CourseDetails: {
          id: 'course-1',
          title: 'Test Course',
          status: 'published',
          price: 0,
          currency: 'USD',
          level: 'beginner',
          language: 'en',
          totalEnrollments: 10,
          totalRatings: 0,
          tags: [],
          categories: [],
          certificateEnabled: false,
        },
        Summary: {
          courseId: 'course-1',
          title: 'Test Course',
          status: 'published',
          level: 'beginner',
          totalModules: 0,
          totalLessons: 0,
          totalEnrollments: 10,
          averageRating: 0,
          certificateEnabled: false,
          price: 0,
          currency: 'USD',
        },
      });

      const runParams: RunActionParams = {
        Params: [
          { Name: 'CompanyID', Type: 'Input', Value: 'comp-1' },
          { Name: 'CourseID', Type: 'Input', Value: 'course-1' },
        ],
        ContextUser: contextUser,
      } as unknown as RunActionParams;

      const result = (await action['InternalRunAction'](runParams)) as ActionResultSimple;

      expect(result.Success).toBe(true);
      expect(result.ResultCode).toBe('SUCCESS');
      expect(result.Message).toContain('Course details retrieved successfully');
    });

    it('should return error result when GetCourseDetails throws', async () => {
      vi.spyOn(action, 'GetCourseDetails').mockRejectedValue(new Error('Course not found'));

      const runParams: RunActionParams = {
        Params: [
          { Name: 'CompanyID', Type: 'Input', Value: 'comp-1' },
          { Name: 'CourseID', Type: 'Input', Value: 'course-1' },
        ],
        ContextUser: contextUser,
      } as unknown as RunActionParams;

      const result = (await action['InternalRunAction'](runParams)) as ActionResultSimple;

      expect(result.Success).toBe(false);
      expect(result.ResultCode).toBe('ERROR');
      expect(result.Message).toContain('Error retrieving course details');
      expect(result.Message).toContain('Course not found');
    });
  });
});
