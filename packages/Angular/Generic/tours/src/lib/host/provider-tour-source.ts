/**
 * @fileoverview Provider-scoped MJ user mode source/store (`ProviderTourEngine`),
 * resolved strictly via `ProviderTourEngine.GetProviderInstance(provider, ProviderTourEngine)`
 * (never `new RunView()`, never `new Metadata()`, never `.Instance`!).
 * @module @memberjunction/ng-tours
 */

import {
  BaseEngine,
  type BaseEnginePropertyConfig,
  type IMetadataProvider,
  type IRemoteOperationProvider,
  type UserInfo,
} from '@memberjunction/core';
import type {
  MJTourEntity,
  MJTourPrerequisiteEntity,
  MJTourRunEntity,
  MJTourStepEntity,
  MJTourStepPathEntity,
  MJTourStepTypeEntity,
  MJTourTriggerEntity,
} from '@memberjunction/core-entities';
import { GroupByUUID, IndexByUUID, SafeJSONParse, type UUIDMap } from '@memberjunction/global';
import type {
  ITourAnchor,
  ITourCompletion,
  ITourConfiguration,
  ITourDefinitionSource,
  ITourGoal,
  ITourLaunchPolicy,
  ITourProgressStore,
  ITourServerPredicateEvaluator,
  ITourStartLocation,
  ITourStepConfiguration,
  ITourStepPathConfiguration,
  ITourStepPrepare,
  TourDefinition,
  TourLocation,
  TourRunEvent,
  TourRunRecord,
  TourServerPredicateRequest,
  TourServerPredicateResult,
  TourStepDefinition,
  TourStepPathDefinition,
} from '@memberjunction/tours-runtime';

/**
 * Multi-provider-safe engine caching Guided Tour metadata and user runs for an `IMetadataProvider`.
 * Always obtain via `ProviderTourEngine.GetProviderInstance(this.ProviderToUse, ProviderTourEngine)`.
 */
export class ProviderTourEngine
  extends BaseEngine<ProviderTourEngine>
  implements ITourDefinitionSource, ITourProgressStore, ITourServerPredicateEvaluator
{
  private _tours: MJTourEntity[] = [];
  private _steps: MJTourStepEntity[] = [];
  private _paths: MJTourStepPathEntity[] = [];
  private _stepTypes: MJTourStepTypeEntity[] = [];
  private _prerequisites: MJTourPrerequisiteEntity[] = [];
  private _triggers: MJTourTriggerEntity[] = [];
  private _runs: MJTourRunEntity[] = [];
  private _activeProvider: IMetadataProvider | null = null;

  public override async Config(
    forceRefresh?: boolean,
    contextUser?: UserInfo,
    provider?: IMetadataProvider,
  ): Promise<void> {
    this._activeProvider = provider ?? null;
    const configs: Partial<BaseEnginePropertyConfig>[] = [
      { Type: 'entity', EntityName: 'MJ: Tours', PropertyName: '_tours', CacheLocal: true },
      { Type: 'entity', EntityName: 'MJ: Tour Steps', PropertyName: '_steps', CacheLocal: true },
      { Type: 'entity', EntityName: 'MJ: Tour Step Paths', PropertyName: '_paths', CacheLocal: true },
      { Type: 'entity', EntityName: 'MJ: Tour Step Types', PropertyName: '_stepTypes', CacheLocal: true },
      { Type: 'entity', EntityName: 'MJ: Tour Prerequisites', PropertyName: '_prerequisites', CacheLocal: true },
      { Type: 'entity', EntityName: 'MJ: Tour Triggers', PropertyName: '_triggers', CacheLocal: true },
      { Type: 'entity', EntityName: 'MJ: Tour Runs', PropertyName: '_runs', CacheLocal: false },
    ];
    if (!provider) {
      return;
    }
    await this.Load(configs, provider, forceRefresh, contextUser);
  }

  public async GetTours(_location: TourLocation): Promise<TourDefinition[]> {
    const stepTypesById = IndexByUUID(this._stepTypes, (st) => st.ID);
    const stepsByTourId = GroupByUUID(this._steps, (s) => s.TourID);
    const pathsByTourId = GroupByUUID(this._paths, (p) => p.TourID);
    const prereqsByTourId = GroupByUUID(this._prerequisites, (pr) => pr.TourID);
    const triggersByTourId = GroupByUUID(this._triggers, (tr) => tr.TourID);

    return this._tours
      .filter((t) => t.Status === 'Active')
      .map((t) =>
        toTourDefinition(
          t,
          stepsByTourId.Get(t.ID) ?? [],
          pathsByTourId.Get(t.ID) ?? [],
          stepTypesById,
          prereqsByTourId.Get(t.ID) ?? [],
          triggersByTourId.Get(t.ID) ?? [],
        ),
      );
  }

  public async GetTourByKey(tourKey: string): Promise<TourDefinition | null> {
    const all = await this.GetTours({});
    return all.find((t) => t.TourKey === tourKey) ?? null;
  }

  public async GetRuns(): Promise<TourRunRecord[]> {
    const tourById = IndexByUUID(this._tours, (t) => t.ID);
    return this._runs.map((r) => ({
      RunID: r.ID,
      TourKey: tourById.Get(r.TourID)?.TourKey ?? r.TourID,
      TourID: r.TourID,
      TourVersionID: r.TourVersionID,
      UserID: r.UserID,
      VisitorKey: r.VisitorKey,
      SurfaceID: r.SurfaceID,
      Status: r.Status as TourRunRecord['Status'],
      GuideMode: (r.GuideMode as TourRunRecord['GuideMode']) ?? 'Visual',
      DirectorType: r.DirectorType,
      CurrentStepKey: r.CurrentStepKey,
      PathTaken: parseJson<string[]>(r.PathTaken) ?? [],
      LaunchSource: r.LaunchSource as TourRunRecord['LaunchSource'],
      StartedAt: r.StartedAt ? new Date(r.StartedAt).toISOString() : new Date().toISOString(),
      CompletedAt: r.CompletedAt ? new Date(r.CompletedAt).toISOString() : null,
      GoalMetAt: r.GoalMetAt ? new Date(r.GoalMetAt).toISOString() : null,
      SnoozedUntil: r.SnoozedUntil ? new Date(r.SnoozedUntil).toISOString() : null,
      IsHoldout: r.IsHoldout,
      Steps: [],
    }));
  }

  public async RecordEvents(events: TourRunEvent[]): Promise<void> {
    if (events.length === 0 || !this._activeProvider || !('RouteOperation' in this._activeProvider)) {
      return;
    }
    const remote = this._activeProvider as IMetadataProvider & IRemoteOperationProvider;
    const payload = {
      Events: events.map((e) => ({
        RunClientId: e.RunID,
        TourKey: e.TourKey,
        TourVersionId: e.TourVersionID,
        EventType: e.EventType,
        Timestamp: e.Timestamp,
        GuideMode: e.GuideMode,
        DirectorType: e.DirectorType,
        LaunchSource: e.LaunchSource,
        CurrentStepKey: e.StepKey,
        StepOutcome: e.Outcome,
        AnchorResolution: e.AnchorResolution,
        SnoozedUntil: e.SnoozedUntil,
        DetailsJson: e.Payload ? JSON.stringify(e.Payload) : undefined,
      })),
    };
    await remote.RouteOperation('Tours.RecordEvents', payload);
  }

  public async EvaluatePredicates(
    requests: TourServerPredicateRequest[],
  ): Promise<TourServerPredicateResult[]> {
    if (requests.length === 0 || !this._activeProvider || !('RouteOperation' in this._activeProvider)) {
      return [];
    }
    const remote = this._activeProvider as IMetadataProvider & IRemoteOperationProvider;
    const res = await remote.RouteOperation<
      { Predicates: TourServerPredicateRequest[] },
      { Results?: TourServerPredicateResult[] }
    >('Tours.EvaluatePredicates', { Predicates: requests });
    return res.Success && res.Output?.Results ? res.Output.Results : [];
  }
}

function toTourDefinition(
  tour: MJTourEntity,
  steps: MJTourStepEntity[],
  paths: MJTourStepPathEntity[],
  stepTypesById: UUIDMap<MJTourStepTypeEntity>,
  tourPrereqs: MJTourPrerequisiteEntity[],
  tourTriggers: MJTourTriggerEntity[],
): TourDefinition {
  const sortedSteps = [...steps].sort((a, b) => a.Sequence - b.Sequence);
  const stepById = IndexByUUID(sortedSteps, (s) => s.ID);

  const mappedSteps: TourStepDefinition[] = sortedSteps.map((s) => {
    const stepType = stepTypesById.Get(s.StepTypeID);
    const parsedConfig = parseJson<ITourStepConfiguration>(s.Configuration) ?? {};
    if (stepType?.ComponentID && !parsedConfig['stepTypeComponentId']) {
      parsedConfig['stepTypeComponentId'] = stepType.ComponentID;
    }
    return {
      ID: s.ID,
      StepKey: s.StepKey,
      Sequence: s.Sequence,
      StepType: stepType?.Name ?? 'Spotlight',
      DriverClass: s.DriverClass,
      Title: s.Title,
      Body: s.Body ?? undefined,
      Configuration: parsedConfig,
      Anchor: parseJson<ITourAnchor>(s.Anchor),
      Placement: (s.Placement as TourStepDefinition['Placement']) ?? 'auto',
      Mode: (s.Mode as TourStepDefinition['Mode']) ?? 'Guide',
      Prepare: parseJson<ITourStepPrepare>(s.Prepare),
      Completion: parseJson<ITourCompletion>(s.Completion),
      SkipWhen: s.SkipWhen ? parseJson<ITourCompletion>(s.SkipWhen) : null,
      OnMissing: (s.OnMissing as TourStepDefinition['OnMissing']) ?? 'Center',
      IsOptional: s.IsOptional,
      GuideNotes: s.GuideNotes ?? undefined,
      VoiceScript: s.VoiceScript ?? undefined,
    };
  });

  const mappedPaths: TourStepPathDefinition[] = paths
    .map((p) => {
      const from = stepById.Get(p.FromStepID);
      const to = stepById.Get(p.ToStepID);
      if (!from || !to) {
        return null;
      }
      return {
        ID: p.ID,
        FromStepKey: from.StepKey,
        ToStepKey: to.StepKey,
        Condition: p.Condition,
        Label: p.Label ?? undefined,
        Priority: p.Priority,
        IsDefault: p.IsDefault,
        Configuration: parseJson<ITourStepPathConfiguration>(p.Configuration) ?? undefined,
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  return {
    ID: tour.ID,
    TourKey: tour.TourKey,
    Name: tour.Name,
    Description: tour.Description ?? undefined,
    ApplicationID: tour.ApplicationID,
    ApplicationName: tour.Application ?? undefined,
    RunInAuthenticatedHosts: tour.RunInAuthenticatedHosts,
    Status: tour.Status as TourDefinition['Status'],
    CurrentVersionID: tour.CurrentVersionID,
    EstimatedMinutes: tour.EstimatedMinutes ?? undefined,
    AudienceFilter: tour.AudienceFilter,
    LaunchPolicy: parseJson<ITourLaunchPolicy>(tour.LaunchPolicy),
    Priority: tour.Priority,
    ThrottleTags: tour.ThrottleTags
      ? tour.ThrottleTags.split(',').map((t) => t.trim()).filter(Boolean)
      : undefined,
    DefaultGuideMode: tour.DefaultGuideMode as TourDefinition['DefaultGuideMode'],
    AllowAgentActions: tour.AllowAgentActions,
    GuideAgentID: tour.GuideAgentID,
    DriverClass: tour.DriverClass,
    PresenterClass: tour.PresenterClass,
    Goal: parseJson<ITourGoal>(tour.Goal),
    StartLocation: parseJson<ITourStartLocation>(tour.StartLocation),
    Configuration: parseJson<ITourConfiguration>(tour.Configuration),
    Steps: mappedSteps,
    Paths: mappedPaths,
    Prerequisites: tourPrereqs.map((pr) => ({
      ID: pr.ID,
      PrerequisiteType: pr.PrerequisiteType as NonNullable<TourDefinition['Prerequisites']>[number]['PrerequisiteType'],
      Strength: pr.Strength as NonNullable<TourDefinition['Prerequisites']>[number]['Strength'],
    })),
    Triggers: tourTriggers.map((tr) => ({
      ID: tr.ID,
      TriggerType: tr.TriggerType,
      Configuration: parseJson<Record<string, unknown>>(tr.Configuration) ?? undefined,
      Delivery: tr.Delivery as NonNullable<TourDefinition['Triggers']>[number]['Delivery'],
      CooldownDays: tr.CooldownDays ?? undefined,
      Status: tr.Status as 'Active' | 'Disabled',
    })),
  };
}

function parseJson<T>(raw: string | null | undefined): T | null {
  if (!raw || !raw.trim()) {
    return null;
  }
  return SafeJSONParse<T>(raw) ?? null;
}
