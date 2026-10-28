/** The truth sidecar hook behind TruthHarness.UseSuiteSidecar, and the suite sidecar's trainer for in-process retrains. */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { MLSidecar } from '@memberjunction/predictive-studio-sidecar';
import { MJSidecarTrainer, type ISidecarTrainer } from '@memberjunction/predictive-studio';
import { TruthSuite } from '../truth-suite';

/** The environment variable `MLSidecar` reads its remote URL from when it is constructed. */
const SIDECAR_URL_VARIABLE = 'PREDICTIVE_STUDIO_SIDECAR_URL';

/** `TruthHarness.UseSuiteSidecar`, the gate fixture's default and the suite sidecar's trainer (static members on one owner). */
export class HarnessSidecar {
  /** Where the truth sidecar writes its URL when it starts (`pnpm run truth:sidecar`). */
  private static urlFile(): string {
    return path.join(TruthSuite.Root(), '.run', 'sidecar.url');
  }

  /** The suite sidecar's URL from its URL file, or null when the sidecar has not written one. */
  private static suiteUrl(): string | null {
    const file = HarnessSidecar.urlFile();
    if (!existsSync(file)) return null;
    const url = readFileSync(file, 'utf8').trim();
    return url.length > 0 ? url : null;
  }

  /**
   * Point this gate process's in-process engine calls (TrainingDelegation.RetrainFromSnapshotViaEngine) at the suite's
   * single-threaded sidecar — the one MJAPI trains on (`.run/sidecar.url`) — and return its URL. MLSidecar reads
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
  public static SuiteTrainer(url: string): ISidecarTrainer {
    return new MJSidecarTrainer(new MLSidecar({ url }));
  }
}
