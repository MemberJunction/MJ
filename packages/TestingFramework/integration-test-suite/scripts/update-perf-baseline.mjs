#!/usr/bin/env node
/**
 * Build Engineer Utility: Reset or update IT128 performance baselines in `wave4-baseline.json`.
 *
 * Usage examples:
 *   # 1. Update local baseline from benchmark-logs/latest.json
 *   npm run perf:update-baseline -- --target local
 *
 *   # 2. Update ubuntu-latest CI baseline from a downloaded latest.json file
 *   npm run perf:update-baseline -- --target ci --from /path/to/latest.json
 *
 *   # 3. Download the IT128 artifact directly from a GitHub Actions run ID and update CIBaseline
 *   npm run perf:update-baseline -- --target ci --gh-run 43431047098
 *
 *   # 4. Archive the current local Baseline into HistoricalWaves before updating
 *   npm run perf:update-baseline -- --target local --archive-as Wave5 --commit $(git rev-parse --short=10 HEAD)
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BENCHMARK_DIR = path.resolve(__dirname, '../benchmark-logs');
const BASELINE_PATH = path.join(BENCHMARK_DIR, 'wave4-baseline.json');
const DEFAULT_LATEST_PATH = path.join(BENCHMARK_DIR, 'latest.json');

function parseArgs(argv) {
    const opts = {
        target: 'local', // 'local' | 'ci'
        from: '',
        ghRun: '',
        archiveAs: '',
        commit: '',
    };
    for (let i = 2; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--target' && argv[i + 1]) {
            opts.target = argv[++i];
        } else if (arg === '--from' && argv[i + 1]) {
            opts.from = argv[++i];
        } else if (arg === '--gh-run' && argv[i + 1]) {
            opts.ghRun = argv[++i];
        } else if (arg === '--archive-as' && argv[i + 1]) {
            opts.archiveAs = argv[++i];
        } else if (arg === '--commit' && argv[i + 1]) {
            opts.commit = argv[++i];
        } else if (arg === '--help' || arg === '-h') {
            console.log(
                [
                    'Usage: node scripts/update-perf-baseline.mjs [options]',
                    '',
                    'Options:',
                    '  --target <local|ci>     Which baseline profile to update (default: local)',
                    '  --from <path>           Path to a benchmark latest.json file (default: benchmark-logs/latest.json)',
                    '  --gh-run <run-id>       Download it128-performance-benchmark artifact from GitHub Actions run ID via gh CLI',
                    '  --archive-as <name>     Copy current local Baseline into HistoricalWaves.<name> before updating',
                    '  --commit <sha>          Commit SHA to record on the updated baseline profile',
                ].join('\n')
            );
            process.exit(0);
        }
    }
    if (opts.target !== 'local' && opts.target !== 'ci') {
        throw new Error(`Invalid --target "${opts.target}". Expected "local" or "ci".`);
    }
    return opts;
}

function resolveCommitSha(explicitCommit) {
    if (explicitCommit) {
        return explicitCommit;
    }
    try {
        return execFileSync('git', ['rev-parse', '--short=10', 'HEAD'], { encoding: 'utf8' }).trim();
    } catch {
        return 'unknown';
    }
}

function downloadFromGitHubRun(runId) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `it128-ci-${runId}-`));
    console.log(`[perf:update-baseline] Downloading IT128 artifact from GitHub Actions run ${runId}...`);
    execFileSync('gh', ['run', 'download', String(runId), '--pattern', 'it128-performance-benchmark-*', '--dir', tmpDir], {
        stdio: 'inherit',
    });
    const walk = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                const found = walk(full);
                if (found) return found;
            } else if (entry.name === 'latest.json') {
                return full;
            }
        }
        return null;
    };
    const foundJson = walk(tmpDir);
    if (!foundJson) {
        throw new Error(`Could not find latest.json inside downloaded artifact for run ${runId} in ${tmpDir}`);
    }
    return foundJson;
}

function computeAggregatePrimitivesMs(p) {
    return Number(
        (
            (Number(p.ClassFactoryAndObjectCacheMs) || 0) +
            (Number(p.EntityHydrateAndFlsMs) || 0) +
            (Number(p.LocalCacheWritesAndStatsMs) || 0) +
            (Number(p.TemplateRenderSimpleMs) || 0) +
            (Number(p.ActionSnapshotAndEngineLookupMs) || 0) +
            (Number(p.PayloadApplyAndDeepDiffMs) || 0) +
            (Number(p.DatestampsOnly10SavesMs) || 0) +
            (Number(p.ApplyRowChanges50On5000RowsMs) || 0) +
            (Number(p.BaseEnginePKMap100DeltasMs) || 0) +
            (Number(p.GetEntityObjectSkipNewRecord500Ms) || 0) +
            (Number(p.UserByEmail10kLookupsMs) || 0) +
            (Number(p.NarrowSearchRunView10CallsMs) || 0) +
            (Number(p.TwoTierL1200Reads50DeltasMs) || 0) +
            (Number(p.FrozenRowWireSerialize5000x20Ms) || 0)
        ).toFixed(2)
    );
}

function computeAggregateAgentFrameworkMs(runs) {
    if (!Array.isArray(runs)) return 0;
    return Number(runs.reduce((sum, r) => sum + (Number(r.FrameworkOverheadMs) || 0), 0).toFixed(2));
}

function buildProfileFromReport(report, commitSha, runnerLabel) {
    const p = report.Primitives ?? {};
    const detRuns = (report.DeterministicAgentRuns ?? []).map((r) => ({
        Label: r.Label,
        AgentName: r.AgentName,
        WallTimeMs: r.WallTimeMs,
        FrameworkOverheadMs: r.FrameworkOverheadMs,
        TotalStepStorageBytes: r.TotalStepStorageBytes,
        PayloadAtStartPointerSteps: r.PayloadAtStartPointerSteps,
        PayloadAtEndPointerSteps: r.PayloadAtEndPointerSteps,
        StorageSavingsPercent: r.StorageSavingsPercent,
    }));
    return {
        Runner: runnerLabel,
        Timestamp: report.Timestamp ?? new Date().toISOString(),
        Commit: commitSha,
        Database: report.Database ?? 'unknown',
        PrimitivesTotalMs: report.PrimitivesTotalMs,
        AggregatePrimitivesAndWave4Ms: computeAggregatePrimitivesMs(p),
        AggregateAgentFrameworkOverheadMs: computeAggregateAgentFrameworkMs(detRuns),
        Primitives: { ...p },
        DeterministicAgentRuns: detRuns,
    };
}

function main() {
    const opts = parseArgs(process.argv);
    const sourcePath = opts.ghRun
        ? downloadFromGitHubRun(opts.ghRun)
        : path.resolve(opts.from || DEFAULT_LATEST_PATH);

    if (!fs.existsSync(sourcePath)) {
        throw new Error(`Source benchmark report not found at: ${sourcePath}`);
    }
    if (!fs.existsSync(BASELINE_PATH)) {
        throw new Error(`Baseline file not found at: ${BASELINE_PATH}`);
    }

    const report = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
    const baselineDoc = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
    const commitSha = resolveCommitSha(opts.commit);

    if (opts.archiveAs && baselineDoc.Baseline) {
        const cur = baselineDoc.Baseline;
        const curP = cur.Primitives ?? {};
        const findRun = (name) => (cur.DeterministicAgentRuns ?? []).find((r) => r.AgentName === name);
        baselineDoc.HistoricalWaves[opts.archiveAs] = {
            Commit: cur.Commit ?? baselineDoc.Commit ?? 'archived',
            PrimitivesTotalMs: cur.PrimitivesTotalMs,
            AggregatePrimitivesAndWave4Ms: cur.AggregatePrimitivesAndWave4Ms ?? computeAggregatePrimitivesMs(curP),
            AggregateAgentFrameworkOverheadMs:
                cur.AggregateAgentFrameworkOverheadMs ?? computeAggregateAgentFrameworkMs(cur.DeterministicAgentRuns),
            PB1Ms: curP.ClassFactoryAndObjectCacheMs,
            PB2Ms: curP.EntityHydrateAndFlsMs,
            PB3Ms: curP.LocalCacheWritesAndStatsMs,
            PB4Ms: curP.TemplateRenderSimpleMs,
            PB5Ms: curP.ActionSnapshotAndEngineLookupMs,
            PB6Ms: curP.PayloadApplyAndDeepDiffMs,
            PB13SavesMs: curP.DatestampsOnly10SavesMs,
            PB7StorageBytes: findRun('Sage')?.TotalStepStorageBytes ?? 52871,
            PB8StorageBytes: findRun('Query Builder')?.TotalStepStorageBytes ?? 126263,
            PB9StorageBytes: findRun('Research Agent')?.TotalStepStorageBytes ?? 104158,
            ApplyRowChanges50On5000RowsMs: curP.ApplyRowChanges50On5000RowsMs,
            BaseEnginePKMap100DeltasMs: curP.BaseEnginePKMap100DeltasMs,
            GetEntityObjectSkipNewRecord500Ms: curP.GetEntityObjectSkipNewRecord500Ms,
            UserByEmail10kLookupsMs: curP.UserByEmail10kLookupsMs,
            NarrowSearchRunView10CallsMs: curP.NarrowSearchRunView10CallsMs,
            NarrowSearchReturnedColumns: curP.NarrowSearchReturnedColumns,
            RecordChangesCountTargetsBaseTable: curP.RecordChangesCountTargetsBaseTable,
            TwoTierL1200Reads50DeltasMs: curP.TwoTierL1200Reads50DeltasMs,
            FrozenRowWireSerialize5000x20Ms: curP.FrozenRowWireSerialize5000x20Ms,
        };
        console.log(`[perf:update-baseline] Archived previous Baseline into HistoricalWaves.${opts.archiveAs}`);
    }

    if (opts.target === 'ci') {
        baselineDoc.CIBaseline = buildProfileFromReport(report, commitSha, 'ubuntu-latest (GitHub Actions 4-vCPU)');
        console.log(
            `[perf:update-baseline] Updated CIBaseline from ${sourcePath} (commit=${commitSha}, AggregatePrimitives=${baselineDoc.CIBaseline.AggregatePrimitivesAndWave4Ms}ms, AggregateAgentFramework=${baselineDoc.CIBaseline.AggregateAgentFrameworkOverheadMs}ms)`
        );
    } else {
        const existingLive = baselineDoc.Baseline?.LiveAgentRuns ?? [];
        baselineDoc.Timestamp = report.Timestamp ?? new Date().toISOString();
        baselineDoc.Commit = commitSha;
        baselineDoc.Database = report.Database ?? baselineDoc.Database;
        baselineDoc.Baseline = {
            ...buildProfileFromReport(report, commitSha, 'Local Reference (Apple Silicon)'),
            LiveAgentRuns: report.LiveAgentRuns?.length ? report.LiveAgentRuns : existingLive,
        };
        console.log(
            `[perf:update-baseline] Updated local Baseline from ${sourcePath} (commit=${commitSha}, AggregatePrimitives=${baselineDoc.Baseline.AggregatePrimitivesAndWave4Ms}ms, AggregateAgentFramework=${baselineDoc.Baseline.AggregateAgentFrameworkOverheadMs}ms)`
        );
    }

    fs.writeFileSync(BASELINE_PATH, JSON.stringify(baselineDoc, null, 2) + '\n', 'utf8');
    console.log(`[perf:update-baseline] Wrote ${BASELINE_PATH}`);
}

main();
