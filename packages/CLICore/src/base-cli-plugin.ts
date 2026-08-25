import { Command, Flags } from '@oclif/core';
import { MJCLIRuntimeHost } from './runtime-host';
import { ResolveOutputFormat } from './output-format';
import { NonInteractiveError, ResolveInteractivity } from './interaction';
import { MJCLIErrorCodes, type IMJCLIRuntimeHost, type MJCLIResult, type PluginUsage } from './types';

/**
 * Abstract base for every pluggable `mj` command (plan D1/D2).
 *
 * Extends oclif's {@link Command}, so oclif still owns flag parsing, help
 * generation, and routing. We wrap only the *execution* layer: subclasses
 * implement {@link BaseCLIPlugin.Execute} (pure logic, returns data) and the
 * shared {@link BaseCLIPlugin.run} wires up the {@link IMJCLIRuntimeHost}, emits
 * the runtime advisory, renders the result per `--format`, and sets the exit code.
 *
 * The global flags `--format`, `--verbose`, `--no-banner`, and `--human-friendly`
 * are declared on {@link BaseCLIPlugin.baseFlags} and inherited by every subclass
 * via oclif's native `baseFlags` merging — no per-command duplication (plan D3).
 *
 * Two agent-first defaults are applied here rather than per command:
 * - **Format follows the pipe.** With no explicit `--format`, a non-TTY stdout
 *   resolves to `json`. A caller that redirected stdout has already said it is a
 *   machine; it should not also have to remember a flag.
 * - **Prompting is opt-in.** {@link BaseCLIPlugin.Interactive} is false unless
 *   `--human-friendly` was passed with a real TTY, and a {@link NonInteractiveError}
 *   escaping `Execute` is rendered as a structured, actionable result rather than a
 *   stack trace.
 */
export abstract class BaseCLIPlugin extends Command {
  /** Inherited by every subclass through oclif's static `baseFlags` mechanism. */
  static override baseFlags = {
    format: Flags.string({
      options: ['text', 'json', 'md', 'human', 'console', 'markdown'],
      description:
        'Output format: text (human), json (machine-readable), md (Markdown-fenced). ' +
        'Defaults to text on a terminal and json when stdout is piped.',
    }),
    verbose: Flags.boolean({ char: 'v', default: false, description: 'Show detailed output' }),
    'no-banner': Flags.boolean({ default: false, description: 'Suppress the startup banner and runtime advisory' }),
    'human-friendly': Flags.boolean({
      default: false,
      description:
        'Allow interactive prompts. Off by default: mj is non-interactive so agents and CI never hang on a question. ' +
        'Requires a terminal.',
    }),
  };

  /**
   * Every plugin declares its own usage + runtime metadata. The CLI root reads
   * this off the registered classes to assemble the progressive-disclosure
   * `mj usage` / `mj <domain> usage` surface and the timeout advisory.
   * Subclasses MUST override.
   */
  static Usage: PluginUsage;

  protected Host!: IMJCLIRuntimeHost;

  /**
   * Whether this run may prompt. False unless `--human-friendly` was passed AND
   * stdin is a TTY. Subclasses pass this into `ResolveOrPrompt` rather than calling
   * `@inquirer` directly, so a missing value fails fast with the flag to pass.
   */
  protected Interactive = false;

  /** Parsed flags, captured once in {@link run}; read via {@link GetFlags}. */
  private parsedFlags: unknown;

  /**
   * The flags parsed for this command. Subclasses call this in {@link Execute}
   * instead of re-parsing — the parse happens once, in {@link run}.
   *
   * The `as unknown as T` is the ONE place the cross-package `@oclif/core` copy
   * split is bridged: cli-core nests its own oclif, so the inferred parse type
   * isn't nameable from a strict consumer package (TS2742). Confining the cast
   * here keeps every plugin's `Execute()` cast-free. Pass
   * `Interfaces.InferredFlags<typeof YourPlugin.flags>` as `T`.
   */
  protected GetFlags<T>(): T {
    return this.parsedFlags as unknown as T;
  }

  /**
   * oclif entry point — do NOT override in subclasses. Override {@link Execute}.
   */
  async run(): Promise<void> {
    // Parse against the concrete subclass so `baseFlags` + the subclass `flags`
    // both resolve. `this.constructor` is the concrete command class at runtime.
    const ctor = this.constructor as typeof BaseCLIPlugin;
    const { flags } = await this.parse(ctor);
    this.parsedFlags = flags;

    const f = flags as { format?: string; verbose?: boolean; 'no-banner'?: boolean; 'human-friendly'?: boolean };
    const { format } = ResolveOutputFormat({ formatFlag: f.format });
    const verbose = !!f.verbose;
    const noBanner = !!f['no-banner'];

    this.Interactive = ResolveInteractivity({ humanFriendlyFlag: f['human-friendly'] }).interactive;

    this.Host = new MJCLIRuntimeHost(format, verbose, noBanner, { interactive: this.Interactive });

    // Announce runtime expectation up front (stderr in JSON mode) so an agent
    // reading the stream can budget its timeout — see plan §5/§6.
    if (ctor.Usage) {
      this.Host.AnnounceRuntime(ctor.Usage);
    }

    const result = await this.RunExecute(ctor);
    this.Host.Emit(result);

    // Optional cleanup hook (e.g. close DB pools, reset singletons). Runs after
    // Emit so the result is always rendered even when cleanup hard-exits.
    await this.Cleanup(result);

    // Default exit handling. Plugins that must force-exit to kill lingering
    // handles (e.g. embedding workers) do so inside Cleanup().
    if (!result.success) {
      this.exit(1);
    }
  }

  /**
   * Runs {@link BaseCLIPlugin.Execute}, converting a {@link NonInteractiveError} into a
   * normal failed result. A command that asked for a value it wasn't given has NOT
   * crashed — it has a precise, recoverable complaint, and an agent gets far more from
   * `{code:'E_NON_INTERACTIVE', suggestion:'Pass --entity …'}` than from a stack trace.
   * Every other error keeps propagating to oclif untouched.
   */
  private async RunExecute(ctor: typeof BaseCLIPlugin): Promise<MJCLIResult> {
    try {
      return await this.Execute();
    } catch (e) {
      if (!(e instanceof NonInteractiveError)) throw e;
      return {
        success: false,
        command: ctor.Usage?.command ?? this.id ?? 'unknown',
        durationSeconds: 0,
        errors: [{ message: e.message, code: MJCLIErrorCodes.NonInteractive, suggestion: e.suggestion }],
      };
    }
  }

  /**
   * Optional post-Emit hook. Override to release resources (DB pools, singletons)
   * and, when necessary, `process.exit()` to terminate lingering background work.
   */
  protected async Cleanup(_result: MJCLIResult): Promise<void> {
    // no-op by default
  }

  /** Subclasses implement this — pure logic, no direct stdio. */
  protected abstract Execute(): Promise<MJCLIResult>;
}
