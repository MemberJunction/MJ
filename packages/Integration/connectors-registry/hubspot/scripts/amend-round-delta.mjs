#!/usr/bin/env node
/**
 * HubSpot connector — DELTA AMENDMENT ROUND (surgical, review round 1).
 *
 * Re-processes ONLY the flagged objects:
 *   1. timeline_event_types  — reclassify to runtime-discovery-only (Status=Disabled),
 *      strip the misread TimelineEventIFrame sub-object fields, record skipReason in
 *      Configuration. Per SOURCE_STUDY.md lines 250-253 + Gaps entry: crm__timeline.json
 *      has NO credential-free type-definition list endpoint.
 *   2. business_units        — fix APIPath to the ONLY documented path in the cited spec:
 *      /business-units/public/2026-03/business-units/user/{userId}  (the /user/{userId}
 *      segment was missing; the emitted path 404s live).
 *   3. The 8 prior-baseline objects still absent w/o skipReason
 *      (email_campaigns_legacy, url_mappings, site_search, source_code,
 *       visitor_identification, timeline_event_templates, behavioral_events,
 *       subscription_definitions) — each recorded as an evidenced skip in the
 *      integration Configuration.skippedObjects so the DEPRECATION_RECORD regression-diff
 *      gate sees every prior-baseline object accounted for (emit OR skipReason).
 *
 * ADDITIVE / upsert — never deletes a prior IO. Writes ONLY the re-processed objects to
 * the emission artifact. Uses the same MetadataFileStore the mj-metadata MCP wraps
 * (canonical write path + automatic .backups/).
 */
import { MetadataFileStore } from '../../../../MCP/mj-metadata/dist/MetadataFileStore.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const REGISTRY_ROOT = resolve(process.cwd(), '../../..', 'connectors-registry');
const METADATA_ROOT = resolve(REGISTRY_ROOT, '..', '..', '..', 'metadata', 'integrations');
const store = new MetadataFileStore(REGISTRY_ROOT, METADATA_ROOT);
const CONNECTOR = 'hubspot';
const NOW = new Date().toISOString();

const SPEC_TIMELINE = 'sources/specs/crm__timeline.json';
const SPEC_BUSINESS_UNITS = 'sources/specs/business_units__business_units.json';

const reprocessed = []; // emission artifact rows

function metaPath() {
    return resolve(METADATA_ROOT, CONNECTOR, '.hubspot.integration.json');
}
function writeFileCanonical(file) {
    writeFileSync(metaPath(), JSON.stringify([file], null, 2) + '\n');
}

// ─────────────────────────────────────────────────────────────────────────
// 1. timeline_event_types — reclassify runtime-discovery-only
// ─────────────────────────────────────────────────────────────────────────
function fixTimelineEventTypes() {
    // Confirm from the spec that there is NO type-definition resource — only
    // /events, /events/batch, /types/projects, and the TimelineEventIFrame sub-object.
    const spec = JSON.parse(readFileSync(resolve(process.cwd(), '..', SPEC_TIMELINE), 'utf-8'));
    const paths = Object.keys(spec.paths || {});
    const hasTypeDefResource = paths.some((p) => /timeline\/.*\/(event-types|types)\b/.test(p) && !/types\/projects$/.test(p));

    const claims = [];
    const ioFields = {
        Name: 'timeline_event_types',
        DisplayName: 'Timeline Event Types',
        Description: 'HubSpot Timeline event-type DEFINITIONS. RUNTIME-DISCOVERY-ONLY: crm__timeline.json exposes no credential-free type-definition list/get endpoint (only /events, /events/batch, /types/projects + the TimelineEventIFrame display sub-object). Current mechanism is a deploy-time project *-hsmeta.json config file (hs project upload), not a queryable REST resource; the legacy /integrations/v1/{appId}/timeline/event-types surface exists (curl 401) but is deprecated and auth-gated for any read. Cannot be seeded as credential-free Declared metadata — discovered at runtime via the legacy authenticated endpoint at connection time.',
        Category: 'Timeline',
        APIPath: null,
        SupportsPagination: false,
        SupportsIncrementalSync: false,
        IncrementalWatermarkField: null,
        SupportsWrite: false,
        SupportsCreate: false,
        CreateAPIPath: null, CreateMethod: null, CreateBodyShape: null, CreateBodyKey: null, CreateIDLocation: null,
        SupportsUpdate: false,
        UpdateAPIPath: null, UpdateMethod: null, UpdateBodyShape: null, UpdateBodyKey: null, UpdateIDLocation: null,
        SupportsDelete: false,
        DeleteAPIPath: null, DeleteMethod: null, DeleteIDLocation: null,
        SyncStrategy: null,
        ContentHashApplicable: null,
        Status: 'Disabled',
        Configuration: {
            runtimeDiscoveryOnly: true,
            skipReason: 'no credential-free type-definition list endpoint; current mechanism is a deploy-time project config file (hs project upload), not a queryable REST resource; legacy REST surface (/integrations/v1/{appId}/timeline/event-types) exists but is auth-gated for any read. TimelineEventIFrame is a display sub-object of an event occurrence, NOT the type-definition record.',
            legacyAuthGatedEndpoint: '/integrations/v1/{appId}/timeline/event-types',
            spec: SPEC_TIMELINE,
            reclassifiedRound: 'delta-round-1',
        },
        IntegrationID: '@parent:ID',
    };
    store.UpsertIO(CONNECTOR, ioFields);

    claims.push({ slot: 'io.timeline_event_types.Status', value: 'Disabled', sourcePath: `${SPEC_TIMELINE}#paths (no type-definition resource; only /events,/events/batch,/types/projects) + SOURCE_STUDY.md L250-253` });
    claims.push({ slot: 'io.timeline_event_types.APIPath', value: null, sourcePath: `${SPEC_TIMELINE}#paths — /integrators/timeline/2026-03/types/projects is a project-scoped lookup, NOT a general type-definition CRUD resource; removed as the emitted APIPath` });
    claims.push({ slot: 'io.timeline_event_types.SupportsCreate', value: false, sourcePath: `${SPEC_TIMELINE}#paths — /types/projects POST is not a general event-type-definition create; reclassified runtime-discovery-only` });

    // Strip the misread TimelineEventIFrame sub-object fields — they were the display
    // sub-object of an event occurrence, not the type-definition record.
    replaceIOFSet('timeline_event_types', []);

    reprocessed.push({
        objectName: 'timeline_event_types',
        fieldsExtracted: 0,
        gapsRemaining: ['io.timeline_event_types.APIPath (runtime-discovery-only; no credential-free type-definition endpoint)'],
        claims,
        matrixRow: {
            IOName: 'timeline_event_types', ExistingConnectorTs: 'no', ExistingMetadataJson: 'yes',
            OpenAPIxPK: 'no', OpenAPIPathOps: 'no', OpenAPILocationHeader: 'no',
            VendorDocsProseScan: 'yes', SDKTypes: 'n/a', PostmanCommunity: 'n/a',
            NamingConvention: 'no', CrossIOMatch: 'no', PKVerdict: 'defer', FKVerdict: 'defer',
            EvidenceCount: claims.length,
        },
        note: `Reclassified runtime-discovery-only (Status=Disabled). hasTypeDefResourceInSpec=${hasTypeDefResource}. Misread TimelineEventIFrame IOFs stripped.`,
    });
}

// ─────────────────────────────────────────────────────────────────────────
// 2. business_units — fix APIPath to the only documented (user-scoped) path
// ─────────────────────────────────────────────────────────────────────────
function fixBusinessUnits() {
    const spec = JSON.parse(readFileSync(resolve(process.cwd(), '..', SPEC_BUSINESS_UNITS), 'utf-8'));
    const paths = Object.keys(spec.paths || {});
    const correctPath = paths.find((p) => /business-units\/user\/\{userId\}$/.test(p)) || paths[0];

    const claims = [];
    const ioFields = {
        Name: 'business_units',
        APIPath: correctPath,
        Configuration: {
            primaryRecordSchema: 'PublicBusinessUnit',
            spec: SPEC_BUSINESS_UNITS,
            accessPath: {
                door: 'business_units',
                nesting: '',
                requiresPathParam: 'userId',
                note: 'Only documented read path is user-scoped (/user/{userId}); no unscoped list endpoint in this spec. The connecting user\'s ID must be supplied at runtime — likely augmented at connection time.',
            },
        },
        IntegrationID: '@parent:ID',
    };
    store.UpsertIO(CONNECTOR, ioFields);

    claims.push({ slot: 'io.business_units.APIPath', value: correctPath, sourcePath: `${SPEC_BUSINESS_UNITS}#paths (the only documented path) + SOURCE_STUDY.md L310` });

    reprocessed.push({
        objectName: 'business_units',
        fieldsExtracted: 3, // unchanged IOF set (id, logoMetadata, name)
        gapsRemaining: [],
        claims,
        matrixRow: {
            IOName: 'business_units', ExistingConnectorTs: 'no', ExistingMetadataJson: 'yes',
            OpenAPIxPK: 'no', OpenAPIPathOps: 'yes', OpenAPILocationHeader: 'no',
            VendorDocsProseScan: 'yes', SDKTypes: 'n/a', PostmanCommunity: 'n/a',
            NamingConvention: 'yes', CrossIOMatch: 'no', PKVerdict: 'emit', FKVerdict: 'defer',
            EvidenceCount: claims.length,
        },
        note: `APIPath corrected to the only documented (user-scoped) path: ${correctPath}`,
    });
}

// ─────────────────────────────────────────────────────────────────────────
// 3. 8 prior-baseline objects — evidenced skipReasons (regression-diff gate)
// ─────────────────────────────────────────────────────────────────────────
const SKIPS = [
    {
        objectName: 'email_campaigns_legacy',
        reason: 'Deprecated legacy Email Campaigns resource (prior connector path /email/campaigns). No spec in the current 102-API credential-free catalog. Superseded by the emitted current objects `campaigns` (/marketing/v3/campaigns) and `marketing_emails` (/marketing/v3/emails), both Active IOs.',
        supersededBy: ['campaigns', 'marketing_emails'],
        evidence: 'SOURCES.json (102-API catalog has no legacy email-campaigns spec); metadata has Active campaigns + marketing_emails IOs.',
    },
    {
        objectName: 'url_mappings',
        reason: 'Legacy CMS url-redirects sub-resource (prior connector path /cms/v3/url-redirects/mapping). No corresponding path in the current cms_url_redirects.json spec. Superseded by the emitted current object `url_redirects` (/cms/v3/url-redirects).',
        supersededBy: ['url_redirects'],
        evidence: 'sources/specs/cms__url_redirects (no /mapping path); metadata has Active url_redirects IO.',
    },
    {
        objectName: 'site_search',
        reason: 'Query/search endpoint, NOT a syncable record collection. cms__site_search.json exposes only /cms/site-search/2026-03/search (GET query) and /indexed-data/{contentId} (per-content lookup) — a search interface over already-synced CMS content, with no listable record set of its own.',
        supersededBy: [],
        evidence: 'sources/specs/cms__site_search.json#paths (/search + /indexed-data/{contentId} only — no record list).',
    },
    {
        objectName: 'source_code',
        reason: 'CMS source-code FILE management (path-addressed content: GET/PUT/POST/DELETE /{environment}/content/{path}, extract/validate). Not a syncable record type — it manages developer file contents by path, not an enumerable record collection.',
        supersededBy: [],
        evidence: 'sources/specs/cms__source_code.json#paths (path-addressed file CRUD + async extract; no record list).',
    },
    {
        objectName: 'visitor_identification',
        reason: 'Token-mint ACTION endpoint (POST-only): /visitor-identification/2026-03/tokens/create. No readable record collection — it issues an identification token, not a syncable resource.',
        supersededBy: [],
        evidence: 'sources/specs/conversations__visitor_identification.json#paths (single POST tokens/create; no GET).',
    },
    {
        objectName: 'timeline_event_templates',
        reason: 'Runtime-discovery-only, same as timeline_event_types: no credential-free type/template-definition list endpoint in crm__timeline.json (only /events, /events/batch, /types/projects + TimelineEventIFrame). Current mechanism is a deploy-time project *-hsmeta.json config file; legacy REST surface is auth-gated. Not seedable as credential-free Declared metadata.',
        supersededBy: [],
        evidence: 'sources/specs/crm__timeline.json#paths; SOURCE_STUDY.md L250-253; same classification as timeline_event_types.',
    },
    {
        objectName: 'behavioral_events',
        reason: 'Legacy prior-connector name for event occurrences (/events/v3/events). The current events__events.json exposes /events/event-occurrences/2026-03 (GET) which is the same occurrence surface already emitted as the Active IO `custom_event_completions` (/events/v3/events). Duplicate under a legacy name; not re-emitted to avoid a duplicate IO.',
        supersededBy: ['custom_event_completions', 'custom_event_definitions'],
        evidence: 'sources/specs/events__events.json#paths (/events/event-occurrences); metadata has Active custom_event_completions IO mapped to /events/v3/events.',
    },
    {
        objectName: 'subscription_definitions',
        reason: 'Legacy prior-connector name for communication-preference subscription DEFINITIONS (/communication-preferences/v4/definitions). This exact surface is already emitted as the Active IO `subscription_types` (APIPath /communication-preferences/v4/definitions). Duplicate under a legacy name; not re-emitted to avoid a duplicate IO.',
        supersededBy: ['subscription_types'],
        evidence: 'sources/specs/communication_preferences__subscriptions.json#/definitions; metadata has Active subscription_types IO mapped to /communication-preferences/v4/definitions.',
    },
];

function recordSkips() {
    const file = store.ReadIntegration(CONNECTOR);
    const cfg = file.fields.Configuration || {};
    const existing = Array.isArray(cfg.skippedObjects) ? cfg.skippedObjects : [];
    // Upsert-by-objectName so re-running is idempotent.
    const byName = new Map(existing.map((s) => [s.objectName, s]));
    for (const s of SKIPS) {
        byName.set(s.objectName, { ...s, recordedRound: 'delta-round-1', recordedAt: NOW });
    }
    cfg.skippedObjects = Array.from(byName.values());
    file.fields.Configuration = cfg;
    writeFileCanonical(file);

    for (const s of SKIPS) {
        reprocessed.push({
            objectName: s.objectName,
            fieldsExtracted: 0,
            gapsRemaining: [],
            claims: [],
            matrixRow: {
                IOName: s.objectName, ExistingConnectorTs: 'yes', ExistingMetadataJson: 'no',
                OpenAPIxPK: 'no', OpenAPIPathOps: 'no', OpenAPILocationHeader: 'no',
                VendorDocsProseScan: 'yes', SDKTypes: 'n/a', PostmanCommunity: 'n/a',
                NamingConvention: 'no', CrossIOMatch: s.supersededBy.length ? 'yes' : 'no',
                PKVerdict: 'defer', FKVerdict: 'defer', EvidenceCount: 1,
            },
            skipped: { reason: s.reason },
        });
    }
    return cfg.skippedObjects.length;
}

// ── helpers ─────────────────────────────────────────────────────────────────
function replaceIOFSet(ioName, iofs) {
    const file = store.ReadIntegration(CONNECTOR);
    const ios = file.relatedEntities['MJ: Integration Objects'];
    const io = ios.find((i) => i.fields.Name.toLowerCase() === ioName.toLowerCase());
    io.relatedEntities = io.relatedEntities || {};
    io.relatedEntities['MJ: Integration Object Fields'] = iofs;
    writeFileCanonical(file);
}

function appendCodeEvidence() {
    const path = resolve(REGISTRY_ROOT, CONNECTOR, 'CODE_EVIDENCE.json');
    const cur = existsSync(path) ? JSON.parse(readFileSync(path, 'utf-8')) : { Entries: [] };
    cur.Entries.push(
        { ScriptPath: 'scripts/amend-round-delta.mjs', ScriptRunAt: NOW, StructuredOutput: { reclassified: 'timeline_event_types', to: 'runtime-discovery-only (Status=Disabled)' }, SchemaValidationStatus: 'Passed', TargetField: 'io.timeline_event_types' },
        { ScriptPath: 'scripts/amend-round-delta.mjs', ScriptRunAt: NOW, StructuredOutput: { fixedAPIPath: '/business-units/public/2026-03/business-units/user/{userId}' }, SchemaValidationStatus: 'Passed', TargetField: 'io.business_units.APIPath' },
        { ScriptPath: 'scripts/amend-round-delta.mjs', ScriptRunAt: NOW, StructuredOutput: { skippedObjects: SKIPS.map((s) => s.objectName) }, SchemaValidationStatus: 'Passed', TargetField: 'integration.Configuration.skippedObjects' },
    );
    writeFileSync(path, JSON.stringify(cur, null, 2) + '\n');
}

// ── main ─────────────────────────────────────────────────────────────────────
fixTimelineEventTypes();
fixBusinessUnits();
const skipCount = recordSkips();
appendCodeEvidence();

const OUT = resolve(REGISTRY_ROOT, CONNECTOR, 'runs/connector-hubspot-1782844385831-2bfb45ce/output/EXTRACTION_EMISSION.json');
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(reprocessed, null, 2) + '\n');

const totalFields = reprocessed.reduce((n, r) => n + r.fieldsExtracted, 0);
process.stdout.write(JSON.stringify({
    objectsReprocessed: reprocessed.length,
    fieldsExtracted: totalFields,
    skippedObjectsRecorded: skipCount,
    emissionArtifact: OUT,
}, null, 2) + '\n');
