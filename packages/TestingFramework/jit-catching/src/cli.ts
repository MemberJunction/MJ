import { execFile } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { parseArgs } from 'node:util';
import { ZodError } from 'zod';
import { LoadSettings, type Settings } from './settings';
import { TriggerSchema } from './schemas';
import { RedactTail } from './sandbox/Redaction';
import type { Trigger } from './types';
import { GenerateStep } from './pipeline/Generate';
import { ExecuteStep } from './pipeline/Execute';
import { AssessStep } from './pipeline/Assess';
import { RunAll, RunAllError } from './pipeline/Run';
import { IsValidRunID } from './pipeline/RunDir';
import { MineClean, MineBugs, type CleanCandidate, type BugCandidate } from './corpus/Miner';
import { GitHub } from './git/GitHub';
import { GitRepo } from './git/GitRepo';
import { PackageMap } from './analyzer/PackageMap';
import { SliceSchema, type Slice } from './corpus/Corpus';
import { BacktestStep } from './backtest/Backtest';

export const COMMANDS = ['generate', 'execute', 'assess', 'run', 'recheck', 'feedback', 'backtest', 'label', 'report', 'corpus'] as const;
export type CommandName = (typeof COMMANDS)[number];

/** The steps and the repository root lookup, injected so tests never run git, a container or a provider. */
export interface CliDeps {
    RepoRoot: () => Promise<string>;
    GenerateStep: typeof GenerateStep;
    ExecuteStep: typeof ExecuteStep;
    AssessStep: typeof AssessStep;
    RunAll: typeof RunAll;
    MineCorpus: (o: { RepoRoot: string; Since: string; Until: string }) => Promise<{ Clean: CleanCandidate[]; Bug: BugCandidate[] }>;
    BacktestStep: typeof BacktestStep;
}

const execFileAsync = promisify(execFile);
const DEFAULT_DEPS: CliDeps = {
    RepoRoot: async () => (await execFileAsync('git', ['rev-parse', '--show-toplevel'], { cwd: process.cwd() })).stdout.trim(),
    GenerateStep, ExecuteStep, AssessStep, RunAll,
    MineCorpus: async (o) => {
        const d = { GitHub: new GitHub(), Repo: new GitRepo(o.RepoRoot), PackageMap: PackageMap.Load(o.RepoRoot) };
        return { Clean: await MineClean(d, o), Bug: await MineBugs(d, o) };
    },
    BacktestStep,
};

const USAGE = `usage: jit-catch <${COMMANDS.join('|')}> [options]
  generate|run  --pr <n> | --head <sha> [--base <sha>]  [--trigger ${TriggerSchema.options.join('|')}] [--settings <file>] [--store <dir>]
  execute       --run <run ID> [--settings <file>]
  assess        --run <run ID> [--settings <file>] [--store <dir>]
  corpus mine   --since <YYYY-MM-DD> --until <YYYY-MM-DD> --out <file>
  backtest      --corpus <file> --slice ${SliceSchema.options.join('|')} --set Bug|Clean|Both --model <generator> [--max-usd <n, default 50>] [--only <n,n>] [--retry-failed] [--settings <file>] [--store <dir>]
                --max-usd counts the cost of the whole ledger, every attempt of a --retry-failed entry included, and is checked before each run, so the last run can take the total above it.`;
const SHA_RE = /^[0-9a-f]{7,40}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** A command-line mistake; `Main` prints the usage and returns 2. */
class UsageError extends Error {}

interface Parsed { Command: CommandName; PR: number | null; RunID: string | null; Base?: string; Head?: string; Trigger: Trigger; SettingsPath?: string; Store?: string; Since?: string; Until?: string; Out?: string; Backtest?: BacktestArgs; }
interface BacktestArgs { CorpusPath: string; Slice: Slice; Set: 'Bug' | 'Clean' | 'Both'; Model: string; MaxUsd: number; Only?: number[]; RetryFailed: boolean; }
const BACKTEST_SETS = ['Bug', 'Clean', 'Both'] as const;

/** Parses argv and dispatches one command. Returns the process exit code: 0 done, 1 failed, 2 usage error. */
export async function Main(argv: string[], deps: CliDeps = DEFAULT_DEPS): Promise<number> {
    let p: Parsed;
    try { p = parse(argv); }
    catch (e) {
        if (!(e instanceof UsageError) && !isParseArgsError(e)) throw e;
        process.stderr.write(`${USAGE}\n${e.message}\n`);
        return 2;
    }
    try { return await dispatch(p, deps); }
    catch (e) {
        process.stderr.write(`jit-catch ${p.Command}: ${OneLine(e)}\n`);
        return 1;
    }
}

/** Node's parseArgs reports an unknown option or a missing value with an `ERR_PARSE_ARGS_*` code. */
function isParseArgsError(e: unknown): e is Error {
    return e instanceof Error && 'code' in e && typeof e.code === 'string' && e.code.startsWith('ERR_PARSE_ARGS');
}

function parse(argv: string[]): Parsed {
    const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, strict: true, options: {
        pr: { type: 'string' }, run: { type: 'string' }, base: { type: 'string' }, head: { type: 'string' },
        settings: { type: 'string' }, store: { type: 'string' }, trigger: { type: 'string' },
        since: { type: 'string' }, until: { type: 'string' }, out: { type: 'string' },
        corpus: { type: 'string' }, slice: { type: 'string' }, set: { type: 'string' }, model: { type: 'string' }, 'max-usd': { type: 'string' }, only: { type: 'string' }, 'retry-failed': { type: 'boolean' },
    } });
    const command = COMMANDS.find((c) => c === positionals[0]);
    if (!command || positionals.length > (command === 'corpus' ? 2 : 1)) throw new UsageError(positionals[0] ? `unknown command ${positionals[0]}` : 'no command');
    if (values.pr !== undefined && !/^[1-9]\d*$/.test(values.pr)) throw new UsageError(`--pr must be a positive whole number, not ${values.pr}`);
    for (const k of ['base', 'head'] as const) if (values[k] !== undefined && !SHA_RE.test(values[k])) throw new UsageError(`--${k} must be a lower-case commit SHA`);
    const trigger = TriggerSchema.safeParse(values.trigger ?? 'Local');
    if (!trigger.success) throw new UsageError(`--trigger must be one of ${TriggerSchema.options.join(', ')}`);
    const p: Parsed = { Command: command, PR: values.pr !== undefined ? Number(values.pr) : null, RunID: values.run ?? null, Base: values.base, Head: values.head, Trigger: trigger.data, SettingsPath: values.settings, Store: values.store, Since: values.since, Until: values.until, Out: values.out };
    if (command === 'corpus') checkCorpusMine(positionals[1], p);
    if (command === 'backtest') p.Backtest = parseBacktest(values);
    if ((command === 'generate' || command === 'run') && p.PR === null && !p.Head) throw new UsageError(`${command} needs --pr or --head`);
    if ((command === 'execute' || command === 'assess') && !p.RunID) throw new UsageError(`${command} needs --run`);
    if (p.RunID !== null && !IsValidRunID(p.RunID)) throw new UsageError(`--run must be a run ID (letters, digits, '-' and '_'), not ${JSON.stringify(p.RunID)}`);
    return p;
}

/** `corpus` has one subcommand, `mine`, which needs --since and --until as YYYY-MM-DD and --out. */
function checkCorpusMine(sub: string | undefined, p: Parsed): void {
    if (sub !== 'mine') throw new UsageError(sub ? `unknown corpus subcommand ${sub}` : 'corpus needs the subcommand mine');
    for (const k of ['Since', 'Until'] as const) if (!p[k] || !DATE_RE.test(p[k])) throw new UsageError(`corpus mine needs --${k.toLowerCase()} as YYYY-MM-DD`);
    if (!p.Out) throw new UsageError('corpus mine needs --out');
}

/** Checks and converts the `backtest` options; --max-usd defaults to 50. */
function parseBacktest(v: { corpus?: string; slice?: string; set?: string; model?: string; 'max-usd'?: string; only?: string; 'retry-failed'?: boolean }): BacktestArgs {
    if (!v.corpus) throw new UsageError('backtest needs --corpus');
    if (!v.model) throw new UsageError('backtest needs --model');
    const slice = SliceSchema.safeParse(v.slice);
    if (!slice.success) throw new UsageError(`--slice must be ${SliceSchema.options.join(' or ')}`);
    const set = BACKTEST_SETS.find((s) => s === v.set);
    if (!set) throw new UsageError('--set must be Bug, Clean or Both');
    const maxUsd = Number(v['max-usd'] ?? '50');
    if (!Number.isFinite(maxUsd) || maxUsd <= 0) throw new UsageError('--max-usd must be a positive number');
    if (v.only !== undefined && !/^[1-9]\d*(,[1-9]\d*)*$/.test(v.only)) throw new UsageError('--only must be PR numbers separated by commas');
    return { CorpusPath: resolve(v.corpus), Slice: slice.data, Set: set, Model: v.model, MaxUsd: maxUsd, Only: v.only?.split(',').map(Number), RetryFailed: v['retry-failed'] === true };
}

/** Mines the corpus candidates, writes `{ Clean, Bug }` to --out and prints the counts. */
async function corpusMine(p: Parsed, deps: CliDeps): Promise<number> {
    const mined = await deps.MineCorpus({ RepoRoot: await deps.RepoRoot(), Since: p.Since ?? '', Until: p.Until ?? '' });
    writeFileSync(resolve(p.Out ?? ''), JSON.stringify({ Clean: mined.Clean, Bug: mined.Bug }, null, 2) + '\n');
    process.stdout.write(`${mined.Clean.length} clean, ${mined.Bug.length} bug candidates written to ${p.Out}\n`);
    return 0;
}

/** The parsed `backtest` options; `parse` sets them for every backtest command. */
function backtestArgs(p: Parsed): BacktestArgs {
    if (!p.Backtest) throw new Error('backtest options were not parsed');
    return p.Backtest;
}

async function dispatch(p: Parsed, deps: CliDeps): Promise<number> {
    if (p.Command === 'corpus') return corpusMine(p, deps);
    if (p.Command !== 'generate' && p.Command !== 'execute' && p.Command !== 'assess' && p.Command !== 'run' && p.Command !== 'backtest') {
        process.stderr.write(`${p.Command}: not implemented (phase 2/3)\n`);
        return 1;
    }
    const repoRoot = await deps.RepoRoot();
    const settings: Settings = LoadSettings(p.SettingsPath);
    const storeDir = p.Store ? resolve(p.Store) : join(repoRoot, '.jit-catch', 'store');
    const runID = p.RunID ?? '';
    switch (p.Command) {
        case 'generate': await deps.GenerateStep({ PR: p.PR, BaseSHA: p.Base, HeadSHA: p.Head, Trigger: p.Trigger, RepoRoot: repoRoot, Settings: settings }); break;
        case 'execute': await deps.ExecuteStep({ RunID: runID, RepoRoot: repoRoot, Settings: settings }); break;
        case 'assess': await deps.AssessStep({ RunID: runID, RepoRoot: repoRoot, Settings: settings, StoreDir: storeDir }); break;
        case 'run': await deps.RunAll({ PR: p.PR, BaseSHA: p.Base, HeadSHA: p.Head, Trigger: p.Trigger, RepoRoot: repoRoot, Settings: settings, StoreDir: storeDir }); break;
        case 'backtest': await deps.BacktestStep({ ...backtestArgs(p), RepoRoot: repoRoot, Settings: settings, StoreDir: storeDir }); break;
    }
    return 0;
}

/** One redacted line for stderr: a `RunAllError` as its cause, a zod error as `path: message` pairs, anything else as the first line of its message. */
export function OneLine(e: unknown): string {
    if (e instanceof RunAllError) return OneLine(e.cause);
    if (e instanceof ZodError) return RedactTail(e.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; '));
    const message = e instanceof Error ? e.message : String(e);
    return RedactTail(message.split('\n').map((l) => l.trim()).find((l) => l.length > 0) ?? 'failed');
}
