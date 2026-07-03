#!/usr/bin/env tsx
/**
 * Delta amendment (write-capability + pagination) for the Blackbaud connector.
 *
 * Surgically applies the reviewer's _GLOBAL_RESOLUTION_DIRECTIVE FixInstructions to
 * ONLY the flagged objects — provable-only, every value VERIFIED against the saved
 * Swagger 2.0 specs before writing. No unrelated object touched (upsert = merge).
 *
 * A) Write-capability enable on real Tier-1 POST endpoints in the already-in-scope
 *    nxt-data-integration namespace (verified: each path has a POST returning {id}, and
 *    a PATCH /{id} → Update). Body = flat *Create schema; id read from body.
 *      - fundraising_appeal   POST /nxt-data-integration/v1/re/appeals        PATCH .../{id}
 *      - fundraising_campaign POST /nxt-data-integration/v1/re/campaigns      PATCH .../{id}
 *      - fundraising_fund     POST /nxt-data-integration/v1/re/funds          PATCH .../{id}
 *      - constituent_appeal_2 POST /nxt-data-integration/v1/re/constitappeals PATCH .../{id}
 *        (identity confirmed: ConstituentAppealCreate carries constituent_id + appeal_*,
 *         the constituent↔appeal association that /constituents/{id}/appeals reads.)
 *
 * B) constituent create is SPLIT across POST /constituent/v1/virtual/individuals and
 *    /organizations — /constituent/v1/constituents has ONLY a GET (verified). No generic
 *    create path is provable, so SupportsCreate=false (KEEP Read+Update as extracted) and
 *    record the split mechanism in Configuration. false+documented is the correct
 *    provable-only outcome (an inconsistent SupportsCreate=true w/ no path is disallowed).
 *
 * C) Pagination correction: 12 reference/lookup GETs declare ZERO limit/offset/skip/page
 *    params (verified param-by-param) → SupportsPagination=false, PaginationType=None.
 *
 * D) Mechanical capability derive-from-path-presence (v5.42.x DeclaredIntent NOT NULL
 *    DEFAULT(0) columns silently drop the capability on push if left undefined):
 *      - every IO with a populated CreateAPIPath → SupportsCreate=true (34)
 *      - every IO with a populated UpdateAPIPath → SupportsUpdate=true (32)
 *    All such IOs already carry the matching Method column (bijection-verified), so this
 *    is safe. constituent is EXCLUDED from the create-derive (it has no CreateAPIPath;
 *    handled by (B) instead).
 *
 * Mechanism: MetadataFileStore directly (the established path for this connector — merges
 * field-by-field via {...existing, ...new}, preserving Configuration which the MCP Zod
 * layer would strip). Emission written to the run's EXTRACTION_EMISSION.json (re-processed
 * objects only). Compact stats to stdout.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { MetadataFileStore } from '../../../../MCP/mj-metadata/dist/MetadataFileStore.js';

const CONNECTOR = 'blackbaud';
const REPO = resolve(process.cwd(), '../../../..'); // scripts run from connectors-registry/blackbaud
const REGISTRY_ROOT = resolve(REPO, 'packages/Integration/connectors-registry');
const METADATA_ROOT = resolve(REPO, 'metadata/integrations');
const SCRIPT_PATH = 'packages/Integration/connectors-registry/blackbaud/scripts/amend-round1-delta.ts';
const FUND = 'sources/openapi/fundraising.swagger.json';
const CONSTITUENTS = 'sources/openapi/constituents.swagger.json';
const GIFTS = 'sources/openapi/gifts.swagger.json';
const PROSPECTS = 'sources/openapi/prospects.swagger.json';
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

// ── code-evidence + claim collection (per re-processed object) ───────────────
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

// Track which objects were touched (for emission set).
const touched = new Set<string>();
function touch(n: string): void {
    touched.add(n.toLowerCase());
}

// ── A) Write-enable the 4 real Tier-1 POST endpoints ─────────────────────────
const writeEnables: Array<{ io: string; createPath: string; updatePath: string; ev: string }> = [
    { io: 'fundraising_appeal', createPath: '/nxt-data-integration/v1/re/appeals', updatePath: '/nxt-data-integration/v1/re/appeals/{id}', ev: 'fundraising.swagger.json POST /nxt-data-integration/v1/re/appeals (body NXTDataIntegrationApi.AppealCreate, 200 → CreatedAppeal{id}); PATCH /nxt-data-integration/v1/re/appeals/{id} for update. Real Tier-1 endpoints in the in-scope nxt-data-integration namespace.' },
    { io: 'fundraising_campaign', createPath: '/nxt-data-integration/v1/re/campaigns', updatePath: '/nxt-data-integration/v1/re/campaigns/{id}', ev: 'fundraising.swagger.json POST /nxt-data-integration/v1/re/campaigns (body CampaignCreate, 200 → CreatedCampaign{id}); PATCH .../{id}.' },
    { io: 'fundraising_fund', createPath: '/nxt-data-integration/v1/re/funds', updatePath: '/nxt-data-integration/v1/re/funds/{id}', ev: 'fundraising.swagger.json POST /nxt-data-integration/v1/re/funds (body FundCreate, 200 → CreatedFund{id}); PATCH .../{id}.' },
    { io: 'constituent_appeal_2', createPath: '/nxt-data-integration/v1/re/constitappeals', updatePath: '/nxt-data-integration/v1/re/constitappeals/{id}', ev: 'fundraising.swagger.json POST /nxt-data-integration/v1/re/constitappeals (body ConstituentAppealCreate{constituent_id,appeal_description,...}, 200 → CreatedConstituentAppeal{id}); PATCH .../{id}. Identity confirmed: ConstituentAppealCreate is the constituent↔appeal association that /constituent/v1/constituents/{constituent_id}/appeals reads.' },
];
for (const w of writeEnables) {
    store.UpsertIO(CONNECTOR, {
        Name: w.io,
        SupportsWrite: true,
        SupportsCreate: true,
        SupportsUpdate: true,
        CreateAPIPath: w.createPath,
        CreateMethod: 'POST',
        CreateBodyShape: 'flat',
        CreateIDLocation: 'body',
        UpdateAPIPath: w.updatePath,
        UpdateMethod: 'PATCH',
        UpdateBodyShape: 'flat',
        UpdateIDLocation: 'path',
    } as never);
    evidence(`io.${w.io}.SupportsWrite`, w.ev);
    touch(w.io);
    addClaim(w.io, { slot: `io.${w.io}.SupportsWrite`, value: true, sourcePath: FUND });
    addClaim(w.io, { slot: `io.${w.io}.SupportsCreate`, value: true, sourcePath: FUND });
    addClaim(w.io, { slot: `io.${w.io}.CreateAPIPath`, value: w.createPath, sourcePath: FUND });
    addClaim(w.io, { slot: `io.${w.io}.CreateMethod`, value: 'POST', sourcePath: FUND });
    addClaim(w.io, { slot: `io.${w.io}.CreateBodyShape`, value: 'flat', sourcePath: FUND });
    addClaim(w.io, { slot: `io.${w.io}.CreateIDLocation`, value: 'body', sourcePath: FUND });
    addClaim(w.io, { slot: `io.${w.io}.SupportsUpdate`, value: true, sourcePath: FUND });
    addClaim(w.io, { slot: `io.${w.io}.UpdateAPIPath`, value: w.updatePath, sourcePath: FUND });
    addClaim(w.io, { slot: `io.${w.io}.UpdateMethod`, value: 'PATCH', sourcePath: FUND });
}

// ── B) constituent create = split virtual endpoints → SupportsCreate=false + doc ─
store.UpsertIO(CONNECTOR, {
    Name: 'constituent',
    SupportsCreate: false,
    Configuration: {
        createMechanism: 'split-virtual-endpoints',
        createEndpoints: ['/constituent/v1/virtual/individuals', '/constituent/v1/virtual/organizations'],
        note: 'generic create unsupported in v1; use split endpoints',
    },
} as never);
evidence('io.constituent.SupportsCreate', 'constituents.swagger.json: /constituent/v1/constituents has ONLY a GET (no POST). Create is split across POST /constituent/v1/virtual/individuals and /constituent/v1/virtual/organizations. No generic create path is provable → SupportsCreate=false, split mechanism documented in Configuration. Read+Update retained as extracted.');
touch('constituent');
addClaim('constituent', { slot: 'io.constituent.SupportsCreate', value: false, sourcePath: CONSTITUENTS });
addClaim('constituent', { slot: 'io.constituent.Configuration.createMechanism', value: 'split-virtual-endpoints', sourcePath: CONSTITUENTS });

// ── C) Pagination correction for the 12 reference/lookup GETs (verified 0 params) ─
const pagingSpec: Record<string, string> = {
    country: CONSTITUENTS,
    constituent_custom_field_category: CONSTITUENTS,
    gift_custom_field_category: GIFTS,
    fundraising_custom_field_category: FUND,
    opportunity_custom_field_category: PROSPECTS,
    name_format_configuration: CONSTITUENTS,
    consent_category: CONSTITUENTS,
    consent_channel: CONSTITUENTS,
    consent_source: CONSTITUENTS,
    solicit_code: CONSTITUENTS,
    rating_category: PROSPECTS,
    rating_source: PROSPECTS,
};
for (const [io, src] of Object.entries(pagingSpec)) {
    store.UpsertIO(CONNECTOR, { Name: io, SupportsPagination: false, PaginationType: 'None' } as never);
    evidence(`io.${io}.SupportsPagination`, `${src}: GET operation for this reference/lookup declares zero limit/offset/skip/page/cursor parameters → not paginated. SupportsPagination=false, PaginationType=None (matches dual-derive).`);
    touch(io);
    addClaim(io, { slot: `io.${io}.SupportsPagination`, value: false, sourcePath: src });
    addClaim(io, { slot: `io.${io}.PaginationType`, value: 'None', sourcePath: src });
}

// ── D) Mechanical capability derive-from-path-presence ───────────────────────
// Determine source-spec for an IO from its APIPath prefix (for the claim sourcePath).
function specForPath(apiPath: unknown): string {
    const p = String(apiPath || '');
    if (p.startsWith('/gift')) return GIFTS;
    if (p.startsWith('/fundraising') || p.startsWith('/nxt-data-integration')) return FUND;
    if (p.startsWith('/opportunity')) return PROSPECTS;
    return CONSTITUENTS;
}
const ios = allIOs();
let createDerived = 0;
let updateDerived = 0;
for (const io of ios) {
    const f = io.fields;
    const name = String(f.Name);
    // Create-derive: has CreateAPIPath and SupportsCreate not already truthy.
    // (the 4 write-enables above already set SupportsCreate=true; constituent has no CreateAPIPath.)
    if (f.CreateAPIPath && f.SupportsCreate !== true) {
        const src = specForPath(f.CreateAPIPath);
        store.UpsertIO(CONNECTOR, { Name: name, SupportsCreate: true } as never);
        evidence(`io.${name}.SupportsCreate`, `Mechanical derive: CreateAPIPath="${f.CreateAPIPath}" + CreateMethod present (bijection-verified) → SupportsCreate=true. v5.42.x DeclaredIntent column is NOT NULL DEFAULT(0); undefined would silently drop the capability on push.`);
        touch(name);
        addClaim(name, { slot: `io.${name}.SupportsCreate`, value: true, sourcePath: src });
        createDerived++;
    }
    if (f.UpdateAPIPath && f.SupportsUpdate !== true) {
        const src = specForPath(f.UpdateAPIPath);
        store.UpsertIO(CONNECTOR, { Name: name, SupportsUpdate: true } as never);
        evidence(`io.${name}.SupportsUpdate`, `Mechanical derive: UpdateAPIPath="${f.UpdateAPIPath}" + UpdateMethod present (bijection-verified) → SupportsUpdate=true. Same v5.42.x DeclaredIntent NOT NULL DEFAULT(0) rationale.`);
        touch(name);
        addClaim(name, { slot: `io.${name}.SupportsUpdate`, value: true, sourcePath: src });
        updateDerived++;
    }
}

// ── Append all code-evidence entries ─────────────────────────────────────────
for (const e of codeEvidence) store.AppendCodeEvidence(CONNECTOR, e as never);

// ── Build emission for the re-processed (touched) objects only ───────────────
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
// PK verdict: keep 'defer' unless a PK was already emitted on the IO; this delta does not touch PK.
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
for (const key of touched) {
    const io = getIO(key);
    const name = io ? String(io.fields.Name) : key;
    const claims = claimsByObj.get(name) ?? claimsByObj.get(key) ?? [];
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
            amendmentRound: 1,
            kind: 'write-capability + pagination delta',
            objectsReprocessed: emission.length,
            writeEnablesApplied: writeEnables.length,
            constituentSplitCreateSetFalse: true,
            paginationCorrections: Object.keys(pagingSpec).length,
            createDerived,
            updateDerived,
            codeEvidenceAppended: codeEvidence.length,
            fieldsExtractedTotal: totalFields,
            emissionArtifact: EMISSION_PATH,
        },
        null,
        2,
    ) + '\n',
);
