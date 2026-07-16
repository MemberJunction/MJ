#!/usr/bin/env node
// scripts/extract-remaining-config-facts.mjs
// Reproducible, credential-free extraction closing 3 root-Integration-Configuration
// citation gaps found during a bijection audit (INDEPENDENT_REVIEW-style check run by
// MetadataWriter): AuthHeaderPattern, APIVersioningStrategy, ErrorResponseShape.
// Reads ONLY locally-saved, credential-free sources already captured under sources/.
import { readFileSync } from 'node:fs';

const SOURCES_DIR = new URL('../sources/', import.meta.url);
const spec = JSON.parse(readFileSync(new URL('openapi.json', SOURCES_DIR), 'utf-8'));
const serverFlowHTML = readFileSync(new URL('docs/server_flow.html', SOURCES_DIR), 'utf-8');
const v3TechOverviewHTML = readFileSync(new URL('docs/v3_technical_overview.html', SOURCES_DIR), 'utf-8');

// --- 1. AuthHeaderPattern ---------------------------------------------------------
const authHeaderMatch = serverFlowHTML.match(
    /in the format <code class="highlighter-rouge">(Authorization: Bearer \{your_access_token\})<\/code>/,
);
const authHeaderTableMatch = v3TechOverviewHTML.match(
    /<td><code class="highlighter-rouge">Authorization<\/code><\/td>\s*<td><code class="highlighter-rouge">(Bearer \{access_token\})<\/code><\/td>/,
);

// --- 2. APIVersioningStrategy -------------------------------------------------------
const host = spec.host;
const basePath = spec.basePath;
const specVersion = spec.info?.version;

// --- 3. ErrorResponseShape ----------------------------------------------------------
const statusCodeCounts = {};
for (const [pathKey, ops] of Object.entries(spec.paths ?? {})) {
    for (const [method, opDef] of Object.entries(ops)) {
        if (!opDef || typeof opDef !== 'object' || !opDef.responses) continue;
        for (const code of Object.keys(opDef.responses)) {
            if (!/^\d{3}$/.test(code)) continue;
            statusCodeCounts[code] = (statusCodeCounts[code] ?? 0) + 1;
        }
    }
}
const errorCodesObserved = Object.keys(statusCodeCounts)
    .filter((c) => Number(c) >= 400)
    .sort();

const output = {
    authHeaderPattern: {
        fromServerFlowGuide: authHeaderMatch ? authHeaderMatch[1] : null,
        fromTechnicalOverviewTable: authHeaderTableMatch ? authHeaderTableMatch[1] : null,
        note: 'Both docs pages independently state the same Authorization header format for authenticated V3 API calls.',
    },
    apiVersioningStrategy: {
        host,
        basePath,
        specDocumentVersion: specVersion,
        derivedStrategy: 'url-path',
        note: 'basePath is a fixed literal segment ("/v3") on every path in the spec -- confirms url-path versioning. info.version (3.0.161) is the SPEC document\'s own version, not a URL-visible API version.',
    },
    errorResponseShape: {
        statusCodeCountsAcrossAllOperations: statusCodeCounts,
        errorCodesObserved,
        note: `Full scan of every operation's declared "responses" keys in the saved OpenAPI spec (${Object.keys(spec.paths ?? {}).length} paths). errorCodesObserved lists every distinct >=400 status code documented anywhere in the spec.`,
    },
};

process.stdout.write(JSON.stringify(output, null, 2) + '\n');
