import { configInfo } from '../config.js';
import { LogStatus } from '@memberjunction/core';

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

  /** `   Startup   <total>s  (<phase> <x>s · <phase> <y>s …)`. */
  private buildStartupLine(): string {
    if (this.phaseTimings.length === 0) {
      return '';
    }
    const totalMs = this.phaseTimings.reduce((sum, p) => sum + p.Ms, 0);
    const phaseParts = this.phaseTimings
      .map((p) => `${this.shortPhaseLabel(p.Label)} ${(p.Ms / 1000).toFixed(1)}s`)
      .join(' · ');
    return `   Startup   ${(totalMs / 1000).toFixed(1)}s  (${phaseParts})`;
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
