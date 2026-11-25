/**
 * @fileoverview External surface guest session client, `SurfaceTourSource`, and `SurfaceProgressStore`
 * communicating with MJAPI over scoped Remote Operations (`Tours.GetSurfaceTours`, `Tours.RecordEvents`)
 * without pulling `@memberjunction/core-entities` into Stage-2 web bundles (§4.2 & §18 Phase 3).
 * @module @memberjunction/ng-tours
 */

import type { IRemoteOperationProvider } from '@memberjunction/core';
import {
  CreateProofOfPossessionJwt,
  CreateProofOfPossessionKey,
  SafeJSONParse,
  TrimTrailingSlashes,
  type ProofOfPossessionKey,
} from '@memberjunction/global';
import { GraphQLDataProvider, GraphQLProviderConfigData } from '@memberjunction/graphql-dataprovider';
import { SetupAngularGraphQLClient } from '@memberjunction/ng-shared-generic';
import type {
  ITourDefinitionSource,
  ITourProgressStore,
  TourDefinition,
  TourLocation,
  TourRunEvent,
  TourRunRecord,
} from '@memberjunction/tours-runtime';

export interface SurfaceTourPayload {
  ToursJson: string;
  RunsJson: string;
  Success: boolean;
  SurfaceId?: string;
  SurfaceKey?: string;
  ConversationWidgetInstanceId?: string;
  ErrorMessage?: string;
}

export interface SurfaceGuestSession {
  Token: string;
  VisitorKey: string;
  SurfaceId?: string;
}

type SurfaceFetchLike = (
  input: string,
  init?: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

/**
 * Mints and refreshes an anonymous guest session for an external tour surface and ensures
 * `GraphQLDataProvider` is configured without clobbering an existing MJ host session.
 */
export class SurfaceGuestSessionClient {
  private readonly _baseUrl: string;
  private readonly _surfaceKey: string;
  private readonly _fetch: SurfaceFetchLike;
  private _proofKey: ProofOfPossessionKey | null = null;
  private _session: SurfaceGuestSession | null = null;

  constructor(
    apiUrl: string,
    surfaceKey: string,
    fetchImpl: SurfaceFetchLike = (input, init) => fetch(input, init),
  ) {
    this._baseUrl = TrimTrailingSlashes(apiUrl);
    this._surfaceKey = surfaceKey;
    this._fetch = fetchImpl;
  }

  public get Session(): SurfaceGuestSession | null {
    return this._session;
  }

  public async EnsureConfiguredProvider(): Promise<IRemoteOperationProvider> {
    if (this.hasExistingProvider()) {
      return GraphQLDataProvider.Instance as unknown as IRemoteOperationProvider;
    }

    const session = await this.Mint();
    const wsUrl = this._baseUrl.replace(/^http/, 'ws');
    const config = new GraphQLProviderConfigData(
      session.Token,
      this._baseUrl,
      wsUrl,
      () => this.Refresh().then((s) => s.Token),
    );
    await SetupAngularGraphQLClient(config);
    return GraphQLDataProvider.Instance as unknown as IRemoteOperationProvider;
  }

  public async Mint(): Promise<SurfaceGuestSession> {
    const key = await CreateProofOfPossessionKey();
    const res = await this.postSession('/widget/session', key);
    this._proofKey = key;
    this._session = res;
    return res;
  }

  public async Refresh(): Promise<SurfaceGuestSession> {
    if (!this._proofKey || !this._session) {
      return this.Mint();
    }
    const res = await this.postSession('/widget/session/refresh', this._proofKey, this._session.Token);
    this._session = res;
    return res;
  }

  private async postSession(
    path: string,
    key: ProofOfPossessionKey,
    bearerToken?: string,
  ): Promise<SurfaceGuestSession> {
    const url = `${this._baseUrl}${path}`;
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    const body: Record<string, unknown> = {
      surfaceKey: this._surfaceKey,
      widgetKey: this._surfaceKey,
    };

    if (bearerToken) {
      headers['authorization'] = `Bearer ${bearerToken}`;
      headers['dpop'] = await CreateProofOfPossessionJwt(key, {
        Method: 'POST',
        Url: url,
        AccessToken: bearerToken,
        NowSeconds: Math.floor(Date.now() / 1000),
      });
    } else {
      body['proofKey'] = key.PublicJwk;
    }

    const response = await this._fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    const parsed = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (!response.ok || !parsed || parsed['success'] !== true || typeof parsed['token'] !== 'string') {
      const errMsg = typeof parsed?.['error'] === 'string' ? parsed['error'] : `HTTP ${response.status}`;
      throw new Error(`Surface guest session mint failed: ${errMsg}`);
    }

    return {
      Token: parsed['token'],
      VisitorKey:
        typeof parsed['visitorKey'] === 'string' && parsed['visitorKey']
          ? parsed['visitorKey']
          : `guest-${this._surfaceKey}`,
      SurfaceId: typeof parsed['surfaceId'] === 'string' ? parsed['surfaceId'] : undefined,
    };
  }

  private hasExistingProvider(): boolean {
    try {
      return (GraphQLDataProvider.Instance?.ConfigData?.Token ?? '').length > 0;
    } catch {
      return false;
    }
  }
}

export interface SurfaceClientOptions {
  SurfaceKey: string;
  ApiUrl?: string | null;
  Locale?: string;
  Provider?: IRemoteOperationProvider;
  SessionClient?: SurfaceGuestSessionClient;
}

/**
 * Fetches published tours and visitor progress from `Tours.GetSurfaceTours` and exposes
 * both `ITourDefinitionSource` and cached initial `TourRunRecord[]` for `SurfaceProgressStore`.
 */
export class SurfaceTourSource implements ITourDefinitionSource {
  private readonly _surfaceKey: string;
  private readonly _locale?: string;
  private readonly _explicitProvider?: IRemoteOperationProvider;
  private readonly _sessionClient?: SurfaceGuestSessionClient;
  private _cachedTours: TourDefinition[] = [];
  private _cachedRuns: TourRunRecord[] = [];
  private _loaded = false;

  constructor(options: SurfaceClientOptions) {
    this._surfaceKey = options.SurfaceKey;
    this._locale = options.Locale;
    this._explicitProvider = options.Provider;
    this._sessionClient =
      options.SessionClient ??
      (options.ApiUrl ? new SurfaceGuestSessionClient(options.ApiUrl, options.SurfaceKey) : undefined);
  }

  public get CachedRuns(): readonly TourRunRecord[] {
    return this._cachedRuns;
  }

  public get SessionClient(): SurfaceGuestSessionClient | undefined {
    return this._sessionClient;
  }

  public async GetTours(location: TourLocation): Promise<TourDefinition[]> {
    const provider = await this.resolveProvider();
    if (!provider) {
      return [];
    }

    const res = await provider.RouteOperation<
      { SurfaceKey: string; CurrentUrl?: string; Locale?: string },
      SurfaceTourPayload
    >('Tours.GetSurfaceTours', {
      SurfaceKey: this._surfaceKey,
      CurrentUrl: location.Url,
      Locale: this._locale,
    });

    if (!res.Success || !res.Output?.Success) {
      return this._cachedTours;
    }

    const tours = SafeJSONParse<TourDefinition[]>(res.Output.ToursJson) ?? [];
    const runs = SafeJSONParse<TourRunRecord[]>(res.Output.RunsJson) ?? [];
    this._cachedTours = Array.isArray(tours) ? tours : [];
    this._cachedRuns = Array.isArray(runs) ? runs : [];
    this._loaded = true;
    return this._cachedTours;
  }

  public async GetTourByKey(tourKey: string): Promise<TourDefinition | null> {
    if (!this._loaded) {
      await this.GetTours({
        Url: typeof window !== 'undefined' ? window.location.href : undefined,
      });
    }
    return this._cachedTours.find((t) => t.TourKey === tourKey) ?? null;
  }

  public async ResolveProvider(): Promise<IRemoteOperationProvider | null> {
    return this.resolveProvider();
  }

  private async resolveProvider(): Promise<IRemoteOperationProvider | null> {
    if (this._explicitProvider) {
      return this._explicitProvider;
    }
    if (this._sessionClient) {
      return this._sessionClient.EnsureConfiguredProvider();
    }
    try {
      return GraphQLDataProvider.Instance as unknown as IRemoteOperationProvider;
    } catch {
      return null;
    }
  }
}

/**
 * Records guest/surface tour events via `Tours.RecordEvents` Remote Operation.
 */
export class SurfaceProgressStore implements ITourProgressStore {
  constructor(private readonly _source: SurfaceTourSource) {}

  public async GetRuns(): Promise<TourRunRecord[]> {
    if (this._source.CachedRuns.length === 0) {
      await this._source.GetTours({
        Url: typeof window !== 'undefined' ? window.location.href : undefined,
      });
    }
    return [...this._source.CachedRuns];
  }

  public async RecordEvents(events: TourRunEvent[]): Promise<void> {
    if (events.length === 0) {
      return;
    }
    const provider = await this._source.ResolveProvider();
    if (!provider) {
      return;
    }

    const mapped = events.map((e) => ({
      RunClientId: e.RunID,
      TourKey: e.TourKey,
      TourVersionId: e.TourVersionID,
      EventType: mapEventType(e.EventType),
      Timestamp: e.Timestamp,
      GuideMode: e.GuideMode,
      DirectorType: e.DirectorType,
      LaunchSource: e.LaunchSource,
      CurrentStepKey: e.StepKey,
      StepOutcome: e.Outcome,
      AnchorResolution: e.AnchorResolution,
      SnoozedUntil: e.SnoozedUntil,
      DetailsJson: e.Payload ? JSON.stringify(e.Payload) : undefined,
    }));

    await provider.RouteOperation<{ Events: typeof mapped }, { Success: boolean }>('Tours.RecordEvents', {
      Events: mapped,
    });
  }
}

function mapEventType(
  raw: TourRunEvent['EventType'],
):
  | 'RunStarted'
  | 'StepEntered'
  | 'StepCompleted'
  | 'RunUpdated'
  | 'RunCompleted'
  | 'RunDismissed'
  | 'RunSnoozed'
  | 'GoalMet' {
  switch (raw) {
    case 'RunStarted':
    case 'StepEntered':
    case 'StepCompleted':
    case 'RunCompleted':
    case 'RunDismissed':
    case 'RunSnoozed':
    case 'GoalMet':
      return raw;
    default:
      return 'RunUpdated';
  }
}
