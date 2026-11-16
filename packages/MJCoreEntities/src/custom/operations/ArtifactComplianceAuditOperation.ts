import { BaseRemotableOperation } from '@memberjunction/core';

/**
 * Operation key for recording artifact compliance events (`MJ: Audit Logs`) on freeze, sync,
 * export, permission changes, and external guest share creation/revocation (`§6.3`).
 */
export const ARTIFACT_LOG_COMPLIANCE_AUDIT_KEY = 'Artifact.LogComplianceAudit';

/**
 * Canonical artifact compliance audit event names aligned with `metadata/audit-log-types/`.
 */
export type ArtifactComplianceAuditEventName =
    | 'Artifact Block Frozen'
    | 'Artifact Connected Drive Sync'
    | 'Artifact Exported'
    | 'Artifact Permission Changed'
    | 'Artifact Guest Share Link';

/**
 * Input payload for {@link ArtifactComplianceAuditOperation}.
 */
export interface ArtifactComplianceAuditInput {
    /** Canonical audit log type name (`MJ: Audit Log Types.Name`). */
    AuditLogTypeName: ArtifactComplianceAuditEventName | string;
    /** Target `MJ: Artifacts.ID`. */
    ArtifactID: string;
    /** Optional `MJ: Artifact Versions.ID`. */
    ArtifactVersionID?: string | null;
    /** Concise human-readable description stored in `Description`. */
    Summary: string;
    /** Optional structured details serialized to `Details` JSON. */
    Details?: Record<string, unknown>;
}

/**
 * Output payload returned by {@link ArtifactComplianceAuditOperation}.
 */
export interface ArtifactComplianceAuditOutput {
    /** True when the audit row persisted (false only if DB/metadata is unavailable). */
    Recorded: boolean;
    /** Persisted `MJ: Audit Logs.ID` when recorded. */
    AuditLogID?: string | null;
}

/**
 * Typed client-safe Remote Operation contract for writing artifact compliance audit events (`§6.3`).
 */
export class ArtifactComplianceAuditOperation extends BaseRemotableOperation<
    ArtifactComplianceAuditInput,
    ArtifactComplianceAuditOutput
> {
    public readonly OperationKey = ARTIFACT_LOG_COMPLIANCE_AUDIT_KEY;
    public readonly ExecutionMode = 'Sync' as const;
    public readonly RequiredScope = 'artifact:read';
    public readonly RequiresSystemUser = false;
}
