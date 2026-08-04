/**
 * Core type definitions for the pluggable MJ CLI.
 *
 * The guiding principle (plan D2): plugins return *data* — a {@link MJCLIResult} —
 * and the {@link IMJCLIRuntimeHost} renders it per the active {@link OutputFormat}.
 * No `ora`, `chalk`, or `console` calls live inside a plugin's business logic.
 */

/**
 * Output format selected via the global `--format` flag.
 * - `text`: human-readable (the default; spinners + chalk).
 * - `json`: machine-readable result on stdout, decorative output on stderr.
 * - `md`: Markdown-fenced result block, for AI chat UIs (forward-looking, plan D10).
 */
export type OutputFormat = 'text' | 'json' | 'md';

/** Severity for {@link IMJCLIRuntimeHost.Log}. */
export type LogLevel = 'info' | 'warn' | 'error';

/**
 * How long a command typically runs, so an AI agent wrapping `mj` in a shell
 * timeout can budget correctly rather than killing a healthy long-running
 * command midway (plan §1d / D12).
 */
export interface RuntimeHint {
  /**
   * - `fast`: <5s (no start advisory emitted).
   * - `moderate`: 5–60s.
   * - `slow`: >60s.
   * - `variable`: depends on scope — see {@link RuntimeHint.note}.
   */
  class: 'fast' | 'moderate' | 'slow' | 'variable';
  /** Best-guess midpoint (seconds) an agent can use to set a timeout. */
  typicalSeconds?: number;
  /** e.g. 'scales with entity count', 'full migration ≫ incremental'. */
  note?: string;
}

/** One flag described in a plugin's usage metadata. */
export interface PluginUsageFlag {
  name: string;
  type: string;
  description: string;
}

/**
 * Per-plugin usage + runtime metadata. Drives the progressive-disclosure
 * `mj usage` (tier 1) and `mj <domain> usage` (tier 2) surface and the timeout
 * advisory (plan §5). Co-located with the plugin so it can never drift from the
 * actual flags.
 */
export interface PluginUsage {
  /** Groups commands in `mj usage` — e.g. 'sync', 'codegen', 'migrate'. */
  domain: string;
  /** The invocation key — e.g. 'sync:push', 'codegen', 'migrate'. */
  command: string;
  /** One line, shown in the `mj usage` domain map. Keep it terse. */
  summary: string;
  /** Fuller prose, shown only in `mj <domain> usage`. */
  description?: string;
  flags?: PluginUsageFlag[];
  /** Copy-pasteable invocations. */
  examples?: string[];
  runtime: RuntimeHint;
}

/** A single failure, collected (not interleaved) so an agent can read them as a list. */
export interface MJCLIResultError {
  /** Entity name, file path, phase — whatever is relevant. */
  context?: string;
  message: string;
}

/**
 * Universal result shape every plugin returns (plan D6). Command-specific detail
 * goes in the typed {@link MJCLIResult.data} field; failures always go in
 * {@link MJCLIResult.errors} with full detail (not just a count).
 */
export interface MJCLIResult {
  success: boolean;
  /** 'sync:push', 'codegen', 'migrate', etc. */
  command: string;
  durationSeconds: number;
  data?: Record<string, unknown>;
  errors?: MJCLIResultError[];
  warnings?: string[];
}

/**
 * The runtime host abstracts all stdio. A plugin talks to the host through this
 * interface; the host decides whether a call becomes a spinner line, a JSON event
 * on stderr, or nothing — based on the active {@link OutputFormat}.
 */
export interface IMJCLIRuntimeHost {
  /** The active output format. Plugins gate human-only text rendering on this. */
  readonly Format: OutputFormat;
  /** Whether `--verbose` was set. */
  readonly Verbose: boolean;

  // ── Progress ──────────────────────────────────────────────────────────────
  StartStep(label: string): void;
  UpdateStep(label: string): void;
  SucceedStep(label: string, detail?: string): void;
  FailStep(label: string, detail?: string): void;

  // ── Logging ─────────────────────────────────────────────────────────────��─
  Log(message: string, level?: LogLevel): void;

  /**
   * Runtime advisory, emitted before work starts so an agent can budget its
   * timeout (plan §5/§6). Text mode: a dim one-liner on stderr. JSON mode: a
   * `{event:'start', ...}` line on stderr. Suppressed for `fast` commands.
   */
  AnnounceRuntime(usage: PluginUsage): void;

  /** Final result — host serializes per the active `--format`. */
  Emit(result: MJCLIResult): void;
}
