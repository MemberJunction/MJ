/**
 * files.ts — where the finishIf replay writes, and the refusal to write inside a repository.
 *
 * `authored.jsonl` holds text an LLM wrote from the corpus, and `decisions.jsonl` and the report are
 * derived from it, so the output directory must be outside every git working tree. The replay refuses
 * outright, before it writes anything, otherwise.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AssertOutputOutsideRepo } from '@memberjunction/testing-engine';
import { ParseAuthoredCache, SerializeAuthoredLine } from './author';
import type { ReplaySink } from './replay';
import type { AuthoredFinishIf } from './types';

/** The authored finishIfs, one `{ roundId, questions, message }` per line. */
export const AUTHORED_FILE = 'authored.jsonl';
/** Each decision as it returned, IDs and numbers only. */
export const DECISIONS_FILE = 'decisions.jsonl';
export const REPORT_JSON_FILE = 'report.json';
export const REPORT_MARKDOWN_FILE = 'report.md';

/**
 * Resolves the output directory and creates it. Throws `OutputInsideRepoError`, creating nothing,
 * when it is inside a git working tree: the one it sits in, or any of `repoRoots`.
 *
 * @param outDir The directory, as given.
 * @param repoRoots Repositories it must also stay out of (the rig's own, for one).
 */
export function PrepareReplayOutputDir(outDir: string, repoRoots: readonly string[]): string {
    const resolved = AssertOutputOutsideRepo(outDir, repoRoots);
    mkdirSync(resolved, { recursive: true });
    return resolved;
}

/** The authored finishIfs an earlier run cached in the directory, by normalized round ID. */
export function ReadAuthoredCacheFile(outDir: string): Map<string, AuthoredFinishIf> {
    const path = join(outDir, AUTHORED_FILE);
    return existsSync(path) ? ParseAuthoredCache(readFileSync(path, 'utf-8')) : new Map();
}

/**
 * A sink that writes into a directory from {@link PrepareReplayOutputDir}, and logs through `log`.
 *
 * @param outDir The prepared directory.
 * @param log Where log lines go; never into a file.
 */
export function CreateReplayFileSink(outDir: string, log: (line: string) => void): ReplaySink {
    return {
        AppendAuthored: entry => appendFileSync(join(outDir, AUTHORED_FILE), `${SerializeAuthoredLine(entry)}\n`),
        AppendDecision: observation => appendFileSync(join(outDir, DECISIONS_FILE), `${JSON.stringify(observation)}\n`),
        WriteReport: (report, markdown) => {
            writeFileSync(join(outDir, REPORT_JSON_FILE), `${JSON.stringify(report, null, 2)}\n`);
            writeFileSync(join(outDir, REPORT_MARKDOWN_FILE), `${markdown}\n`);
            log(`wrote ${join(outDir, REPORT_MARKDOWN_FILE)} and ${REPORT_JSON_FILE}`);
        },
        Log: log
    };
}
