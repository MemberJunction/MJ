/**
 * Keeps the machine awake while a long-running database command runs.
 *
 * `mj install` and `mj app install` run for many minutes, and a laptop left alone in that time
 * idles into sleep. Sleep pauses everything at once — the CLI, the local database (often a Docker
 * VM), and every socket between them — and on wake each in-flight request's timer fires together:
 * a migration batch that was doing nothing wrong reports `Timeout: Request failed to complete in
 * 300000ms`, a GitHub download reports `read ECONNRESET`, and the app being installed is rolled
 * back. Clean end-user installs of MJ + a multi-app Open App chain failed this way repeatedly.
 *
 * On macOS this holds a `caffeinate` assertion tied to the CLI's own pid, so it ends the moment
 * the command does — no cleanup, nothing left behind. Elsewhere it is a no-op. Set
 * {@link KEEP_AWAKE_OPT_OUT_ENV_VAR} to opt out.
 */
import { spawn } from 'node:child_process';

/** Set to `1` (or `true`) to let the machine sleep during long commands. */
export const KEEP_AWAKE_OPT_OUT_ENV_VAR = 'MJ_ALLOW_SLEEP';

/** Commands long and database-bound enough that sleeping mid-run breaks them. */
export const KEEP_AWAKE_COMMANDS: ReadonlySet<string> = new Set([
  'install',
  'app:install',
  'app:upgrade',
  'migrate',
]);

/** The pieces of the environment this depends on, injectable for tests. */
export interface KeepAwakeEnvironment {
  Platform: NodeJS.Platform;
  Env: NodeJS.ProcessEnv;
  Pid: number;
  Spawn: typeof spawn;
}

const DEFAULT_ENVIRONMENT: KeepAwakeEnvironment = {
  Platform: process.platform,
  Env: process.env,
  Pid: process.pid,
  Spawn: spawn,
};

/**
 * Starts the keep-awake assertion for `commandId` when it applies.
 *
 * @returns true when an assertion was started. Never throws: failing to keep the machine awake
 *          must not fail the command it was meant to protect.
 */
export function KeepAwakeForCommand(commandId: string, environment: KeepAwakeEnvironment = DEFAULT_ENVIRONMENT): boolean {
  if (!KEEP_AWAKE_COMMANDS.has(commandId) || environment.Platform !== 'darwin') return false;
  const optOut = (environment.Env[KEEP_AWAKE_OPT_OUT_ENV_VAR] ?? '').trim().toLowerCase();
  if (optOut === '1' || optOut === 'true') return false;
  try {
    // -i: no idle sleep. -s: no system sleep while on AC power. -w: exit when the CLI exits.
    const child = environment.Spawn('caffeinate', ['-i', '-s', '-w', String(environment.Pid)], { stdio: 'ignore' });
    child.on('error', () => undefined); // caffeinate missing or refused — carry on without it
    child.unref(); // never keep the CLI alive for its sake
    return true;
  } catch {
    return false;
  }
}
