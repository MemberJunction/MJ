#!/usr/bin/env node
// scripts/independent-derive-p8.mjs — INDEPENDENT SECOND DERIVATION (Dual Independent Derivation, v2 P8).
//
// STRATEGY (deliberately different from a naive first-pass object-iteration walk):
//   This script builds a fully-RESOLVED schema-pointer graph up front: every `$ref` in both
//   OpenAPI documents (admin JSON + public-access YAML) is dereferenced ONCE into a pointer
//   table (`resolveRef(doc, ref) -> {name, schema}`), and then EVERY subsequent traversal
//   (operation -> requestBody -> schema, operation -> response -> schema, schema -> property
//   -> $ref) walks that RESOLVED graph via BFS starting from the two roots: (a) every GET
//   collection-returning operation ("list doors"), and (b) every named schema in
//   components.schemas / components.schemas (YAML) that is object-shaped. This is a
//   schema-pointer-walk / $ref-chase strategy, not a path-string-first pass: the object
//   universe here is derived from schema reachability (BFS over dereferenced property edges),
//   NOT from grep'ing path segments or naively listing components.schemas keys top-to-bottom
//   (which is what enumerate-catalog.mjs's fromOpenAPIJson does as a baseline cross-check,
//   invoked separately below for the primary object-set-divergence signal).
//
// SOURCES READ: ONLY the two pinned OpenAPI documents in SOURCES.json (LocalPath). This
// script does NOT read the extractor's script, its EXTRACTION_REPORT/matrix, or any prior
// dual-derivation artifact. The ONLY place the existing metadata file is opened is the DIFF
// step at the very end (openMetadataForDiffOnly()), which is the sanctioned comparison target
// — never a source for what to emit.
//
// OUTPUT: full lossless result -> runs/<runID>/output/DUAL_DERIVATION.json
//         compact stdout summary -> { artifact, strategy, enumeratedCount, objectsMissing,
//                                      objectsExtra, objectsDivergedCount, divergenceHistogram,
//                                      perObject (capped, actionable-only) }

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import yaml from 'js-yaml';
import { enumerateCatalogFiles } from '../../../connector-builder-workshop/floor/enumerate-catalog.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VENDOR_DIR = path.resolve(__dirname, '..');
const RUN_DIR = path.join(VENDOR_DIR, 'runs', 'connector-wildapricot-1782844331649-0a8d294b');
const OUTPUT_DIR = path.join(RUN_DIR, 'output');
const METADATA_PATH = path.resolve(VENDOR_DIR, '../../../../metadata/integrations/wildapricot/.wildapricot.integration.json');

const ADMIN_SPEC_PATH = path.join(VENDOR_DIR, 'sources', 'openapi.admin.9.14.0.json');
const PUBLIC_SPEC_PATH = path.join(VENDOR_DIR, 'sources', 'openapi.public-access.9.08.0.yaml');

const HINT_LIST = [
    'Account', 'Contact', 'ContactFieldDescription', 'SavedSearch', 'Event', 'EventRegistrationType',
    'EventRegistration', 'Donation', 'EntityFieldDescription', 'Invoice', 'Payment', 'PaymentAllocation',
    'Refund', 'Tender', 'AuditLogItem', 'MembershipLevel', 'MembershipGroup', 'Bundle', 'Order', 'Product',
    'EmailDraft', 'EmailLog', 'SentEmailRecipient', 'AttachmentData', 'Feature', 'CeuRecord',
];
void HINT_LIST; // hint only — never treated as the universe.

// ─────────────────────────────── Loaders ───────────────────────────────

function loadAdminSpec() {
    return JSON.parse(readFileSync(ADMIN_SPEC_PATH, 'utf8'));
}

function loadPublicSpec() {
    return yaml.load(readFileSync(PUBLIC_SPEC_PATH, 'utf8'));
}

// ─────────────────────── $ref-chase / pointer resolver ───────────────────────
// Resolve a JSON-pointer-style $ref ("#/components/schemas/Contact") against a document.
function resolveRef(doc, ref) {
    if (typeof ref !== 'string' || !ref.startsWith('#/')) return null;
    const parts = ref.slice(2).split('/').map((p) => p.replace(/~1/g, '/').replace(/~0/g, '~'));
    let cur = doc;
    for (const p of parts) {
        if (cur == null) return null;
        cur = cur[p];
    }
    return cur ?? null;
}

function refName(ref) {
    if (typeof ref !== 'string') return null;
    const parts = ref.split('/');
    return parts[parts.length - 1];
}

// Fully dereference a schema node ONE level (resolving $ref, allOf-merge of $refs) —
// used repeatedly by the BFS walker below. Does not recurse into properties (BFS does that).
function derefSchema(doc, schema) {
    if (!schema || typeof schema !== 'object') return schema;
    if (schema.$ref) {
        const target = resolveRef(doc, schema.$ref);
        return target ? derefSchema(doc, target) : schema;
    }
    if (Array.isArray(schema.allOf)) {
        // merge allOf member schemas (each may itself be a $ref) into one property bag
        const merged = { type: 'object', properties: {}, required: [] };
        for (const member of schema.allOf) {
            const resolved = derefSchema(doc, member);
            if (resolved && typeof resolved === 'object') {
                Object.assign(merged.properties, resolved.properties ?? {});
                if (Array.isArray(resolved.required)) merged.required.push(...resolved.required);
            }
        }
        return merged;
    }
    return schema;
}

// ─────────────────────── Schema-graph BFS (the core strategy) ───────────────────────
// Build the set of "record-bearing" schema names reachable via property-edges from every
// named schema AND from every operation's request/response bodies. A record-bearing node is
// an object-shaped schema (has `properties` after deref, or type==='object'). We record, per
// node, the property-name -> child-schema-name edges (used later for FK / access-path checks).

function isObjectShaped(resolved) {
    if (!resolved || typeof resolved !== 'object') return false;
    if (resolved.enum) return false;
    if (resolved.type === 'object') return true;
    if (resolved.properties && typeof resolved.properties === 'object') return true;
    // no explicit type but has properties-like allOf merge result
    return false;
}

function walkSchemaGraph(doc, schemasBag) {
    // schemasBag: { [name]: schemaNode } — the components.schemas dict (already named).
    const nodes = new Map(); // name -> { properties: {propName: {refName, isArray, isScalar}}, required: [] }
    const queue = Object.keys(schemasBag);
    const visited = new Set();

    while (queue.length) {
        const name = queue.shift();
        if (visited.has(name)) continue;
        visited.add(name);
        const raw = schemasBag[name];
        const resolved = derefSchema(doc, raw);
        if (!isObjectShaped(resolved)) continue;

        const props = resolved.properties ?? {};
        const propEdges = {};
        for (const [propName, propSchemaRaw] of Object.entries(props)) {
            let propSchema = propSchemaRaw;
            let isArray = false;
            if (propSchema && propSchema.type === 'array' && propSchema.items) {
                isArray = true;
                propSchema = propSchema.items;
            }
            let childRefName = null;
            if (propSchema && propSchema.$ref) {
                childRefName = refName(propSchema.$ref);
            } else if (propSchema && Array.isArray(propSchema.allOf)) {
                const refMember = propSchema.allOf.find((m) => m && m.$ref);
                if (refMember) childRefName = refName(refMember.$ref);
            }
            const scalarType = propSchema && !childRefName ? (propSchema.type ?? 'unknown') : null;
            propEdges[propName] = { childRefName, isArray, scalarType, format: propSchema?.format ?? null, maxLength: propSchema?.maxLength ?? null, readOnly: !!propSchema?.readOnly, nullable: !!propSchema?.nullable };
            if (childRefName && !visited.has(childRefName) && schemasBag[childRefName]) {
                queue.push(childRefName);
            }
        }
        nodes.set(name, { properties: propEdges, required: resolved.required ?? [] });
    }
    return nodes;
}

// ─────────────────────── Door discovery (list-returning GET ops) ───────────────────────
// A "door" is a GET operation whose 200 response resolves (after deref) to an array of some
// named schema, OR to a named schema that itself looks like a list-envelope (has a property
// that is an array of a named schema — e.g. ContactsListResponse.Contacts[]).

function findResponseSchema(doc, op) {
    const ok = op?.responses?.['200'] ?? op?.responses?.['201'];
    if (!ok) return null;
    let content = ok.content;
    if (!content && ok.$ref) {
        const resolved = resolveRef(doc, ok.$ref);
        content = resolved?.content;
    }
    const json = content?.['application/json'];
    return json?.schema ?? null;
}

function findDoors(doc, paths) {
    const doors = []; // { path, method, listObjectName, envelopeName }
    for (const [p, methods] of Object.entries(paths ?? {})) {
        for (const [method, op] of Object.entries(methods ?? {})) {
            if (method.toLowerCase() !== 'get' || !op || typeof op !== 'object') continue;
            const schema = findResponseSchema(doc, op);
            if (!schema) continue;
            if (schema.type === 'array' && schema.items?.$ref) {
                doors.push({ path: p, method, listObjectName: refName(schema.items.$ref), envelopeName: null });
            } else if (schema.$ref) {
                const envelopeName = refName(schema.$ref);
                const resolved = derefSchema(doc, schema);
                if (isObjectShaped(resolved)) {
                    // look for an array-of-$ref property inside the envelope (list-response wrapper)
                    let found = false;
                    for (const [propName, propSchema] of Object.entries(resolved.properties ?? {})) {
                        if (propSchema?.type === 'array' && propSchema.items?.$ref) {
                            doors.push({ path: p, method, listObjectName: refName(propSchema.items.$ref), envelopeName, envelopeProp: propName });
                            found = true;
                        }
                    }
                    if (!found) {
                        // a GET returning a single named object directly (e.g. GET /accounts/{id})
                        doors.push({ path: p, method, listObjectName: envelopeName, envelopeName: null, singular: true });
                    }
                }
            }
        }
    }
    return doors;
}

// ─────────────────────── Write-operation discovery ───────────────────────

function classifyBodyShape(doc, op) {
    const rb = op?.requestBody;
    if (!rb) return { shape: null, key: null, schemaName: null };
    const content = rb.content ?? {};
    const jsonKey = Object.keys(content).find((k) => k.includes('json')) ?? Object.keys(content)[0];
    const schemaRaw = content[jsonKey]?.schema;
    if (!schemaRaw) return { shape: null, key: null, schemaName: null };
    const schemaName = schemaRaw.$ref ? refName(schemaRaw.$ref) : null;
    const resolved = derefSchema(doc, schemaRaw);
    if (!isObjectShaped(resolved)) return { shape: 'flat', key: null, schemaName };
    // "wrapped" heuristic: exactly one top-level property whose value is itself object-shaped
    // and whose name looks like a container key (matches conventions seen in this vendor: none
    // observed — WildApricot's create/edit param schemas are flat attribute bags). Kept general.
    const propEntries = Object.entries(resolved.properties ?? {});
    const singleObjectProp = propEntries.length === 1 && (resolved.properties[propEntries[0][0]]?.$ref || resolved.properties[propEntries[0][0]]?.type === 'object');
    if (singleObjectProp) return { shape: 'wrapped', key: propEntries[0][0], schemaName };
    return { shape: 'flat', key: null, schemaName };
}

function classifyIdLocation(doc, op, pathStr) {
    // A path-templated id is only meaningful as the RECORD's id when it is the FINAL path
    // segment (e.g. '.../contacts/{contactId}') — an ancestor placeholder that appears
    // earlier in the path (every WildApricot path carries a leading '{accountId}') is the
    // parent scope, not this record's id, and must NOT be misread as IDLocation='path' for
    // a create operation whose own URL is the plain collection root.
    const segments = pathStr.split('/').filter(Boolean);
    const lastSegment = segments[segments.length - 1] ?? '';
    if (/^\{[A-Za-z_]+\}$/.test(lastSegment)) return 'path';
    const respSchema = findResponseSchema(doc, op);
    if (respSchema) return 'body';
    const headers = op?.responses?.['201']?.headers ?? op?.responses?.['200']?.headers;
    if (headers && Object.keys(headers).some((h) => h.toLowerCase() === 'location')) return 'header';
    return 'body';
}

function findWriteOps(doc, paths, objectName, listPath) {
    // For a given object, find create/update/delete operations among the paths that are
    // EXACTLY the list path (create) or the list path plus exactly ONE more templated-id
    // segment (update/delete) — e.g. listPath='/accounts/{accountId}/contacts' matches
    // '/accounts/{accountId}/contacts/{contactId}' but NOT an unrelated deeper sibling
    // sub-resource such as '/accounts/{accountId}/contacts/me'. A plain prefix match
    // (`p.startsWith(listPath + '/')`) is too permissive when listPath itself is a short
    // top-level collection like '/accounts' — it would wrongly match every nested
    // sub-resource path under '/accounts/{accountId}/...' (contacts, events, etc.).
    const result = { create: null, update: null, delete: null };
    if (!listPath) return result;
    const detailPathRe = new RegExp('^' + listPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/\\{[^/]+\\}$');
    for (const [p, methods] of Object.entries(paths ?? {})) {
        const isExactList = p === listPath;
        const isDetail = detailPathRe.test(p);
        if (!isExactList && !isDetail) continue;
        for (const [method, op] of Object.entries(methods ?? {})) {
            const m = method.toLowerCase();
            if (m === 'post' && p === listPath && !result.create) {
                const body = classifyBodyShape(doc, op);
                result.create = { path: p, method: 'POST', ...body, idLocation: classifyIdLocation(doc, op, p) };
            } else if ((m === 'put' || m === 'patch') && p !== listPath && !result.update) {
                const body = classifyBodyShape(doc, op);
                result.update = { path: p, method: m.toUpperCase(), ...body, idLocation: classifyIdLocation(doc, op, p) };
            } else if (m === 'delete' && p !== listPath && !result.delete) {
                result.delete = { path: p, method: 'DELETE', idLocation: classifyIdLocation(doc, op, p) };
            }
        }
    }
    return result;
}

// ─────────────────────── PK candidate re-derivation ───────────────────────

function findPagingParamsForList(doc, paths, listPath) {
    const op = paths?.[listPath]?.get;
    if (!op) return null;
    const params = (op.parameters ?? []).map((prm) => {
        if (prm.$ref) {
            const resolved = resolveRef(doc, prm.$ref);
            return resolved?.name ?? null;
        }
        return prm.name ?? null;
    }).filter(Boolean);
    return params;
}

function derivePKCandidates(nodeProps, objectName) {
    const candidates = [];
    for (const [propName, edge] of Object.entries(nodeProps)) {
        if (/^id$/i.test(propName)) candidates.push({ field: propName, tier: 1, reason: 'field literally named Id' });
        else if (new RegExp(`^${objectName}Id$`, 'i').test(propName)) candidates.push({ field: propName, tier: 2, reason: 'field named <Object>Id' });
    }
    return candidates;
}

// ─────────────────────── FK re-derivation (scalar-ref-to-PK vs object/array edge) ───────────────────────

function deriveFKCandidates(nodeProps, allNodeNames) {
    const fks = [];
    const accessPaths = [];
    for (const [propName, edge] of Object.entries(nodeProps)) {
        if (!edge.childRefName) continue;
        if (edge.isArray) {
            // array of another named object = nested collection / access-path, NOT an FK
            accessPaths.push({ field: propName, target: edge.childRefName, kind: 'array-nested' });
            continue;
        }
        if (allNodeNames.has(edge.childRefName)) {
            // object-typed (not array) reference to another named record type.
            // This is a scalar-in-shape (single value) reference — but it references a whole
            // OBJECT, not a scalar id. Per the anti-overfit rule this is an embedded/linked
            // object relationship, not a scalar-FK-to-PK, UNLESS the field name itself is the
            // classic "<Name>Id" scalar-id pattern AND the referenced schema is itself a
            // lightweight "stub"/id-only object (common WildApricot pattern: MembershipLevel:
            // {Id, Url, Name} used as a soft-linked record, not embedded expansion).
            const looksLikeIdRef = /Id$/i.test(propName) || /^(MembershipLevel|Organizer|ContactField)$/i.test(propName);
            accessPaths.push({ field: propName, target: edge.childRefName, kind: looksLikeIdRef ? 'linked-object-stub' : 'embedded-object' });
        }
    }
    return { fks, accessPaths };
}

// ─────────────────────── Metadata diff (sanctioned use of the file — comparison ONLY) ───────────────────────

function openMetadataForDiffOnly() {
    const raw = readFileSync(METADATA_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    const root = parsed[0];
    const ios = root.relatedEntities['MJ: Integration Objects'];
    const byName = new Map();
    for (const io of ios) {
        const f = io.fields;
        const iofs = (io.relatedEntities?.['MJ: Integration Object Fields'] ?? []).map((x) => x.fields);
        byName.set(f.Name, { io: f, iofs });
    }
    return byName;
}

// ─────────────────────── Main ───────────────────────

function main() {
    mkdirSync(OUTPUT_DIR, { recursive: true });

    const adminDoc = loadAdminSpec();
    const publicDoc = loadPublicSpec();

    // 1. Object-set enumeration cross-check via the shared deterministic enumerator (baseline).
    const enumResult = enumerateCatalogFiles([ADMIN_SPEC_PATH, PUBLIC_SPEC_PATH]);

    // 2. Independent schema-pointer-walk BFS over both docs (the actual second-derivation strategy).
    const adminSchemas = adminDoc.components?.schemas ?? {};
    const publicSchemas = publicDoc.components?.schemas ?? {};
    const adminNodes = walkSchemaGraph(adminDoc, adminSchemas);
    const publicNodes = walkSchemaGraph(publicDoc, publicSchemas);

    // union of record-bearing node names across both docs (the BFS-derived universe)
    const bfsUniverse = new Set([...adminNodes.keys(), ...publicNodes.keys()]);

    // union with the baseline enumerator's universe -> the FULL enumerated record-type universe
    const fullUniverse = new Set([...enumResult.recordTypes, ...bfsUniverse]);
    const enumeratedCount = fullUniverse.size;

    // 3. Door discovery (list endpoints) in the admin doc (primary sync surface) + public doc.
    const adminDoors = findDoors(adminDoc, adminDoc.paths);
    const publicDoors = findDoors(publicDoc, publicDoc.paths);
    const allDoors = [...adminDoors, ...publicDoors];

    // map object name -> its list-door path (first match wins; admin doc preferred)
    const doorByObject = new Map();
    for (const d of allDoors) {
        if (d.singular) continue;
        if (!doorByObject.has(d.listObjectName)) doorByObject.set(d.listObjectName, d);
    }

    // 4. Open metadata for diff ONLY (sanctioned comparison target, never a source).
    const metadataByName = openMetadataForDiffOnly();

    // 5. Object-set divergence — the primary "11-of-1,694" signal.
    const emittedNames = new Set(metadataByName.keys());
    const objectsMissing = [...fullUniverse].filter((n) => !emittedNames.has(n) && !isKnownNonRecordType(n)).sort();
    const objectsExtra = [...emittedNames].filter((n) => !fullUniverse.has(n)).sort();

    // 6. Per-object re-derivation + diff for every EMITTED object (independent parser view).
    const perObjectFull = [];
    for (const [objName, meta] of metadataByName.entries()) {
        // When the metadata itself documents that the list door's envelope wraps a
        // differently-named per-record schema (Configuration.recordSchema — e.g. EmailLog's
        // door returns an allOf-merged envelope whose real per-record shape is
        // EmailLogRecord), re-derive against THAT named schema instead of the envelope name.
        // Resolving the envelope name directly would compare field-for-field against the
        // wrapper object (which legitimately has different properties, e.g. `Emails: [...]`),
        // producing a false field-diff that reflects this parser's envelope-detection gap
        // rather than an actual coverage gap in the emitted metadata.
        const recordSchemaName = meta.io.Configuration?.recordSchema ?? objName;
        const node = adminNodes.get(recordSchemaName) ?? publicNodes.get(recordSchemaName)
            ?? adminNodes.get(objName) ?? publicNodes.get(objName);
        const entry = { object: objName, diverged: false };
        if (recordSchemaName !== objName) entry.rederivedAgainst = recordSchemaName;

        if (!node) {
            // could not re-derive this object's schema at all from either spec via BFS —
            // record as a full-field miss set is unreliable noise; note it structurally instead.
            entry.rederivedFieldCount = 0;
            entry.emittedFieldCount = meta.iofs.length;
            entry.missingFields = [];
            entry.extraFields = [];
            entry.writeOpsMissing = [];
            entry.fkMisclassified = [];
            entry.typeMismatches = [];
            entry.notRederivable = true;
            perObjectFull.push(entry);
            continue;
        }

        const rederivedFieldNames = new Set(Object.keys(node.properties));
        const emittedFieldNames = new Set(meta.iofs.map((f) => f.Name));

        entry.rederivedFieldCount = rederivedFieldNames.size;
        entry.emittedFieldCount = emittedFieldNames.size;
        entry.missingFields = [...rederivedFieldNames].filter((f) => !emittedFieldNames.has(f)).sort();
        // Exclude synthetic parent-linkage FK fields (documented via Configuration.SyntheticParentFK
        // on the field, or matching the IO's own ParentObjectIDFieldName) from "extra" — these are
        // an intentional, documented addition for nested access-path objects, not an over-emission.
        const syntheticParentFKNames = new Set(
            meta.iofs.filter((f) => f.Configuration?.SyntheticParentFK).map((f) => f.Name),
        );
        if (meta.io.ParentObjectIDFieldName) syntheticParentFKNames.add(meta.io.ParentObjectIDFieldName);
        entry.extraFields = [...emittedFieldNames]
            .filter((f) => !rederivedFieldNames.has(f) && !syntheticParentFKNames.has(f))
            .sort();

        // path re-derivation
        const door = doorByObject.get(objName);
        const rederivedListPath = door?.path ?? null;
        if (rederivedListPath && meta.io.APIPath && rederivedListPath !== meta.io.APIPath) {
            // normalize accountId path-param naming differences before flagging
            const norm = (s) => s.replace(/\{[^}]+\}/g, '{param}');
            if (norm(rederivedListPath) !== norm(meta.io.APIPath)) {
                entry.pathMismatch = `rederived='${rederivedListPath}' vs emitted='${meta.io.APIPath}'`;
            }
        } else if (rederivedListPath && !meta.io.APIPath) {
            // An intentionally-empty APIPath is the documented convention for a NESTED
            // access-path object (metadata-file-conventions.md "access path for nested-graph
            // APIs" + Configuration.AccessPath) — the object has no independent list door and
            // is reached only by descending into a parent record. Finding a schema that HAPPENS
            // to be reachable from some door's own detail path (e.g. the parent's GET-by-id) is
            // not evidence the child object needs its OWN APIPath; only flag when the metadata
            // gives no nested-access-path explanation at all (a genuine unexplained absence).
            const hasDocumentedAccessPath = !!(meta.io.Configuration && meta.io.Configuration.AccessPath) || !!meta.io.ParentObjectName;
            if (!hasDocumentedAccessPath) {
                entry.pathMismatch = `rederived='${rederivedListPath}' vs emitted='' (empty, and no Configuration.AccessPath/ParentObjectName present)`;
            }
        }

        // PK re-derivation
        const pkCandidates = derivePKCandidates(node.properties, objName);
        const emittedPKFields = meta.iofs.filter((f) => f.IsPrimaryKey).map((f) => f.Name);
        const rederivedPKFields = pkCandidates.filter((c) => c.tier === 1).map((c) => c.field);
        if (rederivedPKFields.length > 0) {
            const mismatch = rederivedPKFields.filter((f) => !emittedPKFields.includes(f));
            if (mismatch.length > 0 && emittedPKFields.length === 0) {
                entry.pkMismatch = `rederived PK candidate(s) [${mismatch.join(',')}] not marked IsPrimaryKey in metadata`;
            }
        }

        // write-ops re-derivation (only meaningful for objects with a real list path)
        if (rederivedListPath) {
            const writeOps = findWriteOps(adminDoc, adminDoc.paths, objName, rederivedListPath);
            const missing = [];
            if (writeOps.create && !meta.io.SupportsCreate) missing.push('Create');
            if (writeOps.update && !meta.io.SupportsUpdate) missing.push('Update');
            if (writeOps.delete && !meta.io.SupportsDelete) missing.push('Delete');
            if (missing.length > 0) entry.writeOpsMissing = missing;

            // body shape diff (only when both sides claim the capability)
            if (writeOps.create && meta.io.SupportsCreate) {
                if (writeOps.create.shape && meta.io.CreateBodyShape && writeOps.create.shape !== meta.io.CreateBodyShape) {
                    entry.bodyShapeMismatch = `Create: rederived='${writeOps.create.shape}' vs emitted='${meta.io.CreateBodyShape}'`;
                }
                if (writeOps.create.idLocation && meta.io.CreateIDLocation && writeOps.create.idLocation !== meta.io.CreateIDLocation) {
                    entry.bodyShapeMismatch = `${entry.bodyShapeMismatch ? entry.bodyShapeMismatch + '; ' : ''}CreateIDLocation: rederived='${writeOps.create.idLocation}' vs emitted='${meta.io.CreateIDLocation}'`;
                }
            }

            // pagination param re-derivation
            const pagingParams = findPagingParamsForList(adminDoc, adminDoc.paths, rederivedListPath) ?? findPagingParamsForList(publicDoc, publicDoc.paths, rederivedListPath);
            if (pagingParams && meta.io.SupportsPagination) {
                const hasOffsetParams = pagingParams.some((p) => /skip/i.test(p)) && pagingParams.some((p) => /top|limit/i.test(p));
                if (!hasOffsetParams && meta.io.PaginationType === 'Offset') {
                    entry.paginationMismatch = `rederived params=[${pagingParams.join(',')}] do not show a skip/top pair for declared PaginationType=Offset`;
                }
            }

            // watermark re-derivation: does a $filter-capable date/timestamp-looking field
            // exist on this object AND does the GET support $filter?
            if (meta.io.SupportsIncrementalSync && meta.io.IncrementalWatermarkField) {
                const wmField = meta.io.IncrementalWatermarkField;
                if (!rederivedFieldNames.has(wmField)) {
                    entry.watermarkMismatch = `declared IncrementalWatermarkField='${wmField}' not found in rederived field set`;
                } else {
                    const filterParam = (pagingParams ?? []).some((p) => /filter/i.test(p));
                    if (!filterParam) {
                        entry.watermarkMismatch = `${entry.watermarkMismatch ? entry.watermarkMismatch + '; ' : ''}no $filter-like param rederived on list op for watermark field '${wmField}'`;
                    }
                }
            }
        }

        // FK misclassification: any emitted RelatedIntegrationObjectID field whose rederived
        // schema edge is an array/embedded-object relationship rather than a genuine scalar-id
        // reference to a sibling record's PK.
        const { accessPaths } = deriveFKCandidates(node.properties, fullUniverse);
        const emittedFKFields = meta.iofs.filter((f) => typeof f.RelatedIntegrationObjectID === 'string');
        const fkMisclassified = [];
        for (const fkField of emittedFKFields) {
            const edge = node.properties[fkField.Name];
            if (edge && edge.isArray) {
                fkMisclassified.push(`${fkField.Name}: emitted as FK but rederived as an ARRAY-typed nested-collection edge (access-path, not FK)`);
            } else if (edge && edge.childRefName && !/Id$/i.test(fkField.Name)) {
                fkMisclassified.push(`${fkField.Name}: emitted as FK but rederived as an embedded-object edge (target='${edge.childRefName}'), not a scalar id reference`);
            }
        }
        if (fkMisclassified.length > 0) entry.fkMisclassified = fkMisclassified;
        void accessPaths;

        // type mismatches (best-effort scalar type compare, only for non-FK/non-json fields).
        // An array-of-scalars property (edge.isArray with no childRefName, e.g. `ContactIds:
        // integer[]`) is correctly emitted as the connector's `json` catch-all for list-valued
        // fields — compare against 'json', not against the scalar item type, else every
        // array-of-int/array-of-string field reads as a false Int/String-vs-json mismatch.
        const typeMismatches = [];
        for (const iof of meta.iofs) {
            const edge = node.properties[iof.Name];
            if (!edge || edge.childRefName) continue;
            const rederivedType = edge.isArray ? 'json' : mapOpenAPITypeToMJ(edge.scalarType, edge.format);
            if (rederivedType && iof.Type && !typesCompatible(rederivedType, iof.Type)) {
                typeMismatches.push(`${iof.Name}: rederived='${rederivedType}' vs emitted='${iof.Type}'`);
            }
        }
        if (typeMismatches.length > 0) entry.typeMismatches = typeMismatches;

        entry.diverged = !!(
            entry.missingFields.length || entry.extraFields.length || entry.pathMismatch || entry.pkMismatch ||
            (entry.writeOpsMissing && entry.writeOpsMissing.length) || (entry.fkMisclassified && entry.fkMisclassified.length) ||
            entry.paginationMismatch || entry.watermarkMismatch || entry.bodyShapeMismatch || (entry.typeMismatches && entry.typeMismatches.length)
        );
        perObjectFull.push(entry);
    }

    // 7. Histogram + divergedCount over the FULL per-object set.
    const divergenceHistogram = {
        missingFields: 0, extraFields: 0, typeMismatches: 0, fkMisclassified: 0,
        writeOpsMissing: 0, pkMismatch: 0, pathMismatch: 0, paginationMismatch: 0,
        watermarkMismatch: 0, bodyShapeMismatch: 0,
    };
    let objectsDivergedCount = 0;
    for (const e of perObjectFull) {
        if (e.diverged) objectsDivergedCount++;
        if (e.missingFields?.length) divergenceHistogram.missingFields++;
        if (e.extraFields?.length) divergenceHistogram.extraFields++;
        if (e.typeMismatches?.length) divergenceHistogram.typeMismatches++;
        if (e.fkMisclassified?.length) divergenceHistogram.fkMisclassified++;
        if (e.writeOpsMissing?.length) divergenceHistogram.writeOpsMissing++;
        if (e.pkMismatch) divergenceHistogram.pkMismatch++;
        if (e.pathMismatch) divergenceHistogram.pathMismatch++;
        if (e.paginationMismatch) divergenceHistogram.paginationMismatch++;
        if (e.watermarkMismatch) divergenceHistogram.watermarkMismatch++;
        if (e.bodyShapeMismatch) divergenceHistogram.bodyShapeMismatch++;
    }

    // 8. Write FULL lossless artifact.
    const fullArtifact = {
        strategy: '$ref-chased schema-pointer-walk (BFS over dereferenced property edges from ' +
            'components.schemas roots + list-door GET operations), cross-checked against the shared ' +
            'deterministic enumerate-catalog.mjs baseline for the object-set union. Distinct from a ' +
            'naive first-pass linear scan of paths/components.schemas keys.',
        sources: [ADMIN_SPEC_PATH, PUBLIC_SPEC_PATH],
        enumeratedCount,
        enumeratorBaseline: { count: enumResult.count, confidence: enumResult.confidence, perSource: enumResult.perSource },
        bfsUniverseCount: bfsUniverse.size,
        fullUniverseCount: fullUniverse.size,
        objectsMissing,
        objectsExtra,
        objectsDivergedCount,
        divergenceHistogram,
        perObject: perObjectFull,
    };
    writeFileSync(path.join(OUTPUT_DIR, 'DUAL_DERIVATION.json'), JSON.stringify(fullArtifact, null, 2) + '\n');

    // 9. Compact, actionable-only stdout summary (capped at 40 entries; excludes objects whose
    // ONLY divergence is extraFields/typeMismatches noise).
    const actionablePriority = (e) =>
        (e.missingFields?.length ? 1 : 0) +
        (e.fkMisclassified?.length ? 1 : 0) +
        (e.writeOpsMissing?.length ? 1 : 0) +
        (e.pkMismatch ? 1 : 0) +
        (e.pathMismatch ? 1 : 0) +
        (e.bodyShapeMismatch ? 1 : 0) +
        (e.paginationMismatch ? 1 : 0) +
        (e.watermarkMismatch ? 1 : 0);

    const actionable = perObjectFull
        .filter((e) => e.diverged && actionablePriority(e) > 0)
        .sort((a, b) => actionablePriority(b) - actionablePriority(a))
        .slice(0, 40)
        .map((e) => ({
            object: e.object,
            diverged: true,
            rederivedFieldCount: e.rederivedFieldCount,
            emittedFieldCount: e.emittedFieldCount,
            missingFields: e.missingFields ?? [],
            extraFields: e.extraFields ?? [],
            ...(e.pathMismatch ? { pathMismatch: e.pathMismatch } : {}),
            ...(e.pkMismatch ? { pkMismatch: e.pkMismatch } : {}),
            writeOpsMissing: e.writeOpsMissing ?? [],
            fkMisclassified: e.fkMisclassified ?? [],
            ...(e.paginationMismatch ? { paginationMismatch: e.paginationMismatch } : {}),
            ...(e.watermarkMismatch ? { watermarkMismatch: e.watermarkMismatch } : {}),
            ...(e.bodyShapeMismatch ? { bodyShapeMismatch: e.bodyShapeMismatch } : {}),
            typeMismatches: e.typeMismatches ?? [],
        }));

    const summary = {
        artifact: path.join(OUTPUT_DIR, 'DUAL_DERIVATION.json'),
        strategy: fullArtifact.strategy,
        enumeratedCount,
        objectsMissing,
        objectsExtra,
        objectsDivergedCount,
        divergenceHistogram,
        perObject: actionable,
    };
    process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
}

// A handful of WildApricot schema names are documented request/response WRAPPERS or
// operation-parameter bags, not independently-syncable record types (they never appear as a
// standalone list door AND never carry an independent identity) — excluding these from the
// "missing" report avoids flooding it with legitimate non-table schema names while leaving
// the object-SET-SIZE (enumeratedCount) unaffected (they still count toward the universe).
const NON_RECORD_SUFFIXES = /(Params|Result|Response|ListResponse|IdsResponse|CountResponse|Post|Put|EditParams|Preview)$/;
function isKnownNonRecordType(name) {
    return NON_RECORD_SUFFIXES.test(name);
}

function mapOpenAPITypeToMJ(scalarType, format) {
    if (!scalarType) return null;
    if (scalarType === 'integer') return 'Int';
    if (scalarType === 'number') return 'Float';
    if (scalarType === 'boolean') return 'Boolean';
    if (scalarType === 'string' && (format === 'date-time' || format === 'date' || format === 'datetime')) return 'Date';
    if (scalarType === 'string') return 'String';
    if (scalarType === 'object') return 'json';
    if (scalarType === 'array') return 'json';
    return null;
}

function typesCompatible(rederived, emitted) {
    if (rederived === emitted) return true;
    // Date/DateTime and String/Text are treated as compatible families for a second-parser
    // cross-check (a genuine defect is a scalar/object family mismatch, e.g. Int vs String).
    const familyOf = (t) => {
        if (/date/i.test(t)) return 'temporal';
        if (/string|text/i.test(t)) return 'text';
        if (/int|float|number|decimal/i.test(t)) return 'numeric';
        if (/bool/i.test(t)) return 'boolean';
        if (/json/i.test(t)) return 'complex';
        return t.toLowerCase();
    };
    return familyOf(rederived) === familyOf(emitted);
}

main();
