#!/usr/bin/env node
// scripts/dual-derive-p8.mjs — INDEPENDENT second-parser derivation (v2 P8 dual-derivation gate).
//
// STRATEGY (deliberately DIFFERENT from a naive top-to-bottom element walk):
//   "Type-graph reverse resolution" — parse the WSDL into a DOM object (fast-xml-parser), build a
//   NAME-INDEXED complexType registry first (a lookup table, not a linear scan), then resolve every
//   operation's request/response SHAPE by walking wsdl:portType -> wsdl:message -> wsdl:part -> the
//   named schema element -> its complexType -> (if complexContent/extension) its base type, chasing
//   `tns:` type references through the registry rather than re-reading the schema top-to-bottom.
//   Record-type universe is defined structurally: every NAMED (non-anonymous) s:complexType that
//   (a) is not an `ArrayOf*` container wrapper and (b) carries >=1 field. This is the same "must
//   carry fields, exclude wrapper/connection plumbing" principle enumerate-catalog.mjs applies to
//   GraphQL Connection/Edge types -- applied here to WSDL's ArrayOfXxx container convention.
//
// This script is the ONLY source of the findings below (P9: finding = script output). It does NOT
// read the extractor's script, EXTRACTION_REPORT, or matrix, and does NOT open the metadata file
// itself except in its own diff step (readMetadata()).
//
// Usage: node dual-derive-p8.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { XMLParser } from 'fast-xml-parser';

const SOURCE = '/Users/bcladmin/Projects/MemberJunction/MJ/packages/Integration/connectors-registry/higherlogic-marketing-enterprise/sources/mmapi.wsdl.xml';
const METADATA_FILE = '/Users/bcladmin/Projects/MemberJunction/MJ/metadata/integrations/magnetmail/.magnetmail.integration.json';
const OUT_DIR = '/Users/bcladmin/Projects/MemberJunction/MJ/packages/Integration/connectors-registry/magnetmail/runs/connector-magnetmail-1783132483150-5d0b164d/output';
const OUT_FILE = `${OUT_DIR}/DUAL_DERIVATION.json`;

const STRATEGY = 'type-graph reverse resolution: fast-xml-parser DOM -> name-indexed complexType ' +
    'registry -> operation shape resolved by chasing portType/message/part/element/complexType-or-' +
    'extension-base references through the registry (NOT a linear top-to-bottom element scan). ' +
    'Record universe = named complexTypes (non-anonymous) excluding ArrayOf* wrapper containers, ' +
    'requiring >=1 field (mirrors enumerate-catalog.mjs\'s Connection/Edge exclusion + "must carry ' +
    'fields" rule, applied to the WSDL ArrayOfXxx convention).';

function asArray(x) { return x === undefined ? [] : Array.isArray(x) ? x : [x]; }

// ── 1. Parse ────────────────────────────────────────────────────────────────
const xml = readFileSync(SOURCE, 'utf8');
const REPEATABLE = new Set([
    's:element', 's:complexType', 's:simpleType', 's:enumeration', 's:attribute',
    'wsdl:operation', 'wsdl:message', 'wsdl:part', 'wsdl:service', 'wsdl:port',
    'wsdl:documentation', 'soap:header',
]);
const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    allowBooleanAttributes: true,
    isArray: (name) => REPEATABLE.has(name),
    trimValues: true,
});
const doc = parser.parse(xml);
const definitions = doc['wsdl:definitions'];
const schema = definitions['wsdl:types']['s:schema'];

// ── 2. Build the name-indexed complexType + top-level element registries ───
const complexTypeByName = new Map();   // name -> raw complexType node
const topElementByName = new Map();    // name -> raw s:element node (message-level elements)
for (const ct of asArray(schema['s:complexType'])) {
    if (ct['@_name']) complexTypeByName.set(ct['@_name'], ct);
}
for (const el of asArray(schema['s:element'])) {
    if (el['@_name']) topElementByName.set(el['@_name'], el);
}
const simpleTypeEnumNames = new Set();
for (const st of asArray(schema['s:simpleType'])) {
    // enums are not records; not indexed into complexTypeByName -- but tracked so the type-mapper
    // can correctly classify a named enum simpleType as 'enum' (matching the metadata's own Type
    // vocabulary) instead of falsely flagging it as a typeMismatch against the raw XSD type name.
    if (st['@_name'] && st['s:restriction']?.['s:enumeration']) simpleTypeEnumNames.add(st['@_name']);
}

function stripPrefix(t) {
    if (!t) return null;
    const i = t.indexOf(':');
    return i === -1 ? t : t.slice(i + 1);
}

// Resolve a complexType's own field sequence (handles complexContent/extension by merging base).
function resolveFields(ctName, seen = new Set()) {
    if (seen.has(ctName)) return []; // cycle guard
    seen.add(ctName);
    const ct = complexTypeByName.get(ctName);
    if (!ct) return [];
    let fields = [];
    let seq = ct['s:sequence'];
    let baseName = null;
    if (ct['s:complexContent']) {
        const ext = ct['s:complexContent']['s:extension'];
        if (ext) {
            baseName = stripPrefix(ext['@_base']);
            seq = ext['s:sequence'];
        }
    }
    if (baseName) fields = fields.concat(resolveFields(baseName, seen));
    for (const el of asArray(seq?.['s:element'])) {
        if (!el['@_name']) continue;
        fields.push({
            name: el['@_name'],
            type: stripPrefix(el['@_type']) ?? (el['s:complexType'] ? '(inline)' : null),
            minOccurs: el['@_minOccurs'] ?? '1',
            maxOccurs: el['@_maxOccurs'] ?? '1',
            nillable: el['@_nillable'] === true || el['@_nillable'] === 'true',
        });
    }
    return fields;
}

function isArrayWrapper(name, ct) {
    if (!/^ArrayOf/i.test(name)) return false;
    const fields = resolveFields(name);
    return fields.length === 1 && (fields[0].maxOccurs === 'unbounded');
}

// ── 3. Record-type universe: named, non-anonymous, non-ArrayOf*, >=1 field ─
const recordTypeNames = [];
for (const [name, ct] of complexTypeByName) {
    if (isArrayWrapper(name, ct)) continue;
    const fields = resolveFields(name);
    if (fields.length === 0) continue; // Asset, DomainBase, SearchResults(abstract), etc. -- not records
    recordTypeNames.push(name);
}
recordTypeNames.sort((a, b) => a.localeCompare(b));

// ── 4. Message -> element resolution (proper WSDL traversal, not naming-convention guessing) ─
const messageByName = new Map();
for (const m of asArray(definitions['wsdl:message'])) {
    if (m['@_name']) messageByName.set(m['@_name'], m);
}
function messagePartElement(messageName) {
    const m = messageByName.get(stripPrefix(messageName));
    if (!m) return null;
    const part = asArray(m['wsdl:part'])[0];
    return part ? stripPrefix(part['@_element']) : null;
}

// ── 5. portType operations -> {input element, output element} ─────────────
const portType = asArray(definitions['wsdl:portType'])[0];
const operations = new Map(); // opName -> { inputEl, outputEl }
for (const op of asArray(portType['wsdl:operation'])) {
    const name = op['@_name'];
    const inputEl = op['wsdl:input'] ? messagePartElement(op['wsdl:input']['@_message']) : null;
    const outputEl = op['wsdl:output'] ? messagePartElement(op['wsdl:output']['@_message']) : null;
    operations.set(name, { inputEl, outputEl });
}

// ── 6. SOAPAction map from the (first) soap:binding (soap 1.1) ────────────
const soapActionByOp = new Map();
const bindings = asArray(definitions['wsdl:binding']);
for (const binding of bindings) {
    const isSoap11 = !!binding['soap:binding'];
    if (!isSoap11) continue; // prefer the 1.1 binding as canonical; 1.2 is a mirror
    for (const op of asArray(binding['wsdl:operation'])) {
        const soapOp = op['soap:operation'];
        if (soapOp && !soapActionByOp.has(op['@_name'])) {
            soapActionByOp.set(op['@_name'], soapOp['@_soapAction']);
        }
    }
    break;
}

// ── 7. For each top-level element, get its field shape (own complexType, possibly inline) ─
function elementFields(elName) {
    const el = topElementByName.get(elName);
    if (!el) return [];
    if (el['s:complexType']) {
        // inline anonymous complexType directly on the element ('s:complexType' is forced to an
        // array by the parser's isArray config since it's ALSO a repeatable schema-level tag name)
        const inline = asArray(el['s:complexType'])[0];
        const seq = inline?.['s:sequence'];
        return asArray(seq?.['s:element']).filter(e => e['@_name']).map(e => ({
            name: e['@_name'],
            type: stripPrefix(e['@_type']),
        }));
    }
    const t = stripPrefix(el['@_type']);
    return t ? resolveFields(t).map(f => ({ name: f.name, type: f.type })) : [];
}

// Unwrap an ArrayOfX type name to X's registry name (best-effort: single-field container).
function unwrapArrayType(typeName) {
    if (!typeName || !/^ArrayOf/i.test(typeName)) return null;
    const fields = resolveFields(typeName);
    if (fields.length === 1) return stripPrefix(fields[0].type);
    return null;
}

function writeVerbBucket(opName) {
    const lower = opName.toLowerCase();
    if (/^add|^create|^upload/.test(lower)) return 'create';
    if (/^edit|^update/.test(lower)) return 'update';
    if (/^delete|^remove/.test(lower)) return 'delete';
    return null;
}

// ── 8. Build per-record-type operation associations: list/read, create, update, delete ─
const opsByType = new Map(); // typeName -> { list: [], create: [], update: [], delete: [], get: [] }
function ensure(t) {
    if (!opsByType.has(t)) opsByType.set(t, { list: [], create: [], update: [], delete: [], get: [] });
    return opsByType.get(t);
}
for (const [opName, { inputEl, outputEl }] of operations) {
    // --- response side: does the output wrap (directly, or via ArrayOfX) one of our record types?
    if (outputEl) {
        for (const f of elementFields(outputEl)) {
            const direct = f.type;
            const unwrapped = unwrapArrayType(f.type);
            const target = recordTypeNames.includes(direct) ? direct
                : (unwrapped && recordTypeNames.includes(unwrapped)) ? unwrapped
                : null;
            if (target) {
                const bucket = unwrapped ? 'list' : 'get';
                ensure(target)[bucket].push(opName);
            }
        }
    }
    // --- request side, signal A: does the input directly nest one of our record types as a field? ---
    if (inputEl) {
        for (const f of elementFields(inputEl)) {
            if (recordTypeNames.includes(f.type)) {
                const bucket = writeVerbBucket(opName);
                if (bucket) ensure(f.type)[bucket].push(opName);
            }
        }
    }
    // --- request side, signal B: many SOAP .asmx create/update ops FLATTEN the record's own fields
    // as direct siblings of the operation element (addRecipient's <sequence> is a flat parameter
    // list, not a nested `recipient: tns:Recipient` field -- confirmed by inspecting the WSDL).
    // Corroborate via (a) verb-stripped op-name substring match against a record type name, AND
    // (b) field-name-set overlap between the operation's flat input and the candidate type's fields.
    if (inputEl) {
        const bucket = writeVerbBucket(opName);
        if (bucket) {
            const remainder = opName.replace(/^(add|create|upload|edit|update|delete|remove)/i, '');
            const remainderLower = remainder.toLowerCase();
            if (remainderLower.length > 0) {
                let best = null; // { type, len }
                for (const t of recordTypeNames) {
                    const tLower = t.toLowerCase();
                    if (remainderLower.includes(tLower) || tLower.includes(remainderLower)) {
                        if (!best || tLower.length > best.len) best = { type: t, len: tLower.length };
                    }
                }
                if (best) {
                    const inputFieldNames = new Set(elementFields(inputEl).map(f => f.name.toLowerCase().replace(/[_\s]/g, '')));
                    const candidateFieldNames = new Set(resolveFields(best.type).map(f => f.name.toLowerCase().replace(/[_\s]/g, '')));
                    const overlap = [...inputFieldNames].filter(n => candidateFieldNames.has(n)).length;
                    const ratio = overlap / Math.max(1, Math.min(inputFieldNames.size, candidateFieldNames.size));
                    if (overlap >= 2 || ratio >= 0.3) {
                        const assoc = ensure(best.type);
                        if (!assoc[bucket].includes(opName)) assoc[bucket].push(opName);
                    }
                }
            }
        }
    }
}

// ── 9. PK / FK heuristic classification (naming-convention based; Tier-2 signal) ─
const typeNameLower = new Set(recordTypeNames.map(n => n.toLowerCase()));
function classifyFields(typeName, fields) {
    const selfNorm = typeName.toLowerCase().replace(/[_\s]/g, '');
    const idish = fields.filter(f => /(^|_)id$/i.test(f.name) || /Id$/.test(f.name) || /^id$/i.test(f.name));
    const pkCandidates = [];
    const fkCandidates = [];
    for (const f of idish) {
        const stem = f.name.replace(/(_?[Ii][Dd])$/, '').toLowerCase().replace(/[_\s]/g, '');
        if (/^id$/i.test(f.name)) { pkCandidates.push(f.name); continue; }
        if (stem === selfNorm || stem === '' ) { pkCandidates.push(f.name); continue; }
        // does the stem match ANOTHER known record type (singular-ish)?
        const singularStem = stem.replace(/s$/, '');
        let matchedType = null;
        for (const otherName of recordTypeNames) {
            const otherNorm = otherName.toLowerCase().replace(/[_\s]/g, '');
            if (otherNorm === stem || otherNorm === singularStem) { matchedType = otherName; break; }
        }
        if (matchedType && matchedType !== typeName) {
            fkCandidates.push({ field: f.name, target: matchedType });
        } else if (pkCandidates.length === 0) {
            pkCandidates.push(f.name); // weak candidate, no better explanation
        }
    }
    return { pkCandidates, fkCandidates };
}

// ── 10. Pagination / watermark heuristic per record type: inspect ops' input fields ─
function paginationSignal(typeName) {
    const assoc = opsByType.get(typeName);
    if (!assoc) return null;
    for (const opName of [...assoc.list, ...assoc.get]) {
        const { inputEl } = operations.get(opName) ?? {};
        if (!inputEl) continue;
        const fields = elementFields(inputEl).map(f => f.name.toLowerCase());
        // pagination params are frequently nested inside a criteria sub-object; also probe that.
        const el = topElementByName.get(inputEl);
        const inlineCt = asArray(el?.['s:complexType'])[0];
        let nestedFieldNames = [];
        if (inlineCt?.['s:sequence']) {
            for (const f of asArray(inlineCt['s:sequence']['s:element'])) {
                const t = stripPrefix(f['@_type']);
                if (t && complexTypeByName.has(t)) {
                    nestedFieldNames = nestedFieldNames.concat(resolveFields(t).map(x => x.name.toLowerCase()));
                }
            }
        }
        const all = [...fields, ...nestedFieldNames];
        const hasPageNo = all.some(n => /page.?no|pagenumber|page_?num/.test(n));
        const hasPageSize = all.some(n => /page.?size|pagesize/.test(n));
        const hasCursor = all.some(n => /cursor|token|offset/.test(n));
        const dateFields = all.filter(n => /date|utc/.test(n));
        if (hasPageNo || hasPageSize) return { style: 'PageNumber', op: opName, evidence: all.filter(n => /page/.test(n)) };
        if (hasCursor) return { style: 'Cursor', op: opName, evidence: all.filter(n => /cursor|token|offset/.test(n)) };
        if (dateFields.length > 0) return { style: 'DateRange (watermark candidate)', op: opName, evidence: dateFields };
    }
    return null;
}

// ── 11. Read + normalize the emitted metadata (the ONLY point this script touches it) ─
const metaRaw = JSON.parse(readFileSync(METADATA_FILE, 'utf8'));
const metaRoot = Array.isArray(metaRaw) ? metaRaw[0] : metaRaw;
const emittedIOs = metaRoot?.relatedEntities?.['MJ: Integration Objects'] ?? [];
const emittedByName = new Map();
for (const io of emittedIOs) emittedByName.set(io.fields.Name, io);

const enumeratedSet = new Set(recordTypeNames);
const emittedSet = new Set(emittedByName.keys());

const objectsMissing = recordTypeNames.filter(n => !emittedSet.has(n));
const objectsExtra = [...emittedSet].filter(n => !enumeratedSet.has(n)).sort();

// ── 12. Per-object diff ─────────────────────────────────────────────────────
const perObjectFull = [];
const histogram = {
    missingFields: 0, extraFields: 0, typeMismatches: 0, fkMisclassified: 0,
    writeOpsMissing: 0, pkMismatch: 0, pathMismatch: 0, paginationMismatch: 0,
    watermarkMismatch: 0, bodyShapeMismatch: 0,
};
let objectsDivergedCount = 0;

const TYPE_MAP = { 's:string': 'string', 's:int': 'integer', 's:double': 'number', 's:boolean': 'boolean', 's:dateTime': 'datetime', 's:long': 'integer' };

for (const typeName of recordTypeNames) {
    const io = emittedByName.get(typeName);
    if (!io) continue; // covered by objectsMissing
    const rederived = resolveFields(typeName);
    const rederivedNames = new Set(rederived.map(f => f.name));
    const emittedFields = io.relatedEntities?.['MJ: Integration Object Fields'] ?? [];
    const emittedNames = new Set(emittedFields.map(f => f.fields.Name));

    const missingFields = [...rederivedNames].filter(n => !emittedNames.has(n));
    const extraFields = [...emittedNames].filter(n => !rederivedNames.has(n));

    const { pkCandidates, fkCandidates } = classifyFields(typeName, rederived);
    const emittedPKs = emittedFields.filter(f => f.fields.IsPrimaryKey).map(f => f.fields.Name);
    const pkMismatch = (pkCandidates.length > 0 && emittedPKs.length > 0 &&
        !pkCandidates.some(c => emittedPKs.includes(c)))
        ? `rederived=[${pkCandidates.join(',')}] emitted=[${emittedPKs.join(',')}]`
        : null;

    // fkMisclassified: an emitted IsForeignKey=true field whose type (per our registry) is NOT a
    // scalar (i.e., resolves to a nested/array/object type rather than a primitive) -- OR an emitted
    // FK field we could not corroborate as a naming-pattern FK to any known record type at all.
    const fkMisclassified = [];
    for (const ef of emittedFields) {
        if (!ef.fields.IsForeignKey) continue;
        const src = rederived.find(f => f.name === ef.fields.Name);
        const rederivedFK = fkCandidates.find(c => c.field === ef.fields.Name);
        if (!rederivedFK) {
            // no naming-pattern corroboration for this FK -- flag for review (weak signal, not fatal)
            const targetIsScalar = !src || !complexTypeByName.has(src.type) || TYPE_MAP[`s:${src.type}`] || ['string','int','double','boolean','dateTime','long'].includes(src.type);
            if (!targetIsScalar) fkMisclassified.push(`${ef.fields.Name} (type=${src?.type} is object-typed, not a scalar FK)`);
        }
    }

    const assoc = opsByType.get(typeName) ?? { list: [], create: [], update: [], delete: [], get: [] };
    const writeOpsMissing = [];
    if (io.fields.SupportsCreate && assoc.create.length === 0) writeOpsMissing.push('create');
    if (io.fields.SupportsUpdate && assoc.update.length === 0) writeOpsMissing.push('update');
    if (io.fields.SupportsDelete && assoc.delete.length === 0) writeOpsMissing.push('delete');
    if (!io.fields.SupportsCreate && assoc.create.length > 0) writeOpsMissing.push('create-op-exists-but-SupportsCreate=false');
    if (!io.fields.SupportsUpdate && assoc.update.length > 0) writeOpsMissing.push('update-op-exists-but-SupportsUpdate=false');

    const pathMismatch = (io.fields.APIPath !== '/mmapi.asmx') ? `emitted APIPath=${io.fields.APIPath} but this is a single-endpoint SOAP service (/mmapi.asmx)` : null;

    const pag = paginationSignal(typeName);
    let paginationMismatch = null;
    const emittedPagType = io.fields.PaginationType;
    if (pag && pag.style === 'PageNumber' && emittedPagType !== 'PageNumber') {
        paginationMismatch = `rederived pagination signal 'PageNumber' via op ${pag.op} (${pag.evidence.join(',')}) but emitted PaginationType=${emittedPagType}`;
    } else if (!pag && emittedPagType === 'PageNumber') {
        paginationMismatch = `emitted PaginationType=PageNumber but no page-param signal found in associated ops`;
    }

    let watermarkMismatch = null;
    if (io.fields.SupportsIncrementalSync) {
        if (!pag || !/date/i.test(pag.style)) {
            watermarkMismatch = `SupportsIncrementalSync=true, declared IncrementalWatermarkField=${io.fields.IncrementalWatermarkField ?? 'null'}, but no date-range param signal independently found on associated ops (${[...assoc.list, ...assoc.get].join(',') || 'none'})`;
        }
    }

    let bodyShapeMismatch = null;
    if (io.fields.SupportsCreate && io.fields.CreateBodyShape && io.fields.CreateBodyShape !== 'literal') {
        // SOAP document/literal bodies always wrap in the operation element itself -- 'flat'/'wrapped'
        // (REST conventions) don't apply; expect 'literal' for every SOAP object.
        bodyShapeMismatch = `emitted CreateBodyShape=${io.fields.CreateBodyShape}; SOAP document/literal operations are expected to be classified 'literal'`;
    }

    const typeMismatches = [];
    for (const rf of rederived) {
        const ef = emittedFields.find(x => x.fields.Name === rf.name);
        if (!ef) continue;
        const mapped = TYPE_MAP[`s:${rf.type}`]
            ?? (/^ArrayOf/i.test(rf.type ?? '') ? 'array'
            : simpleTypeEnumNames.has(rf.type) ? 'enum'
            : complexTypeByName.has(rf.type) ? 'object'
            : rf.type);
        if (mapped && ef.fields.Type && mapped !== ef.fields.Type) {
            typeMismatches.push(`${rf.name}: rederived=${mapped} emitted=${ef.fields.Type}`);
        }
    }

    const diverged = missingFields.length || extraFields.length || typeMismatches.length ||
        fkMisclassified.length || writeOpsMissing.length || pkMismatch || pathMismatch ||
        paginationMismatch || watermarkMismatch || bodyShapeMismatch;

    if (diverged) {
        objectsDivergedCount++;
        if (missingFields.length) histogram.missingFields++;
        if (extraFields.length) histogram.extraFields++;
        if (typeMismatches.length) histogram.typeMismatches++;
        if (fkMisclassified.length) histogram.fkMisclassified++;
        if (writeOpsMissing.length) histogram.writeOpsMissing++;
        if (pkMismatch) histogram.pkMismatch++;
        if (pathMismatch) histogram.pathMismatch++;
        if (paginationMismatch) histogram.paginationMismatch++;
        if (watermarkMismatch) histogram.watermarkMismatch++;
        if (bodyShapeMismatch) histogram.bodyShapeMismatch++;
    }

    perObjectFull.push({
        object: typeName,
        diverged: !!diverged,
        rederivedFieldCount: rederived.length,
        emittedFieldCount: emittedFields.length,
        missingFields, extraFields,
        pkMismatch: pkMismatch || undefined,
        pkCandidatesRederived: pkCandidates,
        writeOpsMissing,
        fkMisclassified,
        fkCandidatesRederived: fkCandidates.map(c => `${c.field}->${c.target}`),
        paginationMismatch: paginationMismatch || undefined,
        watermarkMismatch: watermarkMismatch || undefined,
        bodyShapeMismatch: bodyShapeMismatch || undefined,
        typeMismatches,
        pathMismatch: pathMismatch || undefined,
        opsAssociated: assoc,
    });
}

// ── 13. Write full lossless artifact ────────────────────────────────────────
mkdirSync(OUT_DIR, { recursive: true });
const fullResult = {
    artifact: OUT_FILE,
    strategy: STRATEGY,
    enumeratedCount: recordTypeNames.length,
    emittedCount: emittedSet.size,
    objectsMissing,
    objectsExtra,
    objectsDivergedCount,
    divergenceHistogram: histogram,
    perObject: perObjectFull,
};
writeFileSync(OUT_FILE, JSON.stringify(fullResult, null, 2) + '\n');

// ── 14. Compact, actionable-only stdout summary ─────────────────────────────
const PRIORITY_KEYS = ['missingFields', 'fkMisclassified', 'writeOpsMissing', 'pkMismatch', 'pathMismatch', 'bodyShapeMismatch', 'paginationMismatch', 'watermarkMismatch'];
function isActionable(o) {
    return o.missingFields.length > 0 || o.fkMisclassified.length > 0 || o.writeOpsMissing.length > 0 ||
        o.pkMismatch || o.pathMismatch || o.bodyShapeMismatch || o.paginationMismatch || o.watermarkMismatch;
}
const actionable = perObjectFull.filter(o => o.diverged && isActionable(o));
actionable.sort((a, b) => {
    const score = (o) => PRIORITY_KEYS.reduce((s, k) => s + (Array.isArray(o[k]) ? (o[k].length > 0 ? 1 : 0) : (o[k] ? 1 : 0)), 0);
    return score(b) - score(a);
});
const cappedSample = actionable.slice(0, 40).map(o => ({
    object: o.object,
    diverged: true,
    rederivedFieldCount: o.rederivedFieldCount,
    emittedFieldCount: o.emittedFieldCount,
    missingFields: o.missingFields,
    extraFields: o.extraFields,
    ...(o.pathMismatch ? { pathMismatch: o.pathMismatch } : {}),
    ...(o.pkMismatch ? { pkMismatch: o.pkMismatch } : {}),
    writeOpsMissing: o.writeOpsMissing,
    fkMisclassified: o.fkMisclassified,
    ...(o.paginationMismatch ? { paginationMismatch: o.paginationMismatch } : {}),
    ...(o.watermarkMismatch ? { watermarkMismatch: o.watermarkMismatch } : {}),
    ...(o.bodyShapeMismatch ? { bodyShapeMismatch: o.bodyShapeMismatch } : {}),
    typeMismatches: o.typeMismatches,
}));

const compact = {
    artifact: OUT_FILE,
    strategy: STRATEGY,
    enumeratedCount: recordTypeNames.length,
    objectsMissing,
    objectsExtra,
    objectsDivergedCount,
    divergenceHistogram: histogram,
    perObject: cappedSample,
};
process.stdout.write(JSON.stringify(compact, null, 2) + '\n');
