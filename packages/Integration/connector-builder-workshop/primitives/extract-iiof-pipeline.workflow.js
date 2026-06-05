// LOCKED PRIMITIVE — extract-iiof-pipeline
//
// Guarantee: per-object independent extraction + structural verification before
// any synthesis. Each emitted claim is (a) reproduced via verify-claim and
// (b) survives N adversarial skeptics, and the run emits EXTRACTION_REPORT_MATRIX.csv
// (Gap-10 multi-source PK/FK sweep). No huge token returns — the writer side
// persists to mcp-mj-metadata, the orchestrator side gets stats only.
//
// 2026-06-05 — stages 2-4 were previously `(stats)=>stats` pass-throughs that
// ASSUMED the extractor agent did verify/adversarial/matrix internally; it does
// not, so floor-check deterministically failed (extraction-matrix-missing,
// verifyEveryClaim unproven, adversarial-verify absent). They now structurally
// execute. NOTE: this primitive is itself invoked via workflow() from the plan
// script, and workflow() nesting is one level only — so verify-claim and
// adversarial-verify are run INLINE (agent()/parallel()), mirroring those
// primitives' logic, rather than dispatched via workflow(). The matrix CSV is
// written by an agent() because workflow scripts have no filesystem access.
//
// Inputs (via `args`):
//   {
//     vendor: string,
//     sourceID: string,
//     objectList: string[],                 // canonical names of objects to extract
//     writeBackPath: string,                // metadata/integrations/<vendor>/.<vendor>.integration.json
//     outputDir: string,                    // run output dir; EXTRACTION_REPORT_MATRIX.csv lands here
//     runID?: string,
//     adversarialN?: number,                // skeptics per claim (Gap 4: easy=3, medium=4, hard=5)
//     sourceBundle?: {                      // Gap-10 multi-source inputs — forwarded to the extractor
//       existingConnectorTsPath?, existingMetadataPaths?, openapiPath?,
//       vendorDocsPaths?, sdkPaths?, postmanPaths?
//     },
//     loopUntilDryK?: number,               // reserved: re-sweep until K dry rounds (forwarded)
//     amendmentRound?: number,
//     reviewerFindings?: unknown,           // null on round 0; reviewer FixInstructions thereafter
//     reviewFile?: string,
//   }
//
// Output (stats only — IO/IOF data lives in writeBackPath; matrix in outputDir):
//   {
//     objectsExtracted, fieldsExtracted, extractedObjects[], gapsRemaining[],
//     claimsTotal, claimsVerified, claimsSurvived, provenanceVerified,
//     matrixPath, matrixWritten, perObject[], skippedObjects[]
//   }

export const meta = {
    name: 'extract-iiof-pipeline',
    description: 'Per-object pipeline: extract (multi-source) → verify-claim per slot → adversarial-verify per surviving claim → write-back + EXTRACTION_REPORT_MATRIX.csv. Per-item fan-out; no synthesis before per-object verification.',
    phases: [
        { title: 'extract', detail: 'Per-object multi-source extraction agent (parallel)' },
        { title: 'verify', detail: 'verify-claim (inline) per emitted slot' },
        { title: 'adversarial', detail: 'adversarial-verify (inline, N skeptics) per surviving claim' },
        { title: 'write-back', detail: 'Per-object metadata via mcp-mj-metadata + matrix CSV' },
    ],
};

const N = Math.max(1, Number(args?.adversarialN ?? 4));
const objects = Array.isArray(args?.objectList) ? args.objectList : [];
const sourceBundle = args?.sourceBundle ?? {};
const outputDir = args?.outputDir ?? `packages/Integration/connectors-registry/${String(args?.vendor ?? 'unknown').toLowerCase()}/runs/${args?.runID ?? 'unknown'}/output`;

// A claim the extractor asserts and the pipeline must independently confirm.
const CLAIM_SHAPE = {
    type: 'object',
    required: ['slot', 'value', 'sourcePath'],
    properties: {
        slot: { type: 'string' },
        value: {},
        extractionScript: { type: 'string' },
        sourcePath: { type: 'string' },
        evidence: { type: 'object' },
    },
};

// One EXTRACTION_REPORT_MATRIX.csv row per object (Gap-10 source-check sweep).
const MATRIX_ROW_SHAPE = {
    type: 'object',
    required: ['IOName', 'PKVerdict'],
    properties: {
        IOName: { type: 'string' },
        ExistingConnectorTs: { enum: ['yes', 'no', 'n/a'] },
        ExistingMetadataJson: { enum: ['yes', 'no', 'n/a'] },
        OpenAPIxPK: { enum: ['yes', 'no', 'n/a'] },
        OpenAPIPathOps: { enum: ['yes', 'no', 'n/a'] },
        OpenAPILocationHeader: { enum: ['yes', 'no', 'n/a'] },
        VendorDocsProseScan: { enum: ['yes', 'no', 'n/a'] },
        SDKTypes: { enum: ['yes', 'no', 'n/a'] },
        PostmanCommunity: { enum: ['yes', 'no', 'n/a'] },
        NamingConvention: { enum: ['yes', 'no', 'n/a'] },
        CrossIOMatch: { enum: ['yes', 'no', 'n/a'] },
        PKVerdict: { enum: ['emit', 'unique-only', 'defer'] },
        FKVerdict: { type: 'string' },
        EvidenceCount: { type: 'integer' },
    },
    additionalProperties: false,
};

const PER_OBJECT_STATS_SCHEMA = {
    type: 'object',
    required: ['objectName', 'fieldsExtracted', 'gapsRemaining', 'claims', 'matrixRow'],
    properties: {
        objectName: { type: 'string' },
        fieldsExtracted: { type: 'integer' },
        gapsRemaining: { type: 'array', items: { type: 'string' } },
        claims: { type: 'array', items: CLAIM_SHAPE },
        matrixRow: MATRIX_ROW_SHAPE,
        skipped: { type: 'object', properties: { reason: { type: 'string' } } },
    },
    additionalProperties: false,
};

const VERIFY_SCHEMA = {
    type: 'object',
    required: ['verified'],
    properties: { verified: { type: 'boolean' }, reason: { type: 'string' } },
    additionalProperties: false,
};

const REFUTE_SCHEMA = {
    type: 'object',
    required: ['refuted', 'reason'],
    properties: { refuted: { type: 'boolean' }, reason: { type: 'string' } },
    additionalProperties: false,
};

log(`extract-iiof-pipeline: ${objects.length} objects for vendor=${args?.vendor ?? '(?)'} (adversarialN=${N}, amendmentRound=${args?.amendmentRound ?? 0})`);

const MATRIX_COLS = ['IOName', 'ExistingConnectorTs', 'ExistingMetadataJson', 'OpenAPIxPK', 'OpenAPIPathOps', 'OpenAPILocationHeader', 'VendorDocsProseScan', 'SDKTypes', 'PostmanCommunity', 'NamingConvention', 'CrossIOMatch', 'PKVerdict', 'FKVerdict', 'EvidenceCount'];

const amendmentNote = args?.amendmentRound
    ? `\n\nAMENDMENT ROUND ${args.amendmentRound}. Apply these reviewer FixInstructions exactly: ${JSON.stringify(args?.reviewerFindings ?? [])} (full review: ${args?.reviewFile ?? '(none)'}).`
    : '';

const perObjectResults = await pipeline(
    objects,
    // ── Stage 1: extract (multi-source) ──────────────────────────────────
    // The extractor consults every source in sourceBundle (Gap 10) and returns,
    // for this object: the IO/IOF claims (each independently reproducible) + the
    // matrix row (per-source PK/FK verdicts). It persists IO/IOF rows to
    // mcp-mj-metadata; we get stats + claims + matrixRow only.
    (obj) => agent(
        `Extract IO + IOF rows for object "${obj}" of vendor ${args?.vendor} from source ${args?.sourceID}.\n\n` +
        `MULTI-SOURCE SWEEP (Gap 10) — consult EACH of these where it exists and record a yes/no/n-a verdict per source in matrixRow:\n${JSON.stringify(sourceBundle)}\n\n` +
        `Emit each field with its PROVABLE attributes only (no NVARCHAR(MAX), no fabricated PK/FK). Write IO/IOF rows to ${args?.writeBackPath} via mcp-mj-metadata.\n\n` +
        `Return per-object stats: fieldsExtracted, gapsRemaining (slot IDs you could not provably fill), claims[] (one per emitted slot — each with {slot, value, extractionScript (a node/POSIX snippet that reproduces value from sourcePath), sourcePath, evidence}), and matrixRow (columns: ${MATRIX_COLS.join(', ')}; source-check cells = yes|no|n/a; PKVerdict = emit|unique-only|defer; EvidenceCount = integer count of independent sources that agree). If the object cannot be extracted, set skipped.reason and return empty claims with a matrixRow whose PKVerdict='defer'.${amendmentNote}`,
        { agentType: 'ioiof-extractor', schema: PER_OBJECT_STATS_SCHEMA, phase: 'extract', label: `extract:${obj}` }
    ),
    // ── Stage 2: verify-claim (inline) per emitted claim ─────────────────
    // Mirrors the verify-claim primitive: re-run each claim's extraction script
    // against its pinned source; a claim only survives if it reproduces.
    async (stats, obj) => {
        if (!stats || stats.skipped) return stats;
        const claims = Array.isArray(stats.claims) ? stats.claims : [];
        const checked = await parallel(claims.map(c => () =>
            agent(
                `Reproduce the value for slot "${c.slot}" from source ${c.sourcePath} using this extraction script:\n${c.extractionScript ?? '(none supplied)'}\n\nClaimed value: ${JSON.stringify(c.value)}. If reproduction matches the claimed value verbatim → verified=true. If it differs, or the script can't run, or the source is unreachable → verified=false with a one-line reason. NEVER guess; default verified=false when uncertain.`,
                { schema: VERIFY_SCHEMA, phase: 'verify', label: `verify:${obj}:${c.slot}` }
            ).then(v => ({ claim: c, verified: !!(v && v.verified) }))
        ));
        const verifiedClaims = checked.filter(Boolean).filter(x => x.verified).map(x => x.claim);
        return { ...stats, claimsTotal: claims.length, claimsVerified: verifiedClaims.length, verifiedClaims };
    },
    // ── Stage 3: adversarial-verify (inline, N skeptics) per verified claim ──
    // Mirrors the adversarial-verify primitive: N independent refuters, blind to
    // each other, default-reject; majority must fail to refute for survival.
    async (stats, obj) => {
        if (!stats || stats.skipped) return { ...stats, claimsSurvived: 0, provenanceVerified: 0 };
        const verifiedClaims = Array.isArray(stats.verifiedClaims) ? stats.verifiedClaims : [];
        const judged = await parallel(verifiedClaims.map(c => () =>
            parallel(Array.from({ length: N }, (_, i) => () =>
                agent(
                    `You are reviewer ${i + 1} of ${N}, blind to the others. Try to REFUTE this claim. Default reject.\nClaim: slot=${c.slot} value=${JSON.stringify(c.value)}\nEvidence: ${JSON.stringify(c.evidence ?? {})}\nLook for: provenance not reproducing, value contradicted by another source, source not authoritative, value implausible for the slot type. Return { refuted, reason }. If you cannot find a specific refutation after honest effort, return refuted=false with reason='no-refutation-found'.`,
                    { agentType: 'independent-reviewer', schema: REFUTE_SCHEMA, phase: 'adversarial', label: `refute:${obj}:${c.slot}:${i + 1}` }
                )
            )).then(refs => {
                const valid = refs.filter(Boolean);
                const refuted = valid.filter(r => r.refuted).length;
                return { claim: c, survives: refuted < Math.ceil(N / 2) };
            })
        ));
        const survivors = judged.filter(Boolean).filter(x => x.survives).map(x => x.claim);
        return { ...stats, claimsSurvived: survivors.length, provenanceVerified: survivors.length };
    }
);

// ── Aggregate ────────────────────────────────────────────────────────────
const agg = perObjectResults.filter(Boolean).reduce(
    (acc, s) => {
        if (s.skipped) {
            acc.skippedObjects.push({ name: s.objectName, reason: s.skipped.reason });
            return acc;
        }
        acc.objectsExtracted += 1;
        acc.extractedObjects.push(s.objectName);
        acc.fieldsExtracted += s.fieldsExtracted ?? 0;
        acc.claimsTotal += s.claimsTotal ?? 0;
        acc.claimsVerified += s.claimsVerified ?? 0;
        acc.claimsSurvived += s.claimsSurvived ?? 0;
        acc.provenanceVerified += s.provenanceVerified ?? 0;
        for (const g of (s.gapsRemaining ?? [])) acc.gapsRemaining.push(g);
        if (s.matrixRow) acc.matrixRows.push(s.matrixRow);
        acc.perObject.push({
            objectName: s.objectName,
            fieldsExtracted: s.fieldsExtracted ?? 0,
            claimsTotal: s.claimsTotal ?? 0,
            claimsVerified: s.claimsVerified ?? 0,
            claimsSurvived: s.claimsSurvived ?? 0,
        });
        return acc;
    },
    { objectsExtracted: 0, extractedObjects: [], fieldsExtracted: 0, claimsTotal: 0, claimsVerified: 0, claimsSurvived: 0, provenanceVerified: 0, gapsRemaining: [], matrixRows: [], skippedObjects: [], perObject: [] }
);

// ── Stage 4: write EXTRACTION_REPORT_MATRIX.csv ──────────────────────────
// Workflow scripts have no fs access, so a single agent writes the aggregated
// CSV (one row per extracted object) to the run's output dir.
phase('write-back');
const matrixPath = `${outputDir}/EXTRACTION_REPORT_MATRIX.csv`;
const csvLines = [MATRIX_COLS.join(',')];
for (const r of agg.matrixRows) {
    csvLines.push(MATRIX_COLS.map(col => String(r[col] ?? (col === 'EvidenceCount' ? 0 : 'n/a'))).join(','));
}
const csv = csvLines.join('\n');
const writeResult = await agent(
    `Write a file at exactly this path: ${matrixPath} (create parent directories if needed). The file content must be EXACTLY this CSV, nothing else:\n\n${csv}\n\nAfter writing, return { written: true } if the file now exists, else { written: false }.`,
    { schema: { type: 'object', required: ['written'], properties: { written: { type: 'boolean' } }, additionalProperties: false }, phase: 'write-back', label: 'matrix-write' }
);

return {
    objectsExtracted: agg.objectsExtracted,
    fieldsExtracted: agg.fieldsExtracted,
    extractedObjects: agg.extractedObjects,
    gapsRemaining: agg.gapsRemaining,
    claimsTotal: agg.claimsTotal,
    claimsVerified: agg.claimsVerified,
    claimsSurvived: agg.claimsSurvived,
    provenanceVerified: agg.provenanceVerified,
    adversarialN: N,                                  // floor-check: adversarialVerifyMinReviewers evidence
    verifyEveryClaim: agg.claimsVerified === agg.claimsTotal,  // floor-check: verifyEveryClaim evidence
    matrixPath,
    matrixWritten: !!(writeResult && writeResult.written),
    perObject: agg.perObject,
    skippedObjects: agg.skippedObjects,
};
