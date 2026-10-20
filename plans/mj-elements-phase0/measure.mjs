#!/usr/bin/env node
/**
 * Reads each bundle's esbuild metafile (bundles/<element>/meta.json) and reports, per element:
 *   - every output file's raw and gzip size (source maps excluded), split into the entry the page pays on load
 *     and everything fetched on demand;
 *   - where the bundled bytes come from, by summing esbuild's `bytesInOutput` per input and grouping inputs by
 *     package: `@angular/*`, `@memberjunction/*` (workspace packages appear as `../<Package>/dist/...` paths in
 *     an in-repo build, not under node_modules), zone.js, Font Awesome, the element's own code, other third party;
 *   - Font Awesome's inlined woff2, which the metafile cannot see (it is a base64 string inside a compiled
 *     stylesheet), measured by scanning the outputs for `data:font/woff2;base64,`;
 *   - the packages two or more elements both carry, which is the "how much is shared" number of Phase 0 item 2.
 *
 * Run `node sync-bundles.mjs` first. Writes sizes.json and prints Markdown tables to paste into FINDINGS.md.
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(here, 'bundles/manifest.json'), 'utf8'));
const FA_MARK = 'data:font/woff2;base64,';

/** Names the package an esbuild input path came from. */
function packageOf(input) {
    const fromNodeModules = input.match(/node_modules\/(@[^/]+\/[^/]+|[^@][^/]*)/g);
    if (fromNodeModules) return fromNodeModules[fromNodeModules.length - 1].replace('node_modules/', '');
    if (/^dist\//.test(input) || /^src\//.test(input)) return '(own)';
    const workspace = input.match(/^(?:\.\.\/)+(.*?)\/(dist|src)\//);
    return workspace ? `@memberjunction/(workspace) ${workspace[1]}` : `(other) ${input}`;
}
function bucketOf(pkg) {
    if (pkg === 'zone.js') return 'zone.js';
    if (pkg.startsWith('@angular/')) return '@angular/*';
    if (pkg.startsWith('@fortawesome/')) return 'Font Awesome';
    if (pkg.startsWith('@memberjunction/') || pkg.startsWith('@mj-biz-apps/')) return '@memberjunction/*';
    if (pkg === '(own)') return 'own code';
    return 'other third party';
}

const report = [];
for (const element of manifest.elements) {
    const name = element.variant ? `<${element.tag}> (${element.variant})` : `<${element.tag}>`;
    if (!element.entry) {
        report.push({ name, tag: element.tag, variant: element.variant, status: `needs bundle from ${element.repo}` });
        continue;
    }
    if (!element.metafile) {
        // A bundle without a metafile still gets raw and gzip sizes; attribution needs the metafile (README.md).
        const folder = join(here, 'bundles', element.folder);
        const outputs = listFiles(folder).filter((f) => f.endsWith('.js')).map((f) => { const bytes = readFileSync(join(folder, f)); return { file: f, raw: bytes.length, gzip: gzipSync(bytes, { level: 9 }).length, entry: f === element.entry.split('/').pop() }; }).sort((a, b) => b.raw - a.raw);
        const entry = outputs.find((o) => o.entry);
        const rest = outputs.filter((o) => o !== entry);
        report.push({ name, tag: element.tag, variant: element.variant, status: 'measured (no metafile: sizes only)', files: outputs.length, entry: entry ? { file: entry.file, raw: entry.raw, gzip: entry.gzip } : null, onDemand: { files: rest.length, raw: sum(rest, 'raw'), gzip: sum(rest, 'gzip') }, total: { raw: sum(outputs, 'raw'), gzip: sum(outputs, 'gzip') }, attribution: {}, fontAwesomeInlineBytes: 0, packages: {}, largest: outputs.slice(0, 8) });
        continue;
    }
    const folder = join(here, 'bundles', element.folder);
    const json = JSON.parse(readFileSync(join(here, element.metafile), 'utf8'));
    // The realtime widget writes { shell, session } (two esbuild runs); plain esbuild writes one metafile.
    const metafiles = 'outputs' in json ? [json] : Object.values(json);
    const outputs = [];
    const packages = {};
    let fontAwesomeInline = 0;
    for (const metafile of metafiles) {
        for (const [outPath, info] of Object.entries(metafile.outputs)) {
            if (outPath.endsWith('.map')) continue;
            const file = fileInFolder(outPath, folder);
            if (!file) continue;
            const bytes = readFileSync(join(folder, file));
            const text = bytes.toString('latin1');
            let inlined = 0;
            for (const piece of text.split(FA_MARK).slice(1)) inlined += FA_MARK.length + piece.indexOf(')');
            fontAwesomeInline += inlined;
            outputs.push({ file, raw: bytes.length, gzip: gzipSync(bytes, { level: 9 }).length, entry: Boolean(info.entryPoint), fontAwesomeInlineBytes: inlined });
            for (const [input, { bytesInOutput }] of Object.entries(info.inputs)) {
                const pkg = packageOf(input);
                packages[pkg] = (packages[pkg] ?? 0) + bytesInOutput;
            }
        }
    }
    outputs.sort((a, b) => b.raw - a.raw);
    const entryFile = element.entry.split('/').pop();
    const entry = outputs.find((o) => o.file === entryFile);
    const rest = outputs.filter((o) => o !== entry);
    const total = sum(outputs, 'raw');
    const buckets = {};
    for (const [pkg, bytes] of Object.entries(packages)) {
        const bucket = bucketOf(pkg);
        buckets[bucket] = (buckets[bucket] ?? 0) + bytes;
    }
    buckets['Font Awesome'] = (buckets['Font Awesome'] ?? 0) + fontAwesomeInline;
    report.push({
        name,
        tag: element.tag,
        variant: element.variant,
        status: 'measured',
        files: outputs.length,
        entry: entry ? { file: entry.file, raw: entry.raw, gzip: entry.gzip } : null,
        onDemand: { files: rest.length, raw: sum(rest, 'raw'), gzip: sum(rest, 'gzip') },
        total: { raw: total, gzip: sum(outputs, 'gzip') },
        attribution: Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, { bytes: v, share: total ? v / total : 0 }])),
        fontAwesomeInlineBytes: fontAwesomeInline,
        packages: Object.fromEntries(Object.entries(packages).sort((a, b) => b[1] - a[1])),
        largest: outputs.slice(0, 8),
    });
}

// Packages carried by more than one element (the published variants only, so a keep-names rebuild does not count as a second element).
const measured = report.filter((r) => r.status === 'measured' && !r.variant);
const anyMeasured = report.filter((r) => r.status.startsWith('measured'));
const shared = {};
for (const r of measured) {
    for (const [pkg, bytes] of Object.entries(r.packages)) {
        if (pkg === '(own)') continue;
        (shared[pkg] ??= {})[r.name] = bytes;
    }
}
const overlap = Object.entries(shared)
    .filter(([, by]) => Object.keys(by).length > 1)
    .map(([pkg, by]) => ({ pkg, elements: Object.keys(by), bytesEach: by, duplicatedBytes: Object.values(by).sort((a, b) => a - b).slice(0, -1).reduce((a, b) => a + b, 0) }))
    .sort((a, b) => b.duplicatedBytes - a.duplicatedBytes);
writeFileSync(join(here, 'sizes.json'), JSON.stringify({ generatedAt: new Date().toISOString(), elements: report, overlap }, null, 2));

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
const pct = (n) => `${(n * 100).toFixed(1)}%`;
const order = ['@angular/*', '@memberjunction/*', 'zone.js', 'Font Awesome', 'own code', 'other third party'];
console.log(`| Element | Files | Entry, raw / gzip | On demand, raw / gzip | Total, raw / gzip | ${order.join(' | ')} |`);
console.log(`|---|---|---|---|---|${order.map(() => '---').join('|')}|`);
for (const r of report) {
    if (!r.status.startsWith('measured')) {
        console.log(`| \`${r.name}\` | ${r.status} | | | | ${order.map(() => '').join(' | ')} |`);
        continue;
    }
    const cells = order.map((k) => (r.attribution[k] ? `${pct(r.attribution[k].share)} (${kb(r.attribution[k].bytes)})` : Object.keys(r.attribution).length ? '0' : 'no metafile'));
    console.log(`| \`${r.name}\` | ${r.files} | ${kb(r.entry.raw)} / ${kb(r.entry.gzip)} | ${kb(r.onDemand.raw)} / ${kb(r.onDemand.gzip)} | ${kb(r.total.raw)} / ${kb(r.total.gzip)} | ${cells.join(' | ')} |`);
}
console.log('\nShares are of raw (minified, pre-gzip) bytes, from esbuild `bytesInOutput`. Font Awesome includes the inlined woff2 the metafile cannot attribute.');
console.log('\n| Package carried by more than one element | Elements | Bytes in each | Duplicated bytes |');
console.log('|---|---|---|---|');
for (const o of overlap.slice(0, 15)) {
    console.log(`| \`${o.pkg}\` | ${o.elements.length} | ${o.elements.map((e) => `${e}: ${kb(o.bytesEach[e])}`).join('; ')} | ${kb(o.duplicatedBytes)} |`);
}
const totalDup = overlap.reduce((n, o) => n + o.duplicatedBytes, 0);
console.log(`\nDuplicated across the ${measured.length} measured elements: ${kb(totalDup)} raw (bytes the page downloads more than once, before gzip).`);
console.log('\nLargest files per element:');
for (const r of anyMeasured) {
    console.log(`\n${r.name}`);
    for (const o of r.largest) console.log(`  ${o.file.padEnd(56)} ${kb(o.raw).padStart(10)} raw ${kb(o.gzip).padStart(10)} gzip${o.entry ? '  (entry)' : ''}`);
    console.log('  top packages: ' + Object.entries(r.packages).slice(0, 8).map(([p, b]) => `${p} ${kb(b)}`).join(', '));
}

function listFiles(dir, prefix = '') {
    const result = [];
    for (const name of readdirSync(join(dir, prefix))) {
        const rel = prefix ? `${prefix}/${name}` : name;
        if (statSync(join(dir, rel)).isDirectory()) result.push(...listFiles(dir, rel));
        else result.push(rel);
    }
    return result;
}
function fileInFolder(outPath, folder) {
    const parts = outPath.split('/');
    for (let i = 0; i < parts.length; i++) {
        const candidate = parts.slice(i).join('/');
        if (existsSync(join(folder, candidate)) && statSync(join(folder, candidate)).isFile()) return candidate;
    }
    return null;
}
function sum(rows, key) {
    return rows.reduce((n, r) => n + r[key], 0);
}
