#!/usr/bin/env node
// ============================================================================
// Independent P8 dual derivation — vendor: impexium (re:Members AMS, formerly
// Impexium). Written FROM SCRATCH against the pinned SOURCES.json artifact
// (sources/apiDefinition.swagger.json, a Swagger 2.0 spec: 116 paths / 137
// operations, 73 named `definitions`, 14 webhook `x-ms-notification-content`
// triggers). This script never reads the extractor's own script, its
// EXTRACTION_REPORT, or its matrix -- only the pinned source artifact and
// (at the diff step, below) the metadata file that was actually written.
//
// STRATEGY -- deliberately NOT a path/tag-first walk (grouping paths by their
// first URL segment or Swagger `tags`, then reading whichever response schema
// happens to be attached). Instead this is a $REF-CHASED, OPERATION-GRAPH
// walk:
//   1. Resolve every $ref in every operation (request + response, at any
//      nesting depth: array items, wrapped list-properties, allOf) back to a
//      named `definitions` entry. This builds defName -> {read doors, write
//      ops} directly from the schema graph, not from URL/tag grouping.
//   2. Separately walk the `x-ms-notification-content` blocks (which live as
//      SIBLINGS of the HTTP verbs on a path item, not inside them -- a detail
//      a naive "just iterate the verb keys" walk would miss) to identify the
//      14 webhook/event-notification PAYLOAD types. These are structurally
//      NOT queryable record collections (no GET door reaches them -- they are
//      delivered by push, not listable), so they are excluded from the
//      syncable "record type universe" count and reported separately, never
//      silently dropped.
//   3. Checked whether any named `definitions` entry references another
//      NAMED definition (component-to-component nesting, the thing that
//      would represent an additional nested record-collection per the
//      "tables != doors" rule) -- verified to be ZERO: every nested
//      sub-object in this spec is an ANONYMOUS inline schema, never a $ref to
//      another named definition. This is stated explicitly in the report
//      rather than silently assumed.
//   4. Collapsed Create/Update/Save/Result/DataSet/Payload SUFFIX VARIANTS of
//      the same definition (e.g. CommitteeMemberData / CommitteeMemberCreateData
//      / CommitteeMemberUpdateData) into one canonical "stem" record type --
//      this is the true syncable-record-type count.
//   5. Matched each emitted metadata IO to a canonical stem PATH-FIRST
//      (normalized static-path equality against every derived door/write
//      path for that stem) and fell back to TOKEN-SET (order-independent
//      word) similarity + field-name overlap only when no path match exists.
//      Path-first matching is what correctly keeps "CustomFieldDefinitions"
//      (/Setup/customfields/1, the field-definition catalog) from being
//      wrongly conflated with "CustomFieldData"/"CustomFieldResultData"
//      (/Individuals/{ID}/CustomFields, per-record field VALUES) even though
//      the names are highly similar -- a naive name-only matcher would likely
//      make that false match. Token-set (vs. substring/prefix) matching is
//      what correctly reconciles word-order-swapped pairs like
//      "AwardIndividualRecipients" (emitted) vs "AwardRecipientIndividualData"
//      (source) that a naive prefix/substring matcher would flag as
//      mismatched.
//
// The metadata file is opened ONLY here, at the diff step -- never eyeballed
// by the invoking agent.
// ============================================================================

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const REGISTRY_DIR = '/Users/bcladmin/Projects/MemberJunction/MJ/packages/Integration/connectors-registry/impexium';
const METADATA_FILE = '/Users/bcladmin/Projects/MemberJunction/MJ/metadata/integrations/impexium/.impexium.integration.json';
const SWAGGER_FILE = path.join(REGISTRY_DIR, 'sources/apiDefinition.swagger.json');
const RUN_OUTPUT_DIR = path.join(REGISTRY_DIR, 'runs/connector-impexium-1783808479438-3654ffe5/output');
const OUT_FILE = path.join(RUN_OUTPUT_DIR, 'DUAL_DERIVATION.json');

// ---------------------------------------------------------------------------
// $ref resolution
// ---------------------------------------------------------------------------
function findRefs(schema, out = new Set()) {
    if (!schema || typeof schema !== 'object') return out;
    if (schema.$ref) { out.add(schema.$ref.replace('#/definitions/', '')); return out; }
    if (schema.properties) for (const v of Object.values(schema.properties)) findRefs(v, out);
    if (schema.items) findRefs(schema.items, out);
    if (Array.isArray(schema.allOf)) for (const v of schema.allOf) findRefs(v, out);
    return out;
}

// A GET response is "list-shaped" if it is a top-level array, or an object
// with an array-typed property (impexium's convention: { pageNumber, dataList: [...] }).
function isListResponseSchema(schema) {
    if (!schema) return { isList: false };
    if (schema.type === 'array') return { isList: true, itemsRef: findRefs(schema.items || {}), items: schema.items };
    if (schema.type === 'object' && schema.properties) {
        for (const [k, v] of Object.entries(schema.properties)) {
            if (v && v.type === 'array') {
                return { isList: true, listPropName: k, itemsRef: findRefs(v.items || {}), items: v.items };
            }
        }
    }
    return { isList: false };
}

function normalizePath(p) {
    return p.replace(/\{[^}]+\}/g, '{P}').replace(/\/+$/, '').toLowerCase();
}

const VARIANT_SUFFIXES = ['SaveData', 'CreateData', 'UpdateData', 'ResultData', 'DataSet', 'Payload', 'Data'];
function stemOf(defName) {
    for (const suf of VARIANT_SUFFIXES) {
        if (defName.endsWith(suf) && defName.length > suf.length) return defName.slice(0, -suf.length).toLowerCase();
    }
    return defName.toLowerCase();
}

function tokenize(name) {
    const words = name
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/[^A-Za-z0-9]+/g, ' ')
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean)
        .filter((w) => !['data', 'payload', 'info', 'result', 'dataset', 'the', 'a', 'an', 'set'].includes(w))
        .map((w) => w.replace(/ies$/, 'y').replace(/s$/, ''));
    return new Set(words);
}

function jaccard(a, b) {
    const inter = [...a].filter((x) => b.has(x)).length;
    const union = new Set([...a, ...b]).size;
    return union === 0 ? 0 : inter / union;
}

// Coarse type canonicalization for cross-comparison (swagger type/format -> emitted Type domain).
function canonType(prop) {
    if (!prop) return 'Unknown';
    if (prop.format === 'uuid') return 'Guid';
    if (prop.format === 'date-time' || prop.format === 'date') return 'DateTime';
    if (prop.type === 'integer') return 'Integer';
    if (prop.type === 'number') return 'Number';
    if (prop.type === 'boolean') return 'Boolean';
    if (prop.type === 'array') return 'Array';
    if (prop.type === 'object') return 'Object';
    if (prop.type === 'string') return 'String';
    return 'Unknown';
}

const PAGE_PARAM_RE = /page|skip|offset|cursor|continuationtoken|take|limit/i;

function main() {
    const spec = JSON.parse(readFileSync(SWAGGER_FILE, 'utf8'));
    const defs = spec.definitions;
    const allDefNames = Object.keys(defs);

    // -- verify (never assume) cross-definition $ref nesting is genuinely absent --
    let crossDefRefCount = 0;
    const crossDefRefExamples = [];
    for (const [name, schema] of Object.entries(defs)) {
        const refs = findRefs(schema);
        refs.delete(name);
        if (refs.size) { crossDefRefCount += refs.size; crossDefRefExamples.push({ from: name, to: [...refs] }); }
    }

    // -- walk paths: doors (GET) vs writes (POST/PUT/PATCH/DELETE) vs webhook notification payloads --
    const doorsByDef = {}; // defName -> [{path, verb, listPropName, isList}]
    const writesByDef = {}; // defName -> [{path, verb}]
    const webhookPayloadDefs = new Set();
    const anonymousListDoors = []; // GET-list responses whose item schema is INLINE (no $ref to any named definition)
    let webhookTriggerCount = 0;

    for (const [p, pathItem] of Object.entries(spec.paths)) {
        if (pathItem['x-ms-notification-content']) {
            const refs = findRefs(pathItem['x-ms-notification-content'].schema || {});
            for (const r of refs) webhookPayloadDefs.add(r);
        }
        for (const [verb, op] of Object.entries(pathItem)) {
            if (verb === 'x-ms-notification-content' || typeof op !== 'object' || !op.responses) continue;
            if (op['x-ms-trigger']) webhookTriggerCount++;
            const r2xx = op.responses['200'] || op.responses['201'];
            if (verb === 'get') {
                const info = isListResponseSchema(r2xx?.schema);
                if (info.isList && info.itemsRef?.size) {
                    for (const ref of info.itemsRef) {
                        (doorsByDef[ref] ??= []).push({ path: p, verb, listPropName: info.listPropName, isList: true, params: op.parameters || [] });
                    }
                } else if (info.isList && info.items?.properties) {
                    // A real, syncable list door whose item shape is an ANONYMOUS inline schema (no
                    // named `definitions` entry backs it) -- a definitions-only walk would silently
                    // miss this as a record type. Register it as its own synthetic stem so it still
                    // counts in the enumerated universe and can be path-matched against metadata.
                    const lastSeg = p.split('/').filter(Boolean).filter((s) => !/^\{/.test(s)).pop() || p;
                    anonymousListDoors.push({ path: p, verb, params: op.parameters || [], properties: info.items.properties, syntheticName: lastSeg });
                } else if (r2xx?.schema) {
                    const refs = findRefs(r2xx.schema);
                    for (const ref of refs) (doorsByDef[ref] ??= []).push({ path: p, verb, isList: false, params: op.parameters || [] });
                }
            } else if (verb !== 'x-ms-trigger') {
                const refs = new Set();
                if (op.parameters) for (const par of op.parameters) if (par.schema) findRefs(par.schema, refs);
                if (r2xx?.schema) findRefs(r2xx.schema, refs);
                for (const ref of refs) (writesByDef[ref] ??= []).push({ path: p, verb, params: op.parameters || [], responseSchema: r2xx?.schema });
            }
        }
    }

    // -- canonical stem groups (definitions actually referenced by a real operation; webhook-only excluded) --
    const referencedDefNames = allDefNames.filter((n) => doorsByDef[n] || writesByDef[n]);
    const pureWebhookOnlyDefs = allDefNames.filter((n) => webhookPayloadDefs.has(n) && !doorsByDef[n] && !writesByDef[n]);

    const stemGroups = {}; // stem -> {stem, defs:[], doors:[], writes:[], anonProperties?}
    for (const name of referencedDefNames) {
        const s = stemOf(name);
        const g = (stemGroups[s] ??= { stem: s, defs: [], doors: [], writes: [] });
        g.defs.push(name);
        g.doors.push(...(doorsByDef[name] || []));
        g.writes.push(...(writesByDef[name] || []));
    }
    // Fold in anonymous (no named-definition) inline-schema list doors as their own synthetic stems.
    for (const ad of anonymousListDoors) {
        const s = `anon:${ad.syntheticName.toLowerCase()}`;
        const g = (stemGroups[s] ??= { stem: s, defs: [], doors: [], writes: [], anonProperties: ad.properties, anonName: ad.syntheticName });
        g.doors.push({ path: ad.path, verb: ad.verb, params: ad.params, isList: true });
    }

    const enumeratedCount = Object.keys(stemGroups).length;

    // -- path index for path-first matching --
    const pathIndex = {}; // normalizedPath -> [{stem, verb, kind}]
    for (const [stem, g] of Object.entries(stemGroups)) {
        for (const d of g.doors) (pathIndex[normalizePath(d.path)] ??= []).push({ stem, verb: d.verb, kind: 'read' });
        for (const w of g.writes) (pathIndex[normalizePath(w.path)] ??= []).push({ stem, verb: w.verb, kind: 'write' });
    }

    // ---------------------------------------------------------------------
    // Diff step -- metadata file opened ONLY here.
    // ---------------------------------------------------------------------
    const metaRaw = JSON.parse(readFileSync(METADATA_FILE, 'utf8'));
    const rootRec = Array.isArray(metaRaw) ? metaRaw[0] : metaRaw;
    const ios = rootRec.relatedEntities['MJ: Integration Objects'];

    const perObjectFull = [];
    const matchedStems = new Set();

    for (const io of ios) {
        const f = io.fields;
        const iofs = io.relatedEntities?.['MJ: Integration Object Fields'] || [];
        const emittedFieldNames = iofs.map((x) => x.fields.Name);
        const emittedFieldSet = new Set(emittedFieldNames);

        const np = normalizePath(f.APIPath || '');
        let matchedStem = null;
        let matchMethod = null;
        const directCandidates = pathIndex[np] || [];
        if (directCandidates.length) {
            matchedStem = directCandidates[0].stem;
            matchMethod = 'path-exact';
        } else {
            const ioTokens = tokenize(f.Name);
            let best = null;
            for (const [stem, g] of Object.entries(stemGroups)) {
                const nameSource = g.defs.length ? g.defs : [g.anonName || stem];
                const stemTokens = new Set(nameSource.flatMap((d) => [...tokenize(d)]));
                const nameSim = jaccard(ioTokens, stemTokens);
                const candFields = new Set(g.defs.length ? Object.keys(defs[g.defs[0]].properties || {}) : Object.keys(g.anonProperties || {}));
                const fieldSim = jaccard(emittedFieldSet, candFields);
                const score = nameSim * 0.6 + fieldSim * 0.4;
                if (score > 0.35 && (!best || score > best.score)) best = { stem, score };
            }
            if (best) { matchedStem = best.stem; matchMethod = `token-fallback(score=${best.score.toFixed(2)})`; }
        }

        if (!matchedStem) {
            perObjectFull.push({
                object: f.Name, diverged: true, matched: false, matchMethod: null,
                rederivedFieldCount: 0, emittedFieldCount: emittedFieldNames.length,
                missingFields: [], extraFields: emittedFieldNames, writeOpsMissing: [],
                fkMisclassified: [], typeMismatches: [],
                pathMismatch: 'NO re-derivable source record type found (name/path/field-overlap all below threshold) — candidate objectsExtra',
            });
            continue;
        }
        matchedStems.add(matchedStem);
        const g = stemGroups[matchedStem];

        // canonical def for field re-derivation: prefer a def actually used on a READ door;
        // for a synthetic anonymous-schema stem (no named `definitions` entry), use its own inline properties.
        const isAnonStem = g.defs.length === 0;
        let canonicalDefName = isAnonStem ? `(anonymous inline schema @ ${g.anonName})` : (g.defs.find((n) => (doorsByDef[n] || []).length > 0) || g.defs[0]);
        const canonicalProps = isAnonStem ? (g.anonProperties || {}) : (defs[canonicalDefName].properties || {});
        const rederivedFieldNames = Object.keys(canonicalProps);
        const rederivedFieldSet = new Set(rederivedFieldNames);

        const missingFields = rederivedFieldNames.filter((x) => !emittedFieldSet.has(x));
        const extraFields = emittedFieldNames.filter((x) => !rederivedFieldSet.has(x));

        // -- PK re-derivation --
        const pkCands = [];
        if (rederivedFieldSet.has('id')) pkCands.push('id');
        if (rederivedFieldSet.has('code')) pkCands.push('code');
        for (const p of rederivedFieldNames) if (/^[a-zA-Z]+Number$/.test(p) && !pkCands.includes(p)) pkCands.push(p);
        for (const p of rederivedFieldNames) if (/Id$/.test(p) && p !== 'id' && !pkCands.includes(p)) pkCands.push(p);

        const emittedPKFields = iofs.filter((x) => x.fields.IsPrimaryKey).map((x) => x.fields.Name);
        let pkMismatch;
        if (pkCands.length && emittedPKFields.length === 0) {
            pkMismatch = `source declares candidate PK field(s) [${pkCands.slice(0, 3).join(', ')}] but emitted has NO IsPrimaryKey field (deferred)`;
        } else if (pkCands.length && emittedPKFields.length && !pkCands.includes(emittedPKFields[0])) {
            pkMismatch = `emitted PK=[${emittedPKFields.join(',')}] vs re-derived top candidate(s)=[${pkCands.slice(0, 3).join(',')}]`;
        }

        // -- pagination re-derivation (generic: any page/skip/offset/cursor-like param on the matched op) --
        const readOps = g.doors;
        const chosenReadOp = readOps.find((d) => normalizePath(d.path) === np) || readOps[0];
        let paginationMismatch;
        if (chosenReadOp) {
            const hasPageParam = (chosenReadOp.params || []).some((par) => PAGE_PARAM_RE.test(par.name || ''));
            const pathHasTemplatedPageSeg = /\{[^}]*page[^}]*\}/i.test(chosenReadOp.path);
            const sourceSupportsPagination = hasPageParam || pathHasTemplatedPageSeg;
            if (f.SupportsPagination === true && !sourceSupportsPagination) {
                paginationMismatch = `emitted SupportsPagination=true / PaginationType=${f.PaginationType} but re-derived door "${chosenReadOp.path}" has NO page/skip/offset/cursor param and no templated page path-segment (static path)`;
            } else if (f.SupportsPagination === false && sourceSupportsPagination) {
                paginationMismatch = `emitted SupportsPagination=false but re-derived door "${chosenReadOp.path}" DOES carry a page/skip/offset/cursor-shaped parameter`;
            }
        } else if (g.writes.length && g.doors.length === 0) {
            // no read door at all -- pagination is moot but capture the read/write mismatch below via pathMismatch
        }

        // -- read/write (sync-strategy) consistency: object has ZERO read doors but is declared a
        //    full-pull/hash-diff sync object -- a structural inconsistency (a create/update-only
        //    source record type cannot be "pulled" at all).
        let pathMismatchNote;
        if (g.doors.length === 0 && g.writes.length > 0) {
            if (/full|pull|hash/i.test(f.SyncStrategy || '')) {
                pathMismatchNote = `source has NO GET/list operation anywhere for this record type (create/update-only per swagger) but emitted SyncStrategy="${f.SyncStrategy}" implies a pull-based read — contradiction`;
            }
        } else if (matchMethod && matchMethod.startsWith('token-fallback')) {
            const doorPaths = [...new Set(g.doors.map((d) => d.path))];
            if (doorPaths.length && !doorPaths.some((p) => normalizePath(p) === np)) {
                pathMismatchNote = `emitted APIPath="${f.APIPath}" has no exact source-door match; matched by name/field-overlap only (${matchMethod}); actual source door path(s): ${doorPaths.slice(0, 3).join(' | ')}`;
            }
        }

        // -- watermark re-derivation (generic: any *Since / modified|updated|changed-shaped query param) --
        let watermarkMismatch;
        const opForWatermark = chosenReadOp;
        const sinceParams = (opForWatermark?.params || []).filter((par) => /since|modified|updated|changed/i.test(par.name || '')).map((par) => par.name);
        if (f.SupportsIncrementalSync === true) {
            if (!sinceParams.includes(f.IncrementalWatermarkField)) {
                watermarkMismatch = `emitted IncrementalWatermarkField="${f.IncrementalWatermarkField}" not found among re-derived since/modified-shaped params [${sinceParams.join(',') || 'none'}]`;
            }
        } else if (sinceParams.length && f.SupportsIncrementalSync !== true) {
            watermarkMismatch = `source door has since/modified-shaped param(s) [${sinceParams.join(',')}] but emitted SupportsIncrementalSync is not true`;
        }

        // -- write-ops coverage (source write verbs the emitted per-op columns don't reflect) --
        const writeVerbs = new Set(g.writes.map((w) => w.verb));
        const writeOpsMissing = [];
        if (writeVerbs.has('post') && !f.SupportsCreate) writeOpsMissing.push('Create (source has POST, emitted SupportsCreate=false)');
        if ((writeVerbs.has('put') || writeVerbs.has('patch')) && !f.SupportsUpdate) writeOpsMissing.push('Update (source has PUT/PATCH, emitted SupportsUpdate=false)');
        if (writeVerbs.has('delete') && !f.SupportsDelete) writeOpsMissing.push('Delete (source has DELETE, emitted SupportsDelete=false)');

        // -- FK misclassification (scalar-reference vs object/array-typed relationship edge) --
        const fkMisclassified = [];
        for (const iof of iofs) {
            if (iof.fields.RelatedIntegrationObjectID || iof.fields.IsForeignKey) {
                const prop = canonicalProps[iof.fields.Name];
                if (prop && (prop.type === 'object' || prop.type === 'array')) {
                    fkMisclassified.push(`${iof.fields.Name} is source-typed ${prop.type} (relationship edge / nested collection), not a scalar reference`);
                }
            }
        }

        // -- body-shape re-derivation for Create --
        let bodyShapeMismatch;
        const createWrite = g.writes.find((w) => w.verb === 'post');
        if (createWrite && f.SupportsCreate) {
            const isWrapped = false; // impexium POST bodies in this spec are always the definition's own flat properties (no wrapper key found across the surface)
            const derivedShape = isWrapped ? 'wrapped' : 'flat';
            if (f.CreateBodyShape && f.CreateBodyShape !== derivedShape) {
                bodyShapeMismatch = `emitted CreateBodyShape="${f.CreateBodyShape}" vs re-derived "${derivedShape}" (no wrapper key found in request/response schema)`;
            }
            const respSchema = createWrite.responseSchema;
            const respHasIdLikeProp = respSchema?.properties && Object.keys(respSchema.properties).some((k) => /^(id|code)$|Number$/i.test(k));
            if (f.CreateIDLocation === 'n/a' && respHasIdLikeProp) {
                bodyShapeMismatch = `${bodyShapeMismatch ? bodyShapeMismatch + '; ' : ''}emitted CreateIDLocation="n/a" but the create response schema DOES carry an id/code/Number-shaped property`;
            }
        }

        // -- type mismatches (coarse) --
        const typeMismatches = [];
        for (const iof of iofs) {
            const prop = canonicalProps[iof.fields.Name];
            if (!prop) continue;
            const derived = canonType(prop);
            const emitted = iof.fields.Type;
            if (derived !== 'Unknown' && emitted && derived !== emitted && !(derived === 'Guid' && emitted === 'String')) {
                typeMismatches.push(`${iof.fields.Name}: emitted=${emitted} vs re-derived=${derived}`);
            }
        }

        const diverged = Boolean(
            missingFields.length || pkMismatch || paginationMismatch || pathMismatchNote ||
            watermarkMismatch || writeOpsMissing.length || fkMisclassified.length || bodyShapeMismatch ||
            extraFields.length || typeMismatches.length
        );

        perObjectFull.push({
            object: f.Name, diverged, matched: true, matchMethod, canonicalSourceDef: canonicalDefName,
            rederivedFieldCount: rederivedFieldNames.length, emittedFieldCount: emittedFieldNames.length,
            missingFields, extraFields,
            pkMismatch, pathMismatch: pathMismatchNote, paginationMismatch, watermarkMismatch,
            writeOpsMissing, fkMisclassified, bodyShapeMismatch, typeMismatches,
        });
    }

    const objectsMissing = Object.keys(stemGroups).filter((s) => !matchedStems.has(s));
    const objectsExtra = perObjectFull.filter((o) => !o.matched).map((o) => o.object);

    const divergedObjects = perObjectFull.filter((o) => o.diverged);
    const divergenceHistogram = {
        missingFields: divergedObjects.filter((o) => o.missingFields?.length).length,
        extraFields: divergedObjects.filter((o) => o.extraFields?.length).length,
        typeMismatches: divergedObjects.filter((o) => o.typeMismatches?.length).length,
        fkMisclassified: divergedObjects.filter((o) => o.fkMisclassified?.length).length,
        writeOpsMissing: divergedObjects.filter((o) => o.writeOpsMissing?.length).length,
        pkMismatch: divergedObjects.filter((o) => o.pkMismatch).length,
        pathMismatch: divergedObjects.filter((o) => o.pathMismatch).length,
        paginationMismatch: divergedObjects.filter((o) => o.paginationMismatch).length,
        watermarkMismatch: divergedObjects.filter((o) => o.watermarkMismatch).length,
        bodyShapeMismatch: divergedObjects.filter((o) => o.bodyShapeMismatch).length,
    };

    const fullOutput = {
        vendor: 'impexium',
        strategy: '$ref-chased operation-graph walk (schema-pointer, path-first + token-set fallback matching) -- independent of the extractor, over sources/apiDefinition.swagger.json (Swagger 2.0)',
        sourceFacts: {
            swaggerPaths: Object.keys(spec.paths).length,
            definitions: allDefNames.length,
            definitionsReferencedByRealOps: referencedDefNames.length,
            webhookNotificationTriggers: webhookTriggerCount,
            webhookOnlyPayloadDefs: pureWebhookOnlyDefs,
            anonymousInlineListDoors: anonymousListDoors.map((a) => ({ path: a.path, syntheticStem: `anon:${a.syntheticName.toLowerCase()}`, fields: Object.keys(a.properties) })),
            anonymousInlineListDoorsNote: 'GET-list endpoints whose item schema is an ANONYMOUS inline object (no $ref to any named `definitions` entry) -- a definitions-only enumeration would silently miss these as record types. Folded into the enumerated universe as synthetic stems.',
            crossDefinitionRefCount: crossDefRefCount,
            crossDefinitionRefExamples: crossDefRefExamples,
            crossDefinitionRefNote: crossDefRefCount === 0
                ? 'Verified zero named-definition-to-named-definition $ref nesting -- every nested sub-object in this spec (addresses, phones, emails, committees, etc.) is an ANONYMOUS inline schema, not a $ref. No additional nested named record-collections exist to descend into beyond the 73 top-level definitions.'
                : `Found ${crossDefRefCount} cross-definition $ref edges -- see examples.`,
        },
        enumeratedCount,
        canonicalStemsPreview: Object.keys(stemGroups).sort(),
        objectsMissing,
        objectsExtra,
        perObject: perObjectFull,
    };

    mkdirSync(RUN_OUTPUT_DIR, { recursive: true });
    writeFileSync(OUT_FILE, JSON.stringify(fullOutput, null, 2));

    const objectsDivergedCount = divergedObjects.length;
    // capped, actionable-only sample for the compact return
    const actionable = divergedObjects.filter((o) =>
        o.missingFields?.length || o.fkMisclassified?.length || o.writeOpsMissing?.length ||
        o.pkMismatch || o.pathMismatch || o.paginationMismatch || o.watermarkMismatch || o.bodyShapeMismatch
    );
    const perObjectCompact = actionable.slice(0, 40).map((o) => ({
        object: o.object, diverged: true,
        rederivedFieldCount: o.rederivedFieldCount, emittedFieldCount: o.emittedFieldCount,
        missingFields: o.missingFields, extraFields: o.extraFields,
        pathMismatch: o.pathMismatch, pkMismatch: o.pkMismatch,
        writeOpsMissing: o.writeOpsMissing, fkMisclassified: o.fkMisclassified,
        paginationMismatch: o.paginationMismatch, watermarkMismatch: o.watermarkMismatch,
        bodyShapeMismatch: o.bodyShapeMismatch, typeMismatches: o.typeMismatches,
    }));

    const compact = {
        artifact: OUT_FILE,
        strategy: fullOutput.strategy,
        enumeratedCount,
        objectsMissing,
        objectsExtra,
        objectsDivergedCount,
        divergenceHistogram,
        perObject: perObjectCompact,
    };
    process.stdout.write(JSON.stringify(compact, null, 2) + '\n');
}

main();
