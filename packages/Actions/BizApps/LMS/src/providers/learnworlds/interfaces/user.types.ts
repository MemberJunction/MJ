import { LearnWorldsBaseParams, LearnWorldsUser } from './common.types';

/**
 * Parameters for the CreateUser action
 */
export interface CreateUserParams extends LearnWorldsBaseParams {
  Email: string;
  Username?: string;
  Password?: string;
  FirstName?: string;
  LastName?: string;
  Role?: string;
  IsActive?: boolean;
  SendWelcomeEmail?: boolean;
  Tags?: string | string[];
  CustomFields?: Record<string, unknown>;
  EnrollInCourses?: string | string[];
}

/**
 * Result of the CreateUser action
 */
export interface CreateUserResult {
  UserDetails: CreateUserDetails;
  EnrollmentResults: CreateUserEnrollmentResult[];
  Summary: CreateUserSummary;
}

export interface CreateUserDetails {
  id: string;
  email: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  fullName: string;
  role: string;
  status: string;
  tags: string[];
  customFields: Record<string, unknown>;
  createdAt?: string;
  loginUrl?: string;
  resetPasswordUrl?: string;
}

export interface CreateUserEnrollmentResult {
  courseId: string;
  success: boolean;
  enrollmentId?: string;
  error?: string;
}

export interface CreateUserSummary {
  userId: string;
  email: string;
  username?: string;
  fullName: string;
  role: string;
  status: string;
  welcomeEmailSent: boolean;
  coursesEnrolled: number;
  totalCoursesRequested: number;
  loginUrl?: string;
}

/**
 * Parameters for the UpdateUser action
 */
export interface UpdateUserParams extends LearnWorldsBaseParams {
  UserID: string;
  Email?: string;
  Username?: string;
  Password?: string;
  FirstName?: string;
  LastName?: string;
  Role?: string;
  IsActive?: boolean;
  Tags?: string[];
  CustomFields?: Record<string, unknown>;
}

/**
 * Result of the UpdateUser action
 */
export interface UpdateUserResult {
  UserDetails: LearnWorldsUser;
  Summary: UpdateUserSummary;
}

export interface UpdateUserSummary {
  userId: string;
  email: string;
  fieldsUpdated: string[];
}

/**
 * Parameters for the GetUsers action
 */
export interface GetUsersParams extends LearnWorldsBaseParams {
  SearchText?: string;
  Role?: string;
  Status?: string;
  Tags?: string;
  CreatedAfter?: string;
  CreatedBefore?: string;
  SortBy?: string;
  SortOrder?: 'asc' | 'desc';
  IncludeCourseStats?: boolean;
  MaxResults?: number;
}

/**
 * Result of the GetUsers action
 */
export interface GetUsersResult {
  Users: LearnWorldsUser[];
  TotalCount: number;
  Summary: UsersSummary;
}

export interface UsersSummary {
  totalUsers: number;
  activeUsers: number;
  inactiveUsers: number;
  suspendedUsers: number;
  usersByRole: Record<string, number>;
  averageCoursesPerUser: number;
  totalTimeSpent: number;
  mostActiveUsers: Array<{ id: string; name: string; completedCourses?: number }>;
  recentSignups: Array<{ id: string; name: string; signupDate: Date }>;
}

/**
 * Parameters for the GetUserDetails action
 */
export interface GetUserDetailsParams extends LearnWorldsBaseParams {
  UserID: string;
  IncludeEnrollments?: boolean;
  IncludeStats?: boolean;
}

/**
 * Result of the GetUserDetails action
 */
export interface GetUserDetailsResult {
  UserDetails: LearnWorldsUserDetailsFull;
  Summary: Record<string, unknown>;
}

/**
 * Full user details including enrollment and achievement data
 */
export interface LearnWorldsUserDetailsFull {
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
  avatarUrl?: string;
  bio?: string;
  location?: string;
  timezone?: string;
  language?: string;
  phone?: string;
  tags?: string[];
  customFields?: Record<string, unknown>;
  totalCourses: number;
  completedCourses: number;
  inProgressCourses: number;
  notStartedCourses: number;
  totalTimeSpent: number;
  averageCompletionRate: number;
  lastActivityDate?: Date;
  enrollments?: UserDetailEnrollment[];
  totalCertificates: number;
  totalBadges: number;
  points?: number;
  level?: string;
  emailNotifications?: boolean;
  twoFactorEnabled?: boolean;
  agreedToTerms?: boolean;
  marketingConsent?: boolean;
}

/**
 * Enrollment details nested in user details
 */
export interface UserDetailEnrollment {
  courseId: string;
  courseTitle: string;
  enrolledAt: Date;
  status: 'active' | 'completed' | 'expired' | 'suspended';
  progress: number;
  completedAt?: Date;
  expiresAt?: Date;
  lastAccessedAt?: Date;
  timeSpent: number;
  certificateUrl?: string;
  grade?: number;
}
