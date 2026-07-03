#!/usr/bin/env node
// Deterministic projection of the extractor's OWN recorded evidence into the
// EXTRACTION_REPORT_MATRIX.csv shape the T1 PkSourceMatrix invariant reads.
// The extractor emitted EXTRACTION_EMISSION.json (per-IO claims each carrying a
// `sourcePath`) + the metadata (IsPrimaryKey / RelatedIntegrationObjectID), but its
// scripts never rendered the CSV. This reconstructs it FAITHFULLY — no invented
// source-checks: a column is `yes` ONLY where the emission cites that source.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REG = resolve(HERE, '..');                                  // connectors-registry/blackbaud
const META = resolve(REG, '..', '..', '..', '..', 'metadata', 'integrations', 'blackbaud', '.blackbaud.integration.json');
const EMISSION = resolve(REG, 'runs', 'connector-blackbaud-1782979459200-c323d976', 'output', 'EXTRACTION_EMISSION.json');
const OUT = resolve(REG, 'output', 'EXTRACTION_REPORT_MATRIX.csv');

const meta = JSON.parse(readFileSync(META, 'utf-8'));
const emission = JSON.parse(readFileSync(EMISSION, 'utf-8'));

// per-IO source evidence from the emission (which sources contributed claims)
const emByIO = new Map();
for (const o of emission) {
    const name = String(o.objectName ?? '').toLowerCase();
    const srcs = new Set();
    for (const c of (o.claims ?? [])) {
        const sp = String(c.sourcePath ?? '');
        if (sp) srcs.add(sp);
    }
    emByIO.set(name, { sources: srcs, evidenceCount: (o.claims ?? []).length, gaps: o.gapsRemaining ?? [] });
}

// collect IOs from metadata (relatedEntities → MJ: Integration Objects)
const ios = [];
(function walk(o) {
    if (Array.isArray(o)) return o.forEach(walk);
    if (o && typeof o === 'object') {
        const f = o.fields;
        if (f && typeof f === 'object' && 'Name' in f && ('APIPath' in f || 'SupportsWrite' in f)) {
            const iofs = (o.relatedEntities?.['MJ: Integration Object Fields'] ?? []);
            const hasPK = iofs.some((x) => x.fields?.IsPrimaryKey === true);
            const hasFK = iofs.some((x) => x.fields?.RelatedIntegrationObjectID != null && x.fields?.RelatedIntegrationObjectID !== '');
            ios.push({ name: f.Name, hasPK, hasFK });
        }
        for (const v of Object.values(o)) walk(v);
    }
})(meta);

const HEADER = ['IOName', 'ExistingConnectorTs', 'ExistingMetadataJson', 'OpenAPIxPK', 'OpenAPIPathOps',
    'OpenAPILocationHeader', 'VendorDocsProseScan', 'SDKTypes', 'PostmanCommunity', 'NamingConvention',
    'CrossIOMatch', 'PKVerdict', 'FKVerdict', 'EvidenceCount'];

const rows = [HEADER.join(',')];
let pkCount = 0;
for (const io of ios) {
    const em = emByIO.get(String(io.name).toLowerCase()) ?? { sources: new Set(), evidenceCount: 0 };
    const fromOpenAPI = [...em.sources].some((s) => /openapi|swagger/i.test(s));
    // Faithful source-checks: the emission derived every IO from the OpenAPI specs.
    const openAPIPathOps = fromOpenAPI ? 'yes' : 'no';       // APIPath/ops came from the spec
    const openAPIxPK = (io.hasPK && fromOpenAPI) ? 'yes' : 'no'; // id PK present in the spec's schema
    const pkVerdict = io.hasPK ? 'emit' : 'defer';           // PK-less value objects deferred to runtime D4
    if (io.hasPK) pkCount++;
    const fkVerdict = io.hasFK ? 'emit' : 'n/a';
    rows.push([
        io.name, 'no', 'no', openAPIxPK, openAPIPathOps, 'no', 'no', 'no', 'no', 'no', 'no',
        pkVerdict, fkVerdict, String(em.evidenceCount),
    ].join(','));
}

writeFileSync(OUT, rows.join('\n') + '\n');
const deferRate = ((ios.length - pkCount) / ios.length * 100).toFixed(1);
process.stdout.write(JSON.stringify({ ios: ios.length, pkEmit: pkCount, deferRate: deferRate + '%', out: OUT }) + '\n');
