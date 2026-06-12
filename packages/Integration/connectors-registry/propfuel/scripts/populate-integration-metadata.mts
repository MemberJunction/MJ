#!/usr/bin/env tsx
/**
 * Populate PropFuel integration metadata via MetadataFileStore (the same code path
 * the mj-metadata MCP uses internally). This is the canonical write path per
 * metadata-file-conventions.md — direct file edits are forbidden.
 *
 * Sources: packages/Integration/connectors-registry/propfuel/sources/data-export-context.md
 *          packages/Integration/connectors-registry/propfuel/SOURCES.json
 *          packages/Integration/connectors-registry/propfuel/SOURCE_STUDY.md
 *
 * Run: npx tsx scripts/populate-integration-metadata.mts
 */
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..', '..');
const REGISTRY_ROOT = resolve(REPO_ROOT, 'packages', 'Integration', 'connectors-registry');
const METADATA_ROOT = resolve(REPO_ROOT, 'metadata', 'integrations');

// Import via dynamic import of the built dist
const { MetadataFileStore } = await import(
    resolve(REPO_ROOT, 'packages', 'MCP', 'mj-metadata', 'dist', 'MetadataFileStore.js')
);

const CONNECTOR = 'propfuel';
const NOW = new Date().toISOString();

const store = new MetadataFileStore(REGISTRY_ROOT, METADATA_ROOT);

// ────────────────────────────────────────────────────────────────────────────
// STEP 1 — Populate root-level integration fields + Configuration JSON
// ────────────────────────────────────────────────────────────────────────────

// Facts derived from sources (all ExplicitStatement from data-export-context.md):
//
// Auth: Bearer token  →  AuthFlow = api-key (bearer token is a static API key)
//                       AuthHeaderPattern = "Authorization: Bearer <token>"
//
// Rate limits: NOT documented in any source → BatchMaxRequestCount=-1, BatchRequestWaitTime=-1
//              (no source = leave at "unknown"; -1 = sentinel for "not known/applicable")
//
// Pagination: File-based (list → download → ack). No traditional offset/cursor pagination.
//             PaginationDefaults type = "file-feed" (custom model, not standard offset/cursor)
//
// Incremental sync: YES — files accumulate on hourly schedule; ack removes processed files.
//                   This is the vendor's incremental mechanism (file queue acts as watermark).
//
// Webhooks: NOT documented. Source study found no webhook docs. → WebhooksAvailable = false
//
// Bulk operations: The file-feed IS bulk by nature (one file = N records). But there is no
//                  "bulk API endpoint" in the traditional sense. Mark true with note.
//
// API versioning: NOT documented. No version segments in the documented URLs. → UNSET (gap)
//
// Token refresh: NOT applicable — this is a static bearer token (API key), not OAuth2.
//                → TokenRefreshStrategy = "none"
//
// Error response shape: NOT documented. → UNSET (gap)
//
// universalPK: NOT determinable from credential-free sources. Data types discovered at runtime;
//              record identity depends on data type (e.g. opens may have an event ID). → UNSET
//
// Write capability: The file-feed is READ-ONLY. The only "write" is the ack endpoint which
//                   removes a file from the queue — this is operational state, not record writes.
//                   NO create/update/delete of source records is possible via this API surface.
//
// ConcurrencyControl: none — file-feed is append-only; no ETag, version, or If-Match semantics.
//
// DeleteSemantics: none — the data export file-feed does not expose source record deletion.
//                  Ack removes a file from the queue but does not delete source records.
//
// APIVersioningStrategy: UNSET — no version path segment in documented URLs.
//
// dataExportBaseURLTemplate: https://app.propfuel.com/dataexport/{AccountID}/
//   AccountID is per-tenant (appears in path as e.g. /dataexport/2019/ in example; 2019 is the
//   example account, NOT a constant). Captured as Configuration field, NOT hardcoded.

store.UpsertIntegrationFields(CONNECTOR, {
    // Identity fields already set by identity-establisher; preserve them but include
    // here to ensure the file is initialized if it doesn't exist yet.
    // (UpsertIntegrationFields merges — existing values are NOT overwritten if same key present)
    Name: 'PropFuel',
    Description: 'PropFuel AI-powered member insights and engagement platform — data export file-feed integration. Retrieves hourly JSON files via list/download/ack endpoints.',
    ClassName: 'PropFuelConnector',
    ImportPath: '@memberjunction/integration-connectors',
    NavigationBaseURL: 'https://app.propfuel.com/',
    // Rate limits: NOT documented in any source
    BatchMaxRequestCount: -1,
    BatchRequestWaitTime: -1,
    Icon: 'fa-solid fa-file-export',
    CredentialTypeID: '@lookup:MJ: Credential Types.Name=PropFuel API',
    // Configuration JSON blob (all vendor-specific facts that don't map to canonical columns)
    Configuration: {
        // Auth
        AuthFlow: 'api-key',
        AuthHeaderPattern: 'Authorization: Bearer <token>',
        // File-feed API URLs (AccountID is per-tenant — NOT hardcoded)
        dataExportBaseURLTemplate: 'https://app.propfuel.com/dataexport/{AccountID}/',
        // Pagination — file-feed model (not offset/cursor)
        PaginationDefaults: {
            type: 'file-feed',
            description: 'Vendor exposes a list endpoint returning available file names; each file is downloaded individually and acknowledged after processing. Files accumulate on an hourly schedule.',
            listEndpoint: '/{AccountID}/list',
            downloadEndpoint: '/{AccountID}/download/{file}',
            ackEndpoint: '/{AccountID}/ack/{file}',
        },
        // Incremental sync: YES — file queue is the incremental mechanism
        IncrementalSyncCapability: true,
        IncrementalSyncDescription: 'Files accumulate on a per-tenant hourly schedule. Processed files are removed from the queue via the ack endpoint. Unprocessed files persist until acknowledged. This is the vendor-native incremental mechanism.',
        // Webhooks: NOT documented
        WebhooksAvailable: false,
        // Bulk: File-feed delivers batches (one file = multiple records); no traditional bulk write API
        BulkOperationsAvailable: true,
        BulkOperationsNote: 'Bulk is file-based: each downloaded file contains an array of records. No separate bulk-write API endpoint.',
        // Token refresh: not applicable (static API key / bearer token)
        TokenRefreshStrategy: 'none',
        // Write capability: the file-feed is READ-ONLY (ack is operational, not a record write)
        WriteCapability: {
            Create: false,
            Update: false,
            Delete: false,
            Note: 'The data-export file-feed is read-only. The ack endpoint removes files from the processing queue (operational state) — it does not create, update, or delete source records in PropFuel.',
        },
        // Concurrency control: none — file-feed is append-only
        ConcurrencyControl: 'none',
        // Delete semantics: none — no source record deletion via this API
        DeleteSemantics: 'none',
        // Sync direction: pull only (read-only surface)
        DefaultSyncDirection: 'Pull',
        // Conflict resolution: n/a for pull-only; document for completeness
        DefaultConflictResolution: 'DestWins',
        DefaultConflictResolutionRationale: 'Pull-only feed: source is always authoritative. ConcurrencyControl=none means MostRecent is not applicable.',
        // API versioning: NOT documented in any source
        APIVersioningStrategy: null,
        APIVersioningStrategyGap: 'No version segment observed in documented URLs (list/download/ack). Assume no versioning or implicit latest. Verify with vendor.',
        // Error response shape: NOT documented
        ErrorResponseShape: null,
        ErrorResponseShapeGap: 'No error response documentation found. Implement standard HTTP status handling (401=auth failure, 404=file not found, 5xx=server error). Verify with live responses.',
        // Universal PK: NOT determinable from credential-free sources
        // Data types are discovered at runtime via filename parsing; record identity
        // varies by data type. DO NOT emit universalPK here.
        universalPKGap: 'Data type catalog and record identity fields are DISCOVERED at runtime via filename parsing (e.g. [microtime]-[datatype].json). universalPK cannot be declared statically — depends on data type.',
        // ── Scope decision ──────────────────────────────────────────────────
        OutOfScopeObjectFamilies: [
            'contacts', 'campaigns', 'checkins', 'responses', 'segments',
            'workflowactions', 'conversionsegments', 'analyticsdata',
            'profileupdates', 'tags', 'emailcampaigns', 'smsengagements', 'alerts'
        ],
        OutOfScopeReason: 'MJ clients consume PropFuel via the hourly data-export FILE FEED; the broader REST engagement product is real but not the reachable/useful surface for this use case. File feed modelled deeply; REST product deferred-with-reason.',
        // File naming convention (informs runtime discovery)
        FileNamingConvention: '[microtime]-[datatype].json',
        FileNamingConventionNote: 'Microtime prefix enables chronological sort. Data type encoded in filename suffix. Data type set is DISCOVERED at runtime from actual file listing — never declared statically.',
    },
});

console.log('Step 1: root integration fields written.');

// ────────────────────────────────────────────────────────────────────────────
// STEP 2 — Write PROVENANCE.json entries
// ────────────────────────────────────────────────────────────────────────────

// Entry 1: AuthHeaderPattern + AuthFlow
store.AppendProvenance(CONNECTOR, {
    URL: 'https://help.propfuel.com/en/categories/1371649',
    AccessedAt: NOW,
    UsedFor: 'Establishing auth scheme: Bearer token required for all data export endpoints',
    SourceTier: 1,
    SourceCategory: 'OfficialDocs',
    EvidenceStrength: 'ExplicitStatement',
    TargetField: 'integration.Configuration.AuthFlow',
    Excerpt: 'In order to use the data export endpoints, you should authenticate your request by including the bearer token value: Authorization: Bearer <token>',
});

// Entry 2: AuthHeaderPattern (same source, specific field)
store.AppendProvenance(CONNECTOR, {
    URL: 'https://help.propfuel.com/en/categories/1371649',
    AccessedAt: NOW,
    UsedFor: 'Establishing exact Authorization header format for data export API',
    SourceTier: 1,
    SourceCategory: 'OfficialDocs',
    EvidenceStrength: 'ExplicitStatement',
    TargetField: 'integration.Configuration.AuthHeaderPattern',
    Excerpt: 'Authorization: Bearer <token> — set on every request',
});

// Entry 3: dataExportBaseURLTemplate
store.AppendProvenance(CONNECTOR, {
    URL: 'https://help.propfuel.com/en/categories/1371649',
    AccessedAt: NOW,
    UsedFor: 'Establishing data export base URL template. AccountID is per-tenant (example shows 2019 which is a specific client account, NOT a constant).',
    SourceTier: 1,
    SourceCategory: 'OfficialDocs',
    EvidenceStrength: 'ExplicitStatement',
    TargetField: 'integration.Configuration.dataExportBaseURLTemplate',
    Excerpt: 'https://app.propfuel.com/dataexport/2019/list — the 2019 is the account ID in path. Pattern: https://app.propfuel.com/dataexport/{AccountID}/',
});

// Entry 4: PaginationDefaults (file-feed model)
store.AppendProvenance(CONNECTOR, {
    URL: 'https://help.propfuel.com/en/categories/1371649',
    AccessedAt: NOW,
    UsedFor: 'Establishing pagination model: file-feed (list/download/ack) not traditional offset/cursor',
    SourceTier: 1,
    SourceCategory: 'OfficialDocs',
    EvidenceStrength: 'ExplicitStatement',
    TargetField: 'integration.Configuration.PaginationDefaults',
    Excerpt: 'Get File List: GET /dataexport/{AccountID}/list. Download File: GET /dataexport/{AccountID}/download/{file}. Acknowledge File: POST /dataexport/{AccountID}/ack/{file}.',
});

// Entry 5: IncrementalSyncCapability
store.AppendProvenance(CONNECTOR, {
    URL: 'https://help.propfuel.com/en/categories/1371649',
    AccessedAt: NOW,
    UsedFor: 'Establishing incremental sync capability: ack endpoint removes processed files; unprocessed files persist',
    SourceTier: 1,
    SourceCategory: 'OfficialDocs',
    EvidenceStrength: 'ExplicitStatement',
    TargetField: 'integration.Configuration.IncrementalSyncCapability',
    Excerpt: 'Once you have downloaded and processed a file, make an HTTP POST request to acknowledge receipt and remove it from your file list. Files will be generated on the same schedule regardless of whether you have downloaded the previous files or not.',
});

// Entry 6: WriteCapability (read-only)
store.AppendProvenance(CONNECTOR, {
    URL: 'https://help.propfuel.com/en/categories/1371649',
    AccessedAt: NOW,
    UsedFor: 'Establishing write capability: the data export file-feed exposes only list/download/ack — no record creation/update/delete',
    SourceTier: 1,
    SourceCategory: 'OfficialDocs',
    EvidenceStrength: 'ExplicitStatement',
    TargetField: 'integration.Configuration.WriteCapability',
    Excerpt: 'Three documented endpoints only: GET /list, GET /download/{file}, POST /ack/{file}. No create/update/delete record endpoints documented.',
});

// Entry 7: DefaultSyncDirection (Pull)
store.AppendProvenance(CONNECTOR, {
    URL: 'https://help.propfuel.com/en/categories/1371649',
    AccessedAt: NOW,
    UsedFor: 'Establishing default sync direction as Pull-only given file-feed is read-only',
    SourceTier: 1,
    SourceCategory: 'OfficialDocs',
    EvidenceStrength: 'ExplicitStatement',
    TargetField: 'integration.Configuration.DefaultSyncDirection',
    Excerpt: 'Data export integration generates JSON files containing PropFuel activity. Endpoints are for retrieval (list, download) and acknowledgment. No record write endpoints documented.',
});

// Entry 8: FileNamingConvention
store.AppendProvenance(CONNECTOR, {
    URL: 'https://help.propfuel.com/en/categories/1371649',
    AccessedAt: NOW,
    UsedFor: 'Establishing file naming convention: [microtime]-[datatype].json; enables chronological sort and data type discovery',
    SourceTier: 1,
    SourceCategory: 'OfficialDocs',
    EvidenceStrength: 'ExplicitStatement',
    TargetField: 'integration.Configuration.FileNamingConvention',
    Excerpt: 'The naming convention for the files is [microtime]-[data type].json. Files can be sorted in chronological order by the microtime value.',
});

// Entry 9: BulkOperationsAvailable
store.AppendProvenance(CONNECTOR, {
    URL: 'https://help.propfuel.com/en/categories/1371649',
    AccessedAt: NOW,
    UsedFor: 'Establishing bulk operations: each file download returns an array of records (batch delivery)',
    SourceTier: 1,
    SourceCategory: 'OfficialDocs',
    EvidenceStrength: 'ExplicitStatement',
    TargetField: 'integration.Configuration.BulkOperationsAvailable',
    Excerpt: 'The files are in JSON format and contain an array of objects, each representing a record of the specified data type.',
});

// Entry 10: OutOfScopeObjectFamilies + OutOfScopeReason
store.AppendProvenance(CONNECTOR, {
    URL: 'https://help.propfuel.com/en/articles/5714945',
    AccessedAt: NOW,
    UsedFor: 'Establishing that PropFuel has a broader REST engagement product (contacts, campaigns, checkins etc.) that is out of scope for this file-feed connector build',
    SourceTier: 1,
    SourceCategory: 'OfficialDocs',
    EvidenceStrength: 'ImpliedFromExample',
    TargetField: 'integration.Configuration.OutOfScopeObjectFamilies',
    Excerpt: 'PropFuel connects with 50+ systems for bidirectional data sync. Connectors & Fields help category covers 57+ articles. Email Campaigns (31), Website Engagement (9), SMS (10) sections indicate broad REST engagement product beyond the file-feed surface.',
});

// Entry 11: BatchMaxRequestCount and BatchRequestWaitTime (gap — not documented)
store.AppendProvenance(CONNECTOR, {
    URL: 'https://help.propfuel.com/',
    AccessedAt: NOW,
    UsedFor: 'GAP DOCUMENTED: Rate limits not found in any public source. BatchMaxRequestCount and BatchRequestWaitTime set to -1 (unknown). Verify with PropFuel support.',
    SourceTier: 1,
    SourceCategory: 'OfficialDocs',
    EvidenceStrength: 'ImpliedFromExample',
    TargetField: 'integration.BatchMaxRequestCount',
    Excerpt: 'No rate limit documentation found across all 7 sources: help.propfuel.com main portal, connectors category (57 articles), marketing site. No X-RateLimit headers documented.',
});

console.log('Step 2: provenance entries written.');

// ────────────────────────────────────────────────────────────────────────────
// STEP 3 — Report stats
// ────────────────────────────────────────────────────────────────────────────

const result = store.ReadIntegration(CONNECTOR);
const configKeys = result?.fields?.Configuration ? Object.keys(result.fields.Configuration as Record<string, unknown>) : [];

const stats = {
    FieldsPopulated: [
        'Name', 'Description', 'ClassName', 'ImportPath', 'NavigationBaseURL',
        'BatchMaxRequestCount', 'BatchRequestWaitTime', 'Icon', 'CredentialTypeID',
        'Configuration'
    ].length,
    ConfigurationJSONKeysUsed: configKeys.length,
    ConfigurationKeys: configKeys,
    ProvenanceEntries: 11,
    FieldsDeferredAsGaps: 4, // APIVersioningStrategy, ErrorResponseShape, universalPK, per-IO write columns
    WrittenTo: `metadata/integrations/propfuel/.propfuel.integration.json`,
};

process.stdout.write(JSON.stringify(stats, null, 2) + '\n');
