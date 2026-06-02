#!/usr/bin/env node
// IOIOF extractor — YourMembership "Ams Event sub-resources" object family.
//
// Scope (per user task): all distinct sub-resource segments living under
//   /Ams/{ClientID}/Event/{Event[ID|Id]}/<Segment>[/...]
// in the OpenAPI 2.0 spec snapshot. Discovery is empirical — we enumerate
// the actual segments observed in the spec (16), not the 11-name list in
// SOURCE_STUDY.md §3.1 which mixed L1 /Ams/{ClientID}/Event* siblings with
// these deep paths. The set-completeness rule requires emitting all 16.
//
// Source: cached Swagger 2.0 snapshot at
//   packages/Integration/connectors-registry/yourmembership/runs/
//   connector-yourmembership-1780165237029-a495a1ea/output/openapi.snapshot.json
// (fetched 2026-05-30 from https://ws.yourmembership.com/openapi, 1.1 MB,
// HTTP 200, 297 paths, 656 definitions).
//
// Discipline:
//   - IOFs come from the GET 200 response schema (if any) — flattened, with
//     ServiceStack envelope fields filtered out so they don't pollute the IOF
//     row set. If no GET exists for a sub-resource, IOFs are derived from
//     the response schema of the first available write op (POST/PUT) — only
//     properties of the resource shape, not of the envelope.
//   - PK detection: EXPLICIT ONLY. We never emit IsPrimaryKey unless the
//     spec carries an explicit marker (description "primary key" / "unique
//     identifier" / "system ID" or x-primary-key extension). Per Gap 10
//     soft-PK candidates (Id, EventId, SessionId, TicketId, …) are left
//     unset; runtime D4 SoftPKClassifier resolves them.
//   - FK detection: emit IsForeignKey=true + RelatedIntegrationObjectID when
//     a parametric path declares a parent ID (e.g., /Event/{EventID}/...)
//     AND the response schema declares a property with the same name.
//   - SupportsRead is true iff a GET method exists on at least one path in
//     this sub-resource family (collection or item).
//   - Per-operation CRUD slots (CreateAPIPath/Method/BodyShape/BodyKey/
//     IDLocation, etc.) are emitted only when the corresponding capability
//     flag is true.
//   - Pagination: PageSize+PageNumber on the GET op marks
//     PaginationType='PageNumber' and SupportsPagination=true. Neither
//     observed on this family in the spec, but the check runs regardless.
//   - Incremental sync: false (no documented updated-at watermark on these
//     resources; GET ops do not declare a "Since" / "ModifiedAfter" param).

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(new URL('../../../../..', import.meta.url).pathname);
const SPEC_PATH = `${REPO_ROOT}/packages/Integration/connectors-registry/yourmembership/runs/connector-yourmembership-1780165237029-a495a1ea/output/openapi.snapshot.json`;
const INTEGRATION_METADATA_PATH = `${REPO_ROOT}/metadata/integrations/yourmembership/.yourmembership.integration.json`;
const CODE_EVIDENCE_PATH = `${REPO_ROOT}/packages/Integration/connectors-registry/yourmembership/runs/connector-yourmembership-1780165237029-a495a1ea/output/CODE_EVIDENCE.json`;
const SCRIPT_PATH = `${REPO_ROOT}/packages/Integration/connectors-registry/yourmembership/scripts/extract-io-iof-event-subresources.mjs`;

const spec = JSON.parse(readFileSync(SPEC_PATH, 'utf8'));

// -----------------------------------------------------------------------------
// Discovery: enumerate every path under /Ams/{ClientID}/Event/{Event[ID|Id]}/
// and partition by sub-resource segment.
// -----------------------------------------------------------------------------
const EVENT_SUBRES_REGEX = /^\/Ams\/\{ClientID\}\/Event\/\{Event(ID|Id)\}\/([^/]+)(\/.*)?$/;
const METHOD_TO_CRUD = {
    get: 'read',
    post: 'create',  // ServiceStack convention: POST = upsert/insert
    put: 'update',
    patch: 'update',
    delete: 'delete',
};

// segment -> { parentParamName: 'EventID' | 'EventId', ops: [{path, method, op}] }
const familyOps = new Map();
for (const [pth, methods] of Object.entries(spec.paths || {})) {
    const m = pth.match(EVENT_SUBRES_REGEX);
    if (!m) continue;
    const parentParam = `Event${m[1]}`;
    const segment = m[2];
    if (!familyOps.has(segment)) familyOps.set(segment, { parentParam, ops: [] });
    for (const [method, op] of Object.entries(methods)) {
        if (typeof op !== 'object' || !op) continue;
        if (!METHOD_TO_CRUD[method]) continue;
        familyOps.get(segment).ops.push({ path: pth, method, op });
    }
}

const ALL_SEGMENTS = [...familyOps.keys()].sort();

// -----------------------------------------------------------------------------
// Helper: $ref resolution.
// -----------------------------------------------------------------------------
function refToDefName(ref) {
    if (!ref || typeof ref !== 'string') return null;
    const m = ref.match(/^#\/definitions\/(.+)$/);
    return m ? m[1] : null;
}

function getDef(name) {
    return spec.definitions?.[name] || null;
}

// Map Swagger 2.0 type + format to MJ field type + length.
function mapType(type, format, maxLength) {
    const t = (type || '').toLowerCase();
    const f = (format || '').toLowerCase();
    if (t === 'integer') return { Type: 'integer', Length: f === 'int64' ? 8 : 4 };
    if (t === 'number') {
        if (f === 'double') return { Type: 'number', Length: 8 };
        if (f === 'float') return { Type: 'number', Length: 4 };
        return { Type: 'number', Length: null };
    }
    if (t === 'boolean') return { Type: 'boolean', Length: null };
    if (t === 'string') {
        if (f === 'date-time' || f === 'date') return { Type: 'datetime', Length: null };
        if (f === 'uuid' || f === 'guid') return { Type: 'string', Length: 36 };
        return { Type: 'string', Length: maxLength ?? null };
    }
    if (t === 'array') return { Type: 'array', Length: null };
    if (t === 'object') return { Type: 'object', Length: null };
    return { Type: 'string', Length: null };
}

// Find the 200 / 201 / 202 success response schema for an operation.
function getSuccessResponseSchema(op) {
    if (!op?.responses) return null;
    for (const code of ['200', '201', '202']) {
        if (op.responses[code]?.schema) return op.responses[code].schema;
    }
    return null;
}

// Find request body (Swagger 2.0: parameters with in=body OR formData).
function getRequestBodyShape(op) {
    if (!op?.parameters) return { def: null, mode: null };
    const bodyParam = op.parameters.find((p) => p.in === 'body');
    if (bodyParam?.schema) {
        const def = refToDefName(bodyParam.schema.$ref);
        return { def: def || 'inline', mode: 'body' };
    }
    const hasFormData = op.parameters.some((p) => p.in === 'formData');
    if (hasFormData) return { def: 'formData', mode: 'formData' };
    return { def: null, mode: null };
}

// Detect explicit PK signal in a property descriptor.
function detectExplicitPK(propName, propSpec) {
    if (!propSpec) return false;
    if (propSpec['x-primary-key'] === true) return true;
    const desc = (propSpec.description || '').toLowerCase();
    if (desc.includes('primary key')) return true;
    if (desc.includes('unique identifier')) return true;
    if (desc.includes('system id')) return true;
    return false;
}

// Determine whether a path carries an item ID beyond the resource segment.
// For paths of the form /Ams/{ClientID}/Event/{Event[ID|Id]}/<segment>[/...],
// the path carries an item ID iff there is at least one brace-segment AFTER
// the resource segment.
function hasItemIdAfterResource(path, segment) {
    // Take everything after `/{segment}` (possibly with trailing slash).
    const idx = path.indexOf(`/${segment}`);
    if (idx < 0) return false;
    const tail = path.slice(idx + segment.length + 1); // everything after /<segment>
    return /\{[^}]+\}/.test(tail);
}

// Decide IDLocation for a write op.
function decideIDLocation(op, segment, mode) {
    if (hasItemIdAfterResource(op.path, segment)) return 'path';
    if (mode === 'formData') return 'formData';
    if (mode === 'body') return 'body';
    return null;
}

// ServiceStack envelope fields — filtered from IOF emission because they
// belong to the response envelope, not the resource shape itself.
const ENVELOPE_FIELDS = new Set([
    'UsingRedis', 'AppInitTime', 'ServerID', 'BypassCache', 'DateCached',
    'Device', 'ResponseStatus', 'PageSize', 'PageNumber', 'ListCount',
    'IsForceReload',
]);

// Resolve a response schema (possibly $ref-wrapped or wrapping an array)
// down to its definition, and return its properties object.
function resolveResponseDefinition(schema) {
    if (!schema) return { defName: null, properties: null, required: [] };
    let defName = refToDefName(schema.$ref);
    if (!defName && schema.items?.$ref) defName = refToDefName(schema.items.$ref);
    if (!defName) return { defName: null, properties: schema.properties || null, required: schema.required || [] };
    const def = getDef(defName);
    if (!def) return { defName, properties: null, required: [] };
    return { defName, properties: def.properties || {}, required: def.required || [] };
}

// Choose the canonical "data key" — the array property in the envelope
// that holds the actual resource items. Returns null if the response is
// a singleton (no array property dominating the shape).
function pickResponseDataKey(properties, segment) {
    if (!properties) return null;
    // Most YM envelopes name the array after the segment.
    if (properties[segment] && properties[segment].type === 'array') return segment;
    // Common alternate naming: <Segment>List, List, EventAttendeeTypeList, etc.
    const candidates = [
        `${segment}List`,
        `Event${segment}List`,
        `EventAttendeeType${segment.replace(/^AttendeeType/, '')}List`,
        'List',
        'Sessions',
        'Tickets',
        'Labels',
    ];
    for (const c of candidates) {
        if (properties[c] && properties[c].type === 'array') return c;
    }
    // Last resort: first non-envelope array property.
    for (const [pn, ps] of Object.entries(properties)) {
        if (ENVELOPE_FIELDS.has(pn)) continue;
        if (ps.type === 'array') return pn;
    }
    return null;
}

// -----------------------------------------------------------------------------
// Per-segment emission.
// -----------------------------------------------------------------------------
const INTEGRATION_LOOKUP = '@lookup:MJ: Integrations.Name=YourMembership';
const NAME_PREFIX = 'AmsEvent_'; // disambiguates from sibling IOs in metadata file

const IOs = [];
const codeEvidenceEntries = [];
const stats = {
    SubResourcesDiscovered: ALL_SEGMENTS.length,
    SegmentList: ALL_SEGMENTS,
    IOCreated: 0,
    IOFCreated: 0,
    PKsExplicitlyEmitted: 0,
    FKsEmitted: 0,
    SegmentsWithNoResponseSchema: [],
    SegmentsWithNoGet: [],
    GapsForRuntimeD4: [],
    TraversalOrder: [],
};

for (const segment of ALL_SEGMENTS) {
    const family = familyOps.get(segment);
    const ops = family.ops;
    const parentParam = family.parentParam;

    // Classify ops.
    let readOp = null, createOp = null, updateOp = null, deleteOp = null;
    for (const o of ops) {
        const crud = METHOD_TO_CRUD[o.method];
        if (crud === 'read' && !readOp) readOp = o;
        else if (crud === 'create' && !createOp) createOp = o;
        else if (crud === 'update' && !updateOp) updateOp = o;
        else if (crud === 'delete' && !deleteOp) deleteOp = o;
    }

    if (!readOp) stats.SegmentsWithNoGet.push(segment);

    // Choose APIPath: prefer the collection-level GET; otherwise the first op.
    let apiPath = null;
    if (readOp) apiPath = readOp.path;
    else apiPath = ops[0]?.path || null;

    // Pull a response schema for IOF derivation. Prefer GET → POST → PUT → DELETE order.
    let respSchema = null;
    for (const o of [readOp, createOp, updateOp, deleteOp].filter(Boolean)) {
        const s = getSuccessResponseSchema(o.op);
        if (s) { respSchema = s; break; }
    }
    const { defName: respDefName, properties: respProps, required: respRequired } = resolveResponseDefinition(respSchema);
    if (!respProps) stats.SegmentsWithNoResponseSchema.push(segment);

    // Determine ResponseDataKey.
    const responseDataKey = respProps ? pickResponseDataKey(respProps, segment) : null;

    // Pagination: scan read op for PageSize+PageNumber.
    let supportsPagination = false;
    let paginationType = 'None';
    if (readOp) {
        const params = readOp.op.parameters || [];
        const hasPagSize = params.some((p) => (p.name || '').toLowerCase() === 'pagesize');
        const hasPagNum = params.some((p) => (p.name || '').toLowerCase() === 'pagenumber');
        if (hasPagSize && hasPagNum) {
            supportsPagination = true;
            paginationType = 'PageNumber';
        }
    }

    // Incremental sync: scan read op for a since/modifiedAfter param.
    let supportsIncrementalSync = false;
    let incrementalWatermarkField = null;
    if (readOp) {
        const params = readOp.op.parameters || [];
        for (const p of params) {
            const n = (p.name || '').toLowerCase();
            if (n === 'modifiedsince' || n === 'modifiedafter' || n === 'since' || n === 'updatedafter') {
                supportsIncrementalSync = true;
                incrementalWatermarkField = p.name;
                break;
            }
        }
    }

    // Summary / description.
    const summaries = ops
        .map((o) => o.op.summary)
        .filter(Boolean)
        .filter((v, i, arr) => arr.indexOf(v) === i)
        .slice(0, 2);
    const opSig = ops.map((o) => `${o.method.toUpperCase()} ${o.path}`).join(' | ');
    const description = `Ams Event sub-resource: ${segment}. Lives under /Ams/{ClientID}/Event/{${parentParam}}/${segment} per the YM OpenAPI 2.0 spec. ${summaries.length ? summaries.join(' / ') + '. ' : ''}Operations: ${opSig}.`;

    const ioName = `${NAME_PREFIX}${segment}`;
    const ioFields = {
        IntegrationID: INTEGRATION_LOOKUP,
        Name: ioName,
        DisplayName: `Event ${segment}`,
        Description: description,
        Category: 'AmsEventSubResource',
        APIPath: apiPath,
        ResponseDataKey: responseDataKey,
        PaginationType: paginationType,
        SupportsPagination: supportsPagination,
        SupportsIncrementalSync: supportsIncrementalSync,
        SupportsRead: !!readOp,
        SupportsCreate: !!createOp,
        SupportsUpdate: !!updateOp,
        SupportsDelete: !!deleteOp,
        SupportsWrite: !!(createOp || updateOp || deleteOp),
    };
    if (incrementalWatermarkField) ioFields.IncrementalWatermarkField = incrementalWatermarkField;

    // Parent hierarchy: every sub-resource has Event as parent.
    ioFields.ParentObjectName = 'AmsEvent'; // hypothetical parent IO; resolved at runtime by D5
    ioFields.ParentObjectIDFieldName = parentParam;

    // Per-operation CRUD slots.
    if (createOp) {
        const { def: bodyDef, mode } = getRequestBodyShape(createOp.op);
        ioFields.CreateAPIPath = createOp.path;
        ioFields.CreateMethod = createOp.method.toUpperCase();
        ioFields.CreateBodyShape = bodyDef || null;
        ioFields.CreateBodyKey = null;
        ioFields.CreateIDLocation = decideIDLocation(createOp, segment, mode);
        codeEvidenceEntries.push({
            claim: `IO.${ioName}.CreateAPIPath/Method/BodyShape`,
            scriptPath: SCRIPT_PATH,
            scriptInputs: [SPEC_PATH],
            reproduction: {
                verify: `jq '.paths["${createOp.path}"]["${createOp.method}"] | {operationId, parameters: (.parameters | map({name,in})[:6])}' ${SPEC_PATH}`,
            },
            structuralSignal: `OpenAPI declares ${createOp.method.toUpperCase()} ${createOp.path}; bodyShape resolved to '${bodyDef || 'none'}' (mode=${mode || 'n/a'}); IDLocation=${ioFields.CreateIDLocation}.`,
            decisionLogic: `Method ${createOp.method.toUpperCase()} maps to Create capability (ServiceStack convention: POST inserts a row); CreateBodyShape sourced from request body $ref or formData mode. IDLocation='path' iff a brace-segment appears AFTER the resource segment in the path; else mirrors the request mode.`,
        });
    }
    if (updateOp) {
        const { def: bodyDef, mode } = getRequestBodyShape(updateOp.op);
        ioFields.UpdateAPIPath = updateOp.path;
        ioFields.UpdateMethod = updateOp.method.toUpperCase();
        ioFields.UpdateBodyShape = bodyDef || null;
        ioFields.UpdateBodyKey = null;
        ioFields.UpdateIDLocation = decideIDLocation(updateOp, segment, mode);
        codeEvidenceEntries.push({
            claim: `IO.${ioName}.UpdateAPIPath/Method/BodyShape`,
            scriptPath: SCRIPT_PATH,
            scriptInputs: [SPEC_PATH],
            reproduction: {
                verify: `jq '.paths["${updateOp.path}"]["${updateOp.method}"] | {operationId, parameters: (.parameters | map({name,in})[:6])}' ${SPEC_PATH}`,
            },
            structuralSignal: `OpenAPI declares ${updateOp.method.toUpperCase()} ${updateOp.path}; bodyShape '${bodyDef || 'none'}' (mode=${mode || 'n/a'}); IDLocation '${ioFields.UpdateIDLocation}'.`,
            decisionLogic: `Method ${updateOp.method.toUpperCase()} maps to Update capability; IDLocation='path' iff a brace-segment appears after the resource segment in the path; otherwise mirrors request mode.`,
        });
    }
    if (deleteOp) {
        ioFields.DeleteAPIPath = deleteOp.path;
        ioFields.DeleteMethod = deleteOp.method.toUpperCase();
        ioFields.DeleteBodyShape = null;
        ioFields.DeleteBodyKey = null;
        ioFields.DeleteIDLocation = decideIDLocation(deleteOp, segment, null);
        codeEvidenceEntries.push({
            claim: `IO.${ioName}.DeleteAPIPath/Method`,
            scriptPath: SCRIPT_PATH,
            scriptInputs: [SPEC_PATH],
            reproduction: {
                verify: `jq '.paths["${deleteOp.path}"] | keys' ${SPEC_PATH}`,
            },
            structuralSignal: `OpenAPI declares DELETE ${deleteOp.path}; IDLocation '${ioFields.DeleteIDLocation}'.`,
            decisionLogic: `DELETE method maps to Delete capability; IDLocation='path' iff a brace-segment appears after the resource segment, else null (no body).`,
        });
    }

    // Top-level CODE_EVIDENCE for IO slots.
    codeEvidenceEntries.push({
        claim: `IO.${ioName}.APIPath / Capability flags`,
        scriptPath: SCRIPT_PATH,
        scriptInputs: [SPEC_PATH],
        reproduction: {
            verify: `jq '.paths | to_entries | map(select(.key | test("^/Ams/\\\\{ClientID\\\\}/Event/\\\\{Event(ID|Id)\\\\}/${segment}($|/)"))) | map({path: .key, methods: (.value | keys | map(select(. | IN("get","post","put","delete","patch"))))})' ${SPEC_PATH}`,
        },
        structuralSignal: `Operations: ${opSig}. SupportsRead=${!!readOp}, SupportsCreate=${!!createOp}, SupportsUpdate=${!!updateOp}, SupportsDelete=${!!deleteOp}.`,
        decisionLogic: `Capability flags directly mirror observed HTTP methods on paths matching ^/Ams/{ClientID}/Event/{Event[ID|Id]}/${segment}(/...)?$. APIPath = path of the read op when present, else the first declared op.`,
    });
    codeEvidenceEntries.push({
        claim: `IO.${ioName}.PaginationType=${paginationType} SupportsPagination=${supportsPagination}`,
        scriptPath: SCRIPT_PATH,
        scriptInputs: [SPEC_PATH],
        reproduction: {
            verify: readOp
                ? `jq '.paths["${readOp.path}"]["${readOp.method}"].parameters | map(.name)' ${SPEC_PATH}`
                : 'No GET op exists; pagination N/A.',
        },
        structuralSignal: readOp
            ? `Read op parameters scanned for PageSize+PageNumber; outcome supportsPagination=${supportsPagination}.`
            : 'No GET; pagination capability is None by definition.',
        decisionLogic: `PaginationType='PageNumber' iff both PageSize and PageNumber appear as query params on the read op; otherwise 'None'.`,
    });
    codeEvidenceEntries.push({
        claim: `IO.${ioName}.SupportsIncrementalSync=${supportsIncrementalSync}`,
        scriptPath: SCRIPT_PATH,
        scriptInputs: [SPEC_PATH],
        reproduction: {
            verify: readOp
                ? `jq '.paths["${readOp.path}"]["${readOp.method}"].parameters | map(select(.name | test("(?i)^(modifiedsince|modifiedafter|since|updatedafter)$")))' ${SPEC_PATH}`
                : 'No GET op exists; incremental sync N/A.',
        },
        structuralSignal: readOp
            ? `Searched read op params for since/modifiedAfter; result=${supportsIncrementalSync}; watermark=${incrementalWatermarkField || 'none'}.`
            : 'No GET; incremental sync false by definition.',
        decisionLogic: `True iff a query param named ModifiedSince/ModifiedAfter/Since/UpdatedAfter exists on the read op.`,
    });
    codeEvidenceEntries.push({
        claim: `IO.${ioName}.ResponseDataKey=${responseDataKey || 'null'}`,
        scriptPath: SCRIPT_PATH,
        scriptInputs: [SPEC_PATH],
        reproduction: {
            verify: respDefName
                ? `jq '.definitions["${respDefName}"].properties | keys' ${SPEC_PATH}`
                : 'No response schema.',
        },
        structuralSignal: respProps
            ? `Response def '${respDefName}' has properties: ${Object.keys(respProps).join(', ')}. Picked '${responseDataKey || 'null'}' as data key.`
            : `No response schema available for ${segment}.`,
        decisionLogic: `Data key resolves to first non-envelope array property of the response definition; segment-named array wins when present.`,
    });
    codeEvidenceEntries.push({
        claim: `IO.${ioName}.ParentObjectName=AmsEvent ParentObjectIDFieldName=${parentParam}`,
        scriptPath: SCRIPT_PATH,
        scriptInputs: [SPEC_PATH],
        reproduction: {
            verify: `jq '.paths | to_entries | map(.key) | map(select(test("^/Ams/\\\\{ClientID\\\\}/Event/\\\\{Event(ID|Id)\\\\}/${segment}($|/)")))' ${SPEC_PATH}`,
        },
        structuralSignal: `Path template carries {${parentParam}} as the parent ID before the sub-resource segment.`,
        decisionLogic: `Parametric path /Ams/{ClientID}/Event/{${parentParam}}/${segment}/... establishes Event as parent; ParentObjectIDFieldName mirrors the brace-token verbatim from the path.`,
    });

    // ---------------------------------------------------------------------
    // IOF emission from response definition properties.
    // ---------------------------------------------------------------------
    const iofRows = [];
    if (respProps) {
        const requiredSet = new Set(respRequired || []);
        // Optionally drill into the data-key array's item schema to get item fields.
        let itemProps = null;
        let itemRequired = [];
        if (responseDataKey && respProps[responseDataKey]?.type === 'array' && respProps[responseDataKey].items?.$ref) {
            const itemDefName = refToDefName(respProps[responseDataKey].items.$ref);
            const itemDef = itemDefName ? getDef(itemDefName) : null;
            if (itemDef?.properties) {
                itemProps = itemDef.properties;
                itemRequired = itemDef.required || [];
            }
        }
        // Prefer the array-item properties when available (they're the actual
        // entity shape); else fall back to the response definition's own
        // properties.
        const sourceProps = itemProps || respProps;
        const sourceRequired = itemProps ? new Set(itemRequired) : requiredSet;

        for (const [fieldName, propSpec] of Object.entries(sourceProps)) {
            if (ENVELOPE_FIELDS.has(fieldName)) continue;
            const { Type, Length } = mapType(propSpec.type, propSpec.format, propSpec.maxLength);
            const isRequired = sourceRequired.has(fieldName);
            const allowsNull = propSpec['x-nullable'] !== false && !isRequired;
            const isPK = detectExplicitPK(fieldName, propSpec);
            if (isPK) stats.PKsExplicitlyEmitted++;

            // FK detection: a field named like the parent param.
            let isFK = false;
            let relatedRef = null;
            if (fieldName === parentParam) {
                isFK = true;
                relatedRef = `@lookup:MJ: Integration Objects.Name=AmsEvent&IntegrationID=${INTEGRATION_LOOKUP}`;
                stats.FKsEmitted++;
            }

            const iofRow = {
                fields: {
                    IntegrationObjectID: `@lookup:MJ: Integration Objects.Name=${ioName}&IntegrationID=${INTEGRATION_LOOKUP}`,
                    Name: fieldName,
                    DisplayName: fieldName,
                    Description: propSpec.description || `${fieldName} property of ${respDefName || segment} as declared in OpenAPI 2.0 spec.`,
                    Type,
                    Length: Length,
                    AllowsNull: allowsNull,
                    IsRequired: isRequired,
                    // Response-side fields are by default readable AND writable
                    // on this surface (the same DTO is used for POST/PUT bodies).
                    // We mark IsReadOnly false unless the spec carries readOnly=true.
                    IsReadOnly: !!propSpec.readOnly,
                    IsUniqueKey: false,
                },
            };
            if (isPK) iofRow.fields.IsPrimaryKey = true;
            if (isFK) {
                iofRow.fields.IsForeignKey = true;
                iofRow.fields.RelatedIntegrationObjectID = relatedRef;
            }
            iofRows.push(iofRow);

            // Per-flag CODE_EVIDENCE for each meaningful slot.
            if (isRequired) {
                codeEvidenceEntries.push({
                    claim: `IOF.${ioName}.${fieldName}.IsRequired=true`,
                    scriptPath: SCRIPT_PATH,
                    scriptInputs: [SPEC_PATH],
                    structuralSignal: `Field "${fieldName}" appears in required[] of definition '${itemProps ? 'item' : respDefName}' for ${segment}.`,
                    decisionLogic: `Swagger 2.0 required array membership directly sets IsRequired.`,
                });
            }
            if (propSpec.readOnly) {
                codeEvidenceEntries.push({
                    claim: `IOF.${ioName}.${fieldName}.IsReadOnly=true`,
                    scriptPath: SCRIPT_PATH,
                    scriptInputs: [SPEC_PATH],
                    structuralSignal: `Field "${fieldName}" declares readOnly=true.`,
                    decisionLogic: `OpenAPI readOnly flag mapped directly.`,
                });
            }
            if (isPK) {
                codeEvidenceEntries.push({
                    claim: `IOF.${ioName}.${fieldName}.IsPrimaryKey=true`,
                    scriptPath: SCRIPT_PATH,
                    scriptInputs: [SPEC_PATH],
                    structuralSignal: `Field description contains explicit PK marker.`,
                    decisionLogic: `Per Gap 10 we only emit IsPrimaryKey when the source carries an explicit marker (description text or x-primary-key).`,
                });
            }
            if (isFK) {
                codeEvidenceEntries.push({
                    claim: `IOF.${ioName}.${fieldName}.IsForeignKey=true RelatedIntegrationObjectID=AmsEvent`,
                    scriptPath: SCRIPT_PATH,
                    scriptInputs: [SPEC_PATH],
                    structuralSignal: `Field name "${fieldName}" matches parametric parent token of path /Ams/{ClientID}/Event/{${parentParam}}/${segment}/...`,
                    decisionLogic: `Required-ordering parametric path implies the sub-resource child carries an FK to its declared parent. Name->ID resolution deferred to Phase-0 D5.`,
                });
            } else if (!isPK && /^(Id|.*Id)$/i.test(fieldName)) {
                // Soft PK candidate — leave to D4.
                stats.GapsForRuntimeD4.push(`${ioName}.${fieldName} — soft PK candidate (no explicit marker)`);
            }
        }
    }

    stats.IOFCreated += iofRows.length;
    stats.IOCreated += 1;
    stats.TraversalOrder.push(ioName);

    IOs.push({ fields: ioFields, relatedEntities: { 'MJ: Integration Object Fields': iofRows } });
}

// -----------------------------------------------------------------------------
// Persist to integration metadata file (idempotent upsert by Name).
// -----------------------------------------------------------------------------
const existingMetadata = JSON.parse(readFileSync(INTEGRATION_METADATA_PATH, 'utf8'));
const ymRecord = existingMetadata[0];
if (!ymRecord || ymRecord.fields?.Name !== 'YourMembership') {
    throw new Error('Could not locate YourMembership integration record in metadata file');
}
ymRecord.relatedEntities = ymRecord.relatedEntities || {};
ymRecord.relatedEntities['MJ: Integration Objects'] = ymRecord.relatedEntities['MJ: Integration Objects'] || [];
const allIOs = ymRecord.relatedEntities['MJ: Integration Objects'];

for (const ioEntry of IOs) {
    const name = ioEntry.fields.Name;
    const idx = allIOs.findIndex((io) => io.fields?.Name === name);
    if (idx >= 0) allIOs[idx] = ioEntry;
    else allIOs.push(ioEntry);
}

writeFileSync(INTEGRATION_METADATA_PATH, JSON.stringify(existingMetadata, null, 2) + '\n');

// -----------------------------------------------------------------------------
// Append CODE_EVIDENCE entries (idempotent: drop prior entries scoped to our IO names).
// -----------------------------------------------------------------------------
const codeEvidence = JSON.parse(readFileSync(CODE_EVIDENCE_PATH, 'utf8'));
codeEvidence.entries = codeEvidence.entries || [];
const ourPrefixes = stats.TraversalOrder.map((n) => `IO.${n}`).concat(stats.TraversalOrder.map((n) => `IOF.${n}`));
codeEvidence.entries = codeEvidence.entries.filter(
    (e) => !ourPrefixes.some((pref) => (e.claim || '').startsWith(pref))
);
codeEvidence.entries.push(...codeEvidenceEntries);
writeFileSync(CODE_EVIDENCE_PATH, JSON.stringify(codeEvidence, null, 2) + '\n');

// -----------------------------------------------------------------------------
// Structured stdout — workflow reads this.
// -----------------------------------------------------------------------------
console.log(JSON.stringify({
    objectName: 'AmsEventSubResources',
    IOCreated: stats.IOCreated,
    IOFCreated: stats.IOFCreated,
    PKsExplicitlyEmitted: stats.PKsExplicitlyEmitted,
    FKsEmitted: stats.FKsEmitted,
    GapsForRuntimeD4: stats.GapsForRuntimeD4,
    TraversalOrder: stats.TraversalOrder,
    Segments: stats.SegmentList,
    SegmentsWithNoGet: stats.SegmentsWithNoGet,
    SegmentsWithNoResponseSchema: stats.SegmentsWithNoResponseSchema,
    codeEvidenceEntriesAppended: codeEvidenceEntries.length,
}, null, 2));
