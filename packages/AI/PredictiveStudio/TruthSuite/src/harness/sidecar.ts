/**
 * The truth sidecar hook behind TruthHarness.UseSuiteSidecar, the suite sidecar's trainer for in-process retrains, and
 * the restart G3.1 uses to prove a kept artifact scores the same once the sidecar's warm cache is gone (D4-59).
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { closeSync, existsSync, openSync, readFileSync, rmSync } from 'node:fs';
import { MLSidecar } from '@memberjunction/predictive-studio-sidecar';
import { MJSidecarTrainer, type ITrainerEvaluator } from '@memberjunction/predictive-studio';
import { TruthSuite } from '../truth-suite';
import { SuiteSidecarFiles } from './sidecar-files';

/** The environment variable `MLSidecar` reads its remote URL from when it is constructed. */
const SIDECAR_URL_VARIABLE = 'PREDICTIVE_STUDIO_SIDECAR_URL';
/** How long a stopped sidecar has to exit (its script stops the Python child first, which SIGKILLs after 5 s). */
const STOP_TIMEOUT_MS = 30_000;
/** How long a restarted sidecar has to write its pid file and answer its health route (Python imports its ML stack). */
const START_TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 250;

/** A started `truth:sidecar` process, as {@link HarnessSidecar.Restart} watches it. */
export interface SpawnedSidecar {
  /** Calls `listener` with the exit code (-1 for a signal) if the process exits. */
  OnExit(listener: (code: number) => void): void;
}

/**
 * What {@link HarnessSidecar.Restart} touches: the run files, the clock budget and the process seams. Production uses
 * {@link HarnessSidecar.DefaultRestartDeps}; tests pass stubs and a temporary directory, so no real sidecar is involved.
 */
export interface SidecarRestartDeps {
  /** The sidecar's URL file. */
  readonly UrlFile: string;
  /** The sidecar's pid file. */
  readonly PidFile: string;
  /** Where the new sidecar's output goes. */
  readonly LogFile: string;
  /** How long the stopped process has to exit. */
  readonly StopTimeoutMs: number;
  /** How long the new process has to write its pid file and answer its health route. */
  readonly StartTimeoutMs: number;
  /** The wait between checks. */
  readonly PollIntervalMs: number;
  /** Whether a process with this pid exists. */
  IsRunning(pid: number): boolean;
  /** Send `signal` to the process. */
  Signal(pid: number, signal: NodeJS.Signals): void;
  /** Start `truth:sidecar` on `port`, detached, its output appended to `logFile`. */
  Spawn(port: number, logFile: string): SpawnedSidecar;
  /** True when `GET <url>/health` answers 200. */
  IsHealthy(url: string): Promise<boolean>;
}

/** `TruthHarness.UseSuiteSidecar`, the gate fixture's default, the suite sidecar's trainer and its restart. */
export class HarnessSidecar {
  /** Where the truth sidecar writes its URL when it starts (`pnpm run truth:sidecar`). */
  private static urlFile(): string {
    return SuiteSidecarFiles.UrlFile();
  }

  /** The suite sidecar's URL from its URL file, or null when the sidecar has not written one. */
  private static suiteUrl(): string | null {
    return HarnessSidecar.readUrl(HarnessSidecar.urlFile());
  }

  /**
   * Point this gate process's in-process engine calls (TrainingDelegation.RetrainFromSnapshotViaEngine) at the suite's
   * single-threaded sidecar — the one MJAPI trains on (`sidecar.url` in the run directory) — and return its URL. MLSidecar reads
   * PREDICTIVE_STUDIO_SIDECAR_URL when it is constructed, and the process-wide sidecar is constructed once, so this
   * only reaches a client built after it; `DefaultToSuiteSidecar` runs before any gate builds one.
   *
   * @throws when the URL file is missing (the sidecar is not running)
   */
  public static UseSuiteSidecar(): string {
    const url = HarnessSidecar.suiteUrl();
    if (url === null) throw new Error(`${HarnessSidecar.urlFile()} is missing: start the truth sidecar (pnpm run truth:sidecar)`);
    process.env[SIDECAR_URL_VARIABLE] = url;
    return url;
  }

  /**
   * Sets PREDICTIVE_STUDIO_SIDECAR_URL to the suite sidecar's URL when the variable is unset and the URL file exists,
   * so the first sidecar client any gate builds in this process is the suite's. A set variable is left alone.
   *
   * @returns the variable's value afterwards, or null when it is unset and no URL file exists
   */
  public static DefaultToSuiteSidecar(): string | null {
    const current = process.env[SIDECAR_URL_VARIABLE]?.trim();
    if (current) return current;
    const url = HarnessSidecar.suiteUrl();
    if (url !== null) process.env[SIDECAR_URL_VARIABLE] = url;
    return url;
  }

  /** A trainer on the sidecar at `url` (remote mode: no child process is started). */
  public static SuiteTrainer(url: string): ITrainerEvaluator {
    return new MJSidecarTrainer(new MLSidecar({ url }));
  }

  /**
   * Restart the suite sidecar on the URL it answers today, so every client holding that URL (MJAPI's) reaches the new
   * process: stop the process its pid file names (SIGTERM, then wait for it to exit), start `pnpm run truth:sidecar`
   * detached in the TruthSuite package with `TRUTH_SIDECAR_PORT` set to the same port (output to `sidecar.log` in the run directory), and
   * wait until it has written a new pid file and its `/health` route answers 200. The new process outlives the caller.
   * Nothing is started when the stop step refuses: a missing pid file or a pid that is not running throws first.
   *
   * @param deps the run files and process seams (default: the TruthSuite run files and the real processes)
   * @returns the sidecar's URL (unchanged)
   * @throws when the URL or pid file is missing or invalid, the named process is not running, it does not exit in time,
   *   or the new sidecar exits or is not healthy in time (naming the URL and the log file)
   */
  public static async Restart(deps: SidecarRestartDeps = HarnessSidecar.DefaultRestartDeps()): Promise<string> {
    const url = HarnessSidecar.readUrl(deps.UrlFile);
    if (url === null) throw new Error(`${deps.UrlFile} is missing: start the truth sidecar (pnpm run truth:sidecar)`);
    const oldPid = HarnessSidecar.readPid(deps.PidFile);
    if (oldPid === null) throw new Error(`${deps.PidFile} is missing: start the truth sidecar with this checkout's truth:sidecar script`);
    await HarnessSidecar.stopProcess(oldPid, deps);
    rmSync(deps.PidFile, { force: true });
    const child = deps.Spawn(HarnessSidecar.portOf(url), deps.LogFile);
    await HarnessSidecar.waitUntilHealthy(url, oldPid, child, deps);
    return url;
  }

  /** The production restart seams: the TruthSuite run files, `process.kill`, a detached `pnpm run truth:sidecar`, fetch. */
  public static DefaultRestartDeps(): SidecarRestartDeps {
    return {
      UrlFile: SuiteSidecarFiles.UrlFile(), PidFile: SuiteSidecarFiles.PidFile(), LogFile: SuiteSidecarFiles.LogFile(),
      StopTimeoutMs: STOP_TIMEOUT_MS, StartTimeoutMs: START_TIMEOUT_MS, PollIntervalMs: POLL_INTERVAL_MS,
      IsRunning: (pid) => HarnessSidecar.isRunning(pid),
      Signal: (pid, signal) => { process.kill(pid, signal); },
      Spawn: (port, logFile) => HarnessSidecar.spawnSidecar(port, logFile),
      IsHealthy: (url) => HarnessSidecar.isHealthy(url),
    };
  }

  /** The URL in a URL file, or null when there is none. */
  private static readUrl(file: string): string | null {
    if (!existsSync(file)) return null;
    const url = readFileSync(file, 'utf8').trim();
    return url.length > 0 ? url : null;
  }

  /** The pid in a pid file, or null when there is none. */
  private static readPid(file: string): number | null {
    if (!existsSync(file)) return null;
    const raw = readFileSync(file, 'utf8').trim();
    const pid = Number(raw);
    if (!Number.isInteger(pid) || pid <= 0) throw new Error(`${file} holds "${raw}", which is not a process id`);
    return pid;
  }

  /** The explicit port of a sidecar URL (the sidecar always listens on one). */
  private static portOf(url: string): number {
    const port = Number(new URL(url).port);
    if (!Number.isInteger(port) || port <= 0) throw new Error(`the suite sidecar URL ${url} names no port`);
    return port;
  }

  /** Whether a process with this pid exists (signal 0 checks without signalling). */
  private static isRunning(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch (e) {
      if (e instanceof Error && 'code' in e && e.code === 'ESRCH') return false;
      throw e;
    }
  }

  /** SIGTERM the process and wait for it to exit. */
  private static async stopProcess(pid: number, deps: SidecarRestartDeps): Promise<void> {
    if (!deps.IsRunning(pid)) throw new Error(`the truth sidecar's pid file names process ${pid}, which is not running`);
    deps.Signal(pid, 'SIGTERM');
    const deadline = Date.now() + deps.StopTimeoutMs;
    while (deps.IsRunning(pid)) {
      if (Date.now() > deadline) throw new Error(`the truth sidecar (process ${pid}) did not exit within ${deps.StopTimeoutMs / 1000} s of SIGTERM`);
      await HarnessSidecar.sleep(deps.PollIntervalMs);
    }
  }

  /** Start `pnpm run truth:sidecar` detached on `port`, its output appended to `logFile`. */
  private static spawnSidecar(port: number, logFile: string): SpawnedSidecar {
    const log = openSync(logFile, 'a');
    try {
      const child: ChildProcess = spawn('pnpm', ['run', 'truth:sidecar'], {
        cwd: TruthSuite.Root(),
        detached: true,
        stdio: ['ignore', log, log],
        env: { ...process.env, [SuiteSidecarFiles.PortVariable]: String(port) },
      });
      child.unref();
      // `??`, not `||`: exit code 0 is a code; only null (the process was killed by a signal) becomes -1.
      return { OnExit: (listener) => { child.once('exit', (code) => listener(code ?? -1)); } };
    } finally {
      closeSync(log); // the child holds its own descriptor
    }
  }

  /** Wait until the pid file names a process other than `oldPid` and `url`'s health route answers 200. */
  private static async waitUntilHealthy(url: string, oldPid: number, child: SpawnedSidecar, deps: SidecarRestartDeps): Promise<void> {
    let exitCode: number | null = null;
    child.OnExit((code) => { exitCode = code; });
    const deadline = Date.now() + deps.StartTimeoutMs;
    while (Date.now() <= deadline) {
      if (exitCode !== null) throw new Error(`the restarted truth sidecar exited with code ${exitCode} before it was healthy (see ${deps.LogFile})`);
      const pid = HarnessSidecar.readPid(deps.PidFile);
      if (pid !== null && pid !== oldPid && (await deps.IsHealthy(url))) return;
      await HarnessSidecar.sleep(deps.PollIntervalMs);
    }
    throw new Error(`the restarted truth sidecar was not healthy at ${url} within ${deps.StartTimeoutMs / 1000} s (see ${deps.LogFile})`);
  }

  /** True when `GET <url>/health` answers 200; a refused or reset connection is "not yet". */
  private static async isHealthy(url: string): Promise<boolean> {
    try {
      const res = await fetch(new URL('/health', url), { signal: AbortSignal.timeout(2_000) });
      return res.status === 200;
    } catch {
      return false;
    }
  }

  private static sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}
