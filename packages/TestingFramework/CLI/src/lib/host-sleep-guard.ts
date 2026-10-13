/**
 * @fileoverview Keeps the host from idle-sleeping while a test run is in progress.
 * @module @memberjunction/testing-cli
 *
 * A laptop left running an unattended suite idle-sleeps as soon as nothing else holds a power
 * assertion. Sleep freezes the runner, the database container and MJAPI mid-request; on wake every
 * timer whose deadline passed during the sleep fires at once, so in-flight checks fail as "hung"
 * and in-flight SQL requests fail with "Request failed to complete in 15000ms". Nothing in the
 * suite is wrong; the run simply was not running.
 *
 * On macOS the guard runs `caffeinate -i -s -w <pid>` for the life of this process: an idle-sleep
 * (and, on AC power, system-sleep) assertion that macOS releases by itself when this process exits,
 * so a crashed or killed run can never leave the machine pinned awake. Other platforms get a no-op
 * guard — their idle-sleep behaviour differs and servers/CI do not sleep.
 */

import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';

/** The macOS tool that holds the assertion. Absolute, so PATH cannot substitute another binary. */
export const CAFFEINATE_PATH = '/usr/bin/caffeinate';

/** A held (or declined) sleep guard. */
export interface HostSleepGuardHandle {
    /** True while an assertion process is running for this run. */
    readonly Active: boolean;
    /** What holds the assertion, for the run log (e.g. `caffeinate -i -s -w 1234`), or why none does. */
    readonly Description: string;
    /** Release the assertion now. Idempotent; the assertion also ends when this process exits. */
    Release(): void;
}

/**
 * The members of the spawned assertion process the guard uses. Picked from Node's own `ChildProcess`
 * rather than redeclared, so the names stay Node's (`unref`, `kill`, `once`) without this package
 * declaring lowercase members of its own (MJ's naming standard fails those in an exported interface).
 */
export type SleepAssertionProcess = Pick<ChildProcess, 'unref' | 'kill' | 'once'>;

/** The subset of `child_process.spawn` the guard uses, so tests can substitute it. */
export type SpawnFunction = (command: string, args: readonly string[], options: SpawnOptions) => SleepAssertionProcess;

/**
 * A host sleep guard. {@link HostSleepGuard.Acquire} picks the implementation for the platform:
 * a `caffeinate` assertion on macOS, a guard that holds nothing elsewhere.
 */
export abstract class HostSleepGuard implements HostSleepGuardHandle {
    public abstract readonly Active: boolean;
    public abstract readonly Description: string;
    public abstract Release(): void;

    /**
     * Acquire the guard for the current process. Never throws: a missing or failing `caffeinate`
     * yields an inactive guard and a warning, because a run must not fail for want of a power
     * assertion.
     *
     * @param platform - defaults to `process.platform`
     * @param pid - the process whose lifetime bounds the assertion; defaults to this process
     * @param spawnFn - defaults to `child_process.spawn`
     */
    public static Acquire(
        platform: NodeJS.Platform = process.platform,
        pid: number = process.pid,
        spawnFn: SpawnFunction = spawn
    ): HostSleepGuard {
        // Only macOS gets an assertion: other platforms' idle-sleep behaviour differs, and servers/CI do not sleep.
        if (platform !== 'darwin') {
            return new NoopGuard(`no sleep guard on ${platform}`);
        }
        const args = ['-i', '-s', '-w', String(pid)];
        try {
            const child = spawnFn(CAFFEINATE_PATH, args, { stdio: 'ignore' });
            child.once('error', (err?: Error) => {
                console.warn(`⚠ Could not hold a sleep assertion (${CAFFEINATE_PATH}): ${err?.message || 'unknown error'}. ` +
                    'If the host sleeps during the run, in-flight checks fail on wake.');
            });
            return new CaffeinateGuard(child, `caffeinate ${args.join(' ')}`);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.warn(`⚠ Could not hold a sleep assertion (${CAFFEINATE_PATH}): ${message}.`);
            return new NoopGuard(`caffeinate failed to start: ${message}`);
        }
    }

    /**
     * Acquire the guard for one `mj test run` / `mj test suite` invocation and print one status
     * line when it holds an assertion. The caller releases it when the command ends; the assertion
     * also ends with this process however the run exits (`caffeinate -w <pid>`).
     *
     * @param platform - defaults to `process.platform` (see {@link Acquire})
     * @param pid - defaults to this process
     * @param spawnFn - defaults to `child_process.spawn`
     */
    public static AcquireForRun(
        platform: NodeJS.Platform = process.platform,
        pid: number = process.pid,
        spawnFn: SpawnFunction = spawn
    ): HostSleepGuard {
        const guard = HostSleepGuard.Acquire(platform, pid, spawnFn);
        if (guard.Active) {
            console.log(`Holding a host sleep assertion for this run (${guard.Description})`);
        }
        return guard;
    }
}

/** The guard on platforms without an assertion (or when caffeinate could not start): holds nothing. */
class NoopGuard extends HostSleepGuard {
    public readonly Active = false;
    public readonly Description: string;

    constructor(description: string) {
        super();
        this.Description = description;
    }

    public Release(): void {
        /* nothing held */
    }
}

/** The macOS guard: a `caffeinate` child process holds the assertion until released or it exits. */
class CaffeinateGuard extends HostSleepGuard {
    private child: SleepAssertionProcess | undefined;
    public readonly Description: string;

    constructor(child: SleepAssertionProcess, description: string) {
        super();
        this.child = child;
        this.Description = description;
        // Never let the guard keep the runner alive, and drop the handle if it dies on its own.
        child.unref();
        child.once('exit', () => { this.child = undefined; });
        child.once('error', () => { this.child = undefined; });
    }

    public get Active(): boolean {
        return this.child !== undefined;
    }

    public Release(): void {
        if (this.child) {
            const c = this.child;
            this.child = undefined;
            c.kill('SIGTERM');
        }
    }
}
