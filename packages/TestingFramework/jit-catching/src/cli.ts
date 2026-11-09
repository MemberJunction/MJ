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
import { CleanRun, FinishedRunIDs } from './pipeline/Clean';
import { IsLabelAnswer, LABEL_ANSWERS, LabelCatch, LabelPacket, type LabelAnswer } from './pipeline/Label';
import { DefaultRedaction } from './pipeline/Deps';
import { GitHub } from './git/GitHub';
import { GitRepo } from './git/GitRepo';
import { PackageMap } from './analyzer/PackageMap';
import { SliceSchema, type Slice } from './corpus/Corpus';
import { BacktestStep, UnpricedModel } from './backtest/Backtest';
import { MatchStep } from './backtest/Match';
import { LedgerFile } from './backtest/Ledger';
import { LoadCorpus } from './corpus/Corpus';
import { FileCatchStore } from './store/FileCatchStore';
import { RunDir } from './pipeline/RunDir';
import { BuildGateReport, RenderMarkdown } from './report/Report';
import { FilterProcessWarnings } from './generator/ClaudeAgentGenerator';

export const COMMANDS = ['generate', 'execute', 'assess', 'run', 'recheck', 'feedback', 'backtest', 'label', 'report', 'corpus', 'clean'] as const;
export type CommandName = (typeof COMMANDS)[number];

/** The steps and the repository root lookup, injected so tests never run git, a container or a provider. */
export interface CliDeps {
    RepoRoot: () => Promise<string>;
    GenerateStep: typeof GenerateStep;
    ExecuteStep: typeof ExecuteStep;
    AssessStep: typeof AssessStep;
    RunAll: typeof RunAll;
    MineCorpus: (o: { RepoRoot: string; Since: string; Until: string }) => Promise<{ Clean: CleanCandidate[]; Bug: BugCandidate[] }>;
    CleanRun: typeof CleanRun;
    LabelCatch: typeof LabelCatch;
    LabelPacket: typeof LabelPacket;
    BacktestStep: typeof BacktestStep;
    MatchStep: typeof MatchStep;
    BuildGateReport: typeof BuildGateReport;
}

const execFileAsync = promisify(execFile);
const DEFAULT_DEPS: CliDeps = {
    RepoRoot: async () => (await execFileAsync('git', ['rev-parse', '--show-toplevel'], { cwd: process.cwd() })).stdout.trim(),
    GenerateStep, ExecuteStep, AssessStep, RunAll, CleanRun, LabelCatch, LabelPacket,
    MineCorpus: async (o) => {
        const d = { GitHub: new GitHub(), Repo: new GitRepo(o.RepoRoot), PackageMap: PackageMap.Load(o.RepoRoot) };
        return { Clean: await MineClean(d, o), Bug: await MineBugs(d, o) };
    },
    BacktestStep, MatchStep, BuildGateReport,
};

const USAGE = `usage: jit-catch <${COMMANDS.join('|')}> [options]
  generate|run  --pr <n> | --head <sha> [--base <sha>]  [--trigger ${TriggerSchema.options.join('|')}] [--settings <file>] [--store <dir>]
  execute       --run <run ID> [--settings <file>]
  assess        --run <run ID> [--settings <file>] [--store <dir>]
  label         --catch <catch ID> --answer ${LABEL_ANSWERS.join('|')} --user <login> [--store <dir>]
  label         --run <run ID> [--store <dir>]
  corpus mine   --since <YYYY-MM-DD> --until <YYYY-MM-DD> --out <file>
  clean         --run <run ID> | --all-finished
  backtest      --corpus <file> --slice ${SliceSchema.options.join('|')} --set Bug|Clean|Both --model <generator> --max-usd <n> [--only <n,n>] [--retry-failed] [--settings <file>] [--store <dir>]
                --max-usd counts the cost of the whole ledger, every attempt of a --retry-failed entry included, and is checked before each run, so the last run can take the total above it.
  backtest match --ledger <ledger ID> --corpus <file> [--settings <file>] [--store <dir>]
  report        --ledger <ledger ID>[,<ledger ID>…] --corpus <file> [--out <file.md>] [--settings <file>] [--store <dir>]`;
const SHA_RE = /^[0-9a-f]{7,40}$/;
const LEDGER_ID_RE = /^[A-Za-z0-9_-]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** A command-line mistake; `Main` prints the usage and returns 2. */
class UsageError extends Error {}

interface Parsed {
    Command: CommandName; PR: number | null; RunID: string | null; Base?: string; Head?: string; Trigger: Trigger; SettingsPath?: string; Store?: string;
    Since?: string; Until?: string; Out?: string; AllFinished: boolean;
    Label?: { CatchID: string; Answer: LabelAnswer; User: string };
    Backtest?: BacktestArgs;
    Match?: { LedgerID: string; CorpusPath: string };
    Report?: { LedgerIDs: string[]; CorpusPath: string };
}
interface BacktestArgs { CorpusPath: string; Slice: Slice; Set: 'Bug' | 'Clean' | 'Both'; Model: string; MaxUsd: number; Only?: number[]; RetryFailed: boolean; }
const BACKTEST_SETS = ['Bug', 'Clean', 'Both'] as const;

/** Installs the process warning filter that drops the SDK's canUseTool shadow notice. The `jit-catch` bin calls it before `Main`. */
export function InstallWarningFilter(): void { FilterProcessWarnings(['CLAUDE_SDK_CAN_USE_TOOL_SHADOWED']); }

/** Parses argv and dispatches one command. Returns the process exit code: 0 done, 1 failed, 2 usage error (also a `--model` the settings do not price), 3 backtest stopped early. */
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
        if (e instanceof UsageError) { process.stderr.write(`${USAGE}\n${e.message}\n`); return 2; }
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
        settings: { type: 'string' }, store: { type: 'string' }, trigger: { type: 'string' }, 'all-finished': { type: 'boolean' },
        since: { type: 'string' }, until: { type: 'string' }, out: { type: 'string' },
        catch: { type: 'string' }, answer: { type: 'string' }, user: { type: 'string' },
        corpus: { type: 'string' }, slice: { type: 'string' }, set: { type: 'string' }, model: { type: 'string' }, 'max-usd': { type: 'string' }, only: { type: 'string' }, 'retry-failed': { type: 'boolean' }, ledger: { type: 'string' },
    } });
    const command = COMMANDS.find((c) => c === positionals[0]);
    if (!command || positionals.length > (command === 'corpus' || command === 'backtest' ? 2 : 1)) throw new UsageError(positionals[0] ? `unknown command ${positionals[0]}` : 'no command');
    if (values.pr !== undefined && !/^[1-9]\d*$/.test(values.pr)) throw new UsageError(`--pr must be a positive whole number, not ${values.pr}`);
    for (const k of ['base', 'head'] as const) if (values[k] !== undefined && !SHA_RE.test(values[k])) throw new UsageError(`--${k} must be a lower-case commit SHA`);
    const trigger = TriggerSchema.safeParse(values.trigger ?? 'Local');
    if (!trigger.success) throw new UsageError(`--trigger must be one of ${TriggerSchema.options.join(', ')}`);
    const p: Parsed = { Command: command, PR: values.pr !== undefined ? Number(values.pr) : null, RunID: values.run ?? null, Base: values.base, Head: values.head, Trigger: trigger.data, SettingsPath: values.settings, Store: values.store, Since: values.since, Until: values.until, Out: values.out, AllFinished: values['all-finished'] ?? false };
    if (command === 'corpus') checkCorpusMine(positionals[1], p);
    if (command === 'backtest') parseBacktestForm(positionals[1], values, p);
    if (command === 'report') p.Report = parseReport(values.ledger, values.corpus);
    if ((command === 'generate' || command === 'run') && p.PR === null && !p.Head) throw new UsageError(`${command} needs --pr or --head`);
    if ((command === 'execute' || command === 'assess') && !p.RunID) throw new UsageError(`${command} needs --run`);
    if (command === 'clean' && (p.RunID === null) === !p.AllFinished) throw new UsageError('clean needs --run or --all-finished, not both');
    if (command === 'label') p.Label = parseLabel(values.catch, values.answer, values.user, p.RunID);
    if (p.RunID !== null && !IsValidRunID(p.RunID)) throw new UsageError(`--run must be a run ID (letters, digits, '-' and '_'), not ${JSON.stringify(p.RunID)}`);
    return p;
}

/** `corpus` has one subcommand, `mine`, which needs --since and --until as YYYY-MM-DD and --out. */
function checkCorpusMine(sub: string | undefined, p: Parsed): void {
    if (sub !== 'mine') throw new UsageError(sub ? `unknown corpus subcommand ${sub}` : 'corpus needs the subcommand mine');
    for (const k of ['Since', 'Until'] as const) if (!p[k] || !DATE_RE.test(p[k])) throw new UsageError(`corpus mine needs --${k.toLowerCase()} as YYYY-MM-DD`);
    if (!p.Out) throw new UsageError('corpus mine needs --out');
}

/** `backtest` runs the backtest; `backtest match` needs only --ledger, a ledger file name, and --corpus. */
function parseBacktestForm(sub: string | undefined, v: Parameters<typeof parseBacktest>[0] & { ledger?: string }, p: Parsed): void {
    if (sub === undefined) { p.Backtest = parseBacktest(v); return; }
    if (sub !== 'match') throw new UsageError(`unknown backtest subcommand ${sub}`);
    const ids = ledgerIDs(v.ledger);
    if (ids === null || ids.length !== 1) throw new UsageError('backtest match needs --ledger as a ledger ID (letters, digits, \'-\' and \'_\')');
    if (!v.corpus) throw new UsageError('backtest match needs --corpus');
    p.Match = { LedgerID: ids[0], CorpusPath: resolve(v.corpus) };
}

/** The ledger IDs in `text`, separated by commas; null when it is missing or an item is not a ledger ID. */
function ledgerIDs(text: string | undefined): string[] | null {
    const ids = text?.split(',') ?? [];
    return ids.length > 0 && ids.every((id) => LEDGER_ID_RE.test(id)) ? ids : null;
}

/** `report` needs --ledger as ledger IDs separated by commas, and --corpus. */
function parseReport(ledger: string | undefined, corpus: string | undefined): Parsed['Report'] {
    const ids = ledgerIDs(ledger);
    if (ids === null) throw new UsageError('report needs --ledger as ledger IDs (letters, digits, \'-\' and \'_\') separated by commas');
    if (!corpus) throw new UsageError('report needs --corpus');
    return { LedgerIDs: ids, CorpusPath: resolve(corpus) };
}

/** Checks and converts the `backtest` options; --max-usd is required. */
function parseBacktest(v: { corpus?: string; slice?: string; set?: string; model?: string; 'max-usd'?: string; only?: string; 'retry-failed'?: boolean }): BacktestArgs {
    if (!v.corpus) throw new UsageError('backtest needs --corpus');
    if (!v.model) throw new UsageError('backtest needs --model');
    const slice = SliceSchema.safeParse(v.slice);
    if (!slice.success) throw new UsageError(`--slice must be ${SliceSchema.options.join(' or ')}`);
    const set = BACKTEST_SETS.find((s) => s === v.set);
    if (!set) throw new UsageError('--set must be Bug, Clean or Both');
    if (v['max-usd'] === undefined) throw new UsageError('backtest needs --max-usd');
    const maxUsd = Number(v['max-usd']);
    if (!Number.isFinite(maxUsd) || maxUsd <= 0) throw new UsageError('--max-usd must be a positive number');
    if (v.only !== undefined && !/^[1-9]\d*(,[1-9]\d*)*$/.test(v.only)) throw new UsageError('--only must be PR numbers separated by commas');
    return { CorpusPath: resolve(v.corpus), Slice: slice.data, Set: set, Model: v.model, MaxUsd: maxUsd, Only: v.only?.split(',').map(Number), RetryFailed: v['retry-failed'] === true };
}

/** Mines the corpus candidates, checks the text for secrets, writes `{ Clean, Bug }` to --out and prints the counts. */
async function corpusMine(p: Parsed, deps: CliDeps): Promise<number> {
    const mined = await deps.MineCorpus({ RepoRoot: await deps.RepoRoot(), Since: p.Since ?? '', Until: p.Until ?? '' });
    const text = JSON.stringify({ Clean: mined.Clean, Bug: mined.Bug }, null, 2) + '\n';
    DefaultRedaction().AssertClean(text, 'corpus mine output');
    writeFileSync(resolve(p.Out ?? ''), text);
    process.stdout.write(`${mined.Clean.length} clean, ${mined.Bug.length} bug candidates written to ${p.Out}\n`);
    return 0;
}

/** The label options: `--catch` with `--answer` and `--user`, or none of them when `--run` asks for a packet. */
function parseLabel(catchID: string | undefined, answer: string | undefined, user: string | undefined, runID: string | null): Parsed['Label'] {
    if (catchID === undefined) {
        if (runID === null) throw new UsageError('label needs --catch or --run');
        return undefined;
    }
    if (runID !== null) throw new UsageError('label needs --catch or --run, not both');
    if (answer === undefined || !IsLabelAnswer(answer)) throw new UsageError(`--answer must be one of ${LABEL_ANSWERS.join(', ')}`);
    if (!user) throw new UsageError('label --catch needs --user');
    return { CatchID: catchID, Answer: answer, User: user };
}

/** The parsed `backtest` options; `parse` sets them for every backtest command but `backtest match`. */
function backtestArgs(p: Parsed): BacktestArgs {
    if (!p.Backtest) throw new Error('backtest options were not parsed');
    return p.Backtest;
}

/** The parsed `backtest` options, after checking that the settings price `--model`; a usage error otherwise. */
function pricedBacktestArgs(p: Parsed, settings: Settings): BacktestArgs {
    const args = backtestArgs(p);
    const unpriced = UnpricedModel(settings.Prices, args.Model);
    if (unpriced) throw new UsageError(unpriced);
    return args;
}

async function dispatch(p: Parsed, deps: CliDeps): Promise<number> {
    if (p.Command === 'corpus') return corpusMine(p, deps);
    if (p.Command === 'clean') return clean(p, deps);
    if (p.Command === 'report') return report(p, deps);
    if (p.Command !== 'generate' && p.Command !== 'execute' && p.Command !== 'assess' && p.Command !== 'run' && p.Command !== 'label' && p.Command !== 'backtest') {
        process.stderr.write(`${p.Command}: not implemented (phase 2/3)\n`);
        return 1;
    }
    const repoRoot = await deps.RepoRoot();
    if (p.Command === 'label') return label(p, deps, repoRoot);
    const settings: Settings = LoadSettings(p.SettingsPath);
    const storeDir = p.Store ? resolve(p.Store) : join(repoRoot, '.jit-catch', 'store');
    const runID = p.RunID ?? '';
    switch (p.Command) {
        case 'generate': await deps.GenerateStep({ PR: p.PR, BaseSHA: p.Base, HeadSHA: p.Head, Trigger: p.Trigger, RepoRoot: repoRoot, Settings: settings }); break;
        case 'execute': await deps.ExecuteStep({ RunID: runID, RepoRoot: repoRoot, Settings: settings }); break;
        case 'assess': await deps.AssessStep({ RunID: runID, RepoRoot: repoRoot, Settings: settings, StoreDir: storeDir }); break;
        case 'run': await deps.RunAll({ PR: p.PR, BaseSHA: p.Base, HeadSHA: p.Head, Trigger: p.Trigger, RepoRoot: repoRoot, Settings: settings, StoreDir: storeDir }); break;
        case 'backtest':
            if (p.Match) await deps.MatchStep({ ...p.Match, RepoRoot: repoRoot, Settings: settings, StoreDir: storeDir });
            else if ((await deps.BacktestStep({ ...pricedBacktestArgs(p, settings), RepoRoot: repoRoot, Settings: settings, StoreDir: storeDir })).Stopped !== null) return 3;
            break;
    }
    return 0;
}

/** Builds the gate-1 report from the ledgers, the corpus and the store, checks it for secrets, and writes it to --out or stdout. */
async function report(p: Parsed, deps: CliDeps): Promise<number> {
    const repoRoot = await deps.RepoRoot();
    if (!p.Report) throw new Error('report options were not parsed');
    const o = p.Report;
    const redaction = DefaultRedaction();
    const ledgers = o.LedgerIDs.map((id) => {
        const file = new LedgerFile(repoRoot, id, redaction);
        if (!file.Exists()) throw new Error(`no backtest ledger ${id} at ${file.Path}`);
        return file.Read();
    });
    const store = new FileCatchStore(p.Store ? resolve(p.Store) : join(repoRoot, '.jit-catch', 'store'), redaction);
    const r = await deps.BuildGateReport({ Ledgers: ledgers, Corpus: LoadCorpus(o.CorpusPath), Store: store, RunDirOf: (id) => new RunDir(repoRoot, id, redaction), Prices: LoadSettings(p.SettingsPath).Prices });
    const md = RenderMarkdown(r);
    redaction.AssertClean(md, 'gate report');
    if (p.Out) writeFileSync(resolve(p.Out), md);
    else process.stdout.write(md);
    return 0;
}

/** Cleans the run named by `--run`, or every finished run with `--all-finished`. */
async function clean(p: Parsed, deps: CliDeps): Promise<number> {
    const repoRoot = await deps.RepoRoot();
    const repo = new GitRepo(repoRoot);
    for (const id of p.RunID !== null ? [p.RunID] : FinishedRunIDs(repoRoot)) await deps.CleanRun(repoRoot, id, repo);
    return 0;
}

/** Records one label, or prints the label packet of a run to stdout. */
async function label(p: Parsed, deps: CliDeps, repoRoot: string): Promise<number> {
    const storeDir = p.Store ? resolve(p.Store) : join(repoRoot, '.jit-catch', 'store');
    const redaction = DefaultRedaction();
    if (p.Label) await deps.LabelCatch({ StoreDir: storeDir, CatchID: p.Label.CatchID, Answer: p.Label.Answer, User: p.Label.User, Redaction: redaction });
    else process.stdout.write(await deps.LabelPacket({ StoreDir: storeDir, RepoRoot: repoRoot, RunID: p.RunID ?? '', Redaction: redaction }));
    return 0;
}

/** One redacted line for stderr: a `RunAllError` as its cause, a zod error as `path: message` pairs, anything else as the first line of its message. */
export function OneLine(e: unknown): string {
    if (e instanceof RunAllError) return OneLine(e.cause);
    if (e instanceof ZodError) return RedactTail(e.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; '));
    const message = e instanceof Error ? e.message : String(e);
    return RedactTail(message.split('\n').map((l) => l.trim()).find((l) => l.length > 0) ?? 'failed');
}
