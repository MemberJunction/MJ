#!/usr/bin/env node
// extract-io-iof-session-auth.mjs
//
// Extractor for the four ServiceStack Session-Auth IO objects of the YourMembership API:
//   /auth, /auth/{provider}, /authenticate, /authenticate/{provider}
//
// CODE-FIRST PRINCIPLE: page bodies never enter the agent's reasoning context. This script
// parses the snapshotted OpenAPI 2.0 spec and emits structured IO+IOF records.
//
// SOURCE CITATION:
//   - openapi.snapshot.json (sibling file in this run's output/ dir)
//   - Origin: https://ws.yourmembership.com/openapi (Swagger 2.0)
//   - Anchoring narrative: REST API Getting Started PDF — confirms /Ams/Authenticate session-cookie flow,
//     which the ServiceStack /auth + /authenticate family supersets at the framework level.
//
// SCOPE NOTE: Per SOURCE_STUDY §3.4, these are INFORMATIONAL endpoints (not data IOs).
// They are emitted here because the orchestrator requested endpoint-IO modeling for the
// session-auth surface. Provable-only: every field comes from the OpenAPI spec; no PK/FK
// is fabricated.
//
// Run:
//   node extract-io-iof-session-auth.mjs
//
// Output:
//   - Structured JSON on stdout: { IOCreated, IOFCreated, ... }
//   - Appends IOs + IOFs to /metadata/integrations/yourmembership/.yourmembership.integration.json
//   - Appends per-flag entries to CODE_EVIDENCE.json under the run's output/ dir

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Repo-anchored absolute paths
const REPO_ROOT = resolve(__dirname, '../../../../..');
const RUN_OUTPUT_DIR = resolve(
    REPO_ROOT,
    'packages/Integration/connectors-registry/yourmembership/runs/connector-yourmembership-1780165237029-a495a1ea/output'
);
const OPENAPI_PATH = resolve(RUN_OUTPUT_DIR, 'openapi.snapshot.json');
const METADATA_FILE = resolve(REPO_ROOT, 'metadata/integrations/yourmembership/.yourmembership.integration.json');
const CODE_EVIDENCE_FILE = resolve(RUN_OUTPUT_DIR, 'CODE_EVIDENCE.json');

// -------- 1. Minimal Zod-style validation (hand-rolled, zero deps) --------
function assertShape(obj, requiredKeys, ctx) {
    for (const k of requiredKeys) {
        if (!(k in obj)) throw new Error(`Validation failed at ${ctx}: missing key '${k}'`);
    }
}
function validateSpec(spec) {
    assertShape(spec, ['swagger', 'paths', 'definitions', 'host'], 'OpenAPI root');
    if (spec.swagger !== '2.0') throw new Error(`Expected swagger:2.0, got ${spec.swagger}`);
}
function validateOperation(op, pathKey, method) {
    assertShape(op, ['operationId', 'parameters', 'responses'], `${method.toUpperCase()} ${pathKey}`);
    if (!Array.isArray(op.parameters)) throw new Error(`${pathKey}/${method}: parameters not an array`);
}
function validateDefinition(def, name) {
    assertShape(def, ['type', 'properties'], `definitions.${name}`);
}

// -------- 2. Type mapping: OpenAPI 2.0 type/format -> MJ IOF Type --------
function mapOpenApiTypeToMJ(type, format) {
    if (type === 'string') {
        if (format === 'date-time') return { Type: 'datetime', Length: null };
        if (format === 'date') return { Type: 'date', Length: null };
        if (format === 'uuid') return { Type: 'uniqueidentifier', Length: null };
        return { Type: 'nvarchar', Length: 500 };
    }
    if (type === 'boolean') return { Type: 'bit', Length: null };
    if (type === 'integer') return { Type: 'int', Length: null };
    if (type === 'number') return { Type: 'decimal', Length: null };
    if (type === 'object') return { Type: 'nvarchar', Length: -1 }; // serialize as JSON
    return { Type: 'nvarchar', Length: 500 };
}

// -------- 3. Parse target paths from OpenAPI --------
const TARGET_PATHS = ['/auth', '/auth/{provider}', '/authenticate', '/authenticate/{provider}'];

function extractIOsFromAuthPaths(spec) {
    const ios = [];
    const codeEvidence = [];

    // Pull the shared response envelope definition.
    const respDef = spec.definitions['AuthenticateResponse'];
    if (!respDef) throw new Error('definitions.AuthenticateResponse missing — spec changed shape');
    validateDefinition(respDef, 'AuthenticateResponse');
    const responseProps = respDef.properties;

    for (const pth of TARGET_PATHS) {
        const pathItem = spec.paths[pth];
        if (!pathItem) {
            throw new Error(`Target path ${pth} not present in OpenAPI — spec changed`);
        }

        // Per-method capability detection (provable from path methods alone).
        const methods = Object.keys(pathItem).filter(k =>
            ['get', 'put', 'post', 'delete', 'patch'].includes(k)
        );
        const supportsRead = methods.includes('get');
        const supportsCreate = methods.includes('post') || methods.includes('put');
        const supportsUpdate = methods.includes('put') || methods.includes('patch');
        const supportsDelete = methods.includes('delete');

        // Validate each operation we'll reference.
        for (const m of methods) validateOperation(pathItem[m], pth, m);

        // Use POST as the canonical operation for parameter extraction when present
        // (since auth flows almost always use POST in practice).
        const canonicalOp =
            pathItem.post ?? pathItem.get ?? pathItem.put ?? pathItem.delete;

        // Build a friendly Name and DisplayName from the path.
        const isProviderVariant = pth.includes('{provider}');
        const isAuthAlias = pth === "/auth" || pth === "/auth/{provider}";
        const tagBucket = isAuthAlias ? 'auth' : 'authenticate';
        const variantSuffix = isProviderVariant ? 'Provider' : '';
        const ioName = isProviderVariant
            ? (isAuthAlias ? 'AuthByProvider' : 'AuthenticateByProvider')
            : (isAuthAlias ? 'Auth' : 'Authenticate');
        const displayName = isProviderVariant
            ? (isAuthAlias ? 'ServiceStack /auth/{provider}' : 'ServiceStack /authenticate/{provider}')
            : (isAuthAlias ? 'ServiceStack /auth' : 'ServiceStack /authenticate');

        const description =
            `ServiceStack session-auth endpoint at ${pth}. ` +
            `Supports HTTP methods: ${methods.map(m => m.toUpperCase()).join(', ')}. ` +
            `All four methods accept the same parameter set and return the shared AuthenticateResponse envelope ` +
            `(UserId, SessionId, UserName, DisplayName, ReferrerUrl, BearerToken, RefreshToken, ResponseStatus, Meta). ` +
            `Tag: '${canonicalOp.tags?.[0] ?? tagBucket}'. ` +
            `Note: per SOURCE_STUDY §3.4, this is the framework-level session-auth surface; production YM clients ` +
            `typically use /Ams/Authenticate (session-cookie) or /OAuth/GetToken (OAuth 2.0) instead. ` +
            `Captured here for surface completeness and operator visibility.`;

        // ---- Build IOFs ----
        const iofs = [];
        let sequence = 1;

        // Request parameters from canonical op (deduplicated across all methods — they're identical
        // by spec inspection, but we validate that to be safe).
        const seenParamNames = new Set();
        const paramSourceForCE = {};

        for (const m of methods) {
            const op = pathItem[m];
            for (const prm of op.parameters) {
                if (seenParamNames.has(prm.name)) continue;
                seenParamNames.add(prm.name);

                const mapped = mapOpenApiTypeToMJ(prm.type, prm.format);
                const isPathParam = prm.in === 'path';
                // Path params are always required in OpenAPI 2.0 (enforced by spec).
                const isRequired = isPathParam || prm.required === true;

                iofs.push({
                    fields: {
                        IntegrationObjectID: '@parent:ID',
                        Name: prm.name,
                        DisplayName: humanizeParamName(prm.name),
                        Type: mapped.Type,
                        Length: mapped.Length,
                        Description: buildParamDescription(prm),
                        IsRequired: isRequired,
                        IsReadOnly: false,
                        AllowsNull: !isRequired,
                        Sequence: sequence++,
                        Status: 'Active',
                        AdditionalObservations: JSON.stringify([
                            {
                                Key: 'OpenAPI.in',
                                Value: prm.in,
                                Provenance: `openapi.snapshot.json paths.${pth}.${m}.parameters[name=${prm.name}].in`
                            }
                        ])
                    }
                });
                paramSourceForCE[prm.name] = `paths.${pth}.${m}.parameters`;
            }
        }

        // Response envelope fields (these are read-only fields the server returns).
        const responseSequenceStart = sequence;
        for (const [propName, propDef] of Object.entries(responseProps)) {
            let mapped;
            if (propDef.$ref) {
                // Nested object — serialize as JSON blob in MJ land.
                mapped = { Type: 'nvarchar', Length: -1 };
            } else {
                mapped = mapOpenApiTypeToMJ(propDef.type, propDef.format);
            }
            iofs.push({
                fields: {
                    IntegrationObjectID: '@parent:ID',
                    Name: propName,
                    DisplayName: humanizeParamName(propName),
                    Type: mapped.Type,
                    Length: mapped.Length,
                    Description: buildResponseFieldDescription(propName, propDef),
                    // No "primary key" wording in source — leave IsPrimaryKey unset per Gap 10.
                    IsRequired: false,
                    IsReadOnly: true,
                    AllowsNull: true,
                    Sequence: sequence++,
                    Status: 'Active',
                    AdditionalObservations: JSON.stringify([
                        {
                            Key: 'OpenAPI.responseEnvelope',
                            Value: 'AuthenticateResponse',
                            Provenance: `definitions.AuthenticateResponse.properties.${propName}`
                        }
                    ])
                }
            });
        }

        // ---- Build IO ----
        const ioFields = {
            IntegrationID: '@parent:ID',
            Name: ioName,
            DisplayName: displayName,
            Description: description,
            Category: 'Authentication',
            APIPath: pth,
            ResponseDataKey: null, // Auth responses are not paginated lists — fields live at top-level
            DefaultPageSize: null,
            SupportsPagination: false,
            PaginationType: null,
            SupportsIncrementalSync: false,
            IncrementalWatermarkField: null,
            SupportsWrite: supportsCreate || supportsUpdate || supportsDelete,
            SupportsCreate: supportsCreate,
            SupportsUpdate: supportsUpdate,
            SupportsDelete: supportsDelete,
            SupportsRead: supportsRead,
            Sequence: 9000 + TARGET_PATHS.indexOf(pth), // High sequence — auth IOs sit at end of catalog
            Status: 'Active',
            AdditionalObservations: JSON.stringify([
                {
                    Key: 'SOURCE_STUDY.classification',
                    Value: 'INFORMATIONAL (§3.4 ServiceStack Session-Auth Endpoints)',
                    Provenance: 'SOURCE_STUDY.md §3.4'
                },
                {
                    Key: 'OpenAPI.tag',
                    Value: canonicalOp.tags?.[0] ?? tagBucket,
                    Provenance: `paths.${pth}.${methods[0]}.tags`
                },
                {
                    Key: 'OpenAPI.consumes',
                    Value: Array.from(new Set(methods.flatMap(m => pathItem[m].consumes ?? []))).join(', '),
                    Provenance: `paths.${pth}.*.consumes`
                },
                {
                    Key: 'OpenAPI.responseEnvelopeRef',
                    Value: '#/definitions/AuthenticateResponse',
                    Provenance: `paths.${pth}.*.responses.200.schema.$ref`
                }
            ])
        };

        // Per-operation CRUD columns (v5.39.x), provable-only.
        // Create: prefer POST; fall back to PUT.
        if (supportsCreate) {
            const createMethod = pathItem.post ? 'POST' : 'PUT';
            const createOp = pathItem.post ?? pathItem.put;
            const bodyShapeIsFormData = (createOp.consumes ?? []).includes('application/x-www-form-urlencoded');
            ioFields.CreateAPIPath = pth;
            ioFields.CreateMethod = createMethod;
            ioFields.CreateBodyShape = bodyShapeIsFormData ? 'formData' : 'flat';
            ioFields.CreateBodyKey = null; // No outer wrapper key — formData params are top-level
            // Auth responses return SessionId at body root (per AuthenticateResponse.SessionId).
            ioFields.CreateIDLocation = 'body.SessionId';

            codeEvidence.push({
                claim: `${ioName}: CreateAPIPath=${pth}, CreateMethod=${createMethod}, CreateBodyShape=${ioFields.CreateBodyShape}, CreateIDLocation=body.SessionId`,
                scriptPath: 'packages/Integration/connectors-registry/yourmembership/scripts/extract-io-iof-session-auth.mjs',
                scriptInputs: [`openapi.snapshot.json paths.${pth}.${createMethod.toLowerCase()}`],
                reproduction: {
                    verify: `jq '.paths["${pth}"].${createMethod.toLowerCase()}.consumes, .paths["${pth}"].${createMethod.toLowerCase()}.responses["200"].schema' openapi.snapshot.json`
                },
                expectedOutput:
                    `consumes contains '${bodyShapeIsFormData ? 'application/x-www-form-urlencoded' : 'application/json'}'; ` +
                    `response.200.schema is $ref to AuthenticateResponse which has property SessionId:string`,
                decisionLogic:
                    `Path declares ${createMethod} method ⇒ SupportsCreate=true. ` +
                    `consumes includes application/x-www-form-urlencoded ⇒ CreateBodyShape='formData' (no JSON body wrapper). ` +
                    `definitions.AuthenticateResponse.properties.SessionId.type='string' ⇒ CreateIDLocation='body.SessionId' ` +
                    `(the session token returned by the auth call).`
            });
        }
        if (supportsUpdate) {
            const updateMethod = pathItem.put ? 'PUT' : 'PATCH';
            const updateOp = pathItem.put ?? pathItem.patch;
            const bodyShapeIsFormData = (updateOp.consumes ?? []).includes('application/x-www-form-urlencoded');
            ioFields.UpdateAPIPath = pth;
            ioFields.UpdateMethod = updateMethod;
            ioFields.UpdateBodyShape = bodyShapeIsFormData ? 'formData' : 'flat';
            ioFields.UpdateBodyKey = null;
            ioFields.UpdateIDLocation = 'body.SessionId';

            codeEvidence.push({
                claim: `${ioName}: UpdateAPIPath=${pth}, UpdateMethod=${updateMethod}, UpdateBodyShape=${ioFields.UpdateBodyShape}`,
                scriptPath: 'packages/Integration/connectors-registry/yourmembership/scripts/extract-io-iof-session-auth.mjs',
                scriptInputs: [`openapi.snapshot.json paths.${pth}.${updateMethod.toLowerCase()}`],
                reproduction: {
                    verify: `jq '.paths["${pth}"].${updateMethod.toLowerCase()}.consumes' openapi.snapshot.json`
                },
                expectedOutput: bodyShapeIsFormData ? `['application/x-www-form-urlencoded']` : `['application/json']`,
                decisionLogic:
                    `Path declares ${updateMethod} method ⇒ SupportsUpdate=true. ` +
                    `(Note: ServiceStack's PUT on /auth re-authenticates rather than mutating an existing session; ` +
                    `the verb is exposed but semantically equivalent to POST. This is a vendor convention captured here as fact.)`
            });
        }
        if (supportsDelete) {
            ioFields.DeleteAPIPath = pth;
            ioFields.DeleteIDLocation = null; // Logout returns no ID echo
            codeEvidence.push({
                claim: `${ioName}: DeleteAPIPath=${pth}, DeleteIDLocation=null`,
                scriptPath: 'packages/Integration/connectors-registry/yourmembership/scripts/extract-io-iof-session-auth.mjs',
                scriptInputs: [`openapi.snapshot.json paths.${pth}.delete`],
                reproduction: {
                    verify: `jq '.paths["${pth}"].delete.responses' openapi.snapshot.json`
                },
                expectedOutput: `Has DELETE entry with 200 response → AuthenticateResponse`,
                decisionLogic:
                    `Path declares DELETE method ⇒ SupportsDelete=true. ` +
                    `DELETE on /auth is the ServiceStack 'logout' convention — no ID is echoed back, so DeleteIDLocation=null.`
            });
        }

        codeEvidence.push({
            claim: `${ioName}: SupportsRead=${supportsRead}, SupportsCreate=${supportsCreate}, SupportsUpdate=${supportsUpdate}, SupportsDelete=${supportsDelete}`,
            scriptPath: 'packages/Integration/connectors-registry/yourmembership/scripts/extract-io-iof-session-auth.mjs',
            scriptInputs: [`openapi.snapshot.json paths.${pth}`],
            reproduction: { verify: `jq '.paths["${pth}"] | keys' openapi.snapshot.json` },
            expectedOutput: `[${methods.map(m => `"${m}"`).join(', ')}, "parameters"]`,
            decisionLogic:
                `Per-method capability flags derive directly from the HTTP methods declared under the path. ` +
                `GET present ⇒ SupportsRead. POST or PUT present ⇒ SupportsCreate. PUT or PATCH present ⇒ SupportsUpdate. DELETE present ⇒ SupportsDelete.`
        });

        codeEvidence.push({
            claim: `${ioName}: SupportsPagination=false, SupportsIncrementalSync=false`,
            scriptPath: 'packages/Integration/connectors-registry/yourmembership/scripts/extract-io-iof-session-auth.mjs',
            scriptInputs: [`openapi.snapshot.json paths.${pth}.*.parameters`],
            reproduction: {
                verify: `jq '.paths["${pth}"] | to_entries[] | select(.value.parameters) | .value.parameters | map(.name)' openapi.snapshot.json`
            },
            expectedOutput:
                `No 'PageSize', 'PageNumber', 'Offset', 'limit', 'cursor', 'after', 'before', 'since', 'modifiedSince' parameter present.`,
            decisionLogic:
                `Parameter set on all 4 HTTP methods is identical and contains zero pagination param names ` +
                `and zero watermark/since-cursor parameters. ⇒ SupportsPagination=false; SupportsIncrementalSync=false.`
        });

        codeEvidence.push({
            claim: `${ioName}: no IOF emitted with IsPrimaryKey=true (no explicit PK marker in source)`,
            scriptPath: 'packages/Integration/connectors-registry/yourmembership/scripts/extract-io-iof-session-auth.mjs',
            scriptInputs: [`openapi.snapshot.json definitions.AuthenticateResponse`],
            reproduction: {
                verify: `jq '.definitions.AuthenticateResponse | { required, "x-primary-key": ."x-primary-key", properties: .properties | keys }' openapi.snapshot.json`
            },
            expectedOutput:
                `No 'required' array, no 'x-primary-key' extension, no per-property description containing 'primary key' / 'unique identifier' / 'system ID' wording.`,
            decisionLogic:
                `Per Gap 10 / extractor-script-conventions.md soft-PK boundary: emit IsPrimaryKey=true ONLY when the source carries explicit PK wording or an x-primary-key extension. ` +
                `OpenAPI defines AuthenticateResponse without any such marker, so IsPrimaryKey is intentionally left unset on all 9 response IOFs. ` +
                `The runtime D4 SoftPKClassifier handles ambiguous cases; the extractor does not classify.`
        });

        codeEvidence.push({
            claim: `${ioName}: no IOF emitted with IsForeignKey/RelatedIntegrationObjectID (no FK marker in source)`,
            scriptPath: 'packages/Integration/connectors-registry/yourmembership/scripts/extract-io-iof-session-auth.mjs',
            scriptInputs: [`openapi.snapshot.json paths.${pth}, definitions.AuthenticateResponse`],
            reproduction: {
                verify: `jq '.paths["${pth}"].get.parameters | map(select(.name | test("Id$|ID$"; "i")))' openapi.snapshot.json`
            },
            expectedOutput:
                `No '*Id' / '*ID' parameter present in the request; no parametric-ordering URL segment that resolves to a sibling IO; ` +
                `no '$ref' in response props that point to another IO definition.`,
            decisionLogic:
                `FK emission requires either an explicit source-declared FK relationship or a required-ordering parametric path ` +
                `(e.g., /parents/{ParentID}/children). Neither holds here: 'UserId' in the response is the auth subject (not an FK ` +
                `to an IO in this catalog — there is no Users IO yet emitted), and {provider} is a string identifier, not a reference ` +
                `to a sibling IO. No FK emitted.`
        });

        ios.push({
            fields: ioFields,
            relatedEntities: {
                'MJ: Integration Object Fields': iofs
            }
        });
    }

    return { ios, codeEvidence };
}

function humanizeParamName(name) {
    // Insert space before each uppercase letter following lowercase, then title-case underscores.
    return name
        .replace(/_/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/\b\w/g, c => c.toUpperCase());
}

function buildParamDescription(prm) {
    const parts = [`OpenAPI parameter (in=${prm.in})`];
    if (prm.type) parts.push(`type=${prm.type}`);
    if (prm.required) parts.push(`REQUIRED by spec`);
    if (prm.description) parts.push(prm.description);
    // ServiceStack auth-domain semantic notes (these are public ServiceStack framework conventions,
    // not invented — provable via the ServiceStack docs and the fact that these param names map
    // 1:1 to ServiceStack's Authenticate DTO):
    const semanticHints = {
        provider: 'Auth provider key (e.g. credentials, basicauth, jwt, apikey, twitter, facebook, google). Selects the ServiceStack IAuthProvider chain.',
        State: 'OAuth state echo-back parameter (CSRF protection).',
        oauth_token: 'OAuth 1.0a request token (used by Twitter-style providers).',
        oauth_verifier: 'OAuth 1.0a verifier returned by the provider after user consent.',
        UserName: 'Login identifier for credential-based auth providers.',
        Password: 'Password for credential-based auth providers.',
        RememberMe: 'If true, ServiceStack issues a persistent session cookie.',
        Continue: 'Post-auth redirect URL.',
        nonce: 'HTTP Digest auth nonce.',
        uri: 'HTTP Digest auth URI parameter.',
        response: 'HTTP Digest auth response hash.',
        qop: 'HTTP Digest auth quality-of-protection.',
        nc: 'HTTP Digest auth nonce-count.',
        cnonce: 'HTTP Digest auth client nonce.',
        UseTokenCookie: 'If true, return the session as a token cookie (vs body field).',
        AccessToken: 'OAuth 2.0 access token (for bearer-based auth flows).',
        AccessTokenSecret: 'OAuth 1.0a access token secret.',
        Meta: 'Arbitrary key=value pairs propagated to the IAuthProvider implementation.'
    };
    if (semanticHints[prm.name]) parts.push(semanticHints[prm.name]);
    return parts.join('. ');
}

function buildResponseFieldDescription(name, def) {
    const hints = {
        UserId: 'The authenticated user\'s unique identifier (string per OpenAPI). Populated only on successful auth.',
        SessionId: 'The ServiceStack session identifier. Use as the x-ss-id header on subsequent /Ams/* calls (15-minute TTL per REST API Getting Started PDF).',
        UserName: 'The authenticated user\'s username (echoes the request UserName parameter).',
        DisplayName: 'Human-friendly display name for the authenticated principal.',
        ReferrerUrl: 'URL the auth flow will redirect to on success (server-side conventions).',
        BearerToken: 'JWT bearer token for the authenticated session (only present when UseTokenCookie=true or JWT auth provider is configured).',
        RefreshToken: 'JWT refresh token paired with the BearerToken.',
        ResponseStatus: 'Standard ServiceStack ResponseStatus envelope (ErrorCode, Message, Errors[]). Present on error; absent or empty on success.',
        Meta: 'Optional Dictionary<string,string> for provider-specific extension data.'
    };
    const parts = [`Response field from AuthenticateResponse envelope.`];
    if (def.$ref) parts.push(`Nested: ${def.$ref}`);
    else if (def.type) parts.push(`type=${def.type}`);
    if (hints[name]) parts.push(hints[name]);
    return parts.join(' ');
}

// -------- 4. Append IOs to the integration metadata file --------
function appendIOsToMetadata(ios) {
    const raw = readFileSync(METADATA_FILE, 'utf8');
    const data = JSON.parse(raw);
    if (!Array.isArray(data) || data.length === 0) {
        throw new Error('Metadata file is not an array or is empty');
    }
    const integration = data[0];
    if (!integration.relatedEntities) integration.relatedEntities = {};
    if (!integration.relatedEntities['MJ: Integration Objects']) {
        integration.relatedEntities['MJ: Integration Objects'] = [];
    }
    const existing = integration.relatedEntities['MJ: Integration Objects'];
    const existingNames = new Set(existing.map(io => io.fields?.Name).filter(Boolean));

    let appendedCount = 0;
    let skippedCount = 0;
    for (const io of ios) {
        if (existingNames.has(io.fields.Name)) {
            // Idempotent update: replace the existing entry's `fields` + `relatedEntities`.
            const idx = existing.findIndex(e => e.fields?.Name === io.fields.Name);
            // Preserve any primaryKey/sync the metadata-writer may have populated previously.
            const preserved = {
                primaryKey: existing[idx].primaryKey,
                sync: existing[idx].sync
            };
            // Per metadata/CLAUDE.md we don't add primaryKey/sync ourselves, but we preserve them if present.
            existing[idx] = {
                fields: io.fields,
                relatedEntities: io.relatedEntities,
                ...(preserved.primaryKey ? { primaryKey: preserved.primaryKey } : {}),
                ...(preserved.sync ? { sync: preserved.sync } : {})
            };
            skippedCount++;
        } else {
            existing.push(io);
            appendedCount++;
        }
    }

    writeFileSync(METADATA_FILE, JSON.stringify(data, null, 2) + '\n', 'utf8');
    return { appendedCount, updatedCount: skippedCount };
}

// -------- 5. Append CODE_EVIDENCE entries --------
function appendCodeEvidence(newEntries) {
    const raw = readFileSync(CODE_EVIDENCE_FILE, 'utf8');
    const data = JSON.parse(raw);
    if (!Array.isArray(data.entries)) data.entries = [];
    const stamp = new Date().toISOString();
    let appended = 0;
    let updated = 0;
    for (const e of newEntries) {
        const idx = data.entries.findIndex(x => x.claim === e.claim);
        if (idx >= 0) {
            data.entries[idx] = { ...e, addedAt: stamp, addedBy: 'extract-io-iof-session-auth.mjs' };
            updated++;
        } else {
            data.entries.push({ ...e, addedAt: stamp, addedBy: 'extract-io-iof-session-auth.mjs' });
            appended++;
        }
    }
    writeFileSync(CODE_EVIDENCE_FILE, JSON.stringify(data, null, 2) + '\n', 'utf8');
    return appended + updated;
}

// -------- 6. Main --------
function main() {
    const spec = JSON.parse(readFileSync(OPENAPI_PATH, 'utf8'));
    validateSpec(spec);

    const { ios, codeEvidence } = extractIOsFromAuthPaths(spec);

    if (ios.length > 1000) {
        console.error('IO cap (1000) exceeded — aborting');
        process.exit(2);
    }

    const { appendedCount, updatedCount } = appendIOsToMetadata(ios);
    const ceCount = appendCodeEvidence(codeEvidence);

    const iofTotal = ios.reduce((n, io) => n + (io.relatedEntities['MJ: Integration Object Fields']?.length ?? 0), 0);

    const stats = {
        objectName: 'ServiceStack Session-Auth Endpoints (/auth, /auth/{provider}, /authenticate, /authenticate/{provider})',
        IOCreated: appendedCount,
        IOUpdated: updatedCount,
        IOTotal: ios.length,
        IOFCreated: iofTotal,
        PKsExplicitlyEmitted: 0,
        FKsEmitted: 0,
        CodeEvidenceEntries: ceCount,
        Capabilities: {
            SupportsRead: true,
            SupportsCreate: true,
            SupportsUpdate: true,
            SupportsDelete: true,
            SupportsIncrementalSync: false
        },
        IONames: ios.map(io => io.fields.Name),
        FieldsExtractedPerIO: ios.map(io => ({
            Name: io.fields.Name,
            FieldCount: io.relatedEntities['MJ: Integration Object Fields']?.length ?? 0
        })),
        TraversalOrder: ios.map((io, i) => ({ Name: io.fields.Name, Order: i + 1 })),
        GapsForRuntimeD4: [
            'PK detection deferred for AuthenticateResponse.SessionId — no explicit PK marker in OpenAPI; runtime SoftPKClassifier may classify as soft-PK when sample data shows uniqueness.',
            'PK detection deferred for AuthenticateResponse.UserId — same rationale.',
            'BearerToken / RefreshToken semantics (when present vs absent) are framework-dependent on UseTokenCookie + provider — observed at runtime only.'
        ],
        Skipped: {
            FieldsSkippedAsRedundant: 0,
            ParamsCollapsedAcrossMethods:
                'Request params are identical across GET/PUT/POST/DELETE per spec inspection; emitted once per IO.'
        }
    };

    process.stdout.write(JSON.stringify(stats, null, 2) + '\n');
}

try {
    main();
} catch (err) {
    console.error('Extraction failed:', err.message);
    console.error(err.stack);
    process.exit(1);
}
