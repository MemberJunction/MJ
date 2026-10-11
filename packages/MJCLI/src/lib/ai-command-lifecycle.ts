/**
 * How an `mj ai` command keeps its stdout clean and ends once its result is written.
 *
 * An `mj ai` command's stdout is its result — under `--format json`, which is also the default when
 * stdout is piped, a document the caller parses. Two things used to break that contract:
 *
 * - The framework underneath logs through `console.log`: connection and startup messages before
 *   the result, and an agent run abandoned after `--timeout` may keep logging after it. Any such
 *   line on stdout makes the document unparseable. {@link RouteConsoleToStderr} moves them.
 * - The command opens the AI CLI's database pool, which keeps at least two connections open, and
 *   open sockets hold Node's event loop — so the process hung after printing its result. Calling
 *   `process.exit()` straight after printing is no fix: it drops whatever is still queued for a pipe,
 *   cutting a large result off at 64KB. {@link EndAICommand} closes the pool, sets the exit code
 *   and lets the process exit once its output has drained.
 */

/**
 * How long a finished command may keep running before {@link ArmExitSafetyNet} ends it. Long enough
 * for stdout to drain; anything still running by then is a stray handle, not work.
 */
export const AI_COMMAND_EXIT_GRACE_MS = 2000;

/**
 * Sends `console.log`, `info`, `warn` and `debug` to stderr for the rest of the process, so only
 * the command's own output reaches stdout. oclif's `this.log` writes to stdout directly and is
 * unaffected.
 *
 * Not for `--chat`, whose conversation is written with `console.log` and belongs on stdout.
 *
 * @returns a function that puts the console back, for tests.
 */
export function RouteConsoleToStderr(): () => void {
  const original = { log: console.log, info: console.info, warn: console.warn, debug: console.debug };
  const toStderr = console.error.bind(console);
  console.log = toStderr;
  console.info = toStderr;
  console.warn = toStderr;
  console.debug = toStderr;
  return () => {
    console.log = original.log;
    console.info = original.info;
    console.warn = original.warn;
    console.debug = original.debug;
  };
}

/**
 * Closes the AI CLI's database pool.
 *
 * A failure is written to stderr rather than thrown: the command's result is already out and its
 * exit code decided, and a pool that would not close is no reason to change either.
 *
 * @param closeProvider - `CloseMJProvider` from `@memberjunction/ai-cli`.
 */
export async function CloseAIProvider(closeProvider: () => Promise<void>): Promise<void> {
  try {
    await closeProvider();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Warning: the database connection did not close cleanly: ${message}\n`);
  }
}

/**
 * Ends a finished `mj ai` command: closes the pool, sets the process exit code, and arms
 * {@link ArmExitSafetyNet}. Call it after the result is written, then return from `run()`.
 *
 * @param closeProvider - `CloseMJProvider` from `@memberjunction/ai-cli`.
 * @param exitCode - 0 when the command did what was asked, 1 when it did not.
 */
export async function EndAICommand(closeProvider: () => Promise<void>, exitCode: number): Promise<void> {
  await CloseAIProvider(closeProvider);
  process.exitCode = exitCode;
  ArmExitSafetyNet(exitCode);
}

/**
 * Makes sure the process exits even if something besides the pool is still holding it open.
 *
 * Closing the pool removes the handle that kept `mj ai` commands alive, but packages loaded along
 * the way can start timers of their own (an engine's cache-expiry timer, an SDK's keep-alive
 * socket), and a run abandoned after `--timeout` may still be working. The timer here is unref'd,
 * so a process that can exit by itself does so at once and the timer never fires. When it does
 * fire, it waits for stdout to finish writing before exiting, so the result is never cut off.
 *
 * @returns the timer, so a caller (or a test) can clear it.
 */
export function ArmExitSafetyNet(exitCode: number, delayMs: number = AI_COMMAND_EXIT_GRACE_MS): NodeJS.Timeout {
  const timer = setTimeout(() => {
    // A write callback runs only after everything queued before it has been handed to the OS.
    process.stdout.write('', () => process.exit(exitCode));
  }, delayMs);
  timer.unref();
  return timer;
}
