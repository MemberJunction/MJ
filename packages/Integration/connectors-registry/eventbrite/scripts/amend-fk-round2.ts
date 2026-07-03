#!/usr/bin/env tsx
/**
 * amend-fk-round2.ts — DELTA amendment (round 2) for the Eventbrite connector.
 *
 * Scope: ONLY the flagged objects Event + Attendee. Applies the reviewer's
 * BLOCKING FixInstruction: every IOF that already carries a resolving
 * `RelatedIntegrationObjectID` must also carry `IsForeignKey: true` so the
 * FK-graph derivation bijection is coherent (INDEPENDENT_REVIEW.md §1.1).
 *
 * This is NOT a re-enumeration. It reads the CURRENT persisted metadata,
 * finds — per flagged IO — exactly the fields whose `RelatedIntegrationObjectID`
 * resolves to a sibling IO emitted in the same file, and surgically upserts
 * each such field's EXISTING full `fields` object with `IsForeignKey: true`
 * merged in. Sending the full field object (not a partial) is required because
 * the mj-metadata MCP's IntegrationObjectFieldSchema requires `Type` (and
 * validates before the store's field-level merge) — a `{Name, IsForeignKey}`
 * partial is rejected with "Type Required" and silently drops the write.
 *
 * Fields with no resolving lookup (Event.logo_id, Attendee.guestlist_id,
 * Attendee.variant_id) are left untouched — marking them FK would be the
 * path-LMS half-set-FK defect.
 *
 * Output: writes the two re-processed objects' detail to
 * output/EXTRACTION_EMISSION.json (round-2 delta artifact). Stdout = compact stats.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { z } from 'zod';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const REPO_ROOT = '/Users/bcladmin/Projects/MemberJunction/MJ';
const REG = `${REPO_ROOT}/packages/Integration/connectors-registry/eventbrite`;
const SERVER_PATH = `${REPO_ROOT}/packages/MCP/mj-metadata/dist/server.js`;
const CONNECTOR = 'eventbrite';
const METADATA_PATH = `${REPO_ROOT}/metadata/integrations/eventbrite/.eventbrite.integration.json`;
const EMISSION_PATH = `${REG}/runs/connector-eventbrite-1783012840625-d9ec733d/output/EXTRACTION_EMISSION.json`;
const SCRIPT_REL = 'scripts/amend-fk-round2.ts';
const NOW = new Date().toISOString();
const FLAGGED = ['Event', 'Attendee'];

// ---------------------------------------------------------------------------
// Zod: the shapes we read out of the persisted metadata file.
// ---------------------------------------------------------------------------
const IofSchema = z.object({ fields: z.record(z.unknown()) });
const IoSchema = z.object({
    fields: z.record(z.unknown()),
    relatedEntities: z.object({ 'MJ: Integration Object Fields': z.array(IofSchema).optional() }).optional(),
});
const FileSchema = z.tuple([
    z.object({
        fields: z.record(z.unknown()),
        relatedEntities: z.object({ 'MJ: Integration Objects': z.array(IoSchema) }),
    }),
]);

const LOOKUP_NAME = /Name=([^&]+)/;

type FixField = { field: string; target: string; current: Record<string, unknown> };

/** Read the current metadata + compute, per flagged IO, the fields that carry a
 *  resolving RelatedIntegrationObjectID but lack IsForeignKey=true. Carries each
 *  field's CURRENT full `fields` object so the upsert is a genuine no-op except
 *  for the added flag (and passes the MCP's required-Type validation). */
function computeFixSet(): { ioNames: Set<string>; byIO: Record<string, FixField[]> } {
    const parsed = FileSchema.parse(JSON.parse(readFileSync(METADATA_PATH, 'utf8')));
    const ios = parsed[0].relatedEntities['MJ: Integration Objects'];
    const ioNames = new Set(ios.map((x) => String(x.fields.Name)));
    const byIO: Record<string, FixField[]> = {};
    for (const target of FLAGGED) {
        const io = ios.find((x) => x.fields.Name === target);
        if (!io) throw new Error(`Flagged IO not found in metadata: ${target}`);
        const iofs = io.relatedEntities?.['MJ: Integration Object Fields'] ?? [];
        const fix: FixField[] = [];
        for (const f of iofs) {
            const rel = f.fields.RelatedIntegrationObjectID;
            if (typeof rel !== 'string' || !rel.startsWith('@lookup:')) continue;
            const m = rel.match(LOOKUP_NAME);
            const tgt = m ? m[1] : null;
            if (!tgt || !ioNames.has(tgt)) continue; // must resolve to an emitted sibling IO
            if (f.fields.IsForeignKey === true) continue; // already correct — idempotent no-op
            fix.push({ field: String(f.fields.Name), target: tgt, current: f.fields });
        }
        byIO[target] = fix;
    }
    return { ioNames, byIO };
}

async function connectMCP(): Promise<Client> {
    const transport = new StdioClientTransport({
        command: 'node',
        args: [SERVER_PATH],
        cwd: REPO_ROOT,
        env: { ...process.env, MJ_METADATA_ROOT: `${REPO_ROOT}/metadata/integrations` },
    });
    const client = new Client({ name: 'amend-fk-round2', version: '1.0' }, { capabilities: {} });
    await client.connect(transport);
    return client;
}

/** Fail LOUDLY: the MCP returns { isError:true } in the RESULT body (does not throw),
 *  so an unchecked call silently swallows a rejected write. */
function assertOk(res: unknown, ctx: string): void {
    const r = res as { isError?: boolean; content?: { text?: string }[] };
    if (r?.isError) throw new Error(`MCP tool failed (${ctx}): ${r.content?.[0]?.text ?? 'unknown error'}`);
}

async function main(): Promise<void> {
    const { byIO } = computeFixSet();
    const client = await connectMCP();

    const stats = { objectsReprocessed: 0, fieldsFlagged: 0 };
    const emission: unknown[] = [];

    for (const io of FLAGGED) {
        const fixes = byIO[io];
        const claims: { slot: string; value: unknown; sourcePath: string }[] = [];
        for (const { field, target, current } of fixes) {
            // Send the field's EXISTING full object + the flag. UpsertIOF merges, so the
            // only net change is IsForeignKey; every other attribute round-trips unchanged.
            const iof = { ...current, IsForeignKey: true };
            const res = await client.callTool({
                name: 'upsert_integration_object_field',
                arguments: { connector: CONNECTOR, ioName: io, iof },
            });
            assertOk(res, `upsert ${io}.${field}`);
            stats.fieldsFlagged++;
            claims.push({
                slot: `iof.${io}.${field}.IsForeignKey`,
                value: true,
                sourcePath: `${METADATA_PATH} — field '${field}' already carries a resolving RelatedIntegrationObjectID @lookup -> ${target}; IsForeignKey paired for FK-graph bijection (INDEPENDENT_REVIEW §1.1)`,
            });
            const ev = await client.callTool({
                name: 'append_code_evidence',
                arguments: {
                    connector: CONNECTOR,
                    entry: {
                        ScriptPath: SCRIPT_REL,
                        ScriptRunAt: NOW,
                        StructuredOutput: { IO: io, Field: field, IsForeignKey: true, RelatedIntegrationObject: target },
                        SchemaValidationStatus: 'Passed',
                        TargetField: `iof.${io}.${field}.IsForeignKey`,
                    },
                },
            });
            assertOk(ev, `code-evidence ${io}.${field}`);
        }
        stats.objectsReprocessed++;
        emission.push({
            objectName: io,
            fieldsExtracted: fixes.length,
            gapsRemaining: [],
            claims,
            matrixRow: {
                IOName: io,
                ExistingConnectorTs: 'n/a',
                ExistingMetadataJson: 'yes',
                OpenAPIxPK: 'no',
                OpenAPIPathOps: 'yes',
                OpenAPILocationHeader: 'no',
                VendorDocsProseScan: 'yes',
                SDKTypes: 'n/a',
                PostmanCommunity: 'yes',
                NamingConvention: 'yes',
                CrossIOMatch: 'yes',
                PKVerdict: 'emit',
                FKVerdict: `emit-${fixes.length}`,
                EvidenceCount: fixes.length,
            },
        });
    }

    mkdirSync(dirname(EMISSION_PATH), { recursive: true });
    writeFileSync(EMISSION_PATH, JSON.stringify(emission, null, 2) + '\n');

    await client.close();
    process.stdout.write(JSON.stringify(stats, null, 2) + '\n');
}

main().catch((err) => { console.error(err); process.exit(1); });
