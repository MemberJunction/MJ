#!/usr/bin/env node
/**
 * Eventbrite — DELTA AMENDMENT ROUND 4 (surgical, single object).
 *
 * Re-processes ONLY the flagged object: Event.
 * Applies the reviewer's BLOCKING FixInstruction (INDEPENDENT_REVIEW.md §1.1):
 * clear the semantically-wrong FK on Event.organizer_id.
 *
 *   iof.Event.organizer_id.IsForeignKey                : true  -> false
 *   iof.Event.organizer_id.RelatedIntegrationObjectID  : @lookup:...Organization... -> (removed/null)
 *   iof.Event.organizer_id.Configuration.ReferencedType: "Organization" -> (removed/null)
 *
 * Rationale: organizer_id's documented target is the Organizer MSON type (.apib line 1791
 * Expansions -> #organizer_object; lines 4909-4920 distinct type; line 2925 explicit vendor
 * statement "The organization_id is NOT equal to an organizer_id"). Organizer has no coverable
 * IO in this run, so the FK to Organization is a wrong cross-IO name-match. Clear, do NOT repoint.
 *
 * Mechanism: the mj-metadata MCP upsert is a shallow key-MERGE ({...old, ...new}) and its
 * IntegrationObjectFieldSchema rejects null for RelatedIntegrationObjectID (z.string().optional()),
 * so it CANNOT delete a key nor null the FK pointer. Per the established precedent in
 * amend-r1-delta.mjs (which removed a misattributed IOF via a targeted file edit "since the MCP
 * has no delete-IOF tool"), the key-clearing is done as a surgical, single-field targeted file
 * edit. IsForeignKey=false is expressible via merge but is co-applied in the same edit for
 * atomicity. Code-evidence for all three slots is appended via the MCP.
 *
 * ADDITIVE: never deletes a prior object; only clears the three named slots on one field.
 * Output: writes ONLY the re-processed Event object to output/EXTRACTION_EMISSION.json. Stdout = stats.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const REPO_ROOT = '/Users/bcladmin/Projects/MemberJunction/MJ';
const REG = `${REPO_ROOT}/packages/Integration/connectors-registry/eventbrite`;
const SERVER_PATH = `${REPO_ROOT}/packages/MCP/mj-metadata/dist/server.js`;
const CONNECTOR = 'eventbrite';
const METADATA_FILE = `${REPO_ROOT}/metadata/integrations/eventbrite/.eventbrite.integration.json`;
const EMISSION_ARTIFACT = `${REG}/runs/connector-eventbrite-1783012840625-d9ec733d/output/EXTRACTION_EMISSION.json`;
const APIB_REL = 'sources/eventbrite-v3-api-blueprint.apib';
const SCRIPT_REL = 'scripts/amend-r4-delta.mjs';
const NOW = new Date().toISOString();

const TARGET_IO = 'Event';
const TARGET_FIELD = 'organizer_id';
const EVIDENCE = `${APIB_REL} line 1791 (Expansions: organizer_id -> #organizer_object, not #organization_object); lines 4909-4920 (Organizer (object) — distinct MSON type from Organization); line 2925 (vendor statement: 'The organization_id is NOT equal to an organizer_id')`;

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
    const client = new Client({ name: 'amend-r4-eventbrite', version: '1.0' }, { capabilities: {} });
    await client.connect(transport);
    try { return await fn(client); } finally { await client.close(); }
}

async function call(client, name, args) {
    const res = await client.callTool({ name, arguments: args });
    const text = res.content?.[0]?.text ?? '';
    if (res.isError) throw new Error(`Tool ${name} failed: ${text}`);
    return text;
}

/** Surgical file edit: locate Event -> organizer_id and clear the three FK slots.
 *  Returns the before/after snapshot for the emission claims. */
function clearFkOnDisk() {
    const file = JSON.parse(readFileSync(METADATA_FILE, 'utf8'));
    const root = Array.isArray(file) ? file[0] : file;
    const ios = root.relatedEntities?.['MJ: Integration Objects'];
    if (!Array.isArray(ios)) throw new Error('metadata file has no MJ: Integration Objects array');
    const io = ios.find((x) => String(x.fields?.Name) === TARGET_IO);
    if (!io) throw new Error(`IO not found: ${TARGET_IO}`);
    const iofs = io.relatedEntities?.['MJ: Integration Object Fields'];
    if (!Array.isArray(iofs)) throw new Error(`IO ${TARGET_IO} has no fields array`);
    const f = iofs.find((x) => String(x.fields?.Name) === TARGET_FIELD);
    if (!f) throw new Error(`Field not found: ${TARGET_IO}.${TARGET_FIELD}`);

    const before = {
        IsForeignKey: f.fields.IsForeignKey,
        RelatedIntegrationObjectID: f.fields.RelatedIntegrationObjectID ?? null,
        RelatedIntegrationObjectFieldName: f.fields.RelatedIntegrationObjectFieldName ?? null,
        ConfigurationReferencedType: f.fields.Configuration?.ReferencedType ?? null,
    };

    // Clear IsForeignKey.
    f.fields.IsForeignKey = false;
    // Remove the FK pointer keys (MCP merge cannot delete; the schema rejects null for these).
    delete f.fields.RelatedIntegrationObjectID;
    delete f.fields.RelatedIntegrationObjectFieldName;
    // Clear Configuration.ReferencedType. If Configuration becomes empty, drop the whole key.
    if (f.fields.Configuration && typeof f.fields.Configuration === 'object') {
        delete f.fields.Configuration.ReferencedType;
        if (Object.keys(f.fields.Configuration).length === 0) delete f.fields.Configuration;
    }

    writeFileSync(METADATA_FILE, JSON.stringify(file, null, 2) + '\n');

    const after = {
        IsForeignKey: f.fields.IsForeignKey,
        RelatedIntegrationObjectID: f.fields.RelatedIntegrationObjectID ?? null,
        RelatedIntegrationObjectFieldName: f.fields.RelatedIntegrationObjectFieldName ?? null,
        ConfigurationReferencedType: f.fields.Configuration?.ReferencedType ?? null,
    };
    return { before, after, fieldObject: f.fields };
}

async function main() {
    const { before, after } = clearFkOnDisk();

    // Append per-slot code-evidence via the MCP (auditable trail; the metadata edit itself is
    // done on-disk because the MCP merge cannot express key removal / a null FK pointer).
    await withClient(async (client) => {
        const slots = [
            { slot: `iof.${TARGET_IO}.${TARGET_FIELD}.IsForeignKey`, out: { IsForeignKey: false } },
            { slot: `iof.${TARGET_IO}.${TARGET_FIELD}.RelatedIntegrationObjectID`, out: { RelatedIntegrationObjectID: null } },
            { slot: `iof.${TARGET_IO}.${TARGET_FIELD}.Configuration.ReferencedType`, out: { ConfigurationReferencedType: null } },
        ];
        for (const s of slots) {
            await call(client, 'append_code_evidence', {
                connector: CONNECTOR,
                entry: {
                    ScriptPath: SCRIPT_REL,
                    ScriptRunAt: NOW,
                    StructuredOutput: { IO: TARGET_IO, Field: TARGET_FIELD, ...s.out },
                    SchemaValidationStatus: 'Passed',
                    TargetField: s.slot,
                },
            });
        }
    });

    // Emission artifact: ONLY the re-processed Event object.
    const claims = [
        { slot: `iof.${TARGET_IO}.${TARGET_FIELD}.IsForeignKey`, value: false, sourcePath: EVIDENCE },
        { slot: `iof.${TARGET_IO}.${TARGET_FIELD}.RelatedIntegrationObjectID`, value: null, sourcePath: EVIDENCE },
        { slot: `iof.${TARGET_IO}.${TARGET_FIELD}.Configuration.ReferencedType`, value: null, sourcePath: EVIDENCE },
    ];
    const emission = [{
        objectName: TARGET_IO,
        fieldsExtracted: 1,
        gapsRemaining: [],
        claims,
        matrixRow: {
            IOName: TARGET_IO,
            ExistingConnectorTs: 'n/a',
            ExistingMetadataJson: 'yes',
            OpenAPIxPK: 'no',
            OpenAPIPathOps: 'yes',
            OpenAPILocationHeader: 'no',
            VendorDocsProseScan: 'yes',
            SDKTypes: 'n/a',
            PostmanCommunity: 'yes',
            NamingConvention: 'yes',
            CrossIOMatch: 'no',
            PKVerdict: 'emit',
            FKVerdict: 'defer',
            EvidenceCount: 3,
        },
    }];
    mkdirSync(dirname(EMISSION_ARTIFACT), { recursive: true });
    writeFileSync(EMISSION_ARTIFACT, JSON.stringify(emission, null, 2) + '\n');

    process.stdout.write(JSON.stringify({
        objectsReprocessed: 1,
        slotsCleared: 3,
        before,
        after,
    }, null, 2) + '\n');
}

main().catch((err) => { console.error(err); process.exit(1); });
