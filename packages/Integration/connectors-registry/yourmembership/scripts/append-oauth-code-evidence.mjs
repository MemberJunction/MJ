#!/usr/bin/env node
/**
 * append-oauth-code-evidence.mjs
 *
 * Appends per-flag CODE_EVIDENCE entries for the OAuthToken IO into
 * CODE_EVIDENCE.json. Idempotent on the `objectName + claim` pair.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const CE_PATH = resolve(__dirname, '../runs/connector-yourmembership-1780165237029-a495a1ea/output/CODE_EVIDENCE.json');

const ce = JSON.parse(readFileSync(CE_PATH, 'utf8'));
if (!Array.isArray(ce.entries)) throw new Error('CODE_EVIDENCE.json missing entries[]');

const objectName = 'OAuthToken';
const scriptPath = 'packages/Integration/connectors-registry/yourmembership/scripts/extract-io-iof-oauth.mjs';
const openapiPath = 'packages/Integration/connectors-registry/yourmembership/runs/connector-yourmembership-1780165237029-a495a1ea/output/openapi.snapshot.json';

const newEntries = [
  {
    objectName,
    claim: 'OAuthToken.APIPath = /OAuth/GetToken (primary canonical RFC 6749 endpoint; /OAuth/GetAccessToken and /OAuth/OIDC/GetAccessToken recorded in Configuration.alternateAPIPaths)',
    scriptPath,
    scriptInputs: [openapiPath],
    reproduction: {
      run: 'node packages/Integration/connectors-registry/yourmembership/scripts/extract-io-iof-oauth.mjs',
      verify: "jq '.object.APIPath, .object.Configuration.alternateAPIPaths' /tmp/ymextract/out.json",
    },
    expectedOutput: '"/OAuth/GetToken"\n["/OAuth/GetAccessToken", "/OAuth/OIDC/GetAccessToken"]',
    decisionLogic: 'OpenAPI exposes exactly three /OAuth/* paths under the OAuth tag. /OAuth/GetToken is the RFC 6749 standard-named endpoint, mirrored verbatim by /OAuth/OIDC/GetAccessToken; /OAuth/GetAccessToken is the legacy AppId/AppSecret form. Per the bijection contract, APIPath is set to the primary canonical path; the other two are recorded in Configuration.alternateAPIPaths so no surface is lost.',
  },
  {
    objectName,
    claim: 'OAuthToken.SupportsWrite = false; CreateAPIPath/UpdateAPIPath/DeleteAPIPath all null',
    scriptPath,
    scriptInputs: [openapiPath],
    reproduction: {
      run: 'node packages/Integration/connectors-registry/yourmembership/scripts/extract-io-iof-oauth.mjs',
      verify: "jq '.object | {SupportsWrite, CreateAPIPath, UpdateAPIPath, DeleteAPIPath, CreateMethod, UpdateMethod}' /tmp/ymextract/out.json",
    },
    expectedOutput: '{SupportsWrite: false, CreateAPIPath: null, UpdateAPIPath: null, DeleteAPIPath: null, CreateMethod: null, UpdateMethod: null}',
    decisionLogic: 'The three /OAuth/* paths expose ONLY POST. There is no GET/PUT/PATCH/DELETE counterpart that would represent CRUD on token records (token state is not addressable by ID — it is a one-shot exchange of credentials for a bearer). Therefore the IO is not a writable data resource: no Create/Update/Delete bijection slots apply.',
  },
  {
    objectName,
    claim: 'OAuthToken.SupportsPagination = false, PaginationType = None',
    scriptPath,
    scriptInputs: [openapiPath],
    reproduction: {
      run: 'node packages/Integration/connectors-registry/yourmembership/scripts/extract-io-iof-oauth.mjs',
      verify: "jq '.object | {SupportsPagination, PaginationType, ResponseDataKey}' /tmp/ymextract/out.json",
    },
    expectedOutput: '{SupportsPagination: false, PaginationType: "None", ResponseDataKey: null}',
    decisionLogic: 'No PageSize/PageNumber/limit/offset parameter is declared on any of the three OAuth endpoints (compare to the 112 Ams ops that DO declare PageSize+PageNumber per the Configuration evidence). The response is a single token bag, not a list.',
  },
  {
    objectName,
    claim: 'OAuthToken.SupportsIncrementalSync = false, IncrementalWatermarkField = null',
    scriptPath,
    scriptInputs: [openapiPath],
    reproduction: {
      run: 'node packages/Integration/connectors-registry/yourmembership/scripts/extract-io-iof-oauth.mjs',
      verify: "jq '.object | {SupportsIncrementalSync, IncrementalWatermarkField}' /tmp/ymextract/out.json",
    },
    expectedOutput: '{SupportsIncrementalSync: false, IncrementalWatermarkField: null}',
    decisionLogic: 'Token endpoints have no "list since" semantics — they return the current token. No vendor field marks last-modified. Per provable-only rule, leave NULL.',
  },
  {
    objectName,
    claim: 'No IOF has IsPrimaryKey=true (explicit-only rule honored)',
    scriptPath,
    scriptInputs: [openapiPath],
    reproduction: {
      run: 'node packages/Integration/connectors-registry/yourmembership/scripts/extract-io-iof-oauth.mjs',
      verify: "jq '[.fields[] | select(.IsPrimaryKey == true) | .Name]' /tmp/ymextract/out.json",
    },
    expectedOutput: '[]',
    decisionLogic: 'None of the 14 formData parameters across the three OAuth paths carry any "primary key", "unique identifier", "system ID" wording in their description, nor an x-primary-key extension. Per Gap 10, IsPrimaryKey is emitted only with explicit marker. None present → all false.',
  },
  {
    objectName,
    claim: 'No IOF has RelatedIntegrationObjectID set (no FK declarations on token endpoints)',
    scriptPath,
    scriptInputs: [openapiPath],
    reproduction: {
      run: 'node packages/Integration/connectors-registry/yourmembership/scripts/extract-io-iof-oauth.mjs',
      verify: "jq '[.fields[] | .Name + \":\" + (.Configuration.relatedObject // \"none\")]' /tmp/ymextract/out.json",
    },
    expectedOutput: 'All fields report "none"',
    decisionLogic: 'No formData parameter declares a $ref to another schema. No URL pattern implies a parent-child ordering. AppId/client_id are OAuth Client App identifiers but YM does not expose an "OAuth Client App" object whose PK these would reference (the OAuthClientApps* metadata operations exist but are not in our static catalog as a distinct IO yet). Therefore no FK emission.',
  },
  {
    objectName,
    claim: 'IsRequired aggregation rule: a field is required only if EVERY path declaring it marks it required',
    scriptPath,
    scriptInputs: [openapiPath],
    reproduction: {
      run: 'node packages/Integration/connectors-registry/yourmembership/scripts/extract-io-iof-oauth.mjs',
      verify: "jq '[.fields[] | {Name, IsRequired, paths: .Configuration.sourcePaths}]' /tmp/ymextract/out.json",
    },
    expectedOutput: 'grant_type appears on /OAuth/GetToken and /OAuth/OIDC/GetAccessToken with required=true on both → IsRequired=true. All other RFC 6749 lowercase fields have required=false on those two paths → IsRequired=false. All legacy /OAuth/GetAccessToken PascalCase fields have required=false → IsRequired=false.',
    decisionLogic: 'OpenAPI declares grant_type as required=true on both /OAuth/GetToken and /OAuth/OIDC/GetAccessToken (RFC 6749 mandates grant_type). The legacy GrantType (PascalCase) on /OAuth/GetAccessToken is declared required=false. Conservative aggregation: IsRequired only when ALL declaring paths agree. AllowsNull = !IsRequired.',
  },
  {
    objectName,
    claim: 'AppSecert field Status = Deprecated (explicit deprecation language in OpenAPI parameter description)',
    scriptPath,
    scriptInputs: [openapiPath],
    reproduction: {
      run: 'node packages/Integration/connectors-registry/yourmembership/scripts/extract-io-iof-oauth.mjs',
      verify: "jq '.fields[] | select(.Name == \"AppSecert\") | {Status, Description}' /tmp/ymextract/out.json",
    },
    expectedOutput: '{Status: "Deprecated", Description: "This key has been deprecated and will be removed in a future update. Please use the \"AppSecret\" key."}',
    decisionLogic: 'OpenAPI parameter description on AppSecert literally states "This key has been deprecated and will be removed in a future update." The IO summary also notes "the key AppSecert has been deprecated". Both surface levels confirm — Status=Deprecated is provable, not assumed.',
  },
  {
    objectName,
    claim: 'Set-completeness: all formData parameters across the three /OAuth/* POST operations are emitted (zero missing, zero extras)',
    scriptPath,
    scriptInputs: [openapiPath],
    reproduction: {
      run: 'node packages/Integration/connectors-registry/yourmembership/scripts/extract-io-iof-oauth.mjs',
      verify: 'Script throws if missing or extras detected — coverage check at end of script',
    },
    expectedOutput: '14 distinct field names: 7 PascalCase (legacy /OAuth/GetAccessToken: GrantType, AppId, AppSecert, Scope, Code, RefreshToken, AppSecret) + 7 lowercase (RFC 6749 /OAuth/GetToken + /OAuth/OIDC/GetAccessToken: grant_type, scope, code, refresh_token, redirect_uri, client_id, client_secret)',
    decisionLogic: 'Coverage assertion at the bottom of extract-io-iof-oauth.mjs: build expectedFieldNames Set from a fresh walk of doc.paths[p].post.parameters with in===formData, build emittedFieldNames from fields array, and throw on any divergence. Script exits 0 only when coverage is complete and exact.',
  },
];

// Idempotency: replace prior entries for objectName+claim, append the rest
for (const ne of newEntries) {
  const idx = ce.entries.findIndex((e) => e.objectName === ne.objectName && e.claim === ne.claim);
  if (idx >= 0) ce.entries[idx] = ne;
  else ce.entries.push(ne);
}

// Bump generatedAt
ce.generatedAt = new Date().toISOString();

writeFileSync(CE_PATH, JSON.stringify(ce, null, 2) + '\n', 'utf8');

process.stdout.write(JSON.stringify({
  CE_PATH,
  totalEntries: ce.entries.length,
  oauthTokenEntries: ce.entries.filter((e) => e.objectName === 'OAuthToken').length,
}, null, 2) + '\n');
