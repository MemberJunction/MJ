#!/usr/bin/env node
/**
 * build-pg-migrations.mjs — produce the PostgreSQL variant of a SQL-Server migration by delegating to
 * the repo's proven SS→PG conversion pipeline (`scripts/pgdiff-convert-ast.mjs`, which drives
 * `@memberjunction/sql-converter` + the bundled transpiler). Author migrations once in T-SQL under
 * `migrations/v5/`; this emits the PG equivalent so a Postgres install replays the same metadata change.
 *
 * Thin wrapper on purpose: the transpile logic (sqlglot-backed AST conversion, keep/drop split, reseed
 * handling) already lives in the pipeline — this just points it at ONE new migration (or a dir) and
 * writes the PG output beside it, so a connector's `wrap-migration.mjs` output gets a PG sibling.
 *
 * Usage:
 *   node scripts/build-pg-migrations.mjs --input migrations/v5/V..__MagnetMail_Connector_Metadata.sql
 *   node scripts/build-pg-migrations.mjs --srcdir migrations/v5 --outdir migrations/v5/.pg   # whole dir
 */
import { existsSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { dirname, basename, join } from 'node:path';
import { execFileSync } from 'node:child_process';

function arg(name, dflt) { const i = process.argv.indexOf(`--${name}`); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt; }

function main() {
    const input = arg('input', null);
    let srcdir = arg('srcdir', null);
    const outdir = arg('outdir', srcdir ? join(srcdir, '.pg') : (input ? join(dirname(input), '.pg') : null));
    if (!input && !srcdir) { process.stderr.write('usage: build-pg-migrations.mjs (--input <sql> | --srcdir <dir>) [--outdir <dir>]\n'); process.exit(2); }

    // The pipeline converts a DIRECTORY; for a single --input, stage it into a temp src dir so we
    // convert exactly that one file (avoids re-transpiling the whole v5 history).
    let convertSrc = srcdir, temp = null;
    if (input) {
        if (!existsSync(input)) { process.stderr.write(`input not found: ${input}\n`); process.exit(1); }
        temp = join(dirname(input), `.pgstage_${basename(input, '.sql')}`);
        rmSync(temp, { recursive: true, force: true }); mkdirSync(temp, { recursive: true });
        copyFileSync(input, join(temp, basename(input)));
        convertSrc = temp;
    }
    mkdirSync(outdir, { recursive: true });
    try {
        const out = execFileSync('node', ['scripts/pgdiff-convert-ast.mjs', convertSrc, outdir], { encoding: 'utf8' });
        process.stdout.write(out);
        process.stdout.write(JSON.stringify({ pgOutDir: outdir, from: input ?? srcdir }, null, 2) + '\n');
    } finally {
        if (temp) rmSync(temp, { recursive: true, force: true });
    }
}

main();
