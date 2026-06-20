// LOCKED PRIMITIVE — floor-check
//
// Guarantee: the FINAL structural gate. Iterates the bijection slot table
// (`floor/phase0-slots.json`) and verifies that for every slot:
//   1. An emission exists (the run journal records an agent producer for it).
//   2. The emission has provenance (verify-claim ran and succeeded).
//   3. The value is non-null OR the slot is nullable.
// Also verifies the minimum-thoroughness manifest's structural declarations met,
// the EXTRACTION_REPORT_MATRIX.csv coverage / PK-defer rate, the source-diff
// closure, the code build cleanliness + connector file existence, and the
// verification ladder (no red rung; claimed tier reached).
//
// MECHANICAL GATE (2026-06-05 rewrite): the pass/fail DECISION is computed in JS,
// NOT returned by an LLM. Agents are used ONLY to fetch raw bytes (`cat` the slots
// file + matrix CSV) and run a deterministic existence check (`test -f` the
// connector file). Every failure is pushed to `failures[]` in JS; `pass` is
// `failures.length === 0`, computed in JS. The single agent that remains makes
// ONLY genuinely-fuzzy slot-applicability judgments — never the final verdict.
//
// REMOVED (2026-06-05): live-e2e / dual-dialect / 2^N-write enforcement. Live
// testing is now read-only only, so floor-check NO LONGER fails a run for missing
// write/bidirectional/live-mutation/dual-dialect phases. The e2eLivePhases table
// still lives in the slots file but is no longer iterated here.
//
// `pass: false` → run rejected, output NOT promoted to a connector PR.
//
// Done is structural. Agent cannot declare done.
//
// Inputs:
//   {
//     runID: string,
//     vendor: string,
//     slotsPath: string,                    // workshop/floor/phase0-slots.json
//     manifest: object,                     // planner's minimumThoroughnessManifest
//     journal: object,                      // run journal (events.jsonl summary)
//   }
//
//   journal shape consumed here:
//     {
//       // NO slotEmissions — slots are verified against the REAL .integration.json on disk,
//       // NOT a self-reported journal map (that map was never populated → universal false-fail).
//       vendorSlug?, metadataFile?, provenanceFile?, codeEvidenceFile?,  // optional path overrides
//       extractStats?: { matrixPath, objectsExtracted, extractedObjects[] },
//       sourceDiff?: { missing: string[] },
//       codeResult?: { BuildClean: boolean, ConnectorFile: string },
//       ladder?: { tierResults: [{tier,status}], achievedTier: string },
//     }
//
// Output:
//   {
//     pass: boolean,
//     failures: Array<{rule, slot?, detail}>,
//     summary: { totalSlots, filled, verified, nullableSkipped, gapsResidual },
//   }

export const meta = {
    name: 'floor-check',
    description: 'Final gate. JS-computed: iterates Phase 0 bijection slot table; checks manifest, matrix coverage/PK-defer, source-diff closure, build cleanliness + connector file, and ladder. Agent only fetches raw bytes / runs test -f.',
    phases: [
        { title: 'load-bijection', detail: 'Agent cats slots file + matrix CSV; JS parses' },
        { title: 'iterate-slots', detail: 'JS verifies every slot has emission + provenance + non-null-or-nullable' },
        { title: 'manifest-check', detail: 'JS verifies manifest declarations, matrix, source-diff, build, ladder' },
        { title: 'verdict', detail: 'JS aggregates failures[] -> pass' },
    ],
};

const FLOOR_VERDICT_SCHEMA = {
    type: 'object',
    required: ['pass', 'failures', 'summary'],
    properties: {
        pass: { type: 'boolean' },
        failures: {
            type: 'array',
            items: {
                type: 'object',
                required: ['rule', 'detail'],
                properties: {
                    rule: {
                        enum: [
                            'slots-file-unreadable',
                            'metadata-file-unreadable',
                            'slot-not-filled',
                            'slot-not-verified',
                            'unprovable-required',
                            'every-claim-verified',
                            'source-diff-closed',
                            'no-unprovable-asserted',
                            'manifest-extractEveryIO',
                            'manifest-verifyEveryClaim',
                            'e2e-tier-met',
                            'min-adversarial-reviewers-met',
                            'test-data-not-wiped',
                            'build-not-clean',
                            'connector-file-missing',
                            'ladder-rung-red',
                            'ladder-tier-not-reached',
                            // Gap 10 revised — multi-source PK/FK enforcement
                            'pk-defer-rate-too-high',          // >50% IOs have PKVerdict=defer
                            'extraction-matrix-missing',        // EXTRACTION_REPORT_MATRIX.csv absent
                            'extraction-matrix-row-missing',    // matrix has fewer rows than emitted IOs
                            // Credential-type bijection (plan §E1) — the referenced cred type's
                            // schema keys must cover what the connector's ConnectionConfig reads.
                            'credential-type-key-mismatch',
                            // Discovery must be dynamic — DiscoverObjects/DiscoverFields may not
                            // return a frozen catalog (the PropFuel 3-stream clamp).
                            'discovery-hardcoded',
                            // Catalogs/constraints (field lists, PK/required/type) belong in
                            // METADATA, never baked as constants in the connector code.
                            'catalog-in-code',
                            // The extractor seeds STATIC metadata from credential-free sources only;
                            // it must NOT read the connector (output) / dist / archive / prior metadata
                            // / auth-gated data as a source (the circular-source defect).
                            'extractor-reads-output',
                            // The build is credential-free: the plan must not condition discovery /
                            // the object set on credential availability (live-sample-at-build).
                            'credential-used-at-build',
                            // An IOF RelatedIntegrationObjectID @lookup must qualify the sibling-object
                            // lookup with &IntegrationID=@parent:IntegrationID (the integration id). The
                            // wrong &IntegrationID=@parent:ID resolves to the IO's OWN id, matches no
                            // sibling, and rolls back mj sync push (the iMIS/GrowthZone deploy defect).
                            'fk-lookup-qualifier-wrong',
                            // An IO declares a capability flag (SupportsCreate/Update/Delete/IncrementalSync)
                            // while its required per-operation columns are blank -> the generic CRUD path
                            // THROWS at runtime. Capability flag set requires its required column set populated.
                            'bijection-violation',
                            // The object dependency DAG must be complete over ALL objects: an FK to a
                            // non-emitted object (dangling) or a hard-@lookup cycle (push rolls back) breaks
                            // the full sync, which runs every object — a subset DAG proves nothing.
                            'dag-incomplete',
                        ],
                    },
                    slot: { type: 'string' },
                    detail: { type: 'string' },
                },
            },
        },
        summary: {
            type: 'object',
            required: ['totalSlots', 'filled', 'verified'],
            properties: {
                totalSlots: { type: 'integer' },
                filled: { type: 'integer' },
                verified: { type: 'integer' },
                nullableSkipped: { type: 'integer' },
                gapsResidual: { type: 'integer' },
            },
        },
    },
    additionalProperties: false,
};

// Schema for the byte-fetcher agent: it ONLY cats files + runs test -f. No verdict.
const RAW_FETCH_SCHEMA = {
    type: 'object',
    required: ['slotsContent', 'connectorFileExists'],
    properties: {
        slotsContent: { type: 'string' },        // verbatim bytes of the slots JSON file ('' if unreadable)
        slotsReadable: { type: 'boolean' },
        matrixContent: { type: 'string' },        // verbatim bytes of EXTRACTION_REPORT_MATRIX.csv ('' if absent)
        matrixReadable: { type: 'boolean' },      // false when the file does not exist
        connectorFileExists: { type: 'boolean' }, // result of `test -f <ConnectorFile>` (exit 0 => true)
        metadataContent: { type: 'string' },      // verbatim bytes of the .integration.json metadata file ('' if absent)
        metadataReadable: { type: 'boolean' },    // false when the metadata file does not exist
        provenanceContent: { type: 'string' },    // verbatim bytes of PROVENANCE.json ('' if absent)
        codeEvidenceContent: { type: 'string' },  // verbatim bytes of CODE_EVIDENCE.json ('' if absent)
        connectorContent: { type: 'string' },     // verbatim bytes of the connector .ts ('' if absent) — for ConnectionConfig key extraction
        credTypesContent: { type: 'string' },     // verbatim bytes of metadata/credential-types/.credential-types.json
        credSchemasBundle: { type: 'string' },    // all credential-type schema files, each preceded by '@@@FILE:<path>@@@'
        extractorScriptContent: { type: 'string' }, // all extractor scripts under connectors-registry/<vendor>/scripts/ concatenated ('' if none)
        planContent: { type: 'string' },          // the planner-emitted plans/<vendor>.workflow.js ('' if absent)
        enumerateCatalogJson: { type: 'string' }, // stdout of the DETERMINISTIC record-type enumerator run over the source artifact(s) ('' if no source)
        fkLookupQualifierJson: { type: 'string' }, // stdout of fk-lookup-qualifier.mjs over the metadata file — IOF FK @lookup-qualifier check ('' if it errors)
        bijectionJson: { type: 'string' }, // stdout of graders/bijection.mjs over the metadata file — capability<->per-operation-column bijection ('' if it errors)
        dagJson: { type: 'string' }, // stdout of graders/dag-completeness.mjs over the metadata file — dependency-DAG completeness over ALL objects ('' if it errors)
    },
    additionalProperties: false,
};

const runID = args?.runID ?? '(?)';
const vendor = args?.vendor ?? '(?)';
const slotsPath = args?.slotsPath ?? 'workshop/floor/phase0-slots.json';
const manifest = args?.manifest ?? {};
const journal = args?.journal ?? {};
const extractStats = journal.extractStats ?? {};
const matrixPath = extractStats.matrixPath ?? '';
const codeResult = journal.codeResult ?? {};
const connectorFile = codeResult.ConnectorFile ?? '';

// ── Real on-disk artifact paths (2026-06-07) — floor-check verifies these, NOT a journal map. ──
// The metadata FILE is the deliverable the producers actually write (via the mj-metadata MCP
// upserts). Derive the canonical paths from the vendor slug; allow journal overrides.
const vendorSlug = String(journal.vendorSlug ?? vendor).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const metadataFile = journal.metadataFile ?? `metadata/integrations/${vendorSlug}/.${vendorSlug}.integration.json`;
const provenanceFile = journal.provenanceFile ?? `packages/Integration/connectors-registry/${vendorSlug}/PROVENANCE.json`;
const codeEvidenceFile = journal.codeEvidenceFile ?? `packages/Integration/connectors-registry/${vendorSlug}/CODE_EVIDENCE.json`;

phase('load-bijection');
log(`floor-check: runID=${runID} vendor=${vendor}`);

// ── Scope-sanity universe anchor: the source artifact(s) the DETERMINISTIC enumerator reads.
// The universe count must come from the floor RUNNING enumerate-catalog.mjs over these — NEVER
// from a self-reported journal integer (the agent that collapsed the scope cannot be trusted to
// report how big the real universe was). Union across every authoritative source the run captured.
const enumSourcePaths = [
    journal.sources?.SourcesFile,
    ...(Array.isArray(journal.sources?.VendorDocsPaths) ? journal.sources.VendorDocsPaths : []),
    ...(Array.isArray(journal.sources?.SDKPaths) ? journal.sources.SDKPaths : []),
].filter((p) => typeof p === 'string' && p.trim() !== '');
const enumPathArgs = enumSourcePaths.map((p) => `'${p.replace(/'/g, "'\\''")}'`).join(' ');

// ── Agent fetches RAW BYTES only — cat slots, cat matrix, test -f connector, run the deterministic enumerator. ──
const fetched = await agent(
    `You are a NON-JUDGING file reader for connector run ${runID} (vendor=${vendor}). Run these Bash commands and return ONLY their raw output. Make NO judgment about pass/fail.\n\n` +
        `1. \`cat ${slotsPath}\` -> return its VERBATIM bytes as slotsContent (set slotsReadable=true; on error '' + slotsReadable=false).\n` +
        (matrixPath
            ? `2. If \`test -f ${matrixPath}\` exits 0, \`cat ${matrixPath}\` -> matrixContent (matrixReadable=true). If the file does NOT exist, return matrixContent='' and matrixReadable=false.\n`
            : `2. No matrix path provided: return matrixContent='' and matrixReadable=false.\n`) +
        (connectorFile
            ? `3. Run \`test -f ${connectorFile} && echo EXISTS || echo MISSING\` -> set connectorFileExists=true ONLY if it printed EXISTS.\n`
            : `3. No connector file path provided: return connectorFileExists=false.\n`) +
        `4. If \`test -f ${metadataFile}\` exits 0, \`cat ${metadataFile}\` -> metadataContent (metadataReadable=true). Else metadataContent='' and metadataReadable=false.\n` +
        `5. If \`test -f ${provenanceFile}\` exits 0, \`cat ${provenanceFile}\` -> provenanceContent. Else provenanceContent=''.\n` +
        `6. If \`test -f ${codeEvidenceFile}\` exits 0, \`cat ${codeEvidenceFile}\` -> codeEvidenceContent. Else codeEvidenceContent=''.\n` +
        (connectorFile
            ? `7. \`cat ${connectorFile}\` -> connectorContent (the connector .ts source; '' on error).\n`
            : `7. No connector file: connectorContent=''.\n`) +
        `8. \`cat metadata/credential-types/.credential-types.json\` -> credTypesContent ('' if absent).\n` +
        `9. Run \`for f in metadata/credential-types/schemas/*.json; do echo "@@@FILE:$f@@@"; cat "$f"; done\` -> credSchemasBundle (each schema preceded by its @@@FILE marker; '' if none).\n` +
        `10. Run \`for f in packages/Integration/connectors-registry/${vendorSlug}/scripts/*.ts packages/Integration/connectors-registry/${vendorSlug}/scripts/*.mjs; do [ -f "$f" ] && { echo "@@@FILE:$f@@@"; cat "$f"; }; done\` -> extractorScriptContent ('' if none).\n` +
        `11. \`cat packages/Integration/connector-builder-workshop/plans/${vendorSlug}.workflow.js\` -> planContent ('' if absent).\n` +
        (enumPathArgs
            ? `12. Run \`node packages/Integration/connector-builder-workshop/floor/enumerate-catalog.mjs ${enumPathArgs}\` -> return its stdout VERBATIM as enumerateCatalogJson (deterministic record-type enumeration; '' if it errors). This is a fixed script — run it exactly, do not edit its output.\n`
            : `12. No source artifact paths available: return enumerateCatalogJson=''.\n`) +
        `13. If \`test -f ${metadataFile}\` exits 0, run \`node packages/Integration/connector-builder-workshop/floor/fk-lookup-qualifier.mjs ${metadataFile} --json\` -> return its stdout VERBATIM as fkLookupQualifierJson (deterministic IOF FK @lookup-qualifier check — flags &IntegrationID=@parent:ID, which must be @parent:IntegrationID; '' if it errors or the file is absent). Fixed script — run it exactly, do not edit its output.\n` +
        `14. If \`test -f ${metadataFile}\` exits 0, run \`node packages/Integration/connector-builder-workshop/floor/graders/bijection.mjs ${metadataFile} --json\` -> return its stdout VERBATIM as bijectionJson (deterministic capability<->per-operation-column bijection — flags an IO whose SupportsCreate/Update/Delete/IncrementalSync is set while its required columns are blank; '' if it errors or the file is absent). Fixed script — run it exactly, do not edit its output.\n` +
        `15. If \`test -f ${metadataFile}\` exits 0, run \`node packages/Integration/connector-builder-workshop/floor/graders/dag-completeness.mjs ${metadataFile} --json\` -> return its stdout VERBATIM as dagJson (deterministic dependency-DAG completeness over ALL objects — flags a dangling FK to a non-emitted object or a hard-@lookup cycle that would roll the push back; '' if it errors or the file is absent). Fixed script — run it exactly, do not edit its output.\n` +
        `\nDo not interpret, summarize, or validate any content. Return { slotsContent, slotsReadable, matrixContent, matrixReadable, connectorFileExists, metadataContent, metadataReadable, provenanceContent, codeEvidenceContent, connectorContent, credTypesContent, credSchemasBundle, extractorScriptContent, planContent, enumerateCatalogJson, fkLookupQualifierJson, bijectionJson, dagJson }.`,
    { agentType: 'independent-reviewer', schema: RAW_FETCH_SCHEMA, phase: 'load-bijection', label: `floor-fetch:${runID}` }
);

// ── Everything below is JS. The agent contributed only raw bytes. ──
const failures = [];

// Parse the slots file in JS.
let slots = [];
if (!fetched || !fetched.slotsReadable || typeof fetched.slotsContent !== 'string' || fetched.slotsContent.trim().length === 0) {
    failures.push({ rule: 'slots-file-unreadable', detail: `could not read slots file at ${slotsPath}` });
} else {
    try {
        const parsed = JSON.parse(fetched.slotsContent);
        slots = Array.isArray(parsed?.slots) ? parsed.slots : [];
        if (slots.length === 0) {
            failures.push({ rule: 'slots-file-unreadable', detail: 'slots file parsed but contained no slots[]' });
        }
    } catch (e) {
        failures.push({ rule: 'slots-file-unreadable', detail: `slots file is not valid JSON: ${String(e && e.message ? e.message : e)}` });
    }
}

phase('iterate-slots');
// ── Per-slot structural verification against the REAL on-disk artifact (2026-06-07 rewrite). ──
// PREVIOUSLY this read `journal.slotEmissions` — a per-slot {producer,value,verified} map that
// NO producer and NO plan ever populated, so `slotEmissions` was always {} and every non-fixed
// slot failed 'slot-not-filled: no producer emission recorded in journal' on EVERY run, no matter
// how complete the connector was. The metadata is actually written to the .integration.json file
// on disk (via the mj-metadata MCP upserts) — THAT file is the deliverable, so THAT is what we
// verify. Value-presence is checked for every required slot; source-EVIDENCE is demanded only for
// the dangerous, actually-asserted structural constraints (PK / FK / CredentialTypeID) whose
// fabrication loses real records (§0b), at the per-IO/per-IOF granularity the producers emit.
let metaRoot = null;
if (!fetched || !fetched.metadataReadable || typeof fetched.metadataContent !== 'string' || fetched.metadataContent.trim().length === 0) {
    failures.push({ rule: 'metadata-file-unreadable', detail: `could not read metadata file at ${metadataFile}` });
} else {
    try {
        const parsedMeta = JSON.parse(fetched.metadataContent);
        metaRoot = Array.isArray(parsedMeta) ? (parsedMeta[0] ?? null) : parsedMeta;
        if (!metaRoot || typeof metaRoot !== 'object') {
            failures.push({ rule: 'metadata-file-unreadable', detail: 'metadata file parsed but had no root record' });
        }
    } catch (e) {
        failures.push({ rule: 'metadata-file-unreadable', detail: `metadata file is not valid JSON: ${String(e && e.message ? e.message : e)}` });
    }
}

// Resolve the Integration row + IO rows + IOF rows from the parsed file.
const pickArr = (re, ...names) => {
    if (!re || typeof re !== 'object') return [];
    for (const n of names) if (Array.isArray(re[n])) return re[n];
    const firstArr = Object.values(re).find(v => Array.isArray(v));
    return Array.isArray(firstArr) ? firstArr : [];
};
const integrationFields = (metaRoot && metaRoot.fields) || {};
const ioRows = metaRoot ? pickArr(metaRoot.relatedEntities, 'MJ: Integration Objects', 'Integration Objects') : [];
const allIOFRows = ioRows
    .map(io => pickArr(io && io.relatedEntities, 'MJ: Integration Object Fields', 'Integration Object Fields'))
    .flat();

// ── IOF FK @lookup-qualifier gate (deterministic; agent ran fk-lookup-qualifier.mjs over the FULL file). ──
// An IOF RelatedIntegrationObjectID @lookup must qualify its sibling-object lookup with the INTEGRATION's id
// (`&IntegrationID=@parent:IntegrationID`). The wrong `&IntegrationID=@parent:ID` resolves to the IO's OWN id,
// matches no sibling object, and rolls the entire `mj sync push` back — the iMIS/GrowthZone deploy defect.
// We read the script's JSON (not allIOFRows) because the large-catalog path strips relatedEntities to slimMeta.
if (fetched && typeof fetched.fkLookupQualifierJson === 'string' && fetched.fkLookupQualifierJson.trim() !== '') {
    try {
        const fk = JSON.parse(fetched.fkLookupQualifierJson);
        if (fk && Array.isArray(fk.violations) && fk.violations.length > 0) {
            const sample = fk.violations.slice(0, 25).map(v => `${v.io}.${v.iof}`).join(', ');
            failures.push({
                rule: 'fk-lookup-qualifier-wrong',
                detail: `${fk.violations.length} IOF RelatedIntegrationObjectID @lookup(s) use the wrong qualifier &IntegrationID=@parent:ID — that resolves to the IntegrationObject's own id (not the Integration's), matches no sibling object, and rolls back mj sync push (the iMIS/GrowthZone deploy failure). Change each to &IntegrationID=@parent:IntegrationID. Offenders: ${sample}${fk.violations.length > 25 ? ', …' : ''}`,
            });
        }
    } catch { /* malformed script output -> not gated here; the standalone `--all` run is the hard CI gate */ }
}

// ── Capability<->per-operation-column bijection gate (deterministic; agent ran graders/bijection.mjs). ──
// An IO that declares a capability flag (SupportsCreate/Update/Delete/IncrementalSync) while any of that
// capability's required per-operation columns (CreateAPIPath/Method/BodyShape/IDLocation, etc.) is blank
// makes the generic BaseRESTIntegrationConnector CRUD path THROW at the first write of that verb. Flag set
// requires the required columns populated. Read the script JSON (the large-catalog path strips relatedEntities).
if (fetched && typeof fetched.bijectionJson === 'string' && fetched.bijectionJson.trim() !== '') {
    try {
        const bj = JSON.parse(fetched.bijectionJson);
        if (bj && Array.isArray(bj.violations) && bj.violations.length > 0) {
            const sample = bj.violations.slice(0, 25).map(v => `${v.io}/${v.capability} missing ${(v.missing || []).join('+')}`).join('; ');
            failures.push({
                rule: 'bijection-violation',
                detail: `${bj.violations.length} IO(s) declare a capability flag while its required per-operation column(s) are blank — the generic CRUD path will THROW at runtime. Populate the missing column(s) or set the capability flag false. Offenders: ${sample}${bj.violations.length > 25 ? ', ...' : ''}`,
            });
        }
    } catch { /* malformed script output -> not gated here; the standalone `--all` run is the hard CI gate */ }
}

// ── Dependency-DAG completeness gate (deterministic; agent ran graders/dag-completeness.mjs). ──
// The full sync runs EVERY object in dependency order. A DAG checked on a subset proves nothing: an FK to a
// non-emitted object (dangling) or a hard-@lookup cycle (the single-transaction push rolls back) breaks the
// objects it skipped. So the graph is validated WHOLE here, over all objects. Soft ReferencedType cycles are
// resolved app-side at runtime and are NOT failed (the Salesforce class). Read the script JSON (large catalogs).
if (fetched && typeof fetched.dagJson === 'string' && fetched.dagJson.trim() !== '') {
    try {
        const dag = JSON.parse(fetched.dagJson);
        const blk = Array.isArray(dag && dag.blocking) ? dag.blocking : [];
        if (blk.length > 0) {
            const sample = blk.slice(0, 20).map(v => v.type === 'dangling-fk' ? `${v.io}->${v.target}(dangling)` : `cycle[${(v.objects || []).join(',')}]`).join('; ');
            failures.push({
                rule: 'dag-incomplete',
                detail: `${blk.length} blocking dependency-DAG violation(s) — the object graph is not whole/syncable over all objects (a dangling FK to a non-emitted object, or a hard-@lookup cycle that rolls the push back). Fix the FK target(s) or break the hard cycle (use soft ReferencedType). Offenders: ${sample}${blk.length > 20 ? ', ...' : ''}`,
            });
        }
    } catch { /* malformed script output -> not gated here; the standalone `--all` run is the hard CI gate */ }
}

// Evidence coverage — tolerant TargetField matcher over PROVENANCE + CODE_EVIDENCE. A field is
// "evidenced" if any TargetField ends with `.<field>` (matches integration.<f>, io.<name>.<f>,
// iof.<name>.<fname>.<f> — the granularities the producers actually emit).
const parseEntries = (content) => {
    if (typeof content !== 'string' || content.trim().length === 0) return [];
    try { const j = JSON.parse(content); return j.Entries ?? j.entries ?? []; } catch { return []; }
};
const evidenceTargets = [...parseEntries(fetched && fetched.provenanceContent), ...parseEntries(fetched && fetched.codeEvidenceContent)]
    .map(e => String((e && e.TargetField) || '').toLowerCase())
    .filter(Boolean);
const fieldEvidenced = (field) => {
    const needle = '.' + String(field).toLowerCase();
    return evidenceTargets.some(t => t.endsWith(needle));
};

const isPresent = (v) => !(v === null || v === undefined || (typeof v === 'string' && v.trim().length === 0));
const anyIOFTrue = (field) => allIOFRows.some(r => r && r.fields && r.fields[field] === true);
const anyIOFSet = (field) => allIOFRows.some(r => r && r.fields && isPresent(r.fields[field]));

let filled = 0;
let verified = 0;
let nullableSkipped = 0;

// Slots whose producer is a deterministic pipeline with a fixed value (e.g.
// MetadataSource='Declared') are satisfied by their fixedValue, not by an emission.
const isFixedValueSlot = (slot) => slot && Object.prototype.hasOwnProperty.call(slot, 'fixedValue');

for (const slot of slots) {
    const slotId = slot?.id ?? '(unnamed)';
    const nullable = slot?.nullable === true;
    const dot = slotId.indexOf('.');
    const family = dot >= 0 ? slotId.slice(0, dot) : slotId;
    const field = dot >= 0 ? slotId.slice(dot + 1) : '';

    if (isFixedValueSlot(slot)) {
        // Fixed-value slots are structurally filled + verified by definition.
        filled += 1;
        verified += 1;
        continue;
    }

    // ── MetadataFile slot — the file itself parsed into a root record. ──
    if (family === 'MetadataFile') {
        if (metaRoot) { filled += 1; verified += 1; }
        else failures.push({ rule: 'slot-not-filled', slot: slotId, detail: 'metadata file missing or unparseable' });
        continue;
    }

    // ── Connector.* method slots — satisfied by a clean build + existing connector file.
    //    Inheritance-safe: BaseREST provides BuildHeaders/MakeHTTPRequest/NormalizeResponse/etc.,
    //    so requiring each method literally in the concrete file would false-fail inherited ones.
    //    The verification ladder (T0 tsc / T1 invariants) is the real proof the bodies are valid. ──
    if (family === 'Connector') {
        const built = codeResult.BuildClean === true && fetched && fetched.connectorFileExists === true;
        if (built) { filled += 1; verified += 1; }
        else if (!nullable) failures.push({ rule: 'slot-not-filled', slot: slotId, detail: 'connector did not build clean / file missing — method body unproven' });
        else nullableSkipped += 1;
        continue;
    }

    // ── Resolve value(s) from the real metadata file by family (Integration=1, IO/IOF=N rows). ──
    let values;
    if (family === 'Integration') {
        values = [integrationFields[field]];
    } else if (family === 'IntegrationObject') {
        if (ioRows.length === 0) { failures.push({ rule: 'slot-not-filled', slot: slotId, detail: 'metadata file has zero Integration Object rows' }); continue; }
        values = ioRows.map(io => (io && io.fields) ? io.fields[field] : undefined);
    } else if (family === 'IntegrationObjectField') {
        if (allIOFRows.length === 0) { failures.push({ rule: 'slot-not-filled', slot: slotId, detail: 'metadata file has zero Integration Object Field rows' }); continue; }
        values = allIOFRows.map(r => (r && r.fields) ? r.fields[field] : undefined);
    } else {
        continue; // unknown family — no rule
    }

    const presentCount = values.filter(isPresent).length;
    const allPresent = presentCount === values.length;

    // (1) VALUE: a non-nullable slot must be present on EVERY applicable row (false/0 count as present).
    if (!nullable) {
        if (allPresent) {
            filled += 1;
        } else {
            failures.push({ rule: 'unprovable-required', slot: slotId, detail: `value missing on ${values.length - presentCount}/${values.length} row(s) for a non-nullable slot` });
            continue; // not filled → cannot be verified
        }
    } else {
        if (presentCount > 0) filled += 1; else { nullableSkipped += 1; continue; }
    }

    // (2) EVIDENCE: required ONLY for dangerous structural constraints that are ACTUALLY asserted.
    //     A wrong descriptive string (Name/Description/Status) doesn't lose data; a fabricated PK/FK
    //     corrupts the sync DAG and fails real records — so those (plus CredentialTypeID) must trace
    //     to a source. Everything else is satisfied by value-presence above.
    let needsEvidence = false;
    if (slotId === 'Integration.CredentialTypeID') needsEvidence = true;
    else if (slotId === 'IntegrationObjectField.IsPrimaryKey') needsEvidence = anyIOFTrue('IsPrimaryKey');
    else if (slotId === 'IntegrationObjectField.RelatedIntegrationObjectID') needsEvidence = anyIOFSet('RelatedIntegrationObjectID');

    if (needsEvidence && !fieldEvidenced(field)) {
        failures.push({ rule: 'slot-not-verified', slot: slotId, detail: `dangerous constraint asserted without source evidence (no PROVENANCE/CODE_EVIDENCE TargetField ending in .${field})` });
    } else {
        verified += 1;
    }
}

phase('manifest-check');
// ── Manifest declarations, decided in JS against the journal. ──

// extractEveryIO: every discovered IO went through extract-iiof-pipeline.
// We treat extractStats.extractedObjects as the proof. If the manifest demands it
// and no objects were extracted, that's a failure.
if (manifest.extractEveryIO === true) {
    const extracted = Array.isArray(extractStats.extractedObjects) ? extractStats.extractedObjects : [];
    if (extracted.length === 0) {
        failures.push({ rule: 'manifest-extractEveryIO', detail: 'manifest.extractEveryIO=true but journal records zero extracted objects' });
    }
}

// verifyEveryClaim: every emitted claim has a verify-claim event.
// The extract pipeline exports verifyEveryClaim (claimsVerified === claimsTotal).
if (manifest.verifyEveryClaim === true) {
    if (extractStats.verifyEveryClaim !== true) {
        const detail = `manifest.verifyEveryClaim=true but not every claim verified (verified=${extractStats.claimsVerified ?? '?'} of ${extractStats.claimsTotal ?? '?'})`;
        failures.push({ rule: 'manifest-verifyEveryClaim', detail });
    }
}

// sourceDiffMustClose: compute-source-diff returned empty missing[].
if (manifest.sourceDiffMustClose === true) {
    const missing = Array.isArray(journal.sourceDiff?.missing) ? journal.sourceDiff.missing : null;
    if (missing === null) {
        failures.push({ rule: 'source-diff-closed', detail: 'manifest.sourceDiffMustClose=true but journal has no sourceDiff.missing array' });
    } else if (missing.length !== 0) {
        failures.push({ rule: 'source-diff-closed', detail: `source-diff did not close: ${missing.length} missing item(s)` });
    }
}

// scope-sanity (anti-overfit): source-diff above only proves extracted == DECLARED universe (TaxonomyLeaves).
// It CANNOT catch a declared universe that was itself recited from a famous template — the Salesforce
// 11-of-1,694 failure (11==11 closes green while 1,683 real objects are silently dropped). The fix the
// audit demanded: the FLOOR ITSELF runs the deterministic enumerator (enumerate-catalog.mjs, step 12 of
// the byte-fetch above) over the saved source artifact(s) and reconciles the EMITTED IO count against
// THAT count — the universe leaves agent self-reporting entirely. A thin ratio must be a JUSTIFIED scope
// decision (need- or source-breadth-derived, excluded families named), never a recital; and "runtime
// discovery covers the rest" is only honest when discovery is authoritative.
{
    // The floor-computed universe (from the enumerator the agent RAN, not a self-reported integer).
    let enumCount = NaN, enumConfidence = 'low', enumFormat = 'none', enumFieldCount = NaN;
    if (fetched && typeof fetched.enumerateCatalogJson === 'string' && fetched.enumerateCatalogJson.trim() !== '') {
        try {
            const e = JSON.parse(fetched.enumerateCatalogJson);
            enumCount = Number(e.count);
            enumFieldCount = Number(e.fieldCount);
            enumConfidence = e.confidence === 'high' ? 'high' : 'low';
            enumFormat = String(e.format ?? (Array.isArray(e.perSource) ? 'multi' : 'unknown'));
        } catch { /* malformed enumerator output -> treated as unmeasured below */ }
    }
    // The DECLARED universe = the IOs actually emitted to the metadata file (what shipped), with
    // TaxonomyLeaves as a fallback when the metadata wasn't readable.
    const declaredUniverse = ioRows.length > 0
        ? ioRows.length
        : (Array.isArray(journal.sources?.TaxonomyLeaves) ? journal.sources.TaxonomyLeaves.length : NaN);
    const SCOPE_THIN = 0.5; // emitted < half the enumerated universe ⇒ must be justified, not recited
    const sd = journal.scopeDecision;
    const justified = sd && sd.evidence && (sd.mode === 'need' || sd.mode === 'source-breadth') && Array.isArray(sd.excludedFamilies);

    if (Number.isFinite(enumCount) && enumCount > 0 && Number.isFinite(declaredUniverse)) {
        const ratio = declaredUniverse / enumCount;
        if (ratio < SCOPE_THIN && !justified) {
            // A HIGH-confidence enumeration (typed schema/SDL/introspection/Postman) is authoritative — hard fail.
            // A LOW-confidence one (best-effort YAML/HTML scrape) still flags, but the detail says the count is
            // coarse and the run can clear it by pointing SourcesFile at a typed schema OR adding a scopeDecision.
            const rule = enumConfidence === 'high' ? 'scope-unjustified-thin' : 'scope-thin-low-confidence-source';
            const conf = enumConfidence === 'high'
                ? `enumerated from a ${enumFormat} model`
                : `enumerated best-effort from a ${enumFormat} source (coarse count — point SourcesFile at a typed OpenAPI/SDL/introspection/Postman schema for an authoritative count, OR justify)`;
            failures.push({ rule, detail: `emitted ${declaredUniverse} IOs of ${enumCount} record types the source exposes (${(ratio * 100).toFixed(1)}%; ${conf}) with no evidenced scope decision — the famous-only/Salesforce-11-of-1694 failure. A thin scope MUST carry journal.scopeDecision={mode:'need'|'source-breadth', evidence, excludedFamilies[]}; a recited canonical list is rejected.` });
        }
        if (ratio < SCOPE_THIN && journal.scopeDecision?.residualMode === 'runtime-discovery' && journal.realityProbe?.discoveryAuthoritative !== true) {
            failures.push({ rule: 'scope-residual-unverified', detail: `scope claims runtime discovery covers the undeclared ${enumCount - declaredUniverse} record type(s), but discovery is NOT authoritative on this run — the residual is UNVERIFIED, not covered. Report ceiling must be format-verified-no-creds and name the residual; coverage may not be implied.` });
        }
        // FIELD-level completeness (#17): the object-set diff above proves we emitted the right TABLES; it
        // says nothing about whether each table got its COLUMNS. The dual-derive checks fields per-object
        // precisely at extraction; here at the floor we add a coarse, false-fail-resistant AGGREGATE check —
        // total emitted IOFs vs total fields the source's typed model declares. Magnitude only (no per-name
        // matching), HIGH-confidence only, and a generous floor (30%), so it fires only on egregious column
        // under-emission (the "3 of 40 fields" class) — never on naming-convention differences.
        const FIELD_THIN = 0.3;
        if (enumConfidence === 'high' && Number.isFinite(enumFieldCount) && enumFieldCount > 0) {
            const fieldRatio = allIOFRows.length / enumFieldCount;
            if (fieldRatio < FIELD_THIN && !justified) {
                failures.push({ rule: 'fields-thin', detail: `emitted ${allIOFRows.length} IOFs of ~${enumFieldCount} fields the source's ${enumFormat} model declares across its record types (${(fieldRatio * 100).toFixed(1)}%) — tables emitted but columns largely dropped (the "3-of-40 fields" class). The extractor's 0-field hard-fail + dual-derive field diff should have caught this; if it reached the floor the emission is materially incomplete. (Aggregate magnitude check — justify via scopeDecision if the source genuinely over-declares unused fields.)` });
            }
        }
    } else if (enumSourcePaths.length > 0 && (!Number.isFinite(enumCount) || enumCount === 0)) {
        // A source artifact WAS provided but the deterministic enumerator extracted 0 record types — the
        // universe could not be measured, so a famous-only collapse cannot be ruled out. Force the run to
        // point SourcesFile at the real machine-readable schema (not a prose doc / wrong file).
        failures.push({ rule: 'scope-universe-unmeasured', detail: `a source artifact was provided (${enumSourcePaths.join(', ')}) but enumerate-catalog.mjs extracted 0 record types from it — the universe could not be measured, so a famous-only scope collapse cannot be ruled out. Confirm SourcesFile points at the machine-readable schema (OpenAPI/Swagger/GraphQL SDL or introspection/Postman/XSD), not a prose doc.` });
    } else if (manifest.sourceDiffMustClose === true && enumSourcePaths.length === 0) {
        failures.push({ rule: 'scope-no-source-artifact', detail: 'no source artifact path on journal.sources — the floor cannot enumerate the real universe to reconcile the declared scope against. A connector whose objects come from a credential-free schema MUST record that schema as a source artifact so the universe can be measured.' });
    }
}

// ── Code build cleanliness + connector file existence (JS verdict on agent's test -f). ──
if (codeResult.BuildClean !== true) {
    failures.push({ rule: 'build-not-clean', detail: `journal.codeResult.BuildClean !== true (was ${JSON.stringify(codeResult.BuildClean)})` });
}
if (!connectorFile) {
    failures.push({ rule: 'connector-file-missing', detail: 'journal.codeResult.ConnectorFile is empty' });
} else if (!fetched || fetched.connectorFileExists !== true) {
    failures.push({ rule: 'connector-file-missing', detail: `test -f ${connectorFile} did not confirm the file exists` });
}

// ── Credential-type bijection (plan §E1): the referenced credential type's auth-schema keys
//    MUST cover what the connector's ConnectionConfig actually reads. PropFuel shipped pointing
//    at the generic "API Key with Endpoint" type (apiKey/endpoint) while reading Token/AccountID
//    — credential resolution can never succeed. This fires ONLY when both sides are extractable
//    (no false-fail on connectors that read a generic Configuration blob with no typed config). ──
(() => {
    const connectorSrc = (fetched && typeof fetched.connectorContent === 'string') ? fetched.connectorContent : '';
    const credTypesRaw = (fetched && typeof fetched.credTypesContent === 'string') ? fetched.credTypesContent : '';
    if (!connectorSrc || !credTypesRaw || !metaRoot) return; // can't evaluate → skip (not a false-fail)

    // (a) connector ConnectionConfig key shape: `interface <X>ConnectionConfig { Key: type; ... }`.
    const ifaceMatch = connectorSrc.match(/(?:interface|type)\s+\w*ConnectionConfig\b[^{]*\{([\s\S]*?)\}/);
    if (!ifaceMatch) return; // connector reads a generic Configuration — nothing typed to verify
    // Only REQUIRED keys (no `?:`) must be covered — optional tuning params (BaseURL?, MaxRetries?,
    // RequestTimeoutMs?) have code defaults and are not credential keys the user must supply.
    const connectorKeys = [...ifaceMatch[1].matchAll(/^\s*([A-Za-z_]\w*)\s*(\??)\s*:/gm)]
        .filter(m => m[2] !== '?')
        .map(m => m[1]);
    if (connectorKeys.length === 0) return;

    // (b) referenced credential type name from Integration.CredentialTypeID `@lookup:...Name=<Name>`.
    const credRef = String((metaRoot.fields || {}).CredentialTypeID || '');
    const nameMatch = credRef.match(/Name=([^&]+)\s*$/);
    if (!nameMatch) { failures.push({ rule: 'credential-type-key-mismatch', detail: `Integration.CredentialTypeID is not a resolvable @lookup Name= reference: "${credRef}"` }); return; }
    const typeName = nameMatch[1].trim();

    // (c) that type's auth-schema property keys.
    let credTypes;
    try { const j = JSON.parse(credTypesRaw); credTypes = Array.isArray(j) ? j : [j]; } catch { return; }
    const typeEntry = credTypes.map(c => c.fields || c).find(f => String(f.Name).trim().toLowerCase() === typeName.toLowerCase());
    if (!typeEntry) { failures.push({ rule: 'credential-type-key-mismatch', detail: `Integration references credential type "${typeName}" which is not defined in metadata/credential-types/.credential-types.json` }); return; }
    const schemaRef = String(typeEntry.Schema || typeEntry.FieldSchema || typeEntry.schema || '');
    const schemaFile = schemaRef.replace(/^@file:/, '').trim();
    const bundle = (fetched && typeof fetched.credSchemasBundle === 'string') ? fetched.credSchemasBundle : '';
    // Find the schema's bytes in the bundle by basename match.
    const base = schemaFile.split('/').pop();
    let schemaContent = '';
    if (base) {
        const parts = bundle.split(/@@@FILE:([^@]+)@@@/);
        for (let i = 1; i < parts.length; i += 2) {
            if (parts[i].includes(base)) { schemaContent = parts[i + 1] || ''; break; }
        }
    }
    if (!schemaContent) return; // schema file unreadable → skip rather than false-fail
    let schemaKeys = [];
    try { const s = JSON.parse(schemaContent); schemaKeys = Object.keys(s.properties || s.Properties || {}); } catch { return; }
    if (schemaKeys.length === 0) return;

    // (d) every connector config key must be covered (case-insensitive) by the schema's keys.
    const lowerSchema = new Set(schemaKeys.map(k => k.toLowerCase()));
    const missing = connectorKeys.filter(k => !lowerSchema.has(k.toLowerCase()));
    if (missing.length > 0) {
        failures.push({
            rule: 'credential-type-key-mismatch',
            detail: `connector ConnectionConfig reads [${connectorKeys.join(', ')}] but credential type "${typeName}" schema only defines [${schemaKeys.join(', ')}] — missing: [${missing.join(', ')}]. Reuse a type whose keys cover these, or create a dedicated one (identity-establisher §"Credential type: match-or-create").`,
        });
    }
})();

// ── Discovery must be DYNAMIC (anti-hardcode gate). DiscoverObjects/DiscoverFields are the
//    RUNTIME discovery mechanism — they must reach the source (await a list/sample/introspect
//    call), NOT return a frozen catalog. The PropFuel defect: DiscoverObjects baked the once-sampled
//    3 data types as `return PROPFUEL_STREAMS.map(...)`, so runtime discovery could never surface a
//    4th. A method that produces a catalog statically (returns CONST.map / an inline non-empty array)
//    with NO awaited runtime call, NO super-delegation, and NO `// STATIC-CATALOG:` evidence marker is
//    a frozen clamp → fail. (The marker is the narrow, evidence-declared exception for a source with a
//    genuinely fixed schema + no enumeration API + no customs.) Declared metadata being small is FINE
//    — this gate targets the METHOD, never the seeded IO/IOF count. ──
(() => {
    const connectorSrc = (fetched && typeof fetched.connectorContent === 'string') ? fetched.connectorContent : '';
    if (!connectorSrc) return; // can't read the connector → skip (not a false-fail)

    const extractMethodBody = (src, methodName) => {
        const m = new RegExp('\\b' + methodName + '\\s*\\(').exec(src);
        if (!m) return null;
        let p = src.indexOf('(', m.index);
        if (p < 0) return null;
        let pd = 0, j = p;
        for (; j < src.length; j++) { if (src[j] === '(') pd++; else if (src[j] === ')') { pd--; if (pd === 0) { j++; break; } } }
        const b = src.indexOf('{', j);
        if (b < 0) return null;
        let bd = 0;
        for (let i = b; i < src.length; i++) {
            if (src[i] === '{') bd++;
            else if (src[i] === '}') { bd--; if (bd === 0) return { body: src.slice(b + 1, i), sigIndex: m.index }; }
        }
        return null;
    };

    for (const methodName of ['DiscoverObjects', 'DiscoverFields']) {
        const ex = extractMethodBody(connectorSrc, methodName);
        if (!ex) continue; // method not overridden (uses base cache-driven discovery) — fine
        const { body, sigIndex } = ex;
        const preceding = connectorSrc.slice(Math.max(0, sigIndex - 400), sigIndex);
        const hasAwait = /\bawait\b/.test(body);                              // a dynamic discovery must await a runtime call
        const delegatesToSuper = /\bsuper\s*\./.test(body);                  // delegating to base discovery is fine
        const hasStaticMarker = /STATIC-CATALOG/i.test(body) || /STATIC-CATALOG/i.test(preceding); // evidence-declared exception
        const producesCatalogStatically = /\breturn\b[\s\S]*?\.(map|filter)\s*\(/.test(body) || /\breturn\s*\[\s*[{'"]/.test(body);
        if (!hasAwait && !delegatesToSuper && !hasStaticMarker && producesCatalogStatically) {
            failures.push({
                rule: 'discovery-hardcoded',
                detail: `${methodName} returns a frozen catalog (static .map()/array, no awaited list/sample/introspect call) — discovery must be DYNAMIC (reach the source at runtime). If the source genuinely has a fixed schema + no enumeration API + no customs, declare it with a "// STATIC-CATALOG: <evidence>" comment; otherwise wire ${methodName} to the source's list/describe/sample path.`,
            });
        }
    }
})();

// ── No BAKED CATALOG / CONSTRAINTS in connector code (forbidden deeply). Catalogs (field/object
//    lists) and constraints (PK / required / readonly / unique / type) belong in METADATA — Declared
//    (from credential-free docs) or runtime Discovered — NEVER as constants in the .ts. A baked
//    `FIELD_CATALOG` / `*_FIELDS` / `*_STREAMS` const is the disease: it ships a frozen catalog AND
//    gives the extractor a "source" to read the connector's own output back in (the circular-source
//    defect that re-baked PropFuel's 3 streams every run). The connector code is pure MECHANISM
//    (auth, HTTP, list/discover, fetch, normalize); the catalog is discovered, not declared in code.
//    Dynamic schema construction inside a method (.map over discovered data) is fine — this targets
//    MODULE-LEVEL baked literals only. `// STATIC-CATALOG: <evidence>` exempts a genuinely fixed schema. ──
(() => {
    const connectorSrc = (fetched && typeof fetched.connectorContent === 'string') ? fetched.connectorContent : '';
    if (!connectorSrc) return;
    if (/STATIC-CATALOG/i.test(connectorSrc)) return; // evidence-declared fixed-schema exception

    const baked = [];
    const re = /^(?:export\s+)?const\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?::[^=]+)?=\s*([\[{])/gm; // column-0 (module-level) only
    let m;
    while ((m = re.exec(connectorSrc))) {
        const name = m[1];
        const open = m.index + m[0].length - 1;
        const openCh = connectorSrc[open], closeCh = openCh === '[' ? ']' : '}';
        let depth = 0, end = open;
        for (let i = open; i < connectorSrc.length; i++) {
            const c = connectorSrc[i];
            if (c === openCh) depth++;
            else if (c === closeCh) { depth--; if (depth === 0) { end = i; break; } }
        }
        const body = connectorSrc.slice(open, end + 1);
        const catalogName = /(CATALOG|FIELDS|STREAMS|OBJECTS|COLUMNS|TABLES|SCHEMA)/i.test(name);
        const nameKeys = (body.match(/\bName\s*:/g) || []).length;
        const bakedShape = nameKeys >= 2 && /(Type|IsPrimaryKey|IsRequired|IsReadOnly|IsUniqueKey)\s*:/.test(body);
        const bakedStringList = openCh === '[' && catalogName && (body.match(/['"][A-Za-z0-9_]+['"]/g) || []).length >= 2;
        if (catalogName || bakedShape || bakedStringList) baked.push(name);
    }
    const uniq = [...new Set(baked)];
    if (uniq.length > 0) {
        failures.push({
            rule: 'catalog-in-code',
            detail: `connector bakes catalog/constraint constant(s) in code: [${uniq.join(', ')}]. Catalogs (field/object lists) + constraints (PK/required/readonly/type) belong in METADATA (Declared-from-docs or runtime Discovered), never as .ts constants. Remove them; the connector is pure mechanism + dynamic discovery. (Genuinely fixed schema → declare "// STATIC-CATALOG: <evidence>".)`,
        });
    }
})();

// ── The extractor seeds STATIC metadata from CREDENTIAL-FREE sources ONLY. It must NOT read the
//    connector being built (src/dist/.archived — that's OUTPUT), the prior metadata file (output),
//    a baked catalog, or any auth-gated/live data. The generated extractor that wasted PropFuel's
//    run literally hardcoded `.archived/…/PropFuelConnector.ts` as its "Tier-1 SDK source" and read
//    the connector's FIELD_CATALOG back in — the circular-source defect. Fail any extractor that does. ──
(() => {
    const ex = (fetched && typeof fetched.extractorScriptContent === 'string') ? fetched.extractorScriptContent : '';
    if (!ex) return; // no extractor script captured → nothing to check
    const hits = [];
    if (/\.archived\b/.test(ex)) hits.push('.archived (prior-output copy)');
    if (/\/dist\/[A-Za-z0-9_]*Connector\.(js|ts)/.test(ex)) hits.push('dist connector (output)');
    if (/connectors\/src\/[A-Za-z0-9_]*Connector\.ts/.test(ex)) hits.push('connector src (output)');
    if (/FIELD_CATALOG|_FIELDS\b|_STREAMS\b/.test(ex)) hits.push('reads a baked catalog');
    if (/loadIfExists\([^)]*integration\.json|EXISTING_METADATA/.test(ex)) hits.push('prior metadata file (output)');
    if (hits.length > 0) {
        failures.push({
            rule: 'extractor-reads-output',
            detail: `extractor script sources from OUTPUT / prior artifacts instead of credential-free docs: [${hits.join(', ')}]. The extractor seeds STATIC metadata from public docs/OpenAPI/spec ONLY — never the connector (src/dist/archive), prior metadata, a baked catalog, or auth-gated data. Reading the connector re-bakes its own output (the circular-source defect). See extractor-script-conventions.md § "Source loaders — CREDENTIAL-FREE SOURCES ONLY".`,
        });
    }
})();

// ── The BUILD is CREDENTIAL-FREE: the plan must not condition discovery / the object set on credential
//    availability (live-sample-at-build). The credential reaches ONLY the test tiers (ladder T8 / hybrid-e2e
//    live). PropFuel's plan conditioned its stream set on the credential at build ("if a credential is
//    available, the live list … informs which streams exist") — that's live-data sourcing standard objects.
//    Test-tier credential use (TestConnection/list/download inside the ladder) is fine and NOT flagged. ──
(() => {
    const plan = (fetched && typeof fetched.planContent === 'string') ? fetched.planContent : '';
    if (!plan) return;
    const lines = plan.split('\n');
    let cut = lines.length; // build region = before the first test-tier phase
    for (let i = 0; i < lines.length; i++) {
        if (/phase\(\s*['"](VerificationLadder|HybridE2E|E2E[A-Za-z]*)['"]/.test(lines[i])) { cut = i; break; }
    }
    const credCond = /\bif\s+a?\s*credential\b|credential\s+is\s+available|when\s+credentialed|\bif\s+creds\b/i;
    const discoverySource = /informs which|streams?\s+exist|objects?\s+exist|which\s+(streams|objects|fields)|leaf set|discover[^.]{0,40}(streams|objects|fields)/i;
    const offending = [];
    for (let i = 0; i < cut; i++) {
        if (credCond.test(lines[i]) && discoverySource.test(lines[i])) offending.push(i + 1);
    }
    if (offending.length > 0) {
        failures.push({
            rule: 'credential-used-at-build',
            detail: `plan conditions build-phase discovery / the object set on credential availability (line(s) ${offending.join(', ')}). The build is CREDENTIAL-FREE — the object/field set comes from credential-free docs (Declared) or runtime methods (Discovered), never from live data sampled at build. The credential reaches ONLY the test tiers. Remove the "if a credential is available → live-discover the streams" branch; live disc is the connector's runtime job, not the extractor's.`,
        });
    }
})();

// ── Verification ladder: no red rung; claimed tier reached. ──
const ladder = journal.ladder ?? {};
const tierResults = Array.isArray(ladder.tierResults) ? ladder.tierResults : [];
for (const tr of tierResults) {
    if (tr && tr.status === 'red') {
        failures.push({ rule: 'ladder-rung-red', detail: `ladder rung ${tr.tier ?? '(?)'} is red` });
    }
}
// e2eTier: the manifest's required tier must have been reached (achievedTier >= manifest.e2eTier).
const tierNum = (t) => {
    const m = typeof t === 'string' ? t.match(/T(\d+)/i) : null;
    return m ? parseInt(m[1], 10) : -1;
};
if (manifest.e2eTier) {
    const required = tierNum(manifest.e2eTier);
    const achieved = tierNum(ladder.achievedTier);
    if (required >= 0 && achieved < required) {
        failures.push({ rule: 'e2e-tier-met', detail: `manifest.e2eTier=${manifest.e2eTier} but ladder achievedTier=${ladder.achievedTier ?? 'none'}` });
    }
}

// ── Hybrid §1→§7 e2e: proving the connector through MJAPI into a real SQL Server DB is REQUIRED. ──
// The connector must be proven through MJAPI into a real database — not just the in-isolation ladder.
// When a broker credential exists, the hybrid-e2e runs the LIVE full-creation-pipeline (create instance
// → discover → PK-classify incl. last-resort LLM → ApplyAll → sync) as the mandatory path; when no
// credential exists it runs the credential-free MOCK floor (the lower ceiling). Either way the primitive
// must PASS — a build whose hybrid-e2e did not pass (or did not run) fails the floor.
// (Postgres fresh-DB codegen is suspended pending the PG-baseline fix; the e2e runs on SQL Server.)
const hybridE2E = journal.hybridE2E ?? null;
if (!hybridE2E) {
    failures.push({ rule: 'hybrid-e2e-missing', detail: 'hybrid-e2e primitive did not run — the deep §1→§7 e2e (real engine → SQL Server) is required on every build. See HYBRID_E2E_ENV_RUNBOOK.md.' });
} else if (hybridE2E.pass !== true) {
    failures.push({ rule: 'hybrid-e2e-not-pass', detail: `hybrid-e2e did not pass: ${JSON.stringify(hybridE2E.failures ?? [])}` });
}

// ── v2 EMPIRICAL gates (ARCHITECTURE_REFACTOR.md §3). Consistency lint alone is NOT verification; ──
// ── these rules require that real-system signal entered the build and survived. ──

// P6 `e2e-mock-dodge`: a credential existed but the deep e2e ran mock — the one stage with real
// engine-level empirical content was routed around (the GrowthZone dodge: maxTier=T8 declared while
// hybrid-e2e ran mock). Mock mode satisfies the e2e requirement ONLY on credential-free builds.
// Creds are reachable by EITHER path — an opaque credentialReference OR a read-only broker plan; pre-fix
// this keyed on credentialReference alone, so a broker-creds build dodged this very gate (#H7).
const e2eHasCreds = !!journal.credentialReference || (Array.isArray(journal.brokerPlans) && journal.brokerPlans.length > 0);
if (hybridE2E && e2eHasCreds && hybridE2E.mode !== 'live') {
    failures.push({ rule: 'e2e-mock-dodge', detail: `a credential is available (credentialReference or brokerPlans) but hybrid-e2e ran mode='${hybridE2E.mode}' — live e2e is MANDATORY when a credential is available by EITHER path. A multi-secret credential is a harness deficiency to FIX, never a reason to skip live.` });
}

// P2 `reality-probe-*`: the RealityProbe stage (S7) must run on EVERY build (degraded unauth probe
// when no credential); no declared-claim verdict may be left falsified/unresolved at floor time; and
// probe-originated metadata DELTAS are authorship from live data → fail (verdicts in, authorship out).
const probe = journal.realityProbe ?? null;
if (!probe) {
    failures.push({ rule: 'reality-probe-missing', detail: 'RealityProbe (S7) did not run. Required on every v2 build — with a credential it emits read-only verdicts on declared claims (paths/pagination/PKs/watermark/write-surface); without one it degrades to the unauthenticated per-claim status probe. ARCHITECTURE_REFACTOR.md P2.' });
} else {
    const falsified = Array.isArray(probe.verdicts) ? probe.verdicts.filter(v => v && (v.verdict === 'wrong' || v.verdict === 'falsified') && v.resolved !== true) : [];
    if (falsified.length > 0) {
        failures.push({ rule: 'reality-probe-verdicts-unresolved', detail: `${falsified.length} probe-falsified claim(s) unresolved at floor time (first: ${JSON.stringify(falsified[0]).slice(0, 200)}). Verdicts feed ProbeAmend; reality outranks the frozen contract.` });
    }
    if (probe.metadataDelta === true) {
        failures.push({ rule: 'reality-probe-authored-metadata', detail: 'the RealityProbe stage originated a metadata delta — the probe emits VERDICTS only; authorship from live data is forbidden (the anti-baking firewall).' });
    }
    // Anti-fabrication (#H11/#H22): the floor will NOT trust an agent's free-form / self-reported probe.
    // A probe that claims it ran must carry the DETERMINISTIC script's structural evidence — the sha256 of
    // the pinned metadata file it hashed (an agent that invented verdicts cannot produce a valid one), and
    // a claim-count consistent with its verdict list. An empty verdict set over emitted IOs is a probe that
    // never actually probed (a green "no falsified verdicts" over nothing is meaningless — #H4/#H11).
    if (probe.ran === true) {
        const sha = probe.metadataSha256;
        if (typeof sha !== 'string' || sha.length < 32) {
            failures.push({ rule: 'reality-probe-unshaped', detail: 'realityProbe.ran=true but no valid metadataSha256 — the deterministic reality-probe.mjs script (which hashes the pinned metadata file) was NOT actually run; the floor will not trust a free-form / self-reported probe summary.' });
        }
        const verdictsArr = Array.isArray(probe.verdicts) ? probe.verdicts : [];
        if (typeof probe.claims === 'number' && probe.claims !== verdictsArr.length) {
            failures.push({ rule: 'reality-probe-unshaped', detail: `realityProbe.claims=${probe.claims} != verdicts.length=${verdictsArr.length} — the script's claim count must equal its verdict list; a mismatch indicates an edited/fabricated summary.` });
        }
        if (ioRows.length > 0 && verdictsArr.length === 0) {
            failures.push({ rule: 'reality-probe-empty', detail: `${ioRows.length} IO(s) emitted but the probe returned ZERO verdicts — the declared doors were not actually probed; a green "no falsified verdicts" over an empty probe proves nothing.` });
        }
    }
}

// P5 `capability-dishonest`: the brand study's WriteCapability is BINDING. A vendor whose study says
// read-write/bidirectional with ZERO write-capable IOs emitted needs an explicit, evidenced scope
// decision — never a silent pull-only ship (GZ #30: bidirectional vendor shipped read-only, green).
const brandWrite = (journal.brand && journal.brand.WriteCapability) || null;
if (brandWrite && /read-write|bidirectional/i.test(String(brandWrite))) {
    const writeIOs = Number.isInteger(journal.writeCapableIOCount) ? journal.writeCapableIOCount : null;
    const scopedOut = !!(journal.outOfScopeFamilies && JSON.stringify(journal.outOfScopeFamilies).match(/write/i)) || !!journal.writeScopeDecision;
    if (writeIOs === 0 && !scopedOut) {
        failures.push({ rule: 'capability-dishonest', detail: `brand study reports WriteCapability='${brandWrite}' but the emission has 0 write-capable IOs and no evidenced write scope decision (OutOfScopeObjectFamilies / writeScopeDecision). Capability honesty is a gate, not a vibe.` });
    }
}

// P7 `env-preflight-*`: stage-0 environment gates. The GZ #31 class — a stale nested
// @memberjunction/integration-* dist under a package's node_modules silently disabling a framework
// feature (custom-column capture) for EVERY connector — must be detected BEFORE stages burn.
const preflight = journal.envPreflight ?? null;
if (!preflight) {
    failures.push({ rule: 'env-preflight-missing', detail: 'EnvPreflight (S0) did not run — DB/MJAPI/generated-tree/nested-dist/turbo-freshness gates are required before any build stage (ARCHITECTURE_REFACTOR.md P7).' });
} else if (Array.isArray(preflight.staleNestedDists) && preflight.staleNestedDists.length > 0 && preflight.resolved !== true) {
    failures.push({ rule: 'stale-nested-dist', detail: `stale nested integration dist copies detected and unresolved: ${JSON.stringify(preflight.staleNestedDists).slice(0, 300)} — the GZ #31 silent-kill class.` });
}

// P3/P6 outcome-shaped e2e evidence: a table that GROWS on the second pass is a dupe defect (GZ #22:
// 127→254); an object that lands rows only on a later pass is an ORDERING defect, not a self-heal
// (GZ #21/#28: ContactWebsite 40→57); capture must have ENGAGED (GZ #29/#31 silent no-op class).
if (hybridE2E && hybridE2E.assertions) {
    const a = hybridE2E.assertions;
    if (a.idempotentZeroWork === false || a.secondSyncGrew === true) {
        failures.push({ rule: 'second-sync-grew', detail: 'second full sync grew at least one table — non-idempotent identity (GZ #22/#23 class). Two-pass zero-growth is a hard gate.' });
    }
    if (a.firstSyncComplete === false) {
        failures.push({ rule: 'first-sync-incomplete', detail: 'at least one object reached its full rowcount only on a later pass — door-before-child ordering defect on the fresh DB (GZ #21/#28 class). Second-sync self-heal is a FAIL, not a footnote.' });
    }
    if (a.captureEngaged === false) {
        failures.push({ rule: 'capture-not-engaged', detail: 'custom-column capture did not engage (overflow column absent on created tables, or zero customs captured while custom-marker fields were observed) — the GZ #29/#31 silent no-op class. Waivable only with vendor-confirmed-no-customs evidence.' });
    }
    // FAIL-OPEN GUARD (#H20): the three checks above fire only on a DEFINITE bad value (=== true/false),
    // so a null/undefined assertion (the e2e couldn't determine the outcome) slips through as a PASS.
    // These outcomes MUST be measured in EVERY mode — the prior `mode==='live'`-only exemption WAS
    // "testing is lazy because there aren't creds" encoded in the gate. The credential-free MOCK is a
    // PROGRAMMABLE vendor (deterministic replay against a fresh DB): it can measure idempotency
    // (2nd-pass zero-growth), ordering (firstSyncComplete), capture (overflow column), and rows-landed
    // exactly as a live run does. So the anti-vacuous bar binds mock and live identically. (Only a real
    // WRITE round-trip + true rate behavior need a credential — those stay live-only, asserted elsewhere.)
    {
        const idempotencyMeasured = a.idempotentZeroWork === true || a.secondSyncGrew === false;
        const unmeasured = [];
        if (!idempotencyMeasured) unmeasured.push('second-sync idempotency');
        if (a.firstSyncComplete !== true && a.firstSyncComplete !== false) unmeasured.push('firstSyncComplete');
        if (a.captureEngaged !== true && a.captureEngaged !== false) unmeasured.push('captureEngaged');
        if (unmeasured.length > 0) {
            failures.push({ rule: 'e2e-assertion-unverified', detail: `hybrid-e2e (mode='${hybridE2E.mode}') left ${unmeasured.length} outcome assertion(s) UNMEASURED (null/undefined): ${unmeasured.join(', ')} — an empirical gate that could not determine the outcome must NOT pass open, credential or not; the mock is a programmable vendor that CAN measure these. The green would falsely imply idempotency/ordering/capture were proven.` });
        }
        // Anti-vacuous rows-landed: a green e2e that landed ZERO rows proves nothing (mock included —
        // the fixtures carry data, so 0 rows is a broken sync, not an empty source). syncLandedRows is
        // the per-mode anti-vacuous signal; it must be TRUE (set false on rowsProcessed=0 / mapCount=0).
        if (a.syncLandedRows !== true) {
            failures.push({ rule: 'e2e-landed-zero-rows', detail: `hybrid-e2e (mode='${hybridE2E.mode}') did not assert syncLandedRows=true — a sync that landed zero rows is a vacuous green, credential or not. The mock fixtures carry data; 0 rows means the sync is broken, not that the source is empty.` });
        }
    }
}

// ── Behavioral-coverage + write-coverage gates (the no-silent-subset floor). ────────────────────────
// Mirrors the deterministic graders floor/graders/{behavioral-coverage,write-coverage}.mjs (unit-tested
// pure spec + CLI). floor-check is sandboxed (no fs/import), so it computes the SAME set-membership check
// inline from the per-object coverage the e2e reports on `hybridE2E.assertions` + the already-parsed ioRows.
//
// The defect this closes: bijection/dag check the WHOLE object set statically, but the BEHAVIORAL proof had
// no equivalent — an e2e could sync 5 of 377 objects (and exercise 0 of N write paths), fail nothing, and
// "verified" got asserted on a convenient subset. (The "Goldilocks" rule bounds ROW VOLUME per stream, NOT
// the number of objects/writes exercised.) This makes "every object/write either exercised or explicitly
// scoped" the floor instead of something an operator must demand round after round.
//
// TOKEN/ACCURACY CONTRACT (why this cannot regress either):
//   • Pure inline JS — zero LLM tokens.
//   • It blocks ONLY on a SILENT subset: the e2e DID report a covered set, a remainder exists, and there is
//     NO `coverageScopeReason` and NO per-object skip accounting it. The escape is ONE reason string (or
//     per-object skips) — token-FLAT, never a forced full run. A legitimately-scoped run (Goldilocks-bounded)
//     passes and is surfaced loudly; the operator keeps the lever to demand more if the reason is weak.
//   • When the e2e reports NO per-object coverage (`coveredObjects` not an array — older runs, or it didn't
//     emit it), this is INFORMATIONAL only and NEVER fails. Worst case a no-op; best case it kills the duck.
if (hybridE2E && hybridE2E.assertions) {
    const a = hybridE2E.assertions;
    const norm = (s) => String(s == null ? '' : s).trim().toLowerCase();
    const toNameSet = (list) => {
        const set = new Set();
        for (const n of (Array.isArray(list) ? list : [])) {
            // accept plain names OR {object, reason} entries (skips carry a reason)
            const name = (n && typeof n === 'object') ? (n.object ?? n.Object ?? n.name ?? n.Name) : n;
            if (typeof name === 'string' && name.trim()) set.add(norm(name));
        }
        return set;
    };
    const ioActive = (f) => { const s = norm(f && f.Status); return s === '' || (s !== 'disabled' && s !== 'deprecated' && s !== 'inactive'); };
    const isWritable = (f) => {
        if (!f) return false;
        const has = (v) => typeof v === 'string' && v.trim().length > 0;
        const flag = (v) => v === true || norm(v) === 'true' || norm(v) === '1' || norm(v) === 'yes';
        return has(f.CreateAPIPath) || has(f.UpdateAPIPath) || has(f.DeleteAPIPath) || flag(f.SupportsCreate) || flag(f.SupportsUpdate) || flag(f.SupportsDelete);
    };
    const activeIOFields = ioRows.map((io) => (io && io.fields) ? io.fields : {}).filter((f) => f && f.Name && ioActive(f));
    const scopeReason = typeof a.coverageScopeReason === 'string' ? a.coverageScopeReason.trim() : '';

    // Behavioral coverage — every Active object covered (>=1 row) OR skipped OR (remainder) scope-reasoned.
    if (Array.isArray(a.coveredObjects)) {
        const covered = toNameSet(a.coveredObjects);
        const skipped = toNameSet(a.skippedObjects);
        const silent = activeIOFields.filter((f) => !covered.has(norm(f.Name)) && !skipped.has(norm(f.Name)));
        if (silent.length > 0 && !scopeReason) {
            failures.push({ rule: 'behavioral-coverage-silent-subset', detail: `hybrid-e2e covered ${covered.size}/${activeIOFields.length} active object(s); ${silent.length} were neither synced nor skipped nor scope-reasoned (first: ${silent.slice(0, 8).map((f) => f.Name).join(', ')}${silent.length > 8 ? ', …' : ''}). A silent subset is the convenient-subset duck — exercise them, mark per-object skipReasons, OR set assertions.coverageScopeReason (one line, e.g. Goldilocks-bounded representative streams) so the remainder is acknowledged, not hidden.` });
        }
    }

    // Write coverage — every WRITABLE object's write actually round-tripped OR skipped OR scope-reasoned.
    if (Array.isArray(a.exercisedWrites)) {
        const exercised = toNameSet(a.exercisedWrites);
        const skipped = toNameSet(a.skippedObjects);
        const writable = activeIOFields.filter(isWritable);
        const unproven = writable.filter((f) => !exercised.has(norm(f.Name)) && !skipped.has(norm(f.Name)));
        if (unproven.length > 0 && !scopeReason) {
            failures.push({ rule: 'write-coverage-unproven', detail: `${unproven.length}/${writable.length} writable object(s) declare a write capability whose path was never exercised by the e2e and is not skipped/scope-reasoned (first: ${unproven.slice(0, 8).map((f) => f.Name).join(', ')}${unproven.length > 8 ? ', …' : ''}). bijection proves the write COLUMNS exist; this proves the write WORKS. Round-trip a representative write, mark per-object skipReasons, OR set assertions.coverageScopeReason.` });
        }
    }
}

// ── EXTRACTION_REPORT_MATRIX.csv coverage + PK-defer rate (JS over cat'd bytes). ──
const emittedIOCount = Number.isInteger(extractStats.objectsExtracted)
    ? extractStats.objectsExtracted
    : (Array.isArray(extractStats.extractedObjects) ? extractStats.extractedObjects.length : 0);

if (matrixPath) {
    if (!fetched || !fetched.matrixReadable || typeof fetched.matrixContent !== 'string' || fetched.matrixContent.trim().length === 0) {
        failures.push({ rule: 'extraction-matrix-missing', detail: `EXTRACTION_REPORT_MATRIX.csv not readable at ${matrixPath}` });
    } else {
        // Parse the CSV in JS: first line is the header, remaining non-empty lines are rows.
        const lines = fetched.matrixContent.split('\n').map(l => l.replace(/\r$/, '')).filter(l => l.trim().length > 0);
        const header = lines.length > 0 ? lines[0].split(',').map(h => h.trim()) : [];
        const dataLines = lines.slice(1);
        const pkIdx = header.indexOf('PKVerdict');

        // (a) row-count vs emitted IOs.
        if (dataLines.length < emittedIOCount) {
            failures.push({ rule: 'extraction-matrix-row-missing', detail: `matrix has ${dataLines.length} row(s) but ${emittedIOCount} IO(s) were emitted` });
        }

        // (b) PK defer-rate: >50% of rows with PKVerdict=defer => producer was lazy.
        if (pkIdx >= 0 && dataLines.length > 0) {
            let deferCount = 0;
            for (const line of dataLines) {
                const cells = line.split(',');
                const verdictCell = (cells[pkIdx] ?? '').trim().toLowerCase();
                if (verdictCell === 'defer') deferCount += 1;
            }
            if (deferCount > dataLines.length / 2) {
                failures.push({ rule: 'pk-defer-rate-too-high', detail: `${deferCount}/${dataLines.length} matrix rows defer PK (>50%)` });
            }
        }
    }
}

phase('verdict');
// ── JS computes the final verdict. ──
const totalSlots = slots.length;
const gapsResidual = failures.filter(f => f.rule === 'slot-not-filled' || f.rule === 'unprovable-required').length;
const pass = failures.length === 0;

// Honest ceiling (#H9): a GREEN floor does NOT imply live content-verification — it must say WHAT it
// proved so the super-coordinator report can't narrate a credential-free build as fully proven.
// `live-content-verified` requires BOTH a live hybrid-e2e (creds present + mode==='live') AND the probe
// having content-verified (≥1 confirmed content read). Otherwise the ceiling is format-verified-no-creds.
const probeCeiling = journal.realityProbe?.achievedCeiling
    ?? (journal.realityProbe && Number(journal.realityProbe.confirmed) > 0 ? 'content-verified' : 'format-verified-no-creds');
const ranLiveE2E = !!(hybridE2E && hybridE2E.mode === 'live' && e2eHasCreds);
const achievedCeiling = (ranLiveE2E && probeCeiling === 'content-verified')
    ? 'live-content-verified'
    : 'format-verified-no-creds';

log(`floor-check: ${pass ? 'PASS' : 'FAIL'} — ${failures.length} failure(s) across ${totalSlots} slots (filled=${filled}, verified=${verified}, nullableSkipped=${nullableSkipped}); ceiling=${achievedCeiling}`);

return {
    pass,
    failures,
    summary: {
        totalSlots,
        filled,
        verified,
        nullableSkipped,
        gapsResidual,
        achievedCeiling,   // #H9 — 'live-content-verified' | 'format-verified-no-creds'
        ranLiveE2E,
        probeCeiling,
    },
};
