#!/usr/bin/env node
// scripts/dual-derive.mjs — SECOND, INDEPENDENT derivation for higherlogic-thrive (P8 dual-derivation).
//
// STRATEGY (deliberately different from a JSON-tree-walk over the extractor's own pre-parsed
// sources/op-details.json): this script re-derives EVERYTHING directly from the raw vendor HTML
// pages under sources/ops/*.html using a cheerio DOM-table parse — never touching op-details.json,
// the extractor script, its EXTRACTION_REPORT, or its matrix. It:
//   1. Walks all 236 raw per-operation HelpPage HTML files (ASP.NET Web API HelpPage format).
//   2. Extracts, per operation, via direct DOM table structure (not regex-over-JSON):
//        - method + path (from the <h1>), URI params, body params + body model fields,
//        - the "Resource Description" response table -> {modelName, isCollection, fields[]}.
//   3. Builds a model -> fields graph AND a model -> referenced-model graph (from field <a> links
//      to /Help/ResourceModel?modelName=X, both "Collection of X" and singular X refs) and BFS-
//      descends it from every top-level response model to enumerate the full syncable record-type
//      universe (mirrors the "descend the type graph for nested collections" instruction).
//   4. Independently classifies PK candidates (GUID-typed "<Name>Key" fields), FK candidates
//      (GUID-typed "<X>Key" fields that match another enumerated model's own PK field name),
//      pagination params (uriParam names actually present per op, vs None), watermark params
//      (uriParams named like modifiedDateTime/dateModified/since), and write-op body shape
//      (flat vs wrapped, from the body sample JSON literally being top-level keys of the model).
//   5. ONLY at the very end does it open the already-written metadata file (the one and only
//      permitted read of authored output) to diff against it.
//
// Output: full lossless per-object result -> ../runs/<runID>/output/DUAL_DERIVATION.json
//         compact summary -> stdout (consumed by the caller).

import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { existsSync } from 'node:fs';
import path from 'node:path';
import * as cheerio from 'cheerio';

const VENDOR_DIR = path.resolve(new URL('.', import.meta.url).pathname, '..');
const OPS_DIR = path.join(VENDOR_DIR, 'sources', 'ops');
const METADATA_FILE = path.resolve(
    VENDOR_DIR, '..', '..', '..', '..', 'metadata', 'integrations', 'higherlogic-thrive',
    '.higherlogic-thrive.integration.json',
);
const RUN_ID = 'connector-higherlogic-thrive-1783530972914-6940db01';
const OUTPUT_DIR = path.join(VENDOR_DIR, 'runs', RUN_ID, 'output');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'DUAL_DERIVATION.json');

const STRATEGY = 'cheerio-DOM-table-parse-of-raw-HelpPage-HTML (not a JSON-tree-walk over the ' +
    'extractor\'s pre-parsed op-details.json) + BFS descent of the model/field <a>-link reference ' +
    'graph from every top-level response model to enumerate the syncable record-type universe.';

// ────────────────────────────────────────────────────────────────────────────
// 1. Load + parse every raw op HTML page
// ────────────────────────────────────────────────────────────────────────────

function listOpFiles() {
    return readdirSync(OPS_DIR)
        .filter((f) => f.endsWith('.html'))
        .filter((f) => !f.startsWith('ResourceModel-'));
}

function typeCellToRef($, cell) {
    // Returns { raw, isCollection, modelName|null }
    const raw = $(cell).text().replace(/\s+/g, ' ').trim();
    const link = $(cell).find('a[href*="ResourceModel?modelName="]').first();
    let modelName = null;
    if (link.length) {
        const href = link.attr('href') || '';
        const m = href.match(/modelName=([A-Za-z0-9_]+)/);
        modelName = m ? m[1] : link.text().trim();
    }
    const isCollection = /^Collection of/i.test(raw);
    return { raw, isCollection, modelName };
}

function parseFieldTable($, table) {
    const fields = [];
    $(table).find('tbody tr').each((_, tr) => {
        const tds = $(tr).find('td');
        if (tds.length < 3) return;
        const name = $(tds[0]).text().trim();
        const description = $(tds[1]).text().replace(/\s+/g, ' ').trim();
        const typeInfo = typeCellToRef($, tds[2]);
        const annotations = $(tds[3]).text().replace(/\s+/g, ' ').trim();
        if (name) fields.push({ name, description, typeInfo, annotations });
    });
    return fields;
}

function findSectionTable($, headingText) {
    // Locate an <h3>{headingText}</h3> and return the model-link (if any) + the next
    // <table class="help-page-table"> that follows it, stopping at the next h2/h3.
    let modelName = null;
    let isCollection = false;
    let table = null;
    $('h3').each((_, h3el) => {
        if ($(h3el).text().trim() !== headingText) return;
        let node = $(h3el).next();
        let hops = 0;
        while (node.length && hops < 12) {
            hops++;
            if (node.is('h2') || node.is('h3')) break;
            // The model-name <a> is sometimes a bare sibling node itself (not wrapped in a
            // container), e.g. `<p></p><a href="...">Contact</a>    <table>...` — so check both
            // "node IS the anchor" and "node CONTAINS the anchor as a descendant".
            const isAnchorItself = node.is('a[href*="ResourceModel?modelName="]');
            const linkHere = isAnchorItself ? node : node.find('a[href*="ResourceModel?modelName="]').first();
            if (linkHere.length && !modelName) {
                const href = linkHere.attr('href') || '';
                const m = href.match(/modelName=([A-Za-z0-9_]+)/);
                modelName = m ? m[1] : linkHere.text().trim();
                // "Collection of " often precedes the <a> as a loose TEXT node sibling (not
                // wrapped in any element), so it won't show up in node.text() when node IS the
                // anchor itself — walk the raw domhandler .prev chain to find it.
                let collectionText = node.text();
                if (isAnchorItself) {
                    let rawPrev = node[0].prev;
                    let hops2 = 0;
                    while (rawPrev && hops2 < 4) {
                        if (rawPrev.type === 'text' && rawPrev.data && rawPrev.data.trim()) {
                            collectionText = rawPrev.data + collectionText;
                            break;
                        }
                        rawPrev = rawPrev.prev;
                        hops2++;
                    }
                }
                isCollection = /Collection of/i.test(collectionText);
            }
            if (node.is('table') && node.hasClass('help-page-table') && !table) {
                table = node;
                break;
            }
            node = node.next();
        }
    });
    return { modelName, isCollection, table };
}

function parseOpFile(filename) {
    const html = readFileSync(path.join(OPS_DIR, filename), 'utf8');
    const $ = cheerio.load(html);
    const h1 = $('h1').first().text().trim();
    const m = h1.match(/^(GET|POST|PUT|DELETE|PATCH)\s+(.+)$/i);
    const method = m ? m[1].toUpperCase() : (filename.split('-')[0] === filename ? 'GET' : filename.split('-')[0]);
    const fullPathWithQuery = m ? m[2] : h1;
    const pathOnly = fullPathWithQuery.split('?')[0];

    // URI parameters
    const uriSection = findSectionTable($, 'URI Parameters');
    const uriParams = uriSection.table ? parseFieldTable($, uriSection.table) : [];

    // Body parameters
    const bodySection = findSectionTable($, 'Body Parameters');
    const bodyFields = bodySection.table ? parseFieldTable($, bodySection.table) : [];
    const bodyModelName = bodySection.modelName;

    // Resource Description (response)
    const respSection = findSectionTable($, 'Resource Description');
    const respFields = respSection.table ? parseFieldTable($, respSection.table) : [];
    const respModelName = respSection.modelName;
    const respIsCollection = respSection.isCollection;

    // Request Formats sample (to detect flat vs wrapped body shape)
    let bodySampleIsFlat = null;
    const reqSampleBlock = $('h3:contains("Request Formats")').nextAll('div').first();
    const jsonPre = reqSampleBlock.find('pre.wrapped').first().text().trim();
    if (jsonPre && bodyFields.length) {
        try {
            const sample = JSON.parse(jsonPre);
            const topKeys = Object.keys(sample);
            const bodyFieldNames = new Set(bodyFields.map((f) => f.name));
            const overlap = topKeys.filter((k) => bodyFieldNames.has(k)).length;
            bodySampleIsFlat = overlap >= Math.max(1, Math.floor(bodyFieldNames.size * 0.5));
        } catch { /* non-JSON sample (e.g. XML-only or empty) — leave undetermined */ }
    }

    // Response header location hint (201 Location) — HelpPage doesn't show status codes, so this
    // stays undetermined here; IDLocation is derived from body-field presence of an ID-shaped field.
    const idLikeRespField = respFields.find((f) => /Key$/.test(f.name) && /globally unique identifier/i.test(f.typeInfo.raw));

    return {
        filename,
        controller: filename.replace(/^(GET|POST|PUT|DELETE|PATCH)-api-v2\.0-/, '').split('-')[0],
        method,
        path: pathOnly,
        uriParams,
        bodyModelName,
        bodyFields,
        bodySampleIsFlat,
        respModelName,
        respIsCollection,
        respFields,
        idLikeRespField: idLikeRespField ? idLikeRespField.name : null,
    };
}

// ────────────────────────────────────────────────────────────────────────────
// 2. Build model -> fields graph + model -> referenced-model graph; BFS enumerate
// ────────────────────────────────────────────────────────────────────────────

function buildModelGraph(ops) {
    const modelFields = new Map(); // modelName -> Map(fieldName -> typeInfo/description) [merged across ops]
    const modelRefs = new Map(); // modelName -> Set(referencedModelName)
    const modelTopLevelOps = new Map(); // modelName -> [{op, isCollection}]

    function ensureModel(name) {
        if (!modelFields.has(name)) modelFields.set(name, new Map());
        if (!modelRefs.has(name)) modelRefs.set(name, new Set());
    }

    for (const op of ops) {
        if (op.respModelName) {
            ensureModel(op.respModelName);
            for (const f of op.respFields) {
                modelFields.get(op.respModelName).set(f.name, f);
                if (f.typeInfo.modelName) {
                    ensureModel(f.typeInfo.modelName);
                    modelRefs.get(op.respModelName).add(f.typeInfo.modelName);
                }
            }
            if (!modelTopLevelOps.has(op.respModelName)) modelTopLevelOps.set(op.respModelName, []);
            modelTopLevelOps.get(op.respModelName).push({ op: `${op.method} ${op.path}`, isCollection: op.respIsCollection });
        }
        if (op.bodyModelName) {
            ensureModel(op.bodyModelName);
            for (const f of op.bodyFields) {
                if (!modelFields.get(op.bodyModelName).has(f.name)) modelFields.get(op.bodyModelName).set(f.name, f);
                if (f.typeInfo.modelName) {
                    ensureModel(f.typeInfo.modelName);
                    modelRefs.get(op.bodyModelName).add(f.typeInfo.modelName);
                }
            }
        }
    }
    return { modelFields, modelRefs, modelTopLevelOps };
}

// The record-type universe = every model reachable (BFS) from a top-level, collection-typed
// response model (a "table" a sync can iterate) OR a top-level singular response model that is
// itself the sole product of a Get-by-key operation (also a syncable single-row table, e.g.
// Contact). Nested-only models (Address, Education, WorkExperience, Profile, ...) are still
// enumerated as part of the universe (they are real record shapes, per the "descend the type
// graph" instruction) but flagged nestedOnly:true since they carry no independent GetXxx door.
function enumerateUniverse(graph) {
    const { modelFields, modelRefs, modelTopLevelOps } = graph;
    const topLevelModels = new Set(modelTopLevelOps.keys());
    const visited = new Set();
    const queue = [...topLevelModels];
    while (queue.length) {
        const m = queue.shift();
        if (visited.has(m)) continue;
        visited.add(m);
        for (const ref of (modelRefs.get(m) || [])) {
            if (!visited.has(ref)) queue.push(ref);
        }
    }
    const universe = [...visited].sort();
    return universe.map((name) => ({
        name,
        nestedOnly: !topLevelModels.has(name),
        fieldCount: (modelFields.get(name) || new Map()).size,
        topLevelOps: (modelTopLevelOps.get(name) || []).map((o) => o.op),
    }));
}

// ────────────────────────────────────────────────────────────────────────────
// 3. Independent PK/FK/pagination/watermark/bodyshape classification per model
// ────────────────────────────────────────────────────────────────────────────

function classifyModel(modelName, fields, allModelNames, ops) {
    const fieldNames = [...fields.keys()];
    // PK candidate: GUID-typed field named "<X>Key" where X relates to the model name, OR
    // (fallback) the singular GUID "<...>Key" field most likely to be the identity — HelpPage
    // tables don't mark PK explicitly, so this is a naming+type inference, same discipline as
    // the vendor-wide universalPK convention.
    const guidKeyFields = fieldNames.filter((n) => {
        const f = fields.get(n);
        return /Key$/.test(n) && /globally unique identifier/i.test(f.typeInfo.raw);
    });
    let pkCandidates = guidKeyFields.filter((n) => n.toLowerCase() === `${modelName.toLowerCase()}key`);
    if (pkCandidates.length === 0 && guidKeyFields.length > 0) pkCandidates = [guidKeyFields[0]];

    // FK candidates: GUID "<X>Key" fields (excluding the PK itself) whose "<X>" matches another
    // enumerated model's singular name (case-insensitive) — a SCALAR reference to another
    // object's PK, never a field whose type itself IS another model (that's an access-path/nested
    // ref, tracked separately as modelRefs, not an FK).
    const fkCandidates = [];
    for (const n of guidKeyFields) {
        if (pkCandidates.includes(n)) continue;
        const stem = n.replace(/Key$/, '');
        const match = allModelNames.find((m) => m.toLowerCase() === stem.toLowerCase());
        if (match) fkCandidates.push({ field: n, targetModel: match });
    }

    // Pagination + watermark params: derived from the actual uriParams of ops whose respModelName
    // (or collection-of) resolves to this model DIRECTLY, OR whose top-level response is a
    // CONTAINER-FOLDED wrapper (e.g. "PaginatedAnswers" wrapping a "Collection of Answer" field) —
    // the vendor commonly returns a paged-envelope model whose OWN nested field is the collection
    // of the record type; that envelope's uriParams are the real pagination/watermark params for
    // this model, so both direct and folded-container ops must be considered "relevant".
    const relevantOps = ops.filter((o) =>
        // direct top-level match — collection-typed (a GetXxxs list) OR a singular "page" wrapper
        // object that IS itself the paged container (e.g. "ContactDataPage" with RecordCount +
        // ContinuationToken fields) rather than a bare single-record GET-by-key response.
        o.respModelName === modelName ||
        o.respFields.some((f) => f.typeInfo.modelName === modelName && f.typeInfo.isCollection));
    // Params can live in the URI (GET) OR the POST body (this vendor mixes both — e.g.
    // GetCommunityMembers is a POST whose pagination field "StartRecord" is a BODY param).
    const allParamNames = new Set();
    for (const o of relevantOps) {
        for (const p of o.uriParams) allParamNames.add(p.name);
        for (const p of o.bodyFields) allParamNames.add(p.name);
    }
    // Cursor pagination here takes several vendor-idiomatic shapes beyond the generic
    // maxResults/page/skip family: after<X>Key / before<X>Key cursor pairs, a bare "limit" or
    // "numberToReturn" cap, and StartRecord for classic offset paging.
    const paginationParams = [...allParamNames].filter((n) =>
        /^(maxResults|maxRecords|maxToRetrieve|numberToReturn|page|pageNumber|pageSize|skip|top|continuationToken|offset|limit|startrecord)$/i.test(n) ||
        /^(after|before)[A-Z]/i.test(n));
    const watermarkParams = [...allParamNames].filter((n) => /(modifiedDateTime|modifiedSince|dateModified|updatedSince|lastModified|changedSince)/i.test(n));

    return {
        pkCandidates,
        fkCandidates,
        paginationParams,
        watermarkParams,
        relevantOpPaths: relevantOps.map((o) => `${o.method} ${o.path}`),
    };
}

// ────────────────────────────────────────────────────────────────────────────
// 4. Write-op re-derivation (Create/Update/Delete path + method + body shape + ID location)
// ────────────────────────────────────────────────────────────────────────────

function rederiveWriteOps(modelName, ops, graph) {
    // Heuristic: a write op's controller/body model overlaps with this model's own top-level GET
    // door controller, OR its bodyModelName / respModelName equals this model name.
    const related = ops.filter((o) =>
        o.bodyModelName === modelName || o.respModelName === modelName ||
        (o.bodyModelName && o.bodyModelName.startsWith(modelName)) );
    const creates = related.filter((o) => o.method === 'POST' && o.bodyFields.length > 0);
    const updates = related.filter((o) => (o.method === 'PUT' || (o.method === 'POST' && /edit|update|save/i.test(o.path))) && o.bodyFields.length > 0);
    const deletes = related.filter((o) => o.method === 'DELETE' || /delete|remove|withdraw/i.test(o.path));
    return {
        createOps: creates.map((o) => ({ path: o.path, method: o.method, bodyShapeFlat: o.bodySampleIsFlat })),
        updateOps: updates.map((o) => ({ path: o.path, method: o.method, bodyShapeFlat: o.bodySampleIsFlat })),
        deleteOps: deletes.map((o) => ({ path: o.path, method: o.method })),
    };
}

// ────────────────────────────────────────────────────────────────────────────
// 5. Metadata diff (the ONLY permitted read of authored output — final step only)
// ────────────────────────────────────────────────────────────────────────────

function loadMetadataIOs() {
    const raw = JSON.parse(readFileSync(METADATA_FILE, 'utf8'));
    const top = Array.isArray(raw) ? raw[0] : raw;
    const ios = top?.relatedEntities?.['MJ: Integration Objects'] ?? [];
    return ios.map((io) => {
        const f = io.fields;
        let config = {};
        try { config = typeof f.Configuration === 'string' ? JSON.parse(f.Configuration) : (f.Configuration || {}); } catch { /* ignore */ }
        const iofs = (io.relatedEntities?.['MJ: Integration Object Fields'] ?? []).map((x) => x.fields);
        return {
            Name: f.Name,
            APIPath: f.APIPath,
            PaginationType: f.PaginationType,
            IncrementalWatermarkField: f.IncrementalWatermarkField,
            SupportsCreate: !!f.SupportsCreate,
            SupportsUpdate: !!f.SupportsUpdate,
            SupportsDelete: !!f.SupportsDelete,
            CreateBodyShape: f.CreateBodyShape,
            UpdateBodyShape: f.UpdateBodyShape,
            CreateIDLocation: f.CreateIDLocation,
            sourceModel: config.sourceModel || null,
            fields: iofs.map((x) => ({ Name: x.Name, IsPrimaryKey: !!x.IsPrimaryKey, IsForeignKey: !!x.IsForeignKey, RelatedIntegrationObjectID: x.RelatedIntegrationObjectID || null, Type: x.Type })),
        };
    });
}

function normalizePath(p) {
    if (!p) return '';
    // Strip a leading "METHOD " token (candidate paths are formatted "GET api/v2.0/...") before
    // stripping the api/ prefix and leading slash — without this, EVERY candidate compares unequal
    // to the emitted (method-less) APIPath and pathMismatch fires as a false positive on every row.
    const noMethod = p.replace(/^(GET|POST|PUT|DELETE|PATCH)\s+/i, '');
    return noMethod.replace(/^\/?api\//i, '').replace(/^\//, '').split('?')[0].toLowerCase();
}

// ────────────────────────────────────────────────────────────────────────────
// main
// ────────────────────────────────────────────────────────────────────────────

function main() {
    const files = listOpFiles();
    const ops = files.map(parseOpFile);
    const graph = buildModelGraph(ops);
    const universe = enumerateUniverse(graph);
    const allModelNames = universe.map((u) => u.name);

    const modelDerivations = new Map();
    for (const u of universe) {
        const fields = graph.modelFields.get(u.name) || new Map();
        const classification = classifyModel(u.name, fields, allModelNames, ops);
        const writeOps = rederiveWriteOps(u.name, ops, graph);
        modelDerivations.set(u.name, {
            ...u,
            fields: [...fields.keys()],
            ...classification,
            ...writeOps,
        });
    }

    // ── Metadata diff ──
    const metaIOs = loadMetadataIOs();
    const emittedObjectNames = new Set(); // by sourceModel when available, else by IO Name
    const bySourceModel = new Map();
    for (const io of metaIOs) {
        const key = io.sourceModel || io.Name;
        bySourceModel.set(key, io);
        emittedObjectNames.add(key);
    }

    // Object-set diff: source-derived universe (top-level, non-nested-only models — the syncable
    // doors) vs emitted IOs. Nested-only shapes (Address, Education, ...) are NOT expected to be
    // their own IOs (they're embedded/associated data), so exclude them from the objectsMissing
    // check to avoid false positives — they ARE reported in the artifact for completeness.
    const syncableUniverse = universe.filter((u) => !u.nestedOnly);
    const syncableNames = new Set(syncableUniverse.map((u) => u.name));

    const objectsMissing = [...syncableNames].filter((n) => !emittedObjectNames.has(n)).sort();
    const objectsExtra = [...emittedObjectNames].filter((n) => !syncableNames.has(n) && !allModelNames.includes(n)).sort();

    const perObjectFull = [];
    const histogram = {
        missingFields: 0, extraFields: 0, typeMismatches: 0, fkMisclassified: 0,
        writeOpsMissing: 0, pkMismatch: 0, pathMismatch: 0, paginationMismatch: 0,
        watermarkMismatch: 0, bodyShapeMismatch: 0,
    };
    let objectsDivergedCount = 0;

    for (const io of metaIOs) {
        const key = io.sourceModel || io.Name;
        const derived = modelDerivations.get(key);
        const entry = {
            object: io.Name, diverged: false,
            rederivedFieldCount: derived ? derived.fields.length : 0,
            emittedFieldCount: io.fields.length,
            missingFields: [], extraFields: [], writeOpsMissing: [], fkMisclassified: [], typeMismatches: [],
        };
        if (!derived) {
            entry.diverged = true;
            entry.missingFields = ['<no independently-derived model matched this IO — sourceModel/name not found in re-derived universe>'];
            perObjectFull.push(entry);
            objectsDivergedCount++;
            histogram.missingFields++;
            continue;
        }

        const derivedFieldSet = new Set(derived.fields);
        const emittedFieldSet = new Set(io.fields.map((f) => f.Name));
        entry.missingFields = derived.fields.filter((f) => !emittedFieldSet.has(f));
        entry.extraFields = io.fields.map((f) => f.Name).filter((f) => !derivedFieldSet.has(f));

        // path
        if (io.APIPath && derived.relevantOpPaths.length) {
            const emittedNorm = normalizePath(io.APIPath);
            const anyMatch = derived.relevantOpPaths.some((p) => normalizePath(p) === emittedNorm);
            if (!anyMatch) entry.pathMismatch = `emitted='${io.APIPath}' rederivedCandidates=${JSON.stringify(derived.relevantOpPaths)}`;
        }

        // PK
        const emittedPKs = io.fields.filter((f) => f.IsPrimaryKey).map((f) => f.Name);
        if (derived.pkCandidates.length && emittedPKs.length) {
            const overlap = derived.pkCandidates.some((c) => emittedPKs.includes(c));
            if (!overlap) entry.pkMismatch = `emitted=${JSON.stringify(emittedPKs)} rederived=${JSON.stringify(derived.pkCandidates)}`;
        }

        // FK misclassification: emitted IsForeignKey=true fields whose name does NOT appear as one
        // of our independently-derived scalar FK candidates AND whose name matches a nested-ref
        // model field (i.e. it looks like it was really an access-path/object-typed field, not a
        // scalar FK) — flagged conservatively (both derivations must have a basis to compare).
        const derivedFKNames = new Set(derived.fkCandidates.map((c) => c.field));
        for (const f of io.fields.filter((x) => x.IsForeignKey)) {
            if (!derivedFKNames.has(f.Name) && !/Key$/.test(f.Name)) {
                entry.fkMisclassified.push(f.Name);
            }
        }

        // write ops
        if (io.SupportsCreate && derived.createOps.length === 0) entry.writeOpsMissing.push('Create');
        if (io.SupportsUpdate && derived.updateOps.length === 0) entry.writeOpsMissing.push('Update');
        if (io.SupportsDelete && derived.deleteOps.length === 0) entry.writeOpsMissing.push('Delete');

        // pagination
        if (io.PaginationType && io.PaginationType !== 'None' && derived.paginationParams.length === 0) {
            entry.paginationMismatch = `emitted PaginationType='${io.PaginationType}' but no pagination-shaped uriParam re-derived (relevantOps=${JSON.stringify(derived.relevantOpPaths)})`;
        }

        // watermark
        if (io.IncrementalWatermarkField && derived.watermarkParams.length === 0) {
            entry.watermarkMismatch = `emitted IncrementalWatermarkField='${io.IncrementalWatermarkField}' but no watermark-shaped uriParam re-derived`;
        }

        // body shape
        const flatCreates = derived.createOps.filter((c) => c.bodyShapeFlat === true).length;
        const wrappedCreates = derived.createOps.filter((c) => c.bodyShapeFlat === false).length;
        if (io.CreateBodyShape === 'flat' && wrappedCreates > flatCreates && derived.createOps.length) {
            entry.bodyShapeMismatch = `emitted CreateBodyShape='flat' but re-derived sample suggests wrapped`;
        } else if (io.CreateBodyShape === 'wrapped' && flatCreates > wrappedCreates && derived.createOps.length) {
            entry.bodyShapeMismatch = `emitted CreateBodyShape='wrapped' but re-derived sample suggests flat`;
        }

        // type mismatches (best-effort — HelpPage type strings vs emitted MJ Type)
        for (const f of io.fields) {
            const fname = f.Name;
            const rederivedField = (graph.modelFields.get(key) || new Map()).get(fname);
            if (!rederivedField) continue;
            const rawType = rederivedField.typeInfo.raw.toLowerCase();
            const emitted = (f.Type || '').toLowerCase();
            const guidLike = rawType.includes('globally unique identifier');
            if (guidLike && emitted !== 'string' && emitted !== 'guid') entry.typeMismatches.push(`${fname}: rederived=guid emitted=${f.Type}`);
        }

        const diverged = entry.missingFields.length || entry.pathMismatch || entry.pkMismatch ||
            entry.fkMisclassified.length || entry.writeOpsMissing.length || entry.paginationMismatch ||
            entry.watermarkMismatch || entry.bodyShapeMismatch || entry.typeMismatches.length ||
            entry.extraFields.length;
        entry.diverged = !!diverged;
        if (entry.diverged) {
            objectsDivergedCount++;
            if (entry.missingFields.length) histogram.missingFields++;
            if (entry.extraFields.length) histogram.extraFields++;
            if (entry.typeMismatches.length) histogram.typeMismatches++;
            if (entry.fkMisclassified.length) histogram.fkMisclassified++;
            if (entry.writeOpsMissing.length) histogram.writeOpsMissing++;
            if (entry.pkMismatch) histogram.pkMismatch++;
            if (entry.pathMismatch) histogram.pathMismatch++;
            if (entry.paginationMismatch) histogram.paginationMismatch++;
            if (entry.watermarkMismatch) histogram.watermarkMismatch++;
            if (entry.bodyShapeMismatch) histogram.bodyShapeMismatch++;
        }
        perObjectFull.push(entry);
    }

    // ── Write full lossless artifact ──
    mkdirSync(OUTPUT_DIR, { recursive: true });
    const fullArtifact = {
        strategy: STRATEGY,
        generatedAt: new Date().toISOString(),
        opFilesParsed: files.length,
        enumeratedUniverse: universe,
        enumeratedCount: universe.length,
        syncableUniverseCount: syncableUniverse.length,
        objectsMissing,
        objectsExtra,
        objectsDivergedCount,
        divergenceHistogram: histogram,
        perObject: perObjectFull,
    };
    writeFileSync(OUTPUT_FILE, JSON.stringify(fullArtifact, null, 2));

    // ── Compact, actionable-only stdout summary (cap 40, prioritized) ──
    const actionable = perObjectFull.filter((e) => e.diverged && (
        e.missingFields.length || e.fkMisclassified.length || e.writeOpsMissing.length ||
        e.pkMismatch || e.pathMismatch || e.bodyShapeMismatch || e.paginationMismatch || e.watermarkMismatch
    ));
    const capped = actionable.slice(0, 40);

    const summary = {
        artifact: OUTPUT_FILE,
        strategy: STRATEGY,
        enumeratedCount: universe.length,
        objectsMissing,
        objectsExtra,
        objectsDivergedCount,
        divergenceHistogram: histogram,
        perObject: capped,
    };
    process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
}

main();
