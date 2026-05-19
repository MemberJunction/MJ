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
import { GetLearnWorldsCoursesAction } from '../providers/learnworlds/actions/get-courses.action';
import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { LearnWorldsCourse, CourseCatalogSummary } from '../providers/learnworlds/interfaces';

/**
 * Helper to create a mock UserInfo for test context
 */
function createMockContextUser(): UserInfo {
  return { ID: 'test-user-id', Name: 'Test User', Email: 'test@example.com' } as unknown as UserInfo;
}

/**
 * Helper to build a raw LW API course object matching the LWApiCourse interface.
 * Provides sensible defaults that can be selectively overridden per test.
 */
function createRawApiCourse(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'course-1',
    title: 'Intro to TypeScript',
    subtitle: 'Learn TypeScript from scratch',
    description: 'A comprehensive course on TypeScript.',
    short_description: 'TS basics',
    status: 'published',
    visibility: 'public',
    is_active: true,
    is_free: false,
    price: 49.99,
    currency: 'USD',
    original_price: 79.99,
    category_id: 'cat-1',
    category_name: 'Programming',
    tags: ['typescript', 'programming'],
    level: 'beginner',
    language: 'en',
    duration: 3600,
    estimated_duration: 7200,
    thumbnail_url: 'https://example.com/thumb.jpg',
    cover_image_url: 'https://example.com/cover.jpg',
    promo_video_url: 'https://example.com/promo.mp4',
    instructor_id: 'inst-1',
    instructor_name: 'Jane Doe',
    instructor_bio: 'Senior developer',
    instructor_avatar: 'https://example.com/avatar.jpg',
    total_units: 10,
    total_lessons: 25,
    total_quizzes: 5,
    total_assignments: 3,
    total_enrollments: 150,
    active_enrollments: 80,
    completion_rate: 72,
    average_rating: 4.5,
    total_reviews: 42,
    created_at: '2024-06-15T10:00:00Z',
    updated_at: '2024-06-20T12:00:00Z',
    published_at: '2024-06-16T08:00:00Z',
    requires_approval: false,
    has_prerequisites: true,
    prerequisites: ['course-0'],
    certificate_available: true,
    objectives: ['Learn TS basics', 'Build projects'],
    target_audience: ['Beginners', 'JS developers'],
    requirements: ['Basic JS knowledge'],
    ...overrides,
  };
}

describe('GetLearnWorldsCoursesAction', () => {
  let action: GetLearnWorldsCoursesAction;
  let contextUser: UserInfo;

  beforeEach(() => {
    action = new GetLearnWorldsCoursesAction();
    contextUser = createMockContextUser();
  });

  // ─── GetCourses() typed public method ──────────────────────────────

  describe('GetCourses() typed method', () => {
    it('should return mapped courses with summary on happy path', async () => {
      const rawCourse = createRawApiCourse();
      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([rawCourse] as never);

      const result = await action.GetCourses({ CompanyID: 'comp-1' }, contextUser);

      expect(result.TotalCount).toBe(1);
      expect(result.Courses).toHaveLength(1);
      expect(result.Summary).toBeDefined();
      expect(result.Summary.totalCourses).toBe(1);

      const course: LearnWorldsCourse = result.Courses[0];
      expect(course.id).toBe('course-1');
      expect(course.title).toBe('Intro to TypeScript');
      expect(course.subtitle).toBe('Learn TypeScript from scratch');
      expect(course.description).toBe('A comprehensive course on TypeScript.');
      expect(course.shortDescription).toBe('TS basics');
      expect(course.status).toBe('published');
      expect(course.visibility).toBe('public');
      expect(course.isActive).toBe(true);
      expect(course.isFree).toBe(false);
      expect(course.price).toBe(49.99);
      expect(course.currency).toBe('USD');
      expect(course.originalPrice).toBe(79.99);
      expect(course.discountPercentage).toBe(38); // Math.round(((79.99 - 49.99) / 79.99) * 100)
      expect(course.categoryId).toBe('cat-1');
      expect(course.categoryName).toBe('Programming');
      expect(course.tags).toEqual(['typescript', 'programming']);
      expect(course.level).toBe('beginner');
      expect(course.language).toBe('en');
      expect(course.duration).toBe(3600);
      expect(course.thumbnailUrl).toBe('https://example.com/thumb.jpg');
      expect(course.coverImageUrl).toBe('https://example.com/cover.jpg');
      expect(course.promoVideoUrl).toBe('https://example.com/promo.mp4');
      expect(course.instructorId).toBe('inst-1');
      expect(course.instructorName).toBe('Jane Doe');
      expect(course.instructorBio).toBe('Senior developer');
      expect(course.instructorAvatarUrl).toBe('https://example.com/avatar.jpg');
      expect(course.totalUnits).toBe(10);
      expect(course.totalLessons).toBe(25);
      expect(course.totalQuizzes).toBe(5);
      expect(course.totalAssignments).toBe(3);
      expect(course.totalEnrollments).toBe(150);
      expect(course.activeEnrollments).toBe(80);
      expect(course.completionRate).toBe(72);
      expect(course.averageRating).toBe(4.5);
      expect(course.totalReviews).toBe(42);
      expect(course.requiresApproval).toBe(false);
      expect(course.hasPrerequisites).toBe(true);
      expect(course.prerequisites).toEqual(['course-0']);
      expect(course.certificateAvailable).toBe(true);
      expect(course.objectives).toEqual(['Learn TS basics', 'Build projects']);
      expect(course.targetAudience).toEqual(['Beginners', 'JS developers']);
      expect(course.requirements).toEqual(['Basic JS knowledge']);
    });

    it('should handle empty course list', async () => {
      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([] as never);

      const result = await action.GetCourses({ CompanyID: 'comp-1' }, contextUser);

      expect(result.TotalCount).toBe(0);
      expect(result.Courses).toEqual([]);
      expect(result.Summary.totalCourses).toBe(0);
      expect(result.Summary.publishedCourses).toBe(0);
      expect(result.Summary.draftCourses).toBe(0);
      expect(result.Summary.freeCourses).toBe(0);
      expect(result.Summary.paidCourses).toBe(0);
    });
  });

  // ─── Course mapping: identity ──────────────────────────────────────

  describe('mapCourseIdentity', () => {
    it('should use _id fallback when id is undefined', async () => {
      const rawCourse = createRawApiCourse({ id: undefined, _id: 'alt-course-id' });
      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([rawCourse] as never);

      const result = await action.GetCourses({ CompanyID: 'comp-1' }, contextUser);

      expect(result.Courses[0].id).toBe('alt-course-id');
    });

    it('should default id to empty string when both id and _id are missing', async () => {
      const rawCourse = createRawApiCourse({ id: undefined, _id: undefined });
      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([rawCourse] as never);

      const result = await action.GetCourses({ CompanyID: 'comp-1' }, contextUser);

      expect(result.Courses[0].id).toBe('');
    });

    it('should default isActive to true when is_active is not explicitly false', async () => {
      const rawCourse = createRawApiCourse({ is_active: undefined });
      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([rawCourse] as never);

      const result = await action.GetCourses({ CompanyID: 'comp-1' }, contextUser);

      expect(result.Courses[0].isActive).toBe(true);
    });

    it('should set isActive to false when is_active is explicitly false', async () => {
      const rawCourse = createRawApiCourse({ is_active: false });
      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([rawCourse] as never);

      const result = await action.GetCourses({ CompanyID: 'comp-1' }, contextUser);

      expect(result.Courses[0].isActive).toBe(false);
    });

    it('should mark course as free when is_free is true', async () => {
      const rawCourse = createRawApiCourse({ is_free: true, price: 0 });
      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([rawCourse] as never);

      const result = await action.GetCourses({ CompanyID: 'comp-1' }, contextUser);

      expect(result.Courses[0].isFree).toBe(true);
    });

    it('should mark course as free when price is 0', async () => {
      const rawCourse = createRawApiCourse({ is_free: false, price: 0 });
      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([rawCourse] as never);

      const result = await action.GetCourses({ CompanyID: 'comp-1' }, contextUser);

      expect(result.Courses[0].isFree).toBe(true);
    });

    it('should use excerpt as shortDescription fallback', async () => {
      const rawCourse = createRawApiCourse({ short_description: undefined, excerpt: 'Excerpt text' });
      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([rawCourse] as never);

      const result = await action.GetCourses({ CompanyID: 'comp-1' }, contextUser);

      expect(result.Courses[0].shortDescription).toBe('Excerpt text');
    });

    it('should use category.id and category.name as fallbacks', async () => {
      const rawCourse = createRawApiCourse({
        category_id: undefined,
        category_name: undefined,
        category: { id: 'cat-nested', name: 'Nested Category' },
      });
      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([rawCourse] as never);

      const result = await action.GetCourses({ CompanyID: 'comp-1' }, contextUser);

      expect(result.Courses[0].categoryId).toBe('cat-nested');
      expect(result.Courses[0].categoryName).toBe('Nested Category');
    });

    it('should map status aliases correctly', async () => {
      const tests: Array<{ input: string; expected: string }> = [
        { input: 'published', expected: 'published' },
        { input: 'active', expected: 'published' },
        { input: 'draft', expected: 'draft' },
        { input: 'unpublished', expected: 'draft' },
        { input: 'coming_soon', expected: 'coming_soon' },
        { input: 'upcoming', expected: 'coming_soon' },
        { input: 'unknown_status', expected: 'draft' },
      ];

      for (const { input, expected } of tests) {
        const rawCourse = createRawApiCourse({ status: input });
        vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([rawCourse] as never);

        const result = await action.GetCourses({ CompanyID: 'comp-1' }, contextUser);

        expect(result.Courses[0].status).toBe(expected);
      }
    });

    it('should map visibility aliases correctly', async () => {
      const tests: Array<{ input: string; expected: string }> = [
        { input: 'public', expected: 'public' },
        { input: 'open', expected: 'public' },
        { input: 'private', expected: 'private' },
        { input: 'closed', expected: 'private' },
        { input: 'hidden', expected: 'hidden' },
        { input: 'unlisted', expected: 'hidden' },
        { input: 'unknown_vis', expected: 'public' },
      ];

      for (const { input, expected } of tests) {
        const rawCourse = createRawApiCourse({ visibility: input });
        vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([rawCourse] as never);

        const result = await action.GetCourses({ CompanyID: 'comp-1' }, contextUser);

        expect(result.Courses[0].visibility).toBe(expected);
      }
    });

    it('should use access_type as fallback for visibility', async () => {
      const rawCourse = createRawApiCourse({ visibility: undefined, access_type: 'closed' });
      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([rawCourse] as never);

      const result = await action.GetCourses({ CompanyID: 'comp-1' }, contextUser);

      expect(result.Courses[0].visibility).toBe('private');
    });

    it('should map level aliases correctly', async () => {
      const tests: Array<{ input: string; expected: string }> = [
        { input: 'beginner', expected: 'beginner' },
        { input: 'basic', expected: 'beginner' },
        { input: 'introductory', expected: 'beginner' },
        { input: 'intermediate', expected: 'intermediate' },
        { input: 'medium', expected: 'intermediate' },
        { input: 'advanced', expected: 'advanced' },
        { input: 'expert', expected: 'advanced' },
        { input: 'all', expected: 'all' },
        { input: 'any', expected: 'all' },
        { input: 'mixed', expected: 'all' },
        { input: 'unknown_level', expected: 'all' },
      ];

      for (const { input, expected } of tests) {
        const rawCourse = createRawApiCourse({ level: input });
        vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([rawCourse] as never);

        const result = await action.GetCourses({ CompanyID: 'comp-1' }, contextUser);

        expect(result.Courses[0].level).toBe(expected);
      }
    });

    it('should use difficulty as fallback for level', async () => {
      const rawCourse = createRawApiCourse({ level: undefined, difficulty: 'expert' });
      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([rawCourse] as never);

      const result = await action.GetCourses({ CompanyID: 'comp-1' }, contextUser);

      expect(result.Courses[0].level).toBe('advanced');
    });

    it('should default language to en when missing', async () => {
      const rawCourse = createRawApiCourse({ language: undefined });
      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([rawCourse] as never);

      const result = await action.GetCourses({ CompanyID: 'comp-1' }, contextUser);

      expect(result.Courses[0].language).toBe('en');
    });

    it('should use image as fallback for thumbnailUrl', async () => {
      const rawCourse = createRawApiCourse({ thumbnail_url: undefined, image: 'https://example.com/image.jpg' });
      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([rawCourse] as never);

      const result = await action.GetCourses({ CompanyID: 'comp-1' }, contextUser);

      expect(result.Courses[0].thumbnailUrl).toBe('https://example.com/image.jpg');
    });

    it('should use cover_image as fallback for coverImageUrl', async () => {
      const rawCourse = createRawApiCourse({ cover_image_url: undefined, cover_image: 'https://example.com/cover2.jpg' });
      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([rawCourse] as never);

      const result = await action.GetCourses({ CompanyID: 'comp-1' }, contextUser);

      expect(result.Courses[0].coverImageUrl).toBe('https://example.com/cover2.jpg');
    });

    it('should use video_url as fallback for promoVideoUrl', async () => {
      const rawCourse = createRawApiCourse({ promo_video_url: undefined, video_url: 'https://example.com/vid.mp4' });
      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([rawCourse] as never);

      const result = await action.GetCourses({ CompanyID: 'comp-1' }, contextUser);

      expect(result.Courses[0].promoVideoUrl).toBe('https://example.com/vid.mp4');
    });

    it('should use estimated_duration as fallback for duration', async () => {
      const rawCourse = createRawApiCourse({ duration: undefined, estimated_duration: 5400 });
      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([rawCourse] as never);

      const result = await action.GetCourses({ CompanyID: 'comp-1' }, contextUser);

      expect(result.Courses[0].duration).toBe(5400);
    });
  });

  // ─── Course mapping: pricing ───────────────────────────────────────

  describe('mapCoursePricing', () => {
    it('should default currency to USD when missing', async () => {
      const rawCourse = createRawApiCourse({ currency: undefined });
      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([rawCourse] as never);

      const result = await action.GetCourses({ CompanyID: 'comp-1' }, contextUser);

      expect(result.Courses[0].currency).toBe('USD');
    });
  });

  // ─── Discount calculation ─────────────────────────────────────────

  describe('discount calculation', () => {
    it('should return undefined when original_price is not set', async () => {
      const rawCourse = createRawApiCourse({ original_price: undefined });
      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([rawCourse] as never);

      const result = await action.GetCourses({ CompanyID: 'comp-1' }, contextUser);

      expect(result.Courses[0].discountPercentage).toBeUndefined();
    });

    it('should return undefined when original_price equals current price', async () => {
      const rawCourse = createRawApiCourse({ original_price: 49.99, price: 49.99 });
      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([rawCourse] as never);

      const result = await action.GetCourses({ CompanyID: 'comp-1' }, contextUser);

      expect(result.Courses[0].discountPercentage).toBeUndefined();
    });

    it('should return undefined when original_price is less than current price', async () => {
      const rawCourse = createRawApiCourse({ original_price: 30, price: 49.99 });
      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([rawCourse] as never);

      const result = await action.GetCourses({ CompanyID: 'comp-1' }, contextUser);

      expect(result.Courses[0].discountPercentage).toBeUndefined();
    });

    it('should calculate correct discount percentage', async () => {
      const rawCourse = createRawApiCourse({ original_price: 100, price: 75 });
      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([rawCourse] as never);

      const result = await action.GetCourses({ CompanyID: 'comp-1' }, contextUser);

      expect(result.Courses[0].discountPercentage).toBe(25);
    });

    it('should round discount percentage to nearest integer', async () => {
      const rawCourse = createRawApiCourse({ original_price: 99.99, price: 66.66 });
      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([rawCourse] as never);

      const result = await action.GetCourses({ CompanyID: 'comp-1' }, contextUser);

      // Math.round(((99.99 - 66.66) / 99.99) * 100) = Math.round(33.33...) = 33
      expect(result.Courses[0].discountPercentage).toBe(33);
    });

    it('should return undefined when current price is 0 (falsy)', async () => {
      const rawCourse = createRawApiCourse({ original_price: 100, price: 0 });
      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([rawCourse] as never);

      const result = await action.GetCourses({ CompanyID: 'comp-1' }, contextUser);

      // !currentPrice evaluates to true for 0, so undefined
      expect(result.Courses[0].discountPercentage).toBeUndefined();
    });
  });

  // ─── Course mapping: instructor ───────────────────────────────────

  describe('mapCourseInstructor', () => {
    it('should use nested instructor object as fallback', async () => {
      const rawCourse = createRawApiCourse({
        instructor_id: undefined,
        instructor_name: undefined,
        instructor_bio: undefined,
        instructor_avatar: undefined,
        instructor: { id: 'nested-inst', name: 'Nested Instructor', bio: 'Nested bio', avatar_url: 'https://example.com/nested.jpg' },
      });
      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([rawCourse] as never);

      const result = await action.GetCourses({ CompanyID: 'comp-1' }, contextUser);

      expect(result.Courses[0].instructorId).toBe('nested-inst');
      expect(result.Courses[0].instructorName).toBe('Nested Instructor');
      expect(result.Courses[0].instructorBio).toBe('Nested bio');
      expect(result.Courses[0].instructorAvatarUrl).toBe('https://example.com/nested.jpg');
    });

    it('should use author_id and author_name as last-resort fallbacks', async () => {
      const rawCourse = createRawApiCourse({
        instructor_id: undefined,
        instructor_name: undefined,
        instructor: undefined,
        author_id: 'author-1',
        author_name: 'Author Name',
      });
      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([rawCourse] as never);

      const result = await action.GetCourses({ CompanyID: 'comp-1' }, contextUser);

      expect(result.Courses[0].instructorId).toBe('author-1');
      expect(result.Courses[0].instructorName).toBe('Author Name');
    });
  });

  // ─── Course mapping: content stats ────────────────────────────────

  describe('mapCourseContentStats', () => {
    it('should use sections_count and lessons_count as fallbacks', async () => {
      const rawCourse = createRawApiCourse({
        total_units: undefined,
        total_lessons: undefined,
        total_quizzes: undefined,
        total_assignments: undefined,
        sections_count: 8,
        lessons_count: 20,
        quizzes_count: 4,
        assignments_count: 2,
      });
      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([rawCourse] as never);

      const result = await action.GetCourses({ CompanyID: 'comp-1' }, contextUser);

      expect(result.Courses[0].totalUnits).toBe(8);
      expect(result.Courses[0].totalLessons).toBe(20);
      expect(result.Courses[0].totalQuizzes).toBe(4);
      expect(result.Courses[0].totalAssignments).toBe(2);
    });

    it('should default content stats to 0 when all are missing', async () => {
      const rawCourse = createRawApiCourse({
        total_units: undefined,
        sections_count: undefined,
        total_lessons: undefined,
        lessons_count: undefined,
        total_quizzes: undefined,
        quizzes_count: undefined,
        total_assignments: undefined,
        assignments_count: undefined,
        total_enrollments: undefined,
        students_count: undefined,
        active_enrollments: undefined,
        active_students: undefined,
        completion_rate: undefined,
      });
      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([rawCourse] as never);

      const result = await action.GetCourses({ CompanyID: 'comp-1' }, contextUser);

      expect(result.Courses[0].totalUnits).toBe(0);
      expect(result.Courses[0].totalLessons).toBe(0);
      expect(result.Courses[0].totalQuizzes).toBe(0);
      expect(result.Courses[0].totalAssignments).toBe(0);
      expect(result.Courses[0].totalEnrollments).toBe(0);
      expect(result.Courses[0].activeEnrollments).toBe(0);
      expect(result.Courses[0].completionRate).toBe(0);
    });

    it('should use students_count as fallback for totalEnrollments', async () => {
      const rawCourse = createRawApiCourse({ total_enrollments: undefined, students_count: 99 });
      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([rawCourse] as never);

      const result = await action.GetCourses({ CompanyID: 'comp-1' }, contextUser);

      expect(result.Courses[0].totalEnrollments).toBe(99);
    });

    it('should use active_students as fallback for activeEnrollments', async () => {
      const rawCourse = createRawApiCourse({ active_enrollments: undefined, active_students: 33 });
      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([rawCourse] as never);

      const result = await action.GetCourses({ CompanyID: 'comp-1' }, contextUser);

      expect(result.Courses[0].activeEnrollments).toBe(33);
    });

    it('should use rating as fallback for averageRating', async () => {
      const rawCourse = createRawApiCourse({ average_rating: undefined, rating: 3.8 });
      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([rawCourse] as never);

      const result = await action.GetCourses({ CompanyID: 'comp-1' }, contextUser);

      expect(result.Courses[0].averageRating).toBe(3.8);
    });

    it('should use reviews_count as fallback for totalReviews', async () => {
      const rawCourse = createRawApiCourse({ total_reviews: undefined, reviews_count: 17 });
      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([rawCourse] as never);

      const result = await action.GetCourses({ CompanyID: 'comp-1' }, contextUser);

      expect(result.Courses[0].totalReviews).toBe(17);
    });

    it('should use total_duration as fallback for estimatedDuration', async () => {
      const rawCourse = createRawApiCourse({ estimated_duration: undefined, total_duration: 4500 });
      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([rawCourse] as never);

      const result = await action.GetCourses({ CompanyID: 'comp-1' }, contextUser);

      expect(result.Courses[0].estimatedDuration).toBe(4500);
    });
  });

  // ─── Course mapping: meta ─────────────────────────────────────────

  describe('mapCourseMeta', () => {
    it('should use created/updated fallbacks', async () => {
      const rawCourse = createRawApiCourse({
        created_at: undefined,
        created: '2023-01-01T00:00:00Z',
        updated_at: undefined,
        updated: '2023-02-01T00:00:00Z',
      });
      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([rawCourse] as never);

      const result = await action.GetCourses({ CompanyID: 'comp-1' }, contextUser);

      expect(result.Courses[0].createdAt).toEqual(new Date('2023-01-01T00:00:00Z'));
      expect(result.Courses[0].updatedAt).toEqual(new Date('2023-02-01T00:00:00Z'));
    });

    it('should parse epoch timestamps (seconds) for date fields', async () => {
      const epochSeconds = 1700000000; // ~2023-11-14
      const rawCourse = createRawApiCourse({
        created_at: undefined,
        created: epochSeconds,
        updated_at: undefined,
        updated: epochSeconds,
      });
      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([rawCourse] as never);

      const result = await action.GetCourses({ CompanyID: 'comp-1' }, contextUser);

      expect(result.Courses[0].createdAt).toEqual(new Date(epochSeconds * 1000));
      expect(result.Courses[0].updatedAt).toEqual(new Date(epochSeconds * 1000));
    });

    it('should set publishedAt to undefined when not provided', async () => {
      const rawCourse = createRawApiCourse({ published_at: undefined });
      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([rawCourse] as never);

      const result = await action.GetCourses({ CompanyID: 'comp-1' }, contextUser);

      expect(result.Courses[0].publishedAt).toBeUndefined();
    });

    it('should set enrollment dates to undefined when not provided', async () => {
      const rawCourse = createRawApiCourse({ enrollment_start: undefined, enrollment_end: undefined });
      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([rawCourse] as never);

      const result = await action.GetCourses({ CompanyID: 'comp-1' }, contextUser);

      expect(result.Courses[0].enrollmentStartDate).toBeUndefined();
      expect(result.Courses[0].enrollmentEndDate).toBeUndefined();
    });

    it('should default boolean meta fields to false when missing', async () => {
      const rawCourse = createRawApiCourse({
        requires_approval: undefined,
        has_prerequisites: undefined,
        certificate_available: undefined,
        has_certificate: undefined,
      });
      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([rawCourse] as never);

      const result = await action.GetCourses({ CompanyID: 'comp-1' }, contextUser);

      expect(result.Courses[0].requiresApproval).toBe(false);
      expect(result.Courses[0].hasPrerequisites).toBe(false);
      expect(result.Courses[0].certificateAvailable).toBe(false);
    });

    it('should use has_certificate as fallback for certificateAvailable', async () => {
      const rawCourse = createRawApiCourse({ certificate_available: undefined, has_certificate: true });
      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([rawCourse] as never);

      const result = await action.GetCourses({ CompanyID: 'comp-1' }, contextUser);

      expect(result.Courses[0].certificateAvailable).toBe(true);
    });

    it('should use learning_objectives as fallback for objectives', async () => {
      const rawCourse = createRawApiCourse({ objectives: undefined, learning_objectives: ['Objective A'] });
      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([rawCourse] as never);

      const result = await action.GetCourses({ CompanyID: 'comp-1' }, contextUser);

      expect(result.Courses[0].objectives).toEqual(['Objective A']);
    });

    it('should use prerequisites_text as fallback for requirements', async () => {
      const rawCourse = createRawApiCourse({ requirements: undefined, prerequisites_text: ['Prereq text'] });
      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([rawCourse] as never);

      const result = await action.GetCourses({ CompanyID: 'comp-1' }, contextUser);

      expect(result.Courses[0].requirements).toEqual(['Prereq text']);
    });

    it('should default array meta fields to empty arrays when missing', async () => {
      const rawCourse = createRawApiCourse({
        prerequisites: undefined,
        objectives: undefined,
        learning_objectives: undefined,
        target_audience: undefined,
        requirements: undefined,
        prerequisites_text: undefined,
      });
      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([rawCourse] as never);

      const result = await action.GetCourses({ CompanyID: 'comp-1' }, contextUser);

      expect(result.Courses[0].prerequisites).toEqual([]);
      expect(result.Courses[0].objectives).toEqual([]);
      expect(result.Courses[0].targetAudience).toEqual([]);
      expect(result.Courses[0].requirements).toEqual([]);
    });
  });

  // ─── Catalog summary: category, level, language counts ────────────

  describe('catalog summary counts', () => {
    it('should count categories, levels, and languages correctly', async () => {
      const courses = [
        createRawApiCourse({ id: 'c1', category_name: 'Programming', level: 'beginner', language: 'en' }),
        createRawApiCourse({ id: 'c2', category_name: 'Programming', level: 'intermediate', language: 'en' }),
        createRawApiCourse({ id: 'c3', category_name: 'Design', level: 'beginner', language: 'es' }),
      ];
      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue(courses as never);

      const result = await action.GetCourses({ CompanyID: 'comp-1' }, contextUser);
      const summary: CourseCatalogSummary = result.Summary;

      expect(summary.categoryCounts).toEqual({ Programming: 2, Design: 1 });
      expect(summary.levelCounts).toEqual({ beginner: 2, intermediate: 1 });
      expect(summary.languageCounts).toEqual({ en: 2, es: 1 });
    });

    it('should count published vs draft vs free vs paid correctly', async () => {
      const courses = [
        createRawApiCourse({ id: 'c1', status: 'published', is_free: true, price: 0 }),
        createRawApiCourse({ id: 'c2', status: 'published', is_free: false, price: 50 }),
        createRawApiCourse({ id: 'c3', status: 'draft', is_free: false, price: 30 }),
      ];
      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue(courses as never);

      const result = await action.GetCourses({ CompanyID: 'comp-1' }, contextUser);
      const summary = result.Summary;

      expect(summary.totalCourses).toBe(3);
      expect(summary.publishedCourses).toBe(2);
      expect(summary.draftCourses).toBe(1);
      expect(summary.freeCourses).toBe(1);
      expect(summary.paidCourses).toBe(2);
    });

    it('should skip missing category names in categoryCounts', async () => {
      const courses = [
        createRawApiCourse({ id: 'c1', category_name: undefined }),
        createRawApiCourse({ id: 'c2', category_name: 'Design' }),
      ];
      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue(courses as never);

      const result = await action.GetCourses({ CompanyID: 'comp-1' }, contextUser);

      // Only 'Design' should appear; the undefined category should be skipped
      expect(result.Summary.categoryCounts).toEqual({ Design: 1 });
    });
  });

  // ─── Catalog summary: enrollment stats ────────────────────────────

  describe('catalog summary enrollment stats', () => {
    it('should calculate totalEnrollments and averagePerCourse', async () => {
      const courses = [
        createRawApiCourse({ id: 'c1', total_enrollments: 100 }),
        createRawApiCourse({ id: 'c2', total_enrollments: 50 }),
        createRawApiCourse({ id: 'c3', total_enrollments: 150 }),
      ];
      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue(courses as never);

      const result = await action.GetCourses({ CompanyID: 'comp-1' }, contextUser);
      const stats = result.Summary.enrollmentStats;

      expect(stats.totalEnrollments).toBe(300);
      expect(stats.averageEnrollmentsPerCourse).toBe(100); // Math.round(300 / 3)
    });

    it('should identify most popular courses (top 5, sorted by enrollments desc)', async () => {
      const courses = Array.from({ length: 7 }, (_, i) =>
        createRawApiCourse({
          id: `c${i}`,
          title: `Course ${i}`,
          total_enrollments: (i + 1) * 10,
          status: 'published',
        }),
      );
      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue(courses as never);

      const result = await action.GetCourses({ CompanyID: 'comp-1' }, contextUser);
      const popular = result.Summary.enrollmentStats.mostPopularCourses;

      expect(popular).toHaveLength(5);
      // Most popular first
      expect(popular[0].id).toBe('c6');
      expect(popular[0].enrollments).toBe(70);
      expect(popular[4].id).toBe('c2');
      expect(popular[4].enrollments).toBe(30);
    });

    it('should exclude courses with 0 enrollments from most popular', async () => {
      const courses = [
        createRawApiCourse({ id: 'c1', title: 'Course 1', total_enrollments: 0 }),
        createRawApiCourse({ id: 'c2', title: 'Course 2', total_enrollments: 10 }),
      ];
      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue(courses as never);

      const result = await action.GetCourses({ CompanyID: 'comp-1' }, contextUser);
      const popular = result.Summary.enrollmentStats.mostPopularCourses;

      expect(popular).toHaveLength(1);
      expect(popular[0].id).toBe('c2');
    });

    it('should handle empty enrollment stats for empty course list', async () => {
      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([] as never);

      const result = await action.GetCourses({ CompanyID: 'comp-1' }, contextUser);
      const stats = result.Summary.enrollmentStats;

      expect(stats.totalEnrollments).toBe(0);
      expect(stats.averageEnrollmentsPerCourse).toBe(0);
      expect(stats.mostPopularCourses).toEqual([]);
    });
  });

  // ─── Catalog summary: price stats ─────────────────────────────────

  describe('catalog summary price stats', () => {
    it('should calculate average, min, max for paid courses', async () => {
      const courses = [
        createRawApiCourse({ id: 'c1', is_free: false, price: 20 }),
        createRawApiCourse({ id: 'c2', is_free: false, price: 60 }),
        createRawApiCourse({ id: 'c3', is_free: false, price: 100 }),
      ];
      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue(courses as never);

      const result = await action.GetCourses({ CompanyID: 'comp-1' }, contextUser);
      const ps = result.Summary.priceStats;

      expect(ps.averagePrice).toBe(60); // Math.round((20+60+100)/3) = 60
      expect(ps.minPrice).toBe(20);
      expect(ps.maxPrice).toBe(100);
      expect(ps.currency).toBe('USD');
    });

    it('should exclude free courses from price stats', async () => {
      const courses = [
        createRawApiCourse({ id: 'c1', is_free: true, price: 0 }),
        createRawApiCourse({ id: 'c2', is_free: false, price: 50 }),
        createRawApiCourse({ id: 'c3', is_free: false, price: 100 }),
      ];
      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue(courses as never);

      const result = await action.GetCourses({ CompanyID: 'comp-1' }, contextUser);
      const ps = result.Summary.priceStats;

      expect(ps.averagePrice).toBe(75); // Math.round((50+100)/2) = 75
      expect(ps.minPrice).toBe(50);
      expect(ps.maxPrice).toBe(100);
    });

    it('should return zeroed price stats when all courses are free', async () => {
      const courses = [
        createRawApiCourse({ id: 'c1', is_free: true, price: 0 }),
        createRawApiCourse({ id: 'c2', is_free: true, price: 0 }),
      ];
      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue(courses as never);

      const result = await action.GetCourses({ CompanyID: 'comp-1' }, contextUser);
      const ps = result.Summary.priceStats;

      // No paid courses means the default summary priceStats stays
      expect(ps.averagePrice).toBe(0);
      expect(ps.minPrice).toBe(0);
      expect(ps.maxPrice).toBe(0);
      expect(ps.currency).toBe('USD');
    });

    it('should use first paid course currency for priceStats', async () => {
      const courses = [
        createRawApiCourse({ id: 'c1', is_free: false, price: 50, currency: 'EUR' }),
        createRawApiCourse({ id: 'c2', is_free: false, price: 75, currency: 'GBP' }),
      ];
      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue(courses as never);

      const result = await action.GetCourses({ CompanyID: 'comp-1' }, contextUser);

      expect(result.Summary.priceStats.currency).toBe('EUR');
    });
  });

  // ─── Query param building ─────────────────────────────────────────

  describe('query param building', () => {
    it('should pass search text as query param', async () => {
      const spy = vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([] as never);

      await action.GetCourses({ CompanyID: 'comp-1', SearchText: 'typescript' }, contextUser);

      const queryParams = spy.mock.calls[0][1] as Record<string, string | number | boolean>;
      expect(queryParams.search).toBe('typescript');
    });

    it('should pass status filter', async () => {
      const spy = vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([] as never);

      await action.GetCourses({ CompanyID: 'comp-1', Status: 'published' }, contextUser);

      const queryParams = spy.mock.calls[0][1] as Record<string, string | number | boolean>;
      expect(queryParams.status).toBe('published');
    });

    it('should pass category_id, level, language filters', async () => {
      const spy = vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([] as never);

      await action.GetCourses(
        { CompanyID: 'comp-1', CategoryID: 'cat-1', Level: 'beginner', Language: 'es' },
        contextUser,
      );

      const queryParams = spy.mock.calls[0][1] as Record<string, string | number | boolean>;
      expect(queryParams.category_id).toBe('cat-1');
      expect(queryParams.level).toBe('beginner');
      expect(queryParams.language).toBe('es');
    });

    it('should set is_free when OnlyFree is true', async () => {
      const spy = vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([] as never);

      await action.GetCourses({ CompanyID: 'comp-1', OnlyFree: true }, contextUser);

      const queryParams = spy.mock.calls[0][1] as Record<string, string | number | boolean>;
      expect(queryParams.is_free).toBe(true);
    });

    it('should not set is_free when OnlyFree is false', async () => {
      const spy = vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([] as never);

      await action.GetCourses({ CompanyID: 'comp-1', OnlyFree: false }, contextUser);

      const queryParams = spy.mock.calls[0][1] as Record<string, string | number | boolean>;
      expect(queryParams.is_free).toBeUndefined();
    });

    it('should pass price range filters when positive', async () => {
      const spy = vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([] as never);

      await action.GetCourses({ CompanyID: 'comp-1', MinPrice: 10, MaxPrice: 200 }, contextUser);

      const queryParams = spy.mock.calls[0][1] as Record<string, string | number | boolean>;
      expect(queryParams.min_price).toBe(10);
      expect(queryParams.max_price).toBe(200);
    });

    it('should not pass price filters when 0', async () => {
      const spy = vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([] as never);

      await action.GetCourses({ CompanyID: 'comp-1', MinPrice: 0, MaxPrice: 0 }, contextUser);

      const queryParams = spy.mock.calls[0][1] as Record<string, string | number | boolean>;
      expect(queryParams.min_price).toBeUndefined();
      expect(queryParams.max_price).toBeUndefined();
    });

    it('should pass tags and instructor_id filters', async () => {
      const spy = vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([] as never);

      await action.GetCourses({ CompanyID: 'comp-1', Tags: 'typescript,advanced', InstructorID: 'inst-1' }, contextUser);

      const queryParams = spy.mock.calls[0][1] as Record<string, string | number | boolean>;
      expect(queryParams.tags).toBe('typescript,advanced');
      expect(queryParams.instructor_id).toBe('inst-1');
    });

    it('should format date filters as ISO 8601', async () => {
      const spy = vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([] as never);

      await action.GetCourses(
        { CompanyID: 'comp-1', CreatedAfter: '2024-01-01', CreatedBefore: '2024-12-31' },
        contextUser,
      );

      const queryParams = spy.mock.calls[0][1] as Record<string, string | number | boolean>;
      // formatLearnWorldsDate returns ISO string
      expect(queryParams.created_after).toBe(new Date('2024-01-01').toISOString());
      expect(queryParams.created_before).toBe(new Date('2024-12-31').toISOString());
    });

    it('should build sort param with desc prefix by default', async () => {
      const spy = vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([] as never);

      await action.GetCourses({ CompanyID: 'comp-1' }, contextUser);

      const queryParams = spy.mock.calls[0][1] as Record<string, string | number | boolean>;
      expect(queryParams.sort).toBe('-created');
    });

    it('should build sort param without prefix for asc order', async () => {
      const spy = vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([] as never);

      await action.GetCourses({ CompanyID: 'comp-1', SortBy: 'title', SortOrder: 'asc' }, contextUser);

      const queryParams = spy.mock.calls[0][1] as Record<string, string | number | boolean>;
      expect(queryParams.sort).toBe('title');
    });

    it('should build sort param with custom field and desc order', async () => {
      const spy = vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([] as never);

      await action.GetCourses({ CompanyID: 'comp-1', SortBy: 'price', SortOrder: 'desc' }, contextUser);

      const queryParams = spy.mock.calls[0][1] as Record<string, string | number | boolean>;
      expect(queryParams.sort).toBe('-price');
    });

    it('should include enrollment_stats by default', async () => {
      const spy = vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([] as never);

      await action.GetCourses({ CompanyID: 'comp-1' }, contextUser);

      const queryParams = spy.mock.calls[0][1] as Record<string, string | number | boolean>;
      expect(queryParams.include).toBe('enrollment_stats');
    });

    it('should omit enrollment_stats include when IncludeEnrollmentStats is false', async () => {
      const spy = vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([] as never);

      await action.GetCourses({ CompanyID: 'comp-1', IncludeEnrollmentStats: false }, contextUser);

      const queryParams = spy.mock.calls[0][1] as Record<string, string | number | boolean>;
      expect(queryParams.include).toBeUndefined();
    });

    it('should cap limit at 100 even when MaxResults is higher', async () => {
      const spy = vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([] as never);

      await action.GetCourses({ CompanyID: 'comp-1', MaxResults: 500 }, contextUser);

      const queryParams = spy.mock.calls[0][1] as Record<string, string | number | boolean>;
      expect(queryParams.limit).toBe(100);
    });

    it('should use MaxResults as limit when <= 100', async () => {
      const spy = vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([] as never);

      await action.GetCourses({ CompanyID: 'comp-1', MaxResults: 25 }, contextUser);

      const queryParams = spy.mock.calls[0][1] as Record<string, string | number | boolean>;
      expect(queryParams.limit).toBe(25);
    });

    it('should not include undefined optional params in query', async () => {
      const spy = vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([] as never);

      await action.GetCourses({ CompanyID: 'comp-1' }, contextUser);

      const queryParams = spy.mock.calls[0][1] as Record<string, string | number | boolean>;
      expect(queryParams.search).toBeUndefined();
      expect(queryParams.status).toBeUndefined();
      expect(queryParams.category_id).toBeUndefined();
      expect(queryParams.level).toBeUndefined();
      expect(queryParams.language).toBeUndefined();
      expect(queryParams.is_free).toBeUndefined();
      expect(queryParams.min_price).toBeUndefined();
      expect(queryParams.max_price).toBeUndefined();
      expect(queryParams.tags).toBeUndefined();
      expect(queryParams.instructor_id).toBeUndefined();
      expect(queryParams.created_after).toBeUndefined();
      expect(queryParams.created_before).toBeUndefined();
    });
  });

  // ─── InternalRunAction() ──────────────────────────────────────────

  describe('InternalRunAction()', () => {
    it('should return success when GetCourses succeeds', async () => {
      const mockCourses: LearnWorldsCourse[] = [
        {
          id: 'c1',
          title: 'Course A',
          status: 'published',
          visibility: 'public',
          isActive: true,
          isFree: false,
          price: 50,
          currency: 'USD',
          totalUnits: 5,
          totalLessons: 10,
          totalQuizzes: 2,
          totalAssignments: 1,
          totalEnrollments: 100,
          activeEnrollments: 50,
          completionRate: 60,
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-02'),
          requiresApproval: false,
          hasPrerequisites: false,
          certificateAvailable: true,
        },
      ];

      const mockSummary: CourseCatalogSummary = {
        totalCourses: 1,
        publishedCourses: 1,
        draftCourses: 0,
        freeCourses: 0,
        paidCourses: 1,
        categoryCounts: {},
        levelCounts: {},
        languageCounts: {},
        enrollmentStats: {
          totalEnrollments: 100,
          averageEnrollmentsPerCourse: 100,
          mostPopularCourses: [{ id: 'c1', title: 'Course A', enrollments: 100 }],
        },
        priceStats: { averagePrice: 50, minPrice: 50, maxPrice: 50, currency: 'USD' },
      };

      vi.spyOn(action, 'GetCourses').mockResolvedValue({
        Courses: mockCourses,
        TotalCount: 1,
        Summary: mockSummary,
      });

      const runParams: RunActionParams = {
        Params: [
          { Name: 'CompanyID', Type: 'Input', Value: 'comp-1' },
          { Name: 'SearchText', Type: 'Input', Value: undefined },
          { Name: 'MaxResults', Type: 'Input', Value: undefined },
        ],
        ContextUser: contextUser,
      } as unknown as RunActionParams;

      const result = (await action['InternalRunAction'](runParams)) as ActionResultSimple;

      expect(result.Success).toBe(true);
      expect(result.ResultCode).toBe('SUCCESS');
      expect(result.Message).toContain('Successfully retrieved 1 courses from LearnWorlds');
    });

    it('should return error result when GetCourses throws', async () => {
      vi.spyOn(action, 'GetCourses').mockRejectedValue(new Error('API connection failed'));

      const runParams: RunActionParams = {
        Params: [{ Name: 'CompanyID', Type: 'Input', Value: 'comp-1' }],
        ContextUser: contextUser,
      } as unknown as RunActionParams;

      const result = (await action['InternalRunAction'](runParams)) as ActionResultSimple;

      expect(result.Success).toBe(false);
      expect(result.ResultCode).toBe('ERROR');
      expect(result.Message).toContain('API connection failed');
    });

    it('should handle non-Error thrown values gracefully', async () => {
      vi.spyOn(action, 'GetCourses').mockRejectedValue('plain string error');

      const runParams: RunActionParams = {
        Params: [{ Name: 'CompanyID', Type: 'Input', Value: 'comp-1' }],
        ContextUser: contextUser,
      } as unknown as RunActionParams;

      const result = (await action['InternalRunAction'](runParams)) as ActionResultSimple;

      expect(result.Success).toBe(false);
      expect(result.ResultCode).toBe('ERROR');
      expect(result.Message).toContain('Unknown error occurred');
    });
  });
});
