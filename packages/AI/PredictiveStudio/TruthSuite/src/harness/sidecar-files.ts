/**
 * Where the truth sidecar (`pnpm run truth:sidecar`, `scripts/sidecar.mts`) records itself, shared by the script that
 * writes these files and {@link HarnessSidecar}, which reads them. Paths resolve from the TruthSuite package, never the
 * working directory, so they hold under `mj test` (whose working directory is MJAPI's).
 */
import path from 'node:path';
import { TruthSuite } from '../truth-suite';

/** The truth sidecar's run files and the variable that pins its port. */
export class SuiteSidecarFiles {
  /** The environment variable `truth:sidecar` reads its listen port from (unset or `0`: an ephemeral port). */
  public static readonly PortVariable = 'TRUTH_SIDECAR_PORT';

  /** `<TruthSuite>/.run`, the directory every run file lives in. */
  public static RunDir(): string {
    return path.join(TruthSuite.Root(), '.run');
  }

  /** The sidecar's URL (`http://127.0.0.1:<port>`), written once it is healthy. */
  public static UrlFile(): string {
    return path.join(SuiteSidecarFiles.RunDir(), 'sidecar.url');
  }

  /** The process id of the `truth:sidecar` script process, written beside the URL file. */
  public static PidFile(): string {
    return path.join(SuiteSidecarFiles.RunDir(), 'sidecar.pid');
  }

  /** Where a sidecar started by `HarnessSidecar.Restart` writes its output. */
  public static LogFile(): string {
    return path.join(SuiteSidecarFiles.RunDir(), 'sidecar.log');
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
