import { existsSync, readFileSync } from 'node:fs';
import { z } from 'zod';
import type { GitRepo } from '../git/GitRepo';

const sha = z.string().regex(/^[0-9a-f]{40}$/);

export const SliceSchema = z.enum(['Tuning', 'HeldOut']);
export const BugPairSchema = z.object({ BugPR: z.number().int().positive(), FixPR: z.number().int().positive(), BugMergeSHA: sha, FixMergeSHA: sha, Description: z.string().min(1), Slice: SliceSchema });
export const CleanEntrySchema = z.object({ PR: z.number().int().positive(), MergeSHA: sha, Slice: SliceSchema });
export const CorpusSchema = z.object({ Version: z.literal(1), Seed: z.number().int(), Bug: z.array(BugPairSchema), Clean: z.array(CleanEntrySchema) })
    .refine(c => hasUniquePRs(c), { message: 'duplicate PR number: a bug PR may appear once across Bug and Clean entries; only a fix PR may also be a clean entry' });

export type Corpus = z.infer<typeof CorpusSchema>;
export type Slice = z.infer<typeof SliceSchema>;

/** Bug PRs are unique against every bug, fix and clean PR; fix PRs and clean PRs are each unique, and a fix PR may also be a clean PR. */
function hasUniquePRs(c: { Bug: { BugPR: number; FixPR: number }[]; Clean: { PR: number }[] }): boolean {
    const bugs = c.Bug.map(b => b.BugPR); const fixes = c.Bug.map(b => b.FixPR); const cleans = c.Clean.map(e => e.PR);
    const fixOrClean = new Set([...fixes, ...cleans]);
    return [bugs, fixes, cleans].every(isDistinct) && bugs.every(n => !fixOrClean.has(n));
}

function isDistinct(numbers: number[]): boolean { return new Set(numbers).size === numbers.length; }

/** Reads and validates a corpus JSON file. A missing file is reported as not found; the parser's message is not kept, because it quotes the file's content. */
export function LoadCorpus(path: string): Corpus {
    if (!existsSync(path)) throw new Error(`corpus file not found: ${path}`);
    let parsed: unknown;
    try { parsed = JSON.parse(readFileSync(path, 'utf8')); } catch { throw new Error(`corpus file is not valid JSON: ${path}`); }
    return CorpusSchema.parse(parsed);
}

/** mulberry32: a seeded generator of numbers in [0, 1). */
function random(seed: number): () => number { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** Deterministic: seeded Fisher–Yates (mulberry32). Held-out size = min(n, max(10, round(n / 3))); the rest is Tuning. */
export function AssignSlices<T extends object>(entries: T[], seed: number): (T & { Slice: Slice })[] {
    const n = entries.length;
    const next = random(seed);
    const order = entries.map((_, i) => i);
    for (let i = n - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
    }
    const heldOut = new Set(order.slice(0, Math.min(n, Math.max(10, Math.round(n / 3)))));
    return entries.map((e, i) => ({ ...e, Slice: heldOut.has(i) ? 'HeldOut' : 'Tuning' }));
}

/** Base is the landing commit's first parent, head the landing commit (D33). */
export async function RevisionsOf(mergeSHA: string, repo: Pick<GitRepo, 'FirstParent'>): Promise<{ BaseSHA: string; HeadSHA: string }> {
    return { BaseSHA: await repo.FirstParent(mergeSHA), HeadSHA: mergeSHA };
}
