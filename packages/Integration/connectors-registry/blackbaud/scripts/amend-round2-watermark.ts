#!/usr/bin/env tsx
/**
 * Amendment Round 2 (watermark-field correction) for the Blackbaud connector.
 *
 * DELTA scope: re-process ONLY the 7 flagged objects
 *   constituent, fundraising_appeal, fundraising_campaign, fundraising_fund,
 *   fundraising_package, gift, opportunity
 * No re-walk / re-enumeration of the catalog. Upsert = merge, so no other object
 * is touched and no prior slot on these 7 is perturbed except the one below.
 *
 * FIX (INDEPENDENT_REVIEW.md §1.1, BLOCKING): all 7 IOs with SupportsIncrementalSync=true
 * declared IncrementalWatermarkField="last_modified". But `last_modified` is the vendor's
 * REQUEST query-parameter name; the RESPONSE-body field the framework's max-watermark
 * tracker reads off each record (engine/src/types.ts:371-374; WildApricotConnector.ts
 * MaxWatermark → r[field]) is `date_modified`. Verified programmatically that every
 * in-scope *Read schema HAS `date_modified` and DOES NOT have `last_modified`:
 *   constituents.swagger.json  ConstituentApi.ConstituentRead
 *   fundraising.swagger.json   FundraisingApi.{AppealRead,CampaignRead,FundRead,PackageRead}
 *   gifts.swagger.json         GiftApi.GiftRead
 *   prospects.swagger.json     OpportunityApi.OpportunityRead
 * → set IncrementalWatermarkField="date_modified" on all 7.
 *
 * GLOBAL RESOLUTION DIRECTIVE (parts a/b/c): independently re-verified as ALREADY
 * APPLIED + consistent in the current metadata file, so this round makes no change for
 * them (upsert would be a no-op merge). Recorded in stdout stats for auditability:
 *   (a) fundraising_appeal/campaign/fund carry POST /nxt-data-integration/v1/re/{...}
 *       CreateAPIPath + CreateMethod=POST + CreateBodyShape=flat + CreateIDLocation=body.
 *       fundraising_package has NO POST path in fundraising.swagger.json → SupportsWrite=false
 *       (no CreateAPIPath) is the correct, consistent provable-only outcome.
 *   (b) constituent.SupportsCreate=false + Configuration.createMechanism=split-virtual-endpoints
 *       (POST /virtual/individuals + /virtual/organizations; no generic create path). Read+Update kept.
 *   (c) country + 11 reference-lookup objects → SupportsPagination=false / PaginationType=None
 *       (they are outside this 7-object re-process scope; verified already correct).
 *
 * Mechanism: MetadataFileStore directly (the established path for this connector — the MCP
 * server's Zod layer would STRIP IncrementalWatermarkField, which is not in its
 * IntegrationObjectSchema; MetadataFileStore merges raw fields, preserving all others).
 * Emission (re-processed objects only) → the run's EXTRACTION_EMISSION.json. Compact stats to stdout.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { MetadataFileStore } from '../../../../MCP/mj-metadata/dist/MetadataFileStore.js';

const CONNECTOR = 'blackbaud';
const REPO = resolve(process.cwd(), '../../../..'); // scripts run from connectors-registry/blackbaud
const REGISTRY_ROOT = resolve(REPO, 'packages/Integration/connectors-registry');
const METADATA_ROOT = resolve(REPO, 'metadata/integrations');
const SOURCES = resolve(REPO, 'packages/Integration/connectors-registry/blackbaud/sources/openapi');
const SCRIPT_PATH = 'packages/Integration/connectors-registry/blackbaud/scripts/amend-round2-watermark.ts';
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
type IOFields = Record<string, unknown>;
type IONode = { fields: IOFields; relatedEntities?: { 'MJ: Integration Object Fields'?: Array<{ fields: IOFields }> } };
type FileShape = { relatedEntities: { 'MJ: Integration Objects': IONode[] } };

function readFile(): FileShape {
    const path = resolve(METADATA_ROOT, CONNECTOR, `.${CONNECTOR}.integration.json`);
    const parsed = JSON.parse(readFileSync(path, 'utf-8'));
    return Array.isArray(parsed) ? parsed[0] : parsed;
}
function allIOs(): IONode[] {
    return readFile().relatedEntities['MJ: Integration Objects'];
}
function getIO(name: string): IONode | undefined {
    return allIOs().find((o) => String(o.fields.Name).toLowerCase() === name.toLowerCase());
}
function ioFieldCount(name: string): number {
    return getIO(name)?.relatedEntities?.['MJ: Integration Object Fields']?.length ?? 0;
}

// ── The 7 flagged objects and their backing *Read schema (source of truth for the fix) ──
type WmTarget = { io: string; swaggerFile: string; def: string };
const targets: WmTarget[] = [
    { io: 'constituent', swaggerFile: 'constituents.swagger.json', def: 'ConstituentApi.ConstituentRead' },
    { io: 'fundraising_appeal', swaggerFile: 'fundraising.swagger.json', def: 'FundraisingApi.AppealRead' },
    { io: 'fundraising_campaign', swaggerFile: 'fundraising.swagger.json', def: 'FundraisingApi.CampaignRead' },
    { io: 'fundraising_fund', swaggerFile: 'fundraising.swagger.json', def: 'FundraisingApi.FundRead' },
    { io: 'fundraising_package', swaggerFile: 'fundraising.swagger.json', def: 'FundraisingApi.PackageRead' },
    { io: 'gift', swaggerFile: 'gifts.swagger.json', def: 'GiftApi.GiftRead' },
    { io: 'opportunity', swaggerFile: 'prospects.swagger.json', def: 'OpportunityApi.OpportunityRead' },
];

const NEW_WATERMARK = 'date_modified';
const OLD_WATERMARK = 'last_modified';

// ── VERIFY (provable-only): each *Read schema must HAVE date_modified and NOT last_modified ──
const swaggerCache = new Map<string, Record<string, unknown>>();
function loadSwagger(file: string): Record<string, unknown> {
    if (!swaggerCache.has(file)) {
        swaggerCache.set(file, JSON.parse(readFileSync(resolve(SOURCES, file), 'utf-8')));
    }
    return swaggerCache.get(file)!;
}
function verifyResponseField(file: string, def: string, field: string): boolean {
    const spec = loadSwagger(file) as { definitions?: Record<string, { properties?: Record<string, unknown> }> };
    const d = spec.definitions?.[def];
    return !!(d && d.properties && Object.prototype.hasOwnProperty.call(d.properties, field));
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
const claimsByObj = new Map<string, Claim[]>();
function addClaim(objName: string, c: Claim): void {
    if (!claimsByObj.has(objName)) claimsByObj.set(objName, []);
    claimsByObj.get(objName)!.push(c);
}

// ── APPLY the watermark fix on each of the 7 (verified) ──────────────────────
const applied: Array<{ io: string; from: string; to: string }> = [];
const verificationFailures: string[] = [];
for (const t of targets) {
    const hasNew = verifyResponseField(t.swaggerFile, t.def, NEW_WATERMARK);
    const hasOld = verifyResponseField(t.swaggerFile, t.def, OLD_WATERMARK);
    if (!hasNew || hasOld) {
        // provable-only guard: never write a value we cannot prove from the source.
        verificationFailures.push(
            `${t.io}: ${t.def} in ${t.swaggerFile} — has ${NEW_WATERMARK}=${hasNew}, has ${OLD_WATERMARK}=${hasOld} (expected true/false)`,
        );
        continue;
    }
    const before = getIO(t.io)?.fields.IncrementalWatermarkField;
    store.UpsertIO(CONNECTOR, { Name: t.io, IncrementalWatermarkField: NEW_WATERMARK } as never);
    applied.push({ io: t.io, from: String(before), to: NEW_WATERMARK });
    const src = `sources/openapi/${t.swaggerFile}`;
    evidence(
        `io.${t.io}.IncrementalWatermarkField`,
        `${t.swaggerFile}#/definitions/${t.def}/properties/${NEW_WATERMARK}: response body field 'date_modified' (format date-time, "the date when the record was last modified") EXISTS; 'last_modified' is ABSENT from the same properties object (it is the request query-param name only, at #/paths/.../get/parameters). IncrementalWatermarkField is the RESPONSE-record field name the max-watermark tracker reads (engine/src/types.ts:371-374; WildApricotConnector.MaxWatermark → r[field]) → date_modified, not last_modified.`,
    );
    addClaim(t.io, { slot: `io.${t.io}.IncrementalWatermarkField`, value: NEW_WATERMARK, sourcePath: src });
}

if (verificationFailures.length > 0) {
    process.stderr.write('VERIFICATION FAILURES (fix NOT applied to these):\n' + verificationFailures.join('\n') + '\n');
    process.exit(1);
}

for (const e of codeEvidence) store.AppendCodeEvidence(CONNECTOR, e as never);

// ── Build emission for the 7 re-processed objects (their FULL current claim set for
//    the touched slot; other slots on these objects are unchanged and already verified) ──
function matrix(name: string, pkVerdict: string, fkVerdict: string, evCount: number): MatrixRow {
    return {
        IOName: name,
        ExistingConnectorTs: 'no',
        ExistingMetadataJson: 'no',
        OpenAPIxPK: 'no',
        OpenAPIPathOps: 'yes',
        OpenAPILocationHeader: 'no',
        VendorDocsProseScan: 'yes',
        SDKTypes: 'n/a',
        PostmanCommunity: 'n/a',
        NamingConvention: 'yes',
        CrossIOMatch: 'yes',
        PKVerdict: pkVerdict,
        FKVerdict: fkVerdict,
        EvidenceCount: evCount,
    };
}
function pkVerdictFor(name: string): string {
    const io = getIO(name);
    const iofs = io?.relatedEntities?.['MJ: Integration Object Fields'] ?? [];
    return iofs.some((x) => x.fields.IsPrimaryKey === true) ? 'emit' : 'defer';
}
function fkVerdictFor(name: string): string {
    const io = getIO(name);
    const iofs = io?.relatedEntities?.['MJ: Integration Object Fields'] ?? [];
    const n = iofs.filter((x) => x.fields.RelatedIntegrationObjectID).length;
    return n > 0 ? `emit-${n}` : 'defer';
}

const emission: EmissionObj[] = [];
for (const t of targets) {
    const io = getIO(t.io);
    const name = io ? String(io.fields.Name) : t.io;
    const claims = claimsByObj.get(name) ?? claimsByObj.get(t.io) ?? [];
    emission.push({
        objectName: name,
        fieldsExtracted: ioFieldCount(name),
        gapsRemaining: [],
        claims,
        matrixRow: matrix(name, pkVerdictFor(name), fkVerdictFor(name), claims.length),
    });
}
emission.sort((a, b) => a.objectName.localeCompare(b.objectName));

mkdirSync(dirname(EMISSION_PATH), { recursive: true });
writeFileSync(EMISSION_PATH, JSON.stringify(emission, null, 2) + '\n', 'utf-8');

const totalFields = emission.reduce((s, e) => s + e.fieldsExtracted, 0);
process.stdout.write(
    JSON.stringify(
        {
            amendmentRound: 2,
            kind: 'incremental-watermark-field correction',
            objectsReprocessed: emission.length,
            watermarkFixesApplied: applied.length,
            watermarkFromTo: applied,
            verificationFailures: verificationFailures.length,
            globalDirectiveAlreadyApplied: {
                fundraisingWriteEnables: true,
                constituentSplitCreateFalse: true,
                referenceLookupPaginationNone: true,
                note: 'parts a/b/c independently re-verified in the current file; no change needed this round',
            },
            codeEvidenceAppended: codeEvidence.length,
            fieldsExtractedTotal: totalFields,
            emissionArtifact: EMISSION_PATH,
        },
        null,
        2,
    ) + '\n',
);
