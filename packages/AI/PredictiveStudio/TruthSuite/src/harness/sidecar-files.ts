/**
 * Where the truth sidecar (`pnpm run truth:sidecar`, `scripts/sidecar.mts`) records itself, shared by the script that
 * writes these files and {@link HarnessSidecar}, which reads them. The run directory is `$PS_SIDECAR_RUN_DIR` when set
 * (an absolute path, so two agents on one checkout keep separate sidecars), else the TruthSuite package's `.run`; it
 * never depends on the working directory, so it holds under `mj test` (whose working directory is MJAPI's).
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { TruthSuite } from '../truth-suite';

/** The truth sidecar's run files and the variable that pins its port. */
export class SuiteSidecarFiles {
  /** The environment variable `truth:sidecar` reads its listen port from (unset or `0`: an ephemeral port). */
  public static readonly PortVariable = 'TRUTH_SIDECAR_PORT';

  /** The environment variable that moves every run file out of the package's `.run` (an absolute directory path). */
  public static readonly RunDirVariable = 'PS_SIDECAR_RUN_DIR';

  /**
   * The directory every run file lives in: `$PS_SIDECAR_RUN_DIR` when set (created when missing), else
   * `<TruthSuite>/.run`.
   *
   * @param env the environment to read (default: this process's)
   * @throws Error naming the value when `PS_SIDECAR_RUN_DIR` is set but not an absolute path
   */
  public static RunDir(env: NodeJS.ProcessEnv = process.env): string {
    const raw = env[SuiteSidecarFiles.RunDirVariable]?.trim();
    if (!raw) return path.join(TruthSuite.Root(), '.run');
    if (!path.isAbsolute(raw)) {
      throw new Error(`${SuiteSidecarFiles.RunDirVariable}="${raw}" is not an absolute path`);
    }
    mkdirSync(raw, { recursive: true });
    return raw;
  }

  /**
   * The sidecar's URL (`http://127.0.0.1:<port>`), written once it is healthy.
   *
   * @param env the environment the run directory is read from (default: this process's)
   */
  public static UrlFile(env: NodeJS.ProcessEnv = process.env): string {
    return path.join(SuiteSidecarFiles.RunDir(env), 'sidecar.url');
  }

  /**
   * The process id of the `truth:sidecar` script process, written beside the URL file.
   *
   * @param env the environment the run directory is read from (default: this process's)
   */
  public static PidFile(env: NodeJS.ProcessEnv = process.env): string {
    return path.join(SuiteSidecarFiles.RunDir(env), 'sidecar.pid');
  }

  /**
   * Where a sidecar started by `HarnessSidecar.Restart` writes its output.
   *
   * @param env the environment the run directory is read from (default: this process's)
   */
  public static LogFile(env: NodeJS.ProcessEnv = process.env): string {
    return path.join(SuiteSidecarFiles.RunDir(env), 'sidecar.log');
  }

  /**
   * The listen port a `truth:sidecar` start asks for: `TRUTH_SIDECAR_PORT` when set, else `0` (ephemeral).
   *
   * @throws Error naming the value when it is set but not an integer from 0 to 65535
   */
  public static RequestedPort(env: NodeJS.ProcessEnv): number {
    const raw = env[SuiteSidecarFiles.PortVariable]?.trim();
    if (!raw) return 0;
    const port = Number(raw);
    if (!Number.isInteger(port) || port < 0 || port > 65535) {
      throw new Error(`${SuiteSidecarFiles.PortVariable}="${raw}" is not an integer from 0 to 65535`);
    }
    return port;
  }
}
