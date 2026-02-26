import { LearnWorldsBaseParams, LearnWorldsCourse } from './common.types';

/**
 * Parameters for the GetCourses action
 */
export interface GetCoursesParams extends LearnWorldsBaseParams {
  SearchText?: string;
  Status?: string;
  CategoryID?: string;
  Level?: string;
  Language?: string;
  OnlyFree?: boolean;
  MinPrice?: number;
  MaxPrice?: number;
  Tags?: string;
  InstructorID?: string;
  CreatedAfter?: string;
  CreatedBefore?: string;
  SortBy?: string;
  SortOrder?: 'asc' | 'desc';
  IncludeEnrollmentStats?: boolean;
  MaxResults?: number;
}

/**
 * Result of the GetCourses action
 */
export interface GetCoursesResult {
  Courses: LearnWorldsCourse[];
  TotalCount: number;
  Summary: CourseCatalogSummary;
}

/**
 * Summary statistics for the course catalog
 */
export interface CourseCatalogSummary {
  totalCourses: number;
  publishedCourses: number;
  draftCourses: number;
  freeCourses: number;
  paidCourses: number;
  categoryCounts: Record<string, number>;
  levelCounts: Record<string, number>;
  languageCounts: Record<string, number>;
  enrollmentStats: {
    totalEnrollments: number;
    averageEnrollmentsPerCourse: number;
    mostPopularCourses: Array<{
      id: string;
      title: string;
      enrollments: number;
    }>;
  };
  priceStats: {
    averagePrice: number;
    minPrice: number;
    maxPrice: number;
    currency: string;
  };
}

/**
 * Parameters for the GetCourseDetails action
 */
export interface GetCourseDetailsParams extends LearnWorldsBaseParams {
  CourseID: string;
  IncludeModules?: boolean;
  IncludeInstructors?: boolean;
  IncludeStats?: boolean;
}

/**
 * Result of the GetCourseDetails action
 */
export interface GetCourseDetailsResult {
  CourseDetails: CourseDetailsData;
  Summary: CourseDetailsSummary;
}

export interface CourseDetailsData {
  id: string;
  title: string;
  slug?: string;
  description?: string;
  shortDescription?: string;
  status: string;
  price: number;
  originalPrice?: number;
  currency: string;
  level: string;
  language: string;
  duration?: number;
  durationText?: string;
  totalEnrollments: number;
  averageRating?: number;
  totalRatings: number;
  tags: string[];
  categories: string[];
  imageUrl?: string;
  videoUrl?: string;
  certificateEnabled: boolean;
  createdAt?: string;
  updatedAt?: string;
  publishedAt?: string;
  modules?: CourseModule[];
  totalModules?: number;
  totalLessons?: number;
  instructors?: CourseInstructor[];
  stats?: CourseStats;
}

export interface CourseModule {
  id: string;
  title: string;
  description?: string;
  order: number;
  duration?: number;
  durationText?: string;
  totalLessons: number;
  lessons: CourseLesson[];
}

export interface CourseLesson {
  id: string;
  title: string;
  type: string;
  duration?: number;
  durationText?: string;
  order: number;
  isFree: boolean;
  hasVideo: boolean;
  hasQuiz: boolean;
  hasAssignment: boolean;
}

export interface CourseInstructor {
  id: string;
  name: string;
  email?: string;
  bio?: string;
  title?: string;
  imageUrl?: string;
  totalCourses: number;
  totalStudents: number;
  averageRating: number;
}

export interface CourseStats {
  totalEnrollments: number;
  activeStudents: number;
  completionRate: number;
  averageProgressPercentage: number;
  averageTimeToComplete?: number;
  totalRevenue: number;
}

/**
 * Summary view of course details
 */
export interface CourseDetailsSummary {
  courseId: string;
  title: string;
  status: string;
  level: string;
  duration?: string;
  totalModules: number;
  totalLessons: number;
  totalEnrollments: number;
  averageRating: number;
  certificateEnabled: boolean;
  price: number;
  currency: string;
}

/**
 * Parameters for the GetCourseAnalytics action
 */
export interface GetCourseAnalyticsParams extends LearnWorldsBaseParams {
  CourseID: string;
  DateFrom?: string;
  DateTo?: string;
  IncludeUserBreakdown?: boolean;
  IncludeModuleStats?: boolean;
  IncludeRevenue?: boolean;
}

/**
 * Result of the GetCourseAnalytics action
 */
export interface GetCourseAnalyticsResult {
  CourseAnalytics: CourseAnalyticsData;
  Summary: Record<string, unknown>;
}

export interface CourseAnalyticsData {
  courseId: string;
  period: { from: string; to: string };
  enrollment: {
    totalEnrollments: number;
    newEnrollments: number;
    activeStudents: number;
    enrollmentTrend: unknown[];
  };
  progress: {
    averageProgressPercentage: number;
    completionRate: number;
    totalCompletions: number;
    inProgressCount: number;
    notStartedCount: number;
    dropoutRate: number;
  };
  engagement: {
    averageTimeSpent: number;
    averageTimeSpentText: string;
    totalTimeSpent: number;
    totalTimeSpentText: string;
    averageSessionDuration: number;
    lastActivityDate?: string;
    dailyActiveUsers: unknown[];
  };
  performance: {
    averageQuizScore: number;
    passRate: number;
    certificatesIssued: number;
    averageTimeToComplete: number;
    averageTimeToCompleteText: string;
  };
  revenue?: {
    totalRevenue: number;
    currency: string;
    averageOrderValue: number;
    totalOrders: number;
    revenueTrend: unknown[];
    topMarkets: unknown[];
  };
  moduleStats?: unknown[];
  userBreakdown?: Record<string, unknown>;
}

/**
 * Course progress detail interfaces used by GetUserProgress
 */
export interface CourseProgress {
  courseId: string;
  courseTitle: string;
  enrollmentId: string;
  enrolledAt: Date;
  lastAccessedAt?: Date;
  progressPercentage: number;
  completedUnits: number;
  totalUnits: number;
  completedLessons: number;
  totalLessons: number;
  totalTimeSpent: number;
  averageSessionTime: number;
  estimatedTimeToComplete?: number;
  quizScoreAverage?: number;
  assignmentsCompleted?: number;
  assignmentsTotal?: number;
  currentGrade?: number;
  status: 'not_started' | 'in_progress' | 'completed' | 'expired';
  completedAt?: Date;
  expiresAt?: Date;
  certificateEarned: boolean;
  certificateUrl?: string;
  unitProgress?: UnitProgress[];
}

export interface UnitProgress {
  unitId: string;
  unitTitle: string;
  unitType: 'section' | 'chapter' | 'module';
  order: number;
  progressPercentage: number;
  completedLessons: number;
  totalLessons: number;
  timeSpent: number;
  status: 'not_started' | 'in_progress' | 'completed';
  startedAt?: Date;
  completedAt?: Date;
  lessons?: LessonProgress[];
}

export interface LessonProgress {
  lessonId: string;
  lessonTitle: string;
  lessonType: 'video' | 'text' | 'quiz' | 'assignment' | 'scorm' | 'interactive';
  order: number;
  completed: boolean;
  progressPercentage: number;
  timeSpent: number;
  startedAt?: Date;
  completedAt?: Date;
  lastAccessedAt?: Date;
  videoWatchTime?: number;
  videoTotalTime?: number;
  quizScore?: number;
  quizMaxScore?: number;
  quizAttempts?: number;
  assignmentSubmitted?: boolean;
  assignmentGrade?: number;
}

export interface UserLearningProgress {
  userId: string;
  userEmail: string;
  totalCourses: number;
  coursesCompleted: number;
  coursesInProgress: number;
  coursesNotStarted: number;
  overallProgressPercentage: number;
  totalTimeSpent: number;
  totalCertificatesEarned: number;
  averageQuizScore?: number;
  courses: CourseProgress[];
  learningStreak?: number;
  lastLearningDate?: Date;
  mostActiveDay?: string;
  preferredLearningTime?: string;
}

/**
 * Parameters for the GetUserProgress action
 */
export interface GetUserProgressParams extends LearnWorldsBaseParams {
  UserID: string;
  CourseID?: string;
  IncludeUnitDetails?: boolean;
  IncludeLessonDetails?: boolean;
}

/**
 * Result of the GetUserProgress action
 */
export interface GetUserProgressResult {
  UserProgress: UserLearningProgress;
  Summary: Record<string, unknown>;
}
