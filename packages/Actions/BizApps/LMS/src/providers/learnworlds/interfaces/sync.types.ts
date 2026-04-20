import { LearnWorldsBaseParams, LearnWorldsUser, LearnWorldsCourse, LearnWorldsBundle, LearnWorldsEnrollment, LearnWorldsCertificate } from './common.types';
import { UserLearningProgress } from './course.types';
import { FormattedQuizResult } from './quiz.types';

/**
 * Payload for bulk data consumers that need to sync LearnWorlds data
 * into MemberJunction or external systems.
 */
export interface LearnWorldsSyncPayload {
  users?: LearnWorldsUser[];
  courses?: LearnWorldsCourse[];
  bundles?: LearnWorldsBundle[];
  enrollments?: LearnWorldsEnrollment[];
  progress?: UserLearningProgress[];
  certificates?: LearnWorldsCertificate[];
  quizResults?: FormattedQuizResult[];
  syncedAt: string;
  companyId: string;
  totalApiCalls: number;
  errors: SyncError[];
}

/**
 * Error encountered during a sync operation
 */
export interface SyncError {
  entity: 'user' | 'course' | 'bundle' | 'enrollment' | 'progress' | 'certificate' | 'quizResult';
  entityId: string;
  operation: 'create' | 'update' | 'delete' | 'read';
  message: string;
  timestamp: string;
}

/**
 * Parameters for the GetBulkData action
 */
export interface BulkDataParams extends LearnWorldsBaseParams {
  IncludeUsers?: boolean;
  IncludeCourses?: boolean;
  IncludeBundles?: boolean;
  IncludeEnrollments?: boolean;
  IncludeProgress?: boolean;
  IncludeCertificates?: boolean;
  IncludeQuizResults?: boolean;
  MaxResultsPerEntity?: number;
}
