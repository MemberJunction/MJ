import type { UserInfo } from '@memberjunction/core';

/**
 * Database engines supported by MemberJunction Peer Sync.
 */
export type PeerDatabaseEngine = 'SQLServer' | 'PostgreSQL';

/**
 * Schema drift handling policy for MJ Peer Sync.
 * - `'Strict'`: Block sync if any non-identical or non-superset schema difference exists.
 * - `'AdditiveAutoEvolve'`: Automatically apply additive changes (missing entities/columns, type widening) via `IPeerSyncSchemaEvolutionRunner`.
 * - `'WarnAndSkipFields'`: Log warnings and skip unmapped/missing non-breaking fields.
 */
export type SchemaDriftPolicy = 'Strict' | 'AdditiveAutoEvolve' | 'WarnAndSkipFields';

/**
 * Sync cadence mode for MJ Peer Sync.
 */
export type PeerSyncCadenceMode = 'ScheduledOnly' | 'RealtimeWithScheduledFallback';

/**
 * Configuration stored in `CompanyIntegration.Configuration` for `MemberJunctionConnector`.
 */
export interface PeerSyncConfiguration {
    /** Remote MemberJunction peer's GraphQL endpoint URL (e.g., `https://peer.example.com/graphql`). */
    PeerGraphQLUrl: string;
    /** Optional explicit instance ID of the local or remote peer. */
    PeerInstanceID?: string;
    /** Policy when schema differences are detected between peers (default `'Strict'`). */
    SchemaDriftPolicy: SchemaDriftPolicy;
    /** Whether to preserve source UUID primary keys when creating new records on the target peer (default `true`). */
    PreservePrimaryKeys: boolean;
    /** Minimum vector similarity score (0..1) at or above which an inbound record is auto-linked (default `0.92`). */
    DuplicateThreshold: number;
    /** Minimum vector similarity score (0..1) at or above which an inbound record is quarantined for review (default `0.75`). */
    PotentialMatchThreshold: number;
    /** Cadence mode: scheduled polling only or event-driven doorbell with scheduled fallback. */
    CadenceMode: PeerSyncCadenceMode;
    /** Debounce window in milliseconds for coalescing outbound doorbell notifications (default `1500`). */
    RealtimeDebounceMs: number;
    /** Maximum records fetched/applied per batch (default `500`). */
    BatchSize: number;
}

/**
 * Default configuration for `MemberJunctionConnector`.
 */
export const DEFAULT_PEER_SYNC_CONFIG: PeerSyncConfiguration = {
    PeerGraphQLUrl: '',
    SchemaDriftPolicy: 'Strict',
    PreservePrimaryKeys: true,
    DuplicateThreshold: 0.92,
    PotentialMatchThreshold: 0.75,
    CadenceMode: 'RealtimeWithScheduledFallback',
    RealtimeDebounceMs: 1500,
    BatchSize: 500,
};

/**
 * Handshake manifest exchanged during Phase 1 (`PeerSync.GetManifest`).
 */
export interface PeerManifest {
    InstanceID: string;
    InstanceName: string;
    MJCoreVersion: string;
    DatabaseEngine: PeerDatabaseEngine;
    ServerTimestamp: string;
    SupportedCapabilities: string[];
    AllowedEntityNames: string[];
}

/**
 * Structural schema fingerprint of a single entity field.
 */
export interface PeerFieldSchemaFingerprint {
    Name: string;
    Type: string;
    SQLFullType: string;
    AllowsNull: boolean;
    MaxLength: number | null;
    Precision: number | null;
    Scale: number | null;
    DefaultValue: string | null;
    IsPrimaryKey: boolean;
    IsVirtual: boolean;
    RelatedEntityName: string | null;
    RelatedEntityFieldName: string | null;
}

/**
 * Structural schema fingerprint of a single MemberJunction entity.
 */
export interface PeerEntitySchemaFingerprint {
    EntityName: string;
    SchemaName: string;
    BaseTable: string;
    BaseView: string;
    PrimaryKeyFieldNames: string[];
    TrackRecordChanges: boolean;
    Fields: PeerFieldSchemaFingerprint[];
    FingerprintHash: string;
}

/**
 * Granular classification of a single schema difference between two peers.
 */
export type SchemaDiffKind =
    | 'MissingLocalEntity'
    | 'MissingRemoteEntity'
    | 'MissingLocalField'
    | 'MissingRemoteField'
    | 'TypeWidening'
    | 'IncompatibleType'
    | 'IncompatibleConstraint'
    | 'CoreVersionMismatch';

/**
 * Overall compatibility verdict for an entity or pairing.
 */
export type SchemaCompatibilityVerdict =
    | 'Identical'
    | 'CompatibleSuperset'
    | 'AutoEvolvable'
    | 'IncompatibleType'
    | 'IncompatibleConstraint'
    | 'CoreVersionMismatch';

/**
 * Single field or entity difference detected by `SchemaPlanner`.
 */
export interface SchemaFieldDiff {
    Kind: SchemaDiffKind;
    EntityName: string;
    FieldName: string | null;
    LocalField: PeerFieldSchemaFingerprint | null;
    RemoteField: PeerFieldSchemaFingerprint | null;
    IsBreaking: boolean;
    IsAutoEvolvable: boolean;
    Message: string;
}

/**
 * Schema reconciliation result for a single entity.
 */
export interface EntitySchemaReconciliation {
    EntityName: string;
    Verdict: SchemaCompatibilityVerdict;
    LocalFingerprintHash: string | null;
    RemoteFingerprintHash: string | null;
    Diffs: SchemaFieldDiff[];
}

/**
 * Full schema reconciliation plan across all entities in a peer pairing.
 */
export interface SchemaReconciliationPlan {
    PairingID: string;
    LocalInstanceID: string;
    RemoteInstanceID: string;
    CoreVersionCompatible: boolean;
    OverallVerdict: SchemaCompatibilityVerdict;
    EntityResults: EntitySchemaReconciliation[];
    AutoEvolvableEntities: string[];
    BlockedEntities: string[];
}

/**
 * Composite `(ChangedAt, ChangeID)` watermark cursor over `MJ: Record Changes`.
 */
export interface PeerChangeCursor {
    ChangedAt: string;
    ChangeID: string;
}

/**
 * Record change operation type.
 */
export type PeerChangeOperation = 'Create' | 'Update' | 'Delete';

/**
 * Field-level diff entry parsed from `RecordChange.ChangesJSON`.
 */
export interface PeerRecordFieldChange {
    fieldName: string;
    oldValue: string | number | boolean | null;
    newValue: string | number | boolean | null;
}

/**
 * Raw row shape queried from `MJ: Record Changes`.
 */
export interface PeerRecordChangeEntry {
    ID: string;
    EntityID: string;
    EntityName: string;
    RecordID: string;
    Type: PeerChangeOperation;
    Source: string | null;
    ChangedAt: string;
    ChangesJSON: string | null;
    FullRecordJSON: string | null;
}

/**
 * Net coalesced record change within a sync window.
 */
export interface CoalescedRecordChange {
    EntityName: string;
    SourceRecordID: string;
    Operation: PeerChangeOperation;
    RecordData: Record<string, string | number | boolean | null>;
    AncestorData: Record<string, string | number | boolean | null> | null;
    ChangedFields: string[];
    LatestChangedAt: string;
    LatestChangeID: string;
}

/**
 * Output of the 5-step `PeerIdentityGate`.
 */
export interface PeerIdentityResolution {
    Outcome: 'Matched' | 'CreateNew' | 'Quarantined';
    MatchedBy:
        | 'RecordMap'
        | 'PrimaryKey'
        | 'KeyFields'
        | 'DuplicateDetection'
        | 'NewRecord'
        | 'AmbiguousKey';
    LocalRecordID: string | null;
    SimilarityScore: number | null;
    CandidateIDs: string[];
    QuarantineReason: string | null;
}

/**
 * Deferred nullable foreign key update queued during Pass 1 and applied in Pass 2.
 */
export interface PeerDeferredFKUpdate {
    EntityName: string;
    LocalRecordID: string;
    SourceRecordID: string;
    FieldName: string;
    RelatedEntityID: string;
    SourceForeignKeyValue: string;
}

/**
 * Request payload for `PeerSync.FetchChangeBatch`.
 */
export interface PeerFetchChangesRequest {
    PairingID: string;
    RequesterInstanceID: string;
    EntityName: string;
    SinceCursor: PeerChangeCursor | null;
    BatchSize: number;
}

/**
 * Response payload from `PeerSync.FetchChangeBatch`.
 */
export interface PeerFetchChangesResponse {
    PairingID: string;
    EntityName: string;
    Changes: CoalescedRecordChange[];
    NextCursor: PeerChangeCursor | null;
    HasMore: boolean;
}

/**
 * Per-record outcome in `PeerSync.ApplyChangeBatch`.
 */
export interface PeerApplyRecordResult {
    SourceRecordID: string;
    DestinationRecordID: string | null;
    Status:
        | 'Created'
        | 'Updated'
        | 'Deleted'
        | 'Skipped'
        | 'Quarantined'
        | 'Conflict'
        | 'Error';
    MatchedBy: PeerIdentityResolution['MatchedBy'] | null;
    ErrorMessage: string | null;
    ConflictingFields: string[];
}

/**
 * Request payload for `PeerSync.ApplyChangeBatch`.
 */
export interface PeerApplyBatchRequest {
    PairingID: string;
    SenderInstanceID: string;
    RunID: string;
    EntityName: string;
    Changes: CoalescedRecordChange[];
    PreservePrimaryKeys: boolean;
}

/**
 * Response payload from `PeerSync.ApplyChangeBatch`.
 */
export interface PeerApplyBatchResponse {
    PairingID: string;
    EntityName: string;
    Results: PeerApplyRecordResult[];
    CreatedCount: number;
    UpdatedCount: number;
    DeletedCount: number;
    SkippedCount: number;
    QuarantinedCount: number;
    ConflictCount: number;
    ErrorCount: number;
}

/**
 * Payload sent by `PeerSyncDoorbell` via `PeerSync.NotifyChangeBatch`.
 */
export interface PeerDoorbellNotification {
    PairingID: string;
    SenderInstanceID: string;
    ChangedEntityNames: string[];
    EmittedAt: string;
}

/**
 * Response from `PeerSync.NotifyChangeBatch`.
 */
export interface PeerDoorbellResponse {
    Accepted: boolean;
    TriggeredRunID: string | null;
}

/**
 * Pluggable duplicate candidate finder interface used by `PeerIdentityGate`.
 */
export interface IPeerSyncDuplicateCandidateFinder {
    FindCandidatesForValues(
        entityName: string,
        values: Record<string, string | number | boolean | null>,
        contextUser: UserInfo,
        options?: {
            PotentialMatchThreshold?: number;
            AbsoluteMatchThreshold?: number;
            EntityDocumentID?: string;
            TopK?: number;
        }
    ): Promise<Array<{ RecordID: string; ProbabilityScore: number }>>;
}

/**
 * Pluggable incremental vector indexer called after `PeerSyncApplier.ApplyBatch`.
 */
export interface IPeerSyncVectorIndexer {
    VectorizeRecords(
        entityID: string,
        recordIDs: string[],
        contextUser: UserInfo,
        entityDocumentID?: string
    ): Promise<boolean>;
}

/**
 * Pluggable runtime schema evolution runner for `AdditiveAutoEvolve` policy.
 */
export interface IPeerSyncSchemaEvolutionRunner {
    ApplyAdditivePlan(
        plan: SchemaReconciliationPlan,
        contextUser: UserInfo
    ): Promise<{ Success: boolean; ErrorMessage?: string }>;
}

/**
 * Transport interface for the 6 `PeerSync.*` RPC operations.
 */
export interface IPeerSyncTransport {
    GetManifest(): Promise<PeerManifest>;
    GetSchemaFingerprint(entityNames: string[]): Promise<PeerEntitySchemaFingerprint[]>;
    PreviewSchemaPlan(
        remoteSchemas: PeerEntitySchemaFingerprint[]
    ): Promise<SchemaReconciliationPlan>;
    FetchChangeBatch(
        request: PeerFetchChangesRequest
    ): Promise<PeerFetchChangesResponse>;
    ApplyChangeBatch(
        request: PeerApplyBatchRequest
    ): Promise<PeerApplyBatchResponse>;
    NotifyChangeBatch(
        notification: PeerDoorbellNotification
    ): Promise<PeerDoorbellResponse>;
}
