import { LearnWorldsUser, LearnWorldsCourse, LearnWorldsEnrollment, LearnWorldsCertificate } from './common.types';

/**
 * Payload for bulk data consumers that need to sync LearnWorlds data
 * into MemberJunction or external systems.
 */
export interface LearnWorldsSyncPayload {
  users?: LearnWorldsUser[];
  courses?: LearnWorldsCourse[];
  enrollments?: LearnWorldsEnrollment[];
  certificates?: LearnWorldsCertificate[];
  syncedAt: string;
  companyId: string;
}

/**
 * Error encountered during a sync operation
 */
export interface SyncError {
  entity: 'user' | 'course' | 'enrollment' | 'certificate';
  entityId: string;
  operation: 'create' | 'update' | 'delete' | 'read';
  message: string;
  timestamp: string;
}
