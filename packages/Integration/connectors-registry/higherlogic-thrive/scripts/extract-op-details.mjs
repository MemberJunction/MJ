#!/usr/bin/env node
// Parses every saved Higher Logic Community API v2.0 per-operation HelpPage into
// structured op-level detail: URI params, body model, TOP-LEVEL response model,
// nested field-type refs, field list, and the sample JSON envelope.
// Source: sources/ops/*.html (saved raw bytes).
//
// This is the enumeration script whose STDOUT feeds TaxonomyLeaves derivation --
// never a hand-typed list. Run: node extract-op-details.mjs <opsDir> <catalogJsonPath>

import fs from 'node:fs';
import path from 'node:path';

const opsDir = process.argv[2] || 'ops';
const catalogPath = process.argv[3] || 'helppage.catalog.json';

const decode = (s) =>
    s
        .replace(/&amp;/g, '&')
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');

const stripTags = (s) => decode(s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());

function extractSection(html, startMarker, endMarkers) {
    const start = html.indexOf(startMarker);
    if (start === -1) return '';
    let end = html.length;
    for (const marker of endMarkers) {
        const idx = html.indexOf(marker, start + startMarker.length);
        if (idx !== -1 && idx < end) end = idx;
    }
    return html.slice(start, end);
}

function parseParamTable(sectionHtml) {
    const params = [];
    const rowRe = /<tr>\s*<td class="parameter-name">([^<]*)<\/td>\s*<td class="parameter-documentation">\s*<p>([\s\S]*?)<\/p>\s*<\/td>\s*<td class="parameter-type">([\s\S]*?)<\/td>\s*<td class="parameter-annotations">([\s\S]*?)<\/td>\s*<\/tr>/g;
    let m;
    while ((m = rowRe.exec(sectionHtml))) {
        const [, name, doc, type, annotations] = m;
        params.push({
            name: decode(name.trim()),
            description: stripTags(doc),
            type: stripTags(type),
            annotations: stripTags(annotations),
        });
    }
    return params;
}

function parseNestedModelRefs(tableHtml) {
    // Refs to other ResourceModel types appearing WITHIN this table's field rows
    // (i.e. field types that are themselves complex sub-objects / collections thereof).
    const refs = [];
    const re = /(Collection of\s*)?<a href="\/Help\/ResourceModel\?modelName=([A-Za-z0-9]+)">([A-Za-z0-9]+)<\/a>/g;
    let m;
    while ((m = re.exec(tableHtml))) {
        refs.push({ isCollection: !!m[1], modelName: m[2] });
    }
    return refs;
}

function extractSampleJSON(html) {
    const idx = html.indexOf('Response Formats');
    if (idx === -1) return null;
    const rest = html.slice(idx);
    const preMatch = rest.match(/<pre class="wrapped">([\s\S]*?)<\/pre>/);
    if (!preMatch) return null;
    const raw = decode(preMatch[1]);
    try {
        return JSON.parse(raw);
    } catch {
        return { _unparsed: raw.slice(0, 2000) };
    }
}

function parseOpPage(html, meta) {
    const uriSection = extractSection(html, 'URI Parameters', ['Body Parameters']);
    const bodySection = extractSection(html, 'Body Parameters', ['Response Information', 'Resource Description']);
    const resourceDescIdx = html.indexOf('Resource Description');
    const tableStartIdx = resourceDescIdx === -1 ? -1 : html.indexOf('<table', resourceDescIdx);
    const responseFormatsIdx = html.indexOf('Response Formats', resourceDescIdx === -1 ? 0 : resourceDescIdx);

    const uriParams = parseParamTable(uriSection);
    const bodyModelRefs = parseNestedModelRefs(bodySection);

    // Text between "Resource Description" heading and the <table> tag carries the
    // TOP-LEVEL model name link for this operation's response (e.g. "Contact" or
    // "Collection of DiscussionPost"). Absent for void/primitive responses.
    let topLevelModel = null;
    if (resourceDescIdx !== -1 && tableStartIdx !== -1) {
        const preTableHtml = html.slice(resourceDescIdx, tableStartIdx);
        const refs = parseNestedModelRefs(preTableHtml);
        if (refs.length > 0) topLevelModel = refs[0];
    }

    // Field rows within the table describe nested/sub-object types (FKs / embedded children).
    const tableHtml = tableStartIdx !== -1 ? html.slice(tableStartIdx, responseFormatsIdx === -1 ? undefined : responseFormatsIdx) : '';
    const nestedFieldModelRefs = parseNestedModelRefs(tableHtml).filter(
        (r) => !topLevelModel || r.modelName !== topLevelModel.modelName
    );
    const responseFields = parseParamTable(tableHtml);
    const sample = extractSampleJSON(html);

    return {
        ...meta,
        uriParams,
        bodyModelRefs,
        topLevelResponseModel: topLevelModel ? { modelName: topLevelModel.modelName, isCollection: topLevelModel.isCollection } : null,
        nestedFieldModelRefs,
        responseFieldCount: responseFields.length,
        responseFields,
        sampleKeys: sample && typeof sample === 'object' && !Array.isArray(sample) ? Object.keys(sample) : (Array.isArray(sample) ? '<array>' : null),
    };
}

const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
const results = [];
let missing = 0;

for (const [controller, ops] of Object.entries(catalog)) {
    for (const op of ops) {
        const slug = op.helpUrl.split('/Help/Api/')[1];
        const filePath = path.join(opsDir, `${slug}.html`);
        if (!fs.existsSync(filePath)) {
            missing++;
            results.push({ controller, method: op.method, path: op.path, description: op.description, helpUrl: op.helpUrl, fetchStatus: 'missing' });
            continue;
        }
        const html = fs.readFileSync(filePath, 'utf8');
        if (html.length < 500) {
            missing++;
            results.push({ controller, method: op.method, path: op.path, description: op.description, helpUrl: op.helpUrl, fetchStatus: 'vendor-error-page' });
            continue;
        }
        const detail = parseOpPage(html, { controller, method: op.method, path: op.path, description: op.description, helpUrl: op.helpUrl, fetchStatus: 'ok' });
        results.push(detail);
    }
}

fs.writeFileSync('op-details.json', JSON.stringify(results, null, 2));

const topLevelModels = [...new Set(results.filter(r => r.topLevelResponseModel).map(r => r.topLevelResponseModel.modelName))].sort();
const nestedOnlyModels = [...new Set(results.flatMap(r => (r.nestedFieldModelRefs || []).map(x => x.modelName)))]
    .filter(m => !topLevelModels.includes(m))
    .sort();

const summary = {
    totalOps: results.length,
    okOps: results.filter(r => r.fetchStatus === 'ok').length,
    missingOrErrorOps: missing,
    topLevelModelCount: topLevelModels.length,
    topLevelModels,
    nestedOnlyModelCount: nestedOnlyModels.length,
    nestedOnlyModels,
};
fs.writeFileSync('op-details.summary.json', JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
