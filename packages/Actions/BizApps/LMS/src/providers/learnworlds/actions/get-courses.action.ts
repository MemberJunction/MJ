import { RegisterClass } from '@memberjunction/global';
import { LearnWorldsBaseAction } from '../learnworlds-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';
import { UserInfo } from '@memberjunction/core';
import { GetCoursesParams, GetCoursesResult, CourseCatalogSummary, LearnWorldsCourse } from '../interfaces';

/**
 * Raw course shape returned by the LearnWorlds API (snake_case).
 * Kept file-local because it is an API implementation detail.
 */
interface LWApiCourse {
  id?: string;
  _id?: string;
  title: string;
  subtitle?: string;
  description?: string;
  short_description?: string;
  excerpt?: string;
  status?: string;
  visibility?: string;
  access_type?: string;
  is_active?: boolean;
  is_free?: boolean;
  price?: number;
  currency?: string;
  original_price?: number;
  category_id?: string;
  category?: { id?: string; name?: string };
  category_name?: string;
  tags?: string[];
  level?: string;
  difficulty?: string;
  language?: string;
  duration?: number;
  estimated_duration?: number;
  thumbnail_url?: string;
  image?: string;
  cover_image_url?: string;
  cover_image?: string;
  promo_video_url?: string;
  video_url?: string;
  instructor_id?: string;
  instructor?: { id?: string; name?: string; bio?: string; avatar_url?: string };
  instructor_name?: string;
  instructor_bio?: string;
  instructor_avatar?: string;
  author_id?: string;
  author_name?: string;
  total_units?: number;
  sections_count?: number;
  total_lessons?: number;
  lessons_count?: number;
  total_quizzes?: number;
  quizzes_count?: number;
  total_assignments?: number;
  assignments_count?: number;
  total_duration?: number;
  total_enrollments?: number;
  students_count?: number;
  active_enrollments?: number;
  active_students?: number;
  completion_rate?: number;
  average_rating?: number;
  rating?: number;
  total_reviews?: number;
  reviews_count?: number;
  created?: string | number;
  created_at?: string | number;
  updated?: string | number;
  updated_at?: string | number;
  published_at?: string | number;
  enrollment_start?: string | number;
  enrollment_end?: string | number;
  requires_approval?: boolean;
  has_prerequisites?: boolean;
  prerequisites?: string[];
  certificate_available?: boolean;
  has_certificate?: boolean;
  objectives?: string[];
  learning_objectives?: string[];
  target_audience?: string[];
  requirements?: string[];
  prerequisites_text?: string[];
}

/**
 * Action to retrieve courses from LearnWorlds LMS
 */
@RegisterClass(BaseAction, 'GetLearnWorldsCoursesAction')
export class GetLearnWorldsCoursesAction extends LearnWorldsBaseAction {
  /**
   * Description of the action
   */
  public get Description(): string {
    return 'Retrieves the course catalog from LearnWorlds with filtering, search, and sorting options';
  }

  /**
   * Typed public method for direct (non-framework) callers.
   * Sets company context, fetches courses, and returns a strongly-typed result.
   * Throws on error.
   */
  public async GetCourses(params: GetCoursesParams, contextUser: UserInfo): Promise<GetCoursesResult> {
    this.SetCompanyContext(params.CompanyID);

    const queryParams = this.buildQueryParams(params);

    const courses = await this.makeLearnWorldsPaginatedRequest<LWApiCourse>('courses', queryParams, contextUser);

    const mappedCourses: LearnWorldsCourse[] = courses.map((course) => this.mapLearnWorldsCourse(course));
    const summary = this.calculateCourseCatalogSummary(mappedCourses);

    return {
      Courses: mappedCourses,
      TotalCount: mappedCourses.length,
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
      const typedParams = this.extractGetCoursesParams(Params);
      const result = await this.GetCourses(typedParams, ContextUser);

      this.setOutputParam(Params, 'Courses', result.Courses);
      this.setOutputParam(Params, 'TotalCount', result.TotalCount);
      this.setOutputParam(Params, 'Summary', result.Summary);

      return this.buildSuccessResult(`Successfully retrieved ${result.TotalCount} courses from LearnWorlds`, Params);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error occurred';
      return this.buildErrorResult('ERROR', msg, Params);
    }
  }

  /**
   * Extract typed params from framework ActionParam[]
   */
  private extractGetCoursesParams(params: ActionParam[]): GetCoursesParams {
    return {
      CompanyID: this.getRequiredStringParam(params, 'CompanyID'),
      SearchText: this.getOptionalStringParam(params, 'SearchText'),
      Status: this.getOptionalStringParam(params, 'Status'),
      CategoryID: this.getOptionalStringParam(params, 'CategoryID'),
      Level: this.getOptionalStringParam(params, 'Level'),
      Language: this.getOptionalStringParam(params, 'Language'),
      OnlyFree: this.getOptionalBooleanParam(params, 'OnlyFree', false),
      MinPrice: this.getOptionalNumberParam(params, 'MinPrice', 0),
      MaxPrice: this.getOptionalNumberParam(params, 'MaxPrice', 0),
      Tags: this.getOptionalStringParam(params, 'Tags'),
      InstructorID: this.getOptionalStringParam(params, 'InstructorID'),
      CreatedAfter: this.getOptionalStringParam(params, 'CreatedAfter'),
      CreatedBefore: this.getOptionalStringParam(params, 'CreatedBefore'),
      SortBy: this.getOptionalStringParam(params, 'SortBy'),
      SortOrder: (this.getOptionalStringParam(params, 'SortOrder') || 'desc') as 'asc' | 'desc',
      IncludeEnrollmentStats: this.getOptionalBooleanParam(params, 'IncludeEnrollmentStats', true),
      MaxResults: this.getOptionalNumberParam(params, 'MaxResults', LearnWorldsBaseAction.LW_MAX_PAGE_SIZE),
    };
  }

  /**
   * Build query parameters for the LearnWorlds API request
   */
  private buildQueryParams(params: GetCoursesParams): Record<string, string | number | boolean> {
    const queryParams: Record<string, string | number | boolean> = {};

    if (params.SearchText) {
      queryParams.search = params.SearchText;
    }
    if (params.Status) {
      queryParams.status = params.Status;
    }
    if (params.CategoryID) {
      queryParams.category_id = params.CategoryID;
    }
    if (params.Level) {
      queryParams.level = params.Level;
    }
    if (params.Language) {
      queryParams.language = params.Language;
    }
    if (params.OnlyFree) {
      queryParams.is_free = true;
    }
    if (params.MinPrice !== null && params.MinPrice !== undefined) {
      queryParams.min_price = params.MinPrice;
    }
    if (params.MaxPrice !== null && params.MaxPrice !== undefined) {
      queryParams.max_price = params.MaxPrice;
    }
    if (params.Tags) {
      queryParams.tags = params.Tags;
    }
    if (params.InstructorID) {
      queryParams.instructor_id = params.InstructorID;
    }
    if (params.CreatedAfter) {
      queryParams.created_after = this.formatLearnWorldsDate(new Date(params.CreatedAfter));
    }
    if (params.CreatedBefore) {
      queryParams.created_before = this.formatLearnWorldsDate(new Date(params.CreatedBefore));
    }

    const sortBy = params.SortBy || 'created';
    const sortOrder = params.SortOrder || 'desc';
    queryParams.sort = `${sortOrder === 'asc' ? '' : '-'}${sortBy}`;

    const includeEnrollmentStats = params.IncludeEnrollmentStats ?? true;
    if (includeEnrollmentStats) {
      queryParams.include = 'enrollment_stats';
    }

    const maxResults = params.MaxResults || 100;
    queryParams.limit = Math.min(maxResults, 100);

    return queryParams;
  }

  /**
   * Map LearnWorlds course data to our interface
   */
  private mapLearnWorldsCourse(lwCourse: LWApiCourse): LearnWorldsCourse {
    return {
      id: lwCourse.id || lwCourse._id || '',
      title: lwCourse.title,
      subtitle: lwCourse.subtitle,
      description: lwCourse.description,
      shortDescription: lwCourse.short_description || lwCourse.excerpt,

      status: this.mapCourseStatus(lwCourse.status || ''),
      visibility: this.mapCourseVisibility(lwCourse.visibility || lwCourse.access_type || ''),
      isActive: lwCourse.is_active !== false,
      isFree: lwCourse.is_free || lwCourse.price === 0 || false,

      price: lwCourse.price,
      currency: lwCourse.currency || 'USD',
      originalPrice: lwCourse.original_price,
      discountPercentage: this.calculateDiscountPercentage(lwCourse.original_price, lwCourse.price),

      categoryId: lwCourse.category_id || lwCourse.category?.id,
      categoryName: lwCourse.category_name || lwCourse.category?.name,
      tags: lwCourse.tags || [],
      level: this.mapCourseLevel(lwCourse.level || lwCourse.difficulty || ''),
      language: lwCourse.language || 'en',
      duration: lwCourse.duration || lwCourse.estimated_duration,

      thumbnailUrl: lwCourse.thumbnail_url || lwCourse.image,
      coverImageUrl: lwCourse.cover_image_url || lwCourse.cover_image,
      promoVideoUrl: lwCourse.promo_video_url || lwCourse.video_url,

      instructorId: lwCourse.instructor_id || lwCourse.instructor?.id || lwCourse.author_id,
      instructorName: lwCourse.instructor_name || lwCourse.instructor?.name || lwCourse.author_name,
      instructorBio: lwCourse.instructor_bio || lwCourse.instructor?.bio,
      instructorAvatarUrl: lwCourse.instructor_avatar || lwCourse.instructor?.avatar_url,

      totalUnits: lwCourse.total_units || lwCourse.sections_count || 0,
      totalLessons: lwCourse.total_lessons || lwCourse.lessons_count || 0,
      totalQuizzes: lwCourse.total_quizzes || lwCourse.quizzes_count || 0,
      totalAssignments: lwCourse.total_assignments || lwCourse.assignments_count || 0,
      estimatedDuration: lwCourse.estimated_duration || lwCourse.total_duration,

      totalEnrollments: lwCourse.total_enrollments || lwCourse.students_count || 0,
      activeEnrollments: lwCourse.active_enrollments || lwCourse.active_students || 0,
      completionRate: lwCourse.completion_rate || 0,
      averageRating: lwCourse.average_rating || lwCourse.rating,
      totalReviews: lwCourse.total_reviews || lwCourse.reviews_count,

      createdAt: this.parseLearnWorldsDate(lwCourse.created || lwCourse.created_at || ''),
      updatedAt: this.parseLearnWorldsDate(lwCourse.updated || lwCourse.updated_at || ''),
      publishedAt: lwCourse.published_at ? this.parseLearnWorldsDate(lwCourse.published_at) : undefined,
      enrollmentStartDate: lwCourse.enrollment_start ? this.parseLearnWorldsDate(lwCourse.enrollment_start) : undefined,
      enrollmentEndDate: lwCourse.enrollment_end ? this.parseLearnWorldsDate(lwCourse.enrollment_end) : undefined,

      requiresApproval: lwCourse.requires_approval || false,
      hasPrerequisites: lwCourse.has_prerequisites || false,
      prerequisites: lwCourse.prerequisites || [],
      certificateAvailable: lwCourse.certificate_available || lwCourse.has_certificate || false,

      objectives: lwCourse.objectives || lwCourse.learning_objectives || [],
      targetAudience: lwCourse.target_audience || [],
      requirements: lwCourse.requirements || lwCourse.prerequisites_text || [],
    };
  }

  /**
   * Map course status
   */
  private mapCourseStatus(status: string): 'published' | 'draft' | 'coming_soon' {
    const statusMap: Record<string, 'published' | 'draft' | 'coming_soon'> = {
      published: 'published',
      active: 'published',
      draft: 'draft',
      unpublished: 'draft',
      coming_soon: 'coming_soon',
      upcoming: 'coming_soon',
    };

    return statusMap[status?.toLowerCase()] || 'draft';
  }

  /**
   * Map course visibility
   */
  private mapCourseVisibility(visibility: string): 'public' | 'private' | 'hidden' {
    const visibilityMap: Record<string, 'public' | 'private' | 'hidden'> = {
      public: 'public',
      open: 'public',
      private: 'private',
      closed: 'private',
      hidden: 'hidden',
      unlisted: 'hidden',
    };

    return visibilityMap[visibility?.toLowerCase()] || 'public';
  }

  /**
   * Map course level
   */
  private mapCourseLevel(level: string): 'beginner' | 'intermediate' | 'advanced' | 'all' {
    const levelMap: Record<string, 'beginner' | 'intermediate' | 'advanced' | 'all'> = {
      beginner: 'beginner',
      basic: 'beginner',
      introductory: 'beginner',
      intermediate: 'intermediate',
      medium: 'intermediate',
      advanced: 'advanced',
      expert: 'advanced',
      all: 'all',
      any: 'all',
      mixed: 'all',
    };

    return levelMap[level?.toLowerCase()] || 'all';
  }

  /**
   * Calculate discount percentage
   */
  private calculateDiscountPercentage(originalPrice?: number, currentPrice?: number): number | undefined {
    if (!originalPrice || !currentPrice || originalPrice <= currentPrice) {
      return undefined;
    }

    return Math.round(((originalPrice - currentPrice) / originalPrice) * 100);
  }

  /**
   * Calculate course catalog summary
   */
  private calculateCourseCatalogSummary(courses: LearnWorldsCourse[]): CourseCatalogSummary {
    const summary: CourseCatalogSummary = {
      totalCourses: courses.length,
      publishedCourses: courses.filter((c) => c.status === 'published').length,
      draftCourses: courses.filter((c) => c.status === 'draft').length,
      freeCourses: courses.filter((c) => c.isFree).length,
      paidCourses: courses.filter((c) => !c.isFree).length,

      categoryCounts: {},
      levelCounts: {},
      languageCounts: {},

      enrollmentStats: {
        totalEnrollments: 0,
        averageEnrollmentsPerCourse: 0,
        mostPopularCourses: [],
      },

      priceStats: {
        averagePrice: 0,
        minPrice: 0,
        maxPrice: 0,
        currency: 'USD',
      },
    };

    this.populateCategoryCounts(courses, summary);
    this.populateEnrollmentStats(courses, summary);
    this.populatePriceStats(courses, summary);

    return summary;
  }

  /**
   * Populate category, level, and language counts in the summary
   */
  private populateCategoryCounts(courses: LearnWorldsCourse[], summary: CourseCatalogSummary): void {
    courses.forEach((course) => {
      if (course.categoryName) {
        summary.categoryCounts[course.categoryName] = (summary.categoryCounts[course.categoryName] || 0) + 1;
      }
      if (course.level) {
        summary.levelCounts[course.level] = (summary.levelCounts[course.level] || 0) + 1;
      }
      if (course.language) {
        summary.languageCounts[course.language] = (summary.languageCounts[course.language] || 0) + 1;
      }

      summary.enrollmentStats.totalEnrollments += course.totalEnrollments;
    });
  }

  /**
   * Populate enrollment statistics in the summary
   */
  private populateEnrollmentStats(courses: LearnWorldsCourse[], summary: CourseCatalogSummary): void {
    if (courses.length > 0) {
      summary.enrollmentStats.averageEnrollmentsPerCourse = Math.round(summary.enrollmentStats.totalEnrollments / courses.length);
    }

    summary.enrollmentStats.mostPopularCourses = courses
      .filter((c) => c.totalEnrollments > 0)
      .sort((a, b) => b.totalEnrollments - a.totalEnrollments)
      .slice(0, 5)
      .map((c) => ({
        id: c.id,
        title: c.title,
        enrollments: c.totalEnrollments,
      }));
  }

  /**
   * Populate price statistics in the summary
   */
  private populatePriceStats(courses: LearnWorldsCourse[], summary: CourseCatalogSummary): void {
    const paidCourses = courses.filter((c) => !c.isFree && c.price !== undefined);
    if (paidCourses.length > 0) {
      const prices = paidCourses.map((c) => c.price!);
      summary.priceStats = {
        averagePrice: Math.round(prices.reduce((sum, p) => sum + p, 0) / prices.length),
        minPrice: Math.min(...prices),
        maxPrice: Math.max(...prices),
        currency: paidCourses[0].currency || 'USD',
      };
    }
  }

  /**
   * Define the parameters for this action
   */
  public get Params(): ActionParam[] {
    const baseParams = this.getCommonLMSParams();

    const specificParams: ActionParam[] = [
      {
        Name: 'SearchText',
        Type: 'Input',
        Value: null,
      },
      {
        Name: 'Status',
        Type: 'Input',
        Value: null,
      },
      {
        Name: 'CategoryID',
        Type: 'Input',
        Value: null,
      },
      {
        Name: 'Level',
        Type: 'Input',
        Value: null,
      },
      {
        Name: 'Language',
        Type: 'Input',
        Value: null,
      },
      {
        Name: 'OnlyFree',
        Type: 'Input',
        Value: false,
      },
      {
        Name: 'MinPrice',
        Type: 'Input',
        Value: null,
      },
      {
        Name: 'MaxPrice',
        Type: 'Input',
        Value: null,
      },
      {
        Name: 'Tags',
        Type: 'Input',
        Value: null,
      },
      {
        Name: 'InstructorID',
        Type: 'Input',
        Value: null,
      },
      {
        Name: 'CreatedAfter',
        Type: 'Input',
        Value: null,
      },
      {
        Name: 'CreatedBefore',
        Type: 'Input',
        Value: null,
      },
      {
        Name: 'SortBy',
        Type: 'Input',
        Value: 'created',
      },
      {
        Name: 'SortOrder',
        Type: 'Input',
        Value: 'desc',
      },
      {
        Name: 'IncludeEnrollmentStats',
        Type: 'Input',
        Value: true,
      },
      {
        Name: 'MaxResults',
        Type: 'Input',
        Value: 100,
      },
    ];

    return [...baseParams, ...specificParams];
  }
}
