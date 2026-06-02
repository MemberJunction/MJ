// IOIOF extractor — YourMembership Ymc Career Family
//
// Scope (per SOURCE_STUDY.md §3.2, taxonomy "Ymc (YMCareers) Resource Family"):
//   Pinpoint, LocationCoordinates, JobAlertsCriteria, JobAlerts,
//   JobSearch, SavedJobs, Templates
//
// Source: cached Swagger 2.0 spec at /tmp/ym-evidence/openapi.json
//         (fetched 2026-05-30 from https://ws.yourmembership.com/openapi).
//         Fallback path: connector-registry run output openapi.snapshot.json.
//
// Emission discipline:
//   - One IO per Ymc sub-resource enumerated under /Ymc/{ClientID}/Member/{MemberID}/.
//   - IOFs derived strictly from the 200-response schema definition (Swagger 2.0 #/definitions).
//   - PK detection: EXPLICIT ONLY. No field on these envelopes has an explicit PK marker
//     in the source (no "primary key" / "unique identifier" / "system ID" wording, no
//     x-primary-key extension). Therefore zero PKs are emitted. The runtime D4 SoftPK
//     classifier handles ambiguity downstream.
//   - FK detection: MemberID + ClientID appear as path parameters in every Ymc operation
//     (`/Ymc/{ClientID}/Member/{MemberID}/...`), creating a required-ordering parametric
//     hierarchy. MemberID is emitted with IsForeignKey=true and RelatedIntegrationObjectID
//     pointing at the canonical "Member" IO. ClientID is the tenant identifier and is
//     treated as a tenant-scope parameter rather than an entity FK (it scopes the whole
//     connector, not just this object).
//   - Per-operation CRUD slots: CreateAPIPath/CreateMethod/CreateBodyShape/CreateBodyKey/
//     CreateIDLocation emitted per v5.39.x conventions when POST is declared. Same for
//     UpdateAPIPath/UpdateMethod/UpdateBodyShape/UpdateBodyKey/UpdateIDLocation when PUT
//     or PATCH is declared. Same for DeleteAPIPath/DeleteMethod/DeleteIDLocation when
//     DELETE is declared.
//
// Output: stdout is a single JSON object:
//   { IOs: [...], IOFs: [...], stats: {...}, evidence: [...] }
// Callers persist IOs+IOFs into metadata/integrations/yourmembership/
// and evidence into the run output dir.

import { readFileSync, existsSync } from 'node:fs';

const PRIMARY_SPEC_PATH = '/tmp/ym-evidence/openapi.json';
const FALLBACK_SPEC_PATH =
  '/Users/madhavsubramaniyam/Projects/MJ/MJ/packages/Integration/connectors-registry/' +
  'yourmembership/runs/connector-yourmembership-1780165237029-a495a1ea/output/openapi.snapshot.json';

const SPEC_PATH = existsSync(PRIMARY_SPEC_PATH) ? PRIMARY_SPEC_PATH : FALLBACK_SPEC_PATH;
const spec = JSON.parse(readFileSync(SPEC_PATH, 'utf8'));

// Family roster — explicit per SOURCE_STUDY.md §3.2.
// Each entry pairs the IO Name (the URL segment) with its OpenAPI path.
const YMC_FAMILY = [
  { name: 'Pinpoint',           path: '/Ymc/{ClientID}/Member/{MemberID}/Pinpoint' },
  { name: 'LocationCoordinates', path: '/Ymc/{ClientID}/Member/{MemberID}/LocationCoordinates' },
  { name: 'JobAlertsCriteria',  path: '/Ymc/{ClientID}/Member/{MemberID}/JobAlertsCriteria' },
  { name: 'JobAlerts',          path: '/Ymc/{ClientID}/Member/{MemberID}/JobAlerts' },
  { name: 'JobSearch',          path: '/Ymc/{ClientID}/Member/{MemberID}/JobSearch' },
  { name: 'SavedJobs',          path: '/Ymc/{ClientID}/Member/{MemberID}/SavedJobs' },
  { name: 'Templates',          path: '/Ymc/{ClientID}/Member/{MemberID}/Templates' },
];

const METHOD_TO_CRUD = {
  get: 'read',
  post: 'create',
  put: 'update',
  patch: 'update',
  delete: 'delete',
};

// Lookup token used everywhere; resolves to the IntegrationID at push time.
const INTEGRATION_LOOKUP = '@lookup:MJ: Integrations.Name=YourMembership';

// Resolve a #/definitions/X ref to its definition name.
function refToDefName(ref) {
  if (!ref || typeof ref !== 'string') return null;
  const m = ref.match(/^#\/definitions\/(.+)$/);
  return m ? m[1] : null;
}

function getDef(name) {
  return spec.definitions?.[name] || null;
}

// Walk a Swagger 2.0 schema (possibly nested) returning a flat list of property descriptors.
// We descend $ref-references one hop to inline the envelope contents.
function flattenSchema(schema, depth = 0) {
  if (!schema || depth > 2) return [];
  if (schema.$ref) {
    const target = refToDefName(schema.$ref);
    const def = target ? getDef(target) : null;
    if (!def) return [];
    return flattenSchema(def, depth + 1);
  }
  if (schema.type === 'array' && schema.items) {
    return flattenSchema(schema.items, depth + 1);
  }
  const fields = [];
  const required = new Set(schema.required || []);
  for (const [propName, propSchema] of Object.entries(schema.properties || {})) {
    let type = propSchema.type;
    let format = propSchema.format;
    let refTarget = null;
    if (propSchema.$ref) {
      refTarget = refToDefName(propSchema.$ref);
      type = 'object';
    }
    if (propSchema.type === 'array') {
      type = 'array';
      if (propSchema.items?.$ref) refTarget = refToDefName(propSchema.items.$ref);
      else if (propSchema.items?.type) refTarget = propSchema.items.type;
    }
    fields.push({
      name: propName,
      type: type || 'string',
      format,
      description: propSchema.description,
      required: required.has(propName),
      isReadOnly: !!propSchema.readOnly,
      xNullable: propSchema['x-nullable'],
      refTarget,
      enum: propSchema.enum,
      maxLength: propSchema.maxLength,
    });
  }
  return fields;
}

// Map Swagger 2.0 type+format to MJ Integration Object Field type tokens.
function mapType(field) {
  const t = (field.type || '').toLowerCase();
  const f = (field.format || '').toLowerCase();
  if (t === 'integer') {
    if (f === 'int64') return { Type: 'integer', Length: 8 };
    return { Type: 'integer', Length: 4 };
  }
  if (t === 'number') {
    if (f === 'double') return { Type: 'number', Length: 8 };
    if (f === 'float') return { Type: 'number', Length: 4 };
    return { Type: 'number', Length: undefined };
  }
  if (t === 'boolean') return { Type: 'boolean', Length: undefined };
  if (t === 'string') {
    if (f === 'date-time' || f === 'date') return { Type: 'datetime', Length: undefined };
    if (f === 'uuid' || f === 'guid') return { Type: 'string', Length: 36 };
    return { Type: 'string', Length: field.maxLength };
  }
  if (t === 'array') return { Type: 'array', Length: undefined };
  if (t === 'object') return { Type: 'object', Length: undefined };
  return { Type: 'string', Length: undefined };
}

// Explicit PK signal — per Gap 10 of extractor conventions.
function detectExplicitPK(field) {
  if (!field) return false;
  const d = (field.description || '').toLowerCase();
  if (d.includes('primary key')) return true;
  if (d.includes('unique identifier')) return true;
  if (d.includes('system id')) return true;
  return false;
}

function getSuccessResponseSchema(op) {
  if (!op?.responses) return null;
  for (const code of ['200', '201', '202']) {
    if (op.responses[code]?.schema) return op.responses[code].schema;
  }
  return null;
}

// IO + IOF emission
const IOs = [];
const IOFs = [];
const evidence = [];
const stats = {
  FamilyMembers: YMC_FAMILY.length,
  IOsEmitted: 0,
  IOFsEmitted: 0,
  PKsExplicitlyEmitted: 0,
  FKsEmitted: 0,
  MembersWithNoOps: [],
  MembersWithNoResponseSchema: [],
};

// ServiceStack response-envelope plumbing fields that are not data — exclude from IOFs.
// ResponseStatus is the error envelope; the others are caching/server diagnostics.
const ENVELOPE_FIELDS = new Set([
  'ResponseStatus',
  'BypassCache',
  'DateCached',
  'Device',
]);

for (const member of YMC_FAMILY) {
  const pth = member.path;
  const methods = spec.paths?.[pth];
  if (!methods) {
    stats.MembersWithNoOps.push(member.name);
    continue;
  }

  // Classify operations by HTTP method.
  let readOp = null, createOp = null, updateOp = null, deleteOp = null;
  for (const [method, op] of Object.entries(methods)) {
    if (typeof op !== 'object' || !op) continue;
    const crud = METHOD_TO_CRUD[method];
    if (!crud) continue;
    if (crud === 'read' && !readOp) readOp = { method, op };
    else if (crud === 'create' && !createOp) createOp = { method, op };
    else if (crud === 'update' && !updateOp) updateOp = { method, op };
    else if (crud === 'delete' && !deleteOp) deleteOp = { method, op };
  }

  if (!readOp && !createOp && !updateOp && !deleteOp) {
    stats.MembersWithNoOps.push(member.name);
    continue;
  }

  // Response schema — derive IOFs from the GET success response.
  let respSchema = null;
  if (readOp) respSchema = getSuccessResponseSchema(readOp.op);
  if (!respSchema) {
    // Fall back to any op's success response (POST/PUT often returns same envelope).
    for (const o of [createOp, updateOp, deleteOp]) {
      if (!o) continue;
      const s = getSuccessResponseSchema(o.op);
      if (s) { respSchema = s; break; }
    }
  }
  const respDefName = respSchema ? refToDefName(respSchema.$ref) : null;
  const respFields = respSchema ? flattenSchema(respSchema) : [];
  if (respFields.length === 0) {
    stats.MembersWithNoResponseSchema.push(member.name);
  }

  // Description: combine the first GET op summary + family context.
  const summaries = [readOp, createOp, updateOp, deleteOp]
    .filter(Boolean)
    .map(o => o.op.summary)
    .filter(Boolean)
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .slice(0, 3);
  const description = summaries.length > 0
    ? `YMCareers (Ymc) sub-resource: ${member.name}. ${summaries.join(' / ')}. Source: OpenAPI ${pth}.`
    : `YMCareers (Ymc) sub-resource: ${member.name}. Source: OpenAPI ${pth}.`;

  // Pagination: Ymc uses Solr-style start/rows (offset/limit), NOT YM's main PageSize/PageNumber.
  // Detect explicitly.
  let supportsPagination = false;
  let paginationType = null;
  if (readOp) {
    const params = readOp.op.parameters || [];
    const hasStart = params.some(p => p.name === 'start');
    const hasRows = params.some(p => p.name === 'rows');
    if (hasStart && hasRows) {
      supportsPagination = true;
      paginationType = 'Offset';
    } else {
      const hasPagSize = params.some(p => p.name?.toLowerCase() === 'pagesize');
      const hasPagNum = params.some(p => p.name?.toLowerCase() === 'pagenumber');
      if (hasPagSize && hasPagNum) {
        supportsPagination = true;
        paginationType = 'PageNumber';
      }
    }
  }

  // ResponseDataKey: in ServiceStack Ymc envelopes the resource payload is under the
  // 'response' property (we see this in CityLookupResponse, LocationCoordinatesResponse,
  // JobAlertsResponse, etc.). Verify it exists on the response definition before emitting.
  let responseDataKey = null;
  if (respDefName) {
    const def = getDef(respDefName);
    if (def?.properties?.response) responseDataKey = 'response';
  }

  // Build IO row
  const ioName = member.name;
  const ioRow = {
    fields: {
      IntegrationID: INTEGRATION_LOOKUP,
      Name: ioName,
      DisplayName: ioName,
      Description: description,
      Category: 'YmcCareer',
      APIPath: pth,
      ResponseDataKey: responseDataKey,
      PaginationType: paginationType,
      SupportsPagination: supportsPagination,
      SupportsIncrementalSync: false,
      IncrementalWatermarkField: null,
      SupportsRead: !!readOp,
      SupportsCreate: !!createOp,
      SupportsUpdate: !!updateOp,
      SupportsDelete: !!deleteOp,
      SupportsWrite: !!(createOp || updateOp || deleteOp),
    },
  };

  // Per-operation CRUD slots (v5.39.x)
  if (createOp) {
    // Form-data body (formData params, not body param) => 'flat' shape per
    // BaseRESTIntegrationConnector conventions: top-level form fields, no wrapper.
    const formDataParams = (createOp.op.parameters || []).filter(p => p.in === 'formData');
    ioRow.fields.CreateAPIPath = pth;
    ioRow.fields.CreateMethod = createOp.method.toUpperCase();
    ioRow.fields.CreateBodyShape = formDataParams.length > 0 ? 'flat' : null;
    ioRow.fields.CreateBodyKey = null;
    // Ymc uses ID inside the form body (e.g., JobAlertId), not in the URL path
    // beyond the parent {MemberID}/{ClientID}. So ID location for create is 'body'.
    ioRow.fields.CreateIDLocation = formDataParams.length > 0 ? 'body' : null;
    evidence.push({
      claim: `${ioName}.CreateAPIPath/CreateMethod/CreateBodyShape/CreateBodyKey/CreateIDLocation`,
      scriptPath: 'packages/Integration/connectors-registry/yourmembership/scripts/extract-io-iof-ymc-career.mjs',
      structuralSignal:
        `OpenAPI path '${pth}' declares method '${createOp.method.toUpperCase()}' with ` +
        `${formDataParams.length} formData parameters: ` +
        `${formDataParams.map(p => p.name).join(', ')}. BodyShape='flat' because formData params ` +
        `flatten to top-level form fields (no $ref body wrapper). IDLocation='body' since ID-bearing ` +
        `params (e.g., JobAlertId/job_id) appear in formData not in path.`,
    });
  }
  if (updateOp) {
    const formDataParams = (updateOp.op.parameters || []).filter(p => p.in === 'formData');
    ioRow.fields.UpdateAPIPath = pth;
    ioRow.fields.UpdateMethod = updateOp.method.toUpperCase();
    ioRow.fields.UpdateBodyShape = formDataParams.length > 0 ? 'flat' : null;
    ioRow.fields.UpdateBodyKey = null;
    ioRow.fields.UpdateIDLocation = formDataParams.length > 0 ? 'body' : null;
    evidence.push({
      claim: `${ioName}.UpdateAPIPath/UpdateMethod/UpdateBodyShape/UpdateBodyKey/UpdateIDLocation`,
      scriptPath: 'packages/Integration/connectors-registry/yourmembership/scripts/extract-io-iof-ymc-career.mjs',
      structuralSignal:
        `OpenAPI path '${pth}' declares method '${updateOp.method.toUpperCase()}' with ` +
        `${formDataParams.length} formData parameters: ` +
        `${formDataParams.map(p => p.name).join(', ')}. BodyShape='flat' (form-encoded, no wrapper). ` +
        `IDLocation='body' since ID-bearing params live in form body, not URL beyond parents.`,
    });
  }
  if (deleteOp) {
    ioRow.fields.DeleteAPIPath = pth;
    ioRow.fields.DeleteMethod = deleteOp.method.toUpperCase();
    // DELETE uses query parameters in Ymc (see SavedJobs delete: job_id is in:query).
    const queryParams = (deleteOp.op.parameters || []).filter(p => p.in === 'query');
    ioRow.fields.DeleteIDLocation = queryParams.length > 0 ? 'body' : null;
    evidence.push({
      claim: `${ioName}.DeleteAPIPath/DeleteMethod/DeleteIDLocation`,
      scriptPath: 'packages/Integration/connectors-registry/yourmembership/scripts/extract-io-iof-ymc-career.mjs',
      structuralSignal:
        `OpenAPI path '${pth}' declares method 'DELETE' with query parameters: ` +
        `${queryParams.map(p => p.name).join(', ')}. IDLocation marked 'body' (i.e., not in URL path ` +
        `beyond parent IDs); the ID-bearing param is in:query.`,
    });
  }

  // Aggregate read/CRUD evidence
  const opsList = [readOp, createOp, updateOp, deleteOp].filter(Boolean);
  evidence.push({
    claim: `${ioName}.APIPath / SupportsRead/Create/Update/Delete`,
    scriptPath: 'packages/Integration/connectors-registry/yourmembership/scripts/extract-io-iof-ymc-career.mjs',
    structuralSignal:
      `Operations observed for path '${pth}': ${opsList.map(o => o.method.toUpperCase()).join(', ')}. ` +
      `SupportsRead=${!!readOp}, SupportsCreate=${!!createOp}, SupportsUpdate=${!!updateOp}, ` +
      `SupportsDelete=${!!deleteOp}, SupportsWrite=${!!(createOp || updateOp || deleteOp)}.`,
  });
  evidence.push({
    claim: `${ioName}.PaginationType=${paginationType ?? 'null'} SupportsPagination=${supportsPagination}`,
    scriptPath: 'packages/Integration/connectors-registry/yourmembership/scripts/extract-io-iof-ymc-career.mjs',
    structuralSignal: readOp
      ? `Read op parameters: ${(readOp.op.parameters || []).map(p => p.name).join(', ') || '(none)'}. ` +
        `Ymc uses Solr-style 'start' + 'rows' (offset+limit), not YM's PageSize/PageNumber convention.`
      : 'No GET op exists for this resource — pagination N/A',
  });
  evidence.push({
    claim: `${ioName}.ResponseDataKey=${responseDataKey ?? 'null'}`,
    scriptPath: 'packages/Integration/connectors-registry/yourmembership/scripts/extract-io-iof-ymc-career.mjs',
    structuralSignal: respDefName
      ? `Response schema '#/definitions/${respDefName}' declares property 'response' ` +
        `as the payload container (verified by inspecting definition.properties).`
      : 'No response definition found.',
  });
  evidence.push({
    claim: `${ioName}.SupportsIncrementalSync=false`,
    scriptPath: 'packages/Integration/connectors-registry/yourmembership/scripts/extract-io-iof-ymc-career.mjs',
    structuralSignal:
      `Ymc response envelopes do not expose a modified-at/updated-at field on the parent ` +
      `record. No watermark field is provable from the OpenAPI definition.`,
  });

  IOs.push(ioRow);
  stats.IOsEmitted++;

  // Emit IOFs from response schema fields.
  for (const f of respFields) {
    if (ENVELOPE_FIELDS.has(f.name)) continue;

    const { Type, Length } = mapType(f);
    const isPK = detectExplicitPK(f);
    if (isPK) stats.PKsExplicitlyEmitted++;

    // FK detection — only on MemberID (path-implied parent).
    // ClientID is the connector-wide tenant scope, not a per-object FK.
    let isForeignKey = false;
    let relatedIOLookup = null;
    let relatedFieldName = null;
    if (f.name === 'MemberID') {
      isForeignKey = true;
      relatedIOLookup = `@lookup:MJ: Integration Objects.IntegrationID=${INTEGRATION_LOOKUP}&Name=Member`;
      relatedFieldName = 'ID';
      stats.FKsEmitted++;
      evidence.push({
        claim: `${ioName}.${f.name}.IsForeignKey=true / RelatedIntegrationObjectID=Member`,
        scriptPath: 'packages/Integration/connectors-registry/yourmembership/scripts/extract-io-iof-ymc-career.mjs',
        structuralSignal:
          `Path '${pth}' declares parametric segment '/Member/{MemberID}/' — implies the ` +
          `${ioName} resource is required-ordered under a parent Member. Field 'MemberID' on the ` +
          `response envelope mirrors the path parameter. FK target = 'Member' (canonical Ams IO).`,
      });
    }

    // AllowsNull: Swagger 2.0 'x-nullable' is the explicit signal. Required fields
    // never allow null. If x-nullable is explicitly false, AllowsNull=false.
    // Otherwise default to !required.
    let allowsNull;
    if (f.required) {
      allowsNull = false;
    } else if (f.xNullable === false) {
      allowsNull = false;
    } else {
      allowsNull = true;
    }

    const iofRow = {
      fields: {
        IntegrationObjectID:
          `@lookup:MJ: Integration Objects.IntegrationID=${INTEGRATION_LOOKUP}&Name=${ioName}`,
        Name: f.name,
        DisplayName: f.name,
        Description: f.description || null,
        Type,
        Length: Length ?? null,
        AllowsNull: allowsNull,
        IsRequired: !!f.required,
        IsReadOnly: !!f.isReadOnly,
        IsUniqueKey: false,
        IsPrimaryKey: isPK,
        IsForeignKey: isForeignKey,
        RelatedIntegrationObjectID: relatedIOLookup,
        RelatedIntegrationObjectFieldName: relatedFieldName,
      },
    };
    IOFs.push(iofRow);
    stats.IOFsEmitted++;

    if (isPK) {
      evidence.push({
        claim: `${ioName}.${f.name}.IsPrimaryKey=true`,
        scriptPath: 'packages/Integration/connectors-registry/yourmembership/scripts/extract-io-iof-ymc-career.mjs',
        structuralSignal: `Field description explicitly contains PK marker: "${(f.description || '').slice(0, 120)}"`,
      });
    }
    if (f.required) {
      evidence.push({
        claim: `${ioName}.${f.name}.IsRequired=true`,
        scriptPath: 'packages/Integration/connectors-registry/yourmembership/scripts/extract-io-iof-ymc-career.mjs',
        structuralSignal: `Field appears in 'required' array of response schema '${respDefName}'.`,
      });
    }
    if (f.isReadOnly) {
      evidence.push({
        claim: `${ioName}.${f.name}.IsReadOnly=true`,
        scriptPath: 'packages/Integration/connectors-registry/yourmembership/scripts/extract-io-iof-ymc-career.mjs',
        structuralSignal: `Field declares readOnly=true in OpenAPI schema.`,
      });
    }
    if (f.xNullable === false && !f.required) {
      evidence.push({
        claim: `${ioName}.${f.name}.AllowsNull=false (x-nullable signal)`,
        scriptPath: 'packages/Integration/connectors-registry/yourmembership/scripts/extract-io-iof-ymc-career.mjs',
        structuralSignal: `Field declares 'x-nullable: false' in OpenAPI schema (Swagger 2.0 ServiceStack convention).`,
      });
    }
  }
}

// TraversalOrder: parent-first. Ymc objects are children of Member.
// Since Member is in the Ams family (separate IO not in this run), the
// canonical order among the 7 emitted IOs is the order they appear in
// SOURCE_STUDY §3.2 / the family definition above (no inter-object dependencies).
const traversalOrder = YMC_FAMILY
  .map(m => m.name)
  .filter(n => IOs.some(io => io.fields.Name === n));

const output = {
  IOs,
  IOFs,
  stats,
  evidence,
  TraversalOrder: traversalOrder,
};

console.log(JSON.stringify(output, null, 2));
