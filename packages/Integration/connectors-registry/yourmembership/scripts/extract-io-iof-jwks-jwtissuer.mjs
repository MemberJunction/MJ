#!/usr/bin/env node
// Extracts IO + IOFs for the "JWKS / JWT Issuer Endpoints" object family from
// YourMembership's OpenAPI snapshot, then appends to the integration metadata
// file and CODE_EVIDENCE.json. Page bodies never enter the agent reasoning
// context — only the structured stdout of this script does.
//
// Object scope:
//   - GET /.well-known/jwks            -> JWKS public-key set (read-only data surface)
//   - POST /Ams/Auth/GetJwt            -> JWT issuance operation (INFORMATIONAL — request DTO)
//
// Per Gap-10 PK discipline: only emit IsPrimaryKey when the source explicitly
// marks it. The JWKS surface declares no primary key in the OpenAPI spec; the
// `kid` field of an individual JWK is a conventional identifier per RFC 7517
// but the spec does NOT mark it as a primary key, so we do NOT emit
// IsPrimaryKey=true.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(new URL('../../../../..', import.meta.url).pathname);
const SPEC_PATH = `${REPO_ROOT}/packages/Integration/connectors-registry/yourmembership/runs/connector-yourmembership-1780165237029-a495a1ea/output/openapi.snapshot.json`;
const INTEGRATION_METADATA_PATH = `${REPO_ROOT}/metadata/integrations/yourmembership/.yourmembership.integration.json`;
const CODE_EVIDENCE_PATH = `${REPO_ROOT}/packages/Integration/connectors-registry/yourmembership/runs/connector-yourmembership-1780165237029-a495a1ea/output/CODE_EVIDENCE.json`;

// -----------------------------------------------------------------------------
// Step 1: parse the spec, extract just the slots needed for the JWKS / JwtIssuer IO.
// -----------------------------------------------------------------------------
const spec = JSON.parse(readFileSync(SPEC_PATH, 'utf8'));

const JWKS_PATH = '/.well-known/jwks';
const JWT_PATH = '/Ams/Auth/GetJwt';

const jwksOp = spec.paths?.[JWKS_PATH]?.get;
const jwtOp = spec.paths?.[JWT_PATH]?.post;

if (!jwksOp) throw new Error(`Spec is missing GET ${JWKS_PATH}`);
if (!jwtOp) throw new Error(`Spec is missing POST ${JWT_PATH}`);

// Pull response-shape definitions.
const jwksResponseDef = spec.definitions?.JwksResponse;
const jwkKeyDef = spec.definitions?.JwkKey;
const jwtIssuerResponseDef = spec.definitions?.JwtIssuerResponse;
const jwtIssuerDef = spec.definitions?.JwtIssuer;

if (!jwksResponseDef) throw new Error('Spec is missing definitions.JwksResponse');
if (!jwkKeyDef) throw new Error('Spec is missing definitions.JwkKey');
if (!jwtIssuerResponseDef) throw new Error('Spec is missing definitions.JwtIssuerResponse');

// -----------------------------------------------------------------------------
// Step 2: build the IO row.
// -----------------------------------------------------------------------------
// Naming convention: object is named "JwtIssuer" because that is the spec's
// canonical name for both the issuer surface (JwtIssuer / JwtIssuerResponse)
// and is the parent name in the metadata portal. APIPath uses the canonical
// READ surface: /.well-known/jwks (since the GET-shape JwksResponse is what a
// consumer reads). The token-issuance POST is captured as an auxiliary path.
//
// SupportsRead = true (GET /.well-known/jwks returns JwksResponse data)
// SupportsCreate/Update/Delete/IncrementalSync = false (purely a read/issue surface)
// PaginationType = "None" (no pagination params declared on either op)

const objectName = 'JwtIssuer';

const ioFields = {
    'IntegrationID': '@lookup:MJ: Integrations.Name=YourMembership',
    'Name': objectName,
    'DisplayName': 'JWT Issuer / JWKS',
    'Description':
        'JWT issuer surface. Exposes (a) the JWKS public-key set at GET /.well-known/jwks ' +
        'used by clients to verify YM-issued JWT signatures, and (b) the JWT generation ' +
        'endpoint at POST /Ams/Auth/GetJwt that mints a token for the calling session. ' +
        'OpenAPI 2.0 spec: response schema for /.well-known/jwks is JwksResponse{keys:JwkKey[]} ' +
        'per RFC 7517; response schema for /Ams/Auth/GetJwt is JwtIssuerResponse{token}. ' +
        'Both endpoints declared deprecated=false. The GET surface is the canonical read; ' +
        'the POST surface is auth-flow plumbing.',
    'Category': 'Auth',
    'APIPath': JWKS_PATH,
    'ResponseDataKey': 'keys',
    'PaginationType': 'None',
    'SupportsPagination': false,
    'SupportsIncrementalSync': false,
    'SupportsRead': true,
    'SupportsCreate': false,
    'SupportsUpdate': false,
    'SupportsDelete': false,
    // SupportsWrite mirrors the create/update/delete flags. The POST /Ams/Auth/GetJwt
    // is an auth-flow side-effect, NOT a CRUD write on an entity. So false here.
    'SupportsWrite': false,
};

// -----------------------------------------------------------------------------
// Step 3: build the IOF rows.
// -----------------------------------------------------------------------------
// The "fields" of this IO are the per-key properties of an individual JWK
// (since the response is {keys: JwkKey[]}). Each field maps directly to a
// property on definitions.JwkKey per the OpenAPI spec. RFC 7517 informs the
// semantic descriptions but field PRESENCE/TYPE comes only from the spec.

const jwkKeyProps = jwkKeyDef.properties || {};
const jwkKeyRequired = new Set(jwkKeyDef.required || []); // spec declares no required[]

// Build IOF rows in the spec's declared property order.
function mapType(t, fmt) {
    if (t === 'string') return 'string';
    if (t === 'integer') return 'integer';
    if (t === 'number') return 'decimal';
    if (t === 'boolean') return 'boolean';
    if (t === 'array') return 'array';
    if (t === 'object') return 'object';
    return 'string';
}

// Per-field semantic descriptions are JWK semantics from the spec field name +
// RFC 7517 (which the spec implicitly follows for /.well-known/jwks). We do
// NOT mark IsPrimaryKey on kid even though kid is the conventional JWK ID —
// the spec has NO primary-key marker. Per Gap-10, soft-PK detection is a
// runtime concern, not an agent decision.
const fieldDescriptions = {
    'kty': 'Key Type — RSA, EC, oct, etc. RFC 7517 §4.1.',
    'kid': 'Key ID — opaque per-key identifier; clients select the verification key by matching kid in the JWT header. NOT marked as primary key in the OpenAPI spec.',
    'use': 'Public-key Use — typically "sig" (signature) for JWT verification. RFC 7517 §4.2.',
    'alg': 'Algorithm — e.g., RS256, ES256. RFC 7517 §4.4.',
    'n': 'RSA modulus (base64url-encoded). Only present for RSA keys. RFC 7518 §6.3.1.1.',
    'e': 'RSA public exponent (base64url-encoded). Only present for RSA keys. RFC 7518 §6.3.1.2.',
};

const iofRows = [];
const fieldOrder = Object.keys(jwkKeyProps); // preserve spec property order
for (const fieldName of fieldOrder) {
    const propSpec = jwkKeyProps[fieldName];
    const isRequired = jwkKeyRequired.has(fieldName);
    // Spec marks no x-nullable on JwkKey properties — they're all optional strings.
    const allowsNull = !isRequired;
    iofRows.push({
        'fields': {
            'IntegrationObjectID': '@lookup:MJ: Integration Objects.Name=JwtIssuer&IntegrationID=@lookup:MJ: Integrations.Name=YourMembership',
            'Name': fieldName,
            'DisplayName': fieldName,
            'Description': fieldDescriptions[fieldName] || `JwkKey.${fieldName} as declared in OpenAPI definition.`,
            'Type': mapType(propSpec.type, propSpec.format),
            'AllowsNull': allowsNull,
            'IsRequired': isRequired,
            'IsReadOnly': true,           // The JWKS document is signed by YM; clients read only.
            'IsUniqueKey': false,         // Spec declares no unique constraint.
            // IsPrimaryKey intentionally omitted — no explicit PK marker in spec.
            // (D4 SoftPKClassifier handles `kid` as a soft-PK candidate at runtime.)
        },
    });
}

// -----------------------------------------------------------------------------
// Step 4: append to integration metadata file.
// -----------------------------------------------------------------------------
const existingMetadata = JSON.parse(readFileSync(INTEGRATION_METADATA_PATH, 'utf8'));

// Idempotency: if an IO with this Name already exists, replace it; otherwise append.
const ioEntry = {
    'fields': ioFields,
    'relatedEntities': {
        'MJ: Integration Object Fields': iofRows,
    },
};

// Locate the YourMembership integration record (it's the only top-level entry).
const ymRecord = existingMetadata[0];
if (!ymRecord || ymRecord.fields?.Name !== 'YourMembership') {
    throw new Error('Could not locate YourMembership integration record in metadata file');
}

ymRecord.relatedEntities = ymRecord.relatedEntities || {};
ymRecord.relatedEntities['MJ: Integration Objects'] = ymRecord.relatedEntities['MJ: Integration Objects'] || [];
const ios = ymRecord.relatedEntities['MJ: Integration Objects'];

// Idempotent upsert by Name.
const existingIdx = ios.findIndex((io) => io.fields?.Name === objectName);
if (existingIdx >= 0) {
    ios[existingIdx] = ioEntry;
} else {
    ios.push(ioEntry);
}

writeFileSync(INTEGRATION_METADATA_PATH, JSON.stringify(existingMetadata, null, 2) + '\n');

// -----------------------------------------------------------------------------
// Step 5: append per-flag CODE_EVIDENCE entries.
// -----------------------------------------------------------------------------
const codeEvidence = JSON.parse(readFileSync(CODE_EVIDENCE_PATH, 'utf8'));
const SCRIPT_PATH = '/Users/madhavsubramaniyam/Projects/MJ/MJ/packages/Integration/connectors-registry/yourmembership/scripts/extract-io-iof-jwks-jwtissuer.mjs';

const newEntries = [
    {
        'claim': 'IO.JwtIssuer.APIPath = /.well-known/jwks (canonical read surface)',
        'scriptPath': SCRIPT_PATH,
        'scriptInputs': [SPEC_PATH],
        'reproduction': {
            'run': `node ${SCRIPT_PATH}`,
            'verify': `jq '.paths["/.well-known/jwks"].get | {operationId, summary, response: .responses."200".schema}' ${SPEC_PATH}`,
        },
        'expectedOutput': '{"operationId":"Jwksjwks_Get","summary":"Provides the public signing keys (JWKS) for JWT signature verification.","response":{"$ref":"#/definitions/JwksResponse"}}',
        'decisionLogic': 'Spec declares GET /.well-known/jwks with response schema JwksResponse{keys:JwkKey[]}. This is the canonical READ surface for the JWKS/JwtIssuer object family. SOURCE_STUDY §3.5 names this path under the JWKS / JWT Issuer Endpoints taxonomy.',
    },
    {
        'claim': 'IO.JwtIssuer.ResponseDataKey = "keys"',
        'scriptPath': SCRIPT_PATH,
        'scriptInputs': [SPEC_PATH],
        'reproduction': {
            'verify': `jq '.definitions.JwksResponse' ${SPEC_PATH}`,
        },
        'expectedOutput': '{"title":"JwksResponse","properties":{"keys":{"type":"array","items":{"$ref":"#/definitions/JwkKey"}}},"description":"JwksResponse","type":"object"}',
        'decisionLogic': 'JwksResponse has exactly one property "keys" of type array<JwkKey>. That is the array a downstream consumer iterates, so ResponseDataKey = "keys".',
    },
    {
        'claim': 'IO.JwtIssuer.PaginationType = None, SupportsPagination = false',
        'scriptPath': SCRIPT_PATH,
        'scriptInputs': [SPEC_PATH],
        'reproduction': {
            'verify': `jq '.paths["/.well-known/jwks"].get.parameters, .paths["/Ams/Auth/GetJwt"].post.parameters | map(.name)' ${SPEC_PATH}`,
        },
        'expectedOutput': 'GET /.well-known/jwks declares parameters: []. POST /Ams/Auth/GetJwt declares parameters: [refId, UsingRedis, AppInitTime, ServerID, ClientID, ResponseStatus, BypassCache, DateCached, Device] — none of which are pagination params (no PageSize/PageNumber/Offset/limit).',
        'decisionLogic': 'No pagination parameters declared on either operation. PaginationType = None and SupportsPagination = false.',
    },
    {
        'claim': 'IO.JwtIssuer.SupportsIncrementalSync = false, IncrementalWatermarkField unset',
        'scriptPath': SCRIPT_PATH,
        'scriptInputs': [SPEC_PATH],
        'reproduction': {
            'verify': `jq '.definitions.JwkKey.properties | keys' ${SPEC_PATH}`,
        },
        'expectedOutput': '["alg","e","kid","kty","n","use"]',
        'decisionLogic': 'JwkKey declares no timestamp/version/etag property. No watermark field exists in the schema for incremental sync. The JWKS endpoint returns the full active key-set on every call (the RFC 7517 contract).',
    },
    {
        'claim': 'IO.JwtIssuer.SupportsCreate/Update/Delete = false, SupportsWrite = false',
        'scriptPath': SCRIPT_PATH,
        'scriptInputs': [SPEC_PATH],
        'reproduction': {
            'verify': `jq '.paths["/.well-known/jwks"] | keys' ${SPEC_PATH} && jq '.paths["/Ams/Auth/GetJwt"] | keys' ${SPEC_PATH}`,
        },
        'expectedOutput': '/.well-known/jwks supports: ["get","parameters"]. /Ams/Auth/GetJwt supports: ["parameters","post"]. No PUT, PATCH, or DELETE methods declared on either path.',
        'decisionLogic': 'Spec exposes only GET on /.well-known/jwks and POST on /Ams/Auth/GetJwt. The POST is a token-mint operation (auth-flow side effect), NOT a CRUD write on a JwtIssuer entity. Therefore SupportsCreate=false, SupportsUpdate=false, SupportsDelete=false, SupportsWrite=false. No Create/Update/Delete per-operation columns emitted.',
    },
    {
        'claim': 'IOF.JwtIssuer fields (kty, kid, use, alg, n, e) — all read-only, no PK marker',
        'scriptPath': SCRIPT_PATH,
        'scriptInputs': [SPEC_PATH],
        'reproduction': {
            'verify': `jq '.definitions.JwkKey' ${SPEC_PATH}`,
        },
        'expectedOutput': 'JwkKey has properties kty, kid, use, alg, n, e — all type "string", with no required[] array and no x-primary-key extension marker.',
        'decisionLogic': 'All six JwkKey properties become IOF rows with Type=string. AllowsNull=true on all (spec declares no required[]). IsReadOnly=true on all (JWKS is a server-signed read surface — clients never write to it). IsPrimaryKey is NOT emitted on any field (no explicit primary-key marker in OpenAPI). The conventional JWK identifier "kid" (RFC 7517 §4.5) is a soft-PK candidate but per Gap-10 we leave that to runtime D4 SoftPKClassifier.',
    },
    {
        'claim': 'No FK relationships on JwtIssuer fields',
        'scriptPath': SCRIPT_PATH,
        'scriptInputs': [SPEC_PATH],
        'reproduction': {
            'verify': `jq '.definitions.JwkKey.properties | to_entries | map(select(.value."$ref" != null or .value.type == "object"))' ${SPEC_PATH}`,
        },
        'expectedOutput': '[] — no JwkKey property uses a $ref or object-typed reference to another definition.',
        'decisionLogic': 'All six JwkKey properties are scalar strings. None reference another schema definition; none come from a parametric path that implies a parent FK. IsForeignKey not emitted on any field.',
    },
];

codeEvidence.entries = codeEvidence.entries || [];
// Idempotency: drop prior entries whose claim begins with the same prefix for this object.
codeEvidence.entries = codeEvidence.entries.filter(
    (e) => !e.claim?.startsWith('IO.JwtIssuer') && !e.claim?.startsWith('IOF.JwtIssuer') && !e.claim?.startsWith('No FK relationships on JwtIssuer')
);
codeEvidence.entries.push(...newEntries);

writeFileSync(CODE_EVIDENCE_PATH, JSON.stringify(codeEvidence, null, 2) + '\n');

// -----------------------------------------------------------------------------
// Step 6: emit structured stats stdout.
// -----------------------------------------------------------------------------
const stats = {
    objectName,
    IOCreated: 1,
    IOFCreated: iofRows.length,
    PKsExplicitlyEmitted: 0,
    FKsEmitted: 0,
    GapsForRuntimeD4: ['kid is a soft-PK candidate per RFC 7517 §4.5 but spec has no explicit PK marker'],
    TraversalOrder: 0,
    paths: {
        readPath: JWKS_PATH,
        ancillaryPath: JWT_PATH,
    },
    iofFieldNames: iofRows.map((r) => r.fields.Name),
    codeEvidenceEntriesAppended: newEntries.length,
};
console.log(JSON.stringify(stats, null, 2));
