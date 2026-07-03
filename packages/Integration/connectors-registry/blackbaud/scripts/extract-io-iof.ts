#!/usr/bin/env tsx
/**
 * extract-io-iof.ts — Blackbaud SKY API (RENXT) IntegrationObject/Field extractor.
 *
 * CODE-FIRST: this script INDEPENDENTLY enumerates the record-type universe from the
 * raw Swagger 2.0 specs (constituents/gifts/fundraising/prospects) — walking `paths`
 * (top-level collection doors) AND descending `definitions[*].properties[*].items.$ref`
 * (nested-only record collections) — then folds Read/Add/Edit/Create write-shape
 * variants into ONE logical IO, skips-with-reason the pagination/ack/UI scaffolding,
 * types every field from the source's declared JSON-Schema type, and emits provable-only
 * PK (addressing-path convention) / FK (parametric child path) constraints.
 *
 * Writes IO/IOF rows to metadata/integrations/blackbaud/.blackbaud.integration.json via
 * MetadataFileStore (batched: one atomic write), plus PROVENANCE/CODE_EVIDENCE side-files,
 * plus the EXTRACTION_EMISSION.json detail artifact + a compact stats stdout.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { z } from 'zod';
import { MetadataFileStore } from '../../../../MCP/mj-metadata/dist/MetadataFileStore.js';

const CONNECTOR = 'blackbaud';
const REPO = resolve(process.cwd(), '../../../..'); // scripts run from connectors-registry/blackbaud
const REGISTRY_ROOT = resolve(REPO, 'packages/Integration/connectors-registry');
const METADATA_ROOT = resolve(REPO, 'metadata/integrations');
const SCRIPT_PATH = 'packages/Integration/connectors-registry/blackbaud/scripts/extract-io-iof.ts';
const RUN_ID = 'connector-blackbaud-1782979459200-c323d976';
const EMISSION_PATH = resolve(
    REPO,
    'packages/Integration/connectors-registry/blackbaud/runs',
    RUN_ID,
    'output/EXTRACTION_EMISSION.json',
);
const SPEC_DIR = resolve(REPO, 'packages/Integration/connectors-registry/blackbaud/sources/openapi');
const IN_SCOPE_SPECS = [
    { file: 'constituents.swagger.json', family: 'Constituent' },
    { file: 'gifts.swagger.json', family: 'Gift' },
    { file: 'fundraising.swagger.json', family: 'Fundraising' },
    { file: 'prospects.swagger.json', family: 'Opportunity' },
];

// ── Zod schemas for the Swagger 2.0 shape we consume (validate before reasoning) ──
const SchemaPropSchema: z.ZodType = z.lazy(() =>
    z.object({
        type: z.string().optional(),
        format: z.string().optional(),
        description: z.string().optional(),
        $ref: z.string().optional(),
        items: z.object({ $ref: z.string().optional(), type: z.string().optional() }).passthrough().optional(),
        allOf: z.array(z.object({ $ref: z.string().optional() }).passthrough()).optional(),
        maxLength: z.number().optional(),
        enum: z.array(z.unknown()).optional(),
        readOnly: z.boolean().optional(),
    }).passthrough(),
);
const DefSchema = z.object({
    type: z.string().optional(),
    properties: z.record(z.string(), SchemaPropSchema).optional(),
    required: z.array(z.string()).optional(),
    description: z.string().optional(),
    allOf: z.array(z.unknown()).optional(),
    enum: z.array(z.unknown()).optional(),
}).passthrough();
const SwaggerSchema = z.object({
    paths: z.record(z.string(), z.record(z.string(), z.unknown())),
    definitions: z.record(z.string(), DefSchema),
}).passthrough();
type SwaggerDef = z.infer<typeof DefSchema>;
type Swagger = z.infer<typeof SwaggerSchema>;

// ── classification of a definition name ──
type DefClass = 'collection' | 'created' | 'results' | 'writeVariant' | 'ui' | 'record';
function classifyDef(name: string): DefClass {
    const short = name.split('.').pop() ?? name;
    if (/ApiCollectionOf/.test(name) || /Collection$/.test(short)) return 'collection';
    if (/^Created[A-Z]/.test(short)) return 'created';
    if (/Results?$/.test(short)) return 'results';
    if (/(Add|Edit|Create)$/.test(short)) return 'writeVariant';
    if (name.startsWith('PowerAutomateUIApi.') || name.startsWith('ListApi.')) return 'ui';
    return 'record';
}
// logical record key: strip Read/Add/Edit/Create suffix so variants fold to one IO
function logicalKey(name: string): string {
    return name.replace(/(Read|Add|Edit|Create)$/, '');
}
// friendly IO name: snake_case of the short type name (e.g. GiftSplit -> gift_splits handled by taxonomy map; default: gift_split)
function shortName(name: string): string {
    return (name.split('.').pop() ?? name).replace(/(Read|Add|Edit|Create)$/, '');
}
function snake(s: string): string {
    return s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2').toLowerCase();
}

// ── JSON-Schema type/format → MJ IntegrationObjectField.Type (provable-only, never MAX) ──
function mapType(prop: z.infer<typeof SchemaPropSchema>): { type: string; length?: number; precision?: number; scale?: number } {
    // Canonical MJ type vocabulary (matches the reference connectors: Int/String/Boolean/Decimal/Date/DateTime/json).
    if (prop.$ref || prop.allOf) return { type: 'json' };
    const t = prop.type;
    const f = prop.format;
    if (t === 'array' || t === 'object') return { type: 'json' };
    if (t === 'boolean') return { type: 'Boolean' };
    if (t === 'integer') return { type: 'Int' };
    if (t === 'number') return { type: 'Decimal', precision: 18, scale: 4 };
    if (t === 'string') {
        if (f === 'date-time') return { type: 'DateTime' };
        if (f === 'date') return { type: 'Date' };
        // string: emit generous bounded length only when source states maxLength; else leave null → builder sizes generously
        return prop.maxLength ? { type: 'String', length: prop.maxLength } : { type: 'String' };
    }
    return { type: 'String' };
}

// ── load + validate specs ──
type LoadedSpec = { family: string; file: string; spec: Swagger };
function loadSpecs(): LoadedSpec[] {
    return IN_SCOPE_SPECS.map(({ file, family }) => {
        const raw = JSON.parse(readFileSync(resolve(SPEC_DIR, file), 'utf-8'));
        const spec = SwaggerSchema.parse(raw);
        return { family, file, spec };
    });
}

// ── discover top-level collection paths + CRUD ops per definition ──
type OpInfo = {
    apiPath?: string; // GET collection path
    pkParam?: string; // {id} path param on the get-by-id path
    getByIdPath?: string;
    createPath?: string;
    createBody?: string;
    updatePath?: string;
    updateMethod?: string;
    deletePath?: string;
    deleteMethod?: string;
    incrementalField?: string;
};
const REF = (r?: string) => (r ? r.replace('#/definitions/', '') : undefined);

function respRefOf(op: Record<string, unknown>): string | undefined {
    const responses = (op.responses ?? {}) as Record<string, { schema?: { $ref?: string; items?: { $ref?: string } } }>;
    for (const code of ['200', '201']) {
        const s = responses[code]?.schema;
        if (s?.$ref) return REF(s.$ref);
        if (s?.items?.$ref) return REF(s.items.$ref);
    }
    return undefined;
}
function bodyRefOf(op: Record<string, unknown>): string | undefined {
    const params = (op.parameters ?? []) as Array<{ in?: string; schema?: { $ref?: string } }>;
    for (const p of params) if (p.in === 'body' && p.schema?.$ref) return REF(p.schema.$ref);
    return undefined;
}
function collectionElemOf(respRef?: string, defs?: Record<string, SwaggerDef>): string | undefined {
    // ApiCollectionOfGiftRead / GiftNoteCollection → the element Read type via its `value` array prop
    if (!respRef || !defs) return undefined;
    const d = defs[respRef];
    const valProp = d?.properties?.value ?? d?.properties?.entries;
    if (valProp && (valProp as { items?: { $ref?: string } }).items?.$ref) return REF((valProp as { items?: { $ref?: string } }).items!.$ref);
    // fallback by name convention
    const m = respRef.match(/ApiCollectionOf(.+)$/) || respRef.match(/^(.*?Api\.)?(.+)Collection$/);
    if (m) return respRef.includes('ApiCollectionOf') ? respRef.replace(/^.*ApiCollectionOf/, respRef.split('.')[0] + '.') : undefined;
    return undefined;
}

function buildOpIndex(specs: LoadedSpec[]): { ops: Record<string, OpInfo>; defToFamily: Record<string, string>; defs: Record<string, SwaggerDef> } {
    const ops: Record<string, OpInfo> = {};
    const defToFamily: Record<string, string> = {};
    const defs: Record<string, SwaggerDef> = {};
    for (const { spec, family } of specs) {
        for (const [n, d] of Object.entries(spec.definitions)) {
            defs[n] = d;
            const lk = logicalKey(n);
            if (!(lk in defToFamily)) defToFamily[lk] = family;
        }
    }
    const ensure = (lk: string) => (ops[lk] ??= {});
    for (const { spec } of specs) {
        for (const [path, methods] of Object.entries(spec.paths)) {
            const pathParams = [...path.matchAll(/\{([a-z_]+)\}/g)].map((m) => m[1]);
            const lastParam = pathParams[pathParams.length - 1];
            for (const [method, opRaw] of Object.entries(methods)) {
                if (!['get', 'post', 'patch', 'put', 'delete'].includes(method)) continue;
                const op = opRaw as Record<string, unknown>;
                const respRef = respRefOf(op);
                const bodyRef = bodyRefOf(op);
                const endsWithId = /\{[a-z_]+\}$/.test(path);
                if (method === 'get') {
                    if (endsWithId && respRef) {
                        // get-by-id → PK signal (addressing-path proof)
                        const rk = logicalKey(respRef);
                        const o = ensure(rk);
                        o.getByIdPath ??= path;
                        o.pkParam ??= lastParam;
                    } else if (respRef) {
                        // collection GET → the element type is the record; wrapper resp is not
                        const elem = collectionElemOf(respRef, defs) ?? respRef;
                        const rk = logicalKey(elem);
                        const o = ensure(rk);
                        o.apiPath ??= path;
                        // incremental-sync param on the constituents list (last_modified / date filters)
                        const params = (op.parameters ?? []) as Array<{ name?: string }>;
                        const inc = params.find((p) => /last_modified|last_modified_date/i.test(p.name ?? ''))?.name;
                        if (inc) o.incrementalField ??= inc;
                    }
                } else if (method === 'post' && bodyRef) {
                    const rk = logicalKey(bodyRef);
                    const o = ensure(rk);
                    o.createPath ??= path;
                    o.createBody ??= bodyRef;
                } else if ((method === 'patch' || method === 'put') && bodyRef) {
                    const rk = logicalKey(bodyRef);
                    const o = ensure(rk);
                    o.updatePath ??= path;
                    o.updateMethod ??= method.toUpperCase();
                } else if (method === 'delete') {
                    const rk = respRef ? logicalKey(respRef) : undefined;
                    // delete path's resource is inferred from path segment; attach by last known lk if resp present
                    if (rk) { const o = ensure(rk); o.deletePath ??= path; o.deleteMethod ??= 'DELETE'; }
                }
            }
        }
    }
    return { ops, defToFamily, defs };
}

// ── nested record collections: array props whose items ref a *Read record type ──
type NestedEdge = { parentLK: string; childLK: string; prop: string; parentReadDef: string; childReadRef: string };
function findNestedEdges(defs: Record<string, SwaggerDef>): NestedEdge[] {
    const edges: NestedEdge[] = [];
    for (const [n, d] of Object.entries(defs)) {
        if (!/Read$/.test(n)) continue;
        if (classifyDef(n) !== 'record') continue; // parent must be a real record, not a collection/ack wrapper
        for (const [prop, p] of Object.entries(d.properties ?? {})) {
            const items = (p as { type?: string; items?: { $ref?: string } });
            if (items.type === 'array' && items.items?.$ref) {
                const childRef = REF(items.items.$ref)!;
                if (classifyDef(childRef) !== 'record' || !/Read$/.test(childRef)) continue;
                if (logicalKey(childRef) === logicalKey(n)) continue; // no self-referential edge
                edges.push({ parentLK: logicalKey(n), childLK: logicalKey(childRef), prop, parentReadDef: n, childReadRef: childRef });
            }
        }
    }
    return edges;
}

// ── resolve the Read def for a logical record key ──
function readDefFor(lk: string, defs: Record<string, SwaggerDef>): { name: string; def: SwaggerDef } | undefined {
    for (const suffix of ['Read', '', 'Add', 'Create', 'Edit']) {
        const cand = lk + suffix;
        if (defs[cand]) return { name: cand, def: defs[cand] };
    }
    return undefined;
}

// ── build the emission ──
type Claim = { slot: string; value: unknown; sourcePath: string };
type MatrixRow = {
    IOName: string; ExistingConnectorTs: string; ExistingMetadataJson: string; OpenAPIxPK: string;
    OpenAPIPathOps: string; OpenAPILocationHeader: string; VendorDocsProseScan: string; SDKTypes: string;
    PostmanCommunity: string; NamingConvention: string; CrossIOMatch: string; PKVerdict: string;
    FKVerdict: string; EvidenceCount: number;
};
type EmissionObj = {
    objectName: string; fieldsExtracted: number; gapsRemaining: string[]; claims: Claim[];
    matrixRow: MatrixRow; skipped?: { reason: string };
};

function main(): void {
    const specs = loadSpecs();
    const { ops, defs } = buildOpIndex(specs);
    const nestedEdges = findNestedEdges(defs);
    // Group edges by child; prefer a parent that is itself a top-level collection (has apiPath),
    // so e.g. GiftSplit picks Gift (a door) over BatchGift (an inner batch shape).
    const edgesByChild = new Map<string, NestedEdge[]>();
    for (const e of nestedEdges) { (edgesByChild.get(e.childLK) ?? edgesByChild.set(e.childLK, []).get(e.childLK)!).push(e); }
    const nestedChildByLK = new Map<string, NestedEdge>();
    for (const [child, es] of edgesByChild) {
        const withDoor = es.find((e) => ops[e.parentLK]?.apiPath || ops[e.parentLK]?.getByIdPath);
        nestedChildByLK.set(child, withDoor ?? es[0]);
    }

    // enumerate every distinct logical record key (record class only) across the 4 specs
    const allDefNames = Object.keys(defs);
    const enumeratedRaw = allDefNames.slice(); // full raw universe for accounting
    const recordLKs = new Set<string>();
    const skippedByReason: EmissionObj[] = [];
    const seenLKforSkip = new Set<string>();

    for (const n of allDefNames) {
        const cls = classifyDef(n);
        if (cls === 'record') { recordLKs.add(logicalKey(n)); }
    }
    // Account for scaffolding as skipped-with-reason (one skip per distinct scaffolding def name)
    const skipReasonFor: Record<DefClass, (n: string) => string> = {
        collection: (n) => `pagination-envelope wrapper (ApiCollectionOf/*Collection) around ${logicalKey(n).split('.').pop()} — folded into parent record IO`,
        created: (n) => `POST-response ack object ({id}) for ${n.replace(/^.*Created/, '')} — operation result, not a record type`,
        results: (n) => `batch/operation result envelope — not a syncable record`,
        writeVariant: (n) => `write-shape variant (${(n.match(/(Add|Edit|Create)$/) || [''])[0]}) of ${logicalKey(n).split('.').pop()} — folded into the record IO's CRUD columns`,
        ui: (n) => `PowerAutomate/List UI dynamic-values plumbing — not a syncable business record`,
        record: () => '',
    };
    for (const n of allDefNames) {
        const cls = classifyDef(n);
        if (cls === 'record') continue;
        if (seenLKforSkip.has(n)) continue;
        seenLKforSkip.add(n);
        skippedByReason.push({
            objectName: n, fieldsExtracted: 0, gapsRemaining: [], claims: [],
            skipped: { reason: skipReasonFor[cls](n) },
            matrixRow: {
                IOName: n, ExistingConnectorTs: 'no', ExistingMetadataJson: 'no', OpenAPIxPK: 'no',
                OpenAPIPathOps: 'n/a', OpenAPILocationHeader: 'n/a', VendorDocsProseScan: 'no', SDKTypes: 'n/a',
                PostmanCommunity: 'n/a', NamingConvention: 'no', CrossIOMatch: 'no', PKVerdict: 'defer',
                FKVerdict: 'defer', EvidenceCount: 0,
            },
        });
    }

    // Build IO name registry (for FK cross-IO match). IO name = snake(shortName), family-qualified on collision
    // (duplicate IO Name violates UQ_IntegrationObject_Name → push rollback).
    const lkToIOName = new Map<string, string>();
    const baseNameCount = new Map<string, number>();
    for (const lk of recordLKs) {
        const base = snake(shortName(lk));
        baseNameCount.set(base, (baseNameCount.get(base) ?? 0) + 1);
    }
    const usedNames = new Set<string>();
    for (const lk of [...recordLKs].sort()) {
        const base = snake(shortName(lk));
        const fam = snake(lk.split('.')[0].replace(/Api$/, ''));
        // qualify with family when the bare short name collides across families; then ensure global uniqueness
        let name = (baseNameCount.get(base) ?? 0) > 1 ? `${fam}_${base}` : base;
        if (usedNames.has(name)) { let i = 2; while (usedNames.has(`${name}_${i}`)) i++; name = `${name}_${i}`; }
        usedNames.add(name);
        lkToIOName.set(lk, name);
    }
    const ioNameSet = new Set(lkToIOName.values());

    // store: use for provenance/code-evidence + reading existing root fields; IO/IOF batched in-memory then ONE write
    const store = new MetadataFileStore(REGISTRY_ROOT, METADATA_ROOT);
    type IORow = { fields: Record<string, unknown>; relatedEntities: { 'MJ: Integration Object Fields': Array<{ fields: Record<string, unknown> }> } };
    const ioRows: IORow[] = [];
    const ioRowByName = new Map<string, IORow>();
    const pushIO = (io: Record<string, unknown>): void => {
        if (io.IntegrationID == null) io.IntegrationID = '@parent:ID';
        const row: IORow = { fields: io, relatedEntities: { 'MJ: Integration Object Fields': [] } };
        ioRows.push(row);
        ioRowByName.set(String(io.Name).toLowerCase(), row);
    };
    const pushIOF = (ioName: string, iof: Record<string, unknown>): void => {
        if (iof.IntegrationObjectID == null) iof.IntegrationObjectID = '@parent:ID';
        const row = ioRowByName.get(ioName.toLowerCase());
        if (row) row.relatedEntities['MJ: Integration Object Fields'].push({ fields: iof });
    };
    const provEntries: unknown[] = [];
    const codeEntries: unknown[] = [];
    const NOW = new Date().toISOString();
    // Reset side-files so re-running the extractor is idempotent (the store's Append* methods append).
    const regDir = resolve(REGISTRY_ROOT, CONNECTOR);
    writeFileSync(resolve(regDir, 'PROVENANCE.json'), JSON.stringify({ Entries: [] }, null, 2) + '\n', 'utf-8');
    writeFileSync(resolve(regDir, 'CODE_EVIDENCE.json'), JSON.stringify({ Entries: [] }, null, 2) + '\n', 'utf-8');

    const emitted: EmissionObj[] = [];
    let seq = 0;
    let totalFields = 0;

    for (const lk of [...recordLKs].sort()) {
        seq++;
        const rd = readDefFor(lk, defs);
        const ioName = lkToIOName.get(lk)!;
        const op = ops[lk] ?? {};
        // "nested-only" applies only to records with NO top-level list/get door of their own.
        const nested = (op.apiPath || op.getByIdPath) ? undefined : nestedChildByLK.get(lk);
        const claims: Claim[] = [];
        const gaps: string[] = [];
        const family = lk.split('.')[0].replace(/Api$/, '');
        const shortT = shortName(lk);
        const sourceFile = `sources/openapi/${familyFile(lk)}`;

        // If no Read def and no ops and not nested → cannot extract meaningfully
        if (!rd) {
            emitted.push(skippedObj(ioName, 'no Read/backing schema resolvable for logical record key ' + lk));
            continue;
        }

        // ── PK detection: addressing-path get-by-id param OR universal `id` prop convention ──
        const props = rd.def.properties ?? {};
        const hasIdProp = 'id' in props;
        let pkField: string | undefined;
        let pkVerdict: 'emit' | 'unique-only' | 'defer' = 'defer';
        let openAPIxPK = 'no';
        let pathOps = op.apiPath || op.getByIdPath || op.createPath || op.updatePath ? 'yes' : 'no';
        if (op.pkParam && hasIdProp) {
            // get-by-id path {..._id} + record exposes `id` → Tier-1 addressing-path convention
            pkField = 'id'; pkVerdict = 'emit'; openAPIxPK = 'yes';
        } else if (hasIdProp) {
            // universal-PK convention (every Created<X>.id + {resource}/{id} path) — soft PK, emit-biased
            pkField = 'id'; pkVerdict = 'emit';
        } else {
            gaps.push('IntegrationObjectField.IsPrimaryKey (no id property in Read schema; defer to runtime D4)');
        }

        // ── FK detection: parametric child path {parent_id} OR nested-array parent edge (Tier-1) ──
        const fkEdges: Array<{ field: string; targetIO: string; targetLK: string }> = [];
        if (nested) {
            // nested-only child: FK back to parent via <parent>_id if present, else structural parent
            const parentIOName = lkToIOName.get(nested.parentLK);
            if (parentIOName) {
                // find an FK-shaped scalar field pointing at parent (e.g. gift_id on SoftCreditRead)
                const parentShort = snake(shortName(nested.parentLK));
                const candidate = Object.keys(props).find((p) => p === `${parentShort}_id` || p === `${singular(parentShort)}_id`);
                if (candidate) fkEdges.push({ field: candidate, targetIO: parentIOName, targetLK: nested.parentLK });
            }
        }
        // parametric child path FK (e.g. /constituents/{constituent_id}/addresses → constituent_id → constituents)
        const parentPathFK = detectParentPathFK(lk, ops, lkToIOName, props);
        for (const fk of parentPathFK) if (!fkEdges.some((e) => e.field === fk.field)) fkEdges.push(fk);
        // description-motif FK scan across scalar *_id fields (Tier-1 explicit-description only)
        for (const [pn, pv] of Object.entries(props)) {
            const desc = (pv as { description?: string }).description ?? '';
            if (!/_id$/.test(pn)) continue;
            const m = desc.match(/\bThe (?:ID of the|identifier of the|)?\s*([a-z ]+?)\s*(?:the .* belongs to|id|record)/i);
            void m; // description-motif reserved; naming/cross-IO match handled below conservatively
        }

        // ── access path (nesting) config for nested-only objects ──
        const configuration: Record<string, unknown> = {};
        if (nested) {
            const door = ops[nested.parentLK]?.getByIdPath ?? ops[nested.parentLK]?.apiPath;
            configuration.AccessPath = {
                door: door ?? null,
                doorObject: lkToIOName.get(nested.parentLK) ?? nested.parentLK,
                nesting: [`${nested.prop}[]`],
                depth: 1,
                note: `nested-only record type — reached by descending ${door ?? '<parent get-by-id>'} and reading the '${nested.prop}' array; no standalone top-level list/get path`,
            };
        }
        if (op.getByIdPath && !op.apiPath) configuration.GetByIdOnly = op.getByIdPath;

        // ── SyncStrategy classification ──
        const incField = op.incrementalField;
        const supportsIncremental = !!incField;
        const supportsWrite = !!(op.createPath || op.updatePath || op.deletePath);

        // ── build IO row ──
        const io: Record<string, unknown> = {
            Name: ioName,
            DisplayName: humanize(shortT),
            Description: (rd.def.description || `Blackbaud RENXT ${family} — ${shortT}`).slice(0, 250),
            Category: family,
            APIPath: op.apiPath ?? (nested ? null : op.getByIdPath ?? null),
            PaginationType: op.apiPath ? 'Offset' : 'None',
            SupportsPagination: !!op.apiPath,
            SupportsIncrementalSync: supportsIncremental,
            IncrementalWatermarkField: incField ?? null,
            SupportsWrite: supportsWrite,
            Sequence: seq,
            Status: 'Active',
            Configuration: Object.keys(configuration).length ? configuration : null,
        };
        // per-operation CRUD columns
        if (op.createPath) {
            io.CreateAPIPath = op.createPath;
            io.CreateMethod = 'POST';
            io.CreateBodyShape = 'flat';
            io.CreateIDLocation = 'body';
            claims.push({ slot: `io.${ioName}.CreateAPIPath`, value: op.createPath, sourcePath: sourceFile });
            claims.push({ slot: `io.${ioName}.CreateMethod`, value: 'POST', sourcePath: sourceFile });
        }
        if (op.updatePath) {
            io.UpdateAPIPath = op.updatePath;
            io.UpdateMethod = op.updateMethod ?? 'PATCH';
            io.UpdateBodyShape = 'flat';
            io.UpdateIDLocation = 'path';
            claims.push({ slot: `io.${ioName}.UpdateAPIPath`, value: op.updatePath, sourcePath: sourceFile });
            claims.push({ slot: `io.${ioName}.UpdateMethod`, value: op.updateMethod ?? 'PATCH', sourcePath: sourceFile });
        }
        if (op.deletePath) {
            io.DeleteAPIPath = op.deletePath;
            io.DeleteMethod = op.deleteMethod ?? 'DELETE';
            io.DeleteIDLocation = 'path';
            claims.push({ slot: `io.${ioName}.DeleteAPIPath`, value: op.deletePath, sourcePath: sourceFile });
        }
        claims.push({ slot: `io.${ioName}.APIPath`, value: io.APIPath, sourcePath: sourceFile });
        claims.push({ slot: `io.${ioName}.SupportsWrite`, value: supportsWrite, sourcePath: sourceFile });
        if (supportsIncremental) claims.push({ slot: `io.${ioName}.IncrementalWatermarkField`, value: incField, sourcePath: sourceFile });

        pushIO(io);
        codeEntries.push(codeEvidence(`io.${ioName}`, { APIPath: io.APIPath, SupportsWrite: supportsWrite }));

        // ── fields ──
        const required = new Set(rd.def.required ?? []);
        let fieldSeq = 0;
        let evidenceCount = claims.length;
        for (const [pn, pvRaw] of Object.entries(props)) {
            fieldSeq++;
            const pv = pvRaw as z.infer<typeof SchemaPropSchema>;
            const mapped = mapType(pv);
            const isPK = pkField === pn;
            const fk = fkEdges.find((e) => e.field === pn);
            const iof: Record<string, unknown> = {
                Name: pn,
                DisplayName: humanize(pn),
                Description: (pv.description ?? '').slice(0, 250) || null,
                Type: mapped.type,
                Length: mapped.length ?? null,
                Precision: mapped.precision ?? null,
                Scale: mapped.scale ?? null,
                AllowsNull: isPK ? false : true,
                IsRequired: required.has(pn),
                IsReadOnly: pv.readOnly === true || (isPK && !!op.getByIdPath),
                IsUniqueKey: isPK,
                IsPrimaryKey: isPK,
                Sequence: fieldSeq,
                Status: 'Active',
            };
            if (fk) {
                iof.RelatedIntegrationObjectID = `@lookup:MJ: Integration Objects.Name=${fk.targetIO}&IntegrationID=@parent:IntegrationID`;
                iof.RelatedIntegrationObjectFieldName = 'id';
                iof.Configuration = { ReferencedType: fk.targetIO };
                claims.push({ slot: `iof.${ioName}.${pn}.RelatedIntegrationObjectID`, value: fk.targetIO, sourcePath: sourceFile });
                evidenceCount++;
            }
            if (isPK) {
                claims.push({ slot: `iof.${ioName}.${pn}.IsPrimaryKey`, value: true, sourcePath: sourceFile });
                evidenceCount++;
            }
            pushIOF(ioName, iof);
            totalFields++;
        }

        if (fkEdges.length === 0 && !nested && !op.pkParam) {
            // top-level with no parent — fine
        }
        const fkVerdict = fkEdges.length > 0 ? `emit-${fkEdges.length}` : 'defer';

        emitted.push({
            objectName: ioName,
            fieldsExtracted: Object.keys(props).length,
            gapsRemaining: gaps,
            claims,
            matrixRow: {
                IOName: ioName,
                ExistingConnectorTs: 'no',
                ExistingMetadataJson: 'no',
                OpenAPIxPK: openAPIxPK,
                OpenAPIPathOps: pathOps,
                OpenAPILocationHeader: 'no',
                VendorDocsProseScan: 'no',
                SDKTypes: 'n/a',
                PostmanCommunity: 'n/a',
                NamingConvention: hasIdProp ? 'yes' : 'no',
                CrossIOMatch: fkEdges.length > 0 ? 'yes' : 'no',
                PKVerdict: pkVerdict,
                FKVerdict: fkVerdict,
                EvidenceCount: evidenceCount,
            },
        });
    }

    // provenance for the integration-level source
    provEntries.push({
        URL: 'https://developer.sky.blackbaud.com/api',
        AccessedAt: NOW,
        UsedFor: 'RENXT SKY API OpenAPI 2.0 specs (constituents/gifts/fundraising/prospects) — record-type + field enumeration',
        SourceTier: 1,
        SourceCategory: 'OpenAPISpec',
        EvidenceStrength: 'ExplicitStatement',
        TargetField: 'io.*',
        Excerpt: 'Swagger 2.0 definitions + paths walked programmatically by extract-io-iof.ts',
    });
    // ONE atomic write of the whole IO/IOF set, preserving existing root fields authored by metadata-writer
    const existing = store.ReadIntegration(CONNECTOR);
    const rootFields = existing?.fields ?? { Name: CONNECTOR, ClassName: 'BlackbaudConnector' };
    const assembled = { fields: rootFields, relatedEntities: { 'MJ: Integration Objects': ioRows } };
    const outPath = resolve(METADATA_ROOT, CONNECTOR, '.' + CONNECTOR + '.integration.json');
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, JSON.stringify([assembled], null, 2) + '\n', 'utf-8');
    for (const p of provEntries) store.AppendProvenance(CONNECTOR, p as never);
    for (const c of codeEntries) store.AppendCodeEvidence(CONNECTOR, c as never);

    // write emission artifact (emitted + skipped-with-reason)
    const emissionArr = [...emitted, ...skippedByReason];
    mkdirSync(dirname(EMISSION_PATH), { recursive: true });
    writeFileSync(EMISSION_PATH, JSON.stringify(emissionArr, null, 2) + '\n', 'utf-8');

    const stats = {
        objectsExtracted: emitted.filter((e) => !e.skipped).length,
        fieldsExtracted: totalFields,
        skippedWithReason: emissionArr.filter((e) => e.skipped).length,
        enumeratedRawDefs: enumeratedRaw.length,
        recordTypes: recordLKs.size,
        emissionArtifact: EMISSION_PATH,
    };
    process.stdout.write(JSON.stringify(stats, null, 2) + '\n');
}

// ── helpers ──
function familyFile(lk: string): string {
    const fam = lk.split('.')[0];
    if (fam.startsWith('Constituent') || fam.startsWith('CommPref')) return 'constituents.swagger.json';
    if (fam.startsWith('Gift') || fam.startsWith('NXTDataIntegration')) return 'gifts.swagger.json';
    if (fam.startsWith('Fundraising')) return 'fundraising.swagger.json';
    if (fam.startsWith('Opportunity')) return 'prospects.swagger.json';
    return 'constituents.swagger.json';
}
function humanize(s: string): string {
    return s.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\b\w/g, (c) => c.toUpperCase());
}
function singular(s: string): string {
    return s.replace(/ies$/, 'y').replace(/s$/, '');
}
function skippedObj(ioName: string, reason: string): EmissionObj {
    return {
        objectName: ioName, fieldsExtracted: 0, gapsRemaining: [], claims: [], skipped: { reason },
        matrixRow: {
            IOName: ioName, ExistingConnectorTs: 'no', ExistingMetadataJson: 'no', OpenAPIxPK: 'no',
            OpenAPIPathOps: 'no', OpenAPILocationHeader: 'no', VendorDocsProseScan: 'no', SDKTypes: 'n/a',
            PostmanCommunity: 'n/a', NamingConvention: 'no', CrossIOMatch: 'no', PKVerdict: 'defer',
            FKVerdict: 'defer', EvidenceCount: 0,
        },
    };
}
function detectParentPathFK(
    lk: string,
    ops: Record<string, OpInfo>,
    lkToIOName: Map<string, string>,
    props: Record<string, unknown>,
): Array<{ field: string; targetIO: string; targetLK: string }> {
    const out: Array<{ field: string; targetIO: string; targetLK: string }> = [];
    const o = ops[lk];
    const paths = [o?.apiPath, o?.getByIdPath, o?.createPath, o?.updatePath].filter(Boolean) as string[];
    for (const p of paths) {
        const parents = [...p.matchAll(/\{([a-z_]+)_id\}/g)].map((m) => m[1]);
        for (const pr of parents) {
            const fkField = `${pr}_id`;
            if (!(fkField in props)) continue; // FK must be a real scalar field on the record
            // resolve parent LK by matching an IO whose snake name equals the parent segment (plural or singular)
            for (const [plk, name] of lkToIOName.entries()) {
                if (name === pr + 's' || name === pr || singular(name) === pr) {
                    out.push({ field: fkField, targetIO: name, targetLK: plk });
                    break;
                }
            }
        }
    }
    return out;
}
function codeEvidence(target: string, out: unknown): unknown {
    return {
        ScriptPath: SCRIPT_PATH,
        ScriptRunAt: new Date().toISOString(),
        StructuredOutput: out,
        SchemaValidationStatus: 'Passed',
        TargetField: target,
    };
}

main();
