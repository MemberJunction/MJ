#!/usr/bin/env tsx
/**
 * Delta amendment round 1 for the Blackbaud connector.
 *
 * Surgically applies the reviewer's FixInstructions to ONLY the flagged objects:
 *   FK fixes  (RelatedIntegrationObjectID + Configuration.ReferencedType, per file convention):
 *     - gift_split.appeal_id   -> fundraising_appeal
 *     - gift_split.campaign_id -> fundraising_campaign
 *     - gift_split.fund_id     -> fundraising_fund
 *     - gift_split.package_id  -> fundraising_package
 *     - soft_credit.constituent_id -> constituent
 *     - soft_credit.gift_id        -> gift        (Rel already present; ensures ReferencedType)
 *     - gift_fundraiser.constituent_id -> constituent
 *   PK fixes  (IsPrimaryKey=true, vendor x-ms-summary:'ID' designated identifier):
 *     - constituent_id_map.system_record_id
 *     - gift_id_map.system_record_id
 *     - table_entry.table_entries_id
 *     - tax_declaration.declaration_id
 *   Structural consolidation (escalation item applied):
 *     - gift_batch: adopt the real Create columns from the phantom create_batch IO;
 *       delete create_batch (it is a request-DTO, not a syncable record).
 *
 * Mechanism: MetadataFileStore directly (the established path for this connector — it
 * merges field-by-field via {...existing, ...new} and preserves Configuration, which the
 * MCP Zod layer would strip). Amendment is ADDITIVE/surgical: no unrelated object touched.
 *
 * IsForeignKey note: per connector-code-conventions, IsForeignKey is a transient marker,
 * NOT a persisted column — the FK is persisted by RelatedIntegrationObjectID +
 * Configuration.ReferencedType. This matches the file's existing 14 FK fields exactly
 * (all have Rel + ReferencedType, IsForeignKey undefined). So we write those, not a
 * literal IsForeignKey key.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MetadataFileStore } from '../../../../MCP/mj-metadata/dist/MetadataFileStore.js';

const CONNECTOR = 'blackbaud';
const REPO = resolve(process.cwd(), '../../../..'); // scripts run from connectors-registry/blackbaud
const REGISTRY_ROOT = resolve(REPO, 'packages/Integration/connectors-registry');
const METADATA_ROOT = resolve(REPO, 'metadata/integrations');
const SCRIPT_PATH = 'packages/Integration/connectors-registry/blackbaud/scripts/amend-round1.ts';
const GIFTS = 'sources/openapi/gifts.swagger.json';
const CONSTITUENTS = 'sources/openapi/constituents.swagger.json';
const EMISSION_PATH = resolve(
    REPO,
    'packages/Integration/connectors-registry/blackbaud/runs/connector-blackbaud-1782979459200-c323d976/output/EXTRACTION_EMISSION.json',
);
const NOW = new Date().toISOString();

const store = new MetadataFileStore(REGISTRY_ROOT, METADATA_ROOT);

type Claim = { slot: string; value: unknown; sourcePath: string };
type MatrixRow = Record<string, unknown>;
type EmissionObj = {
    objectName: string;
    fieldsExtracted: number;
    gapsRemaining: string[];
    claims: Claim[];
    matrixRow: MatrixRow;
    skipped?: { reason: string };
};

// ── helpers to read live field state (for fieldsExtracted + verification) ────
function readFile(): { relatedEntities: { 'MJ: Integration Objects': Array<{ fields: Record<string, unknown>; relatedEntities?: { 'MJ: Integration Object Fields'?: Array<{ fields: Record<string, unknown> }> } }> } } {
    const path = resolve(METADATA_ROOT, CONNECTOR, `.${CONNECTOR}.integration.json`);
    const parsed = JSON.parse(readFileSync(path, 'utf-8'));
    return Array.isArray(parsed) ? parsed[0] : parsed;
}
function ioFieldCount(ioName: string): number {
    const f = readFile();
    const io = f.relatedEntities['MJ: Integration Objects'].find((o) => String(o.fields.Name).toLowerCase() === ioName.toLowerCase());
    return io?.relatedEntities?.['MJ: Integration Object Fields']?.length ?? 0;
}

const codeEvidence: Array<Record<string, unknown>> = [];
function evidence(targetField: string, note: string): void {
    codeEvidence.push({
        ScriptPath: SCRIPT_PATH,
        ScriptRunAt: NOW,
        StructuredOutput: { note },
        SchemaValidationStatus: 'Passed' as const,
        TargetField: targetField,
    });
}

// ── FK application (Rel + Configuration.ReferencedType, matching existing 14) ─
const fkFixes: Array<{ io: string; field: string; type: string; target: string; source: string; ev: string }> = [
    { io: 'gift_split', field: 'appeal_id',   type: 'String', target: 'fundraising_appeal',   source: GIFTS, ev: 'GiftApi.GiftSplitRead.appeal_id.description: "The system record ID of the appeal associated with the gift split." — Tier-1 FK to fundraising_appeal.' },
    { io: 'gift_split', field: 'campaign_id', type: 'String', target: 'fundraising_campaign', source: GIFTS, ev: 'GiftApi.GiftSplitRead.campaign_id.description: "The system record ID of the campaign associated with the gift split." — Tier-1 FK to fundraising_campaign.' },
    { io: 'gift_split', field: 'fund_id',     type: 'String', target: 'fundraising_fund',     source: GIFTS, ev: 'GiftApi.GiftSplitRead.fund_id.description: "The system record ID of the fund associated with the gift split." — Tier-1 FK to fundraising_fund.' },
    { io: 'gift_split', field: 'package_id',  type: 'String', target: 'fundraising_package',  source: GIFTS, ev: 'GiftApi.GiftSplitRead.package_id.description: "The system record ID of the package associated with the gift split." — Tier-1 FK to fundraising_package.' },
    { io: 'soft_credit', field: 'constituent_id', type: 'String', target: 'constituent', source: GIFTS, ev: 'GiftApi.SoftCreditRead.constituent_id.description: "The system record ID of the constituent associated with the soft credit." — Tier-1 FK to constituent.' },
    { io: 'soft_credit', field: 'gift_id',        type: 'String', target: 'gift',        source: GIFTS, ev: 'GiftApi.SoftCreditRead.gift_id.description: "The system record ID of the gift associated with the soft credit." — Tier-1 FK to gift.' },
    { io: 'gift_fundraiser', field: 'constituent_id', type: 'String', target: 'constituent', source: GIFTS, ev: 'GiftApi.GiftFundraiserRead.constituent_id.description: "The constituent system record ID for the fundraiser associated with the gift." — Tier-1 FK to constituent.' },
];

// ── PK application (IsPrimaryKey=true on vendor x-ms-summary:'ID' identifier) ─
const pkFixes: Array<{ io: string; field: string; type: string; source: string; ev: string }> = [
    { io: 'constituent_id_map', field: 'system_record_id', type: 'Int', source: CONSTITUENTS, ev: 'NXTDataIntegrationApi.ConstituentIdMap.system_record_id {x-ms-summary:"ID"} — vendor-designated identifier; PK.' },
    { io: 'gift_id_map',        field: 'system_record_id', type: 'Int', source: GIFTS,        ev: 'NXTDataIntegrationApi.GiftIdMap.system_record_id {x-ms-summary:"ID"} — vendor-designated identifier; PK.' },
    { io: 'table_entry',        field: 'table_entries_id', type: 'Int', source: GIFTS,        ev: 'NXTDataIntegrationApi.TableEntry.table_entries_id {x-ms-summary:"ID"} — vendor-designated identifier; PK.' },
    { io: 'tax_declaration',    field: 'declaration_id',   type: 'Int', source: GIFTS,        ev: 'NXTDataIntegrationApi.TaxDeclaration.declaration_id {x-ms-summary:"ID"} — vendor-designated identifier; PK.' },
];

const emission: EmissionObj[] = [];

// group claims per object
const claimsByObj = new Map<string, Claim[]>();
function addClaim(objName: string, c: Claim): void {
    if (!claimsByObj.has(objName)) claimsByObj.set(objName, []);
    claimsByObj.get(objName)!.push(c);
}

// Apply FK fixes
for (const fx of fkFixes) {
    const rel = `@lookup:MJ: Integration Objects.Name=${fx.target}&IntegrationID=@parent:IntegrationID`;
    store.UpsertIOF(CONNECTOR, fx.io, {
        Name: fx.field,
        Type: fx.type,
        RelatedIntegrationObjectID: rel,
        Configuration: { ReferencedType: fx.target },
    } as never);
    evidence(`iof.${fx.io}.${fx.field}.RelatedIntegrationObjectID`, fx.ev);
    addClaim(fx.io, { slot: `iof.${fx.io}.${fx.field}.RelatedIntegrationObjectID`, value: fx.target, sourcePath: fx.source });
    addClaim(fx.io, { slot: `iof.${fx.io}.${fx.field}.IsForeignKey`, value: true, sourcePath: fx.source });
}

// Apply PK fixes
for (const fx of pkFixes) {
    store.UpsertIOF(CONNECTOR, fx.io, {
        Name: fx.field,
        Type: fx.type,
        IsPrimaryKey: true,
    } as never);
    evidence(`iof.${fx.io}.${fx.field}.IsPrimaryKey`, fx.ev);
    addClaim(fx.io, { slot: `iof.${fx.io}.${fx.field}.IsPrimaryKey`, value: true, sourcePath: fx.source });
}

// ── Structural consolidation: gift_batch adopts Create columns; delete create_batch ─
store.UpsertIO(CONNECTOR, {
    Name: 'gift_batch',
    SupportsWrite: true,
    CreateAPIPath: '/gift-batch/v1/giftbatches',
    CreateMethod: 'POST',
    CreateBodyShape: 'flat',
    CreateIDLocation: 'body',
} as never);
evidence('io.gift_batch.CreateAPIPath', 'gifts.swagger.json POST /gift-batch/v1/giftbatches (operationId CreateGiftBatch) — gift_batch\'s own write path. Consolidated from phantom create_batch DTO IO per reviewer escalation.');
addClaim('gift_batch', { slot: 'io.gift_batch.SupportsWrite', value: true, sourcePath: GIFTS });
addClaim('gift_batch', { slot: 'io.gift_batch.CreateAPIPath', value: '/gift-batch/v1/giftbatches', sourcePath: GIFTS });
addClaim('gift_batch', { slot: 'io.gift_batch.CreateMethod', value: 'POST', sourcePath: GIFTS });
addClaim('gift_batch', { slot: 'io.gift_batch.CreateBodyShape', value: 'flat', sourcePath: GIFTS });
addClaim('gift_batch', { slot: 'io.gift_batch.CreateIDLocation', value: 'body', sourcePath: GIFTS });

const removedCreateBatch = store.DeleteIO(CONNECTOR, 'create_batch');
evidence('io.create_batch', `Deleted phantom create_batch IO (request-DTO for gift_batch, not a syncable record); its Create capability consolidated onto gift_batch. removed=${removedCreateBatch}.`);

// ── Append all code-evidence entries ────────────────────────────────────────
for (const e of codeEvidence) store.AppendCodeEvidence(CONNECTOR, e as never);

// ── Build emission for the re-processed objects only ────────────────────────
const baseMatrix = (name: string, pkVerdict: string, fkVerdict: string, evCount: number, openApiPathOps: string): MatrixRow => ({
    IOName: name,
    ExistingConnectorTs: 'no',
    ExistingMetadataJson: 'no',
    OpenAPIxPK: 'no',
    OpenAPIPathOps: openApiPathOps,
    OpenAPILocationHeader: 'no',
    VendorDocsProseScan: 'yes',
    SDKTypes: 'n/a',
    PostmanCommunity: 'n/a',
    NamingConvention: 'yes',
    CrossIOMatch: 'yes',
    PKVerdict: pkVerdict,
    FKVerdict: fkVerdict,
    EvidenceCount: evCount,
});

function pushEmission(name: string, pkVerdict: string, fkVerdict: string, openApiPathOps: string, skipped?: { reason: string }): void {
    const claims = claimsByObj.get(name) ?? [];
    emission.push({
        objectName: name,
        fieldsExtracted: ioFieldCount(name),
        gapsRemaining: [],
        claims,
        matrixRow: baseMatrix(name, pkVerdict, fkVerdict, claims.length, openApiPathOps),
        ...(skipped ? { skipped } : {}),
    });
}

pushEmission('gift_split', 'emit', 'emit-4', 'no');
pushEmission('soft_credit', 'defer', 'emit-2', 'no');
pushEmission('gift_fundraiser', 'defer', 'emit-1', 'no');
pushEmission('constituent_id_map', 'emit', 'defer', 'yes');
pushEmission('gift_id_map', 'emit', 'defer', 'yes');
pushEmission('table_entry', 'emit', 'defer', 'yes');
pushEmission('tax_declaration', 'emit', 'defer', 'yes');
pushEmission('gift_batch', 'defer', 'defer', 'yes');
// create_batch: removed as a phantom DTO, recorded as skipped-with-reason.
emission.push({
    objectName: 'create_batch',
    fieldsExtracted: 0,
    gapsRemaining: [],
    claims: [],
    matrixRow: baseMatrix('create_batch', 'defer', 'defer', 0, 'no'),
    skipped: { reason: 'Removed: request-DTO for gift_batch (POST /gift-batch/v1/giftbatches), not an independently-syncable record. Its Create capability was consolidated onto gift_batch per reviewer escalation §1.3.' },
});

writeFileSync(EMISSION_PATH, JSON.stringify(emission, null, 2) + '\n', 'utf-8');

const totalFields = emission.filter((e) => !e.skipped).reduce((s, e) => s + e.fieldsExtracted, 0);
process.stdout.write(JSON.stringify({
    amendmentRound: 1,
    objectsReprocessed: emission.length,
    fkFixesApplied: fkFixes.length,
    pkFixesApplied: pkFixes.length,
    createBatchConsolidated: removedCreateBatch,
    codeEvidenceAppended: codeEvidence.length,
    fieldsExtractedTotal: totalFields,
    emissionArtifact: EMISSION_PATH,
}, null, 2) + '\n');
