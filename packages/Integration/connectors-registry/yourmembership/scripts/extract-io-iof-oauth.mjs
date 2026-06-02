#!/usr/bin/env node
/**
 * extract-io-iof-oauth.mjs
 *
 * Extracts the OAuth 2.0 Token Endpoints object (and its fields) from the
 * YourMembership OpenAPI snapshot.
 *
 * Object covers three paths (per SOURCE_STUDY §3.3, OAuth tag, count=3):
 *   - /OAuth/GetAccessToken      (legacy AppId / AppSecret / GrantType=Code|RefreshToken)
 *   - /OAuth/GetToken            (RFC6749 grant_type=authorization_code|refresh_token)
 *   - /OAuth/OIDC/GetAccessToken (RFC6749 + OIDC)
 *
 * Provable-only. PK explicit-only. Per-flag CODE_EVIDENCE.
 *
 * Inputs:
 *   - openapi.snapshot.json (downloaded by source-auditor at run start)
 *
 * Outputs (stdout):
 *   - Structured JSON: { object, fields, gaps, counts }
 *
 * The script does NOT itself write the metadata file or CODE_EVIDENCE — the
 * agent writer composes those from this script's structured stdout.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const OPENAPI_PATH = resolve(__dirname, '../runs/connector-yourmembership-1780165237029-a495a1ea/output/openapi.snapshot.json');

// ---------- Zod validation of the OpenAPI shape we depend on ----------

const ParameterSchema = z.object({
  name: z.string(),
  in: z.string(),
  type: z.string().optional(),
  required: z.boolean().optional(),
  description: z.string().optional(),
  enum: z.array(z.string()).optional(),
});

const OperationSchema = z.object({
  tags: z.array(z.string()).optional(),
  summary: z.string().optional(),
  description: z.string().optional(),
  operationId: z.string().optional(),
  consumes: z.array(z.string()).optional(),
  produces: z.array(z.string()).optional(),
  parameters: z.array(z.union([ParameterSchema, z.object({ $ref: z.string() })])).optional(),
  responses: z.record(z.unknown()).optional(),
  deprecated: z.boolean().optional(),
});

const PathItemSchema = z.object({
  post: OperationSchema.optional(),
  get: OperationSchema.optional(),
  parameters: z.array(z.unknown()).optional(),
});

const OpenApiSchema = z.object({
  swagger: z.string(),
  host: z.string().optional(),
  paths: z.record(PathItemSchema),
});

// ---------- Load + validate ----------

const raw = JSON.parse(readFileSync(OPENAPI_PATH, 'utf8'));
const doc = OpenApiSchema.parse(raw);

const OAUTH_PATHS = ['/OAuth/GetAccessToken', '/OAuth/GetToken', '/OAuth/OIDC/GetAccessToken'];

// ---------- Walk the three paths, collect fields ----------

/** Map of fieldName -> aggregated metadata */
const fieldAgg = new Map();
const opSummaries = [];

for (const p of OAUTH_PATHS) {
  const item = doc.paths[p];
  if (!item || !item.post) {
    throw new Error(`Expected POST on ${p} not present in OpenAPI snapshot`);
  }
  const op = item.post;
  opSummaries.push({
    path: p,
    operationId: op.operationId,
    tags: op.tags,
    consumes: op.consumes,
    produces: op.produces,
    summary: op.summary,
    deprecated: op.deprecated === true,
    paramCount: (op.parameters || []).length,
  });

  for (const param of op.parameters || []) {
    if ('$ref' in param) continue; // shared header refs, skip
    if (param.in !== 'formData') continue; // body fields only

    const existing = fieldAgg.get(param.name) || {
      name: param.name,
      type: param.type || 'string',
      description: param.description || null,
      // required = TRUE iff EVERY path that defines this parameter marks it required
      requiredAcross: [],
      enums: new Set(),
      paths: new Set(),
      deprecated: false,
    };
    existing.requiredAcross.push(param.required === true);
    if (param.enum) param.enum.forEach((e) => existing.enums.add(e));
    existing.paths.add(p);

    // Prefer the longest description we see across paths
    if (param.description && (!existing.description || param.description.length > existing.description.length)) {
      existing.description = param.description;
    }

    // Detect deprecation in description text (the OpenAPI marks AppSecert deprecation in description)
    if (param.description && /deprecated/i.test(param.description)) {
      existing.deprecated = true;
    }

    fieldAgg.set(param.name, existing);
  }
}

// ---------- Build IO row ----------

const io = {
  Name: 'OAuthToken',
  DisplayName: 'OAuth 2.0 Token Endpoints',
  Description:
    'OAuth 2.0 token issuance + refresh endpoints for YourMembership. Three concrete operations are exposed under the OAuth tag: ' +
    '(1) POST /OAuth/GetAccessToken — legacy ServiceStack form (AppId + AppSecret + GrantType=Code|RefreshToken; AppSecert is documented as deprecated in the OpenAPI summary); ' +
    '(2) POST /OAuth/GetToken — RFC 6749 shape (grant_type=authorization_code|refresh_token, client_id/client_secret/code/refresh_token/redirect_uri/scope); ' +
    '(3) POST /OAuth/OIDC/GetAccessToken — OIDC variant with the same RFC 6749 parameter set. ' +
    'All three consume application/x-www-form-urlencoded and produce application/json. INFORMATIONAL surface (auth-flow, not a data entity), exposed as an IO at user request so the auth surface is queryable in MJ metadata.',
  Category: 'Auth',
  APIPath: '/OAuth/GetToken', // Primary canonical endpoint (RFC 6749 shape, used by /OAuth/GetToken and /OAuth/OIDC/GetAccessToken). /OAuth/GetAccessToken alternates are documented as alternate paths in Configuration.
  ResponseDataKey: null, // OAuth response is a root-level JSON object (Object schema in OpenAPI), no wrapping data key
  PaginationType: 'None',
  SupportsPagination: false,
  SupportsIncrementalSync: false,
  IncrementalWatermarkField: null,
  SupportsWrite: false, // Token endpoints are call-and-receive; not CRUD-able
  // Per-operation CRUD columns: ALL null because this is not a data IO
  CreateAPIPath: null,
  CreateMethod: null,
  CreateBodyShape: null,
  CreateBodyKey: null,
  CreateIDLocation: null,
  UpdateAPIPath: null,
  UpdateMethod: null,
  UpdateBodyShape: null,
  UpdateBodyKey: null,
  UpdateIDLocation: null,
  DeleteAPIPath: null,
  DeleteIDLocation: null,
  MetadataSource: 'Declared',
  Status: 'Active',
  Configuration: {
    sourceCitation: 'https://ws.yourmembership.com/openapi paths /OAuth/GetAccessToken, /OAuth/GetToken, /OAuth/OIDC/GetAccessToken; OAuth Getting Started PDF (https://www.yourmembership.com/wp-content/uploads/2021/02/YM_Getting_Started_OAuth_2021.pdf)',
    taxonomyClassification: 'INFORMATIONAL (per SOURCE_STUDY §3.3 — extractor uses these to model auth, not a data entity)',
    alternateAPIPaths: ['/OAuth/GetAccessToken', '/OAuth/OIDC/GetAccessToken'],
    contentType: { consumes: 'application/x-www-form-urlencoded', produces: 'application/json' },
    method: 'POST',
    grantTypesSupported: {
      '/OAuth/GetAccessToken': ['Code', 'RefreshToken'],
      '/OAuth/GetToken': ['authorization_code', 'refresh_token'],
      '/OAuth/OIDC/GetAccessToken': ['authorization_code', 'refresh_token'],
    },
    operations: opSummaries,
  },
};

// ---------- Build IOF rows ----------

const fields = [];
let seq = 10;
for (const [name, agg] of fieldAgg) {
  const allRequired = agg.requiredAcross.length > 0 && agg.requiredAcross.every((r) => r === true);
  const isReadOnly = false;
  fields.push({
    Name: name,
    DisplayName: name,
    Description: agg.description,
    Type: agg.type || 'string',
    Length: agg.type === 'string' ? null : null, // OpenAPI does not declare maxLength on these fields
    AllowsNull: !allRequired,
    IsRequired: allRequired,
    IsReadOnly: isReadOnly,
    IsUniqueKey: false,
    IsPrimaryKey: false, // EXPLICIT-ONLY rule; OpenAPI does not declare any PK marker on OAuth fields
    Category: 'OAuthParameter',
    Sequence: seq,
    Status: agg.deprecated ? 'Deprecated' : 'Active',
    MetadataSource: 'Declared',
    Configuration: {
      sourcePaths: [...agg.paths].sort(),
      enumValuesObserved: [...agg.enums].sort(),
      deprecated: agg.deprecated || undefined,
    },
  });
  seq += 10;
}

// ---------- Coverage check: every formData parameter across the 3 paths must be present ----------

const expectedFieldNames = new Set();
for (const p of OAUTH_PATHS) {
  for (const param of doc.paths[p].post.parameters || []) {
    if ('$ref' in param) continue;
    if (param.in === 'formData') expectedFieldNames.add(param.name);
  }
}
const emittedFieldNames = new Set(fields.map((f) => f.Name));
const missing = [...expectedFieldNames].filter((n) => !emittedFieldNames.has(n));
const extras  = [...emittedFieldNames].filter((n) => !expectedFieldNames.has(n));

if (missing.length || extras.length) {
  throw new Error(`Coverage mismatch — missing: ${JSON.stringify(missing)}, extras: ${JSON.stringify(extras)}`);
}

// ---------- Emit structured stdout ----------

const out = {
  object: io,
  fields,
  counts: {
    IOCreated: 1,
    IOFCreated: fields.length,
    PathsCovered: OAUTH_PATHS.length,
    PKsExplicitlyEmitted: fields.filter((f) => f.IsPrimaryKey).length,
    FKsEmitted: fields.filter((f) => /* future */ false).length,
    GapsForRuntimeD4: 0,
    TraversalOrder: 0,
  },
  gaps: [
    'OAuth response body schema is typed as `#/definitions/Object` (opaque) in the OpenAPI — the actual returned access_token, refresh_token, expires_in, token_type, scope, id_token fields are not declared. They are RFC 6749 standard but not vendor-declared in the spec.',
    'No field-level maxLength / format declared on any formData parameter; Length is left NULL.',
  ],
};

process.stdout.write(JSON.stringify(out, null, 2) + '\n');
