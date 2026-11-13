import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { z } from 'zod';
import { SliceSchema, type Slice } from '../corpus/Corpus';
import type { RedactionCheck } from '../sandbox/Redaction';

const sha = z.string().regex(/^[0-9a-f]{40}$/);
const iso = z.iso.datetime();

/**
 * How one test run's catches compared with the fix of a bug pair. Filled by the matcher.
 * `Head` names the head the tests ran on: 'Patched' (bug head plus the fix PR's diff) or 'FixMerge' (the fix PR's merge commit);
 * it is set on Matched, NotMatched and PrepareFailed records. `Error` is the prepare error of a PrepareFailed record.
 */
export const MatchRecordSchema = z.object({
    Status: z.enum(['Matched', 'NotMatched', 'ApplyFailed', 'NoCatch', 'PrepareFailed']), ReportedMatched: z.boolean(), Tests: z.record(z.string(), z.boolean()),
    Head: z.enum(['Patched', 'FixMerge']).optional(), Error: z.string().optional(), At: iso,
});

/** One corpus PR in a backtest: its revisions, the run made for it, its status and what it cost. */
export const LedgerEntrySchema = z.object({
    PR: z.number().int().positive(), Set: z.enum(['Bug', 'Clean']), BaseSHA: sha, HeadSHA: sha, RunID: z.string().nullable(),
    Status: z.enum(['Pending', 'Assessed', 'Failed']), Error: z.string().nullable(), CostUSD: z.number().nonnegative(),
    StartedAt: iso.nullable(), EndedAt: iso.nullable(), Match: MatchRecordSchema.nullable(),
});

/** A backtest of one corpus slice and set with one generator model, with one entry per corpus PR. */
export const BacktestLedgerSchema = z.object({ ID: z.string(), CorpusPath: z.string(), Slice: SliceSchema, Set: z.enum(['Bug', 'Clean', 'Both']), Model: z.string(), CreatedAt: iso, Entries: z.array(LedgerEntrySchema) });

export type MatchRecord = z.infer<typeof MatchRecordSchema>;
export type LedgerEntry = z.infer<typeof LedgerEntrySchema>;
export type BacktestLedger = z.infer<typeof BacktestLedgerSchema>;

/** `<corpus basename>-<slice>-<set>-<model>` with every non [A-Za-z0-9_-] replaced by '_'. The corpus file's extension is left out. */
export function LedgerID(corpusPath: string, slice: Slice, set: 'Bug' | 'Clean' | 'Both', model: string): string {
    return `${basename(corpusPath, extname(corpusPath))}-${slice}-${set}-${model}`.replace(/[^A-Za-z0-9_-]/g, '_');
}

/** The ledger file `<repo root>/.jit-catch/backtests/<ledger ID>.json`. */
export class LedgerFile {
    public readonly Path: string;

    constructor(repoRoot: string, id: string, private readonly redaction: RedactionCheck) {
        this.Path = join(repoRoot, '.jit-catch', 'backtests', `${id}.json`);
    }

    public Exists(): boolean { return existsSync(this.Path); }

    /** Reads and validates the ledger. */
    public Read(): BacktestLedger { return BacktestLedgerSchema.parse(JSON.parse(readFileSync(this.Path, 'utf8'))); }

    /** Validates the ledger, checks its text for secrets, writes it to `<path>.tmp` and renames that file over the ledger. */
    public Write(l: BacktestLedger): void {
        const text = JSON.stringify(BacktestLedgerSchema.parse(l), null, 2) + '\n';
        this.redaction.AssertClean(text, 'backtest ledger');
        mkdirSync(join(this.Path, '..'), { recursive: true });
        writeFileSync(`${this.Path}.tmp`, text);
        renameSync(`${this.Path}.tmp`, this.Path);
    }
}
