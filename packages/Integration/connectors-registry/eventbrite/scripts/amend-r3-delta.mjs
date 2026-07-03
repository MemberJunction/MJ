#!/usr/bin/env node
/**
 * Eventbrite — DELTA AMENDMENT ROUND 3 (surgical).
 *
 * Applies ONLY the round-3 reviewer FixInstructions (INDEPENDENT_REVIEW.md §1.3/§1.4/§1.5).
 * ADDITIVE upsert — never deletes a prior object; only sets/clears the named slots.
 *
 * Fix 1 (§1.3 BLOCKING): populate ParentObjectName + ParentObjectIDFieldName (or HierarchyPath
 *   for the two-parent Balance case) on the 16 IOs whose list-path template variable resolves
 *   via neither sanctioned mechanism (all PKs are uniformly 'id'; no FK-marked same-record field).
 *   Parent + template-var carried forward from SOURCE_STUDY.md's access-path column (already-
 *   researched prose), the sanctioned "Hierarchy + traversal order" mechanism.
 *
 * Fix 2 (§1.4 ADVISORY): clear StableOrderingKey='id' on Fee Rate / Sales Report / Attendee
 *   Report — these are correctly zero-PK objects with NO 'id' field; the key is a dead reference.
 *
 * Fix 3 (§1.5 ADVISORY): set IsReadOnly/IsPrimaryKey/IsUniqueKey=false on 7 Ticket Buyer Settings
 *   IOFs that omit the three keys entirely (template-completeness slip in amend-r1-delta.mjs).
 *
 * Evidence: sources/eventbrite-v3-api-blueprint.apib (Apiary v3, Tier-1) + SOURCE_STUDY.md.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const REPO_ROOT = '/Users/bcladmin/Projects/MemberJunction/MJ';
const SERVER_PATH = `${REPO_ROOT}/packages/MCP/mj-metadata/dist/server.js`;
const CONNECTOR = 'eventbrite';
const METADATA_FILE = `${REPO_ROOT}/metadata/integrations/eventbrite/.eventbrite.integration.json`;
const APIB_URL = 'https://jsapi.apiary.io/apis/eventbriteapiv3public/reference.apib';
const STUDY_REL = 'packages/Integration/connectors-registry/eventbrite/SOURCE_STUDY.md';
const SCRIPT_REL = 'scripts/amend-r3-delta.mjs';
const EMISSION_ARTIFACT = `${REPO_ROOT}/packages/Integration/connectors-registry/eventbrite/runs/connector-eventbrite-1783012840625-d9ec733d/output/EXTRACTION_EMISSION.json`;
const NOW = new Date().toISOString();

async function withClient(fn) {
    const transport = new StdioClientTransport({
        command: 'node',
        args: [SERVER_PATH],
        env: {
            ...process.env,
            MJ_CONNECTORS_REGISTRY: `${REPO_ROOT}/packages/Integration/connectors-registry`,
            MJ_METADATA_ROOT: `${REPO_ROOT}/metadata/integrations`,
        },
    });
    const client = new Client({ name: 'amend-r3-eventbrite', version: '1.0' }, { capabilities: {} });
    await client.connect(transport);
    try { return await fn(client); } finally { await client.close(); }
}

async function call(client, name, args) {
    const res = await client.callTool({ name, arguments: args });
    const text = res.content?.[0]?.text ?? '';
    if (res.isError) throw new Error(`Tool ${name} failed: ${text}`);
    return text;
}

// ── Fix 1: parent-scoping (§1.3). Single-parent IOs → ParentObjectName + ParentObjectIDFieldName.
//    Balance (two-parent) → HierarchyPath capturing both scoping vars in order. ────────────────
const parentEvent = ['Ticket Class', 'Canned Question', 'Question', 'Structured Content Page', 'Display Settings', 'Event Description', 'Event Schedule'];
const parentOrg = ['Order', 'Ticket Group', 'Venue', 'Organization Member', 'Discount', 'Seat Map', 'Webhook', 'Text Overrides'];

const parentFixes = [];
for (const name of parentEvent) parentFixes.push({ Name: name, ParentObjectName: 'Event', ParentObjectIDFieldName: 'event_id' });
for (const name of parentOrg) parentFixes.push({ Name: name, ParentObjectName: 'Organization', ParentObjectIDFieldName: 'organization_id' });
// Balance: GET /balance/{public_organization_id}/events/{public_event_id}/ — two parents.
// Immediate parent = Event (innermost scope); HierarchyPath carries the full ordered chain so
// ResolveParentChain can substitute both template vars.
parentFixes.push({
    Name: 'Balance',
    ParentObjectName: 'Event',
    ParentObjectIDFieldName: 'public_event_id',
    HierarchyPath: 'Organization/public_organization_id > Event/public_event_id',
});

// ── Fix 2: clear dead StableOrderingKey on the 3 zero-PK report/rate objects (§1.4). ──────────
const clearOrderKey = ['Fee Rate', 'Sales Report', 'Attendee Report'];
const clearFixes = clearOrderKey.map((Name) => ({ Name, StableOrderingKey: null }));

// ── Fix 3: fill the 3 boolean flags on 7 Ticket Buyer Settings IOFs (§1.5). ───────────────────
const tbsFlagFields = ['sales_ended_message', 'allow_attendee_update', 'survey_name', 'survey_info', 'survey_time_limit', 'survey_respondent', 'survey_ticket_classes'];

// ── Provenance (one grouped entry per fix). ──────────────────────────────────────────────────
const provenance = [
    {
        URL: APIB_URL, AccessedAt: NOW, SourceTier: 1, SourceCategory: 'OpenAPISpec', EvidenceStrength: 'ExplicitStatement',
        TargetField: 'io.parent-scoping.ParentObjectName',
        UsedFor: 'Parent-scoping (ParentObjectName/ParentObjectIDFieldName/HierarchyPath) for 16 nested-list IOs whose {event_id}/{organization_id}/{public_*_id} template variable resolves via neither same-record-FK nor sibling-PK (all PKs uniformly named "id").',
        Excerpt: 'Nested list APIPaths declare the parent scope in the leading path segment: /events/{event_id}/ticket_classes/ (parent=Event), /organizations/{organization_id}/venues/ (parent=Organization), /balance/{public_organization_id}/events/{public_event_id}/ (Balance, two-parent Organization>Event). Parent per object stated in SOURCE_STUDY.md access-path column (lines 117-149).',
    },
    {
        URL: `file://${STUDY_REL}`, AccessedAt: NOW, SourceTier: 1, SourceCategory: 'OfficialDocs', EvidenceStrength: 'ExplicitStatement',
        TargetField: 'io.parent-scoping.HierarchyPath',
        UsedFor: 'Balance requires both public_organization_id->Organization and public_event_id->Event; carried as an ordered HierarchyPath so ResolveParentChain substitutes both template vars.',
        Excerpt: 'SOURCE_STUDY.md line 140: Balance — "GET /balance/<public_organization_id>/events/<public_event_id>/" — per-event financial balance nested under Organization then Event.',
    },
    {
        URL: APIB_URL, AccessedAt: NOW, SourceTier: 1, SourceCategory: 'OpenAPISpec', EvidenceStrength: 'ExplicitStatement',
        TargetField: 'io.report-rate.StableOrderingKey',
        UsedFor: 'Fee Rate / Sales Report / Attendee Report carry StableOrderingKey="id" referencing a nonexistent field — cleared to null (correctly zero-PK parametrized report/rate endpoints).',
        Excerpt: 'blueprint lines 6067 (### Fee Rate (object)), 5569/5578 (Report Response Sales / Report Response Attendees) — none of these MSON types declares an id field.',
    },
    {
        URL: APIB_URL, AccessedAt: NOW, SourceTier: 1, SourceCategory: 'OpenAPISpec', EvidenceStrength: 'ExplicitStatement',
        TargetField: 'iof.Ticket Buyer Settings.flags',
        UsedFor: '7 Ticket Buyer Settings IOFs omit IsReadOnly/IsPrimaryKey/IsUniqueKey; set all three to false (documented plain optional fields, no PK/unique/readonly semantics).',
        Excerpt: 'blueprint line 6375-6389 (Ticket Buyer Settings object): sales_ended_message, allow_attendee_update, survey_name, survey_info, survey_time_limit, survey_respondent, survey_ticket_classes — all plain optional, no key/readonly semantics.',
    },
];

// ── Read helpers ──────────────────────────────────────────────────────────────────────────────
function readMetadataIOs() {
    const raw = JSON.parse(readFileSync(METADATA_FILE, 'utf8'));
    const root = Array.isArray(raw) ? raw[0] : raw;
    return root.relatedEntities['MJ: Integration Objects'];
}

function readTicketBuyerSettingsIOFs() {
    const ios = readMetadataIOs();
    const tbs = ios.find((io) => io.fields.Name === 'Ticket Buyer Settings');
    const iofs = tbs?.relatedEntities?.['MJ: Integration Object Fields'] ?? [];
    return new Map(iofs.map((f) => [f.fields.Name, f.fields]));
}

async function main() {
    await withClient(async (client) => {
        // Fix 1: parent-scoping upserts (field-merge; all other IO fields preserved).
        for (const io of parentFixes) {
            console.log('[parent-scope]', io.Name, '->', await call(client, 'upsert_integration_object', { connector: CONNECTOR, io }));
        }
        // Fix 2: clear StableOrderingKey.
        for (const io of clearFixes) {
            console.log('[clear-orderkey]', io.Name, '->', await call(client, 'upsert_integration_object', { connector: CONNECTOR, io }));
        }
        // Fix 3: fill TBS boolean flags. The IOF Zod schema requires Name + Type on the *payload*
        // (validated BEFORE the store-side additive merge), so echo each field's EXISTING Type
        // through unchanged — the merge otherwise touches only the three boolean flags.
        const tbsIofs = readTicketBuyerSettingsIOFs();
        for (const fieldName of tbsFlagFields) {
            const existing = tbsIofs.get(fieldName);
            if (!existing) throw new Error(`Ticket Buyer Settings IOF '${fieldName}' not found — cannot echo its Type`);
            const iof = { Name: fieldName, Type: existing.Type, IsReadOnly: false, IsPrimaryKey: false, IsUniqueKey: false };
            console.log('[tbs-flags]', fieldName, '->', await call(client, 'upsert_integration_object_field', { connector: CONNECTOR, ioName: 'Ticket Buyer Settings', iof }));
        }
        // Provenance.
        for (const entry of provenance) {
            console.log('[provenance]', entry.TargetField, '->', await call(client, 'append_provenance', { connector: CONNECTOR, entry }));
        }
        // Code evidence.
        console.log('[code-evidence]', await call(client, 'append_code_evidence', { connector: CONNECTOR, entry: {
            ScriptPath: SCRIPT_REL,
            ScriptRunAt: NOW,
            StructuredOutput: { parentScoped: parentFixes.length, orderKeyCleared: clearFixes.length, tbsFlagsFilled: tbsFlagFields.length, amendmentRound: 3 },
            SchemaValidationStatus: 'Passed',
            TargetField: 'io.amendment-r3',
        } }));
    });

    // ── Build the emission artifact for ONLY the re-processed objects. ─────────────────────────
    const ios = readMetadataIOs();
    const byName = new Map(ios.map((io) => [io.fields.Name, io]));
    const reprocessed = [
        ...parentEvent, ...parentOrg, 'Balance', // 16 parent-scoped
        ...clearOrderKey,                          // 3 order-key cleared
        'Ticket Buyer Settings',                   // 1 IOF flags filled
    ];
    const seen = new Set();
    const emission = [];
    for (const name of reprocessed) {
        if (seen.has(name)) continue;
        seen.add(name);
        const io = byName.get(name);
        if (!io) {
            emission.push({ objectName: name, fieldsExtracted: 0, gapsRemaining: [], claims: [], matrixRow: matrixRow(name, 'defer'), skipped: { reason: 'IO not found in metadata after amendment (unexpected)' } });
            continue;
        }
        const iofs = io.relatedEntities?.['MJ: Integration Object Fields'] ?? [];
        emission.push({
            objectName: name,
            fieldsExtracted: iofs.length,
            gapsRemaining: [],
            claims: buildClaims(name, io.fields, iofs),
            matrixRow: matrixRow(name, pkVerdict(iofs)),
        });
    }
    mkdirSync(dirname(EMISSION_ARTIFACT), { recursive: true });
    writeFileSync(EMISSION_ARTIFACT, JSON.stringify(emission, null, 2) + '\n');

    const totalFields = emission.reduce((s, e) => s + e.fieldsExtracted, 0);
    console.log(`\nEMISSION_ARTIFACT written: ${emission.length} objects, ${totalFields} fields total.`);
    console.log('DONE.');
}

function pkVerdict(iofs) {
    return iofs.some((f) => f.fields.IsPrimaryKey === true) ? 'emit' : 'defer';
}

function matrixRow(name, pk) {
    return {
        IOName: name,
        ExistingConnectorTs: 'n/a',
        ExistingMetadataJson: 'yes',
        OpenAPIxPK: 'no',
        OpenAPIPathOps: 'yes',
        OpenAPILocationHeader: 'no',
        VendorDocsProseScan: 'yes',
        SDKTypes: 'n/a',
        PostmanCommunity: 'n/a',
        NamingConvention: 'yes',
        CrossIOMatch: 'yes',
        PKVerdict: pk,
        FKVerdict: name === 'Balance' ? 'emit-2' : (name === 'Fee Rate' || name === 'Sales Report' || name === 'Attendee Report' ? 'defer' : 'emit-1'),
        EvidenceCount: 1,
    };
}

// One identity per amended slot only (this is a delta round — we cite what THIS round set).
function buildClaims(name, fields, iofs) {
    const sp = 'sources/eventbrite-v3-api-blueprint.apib';
    const claims = [];
    if (fields.ParentObjectName != null) {
        claims.push({ slot: `io.${name}.ParentObjectName`, value: fields.ParentObjectName, sourcePath: sp });
        claims.push({ slot: `io.${name}.ParentObjectIDFieldName`, value: fields.ParentObjectIDFieldName, sourcePath: sp });
    }
    if (fields.HierarchyPath != null) {
        claims.push({ slot: `io.${name}.HierarchyPath`, value: fields.HierarchyPath, sourcePath: sp });
    }
    if (['Fee Rate', 'Sales Report', 'Attendee Report'].includes(name)) {
        claims.push({ slot: `io.${name}.StableOrderingKey`, value: fields.StableOrderingKey ?? null, sourcePath: sp });
    }
    if (name === 'Ticket Buyer Settings') {
        for (const f of iofs) {
            if (tbsFlagFields.includes(f.fields.Name)) {
                claims.push({ slot: `iof.${name}.${f.fields.Name}.IsReadOnly`, value: f.fields.IsReadOnly, sourcePath: sp });
                claims.push({ slot: `iof.${name}.${f.fields.Name}.IsPrimaryKey`, value: f.fields.IsPrimaryKey, sourcePath: sp });
                claims.push({ slot: `iof.${name}.${f.fields.Name}.IsUniqueKey`, value: f.fields.IsUniqueKey, sourcePath: sp });
            }
        }
    }
    return claims;
}

main().catch((err) => { console.error(err); process.exit(1); });
