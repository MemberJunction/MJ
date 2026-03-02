import { UserInfo } from '@memberjunction/core';

/**
 * Base parameters shared by all LearnWorlds actions.
 * Every typed public method requires at least a CompanyID.
 */
export interface LearnWorldsBaseParams {
  CompanyID: string;
}

/**
 * Standard representation of a LearnWorlds user across actions
 */
export interface LearnWorldsUser {
  id: string;
  email: string;
  username: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  status: 'active' | 'inactive' | 'suspended';
  role: string;
  createdAt: Date;
  lastLoginAt?: Date;
  tags?: string[];
  customFields?: Record<string, unknown>;
  totalCourses?: number;
  completedCourses?: number;
  inProgressCourses?: number;
  totalTimeSpent?: number;
  avatarUrl?: string;
  bio?: string;
  location?: string;
  timezone?: string;
}

/**
 * Standard representation of a LearnWorlds course
 */
export interface LearnWorldsCourse {
  id: string;
  title: string;
  subtitle?: string;
  description?: string;
  shortDescription?: string;
  status: 'published' | 'draft' | 'coming_soon';
  visibility: 'public' | 'private' | 'hidden';
  isActive: boolean;
  isFree: boolean;
  price?: number;
  currency?: string;
  originalPrice?: number;
  discountPercentage?: number;
  categoryId?: string;
  categoryName?: string;
  tags?: string[];
  level?: 'beginner' | 'intermediate' | 'advanced' | 'all';
  language?: string;
  duration?: number;
  thumbnailUrl?: string;
  coverImageUrl?: string;
  promoVideoUrl?: string;
  instructorId?: string;
  instructorName?: string;
  instructorBio?: string;
  instructorAvatarUrl?: string;
  totalUnits: number;
  totalLessons: number;
  totalQuizzes: number;
  totalAssignments: number;
  estimatedDuration?: number;
  totalEnrollments: number;
  activeEnrollments: number;
  completionRate: number;
  averageRating?: number;
  totalReviews?: number;
  createdAt: Date;
  updatedAt: Date;
  publishedAt?: Date;
  enrollmentStartDate?: Date;
  enrollmentEndDate?: Date;
  requiresApproval: boolean;
  hasPrerequisites: boolean;
  prerequisites?: string[];
  certificateAvailable: boolean;
  objectives?: string[];
  targetAudience?: string[];
  requirements?: string[];
}

/**
 * Standard representation of a LearnWorlds enrollment
 */
export interface LearnWorldsEnrollment {
  id: string;
  userId: string;
  courseId: string;
  enrolledAt: string;
  startsAt?: string;
  expiresAt?: string;
  status: string;
  price: number;
  progress: {
    percentage: number;
    completedUnits: number;
    totalUnits: number;
    lastAccessedAt?: string;
  };
  certificateEligible: boolean;
  certificateIssuedAt?: string;
}

/**
 * Standard representation of a LearnWorlds bundle
 */
export interface LearnWorldsBundle {
  id: string;
  title: string;
  description?: string;
  price?: number;
  currency?: string;
  courses: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  thumbnailUrl?: string;
  totalCourses: number;
  totalEnrollments: number;
}

/**
 * Standard representation of a LearnWorlds certificate
 */
export interface LearnWorldsCertificate {
  id: string;
  userId: string;
  courseId: string;
  certificateNumber?: string;
  issuedAt: string;
  expiresAt?: string;
  status: string;
  grade?: number;
  score?: number;
  completionPercentage: number;
}

/**
 * Progress data from LearnWorlds API (snake_case)
 */
export interface LearnWorldsCourseProgress {
  percentage: number;
  completedUnits: number;
  totalUnits: number;
  timeSpent: number;
}

/**
 * Paginated response structure from LearnWorlds API
 */
export interface LearnWorldsPaginatedResponse<T> {
  data: T[];
  meta?: {
    page: number;
    totalPages: number;
    totalItems: number;
  };
}

/**
 * Error shape returned by the LearnWorlds API
 */
export interface LearnWorldsAPIError {
  error?: {
    message?: string;
    code?: string;
  };
  message?: string;
  statusCode?: number;
}

/**
 * Raw LearnWorlds API user shape (snake_case)
 */
export interface LWApiUser {
  id?: string;
  _id?: string;
  email: string;
  username?: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  status?: string;
  role?: string;
  is_active?: boolean;
  created?: string | number;
  created_at?: string;
  last_login?: string | number;
  tags?: string[];
  custom_fields?: Record<string, unknown>;
  course_stats?: {
    total?: number;
    completed?: number;
    in_progress?: number;
    total_time_spent?: number;
  };
  avatar_url?: string;
  bio?: string;
  location?: string;
  timezone?: string;
  login_url?: string;
  reset_password_url?: string;
  send_welcome_email?: boolean;
}

/**
 * Raw LearnWorlds API enrollment status shape
 */
export interface LWApiEnrollmentStatus {
  completed?: boolean;
  expired?: boolean;
  suspended?: boolean;
  active?: boolean;
}

/**
 * Raw progress data shape from LearnWorlds API
 */
export interface LWApiProgressData {
  percentage?: number;
  completed_units?: number;
  total_units?: number;
  time_spent?: number;
}
