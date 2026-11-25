import { InjectionToken } from '@angular/core';
import type {
  ITourDefinitionSource,
  ITourHost,
  ITourProgressStore,
  ITourServerPredicateEvaluator,
} from '@memberjunction/tours-runtime';

/** Host adapter injection token (`ExplorerTourHost`, `WebTourHost`, or app custom `ITourHost`). */
export const MJ_TOUR_HOST = new InjectionToken<ITourHost>('MJ_TOUR_HOST');

/** Optional definition source override (`TourEngine`, `SurfaceTourSource`, `InlineTourSource`). */
export const MJ_TOUR_DEFINITION_SOURCE = new InjectionToken<ITourDefinitionSource>('MJ_TOUR_DEFINITION_SOURCE');

/** Optional progress store override (`TourEngine`, `SurfaceProgressStore`, `MemoryProgressStore`). */
export const MJ_TOUR_PROGRESS_STORE = new InjectionToken<ITourProgressStore>('MJ_TOUR_PROGRESS_STORE');

/** Optional batched server predicate evaluator override. */
export const MJ_TOUR_PREDICATE_EVALUATOR = new InjectionToken<ITourServerPredicateEvaluator>(
  'MJ_TOUR_PREDICATE_EVALUATOR',
);

export interface TourAskAgentRequest {
  StepKey: string;
  TourKey: string;
  Prompt: string;
  AgentID?: string;
  PreferVoice?: boolean;
}

export interface TourAskAgentDispatcher {
  DispatchAskAgent(request: TourAskAgentRequest): Promise<void> | void;
}

/** Optional bridge used by `AskAgentStepRenderer` to open/seed a host chat or voice conversation. */
export const MJ_TOUR_AGENT_DISPATCHER = new InjectionToken<TourAskAgentDispatcher>('MJ_TOUR_AGENT_DISPATCHER');
