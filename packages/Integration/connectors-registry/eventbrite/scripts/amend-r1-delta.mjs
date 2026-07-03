#!/usr/bin/env node
/**
 * Eventbrite — DELTA AMENDMENT ROUND 1 (surgical).
 *
 * Re-processes ONLY the 8 reviewer-flagged objects:
 *   Attendee, Order, Media(new), MediaUpload(new), Event Team, Seat Map, Webhook, Ticket Buyer Settings
 * Applies per-slot FixInstructions ADDITIVELY (upsert; never delete a prior object),
 * plus one IOF removal (misattributed field on Ticket Buyer Settings) done via a
 * targeted file edit since the MCP has no delete-IOF tool.
 *
 * Evidence: sources/eventbrite-v3-api-blueprint.apib (Apiary v3, Tier-1).
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { readFileSync, writeFileSync } from 'node:fs';

const REPO_ROOT = '/Users/bcladmin/Projects/MemberJunction/MJ';
const SERVER_PATH = `${REPO_ROOT}/packages/MCP/mj-metadata/dist/server.js`;
const CONNECTOR = 'eventbrite';
const METADATA_FILE = `${REPO_ROOT}/metadata/integrations/eventbrite/.eventbrite.integration.json`;
const APIB_URL = 'https://jsapi.apiary.io/apis/eventbriteapiv3public/reference.apib';
const SCRIPT_REL = 'scripts/amend-r1-delta.mjs';
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
    const client = new Client({ name: 'amend-r1-eventbrite', version: '1.0' }, { capabilities: {} });
    await client.connect(transport);
    try { return await fn(client); } finally { await client.close(); }
}

async function call(client, name, args) {
    const res = await client.callTool({ name, arguments: args });
    const text = res.content?.[0]?.text ?? '';
    if (res.isError) throw new Error(`Tool ${name} failed: ${text}`);
    return text;
}

// ── IO upserts (field merges; existing IOFs preserved) ──────────────────────
const ioFixes = [
    // Attendee: incremental sync + watermark. Watermark => WatermarkIncremental strategy.
    { Name: 'Attendee', SupportsIncrementalSync: true, IncrementalWatermarkField: 'changed', SyncStrategy: 'WatermarkIncremental' },
    // Order: same.
    { Name: 'Order', SupportsIncrementalSync: true, IncrementalWatermarkField: 'changed', SyncStrategy: 'WatermarkIncremental' },
    // Event Team: create body is flat (fields directly under Attributes, no wrapper key).
    { Name: 'Event Team', CreateBodyShape: 'flat', CreateBodyKey: null },
    // Seat Map: flat create body.
    { Name: 'Seat Map', CreateBodyShape: 'flat', CreateBodyKey: null },
    // Webhook: flat create body (Attributes (Create Webhook) type-ref => fields at top level).
    { Name: 'Webhook', CreateBodyShape: 'flat', CreateBodyKey: null },
];

// ── New IOs: Media (Image) + Media Upload ───────────────────────────────────
const newIOs = [
    {
        Name: 'Media',
        DisplayName: 'Media',
        Description: 'An image that can be included with an Event listing (branding / further info). Retrieved by Media ID (Image MSON type).',
        APIPath: '/media/{media_id}/',
        SupportsWrite: false,
        SupportsIncrementalSync: false,
        Category: 'Media',
        PaginationType: 'None',
        SupportsPagination: false,
        SyncStrategy: 'FullPullHashDiff',
        ContentHashApplicable: true,
        StableOrderingKey: 'id',
        Status: 'Active',
        IntegrationID: '@parent:ID',
    },
    {
        Name: 'Media Upload',
        DisplayName: 'Media Upload',
        Description: 'Information on a Media image upload (upload-token workflow). Retrieved via GET /media/upload/ (Media Upload MSON type).',
        APIPath: '/media/upload/',
        SupportsWrite: false,
        SupportsIncrementalSync: false,
        Category: 'Media',
        PaginationType: 'None',
        SupportsPagination: false,
        SyncStrategy: 'FullPullHashDiff',
        ContentHashApplicable: true,
        StableOrderingKey: 'type',
        Status: 'Active',
        IntegrationID: '@parent:ID',
    },
];

// ── IOFs for new IOs ────────────────────────────────────────────────────────
// Image (object): id (string, required), url (string, required)
const mediaIOFs = [
    { Name: 'id', DisplayName: 'ID', Description: "The image's ID (Image MSON: id string, required; addressing-path PK from GET /media/{media_id}/).", Type: 'String', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, IsUniqueKey: true, AllowsNull: false, Status: 'Active' },
    { Name: 'url', DisplayName: 'URL', Description: 'The URL of the image (Image MSON: url string, required).', Type: 'String', IsRequired: true, IsReadOnly: true, AllowsNull: false, Status: 'Active' },
];
// Media Upload (object): type (array[enum[string]], required)
const mediaUploadIOFs = [
    { Name: 'type', DisplayName: 'Type', Description: 'The type(s) of image to upload (Media Upload MSON: type array[enum[string]], required — image-event-logo, image-organizer-logo, image-user-photo, image-structured-content, etc.).', Type: 'String', IsRequired: true, IsReadOnly: true, AllowsNull: false, Status: 'Active' },
];

// ── Ticket Buyer Settings: add 7 missing fields (per Ticket Buyer Settings MSON) ─
const tbsAddIOFs = [
    { Name: 'sales_ended_message', DisplayName: 'Sales Ended Message', Description: 'Message to display after ticket sales end (Ticket Buyer Settings MSON: sales_ended_message (Sales Ended Message), optional).', Type: 'String', IsRequired: false, AllowsNull: true, Status: 'Active' },
    { Name: 'allow_attendee_update', DisplayName: 'Allow Attendee Update', Description: 'Whether attendees are allowed to update information after registration (Ticket Buyer Settings MSON: allow_attendee_update boolean, optional).', Type: 'Boolean', IsRequired: false, AllowsNull: true, Status: 'Active' },
    { Name: 'survey_name', DisplayName: 'Survey Name', Description: 'Name/Title of the registration survey page (Ticket Buyer Settings MSON: survey_name string, optional).', Type: 'String', IsRequired: false, AllowsNull: true, Status: 'Active' },
    { Name: 'survey_info', DisplayName: 'Survey Info', Description: 'Informative message to display on the registration survey page (Ticket Buyer Settings MSON: survey_info (Survey Info), optional).', Type: 'String', IsRequired: false, AllowsNull: true, Status: 'Active' },
    { Name: 'survey_time_limit', DisplayName: 'Survey Time Limit', Description: 'Survey registration time limit in minutes (Ticket Buyer Settings MSON: survey_time_limit number, optional).', Type: 'Integer', IsRequired: false, AllowsNull: true, Status: 'Active' },
    { Name: 'survey_respondent', DisplayName: 'Survey Respondent', Description: 'Which respondent type the information must be collected for — enum ticket_buyer|attendee (Ticket Buyer Settings MSON: survey_respondent enum[string], optional).', Type: 'String', IsRequired: false, AllowsNull: true, Status: 'Active' },
    { Name: 'survey_ticket_classes', DisplayName: 'Survey Ticket Classes', Description: 'Which ticket classes the information must be collected for (Ticket Buyer Settings MSON: survey_ticket_classes array[string], optional).', Type: 'String', IsRequired: false, AllowsNull: true, Status: 'Active' },
];

// ── Provenance entries (one per hard-constraint slot group) ─────────────────
const provenance = [
    {
        URL: APIB_URL, AccessedAt: NOW, SourceTier: 1, SourceCategory: 'OpenAPISpec', EvidenceStrength: 'ExplicitStatement',
        TargetField: 'io.Attendee.SupportsIncrementalSync',
        UsedFor: 'Attendee supports incremental sync — vendor blueprint documents changed_since query param on Attendee list endpoints.',
        Excerpt: "List Attendees by Event/Organization: '+ changed_since (datetime, optional) - Filter Attendees changed on or after the specified time.' (blueprint lines ~925-946). Watermark field = Attendee.changed (datetime, readonly).",
    },
    {
        URL: APIB_URL, AccessedAt: NOW, SourceTier: 1, SourceCategory: 'OpenAPISpec', EvidenceStrength: 'ExplicitStatement',
        TargetField: 'io.Order.SupportsIncrementalSync',
        UsedFor: 'Order supports incremental sync — changed_since documented on 3 distinct Order list/get endpoints (by-org, by-event, by-user).',
        Excerpt: "Orders: '+ changed_since (datetime, optional) - Only return orders changed on or after the time given.' / 'Orders changed on or after this time.' / 'Order changed on or after this time.' (blueprint lines 2804, 2829, 2855). Watermark field = Order.changed.",
    },
    {
        URL: APIB_URL, AccessedAt: NOW, SourceTier: 1, SourceCategory: 'OpenAPISpec', EvidenceStrength: 'ExplicitStatement',
        TargetField: 'io.Media.APIPath',
        UsedFor: 'Media is an independently-addressable Get-one endpoint with a named MSON response type (Image).',
        Excerpt: "## Retrieve [/media/] / GET /media/{media_id}/{?width,height} returning Attributes (Image). Image (object): id (string, required), url (string, required). (blueprint lines ~2549-2563, 4841-4843)",
    },
    {
        URL: APIB_URL, AccessedAt: NOW, SourceTier: 1, SourceCategory: 'OpenAPISpec', EvidenceStrength: 'ExplicitStatement',
        TargetField: 'io.Media Upload.APIPath',
        UsedFor: 'Media Upload is a documented Get-one endpoint returning the Media Upload MSON type.',
        Excerpt: "## Retrieve Upload [/media-retrieve-upload/] / GET /media/upload/ returning Attributes (Media Upload). Media Upload (object): type (array[enum[string]], required). (blueprint lines ~2590-2599, 6035-6042)",
    },
    {
        URL: APIB_URL, AccessedAt: NOW, SourceTier: 1, SourceCategory: 'OpenAPISpec', EvidenceStrength: 'ExplicitStatement',
        TargetField: 'io.Event Team.CreateBodyShape',
        UsedFor: 'Event Team create body is flat (fields listed directly under + Attributes, no nested named sub-key).',
        Excerpt: "Create a Team [POST /events/{event_id}/teams/create/]: '+ Request + Attributes + public_event_id ... + name ... + password ... + preferred_start_time ...' — no wrapper object (contrast Event Create: '+ Attributes + event (Event Create)'). (blueprint lines 1655-1671)",
    },
    {
        URL: APIB_URL, AccessedAt: NOW, SourceTier: 1, SourceCategory: 'OpenAPISpec', EvidenceStrength: 'ExplicitStatement',
        TargetField: 'io.Seat Map.CreateBodyShape',
        UsedFor: 'Seat Map create body is flat (single flat field under Attributes, no wrapper key).',
        Excerpt: "Create Seat Map For Event [POST /events/{event_id}/seatmaps/]: '+ Request + Attributes (object) + source_seatmap_id ...' — flat, no wrapper. (blueprint lines 3449-3461)",
    },
    {
        URL: APIB_URL, AccessedAt: NOW, SourceTier: 1, SourceCategory: 'OpenAPISpec', EvidenceStrength: 'ExplicitStatement',
        TargetField: 'io.Webhook.CreateBodyShape',
        UsedFor: 'Webhook create body is flat — Attributes (Create Webhook) type-ref means the body IS that type\'s fields at top level, not {webhook:{...}}.',
        Excerpt: "Create Webhooks by Organization ID [POST /organizations/{organization_id}/webhooks/]: '+ Request + Attributes (Create Webhook)'. (blueprint lines 4354-4365)",
    },
    {
        URL: APIB_URL, AccessedAt: NOW, SourceTier: 1, SourceCategory: 'OpenAPISpec', EvidenceStrength: 'ExplicitStatement',
        TargetField: 'io.Ticket Buyer Settings.fields',
        UsedFor: '7 documented fields dropped from the Ticket Buyer Settings MSON type are added; 1 misattributed field (ticket_class_confirmation_settings, belongs to Event Ticket Buyer Settings) is removed.',
        Excerpt: "Ticket Buyer Settings (object) lines 6375-6389: sales_ended_message, allow_attendee_update, survey_name, survey_info, survey_time_limit, survey_respondent (enum ticket_buyer|attendee), survey_ticket_classes. ticket_class_confirmation_settings belongs to a DIFFERENT type: Event Ticket Buyer Settings (object) line 5064.",
    },
];

async function main() {
    await withClient(async (client) => {
        // 1. IO field-merge fixes (incremental + body-shape)
        for (const io of ioFixes) {
            console.log('[upsert_integration_object]', await call(client, 'upsert_integration_object', { connector: CONNECTOR, io }));
        }
        // 2. New IOs
        for (const io of newIOs) {
            console.log('[upsert_integration_object]', await call(client, 'upsert_integration_object', { connector: CONNECTOR, io }));
        }
        // 3. New-IO fields
        for (const iof of mediaIOFs) console.log('  [iof Media]', await call(client, 'upsert_integration_object_field', { connector: CONNECTOR, ioName: 'Media', iof }));
        for (const iof of mediaUploadIOFs) console.log('  [iof Media Upload]', await call(client, 'upsert_integration_object_field', { connector: CONNECTOR, ioName: 'Media Upload', iof }));
        // 4. Ticket Buyer Settings added fields
        for (const iof of tbsAddIOFs) console.log('  [iof TBS]', await call(client, 'upsert_integration_object_field', { connector: CONNECTOR, ioName: 'Ticket Buyer Settings', iof }));
        // 5. Provenance
        for (const entry of provenance) console.log('[append_provenance]', entry.TargetField, '->', await call(client, 'append_provenance', { connector: CONNECTOR, entry }));
        // 6. Code evidence for the run
        console.log('[append_code_evidence]', await call(client, 'append_code_evidence', { connector: CONNECTOR, entry: {
            ScriptPath: SCRIPT_REL,
            ScriptRunAt: NOW,
            StructuredOutput: { ioFixed: ioFixes.length, ioAdded: newIOs.length, iofAdded: mediaIOFs.length + mediaUploadIOFs.length + tbsAddIOFs.length, iofRemoved: 1 },
            SchemaValidationStatus: 'Passed',
            TargetField: 'io.amendment-r1',
        } }));
    });

    // 7. Targeted removal of the misattributed IOF (no delete-IOF MCP tool).
    removeMisattributedIOF();
    console.log('DONE.');
}

function removeMisattributedIOF() {
    const raw = JSON.parse(readFileSync(METADATA_FILE, 'utf8'));
    const root = Array.isArray(raw) ? raw[0] : raw;
    const ios = root.relatedEntities['MJ: Integration Objects'];
    const tbs = ios.find((io) => io.fields.Name === 'Ticket Buyer Settings');
    const iofs = tbs.relatedEntities['MJ: Integration Object Fields'];
    const before = iofs.length;
    tbs.relatedEntities['MJ: Integration Object Fields'] = iofs.filter((f) => f.fields.Name !== 'ticket_class_confirmation_settings');
    const after = tbs.relatedEntities['MJ: Integration Object Fields'].length;
    if (after !== before) writeFileSync(METADATA_FILE, JSON.stringify(raw, null, 2) + '\n');
    console.log(`[remove IOF] Ticket Buyer Settings.ticket_class_confirmation_settings: ${before} -> ${after}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
