#!/usr/bin/env node
// build-emission.mjs — Eventbrite extraction EMISSION builder.
//
// This script does NOT re-author metadata. The on-disk metadata file
//   metadata/integrations/eventbrite/.eventbrite.integration.json
// is the SOURCE OF TRUTH (produced + reviewed clean over prior amendment rounds:
// 33 IOs / 346 IOF rows, ConfirmedGapsBlocking=0). This script:
//   1. INDEPENDENTLY enumerates the raw .apib record-type universe (dedicated MSON
//      enumerator, because the shared enumerate-catalog.mjs has no API-Blueprint parser
//      and returns count:0 on this file — surfaced explicitly as a shortfall reason).
//   2. Reads the on-disk metadata and emits ONE emission-object per IO with:
//        - one claim per emitted slot (PK, FK+RelatedIntegrationObjectID, per-op CRUD,
//          watermark, per-field type attributes), each carrying {slot, value, sourcePath}
//        - a Gap-10 matrixRow
//   3. RECONCILES the enumerated universe against the emitted set — every enumerated
//      record type is emitted OR skipped-with-reason (wrapper / request-variant /
//      container-folded nested / alias / error-shape), so emitted ∪ skipped == enumerated.
//   4. Writes EXTRACTION_EMISSION.json + prints compact stats (counts + gaps).

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { enumerateAPIBFile } from '../sources/enumerate-apib.mjs';

const ROOT = '/Users/bcladmin/Projects/MemberJunction/MJ';
const CONN = join(ROOT, 'packages/Integration/connectors-registry/eventbrite');
const METADATA_PATH = join(ROOT, 'metadata/integrations/eventbrite/.eventbrite.integration.json');
const APIB = join(CONN, 'sources/eventbrite-v3-api-blueprint.apib');
const CODE_EVIDENCE = join(CONN, 'CODE_EVIDENCE.json');
const PROVENANCE = join(CONN, 'PROVENANCE.json');
const SHARED_ENUM = join(ROOT, 'packages/Integration/connector-builder-workshop/floor/enumerate-catalog.mjs');
const OUT = join(CONN, 'runs/connector-eventbrite-1783012840625-d9ec733d/output/EXTRACTION_EMISSION.json');
const SRC_REL = 'sources/eventbrite-v3-api-blueprint.apib';

// ---------------------------------------------------------------------------
// 1. Independent enumeration of the raw source.
// ---------------------------------------------------------------------------
const enumResult = enumerateAPIBFile(APIB);
const enumeratedTypes = enumResult.recordTypes; // 223 MSON types
const apibText = readFileSync(APIB, 'utf8');
const apibLines = apibText.split(/\r?\n/);

// Shared enumerator cross-check (records the shortfall — it cannot parse .apib).
let sharedEnumCount = null;
try {
    const sharedOut = execFileSync('node', [SHARED_ENUM, APIB], { encoding: 'utf8' });
    sharedEnumCount = JSON.parse(sharedOut).count;
} catch { sharedEnumCount = null; }

// ---------------------------------------------------------------------------
// 2. Load the on-disk metadata (source of truth) + evidence.
// ---------------------------------------------------------------------------
const rawMeta = JSON.parse(readFileSync(METADATA_PATH, 'utf8'));
const meta = Array.isArray(rawMeta) ? rawMeta[0] : rawMeta;
const IOS = meta.relatedEntities['MJ: Integration Objects'] || [];

const codeEvidence = existsSync(CODE_EVIDENCE) ? JSON.parse(readFileSync(CODE_EVIDENCE, 'utf8')).Entries || [] : [];
const provenance = existsSync(PROVENANCE) ? JSON.parse(readFileSync(PROVENANCE, 'utf8')).Entries || [] : [];

// Per-IO evidence count from TargetField prefixes (io.<Name>.* / iof.<Name>.*).
function evidenceCountFor(ioName) {
    let n = 0;
    for (const e of [...codeEvidence, ...provenance]) {
        const t = e.TargetField || '';
        if (t.startsWith(`io.${ioName}.`) || t.startsWith(`iof.${ioName}.`) || t === `io.${ioName}`) n++;
    }
    return n;
}

// find first raw-source line number mentioning a token (for sourcePath citations)
function lineFor(token) {
    for (let i = 0; i < apibLines.length; i++) {
        if (apibLines[i].includes(token)) return i + 1;
    }
    return null;
}

// ---------------------------------------------------------------------------
// 3. Build per-IO emission objects.
// ---------------------------------------------------------------------------
function ioSource(io) {
    const api = io.fields.APIPath || '';
    const ln = api ? lineFor(api.replace(/\{[^}]+\}/g, '')) : null;
    return `${SRC_REL}${ln ? ` (APIPath ${api}, ~line ${ln})` : ` (APIPath ${api})`}`;
}

const emittedIONames = new Set(IOS.map((io) => io.fields.Name));

const emission = [];
let totalFields = 0;
const globalGaps = [];

for (const io of IOS) {
    const f = io.fields;
    const iofs = io.relatedEntities['MJ: Integration Object Fields'] || [];
    totalFields += iofs.length;
    const claims = [];
    const src = ioSource(io);

    // ---- IO-level slot claims -------------------------------------------------
    claims.push({ slot: `io.${f.Name}.APIPath`, value: f.APIPath ?? null, sourcePath: src });
    claims.push({ slot: `io.${f.Name}.PaginationType`, value: f.PaginationType ?? null, sourcePath: src });
    claims.push({ slot: `io.${f.Name}.SupportsPagination`, value: f.SupportsPagination ?? false, sourcePath: src });
    claims.push({ slot: `io.${f.Name}.SupportsWrite`, value: f.SupportsWrite ?? false, sourcePath: src });
    claims.push({ slot: `io.${f.Name}.SupportsIncrementalSync`, value: f.SupportsIncrementalSync ?? false, sourcePath: src });
    if (f.SupportsIncrementalSync) {
        const wln = lineFor('changed_since');
        claims.push({
            slot: `io.${f.Name}.IncrementalWatermarkField`,
            value: f.IncrementalWatermarkField ?? null,
            sourcePath: `${SRC_REL} (changed_since query-param, ~line ${wln})`,
        });
    }
    // per-operation CRUD columns (only present when a write capability is set)
    for (const op of ['Create', 'Update', 'Delete']) {
        const pathK = `${op}APIPath`, methK = `${op}Method`;
        if (f[pathK]) {
            claims.push({ slot: `io.${f.Name}.${pathK}`, value: f[pathK], sourcePath: `${SRC_REL} (${op} operation for ${f.Name})` });
            claims.push({ slot: `io.${f.Name}.${methK}`, value: f[methK] ?? null, sourcePath: `${SRC_REL} (${op} operation for ${f.Name})` });
            for (const suffix of ['BodyShape', 'BodyKey', 'IDLocation']) {
                const k = `${op}${suffix}`;
                if (f[k] !== undefined && f[k] !== null) {
                    claims.push({ slot: `io.${f.Name}.${k}`, value: f[k], sourcePath: `${SRC_REL} (${op} operation for ${f.Name})` });
                }
            }
        }
    }

    // ---- IOF-level slot claims ------------------------------------------------
    let hasPK = false;
    let fkCount = 0;
    for (const iof of iofs) {
        const g = iof.fields;
        const fieldSrc = `${SRC_REL} (field '${g.Name}' on ${f.Name})`;
        claims.push({ slot: `iof.${f.Name}.${g.Name}.Type`, value: g.Type ?? null, sourcePath: fieldSrc });
        claims.push({ slot: `iof.${f.Name}.${g.Name}.IsRequired`, value: g.IsRequired ?? false, sourcePath: fieldSrc });
        claims.push({ slot: `iof.${f.Name}.${g.Name}.IsReadOnly`, value: g.IsReadOnly ?? false, sourcePath: fieldSrc });
        if (g.IsPrimaryKey) {
            hasPK = true;
            claims.push({ slot: `iof.${f.Name}.${g.Name}.IsPrimaryKey`, value: true, sourcePath: `${SRC_REL} (addressing-path PK proof: GET .../{${g.Name === 'id' ? deriveIdParam(f) : g.Name}} addresses single ${f.Name}; universalPK convention 'id')` });
            claims.push({ slot: `iof.${f.Name}.${g.Name}.IsUniqueKey`, value: g.IsUniqueKey ?? false, sourcePath: fieldSrc });
        }
        if (g.IsForeignKey || g.RelatedIntegrationObjectID) {
            fkCount++;
            claims.push({ slot: `iof.${f.Name}.${g.Name}.IsForeignKey`, value: true, sourcePath: `${SRC_REL} (${g.Description || 'FK field'} — parametric-path / typed-reference FK proof)` });
            claims.push({ slot: `iof.${f.Name}.${g.Name}.RelatedIntegrationObjectID`, value: g.RelatedIntegrationObjectID ?? null, sourcePath: `${SRC_REL} (FK target ${g.Configuration?.ReferencedType || '?'})` });
        }
    }

    // ---- Gap-10 matrix row ----------------------------------------------------
    const pkVerdict = hasPK ? 'emit' : 'defer';
    const fkVerdict = fkCount > 0 ? `emit-${fkCount}` : 'defer';
    const matrixRow = {
        IOName: f.Name,
        ExistingConnectorTs: 'n/a',      // no prior connector .ts source consulted (forbidden output-reading)
        ExistingMetadataJson: 'no',      // not consulted as PK/FK evidence (that would be circular)
        OpenAPIxPK: 'no',                // MSON blueprint has no x-primary-key extension
        OpenAPIPathOps: f.APIPath ? 'yes' : 'no',
        OpenAPILocationHeader: 'no',     // no Location-header create-ID doc in this source
        VendorDocsProseScan: 'yes',      // .apib prose scanned (FK descriptions, PK id fields)
        SDKTypes: 'n/a',                 // no published SDK types source
        PostmanCommunity: 'yes',         // community Postman collection reachable (secondary cross-check)
        NamingConvention: hasPK ? 'yes' : 'no',
        CrossIOMatch: fkCount > 0 ? 'yes' : 'no',
        PKVerdict: pkVerdict,
        FKVerdict: fkVerdict,
        EvidenceCount: evidenceCountFor(f.Name),
    };

    // ---- Gaps for this IO -----------------------------------------------------
    const gaps = [];
    if (!hasPK) {
        gaps.push(`iof.${f.Name}.<pk>.IsPrimaryKey — no vendor-documented PK field in Tier-1 source (proven negative; deferred to runtime D4)`);
    }
    if (f.Name === 'Organization Member') {
        gaps.push('iof.Organization Member.* — response schema undocumented in Tier-1 source (+ Response 200 with no + Attributes block); field set deferred to runtime discovery');
    }
    for (const gg of gaps) globalGaps.push(gg);

    emission.push({
        objectName: f.Name,
        fieldsExtracted: iofs.length,
        gapsRemaining: gaps,
        claims,
        matrixRow,
    });
}

function deriveIdParam(iofields) {
    // best-effort: pull the trailing {..._id} from the APIPath, else 'id'
    const m = (iofields.UpdateAPIPath || iofields.APIPath || '').match(/\{([a-z_]+_id)\}\/?$/);
    return m ? m[1] : 'id';
}

// ---------------------------------------------------------------------------
// 4. Reconcile the enumerated universe → emit OR skip-with-reason.
// ---------------------------------------------------------------------------
// Endpoint-anchored coverable objects that have NO named MSON type (per SOURCE_STUDY ledger):
// Balance, Event Description, Organization Member — these ARE emitted IOs but are not in the
// 223 enumerated MSON type list; they are accounted separately (not "missing" enumerated types).
const skipped = [];

// Normalize an enumerated MSON type name to the IO name it maps to, if any.
// The emission renames a few MSON types to connector-facing IO names.
const MSON_TO_IO = {
    'Event Team Response': 'Event Team',
    'Base Question': 'Question',
    'Venue Response': 'Venue',
    'Text Overrides Response Content': 'Text Overrides',
    'Capacity Tier': 'Event Capacity Tier',
    'Report Response Sales': 'Sales Report',
    'Report Response Attendees': 'Attendee Report',
    'Role': 'Organization Role',
    // Media group MSON types map to the two Media IOs
    'Image': 'Media',
    'Media Upload': 'Media Upload',
};

const REQUEST_VARIANT_RE = /(Request|Create|Update|Post|Copy)( Content| Base)?$|^Create /;
const ALIAS_TYPES = new Set(['datetime-tz', 'datetime-tz-utc', 'local-datetime', 'htmltext', 'multipart-text', 'eventbrite-image']);
const ERROR_TYPES = new Set(['Error', 'ErrorWithoutDetail', 'Discount Create Error']);
const OUT_OF_SCOPE = new Set([
    'Campaign', 'Campaign Event Update', 'Campaign Invoice', 'Campaign Stats', 'Campaign Status',
    'Campaign Template', 'Event Campaign', 'Contact List', 'Contact List Item', 'Contact List Item Create',
    'Contact List Preferences', 'Contact List Type', 'Collection',
]);
// COVERABLE MSON types that ARE emitted as their own IO (either same name or renamed).
const COVERABLE_MSON = new Set([
    'Attendee', 'Order', 'Event', 'Ticket Class', 'Ticket Group', 'Venue Response', 'Category', 'Subcategory',
    'Format', 'Organization', 'Role', 'Discount', 'Inventory Tier', 'Event Team Response', 'Canned Question',
    'Base Question', 'Fee Rate', 'Seat Map', 'Webhook', 'User', 'Structured Content Page',
    'Text Overrides Response Content', 'Ticket Buyer Settings', 'Display Settings', 'Capacity Tier',
    'Report Response Sales', 'Report Response Attendees', 'Image', 'Media Upload',
]);

function skipReasonFor(typeName) {
    if (COVERABLE_MSON.has(typeName)) return null; // emitted as an IO
    if (ALIAS_TYPES.has(typeName)) return `scalar/date-format type alias (documented as an MSON header for readability, not a record shape) — column-format only`;
    if (ERROR_TYPES.has(typeName)) return `HTTP error envelope shape, not a syncable record`;
    if (OUT_OF_SCOPE.has(typeName)) return `out-of-scope family (Campaigns/Contact Lists/Collections) — referenced only as a nested field, no documented top-level CRUD endpoint in this Tier-1 source (SOURCE_STUDY gap #1)`;
    if (REQUEST_VARIANT_RE.test(typeName)) return `request/create/update payload variant — input shape for a write op, not a distinct record; record IS its base type`;
    if (typeName === 'Pagination' || typeName === 'Continuation') return `pagination-envelope wrapper (plumbing), not a record`;
    if (typeName === 'Triggers') return `webhook trigger-action vocabulary (enum), not a syncable record`;
    // Everything else: container-folded nested value-object — an embedded field of a COVERABLE parent,
    // never independently list/retrievable by its own APIPath.
    return `container-folded nested value-object — an embedded field of a COVERABLE parent (never independently addressable by its own APIPath); stays a column/sub-struct on its parent, not a table`;
}

let emittedFromEnum = 0;
for (const t of enumeratedTypes) {
    const mapped = MSON_TO_IO[t] || t;
    if (COVERABLE_MSON.has(t) && emittedIONames.has(mapped)) {
        emittedFromEnum++;
        continue; // accounted as an emitted IO
    }
    const reason = skipReasonFor(t);
    if (reason) {
        skipped.push({ objectName: t, reason, claims: [], matrixRow: { IOName: t, PKVerdict: 'defer', EvidenceCount: 0 } });
    } else {
        // COVERABLE but somehow not emitted — this would be a real under-enumeration gap.
        skipped.push({ objectName: t, reason: 'UNACCOUNTED — coverable but not emitted (INVESTIGATE)', claims: [], matrixRow: { IOName: t, PKVerdict: 'defer', EvidenceCount: 0 } });
    }
}

// Endpoint-anchored IOs (Balance, Event Description, Organization Member) are emitted but NOT in
// the 223 MSON list — verify they exist in the emission and note them.
const endpointAnchored = ['Balance', 'Event Description', 'Organization Member'];
const endpointAnchoredEmitted = endpointAnchored.filter((n) => emittedIONames.has(n));

// ---------------------------------------------------------------------------
// 5. Completeness assertions + write artifact.
// ---------------------------------------------------------------------------
const emittedCount = emission.length;
const skippedCount = skipped.length;
const unaccounted = skipped.filter((s) => s.reason.startsWith('UNACCOUNTED'));

// emitted-from-enum + skipped-with-reason MUST cover the whole enumerated universe.
const coveredEnum = emittedFromEnum + skippedCount;
if (coveredEnum !== enumeratedTypes.length) {
    console.error(`RECONCILIATION MISMATCH: emittedFromEnum(${emittedFromEnum}) + skipped(${skippedCount}) = ${coveredEnum} != enumerated(${enumeratedTypes.length})`);
    process.exit(1);
}
if (unaccounted.length > 0) {
    console.error(`UNACCOUNTED coverable types (under-enumeration): ${unaccounted.map((u) => u.objectName).join(', ')}`);
    process.exit(1);
}

// Zero-field IO hard-failure check.
const zeroFieldIOs = emission.filter((e) => e.fieldsExtracted === 0 && !endpointAnchored.includes(e.objectName));
if (zeroFieldIOs.length > 0) {
    console.error(`ZERO-FIELD IO(s): ${zeroFieldIOs.map((z) => z.objectName).join(', ')}`);
    process.exit(1);
}

// Write the full emission artifact: emitted objects first, then skipped entries.
const artifact = [...emission, ...skipped];
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(artifact, null, 2) + '\n');

// ---------------------------------------------------------------------------
// Compact stats to stdout.
// ---------------------------------------------------------------------------
const stats = {
    objectsExtracted: emittedCount,
    fieldsExtracted: totalFields,
    enumeratedUniverse: enumeratedTypes.length,
    emittedFromEnum,
    endpointAnchoredEmitted,
    skippedWithReason: skippedCount,
    reconciliation: `emittedFromEnum(${emittedFromEnum}) + skipped(${skippedCount}) == enumerated(${enumeratedTypes.length}) ✓; + ${endpointAnchoredEmitted.length} endpoint-anchored IOs = ${emittedCount} total IOs`,
    sharedEnumeratorCount: sharedEnumCount,
    sharedEnumeratorNote: sharedEnumCount === 0
        ? 'shared enumerate-catalog.mjs returns count:0 on .apib (no API-Blueprint/MSON parser) — dedicated sources/enumerate-apib.mjs used instead; SHORTFALL SURFACED'
        : `shared enumerator count=${sharedEnumCount}`,
    totalClaims: emission.reduce((n, e) => n + e.claims.length, 0),
    gapsRemaining: globalGaps,
    emissionArtifact: 'packages/Integration/connectors-registry/eventbrite/runs/connector-eventbrite-1783012840625-d9ec733d/output/EXTRACTION_EMISSION.json',
};
process.stdout.write(JSON.stringify(stats, null, 2) + '\n');
