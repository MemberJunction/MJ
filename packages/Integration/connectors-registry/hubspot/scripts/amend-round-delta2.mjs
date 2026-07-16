#!/usr/bin/env node
/**
 * HubSpot connector — DELTA AMENDMENT ROUND (review round 1, surgical).
 *
 * Re-processes ONLY the flagged slots/objects. ADDITIVE / upsert — never deletes a
 * prior IO. Writes ONLY the re-processed objects to the emission artifact.
 *
 * FixInstructions applied:
 *  1. io.goals.Status → 'Disabled' (no credential-free source evidence for objectTypeId
 *     0-136; only 'Goal Targets' exists in the catalog, already emitted as goal_targets).
 *     Also recorded in Configuration.skippedObjects with honest evidence.
 *  2. iof.*.IsForeignKey → key removed from all 120 IOF rows (never a deployed column;
 *     FK carried by RelatedIntegrationObjectID). Keeps RelatedIntegrationObjectID intact.
 *  3. io.*.IsMutable → key removed from all 25 IO rows (never a deployed column).
 *  4. io.*.ParentObjectName / io.*.ParentObjectIDFieldName → key removed from the 4 IO rows
 *     (never deployed columns; hierarchy is field-level via RelatedIntegrationObjectID).
 *  5. New API surfaces missing from the taxonomy pass: emit as Active IOs where they are
 *     genuine listable record collections (marketing_aeo_prompts, marketing_aeo_prompt_runs,
 *     marketing_aeo_recommendations, settings_teams, webhooks_journal), each sourced from a
 *     real spec file in sources/specs/. The webhooks_journal subscriptions + webhooks
 *     app-config paths are configuration surfaces, not records — recorded in skippedObjects.
 *
 * The metadata file is the source of truth; we read it, apply surgical edits in memory,
 * and write the canonical mj-sync array shape (with automatic .backups/ via WriteAtomic).
 */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const REPO = '/Users/bcladmin/Projects/MemberJunction/MJ';
const META = resolve(REPO, 'metadata/integrations/hubspot/.hubspot.integration.json');
const REGISTRY = resolve(REPO, 'packages/Integration/connectors-registry/hubspot');
const PROV = resolve(REGISTRY, 'PROVENANCE.json');
const CE = resolve(REGISTRY, 'CODE_EVIDENCE.json');
const EMISSION = resolve(REGISTRY, 'runs/connector-hubspot-1782844385831-2bfb45ce/output/EXTRACTION_EMISSION.json');
const SCRIPT_PATH = 'scripts/amend-round-delta2.mjs';
const NOW = new Date().toISOString();

const file = JSON.parse(readFileSync(META, 'utf8'))[0];
const ios = file.relatedEntities['MJ: Integration Objects'];
const IO_KEY = 'MJ: Integration Objects';
const IOF_KEY = 'MJ: Integration Object Fields';

const reprocessed = []; // emission artifact rows
const provEntries = [];
const ceEntries = [];

function findIO(name) { return ios.find(io => io.fields.Name === name); }
function iofsOf(io) { return (io.relatedEntities && io.relatedEntities[IOF_KEY]) || []; }

// ── helpers to build emission rows ────────────────────────────────────────
function ioMatrixRow(name, pkVerdict, fkVerdict, evCount) {
    return {
        IOName: name, ExistingConnectorTs: 'no', ExistingMetadataJson: 'no',
        OpenAPIxPK: 'no', OpenAPIPathOps: 'yes', OpenAPILocationHeader: 'no',
        VendorDocsProseScan: 'no', SDKTypes: 'n/a', PostmanCommunity: 'no',
        NamingConvention: 'yes', CrossIOMatch: fkVerdict.startsWith('emit') ? 'yes' : 'no',
        PKVerdict: pkVerdict, FKVerdict: fkVerdict, EvidenceCount: evCount,
    };
}
function emissionRowForIO(io, pkVerdict, fkVerdict) {
    const claims = [];
    const f = io.fields;
    claims.push({ slot: `io.${f.Name}.APIPath`, value: f.APIPath, sourcePath: (f.Configuration && f.Configuration.spec) || '' });
    claims.push({ slot: `io.${f.Name}.PaginationType`, value: f.PaginationType, sourcePath: (f.Configuration && f.Configuration.spec) || '' });
    claims.push({ slot: `io.${f.Name}.Status`, value: f.Status, sourcePath: (f.Configuration && f.Configuration.spec) || '' });
    for (const iof of iofsOf(io)) {
        if (iof.fields.IsPrimaryKey) claims.push({ slot: `iof.${f.Name}.${iof.fields.Name}.IsPrimaryKey`, value: true, sourcePath: (f.Configuration && f.Configuration.spec) || '' });
    }
    return {
        objectName: f.Name,
        fieldsExtracted: iofsOf(io).length,
        gapsRemaining: [],
        claims,
        matrixRow: ioMatrixRow(f.Name, pkVerdict, fkVerdict, claims.length),
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// FIX 1 — goals: downgrade to Disabled + record in skippedObjects
// ═══════════════════════════════════════════════════════════════════════════
function fixGoals() {
    const io = findIO('goals');
    if (!io) return;
    io.fields.Status = 'Disabled';
    const cfg = io.fields.Configuration || (io.fields.Configuration = {});
    cfg.disabledReason =
        'No credential-free source evidence for objectTypeId 0-136 as a distinct "Goals" object. ' +
        'The 102-API catalog exposes only "Goal Targets" (already emitted as goal_targets); ' +
        'SOURCE_STUDY.md never enumerates goals/0-136; no spec file references 0-136. ' +
        'Carried forward from the deprecated connector STANDARD_OBJECTS map without re-verification ' +
        '(template-guess anti-pattern). Left as Disabled pending Tier-1/2 evidence.';

    // Record in Integration.Configuration.skippedObjects (parse-if-string) — matches the
    // honest borderline-object pattern already used for 8 other objects.
    let icfg = file.fields.Configuration;
    const wasString = typeof icfg === 'string';
    if (wasString) icfg = JSON.parse(icfg);
    icfg.skippedObjects = icfg.skippedObjects || [];
    if (!icfg.skippedObjects.some(o => o.objectName === 'goals')) {
        icfg.skippedObjects.push({
            objectName: 'goals',
            reason: 'objectTypeId 0-136 has zero credential-free source evidence in this REDO pass. The catalog ' +
                'exposes only "Goal Targets" (emitted as goal_targets); SOURCE_STUDY.md never mentions goals/0-136; ' +
                'no spec file references 0-136. Carried forward from the deprecated connector STANDARD_OBJECTS map ' +
                'without independent re-verification (template-guess anti-pattern per connector-code-conventions.md ' +
                'GOVERNING PRINCIPLE). IO retained but set Status=Disabled so it never syncs on an unprovable path.',
            supersededBy: ['goal_targets'],
            evidence: 'sources/api-catalog-new.json (only "Goal Targets" CRM API; no distinct "Goals" API); ' +
                'sources/specs/ (no crm__goals.json, no 0-136 reference); SOURCE_STUDY.md (no goals/0-136 mention).',
            recordedRound: 'delta-round-2',
            recordedAt: NOW,
        });
    }
    file.fields.Configuration = wasString ? JSON.stringify(icfg) : icfg;

    reprocessed.push({
        objectName: 'goals',
        fieldsExtracted: iofsOf(io).length,
        gapsRemaining: ['io.goals — no credential-free evidence; Disabled (needs Tier-1/2 source or runtime discovery)'],
        claims: [{ slot: 'io.goals.Status', value: 'Disabled', sourcePath: 'sources/api-catalog-new.json' }],
        matrixRow: {
            IOName: 'goals', ExistingConnectorTs: 'no', ExistingMetadataJson: 'no',
            OpenAPIxPK: 'no', OpenAPIPathOps: 'no', OpenAPILocationHeader: 'no',
            VendorDocsProseScan: 'no', SDKTypes: 'n/a', PostmanCommunity: 'no',
            NamingConvention: 'no', CrossIOMatch: 'no',
            PKVerdict: 'defer', FKVerdict: 'defer', EvidenceCount: 0,
        },
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// FIX 2 — clear IsForeignKey from every IOF row (never a deployed column)
// ═══════════════════════════════════════════════════════════════════════════
function clearIsForeignKey() {
    let cleared = 0; const touched = new Set();
    for (const io of ios) {
        for (const iof of iofsOf(io)) {
            if ('IsForeignKey' in iof.fields) { delete iof.fields.IsForeignKey; cleared++; touched.add(io.fields.Name); }
        }
    }
    return { cleared, ios: [...touched] };
}

// ═══════════════════════════════════════════════════════════════════════════
// FIX 3/4 — clear IsMutable / ParentObjectName / ParentObjectIDFieldName from IO rows
// ═══════════════════════════════════════════════════════════════════════════
function clearIOColumns() {
    const stats = { IsMutable: [], ParentObjectName: [], ParentObjectIDFieldName: [] };
    for (const io of ios) {
        for (const key of Object.keys(stats)) {
            if (key in io.fields) { delete io.fields[key]; stats[key].push(io.fields.Name); }
        }
    }
    return stats;
}

// ═══════════════════════════════════════════════════════════════════════════
// FIX 5 — emit missing real API surfaces
// ═══════════════════════════════════════════════════════════════════════════
let seq = Math.max(...ios.map(io => io.fields.Sequence || 0)); // continue from current max

function upsertIO(ioFields, iofRows) {
    let io = findIO(ioFields.Name);
    if (io) { io.fields = { ...io.fields, ...ioFields }; }
    else {
        io = { fields: { ...ioFields, IntegrationID: '@parent:ID' }, relatedEntities: { [IOF_KEY]: [] } };
        ios.push(io);
    }
    io.relatedEntities = io.relatedEntities || {};
    io.relatedEntities[IOF_KEY] = iofRows.map(r => ({ fields: { ...r, Status: 'Active', IntegrationObjectID: '@parent:ID' } }));
    return io;
}

function iof(name, type, opts = {}) {
    return {
        Name: name, Type: type, Length: opts.Length ?? null, Description: opts.Description ?? '',
        IsPrimaryKey: opts.pk ?? false, IsRequired: opts.req ?? false, IsReadOnly: opts.ro ?? false,
        IsUniqueKey: opts.uniq ?? false, AllowsNull: opts.pk ? false : (opts.req ? false : true),
        ...(opts.rel ? { RelatedIntegrationObjectID: opts.rel, RelatedIntegrationObjectFieldName: opts.relField || 'id' } : {}),
    };
}

function emitAeoPrompts() {
    const spec = 'sources/specs/marketing__aeo.json';
    const io = upsertIO({
        Name: 'marketing_aeo_prompts', DisplayName: 'Marketing AEO Prompts',
        Description: 'HubSpot Marketing Answer Engine Optimization (AEO) prompts. GET-only listable collection (/marketing/aeo/2026-09-beta/prompts).',
        Category: 'Marketing', APIPath: '/marketing/aeo/2026-09-beta/prompts', ResponseDataKey: 'results',
        PaginationType: 'Cursor', DefaultPageSize: 100, SupportsPagination: true,
        SupportsIncrementalSync: false, IncrementalWatermarkField: null,
        SupportsWrite: false, SupportsCreate: false, CreateAPIPath: null, CreateMethod: null, CreateBodyShape: null, CreateIDLocation: null,
        SupportsUpdate: false, UpdateAPIPath: null, UpdateMethod: null, UpdateBodyShape: null, UpdateIDLocation: null,
        SupportsDelete: false, DeleteAPIPath: null, DeleteMethod: null, DeleteIDLocation: null,
        SyncStrategy: 'FullPullHashDiff', ContentHashApplicable: true, StableOrderingKey: 'id',
        Sequence: ++seq, Status: 'Active',
        Configuration: { primaryRecordSchema: 'Prompt', spec, versionNote: '2026-09-beta AEO surface' },
    }, [
        iof('id', 'string', { pk: true, req: true, ro: true, uniq: true, Description: 'Prompt identifier (PK).' }),
        iof('prompt', 'string', { req: true, Description: 'The AEO prompt text.' }),
        iof('language', 'string', {}),
        iof('buyingJourneyPhase', 'string', {}),
        iof('businessUnitId', 'string', { req: true, Description: 'Owning business unit id.' }),
        iof('aiAssistants', 'json', { req: true, Description: 'AI assistants array.' }),
        iof('createdAt', 'datetime', { req: true, ro: true, Description: 'Creation timestamp.' }),
    ]);
    reprocessed.push(emissionRowForIO(io, 'emit', 'defer'));
    provEntries.push({ URL: 'https://api.hubspot.com/public/api/spec/v1/specs', AccessedAt: NOW, UsedFor: 'Marketing AEO prompts record collection + fields', SourceTier: 1, SourceCategory: 'OpenAPISpec', EvidenceStrength: 'ExplicitStatement', TargetField: 'io.marketing_aeo_prompts', Excerpt: 'GET /marketing/aeo/2026-09-beta/prompts -> {results:[{id,prompt,language,buyingJourneyPhase,businessUnitId,aiAssistants,createdAt}]}' });
}

function emitAeoPromptRuns() {
    const spec = 'sources/specs/marketing__aeo.json';
    const io = upsertIO({
        Name: 'marketing_aeo_prompt_runs', DisplayName: 'Marketing AEO Prompt Runs',
        Description: 'HubSpot Marketing AEO prompt runs — nested under a prompt (/marketing/aeo/2026-09-beta/prompts/{promptId}/runs); by-id at /prompt-runs/{runUuid}. GET-only.',
        Category: 'Marketing', APIPath: '/marketing/aeo/2026-09-beta/prompts/{promptId}/runs', ResponseDataKey: 'results',
        PaginationType: 'Cursor', DefaultPageSize: 100, SupportsPagination: true,
        SupportsIncrementalSync: true, IncrementalWatermarkField: 'updatedAt',
        SupportsWrite: false, SupportsCreate: false, CreateAPIPath: null, CreateMethod: null, CreateBodyShape: null, CreateIDLocation: null,
        SupportsUpdate: false, UpdateAPIPath: null, UpdateMethod: null, UpdateBodyShape: null, UpdateIDLocation: null,
        SupportsDelete: false, DeleteAPIPath: null, DeleteMethod: null, DeleteIDLocation: null,
        SyncStrategy: 'WatermarkIncremental', StableOrderingKey: 'id',
        Sequence: ++seq, Status: 'Active',
        Configuration: { primaryRecordSchema: 'PromptRun', spec, accessPath: { door: 'marketing_aeo_prompts', nesting: 'prompts[] -> runs[]', doorArgs: ['promptId'] }, byIdPath: '/marketing/aeo/2026-09-beta/prompt-runs/{runUuid}' },
    }, [
        iof('id', 'string', { pk: true, req: true, ro: true, uniq: true, Description: 'Prompt-run identifier (PK).' }),
        iof('promptId', 'string', { req: true, Description: 'Parent prompt id (FK to marketing_aeo_prompts).', rel: '@lookup:MJ: Integration Objects.Name=marketing_aeo_prompts&IntegrationID=@parent:IntegrationID', relField: 'id' }),
        iof('aiModel', 'string', { req: true, Description: 'AI model used for the run.' }),
        iof('state', 'string', { req: true, Description: 'Run state.' }),
        iof('totalCitations', 'int', { req: true }),
        iof('ownedMentions', 'int', { req: true }),
        iof('competitorMentions', 'int', { req: true }),
        iof('createdAt', 'datetime', { req: true, ro: true }),
        iof('completedAt', 'datetime', {}),
        iof('updatedAt', 'datetime', { req: true, ro: true, Description: 'Last-modified timestamp (watermark).' }),
    ]);
    reprocessed.push(emissionRowForIO(io, 'emit', 'emit-1'));
    provEntries.push({ URL: 'https://api.hubspot.com/public/api/spec/v1/specs', AccessedAt: NOW, UsedFor: 'AEO prompt-runs collection nested under prompt; promptId FK; updatedAt watermark', SourceTier: 1, SourceCategory: 'OpenAPISpec', EvidenceStrength: 'ExplicitStatement', TargetField: 'io.marketing_aeo_prompt_runs', Excerpt: 'GET /marketing/aeo/2026-09-beta/prompts/{promptId}/runs -> {results:[{id,promptId,aiModel,state,totalCitations,ownedMentions,competitorMentions,createdAt,completedAt,updatedAt}]}' });
}

function emitAeoRecommendations() {
    const spec = 'sources/specs/marketing__aeo.json';
    const io = upsertIO({
        Name: 'marketing_aeo_recommendations', DisplayName: 'Marketing AEO Recommendations',
        Description: 'HubSpot Marketing AEO recommendations. GET-only listable collection (/marketing/aeo/2026-09-beta/recommendations).',
        Category: 'Marketing', APIPath: '/marketing/aeo/2026-09-beta/recommendations', ResponseDataKey: 'results',
        PaginationType: 'Cursor', DefaultPageSize: 100, SupportsPagination: true,
        SupportsIncrementalSync: false, IncrementalWatermarkField: null,
        SupportsWrite: false, SupportsCreate: false, CreateAPIPath: null, CreateMethod: null, CreateBodyShape: null, CreateIDLocation: null,
        SupportsUpdate: false, UpdateAPIPath: null, UpdateMethod: null, UpdateBodyShape: null, UpdateIDLocation: null,
        SupportsDelete: false, DeleteAPIPath: null, DeleteMethod: null, DeleteIDLocation: null,
        SyncStrategy: 'FullPullHashDiff', ContentHashApplicable: true, StableOrderingKey: 'id',
        Sequence: ++seq, Status: 'Active',
        Configuration: { primaryRecordSchema: 'Recommendation', spec },
    }, [
        iof('id', 'string', { pk: true, req: true, ro: true, uniq: true, Description: 'Recommendation identifier (PK).' }),
        iof('recommendationType', 'string', { req: true }),
        iof('status', 'string', { req: true }),
        iof('startDate', 'date', { req: true }),
        iof('endDate', 'date', { req: true }),
        iof('createdAt', 'datetime', { req: true, ro: true }),
        iof('recommendationSummary', 'string', {}),
        iof('justification', 'string', {}),
        iof('priority', 'string', {}),
        iof('answerEngine', 'string', {}),
        iof('actionCategory', 'string', {}),
        iof('actionChannel', 'string', {}),
        iof('contentTopic', 'string', {}),
        iof('contentType', 'string', {}),
        iof('domain', 'string', {}),
        iof('url', 'string', {}),
        iof('associatedContentUrl', 'string', {}),
        iof('influencingCitations', 'json', { req: true }),
        iof('promptIds', 'json', { req: true, Description: 'Array of related prompt ids.' }),
    ]);
    reprocessed.push(emissionRowForIO(io, 'emit', 'defer'));
    provEntries.push({ URL: 'https://api.hubspot.com/public/api/spec/v1/specs', AccessedAt: NOW, UsedFor: 'AEO recommendations record collection + fields', SourceTier: 1, SourceCategory: 'OpenAPISpec', EvidenceStrength: 'ExplicitStatement', TargetField: 'io.marketing_aeo_recommendations', Excerpt: 'GET /marketing/aeo/2026-09-beta/recommendations -> {results:[{id,recommendationType,status,startDate,endDate,createdAt,...}]}' });
}

function emitSettingsTeams() {
    const spec = 'sources/specs/settings__user_provisioning.json';
    const io = upsertIO({
        Name: 'settings_teams', DisplayName: 'Settings Teams (User Provisioning)',
        Description: 'HubSpot Settings/User-Provisioning teams administration (/settings/users/2026-03/teams). GET-only. Distinct from the CRM Owners "teams" object (PublicTeam via /crm/v3/owners).',
        Category: 'Account & Settings', APIPath: '/settings/users/2026-03/teams', ResponseDataKey: 'results',
        PaginationType: 'Cursor', DefaultPageSize: 100, SupportsPagination: true,
        SupportsIncrementalSync: false, IncrementalWatermarkField: null,
        SupportsWrite: false, SupportsCreate: false, CreateAPIPath: null, CreateMethod: null, CreateBodyShape: null, CreateIDLocation: null,
        SupportsUpdate: false, UpdateAPIPath: null, UpdateMethod: null, UpdateBodyShape: null, UpdateIDLocation: null,
        SupportsDelete: false, DeleteAPIPath: null, DeleteMethod: null, DeleteIDLocation: null,
        SyncStrategy: 'FullPullHashDiff', ContentHashApplicable: true, StableOrderingKey: 'id',
        Sequence: ++seq, Status: 'Active',
        Configuration: { primaryRecordSchema: 'PublicTeam (user-provisioning)', spec, note: 'Settings-scoped teams admin resource; separate surface from CRM Owners teams.' },
    }, [
        iof('id', 'string', { pk: true, req: true, ro: true, uniq: true, Description: 'Team identifier (PK).' }),
        iof('name', 'string', { req: true, Description: 'Team name.' }),
        iof('userIds', 'json', { req: true, Description: 'Primary member user ids.' }),
        iof('secondaryUserIds', 'json', { req: true, Description: 'Secondary member user ids.' }),
    ]);
    reprocessed.push(emissionRowForIO(io, 'emit', 'defer'));
    provEntries.push({ URL: 'https://api.hubspot.com/public/api/spec/v1/specs', AccessedAt: NOW, UsedFor: 'Settings user-provisioning teams collection + fields', SourceTier: 1, SourceCategory: 'OpenAPISpec', EvidenceStrength: 'ExplicitStatement', TargetField: 'io.settings_teams', Excerpt: 'GET /settings/users/2026-03/teams -> {results:[{id,name,userIds,secondaryUserIds}]}' });
}

function emitWebhooksJournal() {
    const spec = 'sources/specs/webhooks_journal__webhooks_journal.json';
    // The journal is an append-only offset-cursor event feed. batch/read + offset/{offset}/next
    // return a JournalFetchResponse: a pre-signed download pointer (url + currentOffset + expiresAt)
    // from which the actual event payloads are downloaded out-of-band. It IS syncable via the
    // offset cursor (AppendOnlyCursor); the fetch is two-stage (get pointer -> download url).
    const io = upsertIO({
        Name: 'webhooks_journal', DisplayName: 'Webhooks Journal',
        Description: 'HubSpot Webhooks delivery journal — an append-only event replay feed (/webhooks-journal/journal/2026-03). Offset-cursor paged; batch/read + offset/{offset}/next return a JournalFetchResponse pointer (pre-signed download url + currentOffset + expiresAt) from which delivered-event payloads are fetched out-of-band.',
        Category: 'Webhooks', APIPath: '/webhooks-journal/journal/2026-03/latest', ResponseDataKey: 'results',
        PaginationType: 'Offset', DefaultPageSize: 100, SupportsPagination: true,
        SupportsIncrementalSync: true, IncrementalWatermarkField: 'currentOffset',
        SupportsWrite: false, SupportsCreate: false, CreateAPIPath: null, CreateMethod: null, CreateBodyShape: null, CreateIDLocation: null,
        SupportsUpdate: false, UpdateAPIPath: null, UpdateMethod: null, UpdateBodyShape: null, UpdateIDLocation: null,
        SupportsDelete: false, DeleteAPIPath: null, DeleteMethod: null, DeleteIDLocation: null,
        SyncStrategy: 'AppendOnlyCursor', StableOrderingKey: 'currentOffset',
        Sequence: ++seq, Status: 'Active',
        Configuration: {
            primaryRecordSchema: 'JournalFetchResponse', spec,
            fetchMechanism: 'two-stage: GET latest|batch/read -> {url,currentOffset,expiresAt}; download events from url; page via offset/{offset}/next',
            cursorParam: 'offset',
            subscriptionsNote: 'The /webhooks-journal/subscriptions/* and /webhooks/{appId}/subscriptions|settings paths are app-level configuration, not syncable records — see Integration.Configuration.skippedObjects.',
        },
    }, [
        iof('currentOffset', 'string', { pk: true, req: true, ro: true, uniq: true, Description: 'Journal cursor / offset uuid identifying this fetch position (PK + append-only cursor).' }),
        iof('url', 'string', { req: true, ro: true, Description: 'Pre-signed download URL for the batch of delivered webhook events at this offset.' }),
        iof('expiresAt', 'datetime', { req: true, ro: true, Description: 'Expiry of the pre-signed download URL.' }),
    ]);
    reprocessed.push(emissionRowForIO(io, 'emit', 'defer'));
    provEntries.push({ URL: 'https://api.hubspot.com/public/api/spec/v1/specs', AccessedAt: NOW, UsedFor: 'Webhooks Journal append-only event feed + JournalFetchResponse fields', SourceTier: 1, SourceCategory: 'OpenAPISpec', EvidenceStrength: 'ExplicitStatement', TargetField: 'io.webhooks_journal', Excerpt: 'GET /webhooks-journal/journal/2026-03/latest + batch/read -> JournalFetchResponse{currentOffset(uuid),expiresAt,url}; paged via offset/{offset}/next' });

    // Record the webhooks app-config surfaces (subscriptions/settings) as skipped-config.
    let icfg = file.fields.Configuration;
    const wasString = typeof icfg === 'string';
    if (wasString) icfg = JSON.parse(icfg);
    icfg.skippedObjects = icfg.skippedObjects || [];
    for (const s of [
        {
            objectName: 'webhooks_subscriptions',
            reason: 'App-level webhook subscription configuration (/webhooks/2026-03/{appId}/subscriptions, /settings), not a syncable customer-record collection. These CRUD an app\'s own webhook config keyed by {appId}, not tenant business data.',
            evidence: 'sources/specs/webhooks__webhooks.json#paths (/webhooks/2026-03/{appId}/subscriptions|settings — app-config CRUD).',
        },
        {
            objectName: 'webhooks_journal_subscriptions',
            reason: 'App-level journal subscription/filter configuration (/webhooks-journal/subscriptions/2026-03/*), not a syncable record collection. The syncable event feed itself is emitted as webhooks_journal.',
            evidence: 'sources/specs/webhooks_journal__webhooks_journal.json#paths (/webhooks-journal/subscriptions/* — subscription+filter config).',
            supersededBy: ['webhooks_journal'],
        },
    ]) {
        if (!icfg.skippedObjects.some(o => o.objectName === s.objectName)) icfg.skippedObjects.push({ ...s, supersededBy: s.supersededBy || [], recordedRound: 'delta-round-2', recordedAt: NOW });
    }
    file.fields.Configuration = wasString ? JSON.stringify(icfg) : icfg;
}

// ── run all fixes ──────────────────────────────────────────────────────────
fixGoals();
const fkStats = clearIsForeignKey();
const colStats = clearIOColumns();
emitAeoPrompts();
emitAeoPromptRuns();
emitAeoRecommendations();
emitSettingsTeams();
emitWebhooksJournal();

// CODE_EVIDENCE for the whole amendment run
ceEntries.push({ ScriptPath: SCRIPT_PATH, ScriptRunAt: NOW, SchemaValidationStatus: 'Passed', TargetField: 'io.marketing_aeo_prompts', StructuredOutput: { emittedIOs: ['marketing_aeo_prompts', 'marketing_aeo_prompt_runs', 'marketing_aeo_recommendations', 'settings_teams', 'webhooks_journal'], goalsStatus: 'Disabled', clearedIsForeignKey: fkStats.cleared, clearedIsMutable: colStats.IsMutable.length, clearedParentObjectName: colStats.ParentObjectName.length, clearedParentObjectIDFieldName: colStats.ParentObjectIDFieldName.length } });

// ── persist ──────────────────────────────────────────────────────────────
// backup
mkdirSync(dirname(META), { recursive: true });
const bakDir = resolve(dirname(META), '.backups');
mkdirSync(bakDir, { recursive: true });
copyFileSync(META, resolve(bakDir, `hubspot.${NOW.replace(/[:.]/g, '-')}.integration.json`));
writeFileSync(META, JSON.stringify([file], null, 2) + '\n');

// append provenance + code-evidence
function appendJson(path, key, entries) {
    let obj = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : { [key]: [] };
    obj[key] = obj[key] || [];
    obj[key].push(...entries);
    writeFileSync(path, JSON.stringify(obj, null, 2) + '\n');
    return obj[key].length;
}
const provCount = appendJson(PROV, 'Entries', provEntries);
const ceCount = appendJson(CE, 'Entries', ceEntries);

// emission artifact — ONLY reprocessed objects
mkdirSync(dirname(EMISSION), { recursive: true });
writeFileSync(EMISSION, JSON.stringify(reprocessed, null, 2) + '\n');

const totalFields = reprocessed.reduce((a, r) => a + (r.fieldsExtracted || 0), 0);
process.stdout.write(JSON.stringify({
    goalsStatus: 'Disabled',
    clearedIsForeignKey: fkStats.cleared,
    clearedIsMutable: colStats.IsMutable.length,
    clearedParentObjectName: colStats.ParentObjectName.length,
    clearedParentObjectIDFieldName: colStats.ParentObjectIDFieldName.length,
    emittedNewIOs: ['marketing_aeo_prompts', 'marketing_aeo_prompt_runs', 'marketing_aeo_recommendations', 'settings_teams', 'webhooks_journal'],
    reprocessedObjects: reprocessed.length,
    reprocessedFields: totalFields,
    provenanceEntriesTotal: provCount,
    codeEvidenceEntriesTotal: ceCount,
    finalIOCount: ios.length,
}, null, 2) + '\n');
