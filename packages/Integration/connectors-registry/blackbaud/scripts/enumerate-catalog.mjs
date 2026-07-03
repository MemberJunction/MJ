#!/usr/bin/env node
// enumerate-catalog.mjs
// Programmatically scans saved raw Microsoft-connector-derived source files (themselves
// generated from Blackbaud's SKY API operation/definition metadata) to enumerate:
//   1. The record-bearing "Definitions" (object types) per source family -> record types
//   2. The requested product-family taxonomy leaves, matched against the definitions found
//
// This is the deterministic enumerator whose STDOUT is TaxonomyLeaves - never hand-typed.
//
// Usage: node enumerate-catalog.mjs <sources-dir>

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const sourcesDir = process.argv[2] || './sources';

const files = readdirSync(sourcesDir).filter(f => f.endsWith('.md'));

/**
 * Parse a Microsoft-connector-derived markdown reference file.
 * Extracts:
 *   - Action operation IDs (from "## Actions" table or "### <Name>" + "Operation ID:" blocks)
 *   - Definition type names (from "### <Namespace>.<TypeName>" headers under "## Definitions")
 */
function parseConnectorFile(text, fileName) {
    const operations = new Set();
    const definitions = new Set();

    // Operation IDs: lines like "- Operation ID:\n    - CreateGift" or table rows
    const opIdRegex = /Operation ID:\s*\n\s*-\s*([A-Za-z][A-Za-z0-9]*)/g;
    let m;
    while ((m = opIdRegex.exec(text)) !== null) {
        operations.add(m[1]);
    }
    // Also catch "| Operation ID | Description |" style tables used in our saved raw notes
    const tableOpRegex = /^\|\s*([A-Z][A-Za-z0-9]*)\s*\|\s*[^|]+\|\s*$/gm;
    while ((m = tableOpRegex.exec(text)) !== null) {
        // filter obvious header/separator rows
        if (m[1] !== 'Operation' && m[1] !== 'Name') operations.add(m[1]);
    }

    // Definitions: "### Namespace.TypeName" headers (only under a Definitions section, but we
    // accept any since our files are single-purpose per connector)
    const defRegex = /^###\s+([A-Za-z0-9]+\.[A-Za-z0-9]+)\s*$/gm;
    while ((m = defRegex.exec(text)) !== null) {
        definitions.add(m[1]);
    }

    return { fileName, operations: [...operations].sort(), definitions: [...definitions].sort() };
}

const perFile = [];
for (const f of files) {
    const text = readFileSync(join(sourcesDir, f), 'utf8');
    perFile.push(parseConnectorFile(text, f));
}

// Union of all record-bearing definition types across all parsed sources = the enumerated
// universe of record types this evidence base can prove. Definitions ending in common
// non-record suffixes (Collection wrappers, "Created*" ack objects) are still counted as
// distinct schema types found in the source (they ARE emitted types in the connector schema)
// but flagged separately as non-primary (ack/collection wrapper) so the taxonomy-leaf mapping
// below can fold them correctly.
const allDefinitions = new Set();
const allOperations = new Set();
for (const pf of perFile) {
    pf.definitions.forEach(d => allDefinitions.add(d));
    pf.operations.forEach(o => allOperations.add(o));
}

// Classify definitions
function classify(defName) {
    const typeName = defName.split('.')[1] || defName;
    if (/^ApiCollectionOf/.test(typeName)) return 'collection-wrapper';
    if (/^Created[A-Z]/.test(typeName)) return 'create-ack';
    return 'record-type';
}

const classified = [...allDefinitions].map(d => ({ name: d, class: classify(d) }));
const recordTypes = classified.filter(d => d.class === 'record-type').map(d => d.name);
const collectionWrappers = classified.filter(d => d.class === 'collection-wrapper').map(d => d.name);
const createAcks = classified.filter(d => d.class === 'create-ack').map(d => d.name);

// -----------------------------------------------------------------------------------------
// Requested taxonomy leaves -> match against parsed record types (case/word-boundary aware)
// -----------------------------------------------------------------------------------------
const requestedTaxonomy = [
    'constituents', 'addresses', 'phones', 'emails', 'notes', 'gifts', 'gift-aid',
    'gift-batches', 'gift-splits', 'gift-fundraisers', 'soft-credits', 'fundraising-hierarchies',
    'campaigns', 'funds', 'appeals', 'opportunities', 'opportunity-fundraisers',
    'opportunity-attachments', 'opportunity-custom-fields', 'prospects'
];

// Map each requested taxonomy slug -> the record-type names (from the union) that satisfy it.
// This mapping is DERIVED by keyword-matching against the parsed record-type name strings —
// not hand-picked from memory. Keywords are the taxonomy slug's own words.
function slugToKeywords(slug) {
    return slug.split('-'); // e.g. "gift-fundraisers" -> ["gift","fundraisers"]
}

const taxonomyMatches = {};
for (const slug of requestedTaxonomy) {
    const kws = slugToKeywords(slug).map(k => k.replace(/s$/, '')); // naive singularize
    const matches = recordTypes.filter(rt => {
        const lower = rt.toLowerCase();
        return kws.every(kw => lower.includes(kw));
    });
    taxonomyMatches[slug] = matches;
}

const output = {
    sourcesScanned: perFile.map(pf => ({ file: pf.fileName, operationCount: pf.operations.length, definitionCount: pf.definitions.length })),
    totalOperationsUnion: allOperations.size,
    totalDefinitionsUnion: allDefinitions.size,
    recordTypes: recordTypes.sort(),
    recordTypeCount: recordTypes.length,
    collectionWrappers: collectionWrappers.sort(),
    collectionWrapperCount: collectionWrappers.length,
    createAcks: createAcks.sort(),
    createAckCount: createAcks.length,
    requestedTaxonomySlugCount: requestedTaxonomy.length,
    taxonomyMatches
};

process.stdout.write(JSON.stringify(output, null, 2) + '\n');
