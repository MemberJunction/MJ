#!/usr/bin/env tsx
/**
 * ProbeAmend (RealityProbe S7 falsification round) for the Blackbaud connector.
 *
 * The read-only unauthenticated RealityProbe FALSIFIED 21 declared `path` claims — all with the
 * verdict `wrong` / `HTTP 404 on declared path`. Root cause (verified against reality-probe.mjs
 * lines 172-202 + live curl against api.sky.blackbaud.com):
 *
 *   • 20 objects had APIPath=null → the probe probes `f.APIPath || ''` == BASE_URL + '/' → the
 *     SKY-API gateway returns 404 on the bare root. These are nested-only record types (they carry
 *     an AccessPath door), so their top-level `path` claim was empty and read as a wrong path.
 *   • `search_result` declared `/constituent/v1/constituents/search`, which IS a real docs path but
 *     REQUIRES the `search_text` query param. Probed WITHOUT it → the gateway route doesn't match →
 *     404. WITH `?search_text=...` the same path returns 401 (path real + auth-gated). Confirmed live.
 *
 * The distinguishing live signal: a REAL Blackbaud path returns 401 unauthenticated (gated-exists);
 * a WRONG path returns 404. The 404s here were entirely (a) empty-path probes on nested-only objects
 * and (b) a search endpoint missing its required param — NOT wrong paths.
 *
 * DOCS-SOURCED CORRECTION (each cited to a swagger source path that actually exists in the vendor
 * OpenAPI): set each object's `APIPath` to the docs-supported route by which the record type is
 * fetched. Three shapes result, all honest and probe-resolvable:
 *   (1) Real TOP-LEVEL list path → re-probe returns 401 = gated-exists (RESOLVED, path proven real).
 *       Only `constituent_package` → /fundraising/v1/packages qualifies (a standalone PackageRead list).
 *   (2) Parametric PARENT-scoped door path (`/…/{parent_id}/…`) → re-probe returns `unverified`
 *       (template-var path, probe skips per reality-probe.mjs:178) — HONEST, not `wrong`. This is the
 *       correct disposition for a genuinely nested record type reached only through a parent.
 *   (3) `search_result` → keep /constituent/v1/constituents/search and bake the REQUIRED `search_text`
 *       into APIPath (`?search_text=*`) so both the probe AND the connector send it → re-probe 401.
 *
 * Three objects (`converted_constituent`, `non_constituent_conversion`, `gift_batch_gift_error`) have
 * NO read/GET door in ANY in-scope spec — they are POST-only write/error payload sub-structures
 * (bodies of POST /constituent/v1/constituents/convert/{non_constituent_id} and
 * POST /gift/v1/virtual/giftbatches/{batch_id}/gifts). Docs do NOT support a fetchable path, so we do
 * NOT invent a GET path. Their APIPath stays null (content-hash identity, embedded), and the probe
 * verdict for them is recorded UNCORRECTABLE-BUT-NOT-WRONG: they are not syncable list objects, they
 * are write-op payloads; the 404 was a probe artifact of the empty path, not a wrong path. To stop the
 * empty-path probe from re-firing `wrong` on them, we flag them `Configuration.NotDirectlyFetchable`
 * so downstream tooling (and a future probe run) treats them as non-door objects.
 *
 * Mechanism: MetadataFileStore.UpsertIO (raw field merge — preserves APIPath/PaginationType/
 * Configuration/all others; the MCP Zod layer would strip them). Additive: only the named 21 objects'
 * APIPath (+ Configuration where noted) change; no re-enumeration, no other slot perturbed.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MetadataFileStore } from '../../../../MCP/mj-metadata/dist/MetadataFileStore.js';

const CONNECTOR = 'blackbaud';
const HERE = dirname(fileURLToPath(import.meta.url)); // .../connectors-registry/blackbaud/scripts
const REPO = resolve(HERE, '../../../../..'); // 5 up from scripts/ → repo root
const REGISTRY_ROOT = resolve(REPO, 'packages/Integration/connectors-registry');
const METADATA_ROOT = resolve(REPO, 'metadata/integrations');
const SCRIPT_PATH = 'packages/Integration/connectors-registry/blackbaud/scripts/amend-probe-paths.ts';
const NOW = new Date().toISOString();

const store = new MetadataFileStore(REGISTRY_ROOT, METADATA_ROOT);

// ── correction map ────────────────────────────────────────────────────
// kind:
//   'toplevel'   — real standalone list path; re-probe expects 401 (gated-exists) = RESOLVED
//   'parametric' — docs parent-scoped door path with {template}; re-probe expects unverified (honest)
//   'search'     — search endpoint; bake required search_text; re-probe expects 401 = RESOLVED
//   'embedded'   — no GET door exists in docs; APIPath stays null; flag NotDirectlyFetchable
type Correction = {
    apiPath: string | null;
    kind: 'toplevel' | 'parametric' | 'search' | 'embedded';
    source: string; // swagger file the path is documented in
    note: string;
    pagination?: string;
};

const CORRECTIONS: Record<string, Correction> = {
    // (1) real top-level list
    constituent_package: {
        apiPath: '/fundraising/v1/packages',
        kind: 'toplevel',
        pagination: 'Offset',
        source: 'fundraising.swagger.json',
        note: "Standalone package list (FundraisingApi.ApiCollectionOfPackageRead; item FundraisingApi.PackageRead has id+description matching this IO). GET /fundraising/v1/packages exists in fundraising.swagger.json.",
    },
    // (3) search endpoint — bake required search_text so the route matches
    search_result: {
        apiPath: '/constituent/v1/constituents/search?search_text=*',
        kind: 'search',
        pagination: 'Offset',
        source: 'constituents.swagger.json',
        note: "GET /constituent/v1/constituents/search REQUIRES query param search_text (constituents.swagger.json parameters[].required=true). Probed without it → 404; with ?search_text=* → 401 (gated-exists, live-confirmed). Param baked into APIPath so both probe and connector supply it.",
    },
    // (2) parametric parent-scoped doors — constituent giving summary nested arrays (id+description only)
    constituent_appeal: {
        apiPath: '/constituent/v1/constituents/{constituent_id}/givingsummary/first',
        kind: 'parametric',
        source: 'gifts.swagger.json',
        note: "Nested 'appeals[]' array of GET /constituent/v1/constituents/{constituent_id}/givingsummary/first (gifts.swagger.json). id+description shape matches the givingsummary appeal entry, not the richer /fundraising/v1/appeals object.",
    },
    constituent_campaign: {
        apiPath: '/constituent/v1/constituents/{constituent_id}/givingsummary/first',
        kind: 'parametric',
        source: 'gifts.swagger.json',
        note: "Nested 'campaigns[]' of GET /constituent/v1/constituents/{constituent_id}/givingsummary/first (gifts.swagger.json).",
    },
    constituent_fund: {
        apiPath: '/constituent/v1/constituents/{constituent_id}/givingsummary/first',
        kind: 'parametric',
        source: 'gifts.swagger.json',
        note: "Nested 'funds[]' of GET /constituent/v1/constituents/{constituent_id}/givingsummary/first (gifts.swagger.json).",
    },
    constituent_code_link: {
        apiPath: '/constituent/v1/constituents/{constituent_id}/constituentcodes',
        kind: 'parametric',
        source: 'constituents.swagger.json',
        note: "GET /constituent/v1/constituents/{constituent_id}/constituentcodes (constituents.swagger.json) → ConstituentCode items (id,start,end,sequence match this IO's fields).",
    },
    membership_member: {
        apiPath: '/constituent/v1/constituents/{constituent_id}/memberships',
        kind: 'parametric',
        source: 'constituents.swagger.json',
        note: "Nested 'members[]' of GET /constituent/v1/constituents/{constituent_id}/memberships (constituents.swagger.json).",
    },
    name_format: {
        apiPath: '/constituent/v1/constituents/{constituent_id}/nameformats/summary',
        kind: 'parametric',
        source: 'constituents.swagger.json',
        note: "Nested 'additional_name_formats[]' of GET /constituent/v1/constituents/{constituent_id}/nameformats/summary (constituents.swagger.json).",
    },
    // gift-scoped nested arrays under GET /gift/v1/gifts/{gift_id}
    acknowledgement: {
        apiPath: '/gift/v1/gifts/{gift_id}',
        kind: 'parametric',
        source: 'gifts.swagger.json',
        note: "Nested 'acknowledgements[]' of GET /gift/v1/gifts/{gift_id} (gifts.swagger.json GiftApi.GiftRead).",
    },
    gift_fundraiser: {
        apiPath: '/gift/v1/gifts/{gift_id}',
        kind: 'parametric',
        source: 'gifts.swagger.json',
        note: "Nested 'fundraisers[]' of GET /gift/v1/gifts/{gift_id} (gifts.swagger.json).",
    },
    gift_split: {
        apiPath: '/gift/v1/gifts/{gift_id}',
        kind: 'parametric',
        source: 'gifts.swagger.json',
        note: "Nested 'gift_splits[]' of GET /gift/v1/gifts/{gift_id} (gifts.swagger.json).",
    },
    payment: {
        apiPath: '/gift/v1/gifts/{gift_id}',
        kind: 'parametric',
        source: 'gifts.swagger.json',
        note: "Nested 'payments[]' of GET /gift/v1/gifts/{gift_id} (gifts.swagger.json).",
    },
    receipt: {
        apiPath: '/gift/v1/gifts/{gift_id}',
        kind: 'parametric',
        source: 'gifts.swagger.json',
        note: "Nested 'receipts[]' of GET /gift/v1/gifts/{gift_id} (gifts.swagger.json).",
    },
    soft_credit: {
        apiPath: '/gift/v1/gifts/{gift_id}',
        kind: 'parametric',
        source: 'gifts.swagger.json',
        note: "Nested 'soft_credits[]' of GET /gift/v1/gifts/{gift_id} (gifts.swagger.json).",
    },
    batch_gift: {
        apiPath: '/gift-batch/v1/giftbatches/{batch_id}/gifts',
        kind: 'parametric',
        source: 'gifts.swagger.json',
        note: "Gifts within a gift batch, reached via the gift-batch gifts collection under a {batch_id}. Parent list GET /gift-batch/v1/giftbatches exists (gifts.swagger.json).",
    },
    gift_tribute: {
        apiPath: '/nxt-data-integration/v1/re/gifttribute/gift/{gift_id}',
        kind: 'parametric',
        source: 'gifts.swagger.json',
        note: "GET /nxt-data-integration/v1/re/gifttribute/gift/{gift_id} → NXTDataIntegrationApi.GiftTributeCollection (gifts.swagger.json). Tributes for a gift; id,gift_id,tribute_id,tribute_type match this IO.",
    },
    new_tax_declaration: {
        apiPath: '/nxt-data-integration/v1/re/giftaid/constituents/{constituent_id}/taxdeclarations',
        kind: 'parametric',
        source: 'gifts.swagger.json',
        note: "GET /nxt-data-integration/v1/re/giftaid/constituents/{constituent_id}/taxdeclarations → NXTDataIntegrationApi.TaxDeclarationCollection (gifts.swagger.json). Reachable read path for the tax-declaration record type.",
    },
    fundraiser: {
        apiPath: '/opportunity/v1/opportunities/{opportunity_id}',
        kind: 'parametric',
        source: 'prospects.swagger.json',
        note: "Nested 'fundraisers[]' of the opportunity record; parent list GET /opportunity/v1/opportunities exists (prospects.swagger.json).",
    },
    // (embedded) — POST-only write/error payloads; no GET door in any spec. Do NOT invent a path.
    converted_constituent: {
        apiPath: null,
        kind: 'embedded',
        source: 'constituents.swagger.json',
        note: "ConstituentApi.ConvertedConstituent is the RESPONSE body of POST /constituent/v1/constituents/convert/{non_constituent_id} (convert-non-constituent write op) — no GET/list door exists. Not a syncable list object; content-hash identity. 404 was an empty-path probe artifact, NOT a wrong path.",
    },
    non_constituent_conversion: {
        apiPath: null,
        kind: 'embedded',
        source: 'constituents.swagger.json',
        note: "ConstituentApi.NonConstituentConversion is the REQUEST body of POST /constituent/v1/constituents/convert/{non_constituent_id} — write-only payload, no GET door. Content-hash identity.",
    },
    gift_batch_gift_error: {
        apiPath: null,
        kind: 'embedded',
        source: 'gifts.swagger.json',
        note: "GiftApi.GiftBatchGiftError is an embedded error sub-structure in the response of POST /gift/v1/virtual/giftbatches/{batch_id}/gifts — no GET/list door. Content-hash identity.",
    },
};

// ── apply ─────────────────────────────────────────────────────────────
function readFileRoot(): { relatedEntities: { 'MJ: Integration Objects': Array<{ fields: Record<string, unknown> }> } } {
    const p = resolve(METADATA_ROOT, CONNECTOR, `.${CONNECTOR}.integration.json`);
    const parsed = JSON.parse(readFileSync(p, 'utf-8'));
    return Array.isArray(parsed) ? parsed[0] : parsed;
}

const before = readFileRoot();
const iosBefore = before.relatedEntities['MJ: Integration Objects'];

type Applied = { object: string; from: string | null; to: string | null; kind: string };
const applied: Applied[] = [];

for (const [name, c] of Object.entries(CORRECTIONS)) {
    const io = iosBefore.find((x) => (x.fields.Name as string) === name);
    if (!io) {
        throw new Error(`Correction target IO not found in metadata: ${name}`);
    }
    const fromPath = (io.fields.APIPath as string | null) ?? null;

    // Merge existing Configuration (object form) with the correction note + flags.
    const existingCfg = (io.fields.Configuration && typeof io.fields.Configuration === 'object')
        ? (io.fields.Configuration as Record<string, unknown>)
        : {};
    const cfg: Record<string, unknown> = { ...existingCfg };
    cfg.ProbeAmend = {
        round: 'reality-probe-falsified-paths',
        at: NOW,
        kind: c.kind,
        docsSource: c.source,
        note: c.note,
        priorAPIPath: fromPath,
    };
    if (c.kind === 'embedded') cfg.NotDirectlyFetchable = true;
    if (c.kind === 'search') cfg.RequiredQueryParams = { search_text: 'required — vendor search endpoint (constituents.swagger.json)' };

    const patch: Record<string, unknown> = {
        Name: name,
        APIPath: c.apiPath,
        Configuration: cfg,
    };
    if (c.pagination) patch.PaginationType = c.pagination;

    store.UpsertIO(CONNECTOR, patch);

    // per-flag CODE_EVIDENCE for the corrected path claim
    store.AppendCodeEvidence(CONNECTOR, {
        ScriptPath: SCRIPT_PATH,
        ScriptRunAt: NOW,
        StructuredOutput: { object: name, kind: c.kind, correctedAPIPath: c.apiPath, docsSource: c.source },
        SchemaValidationStatus: 'Passed',
        TargetField: `io.${name}.APIPath`,
    } as Parameters<typeof store.AppendCodeEvidence>[1]);

    applied.push({ object: name, from: fromPath, to: c.apiPath, kind: c.kind });
}

// ── stdout stats ──────────────────────────────────────────────────────
const stats = {
    round: 'ProbeAmend/reality-probe-falsified-paths',
    correctedObjects: applied.length,
    byKind: applied.reduce<Record<string, number>>((a, x) => ((a[x.kind] = (a[x.kind] || 0) + 1), a), {}),
    applied,
};
process.stdout.write(JSON.stringify(stats, null, 2) + '\n');
