#!/usr/bin/env node
/**
 * repo-stats.mjs — Lines-of-code snapshot generator for the /stats folder.
 *
 * Counts git-tracked lines by language using cloc, splits every count into
 * hand-written vs generated (deterministic tool output — CodeGen, mj-sync,
 * pg-migrate, manifests, lockfiles, etc.), appends a row to stats/data.csv,
 * writes a full per-run report to stats/reports/, and regenerates
 * stats/README.md (history table + mermaid trend charts + latest analysis).
 *
 * Usage:
 *   node stats/repo-stats.mjs              # snapshot the current HEAD/working tree
 *   node stats/repo-stats.mjs <commit>     # snapshot a historical commit (via cloc --git)
 *   node stats/repo-stats.mjs <c1> <c2> …  # backfill several commits in one run
 *   node stats/repo-stats.mjs --render     # regenerate README from data.csv (no recount)
 *
 * Requires cloc (brew install cloc).
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const statsDir = join(repoRoot, 'stats');
const reportsDir = join(statsDir, 'reports');
const analysisDir = join(statsDir, 'analysis');
const csvPath = join(statsDir, 'data.csv');

// Language buckets tracked as columns in data.csv. Anything not listed rolls into "Other".
const LANGUAGE_GROUPS = {
    TypeScript: ['TypeScript'],
    JavaScript: ['JavaScript', 'JSX'],
    HTML: ['HTML'],
    CSS: ['CSS', 'SCSS', 'Sass', 'Less'],
    Markdown: ['Markdown'],
    SQL: ['SQL'],
    JSON: ['JSON', 'JSON5'],
};
// "Source" = hand-written application source for the headline trend (SQL/JSON tracked separately).
const SOURCE_GROUPS = ['TypeScript', 'JavaScript', 'HTML', 'CSS', 'Markdown'];
const ALL_GROUPS = [...Object.keys(LANGUAGE_GROUPS), 'Other'];

// Files matching any of these repo-relative path patterns are classified as GENERATED —
// deterministic output of a tool, not hand-written. Keep in sync with stats/CLAUDE.md.
const GENERATED_PATTERNS = [
    /(^|\/)generated\//i, // CodeGen output dirs (see packages/CodeGenLib/src/Config/config.ts)
    /(mj-class-registrations|class-registrations-manifest)\.(ts|mjs|js)$/i, // mj codegen manifest
    /^migrations(-pg)?\/.*metadata_sync.*\.sql$/i, // mj-sync metadata exports
    /^migrations(-pg)?\/.*codegen_run.*\.sql$/i, // CodeGen run SQL
    /^migrations(-pg)?\/v\d+\/B\d+__.*\.sql$/i, // baseline consolidation migrations
    /^migrations-pg\//i, // ALL PG migrations — converted from SQL Server by pg-migrate
    /^metadata\/integrations\//i, // connector metadata from generate-integration-actions
    /^packages\/DBAutoDoc\/test-run\//i, // committed DBAutoDoc tool-run outputs
    /(^|\/)package-lock\.json$/i, // npm lockfile
];

function isGenerated(path) {
    const p = path.replace(/^\.\//, '');
    return GENERATED_PATTERNS.some((re) => re.test(p));
}

const CSV_COLUMNS = [
    'date',
    'commit',
    ...ALL_GROUPS.flatMap((g) => [g, `${g}Gen`]),
    'SourceTotal',
    'SourceGenTotal',
    'GrandTotal',
    'GrandGenTotal',
    'Files',
];

function git(...args) {
    return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim();
}

function runCloc(commitish) {
    const args = commitish
        ? ['--git', commitish, '--by-file', '--json', '--quiet']
        : ['--vcs=git', '--by-file', '--json', '--quiet'];
    const out = execFileSync('cloc', args, { cwd: repoRoot, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
    return JSON.parse(out);
}

const groupOfLanguage = (lang) =>
    Object.keys(LANGUAGE_GROUPS).find((g) => LANGUAGE_GROUPS[g].includes(lang)) ?? 'Other';

function groupCounts(clocJson) {
    const groups = Object.fromEntries(ALL_GROUPS.map((g) => [g, { code: 0, gen: 0 }]));
    const langs = new Map(); // language -> { files, blank, comment, code, gen }
    let files = 0;
    for (const [path, v] of Object.entries(clocJson)) {
        if (path === 'header' || path === 'SUM') continue;
        files++;
        const gen = isGenerated(path);
        const lang = langs.get(v.language) ?? { files: 0, blank: 0, comment: 0, code: 0, gen: 0 };
        lang.files++;
        lang.blank += v.blank;
        lang.comment += v.comment;
        lang.code += v.code;
        if (gen) lang.gen += v.code;
        langs.set(v.language, lang);
        const group = groups[groupOfLanguage(v.language)];
        group.code += v.code;
        if (gen) group.gen += v.code;
    }
    const byLanguage = [...langs.entries()]
        .map(([lang, v]) => ({ lang, ...v }))
        .sort((a, b) => b.code - a.code);
    const sum = (sel) => ALL_GROUPS.reduce((t, g) => t + sel(groups[g]), 0);
    const sumSource = (sel) => SOURCE_GROUPS.reduce((t, g) => t + sel(groups[g]), 0);
    return {
        groups,
        byLanguage,
        sourceTotal: sumSource((g) => g.code),
        sourceGenTotal: sumSource((g) => g.gen),
        grandTotal: sum((g) => g.code),
        grandGenTotal: sum((g) => g.gen),
        files,
    };
}

function loadCsv() {
    if (!existsSync(csvPath)) return [];
    const [header, ...lines] = readFileSync(csvPath, 'utf8').trim().split('\n');
    const cols = header.split(',');
    return lines.filter(Boolean).map((line) => {
        const cells = line.split(',');
        return Object.fromEntries(cols.map((c, i) => [c, cells[i]]));
    });
}

function saveCsv(rows) {
    rows.sort((a, b) => a.date.localeCompare(b.date));
    const lines = [CSV_COLUMNS.join(',')];
    for (const row of rows) lines.push(CSV_COLUMNS.map((c) => row[c] ?? 0).join(','));
    writeFileSync(csvPath, lines.join('\n') + '\n');
}

function upsertRow(rows, row) {
    const existing = rows.findIndex((r) => r.date === row.date);
    if (existing >= 0) rows[existing] = row;
    else rows.push(row);
}

const fmt = (n) => Number(n).toLocaleString('en-US');
const fmtDelta = (n) => (n >= 0 ? `+${fmt(n)}` : fmt(n));
const pct = (part, whole) => (Number(whole) > 0 ? Math.round((100 * Number(part)) / Number(whole)) : 0);

function groupTable(counts) {
    const lines = [
        '| Language group | Hand-written | Generated | Total | Gen % |',
        '|---|---:|---:|---:|---:|',
    ];
    for (const g of ALL_GROUPS) {
        const { code, gen } = counts.groups[g];
        if (code === 0) continue;
        lines.push(`| ${g} | ${fmt(code - gen)} | ${fmt(gen)} | ${fmt(code)} | ${pct(gen, code)}% |`);
    }
    lines.push(
        `| **Source (TS+JS+HTML+CSS+MD)** | **${fmt(counts.sourceTotal - counts.sourceGenTotal)}** | **${fmt(counts.sourceGenTotal)}** | **${fmt(counts.sourceTotal)}** | ${pct(counts.sourceGenTotal, counts.sourceTotal)}% |`,
        `| **All languages** | **${fmt(counts.grandTotal - counts.grandGenTotal)}** | **${fmt(counts.grandGenTotal)}** | **${fmt(counts.grandTotal)}** | ${pct(counts.grandGenTotal, counts.grandTotal)}% |`
    );
    return lines;
}

function deltaTable(row, prev) {
    const lines = [
        `## Change since ${prev.date}`,
        '',
        '| Language group | Total Δ | Hand-written Δ | Generated Δ |',
        '|---|---:|---:|---:|',
    ];
    for (const g of ALL_GROUPS) {
        const dTotal = Number(row[g]) - Number(prev[g] ?? 0);
        const dGen = Number(row[`${g}Gen`]) - Number(prev[`${g}Gen`] ?? 0);
        if (dTotal === 0 && dGen === 0) continue;
        lines.push(`| ${g} | ${fmtDelta(dTotal)} | ${fmtDelta(dTotal - dGen)} | ${fmtDelta(dGen)} |`);
    }
    const dGrand = Number(row.GrandTotal) - Number(prev.GrandTotal);
    const dGrandGen = Number(row.GrandGenTotal) - Number(prev.GrandGenTotal ?? 0);
    lines.push(
        `| **All languages** | **${fmtDelta(dGrand)}** | **${fmtDelta(dGrand - dGrandGen)}** | **${fmtDelta(dGrandGen)}** |`,
        '',
        `Files: ${fmt(prev.Files)} → ${fmt(row.Files)} (${fmtDelta(Number(row.Files) - Number(prev.Files))})`
    );
    return lines;
}

function writeReport(date, sha, counts, row, prev) {
    const lines = [
        `# Repo Stats — ${date}`,
        '',
        `- **Commit**: \`${sha}\``,
        `- **Hand-written source LOC** (TS + JS + HTML + CSS + MD): **${fmt(counts.sourceTotal - counts.sourceGenTotal)}**`,
        `- **Source LOC incl. generated**: ${fmt(counts.sourceTotal)} (${pct(counts.sourceGenTotal, counts.sourceTotal)}% generated)`,
        `- **Total LOC** (all tracked languages): **${fmt(counts.grandTotal)}** across ${fmt(counts.files)} files (${pct(counts.grandGenTotal, counts.grandTotal)}% generated)`,
        '',
        '## Hand-written vs generated',
        '',
        ...groupTable(counts),
        '',
        ...(prev ? [...deltaTable(row, prev), ''] : []),
        '## Full cloc detail',
        '',
        '| Language | Files | Blank | Comment | Code | Generated |',
        '|---|---:|---:|---:|---:|---:|',
        ...counts.byLanguage.map(
            (l) => `| ${l.lang} | ${fmt(l.files)} | ${fmt(l.blank)} | ${fmt(l.comment)} | ${fmt(l.code)} | ${fmt(l.gen)} |`
        ),
        `| **SUM** | **${fmt(counts.files)}** | | | **${fmt(counts.grandTotal)}** | **${fmt(counts.grandGenTotal)}** |`,
        '',
        `_Generated by \`stats/repo-stats.mjs\` using cloc (git-tracked files only). "Generated" = deterministic tool output per the patterns in that script. Narrative analysis (if written): [../analysis/${date}.md](../analysis/${date}.md)._`,
        '',
    ];
    writeFileSync(join(reportsDir, `${date}.md`), lines.join('\n'));
}

function mermaidChart(title, yLabel, dates, series) {
    const lines = [
        '```mermaid',
        'xychart-beta',
        `    title "${title}"`,
        `    x-axis [${dates.map((d) => `"${d}"`).join(', ')}]`,
        `    y-axis "${yLabel}"`,
    ];
    for (const values of series) lines.push(`    line [${values.join(', ')}]`);
    lines.push('```');
    return lines.join('\n');
}

function latestAnalysisSection(rows) {
    for (let i = rows.length - 1; i >= 0; i--) {
        const file = join(analysisDir, `${rows[i].date}.md`);
        if (existsSync(file)) {
            const body = readFileSync(file, 'utf8').trim().replace(/^#\s.*\n/, '');
            return [`## Latest analysis (${rows[i].date})`, '', body.trim(), ''];
        }
    }
    return ['## Latest analysis', '', '_No narrative analysis yet — run `/update-stats` to generate one._', ''];
}

function historyRow(r) {
    const cell = (g) => {
        const p = pct(r[`${g}Gen`] ?? 0, r[g]);
        return p > 0 ? `${fmt(r[g])} (${p}%)` : fmt(r[g]);
    };
    const analysis = existsSync(join(analysisDir, `${r.date}.md`)) ? ` · [analysis](analysis/${r.date}.md)` : '';
    return (
        `| [${r.date}](reports/${r.date}.md)${analysis} | \`${r.commit.slice(0, 10)}\` | ${cell('TypeScript')} | ${cell('JavaScript')} | ${cell('HTML')} | ` +
        `${cell('CSS')} | ${cell('Markdown')} | **${fmt(Number(r.SourceTotal) - Number(r.SourceGenTotal ?? 0))}** | ${cell('SQL')} | ${cell('JSON')} | ${fmt(r.GrandTotal)} | ${fmt(r.Files)} |`
    );
}

function renderReadme(rows) {
    const kloc = (n) => Math.round(Number(n) / 1000);
    const dates = rows.map((r) => r.date);
    const latest = rows[rows.length - 1];

    const sourceChart = mermaidChart(
        'Source LOC by language, incl. generated (thousands of lines)', 'KLOC', dates,
        ['TypeScript', 'HTML', 'Markdown', 'CSS', 'JavaScript'].map((g) => rows.map((r) => kloc(r[g])))
    );
    const handVsGenChart = mermaidChart(
        'Hand-written source vs generated code (thousands of lines)', 'KLOC', dates,
        [
            rows.map((r) => kloc(Number(r.SourceTotal) - Number(r.SourceGenTotal ?? 0))),
            rows.map((r) => kloc(r.SourceGenTotal ?? 0)),
            rows.map((r) => kloc(r.GrandGenTotal ?? 0)),
        ]
    );
    const totalsChart = mermaidChart(
        'Source vs SQL vs JSON (thousands of lines)', 'KLOC', dates,
        [rows.map((r) => kloc(r.SourceTotal)), rows.map((r) => kloc(r.SQL)), rows.map((r) => kloc(r.JSON))]
    );

    const lines = [
        '# Repository Stats',
        '',
        'Lines-of-code snapshots over time, counted with [cloc](https://github.com/AlDanial/cloc) over git-tracked files',
        '(`node_modules`, `dist`, and other ignored paths are excluded automatically). Every count is split into',
        '**hand-written** vs **generated** — deterministic tool output such as CodeGen entity classes/forms/resolvers,',
        '`mj codegen manifest` registrations, mj-sync metadata migrations, baseline consolidations, pg-migrate',
        'conversions, connector metadata, and lockfiles. The exact patterns live in [repo-stats.mjs](repo-stats.mjs).',
        '',
        'To record a new snapshot (or use the `/update-stats` Claude command, which adds narrative analysis):',
        '',
        '```bash',
        'node stats/repo-stats.mjs              # current tree',
        'node stats/repo-stats.mjs <commit>     # backfill a historical commit',
        'node stats/repo-stats.mjs --render     # re-render README from data.csv (no recount)',
        '```',
        '',
        `**Latest** (${latest.date}, \`${latest.commit.slice(0, 10)}\`): ` +
            `**${fmt(Number(latest.SourceTotal) - Number(latest.SourceGenTotal))}** hand-written source LOC · ` +
            `${fmt(latest.SourceTotal)} source incl. generated · ` +
            `**${fmt(latest.GrandTotal)}** total LOC (${pct(latest.GrandGenTotal, latest.GrandTotal)}% generated) · ${fmt(latest.Files)} files`,
        '',
        ...latestAnalysisSection(rows),
        '## Hand-written vs generated over time',
        '',
        'Lines in top-to-bottom legend order: **hand-written source (TS+JS+HTML+CSS+MD), generated source, all generated code (every language)**.',
        '',
        handVsGenChart,
        '',
        '## Source code over time',
        '',
        'Lines in top-to-bottom legend order: **TypeScript, HTML, Markdown, CSS, JavaScript** (totals incl. generated).',
        '',
        sourceChart,
        '',
        '## Source vs generated/data over time',
        '',
        'Lines: **Source total (TS+JS+HTML+CSS+MD), SQL, JSON**. SQL is dominated by tool-emitted migrations;',
        'JSON is mostly declarative metadata and committed tool outputs.',
        '',
        totalsChart,
        '',
        '## History',
        '',
        'Per-language cells show total LOC with the generated share in parentheses. **Hand Source** = source LOC minus generated.',
        '',
        '| Date | Commit | TypeScript | JavaScript | HTML | CSS | Markdown | Hand Source | SQL | JSON | Grand Total | Files |',
        '|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
        ...rows.map(historyRow),
        '',
        'Full per-language breakdowns and snapshot-over-snapshot deltas are in [reports/](reports/);',
        'narrative analyses in [analysis/](analysis/). Raw time series: [data.csv](data.csv).',
        '',
    ];
    writeFileSync(join(statsDir, 'README.md'), lines.join('\n'));
}

function buildRow(date, sha, counts) {
    const row = { date, commit: sha };
    for (const g of ALL_GROUPS) {
        row[g] = counts.groups[g].code;
        row[`${g}Gen`] = counts.groups[g].gen;
    }
    row.SourceTotal = counts.sourceTotal;
    row.SourceGenTotal = counts.sourceGenTotal;
    row.GrandTotal = counts.grandTotal;
    row.GrandGenTotal = counts.grandGenTotal;
    row.Files = counts.files;
    return row;
}

function snapshot(commitish, rows) {
    const sha = commitish ? git('rev-parse', commitish) : git('rev-parse', 'HEAD');
    const date = commitish ? git('log', '-1', '--format=%cs', sha) : new Date().toISOString().slice(0, 10);
    console.log(`Counting ${commitish ? sha.slice(0, 10) : 'working tree'} (${date})...`);
    const counts = groupCounts(runCloc(commitish ? sha : null));
    const row = buildRow(date, sha, counts);
    const prev = rows.filter((r) => r.date < date).sort((a, b) => a.date.localeCompare(b.date)).pop() ?? null;
    writeReport(date, sha, counts, row, prev);
    return row;
}

mkdirSync(reportsDir, { recursive: true });
mkdirSync(analysisDir, { recursive: true });
const targets = process.argv.slice(2);
const rows = loadCsv();
if (targets[0] === '--render') {
    // no recount — just regenerate README (picks up new analysis files)
} else if (targets.length === 0) {
    upsertRow(rows, snapshot(null, rows));
    saveCsv(rows);
} else {
    for (const t of targets) upsertRow(rows, snapshot(t, rows));
    saveCsv(rows);
}
rows.sort((a, b) => a.date.localeCompare(b.date));
renderReadme(rows);
console.log(`Done: ${rows.length} snapshot(s) in stats/data.csv; README regenerated.`);
