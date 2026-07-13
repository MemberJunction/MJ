import ora, { type Ora } from 'ora-classic';
import chalk from 'chalk';
import type { IMJCLIRuntimeHost, LogLevel, MJCLIResult, OutputFormat, PluginUsage } from './types';
import { SerializeResult } from './serialize';

/**
 * Default implementation of {@link IMJCLIRuntimeHost}.
 *
 * - **Text mode** (default): an `ora` spinner with a live elapsed timer for steps,
 *   chalk-colored logs, and a generic human summary on {@link MJCLIRuntimeHost.Emit}
 *   when the plugin hasn't already rendered its own. Plugins that want rich,
 *   command-specific text (e.g. a push summary box) build the string themselves
 *   and pass it through {@link MJCLIRuntimeHost.Log} — the host never hard-codes
 *   per-command formatting.
 * - **JSON mode**: every decorative call (steps, logs, runtime advisory) goes to
 *   **stderr** so the {@link MJCLIResult} JSON on **stdout** stays clean and
 *   pipeable (plan D4: `mj sync push --format=json | jq .errors`).
 * - **MD mode**: the result is emitted as a fenced ```json block on stdout
 *   (forward-looking slot for AI chat UIs, plan D10).
 */
export class MJCLIRuntimeHost implements IMJCLIRuntimeHost {
  public readonly Format: OutputFormat;
  public readonly Verbose: boolean;
  private readonly noBanner: boolean;

  /** Process-start, used for the "· N total" running clock in text mode. */
  private readonly startTime = Date.now();

  private spinner: Ora | null = null;
  private stepBaseMessage = '';
  private stepStart = 0;
  private ticker: NodeJS.Timeout | null = null;

  constructor(format: OutputFormat = 'text', verbose = false, noBanner = false) {
    this.Format = format;
    this.Verbose = verbose;
    // `--no-banner` is handled globally by the CLI prerun hook (it strips the flag
    // from argv so not-yet-migrated commands don't fail oclif's strict parser) and
    // signalled here via env, so honor either source.
    this.noBanner = noBanner || process.env.MJ_CLI_NO_BANNER === '1';
  }

  /** Spinners/colors are only appropriate in text mode on a real TTY. */
  private get textMode(): boolean {
    return this.Format === 'text';
  }

  private fmtMs(ms: number): string {
    return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
  }

  private stopTicker(): void {
    if (this.ticker) {
      clearInterval(this.ticker);
      this.ticker = null;
    }
  }

  /**
   * Begin the live elapsed timer for the current step. Each call resets the
   * clock so the timer reflects the CURRENT step. Unref'd so it never holds the
   * event loop open on its own.
   */
  private startTicker(message: string): void {
    this.stopTicker();
    this.stepBaseMessage = message;
    this.stepStart = Date.now();
    if (this.spinner) {
      this.ticker = setInterval(() => {
        if (!this.spinner) return;
        const step = this.fmtMs(Date.now() - this.stepStart);
        const total = this.fmtMs(Date.now() - this.startTime);
        this.spinner.text = `${this.stepBaseMessage} ${chalk.gray(`· ${step} · ${total} total`)}`;
      }, 100);
      this.ticker.unref?.();
    }
  }

  /** Structured progress event on stderr (JSON mode) so stdout stays result-only. */
  private emitStderrEvent(event: Record<string, unknown>): void {
    process.stderr.write(JSON.stringify(event) + '\n');
  }

  public StartStep(label: string): void {
    if (this.textMode) {
      if (!this.spinner) this.spinner = ora();
      this.spinner.start(label);
      this.startTicker(label);
    } else if (this.Format === 'json') {
      this.emitStderrEvent({ event: 'step', label });
    }
    // md mode: steps are noise in a fenced block — suppress.
  }

  public UpdateStep(label: string): void {
    if (this.textMode) {
      if (!this.spinner) this.spinner = ora();
      this.spinner.text = label;
      this.startTicker(label);
    } else if (this.Format === 'json') {
      this.emitStderrEvent({ event: 'step', label });
    }
  }

  public SucceedStep(label: string, detail?: string): void {
    this.stopTicker();
    if (this.textMode) {
      const elapsed = this.stepStart ? chalk.gray(` (${this.fmtMs(Date.now() - this.stepStart)})`) : '';
      const text = detail ? `${label} ${chalk.gray(detail)}${elapsed}` : `${label}${elapsed}`;
      if (this.spinner) {
        this.spinner.stopAndPersist({ symbol: chalk.green('✓'), text });
      } else {
        process.stdout.write(`${chalk.green('✓')} ${text}\n`);
      }
    } else if (this.Format === 'json') {
      this.emitStderrEvent({ event: 'step-done', label, detail });
    }
  }

  public FailStep(label: string, detail?: string): void {
    this.stopTicker();
    if (this.textMode) {
      const text = detail ? `${label} ${chalk.gray(detail)}` : label;
      if (this.spinner) {
        this.spinner.fail(text);
      } else {
        process.stderr.write(`${chalk.red('✗')} ${text}\n`);
      }
    } else if (this.Format === 'json') {
      this.emitStderrEvent({ event: 'step-failed', label, detail });
    }
  }

  public Log(message: string, level: LogLevel = 'info'): void {
    if (this.textMode) {
      // A spinner mid-render would garble a raw write; stop it first.
      if (this.spinner?.isSpinning) this.spinner.stop();
      const painted = level === 'error' ? chalk.red(message) : level === 'warn' ? chalk.yellow(message) : message;
      // eslint-disable-next-line no-console
      (level === 'error' ? console.error : console.log)(painted);
    } else {
      // Keep stdout clean for the JSON/MD result — all human logging → stderr.
      process.stderr.write(message + '\n');
    }
  }

  public AnnounceRuntime(usage: PluginUsage): void {
    // Fast commands don't warrant an advisory — it would just be noise.
    if (!usage?.runtime || usage.runtime.class === 'fast') return;
    if (this.noBanner) return;

    if (this.Format === 'json') {
      this.emitStderrEvent({ event: 'start', command: usage.command, runtime: usage.runtime });
    } else if (this.textMode) {
      const r = usage.runtime;
      const secs = r.typicalSeconds ? `~${r.typicalSeconds}s` : r.class;
      const note = r.note ? ` — ${r.note}` : '';
      process.stderr.write(chalk.gray(`⏱  ${usage.command}: typically ${secs} (${r.class})${note}\n`));
    }
  }

  public Emit(result: MJCLIResult): void {
    this.stopTicker();
    if (this.spinner?.isSpinning) this.spinner.stop();

    if (this.Format === 'json' || this.Format === 'md') {
      process.stdout.write(SerializeResult(result, this.Format) + '\n');
    }
    // Text mode: the plugin is responsible for its own rich human output (via
    // Log/StartStep/SucceedStep). Emit deliberately prints nothing extra so we
    // never double-render a summary.
  }
}
