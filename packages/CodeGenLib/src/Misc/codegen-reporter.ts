import { BaseSingleton } from '@memberjunction/global';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

/**
 * Structured telemetry for a single CodeGen run.
 *
 * Captures phase timings (nested), per-entity work, LLM call details, and counters.
 * Writes one JSON file per run to `~/.mj/codegen-state/run-<timestamp>.json`.
 *
 * Mirrors the file-based precedent set by `@memberjunction/metadata-sync`'s
 * `~/.mj/sync-state/` pattern (PR #2330) rather than MJCore's runtime
 * `TelemetryManager` (which is designed for live-app session tracking).
 *
 * @example
 * ```ts
 * const reporter = CodeGenReporter.Instance;
 * reporter.startRun();
 * reporter.mark('platform', 'sqlserver');
 *
 * await reporter.phase('manageMetadata', async () => {
 *     // ... existing CodeGen code
 * });
 *
 * await reporter.entityPhase('Customer', 'advancedGeneration', async () => {
 *     // ... per-entity work
 * });
 *
 * reporter.recordLLMCall({
 *     entityName: 'Customer', promptName: 'SmartFieldIdentification',
 *     model: 'gemini-3-flash-lite', tokensIn: 3421, tokensOut: 412,
 *     costUSD: 0.00052, latencyMs: 1843,
 * });
 *
 * reporter.counter('sqlStatements', 1);
 *
 * const reportPath = await reporter.endRun(true);
 * ```
 */

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

/**
 * A single phase span. Phases can nest via the stack held in `CodeGenReporter`.
 */
export type PhaseSpan = {
  name: string;
  /** Offset in ms from the start of the run (or start of parent for children). */
  startMs: number;
  /** Duration of this phase in ms. Set when the phase ends. */
  durationMs: number;
  /** Nested child phases, in order of entry. */
  children: PhaseSpan[];
};

/**
 * Per-entity breakdown entry, accumulated across phases.
 */
export type EntityEntry = {
  name: string;
  totalMs: number;
  advancedGenerationMs: number;
  llmCalls: number;
  tokensIn: number;
  tokensOut: number;
  costUSD: number;
  flags: {
    new: boolean;
    modified: boolean;
    regenerated: boolean;
  };
};

/**
 * Record of a single LLM call made during the run.
 */
export type LLMCallEntry = {
  entityName: string | null;
  promptName: string;
  model: string | null;
  tokensIn: number;
  tokensOut: number;
  costUSD: number;
  latencyMs: number;
  /** Offset in ms from the start of the run. */
  tsMs: number;
};

/**
 * Free-form counters. `spCalls` is a nested dict keyed by SP name.
 */
export type RunCounters = {
  entitiesProcessed: number;
  entitiesNew: number;
  entitiesModified: number;
  entitiesRegenerated: number;
  sqlStatements: number;
  filesWritten: number;
  spCalls: Record<string, number>;
  [key: string]: number | Record<string, number>;
};

/**
 * Shape of the JSON report written to disk.
 */
export type RunReport = {
  runId: string;
  startedAt: string;
  finishedAt: string;
  totalMs: number;
  success: boolean;
  context: Record<string, unknown>;
  phases: PhaseSpan[];
  entities: EntityEntry[];
  llmCalls: LLMCallEntry[];
  counters: RunCounters;
  totalCostUSD: number;
  totalTokensIn: number;
  totalTokensOut: number;
  notes: string[];
};

/**
 * Compact summary returned by `listRuns()` for the report list CLI.
 */
export type RunSummary = {
  runId: string;
  startedAt: string;
  totalMs: number;
  success: boolean;
  entitiesProcessed: number;
  llmCalls: number;
  totalCostUSD: number;
  filePath: string;
};

/**
 * Maximum number of run files to keep in `~/.mj/codegen-state/`. Older files are
 * pruned on each `endRun()`. Plain constant — not externally configurable yet.
 */
const MAX_RETAINED_RUNS = 50;

// ----------------------------------------------------------------------------
// Reporter
// ----------------------------------------------------------------------------

/**
 * Singleton reporter for CodeGen runs. Holds state for a single run at a time;
 * call `startRun()` to begin, `endRun()` to emit and reset.
 */
export class CodeGenReporter extends BaseSingleton<CodeGenReporter> {
  protected constructor() {
    super();
  }

  public static get Instance(): CodeGenReporter {
    return super.getInstance<CodeGenReporter>();
  }

  // ------------------------------------------------------------------------
  // Run state (reset per run)
  // ------------------------------------------------------------------------

  private _active: boolean = false;
  private _runStartMs: number = 0;
  private _runStartIso: string = '';
  private _phases: PhaseSpan[] = [];
  private _phaseStack: PhaseSpan[] = [];
  private _entities: Map<string, EntityEntry> = new Map();
  private _llmCalls: LLMCallEntry[] = [];
  private _counters: RunCounters = this.emptyCounters();
  private _context: Record<string, unknown> = {};
  private _notes: string[] = [];
  private _currentEntity: string | null = null;

  /** True if a run is currently in progress. */
  public get IsActive(): boolean {
    return this._active;
  }

  /** Begin capturing a new run. Resets all state from any prior run. */
  public startRun(): void {
    this._active = true;
    this._runStartMs = Date.now();
    this._runStartIso = new Date(this._runStartMs).toISOString();
    this._phases = [];
    this._phaseStack = [];
    this._entities = new Map();
    this._llmCalls = [];
    this._counters = this.emptyCounters();
    this._context = {};
    this._notes = [];
    this._currentEntity = null;
  }

  // ------------------------------------------------------------------------
  // Instrumentation API
  // ------------------------------------------------------------------------

  /**
   * Wrap an async block as a named phase. Phases nest automatically: any
   * phases started while another is open are recorded as its children.
   *
   * If no run is active this becomes a pass-through — safe to call
   * unconditionally.
   */
  public async phase<T>(name: string, fn: () => Promise<T>): Promise<T> {
    if (!this._active) return fn();

    const parent = this._phaseStack[this._phaseStack.length - 1];
    const parentStart = parent ? this.phaseStartAbs(parent) : this._runStartMs;
    const span: PhaseSpan = {
      name,
      startMs: Date.now() - parentStart,
      durationMs: 0,
      children: [],
    };

    if (parent) {
      parent.children.push(span);
    } else {
      this._phases.push(span);
    }
    this._phaseStack.push(span);

    const startedAt = Date.now();
    try {
      return await fn();
    } finally {
      span.durationMs = Date.now() - startedAt;
      this._phaseStack.pop();
    }
  }

  /**
   * Wrap per-entity work. Accumulates total time and sub-phase time on the
   * entity record. Also sets the "current entity" so LLM calls recorded
   * inside this block get attributed correctly.
   */
  public async entityPhase<T>(entityName: string, phaseName: string, fn: () => Promise<T>): Promise<T> {
    if (!this._active) return fn();

    const entry = this.getOrCreateEntity(entityName);
    const prevEntity = this._currentEntity;
    this._currentEntity = entityName;

    const startedAt = Date.now();
    try {
      return await this.phase(`entity:${entityName}:${phaseName}`, fn);
    } finally {
      const elapsed = Date.now() - startedAt;
      entry.totalMs += elapsed;
      if (phaseName === 'advancedGeneration') {
        entry.advancedGenerationMs += elapsed;
      }
      this._currentEntity = prevEntity;
    }
  }

  /**
   * Record a single LLM call. Attribution falls back to the entity set by
   * the most recent `entityPhase()` if the caller doesn't supply one.
   */
  public recordLLMCall(call: {
    entityName?: string | null;
    promptName: string;
    model?: string | null;
    tokensIn?: number;
    tokensOut?: number;
    costUSD?: number;
    latencyMs: number;
  }): void {
    if (!this._active) return;

    const entityName = call.entityName ?? this._currentEntity;
    const entry: LLMCallEntry = {
      entityName,
      promptName: call.promptName,
      model: call.model ?? null,
      tokensIn: call.tokensIn ?? 0,
      tokensOut: call.tokensOut ?? 0,
      costUSD: call.costUSD ?? 0,
      latencyMs: call.latencyMs,
      tsMs: Date.now() - this._runStartMs,
    };
    this._llmCalls.push(entry);

    if (entityName) {
      const ent = this.getOrCreateEntity(entityName);
      ent.llmCalls += 1;
      ent.tokensIn += entry.tokensIn;
      ent.tokensOut += entry.tokensOut;
      ent.costUSD += entry.costUSD;
    }
  }

  /** Increment a named counter (default 1). Unknown counter names are allowed. */
  public counter(name: string, delta: number = 1): void {
    if (!this._active) return;
    const current = this._counters[name];
    if (typeof current === 'number') {
      this._counters[name] = current + delta;
    } else if (current === undefined) {
      this._counters[name] = delta;
    }
    // If it's a Record (e.g., spCalls), callers should use spCallCounter instead.
  }

  /** Increment a specific stored-procedure call count. */
  public spCallCounter(spName: string, delta: number = 1): void {
    if (!this._active) return;
    const current = this._counters.spCalls[spName] ?? 0;
    this._counters.spCalls[spName] = current + delta;
  }

  /** Set a one-time context value (platform, mjVersion, etc.). */
  public mark(key: string, value: unknown): void {
    if (!this._active) return;
    this._context[key] = value;
  }

  /** Flag an entity's change status. Used for attribution in the report. */
  public flagEntity(entityName: string, flag: 'new' | 'modified' | 'regenerated', value: boolean = true): void {
    if (!this._active) return;
    const ent = this.getOrCreateEntity(entityName);
    ent.flags[flag] = value;
  }

  /** Append a free-form note (warnings, unexpected conditions, etc.). */
  public note(message: string): void {
    if (!this._active) return;
    this._notes.push(message);
  }

  // ------------------------------------------------------------------------
  // Emission
  // ------------------------------------------------------------------------

  /**
   * Finalize the run, write the JSON report to disk, and reset state.
   * Returns the written file path (or null) and the report object.
   *
   * Safe to call even if `startRun()` wasn't called (becomes a no-op).
   */
  public async endRun(success: boolean): Promise<{ filePath: string | null; report: RunReport | null }> {
    if (!this._active) return { filePath: null, report: null };

    const finishedAtMs = Date.now();
    const report: RunReport = {
      runId: this.makeRunId(),
      startedAt: this._runStartIso,
      finishedAt: new Date(finishedAtMs).toISOString(),
      totalMs: finishedAtMs - this._runStartMs,
      success,
      context: { ...this._context },
      phases: this._phases,
      entities: Array.from(this._entities.values()),
      llmCalls: this._llmCalls,
      counters: this._counters,
      totalCostUSD: this._llmCalls.reduce((sum, c) => sum + c.costUSD, 0),
      totalTokensIn: this._llmCalls.reduce((sum, c) => sum + c.tokensIn, 0),
      totalTokensOut: this._llmCalls.reduce((sum, c) => sum + c.tokensOut, 0),
      notes: this._notes,
    };

    let writtenPath: string | null = null;
    try {
      const dir = CodeGenReporter.stateDir();
      await fs.mkdir(dir, { recursive: true });
      writtenPath = path.join(dir, `run-${report.runId}.json`);
      await fs.writeFile(writtenPath, JSON.stringify(report, null, 2), 'utf8');
      await CodeGenReporter.pruneOldRuns();
    } catch (err) {
      // Don't fail the CodeGen run because we couldn't write telemetry.
      // eslint-disable-next-line no-console
      console.warn(`[codegen-reporter] Failed to write report: ${(err as Error).message}`);
      writtenPath = null;
    } finally {
      this._active = false;
    }

    return { filePath: writtenPath, report };
  }

  /** Get the current in-memory report (snapshot). Mostly for tests. */
  public snapshot(): RunReport {
    return {
      runId: this.makeRunId(),
      startedAt: this._runStartIso,
      finishedAt: new Date().toISOString(),
      totalMs: Date.now() - this._runStartMs,
      success: true,
      context: { ...this._context },
      phases: JSON.parse(JSON.stringify(this._phases)),
      entities: Array.from(this._entities.values()).map((e) => ({ ...e, flags: { ...e.flags } })),
      llmCalls: [...this._llmCalls],
      counters: {
        ...this._counters,
        spCalls: { ...this._counters.spCalls },
      },
      totalCostUSD: this._llmCalls.reduce((sum, c) => sum + c.costUSD, 0),
      totalTokensIn: this._llmCalls.reduce((sum, c) => sum + c.tokensIn, 0),
      totalTokensOut: this._llmCalls.reduce((sum, c) => sum + c.tokensOut, 0),
      notes: [...this._notes],
    };
  }

  /**
   * Print a human-readable summary of the completed run to stdout.
   * Call after `endRun()` — operates on the saved report.
   */
  public static printSummary(report: RunReport): void {
    const totalSec = report.totalMs / 1000;
    const entCount = report.counters.entitiesProcessed ?? report.entities.length;
    const lines: string[] = [
      '',
      `MJ CodeGen run ${report.startedAt} — ${formatDuration(report.totalMs)} total, ${entCount} entities`,
      '',
      'Top-level phases                Time        %',
      '─'.repeat(52),
    ];

    const phaseTime = CodeGenReporter.sumPhaseTime(report.phases);
    const accounted = phaseTime;

    function renderPhases(phases: PhaseSpan[], indent: string, parentTotal: number): void {
      for (const p of phases) {
        const pct = parentTotal > 0 ? ((p.durationMs / report.totalMs) * 100).toFixed(1) : '';
        const time = formatDuration(p.durationMs);
        const padPct = pct ? `${pct}%`.padStart(6) : '';
        lines.push(`${indent}${p.name.padEnd(32)}${time.padStart(8)}${padPct}`);
        if (p.children.length > 0) {
          renderPhases(p.children, indent + '  ├─ ', p.durationMs);
        }
      }
    }
    renderPhases(report.phases, '', report.totalMs);

    const otherMs = report.totalMs - accounted;
    if (otherMs > 100) {
      const pct = ((otherMs / report.totalMs) * 100).toFixed(1);
      lines.push(`${'other'.padEnd(32)}${formatDuration(otherMs).padStart(8)}${`${pct}%`.padStart(6)}`);
    }

    if (report.entities.length > 0) {
      const top = [...report.entities].sort((a, b) => b.advancedGenerationMs - a.advancedGenerationMs).slice(0, 10);
      lines.push('');
      lines.push('Top 10 slowest entities (advanced generation):');
      for (const e of top) {
        if (e.advancedGenerationMs < 1) break;
        const cost = e.costUSD > 0 ? `$${e.costUSD.toFixed(4)}` : '';
        const llm = e.llmCalls > 0 ? `${e.llmCalls} LLM` : '';
        const meta = [llm, cost].filter(Boolean).join(', ');
        lines.push(`  ${e.name.padEnd(24)}${formatDuration(e.advancedGenerationMs).padStart(8)}  ${meta}`);
      }
    }

    if (report.llmCalls.length > 0) {
      lines.push('');
      const tokensIn = report.totalTokensIn.toLocaleString();
      const tokensOut = report.totalTokensOut.toLocaleString();
      lines.push(`LLM totals: ${report.llmCalls.length} calls | ${tokensIn} tokens in | ${tokensOut} out | $${report.totalCostUSD.toFixed(4)}`);
    }

    const c = report.counters;
    const counterParts: string[] = [];
    if (c.entitiesNew) counterParts.push(`${c.entitiesNew} new`);
    if (c.entitiesModified) counterParts.push(`${c.entitiesModified} modified`);
    if (c.entitiesRegenerated) counterParts.push(`${c.entitiesRegenerated} late-regen`);
    if (c.sqlStatements) counterParts.push(`${c.sqlStatements.toLocaleString()} SQL stmts`);
    if (c.filesWritten) counterParts.push(`${c.filesWritten.toLocaleString()} files`);
    if (counterParts.length > 0) {
      lines.push(`Counters:   ${counterParts.join(' | ')}`);
    }

    lines.push('');
    // eslint-disable-next-line no-console
    console.log(lines.join('\n'));
  }

  private static sumPhaseTime(phases: PhaseSpan[]): number {
    let total = 0;
    for (const p of phases) {
      total += p.durationMs;
    }
    return total;
  }

  // ------------------------------------------------------------------------
  // Static helpers (used by `mj codegen-report` CLI and by tests)
  // ------------------------------------------------------------------------

  /** The directory where run JSON files are stored. */
  public static stateDir(): string {
    return path.join(os.homedir(), '.mj', 'codegen-state');
  }

  /** List recent runs, newest first, with compact summaries. */
  public static async listRuns(limit?: number): Promise<RunSummary[]> {
    const dir = CodeGenReporter.stateDir();
    let files: string[];
    try {
      files = (await fs.readdir(dir)).filter((f) => f.startsWith('run-') && f.endsWith('.json'));
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') return [];
      throw err;
    }

    const summaries: RunSummary[] = [];
    for (const file of files) {
      try {
        const report = await CodeGenReporter.loadRun(file);
        if (!report) continue;
        summaries.push({
          runId: report.runId,
          startedAt: report.startedAt,
          totalMs: report.totalMs,
          success: report.success,
          entitiesProcessed: (report.counters.entitiesProcessed as number) ?? 0,
          llmCalls: report.llmCalls.length,
          totalCostUSD: report.totalCostUSD,
          filePath: path.join(dir, file),
        });
      } catch {
        // Skip malformed files silently
      }
    }

    summaries.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    return typeof limit === 'number' ? summaries.slice(0, limit) : summaries;
  }

  /** Load a single run by file name OR run id. Returns null if not found. */
  public static async loadRun(runIdOrFile: string): Promise<RunReport | null> {
    const dir = CodeGenReporter.stateDir();
    const file = runIdOrFile.endsWith('.json') ? runIdOrFile : `run-${runIdOrFile}.json`;
    const full = path.join(dir, file);
    try {
      const raw = await fs.readFile(full, 'utf8');
      return JSON.parse(raw) as RunReport;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') return null;
      throw err;
    }
  }

  /**
   * Prune `~/.mj/codegen-state/` to the most recent MAX_RETAINED_RUNS files.
   * Non-fatal on errors.
   */
  public static async pruneOldRuns(): Promise<void> {
    try {
      const dir = CodeGenReporter.stateDir();
      const files = (await fs.readdir(dir))
        .filter((f) => f.startsWith('run-') && f.endsWith('.json'))
        .sort()
        .reverse();
      const toDelete = files.slice(MAX_RETAINED_RUNS);
      await Promise.all(
        toDelete.map((f) =>
          fs.unlink(path.join(dir, f)).catch((err) => {
            // eslint-disable-next-line no-console
            console.warn(`[codegen-reporter] Failed to prune ${f}: ${(err as Error).message}`);
          }),
        ),
      );
    } catch {
      // Directory may not exist yet — safe to ignore.
    }
  }

  // ------------------------------------------------------------------------
  // Internals
  // ------------------------------------------------------------------------

  private getOrCreateEntity(name: string): EntityEntry {
    let entry = this._entities.get(name);
    if (!entry) {
      entry = {
        name,
        totalMs: 0,
        advancedGenerationMs: 0,
        llmCalls: 0,
        tokensIn: 0,
        tokensOut: 0,
        costUSD: 0,
        flags: { new: false, modified: false, regenerated: false },
      };
      this._entities.set(name, entry);
    }
    return entry;
  }

  private emptyCounters(): RunCounters {
    return {
      entitiesProcessed: 0,
      entitiesNew: 0,
      entitiesModified: 0,
      entitiesRegenerated: 0,
      sqlStatements: 0,
      filesWritten: 0,
      spCalls: {},
    };
  }

  private makeRunId(): string {
    // Filename-safe ISO: replace colons and dots so the string is valid on
    // all common file systems. Example: "2026-04-15T19-42-03-104Z".
    return this._runStartIso.replace(/[:.]/g, '-');
  }

  /**
   * Absolute start time of a phase (ms since epoch). The phase's own
   * startMs is stored relative to its parent (or run start), so we have
   * to walk up the stack to get an absolute.
   */
  private phaseStartAbs(phase: PhaseSpan): number {
    let abs = this._runStartMs;
    for (const s of this._phaseStack) {
      abs += s.startMs;
      if (s === phase) break;
    }
    return abs;
  }
}

// ----------------------------------------------------------------------------
// Convenience wrappers (mirrors status_logging.ts style)
// ----------------------------------------------------------------------------

/** Shortcut: wrap a phase using the singleton. */
export function reportPhase<T>(name: string, fn: () => Promise<T>): Promise<T> {
  return CodeGenReporter.Instance.phase(name, fn);
}

/** Shortcut: wrap a per-entity phase using the singleton. */
export function reportEntityPhase<T>(entityName: string, phaseName: string, fn: () => Promise<T>): Promise<T> {
  return CodeGenReporter.Instance.entityPhase(entityName, phaseName, fn);
}

/** Shortcut: increment a counter using the singleton. */
export function reportCounter(name: string, delta: number = 1): void {
  CodeGenReporter.Instance.counter(name, delta);
}

/** Shortcut: set a context mark using the singleton. */
export function reportMark(key: string, value: unknown): void {
  CodeGenReporter.Instance.mark(key, value);
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  const sec = ms / 1000;
  if (sec < 60) return `${sec.toFixed(1)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}m ${s}s`;
}
