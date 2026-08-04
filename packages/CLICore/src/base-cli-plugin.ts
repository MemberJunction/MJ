import { Command, Flags } from '@oclif/core';
import { MJCLIRuntimeHost } from './runtime-host';
import type { IMJCLIRuntimeHost, MJCLIResult, OutputFormat, PluginUsage } from './types';

/**
 * Abstract base for every pluggable `mj` command (plan D1/D2).
 *
 * Extends oclif's {@link Command}, so oclif still owns flag parsing, help
 * generation, and routing. We wrap only the *execution* layer: subclasses
 * implement {@link BaseCLIPlugin.Execute} (pure logic, returns data) and the
 * shared {@link BaseCLIPlugin.run} wires up the {@link IMJCLIRuntimeHost}, emits
 * the runtime advisory, renders the result per `--format`, and sets the exit code.
 *
 * The global flags `--format`, `--verbose`, and `--no-banner` are declared on
 * {@link BaseCLIPlugin.baseFlags} and inherited by every subclass via oclif's
 * native `baseFlags` merging — no per-command duplication (plan D3).
 */
export abstract class BaseCLIPlugin extends Command {
  /** Inherited by every subclass through oclif's static `baseFlags` mechanism. */
  static override baseFlags = {
    format: Flags.string({
      options: ['text', 'json', 'md'],
      default: 'text',
      description: 'Output format: text (human), json (machine-readable), md (Markdown-fenced)',
    }),
    verbose: Flags.boolean({ char: 'v', default: false, description: 'Show detailed output' }),
    'no-banner': Flags.boolean({ default: false, description: 'Suppress the startup banner and runtime advisory' }),
  };

  /**
   * Every plugin declares its own usage + runtime metadata. The CLI root reads
   * this off the registered classes to assemble the progressive-disclosure
   * `mj usage` / `mj <domain> usage` surface and the timeout advisory.
   * Subclasses MUST override.
   */
  static Usage: PluginUsage;

  protected Host!: IMJCLIRuntimeHost;

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

    const f = flags as { format?: string; verbose?: boolean; 'no-banner'?: boolean };
    const format = (f.format as OutputFormat) ?? 'text';
    const verbose = !!f.verbose;
    const noBanner = !!f['no-banner'];

    this.Host = new MJCLIRuntimeHost(format, verbose, noBanner);

    // Announce runtime expectation up front (stderr in JSON mode) so an agent
    // reading the stream can budget its timeout — see plan §5/§6.
    if (ctor.Usage) {
      this.Host.AnnounceRuntime(ctor.Usage);
    }

    const result = await this.Execute();
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
   * Optional post-Emit hook. Override to release resources (DB pools, singletons)
   * and, when necessary, `process.exit()` to terminate lingering background work.
   */
  protected async Cleanup(_result: MJCLIResult): Promise<void> {
    // no-op by default
  }

  /** Subclasses implement this — pure logic, no direct stdio. */
  protected abstract Execute(): Promise<MJCLIResult>;
}
