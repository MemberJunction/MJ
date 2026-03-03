import { RegisterClass } from '@memberjunction/global';
import { LearnWorldsBaseAction } from '../learnworlds-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';
import { UserInfo } from '@memberjunction/core';
import {
  GetCourseDetailsParams,
  GetCourseDetailsResult,
  CourseDetailsData,
  CourseModule,
  CourseLesson,
  CourseInstructor,
  CourseStats,
  CourseDetailsSummary,
} from '../interfaces';

/**
 * Raw API shape for a course response from LearnWorlds
 */
interface LWApiCourseResponse {
  success?: boolean;
  data?: LWApiCourseData;
  message?: string;
}

interface LWApiCourseData {
  id: string;
  title: string;
  slug?: string;
  description?: string;
  short_description?: string;
  status?: string;
  price?: number;
  original_price?: number;
  currency?: string;
  level?: string;
  language?: string;
  duration?: number;
  total_enrollments?: number;
  average_rating?: number;
  total_ratings?: number;
  tags?: string[];
  categories?: string[];
  image_url?: string;
  video_url?: string;
  certificate_enabled?: boolean;
  created_at?: string;
  updated_at?: string;
  published_at?: string;
}

/**
 * Raw API shape for sections/modules response
 */
interface LWApiSectionsResponse {
  success?: boolean;
  data?: LWApiModuleData[] | { data: LWApiModuleData[] };
  message?: string;
}

interface LWApiModuleData {
  id: string;
  title: string;
  description?: string;
  order?: number;
  position?: number;
  duration?: number;
  total_lessons?: number;
  lessons?: LWApiLessonData[];
}

interface LWApiLessonData {
  id: string;
  title: string;
  type?: string;
  duration?: number;
  order?: number;
  position?: number;
  is_free?: boolean;
  has_video?: boolean;
  has_quiz?: boolean;
  has_assignment?: boolean;
}

/**
 * Raw API shape for instructors response
 */
interface LWApiInstructorsResponse {
  success?: boolean;
  data?: LWApiInstructorData[] | { data: LWApiInstructorData[] };
  message?: string;
}

interface LWApiInstructorData {
  id: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  bio?: string;
  title?: string;
  image_url?: string;
  avatar_url?: string;
  total_courses?: number;
  total_students?: number;
  average_rating?: number;
}

/**
 * Raw API shape for stats response
 */
interface LWApiStatsResponse {
  success?: boolean;
  data?: {
    total_enrollments?: number;
    active_students?: number;
    completion_rate?: number;
    average_progress?: number;
    average_time_to_complete?: number;
    total_revenue?: number;
  };
  message?: string;
}

/**
 * Action to retrieve comprehensive course details including curriculum structure
 */
@RegisterClass(BaseAction, 'GetLearnWorldsCourseDetailsAction')
export class GetLearnWorldsCourseDetailsAction extends LearnWorldsBaseAction {
  /**
   * Metadata about this action
   */
  public get Description(): string {
    return 'Retrieves comprehensive details about a specific LearnWorlds course including curriculum structure';
  }

  /**
   * Typed public method for direct (non-framework) callers.
   * Sets company context, fetches course details, and returns a strongly-typed result.
   * Throws on error.
   */
  public async GetCourseDetails(params: GetCourseDetailsParams, contextUser: UserInfo): Promise<GetCourseDetailsResult> {
    this.SetCompanyContext(params.CompanyID);

    const {
      CourseID: courseId,
      IncludeModules: includeModules = true,
      IncludeInstructors: includeInstructors = true,
      IncludeStats: includeStats = true,
    } = params;

    if (!courseId) {
      throw new Error('CourseID is required');
    }
    this.validatePathSegment(courseId, 'CourseID');

    // Get course details
    const courseResponse = await this.makeLearnWorldsRequest<LWApiCourseResponse>(`/courses/${courseId}`, 'GET', null, contextUser);

    if (!courseResponse.success || !courseResponse.data) {
      throw new Error(courseResponse.message || 'Failed to retrieve course details');
    }

    const course = courseResponse.data;
    const courseDetails = this.buildCourseDetails(course);

    if (includeModules) {
      await this.attachModules(courseId, courseDetails, contextUser);
    }

    if (includeInstructors) {
      await this.attachInstructors(courseId, courseDetails, contextUser);
    }

    if (includeStats) {
      await this.attachStats(courseId, courseDetails, contextUser);
    }

    const summary = this.buildCourseSummary(courseDetails);

    return {
      CourseDetails: courseDetails,
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
      const typedParams = this.extractGetCourseDetailsParams(Params);
      const result = await this.GetCourseDetails(typedParams, ContextUser);

      this.setOutputParam(Params, 'CourseDetails', result.CourseDetails);
      this.setOutputParam(Params, 'Summary', result.Summary);

      return this.buildSuccessResult('Course details retrieved successfully', Params);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error occurred';
      return this.buildErrorResult('ERROR', `Error retrieving course details: ${msg}`, Params);
    }
  }

  /**
   * Extract typed params from framework ActionParam[]
   */
  private extractGetCourseDetailsParams(params: ActionParam[]): GetCourseDetailsParams {
    return {
      CompanyID: this.getRequiredStringParam(params, 'CompanyID'),
      CourseID: this.getRequiredStringParam(params, 'CourseID'),
      IncludeModules: this.getOptionalBooleanParam(params, 'IncludeModules', true),
      IncludeInstructors: this.getOptionalBooleanParam(params, 'IncludeInstructors', true),
      IncludeStats: this.getOptionalBooleanParam(params, 'IncludeStats', true),
    };
  }

  /**
   * Build the base course details from raw API data
   */
  private buildCourseDetails(course: LWApiCourseData): CourseDetailsData {
    return {
      id: course.id,
      title: course.title,
      slug: course.slug,
      description: course.description,
      shortDescription: course.short_description,
      status: course.status || 'published',
      price: course.price || 0,
      originalPrice: course.original_price,
      currency: course.currency || 'USD',
      level: course.level || 'all',
      language: course.language || 'en',
      duration: course.duration,
      durationText: this.formatDuration(course.duration || 0),
      totalEnrollments: course.total_enrollments || 0,
      averageRating: course.average_rating,
      totalRatings: course.total_ratings || 0,
      tags: course.tags || [],
      categories: course.categories || [],
      imageUrl: course.image_url,
      videoUrl: course.video_url,
      certificateEnabled: course.certificate_enabled || false,
      createdAt: course.created_at,
      updatedAt: course.updated_at,
      publishedAt: course.published_at,
    };
  }

  /**
   * Fetch and attach modules/curriculum to course details
   */
  private async attachModules(courseId: string, courseDetails: CourseDetailsData, contextUser: UserInfo): Promise<void> {
    const modulesResponse = await this.makeLearnWorldsRequest<LWApiSectionsResponse>(`/courses/${courseId}/sections`, 'GET', null, contextUser);

    if (modulesResponse.success && modulesResponse.data) {
      const rawModules = Array.isArray(modulesResponse.data) ? modulesResponse.data : (modulesResponse.data as { data: LWApiModuleData[] }).data || [];

      courseDetails.modules = this.formatModules(rawModules);
      courseDetails.totalModules = courseDetails.modules.length;
      courseDetails.totalLessons = courseDetails.modules.reduce((sum, mod) => sum + (mod.lessons?.length || 0), 0);
    }
  }

  /**
   * Fetch and attach instructors to course details
   */
  private async attachInstructors(courseId: string, courseDetails: CourseDetailsData, contextUser: UserInfo): Promise<void> {
    const instructorsResponse = await this.makeLearnWorldsRequest<LWApiInstructorsResponse>(`/courses/${courseId}/instructors`, 'GET', null, contextUser);

    if (instructorsResponse.success && instructorsResponse.data) {
      const rawInstructors = Array.isArray(instructorsResponse.data)
        ? instructorsResponse.data
        : (instructorsResponse.data as { data: LWApiInstructorData[] }).data || [];

      courseDetails.instructors = this.formatInstructors(rawInstructors);
    }
  }

  /**
   * Fetch and attach stats to course details
   */
  private async attachStats(courseId: string, courseDetails: CourseDetailsData, contextUser: UserInfo): Promise<void> {
    const statsResponse = await this.makeLearnWorldsRequest<LWApiStatsResponse>(`/courses/${courseId}/stats`, 'GET', null, contextUser);

    if (statsResponse.success && statsResponse.data) {
      const statsData = statsResponse.data;
      courseDetails.stats = {
        totalEnrollments: statsData.total_enrollments || courseDetails.totalEnrollments,
        activeStudents: statsData.active_students || 0,
        completionRate: statsData.completion_rate || 0,
        averageProgressPercentage: statsData.average_progress || 0,
        averageTimeToComplete: statsData.average_time_to_complete,
        totalRevenue: statsData.total_revenue || 0,
      } satisfies CourseStats;
    }
  }

  /**
   * Format course modules/sections data
   */
  private formatModules(modules: LWApiModuleData[]): CourseModule[] {
    return modules
      .map((module) => ({
        id: module.id,
        title: module.title,
        description: module.description,
        order: module.order || module.position || 0,
        duration: module.duration,
        durationText: this.formatDuration(module.duration || 0),
        totalLessons: module.total_lessons || module.lessons?.length || 0,
        lessons: this.formatLessons(module.lessons || []),
      }))
      .sort((a, b) => a.order - b.order);
  }

  /**
   * Format lesson data within a module
   */
  private formatLessons(lessons: LWApiLessonData[]): CourseLesson[] {
    return lessons.map((lesson) => ({
      id: lesson.id,
      title: lesson.title,
      type: lesson.type || 'video',
      duration: lesson.duration,
      durationText: this.formatDuration(lesson.duration || 0),
      order: lesson.order || lesson.position || 0,
      isFree: lesson.is_free || false,
      hasVideo: lesson.has_video || false,
      hasQuiz: lesson.has_quiz || false,
      hasAssignment: lesson.has_assignment || false,
    }));
  }

  /**
   * Format instructor data
   */
  private formatInstructors(instructors: LWApiInstructorData[]): CourseInstructor[] {
    return instructors.map((instructor) => ({
      id: instructor.id,
      name: instructor.name || `${instructor.first_name || ''} ${instructor.last_name || ''}`.trim(),
      email: instructor.email,
      bio: instructor.bio,
      title: instructor.title,
      imageUrl: instructor.image_url || instructor.avatar_url,
      totalCourses: instructor.total_courses || 0,
      totalStudents: instructor.total_students || 0,
      averageRating: instructor.average_rating || 0,
    }));
  }

  /**
   * Build a summary from the course details
   */
  private buildCourseSummary(courseDetails: CourseDetailsData): CourseDetailsSummary {
    return {
      courseId: courseDetails.id,
      title: courseDetails.title,
      status: courseDetails.status,
      level: courseDetails.level,
      duration: courseDetails.durationText,
      totalModules: courseDetails.totalModules || 0,
      totalLessons: courseDetails.totalLessons || 0,
      totalEnrollments: courseDetails.totalEnrollments,
      averageRating: courseDetails.averageRating || 0,
      certificateEnabled: courseDetails.certificateEnabled,
      price: courseDetails.price,
      currency: courseDetails.currency,
    };
  }

  /**
   * Define the parameters this action expects
   */
  public get Params(): ActionParam[] {
    const baseParams = this.getCommonLMSParams();
    const specificParams: ActionParam[] = [
      {
        Name: 'CourseID',
        Type: 'Input',
        Value: null,
      },
      {
        Name: 'IncludeModules',
        Type: 'Input',
        Value: true,
      },
      {
        Name: 'IncludeInstructors',
        Type: 'Input',
        Value: true,
      },
      {
        Name: 'IncludeStats',
        Type: 'Input',
        Value: true,
      },
      {
        Name: 'CourseDetails',
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
}
