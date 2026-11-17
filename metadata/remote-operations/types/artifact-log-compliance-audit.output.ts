/** Output payload returned by `Artifact.LogComplianceAudit`. */
export interface ArtifactComplianceAuditOutput {
    /** True when the audit row persisted (false only if DB/metadata is unavailable). */
    Recorded: boolean;
    /** Persisted `MJ: Audit Logs.ID` when recorded. */
    AuditLogID?: string | null;
}
