import { configInfo } from '../config.js';
import { LogStatus } from '@memberjunction/core';
import ora from 'ora';
import type { Ora } from 'ora';

/**
 * Server log verbosity levels, ordered from least to most chatty.
 *
 * Reuses the SAME enum shape as `telemetry.level` in `config.ts` so operators
 * have a single knob (`telemetry.level` in mj.config.cjs) that governs both
 * telemetry verbosity and server-log verbosity — there is no parallel setting.
 *
 * Ordering (ascending): `minimal` < `standard` < `verbose` < `debug`.
 */
export type ServerLogLevel = 'minimal' | 'standard' | 'verbose' | 'debug';

/** Numeric rank for each level, used for `>=` threshold comparisons. */
const LEVEL_RANK: Record<ServerLogLevel, number> = {
  minimal: 0,
  standard: 1,
  verbose: 2,
  debug: 3,
};

/**
 * A single captured startup phase timing (e.g. "DB Pool Connect: 412ms").
 * Buffered during startup and either printed individually (verbose+) or
 * collapsed into the one-line `Startup` summary (standard).
 */
type PhaseTiming = {
  /** Human-readable phase label. */
  Label: string;
  /** Elapsed milliseconds for the phase. */
  Ms: number;
};

/**
 * Fields gathered during startup that are rendered into the compact
 * `standard`-level summary block. All optional — the renderer degrades
 * gracefully when a field was never set.
 */
type StartupSummaryData = {
  /** Server package version (e.g. "5.40.2"); omitted from the header if absent. */
  Version?: string;
  /** Database platform label, e.g. "SQL Server" or "PostgreSQL". */
  DbPlatform?: string;
  /** Database connection string fragment, e.g. "localhost:1433/MJ_DB". */
  DbConnection?: string;
  /** Count of entities loaded into metadata. */
  EntityCount?: number;
  /** Absolute path to the resolved config file (omitted from the block if absent). */
  ConfigPath?: string;
  /** Names of registered auth providers. */
  AuthProviders: string[];
  /** Whether the REST API is enabled. */
  RestEnabled?: boolean;
  /** Count of active scheduled jobs (or 0 / suspended). */
  ScheduledJobCount?: number;
  /** Public URL the server is ready at. */
  ReadyUrl?: string;
};

/**
 * MJServer-local startup + per-request log gating helper.
 *
 * Holds the resolved {@link ServerLogLevel} (from `telemetry.level`) and exposes
 * a small surface for level-gated logging, startup phase-timing capture, and the
 * compact summary block printed once at the end of boot.
 *
 * This is deliberately NOT a `BaseSingleton` and does NOT touch
 * `@memberjunction/core` logging internals — it is a thin, process-local gate
 * that wraps `console.*` / `LogStatus`. The point is the *gating*, not a new
 * logging framework.
 *
 * Usage:
 * ```ts
 * const logger = new StartupLogger();
 * logger.LogIf('verbose', 'Registered auth provider: azure');
 * const t = logger.StartPhase();
 * // ... work ...
 * logger.EndPhase('DB Pool Connect', t);
 * logger.PrintSummary();
 * ```
 */
export class StartupLogger {
  private readonly resolvedLevel: ServerLogLevel;
  private readonly phaseTimings: PhaseTiming[] = [];
  private readonly summary: StartupSummaryData = { AuthProviders: [] };
  /** Transient boot spinner — active only at `standard` level on a TTY (see {@link spinnerEnabled}). */
  private spinner: Ora | null = null;
  /** Interval that ticks the live elapsed counter on the spinner line. */
  private bootTimer: ReturnType<typeof setInterval> | null = null;
  /** Wall-clock start of the boot indicator, for the live elapsed counter. */
  private bootStartMs = 0;
  /** Most recent phase label, shown on the spinner line. */
  private currentPhase?: string;

  /**
   * @param level Optional explicit level override (primarily for tests).
   *              When omitted, the level is resolved from config.
   */
  constructor(level?: ServerLogLevel) {
    this.resolvedLevel = level ?? StartupLogger.resolveLevelFromConfig();
  }

  /**
   * The resolved log level in effect for this logger instance.
   */
  public get Level(): ServerLogLevel {
    return this.resolvedLevel;
  }

  /**
   * Resolves the active server log level from configuration.
   *
   * Source of truth is `telemetry.level` (the pre-existing enum), so a single
   * operator knob governs both telemetry and server logging. Defaults to
   * `standard` when unset or unrecognized.
   */
  public static resolveLevelFromConfig(): ServerLogLevel {
    const raw = configInfo.telemetry?.level;
    if (raw === 'minimal' || raw === 'standard' || raw === 'verbose' || raw === 'debug') {
      return raw;
    }
    return 'standard';
  }

  /**
   * True when the active level is at least `minLevel` (using the ascending
   * `minimal < standard < verbose < debug` ordering).
   */
  public IsAtLeast(minLevel: ServerLogLevel): boolean {
    return LEVEL_RANK[this.resolvedLevel] >= LEVEL_RANK[minLevel];
  }

  /**
   * Logs `message` only when the active level is at least `minLevel`.
   * Routes through MJ's `LogStatus` so the line participates in MJ's
   * standard status-logging pipeline.
   */
  public LogIf(minLevel: ServerLogLevel, message: string): void {
    if (this.IsAtLeast(minLevel)) {
      LogStatus(message);
    }
  }

  /**
   * Starts a phase timer. Returns an opaque start timestamp to pass to
   * {@link EndPhase}.
   */
  public StartPhase(): number {
    return performance.now();
  }

  /**
   * True when the transient boot spinner should animate: only at `standard`
   * level AND when stdout is an interactive TTY. In non-TTY contexts (Docker,
   * systemd, piped logs) a spinner emits escape codes that pollute log
   * aggregation, and at `verbose`+ the inline phase lines would fight it — so
   * both fall back to plain, line-oriented output.
   */
  private get spinnerEnabled(): boolean {
    return this.resolvedLevel === 'standard' && process.stdout.isTTY === true;
  }

  /** Prefix for the transient boot indicator (no rocket — we haven't launched yet). */
  private static readonly BOOT_LABEL = 'Bootstrapping MemberJunction Server';

  /** Composes the boot label, plus the current phase when known (no elapsed counter). */
  private bootText(phase?: string): string {
    return phase ? `${StartupLogger.BOOT_LABEL} · ${phase}` : StartupLogger.BOOT_LABEL;
  }

  /** Repaints the spinner line with the current phase and a live elapsed counter. */
  private refreshBootText(): void {
    if (this.spinner) {
      const elapsed = ((performance.now() - this.bootStartMs) / 1000).toFixed(1);
      this.spinner.text = `${this.bootText(this.currentPhase)}  ${elapsed}s`;
    }
  }

  /**
   * Begins the transient "Bootstrapping…" indicator, replaced by the 🚀 summary
   * block once {@link PrintSummary} runs (so the rocket appears only after launch).
   *
   * - `standard` + TTY: an animated, self-clearing `ora` spinner (its glyph is the
   *   leading "working" icon; phase status is appended inline).
   * - `verbose`/`debug`, or non-TTY at `standard`: a single plain line with an
   *   hourglass icon (can't be cleared, but inline phase logs / the final block
   *   carry the detail). `minimal` stays silent.
   */
  public StartBoot(): void {
    if (this.spinner) {
      return;
    }
    if (this.spinnerEnabled) {
      this.bootStartMs = performance.now();
      this.spinner = ora({ text: this.bootText(), stream: process.stdout }).start();
      // Tick the elapsed counter independently of ora's glyph animation. Unref'd so
      // it never keeps the event loop alive; cleared by StopBoot before the block prints.
      this.bootTimer = setInterval(() => this.refreshBootText(), 200);
      this.bootTimer.unref();
    } else if (this.resolvedLevel !== 'minimal') {
      // eslint-disable-next-line no-console
      console.log(`⏳ ${this.bootText()}…`);
    }
  }

  /**
   * Marks the beginning of a named phase: updates the spinner status (when active)
   * and returns a start timestamp to pass to {@link EndPhase}. Pure timing helper
   * when the spinner is disabled — equivalent to {@link StartPhase}.
   *
   * @param phase Friendly label for the upcoming phase, shown after the boot label.
   */
  public BeginPhase(phase: string): number {
    this.currentPhase = phase;
    this.refreshBootText();
    return performance.now();
  }

  /** Stops and clears the boot spinner + its elapsed-counter interval. Safe to call when inactive. */
  public StopBoot(): void {
    if (this.bootTimer) {
      clearInterval(this.bootTimer);
      this.bootTimer = null;
    }
    if (this.spinner) {
      this.spinner.stop();
      this.spinner = null;
    }
  }

  /**
   * Records the elapsed time for a phase since `startedAt`, buffering it for the
   * summary. At `verbose`+ the phase is also printed immediately (matching the
   * legacy `⏱️ [Startup] X: Yms` lines); at `standard` it is collapsed into the
   * one-line `Startup` summary printed by {@link PrintSummary}.
   *
   * @returns A fresh timestamp, so callers can chain phases ergonomically.
   */
  public EndPhase(label: string, startedAt: number): number {
    const ms = performance.now() - startedAt;
    this.phaseTimings.push({ Label: label, Ms: ms });
    if (this.IsAtLeast('verbose')) {
      // eslint-disable-next-line no-console
      console.log(`⏱️  [Startup] ${label}: ${ms.toFixed(0)}ms`);
    }
    return performance.now();
  }

  /** Records the server package version for the summary header. */
  public SetVersion(version: string | undefined): void {
    this.summary.Version = version;
  }

  /** Records the resolved config-file path for the summary `Config` line. */
  public SetConfigPath(path: string | undefined): void {
    this.summary.ConfigPath = path;
  }

  /** Records DB platform + connection + entity count for the summary `DB` line. */
  public SetDatabaseInfo(platform: string, connection: string, entityCount: number): void {
    this.summary.DbPlatform = platform;
    this.summary.DbConnection = connection;
    this.summary.EntityCount = entityCount;
  }

  /** Adds a registered auth-provider name to the summary `Auth` line. */
  public AddAuthProvider(name: string): void {
    this.summary.AuthProviders.push(name);
  }

  /** Records whether the REST API is enabled for the summary `Auth` line. */
  public SetRestEnabled(enabled: boolean): void {
    this.summary.RestEnabled = enabled;
  }

  /** Records the active scheduled-job count for the summary `Auth` line. */
  public SetScheduledJobCount(count: number): void {
    this.summary.ScheduledJobCount = count;
  }

  /** Records the ready URL for the summary `Ready` line. */
  public SetReadyUrl(url: string): void {
    this.summary.ReadyUrl = url;
  }

  /**
   * Prints the boot summary appropriate for the active level:
   *  - `minimal`: only the `Ready <url>` line.
   *  - `standard`: the compact ~8-line summary block (with phases collapsed).
   *  - `verbose`/`debug`: the same compact block (individual phase lines and
   *    all detail lines were already printed inline during boot).
   */
  public PrintSummary(): void {
    // Clear the transient spinner before any block output so the line it
    // occupied is replaced cleanly by the summary.
    this.StopBoot();
    if (this.resolvedLevel === 'minimal') {
      this.printReadyLineOnly();
      return;
    }
    this.printSummaryBlock();
  }

  /** Prints just the ready URL (minimal level). */
  private printReadyLineOnly(): void {
    if (this.summary.ReadyUrl) {
      // eslint-disable-next-line no-console
      console.log(`🚀 Ready  ${this.summary.ReadyUrl}`);
    }
  }

  /** Renders and prints the multi-line compact summary block. */
  private printSummaryBlock(): void {
    const lines = this.buildSummaryLines();
    // eslint-disable-next-line no-console
    console.log('\n' + lines.join('\n') + '\n');
  }

  /** Builds the array of summary lines (header + indented detail rows). */
  private buildSummaryLines(): string[] {
    const lines: string[] = [];
    lines.push(this.buildHeaderLine());
    lines.push(this.buildDbLine());
    lines.push(this.buildConfigLine());
    lines.push(this.buildAuthLine());
    lines.push(this.buildStartupLine());
    lines.push(this.buildReadyLine());
    return lines.filter((l) => l.length > 0);
  }

  /** `🚀 MemberJunction Server  ·  v<version>` (version omitted if unknown). */
  private buildHeaderLine(): string {
    const version = this.summary.Version ? `  ·  v${this.summary.Version}` : '';
    return `🚀 MemberJunction Server${version}`;
  }

  /** `   DB        <platform> · <connection> · <N> entities`. */
  private buildDbLine(): string {
    if (!this.summary.DbPlatform) {
      return '';
    }
    const parts = [this.summary.DbPlatform];
    if (this.summary.DbConnection) {
      parts.push(this.summary.DbConnection);
    }
    if (this.summary.EntityCount != null) {
      parts.push(`${this.summary.EntityCount} entities`);
    }
    return `   DB        ${parts.join(' · ')}`;
  }

  /** `   Config    <path>` (omitted when no config file was resolved). */
  private buildConfigLine(): string {
    if (!this.summary.ConfigPath) {
      return '';
    }
    return `   Config    ${this.summary.ConfigPath}`;
  }

  /** `   Auth      <providers>          REST <on/off> · <N> scheduled jobs`. */
  private buildAuthLine(): string {
    const providers = this.summary.AuthProviders.length > 0
      ? this.summary.AuthProviders.join(', ')
      : 'none';
    const rest = this.summary.RestEnabled == null
      ? ''
      : `REST ${this.summary.RestEnabled ? 'on' : 'off'}`;
    const jobs = this.summary.ScheduledJobCount == null
      ? ''
      : `${this.summary.ScheduledJobCount} scheduled jobs`;
    const trailer = [rest, jobs].filter((s) => s.length > 0).join(' · ');
    const trailerPart = trailer ? `   ${trailer}` : '';
    return `   Auth      ${providers}${trailerPart}`;
  }

  /**
   * `   Startup   <total>s  (<phase> <x>s · … · other <z>s)`.
   *
   * The headline `<total>` is the TRUE wall-clock since process start — in Node,
   * `performance.now()` is measured from `performance.timeOrigin` (≈ process
   * start), so it captures the entire bootstrap (module import, config load,
   * ServerBootstrap, and `serve()`), not just the timed phases. The parenthetical
   * lists each captured phase; `other` is the unattributed remainder (import +
   * config + any untimed setup) shown only when it's non-trivial.
   */
  private buildStartupLine(): string {
    if (this.phaseTimings.length === 0) {
      return '';
    }
    const totalMs = performance.now();
    const phaseSumMs = this.phaseTimings.reduce((sum, p) => sum + p.Ms, 0);
    const otherMs = totalMs - phaseSumMs;
    const parts = this.phaseTimings.map(
      (p) => `${this.shortPhaseLabel(p.Label)} ${(p.Ms / 1000).toFixed(1)}s`,
    );
    // Surface unattributed boot time only when it's meaningful (>50ms), so the
    // line stays clean when phases already account for ~all of startup.
    if (otherMs > 50) {
      parts.push(`other ${(otherMs / 1000).toFixed(1)}s`);
    }
    return `   Startup   ${(totalMs / 1000).toFixed(1)}s  (${parts.join(' · ')})`;
  }

  /**
   * Abbreviates a verbose phase label into a compact token for the collapsed
   * summary line (e.g. "Metadata + Provider Setup" → "metadata").
   */
  private shortPhaseLabel(label: string): string {
    const lower = label.toLowerCase();
    if (lower.includes('metadata') || lower.includes('provider')) {
      return 'metadata';
    }
    if (lower.includes('schema')) {
      return 'schema';
    }
    if (lower.includes('db') || lower.includes('pool')) {
      return 'db';
    }
    if (lower.includes('resolver') || lower.includes('middleware')) {
      return 'resolvers';
    }
    if (lower.includes('apollo') || lower.includes('express')) {
      return 'http';
    }
    if (lower.includes('telemetry') || lower.includes('cache')) {
      return 'cache';
    }
    return lower.split(' ')[0];
  }

  /** `   Ready     <url>`. */
  private buildReadyLine(): string {
    if (!this.summary.ReadyUrl) {
      return '';
    }
    return `   Ready     ${this.summary.ReadyUrl}`;
  }
}
