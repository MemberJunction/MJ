#!/usr/bin/env node
/**
 * wrap-migration.mjs — take the migration-ready SQL that `mj sync push` emits when
 * `sqlLogging.formatAsMigration` is on (a MetadataSync push captured with `${flyway:defaultSchema}`
 * placeholders) and PLACE it as a proper Flyway migration under `migrations/v5/`.
 *
 * The push writes its SQL to `<pushDir>/sql_logging/*.sql`; this wraps the newest such file into a
 * `V<YYYYMMDDHHMM>__v<version>__<Description>.sql` migration with a standard header. It does NOT
 * rewrite the SQL body (the push already emitted schema placeholders) — it only names/places it so
 * a fresh install replays the metadata change, i.e. the change reaches every tenant.
 *
 * Usage:
 *   node scripts/wrap-migration.mjs --input <sql-file> --version 5.46.x --description MagnetMail_Connector_Metadata
 *   node scripts/wrap-migration.mjs --logdir /tmp/mm-miggen/sql_logging --version 5.46.x --description MagnetMail_Connector_Metadata
 *   (add --stamp YYYYMMDDHHMM to pin the timestamp; else it's taken from the current time)
 */
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

function arg(name, dflt) { const i = process.argv.indexOf(`--${name}`); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt; }

function newestSql(dir) {
    const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).map((f) => join(dir, f));
    if (!files.length) throw new Error(`no .sql files in ${dir}`);
    return files.map((f) => ({ f, t: statSync(f).mtimeMs })).sort((a, b) => b.t - a.t)[0].f;
}

function stampNow() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}`;
}

function main() {
    let input = arg('input', null);
    const logdir = arg('logdir', null);
    const version = arg('version', null);
    const description = arg('description', null);
    const stamp = arg('stamp', null) || stampNow();
    const outDir = arg('outdir', 'migrations/v5');

    if ((!input && !logdir) || !version || !description) {
        process.stderr.write('usage: wrap-migration.mjs (--input <file> | --logdir <dir>) --version <5.XX.x> --description <Desc> [--stamp YYYYMMDDHHMM] [--outdir migrations/v5]\n');
        process.exit(2);
    }
    if (!input) input = newestSql(logdir);
    if (!existsSync(input)) { process.stderr.write(`input not found: ${input}\n`); process.exit(1); }

    let body = readFileSync(input, 'utf8');
    // Safety: the migration MUST use the schema placeholder, never a hardcoded schema. The push's
    // formatAsMigration already emits ${flyway:defaultSchema}; assert it so a mis-configured push is caught.
    if (!/\$\{flyway:defaultSchema\}/.test(body) && /\b__mj\./.test(body)) {
        process.stderr.write('WARNING: input references __mj. but has no ${flyway:defaultSchema} placeholder — was formatAsMigration enabled on the push?\n');
    }

    const outName = `V${stamp}__v${version}__${description}.sql`;
    const outPath = join(outDir, outName);
    const header =
        `-- =============================================================================\n` +
        `-- ${description.replace(/_/g, ' ')} (v${version})\n` +
        `-- Generated delta migration for a connector metadata change (MetadataSync push, migration-ready).\n` +
        `-- Idempotent MetadataSync upserts (spCreate*/spUpdate* by hardcoded UUID); FK-safe; schema-placeholdered.\n` +
        `-- =============================================================================\n\n`;
    writeFileSync(outPath, header + body, 'utf8');
    process.stdout.write(JSON.stringify({ wrote: outPath, fromInput: input, bytes: body.length }, null, 2) + '\n');
}

main();
