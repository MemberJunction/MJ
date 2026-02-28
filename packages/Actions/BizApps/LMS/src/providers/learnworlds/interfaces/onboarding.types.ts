import { LearnWorldsBaseParams } from './common.types';

/**
 * Parameters for the OnboardLearner orchestration action.
 * Composes CreateUser + EnrollUser + SSO in a single call.
 */
export interface OnboardLearnerParams extends LearnWorldsBaseParams {
  Email: string;
  FirstName?: string;
  LastName?: string;
  Role?: string;
  Tags?: string[];
  CustomFields?: Record<string, unknown>;
  CourseIDs?: string[];
  BundleIDs?: string[];
  RedirectTo?: string;
  SendWelcomeEmail?: boolean;
}

/**
 * Result of the OnboardLearner action
 */
export interface OnboardLearnerResult {
  Success: boolean;
  LoginURL?: string;
  LearnWorldsUserId: string;
  IsNewUser: boolean;
  Enrollments: OnboardLearnerEnrollmentResult[];
  Errors: string[];
}

/**
 * Per-enrollment result within OnboardLearner
 */
export interface OnboardLearnerEnrollmentResult {
  productId: string;
  productType: 'course' | 'bundle';
  success: boolean;
  enrollmentId?: string;
  error?: string;
}
