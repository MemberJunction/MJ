import { afterEach, describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DecisionAnswer } from '@memberjunction/ai';
import { OutputInsideRepoError } from '@memberjunction/testing-engine';
import {
    AUTHORED_FILE,
    CreateReplayFileSink,
    DECISIONS_FILE,
    PrepareReplayOutputDir,
    ReadAuthoredCacheFile,
    REPORT_JSON_FILE,
    REPORT_MARKDOWN_FILE
} from '../../finishif-replay/files';
import { FINISH_IF_SWEEP_THRESHOLDS } from '../../finishif-replay/metrics';
import { RunFinishIfReplay, type FinishIfReplayDeps } from '../../finishif-replay/replay';
import { GENERIC_FINISH_IF_QUESTION } from '../../finishif-replay/report';
import { BuildCorpus, Guid, SENTINEL } from './fixtures';

const HERE = dirname(fileURLToPath(import.meta.url));
const AUTHORED_TEXT = 'AUTHORED-ONLY-TEXT';

const created: string[] = [];

afterEach(() => {
    for (const dir of created.splice(0)) {
        rmSync(dir, { recursive: true, force: true });
    }
});

function scratchDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'finishif-replay-test-'));
    created.push(dir);
    return dir;
}

/** A replay over the text-heavy fixture corpus, writing through the file sink. */
function deps(outDir: string, logs: string[]): FinishIfReplayDeps {
    const corpus = BuildCorpus();
    let calls = 0;
    return {
        Corpus: { ReadSteps: async () => corpus.Steps, ReadPromptRuns: async () => corpus.PromptRuns },
        Author: { Author: async () => ({ FinishIf: { questions: [`${AUTHORED_TEXT} question`], message: `${AUTHORED_TEXT} message` }, Attempts: 1, Error: null }) },
        Decider: {
            Decide: async (state, questions) => {
                calls++;
                const Answers: Record<string, DecisionAnswer> = {};
                Object.keys(questions).forEach((key, i) => { Answers[key] = { Kind: 'Likelihood', Probability: (calls * 7 + i * 3) % 10 / 10 }; });
                return { Success: true, Answers, ModelName: 'Model A', PromptRunID: Guid(7, calls), LatencyMs: 40 + state.length % 7, Error: null };
            }
        },
        Costs: { ReadCosts: async ids => new Map(ids.map(id => [id, 0.0002] as const)) },
        Sink: CreateReplayFileSink(outDir, line => logs.push(line)),
        Now: () => new Date('2026-09-29T12:00:00Z')
    };
}

async function runInto(outDir: string): Promise<string[]> {
    const logs: string[] = [];
    await RunFinishIfReplay({
        Settings: {
            CorpusDatabase: 'corpus_db',
            DecisionPrompt: 'Default Decision',
            AuthorModel: 'Author Model',
            Arms: ['authored', 'generic'],
            Reps: 2,
            Seed: 7,
            Limit: null,
            ProductionThreshold: 0.9,
            Thresholds: [...FINISH_IF_SWEEP_THRESHOLDS],
            GenericQuestion: GENERIC_FINISH_IF_QUESTION,
            BootstrapResamples: 100,
            CalibrationFolds: 5
        },
        DryRun: false,
        Concurrency: 3,
        AuthoredCache: ReadAuthoredCacheFile(outDir)
    }, deps(outDir, logs));
    return logs;
}

describe('the output directory', () => {
    it('is refused inside a git working tree, before anything is created', () => {
        const inside = join(HERE, 'replay-output-that-must-not-exist');
        expect(() => PrepareReplayOutputDir(inside, [])).toThrow(OutputInsideRepoError);
        expect(existsSync(inside)).toBe(false);
    });

    it('is refused inside a listed repository, even when it is not itself in one', () => {
        const outside = scratchDir();
        expect(() => PrepareReplayOutputDir(join(outside, 'out'), [outside])).toThrow(OutputInsideRepoError);
    });

    it('is created outside one', () => {
        const out = join(scratchDir(), 'nested', 'out');
        expect(PrepareReplayOutputDir(out, [HERE])).toContain('nested');
        expect(existsSync(out)).toBe(true);
    });
});

describe('the written report', () => {
    it('holds no step text and no authored text, in either file', async () => {
        const out = PrepareReplayOutputDir(join(scratchDir(), 'out'), []);
        await runInto(out);

        const json = readFileSync(join(out, REPORT_JSON_FILE), 'utf-8');
        const markdown = readFileSync(join(out, REPORT_MARKDOWN_FILE), 'utf-8');
        for (const [name, text] of [['report.json', json], ['report.md', markdown]] as const) {
            expect(text.length, name).toBeGreaterThan(0);
            expect(text, name).not.toContain(SENTINEL);
            expect(text, name).not.toContain(AUTHORED_TEXT);
            expect(text, name).not.toContain('Web Search');
        }
        expect(readFileSync(join(out, DECISIONS_FILE), 'utf-8')).not.toContain(SENTINEL);
        expect(JSON.parse(json).Rounds).toHaveLength(5);
    });

    it('caches what was authored, and a re-run reuses it', async () => {
        const out = PrepareReplayOutputDir(join(scratchDir(), 'out'), []);
        await runInto(out);
        const cached = ReadAuthoredCacheFile(out);
        expect(cached.size).toBe(3);
        const logs = await runInto(out);
        expect(logs.join('\n')).toContain('planned: 0 rounds to author');
        expect(readFileSync(join(out, AUTHORED_FILE), 'utf-8').trim().split('\n')).toHaveLength(3);
    });
});
