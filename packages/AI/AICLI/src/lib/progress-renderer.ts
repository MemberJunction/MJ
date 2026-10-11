import chalk from 'chalk';
import type { AgentExecutionProgressCallback } from '@memberjunction/ai-core-plus';

/** One progress update from the agent runner, typed off the callback so it tracks the framework. */
export type AgentProgressUpdate = Parameters<AgentExecutionProgressCallback>[0];

/** The parts of a stream the renderer writes to. `process.stderr` is one. */
export type ProgressStream = Pick<NodeJS.WriteStream, 'write' | 'isTTY' | 'columns'>;

/** Options for {@link AgentProgressRenderer}. */
export interface AgentProgressRendererOptions {
  /** Print every update in full, with its metadata, one per line. */
  Verbose: boolean;
  /** Where progress goes. Defaults to stderr — never stdout, which belongs to the command's result. */
  Stream?: ProgressStream;
}

const STEP_ICONS: Record<AgentProgressUpdate['step'], string> = {
  initialization: '🚀',
  validation: '✓',
  prompt_execution: '💭',
  action_execution: '⚙️',
  subagent_execution: '🤖',
  decision_processing: '🧠',
  finalization: '✨',
};

/** Width used when the stream does not report one. */
const DEFAULT_LINE_WIDTH = 80;

/**
 * Renders an agent run's progress for a person watching, on stderr.
 *
 * Progress never goes to stdout. Under `--format json` (the default when stdout is piped) a caller
 * parses stdout, and the progress lines that used to precede the result made it unparseable.
 *
 * On a terminal the non-verbose rendering is a single status line rewritten in place. Anywhere
 * else — a log file, a coding agent capturing the output — carriage returns would leave one long
 * smeared line, so each new status gets a line of its own instead.
 */
export class AgentProgressRenderer {
  private readonly verbose: boolean;
  private readonly stream: ProgressStream;
  private liveLineLength = 0;
  private lastPlainLine = '';
  private stopped = false;

  constructor(options: AgentProgressRendererOptions) {
    this.verbose = options.Verbose;
    this.stream = options.Stream ?? process.stderr;
  }

  /** Shows a status message that is not a step of the run, such as connecting to the database. */
  public Status(message: string): void {
    if (this.stopped) {
      return;
    }
    if (this.verbose) {
      this.stream.write(chalk.blue(`  → ${message}`) + '\n');
      return;
    }
    this.show(`→ ${message}`);
  }

  /** Shows one progress update from the agent runner. */
  public Update(progress: AgentProgressUpdate): void {
    if (this.stopped) {
      return;
    }
    if (this.verbose) {
      this.writeVerbose(progress);
      return;
    }
    this.show(FormatProgressLine(progress));
    if (progress.step === 'finalization') {
      this.Finish();
    }
  }

  /**
   * Ends the rendering for good: clears the live line and ignores every later update. A run the
   * command stopped waiting for (`--timeout`) can keep reporting progress, which would otherwise
   * keep appearing after its result — indefinitely in chat mode, where the process stays up.
   */
  public Stop(): void {
    this.Finish();
    this.stopped = true;
  }

  /** Ends the live status line, if there is one, so later output starts on a clean line. */
  public Finish(): void {
    if (this.liveLineLength > 0) {
      this.stream.write('\r' + ' '.repeat(this.liveLineLength) + '\r');
      this.liveLineLength = 0;
    }
  }

  private show(line: string): void {
    if (this.stream.isTTY) {
      this.rewriteLiveLine(line);
    } else {
      this.writePlainLine(line);
    }
  }

  private rewriteLiveLine(line: string): void {
    const width = Math.max(20, (this.stream.columns || DEFAULT_LINE_WIDTH) - 1);
    const shown = line.length > width ? line.substring(0, width - 3) + '...' : line;
    this.Finish();
    this.stream.write(shown);
    this.liveLineLength = shown.length;
  }

  private writePlainLine(line: string): void {
    // The runner repeats a status while a step is in flight; one copy of it is enough.
    if (line === this.lastPlainLine) {
      return;
    }
    this.lastPlainLine = line;
    this.stream.write(line + '\n');
  }

  private writeVerbose(progress: AgentProgressUpdate): void {
    const icon = STEP_ICONS[progress.step] ?? '→';
    this.stream.write(
      chalk.blue(`\n  ${icon} [${progressIndicator(progress)}] `) +
      chalk.bold(progress.step.replace(/_/g, ' ')) +
      chalk.dim(` - ${progress.message}`) + '\n'
    );
    if (progress.metadata && Object.keys(progress.metadata).length > 0) {
      this.stream.write(chalk.dim(`     ${JSON.stringify(progress.metadata)}`) + '\n');
    }
  }
}

/** The one-line form of a progress update: icon, step counter, step name and message. */
export function FormatProgressLine(progress: AgentProgressUpdate): string {
  const icon = STEP_ICONS[progress.step] ?? '→';
  return `${icon} [${progressIndicator(progress)}] ${progress.step.replace(/_/g, ' ')}: ${progress.message}`;
}

/** `Step N` when the runner reports a step count, the deprecated percentage when that is all there is. */
function progressIndicator(progress: AgentProgressUpdate): string {
  const stepCount = progress.metadata?.stepCount;
  if (stepCount != null) {
    return `Step ${String(stepCount)}`.padStart(7, ' ');
  }
  if (progress.percentage != null) {
    return `${progress.percentage.toFixed(0).padStart(3, ' ')}%`;
  }
  return '   ';
}
