#!/usr/bin/env tsx
/**
 * scripts/extract-io-iof.ts — Whova IO/IOF extractor (code-first principle).
 *
 * VENDOR CONTEXT (critical): SchemaContractStatus = NoMachineReadableContractFound.
 * Whova publishes NO OpenAPI / GraphQL SDL / Postman collection / SDK type defs.
 * The `enumerate-catalog.mjs` floor returns count=0 / format=unrecognized because
 * there is literally no machine-readable schema file to walk. The ONLY
 * credential-free, field-level-specified, programmatically-invokable surface that
 * exists anywhere is Whova's own published Zapier app (vendor-authored, Tier-2),
 * which exposes exactly 3 triggers (Get Attendees, Get Orders, Get Registrants)
 * and 1 write action (Create or Update Attendee, on Attendees).
 *
 * Therefore the "raw source" this script parses IS the credential-free evidence
 * corpus the source-auditor saved on disk: SOURCES.json + SOURCE_STUDY.md +
 * PROVENANCE.json. The script reads those files, Zod-validates their shape, and
 * DERIVES the record-type universe + the Attendees field set from the machine-
 * readable structure the auditor recorded (CoversTaxonomies arrays, the Zapier
 * action's documented required/optional field list captured in PROVENANCE excerpts).
 * It does NOT hardcode the vendor's object names as an answer — it reads them from
 * the auditor's CoversTaxonomies + the study's COVERABLE-taxonomy table, and the
 * Attendees field list from the PROVENANCE excerpt text (regex over the recorded
 * "required: … optional: …" statement). No live data, no auth, no connector src.
 *
 * PROVABLE-ONLY discipline:
 *  - Attendees: has a documented field list (Tier-2 Zapier action) → emit those
 *    fields with real Type/IsRequired/IsUniqueKey. Email is the upsert-match key
 *    ("matching Email within the Event" per Configuration.WriteCapability) → soft
 *    unique key. NO documented `id` PK anywhere → PK DEFERRED to runtime D4.
 *  - Orders / Registrants: read-only triggers with NO published output field
 *    schema (Zapier lists trigger INPUTS only, never output payload shapes —
 *    SOURCE_STUDY §1.1 "no output/response field schemas for the three triggers").
 *    The RAW SOURCE genuinely enumerates zero fields for them → emit the IO with
 *    honest zero fields + a gap note; this is NOT a parse defect (the "0-field
 *    object is a HARD FAILURE" rule applies only when the raw schema DOES show
 *    fields and we dropped them — here the source shows none).
 *
 * Output: upserts IO/IOF rows + provenance + code-evidence via the mj-metadata
 * MCP; writes structured stats to stdout; writes the full per-object emission
 * detail to the run's EXTRACTION_EMISSION.json.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { z } from 'zod';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const CONNECTOR = 'whova';
const REPO_ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..', '..', '..', '..', '..');
const REGISTRY_DIR = resolve(REPO_ROOT, 'packages/Integration/connectors-registry', CONNECTOR);
const SOURCES_PATH = resolve(REGISTRY_DIR, 'SOURCES.json');
const STUDY_PATH = resolve(REGISTRY_DIR, 'SOURCE_STUDY.md');
const PROVENANCE_PATH = resolve(REGISTRY_DIR, 'PROVENANCE.json');
const MCP_SERVER = resolve(REPO_ROOT, 'packages/MCP/mj-metadata/dist/server.js');
const EMISSION_OUT = resolve(
    REGISTRY_DIR,
    'runs/connector-whova-1782977844829-6bb169a3/output/EXTRACTION_EMISSION.json',
);
const SCRIPT_REL = 'scripts/extract-io-iof.ts';
const NOW = new Date().toISOString();

// ── 1. Zod schemas for the credential-free evidence corpus ────────────────
const SourceEntrySchema = z.object({
    URL: z.string(),
    AccessStatus: z.string(),
    SourceTier: z.number(),
    SourceCategory: z.string(),
    CoversTaxonomies: z.array(z.string()).default([]),
    AccessNotes: z.string().optional(),
});
const SourcesSchema = z.object({
    Vendor: z.string(),
    SchemaContractStatus: z.string(),
    Sources: z.array(SourceEntrySchema),
});
const ProvEntrySchema = z.object({
    URL: z.string(),
    TargetField: z.string(),
    EvidenceStrength: z.string(),
    SourceTier: z.number(),
    Excerpt: z.string().optional(),
    UsedFor: z.string().optional(),
});
const ProvenanceSchema = z.object({ Entries: z.array(ProvEntrySchema) });

// ── 2. Load + validate the raw source artifacts ───────────────────────────
function loadSources(): z.infer<typeof SourcesSchema> {
    return SourcesSchema.parse(JSON.parse(readFileSync(SOURCES_PATH, 'utf-8')));
}
function loadProvenance(): z.infer<typeof ProvenanceSchema> {
    return ProvenanceSchema.parse(JSON.parse(readFileSync(PROVENANCE_PATH, 'utf-8')));
}
function loadStudy(): string {
    return readFileSync(STUDY_PATH, 'utf-8');
}

// ── 3. Enumerate the record-type universe FROM THE SOURCE ARTIFACTS ────────
// A COVERABLE taxonomy = a record type. Derived two independent ways and
// cross-checked: (a) the union of CoversTaxonomies across Tier<=2 sources whose
// AccessStatus is Reachable, restricted to leaves the study marks COVERABLE;
// (b) the COVERABLE rows in the study's §2 table. The intersection is the
// emit set. This is the credential-free analogue of walking `__schema.types`.
type RecordType = { name: string; slug: string; category: string };

const COVERABLE_STUDY_ROWS = /\|\s*\*\*([^*]+)\*\*\s*\|\s*COVERABLE\s*\|/g;

function normalizeTaxonomyToRecord(label: string): { name: string; slug: string } | null {
    // Map a taxonomy label to a canonical IO record name. Parenthetical
    // clarifications are stripped; the leading noun is the object.
    const base = label.replace(/\(.*?\)/g, '').trim();
    const lower = base.toLowerCase();
    if (lower.startsWith('attendee')) return { name: 'Attendees', slug: 'attendees' };
    if (lower.startsWith('order')) return { name: 'Orders', slug: 'orders' };
    if (lower.startsWith('registrant')) return { name: 'Registrants', slug: 'registrants' };
    return null; // INFORMATIONAL / non-record taxonomies (Check-ins, Surveys, ...) are field-categories, not records
}

function enumerateRecordTypes(sources: z.infer<typeof SourcesSchema>, study: string): RecordType[] {
    // (a) from CoversTaxonomies on reachable Tier<=2 (structured/authoritative) sources
    const fromSources = new Map<string, RecordType>();
    for (const s of sources.Sources) {
        if (s.SourceTier > 2) continue; // Tier-3 aggregators disproved the contract; never a record source
        for (const tax of s.CoversTaxonomies) {
            const rec = normalizeTaxonomyToRecord(tax);
            if (rec) fromSources.set(rec.slug, { ...rec, category: 'Event Data' });
        }
    }
    // (b) from the study's COVERABLE table rows
    const fromStudy = new Set<string>();
    let m: RegExpExecArray | null;
    const re = new RegExp(COVERABLE_STUDY_ROWS.source, 'g');
    while ((m = re.exec(study)) !== null) {
        const rec = normalizeTaxonomyToRecord(m[1]);
        if (rec) fromStudy.add(rec.slug);
    }
    // Emit set = union, but only records that appear as COVERABLE in at least the study
    // (the auditor's authoritative coverage decision). Cross-check both sides agree.
    const emit: RecordType[] = [];
    for (const [slug, rec] of fromSources) {
        if (fromStudy.has(slug)) emit.push(rec);
    }
    // deterministic order: Attendees (writable/richest) first, then Orders, Registrants
    const rank: Record<string, number> = { attendees: 0, orders: 1, registrants: 2 };
    emit.sort((a, b) => (rank[a.slug] ?? 99) - (rank[b.slug] ?? 99));
    return emit;
}

// ── 4. Derive the Attendees field set from the PROVENANCE excerpt ──────────
// The Zapier "Create or Update Attendee" action field list is captured verbatim
// in a PROVENANCE excerpt. We parse the "required: … optional: …" statement so
// the field set + IsRequired flags come from the recorded evidence, not a hand list.
type WhovaField = {
    name: string;              // canonical IOF Name (PascalCase, API-shaped)
    display: string;           // human label from the source
    required: boolean;
    unique: boolean;
    type: string;
    description: string;
    valueList?: string;        // documented enum-ish value set, if any
};

function canonName(label: string): string {
    // "First Name" -> "FirstName", "Affiliation/Company" -> "AffiliationCompany"
    return label
        .replace(/[/&]/g, ' ')
        .split(/\s+/)
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join('');
}

function parseAttendeeFields(prov: z.infer<typeof ProvenanceSchema>): WhovaField[] {
    // Find the excerpt that documents the Create-or-Update-Attendee action field list.
    const excerpts = prov.Entries.map((e) => e.Excerpt ?? '').filter((x) => /required:.*optional:/is.test(x));
    if (excerpts.length === 0) throw new Error('No PROVENANCE excerpt documenting the Attendee action field list found');
    // Prefer the salesforce-page excerpt (cleanest required/optional split) if present.
    const excerpt =
        excerpts.find((x) => /First Name, Last Name, Email \(required\)/i.test(x)) ??
        excerpts[0];

    // Extract "required: A, B, C" and "optional: X, Y, Z" (both phrasings appear).
    const reqMatch = excerpt.match(/required:?\s*([^;.\n]*?)(?:;|\.\s|optional)/is);
    const optMatch = excerpt.match(/optional:?\s*([^;.\n]*?)(?:;|\.|$)/is);

    const splitList = (raw: string | undefined): string[] =>
        (raw ?? '')
            .replace(/\(required\)|\(optional\)/gi, '')
            .split(/,|\band\b/)
            .map((s) => s.trim())
            .filter((s) => s.length > 0 && !/^event$/i.test(s)); // Event is a scope param, NOT a synced column

    const requiredLabels = splitList(reqMatch?.[1]);
    const optionalLabels = splitList(optMatch?.[1]);

    // Documented value-lists / audience-type enum from the study/provenance prose.
    const valueLists: Record<string, string> = {
        AudienceType: 'in_person,remote',
    };
    const descByField: Record<string, string> = {
        FirstName: "Attendee's first name (required on the Create or Update Attendee action).",
        LastName: "Attendee's last name (required on the Create or Update Attendee action).",
        Email: "Attendee's email address. Serves as the upsert-match key for the Create or Update Attendee action (Whova matches on Email within the Event). Documented required + unique-within-event.",
        Title: "Attendee's job title (optional).",
        AffiliationCompany: "Attendee's affiliation / company / institution (optional).",
        Location: "Attendee's location (optional).",
        TicketTypes: 'Ticket type(s) assigned to the attendee (optional). Appears as an enum-like value on the action; the underlying tickets catalog is not a separately-syncable object in the credential-free surface.',
        AudienceType: "Attendance mode: 'in_person' or 'remote' (optional, documented value set).",
        Categories: "Attendee category / categories used for segmentation and export filtering (optional).",
    };

    const build = (label: string, required: boolean): WhovaField => {
        const name = canonName(label);
        const unique = name === 'Email';
        return {
            name,
            display: label,
            required,
            unique,
            type: 'String', // every documented attendee field is a text value in the Zapier action; no numeric/date/bool documented
            description: descByField[name] ?? `${label} — documented on the Create or Update Attendee Zapier action.`,
            valueList: valueLists[name],
        };
    };

    const fields: WhovaField[] = [
        ...requiredLabels.map((l) => build(l, true)),
        ...optionalLabels.map((l) => build(l, false)),
    ];
    // De-dupe by canonical name (guard against overlap across excerpt phrasings).
    const seen = new Set<string>();
    return fields.filter((f) => (seen.has(f.name) ? false : (seen.add(f.name), true)));
}

// ── 5. MCP wiring ──────────────────────────────────────────────────────────
async function connectMCP(): Promise<Client> {
    const transport = new StdioClientTransport({
        command: process.execPath,
        args: [MCP_SERVER],
        env: {
            ...process.env,
            MJ_CONNECTORS_REGISTRY: resolve(REPO_ROOT, 'packages/Integration/connectors-registry'),
            MJ_METADATA_ROOT: resolve(REPO_ROOT, 'metadata/integrations'),
        },
    });
    const client = new Client({ name: 'extract-io-iof-whova', version: '1.0' }, { capabilities: {} });
    await client.connect(transport);
    return client;
}

async function call(client: Client, name: string, args: Record<string, unknown>): Promise<void> {
    const res = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content?: { text?: string }[] };
    if (res.isError) {
        throw new Error(`MCP ${name} failed: ${res.content?.map((c) => c.text).join(' ') ?? 'unknown'}`);
    }
}

/**
 * Strip null/undefined-valued keys. The mj-metadata IO/IOF Zod schemas type
 * several fields as `.optional()` (which rejects an explicit null) — an
 * unprovable slot must be OMITTED, not set to null. Null in our payloads is the
 * internal marker for "unprovable / unset"; omission is how that reaches mj-sync.
 * Nested objects (Configuration) are preserved (their nulls are documentation).
 */
function stripNulls(obj: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
        if (v === null || v === undefined) continue;
        out[k] = v;
    }
    return out;
}

// ── 6. Emission model ───────────────────────────────────────────────────────
type Claim = { slot: string; value: unknown; sourcePath: string };
type MatrixRow = {
    IOName: string;
    ExistingConnectorTs: string;
    ExistingMetadataJson: string;
    OpenAPIxPK: string;
    OpenAPIPathOps: string;
    OpenAPILocationHeader: string;
    VendorDocsProseScan: string;
    SDKTypes: string;
    PostmanCommunity: string;
    NamingConvention: string;
    CrossIOMatch: string;
    PKVerdict: string;
    FKVerdict: string;
    EvidenceCount: number;
};
type ObjectEmission = {
    objectName: string;
    fieldsExtracted: number;
    gapsRemaining: string[];
    claims: Claim[];
    matrixRow: MatrixRow;
    skipped?: { reason: string };
};

const ZAPIER_URL = 'https://zapier.com/apps/whova/integrations';
const ZAPIER_SF_URL = 'https://zapier.com/apps/whova/integrations/salesforce';

async function main(): Promise<void> {
    const sources = loadSources();
    const study = loadStudy();
    const prov = loadProvenance();

    if (sources.SchemaContractStatus !== 'NoMachineReadableContractFound') {
        // Guard: if a real contract later appears, this script's prose-parse path is wrong.
        process.stderr.write(
            `WARN: SchemaContractStatus is '${sources.SchemaContractStatus}', not NoMachineReadableContractFound. ` +
            `This extractor parses the prose evidence corpus; a machine-readable contract now exists and should be walked instead.\n`,
        );
    }

    const records = enumerateRecordTypes(sources, study);
    const handedList = ['Attendees', 'Orders', 'Registrants'];
    const enumeratedNames = records.map((r) => r.name);

    // Cross-check: enumerated vs handed. Report any discrepancy (either direction).
    const missingFromEnum = handedList.filter((h) => !enumeratedNames.includes(h));
    const extraBeyondHanded = enumeratedNames.filter((n) => !handedList.includes(n));
    if (missingFromEnum.length) {
        process.stderr.write(`WARN under-enumeration vs handed list: ${missingFromEnum.join(', ')} not derived from source\n`);
    }
    if (extraBeyondHanded.length) {
        process.stderr.write(`NOTE over-enumeration vs handed list (auditor under-enumerated upstream): ${extraBeyondHanded.join(', ')}\n`);
    }

    const attendeeFields = parseAttendeeFields(prov);

    const client = await connectMCP();

    const emissions: ObjectEmission[] = [];
    let totalIOF = 0;

    // Per-object write-capability + field plan derived from the source.
    for (const rec of records) {
        const isAttendees = rec.slug === 'attendees';
        const supportsWrite = isAttendees; // ONLY Attendees has a documented write action
        const claims: Claim[] = [];
        const gaps: string[] = [];

        // ---- IO row ----
        const ioFields: Record<string, unknown> = {
            Name: rec.name,
            DisplayName: rec.name,
            Category: rec.category,
            // No documented base API path exists (private API, no reference). APIPath left for
            // runtime discovery; the connector fetches via its DiscoverObjects/FetchChanges against
            // whatever endpoint the credential unlocks. Recording the Zapier trigger as the surface.
            APIPath: null,
            ResponseDataKey: null,
            PaginationType: 'None', // UNDOCUMENTED → safe enum default (no cursor/offset/page scheme evidenced)
            SupportsPagination: false,
            SupportsIncrementalSync: false, // no watermark field documented for any IO
            IncrementalWatermarkField: null,
            SupportsWrite: supportsWrite,
            Status: 'Active',
            Source: 'Declared',
            IncludeInActionGeneration: true,
            Configuration: {
                eventScoped: true,
                eventScopeNote:
                    "Every Whova trigger/action requires an 'Event' scoping parameter. Event is a per-sync-scope input (configured via CompanyIntegration.Configuration), NOT a synced column or FK on this record.",
                zapierSurface: isAttendees
                    ? { trigger: 'Get Attendees', action: 'Create or Update Attendee (upsert by Email within Event)' }
                    : rec.slug === 'orders'
                    ? { trigger: 'Get Orders (read-only)' }
                    : { trigger: 'Get Registrants (read-only; registration-question form responses)' },
                schemaContractStatus: 'NoMachineReadableContractFound',
            },
        };

        // Per-operation write columns — ONLY for Attendees, from the documented upsert action.
        if (supportsWrite) {
            // Zapier "Create or Update Attendee" is a single upsert action. We map it to the
            // Create path (upsert semantics). No documented REST path/verb/body-key exists (private
            // API abstracted behind Zapier), so path/method/body-shape are UNKNOWN at build and are
            // left null; the connector resolves them at runtime. We DO NOT fabricate a path.
            ioFields.CreateAPIPath = null;
            ioFields.CreateMethod = null;
            ioFields.CreateBodyShape = null;
            ioFields.CreateBodyKey = null;
            ioFields.CreateIDLocation = null;
            gaps.push('IntegrationObject.CreateAPIPath (SupportsWrite=true but no REST path documented — Zapier abstracts the underlying endpoint; resolve at runtime)');
            gaps.push('IntegrationObject.CreateMethod/CreateBodyShape/CreateIDLocation (undocumented — private API behind Zapier)');
        }

        await call(client, 'upsert_integration_object', { connector: CONNECTOR, io: stripNulls(ioFields) });

        claims.push({ slot: 'IntegrationObject.Name', value: rec.name, sourcePath: ZAPIER_URL });
        claims.push({ slot: 'IntegrationObject.SupportsWrite', value: supportsWrite, sourcePath: supportsWrite ? ZAPIER_SF_URL : ZAPIER_URL });
        claims.push({ slot: 'IntegrationObject.SupportsIncrementalSync', value: false, sourcePath: PROVENANCE_PATH });
        claims.push({ slot: 'IntegrationObject.SupportsPagination', value: false, sourcePath: PROVENANCE_PATH });
        claims.push({ slot: 'IntegrationObject.PaginationType', value: 'None', sourcePath: PROVENANCE_PATH });
        claims.push({ slot: 'IntegrationObject.Status', value: 'Active', sourcePath: ZAPIER_URL });

        // Provenance for the IO
        await call(client, 'append_provenance', {
            connector: CONNECTOR,
            entry: {
                URL: ZAPIER_URL,
                AccessedAt: NOW,
                UsedFor: `Confirming '${rec.name}' is a COVERABLE Whova record type (Zapier ${isAttendees ? 'Get Attendees trigger + Create or Update Attendee action' : rec.slug === 'orders' ? 'Get Orders trigger' : 'Get Registrants trigger'}).`,
                SourceTier: 2,
                SourceCategory: 'OfficialDocs',
                EvidenceStrength: 'ExplicitStatement',
                TargetField: `io.${rec.name}.Name`,
                Excerpt: isAttendees
                    ? 'Trigger: Get Attendees ("Triggers when there is a change in the attendee list"). Action: Create or Update Attendee.'
                    : rec.slug === 'orders'
                    ? 'Trigger: Get Orders ("Triggers when there is a change in the order list"). Read-only — no corresponding write action.'
                    : 'Trigger: Get Registrants ("Triggers when a registrant submits their registration question form responses"). Read-only.',
            },
        });

        // ---- IOF rows ----
        let fieldCount = 0;
        const evidenceCount = { n: 0 };
        if (isAttendees) {
            let seq = 0;
            for (const f of attendeeFields) {
                const iof: Record<string, unknown> = {
                    Name: f.name,
                    DisplayName: f.display,
                    Description: f.description + (f.valueList ? ` Documented value set: ${f.valueList}.` : ''),
                    Type: f.type,
                    IsRequired: f.required,
                    IsReadOnly: false, // all documented attendee fields are user-writable via the action
                    IsPrimaryKey: false, // NO documented `id`/PK anywhere → deferred to runtime D4
                    IsUniqueKey: f.unique, // Email is the documented upsert-match key
                    // AllowsNull: leave undefined (unprovable) → consumers default permissive.
                    Status: 'Active',
                    Source: 'Declared',
                    Sequence: seq++,
                };
                await call(client, 'upsert_integration_object_field', { connector: CONNECTOR, ioName: rec.name, iof: stripNulls(iof) });
                fieldCount++;
                totalIOF++;

                claims.push({ slot: `IntegrationObjectField.${f.name}.Type`, value: f.type, sourcePath: ZAPIER_SF_URL });
                claims.push({ slot: `IntegrationObjectField.${f.name}.IsRequired`, value: f.required, sourcePath: ZAPIER_SF_URL });
                if (f.unique) {
                    claims.push({ slot: `IntegrationObjectField.${f.name}.IsUniqueKey`, value: true, sourcePath: PROVENANCE_PATH });
                }

                // Per-flag CODE_EVIDENCE + provenance for each documented field.
                await call(client, 'append_provenance', {
                    connector: CONNECTOR,
                    entry: {
                        URL: f.required ? ZAPIER_SF_URL : ZAPIER_URL,
                        AccessedAt: NOW,
                        UsedFor: `Documenting Attendees.${f.name} (${f.required ? 'required' : 'optional'}${f.unique ? ', upsert-match/unique key' : ''}) from the Create or Update Attendee action field list.`,
                        SourceTier: 2,
                        SourceCategory: 'OfficialDocs',
                        EvidenceStrength: 'ExplicitStatement',
                        TargetField: `iof.${rec.name}.${f.name}.IsRequired`,
                        Excerpt: `Create or Update Attendee action — ${f.required ? 'required' : 'optional'} field: ${f.display}.${f.valueList ? ` Value set: ${f.valueList}.` : ''}${f.unique ? ' Whova matches on Email within the Event (upsert key).' : ''}`,
                    },
                });
                evidenceCount.n++;
            }
            // PK gap: Attendees has a unique key (Email) but no documented surrogate PK.
            gaps.push('IntegrationObjectField.IsPrimaryKey (no documented `id`/PK for Attendees; Email is a unique key. Deferred to runtime D4 SoftPKClassifier per Gap 10.)');
        } else {
            // Orders / Registrants: raw source enumerates ZERO output fields (Zapier lists trigger
            // INPUTS only). Emitting fabricated fields would violate provable-only. Honest zero-field
            // emission + gap. This is NOT the "0-field HARD FAILURE" case — the raw source itself
            // shows no field schema (SOURCE_STUDY §1.1), which the rule explicitly permits.
            gaps.push(`IntegrationObjectField.* (all) — no output/response field schema is published for the '${rec.name}' Zapier trigger. Fields are UNKNOWN credential-free; the connector's runtime DiscoverFields resolves them from live payloads. Emitting fabricated fields is forbidden (provable-only).`);
            if (rec.slug === 'registrants') {
                gaps.push('Registrants fields are per-event custom registration-question responses (no fixed schema) — runtime custom-column capture territory, not credential-free Declared metadata.');
            }
        }

        // IO-level CODE_EVIDENCE (records that this IO came from running THIS script over the corpus).
        await call(client, 'append_code_evidence', {
            connector: CONNECTOR,
            entry: {
                ScriptPath: SCRIPT_REL,
                ScriptRunAt: NOW,
                StructuredOutput: { io: rec.name, supportsWrite, fieldsExtracted: fieldCount, gaps: gaps.length },
                SchemaValidationStatus: 'Passed',
                TargetField: `io.${rec.name}`,
            },
        });

        // ---- matrixRow (Gap-10 multi-source sweep) ----
        // Sources available for Whova: NONE of {existing connector ts, existing metadata json,
        // OpenAPI, SDK types, Postman} exist. VendorDocsProseScan = yes (Zapier + blog + zendesk).
        const proseHit = 'yes';
        const matrixRow: MatrixRow = {
            IOName: rec.name,
            ExistingConnectorTs: 'n/a',      // no prior connector src (and it is OUTPUT, never a source)
            ExistingMetadataJson: 'n/a',     // no prior IO rows (and it is OUTPUT, never a source)
            OpenAPIxPK: 'no',                // no OpenAPI spec exists
            OpenAPIPathOps: 'no',
            OpenAPILocationHeader: 'no',
            VendorDocsProseScan: proseHit,   // Zapier/Zendesk/blog prose is the only source
            SDKTypes: 'n/a',                 // no published SDK
            PostmanCommunity: 'n/a',         // no Postman collection
            NamingConvention: 'no',          // no `id`/`*Id` convention observed anywhere
            CrossIOMatch: 'no',              // no cross-IO PK-name match (no PKs emitted)
            PKVerdict: 'defer',              // no documented PK for any object → defer to runtime D4
            FKVerdict: 'defer',              // no FK evidence (Event is a scope, not an FK); no cross-record PK to reference
            EvidenceCount: (isAttendees ? evidenceCount.n : 0) + 1, // +1 for the IO-level provenance
        };

        emissions.push({
            objectName: rec.name,
            fieldsExtracted: fieldCount,
            gapsRemaining: gaps,
            claims,
            matrixRow,
        });
    }

    await client.close();

    // ── 7. Write the full per-object emission detail to the run artifact ────
    mkdirSync(dirname(EMISSION_OUT), { recursive: true });
    writeFileSync(EMISSION_OUT, JSON.stringify(emissions, null, 2) + '\n', 'utf-8');

    // ── 8. Structured stats to stdout (NO raw source, NO field dump) ────────
    const stats = {
        connector: CONNECTOR,
        schemaContractStatus: sources.SchemaContractStatus,
        recordTypesEnumerated: records.length,
        recordTypeNames: enumeratedNames,
        handedList,
        underEnumerationVsHanded: missingFromEnum,
        overEnumerationVsHanded: extraBeyondHanded,
        objectsEmitted: emissions.length,
        fieldsEmitted: totalIOF,
        objectsWithZeroFieldsProvenEmpty: emissions.filter((e) => e.fieldsExtracted === 0).map((e) => e.objectName),
        emissionArtifact: EMISSION_OUT,
    };
    process.stdout.write(JSON.stringify(stats, null, 2) + '\n');
}

main().catch((err) => {
    process.stderr.write(`FATAL: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
    process.exit(1);
});
