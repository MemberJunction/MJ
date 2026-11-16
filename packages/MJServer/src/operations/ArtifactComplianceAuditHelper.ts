import { LogError, type IMetadataProvider, type RemoteOpServerContext, RemoteOperationError, BaseRemotableOperation, type UserInfo } from '@memberjunction/core';
import {
    ARTIFACT_LOG_COMPLIANCE_AUDIT_KEY,
    ArtifactComplianceAuditOperation,
    type ArtifactComplianceAuditInput,
    type ArtifactComplianceAuditOutput,
    ArtifactPermissionEngine,
    type MJAuditLogEntity,
} from '@memberjunction/core-entities';
import { UserCache } from '@memberjunction/generic-database-provider';
import { RegisterClass } from '@memberjunction/global';

const AUDIT_LOG_ENTITY = 'MJ: Audit Logs';
const ARTIFACTS_ENTITY = 'MJ: Artifacts';

/**
 * Input parameters for {@link WriteArtifactComplianceAudit}.
 */
export interface WriteArtifactComplianceAuditParams {
    /** Canonical audit log type name (matches `metadata/audit-log-types/.artifact-compliance-audit-types.json`). */
    AuditLogTypeName: string;
    /** Target `MJ: Artifacts.ID`. */
    ArtifactID: string;
    /** Optional `MJ: Artifact Versions.ID`. */
    ArtifactVersionID?: string | null;
    /** Concise human-readable summary stored in `Description`. */
    Summary: string;
    /** Outcome status (`'Success'` or `'Failed'`). Defaults to `'Success'`. */
    Status?: 'Success' | 'Failed';
    /** Optional structured details serialized to `Details` JSON. */
    Details?: Record<string, unknown>;
}

/**
 * Writes an immutable `MJ: Audit Logs` record for an artifact compliance action (block freeze,
 * Connected Drive sync, export, permission change, or external guest share lifecycle).
 *
 * Non-throwing by design: when no metadata provider, system writer, or seeded audit log type
 * row is available, it logs to the server error log and returns `{ Recorded: false, AuditLogID: null }`.
 */
export async function WriteArtifactComplianceAudit(
    provider: IMetadataProvider | null | undefined,
    user: UserInfo | null | undefined,
    params: WriteArtifactComplianceAuditParams,
): Promise<{ Recorded: boolean; AuditLogID: string | null }> {
    try {
        const writer = UserCache.Instance.GetSystemUser() ?? user ?? null;
        const normalizedTypeName = params.AuditLogTypeName.trim().toLowerCase();
        const auditTypes = provider?.AuditLogTypes ?? [];
        const auditType = auditTypes.find((t) => (t.Name ?? '').trim().toLowerCase() === normalizedTypeName);
        if (!provider || !writer || !auditType) {
            const reason = !provider
                ? 'no metadata provider'
                : !writer
                  ? 'no system or acting user'
                  : `audit log type '${params.AuditLogTypeName}' is not seeded`;
            LogError(
                `Artifact compliance audit not persisted (${reason}) [${params.AuditLogTypeName}] on artifact '${params.ArtifactID}': ${params.Summary}`,
            );
            return { Recorded: false, AuditLogID: null };
        }

        const row = await provider.GetEntityObject<MJAuditLogEntity>(AUDIT_LOG_ENTITY, writer);
        row.NewRecord();
        if (user?.ID) {
            row.UserID = user.ID;
        }
        row.AuditLogTypeID = auditType.ID;
        row.Status = params.Status ?? 'Success';
        row.EntityID = provider.EntityByName(ARTIFACTS_ENTITY)?.ID ?? null;
        row.RecordID = params.ArtifactID;
        row.Description = params.Summary;
        row.Details = JSON.stringify({
            artifactVersionId: params.ArtifactVersionID ?? null,
            ...(params.Details ?? {}),
        });

        const saved = await row.Save();
        if (!saved) {
            LogError(
                `Artifact compliance audit save failed for '${params.ArtifactID}' (${params.AuditLogTypeName}): ${
                    row.LatestResult?.CompleteMessage ?? 'unknown save error'
                }`,
            );
            return { Recorded: false, AuditLogID: null };
        }
        return { Recorded: true, AuditLogID: row.ID || null };
    } catch (error) {
        LogError(
            `Artifact compliance audit write threw for '${params.ArtifactID}' (${params.AuditLogTypeName}): ${
                error instanceof Error ? error.message : String(error)
            }`,
        );
        return { Recorded: false, AuditLogID: null };
    }
}

/**
 * Server-side Remote Operation implementing `Artifact.LogComplianceAudit` (`§6.3`).
 */
@RegisterClass(BaseRemotableOperation, ARTIFACT_LOG_COMPLIANCE_AUDIT_KEY)
export class ArtifactComplianceAuditServerOperation extends ArtifactComplianceAuditOperation {
    protected override async Authorize(
        input: ArtifactComplianceAuditInput,
        user: UserInfo,
        context?: RemoteOpServerContext,
    ): Promise<boolean> {
        const provider = context?.provider;
        if (!provider) {
            throw new RemoteOperationError('NO_PROVIDER', 'Metadata provider is required.');
        }
        const artifactId = (input.ArtifactID ?? '').trim();
        if (!artifactId) {
            throw new RemoteOperationError('INVALID_INPUT', 'ArtifactID is required.');
        }
        const perms = await ArtifactPermissionEngine.Instance.ResolvePermissions(provider, artifactId, user);
        if (!perms.CanRead) {
            throw new RemoteOperationError(
                'ACCESS_DENIED',
                perms.Reason || `User lacks permission to audit artifact '${artifactId}'.`,
            );
        }
        return true;
    }

    protected override async InternalExecute(
        input: ArtifactComplianceAuditInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<ArtifactComplianceAuditOutput> {
        return await WriteArtifactComplianceAudit(provider, user, {
            AuditLogTypeName: input.AuditLogTypeName,
            ArtifactID: input.ArtifactID,
            ArtifactVersionID: input.ArtifactVersionID ?? null,
            Summary: input.Summary,
            Details: input.Details,
        });
    }
}

/** Ensures {@link ArtifactComplianceAuditServerOperation} is retained by tree-shakers and registered in ClassFactory. */
export function LoadArtifactComplianceAuditOperation(): void {
    void ArtifactComplianceAuditServerOperation;
}
