/**
 * Event API contract for the MJ installer engine.
 *
 * The engine communicates **exclusively through events** — it never writes
 * to stdout or stderr directly. This decoupled architecture allows any
 * frontend (CLI, VSCode extension, Docker/CI, test harness) to subscribe
 * to the same event stream and render output in its own way.
 *
 * Eight event types form the complete communication surface:
 *
 * | Event | Purpose | When emitted |
 * |-------|---------|--------------|
 * | `phase:start` | Phase lifecycle | Before each phase begins |
 * | `phase:end` | Phase lifecycle | After each phase completes, fails, or is skipped |
 * | `step:progress` | Granular progress | During phase execution (streaming output) |
 * | `log` | Informational | Success messages, verbose diagnostics |
 * | `warn` | Non-blocking issues | Warnings that don't stop the install |
 * | `error` | Terminal failures | When a phase throws an {@link InstallerError} |
 * | `prompt` | User interaction | When the engine needs user input |
 * | `diagnostic` | Health checks | During preflight and `mj doctor` |
 *
 * @module events/InstallerEvents
 *
 * @example
 * ```typescript
 * const engine = new InstallerEngine();
 * engine.On('phase:start', (e) => console.log(`Starting ${e.Phase}...`));
 * engine.On('phase:end', (e) => console.log(`${e.Phase}: ${e.Status} (${e.DurationMs}ms)`));
 * engine.On('error', (e) => console.error(`${e.Error.Code}: ${e.Error.message}`));
 * engine.On('prompt', (e) => e.Resolve(readline.question(e.Message)));
 * ```
 */

import { EventEmitter } from 'node:events';
import { InstallerError, type PhaseId } from '../errors/InstallerError.js';

// ---------------------------------------------------------------------------
// Event type discriminator
// ---------------------------------------------------------------------------

/**
 * Discriminated union of all installer event type strings.
 * Used as the event name when subscribing via {@link InstallerEventEmitter.On}.
 */
export type InstallerEventType =
  | 'phase:start'
  | 'phase:end'
  | 'step:progress'
  | 'log'
  | 'warn'
  | 'error'
  | 'prompt'
  | 'diagnostic';

// ---------------------------------------------------------------------------
// Event payloads
// ---------------------------------------------------------------------------

/**
 * Emitted when an installer phase begins execution.
 * Frontends typically render this as a section header or spinner start.
 */
export interface PhaseStartEvent {
  /** Event type discriminator. */
  Type: 'phase:start';
  /** Identifier of the phase that is starting. */
  Phase: PhaseId;
  /** Human-readable description of the phase (e.g., `"Check prerequisites"`). */
  Description: string;
}

/**
 * Emitted when an installer phase finishes (successfully, with failure, or skipped).
 * Frontends typically render this as a checkmark, X, or skip indicator with duration.
 */
export interface PhaseEndEvent {
  /** Event type discriminator. */
  Type: 'phase:end';
  /** Identifier of the phase that ended. */
  Phase: PhaseId;
  /** Outcome of the phase. */
  Status: 'completed' | 'failed' | 'skipped';
  /** Wall-clock time the phase took, in milliseconds. */
  DurationMs: number;
  /** The error that caused the failure (present only when `Status === 'failed'`). */
  Error?: InstallerError;
}

/**
 * Emitted during phase execution to report granular progress.
 * Used for streaming command output, download percentages, and step-level messages.
 *
 * Frontends with verbose mode enabled show these; default mode may suppress them.
 */
export interface StepProgressEvent {
  /** Event type discriminator. */
  Type: 'step:progress';
  /** Phase that is reporting progress. */
  Phase: PhaseId;
  /** Human-readable progress message (e.g., a line of npm output). */
  Message: string;
  /** Download or build percentage (0–100), if deterministic progress is known. */
  Percent?: number;
}

/**
 * Emitted for informational messages at two verbosity levels.
 *
 * - `'info'` — always shown (e.g., "npm install completed successfully").
 * - `'verbose'` — only shown when `--verbose` is active (e.g., stderr lines).
 */
export interface LogEvent {
  /** Event type discriminator. */
  Type: 'log';
  /** Verbosity level of this log message. */
  Level: 'info' | 'verbose';
  /** The log message text. */
  Message: string;
}

/**
 * Emitted for non-blocking warnings that should be reviewed but don't stop the install.
 * Frontends typically render these with a yellow `⚠` indicator.
 */
export interface WarnEvent {
  /** Event type discriminator. */
  Type: 'warn';
  /** Warning message text. */
  Message: string;
  /** Phase that emitted the warning (if applicable). */
  Phase?: PhaseId;
}

/**
 * Emitted when a phase fails with an {@link InstallerError}.
 * This is a terminal event — the engine stops execution after emitting this.
 */
export interface ErrorEvent {
  /** Event type discriminator. */
  Type: 'error';
  /** The structured error with phase, code, message, and suggested fix. */
  Error: InstallerError;
  /** Phase where the error occurred. */
  Phase: PhaseId;
}

/**
 * Emitted when the engine needs user input during interactive mode.
 *
 * The frontend must call {@link Resolve} with the user's answer to unblock
 * the engine. In `--yes` mode, prompts are auto-resolved with defaults
 * and this event is not emitted.
 *
 * @example
 * ```typescript
 * engine.On('prompt', (e) => {
 *   if (e.PromptType === 'select') {
 *     // Show choices to user and resolve with selected value
 *     const choice = showSelectDialog(e.Message, e.Choices!);
 *     e.Resolve(choice);
 *   } else {
 *     e.Resolve(readline.question(e.Message));
 *   }
 * });
 * ```
 */
export interface PromptEvent {
  /** Event type discriminator. */
  Type: 'prompt';
  /** Unique identifier for this prompt (e.g., `'db-host'`, `'version-select'`). */
  PromptId: string;
  /** Type of input expected from the user. */
  PromptType: 'input' | 'confirm' | 'select';
  /** Question or instruction to display to the user. */
  Message: string;
  /** Available choices (present only for `'select'` prompts). */
  Choices?: { Label: string; Value: string }[];
  /** Default value to use if the user presses Enter without input. */
  Default?: string;
  /**
   * Callback that the frontend must invoke with the user's answer.
   * Calling this unblocks the engine to continue execution.
   */
  Resolve: (answer: string) => void;
}

/**
 * Emitted during preflight and `mj doctor` for individual health checks.
 * Frontends render these as a diagnostic report with pass/fail/warn/info indicators.
 *
 * @see Diagnostics — the aggregated result model for all diagnostic checks.
 */
export interface DiagnosticEvent {
  /** Event type discriminator. */
  Type: 'diagnostic';
  /** Short name of the check (e.g., `"Node.js version"`, `"SQL Server connectivity"`). */
  Check: string;
  /** Outcome of this diagnostic check. */
  Status: 'pass' | 'fail' | 'warn' | 'info';
  /** Detailed result message. */
  Message: string;
  /** Actionable fix suggestion (present for `'fail'` and `'warn'` statuses). */
  SuggestedFix?: string;
}

/**
 * Discriminated union of all installer event payload types.
 * The `Type` field acts as the discriminator for narrowing in event handlers.
 */
export type InstallerEvent =
  | PhaseStartEvent
  | PhaseEndEvent
  | StepProgressEvent
  | LogEvent
  | WarnEvent
  | ErrorEvent
  | PromptEvent
  | DiagnosticEvent;

/**
 * Generic event handler that accepts any {@link InstallerEvent}.
 * Useful for catch-all logging or forwarding.
 */
export type InstallerEventHandler = (event: InstallerEvent) => void;

// ---------------------------------------------------------------------------
// Typed event map for the emitter
// ---------------------------------------------------------------------------

/**
 * Maps event type strings to their typed argument tuples.
 * Used by {@link InstallerEventEmitter} to provide compile-time type safety
 * for event subscription and emission.
 */
export interface InstallerEventMap {
  'phase:start': [PhaseStartEvent];
  'phase:end': [PhaseEndEvent];
  'step:progress': [StepProgressEvent];
  'log': [LogEvent];
  'warn': [WarnEvent];
  'error': [ErrorEvent];
  'prompt': [PromptEvent];
  'diagnostic': [DiagnosticEvent];
}

// ---------------------------------------------------------------------------
// Typed emitter wrapper
// ---------------------------------------------------------------------------

/**
 * Type-safe wrapper around Node.js {@link EventEmitter} for installer events.
 *
 * Provides compile-time enforcement that event names and handler signatures
 * match the {@link InstallerEventMap}. The engine creates one emitter instance
 * and exposes {@link InstallerEngine.On} / {@link InstallerEngine.Off} for
 * frontend subscription.
 *
 * @example
 * ```typescript
 * const emitter = new InstallerEventEmitter();
 * emitter.On('log', (e) => {
 *   if (e.Level === 'info') console.log(e.Message);
 * });
 * emitter.Emit('log', { Type: 'log', Level: 'info', Message: 'Hello' });
 * ```
 */
export class InstallerEventEmitter {
  /** Underlying Node.js EventEmitter instance. */
  private emitter = new EventEmitter();

  /**
   * Subscribe to an installer event.
   *
   * @typeParam K - Event type key from {@link InstallerEventMap}.
   * @param event - Event name to subscribe to.
   * @param handler - Callback invoked when the event is emitted.
   */
  On<K extends keyof InstallerEventMap>(event: K, handler: (...args: InstallerEventMap[K]) => void): void {
    this.emitter.on(event, handler as (...args: unknown[]) => void);
  }

  /**
   * Unsubscribe from an installer event.
   *
   * @typeParam K - Event type key from {@link InstallerEventMap}.
   * @param event - Event name to unsubscribe from.
   * @param handler - The exact handler reference that was passed to {@link On}.
   */
  Off<K extends keyof InstallerEventMap>(event: K, handler: (...args: InstallerEventMap[K]) => void): void {
    this.emitter.off(event, handler as (...args: unknown[]) => void);
  }

  /**
   * Emit an installer event to all subscribed handlers.
   *
   * @typeParam K - Event type key from {@link InstallerEventMap}.
   * @param event - Event name to emit.
   * @param args - Event payload matching the event type.
   */
  Emit<K extends keyof InstallerEventMap>(event: K, ...args: InstallerEventMap[K]): void {
    this.emitter.emit(event, ...args);
  }

  /**
   * Remove all event listeners. Called during engine cleanup.
   */
  RemoveAllListeners(): void {
    this.emitter.removeAllListeners();
  }
}
