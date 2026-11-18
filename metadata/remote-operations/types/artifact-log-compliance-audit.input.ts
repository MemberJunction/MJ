export type ArtifactComplianceAuditDetailPrimitive = string | number | boolean | null | undefined;

export type ArtifactComplianceAuditDetails = Record<
    string,
    ArtifactComplianceAuditDetailPrimitive | ArtifactComplianceAuditDetailPrimitive[] | Record<string, ArtifactComplianceAuditDetailPrimitive>
>;

/** Canonical artifact compliance audit event names aligned with `metadata/audit-log-types/`. */
export type ArtifactComplianceAuditEventName =
    | 'Artifact Block Frozen'
    | 'Artifact Connected Drive Sync'
    | 'Artifact Exported'
    | 'Artifact Permission Changed'
    | 'Artifact Guest Share Link';

/** Input payload for `Artifact.LogComplianceAudit`. */
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
    Details?: ArtifactComplianceAuditDetails;
}
