import { closeSync, constants, existsSync, lstatSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync, writeSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { query, tool, createSdkMcpServer, type CanUseTool, type McpSdkServerConfigWithInstance, type Options, type SDKResultMessage } from '@anthropic-ai/claude-agent-sdk';
import { BaseTestGenerator } from '../contracts/BaseTestGenerator';
import type { CandidateTest, GenerationRequest, GenerationResult, MutantEdit, Risk, TokenUsage } from '../types';
import type { Sandbox } from '../sandbox/Sandbox';
import type { PackageMap } from '../analyzer/PackageMap';
import type { Settings } from '../settings';
import { NewID } from '../ids';
import { RedactionCheck, SecretsFromEnvironment } from '../sandbox/Redaction';
import { RunTestTool, type LastMutantRecord, type RunTestInput, type RunTestOutput, type RunTestToolOptions } from './RunTestTool';
import { BuildSystemPrompt, BuildTaskPrompt, type PromptContext } from './prompts';
import { AgentEnv, AssertApiKeySource, IsInside, ReadAllowed } from './AgentGuards';
import { SessionError, UsageCounter, type Price } from './UsageCounter';
import { GeminiRunner } from './GeminiRunner';
import { RunTestShape, WriteTestShape } from './ToolShapes';
import { GeneratorVendor } from '../pipeline/Preflight';

export type AgentMessage =
    | { Type: 'result'; Usage: { InputTokens: number; OutputTokens: number; CacheReadTokens: number }; CostUSD: number; Turns: number; Subtype: string }
    | { Type: 'assistant'; Text: string }
    | { Type: 'tool'; Name: string; Input: unknown; Output: unknown };
export interface AgentHooks { WriteFile: (repoRelative: string, source: string) => Promise<string>; RunTest: (file: string, mutant?: { Edits: MutantEdit[] }) => Promise<RunTestOutput>; }
/** `Effort` is the generator's thinking effort; absent means the provider default. Only the Gemini runner uses it. */
export interface AgentRunOptions { Cwd: string; Model: string; MaxTurns: number; TokenBudget: number; BudgetUsd: number; Price: Price | null; Hooks: AgentHooks; Effort?: 'low' | 'medium' | 'high'; }
export type AgentRunner = (prompt: string, system: string, o: AgentRunOptions) => AsyncIterable<AgentMessage>;
/** The part of `RunTestTool` the generator uses. */
export type RunTestRunner = Pick<RunTestTool, 'Run' | 'LastMutant'>;
export interface ClaudeAgentGeneratorOptions {
    Sandbox: Sandbox; ScratchRoot: string; Settings: Settings; PackageMap: PackageMap; TranscriptDir: string;
    Runner?: AgentRunner; RunTestFactory?: (o: RunTestToolOptions) => RunTestRunner;
}

/** What the generator knows about one allocated file: the source written through write_test and what run_test proved on it. */
interface FileRecord { Source: string; Base: boolean; Mutant: LastMutantRecord | null; }

/** State of one generation session. `RiskOf` maps each allocated file ID to the risk it tests (IntentAware only). */
interface Session {
    Request: GenerationRequest; PackageDir: string; JitDir: string; IDs: string[]; RiskOf: Map<string, Risk>;
    Tool: RunTestRunner; Files: Map<string, FileRecord>; Transcript: string[];
}

const WRITE_FLAGS = constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW;

/** The risk as a test's `RiskText`: what could break and the symbol. */
export function RiskText(risk: Risk): string { return `${risk.WhatCouldBreak} (${risk.Symbol})`; }

/** The session's risk IDs joined with `+`, or null for a session without risks. */
export function SessionRiskID(r: Pick<GenerationRequest, 'Risks'>): string | null { return r.Risks.length ? r.Risks.map((x) => x.ID).join('+') : null; }

/**
 * One agent session per (package, method[, risk group]) that only writes tests and proves them with run_test (§8.2, §8.3).
 * An IntentAware session gets `TestsPerRisk` files per risk, and its turn, token and USD limits are multiplied by its number of risks.
 */
export class ClaudeAgentGenerator extends BaseTestGenerator {
    constructor(private readonly o: ClaudeAgentGeneratorOptions) { super(); }

    public async Generate(r: GenerationRequest): Promise<GenerationResult> {
        const pkg = this.o.PackageMap.Get(r.Package); if (!pkg) throw new Error(`unknown package ${r.Package}`);
        const jitDir = `${pkg.Dir}/src/__tests__/jit`; mkdirSync(join(r.BaseRootDir, jitDir), { recursive: true });
        const perRisk = r.Risks.map(() => Array.from({ length: r.Limits.TestsPerRisk }, () => NewID()));
        const ids = r.Method === 'DodgyDiff' ? Array.from({ length: r.Limits.TestsPerPackage }, () => NewID()) : perRisk.flat();
        const riskOf = new Map(perRisk.flatMap((group, i) => group.map((id): [string, Risk] => [id, r.Risks[i]])));
        const factory = this.o.RunTestFactory ?? ((x: RunTestToolOptions) => new RunTestTool(x));
        const s: Session = { Request: r, PackageDir: pkg.Dir, JitDir: jitDir, IDs: ids, RiskOf: riskOf, Files: new Map(), Transcript: [],
            Tool: factory({ Sandbox: this.o.Sandbox, BaseRootDir: r.BaseRootDir, PackageRelDir: pkg.Dir, PackageName: r.Package, ScratchRoot: this.o.ScratchRoot, Settings: this.o.Settings }) };
        let usage: TokenUsage = { Model: r.Model, InputTokens: 0, OutputTokens: 0, CacheReadTokens: 0, CostUSD: 0 }; let subtype = 'none'; let turns = 0;
        const transcriptPath = this.transcriptPath(s);
        try {
            const ctx = buildContext(s, perRisk);
            const scale = Math.max(1, r.Risks.length);
            const options: AgentRunOptions = { Cwd: r.BaseRootDir, Model: r.Model, MaxTurns: r.Limits.TurnsPerSession * scale, TokenBudget: r.Limits.TokensPerSession * scale, BudgetUsd: r.Limits.UsdPerSession * scale,
                Price: this.o.Settings.Prices[r.Model] ?? null, Effort: this.o.Settings.GeneratorEffort, Hooks: { WriteFile: (rel, source) => writeTest(s, rel, source), RunTest: (file, mutant) => runTest(s, file, mutant) } };
            for await (const m of (this.o.Runner ?? RunnerForModel(r.Model))(BuildTaskPrompt(r, ctx), BuildSystemPrompt(ctx), options)) {
                if (m.Type === 'result') { usage = { Model: r.Model, ...m.Usage, CostUSD: m.CostUSD }; subtype = m.Subtype; turns = m.Turns; }
                else if (m.Type === 'assistant') s.Transcript.push(`ASSISTANT ${m.Text.slice(0, 500)}`);
            }
        } finally {
            writeTranscript(this.o.TranscriptDir, transcriptPath, `${subtype}\n${s.Transcript.join('\n')}\n`);
        }
        return { Tests: collectCandidates(s, usage, transcriptPath), Tokens: { ...usage, Role: 'Generator' }, TranscriptPath: transcriptPath, EndReason: subtype, Turns: turns };
    }

    private transcriptPath(s: Session): string {
        const r = s.Request;
        return join(this.o.TranscriptDir, `${safeName(r.Run.ID)}-${safeName(s.PackageDir)}-${r.Method}${r.Risks.length ? `-${safeName(SessionRiskID(r) ?? '')}` : ''}.log`);
    }
}

function buildContext(s: Session, testIDsPerRisk: string[][]): PromptContext {
    const r = s.Request; const changed = r.Analysis.ChangedFiles.filter((f) => f.Package === r.Package);
    return {
        PackageRelDir: s.PackageDir, JitDir: s.JitDir, TestIDs: s.IDs, TestIDsPerRisk: testIDsPerRisk, ChangedFilesInPackage: changed.map((f) => f.Path),
        ExistingTestPaths: existingTests(join(r.BaseRootDir, s.PackageDir, 'src')).map((p) => `${s.PackageDir}/src/${p}`),
        Diff: changed.flatMap((f) => f.Hunks).map((h) => `--- ${h.Path} @@ -${h.OldStart},${h.OldLines} +${h.NewStart},${h.NewLines} @@\n${h.Lines.join('\n')}`).join('\n'),
    };
}

function existingTests(srcDir: string): string[] {
    if (!existsSync(srcDir)) return [];
    return readdirSync(srcDir, { recursive: true }).map(String).filter((p) => /\.test\.ts$/.test(p) && !/\.jit\.test\.ts$/.test(p)).slice(0, 10);
}

/** Repo-relative path of an allocated file. */
function jitFile(s: Session, id: string): string { return `${s.JitDir}/${id}.jit.test.ts`; }

/** The allocated ID whose file is exactly `path` (repo-relative or absolute), or undefined. */
function allocatedID(s: Session, path: string): string | undefined {
    const root = s.Request.BaseRootDir; const target = resolve(root, path);
    return s.IDs.find((id) => target === resolve(root, jitFile(s, id)));
}

/** True when the jit folder is a real folder at its own place inside the worktree (no symlink on the way). */
function jitIsReal(s: Session): boolean {
    const root = s.Request.BaseRootDir; const abs = join(root, s.JitDir);
    return existsSync(abs) && realpathSync.native(abs) === join(realpathSync.native(root), s.JitDir);
}

/** The write_test tool: writes one allocated file, never through a symlink. Returns 'ok' or a 'denied: …' reason. */
async function writeTest(s: Session, rel: string, source: string): Promise<string> {
    const id = allocatedID(s, rel); const target = resolve(s.Request.BaseRootDir, rel);
    const refusal = !id ? `writes are allowed only to the listed files in ${s.JitDir}/`
        : !jitIsReal(s) || !IsInside(join(s.Request.BaseRootDir, s.JitDir), target) ? `${s.JitDir} must be a real folder inside the worktree`
        : lstatSync(target, { throwIfNoEntry: false })?.isFile() === false ? 'the file exists and is not a regular file' : null;
    if (refusal || !id) { s.Transcript.push(`DENIED write ${rel}`); return `denied: ${refusal}`; }
    try { writeNoFollow(target, source); }
    catch (e) { s.Transcript.push(`DENIED write ${rel} (${(e as Error).message})`); return `denied: ${(e as Error).message}`; }
    s.Files.set(id, { Source: source, Base: false, Mutant: null });
    s.Transcript.push(`WRITE ${rel} (${source.length} chars)`);
    return 'ok';
}

/** Writes `source` to `path`; fails when the last path part is a symlink. */
function writeNoFollow(path: string, source: string): void {
    const fd = openSync(path, WRITE_FLAGS, 0o644);
    try { writeSync(fd, source); } finally { closeSync(fd); }
}

/** The source of an allocated file when it is a regular file in a real jit folder; null otherwise. */
function readOnDisk(s: Session, id: string): string | null {
    if (!jitIsReal(s)) return null;
    const abs = join(s.Request.BaseRootDir, jitFile(s, id));
    return lstatSync(abs, { throwIfNoEntry: false })?.isFile() ? readFileSync(abs, 'utf8') : null;
}

/**
 * The run_test tool: runs the file and records a base pass or a killed mutant for the source written through write_test.
 * The result counts only when the same write is still current after the run and the disk still holds the source that was there before it.
 */
async function runTest(s: Session, file: string, mutant?: { Edits: MutantEdit[] }): Promise<RunTestOutput> {
    const input: RunTestInput = mutant ? { File: file, Mutant: mutant } : { File: file };
    const id = s.IDs.find((x) => file === jitFile(s, x)); const rec = id ? s.Files.get(id) : undefined;
    const ranSource = id && rec && readOnDisk(s, id) === rec.Source ? rec.Source : null;
    const out = await s.Tool.Run(input);
    s.Transcript.push(`RUN ${file}${mutant ? ' +mutant' : ''} → ${out.Status}${out.Error ? ` (${out.Error})` : ''}`);
    if (!id || !rec || ranSource === null || !out.Ran || s.Files.get(id) !== rec || readOnDisk(s, id) !== ranSource) return out;
    if (!mutant) rec.Base = out.Status === 'Pass';
    else if (out.Status === 'Fail' && s.Tool.LastMutant) rec.Mutant = s.Tool.LastMutant;
    return out;
}

/** One CandidateTest per allocated file that exists; only files proved through run_test, unchanged since, are 'Produced'. */
function collectCandidates(s: Session, usage: TokenUsage, transcriptPath: string): CandidateTest[] {
    const r = s.Request; const tests: CandidateTest[] = [];
    for (const id of s.IDs) {
        const rec = s.Files.get(id);
        const present = lstatSync(join(r.BaseRootDir, jitFile(s, id)), { throwIfNoEntry: false }) !== undefined;
        if (!rec && !present) continue;
        const reason = failureReason(s, id, rec); const risk = s.RiskOf.get(id);
        tests.push({ ID: id, RunID: r.Run.ID, Package: r.Package, Method: r.Method, RiskID: risk?.ID ?? null, RiskText: risk ? RiskText(risk) : null,
            Mutant: rec?.Mutant ? { Edits: rec.Mutant.Edits, Patch: rec.Mutant.Patch } : null, MutantFailure: rec?.Mutant?.Failure ?? null, FilePath: jitFile(s, id), Source: rec?.Source ?? '',
            GenerationOutcome: reason ? 'Failed' : 'Produced', FailureReason: reason, Tokens: usage, TranscriptURL: transcriptPath });
    }
    return tests;
}

function failureReason(s: Session, id: string, rec: FileRecord | undefined): string | null {
    if (!rec) return 'not written through write_test';
    if (readOnDisk(s, id) !== rec.Source) return 'changed on disk after write_test';
    if (!rec.Base) return 'never proved to pass on base';
    if (s.Request.Method === 'IntentAware' && !rec.Mutant) return 'never proved to kill a mutant';
    return null;
}

/** Writes the transcript after redaction: a line that holds a secret is replaced by the redacted match. */
function writeTranscript(dir: string, path: string, text: string): void {
    const check = new RedactionCheck(SecretsFromEnvironment());
    const clean = text.split('\n').map((line) => { const m = check.Check(line); return m ? `[line withheld: ${m.Kind} ${m.Excerpt}]` : line; }).join('\n');
    check.AssertClean(clean, `transcript ${path}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path, clean);
}

function safeName(text: string): string { return text.replace(/[^A-Za-z0-9._-]/g, '_'); }

/** The listener `FilterProcessWarnings` installed, while it is attached. */
let warningFilter: ((w: Error & { code?: string }) => void) | null = null;

/**
 * Replaces the default process `warning` listeners with one that drops warnings whose `code` is in `codes` and writes
 * every other warning as one line in Node's format; it writes nothing when Node runs with `--no-warnings` (also in `NODE_OPTIONS`) or `NODE_NO_WARNINGS=1`.
 * Installs once; later calls do nothing while the listener is attached.
 */
export function FilterProcessWarnings(codes: readonly string[], sink: (line: string) => void = (s) => { process.stderr.write(s); }): void {
    if (warningFilter && process.listeners('warning').includes(warningFilter)) return;
    process.removeAllListeners('warning');
    warningFilter = (w) => {
        if (warningsSilenced()) return;
        if (w.code && codes.includes(w.code)) return;
        sink(`(node:${process.pid}) ${w.code ? `[${w.code}] ` : ''}${w.name}: ${w.message}\n`);
    };
    process.on('warning', warningFilter);
}

/** True when Node runs with `--no-warnings` (on the command line or in `NODE_OPTIONS`) or with `NODE_NO_WARNINGS=1`. */
function warningsSilenced(): boolean {
    const options = process.env.NODE_OPTIONS?.split(/\s+/) ?? [];
    return process.execArgv.includes('--no-warnings') || options.includes('--no-warnings') || process.env.NODE_NO_WARNINGS === '1';
}

/** The runner for a generator model: the MJ Gemini provider when `GeneratorVendor` names Gemini, the Claude Agent SDK otherwise. */
export function RunnerForModel(model: string): AgentRunner { return GeneratorVendor(model) === 'Gemini' ? GeminiRunner : SdkRunner; }

/** SDK options for one session. `tools` restricts the built-ins; only run_test skips `canUseTool` (spike §2, D36). */
export function BuildSdkOptions(o: AgentRunOptions, x: { System: string; McpServer: McpSdkServerConfigWithInstance; Abort: AbortController; CanUseTool: CanUseTool; Env: Record<string, string> }): Options {
    return { cwd: o.Cwd, model: o.Model, maxTurns: o.MaxTurns, maxBudgetUsd: o.BudgetUsd, systemPrompt: x.System, settingSources: [], permissionMode: 'default', env: x.Env,
        tools: ['Read', 'Grep', 'Glob'], allowedTools: ['mcp__jit__run_test'],
        disallowedTools: ['Bash', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'WebFetch', 'WebSearch', 'Task', 'Agent'],
        mcpServers: { jit: x.McpServer }, abortController: x.Abort, canUseTool: x.CanUseTool };
}

/** The jit MCP server: run_test and write_test, both answered by the session hooks. */
function jitServer(hooks: AgentHooks): McpSdkServerConfigWithInstance {
    return createSdkMcpServer({ name: 'jit', version: '1.0.0', tools: [
        tool('run_test', 'Run one generated vitest file on base, or on base plus a mutant. Returns Status Pass/Fail/Timeout and the failure detail.', RunTestShape,
            async (input) => ({ content: [{ type: 'text', text: JSON.stringify(await hooks.RunTest(input.File, input.Mutant)) }] })),
        tool('write_test', 'Write the full source of one of the listed test files.', WriteTestShape,
            async (input) => ({ content: [{ type: 'text', text: await hooks.WriteFile(input.File, input.Source) }] })),
    ] });
}

/** Read tools stay inside the base worktree; write_test checks its own path in the WriteFile hook. */
function readGuard(cwd: string): CanUseTool {
    return async (name, input) => (name === 'mcp__jit__write_test' || ReadAllowed(name, input, cwd)
        ? { behavior: 'allow', updatedInput: input }
        : { behavior: 'deny', message: `${name} is not allowed here: reads stay inside the base worktree` });
}

/** Totals of a `result` message: every model call (`modelUsage`) when present, else the main loop (`usage`). */
function resultUsage(msg: SDKResultMessage): { InputTokens: number; OutputTokens: number; CacheReadTokens: number } {
    const models = Object.values(msg.modelUsage ?? {});
    if (models.length > 0) return models.reduce((t, m) => ({ InputTokens: t.InputTokens + m.inputTokens + m.cacheCreationInputTokens, OutputTokens: t.OutputTokens + m.outputTokens, CacheReadTokens: t.CacheReadTokens + m.cacheReadInputTokens }), { InputTokens: 0, OutputTokens: 0, CacheReadTokens: 0 });
    const u = msg.usage;
    return { InputTokens: u.input_tokens + (u.cache_creation_input_tokens ?? 0), OutputTokens: u.output_tokens, CacheReadTokens: u.cache_read_input_tokens ?? 0 };
}

/**
 * The real runner: Claude Agent SDK with read/search tools, writes through write_test, run_test as an MCP tool.
 * Refuses to start inside a Claude Code session. Aborts with an error when the credential is not ANTHROPIC_API_KEY or a message arrives before
 * the init message; aborts quietly when the host token count passes the budget. A session that fails after it started throws a
 * `SessionError` carrying the host token count so far.
 */
export async function* SdkRunner(prompt: string, system: string, o: AgentRunOptions): AsyncIterable<AgentMessage> {
    const home = mkdtempSync(join(tmpdir(), 'jit-agent-home-'));
    try {
        const env = AgentEnv(process.env, home);
        const abort = new AbortController(); const usage = new UsageCounter();
        let sawResult = false; let sawInit = false; let fatal: Error | null = null;
        try {
            for await (const msg of query({ prompt, options: BuildSdkOptions(o, { System: system, McpServer: jitServer(o.Hooks), Abort: abort, CanUseTool: readGuard(o.Cwd), Env: env }) })) {
                if (msg.type === 'system' && msg.subtype === 'init') {
                    try { AssertApiKeySource(msg.apiKeySource); sawInit = true; } catch (e) { fatal = e as Error; abort.abort(); break; }
                }
                if ((msg.type === 'assistant' || msg.type === 'result') && !sawInit) {
                    fatal = new Error(`agent sent a ${msg.type} message before the init message, so its credential was not checked`); abort.abort(); break;
                }
                if (msg.type === 'assistant') {
                    usage.Add(msg.message.id, msg.message.usage);
                    if (usage.BudgetTokens > o.TokenBudget && !abort.signal.aborted) abort.abort();
                    yield { Type: 'assistant', Text: JSON.stringify(msg.message.content).slice(0, 500) };
                }
                if (msg.type === 'result') {
                    sawResult = true;
                    yield { Type: 'result', Usage: resultUsage(msg), CostUSD: msg.total_cost_usd, Turns: usage.Turns, Subtype: msg.subtype };
                }
            }
        } catch (e) {
            // After error_max_turns the SDK sends the result message and then throws; an abort also ends the iterator with a throw.
            if (!sawResult && !abort.signal.aborted) throw new SessionError(e instanceof Error ? e.message : String(e), usage.ToUsage(o.Model, o.Price));
        }
        if (fatal) throw new SessionError(fatal.message, usage.ToUsage(o.Model, o.Price));
        // An aborted session has no result message: report the host count and an estimated cost.
        if (!sawResult) yield { Type: 'result', Usage: { InputTokens: usage.InputTokens, OutputTokens: usage.OutputTokens, CacheReadTokens: usage.CacheReadTokens }, CostUSD: usage.EstimateCostUSD(o.Price), Turns: usage.Turns, Subtype: 'aborted_token_budget' };
    } finally {
        rmSync(home, { recursive: true, force: true });
    }
}
