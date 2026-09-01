/**
 * @module statistics/seams
 *
 * Dependency-injection seams for the statistics pre-pass, mirroring `training/types.ts`.
 *
 * The pass touches exactly two external things — the assembler (which it shares with training)
 * and the sidecar's read-only `/describe`. Both are narrow interfaces so the pass is unit-testable
 * with no DB and no Python process, which matters more here than elsewhere: the pass's job is to
 * produce numbers a human will act on, so its arithmetic has to be provable in isolation.
 */

import type { UserInfo, IMetadataProvider } from '@memberjunction/core';
import type { DescribeRequest, DescribeResponse } from '@memberjunction/predictive-studio-core';
import { MLSidecar } from '@memberjunction/predictive-studio-sidecar';
import { MLSidecarProvider } from '../sidecar-provider';

/**
 * The sidecar `/describe` seam. Production wires {@link MLSidecar.describe}; tests inject a fake
 * returning canned measurements.
 */
export interface ISidecarDescriber {
  /**
   * Measure a training-partition matrix. Read-only — the implementation must not fit, cache, or
   * persist anything.
   */
  describe(req: DescribeRequest): Promise<DescribeResponse>;
}

/** The injected bundle for {@link StatisticsPass.run}. */
export interface StatisticsDeps {
  /** Sidecar `/describe` seam. */
  describer: ISidecarDescriber;
  /** Request user — threaded into assembly for isolation/audit. */
  contextUser?: UserInfo;
  /** Optional provider for multi-provider correctness. */
  provider?: IMetadataProvider;
}

/**
 * Production {@link ISidecarDescriber} — a thin adapter over {@link MLSidecar.describe}, mirroring
 * `MJSidecarTrainer`. Starts the sidecar lazily on first use so a session that never runs a
 * pre-pass never pays for the Python process.
 */
export class MJSidecarDescriber implements ISidecarDescriber {
  private started = false;

  /**
   * @param sidecar an `MLSidecar` instance (managed or remote); defaults to the shared,
   *   process-lifetime instance from {@link MLSidecarProvider} — the SAME one `/train` uses, so a
   *   pre-pass and the training run it informs never talk to different sidecar builds
   */
  constructor(private readonly sidecar: MLSidecar = MLSidecarProvider.Instance.GetSidecar()) {}

  /** @inheritdoc */
  public async describe(req: DescribeRequest): Promise<DescribeResponse> {
    if (!this.started) {
      await this.sidecar.start();
      this.started = true;
    }
    return this.sidecar.describe(req);
  }
}

