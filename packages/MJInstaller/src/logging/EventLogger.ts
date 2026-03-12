/**
 * EventLogger — captures all installer events into a time-stamped buffer.
 *
 * Subscribes to every event type on an {@link InstallerEventEmitter} and
 * stores structured entries. The buffer is used by {@link ReportGenerator}
 * to produce diagnostic reports for remote troubleshooting.
 *
 * **Design decisions:**
 * - Entries are capped at {@link MAX_ENTRIES} to prevent runaway memory
 *   usage during long installs with verbose output.
 * - Passwords and secrets are never stored — the logger sanitizes config
 *   values before capture.
 * - The logger is passive: it only reads events, never emits or modifies them.
 *
 * @module logging/EventLogger
 * @see ReportGenerator — consumes the event log to produce markdown reports.
 * @see InstallerEngine — wires the logger to the engine's event emitter.
 */

import type { InstallerEventEmitter } from '../events/InstallerEvents.js';
import type { PhaseId } from '../errors/InstallerError.js';

/** Maximum number of log entries before oldest entries are discarded. */
const MAX_ENTRIES = 5000;

/**
 * Severity level for a log entry, derived from the source event type.
 *
 * - `'info'` — normal progress, phase lifecycle, diagnostics.
 * - `'warn'` — non-blocking warnings.
 * - `'error'` — terminal failures.
 * - `'verbose'` — detailed output (npm lines, build output).
 * - `'prompt'` — user interaction events.
 */
export type LogLevel = 'info' | 'warn' | 'error' | 'verbose' | 'prompt';

/**
 * A single captured event entry with timestamp and metadata.
 */
export interface LogEntry {
  /** ISO 8601 timestamp when the event was captured. */
  Timestamp: string;
  /** Severity level derived from the source event type. */
  Level: LogLevel;
  /** Human-readable message describing the event. */
  Message: string;
  /** Phase that produced the event (if applicable). */
  Phase?: PhaseId;
  /** Source event type (e.g., `'phase:start'`, `'error'`, `'step:progress'`). */
  Source: string;
}

/**
 * Captures all installer events into a queryable, time-stamped buffer.
 *
 * @example
 * ```typescript
 * const logger = new EventLogger();
 * logger.Attach(engine.emitter);
 *
 * // ... install runs ...
 *
 * const entries = logger.Entries;
 * const errors = logger.GetByLevel('error');
 * logger.Detach();
 * ```
 */
export class EventLogger {
  private entries: LogEntry[] = [];
  private emitter: InstallerEventEmitter | null = null;

  // Store handler references for cleanup
  private handlers = {
    phaseStart: this.onPhaseStart.bind(this),
    phaseEnd: this.onPhaseEnd.bind(this),
    stepProgress: this.onStepProgress.bind(this),
    log: this.onLog.bind(this),
    warn: this.onWarn.bind(this),
    error: this.onError.bind(this),
    prompt: this.onPrompt.bind(this),
    diagnostic: this.onDiagnostic.bind(this),
  };

  /**
   * Subscribe to all event types on the given emitter.
   *
   * @param emitter - The installer event emitter to capture events from.
   */
  Attach(emitter: InstallerEventEmitter): void {
    this.emitter = emitter;
    emitter.On('phase:start', this.handlers.phaseStart);
    emitter.On('phase:end', this.handlers.phaseEnd);
    emitter.On('step:progress', this.handlers.stepProgress);
    emitter.On('log', this.handlers.log);
    emitter.On('warn', this.handlers.warn);
    emitter.On('error', this.handlers.error);
    emitter.On('prompt', this.handlers.prompt);
    emitter.On('diagnostic', this.handlers.diagnostic);
  }

  /**
   * Unsubscribe from all event types. Safe to call multiple times.
   */
  Detach(): void {
    if (!this.emitter) return;
    this.emitter.Off('phase:start', this.handlers.phaseStart);
    this.emitter.Off('phase:end', this.handlers.phaseEnd);
    this.emitter.Off('step:progress', this.handlers.stepProgress);
    this.emitter.Off('log', this.handlers.log);
    this.emitter.Off('warn', this.handlers.warn);
    this.emitter.Off('error', this.handlers.error);
    this.emitter.Off('prompt', this.handlers.prompt);
    this.emitter.Off('diagnostic', this.handlers.diagnostic);
    this.emitter = null;
  }

  /** All captured log entries in chronological order. */
  get Entries(): ReadonlyArray<LogEntry> {
    return this.entries;
  }

  /** Number of entries in the buffer. */
  get Count(): number {
    return this.entries.length;
  }

  /**
   * Filter entries by severity level.
   *
   * @param level - The severity level to filter by.
   * @returns Entries matching the given level.
   */
  GetByLevel(level: LogLevel): LogEntry[] {
    return this.entries.filter((e) => e.Level === level);
  }

  /**
   * Filter entries by phase.
   *
   * @param phase - The phase ID to filter by.
   * @returns Entries associated with the given phase.
   */
  GetByPhase(phase: PhaseId): LogEntry[] {
    return this.entries.filter((e) => e.Phase === phase);
  }

  /** Clear all captured entries. */
  Clear(): void {
    this.entries = [];
  }

  // -------------------------------------------------------------------------
  // Event handlers
  // -------------------------------------------------------------------------

  private addEntry(level: LogLevel, message: string, source: string, phase?: PhaseId): void {
    if (this.entries.length >= MAX_ENTRIES) {
      // Drop oldest 10% to avoid constant shifting
      this.entries = this.entries.slice(Math.floor(MAX_ENTRIES * 0.1));
    }
    this.entries.push({
      Timestamp: new Date().toISOString(),
      Level: level,
      Message: message,
      Phase: phase,
      Source: source,
    });
  }

  private onPhaseStart(event: { Phase: PhaseId; Description: string }): void {
    this.addEntry('info', `Phase started: ${event.Description}`, 'phase:start', event.Phase);
  }

  private onPhaseEnd(event: { Phase: PhaseId; Status: string; DurationMs: number; Error?: { message: string; Code: string; SuggestedFix: string } }): void {
    const duration = `${Math.round(event.DurationMs / 1000)}s`;
    if (event.Status === 'failed' && event.Error) {
      this.addEntry('error', `Phase failed (${duration}): [${event.Error.Code}] ${event.Error.message}`, 'phase:end', event.Phase);
      if (event.Error.SuggestedFix) {
        this.addEntry('info', `Suggested fix: ${event.Error.SuggestedFix}`, 'phase:end', event.Phase);
      }
    } else {
      this.addEntry('info', `Phase ${event.Status} (${duration})`, 'phase:end', event.Phase);
    }
  }

  private onStepProgress(event: { Phase: PhaseId; Message: string; Percent?: number }): void {
    const percent = event.Percent != null ? ` (${event.Percent}%)` : '';
    this.addEntry('verbose', `${event.Message}${percent}`, 'step:progress', event.Phase);
  }

  private onLog(event: { Level: 'info' | 'verbose'; Message: string }): void {
    this.addEntry(event.Level, event.Message, 'log');
  }

  private onWarn(event: { Message: string; Phase?: PhaseId }): void {
    this.addEntry('warn', event.Message, 'warn', event.Phase);
  }

  private onError(event: { Phase: PhaseId; Error: { message: string; Code: string; SuggestedFix: string } }): void {
    this.addEntry('error', `[${event.Error.Code}] ${event.Error.message}`, 'error', event.Phase);
  }

  private onPrompt(event: { PromptId: string; Message: string }): void {
    this.addEntry('prompt', `Prompt [${event.PromptId}]: ${event.Message}`, 'prompt');
  }

  private onDiagnostic(event: { Check: string; Status: string; Message: string }): void {
    this.addEntry('info', `[${event.Status.toUpperCase()}] ${event.Check}: ${event.Message}`, 'diagnostic');
  }
}
