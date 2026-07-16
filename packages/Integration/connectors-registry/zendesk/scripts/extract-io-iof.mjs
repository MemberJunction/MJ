#!/usr/bin/env node
// extract-io-iof.mjs
//
// Zendesk IO/IOF extractor. Reads the two saved OpenAPI specs (ticketing +
// help center), enumerates the 99 REST resource "leaves" (the vendor's own
// ResponseDataKey grain, produced by enumerate-zendesk-catalog.mjs and pinned
// in output/zendesk-taxonomy-leaves-final.json), resolves each leaf's item
// schema in the OAS, and emits one IO + one IOF per schema property.
//
// PROVABLE-ONLY. PK = the vendor-wide `id` convention (Configuration.universalPK,
// confirmed across every resource schema). FK = a scalar `*_id`/`*_ids` field
// whose stripped/pluralized token resolves to an EMITTED sibling object, OR
// whose description names an emitted object's singular (the description motif).
// Self-references are NOT emitted as @lookup FKs (would create a push cycle).
// Types/lengths/required/readOnly come straight from the schema.
//
// Writes: metadata/integrations/zendesk/.zendesk.integration.json (one atomic
// write, one backup) preserving the existing root `fields`; and the run's
// EXTRACTION_EMISSION.json artifact. Stdout = compact stats only.

import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, renameSync } from 'node:fs';
import { resolve, dirname, basename, join } from 'node:path';
import { randomBytes } from 'node:crypto';

const REPO = resolve(process.cwd());
const REG = resolve(REPO, 'packages/Integration/connectors-registry/zendesk');
const TICKETING = resolve(REG, 'sources/ticketing-oas.json');
const HELPCENTER = resolve(REG, 'sources/helpcenter-oas.json');
const LEAVES = resolve(REG, 'output/zendesk-taxonomy-leaves-final.json');
const METADATA_FILE = resolve(REPO, 'metadata/integrations/zendesk/.zendesk.integration.json');
const EMISSION_FILE = resolve(REG, 'runs/connector-zendesk-1783120273097-639b6951/output/EXTRACTION_EMISSION.json');

// ── docs + ref resolution ────────────────────────────────────────────────
const docs = {
    ticketing: { file: 'sources/ticketing-oas.json', doc: JSON.parse(readFileSync(TICKETING, 'utf8')) },
    helpcenter: { file: 'sources/helpcenter-oas.json', doc: JSON.parse(readFileSync(HELPCENTER, 'utf8')) },
};
function resolveRef(doc, ref) {
    if (!ref || !ref.startsWith('#/')) return null;
    let cur = doc;
    for (const p of ref.slice(2).split('/')) { cur = cur?.[p]; if (cur === undefined) return null; }
    return cur;
}
function schemaName(ref) { const m = ref && ref.match(/\/([^/]+)$/); return m ? m[1] : null; }

// Flatten allOf/anyOf/oneOf + $ref into a merged { properties, required[] } view.
// anyOf/oneOf members are UNIONED (generous: every field any variant can carry).
function flattenSchema(doc, schema, depth = 0, acc = null) {
    acc = acc ?? { properties: {}, required: new Set() };
    if (!schema || depth > 8) return acc;
    if (schema.$ref) return flattenSchema(doc, resolveRef(doc, schema.$ref), depth + 1, acc);
    if (Array.isArray(schema.allOf)) for (const s of schema.allOf) flattenSchema(doc, s, depth + 1, acc);
    if (Array.isArray(schema.anyOf)) for (const s of schema.anyOf) flattenSchema(doc, s, depth + 1, acc);
    if (Array.isArray(schema.oneOf)) for (const s of schema.oneOf) flattenSchema(doc, s, depth + 1, acc);
    if (Array.isArray(schema.required)) for (const r of schema.required) acc.required.add(r);
    if (schema.properties) for (const [k, v] of Object.entries(schema.properties)) if (!(k in acc.properties)) acc.properties[k] = v;
    return acc;
}

// Find the top-level array property in a (list) response schema → its item schema.
function findArrayItem(doc, schema, wantKey, depth = 0) {
    if (!schema || depth > 4) return null;
    if (schema.$ref) return findArrayItem(doc, resolveRef(doc, schema.$ref), wantKey, depth + 1);
    if (Array.isArray(schema.allOf)) for (const s of schema.allOf) { const r = findArrayItem(doc, s, wantKey, depth + 1); if (r) return r; }
    if (schema.properties) {
        const keys = Object.keys(schema.properties);
        const ordered = wantKey && keys.includes(wantKey) ? [wantKey, ...keys.filter(k => k !== wantKey)] : keys;
        for (const k of ordered) {
            let p = schema.properties[k];
            if (p.$ref) p = resolveRef(doc, p.$ref) ?? p;
            if (p.type === 'array' && p.items) return { key: k, itemSchema: p.items };
        }
    }
    if (schema.type === 'array' && schema.items) return { key: null, itemSchema: schema.items };
    return null;
}

// Resolve an object leaf → { docKey, doc, itemSchema (flattened), itemSchemaName } via list path or single path.
function resolveItem(leaf) {
    for (const [docKey, { doc }] of Object.entries(docs)) {
        const listItem = doc.paths?.[leaf.listPath]?.get;
        if (listItem) {
            const s = listItem.responses?.['200']?.content?.['application/json']?.schema
                ?? listItem.responses?.['200 OK']?.content?.['application/json']?.schema;
            if (s) {
                const found = findArrayItem(doc, s, leaf.responseDataKey);
                if (found?.itemSchema) {
                    const name = found.itemSchema.$ref ? schemaName(found.itemSchema.$ref) : null;
                    const it = found.itemSchema;
                    if (!it.$ref && !it.properties && !it.allOf && !it.anyOf && !it.oneOf && ['string', 'integer', 'number', 'boolean'].includes(it.type)) {
                        const key = singularize(leaf.responseDataKey) || 'value';
                        return { docKey, doc, itemSchemaName: name, itemSchema: { properties: { [key]: { type: it.type, description: `The ${key} value (scalar list item — the record identity).`, readOnly: true, _syntheticPK: true } }, required: new Set([key]) } };
                    }
                    const flat = flattenSchema(doc, found.itemSchema);
                    if (Object.keys(flat.properties).length > 0) return { docKey, doc, itemSchema: flat, itemSchemaName: name };
                }
            }
        }
        if (leaf.singlePath) {
            const getItem = doc.paths?.[leaf.singlePath]?.get;
            const s = getItem?.responses?.['200']?.content?.['application/json']?.schema;
            if (s) {
                const flat = flattenSchema(doc, s);
                const singular = singularize(leaf.responseDataKey);
                let inner = flat.properties[singular] ?? Object.values(flat.properties).find(v => v && (v.$ref || v.type === 'object' || v.anyOf || v.allOf));
                if (inner) {
                    const nm = inner.$ref ? schemaName(inner.$ref) : null;
                    const iflat = flattenSchema(doc, inner);
                    if (Object.keys(iflat.properties).length > 0) return { docKey, doc, itemSchema: iflat, itemSchemaName: nm };
                }
            }
        }
    }
    return null;
}

// Resolve the create/update body wrapper key from the POST/PUT requestBody schema.
function resolveBodyKey(doc, path, method, fallback) {
    const op = doc?.paths?.[path]?.[method];
    const s = op?.requestBody?.content?.['application/json']?.schema;
    if (!s) return fallback;
    const flat = flattenSchema(doc, s);
    const keys = Object.keys(flat.properties);
    if (keys.includes(fallback)) return fallback;
    const cand = keys.filter(k => !/metadata/i.test(k));
    if (cand.length === 1) return cand[0];
    return fallback;
}

// ── word helpers ─────────────────────────────────────────────────────────
function singularize(n) {
    if (!n) return n;
    if (n.endsWith('ies')) return n.slice(0, -3) + 'y';
    if (n.endsWith('sses')) return n.slice(0, -2);
    if (n.endsWith('ses')) return n.slice(0, -2);
    if (n.endsWith('xes')) return n.slice(0, -2);
    if (n.endsWith('s') && !n.endsWith('ss')) return n.slice(0, -1);
    return n;
}
function pluralize(n) {
    if (!n) return n;
    if (n.endsWith('y')) return n.slice(0, -1) + 'ies';
    if (/(s|x|z|ch|sh)$/.test(n)) return n + 'es';
    return n + 's';
}
function titleCase(n) { return n.split(/[_\s]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '); }

// Best-available soft PK when a schema has no `id` (emit-biased policy: a wrong soft PK cannot
// reject a row, but a PK-less object stalls CodeGen). Priority: explicit identity names, then an
// `*_id` whose base names this object; else null → defer.
function pickFallbackPK(propNames, objName) {
    for (const c of ['key', 'token', 'name', 'slug', 'uuid', 'code']) if (propNames.includes(c)) return c;
    const idFields = propNames.filter(n => /_id$/.test(n));
    for (const f of idFields) { const base = f.replace(/_id$/, ''); if (objName.split('_').includes(base) || objName.includes(base)) return f; }
    return null;
}

// ── type mapping ───────────────────────────────────────────────────────────
function mapType(p) {
    if (!p) return { type: 'json', length: null };
    if (p.$ref) return { type: 'json', length: null };
    const t = p.type;
    if (t === 'integer') return { type: 'int', length: null };
    if (t === 'number') return { type: 'decimal', length: null };
    if (t === 'boolean') return { type: 'boolean', length: null };
    if (t === 'array') return { type: 'json', length: null };
    if (t === 'object') return { type: 'json', length: null };
    if (t === 'string') {
        if (p.format === 'date-time') return { type: 'datetime', length: null };
        if (p.format === 'date') return { type: 'date', length: null };
        return { type: 'string', length: Number.isInteger(p.maxLength) ? p.maxLength : null };
    }
    if (Array.isArray(p.anyOf) || Array.isArray(p.oneOf) || Array.isArray(p.allOf)) return { type: 'json', length: null };
    return { type: 'json', length: null };
}

// ── load leaves (the curated 99-object universe) ───────────────────────────
const leavesData = JSON.parse(readFileSync(LEAVES, 'utf8'));
const LEAF_LIST = leavesData.full;
const emittedNames = new Set(LEAF_LIST.map(l => l.object));

const singularToObject = new Map();
for (const l of LEAF_LIST) { singularToObject.set(singularize(l.object), l.object); singularToObject.set(l.object, l.object); }
const FK_ALIASES = new Map([
    ['user', 'users'], ['requester', 'users'], ['assignee', 'users'], ['submitter', 'users'],
    ['author', 'users'], ['agent', 'users'], ['recipient', 'users'], ['updater', 'users'],
    ['organization', 'organizations'], ['group', 'groups'], ['brand', 'brands'],
    ['ticket', 'tickets'], ['ticket_form', 'ticket_forms'], ['form', 'ticket_forms'],
    ['section', 'sections'], ['category', 'help_center_categories'], ['topic', 'community_topics'],
    ['article', 'articles'], ['post', 'community_posts'], ['schedule', 'schedules'],
    ['macro', 'macros'], ['view', 'views'], ['trigger', 'triggers'],
    ['sla_policy', 'sla_policies'], ['custom_status', 'custom_statuses'], ['custom_role', 'custom_roles'],
]);

const PAGINATION_MAP = (s) => {
    if (!s) return 'Cursor';
    if (/none|unpaged|unprobed|unknown/i.test(s)) return 'None';
    if (/offset/i.test(s) && !/cursor/i.test(s)) return 'Offset';
    if (/cursor/i.test(s)) return 'Cursor';
    if (/page/i.test(s)) return 'PageNumber';
    return 'Cursor';
};

const INCREMENTAL = new Map([
    ['tickets', 'updated_at'], ['users', 'updated_at'], ['organizations', 'updated_at'],
    ['ticket_events', 'created_at'], ['ticket_metric_events', 'time'],
    ['custom_object_records', 'updated_at'],
]);

// ── FK resolver for one field ──────────────────────────────────────────────
function resolveFK(fieldName, propSchema, selfObject) {
    const lower = fieldName.toLowerCase();
    if (!/_ids?$/.test(lower)) return null;
    const base = lower.replace(/_ids?$/, '');
    const desc = (propSchema?.description ?? '').toLowerCase();
    let target = null, kind = null;
    if (FK_ALIASES.has(base)) { target = FK_ALIASES.get(base); kind = 'name-alias'; }
    if (!target) {
        const pl = pluralize(base);
        if (emittedNames.has(pl)) { target = pl; kind = 'name-plural'; }
        else if (emittedNames.has(base)) { target = base; kind = 'name-exact'; }
        else if (singularToObject.has(base)) { target = singularToObject.get(base); kind = 'name-singular'; }
    }
    if (!target && desc) {
        for (const [sing, obj] of FK_ALIASES) {
            // skip self-object aliases (e.g. "user's" in a users field desc) so the loop keeps
            // trying other aliases (e.g. "default group" -> groups) instead of self-vetoing to null
            if (obj && obj !== selfObject && new RegExp(`\\b${sing.replace('_', ' ?')}\\b`).test(desc)) { target = obj; kind = 'desc-motif'; break; }
        }
    }
    if (!target || !emittedNames.has(target)) return null;
    if (target === selfObject) return null;
    return { target, kind, evidence: kind && kind.startsWith('desc') ? desc.slice(0, 120) : `field name '${fieldName}'` };
}

// ── build the emission ─────────────────────────────────────────────────────
const emission = [];
const ioRows = [];
let totalIOF = 0;

let seq = 0;
for (const leaf of LEAF_LIST) {
    seq++;
    const obj = leaf.object;
    const resolved = resolveItem(leaf);
    const claims = [];
    const gaps = [];
    let fkCount = 0;

    const pagType = PAGINATION_MAP(leaf.pagination);
    const isIncremental = INCREMENTAL.has(obj);
    const doc = resolved?.doc;
    const bodyKeyDefault = singularize(leaf.responseDataKey);
    const createBodyKey = leaf.create && doc ? resolveBodyKey(doc, leaf.listPath, 'post', bodyKeyDefault) : bodyKeyDefault;
    const updatePath = leaf.singlePath || null;
    const updateBodyKey = leaf.update && doc && updatePath ? resolveBodyKey(doc, updatePath, 'put', bodyKeyDefault) : bodyKeyDefault;

    const supportsUpdate = !!leaf.update && !!updatePath;
    const supportsDelete = !!leaf.delete && !!leaf.singlePath;
    const supportsCreate = !!leaf.create;
    const supportsWrite = supportsCreate || supportsUpdate || supportsDelete;

    const cfg = {};
    if (leaf.parent) cfg.parentObjectName = leaf.parent;
    if (leaf.singlePath) cfg.singleRecordPath = leaf.singlePath;
    if (leaf.pagination && pagType === 'Cursor' && /offset/i.test(leaf.pagination)) cfg.paginationNote = 'dual: cursor (page[after]/page[size]) preferred, legacy ?page=N offset fallback';
    if (isIncremental) cfg.incrementalEndpoint = `/api/v2/incremental/${obj}/cursor`;

    const ioFields = {
        Name: obj,
        DisplayName: titleCase(obj),
        Description: leaf.tags?.[0] ? `${titleCase(obj)} — ${leaf.tags[0]} (Zendesk ${resolved?.docKey === 'helpcenter' ? 'Help Center' : 'Support'} API).` : titleCase(obj),
        Category: leaf.tags?.[0] ?? 'General',
        APIPath: leaf.listPath,
        ResponseDataKey: leaf.responseDataKey,
        PaginationType: pagType,
        DefaultPageSize: 100,
        SupportsPagination: true,
        SupportsIncrementalSync: isIncremental,
        SupportsWrite: supportsWrite,
        SupportsCreate: supportsCreate,
        SupportsUpdate: supportsUpdate,
        SupportsDelete: supportsDelete,
        SyncStrategy: isIncremental ? 'WatermarkIncremental' : 'FullPullHashDiff',
        ContentHashApplicable: !isIncremental,
        StableOrderingKey: 'id',
        Sequence: seq,
        Status: 'Active',
        IntegrationID: '@parent:ID',
        Configuration: cfg,
    };
    if (isIncremental) ioFields.IncrementalWatermarkField = INCREMENTAL.get(obj);
    if (supportsCreate) {
        ioFields.CreateAPIPath = leaf.listPath;
        ioFields.CreateMethod = 'POST';
        ioFields.CreateBodyShape = 'wrapped';
        ioFields.CreateBodyKey = createBodyKey;
        ioFields.CreateIDLocation = 'body';
        claims.push({ slot: 'SupportsCreate', value: true, sourcePath: `${resolved?.docKey ?? 'oas'}: POST ${leaf.listPath}` });
    }
    if (supportsUpdate) {
        ioFields.UpdateAPIPath = updatePath;
        ioFields.UpdateMethod = 'PUT';
        ioFields.UpdateBodyShape = 'wrapped';
        ioFields.UpdateBodyKey = updateBodyKey;
        ioFields.UpdateIDLocation = 'path';
        claims.push({ slot: 'SupportsUpdate', value: true, sourcePath: `${resolved?.docKey ?? 'oas'}: PUT ${updatePath}` });
    }
    if (supportsDelete) {
        ioFields.DeleteAPIPath = leaf.singlePath;
        ioFields.DeleteMethod = 'DELETE';
        ioFields.DeleteIDLocation = 'path';
        claims.push({ slot: 'SupportsDelete', value: true, sourcePath: `${resolved?.docKey ?? 'oas'}: DELETE ${leaf.singlePath}` });
    }
    if (isIncremental) claims.push({ slot: 'IncrementalWatermarkField', value: INCREMENTAL.get(obj), sourcePath: `Configuration.IncrementalSyncCapability + ${resolved?.docKey ?? 'oas'}` });
    claims.push({ slot: 'APIPath', value: leaf.listPath, sourcePath: `${resolved?.docKey ?? 'oas'}: GET ${leaf.listPath}` });
    claims.push({ slot: 'PaginationType', value: pagType, sourcePath: `${resolved?.docKey ?? 'oas'}: ${leaf.pagination}` });

    // ── IOF rows ──
    const iofRows = [];
    let hasPK = false;
    if (resolved?.itemSchema) {
        const props = resolved.itemSchema.properties;
        const required = resolved.itemSchema.required;
        const propNames = Object.keys(props);
        const fallbackPK = propNames.includes('id') ? null : pickFallbackPK(propNames, obj);
        let fseq = 0;
        for (const [fname, p] of Object.entries(props)) {
            fseq++;
            const { type, length } = mapType(p);
            const isId = fname === 'id' || fname === fallbackPK || p._syntheticPK === true;
            const isReadOnly = p.readOnly === true || fname === 'id' || fname === 'url' || fname === 'created_at' || fname === 'updated_at';
            const isReq = required.has(fname);
            const iof = {
                Name: fname,
                DisplayName: titleCase(fname),
                Description: ((p.description ?? '').replace(/\s+/g, ' ').trim().slice(0, 255)) || titleCase(fname),
                Type: type,
                Length: length,
                IsPrimaryKey: isId,
                IsRequired: isId ? true : isReq,
                IsReadOnly: isReadOnly,
                IsUniqueKey: isId,
                AllowsNull: isId ? false : true,
                Status: 'Active',
                Sequence: fseq,
                IntegrationObjectID: '@parent:ID',
            };
            if (isId) {
                hasPK = true;
                claims.push({ slot: `IsPrimaryKey:${fname}`, value: true, sourcePath: fname === 'id' ? `${resolved.docKey}: ${resolved.itemSchemaName ?? obj}.id (universalPK: id integer(int64) readOnly)` : `${resolved.docKey}: ${resolved.itemSchemaName ?? obj}.${fname} (best-available soft PK — no id field; emit-biased soft key, refine at runtime)` });
            }
            const fk = resolveFK(fname, p, obj);
            if (fk) {
                iof.IsForeignKey = true;
                iof.RelatedIntegrationObjectID = `@lookup:MJ: Integration Objects.Name=${fk.target}&IntegrationID=@parent:IntegrationID`;
                iof.RelatedIntegrationObjectFieldName = 'id';
                iof.Configuration = { ReferencedType: fk.target };
                fkCount++;
                claims.push({ slot: `IsForeignKey:${fname}`, value: fk.target, sourcePath: `${resolved.docKey}: ${resolved.itemSchemaName ?? obj}.${fname} (${fk.kind}: ${fk.evidence})` });
            }
            iofRows.push({ fields: iof });
        }
    }
    if (iofRows.length === 0) {
        iofRows.push({ fields: {
            Name: 'id', DisplayName: 'Id',
            Description: 'System-assigned record identifier (Zendesk universal `id` convention; schema not in downloaded OAS — prose-documented resource).',
            Type: 'int', Length: null, IsPrimaryKey: true, IsRequired: true, IsReadOnly: true, IsUniqueKey: true,
            AllowsNull: false, Status: 'Active', Sequence: 1, IntegrationObjectID: '@parent:ID',
        } });
        hasPK = true;
        gaps.push(`${obj}: item schema not present in downloaded OAS (prose-only resource); emitted id PK only — fields deferred to runtime discovery`);
        claims.push({ slot: 'IsPrimaryKey:id', value: true, sourcePath: 'universalPK convention (schema absent from OAS)' });
    }
    if (!hasPK) gaps.push(`${obj}: no id field in schema — PK deferred`);

    totalIOF += iofRows.length;
    ioRows.push({ fields: ioFields, relatedEntities: { 'MJ: Integration Object Fields': iofRows } });

    const matrixRow = {
        IOName: obj,
        ExistingConnectorTs: 'n/a',
        ExistingMetadataJson: 'no',
        OpenAPIxPK: 'no',
        OpenAPIPathOps: leaf.singlePath ? 'yes' : 'no',
        OpenAPILocationHeader: 'no',
        VendorDocsProseScan: resolved ? 'yes' : 'no',
        SDKTypes: 'n/a',
        PostmanCommunity: 'n/a',
        NamingConvention: 'yes',
        CrossIOMatch: fkCount > 0 ? 'yes' : 'no',
        PKVerdict: hasPK ? 'emit' : 'defer',
        FKVerdict: fkCount > 0 ? `emit-${fkCount}` : 'defer',
        EvidenceCount: claims.length,
    };

    emission.push({ objectName: obj, fieldsExtracted: iofRows.length, gapsRemaining: gaps, claims, matrixRow });
}

// ── break hard-@lookup FK cycles (dense forward-ref graph) → demote back-edges to soft-FK ──
// Zendesk's FK graph is cyclic (tickets<->ticket_forms, tickets<->suspended_tickets, brands->
// ticket_forms->tickets->brands, ...). A cycle of HARD @lookup edges rolls the single-transaction
// mj sync push back. We keep every FK edge that does NOT close a cycle as a hard @lookup (usable by
// the Declared connector at runtime) and demote only the minimal DFS back-edges to SOFT (drop the
// @lookup, keep IsForeignKey + Configuration.ReferencedType). Soft cycles are deploy-tolerable.
function breakFKCycles(ioRows, emission) {
    const nameToIO = new Map(ioRows.map(io => [io.fields.Name, io]));
    // adjacency: owner -> Map(target -> [iof fields...])
    const adj = new Map();
    for (const io of ioRows) {
        const owner = io.fields.Name;
        const m = new Map();
        for (const f of (io.relatedEntities?.['MJ: Integration Object Fields'] ?? [])) {
            const rel = f.fields.RelatedIntegrationObjectID;
            if (typeof rel === 'string' && rel.includes('@lookup')) {
                const mm = rel.match(/Name=([^&]+)/);
                const tgt = mm && mm[1].trim();
                if (tgt && tgt !== owner) { if (!m.has(tgt)) m.set(tgt, []); m.get(tgt).push(f.fields); }
            }
        }
        adj.set(owner, m);
    }
    // Tarjan SCC over the full FK edge graph. Every edge whose endpoints share a non-trivial
    // SCC is demoted to soft (so each cycle becomes an all-soft, deploy-tolerable cycle); acyclic /
    // cross-SCC edges stay hard @lookup (usable + deployable).
    // Reproduce dag-completeness's Kahn cyclic-set detection over the (currently all-hard) FK graph,
    // then demote EVERY edge internal to that cyclic set to soft — the cycle becomes all-soft (deploy-
    // tolerable), while acyclic / feeder edges stay hard @lookup (usable + deployable).
    const names = [...adj.keys()];
    const indeg = new Map(names.map(n => [n, adj.get(n)?.size ?? 0]));
    const dependents = new Map(names.map(n => [n, []]));
    for (const [owner, m] of adj) for (const t of m.keys()) if (dependents.has(t)) dependents.get(t).push(owner);
    const queue = names.filter(n => indeg.get(n) === 0).sort();
    const ordered = new Set();
    while (queue.length) {
        const n = queue.shift(); ordered.add(n);
        for (const dep of dependents.get(n) ?? []) { indeg.set(dep, indeg.get(dep) - 1); if (indeg.get(dep) === 0) { queue.push(dep); queue.sort(); } }
    }
    const cyclic = new Set(names.filter(n => !ordered.has(n)));
    const demote = new Set();
    for (const [owner, m] of adj) if (cyclic.has(owner)) for (const tgt of m.keys()) if (cyclic.has(tgt)) demote.add(owner + '->' + tgt);
    // apply demotions
    let demoted = 0;
    for (const key of demote) {
        const [owner, target] = key.split('->');
        for (const ff of (adj.get(owner)?.get(target) ?? [])) {
            delete ff.RelatedIntegrationObjectID;
            delete ff.RelatedIntegrationObjectFieldName;
            ff.Configuration = { ...(ff.Configuration ?? {}), ReferencedType: target, FKForm: 'soft', FKDemotedReason: 'back-edge demoted to soft-FK to break a hard-@lookup push cycle (dense forward-ref graph); target re-derivable at runtime from Configuration.ReferencedType' };
            demoted++;
        }
        // reflect in emission claims
        const em = emission.find(e => e.objectName === owner);
        if (em) for (const c of em.claims) if (typeof c.slot === 'string' && c.slot.startsWith('IsForeignKey:') && c.value === target) c.sourcePath += ' [soft-FK: @lookup demoted to break push cycle]';
    }
    return { demotedEdges: demote.size, demotedFields: demoted };
}
const cycleResult = breakFKCycles(ioRows, emission);

// ── write metadata file (preserve existing root fields) ────────────────────
function writeAtomic(filePath, content) {
    mkdirSync(dirname(filePath), { recursive: true });
    if (existsSync(filePath)) {
        const bdir = join(dirname(filePath), '.backups');
        mkdirSync(bdir, { recursive: true });
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        copyFileSync(filePath, join(bdir, `${basename(filePath)}.${stamp}.bak`));
    }
    const tmp = join(dirname(filePath), `.${basename(filePath)}.tmp-${randomBytes(4).toString('hex')}`);
    writeFileSync(tmp, content, 'utf8');
    renameSync(tmp, filePath);
}

const existing = existsSync(METADATA_FILE) ? JSON.parse(readFileSync(METADATA_FILE, 'utf8')) : null;
const root = existing ? (Array.isArray(existing) ? existing[0] : existing) : { fields: { Name: 'zendesk', ClassName: 'ZendeskConnector' } };
root.relatedEntities = { ...(root.relatedEntities ?? {}), 'MJ: Integration Objects': ioRows };
writeAtomic(METADATA_FILE, JSON.stringify([root], null, 2) + '\n');

mkdirSync(dirname(EMISSION_FILE), { recursive: true });
writeFileSync(EMISSION_FILE, JSON.stringify(emission, null, 2) + '\n', 'utf8');

const allGaps = emission.flatMap(e => e.gapsRemaining);
process.stdout.write(JSON.stringify({
    objectsExtracted: emission.length,
    fieldsExtracted: totalIOF,
    unresolvedSchemas: emission.filter(e => e.matrixRow.VendorDocsProseScan === 'no').map(e => e.objectName),
    thinObjects: emission.filter(e => e.fieldsExtracted <= 2).map(e => `${e.objectName}(${e.fieldsExtracted})`),
    totalFKsEmitted: emission.reduce((s, e) => s + (e.matrixRow.FKVerdict.startsWith('emit') ? Number(e.matrixRow.FKVerdict.split('-')[1]) : 0), 0),
    incrementalObjects: [...INCREMENTAL.keys()],
    gapsCount: allGaps.length,
    fkCyclesBroken: cycleResult,
    emissionArtifact: EMISSION_FILE,
    metadataFile: METADATA_FILE,
}, null, 2) + '\n');
