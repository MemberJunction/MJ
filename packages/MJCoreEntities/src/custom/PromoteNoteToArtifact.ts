import {
    EntityInfo,
    IMetadataProvider,
    LogError,
    Metadata,
    RunView,
    UserInfo,
} from '@memberjunction/core';
import { EscapeSQLString, IsValidUUID } from '@memberjunction/global';
import {
    MJArtifactEntity,
    MJArtifactVersionEntity,
    MJRecordArtifactEntity,
} from '../generated/entity_subclasses.js';
import { ArtifactMetadataEngine } from '../engines/artifacts.js';

/** Default `MJ: Artifact Types.Name` used when promoting a note to a versioned artifact. */
export const DEFAULT_PROMOTED_ARTIFACT_TYPE_NAME = 'Markdown Document';

/** Default `MJ: Record Artifacts.Role` matching the database `NOT NULL DEFAULT 'General'` constraint. */
export const DEFAULT_RECORD_ARTIFACT_ROLE = 'General';

/** Error codes returned by {@link PromoteNoteToArtifact} and {@link LinkArtifactToRecord}. */
export type PromoteNoteErrorCode =
    | 'INVALID_INPUT'
    | 'PERMISSION_DENIED'
    | 'HOST_ENTITY_NOT_FOUND'
    | 'ARTIFACT_TYPE_NOT_FOUND'
    | 'ARTIFACT_SAVE_FAILED'
    | 'VERSION_SAVE_FAILED'
    | 'LINK_SAVE_FAILED';

/** Input parameters for {@link PromoteNoteToArtifact}. */
export interface PromoteNoteToArtifactParams {
    /** Display title for the newly created `MJ: Artifacts` record and its initial `v1` version. */
    Title: string;
    /** Markdown body persisted as `v1` of `MJ: Artifact Versions`. */
    MarkdownContent: string;
    /** Canonical MJ entity name of the host record (for example, `'MJ: Companies'` or `'Deals'`). */
    HostEntityName?: string;
    /** Optional `Entity.ID` UUID of the host entity (takes precedence over `HostEntityName` when both are set). */
    HostEntityID?: string;
    /** Serialized primary key (compact URL segment) of the host record. */
    HostRecordID: string;
    /** Optional `MJ: Artifact Types.Name`; defaults to `'Markdown Document'`. */
    ArtifactTypeName?: string;
    /** Optional artifact description. */
    Description?: string | null;
    /** Optional `EnvironmentID` override for the created artifact. */
    EnvironmentID?: string;
    /** Optional semantic link role in `MJ: Record Artifacts`; defaults to `'General'`. */
    LinkRole?: string;
    /** Optional display ordering sequence in `MJ: Record Artifacts`; defaults to `0`. */
    LinkSequence?: number;
    /** Optional human-readable link context description. */
    ContextDescription?: string | null;
    /** Whether to create an `MJ: Record Artifacts` link after saving v1; defaults to `true`. */
    CreateRecordArtifactLink?: boolean;
    /** When true, pins `PinnedArtifactVersionID` on the created `MJ: Record Artifacts` link to `v1`. */
    PinToInitialVersion?: boolean;
    /** Optional comments stored on the initial `v1` `MJ: Artifact Versions` record. */
    VersionComments?: string | null;
    /** Optional visibility derived from `MJArtifactEntity['Visibility']`; defaults to `'Always'`. */
    Visibility?: MJArtifactEntity['Visibility'];
}

/** Structured result returned by {@link PromoteNoteToArtifact}. */
export interface PromoteNoteToArtifactResult {
    Success: boolean;
    ArtifactID?: string;
    ArtifactVersionID?: string;
    VersionNumber?: number;
    RecordArtifactID?: string;
    LinkReusedExisting?: boolean;
    Artifact?: MJArtifactEntity;
    ArtifactVersion?: MJArtifactVersionEntity;
    RecordArtifact?: MJRecordArtifactEntity;
    ErrorCode?: PromoteNoteErrorCode;
    ErrorMessage?: string;
}

/** Parameters for {@link LinkArtifactToRecord}. */
export interface LinkArtifactToRecordParams {
    HostEntityID: string;
    HostRecordID: string;
    ArtifactID: string;
    Role?: string;
    Sequence?: number;
    ContextDescription?: string | null;
    PinnedArtifactVersionID?: string | null;
}

/** Structured result returned by {@link LinkArtifactToRecord}. */
export interface LinkArtifactToRecordResult {
    Success: boolean;
    RecordArtifactID?: string;
    RecordArtifact?: MJRecordArtifactEntity;
    ReusedExisting?: boolean;
    ErrorMessage?: string;
}

interface ArtifactTypeIdRow {
    ID: string;
    Name: string;
}

const UNIQUE_COLLISION_PATTERNS: ReadonlyArray<string> = [
    'uq_recordartifact_record_artifact_role',
    'duplicate key',
    'unique constraint',
    'unique key',
    '23505',
    '2627',
    '2601',
];

function isUniqueConstraintCollision(errorMessage: string): boolean {
    const normalized = errorMessage.toLowerCase();
    return UNIQUE_COLLISION_PATTERNS.some((pattern) => normalized.includes(pattern));
}

function failPromote(errorCode: PromoteNoteErrorCode, errorMessage: string): PromoteNoteToArtifactResult {
    return {
        Success: false,
        ErrorCode: errorCode,
        ErrorMessage: errorMessage,
    };
}

function resolveActingUser(
    contextUser: UserInfo | undefined,
    provider: IMetadataProvider | null | undefined
): UserInfo | null {
    const candidate = contextUser ?? provider?.CurrentUser ?? null;
    if (!candidate || !IsValidUUID(candidate.ID)) {
        return null;
    }
    if (candidate.IsMagicLinkAnonymous || candidate.MagicLinkScope) {
        return null;
    }
    return candidate;
}

function resolveHostEntity(
    provider: IMetadataProvider,
    params: PromoteNoteToArtifactParams
): EntityInfo | undefined {
    const hostEntityId = params.HostEntityID?.trim();
    if (hostEntityId && typeof provider.EntityByID === 'function') {
        const byId = provider.EntityByID(hostEntityId);
        if (byId) {
            return byId;
        }
    }
    const hostEntityName = params.HostEntityName?.trim();
    if (hostEntityName && typeof provider.EntityByName === 'function') {
        return provider.EntityByName(hostEntityName);
    }
    return undefined;
}

function hasHostRecordWriteAccess(hostEntity: EntityInfo, actingUser: UserInfo): boolean {
    if (typeof hostEntity.GetUserPermisions !== 'function') {
        return false;
    }
    const perms = hostEntity.GetUserPermisions(actingUser);
    return Boolean(perms?.CanRead && perms?.CanUpdate);
}

async function resolveArtifactTypeId(
    provider: IMetadataProvider,
    artifactTypeName: string,
    actingUser: UserInfo
): Promise<string | null> {
    try {
        const cached = ArtifactMetadataEngine.Instance.FindArtifactType(artifactTypeName);
        if (cached?.ID) {
            return cached.ID;
        }
    } catch {
        // Engine may not be configured yet in lightweight server or unit-test contexts; fall back to RunView.
    }

    const rv = RunView.FromMetadataProvider(provider);
    const result = await rv.RunView<ArtifactTypeIdRow>(
        {
            EntityName: 'MJ: Artifact Types',
            ExtraFilter: `Name='${EscapeSQLString(artifactTypeName)}'`,
            Fields: ['ID', 'Name'],
            MaxRows: 1,
            SkipTotalRowCount: true,
            ResultType: 'simple',
        },
        actingUser
    );
    if (result.Success && result.Results.length > 0 && result.Results[0].ID) {
        return result.Results[0].ID;
    }
    return null;
}

async function rollbackEntitySafely(entity: MJArtifactEntity | MJArtifactVersionEntity, label: string): Promise<void> {
    try {
        const deleted = await entity.Delete();
        if (!deleted) {
            LogError(
                `PromoteNoteToArtifact compensating rollback failed for ${label} '${entity.ID}': ${
                    entity.LatestResult?.CompleteMessage ?? 'unknown error'
                }`
            );
        }
    } catch (err) {
        LogError(
            `PromoteNoteToArtifact compensating rollback threw for ${label} '${entity.ID}': ${
                err instanceof Error ? err.message : String(err)
            }`
        );
    }
}

async function findExistingRecordArtifactLink(
    provider: IMetadataProvider,
    hostEntityId: string,
    hostRecordId: string,
    artifactId: string,
    role: string,
    actingUser: UserInfo
): Promise<MJRecordArtifactEntity | null> {
    const rv = RunView.FromMetadataProvider(provider);
    const filter =
        `EntityID='${EscapeSQLString(hostEntityId)}' AND ` +
        `RecordID='${EscapeSQLString(hostRecordId)}' AND ` +
        `ArtifactID='${EscapeSQLString(artifactId)}' AND ` +
        `Role='${EscapeSQLString(role)}'`;
    const lookup = await rv.RunView<MJRecordArtifactEntity>(
        {
            EntityName: 'MJ: Record Artifacts',
            ExtraFilter: filter,
            MaxRows: 1,
            SkipTotalRowCount: true,
            ResultType: 'entity_object',
        },
        actingUser
    );
    return lookup.Success && lookup.Results.length > 0 ? lookup.Results[0] : null;
}

/**
 * Idempotently creates an `MJ: Record Artifacts` link between `(HostEntityID, HostRecordID)` and
 * `ArtifactID` under `Role` (default `'General'`).
 *
 * When a concurrent or repeated write triggers a `UQ_RecordArtifact_Record_Artifact_Role` unique
 * constraint collision, resolves and returns the existing row with `ReusedExisting: true`.
 */
export async function LinkArtifactToRecord(
    params: LinkArtifactToRecordParams,
    contextUser?: UserInfo,
    provider?: IMetadataProvider
): Promise<LinkArtifactToRecordResult> {
    const activeProvider = provider ?? Metadata.Provider;
    const actingUser = resolveActingUser(contextUser, activeProvider);
    if (!activeProvider || !actingUser) {
        return {
            Success: false,
            ErrorMessage: 'Provider and authenticated user context with a valid UUID are required.',
        };
    }

    const role = (params.Role ?? '').trim() || DEFAULT_RECORD_ARTIFACT_ROLE;
    const hostEntityId = params.HostEntityID.trim();
    const hostRecordId = params.HostRecordID.trim();
    const artifactId = params.ArtifactID.trim();
    if (!hostEntityId || !hostRecordId || !artifactId) {
        return {
            Success: false,
            ErrorMessage: 'HostEntityID, HostRecordID, and ArtifactID are required.',
        };
    }

    let saveErrorMessage = '';
    try {
        const link = await activeProvider.GetEntityObject<MJRecordArtifactEntity>('MJ: Record Artifacts', actingUser);
        link.NewRecord();
        link.EntityID = hostEntityId;
        link.RecordID = hostRecordId;
        link.ArtifactID = artifactId;
        link.Role = role;
        link.Sequence = params.Sequence ?? 0;
        link.ContextDescription = params.ContextDescription ?? null;
        link.LinkedByUserID = actingUser.ID;
        link.PinnedArtifactVersionID = params.PinnedArtifactVersionID ?? null;

        const saved = await link.Save();
        if (saved) {
            return {
                Success: true,
                RecordArtifactID: link.ID,
                RecordArtifact: link,
                ReusedExisting: false,
            };
        }
        saveErrorMessage = link.LatestResult?.CompleteMessage ?? 'Failed to save MJ: Record Artifacts link.';
    } catch (err) {
        saveErrorMessage = err instanceof Error ? err.message : String(err);
    }

    if (isUniqueConstraintCollision(saveErrorMessage)) {
        const existing = await findExistingRecordArtifactLink(
            activeProvider,
            hostEntityId,
            hostRecordId,
            artifactId,
            role,
            actingUser
        );
        if (existing) {
            return {
                Success: true,
                RecordArtifactID: existing.ID,
                RecordArtifact: existing,
                ReusedExisting: true,
            };
        }
    }

    return {
        Success: false,
        ErrorMessage: saveErrorMessage,
    };
}

interface ArtifactHeaderCreateResult {
    Ok: boolean;
    Artifact?: MJArtifactEntity;
    ErrorMessage?: string;
}

interface InitialVersionCreateResult {
    Ok: boolean;
    Version?: MJArtifactVersionEntity;
    ErrorMessage?: string;
}

async function createDelegatedArtifactHeader(
    provider: IMetadataProvider,
    hostEntity: EntityInfo,
    artifactTypeId: string,
    title: string,
    hostRecordId: string,
    params: PromoteNoteToArtifactParams,
    actingUser: UserInfo
): Promise<ArtifactHeaderCreateResult> {
    const artifact = await provider.GetEntityObject<MJArtifactEntity>('MJ: Artifacts', actingUser);
    artifact.NewRecord();
    artifact.Name = title;
    artifact.TypeID = artifactTypeId;
    artifact.UserID = actingUser.ID;
    artifact.DelegateEntityID = hostEntity.ID;
    artifact.DelegateRecordID = hostRecordId;
    artifact.Visibility = params.Visibility ?? 'Always';
    if (params.Description !== undefined) {
        artifact.Description = params.Description;
    }
    if (params.EnvironmentID?.trim()) {
        artifact.EnvironmentID = params.EnvironmentID.trim();
    }

    const saved = await artifact.Save();
    if (!saved) {
        return {
            Ok: false,
            ErrorMessage: artifact.LatestResult?.CompleteMessage ?? 'Failed to save MJ: Artifacts record.',
        };
    }
    return { Ok: true, Artifact: artifact };
}

async function createInitialArtifactVersion(
    provider: IMetadataProvider,
    artifactId: string,
    title: string,
    params: PromoteNoteToArtifactParams,
    actingUser: UserInfo
): Promise<InitialVersionCreateResult> {
    const version = await provider.GetEntityObject<MJArtifactVersionEntity>('MJ: Artifact Versions', actingUser);
    version.NewRecord();
    version.ArtifactID = artifactId;
    version.VersionNumber = 1;
    version.Name = title;
    version.Content = params.MarkdownContent ?? '';
    version.ContentMode = 'Text';
    version.UserID = actingUser.ID;
    if (params.Description !== undefined) {
        version.Description = params.Description;
    }
    if (params.VersionComments !== undefined) {
        version.Comments = params.VersionComments;
    }

    const saved = await version.Save();
    if (!saved) {
        return {
            Ok: false,
            ErrorMessage: version.LatestResult?.CompleteMessage ?? 'Failed to save v1 MJ: Artifact Versions record.',
        };
    }
    return { Ok: true, Version: version };
}

/**
 * Promotes a lightweight note or narrative field into a versioned `MJ: Artifacts` document
 * (defaulting to `'Markdown Document'`), creating:
 * 1. An `MJ: Artifacts` header with `DelegateEntityID` + `DelegateRecordID` bound to the host record,
 * 2. Initial `v1` `MJ: Artifact Versions` snapshot with the Markdown content, and
 * 3. An optional `MJ: Record Artifacts` link (`Role` defaults to `'General'`) with idempotent
 *    `UQ_RecordArtifact_Record_Artifact_Role` handling.
 *
 * Works identically in browser and server runtimes by forwarding `contextUser` to every
 * `GetEntityObject`, `RunView`, and entity permission check. Performs compensating cleanup
 * (rolling back already-created records) if version or link persistence fails.
 */
export async function PromoteNoteToArtifact(
    params: PromoteNoteToArtifactParams,
    contextUser?: UserInfo,
    provider?: IMetadataProvider
): Promise<PromoteNoteToArtifactResult> {
    const activeProvider = provider ?? Metadata.Provider;
    const actingUser = resolveActingUser(contextUser, activeProvider);
    if (!activeProvider || !actingUser) {
        return failPromote(
            'PERMISSION_DENIED',
            'Provider and authenticated user context with a valid UUID are required to promote a note.'
        );
    }

    const title = (params?.Title ?? '').trim();
    const hostRecordId = (params?.HostRecordID ?? '').trim();
    if (!title || !hostRecordId || (!params.HostEntityID?.trim() && !params.HostEntityName?.trim())) {
        return failPromote(
            'INVALID_INPUT',
            'Title, HostRecordID, and either HostEntityName or HostEntityID are required.'
        );
    }

    const hostEntity = resolveHostEntity(activeProvider, params);
    if (!hostEntity) {
        return failPromote(
            'HOST_ENTITY_NOT_FOUND',
            `Host entity '${params.HostEntityName ?? params.HostEntityID ?? ''}' was not found in metadata.`
        );
    }

    if (!hasHostRecordWriteAccess(hostEntity, actingUser)) {
        return failPromote(
            'PERMISSION_DENIED',
            `User '${actingUser.ID}' lacks Read and Update permissions on host entity '${hostEntity.Name}'.`
        );
    }

    const artifactTypeName = (params.ArtifactTypeName ?? '').trim() || DEFAULT_PROMOTED_ARTIFACT_TYPE_NAME;
    const artifactTypeId = await resolveArtifactTypeId(activeProvider, artifactTypeName, actingUser);
    if (!artifactTypeId) {
        return failPromote(
            'ARTIFACT_TYPE_NOT_FOUND',
            `Artifact type '${artifactTypeName}' was not found in MJ: Artifact Types.`
        );
    }

    let artifact: MJArtifactEntity;
    try {
        const artifactResult = await createDelegatedArtifactHeader(
            activeProvider,
            hostEntity,
            artifactTypeId,
            title,
            hostRecordId,
            params,
            actingUser
        );
        if (!artifactResult.Ok || !artifactResult.Artifact) {
            return failPromote('ARTIFACT_SAVE_FAILED', artifactResult.ErrorMessage ?? 'Failed to save MJ: Artifacts record.');
        }
        artifact = artifactResult.Artifact;
    } catch (err) {
        return failPromote('ARTIFACT_SAVE_FAILED', err instanceof Error ? err.message : String(err));
    }

    let version: MJArtifactVersionEntity;
    try {
        const versionResult = await createInitialArtifactVersion(
            activeProvider,
            artifact.ID,
            title,
            params,
            actingUser
        );
        if (!versionResult.Ok || !versionResult.Version) {
            await rollbackEntitySafely(artifact, 'MJ: Artifacts');
            return failPromote('VERSION_SAVE_FAILED', versionResult.ErrorMessage ?? 'Failed to save v1 MJ: Artifact Versions record.');
        }
        version = versionResult.Version;
    } catch (err) {
        await rollbackEntitySafely(artifact, 'MJ: Artifacts');
        return failPromote('VERSION_SAVE_FAILED', err instanceof Error ? err.message : String(err));
    }

    if (params.CreateRecordArtifactLink === false) {
        return {
            Success: true,
            ArtifactID: artifact.ID,
            ArtifactVersionID: version.ID,
            VersionNumber: 1,
            Artifact: artifact,
            ArtifactVersion: version,
        };
    }

    const linkResult = await LinkArtifactToRecord(
        {
            HostEntityID: hostEntity.ID,
            HostRecordID: hostRecordId,
            ArtifactID: artifact.ID,
            Role: params.LinkRole,
            Sequence: params.LinkSequence,
            ContextDescription: params.ContextDescription,
            PinnedArtifactVersionID: params.PinToInitialVersion ? version.ID : null,
        },
        actingUser,
        activeProvider
    );

    if (!linkResult.Success) {
        await rollbackEntitySafely(version, 'MJ: Artifact Versions');
        await rollbackEntitySafely(artifact, 'MJ: Artifacts');
        return failPromote('LINK_SAVE_FAILED', linkResult.ErrorMessage ?? 'Failed to link artifact to host record.');
    }

    return {
        Success: true,
        ArtifactID: artifact.ID,
        ArtifactVersionID: version.ID,
        VersionNumber: 1,
        RecordArtifactID: linkResult.RecordArtifactID,
        LinkReusedExisting: linkResult.ReusedExisting ?? false,
        Artifact: artifact,
        ArtifactVersion: version,
        RecordArtifact: linkResult.RecordArtifact,
    };
}
