/**
 * @module scoring/startup-register
 *
 * Startup wiring that connects the Predictive Studio `'ML Model'` scoring processor to the
 * Record Set Processing substrate at application boot — closing the gap between the processor's
 * `@RegisterClass` decoration (which only makes it *resolvable* through the ClassFactory) and the
 * substrate actually *routing* a saved `MJ: Record Processes` row whose `WorkType='ML Model'` to it.
 *
 * ## Why a startup sink
 *
 * {@link registerMLScoringProcessor} installs the factory into the substrate's
 * {@link RecordProcessorRegistry}, after which `RecordProcessExecutor.buildProcessor()` resolves the
 * ML work type with no substrate change. But that call was never made at boot — so a Record Process
 * with `WorkType='ML Model'` fell through to "unknown work type". This {@link IStartupSink} makes the
 * call once during MJAPI bootstrap (mirroring `RemoteBrowserEngine`'s `@RegisterForStartup` pattern),
 * wiring the production {@link MLInferenceDeps} bundle ({@link buildProductionMLInferenceDeps}) the
 * Score action / Remote Op also use — so a model is always scored the same way it was trained.
 *
 * Unlike `RemoteBrowserEngine`, this sink warms NO `BaseEngine` cache and touches NO database: the
 * injected seams take their `provider` + `user` per-call, not at construction. The work is a cheap,
 * synchronous in-memory map write, so it is **not** `deferred` — it joins the synchronous startup
 * batch and completes instantly.
 */

import { IMetadataProvider, IStartupSink, LogStatusEx, RegisterForStartup, UserInfo } from '@memberjunction/core';
import { BaseSingleton } from '@memberjunction/global';

import { registerMLScoringProcessor } from './register';
import { buildProductionMLInferenceDeps } from '../operations/delegation';

/**
 * Startup sink that registers the Predictive Studio `'ML Model'` (and `'MLModelInference'` alias)
 * scoring processor into the Record Set Processing {@link RecordProcessorRegistry}, so a saved
 * `MJ: Record Processes` row with `WorkType='ML Model'` routes to the scorer live.
 *
 * The registration is idempotent (last-wins) and provider-agnostic — the injected seams receive
 * their `provider` + `user` per scoring call — so {@link HandleStartup} needs no body beyond the
 * single register call. Discovered via the `@RegisterForStartup` decorator + the class manifest.
 */
@RegisterForStartup({
  description: 'Predictive Studio ML Model scoring processor registration',
})
export class PredictiveStudioScoringStartup extends BaseSingleton<PredictiveStudioScoringStartup> implements IStartupSink {
  /** The singleton accessor, keyed by this class's name in the Global Object Store (via {@link BaseSingleton}). */
  public static get Instance(): PredictiveStudioScoringStartup {
    return super.getInstance<PredictiveStudioScoringStartup>();
  }

  /**
   * Boot entry point (per {@link IStartupSink}). Registers the ML scoring processor for the
   * `'ML Model'` work type with the production deps bundle. No-op-safe to call more than once
   * (the registry last-wins), and needs neither the `contextUser` nor `provider` — the deps are
   * constructed without them and take a `provider`/`user` per scoring call.
   *
   * @param _contextUser unused — the registration is provider/user-agnostic at construction time
   * @param _provider unused — see above
   */
  public async HandleStartup(_contextUser?: UserInfo, _provider?: IMetadataProvider): Promise<void> {
    registerMLScoringProcessor(buildProductionMLInferenceDeps());
    // Routine boot registration — only surface it under verbose logging to keep startup quiet.
    LogStatusEx({
      message: '[PredictiveStudioScoringStartup] Registered ML Model scoring processor for Record Set Processing.',
      verboseOnly: true,
    });
  }
}
