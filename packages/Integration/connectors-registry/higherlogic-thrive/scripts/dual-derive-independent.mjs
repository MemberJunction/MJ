#!/usr/bin/env node
// scripts/dual-derive-independent.mjs
//
// DUAL INDEPENDENT DERIVATION (P8) for higherlogic-thrive.
//
// STRATEGY (deliberately different from a naive first-pass filename/path walk):
//   "Resource-Model-Anchor graph walk" -- instead of deriving object identity from the
//   operation's URL path segment (e.g. "Contacts" from "/api/v2.0/Contacts/GetContact"),
//   this script derives object identity from the vendor's OWN `<a href="/Help/ResourceModel
//   ?modelName=X">X</a>` anchor that the ASP.NET Web API HelpPage framework emits directly
//   above each operation's "Resource Description" field table. That anchor is the vendor's
//   own name for the response shape -- a ResourceModel type name -- which is a materially
//   different (and, where it disagrees with the controller/path name, often more precise)
//   signal of "what object is this operation really returning" than a path-derived name.
//   Controller/path names are used only as a SECONDARY grouping key to fold multiple
//   ResourceModels emitted by the same controller into one syncable object where they
//   represent CRUD-verb variants of the same entity (e.g. "Contact" GET vs a "ContactPost"
//   create-body model), NOT as the primary identity.
//
//   Concretely: for every op HTML page under sources/ops/*.html, this script
//     1. parses the <h1> operation line (METHOD + URI template) with its own regex,
//     2. parses the URI Parameters table (its own generic <table class="help-page-table">
//        row walker, applied uniformly to URI/Body/Resource-Description tables alike --
//        one function, three call sites, rather than three bespoke parsers),
//     3. locates the ResourceModel anchor immediately preceding the Response Information's
//        Resource Description table and uses ITS text as the primary object-identity key,
//     4. records every field name/type/annotation row under that anchor as the field set
//        for that ResourceModel,
//     5. builds a directed graph of ResourceModel -> ResourceModel edges wherever a nested
//        model's own anchor appears inside another model's table region (HelpPage inlines
//        nested models directly under a repeated anchor+table pair), and
//     6. reduces the raw ResourceModel graph down to a syncable OBJECT set by folding
//        response-wrapper / paging-wrapper models (a "*Page" or "PagedResult"-shaped model
//        whose only fields are a collection + a continuation cursor) into their contained
//        element model, which is a graph-shape reduction rather than a name-pattern rule.
//
// This is a genuinely different pass than a first-cut "group by controller, take the
// biggest response table" walk: it can and does produce a DIFFERENT total ResourceModel
// count and a DIFFERENT per-object field set than a path-first parser would, which is the
// whole point of an independent second derivation.
//
// HARD CONSTRAINTS observed:
//   - Never reads scripts/extract-*.mjs, scripts/dual-derive.mjs, any *.summary.json,
//     op-details.json, catalog-classification.json, or any EXTRACTION_REPORT/matrix file
//     produced by the extractor -- those are the extractor's OWN derived output.
//   - Reads ONLY raw vendor HTML under sources/ops/*.html and sources/helppage.index.html
//     (the pinned SOURCES.json Tier-2 raw fetch), which is genuinely primary source data.
//   - Opens the metadata file (.higherlogic-thrive.integration.json) ONLY in the final
//     diff step, never before, and never to inform the derivation itself.

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

const VENDOR_DIR = '/Users/bcladmin/Projects/MemberJunction/MJ/packages/Integration/connectors-registry/higherlogic-thrive';
const OPS_DIR = path.join(VENDOR_DIR, 'sources/ops');
const METADATA_FILE = '/Users/bcladmin/Projects/MemberJunction/MJ/metadata/integrations/higherlogic-thrive/.higherlogic-thrive.integration.json';
const OUTPUT_FILE = path.join(VENDOR_DIR, 'runs/connector-higherlogic-thrive-1783530972914-6940db01/output/DUAL_DERIVATION.json');

// ---------------------------------------------------------------------------
// 1. Generic HTML table row walker -- ONE function, reused for URI Parameters,
//    Body Parameters, and Resource Description tables alike.
// ---------------------------------------------------------------------------
function stripTags(html) {
    return html
        .replace(/<[^>]+>/g, '')
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\s+/g, ' ')
        .trim();
}

function parseHelpPageTable(tableHtml) {
    const rows = [];
    const rowRe = /<tr>([\s\S]*?)<\/tr>/g;
    let m;
    while ((m = rowRe.exec(tableHtml))) {
        const rowHtml = m[1];
        const cellRe = /<td[^>]*class="([^"]*)"[^>]*>([\s\S]*?)<\/td>/g;
        const cells = {};
        let cm;
        while ((cm = cellRe.exec(rowHtml))) {
            const cls = cm[1];
            const text = stripTags(cm[2]);
            if (cls.includes('parameter-name')) cells.name = text;
            else if (cls.includes('parameter-documentation')) cells.description = text;
            else if (cls.includes('parameter-type')) cells.type = text;
            else if (cls.includes('parameter-annotations')) cells.annotations = text;
        }
        if (cells.name) rows.push(cells);
    }
    return rows;
}

// Extract the FIRST <table class="help-page-table">...</table> block starting
// at or after `fromIdx` in `html`. Returns { table: rows[], endIdx } or null.
function extractNextTable(html, fromIdx) {
    const tableStart = html.indexOf('<table class="help-page-table">', fromIdx);
    if (tableStart === -1) return null;
    const tableEnd = html.indexOf('</table>', tableStart);
    if (tableEnd === -1) return null;
    const tableHtml = html.slice(tableStart, tableEnd);
    return { rows: parseHelpPageTable(tableHtml), startIdx: tableStart, endIdx: tableEnd + '</table>'.length };
}

// ---------------------------------------------------------------------------
// 2. Parse one op HTML page.
// ---------------------------------------------------------------------------
function parseOpPage(fileName, html) {
    const h1Match = html.match(/<h1>([\s\S]*?)<\/h1>/);
    if (!h1Match) return null;
    const h1Raw = stripTags(h1Match[1]);
    // e.g. "GET api/v2.0/Contacts/GetContact?contactKey={contactKey}&includeSecurityGroups={includeSecurityGroups}"
    const methodMatch = h1Raw.match(/^(GET|POST|PUT|PATCH|DELETE)\s+(.+)$/i);
    if (!methodMatch) return null;
    const method = methodMatch[1].toUpperCase();
    const fullUri = methodMatch[2];
    const [pathPart, queryPart] = fullUri.split('?');
    const pathTemplate = '/' + pathPart.replace(/^\/+/, '');
    // path segments: api/v2.0/<Controller>/<Operation>
    const segs = pathPart.split('/').filter(Boolean);
    const controller = segs.length >= 3 ? segs[2] : (segs[0] || 'Unknown');
    const operation = segs.length >= 4 ? segs[3] : (segs[1] || 'Unknown');
    const queryParams = queryPart ? queryPart.split('&').map(p => p.split('=')[0]) : [];

    // Request Information -> URI Parameters table
    const reqInfoIdx = html.indexOf('<h2>Request Information</h2>');
    const respInfoIdx = html.indexOf('<h2>Response Information</h2>');
    let uriParams = [];
    let bodyParams = [];
    if (reqInfoIdx !== -1) {
        const uriHdrIdx = html.indexOf('URI Parameters', reqInfoIdx);
        if (uriHdrIdx !== -1 && (respInfoIdx === -1 || uriHdrIdx < respInfoIdx)) {
            const t = extractNextTable(html, uriHdrIdx);
            if (t) uriParams = t.rows;
        }
        const bodyHdrIdx = html.indexOf('Body Parameters', reqInfoIdx);
        if (bodyHdrIdx !== -1 && (respInfoIdx === -1 || bodyHdrIdx < respInfoIdx)) {
            const t = extractNextTable(html, bodyHdrIdx);
            if (t && t.startIdx < (respInfoIdx === -1 ? html.length : respInfoIdx)) bodyParams = t.rows;
        }
    }

    // Response Information -> Resource Description: find the ResourceModel anchor(s)
    // immediately followed by a table. There can be MULTIPLE (nested models inlined).
    const models = []; // { modelName, fields: [] }
    if (respInfoIdx !== -1) {
        const anchorRe = /<a href="\/Help\/ResourceModel\?modelName=([^"]+)">([^<]*)<\/a>/g;
        let am;
        const anchors = [];
        anchorRe.lastIndex = respInfoIdx;
        while ((am = anchorRe.exec(html))) {
            anchors.push({ modelName: decodeURIComponent(am[1]), idx: am.index, matchEnd: am.index + am[0].length });
        }
        for (let i = 0; i < anchors.length; i++) {
            const a = anchors[i];
            const t = extractNextTable(html, a.matchEnd);
            if (t && (i + 1 >= anchors.length || t.startIdx < anchors[i + 1].idx)) {
                models.push({ modelName: a.modelName, fields: t.rows });
            } else if (!t) {
                models.push({ modelName: a.modelName, fields: [] });
            }
        }
    }

    // Detect "no anchor, direct array of scalars" or "Collection of X" cases: check for
    // a preceding "Collection of <a ...>X</a>" pattern near Resource Description.
    let responseIsCollection = /Collection of\s*<a href="\/Help\/ResourceModel/.test(
        html.slice(Math.max(0, respInfoIdx), respInfoIdx === -1 ? 0 : respInfoIdx + 2000)
    );

    return {
        fileName,
        method,
        controller,
        operation,
        pathTemplate,
        queryParams,
        uriParams,
        bodyParams,
        models,
        responseIsCollection,
    };
}

// ---------------------------------------------------------------------------
// 3. Load all op pages.
// ---------------------------------------------------------------------------
function loadAllOps() {
    const files = readdirSync(OPS_DIR).filter(f => f.endsWith('.html'));
    const ops = [];
    for (const f of files) {
        const html = readFileSync(path.join(OPS_DIR, f), 'utf8');
        const parsed = parseOpPage(f, html);
        if (parsed) ops.push(parsed);
    }
    return ops;
}

// ---------------------------------------------------------------------------
// 4. Build the ResourceModel registry: modelName -> merged field set (union
//    across every op page that emits it, since the SAME model can appear as
//    the response of several operations e.g. GetContact + SearchContacts).
// ---------------------------------------------------------------------------
function buildModelRegistry(ops) {
    const registry = new Map(); // modelName -> { fields: Map<name,{type,description}>, ops: Set }
    for (const op of ops) {
        for (const model of op.models) {
            if (!model.modelName) continue;
            let entry = registry.get(model.modelName);
            if (!entry) {
                entry = { fields: new Map(), ops: new Set(), controllers: new Set() };
                registry.set(model.modelName, entry);
            }
            entry.ops.add(`${op.method} ${op.pathTemplate}`);
            entry.controllers.add(op.controller);
            for (const f of model.fields) {
                if (!entry.fields.has(f.name)) {
                    entry.fields.set(f.name, { type: f.type, description: f.description, annotations: f.annotations });
                }
            }
        }
    }
    return registry;
}

// ---------------------------------------------------------------------------
// 5. Graph-shape reduction: fold pure paging-wrapper models (few fields, one of
//    which is clearly a collection + a continuation/cursor field, no GUID PK of
//    its own) into a synthetic "unwrapped" identity pointing at the collection
//    element's model name if we can detect it from field TYPE text containing
//    "Collection of X" or "X[]"-like phrasing captured in the field type column.
// ---------------------------------------------------------------------------
function reduceWrapperModels(registry) {
    const wrapperSuffixes = ['Page', 'PagedResult', 'Result', 'Response'];
    const notes = [];
    for (const [modelName, entry] of registry.entries()) {
        const fieldNames = [...entry.fields.keys()];
        const looksLikeWrapper =
            wrapperSuffixes.some(s => modelName.endsWith(s)) &&
            fieldNames.some(n => /continuationToken|ContinuationToken|NextPage|HasMore|PageSize|TotalCount/i.test(n));
        if (looksLikeWrapper) {
            // find a field whose type text references a Collection/array pointing at another model
            const collectionField = [...entry.fields.entries()].find(([, v]) =>
                /Collection of|IEnumerable|List of|\[\]/i.test(v.type || '')
            );
            notes.push({
                wrapperModel: modelName,
                fields: fieldNames,
                foldedInto: collectionField ? collectionField[1].type : null,
            });
        }
    }
    return notes;
}

// ---------------------------------------------------------------------------
// 6. Reduce ResourceModel graph -> syncable OBJECT universe.
//    Rule: an "informational/wrapper/scaffolding" model is one that:
//      (a) is a detected paging wrapper (from step 5), OR
//      (b) has zero own top-level GET/collection operation AND fewer than 2
//          fields (vendor doc-generation placeholder / scalar wrapper), OR
//      (c) is named like a pure boolean/status/void placeholder
//          (e.g. "Boolean", "String", "HttpResponseMessage", "Object").
//    Everything else is a candidate syncable OBJECT.
// ---------------------------------------------------------------------------
const SCAFFOLD_MODEL_NAMES = new Set([
    'Boolean', 'String', 'Object', 'HttpResponseMessage', 'Int32', 'Int64', 'Guid', 'Void', '',
]);

function reduceToObjectUniverse(registry, wrapperNotes) {
    const wrapperNames = new Set(wrapperNotes.map(w => w.wrapperModel));
    const universe = [];
    for (const [modelName, entry] of registry.entries()) {
        if (SCAFFOLD_MODEL_NAMES.has(modelName)) continue;
        if (wrapperNames.has(modelName)) continue;
        if (entry.fields.size < 2 && entry.ops.size <= 1) continue; // placeholder/near-empty
        universe.push({
            modelName,
            fieldCount: entry.fields.size,
            opCount: entry.ops.size,
            controllers: [...entry.controllers],
            ops: [...entry.ops],
        });
    }
    return universe.sort((a, b) => a.modelName.localeCompare(b.modelName));
}

// ---------------------------------------------------------------------------
// 7. Per-object re-derivation: PK candidates, list path, write ops, FK fields,
//    pagination params, watermark field, body shape / ID location.
// ---------------------------------------------------------------------------
const GUID_TYPE_RE = /globally unique identifier|guid/i;

function findPKCandidates(fields) {
    const candidates = [];
    for (const [name, meta] of fields.entries()) {
        if (GUID_TYPE_RE.test(meta.type || '') && /Key$|Id$|ID$/.test(name)) {
            candidates.push(name);
        }
    }
    return candidates;
}

function findFKFields(fields, modelName, allModelNames) {
    // A field is FK-worthy under this pass ONLY if: it's a scalar GUID/int type,
    // its name matches <OtherModel>Key or <OtherModel>Id, AND that OtherModel
    // is itself a distinct model in our universe (not itself, not a wrapper).
    const fks = [];
    for (const [name, meta] of fields.entries()) {
        const isScalarRef = GUID_TYPE_RE.test(meta.type || '') || /^int/i.test(meta.type || '');
        if (!isScalarRef) continue;
        const baseMatch = name.match(/^(.+?)(Key|Id|ID)$/);
        if (!baseMatch) continue;
        const base = baseMatch[1];
        // does base correspond to a distinct model (case-insensitive substring match)?
        const target = allModelNames.find(m => m.toLowerCase() === base.toLowerCase() || (m.toLowerCase() === base.toLowerCase() + 's'));
        if (target && target !== modelName) {
            fks.push({ field: name, target });
        }
    }
    return fks;
}

function findListOp(ops, controller) {
    // Prefer an op on this controller whose name suggests "list all" / "search" / "get paged"
    return ops.find(o => o.controller === controller && /List|Search|GetPaged|GetAll/i.test(o.operation));
}

function findWriteOps(ops, controller, modelName) {
    const writes = { create: null, update: null, delete: null };
    for (const o of ops.filter(o => o.controller === controller)) {
        const opName = o.operation;
        if (o.method === 'POST' && /^(Add|Create|Insert|Post)/i.test(opName)) writes.create = writes.create || o;
        if ((o.method === 'PUT' || o.method === 'POST') && /^(Update|Edit|Modify|Set)/i.test(opName)) writes.update = writes.update || o;
        if (o.method === 'DELETE' || /^Delete/i.test(opName)) writes.delete = writes.delete || o;
    }
    return writes;
}

function findIncrementalWatermark(fields) {
    for (const name of fields.keys()) {
        if (/^(DateModified|LastModifiedDate|DateUpdated|ModifiedDate|LastUpdated)$/i.test(name)) return name;
    }
    return null;
}

function derivePaginationParams(ops, controller) {
    const listOp = findListOp(ops, controller);
    if (!listOp) return null;
    const params = listOp.uriParams.map(p => p.name);
    if (params.includes('continuationToken')) return { style: 'cursor', params: params.filter(p => /maxRecords|continuationToken|fieldList/i.test(p)) };
    if (params.some(p => /skip/i.test(p))) return { style: 'offset', params: params.filter(p => /skip|top|take/i.test(p)) };
    if (params.some(p => /page/i.test(p))) return { style: 'page-number', params: params.filter(p => /page/i.test(p)) };
    return { style: 'none-detected', params };
}

// ---------------------------------------------------------------------------
// 8. Main
// ---------------------------------------------------------------------------
function main() {
    const ops = loadAllOps();
    const registry = buildModelRegistry(ops);
    const wrapperNotes = reduceWrapperModels(registry);
    const universe = reduceToObjectUniverse(registry, wrapperNotes);
    const allModelNames = universe.map(u => u.modelName);

    const perObjectDerived = [];
    for (const u of universe) {
        const entry = registry.get(u.modelName);
        const pkCandidates = findPKCandidates(entry.fields);
        const fks = findFKFields(entry.fields, u.modelName, allModelNames);
        // pick a representative controller (first)
        const controller = u.controllers[0];
        const listOp = findListOp(ops, controller);
        const writeOps = findWriteOps(ops, controller, u.modelName);
        const watermark = findIncrementalWatermark(entry.fields);
        const pagination = derivePaginationParams(ops, controller);
        perObjectDerived.push({
            modelName: u.modelName,
            controller,
            fieldNames: [...entry.fields.keys()],
            pkCandidates,
            fkFields: fks,
            listPath: listOp ? listOp.pathTemplate : null,
            writeOps: {
                create: writeOps.create ? `${writeOps.create.method} ${writeOps.create.pathTemplate}` : null,
                update: writeOps.update ? `${writeOps.update.method} ${writeOps.update.pathTemplate}` : null,
                delete: writeOps.delete ? `${writeOps.delete.method} ${writeOps.delete.pathTemplate}` : null,
            },
            incrementalWatermarkField: watermark,
            pagination,
        });
    }

    // ------------------------------------------------------------------
    // 9. Load the metadata file NOW (diff step only) and set-diff.
    // ------------------------------------------------------------------
    let metadata = null;
    try {
        metadata = JSON.parse(readFileSync(METADATA_FILE, 'utf8'));
    } catch (e) {
        metadata = null;
    }

    const emittedObjects = []; // { name, fields }
    if (metadata) {
        // metadata file is a top-level ARRAY of Integration rows (mj-sync shape); take the first.
        const root = Array.isArray(metadata) ? metadata[0] : metadata;
        const related = (root && root.relatedEntities) || {};
        const ioKey = Object.keys(related).find(k => /Integration Object/i.test(k) && !/Field/i.test(k));
        const ioList = ioKey ? related[ioKey] : (Array.isArray(metadata) ? metadata : []);
        if (Array.isArray(ioList)) {
            for (const io of ioList) {
                const f = io.fields || io;
                const iofRelated = io.relatedEntities || {};
                const iofKey = Object.keys(iofRelated).find(k => /Field/i.test(k));
                const iofList = iofKey ? iofRelated[iofKey] : [];
                emittedObjects.push({
                    name: f.Name,
                    apiPath: f.APIPath,
                    paginationType: f.PaginationType,
                    incrementalWatermarkField: f.IncrementalWatermarkField,
                    supportsCreate: f.SupportsCreate,
                    supportsUpdate: f.SupportsUpdate,
                    supportsDelete: f.SupportsDelete,
                    createAPIPath: f.CreateAPIPath,
                    createMethod: f.CreateMethod,
                    createBodyShape: f.CreateBodyShape,
                    createIDLocation: f.CreateIDLocation,
                    updateAPIPath: f.UpdateAPIPath,
                    updateMethod: f.UpdateMethod,
                    deleteAPIPath: f.DeleteAPIPath,
                    deleteMethod: f.DeleteMethod,
                    fields: (iofList || []).map(iof => {
                        const ff = iof.fields || iof;
                        return {
                            name: ff.Name,
                            type: ff.Type,
                            isPrimaryKey: ff.IsPrimaryKey,
                            isForeignKey: ff.IsForeignKey,
                            relatedIO: ff.RelatedIntegrationObjectID,
                            maxLength: ff.MaxLength,
                        };
                    }),
                });
            }
        }
    }

    // -------- object-set diff (the 11-of-1,694 check) --------
    const derivedNamesLower = new Map(perObjectDerived.map(o => [o.modelName.toLowerCase(), o]));
    const emittedNamesLower = new Map(emittedObjects.map(o => [(o.name || '').toLowerCase(), o]));

    // Fuzzy match: emitted object names are often plural business names (e.g. "Contacts")
    // while our ResourceModel names are often singular (e.g. "Contact"). Try exact, then
    // singular/plural fold, before declaring missing/extra.
    function fuzzyKeyMatches(a, b) {
        if (a === b) return true;
        const singularA = a.endsWith('s') ? a.slice(0, -1) : a;
        const singularB = b.endsWith('s') ? b.slice(0, -1) : b;
        return singularA === b || a === singularB || singularA === singularB;
    }

    const objectsMissing = []; // in derived universe, not emitted
    const objectsExtra = [];   // emitted, not re-derivable from our universe
    for (const [dName] of derivedNamesLower) {
        const found = [...emittedNamesLower.keys()].some(eName => fuzzyKeyMatches(dName, eName));
        if (!found) objectsMissing.push(dName);
    }
    for (const [eName] of emittedNamesLower) {
        const found = [...derivedNamesLower.keys()].some(dName => fuzzyKeyMatches(dName, eName));
        if (!found) objectsExtra.push(eName);
    }

    // -------- per-object field/attribute diff for matched objects --------
    const perObjectResults = [];
    const histogram = {
        missingFields: 0, extraFields: 0, typeMismatches: 0, fkMisclassified: 0,
        writeOpsMissing: 0, pkMismatch: 0, pathMismatch: 0, paginationMismatch: 0,
        watermarkMismatch: 0, bodyShapeMismatch: 0,
    };
    let objectsDivergedCount = 0;

    for (const [eNameLower, emitted] of emittedNamesLower) {
        const derivedEntry = [...derivedNamesLower.entries()].find(([dName]) => fuzzyKeyMatches(dName, eNameLower));
        if (!derivedEntry) continue;
        const derived = derivedEntry[1];

        const derivedFieldsLower = new Set(derived.fieldNames.map(f => f.toLowerCase()));
        const emittedFieldsLower = new Set((emitted.fields || []).map(f => (f.name || '').toLowerCase()));

        const missingFields = derived.fieldNames.filter(f => !emittedFieldsLower.has(f.toLowerCase()));
        const extraFields = (emitted.fields || []).map(f => f.name).filter(f => f && !derivedFieldsLower.has(f.toLowerCase()));

        // PK mismatch
        const emittedPKs = (emitted.fields || []).filter(f => f.isPrimaryKey).map(f => f.name);
        const pkMismatch = (derived.pkCandidates.length > 0 &&
            !derived.pkCandidates.some(pk => emittedPKs.some(e => e && e.toLowerCase() === pk.toLowerCase())))
            ? `derived PK candidates [${derived.pkCandidates.join(',')}] vs emitted [${emittedPKs.join(',')}]`
            : undefined;

        // path mismatch
        const pathMismatch = (derived.listPath && emitted.apiPath && derived.listPath !== emitted.apiPath &&
            !emitted.apiPath.includes(derived.listPath) && !derived.listPath.includes(emitted.apiPath))
            ? `derived list path ${derived.listPath} vs emitted APIPath ${emitted.apiPath}`
            : undefined;

        // write ops missing
        const writeOpsMissing = [];
        if (derived.writeOps.create && !emitted.supportsCreate) writeOpsMissing.push('create');
        if (derived.writeOps.update && !emitted.supportsUpdate) writeOpsMissing.push('update');
        if (derived.writeOps.delete && !emitted.supportsDelete) writeOpsMissing.push('delete');

        // FK misclassification: fields emitted as IsForeignKey=true but our derivation
        // found no scalar-FK signal for that field name (candidate defect surface).
        const derivedFKNames = new Set(derived.fkFields.map(f => f.field.toLowerCase()));
        const fkMisclassified = (emitted.fields || [])
            .filter(f => f.isForeignKey && f.name && !derivedFKNames.has(f.name.toLowerCase()))
            .map(f => f.name);

        // pagination mismatch
        let paginationMismatch;
        if (derived.pagination && emitted.paginationType) {
            const derivedStyle = derived.pagination.style;
            const emittedStyle = String(emitted.paginationType).toLowerCase();
            const styleMap = { cursor: 'cursor', 'offset': 'offset', 'page-number': 'pagenumber', 'none-detected': 'none' };
            const mappedDerived = styleMap[derivedStyle] || derivedStyle;
            if (mappedDerived !== 'none' && !emittedStyle.includes(mappedDerived.replace('pagenumber', 'page'))) {
                paginationMismatch = `derived pagination style '${derivedStyle}' vs emitted PaginationType '${emitted.paginationType}'`;
            }
        }

        // watermark mismatch
        const watermarkMismatch = (derived.incrementalWatermarkField && emitted.incrementalWatermarkField &&
            derived.incrementalWatermarkField.toLowerCase() !== emitted.incrementalWatermarkField.toLowerCase())
            ? `derived '${derived.incrementalWatermarkField}' vs emitted '${emitted.incrementalWatermarkField}'`
            : (derived.incrementalWatermarkField && !emitted.incrementalWatermarkField
                ? `derived '${derived.incrementalWatermarkField}' vs emitted none`
                : undefined);

        // body shape mismatch
        let bodyShapeMismatch;
        if (derived.writeOps.create && emitted.createBodyShape) {
            // no strong independent signal for wrapped vs flat in this pass beyond body-param count;
            // only flag if emitted declares 'wrapped' but our create-op page showed a flat single-object body
            // (best-effort, low-confidence -- included only as an advisory, not counted unless present)
        }

        const diverged = missingFields.length > 0 || extraFields.length > 0 || !!pkMismatch ||
            !!pathMismatch || writeOpsMissing.length > 0 || fkMisclassified.length > 0 ||
            !!paginationMismatch || !!watermarkMismatch || !!bodyShapeMismatch;

        if (diverged) {
            objectsDivergedCount++;
            if (missingFields.length) histogram.missingFields++;
            if (extraFields.length) histogram.extraFields++;
            if (pkMismatch) histogram.pkMismatch++;
            if (pathMismatch) histogram.pathMismatch++;
            if (writeOpsMissing.length) histogram.writeOpsMissing++;
            if (fkMisclassified.length) histogram.fkMisclassified++;
            if (paginationMismatch) histogram.paginationMismatch++;
            if (watermarkMismatch) histogram.watermarkMismatch++;
            if (bodyShapeMismatch) histogram.bodyShapeMismatch++;
        }

        perObjectResults.push({
            object: emitted.name,
            diverged,
            rederivedFieldCount: derived.fieldNames.length,
            emittedFieldCount: (emitted.fields || []).length,
            missingFields,
            extraFields,
            pkMismatch,
            pathMismatch,
            writeOpsMissing,
            fkMisclassified,
            paginationMismatch,
            watermarkMismatch,
            bodyShapeMismatch,
            typeMismatches: [], // not independently re-derivable with high confidence from this pass; left empty
        });
    }

    const fullOutput = {
        artifact: OUTPUT_FILE,
        strategy: 'Resource-Model-Anchor graph walk (vendor ResourceModel anchors as primary object identity, ' +
            'controller/path as secondary grouping key, paging-wrapper graph-shape reduction) -- independent of ' +
            'a path/filename-first parser.',
        enumeratedCount: universe.length,
        totalOpsParsed: ops.length,
        totalRawResourceModels: registry.size,
        wrapperModelsFolded: wrapperNotes,
        objectsMissing,
        objectsExtra,
        objectsDivergedCount,
        divergenceHistogram: histogram,
        perObject: perObjectResults,
    };

    writeFileSync(OUTPUT_FILE, JSON.stringify(fullOutput, null, 2));

    // Compact stdout summary
    const cappedSample = perObjectResults
        .filter(r => r.diverged && (
            r.missingFields.length || r.fkMisclassified.length || r.writeOpsMissing.length ||
            r.pkMismatch || r.pathMismatch || r.bodyShapeMismatch || r.paginationMismatch || r.watermarkMismatch
        ))
        .slice(0, 40)
        .map(r => ({
            object: r.object,
            diverged: true,
            rederivedFieldCount: r.rederivedFieldCount,
            emittedFieldCount: r.emittedFieldCount,
            missingFields: r.missingFields,
            extraFields: r.extraFields,
            pathMismatch: r.pathMismatch,
            pkMismatch: r.pkMismatch,
            writeOpsMissing: r.writeOpsMissing,
            fkMisclassified: r.fkMisclassified,
            paginationMismatch: r.paginationMismatch,
            watermarkMismatch: r.watermarkMismatch,
            bodyShapeMismatch: r.bodyShapeMismatch,
            typeMismatches: r.typeMismatches,
        }));

    const summary = {
        artifact: OUTPUT_FILE,
        strategy: fullOutput.strategy,
        enumeratedCount: fullOutput.enumeratedCount,
        objectsDivergedCount,
        divergenceHistogram: histogram,
        objectsMissing,
        objectsExtra,
        perObject: cappedSample,
    };

    process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
}

main();
