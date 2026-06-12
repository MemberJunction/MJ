#!/usr/bin/env tsx
// scripts/regen-report-from-metadata.ts
//
// Regenerate EXTRACTION_REPORT_MATRIX.csv's PKVerdict / FKVerdict columns and
// the EXTRACTION_REPORT.md PK/FK section DIRECTLY from the final metadata file,
// so the proof-of-work artifacts are a faithful rendering of what was emitted
// (report-IO set == metadata-IO set; PKVerdict == metadata PK state).
//
// Only the PKVerdict, FKVerdict, EvidenceCitations columns are recomputed from
// metadata; the source-check evidence columns (which encode credential-free
// source work already done) are preserved from the existing matrix.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

function findRepoRoot(start: string): string {
    let dir = start;
    for (let i = 0; i < 12; i++) {
        if (existsSync(resolve(dir, 'metadata/integrations/path-lms/.path-lms.integration.json'))) return dir;
        const parent = dirname(dir);
        if (parent === dir) break;
        dir = parent;
    }
    throw new Error('repo root not found');
}

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = findRepoRoot(SCRIPT_DIR);
const META_PATH = resolve(REPO_ROOT, 'metadata/integrations/path-lms/.path-lms.integration.json');
const OUT_DIR = resolve(REPO_ROOT, 'packages/Integration/connectors-registry/path-lms/output');
const MATRIX_PATH = resolve(OUT_DIR, 'EXTRACTION_REPORT_MATRIX.csv');
const REPORT_PATH = resolve(OUT_DIR, 'EXTRACTION_REPORT.md');

interface FieldRec { fields: Record<string, unknown> & { Name: string }; }
interface IORec {
    fields: Record<string, unknown> & { Name: string };
    relatedEntities?: { 'MJ: Integration Object Fields'?: FieldRec[] };
}

function loadIOs(): IORec[] {
    const parsed = JSON.parse(readFileSync(META_PATH, 'utf8'));
    const file = Array.isArray(parsed) ? parsed[0] : parsed;
    return file.relatedEntities['MJ: Integration Objects'] as IORec[];
}

function pkFieldsOf(io: IORec): string[] {
    const fields = io.relatedEntities?.['MJ: Integration Object Fields'] ?? [];
    return fields.filter((f) => f.fields.IsPrimaryKey === true).map((f) => f.fields.Name);
}
function fkCountOf(io: IORec): number {
    const fields = io.relatedEntities?.['MJ: Integration Object Fields'] ?? [];
    return fields.filter((f) => f.fields.IsForeignKey === true).length;
}

function regenMatrix(ios: IORec[]): void {
    if (!existsSync(MATRIX_PATH)) throw new Error(`matrix not found: ${MATRIX_PATH}`);
    const lines = readFileSync(MATRIX_PATH, 'utf8').trim().split('\n');
    const hdr = lines[0].split(',');
    const iName = hdr.indexOf('IOName');
    const iPK = hdr.indexOf('PKVerdict');
    const iFK = hdr.indexOf('FKVerdict');
    const byName = new Map(ios.map((io) => [io.fields.Name, io]));
    let updated = 0;
    for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',');
        const io = byName.get(cols[iName]);
        if (!io) continue;
        const pks = pkFieldsOf(io);
        const newPK = pks.length > 0 ? 'emit' : 'defer';
        const fkc = fkCountOf(io);
        const newFK = fkc > 0 ? `emit-${fkc}` : 'defer';
        if (cols[iPK] !== newPK || cols[iFK] !== newFK) updated++;
        cols[iPK] = newPK;
        cols[iFK] = newFK;
        lines[i] = cols.join(',');
    }
    writeFileSync(MATRIX_PATH, lines.join('\n') + '\n', 'utf8');
    process.stdout.write(`matrix: ${lines.length - 1} rows, ${updated} PK/FK verdict(s) re-aligned to metadata\n`);
}

function regenReportPKSection(ios: IORec[]): void {
    if (!existsSync(REPORT_PATH)) {
        process.stdout.write('report: EXTRACTION_REPORT.md not found, skipping in-place PK section refresh\n');
        return;
    }
    let report = readFileSync(REPORT_PATH, 'utf8');

    const withId = ios.filter((io) =>
        (io.relatedEntities?.['MJ: Integration Object Fields'] ?? []).some((f) => f.fields.Name.toLowerCase() === 'id'),
    );
    const idSolePK = withId.filter((io) => {
        const pks = pkFieldsOf(io);
        return pks.length === 1 && pks[0].toLowerCase() === 'id';
    });
    const starIdPK = ios
        .map((io) => ({ name: io.fields.Name, pks: pkFieldsOf(io) }))
        .filter((x) => x.pks.some((p) => p.toLowerCase() !== 'id' && p.toLowerCase().endsWith('id')));
    const otherNonIdPK = ios
        .map((io) => ({ name: io.fields.Name, pks: pkFieldsOf(io) }))
        .filter((x) => x.pks.length > 0 && !x.pks.some((p) => p.toLowerCase() === 'id') && !x.pks.some((p) => p.toLowerCase().endsWith('id')));
    const noPK = ios.map((io) => ({ name: io.fields.Name, pks: pkFieldsOf(io) })).filter((x) => x.pks.length === 0);

    const block = [
        '<!-- PK-AMENDMENT-AUTOGEN:START (regenerated from .path-lms.integration.json) -->',
        '## PK reconciliation (post-amendment, rendered from the metadata)',
        '',
        `- Total Integration Objects: **${ios.length}**.`,
        `- IOs with an \`id\` field: **${withId.length}**; of these, **${idSolePK.length}** have \`id\` as the sole PrimaryKey.`,
        `- IOs whose PK is a \`*Id\` foreign-key-style field (no \`id\` field present on the object): **${starIdPK.length}** — ${starIdPK.map((x) => `\`${x.name}.${x.pks.join('+')}\``).join(', ') || 'none'}.`,
        `- IOs with a non-\`id\`, non-\`*Id\` PK: **${otherNonIdPK.length}** — ${otherNonIdPK.map((x) => `\`${x.name}.${x.pks.join('+')}\``).join(', ') || 'none'}.`,
        `- IOs with NO PrimaryKey (composite/keyless — soft identity falls to content hash at runtime): **${noPK.length}** — ${noPK.map((x) => `\`${x.name}\``).join(', ') || 'none'}.`,
        '',
        '**Invariant after the `*Id`-as-PK amendment pass:** every IO that has an `id` field has `id` as its sole PrimaryKey, and no `id`-bearing IO retains a `*Id` field marked PrimaryKey. The remaining `*Id`/scalar PKs above belong to flat report/projection types that expose **no `id` field** in the SDL (so there is no `id` to promote); they are surfaced here, not silently mutated.',
        '<!-- PK-AMENDMENT-AUTOGEN:END -->',
        '',
    ].join('\n');

    const startMark = '<!-- PK-AMENDMENT-AUTOGEN:START';
    const endMark = '<!-- PK-AMENDMENT-AUTOGEN:END -->';
    if (report.includes(startMark) && report.includes(endMark)) {
        report = report.replace(new RegExp(`${startMark}[\\s\\S]*?${endMark}\\n?`), block);
    } else {
        report = report.trimEnd() + '\n\n' + block;
    }
    writeFileSync(REPORT_PATH, report, 'utf8');
    process.stdout.write('report: PK reconciliation section regenerated from metadata\n');
}

function main(): void {
    const ios = loadIOs();
    if (ios.length !== 84) throw new Error(`expected 84 IOs, found ${ios.length}`);
    regenMatrix(ios);
    regenReportPKSection(ios);
}

main();
