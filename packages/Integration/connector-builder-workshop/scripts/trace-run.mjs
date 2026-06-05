#!/usr/bin/env node
// trace-run — one-command unified trace of a connector-builder run.
//
// Usage:
//   node packages/Integration/connector-builder-workshop/scripts/trace-run.mjs [runID]
//   (no arg → most recent run across all vendors)
//
// Pulls together everything needed to trace how a build went / where it tripped:
//   - manifest.json (vendor, stages, started)
//   - emitted plan (plans/<vendor>.workflow.js) presence + size
//   - run-dir output tree + EXTRACTION_REPORT_MATRIX.csv content
//   - metadata file summary (IO / IOF counts)
//   - the unified MCP trace (logs/mcp-trace.jsonl), filtered to this run's window
//   - REPORT / SuperCoordinatorReport floor-check verdict, if written
//   - pointers to the per-agent Workflow transcripts (agent-*.jsonl)

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const REGISTRY = join(REPO, 'packages/Integration/connectors-registry');
const PLANS = join(REPO, 'packages/Integration/connector-builder-workshop/plans');
const MCP_LOG = process.env.MJ_MCP_LOG ?? join(REPO, 'logs/mcp-trace.jsonl');

const hr = (t) => console.log(`\n=== ${t} ===`);
const readJSON = (p) => { try { return JSON.parse(readFileSync(p, 'utf-8')); } catch { return null; } };

// ── Locate the run ─────────────────────────────────────────────────────────
function allRuns() {
    const out = [];
    if (!existsSync(REGISTRY)) return out;
    for (const vendor of readdirSync(REGISTRY)) {
        const runsDir = join(REGISTRY, vendor, 'runs');
        if (!existsSync(runsDir)) continue;
        for (const rid of readdirSync(runsDir)) {
            const dir = join(runsDir, rid);
            try { out.push({ vendor, runID: rid, dir, mtime: statSync(dir).mtimeMs }); } catch { /* skip */ }
        }
    }
    return out.sort((a, b) => b.mtime - a.mtime);
}

const wantRunID = process.argv[2];
const runs = allRuns();
const run = wantRunID ? runs.find(r => r.runID === wantRunID) : runs[0];
if (!run) { console.error(wantRunID ? `Run not found: ${wantRunID}` : 'No runs found.'); process.exit(1); }

console.log(`TRACE: ${run.vendor} / ${run.runID}`);

// ── Manifest ───────────────────────────────────────────────────────────────
hr('manifest');
const manifest = readJSON(join(run.dir, 'manifest.json'));
console.log(manifest ? JSON.stringify(manifest, null, 2) : '  (no manifest.json)');
const startedAt = manifest?.startedAt ?? null;

// ── Emitted plan ───────────────────────────────────────────────────────────
hr('emitted plan');
const planPath = join(PLANS, `${run.vendor}.workflow.js`);
if (existsSync(planPath)) {
    const src = readFileSync(planPath, 'utf-8');
    console.log(`  ${planPath} (${src.split('\n').length} lines)`);
    for (const marker of ['compute-source-diff', 'gap-fill-fork', 'extract-iiof-pipeline', 'outputDir', 'floor-check']) {
        console.log(`    ${marker}: ${(src.match(new RegExp(marker, 'g')) || []).length}×`);
    }
} else { console.log('  (plan not emitted — run did not reach Stage 1 output)'); }

// ── Run output tree ────────────────────────────────────────────────────────
hr('run output tree');
function walk(dir, base = dir) {
    if (!existsSync(dir)) return;
    for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        const st = statSync(p);
        if (st.isDirectory()) walk(p, base);
        else console.log(`  ${p.replace(base + '/', '')}  (${st.size}b)`);
    }
}
walk(run.dir);

// ── Matrix ─────────────────────────────────────────────────────────────────
hr('EXTRACTION_REPORT_MATRIX.csv');
const matrixPath = join(run.dir, 'output', 'EXTRACTION_REPORT_MATRIX.csv');
console.log(existsSync(matrixPath) ? readFileSync(matrixPath, 'utf-8') : '  (not written — never reached extract write-back)');

// ── Metadata file summary ──────────────────────────────────────────────────
hr('metadata file (IO / IOF counts)');
const metaPath = join(REPO, 'metadata/integrations', run.vendor, `.${run.vendor}.integration.json`);
const meta = readJSON(metaPath);
if (meta) {
    const root = Array.isArray(meta) ? meta[0] : meta;
    const ios = root?.IntegrationObjects ?? root?.relatedEntities?.['Integration Objects'] ?? [];
    const iofCount = (Array.isArray(ios) ? ios : []).reduce((n, io) => n + ((io?.Fields ?? io?.IntegrationObjectFields ?? []).length || 0), 0);
    console.log(`  ${metaPath}\n  IOs: ${Array.isArray(ios) ? ios.length : '?'}  IOFs: ${iofCount}`);
} else { console.log(`  (no metadata file at ${metaPath})`); }

// ── MCP trace (this run's window) ──────────────────────────────────────────
hr('MCP trace (logs/mcp-trace.jsonl, this run window)');
if (existsSync(MCP_LOG)) {
    const lines = readFileSync(MCP_LOG, 'utf-8').split('\n').filter(Boolean);
    const inWindow = lines.filter(l => { try { return !startedAt || JSON.parse(l).ts >= startedAt; } catch { return false; } });
    console.log(`  ${inWindow.length} call(s) since run start (of ${lines.length} total):`);
    for (const l of inWindow.slice(-60)) {
        try { const j = JSON.parse(l); console.log(`    ${j.ts} ${j.server} ${j.phase} ${j.tool} ${j.connector ?? ''} ${j.io ?? j.ioName ?? j.tier ?? ''} ${j.ok === false || j.error ? 'ERR:' + (j.error ?? '') : ''}`); } catch { /* skip */ }
    }
} else { console.log('  (no MCP trace log — servers not invoked, or MJ_MCP_LOG elsewhere)'); }

// ── Floor-check verdict ────────────────────────────────────────────────────
hr('floor-check verdict / final report');
for (const name of ['REPORT.json', 'SuperCoordinatorReport.json']) {
    const rp = join(REGISTRY, run.vendor, name);
    if (existsSync(rp)) { const r = readJSON(rp); console.log(`  ${name}: ${JSON.stringify(r?.verdict ?? r, null, 2).slice(0, 1500)}`); }
}
if (!existsSync(join(REGISTRY, run.vendor, 'REPORT.json')) && !existsSync(join(REGISTRY, run.vendor, 'SuperCoordinatorReport.json'))) {
    console.log('  (no REPORT yet — run did not reach FloorCheck)');
}

// ── Agent transcripts pointer ──────────────────────────────────────────────
hr('per-agent Workflow transcripts');
console.log('  Workflow writes agent-<id>.jsonl per subagent into the session transcript dir:');
console.log(`    ~/.claude/projects/-Users-...-MJ-agentic/  (look for agent-*.jsonl by mtime)`);
console.log('  Those hold each subagent\'s full reasoning + tool calls — read them for deep per-stage debugging.');
