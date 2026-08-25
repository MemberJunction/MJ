/**
 * Interactivity resolution: detect whether a human is actually present, and let
 * either side say otherwise explicitly.
 *
 * A prompt is a blocking question. A human at a terminal can answer one; an agent,
 * a CI job, or a container cannot, and under the old behaviour it simply hung on
 * stdin with no output explaining why. The fix is not to take prompting away from
 * humans — it is to stop *assuming* one is there.
 *
 * So the default is inferred rather than fixed: a real terminal on both stdin and
 * stdout means a human, and everything else means automation. `--interactive` and
 * `--no-interactive` (plus {@link INTERACTIVE_ENV}) override the inference in either
 * direction. When a command needs a value it wasn't given and may not ask for it, it
 * **fails fast naming the flag** instead of waiting on stdin.
 *
 * Both entry points here are pure functions over injected state — no direct
 * `process` reads — so a test can drive every branch without a real TTY.
 */

/**
 * Forces interactivity on (`1`/`true`) or off (`0`/`false`) for a whole shell session,
 * overriding TTY detection. An agent harness that shells out through a pty should set
 * this to `0` so its subprocesses can never block on a question.
 */
export const INTERACTIVE_ENV = 'MJ_CLI_INTERACTIVE';

/** Stable code carried by {@link NonInteractiveError} and its result-envelope entry. */
export const NON_INTERACTIVE_CODE = 'E_NON_INTERACTIVE';

/**
 * Environment variables that mean "this is an automated build", checked when a TTY is
 * present anyway (some runners allocate one). Any value other than the empty string,
 * `0`, or `false` counts as set — CI systems variously use `true`, `1`, or their own name.
 */
const CI_ENV_VARS = [
  'CI',
  'CONTINUOUS_INTEGRATION',
  'GITHUB_ACTIONS',
  'GITLAB_CI',
  'BUILDKITE',
  'CIRCLECI',
  'TRAVIS',
  'TEAMCITY_VERSION',
  'TF_BUILD',
  'JENKINS_URL',
] as const;

/** Inputs to {@link ResolveInteractivity}. Every field is injectable for tests. */
export interface InteractivityInput {
  /**
   * The `--interactive` / `--no-interactive` flag value, when the caller passed one.
   * `undefined` means "not specified" — that is what lets detection run.
   */
  interactiveFlag?: boolean;
  /** Defaults to `process.env`. */
  env?: NodeJS.ProcessEnv;
  /** Defaults to `process.stdin.isTTY`. A prompt needs a real stdin to read from. */
  stdinIsTTY?: boolean;
  /** Defaults to `process.stdout.isTTY`. A prompt needs a real stdout to render on. */
  stdoutIsTTY?: boolean;
}

/** Why this run may or may not prompt. Machine-stable, so errors and tests can use it. */
export type InteractivityReason =
  /** `--no-interactive` was passed. */
  | 'flag-off'
  /** `--interactive` was passed and there is a usable terminal. */
  | 'flag-on'
  /** {@link INTERACTIVE_ENV} is `0`/`false`. */
  | 'env-off'
  /** {@link INTERACTIVE_ENV} is `1`/`true` and there is a usable terminal. */
  | 'env-on'
  /** No terminal on stdin and/or stdout — piped, redirected, or spawned. */
  | 'no-tty'
  /** A terminal is present, but a CI environment variable says this is a build. */
  | 'ci'
  /** `TERM=dumb` — a terminal that cannot render a prompt. */
  | 'dumb-terminal'
  /** A real terminal with nothing indicating otherwise: a human is presumed present. */
  | 'tty-detected';

/** The decision plus the rule that produced it. */
export interface InteractivityDecision {
  interactive: boolean;
  reason: InteractivityReason;
}

/** Treats `''`, `'0'`, and `'false'` as unset; anything else as set. */
function envFlagIsSet(value: string | undefined): boolean {
  if (value === undefined) return false;
  const v = value.trim().toLowerCase();
  return v !== '' && v !== '0' && v !== 'false';
}

/** `1`/`true` → true, `0`/`false` → false, anything else (including unset) → undefined. */
function envTriState(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  const v = value.trim().toLowerCase();
  if (v === '1' || v === 'true') return true;
  if (v === '0' || v === 'false') return false;
  return undefined;
}

/**
 * Decides whether this run may prompt, most explicit signal first:
 *
 * 1. `--no-interactive` → never
 * 2. `--interactive` → yes, if there is a terminal to prompt on
 * 3. {@link INTERACTIVE_ENV} → the same, one level down
 * 4. no terminal on stdin or stdout → never
 * 5. a CI environment variable is set → never
 * 6. `TERM=dumb` → never
 * 7. otherwise → yes; a real terminal means a human
 *
 * Note the asymmetry at steps 2 and 3: asking for interactivity without a terminal
 * resolves to NON-interactive with reason `no-tty` rather than throwing. The caller
 * is then free to fail at the exact point a value is missing, which is far more
 * actionable than a blanket "no TTY" error at startup.
 */
export function ResolveInteractivity(input: InteractivityInput = {}): InteractivityDecision {
  const env = input.env ?? process.env;
  const stdinIsTTY = input.stdinIsTTY ?? process.stdin.isTTY === true;
  const stdoutIsTTY = input.stdoutIsTTY ?? process.stdout.isTTY === true;
  const hasTerminal = stdinIsTTY && stdoutIsTTY;

  if (input.interactiveFlag === false) return { interactive: false, reason: 'flag-off' };
  if (input.interactiveFlag === true) {
    return hasTerminal ? { interactive: true, reason: 'flag-on' } : { interactive: false, reason: 'no-tty' };
  }

  const fromEnv = envTriState(env[INTERACTIVE_ENV]);
  if (fromEnv === false) return { interactive: false, reason: 'env-off' };
  if (fromEnv === true) {
    return hasTerminal ? { interactive: true, reason: 'env-on' } : { interactive: false, reason: 'no-tty' };
  }

  if (!hasTerminal) return { interactive: false, reason: 'no-tty' };
  if (CI_ENV_VARS.some((name) => envFlagIsSet(env[name]))) return { interactive: false, reason: 'ci' };
  if (env.TERM?.trim().toLowerCase() === 'dumb') return { interactive: false, reason: 'dumb-terminal' };

  return { interactive: true, reason: 'tty-detected' };
}

/** Explains, in one clause, why prompting was refused — so the error can say it out loud. */
function describeReason(reason: InteractivityReason): string {
  switch (reason) {
    case 'no-tty':
      return 'this run has no interactive terminal';
    case 'ci':
      return 'this run looks like CI';
    case 'dumb-terminal':
      return 'this terminal cannot display a prompt (TERM=dumb)';
    case 'flag-off':
      return '--no-interactive was passed';
    case 'env-off':
      return `${INTERACTIVE_ENV} is set to off`;
    default:
      return 'this run is non-interactive';
  }
}

/** The "you could also just ask me" half of the message, omitted when it would be wrong. */
function describeRemedy(reason: InteractivityReason): string {
  // Telling someone to pass --interactive when there is no terminal to prompt on
  // would send them in a circle.
  switch (reason) {
    case 'no-tty':
    case 'dumb-terminal':
      return '';
    case 'flag-off':
      return ' (Or drop --no-interactive to be prompted for it.)';
    default:
      return ' (Or pass --interactive to be prompted for it.)';
  }
}

/**
 * Thrown when a command needs a value it wasn't given and isn't allowed to ask for.
 *
 * Carries the two fields an agent needs to recover unaided: a stable
 * {@link NonInteractiveError.code} to branch on, and a {@link NonInteractiveError.suggestion}
 * naming the exact flag to pass. `MJCLIResultError` mirrors both, so a plugin can put
 * this straight into its result envelope.
 */
export class NonInteractiveError extends Error {
  /** Always {@link NON_INTERACTIVE_CODE}. */
  public readonly code = NON_INTERACTIVE_CODE;
  /** The concrete remedy, e.g. `Pass --entity "MJ: AI Prompts".` */
  public readonly suggestion: string;
  /** Why prompting was refused — from {@link InteractivityDecision.reason}. */
  public readonly reason: InteractivityReason;

  constructor(what: string, suggestion: string, reason: InteractivityReason) {
    super(`${what} is required and ${describeReason(reason)}. ${suggestion}${describeRemedy(reason)}`);
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
 * Resolution order: an explicit flag wins; otherwise prompt if this run is allowed to;
 * otherwise throw {@link NonInteractiveError} naming the flag. A command that routes all
 * its prompts through this can never hang an agent, and still behaves exactly as before
 * for a human at a terminal.
 */
export async function ResolveOrPrompt<T>(options: ResolveOrPromptOptions<T>): Promise<T> {
  if (options.flagValue !== undefined) return options.flagValue;

  const decision = ResolveInteractivity(options.interactivity);
  if (decision.interactive) return await options.prompt();

  throw new NonInteractiveError(options.what, options.suggestion, decision.reason);
}

/**
 * Guards a whole command (rather than one value) that is interactive by nature — e.g.
 * the setup wizard, which asks two dozen questions with no flag equivalents. Throws
 * {@link NonInteractiveError} unless this run may prompt.
 */
export function RequireInteractive(what: string, suggestion: string, interactivity?: InteractivityInput): void {
  const decision = ResolveInteractivity(interactivity);
  if (!decision.interactive) throw new NonInteractiveError(what, suggestion, decision.reason);
}
