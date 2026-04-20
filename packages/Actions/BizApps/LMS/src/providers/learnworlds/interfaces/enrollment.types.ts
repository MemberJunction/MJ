import { LearnWorldsBaseParams, LearnWorldsEnrollment } from './common.types';

/**
 * Parameters for the EnrollUser action.
 * Supports both course and bundle enrollment via ProductType.
 */
export interface EnrollUserParams extends LearnWorldsBaseParams {
  UserID: string;
  CourseID: string;
  ProductType?: 'course' | 'bundle';
  Price?: number;
  Justification?: string;
  NotifyUser?: boolean;
  StartDate?: string;
  ExpiryDate?: string;
}

/**
 * Result of the EnrollUser action
 */
export interface EnrollUserResult {
  EnrollmentDetails: LearnWorldsEnrollment;
  Summary: EnrollUserSummary;
}

export interface EnrollUserSummary {
  enrollmentId: string;
  userId: string;
  userName: string;
  courseId: string;
  courseTitle: string;
  enrolledAt: string;
  status: string;
  price: number;
  notificationSent: boolean;
}

/**
 * Parameters for the GetUserEnrollments action
 */
export interface GetUserEnrollmentsParams extends LearnWorldsBaseParams {
  UserID: string;
  Status?: string;
  IncludeExpired?: boolean;
  IncludeCourseDetails?: boolean;
  SortBy?: string;
  SortOrder?: 'asc' | 'desc';
  MaxResults?: number;
}

/**
 * Result of the GetUserEnrollments action
 */
export interface GetUserEnrollmentsResult {
  Enrollments: FormattedEnrollment[];
  TotalCount: number;
  Summary: EnrollmentsSummary;
}

export interface FormattedEnrollment {
  id: string;
  courseId: string;
  enrolledAt?: string;
  startsAt?: string;
  expiresAt?: string;
  status: string;
  progress: {
    percentage: number;
    completedUnits: number;
    totalUnits: number;
    completedLessons: number;
    totalLessons: number;
    lastAccessedAt?: string;
    totalTimeSpent: number;
    totalTimeSpentText: string;
  };
  grade?: number;
  certificateEligible: boolean;
  certificateIssuedAt?: string;
  completedAt?: string;
  course?: {
    id: string;
    title: string;
    description?: string;
    imageUrl?: string;
    level?: string;
    duration?: number;
    durationText?: string;
    instructorName?: string;
    certificateEnabled: boolean;
  };
}

export interface EnrollmentsSummary {
  userId: string;
  totalEnrollments: number;
  activeEnrollments: number;
  completedEnrollments: number;
  expiredEnrollments: number;
  inProgressEnrollments: number;
  averageProgressPercentage: number;
  totalTimeSpent: number;
  totalTimeSpentText: string;
  certificatesEarned: number;
  enrollmentsByStatus: {
    active: number;
    completed: number;
    expired: number;
  };
}

/**
 * Parameters for the UpdateUserProgress action
 */
export interface UpdateUserProgressParams extends LearnWorldsBaseParams {
  UserID: string;
  CourseID: string;
  LessonID?: string;
  ProgressPercentage?: number;
  Completed?: boolean;
  TimeSpent?: number;
  Score?: number;
  Notes?: string;
}

/**
 * Result of the UpdateUserProgress action
 */
export interface UpdateUserProgressResult {
  ProgressDetails: ProgressDetails;
  Summary: ProgressUpdateSummary;
}

export interface ProgressDetails {
  userId: string;
  courseId: string;
  lessonId?: string;
  previousProgress: {
    percentage: number;
    completedUnits: number;
    totalTimeSpent: number;
  };
  updatedProgress: {
    percentage: number;
    completedUnits: number;
    totalUnits: number;
    totalTimeSpent: number;
    totalTimeSpentText: string;
    lastAccessedAt: string;
    completed: boolean;
    completedAt?: string;
  };
  updateType: 'lesson' | 'course';
  updateResult: ProgressUpdateResult;
}

/**
 * Accumulator for progress update results (lesson and/or course)
 */
export interface ProgressUpdateResult {
  lessonProgress?: Record<string, unknown>;
  courseProgress?: Record<string, unknown>;
}

export interface ProgressUpdateSummary {
  userId: string;
  courseId: string;
  lessonId?: string;
  progressIncreased: boolean;
  previousPercentage: number;
  newPercentage: number;
  timeAdded: number;
  totalTimeSpent: number;
  isCompleted: boolean;
  updateType: 'lesson' | 'course';
}
