import { execFile } from 'node:child_process';
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
import { RunAll } from './pipeline/Run';
import { IsValidRunID } from './pipeline/RunDir';

export const COMMANDS = ['generate', 'execute', 'assess', 'run', 'recheck', 'feedback', 'backtest', 'label', 'report'] as const;
export type CommandName = (typeof COMMANDS)[number];

/** The steps and the repository root lookup, injected so tests never run git, a container or a provider. */
export interface CliDeps {
    RepoRoot: () => Promise<string>;
    GenerateStep: typeof GenerateStep;
    ExecuteStep: typeof ExecuteStep;
    AssessStep: typeof AssessStep;
    RunAll: typeof RunAll;
}

const execFileAsync = promisify(execFile);
const DEFAULT_DEPS: CliDeps = {
    RepoRoot: async () => (await execFileAsync('git', ['rev-parse', '--show-toplevel'], { cwd: process.cwd() })).stdout.trim(),
    GenerateStep, ExecuteStep, AssessStep, RunAll,
};

const USAGE = `usage: jit-catch <${COMMANDS.join('|')}> [options]
  generate|run  --pr <n> | --head <sha> [--base <sha>]  [--trigger ${TriggerSchema.options.join('|')}] [--settings <file>] [--store <dir>]
  execute       --run <run ID> [--settings <file>]
  assess        --run <run ID> [--settings <file>] [--store <dir>]`;
const SHA_RE = /^[0-9a-f]{7,40}$/;

/** A command-line mistake; `Main` prints the usage and returns 2. */
class UsageError extends Error {}

interface Parsed { Command: CommandName; PR: number | null; RunID: string | null; Base?: string; Head?: string; Trigger: Trigger; SettingsPath?: string; Store?: string; }

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
    } });
    const command = COMMANDS.find((c) => c === positionals[0]);
    if (!command || positionals.length !== 1) throw new UsageError(positionals[0] ? `unknown command ${positionals[0]}` : 'no command');
    if (values.pr !== undefined && !/^[1-9]\d*$/.test(values.pr)) throw new UsageError(`--pr must be a positive whole number, not ${values.pr}`);
    for (const k of ['base', 'head'] as const) if (values[k] !== undefined && !SHA_RE.test(values[k])) throw new UsageError(`--${k} must be a lower-case commit SHA`);
    const trigger = TriggerSchema.safeParse(values.trigger ?? 'Local');
    if (!trigger.success) throw new UsageError(`--trigger must be one of ${TriggerSchema.options.join(', ')}`);
    const p: Parsed = { Command: command, PR: values.pr !== undefined ? Number(values.pr) : null, RunID: values.run ?? null, Base: values.base, Head: values.head, Trigger: trigger.data, SettingsPath: values.settings, Store: values.store };
    if ((command === 'generate' || command === 'run') && p.PR === null && !p.Head) throw new UsageError(`${command} needs --pr or --head`);
    if ((command === 'execute' || command === 'assess') && !p.RunID) throw new UsageError(`${command} needs --run`);
    if (p.RunID !== null && !IsValidRunID(p.RunID)) throw new UsageError(`--run must be a run ID (letters, digits, '-' and '_'), not ${JSON.stringify(p.RunID)}`);
    return p;
}

async function dispatch(p: Parsed, deps: CliDeps): Promise<number> {
    if (p.Command !== 'generate' && p.Command !== 'execute' && p.Command !== 'assess' && p.Command !== 'run') {
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
    }
    return 0;
}

/** One redacted line for stderr: a zod error as `path: message` pairs, anything else as the first line of its message. */
export function OneLine(e: unknown): string {
    if (e instanceof ZodError) return RedactTail(e.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; '));
    const message = e instanceof Error ? e.message : String(e);
    return RedactTail(message.split('\n').map((l) => l.trim()).find((l) => l.length > 0) ?? 'failed');
}
