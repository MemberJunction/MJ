import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
    CODE_FALLBACK_LIMITS,
    LimitsConfigResolver,
} from '@memberjunction/core';
import {
    GetMaxAgentRunTreeDepth,
    GetMaxHandoffHops,
    GetMaxTasksPerAgentGraph,
    GetMaxTasksPerGraph,
    MAX_AGENT_RUN_TREE_DEPTH,
    MAX_HANDOFF_HOPS,
    MAX_TASKS_PER_AGENT_GRAPH,
    MAX_TASKS_PER_GRAPH,
} from '@memberjunction/ai-core-plus';
import {
    BaseAgent,
    GetMaxConversationToolCallsPerTurn,
    GetMaxRepeatedFailingStep,
    GetMaxSubAgentConsultRounds,
} from '../index';

class TestBaseAgentAccessor extends BaseAgent {
    public static ReadAbsoluteMaxIterations(): number {
        return BaseAgent.DEFAULT_ABSOLUTE_MAX_ITERATIONS;
    }
}

const REPO_ROOT = path.resolve(__dirname, '../../../../..');
const SWEEP_SCRIPT_PATH = path.join(REPO_ROOT, '.github/scripts/sweep-limits-literals.mjs');
const STANDARDS_DIR = path.join(REPO_ROOT, 'packages/Standards');
const STANDARDS_BIN_PATH = path.join(STANDARDS_DIR, 'bin/run.js');
const STANDARDS_DIST_INDEX = path.join(STANDARDS_DIR, 'dist/index.js');
const INVENTORY_CSV_PATH = path.join(REPO_ROOT, 'docs/limits-sweep-inventory.csv');

const tempDirs: string[] = [];

function createTempRepo(files: Record<string, string>): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mj-limits-sweep-test-'));
    tempDirs.push(dir);
    for (const [relPath, content] of Object.entries(files)) {
        const absPath = path.join(dir, relPath);
        fs.mkdirSync(path.dirname(absPath), { recursive: true });
        fs.writeFileSync(absPath, content, 'utf8');
    }
    return dir;
}

afterEach(() => {
    LimitsConfigResolver.Instance.ClearMjConfigLimits();
    while (tempDirs.length > 0) {
        const dir = tempDirs.pop();
        if (dir && fs.existsSync(dir)) {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    }
});

describe('Slice 2 limits sweep script, committed CSV inventory, and standards enforcement', () => {
    beforeEach(() => {
        LimitsConfigResolver.Instance.ClearMjConfigLimits();
    });

    it('ships committed docs/limits-sweep-inventory.csv with valid schema, all 5 labels, and zero unapproved RunawayGuards', () => {
        expect(fs.existsSync(INVENTORY_CSV_PATH)).toBe(true);
        const raw = fs.readFileSync(INVENTORY_CSV_PATH, 'utf8').trim();
        const lines = raw.split(/\r?\n/);
        expect(lines.length).toBeGreaterThan(500);
        expect(lines[0]).toBe('file,line,name,value,enclosingFunction,label,disposition');

        const labelCounts: Record<string, number> = {};
        const runawayRows: Array<{ file: string; name: string; value: string; disposition: string }> = [];

        for (const row of lines.slice(1)) {
            // Simple CSV parser accounting for double-quoted fields
            const cols: string[] = [];
            let cur = '';
            let inQuotes = false;
            for (let i = 0; i < row.length; i++) {
                const ch = row[i];
                if (ch === '"') {
                    if (inQuotes && row[i + 1] === '"') {
                        cur += '"';
                        i++;
                    } else {
                        inQuotes = !inQuotes;
                    }
                } else if (ch === ',' && !inQuotes) {
                    cols.push(cur);
                    cur = '';
                } else {
                    cur += ch;
                }
            }
            cols.push(cur);
            expect(cols).toHaveLength(7);

            const [file, lineStr, name, value, , label, disposition] = cols;
            expect(Number(lineStr)).toBeGreaterThan(0);
            expect(name.length).toBeGreaterThan(0);
            expect(Number.isFinite(Number(value))).toBe(true);
            labelCounts[label] = (labelCounts[label] ?? 0) + 1;

            if (label === 'RunawayGuard') {
                runawayRows.push({ file, name, value, disposition });
            }
        }

        // All 5 classification categories must be present in the sweep inventory
        expect(labelCounts.RunawayGuard).toBeGreaterThanOrEqual(10);
        expect(labelCounts.ResourceGuard).toBeGreaterThan(50);
        expect(labelCounts.ProtocolLimit).toBeGreaterThanOrEqual(5);
        expect(labelCounts.UX).toBeGreaterThan(50);
        expect(labelCounts.Tuning).toBeGreaterThan(50);

        // Every RunawayGuard literal must live strictly inside the canonical LimitsConfigResolver
        for (const row of runawayRows) {
            expect(row.file).toBe('packages/MJCore/src/generic/limitsConfig.ts');
            expect(row.disposition).toBe('canonical-limits-resolver');
        }

        const runawayNames = new Set(runawayRows.map((r) => r.name));
        for (const expectedKey of [
            'AgentChannelConsecutiveTurns',
            'AgentChannelWakesPerHour',
            'AgentAbsoluteIterations',
            'MaxTasksPerAgentGraph',
            'WhileLoopMaxIterations',
            'ForEachMaxIterations',
            'MaxTasksPerGraph',
            'BriefingContributorTimeoutMs',
            'BriefingMaxContributorChars',
            'MaxWallClockMs',
        ]) {
            expect(runawayNames.has(expectedKey)).toBe(true);
        }
    });

    it('mechanically sweeps synthetic source files into classified CSV categories and excludes tests/generated dirs', () => {
        const tmpRepo = createTempRepo({
            'packages/SamplePkg/src/sample.ts': [
                'export const DEFAULT_ABSOLUTE_MAX_ITERATIONS = 5000;',
                'export const MAX_RETRIES = 3;',
                '// ProtocolLimit: RFC 5321 maximum email address length',
                'export const MAX_EMAIL_LENGTH = 254;',
                'export const MAX_PREVIEW_CHARS = 200;',
                'export const DEFAULT_CACHE_TTL_MINUTES = 60;',
            ].join('\n'),
            'packages/SamplePkg/src/__tests__/ignored.test.ts': 'export const MAX_TEST_ITERATIONS = 99;\n',
            'packages/SamplePkg/src/generated/ignored.ts': 'export const MAX_GEN_ITERATIONS = 99;\n',
            'packages/MJCore/src/generic/limitsConfig.ts': 'export const CODE_FALLBACK_LIMITS = { AgentAbsoluteIterations: 100000 };\n',
        });
        const outCsv = path.join(tmpRepo, 'inventory.csv');

        execFileSync(process.execPath, [SWEEP_SCRIPT_PATH, '--repo-root', tmpRepo, '--out', outCsv], {
            encoding: 'utf8',
        });

        const csvLines = fs.readFileSync(outCsv, 'utf8').trim().split(/\r?\n/);
        expect(csvLines[0]).toBe('file,line,name,value,enclosingFunction,label,disposition');
        const joined = csvLines.slice(1).join('\n');

        expect(joined).toContain('DEFAULT_ABSOLUTE_MAX_ITERATIONS,5000,<module>,RunawayGuard');
        expect(joined).toContain('MAX_RETRIES,3,<module>,ResourceGuard');
        expect(joined).toContain('MAX_EMAIL_LENGTH,254,<module>,ProtocolLimit,retained-protocol-limit-documented');
        expect(joined).toContain('MAX_PREVIEW_CHARS,200,<module>,UX,retained-ux-local');
        expect(joined).toContain('DEFAULT_CACHE_TTL_MINUTES,60,<module>,Tuning');
        expect(joined).toContain('AgentAbsoluteIterations,100000,<module>,RunawayGuard,canonical-limits-resolver');
        expect(joined).not.toContain('MAX_TEST_ITERATIONS');
        expect(joined).not.toContain('MAX_GEN_ITERATIONS');
    });

    it('fails check:standards (CLI sweep script and @memberjunction/standards CLI) when a synthetic unapproved RunawayGuard literal is introduced', () => {
        const failingRepo = createTempRepo({
            '.mj-standards.json': JSON.stringify(
                {
                    StandardsVersion: '1.0.0',
                    Checks: {
                        'limits-literals': {
                            Severity: 'error',
                            Roots: ['packages'],
                            Options: {
                                AllowedFiles: ['packages/MJCore/src/generic/limitsConfig.ts'],
                            },
                        },
                    },
                },
                null,
                2,
            ),
            'packages/BadPkg/src/runaway.ts': [
                'export const DEFAULT_AGENT_MAX_ITERATIONS = 5000;',
                'export const agentLoopMaxIterations = 250;',
            ].join('\n'),
        });

        // 1. Standalone CI guard script fails loudly
        const sweepCheck = spawnSync(
            process.execPath,
            [SWEEP_SCRIPT_PATH, '--check-standards', '--repo-root', failingRepo],
            { encoding: 'utf8' },
        );
        expect(sweepCheck.status).not.toBe(0);
        expect(sweepCheck.stderr.toLowerCase()).toContain('unapproved runawayguard literal');
        expect(sweepCheck.stderr).toContain('packages/BadPkg/src/runaway.ts');

        // 2. @memberjunction/standards CLI check (`mj-standards check` in repo cwd) also fails.
        // In sharded CI runs, @memberjunction/standards is not a direct dependency of ai-agents,
        // so ensure its dist/ entry point is built if the shard cache omitted it.
        if (!fs.existsSync(STANDARDS_DIST_INDEX)) {
            const buildRes = spawnSync('pnpm', ['run', 'build'], { cwd: STANDARDS_DIR, encoding: 'utf8' });
            expect(buildRes.status).toBe(0);
        }
        const standardsCheck = spawnSync(
            process.execPath,
            [STANDARDS_BIN_PATH, 'check'],
            { encoding: 'utf8', cwd: failingRepo },
        );
        expect(standardsCheck.status).not.toBe(0);
        const combinedOutput = `${standardsCheck.stdout ?? ''}\n${standardsCheck.stderr ?? ''}`;
        expect(combinedOutput).toContain('limits-literals');
        expect(combinedOutput).toContain('packages/BadPkg/src/runaway.ts');
    });

    it('passes the live MemberJunction repo check:standards limits-literals gate with zero violations', () => {
        const res = spawnSync(
            process.execPath,
            [SWEEP_SCRIPT_PATH, '--check-standards', '--repo-root', REPO_ROOT],
            { encoding: 'utf8' },
        );
        expect(res.status).toBe(0);
        expect(res.stdout).toContain('0 unapproved RunawayGuard literals');
    }, 120_000);

    it('resolves migrated RunawayGuard and ResourceGuard backstops dynamically through LimitsConfigResolver', () => {
        // Verify approved backstop constants
        expect(CODE_FALLBACK_LIMITS.AgentChannelConsecutiveTurns).toBe(1000);
        expect(CODE_FALLBACK_LIMITS.AgentChannelWakesPerHour).toBe(600);
        expect(CODE_FALLBACK_LIMITS.AgentAbsoluteIterations).toBe(100_000);
        expect(CODE_FALLBACK_LIMITS.MaxTasksPerAgentGraph).toBe(10_000);
        expect(CODE_FALLBACK_LIMITS.WhileLoopMaxIterations).toBe(1_000_000);
        expect(CODE_FALLBACK_LIMITS.ForEachMaxIterations).toBe(1_000_000);
        expect(CODE_FALLBACK_LIMITS.MaxTasksPerGraph).toBe(100_000);
        expect(CODE_FALLBACK_LIMITS.BriefingContributorTimeoutMs).toBe(10_000);
        expect(CODE_FALLBACK_LIMITS.BriefingMaxContributorChars).toBe(32_768);

        expect(MAX_TASKS_PER_AGENT_GRAPH).toBe(10_000);
        expect(MAX_TASKS_PER_GRAPH).toBe(100_000);
        expect(MAX_AGENT_RUN_TREE_DEPTH).toBe(100);
        expect(MAX_HANDOFF_HOPS).toBe(3);

        // Default helper outputs before MjConfig registration
        expect(TestBaseAgentAccessor.ReadAbsoluteMaxIterations()).toBe(100_000);
        expect(GetMaxTasksPerAgentGraph()).toBe(10_000);
        expect(GetMaxTasksPerGraph()).toBe(100_000);
        expect(GetMaxAgentRunTreeDepth()).toBe(100);
        expect(GetMaxHandoffHops()).toBe(3);
        expect(GetMaxRepeatedFailingStep()).toBe(3);
        expect(GetMaxSubAgentConsultRounds()).toBe(3);
        expect(GetMaxConversationToolCallsPerTurn()).toBe(8);

        // Dynamic Tier 2 MjConfig override propagation
        LimitsConfigResolver.Instance.RegisterMjConfigLimits({
            AgentAbsoluteIterations: 42_000,
            MaxTasksPerAgentGraph: 2_500,
            MaxTasksPerGraph: 25_000,
            ResourceGuards: {
                MaxRepeatedFailingStep: 7,
                MaxSubAgentConsultRounds: 9,
                MaxConversationToolCallsPerTurn: 12,
                MaxAgentRunTreeDepth: 40,
                MaxHandoffHops: 5,
            },
        });

        expect(TestBaseAgentAccessor.ReadAbsoluteMaxIterations()).toBe(42_000);
        expect(GetMaxTasksPerAgentGraph()).toBe(2_500);
        expect(GetMaxTasksPerGraph()).toBe(25_000);
        expect(GetMaxAgentRunTreeDepth()).toBe(40);
        expect(GetMaxHandoffHops()).toBe(5);
        expect(GetMaxRepeatedFailingStep()).toBe(7);
        expect(GetMaxSubAgentConsultRounds()).toBe(9);
        expect(GetMaxConversationToolCallsPerTurn()).toBe(12);
    });
});
