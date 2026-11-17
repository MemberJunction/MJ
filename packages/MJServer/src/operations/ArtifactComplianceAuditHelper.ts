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
import { IsValidUUID, RegisterClass } from '@memberjunction/global';

const AUDIT_LOG_ENTITY = 'MJ: Audit Logs';
const ARTIFACTS_ENTITY = 'MJ: Artifacts';
const MAX_AUDIT_SUMMARY_LENGTH = 1000;
const MAX_AUDIT_DETAILS_BYTES = 16_384;

export type AuditDetailPrimitive = string | number | boolean | null | undefined;
export type AuditDetailsRecord = Record<string, AuditDetailPrimitive | AuditDetailPrimitive[] | Record<string, AuditDetailPrimitive>>;

const CLIENT_CALLABLE_AUDIT_PERMISSION_MAP: ReadonlyMap<string, 'Read' | 'Edit'> = new Map([
    ['artifact exported', 'Read'],
    ['artifact connected drive sync', 'Edit'],
]);

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
    Details?: AuditDetailsRecord;
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
        row.Description = (params.Summary ?? '').trim().slice(0, MAX_AUDIT_SUMMARY_LENGTH);
        row.Details = JSON.stringify({
            ...(params.Details ?? {}),
            // Authoritative version ID overwrites any client-supplied key with the same name.
            artifactVersionId: params.ArtifactVersionID ?? null,
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
    public override get DisallowMagicLinkScope(): boolean {
        return true;
    }

    public override GetScopeResourceIds(input: ArtifactComplianceAuditInput): string[] {
        return input?.ArtifactID ? [input.ArtifactID] : [];
    }

    protected override async Authorize(
        input: ArtifactComplianceAuditInput,
        user: UserInfo,
        context?: RemoteOpServerContext,
    ): Promise<boolean> {
        if (user.IsMagicLinkAnonymous || user.MagicLinkScope) {
            throw new RemoteOperationError('FORBIDDEN', 'Magic Link sessions cannot log artifact compliance audits.');
        }
        const provider = context?.provider;
        if (!provider) {
            throw new RemoteOperationError('NO_PROVIDER', 'Metadata provider is required.');
        }
        const artifactId = (input.ArtifactID ?? '').trim();
        if (!artifactId || !IsValidUUID(artifactId)) {
            throw new RemoteOperationError('INVALID_INPUT', 'A valid ArtifactID UUID is required.');
        }
        if (input.ArtifactVersionID && !IsValidUUID(input.ArtifactVersionID.trim())) {
            throw new RemoteOperationError('INVALID_INPUT', 'ArtifactVersionID must be a valid UUID.');
        }

        const requestedType = (input.AuditLogTypeName ?? '').trim() || 'Artifact Exported';
        const requiredPermission = CLIENT_CALLABLE_AUDIT_PERMISSION_MAP.get(requestedType.toLowerCase());
        if (!requiredPermission) {
            throw new RemoteOperationError(
                'FORBIDDEN',
                `AuditLogTypeName '${requestedType}' cannot be logged directly by client callers.`,
            );
        }

        const summary = (input.Summary ?? '').trim();
        if (summary.length > MAX_AUDIT_SUMMARY_LENGTH) {
            throw new RemoteOperationError(
                'INPUT_TOO_LARGE',
                `Audit Summary exceeds maximum length (${MAX_AUDIT_SUMMARY_LENGTH} characters).`,
            );
        }
        if (input.Details !== undefined && input.Details !== null) {
            if (typeof input.Details !== 'object' || Array.isArray(input.Details)) {
                throw new RemoteOperationError('INVALID_INPUT', 'Audit Details must be a JSON object.');
            }
            const serializedBytes = Buffer.byteLength(JSON.stringify(input.Details), 'utf8');
            if (serializedBytes > MAX_AUDIT_DETAILS_BYTES) {
                throw new RemoteOperationError(
                    'INPUT_TOO_LARGE',
                    `Audit Details exceeds maximum size (${MAX_AUDIT_DETAILS_BYTES} bytes).`,
                );
            }
        }

        const perms = await ArtifactPermissionEngine.Instance.ResolvePermissions(provider, artifactId, user);
        const allowed = requiredPermission === 'Edit' ? perms.CanEdit : perms.CanRead;
        if (!allowed) {
            throw new RemoteOperationError(
                'ACCESS_DENIED',
                perms.Reason || `User lacks ${requiredPermission} permission to audit '${requestedType}' on artifact '${artifactId}'.`,
            );
        }
        return true;
    }

    protected override async InternalExecute(
        input: ArtifactComplianceAuditInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<ArtifactComplianceAuditOutput> {
        const auditTypeName = (input.AuditLogTypeName ?? '').trim() || 'Artifact Exported';
        const sanitizedDetails =
            input.Details && typeof input.Details === 'object' && !Array.isArray(input.Details)
                ? (input.Details as AuditDetailsRecord)
                : undefined;
        return await WriteArtifactComplianceAudit(provider, user, {
            AuditLogTypeName: auditTypeName,
            ArtifactID: input.ArtifactID.trim(),
            ArtifactVersionID: input.ArtifactVersionID?.trim() || null,
            Summary: input.Summary,
            Details: sanitizedDetails,
        });
    }
}

/** Ensures {@link ArtifactComplianceAuditServerOperation} is retained by tree-shakers and registered in ClassFactory. */
export function LoadArtifactComplianceAuditOperation(): void {
    void ArtifactComplianceAuditServerOperation;
}
