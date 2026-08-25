/**
 * MJCLI-side helpers for the agent-first interactivity contract (see
 * `@memberjunction/cli-core`'s `interaction.ts` for the model).
 *
 * These exist because most `mj` commands are still plain oclif `Command`s rather
 * than `BaseCLIPlugin` subclasses, so they don't inherit `--interactive` or the
 * structured `NonInteractiveError` handling. They read the same env signal the prerun
 * hook sets from that flag, which keeps a migrated plugin and an unmigrated command
 * behaving identically at the prompt — and both of them detecting a terminal the same
 * way when no flag is given.
 */
import {
  NonInteractiveError,
  RequireInteractive,
  ResolveInteractivity,
  ResolveOrPrompt,
  type InteractivityInput,
} from '@memberjunction/cli-core';

export { NonInteractiveError };

/**
 * Whether this run may prompt: true at a real terminal, false when piped, spawned, or
 * running in CI. Reads the env var the prerun hook sets from the global `--interactive`
 * / `--no-interactive` flags, then falls back to detecting the terminal.
 */
export function isInteractiveRun(overrides: InteractivityInput = {}): boolean {
  return ResolveInteractivity(overrides).interactive;
}

/**
 * Asks for one value, or fails fast naming the flag that supplies it.
 *
 * Thin re-export of cli-core's `ResolveOrPrompt` so unmigrated commands import from
 * one place and pick up the env-based interactivity default automatically.
 */
export const resolveOrPrompt = ResolveOrPrompt;

/** Guards a command that is interactive by nature and has no flag equivalent. */
export const requireInteractive = RequireInteractive;

/**
 * Renders a {@link NonInteractiveError} through oclif's error path for commands that
 * aren't `BaseCLIPlugin` subclasses (which get the structured envelope instead).
 *
 * Sets exit code 1 and prints the suggestion, so an agent reading stderr still gets
 * the flag to pass — the important half of the contract — even before the command is
 * migrated.
 *
 * Re-throws anything that isn't a `NonInteractiveError` untouched.
 */
export function failOnNonInteractive(
  command: { error: (message: string | Error, options?: { exit?: number; suggestions?: string[] }) => never },
  error: unknown
): never {
  if (error instanceof NonInteractiveError) {
    command.error(error.message, { exit: 1, suggestions: [error.suggestion] });
  }
  throw error;
}

/**
 * Wraps a command body so any {@link NonInteractiveError} raised anywhere inside it
 * — including deep in a service callback — surfaces as a clean, actionable failure
 * instead of an unhandled rejection.
 */
export async function withNonInteractiveHandling<T>(
  command: { error: (message: string | Error, options?: { exit?: number; suggestions?: string[] }) => never },
  body: () => Promise<T>
): Promise<T> {
  try {
    return await body();
  } catch (e) {
    return failOnNonInteractive(command, e);
  }
}
