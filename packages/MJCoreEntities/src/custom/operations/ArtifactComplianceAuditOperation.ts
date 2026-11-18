/**
 * Operation key for recording artifact compliance events (`MJ: Audit Logs`) on freeze, sync,
 * export, permission changes, and external guest share creation/revocation (`§6.3`).
 */
export const ARTIFACT_LOG_COMPLIANCE_AUDIT_KEY = 'Artifact.LogComplianceAudit';

export { ArtifactLogComplianceAuditOperation as ArtifactComplianceAuditOperation } from '../../generated/remote_operations.js';
