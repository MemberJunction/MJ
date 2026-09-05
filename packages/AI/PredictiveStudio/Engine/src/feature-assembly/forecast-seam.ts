/**
 * @module feature-assembly/forecast-seam
 *
 * The production {@link IForecastRunner}: a lazily-started, process-wide {@link ForecastSidecar}.
 *
 * Why a shared singleton rather than one per assembly: the 2.5 checkpoint is ~800MB on disk and
 * ~1.5GB resident, and a cold start pays for loading it. Spawning a sidecar per pipeline would
 * multiply that by the number of concurrent trainings and reload the weights every time.
 *
 * Why a default at all: an optional seam with no production implementation is a feature that
 * ships inert — declared, wired into nothing, and silently absent wherever it was supposed to
 * work. The executor therefore falls back to this, and callers who want a fake inject one.
 */
import { LogError, LogStatus } from '@memberjunction/core';
import type { ForecastRequest, ForecastResponse } from '@memberjunction/predictive-studio-core';
import { ForecastSidecar } from '@memberjunction/predictive-studio-forecast-sidecar';
import type { IForecastRunner } from './forecast-feature';

/**
 * Wraps the forecast sidecar as an {@link IForecastRunner}, starting it on first use.
 *
 * In remote mode (`PREDICTIVE_STUDIO_FORECAST_URL`) nothing is spawned — which is the intended
 * production topology, since a long-lived process keeps the weights resident across requests.
 */
export class SidecarForecastRunner implements IForecastRunner {
  private static shared: SidecarForecastRunner | null = null;
  private readonly sidecar: ForecastSidecar;
  /** In-flight start, so concurrent assemblies await one startup rather than racing it. */
  private starting: Promise<void> | null = null;
  private started = false;

  constructor(sidecar: ForecastSidecar = new ForecastSidecar()) {
    this.sidecar = sidecar;
  }

  /** The process-wide runner. Shared so the weights are loaded at most once per process. */
  public static get Instance(): SidecarForecastRunner {
    SidecarForecastRunner.shared ??= new SidecarForecastRunner();
    return SidecarForecastRunner.shared;
  }

  public async forecast(request: ForecastRequest): Promise<ForecastResponse> {
    await this.ensureStarted();
    return this.sidecar.forecast(request);
  }

  private async ensureStarted(): Promise<void> {
    if (this.started) return;
    if (this.starting) return this.starting;
    this.starting = this.sidecar
      .start()
      .then(async () => {
        this.started = true;
        const health = await this.sidecar.health();
        if (!health.ModelAvailable) {
          // Surfaced loudly: the service is up but cannot forecast, which would otherwise look
          // like every series being refused for no stated reason.
          LogError(`SidecarForecastRunner: forecast sidecar is running but has no model — ${health.Unavailable ?? 'reason not reported'}`);
        } else {
          LogStatus(`SidecarForecastRunner: forecast sidecar ready${this.sidecar.IsRemote ? ' (remote)' : ` on port ${this.sidecar.Port}`}.`);
        }
      })
      .finally(() => {
        this.starting = null;
      });
    return this.starting;
  }
}
