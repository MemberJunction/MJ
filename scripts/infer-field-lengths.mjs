#!/usr/bin/env node
/**
 * infer-field-lengths.mjs — give every string/prose/url IOF field in a connector's metadata an EXPLICIT
 * `Length`, so the schema builder emits a BOUNDED column instead of NVARCHAR(MAX). Publishing gate:
 * metadata whose string columns are unbounded ships MAX columns to every tenant (un-indexable, bloated).
 *
 * The length is inferred from the field NAME (semantic — a url is wider than a zip) with a type-aware
 * fallback, and is deliberately GENEROUS (err larger — a roomy bounded column beats a truncating tight
 * one, and both beat MAX). Idempotent + never-shrink: a field that already carries a Length is left as-is;
 * a re-run is a no-op. Only `string`/`char`/`text`/`nvarchar`/`url`-typed fields are touched.
 *
 * Usage:
 *   node scripts/infer-field-lengths.mjs --connector <name>   # metadata/integrations/<name>/.<name>.integration.json
 *   node scripts/infer-field-lengths.mjs --file <path>        # an explicit .integration.json
 *   node scripts/infer-field-lengths.mjs --connector <name> --dry-run   # report, write nothing
 */
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';

const STRING_TYPE = /^(string|char|nchar|varchar|nvarchar|text|url|uri|prose)$/i;

/** Ordered name→length rules (first match wins). Generous, bounded — never MAX. */
const NAME_RULES = [
    [/\b(url|uri|href|link|endpoint|callback|webhook|redirect)\b|url$|uri$/i, 2048],
    [/(description|details|detail|message|notes?|comment|body|content|summary|text|html|markdown|json|xml|payload|criteria|query|filter|expression)/i, 4000],
    [/(email|e[-_]?mail)/i, 320],
    [/(address|street|addr)/i, 512],
    [/(name|label|title|subject|company|organization|org|display)/i, 255],
    [/(id|code|key|token|guid|uuid|sku|slug|hash|reference|ref)$|^(id|code|key|token|guid|uuid)$/i, 255],
    [/(phone|fax|mobile|tel)/i, 64],
    [/(zip|postal|postcode)/i, 32],
    [/(state|province|region|country|currency|locale|language|timezone|tz)/i, 128],
    [/(status|type|kind|category|role|mode|format|gender|title)/i, 128],
    [/(first[_-]?name|last[_-]?name|middle[_-]?name|fname|lname)/i, 128],
    [/(city|county)/i, 128],
];

/** Type-aware default when no name rule matched. */
const TYPE_DEFAULT = 500;

function inferLength(name) {
    const n = String(name ?? '');
    for (const [re, len] of NAME_RULES) if (re.test(n)) return len;
    return TYPE_DEFAULT;
}

function resolvePath(argv) {
    const fileIx = argv.indexOf('--file');
    if (fileIx >= 0 && argv[fileIx + 1]) return argv[fileIx + 1];
    const connIx = argv.indexOf('--connector');
    if (connIx >= 0 && argv[connIx + 1]) {
        const c = argv[connIx + 1];
        return `metadata/integrations/${c}/.${c}.integration.json`;
    }
    return null;
}

function main() {
    const argv = process.argv.slice(2);
    const dryRun = argv.includes('--dry-run');
    const path = resolvePath(argv);
    if (!path) { process.stderr.write('usage: infer-field-lengths.mjs --connector <name> | --file <path> [--dry-run]\n'); process.exit(2); }
    if (!existsSync(path)) { process.stderr.write(`not found: ${path}\n`); process.exit(1); }

    const root = JSON.parse(readFileSync(path, 'utf8'));
    const records = Array.isArray(root) ? root : [root];
    let touched = 0, scanned = 0;
    const report = [];

    for (const rec of records) {
        const ios = (rec.relatedEntities && (rec.relatedEntities['MJ: Integration Objects'] || rec.relatedEntities['Integration Objects'])) || [];
        for (const io of ios) {
            const iofs = (io.relatedEntities && (io.relatedEntities['MJ: Integration Object Fields'] || io.relatedEntities['Integration Object Fields'])) || [];
            for (const iof of iofs) {
                const f = iof.fields; if (!f || !STRING_TYPE.test(String(f.Type ?? ''))) continue;
                scanned++;
                if (f.Length != null) continue;                 // never-shrink / idempotent
                const len = inferLength(f.Name);
                if (!dryRun) f.Length = len;
                touched++;
                if (report.length < 12) report.push(`${io.fields?.Name}.${f.Name} → ${len}`);
            }
        }
    }

    if (!dryRun && touched > 0) {
        copyFileSync(path, `${path}.lenbak`);
        writeFileSync(path, JSON.stringify(root, null, 2) + '\n', 'utf8');
    }
    process.stdout.write(JSON.stringify({ path, stringFieldsScanned: scanned, lengthsSet: touched, dryRun, sample: report }, null, 2) + '\n');
}

main();
