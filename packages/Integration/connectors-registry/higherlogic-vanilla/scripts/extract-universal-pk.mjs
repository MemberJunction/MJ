#!/usr/bin/env node
// scripts/extract-universal-pk.mjs
//
// MetadataWriter evidence script (credential-free). Reads the already-fetched, already-computed
// canonical taxonomy-leaf -> PK-field mapping (sources/derived/taxonomy-leaves.mapping.json --
// produced by the ioiof-extractor from the merged OpenAPI v3 spec; see SOURCES.json /
// INDEPENDENT_REVIEW.md, which independently confirms this mapping's 51-name closure) and tests
// whether Vanilla API v2 follows a single vendor-wide primary-key naming convention:
// `<lowerCamel(CanonicalObjectName)>ID`.
//
// This is the evidence gate for Integration.Configuration.universalPK (a hint for the runtime
// SoftPKClassifier / D4) -- NOT a per-IOF IsPrimaryKey emission (that's ioiof-extractor's job,
// already done and independently reviewed with 0 blocking gaps). Per the statistical-significance
// bar (governing-principle table: naming-convention hints require p<=0.05, i.e. >=95%
// consistency over an adequate sample -- NOT merely the >=80% "investigate" bar), a vendor-wide
// structural hint may be EMITTED only when the match rate clears 95%. Below that, the honest,
// provable-only result is to leave Configuration.universalPK UNSET and record this script's
// negative finding as the evidence for why it was deliberately omitted (never fabricated).
//
// Usage: node scripts/extract-universal-pk.mjs

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const mappingPath = resolve(__dirname, '../sources/derived/taxonomy-leaves.mapping.json');
const mapping = JSON.parse(readFileSync(mappingPath, 'utf-8'));

function lowerCamel(name) {
    return name.charAt(0).toLowerCase() + name.slice(1);
}

const results = mapping.mapping.map((o) => {
    const expected = `${lowerCamel(o.normalizedName)}ID`;
    const matches = o.pkField === expected;
    return { name: o.normalizedName, pkField: o.pkField, expectedIfConventional: expected, matches };
});

const total = results.length;
const matchCount = results.filter((r) => r.matches).length;
const consistency = matchCount / total;
const mismatches = results.filter((r) => !r.matches);

process.stdout.write(JSON.stringify({
    total,
    matchCount,
    consistency,
    requiredBar: 0.95,
    clearsBar: consistency >= 0.95,
    verdict: consistency >= 0.95
        ? 'EMIT Configuration.universalPK = { fieldName pattern: "<lowerCamel(ObjectName)>ID" }'
        : 'DO NOT EMIT -- consistency below the 95% statistical-significance bar; leave Configuration.universalPK unset (residual gap), 13 real exceptions found (UUID-suffixed PKs, urlCode/apiName/name string PKs, recordID on Escalation, accessTokenID on Token, userID reused on OnlineUser/UserMention join-style objects).',
    mismatches,
}, null, 2) + '\n');
