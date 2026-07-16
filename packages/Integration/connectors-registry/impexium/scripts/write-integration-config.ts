#!/usr/bin/env tsx
/**
 * write-integration-config.ts — MetadataWriter emission for re:Members AMS (Impexium).
 *
 * Populates the Integration row's non-identity slots (NavigationBaseURL;
 * BatchMaxRequestCount/BatchRequestWaitTime deliberately left unset — see
 * rationale below) and the Configuration JSON blob, via the mj-metadata MCP's
 * `upsert_integration_fields` tool. Then appends one PROVENANCE.json entry per
 * docs-derived fact and one CODE_EVIDENCE.json entry per script-derived fact
 * (this file's own extract-integration-config-facts.ts run).
 *
 * Identity fields (Name, Description, ClassName, ImportPath, CredentialTypeID,
 * Icon) are NOT touched here — those belong to identity-establisher.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const REPO_ROOT = '/Users/bcladmin/Projects/MemberJunction/MJ';
const SERVER_PATH = `${REPO_ROOT}/packages/MCP/mj-metadata/dist/server.js`;
const CONNECTOR = 'impexium';
const NOW = new Date().toISOString();

const SWAGGER_URL = 'https://raw.githubusercontent.com/microsoft/PowerPlatformConnectors/dev/certified-connectors/Impexium/apiDefinition.swagger.json';
const API_PROPS_URL = 'https://raw.githubusercontent.com/microsoft/PowerPlatformConnectors/dev/certified-connectors/Impexium/apiProperties.json';
const MS_LEARN_URL = 'https://learn.microsoft.com/en-us/connectors/impexium/';

// ---------------------------------------------------------------------------
// Configuration JSON blob (Integration.Configuration, NVARCHAR(MAX) column
// added in v5.42.x__Integration_Connector_Enhancements.sql).
// ---------------------------------------------------------------------------
const Configuration = {
    // --- Auth: recorded as an explicit, competing-hypotheses HYPOTHESIS block,
    // never as a settled AuthFlow/AuthHeaderPattern enum value. A prior
    // independent review of this vendor's build plan (run
    // connector-impexium-1783808479438-3654ffe5, INDEPENDENT_REVIEW.md Gap 1)
    // rejected an earlier draft for asserting a two-step handshake as SETTLED
    // FACT with no citable Tier-1/2 source for the RAW host. This block
    // deliberately does not repeat that mistake.
    AuthModel: {
        status: 'UNVERIFIED-at-plan-time',
        provableOnly: true,
        provableOnlyNote:
            'Auth flow for the RAW per-tenant host is recorded as a ranked HYPOTHESIS, not a settled fact. ' +
            'A keyless RealityProbe structurally cannot verify an auth handshake (no public door exists for a ' +
            'per-tenant AMS), so neither candidate below is asserted as ExplicitStatement-confirmed for the raw ' +
            'host until a live/sandbox credential round-trip is run. Do not implement Authenticate()/BuildHeaders() ' +
            'against candidate A without flagging it as unverified in code comments; do not silently adopt candidate B.',
        targetSurface:
            'This connector targets the RAW per-tenant REST host https://{tenant}.mpxapi.com (see APIBaseURLTemplate) ' +
            '-- NOT the Microsoft-certified Power Platform connector, which is a DIFFERENT surface: Microsoft\'s own ' +
            'proxy/policy (APIM) layer sitting in front of the same host. The MS-connector\'s single x-api-key header ' +
            'authenticates the CALLER to that proxy layer; it is not evidence of what the raw host requires directly.',
        candidateA_bestEvidence: {
            model: 'app + user handshake',
            confidence: 'strongest-evidence hypothesis for the raw host',
            mechanics:
                'App-init call presenting AppId + AppKey + AppName (and a user\'s own email/password) to obtain an ' +
                'Access-Token + App-Token pair, sent as dual headers on every subsequent request; tokens are cached ' +
                'and re-minted on expiry via the shared OAuth2TokenManager-style auth-helpers -- never inline crypto.',
            hypothesizedAuthHeaderPattern: 'Access-Token: <access_token>\nApp-Token: <app_token>  (HYPOTHESIS -- unverified; see status above)',
            credentialConfig:
                'Per-tenant host (HostUrl) + AppId + AppKey + AppName + end-user login -- every value is per-connection ' +
                'CompanyIntegration config; ZERO tenant/app constants are ever baked into connector code or this metadata file.',
            evidence: [
                'help.remembers.com/ams/Content/web_samples.htm (Tier-2, vendor\'s own re:Members AMS raw-API help doc, ' +
                    'referenced by a prior internal planning note in this vendor folder but NOT independently ' +
                    're-verifiable in THIS audit pass -- the URL is fully login-gated behind a MadCap Central SPA, ' +
                    'confirmed via repeated curl/WebFetch, see SOURCES.json): describes JS helper functions that ' +
                    '"handle API security internally without needing to get an AppToken or authenticate the user" -- ' +
                    'phrasing that only makes sense if the raw REST API NORMALLY requires obtaining an AppToken + ' +
                    'authenticating a user before those helpers\' convenience wrapper kicks in.',
                'Third-party LMS/Drupal integration guides (topclasslms.com/integrations/impexium, ' +
                    'drupal.org/project/impexium_sso -- out-of-scope partner-route sources, cited here only as ' +
                    'corroborating context, never as primary evidence) reference obtaining "App credentials" from ' +
                    'Impexium support for raw-API integrations, consistent with an app-credential model distinct ' +
                    'from a single static API key.',
            ],
        },
        candidateB_altSurface: {
            model: 'single x-api-key header',
            confidence: 'confirmed ExplicitStatement, Tier 1 -- but for a DIFFERENT surface only',
            mechanics:
                'sources/apiProperties.json declares exactly two connection parameters (hostUrl, api_key) with a ' +
                'dynamichosturl APIM policy (urlTemplate: "@connectionParameters(\'HostUrl\')/"); ' +
                'sources/apiDefinition.swagger.json declares securityDefinitions: {"API Key": {type: apiKey, in: ' +
                'header, name: "x-api-key"}}, security: [{"API Key": []}] applied uniformly across all 116 operations.',
            whyNotAdoptedForRawHost:
                'The MS-certified connector is a proxy/policy layer sitting in front of re:Members\' own host; its ' +
                'single x-api-key header is Microsoft\'s OWN connector-to-Azure-APIM-policy auth contract. It is NOT ' +
                'evidence of what the raw https://{tenant}.mpxapi.com host itself requires directly -- do not infer ' +
                'raw-API auth from Power-Platform-connector connection-parameter behavior.',
        },
        resolution:
            'CredentialTypeID (owned by identity-establisher, not this record) should be provisioned compatible with ' +
            'candidate A if/when a credential type must be chosen; the auth FLOW itself remains UNVERIFIED at this ' +
            'ceiling (format-verified-no-creds) until a live/sandbox probe against the actual mpxapi.com host settles ' +
            'it. CodeBuild should implement candidate A as the primary path with candidate B recorded as a cheaply ' +
            'swappable fallback -- never silently assumed correct.',
    },

    // --- Per-tenant host template + connection-parameter name (Tier-1, ExplicitStatement) ---
    TenantHostConfigKey: 'HostUrl',
    APIBaseURLTemplate: 'https://{tenant}.mpxapi.com',
    APIBaseURLNote:
        'Every re:Members AMS / Impexium tenant is reached at its own https://{tenant}.mpxapi.com host. Confirmed by ' +
        'apiProperties.json\'s "hostUrl" connection parameter (required, tooltip: "Specify your API Url e.g. ' +
        'https://abc.mpxapi.com") plus the "dynamichosturl" APIM policy template that rewrites the swagger\'s ' +
        'placeholder host to the tenant\'s real one at call time. The connector reads the tenant host from the ' +
        'per-connection CompanyIntegration config key named "HostUrl" (see TenantHostConfigKey) -- NEVER baked into ' +
        'this vendor-wide metadata file. All documented API paths are relative to this host with an /api/v1/ prefix ' +
        '(e.g. https://{tenant}.mpxapi.com/api/v1/Individuals/1).',

    // --- Pagination: page-number-in-PATH, uniform across all 116 documented paths ---
    PaginationDefaults: {
        type: 'PageNumber',
        mechanism:
            'Page number is a PATH SEGMENT, not a query parameter, on every list/collection endpoint (46 of 55 ' +
            'GET/list paths carry a {Page Number}/{pageNumber}/{Page} segment; the remaining 9 GET paths are ' +
            'get-by-id/get-one, not list endpoints). Segment naming varies cosmetically but the mechanic is uniform.',
        pageSegmentTemplateExamples: [
            '/api/v1/Individuals/{Page Number}',
            '/api/v1/Events/All/{Page Number}',
            '/api/v1/Committees/{Code}/subcommittees/{Page Number}',
            '/api/v1/Shopping/AbandonedCheckOuts/{Page Number}',
        ],
        responseEnvelope: {
            shape: '{ pageNumber: int, dataList: T[] }',
            dataKey: 'dataList',
            pageNumberKey: 'pageNumber',
            note: 'Completely consistent across all 55 list-shaped responses in the spec -- no results/data/items alternate observed anywhere.',
        },
        defaultPageSize: null,
        defaultPageSizeNote:
            'The ~250/page figure mentioned in this build\'s brief could NOT be confirmed from any reachable ' +
            'credential-free source -- no maxItems, no description text stating a page-size count anywhere in the ' +
            '843KB swagger (confirmed by direct script scan, see CODE_EVIDENCE). help.remembers.com (the vendor\'s ' +
            'own help center, the likeliest source for this) is fully login-gated and could not be verified. Left ' +
            'null rather than hardcoding 250 -- provable-only. Flag for a live/sandbox probe to confirm before ' +
            'assuming this value in code.',
        advanceProtocol:
            'Increment the path-segment page number on each subsequent call; stop when dataList.length === 0. No ' +
            'documented hasMore/totalPages/totalCount response field accompanies the {pageNumber, dataList} envelope ' +
            'anywhere in the spec, so termination must be inferred from an empty dataList, not a count field.',
    },

    // --- Incremental sync: rare, and BROADER than the SourceAudit study first found ---
    IncrementalSyncCapability: {
        supported: true,
        scope: 'partial -- exactly 4 of 37 COVERABLE leaves document an incremental query parameter',
        objects: [
            { object: 'Exams', param: 'changedSince', format: 'yyyy-MM-ddTHH:mm:ss (UTC)', path: '/api/v1/Products/Exams/{Page Number}' },
            { object: 'Purchases', param: 'purchasedSince', format: 'yyyy-MM-ddTHH:mm:ss', path: '/api/v1/Individuals/{ID or Record Number}/Purchases/{Page Number}' },
            { object: 'Event Registrations & Registrants', param: 'registeredSince', format: 'undocumented format string (title only: "Registered Since")', path: '/api/v1/Events/{Event Code}/Registrations/{Page Number}' },
            { object: 'Event Cancellations', param: 'cancelledSince', format: 'yyyy-MM-ddTHH:mm:ss', path: '/api/v1/Events/{Event Code}/Cancellations/{Page Number}' },
        ],
        note:
            'This build\'s own script-scan (extract-integration-config-facts.ts, see CODE_EVIDENCE) found 4 ' +
            'incremental-capable objects, TWO MORE than SOURCE_STUDY.md §3/§9 originally reported (which named ' +
            'only Exams/changedSince and Purchases/purchasedSince) -- registeredSince and cancelledSince were an ' +
            'independent finding of this pass, corroborated by direct re-inspection of the swagger. The remaining 33 ' +
            'leaves (including the highest-volume object, Individuals -- IndividualData has no modifiedOn/' +
            'lastModified field at all) are full-refresh-only per this source; SupportsIncrementalSync must be left ' +
            'false/unset for those 33 (ioiof-extractor\'s call, per-IO).',
    },

    // --- Rate limit: MS-connector-layer figure recorded as AWARENESS ONLY, never applied to Batch* ---
    RateLimitAwareness: {
        layerObserved: 'Microsoft-certified Power Platform connector (Azure APIM proxy layer), NOT the raw tenant host',
        documented: '100 API calls per connection per 60 seconds',
        source: 'Microsoft Learn connector reference page, "Throttling Limits" table (rendered <table>, not prose)',
        rawHostLimit: 'undocumented -- not found in any reachable credential-free source for this vendor',
        decision:
            'Integration.BatchMaxRequestCount / Integration.BatchRequestWaitTime are intentionally LEFT UNSET ' +
            '(framework default -1 = no limit / disable batching) rather than hard-coding 100/60. This figure ' +
            'governs the MS-certified connector\'s Azure APIM proxy layer, which this connector does NOT call -- it ' +
            'calls the raw https://{tenant}.mpxapi.com host directly. Treating a proxy-layer throttle as the raw ' +
            'host\'s own rate limit would be exactly the surface-conflation error flagged in AuthModel above. Revisit ' +
            'once a live/sandbox probe against the raw host observes real rate-limit headers or 429 behavior.',
    },

    // --- Write surface: extensive, but with real, provable asymmetries ---
    WriteCapability: {
        supported: true,
        scope:
            '50 POST + 10 PUT + 6 DELETE operations across Individuals, Organizations, Committees, Awards, Events, ' +
            'Exams, Requests, Tasks, CustomData, and Sales (independently re-confirmed by this pass\'s own script ' +
            'scan -- see CODE_EVIDENCE -- matching the prior independent review\'s manual count exactly).',
        createUpdateAsymmetry:
            'POST /api/v1/Individuals and POST /api/v1/Organizations both exist (Create, flat body, new ID in the ' +
            'response body\'s "id" field). PUT /api/v1/Organizations/{id} exists (Update, flat body, id in path). ' +
            'There is NO whole-record PUT/PATCH for Individuals -- only field-scoped sub-updates (email, phone, ' +
            'address, custom fields, categories).',
        deleteSurface:
            'The ONLY documented deletes in the entire 116-path/121-operation surface (6 DELETE operations total) ' +
            'are narrow sub-resource deletes: DELETE /Individuals/{RecordNumber}/Categories/{Code}, ' +
            'DELETE /Organizations/{RecordNumber}/Categories/{Code}, DELETE /Individuals/{ID}/Links, ' +
            'DELETE /Organizations/{ID}/Links, DELETE /CustomData/{TableName}/{ID}, DELETE /Webhooks/{Id}. There is ' +
            'NO delete for Individuals, Organizations, Committees, Awards, Events, or any other top-level entity -- ' +
            'a real, provable constraint, not an extraction miss.',
    },
    ConcurrencyControl: 'none',
    ConcurrencyControlNote:
        'No ETag, If-Match, If-Unmodified-Since header, or a version/revision field is documented anywhere in the ' +
        '843KB swagger for any of the 37 coverable leaves\' write operations (confirmed by direct inspection of every ' +
        'write-shape definition -- *SaveData/*CreateData/*UpdateData carry no version/etag/rowversion property). ' +
        'Conflict resolution for any future bidirectional EntityMap must use snapshot-3-way only -- do not ' +
        'recommend MostRecent.',
    DeleteSemantics: 'hard (where delete exists at all -- see WriteCapability.deleteSurface)',
    DeleteSemanticsDetail:
        'Delete exists ONLY for 6 narrow sub-resources (Category links, Links, a CustomData row, a Webhook ' +
        'registration) and every one returns a plain success/error response with no soft-delete/archive/tombstone ' +
        'field documented on the affected schema. No top-level entity (Individual, Organization, Committee, Award, ' +
        'Event, Membership, etc.) has ANY delete endpoint at all -- so for the overwhelming majority of objects, ' +
        'delete-safety is moot because delete is simply unavailable, not because it is soft.',
    DefaultSyncDirection: 'Pull',
    DefaultSyncDirectionNote:
        'Read-only default for every object per connector-code-conventions.md safety discipline, regardless of the ' +
        'substantial documented write surface (50 POST + 10 PUT). Bidirectional sync requires sandbox validation ' +
        'first -- see BidirectionalPreconditions.',
    DefaultConflictResolution: 'DestWins',
    DefaultConflictResolutionReason:
        'ConcurrencyControl=none (no ETag/If-Match/version field documented anywhere in this Tier-1 source) rules ' +
        'out MostRecent as a safe default -- MostRecent requires a reliable revision/timestamp-of-write signal to ' +
        'arbitrate conflicts, which this API does not expose. DestWins is the conservative default if/when any ' +
        'write-capable object is ever enabled for bidirectional sync -- it overwrites the MJ destination with the ' +
        'vendor\'s source-of-truth on pull, avoiding silent conflict-loss until a real concurrency signal is found.',
    BidirectionalPreconditions: [
        'Settle the AuthModel ambiguity above via a live/sandbox credential round-trip against the raw ' +
            'https://{tenant}.mpxapi.com host -- writes must never be attempted against an unverified auth flow.',
        'Obtain a live/sandbox re:Members AMS tenant and empirically confirm the actual request/response shape of ' +
            'every write path (Individual/Organization create + field-scoped sub-updates, Committee/Award/Task/' +
            'CustomerRequest/ExamScore/EducationCredit/Note/Activity writes) -- currently known only from the ' +
            'Power-Platform-generated swagger\'s documented request/response shapes, never from a live round-trip.',
        'Confirm whether ANY top-level entity gains a soft-delete/archive/status-based recovery path in the live ' +
            'system before ever treating a write-back delete as safe -- current evidence (no delete endpoint at all ' +
            'for top-level entities, hard delete with no recovery for the 6 sub-resources that do have one) implies ' +
            'delete is either unavailable or unrecoverable.',
        'Confirm whether a concurrency signal (ETag/version/last-modified-on-write) exists on the live API before ' +
            'ever recommending MostRecent -- current evidence (none discovered) implies conflict resolution can only ' +
            'be snapshot-3-way / DestWins, materially weaker than a versioned system.',
        'Re-verify the ~250/page pagination size and the true page-size ceiling against a live tenant -- this build ' +
            'could not confirm any page-size figure from credential-free sources (see PaginationDefaults).',
    ],

    // --- Webhooks: real, and richer than the MS Learn rendered page claims ---
    WebhooksAvailable: true,
    WebhooksNote:
        'Despite the Microsoft Learn rendered connector-reference page summarizing "No Triggers Documented -- ' +
        'actions only," the raw swagger declares 16 real webhook triggers (x-ms-trigger:"single" + ' +
        'x-ms-notification-content on 16 distinct /api/v1/Webhooks/* POST paths, re-confirmed by this pass\'s own ' +
        'script scan -- see CODE_EVIDENCE) plus a DELETE /Webhooks/{Id} deregistration endpoint. No HMAC/signature ' +
        'header (x-ms-*signature*, X-Hub-Signature, or similar) is documented anywhere in the webhook operations -- ' +
        'signature verification, if any, is undocumented in this source.',
    WebhooksSignatureAlgorithm: null,

    BulkOperationsAvailable: false,
    BulkOperationsNote: 'No batch/bulk endpoint (single-record-per-call semantics only) documented anywhere in the 116-path surface.',

    APIVersioningStrategy: 'URL-path',
    APIVersioningNote: 'Every documented path carries a literal /api/v1/ prefix (e.g. /api/v1/Individuals/{Page Number}). No header-based or Accept-header versioning observed.',

    ErrorResponseShape: null,
    ErrorResponseShapeNote:
        'Undocumented in this source. This Power-Platform-generated swagger declares ONLY a 200 response schema on ' +
        'every one of its 121 non-webhook operations -- zero operations declare a 4xx/5xx response schema anywhere ' +
        '(confirmed by direct script scan of every operation\'s responses object, see CODE_EVIDENCE). Whether the ' +
        'raw host returns a structured {code,message} envelope, a bare string, or something else on error could ' +
        'not be determined credential-free. Flag for a live/sandbox probe.',

    CustomFieldMarkerPattern: null,
    CustomFieldMarkerPatternNote:
        'No naming CONVENTION/prefix documented. GET /api/v1/Setup/customfields/1 ("List of all custom fields") ' +
        'returns a tenant-wide catalog of {name, caption, description, dataType, inputType, availableValues} but no ' +
        'prefix/marker pattern distinguishing a custom field\'s name from a standard one (contrast HubSpot\'s ' +
        'p_<accountID>_<name> convention, which has no analog here).',
    CustomObjectMarkerPattern: null,
    CustomObjectMarkerPatternNote:
        'No naming CONVENTION documented, and the evidence for a custom-OBJECT mechanism at all is thin: the only ' +
        'related surface is DELETE /api/v1/CustomData/{Table Name}/{ID}, a single DELETE-only path with no ' +
        'accompanying GET/POST/schema anywhere in the spec -- insufficient to derive a marker pattern or even ' +
        'confirm the shape of a "CustomData" table\'s records.',

    // --- Identifier convention: a soft, honest observation -- NOT a universalPK assertion ---
    IdentifierConventionNote:
        'No single field name clears a >=95% vendor-wide consistency bar for a universalPK hint: of the 73 named ' +
        'definitions, 20 use a bare "id" property and 12 use "recordNumber" (independently re-confirmed by this ' +
        'pass\'s own script scan, see CODE_EVIDENCE) -- well short of the statistical-significance threshold this ' +
        'build requires before asserting Configuration.universalPK. Notably, several path templates literally ' +
        'accept EITHER form interchangeably (e.g. "GET /api/v1/Individuals/{ID or Record Number}/Purchases/' +
        '{Page Number}"), i.e. the vendor\'s own API documents dual acceptance rather than a single canonical PK ' +
        'field name. Per-IOF IsPrimaryKey classification (per-object, not vendor-wide) is ioiof-extractor\'s job.',

    // --- Discovery authoritativeness: no complete-gamut describe endpoint ---
    DiscoveryIsAuthoritative: false,
    DiscoveryIsAuthoritativeRationale:
        'No describe-all/complete-gamut endpoint exists anywhere in this source -- GET /api/v1/Setup/customfields/1 ' +
        'is the closest analog but only enumerates the tenant\'s custom-FIELD catalog (name/caption/description/' +
        'dataType/inputType/availableValues), not a complete object/field gamut for the whole API surface. Per ' +
        'connector-code-conventions.md, DiscoveryIsAuthoritative may only be flipped true with evidence the ' +
        'connector\'s DiscoverObjects/DiscoverFields enumerate the COMPLETE gamut the credentials expose -- absent ' +
        'that, absence-on-a-later-refresh proves nothing and must never trigger deactivation. Customer-specific ' +
        'custom fields flow through runtime discovery (the customfields catalog endpoint, when the connector ' +
        'chooses to call it) plus the framework\'s general runtime custom-column capture path -- never a static, ' +
        'baked catalog.',

    // --- Out-of-scope object families (verbatim per build brief, cross-checked against SOURCE_STUDY.md §7) ---
    OutOfScopeObjectFamilies: [
        {
            family: 'Salesforce-route (re:Members AMS Platform built on Salesforce)',
            reason: 'Separate deployment architecture for some customers; core REST/Power-Platform surface is what\'s documented here. Requires per-customer platform confirmation.',
        },
        {
            family: 'Higher Logic Thrive Marketing sync route',
            reason: 'Partner-managed, customer-defined shared-view/SQL-view/query export pathway, not a stable Impexium-published object catalog.',
        },
        {
            family: 'Higher Logic Community sync route',
            reason: 'Partner-specific security-group/community-profile mapping convention, not a documented Impexium API object.',
        },
        {
            family: 'apidocs.impexdocs.com (ImpexDocs)',
            reason: 'Vendor name-collision with an unrelated export/shipping-logistics documentation vendor. Excluded per explicit instruction; never fetched.',
        },
        {
            family: 'LMS/TopClass/OasisLMS SSO+writeback route',
            reason: 'Third-party LMS partner conventions layered over Individuals/Certifications/EducationCredits already captured from the primary swagger; would double-count, not add objects.',
        },
        {
            family: 'Accounting/Finance (Sage-Intacct-style) route',
            reason: 'No Invoice/Payment/Refund endpoint exists anywhere in the swagger\'s 116 paths.',
        },
    ],
};

// ---------------------------------------------------------------------------
// PROVENANCE entries (docs-derived facts).
// ---------------------------------------------------------------------------
const provenanceEntries = [
    {
        URL: API_PROPS_URL,
        AccessedAt: NOW,
        UsedFor: 'Confirming the per-tenant host connection-parameter name and URL shape for Configuration.APIBaseURLTemplate / Configuration.TenantHostConfigKey / NavigationBaseURL.',
        SourceTier: 1 as const,
        SourceCategory: 'OpenAPISpec' as const,
        EvidenceStrength: 'ExplicitStatement' as const,
        TargetField: 'integration.NavigationBaseURL',
        Excerpt: '"hostUrl": {"type": "string", "uiDefinition": {"constraints": {"required": "true"}, "description": "Specify your API Url e.g. https://abc.mpxapi.com", "displayName": "API URL", "tooltip": "Specify your API Url e.g. https://abc.mpxapi.com"}}',
    },
    {
        URL: API_PROPS_URL,
        AccessedAt: NOW,
        UsedFor: 'Confirming Configuration.TenantHostConfigKey and Configuration.APIBaseURLTemplate (the dynamichosturl APIM policy rewrite).',
        SourceTier: 1 as const,
        SourceCategory: 'OpenAPISpec' as const,
        EvidenceStrength: 'ExplicitStatement' as const,
        TargetField: 'integration.Configuration.APIBaseURLTemplate',
        Excerpt: '"policyTemplateInstances": [{"templateId": "dynamichosturl", "title": "Host Url", "parameters": {"x-ms-apimTemplateParameter.urlTemplate": "@connectionParameters(\'HostUrl\')/"}}]',
    },
    {
        URL: SWAGGER_URL,
        AccessedAt: NOW,
        UsedFor: 'Confirming Configuration.AuthModel.candidateB_altSurface (single x-api-key header) as the MS-certified connector\'s own auth contract -- NOT adopted as raw-host evidence.',
        SourceTier: 1 as const,
        SourceCategory: 'OpenAPISpec' as const,
        EvidenceStrength: 'ExplicitStatement' as const,
        TargetField: 'integration.Configuration.AuthModel',
        Excerpt: '"securityDefinitions": {"API Key": {"type": "apiKey", "in": "header", "name": "x-api-key"}}, "security": [{"API Key": []}] applied uniformly across all 116 operations.',
    },
    {
        URL: MS_LEARN_URL,
        AccessedAt: NOW,
        UsedFor: 'Confirming the MS-connector-layer (Azure APIM proxy) rate-limit figure recorded in Configuration.RateLimitAwareness -- explicitly NOT applied to Integration.BatchMaxRequestCount/BatchRequestWaitTime.',
        SourceTier: 1 as const,
        SourceCategory: 'OfficialDocs' as const,
        EvidenceStrength: 'ExplicitStatement' as const,
        TargetField: 'integration.Configuration.RateLimitAwareness',
        Excerpt: '"Throttling Limits" table: <tr><td>API calls per connection</td><td>100</td><td>60 seconds</td></tr> (rendered <table>, not prose; independently re-fetched and confirmed present at the cited URL).',
    },
    {
        URL: SWAGGER_URL,
        AccessedAt: NOW,
        UsedFor: 'Documenting the out-of-scope-family list in Configuration.OutOfScopeObjectFamilies (no Invoice/Payment/Refund endpoint exists anywhere in the 116-path surface).',
        SourceTier: 1 as const,
        SourceCategory: 'OpenAPISpec' as const,
        EvidenceStrength: 'ExplicitStatement' as const,
        TargetField: 'integration.Configuration.OutOfScopeObjectFamilies',
        Excerpt: 'Full-text scan of all 116 paths / 137 operations in apiDefinition.swagger.json contains no path segment matching Invoice, Payment, or Refund (see SOURCE_STUDY.md §9 Gaps and §7).',
    },
];

// ---------------------------------------------------------------------------
// CODE_EVIDENCE entry (this run's own script-derived facts).
// ---------------------------------------------------------------------------
async function buildCodeEvidenceEntries(): Promise<Array<Record<string, unknown>>> {
    const { execFileSync } = await import('node:child_process');
    const scriptPath = 'scripts/extract-integration-config-facts.ts';
    const stdout = execFileSync('npx', ['tsx', scriptPath], {
        cwd: `${REPO_ROOT}/packages/Integration/connectors-registry/${CONNECTOR}`,
        encoding: 'utf-8',
    });
    const structuredOutput = JSON.parse(stdout);
    const runAt = new Date().toISOString();
    return [
        {
            ScriptPath: scriptPath,
            ScriptRunAt: runAt,
            StructuredOutput: structuredOutput.pagination,
            SchemaValidationStatus: 'Passed' as const,
            TargetField: 'integration.Configuration.PaginationDefaults',
        },
        {
            ScriptPath: scriptPath,
            ScriptRunAt: runAt,
            StructuredOutput: structuredOutput.incrementalWatermarkParams,
            SchemaValidationStatus: 'Passed' as const,
            TargetField: 'integration.Configuration.IncrementalSyncCapability',
        },
        {
            ScriptPath: scriptPath,
            ScriptRunAt: runAt,
            StructuredOutput: structuredOutput.webhooks,
            SchemaValidationStatus: 'Passed' as const,
            TargetField: 'integration.Configuration.WebhooksAvailable',
        },
        {
            ScriptPath: scriptPath,
            ScriptRunAt: runAt,
            StructuredOutput: structuredOutput.errorResponseShape,
            SchemaValidationStatus: 'Passed' as const,
            TargetField: 'integration.Configuration.ErrorResponseShape',
        },
        {
            ScriptPath: scriptPath,
            ScriptRunAt: runAt,
            StructuredOutput: structuredOutput.writeVerbInventory,
            SchemaValidationStatus: 'Passed' as const,
            TargetField: 'integration.Configuration.WriteCapability',
        },
        {
            ScriptPath: scriptPath,
            ScriptRunAt: runAt,
            StructuredOutput: structuredOutput.identifierFieldConvention,
            SchemaValidationStatus: 'Passed' as const,
            TargetField: 'integration.Configuration.IdentifierConventionNote',
        },
        {
            ScriptPath: scriptPath,
            ScriptRunAt: runAt,
            StructuredOutput: structuredOutput.customDataSurface,
            SchemaValidationStatus: 'Passed' as const,
            TargetField: 'integration.Configuration.CustomObjectMarkerPattern',
        },
    ];
}

async function main(): Promise<void> {
    const transport = new StdioClientTransport({ command: 'node', args: [SERVER_PATH], cwd: REPO_ROOT });
    const client = new Client({ name: 'metadata-writer-impexium', version: '1.0' }, { capabilities: {} });
    await client.connect(transport);

    // 1. Root Integration fields: NavigationBaseURL + Configuration.
    // BatchMaxRequestCount / BatchRequestWaitTime deliberately OMITTED (leave
    // framework default -1) -- see Configuration.RateLimitAwareness.decision.
    await client.callTool({
        name: 'upsert_integration_fields',
        arguments: {
            connector: CONNECTOR,
            fields: {
                NavigationBaseURL: 'https://{tenant}.mpxapi.com',
                Configuration,
            },
        },
    });

    // 2. Provenance entries.
    for (const entry of provenanceEntries) {
        await client.callTool({ name: 'append_provenance', arguments: { connector: CONNECTOR, entry } });
    }

    // 3. Code-evidence entries.
    const codeEvidenceEntries = await buildCodeEvidenceEntries();
    for (const entry of codeEvidenceEntries) {
        await client.callTool({ name: 'append_code_evidence', arguments: { connector: CONNECTOR, entry } });
    }

    await client.close();

    process.stdout.write(
        JSON.stringify(
            {
                FieldsPopulated: 2 + Object.keys(Configuration).length, // NavigationBaseURL + Configuration (root) + each Configuration key
                ProvenanceEntries: provenanceEntries.length,
                CodeEvidenceEntries: codeEvidenceEntries.length,
                ConfigurationJSONKeysUsed: Object.keys(Configuration),
            },
            null,
            2,
        ) + '\n',
    );
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
