/**
 * Agent-first interactivity (the ElevenLabs CLI inversion).
 *
 * The default is **non-interactive**. A prompt is a blocking question, and the
 * overwhelmingly common caller of `mj` is now an automation — an agent, a CI job,
 * a container — that cannot answer one. Under the old default those callers hung
 * forever on a `@inquirer` prompt with no output explaining why.
 *
 * So interactivity is opt-in via the global `--human-friendly` flag (or the
 * {@link HUMAN_FRIENDLY_ENV} env var the CLI root sets from it). Everything else
 * runs headless and, when it genuinely needs a value it wasn't given, **fails
 * fast with the flag to pass** rather than waiting on stdin.
 *
 * Both entry points here are pure functions over injected state — no direct
 * `process` reads — so a test can drive every branch without touching the real
 * TTY.
 */

/** Env var the CLI root sets when `--human-friendly` was passed (see the prerun hook). */
export const HUMAN_FRIENDLY_ENV = 'MJ_CLI_HUMAN_FRIENDLY';

/** Stable code carried by {@link NonInteractiveError} and its result-envelope entry. */
export const NON_INTERACTIVE_CODE = 'E_NON_INTERACTIVE';

/** Inputs to {@link ResolveInteractivity}. Every field is injectable for tests. */
export interface InteractivityInput {
  /** The `--human-friendly` flag value, when the command declared it. */
  humanFriendlyFlag?: boolean;
  /** Defaults to `process.env`. */
  env?: NodeJS.ProcessEnv;
  /** Defaults to `process.stdin.isTTY`. A prompt needs a real stdin to read from. */
  stdinIsTTY?: boolean;
}

/**
 * Why the CLI is (or is not) allowed to prompt. The `reason` is machine-stable so
 * an error envelope can carry it and a test can assert on it.
 */
export interface InteractivityDecision {
  interactive: boolean;
  reason:
    /** `--human-friendly` was passed and stdin is a TTY. */
    | 'human-friendly-flag'
    /** {@link HUMAN_FRIENDLY_ENV} was set (the root flag, forwarded) and stdin is a TTY. */
    | 'human-friendly-env'
    /** Interactivity was requested but there is no TTY to prompt on. */
    | 'no-tty'
    /** Nothing asked for interactivity — the agent-first default. */
    | 'agent-first-default';
}

/**
 * Decides whether this run may prompt.
 *
 * Note the asymmetry: asking for `--human-friendly` without a TTY resolves to
 * NON-interactive with reason `no-tty` rather than throwing. The caller is then
 * free to fail with a useful message at the exact point a value is missing —
 * which is far more actionable than a blanket "no TTY" error at startup.
 */
export function ResolveInteractivity(input: InteractivityInput = {}): InteractivityDecision {
  const env = input.env ?? process.env;
  const stdinIsTTY = input.stdinIsTTY ?? process.stdin.isTTY === true;

  const wantedByFlag = input.humanFriendlyFlag === true;
  const wantedByEnv = env[HUMAN_FRIENDLY_ENV] === '1';

  if (wantedByFlag || wantedByEnv) {
    if (!stdinIsTTY) return { interactive: false, reason: 'no-tty' };
    return { interactive: true, reason: wantedByFlag ? 'human-friendly-flag' : 'human-friendly-env' };
  }

  return { interactive: false, reason: 'agent-first-default' };
}

/**
 * Thrown when a command needs a value it wasn't given and isn't allowed to ask.
 *
 * Carries the two fields an agent actually needs to recover on its own: a stable
 * {@link NonInteractiveError.code} to branch on, and a {@link NonInteractiveError.suggestion}
 * naming the exact flag to pass. `MJCLIResultError` mirrors both, so a plugin can
 * put this straight into its result envelope.
 */
export class NonInteractiveError extends Error {
  /** Always {@link NON_INTERACTIVE_CODE}. */
  public readonly code = NON_INTERACTIVE_CODE;
  /** The concrete remedy, e.g. `Pass --entity "MJ: AI Prompts".` */
  public readonly suggestion: string;
  /** Why prompting was refused — from {@link InteractivityDecision.reason}. */
  public readonly reason: InteractivityDecision['reason'];

  constructor(what: string, suggestion: string, reason: InteractivityDecision['reason']) {
    super(
      `${what} is required and this run is non-interactive. ${suggestion} ` +
        `(Or pass --human-friendly to be prompted for it, which needs an interactive terminal.)`
    );
    this.name = 'NonInteractiveError';
    this.suggestion = suggestion;
    this.reason = reason;
  }
}

/** Options for {@link ResolveOrPrompt}. */
export interface ResolveOrPromptOptions<T> {
  /**
   * The value already supplied by a flag. Any value other than `undefined` wins
   * outright — including `false` and `''`, which are legitimate answers.
   */
  flagValue: T | undefined;
  /** Asks the human. Only ever invoked when {@link ResolveInteractivity} allows it. */
  prompt: () => Promise<T>;
  /** What is being asked for, for the error message — e.g. `An entity name`. */
  what: string;
  /** The exact remedy, e.g. `Pass --entity "MJ: AI Prompts".` */
  suggestion: string;
  /** Interactivity state; defaults to reading the env/TTY. */
  interactivity?: InteractivityInput;
}

/**
 * The single choke point every prompt in the CLI goes through.
 *
 * Resolution order: an explicit flag wins; otherwise prompt if this run is
 * allowed to; otherwise throw {@link NonInteractiveError} naming the flag. A
 * command that routes all its prompts through this can never hang an agent.
 */
export async function ResolveOrPrompt<T>(options: ResolveOrPromptOptions<T>): Promise<T> {
  if (options.flagValue !== undefined) return options.flagValue;

  const decision = ResolveInteractivity(options.interactivity);
  if (decision.interactive) return await options.prompt();

  throw new NonInteractiveError(options.what, options.suggestion, decision.reason);
}

/**
 * Guards a whole command (rather than one value) that is interactive by nature —
 * e.g. the setup wizard, which asks two dozen questions with no flag equivalents.
 * Throws {@link NonInteractiveError} unless this run may prompt.
 */
export function RequireInteractive(what: string, suggestion: string, interactivity?: InteractivityInput): void {
  const decision = ResolveInteractivity(interactivity);
  if (!decision.interactive) throw new NonInteractiveError(what, suggestion, decision.reason);
}
