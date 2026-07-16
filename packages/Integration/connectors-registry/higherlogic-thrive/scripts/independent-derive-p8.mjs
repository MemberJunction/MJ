#!/usr/bin/env node
/**
 * INDEPENDENT SECOND-PARSER DERIVATION (P8 dual-derivation check).
 *
 * Strategy: MODEL-REGISTRY-FIRST graph resolution (deliberately NOT a per-operation
 * first-pass walk). Rather than treating each of the 236 operation pages as a
 * standalone unit (path-first), this script:
 *
 *   1. Parses every raw operation HTML page directly from sources/ops/*.html
 *      (never touches the extractor's pre-parsed sources/op-details.json or any
 *      extractor script/report/matrix).
 *   2. For each operation, extracts: HTTP method, URL path, URI-parameter table,
 *      and the RESPONSE resource-model name (from the `<a href="/Help/ResourceModel
 *      ?modelName=X">` anchor right before the Resource Description field table)
 *      plus that table's field rows.
 *   3. Builds a MODEL REGISTRY: modelName -> unioned field-set, resolved by
 *      MERGING every appearance of that model name across all operations that
 *      return it (a $ref-chase / type-resolution strategy, analogous to resolving
 *      an OpenAPI component schema by its name rather than inlining each response
 *      body separately).
 *   4. Determines the COVERABLE OBJECT SET as models that have at least one
 *      "list-shaped" door (an operation whose path implies multiple records:
 *      plural GetXxxs/GetAllXxx/SearchXxx/paginated wrapper models, OR a
 *      single-record Get operation whose model is the natural "detail" shape of
 *      a list model already found) - i.e. resolved from the TYPE GRAPH's shape,
 *      not from a hardcoded object list.
 *   5. Cross-references URI-parameter names against the model's own field names
 *      to derive PK candidates (a parameter that exactly documents "the primary/
 *      unique key for X" AND matches a field name is a PK signal); cross-
 *      references field names ending in "Key" whose stripped prefix matches
 *      another resolved model name for FK signals (scalar reference detection --
 *      list/array-typed fields are excluded from FK consideration, matching the
 *      access-path-vs-FK distinction).
 *   6. Independently enumerates the FULL record-type universe (all ResourceModel
 *      names appearing as a response `<a href="/Help/ResourceModel?modelName=...">`
 *      anchor anywhere in sources/ops/*.html) as the object-set-divergence
 *      baseline, and diffs it against the metadata file's emitted IOs.
 *
 * This script NEVER reads: scripts/extract-io-iof.mjs, scripts/extract-op-details.mjs,
 * scripts/enumerate-helppage.mjs, sources/op-details.json, sources/op-details.summary.json,
 * sources/helppage.catalog.json (the extractor's parsed catalog), any EXTRACTION_REPORT,
 * any *MATRIX*.csv, or scripts/dual-derive*.mjs. It reads ONLY: raw HTML under
 * sources/ops/*.html, and (only at the final diff step) the emitted metadata file.
 */

import fs from 'node:fs';
import path from 'node:path';

const VENDOR_DIR = path.resolve(process.cwd());
const OPS_DIR = path.join(VENDOR_DIR, 'sources', 'ops');
const METADATA_FILE = path.resolve(
    VENDOR_DIR, '..', '..', '..', '..',
    'metadata', 'integrations', 'higherlogic-thrive', '.higherlogic-thrive.integration.json'
);
const OUT_DIR = path.join(
    VENDOR_DIR, 'runs', 'connector-higherlogic-thrive-1783530972914-6940db01', 'output'
);
const OUT_FILE = path.join(OUT_DIR, 'DUAL_DERIVATION.json');

// ---------- tiny HTML table parser (no cheerio dependency; regex-based, deliberately
// distinct implementation strategy from a DOM-tree walk) ----------

function decodeEntities(s) {
    return s
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .trim();
}

function stripTags(s) {
    return decodeEntities(s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

/**
 * Extract rows from a help-page-table given the raw HTML slice starting at the
 * <table class="help-page-table"> right after a given heading.
 */
function parseHelpPageTable(html, startIdx) {
    const tableStart = html.indexOf('<table class="help-page-table">', startIdx);
    if (tableStart === -1 || tableStart - startIdx > 4000) return [];
    const tableEnd = html.indexOf('</table>', tableStart);
    if (tableEnd === -1) return [];
    const tableHtml = html.slice(tableStart, tableEnd);
    const rows = [];
    const rowRe = /<tr>([\s\S]*?)<\/tr>/g;
    let m;
    while ((m = rowRe.exec(tableHtml))) {
        const rowHtml = m[1];
        const cellRe = /<td[^>]*class="([^"]+)"[^>]*>([\s\S]*?)<\/td>/g;
        const cells = {};
        let cm;
        while ((cm = cellRe.exec(rowHtml))) {
            cells[cm[1]] = stripTags(cm[2]);
        }
        if (cells['parameter-name']) {
            rows.push({
                name: cells['parameter-name'],
                description: cells['parameter-documentation'] || '',
                type: cells['parameter-type'] || '',
                annotations: cells['parameter-annotations'] || '',
            });
        }
    }
    return rows;
}

/**
 * Find the resource-model name tied to a table: the `<a href="/Help/ResourceModel
 * ?modelName=X">X</a>` anchor that immediately precedes the table (within ~300 chars,
 * skipping whitespace/paragraph noise).
 */
function findModelNameBeforeTable(html, sectionStart) {
    const tableStart = html.indexOf('<table class="help-page-table">', sectionStart);
    if (tableStart === -1) return null;
    const windowHtml = html.slice(Math.max(sectionStart, tableStart - 400), tableStart);
    const anchorRe = /<a href="\/Help\/ResourceModel\?modelName=([^"]+)">/g;
    let last = null;
    let m;
    while ((m = anchorRe.exec(windowHtml))) last = decodeEntities(m[1]);
    return last;
}

function parseOperationFile(filePath, fileName) {
    const html = fs.readFileSync(filePath, 'utf8');

    // Title line -> method + path
    const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/);
    const title = titleMatch ? decodeEntities(titleMatch[1]) : '';
    const methodMatch = title.match(/^(GET|POST|PUT|DELETE|PATCH)\s+(.+)$/);
    const method = methodMatch ? methodMatch[1] : null;
    const rawPath = methodMatch ? methodMatch[2] : title;
    const pathOnly = rawPath.split('?')[0];

    // Description (first <p> under the <h1>)
    const h1Idx = html.indexOf('<h1>');
    let description = '';
    if (h1Idx !== -1) {
        const afterH1 = html.indexOf('</h1>', h1Idx);
        const pMatch = html.slice(afterH1, afterH1 + 800).match(/<p>([\s\S]*?)<\/p>/);
        if (pMatch) description = stripTags(pMatch[1]);
    }

    // URI Parameters
    const uriIdx = html.indexOf('URI Parameters');
    const uriParams = uriIdx !== -1 ? parseHelpPageTable(html, uriIdx) : [];

    // Body Parameters (presence => write op signal)
    const bodyIdx = html.indexOf('Body Parameters');
    let hasBodyParams = false;
    if (bodyIdx !== -1) {
        const nextH2 = html.indexOf('<h2>', bodyIdx);
        const slice = html.slice(bodyIdx, nextH2 === -1 ? bodyIdx + 2000 : nextH2);
        hasBodyParams = slice.includes('help-page-table');
    }

    // Response resource model + fields
    const respIdx = html.indexOf('Resource Description');
    let responseModel = null;
    let responseFields = [];
    let responseIsPlaceholder = false;
    if (respIdx !== -1) {
        responseModel = findModelNameBeforeTable(html, respIdx);
        responseFields = parseHelpPageTable(html, respIdx);
        if (responseModel === 'HttpResponseMessage') responseIsPlaceholder = true;
    }

    return {
        fileName,
        method,
        path: pathOnly,
        rawPath,
        description,
        uriParams,
        hasBodyParams,
        responseModel,
        responseFields,
        responseIsPlaceholder,
    };
}

// ---------- controller extraction from path ----------
function controllerFromPath(p) {
    const m = p.match(/^api\/v2\.0\/([^/]+)\//);
    return m ? m[1] : null;
}

function operationNameFromPath(p) {
    const parts = p.split('/');
    return parts[parts.length - 1];
}

// ---------- list-shaped heuristic (structural, not name-hardcoded per-vendor) ----------
const LIST_OP_RE = /^(GetAll|GetMy|Get)[A-Za-z]*?(s|List|Page|Data|Results)?$/;
function looksLikeListOperation(opName, method, uriParams, responseModel) {
    if (method !== 'GET') return false;
    // Plural naming convention: ends in 's' (not "...Status"/"...Address" false positives handled loosely)
    const pluralish = /s$|List$|Page$/.test(opName) && !/Status$/.test(opName);
    // Or the response model itself is a well-known "paged/list wrapper" shape
    const pagedModel = responseModel && /^Paginated|Page$|^Paged/.test(responseModel);
    // Or it takes NO required singular-entity-key URI param (i.e., not a GetById-style op)
    const hasRequiredSingularKey = uriParams.some(
        (p) => /Required/i.test(p.annotations) && /Key$/.test(p.name)
    );
    return (pluralish || pagedModel) && (!hasRequiredSingularKey || pagedModel);
}

function looksLikeGetByIdOperation(opName, uriParams) {
    const hasRequiredKeyParam = uriParams.some(
        (p) => /Required/i.test(p.annotations) && /Key$/i.test(p.name)
    );
    return /^Get[A-Z]/.test(opName) && hasRequiredKeyParam;
}

// ---------- main ----------
function main() {
    if (!fs.existsSync(OPS_DIR)) {
        console.error(`FATAL: ops dir not found at ${OPS_DIR}`);
        process.exit(1);
    }
    const files = fs.readdirSync(OPS_DIR).filter((f) => f.endsWith('.html'));

    const operations = [];
    for (const f of files) {
        try {
            operations.push(parseOperationFile(path.join(OPS_DIR, f), f));
        } catch (e) {
            console.error(`WARN: failed to parse ${f}: ${e.message}`);
        }
    }

    // ---- Model registry: union field-set across every appearance of a model name ----
    const modelRegistry = new Map(); // modelName -> Map(fieldName -> {type, description, seenIn:Set})
    for (const op of operations) {
        if (!op.responseModel || op.responseIsPlaceholder) continue;
        if (!modelRegistry.has(op.responseModel)) modelRegistry.set(op.responseModel, new Map());
        const fieldMap = modelRegistry.get(op.responseModel);
        for (const f of op.responseFields) {
            if (!fieldMap.has(f.name)) {
                fieldMap.set(f.name, { type: f.type, description: f.description, seenIn: new Set() });
            }
            fieldMap.get(f.name).seenIn.add(op.fileName);
        }
    }

    // ---- Door mapping: model -> list of doors that return it ----
    const modelDoors = new Map(); // modelName -> [{method, path, opName, controller, uriParams, isList, isGetById}]
    for (const op of operations) {
        if (!op.responseModel) continue;
        const opName = operationNameFromPath(op.path);
        const controller = controllerFromPath(op.path);
        const isList = looksLikeListOperation(opName, op.method, op.uriParams, op.responseModel);
        const isGetById = looksLikeGetByIdOperation(opName, op.uriParams);
        if (!modelDoors.has(op.responseModel)) modelDoors.set(op.responseModel, []);
        modelDoors.get(op.responseModel).push({
            method: op.method, path: op.path, opName, controller,
            uriParams: op.uriParams.map((p) => p.name), isList, isGetById,
        });
    }

    // ---- Enumerate the FULL record-type universe (every model that appears as a
    //      response resource-model ANYWHERE) -- this is the object-set-divergence
    //      baseline (independent of any "coverable" classification). ----
    const enumeratedUniverse = new Set();
    for (const op of operations) {
        if (op.responseModel && !op.responseIsPlaceholder) enumeratedUniverse.add(op.responseModel);
    }
    // Also fold in models that only appear NESTED inside another model's field types
    // (e.g. a field type like "Collection of Address" or a bare model-name type) --
    // scan all response field type strings for bracket/paren-wrapped model refs.
    for (const [, fieldMap] of modelRegistry) {
        for (const [, info] of fieldMap) {
            const t = info.type;
            // "Collection of X" / "X[]" patterns commonly used by ASP.NET HelpPage
            const collMatch = t.match(/Collection of ([A-Za-z0-9_]+)/);
            if (collMatch) enumeratedUniverse.add(collMatch[1]);
        }
    }
    // Now fold pure paging-wrapper models out of the enumerated universe (must run
    // AFTER modelDoors/modelRegistry are fully populated, done just below once
    // wrapperTarget() exists -- see wrapperFoldedFromUniverse pass further down).

    // ---- Wrapper/container detection: a model whose fields are ONLY a single
    //      "Collection of X" field plus paging-metadata fields (HasMore, Next,
    //      Previous, TotalCount, ContinuationToken, etc.) is a PAGING WRAPPER
    //      around X, not a standalone domain object -- fold it into X rather than
    //      counting it as a separate coverable object (structural detection, not
    //      a per-vendor name guess: any model fitting this SHAPE anywhere would
    //      be folded, matching the CONTAINER_FOLDED taxonomy referenced in
    //      SOURCES.json). ----
    const PAGING_META_RE = /^(HasMore|Next|Previous|Total|ContinuationToken|PageSize|PageNumber|Count)/i;
    function wrapperTarget(modelName) {
        const fieldMap = modelRegistry.get(modelName);
        if (!fieldMap) return null;
        let collectionTarget = null;
        for (const [fname, info] of fieldMap) {
            const collMatch = info.type.match(/Collection of ([A-Za-z0-9_]+)/);
            if (collMatch) {
                if (collectionTarget) return null; // more than one collection field -> not a simple wrapper
                collectionTarget = collMatch[1];
                continue;
            }
            if (!PAGING_META_RE.test(fname)) return null; // a non-paging, non-collection field -> not a pure wrapper
        }
        return collectionTarget;
    }

    // ---- Coverable objects: models with >=1 list-shaped door (our object-set claim),
    //      EXCLUDING pure paging wrappers (folded into their collection target). ----
    const coverableModels = [];
    for (const [modelName, doors] of modelDoors) {
        if (wrapperTarget(modelName)) continue; // fold wrapper -- not counted as its own object
        const hasListDoor = doors.some((d) => d.isList);
        const hasGetByIdDoor = doors.some((d) => d.isGetById);
        if (hasListDoor || hasGetByIdDoor) {
            coverableModels.push({ modelName, doors, hasListDoor, hasGetByIdDoor });
        }
    }

    // ---- PK / FK derivation per coverable model ----
    function deriveModel(modelName, doors) {
        const fieldMap = modelRegistry.get(modelName) || new Map();
        const fields = [...fieldMap.entries()].map(([name, info]) => ({
            name, type: info.type, description: info.description,
        }));
        const fieldNames = new Set(fields.map((f) => f.name));

        // PK candidates: a URI param on a GetById-style door for this model whose name
        // matches a field name on the model itself, AND is documented as unique/required.
        const pkCandidates = new Set();
        for (const d of doors) {
            if (!d.isGetById) continue;
            for (const pn of d.uriParams) {
                if (fieldNames.has(pn) && /Key$/i.test(pn)) pkCandidates.add(pn);
            }
        }
        // Fallback: a field literally named `${modelName}Key` present on the model itself.
        const selfKeyName = `${modelName}Key`;
        if (fieldNames.has(selfKeyName)) pkCandidates.add(selfKeyName);

        // FK candidates: scalar (non-collection) fields ending in "Key" that are NOT the
        // model's own PK, and whose stripped "Xxx" prefix matches another coverable model
        // name (singular-ish match) -- scalar-reference-to-another-object's-PK rule.
        const fkCandidates = [];
        for (const f of fields) {
            if (!/Key$/.test(f.name)) continue;
            if (pkCandidates.has(f.name)) continue;
            if (/Collection of/i.test(f.type) || /\[\]$/.test(f.type)) continue; // list-typed -> access-path, not FK
            const prefix = f.name.replace(/Key$/, '');
            // does prefix match (singular or plural) another resolved model name?
            const targetModel = [...modelRegistry.keys()].find(
                (m) => m === prefix || m === `${prefix}s` || `${m}s` === prefix
            );
            if (targetModel && targetModel !== modelName) {
                fkCandidates.push({ field: f.name, targetModel });
            }
        }

        // Pagination signal: look at list-door URI params for known cursor/offset shapes.
        const listDoor = doors.find((d) => d.isList);
        let paginationSignal = 'None';
        if (listDoor) {
            const params = new Set(listDoor.uriParams);
            if ([...params].some((p) => /^after.*Key$/i.test(p)) && [...params].some((p) => /^before.*Key$/i.test(p))) {
                paginationSignal = 'Cursor(after/beforeKey)';
            } else if (params.has('continuationToken')) {
                paginationSignal = 'Cursor(continuationToken)';
            } else if ([...params].some((p) => /^offset$/i.test(p)) || [...params].some((p) => /^skip$/i.test(p))) {
                paginationSignal = 'Offset';
            } else if ([...params].some((p) => /modifiedDateTime|modifiedDate|updatedDate/i.test(p))) {
                paginationSignal = 'None(watermark-filter-only)';
            }
        }

        // Watermark signal: a modifiedDateTime-like URI param on any door for this model.
        const watermarkParam = doors
            .flatMap((d) => d.uriParams)
            .find((p) => /modifiedDateTime|modifiedDate|updatedDate|lastModified/i.test(p));

        // Write-op signal: any POST/PUT/DELETE door with the SAME response model or
        // whose path segment matches this model's controller-scoped create/update/delete verbs.
        const writeOps = doors.filter((d) => d.method !== 'GET').map((d) => `${d.method} ${d.path}`);

        return {
            modelName,
            fieldCount: fields.length,
            fields: fields.map((f) => f.name),
            pkCandidates: [...pkCandidates],
            fkCandidates,
            listPath: listDoor ? listDoor.path : null,
            paginationSignal,
            watermarkParam: watermarkParam || null,
            writeOps,
        };
    }

    const derivedByModel = new Map();
    for (const { modelName, doors } of coverableModels) {
        derivedByModel.set(modelName, deriveModel(modelName, doors));
    }

    // Fold wrapper models out of the enumerated universe now that wrapperTarget() is defined.
    for (const modelName of [...enumeratedUniverse]) {
        if (wrapperTarget(modelName)) enumeratedUniverse.delete(modelName);
    }

    // ---- Load metadata (ONLY at this final diff step) ----
    let metadataIOs = [];
    if (fs.existsSync(METADATA_FILE)) {
        const raw = JSON.parse(fs.readFileSync(METADATA_FILE, 'utf8'));
        const top = Array.isArray(raw) ? raw[0] : raw;
        metadataIOs = (top?.relatedEntities?.['MJ: Integration Objects']) || [];
    } else {
        console.error(`WARN: metadata file not found at ${METADATA_FILE}`);
    }

    const emittedByName = new Map();
    for (const io of metadataIOs) {
        emittedByName.set(io.fields.Name, io);
    }

    // ---- Object-set diff: enumerated universe (independently derived) vs emitted IOs ----
    // Map emitted IO -> its declared sourceModel (from Configuration JSON) when present,
    // else fall back to matching by IO Name against a model name heuristically.
    function emittedSourceModel(io) {
        try {
            const cfg = JSON.parse(io.fields.Configuration || '{}');
            return cfg.sourceModel || null;
        } catch {
            return null;
        }
    }

    const emittedModelNames = new Set();
    const emittedIOBySourceModel = new Map();
    for (const io of metadataIOs) {
        const sm = emittedSourceModel(io);
        if (sm) {
            emittedModelNames.add(sm);
            emittedIOBySourceModel.set(sm, io);
        }
    }

    const objectsMissing = [];
    for (const modelName of enumeratedUniverse) {
        if (!emittedModelNames.has(modelName)) {
            // Only report as "missing" if this model looks coverable (has a list or
            // get-by-id door) -- purely-nested/informational models are not expected
            // to be emitted as top-level IOs, so we don't flag them as coverage gaps.
            if (derivedByModel.has(modelName)) objectsMissing.push(modelName);
        }
    }

    const objectsExtra = [];
    for (const modelName of emittedModelNames) {
        if (!enumeratedUniverse.has(modelName)) objectsExtra.push(modelName);
    }

    // ---- Per-object comparison for every emitted IO whose sourceModel we could re-derive ----
    const perObjectFull = [];
    const histogram = {
        missingFields: 0, extraFields: 0, typeMismatches: 0, fkMisclassified: 0,
        writeOpsMissing: 0, pkMismatch: 0, pathMismatch: 0, paginationMismatch: 0,
        watermarkMismatch: 0, bodyShapeMismatch: 0,
    };

    for (const io of metadataIOs) {
        const sourceModel = emittedSourceModel(io);
        const derived = sourceModel ? derivedByModel.get(sourceModel) : null;
        if (!derived) continue; // can't independently re-derive this one -> skip (not a divergence claim)

        const emittedFieldRows = (io.relatedEntities?.['MJ: Integration Object Fields']) || [];
        const emittedFieldNames = new Set(emittedFieldRows.map((f) => f.fields.Name));
        const rederivedFieldNames = new Set(derived.fields);

        const missingFields = [...rederivedFieldNames].filter((f) => !emittedFieldNames.has(f));
        const extraFields = [...emittedFieldNames].filter((f) => !rederivedFieldNames.has(f));

        // Path comparison: normalize both to a lowercase segment path, ignore query string.
        const emittedPath = (io.fields.APIPath || '').split('?')[0].toLowerCase();
        const rederivedPath = derived.listPath ? `/${derived.listPath}`.replace(/\/+/g, '/').toLowerCase() : null;
        let pathMismatch;
        if (rederivedPath && emittedPath && !emittedPath.includes(rederivedPath.replace(/^\/v2\.0/, '').split('/').filter(Boolean).pop() || '')) {
            // loose containment check on the final path segment (operation name) rather than
            // full-string equality, since prefix conventions (api/ vs /v2.0/) legitimately differ.
            const emittedOpSeg = emittedPath.split('/').filter(Boolean).pop();
            const rederivedOpSeg = rederivedPath.split('/').filter(Boolean).pop();
            if (emittedOpSeg !== rederivedOpSeg) pathMismatch = `emitted="${io.fields.APIPath}" rederived="/${derived.listPath}"`;
        }

        // PK comparison
        const emittedPKs = new Set(
            emittedFieldRows.filter((f) => f.fields.IsPrimaryKey).map((f) => f.fields.Name)
        );
        let pkMismatch;
        if (derived.pkCandidates.length > 0) {
            const rederivedSet = new Set(derived.pkCandidates);
            const same = emittedPKs.size === rederivedSet.size && [...emittedPKs].every((k) => rederivedSet.has(k));
            if (!same) {
                pkMismatch = `emitted=[${[...emittedPKs].join(',')}] rederived=[${derived.pkCandidates.join(',')}]`;
            }
        }

        // FK comparison: emitted FK fields whose relation target we can't corroborate
        const emittedFKFields = emittedFieldRows.filter((f) => f.fields.IsForeignKey);
        const fkMisclassified = [];
        for (const fkField of emittedFKFields) {
            const match = derived.fkCandidates.find((c) => c.field === fkField.fields.Name);
            if (!match) {
                // check if this field is list/collection-typed in our re-derivation (the
                // connection-edge-as-FK class of defect) or simply not corroborated
                const fieldInfo = [...(modelRegistry.get(sourceModel) || new Map()).entries()]
                    .find(([n]) => n === fkField.fields.Name);
                const isCollectionTyped = fieldInfo && /Collection of/i.test(fieldInfo[1].type);
                fkMisclassified.push(
                    isCollectionTyped
                        ? `${fkField.fields.Name} (collection-typed in source -- access-path, not scalar FK)`
                        : `${fkField.fields.Name} (not corroborated as scalar FK by independent derivation)`
                );
            }
        }

        // Write-ops comparison
        const writeOpsMissing = [];
        if (io.fields.SupportsWrite && derived.writeOps.length === 0) {
            writeOpsMissing.push('no non-GET operation found for this model in independent derivation');
        }

        // Pagination comparison
        let paginationMismatch;
        const emittedPagType = io.fields.PaginationType;
        if (derived.paginationSignal.startsWith('Cursor') && emittedPagType !== 'Cursor') {
            paginationMismatch = `emitted="${emittedPagType}" rederived="${derived.paginationSignal}"`;
        } else if (derived.paginationSignal === 'Offset' && emittedPagType !== 'Offset') {
            paginationMismatch = `emitted="${emittedPagType}" rederived="${derived.paginationSignal}"`;
        }

        // Watermark comparison
        let watermarkMismatch;
        if (io.fields.SupportsIncrementalSync && !derived.watermarkParam) {
            watermarkMismatch = `emitted SupportsIncrementalSync=true but no modifiedDateTime-like URI param found`;
        }
        if (!io.fields.SupportsIncrementalSync && derived.watermarkParam) {
            watermarkMismatch = `emitted SupportsIncrementalSync=false but found candidate watermark param "${derived.watermarkParam}"`;
        }

        // Type mismatches (best-effort: only flag when both sides have a concrete, comparable type string)
        const typeMismatches = [];
        for (const f of emittedFieldRows) {
            const rederivedField = fieldMap_get(modelRegistry, sourceModel, f.fields.Name);
            if (!rederivedField) continue;
            const rt = normalizeSourceType(rederivedField.type);
            const et = normalizeEmittedType(f.fields.Type);
            if (rt && et && rt !== et) typeMismatches.push(`${f.fields.Name}: emitted=${et} rederived=${rt}`);
        }

        const diverged = !!(missingFields.length || pathMismatch || pkMismatch || writeOpsMissing.length ||
            fkMisclassified.length || paginationMismatch || watermarkMismatch);
        // extraFields/typeMismatches intentionally EXCLUDED from `diverged` gating for the
        // capped sample (advisory-only per task instructions) but still counted in histogram.

        if (missingFields.length) histogram.missingFields++;
        if (extraFields.length) histogram.extraFields++;
        if (typeMismatches.length) histogram.typeMismatches++;
        if (fkMisclassified.length) histogram.fkMisclassified++;
        if (writeOpsMissing.length) histogram.writeOpsMissing++;
        if (pkMismatch) histogram.pkMismatch++;
        if (pathMismatch) histogram.pathMismatch++;
        if (paginationMismatch) histogram.paginationMismatch++;
        if (watermarkMismatch) histogram.watermarkMismatch++;

        perObjectFull.push({
            object: io.fields.Name,
            sourceModel,
            diverged: !!(diverged || extraFields.length || typeMismatches.length),
            actionableDiverged: diverged,
            emittedFieldCount: emittedFieldNames.size,
            rederivedFieldCount: rederivedFieldNames.size,
            missingFields, extraFields,
            pathMismatch, pkMismatch,
            writeOpsMissing, fkMisclassified,
            paginationMismatch, watermarkMismatch,
            typeMismatches,
        });
    }

    function fieldMap_get(registry, modelName, fieldName) {
        const fm = registry.get(modelName);
        if (!fm) return null;
        return fm.get(fieldName) || null;
    }
    function normalizeSourceType(t) {
        const s = (t || '').toLowerCase();
        if (s.includes('globally unique identifier')) return 'guid';
        if (s.includes('string')) return 'string';
        if (s.includes('boolean')) return 'boolean';
        if (s.includes('date')) return 'datetime';
        if (s.includes('decimal') || s.includes('double')) return 'decimal';
        if (s.includes('integer') || s === 'int32' || s === 'int64') return 'int';
        return null;
    }
    function normalizeEmittedType(t) {
        const s = (t || '').toLowerCase();
        if (s === 'guid' || s === 'uniqueidentifier') return 'guid';
        if (s === 'string' || s === 'nvarchar') return 'string';
        if (s === 'boolean' || s === 'bit') return 'boolean';
        if (s === 'datetime' || s === 'datetimeoffset') return 'datetime';
        if (s === 'decimal' || s === 'float' || s === 'double') return 'decimal';
        if (s === 'int' || s === 'integer' || s === 'bigint') return 'int';
        return null;
    }

    const objectsDivergedCount = perObjectFull.filter((o) => o.diverged).length;

    // ---- Write FULL result to disk (lossless) ----
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const fullResult = {
        strategy: 'model-registry-first (type-graph resolution over raw HTML, not per-operation first-pass)',
        artifact: OUT_FILE,
        opsFilesParsed: operations.length,
        enumeratedCount: enumeratedUniverse.size,
        enumeratedUniverse: [...enumeratedUniverse].sort(),
        coverableModelCount: coverableModels.length,
        objectsMissing,
        objectsExtra,
        objectsDivergedCount,
        divergenceHistogram: histogram,
        perObject: perObjectFull,
    };
    fs.writeFileSync(OUT_FILE, JSON.stringify(fullResult, null, 2));

    // ---- Capped, actionable-only summary for stdout ----
    const actionable = perObjectFull
        .filter((o) => o.missingFields.length || o.fkMisclassified.length || o.writeOpsMissing.length ||
            o.pkMismatch || o.pathMismatch || o.paginationMismatch || o.watermarkMismatch)
        .slice(0, 40)
        .map((o) => ({
            object: o.object,
            diverged: true,
            rederivedFieldCount: o.rederivedFieldCount,
            emittedFieldCount: o.emittedFieldCount,
            missingFields: o.missingFields,
            extraFields: o.extraFields,
            pathMismatch: o.pathMismatch,
            pkMismatch: o.pkMismatch,
            writeOpsMissing: o.writeOpsMissing,
            fkMisclassified: o.fkMisclassified,
            paginationMismatch: o.paginationMismatch,
            watermarkMismatch: o.watermarkMismatch,
            typeMismatches: o.typeMismatches,
        }));

    const summary = {
        artifact: OUT_FILE,
        strategy: fullResult.strategy,
        enumeratedCount: fullResult.enumeratedCount,
        objectsMissing,
        objectsExtra,
        objectsDivergedCount,
        divergenceHistogram: histogram,
        perObject: actionable,
    };

    process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
}

main();
