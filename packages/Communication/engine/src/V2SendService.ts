import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  BaseCommunicationPrincipal,
  BaseCommunicationProvider,
  BaseCommunicationSender,
  BlockedRecipient,
  CommunicationEngineBase,
  ComplianceGateResult,
  ComplianceObligations,
  EnforcementMode,
  EvaluateEligibilityParams,
  EvaluateEligibilityResult,
  Message,
  MessageClass,
  MessagePayload,
  PrincipalAttributes,
  PrincipalMessageContext,
  PrincipalRecordRef,
  ProviderCredentialsBase,
  ResolvedEndpoint,
  SendableRecipient,
  SendingEnvelope,
  SendToPrincipalsParams,
  SendV2RecipientOutcome,
  SendV2Result,
} from '@memberjunction/communication-types';
import { LogError, Metadata, RunView, UserInfo } from '@memberjunction/core';
import type {
  MJCommunicationEndpointEntity,
  MJCommunicationLogEntity,
  MJCommunicationPreferenceEntity,
  MJCommunicationPrincipalEntity,
  MJCommunicationPrincipalPreferenceEntity,
  MJCommunicationRunEntity,
  MJCommunicationSenderEntity,
  MJCommunicationSenderPermissionEntity,
  MJCommunicationSendingDomainEntity,
  MJCommunicationSuppressionEntity,
} from '@memberjunction/core-entities';
import { EscapeSQLString, MJGlobal, UUIDSet, UUIDsEqual } from '@memberjunction/global';
import { CredentialEngine } from '@memberjunction/credentials';
import { ProcessedMessageServer } from './BaseProvider';
import { ComplianceGate } from './compliance/ComplianceGate';
import { JurisdictionResolver } from './compliance/JurisdictionResolver';
import {
  ComputeEndpointHash,
  NormalizeEndpointAddress,
  PrincipalRecordKey,
} from './DefaultCommunicationPrincipal';

/**
 * Settings for the V2 send pipeline, applied with
 * `CommunicationEngine.Instance.ConfigureV2Dispatch()`. MJServer sets `BaseTrackingURL`,
 * `TrackingHMACSecret` and `EnqueueWork` at startup.
 */
export interface V2DispatchConfig {
  /** Recipients per `comms.dispatch` work item. Defaults to 50. */
  ChunkSize?: number;
  /**
   * A send with more recipients than this is handed to the work queue when `EnqueueWork` is set.
   * Defaults to 100.
   */
  AsyncThreshold?: number;
  /**
   * Public base URL of the `/comms` routes, used to build unsubscribe, open-pixel and
   * click-tracking links. May or may not end in `/comms`. When unset, links are relative
   * (`/comms/...`) and will not work in an email.
   */
  BaseTrackingURL?: string;
  /**
   * Secret that signs click-tracking links. Falls back to the `MJ_COMMS_HMAC_SECRET` environment
   * variable. When neither is set, links are not rewritten.
   */
  TrackingHMACSecret?: string;
  /** Enforcement mode for senders that have none of their own. Defaults to `'Enforce'`. */
  InstanceEnforcementMode?: EnforcementMode;
  /** Publishes a work item. When unset, every send runs inline in the calling process. */
  EnqueueWork?: (
    taskType: 'comms.dispatch' | 'comms.send',
    payload: Record<string, unknown>,
  ) => Promise<void>;
}

/**
 * The parts of a message that principal hooks must not change. Frozen before the hooks run and
 * hashed before and after.
 */
export interface ProtectedComplianceSnapshot {
  /** Sender address: the sender's `FromEmail`, else `FromPhone`. */
  From: string;
  /** Recipient address (the endpoint's normalized value). */
  To: string;
  /** `List-Unsubscribe` header value, when the one-click header is required. */
  ListUnsubscribe?: string;
  /** `List-Unsubscribe-Post` header value, when the one-click header is required. */
  ListUnsubscribePost?: string;
  /** HTML compliance footer, when a footer link or postal address is required. */
  FooterHTML?: string;
  /** Plain-text compliance footer. */
  FooterText?: string;
  /** `MJ: Communication Logs` ID of the message. */
  LogID: string;
}

const DEFAULT_CHUNK_SIZE = 50;
const DEFAULT_ASYNC_THRESHOLD = 100;

/**
 * Returns the hex HMAC-SHA256 of `trackingToken + ':' + targetUrl`. This is the `sig` parameter of
 * a click-tracking link.
 */
export function ComputeTrackingSignature(
  trackingToken: string,
  targetUrl: string,
  secret: string,
): string {
  return createHmac('sha256', secret)
    .update(`${trackingToken}:${targetUrl}`, 'utf8')
    .digest('hex');
}

/** Checks a click-tracking signature in constant time. */
export function VerifyTrackingSignature(
  trackingToken: string,
  targetUrl: string,
  signature: string,
  secret: string,
): boolean {
  const expected = ComputeTrackingSignature(trackingToken, targetUrl, secret);
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

function buildCommsRouteUrl(baseUrl: string, subpath: string): string {
  let end = baseUrl.length;
  while (end > 0 && baseUrl.charCodeAt(end - 1) === 47) {
    end--;
  }
  const cleanBase = baseUrl.slice(0, end);
  if (!cleanBase) {
    return `/comms${subpath}`;
  }
  return cleanBase.endsWith('/comms')
    ? `${cleanBase}${subpath}`
    : `${cleanBase}/comms${subpath}`;
}

/**
 * Rewrites every absolute `http(s)` link in `<a href>` tags to
 * `<baseUrl>/comms/click/<trackingToken>?u=<target>&sig=<signature>`. Links listed in
 * `excludedUrls` (the unsubscribe and preference-center links) are left as they are.
 */
export function RewriteLinksForTracking(
  html: string,
  trackingToken: string,
  secret: string,
  baseUrl: string = '',
  excludedUrls: ReadonlyArray<string> = [],
): string {
  const excluded = new Set(excludedUrls.filter(Boolean));
  return html.replace(/<a\b([^>]*)>/gi, (tagMatch: string, attrs: string) => {
    const updatedAttrs = attrs.replace(
      /\bhref\s*=\s*(["'])(https?:\/\/[^"']+)\1/i,
      (hrefMatch: string, quote: string, url: string) => {
        const decodedUrl = url.replace(/&amp;/gi, '&');
        if (excluded.has(decodedUrl) || excluded.has(url)) {
          return hrefMatch;
        }
        const sig = ComputeTrackingSignature(trackingToken, decodedUrl, secret);
        const tracked = `${buildCommsRouteUrl(baseUrl, `/click/${trackingToken}`)}?u=${encodeURIComponent(decodedUrl)}&sig=${sig}`;
        return `href=${quote}${tracked}${quote}`;
      },
    );
    return `<a${updatedAttrs}>`;
  });
}

/**
 * Adds the 1x1 open-tracking image (`<baseUrl>/comms/open/<trackingToken>.gif`) before `</body>`,
 * or at the end when there is no body tag.
 */
export function InjectOpenPixel(
  html: string,
  trackingToken: string,
  baseUrl: string = '',
): string {
  const pixel = `<img src="${buildCommsRouteUrl(baseUrl, `/open/${trackingToken}.gif`)}" width="1" height="1" alt="" style="display:none;" />`;
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, () => `${pixel}</body>`);
  }
  return `${html}${pixel}`;
}

/**
 * Returns the SHA-256 hex digest of a snapshot's canonical JSON, used to detect a change to the
 * protected elements.
 */
export function ComputeProtectedElementsHash(snapshot: ProtectedComplianceSnapshot): string {
  const canonical = JSON.stringify({
    From: snapshot.From,
    To: snapshot.To,
    ListUnsubscribe: snapshot.ListUnsubscribe ?? null,
    ListUnsubscribePost: snapshot.ListUnsubscribePost ?? null,
    FooterHTML: snapshot.FooterHTML ?? null,
    FooterText: snapshot.FooterText ?? null,
    LogID: snapshot.LogID,
  });
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/** How long senders, sender ancestry, sender template context and preferences are cached, in milliseconds. */
const CACHE_TTL_MS = 60_000;

/**
 * The V2 send pipeline behind `CommunicationEngine.Send()`, `EvaluateEligibility()` and
 * `ResolveEndpoints()`: resolves endpoints, runs the compliance gate, writes the log, adds the
 * protected compliance elements and tracking, and dispatches inline or through the work queue. Use
 * it through `CommunicationEngine.Instance`; the engine owns the configured instance.
 */
export class V2SendService {
  private config: V2DispatchConfig = {};
  private senderCache = new Map<string, { value: MJCommunicationSenderEntity; expiresAt: number }>();
  private senderAncestryCache = new Map<string, { value: MJCommunicationSenderEntity[]; expiresAt: number }>();
  private senderTemplateCtxCache = new Map<string, { value: Record<string, unknown>; expiresAt: number }>();
  private preferenceCache = new Map<string, { value: MJCommunicationPreferenceEntity; expiresAt: number }>();

  /** Merges settings into the current configuration and clears the sender and preference caches. */
  public Configure(config: V2DispatchConfig): void {
    this.config = { ...this.config, ...config };
    this.ClearCache();
  }

  /**
   * Drops the 60-second caches of senders, sender ancestry, sender template context and
   * preferences. Call it after changing those rows when the change must apply at once.
   */
  public ClearCache(): void {
    this.senderCache.clear();
    this.senderAncestryCache.clear();
    this.senderTemplateCtxCache.clear();
    this.preferenceCache.clear();
  }

  /**
   * Resolves endpoints for principal records by calling each entity's principal driver. Returns a
   * map keyed by `<EntityID lower-cased>:<RecordID>`.
   */
  public async ResolveEndpoints(
    records: PrincipalRecordRef[],
    channelID: string,
    contextUser: UserInfo,
  ): Promise<Map<string, ResolvedEndpoint[]>> {
    const out = new Map<string, ResolvedEndpoint[]>();
    if (records.length === 0) return out;

    const byEntity = new Map<string, PrincipalRecordRef[]>();
    for (const ref of records) {
      const key = ref.EntityID.toLowerCase();
      const list = byEntity.get(key) ?? [];
      list.push(ref);
      byEntity.set(key, list);
    }

    for (const group of byEntity.values()) {
      const driver = this.getPrincipalDriver(group[0].EntityID);
      if (!driver) continue;
      const resolved = await driver.ResolveEndpoints(group, channelID, contextUser);
      for (const [k, v] of resolved.entries()) {
        out.set(k, v);
      }
    }

    return out;
  }

  /**
   * Runs the compliance gate for each recipient without sending or writing a log. Endpoint rows may
   * be created as a side effect of endpoint resolution.
   */
  public async EvaluateEligibility(
    params: EvaluateEligibilityParams,
    contextUser: UserInfo,
  ): Promise<EvaluateEligibilityResult> {
    const sender = await this.resolveSender(params.Envelope.SenderID, contextUser);
    if (!sender) {
      return {
        Sendable: [],
        Blocked: params.Recipients.map((r) => ({
          Principal: r.Principal,
          Reason: 'SenderNotFound',
          Detail: 'No active sender found for envelope',
        })),
      };
    }

    const senderChain = await this.loadSenderAncestry(sender, contextUser);
    const senderTemplateContext = await this.resolveSenderTemplateContext(senderChain, contextUser);
    const preference = params.Envelope.PreferenceID
      ? await this.loadPreference(params.Envelope.PreferenceID, contextUser)
      : undefined;

    const principalRefs = params.Recipients.map((r) => r.Principal).filter(
      (p): p is PrincipalRecordRef => Boolean(p),
    );
    const resolvedMap = await this.ResolveEndpoints(principalRefs, params.Envelope.ChannelID, contextUser);
    const attrMap = await this.resolveAllAttributes(principalRefs, contextUser);
    const jurMap = await this.resolveAllJurisdictions(principalRefs, contextUser);

    const endpointIds = this.collectEndpointIds(resolvedMap, params.Recipients);
    const adHocEndpointMap = await this.batchLoadAdHocEndpoints(params.Recipients, params.Envelope.ChannelID, contextUser);
    for (const ep of adHocEndpointMap.values()) {
      if (!endpointIds.includes(ep.ID)) {
        endpointIds.push(ep.ID);
      }
    }
    const suppressions = await this.loadSuppressions(endpointIds, principalRefs, contextUser);
    const prefMap = preference
      ? await this.loadPrincipalPreferences(principalRefs, preference.ID, sender.ID, contextUser)
      : new Map<string, MJCommunicationPrincipalPreferenceEntity>();

    const gate = new ComplianceGate(new JurisdictionResolver());
    const sendable: SendableRecipient[] = [];
    const blocked: BlockedRecipient[] = [];
    const now = new Date();

    for (const rec of params.Recipients) {
      const endpoint = await this.pickEndpointForRecipient(
        rec,
        params.Envelope.ChannelID,
        resolvedMap,
        contextUser,
        adHocEndpointMap,
      );
      if (!endpoint) {
        blocked.push({
          Principal: rec.Principal,
          Reason: 'NoEndpoint',
          Detail: 'No communication endpoint resolved for recipient',
        });
        continue;
      }

      const key = rec.Principal ? PrincipalRecordKey(rec.Principal) : undefined;
      const attrs = key ? attrMap.get(key) : undefined;
      const jur = key ? jurMap.get(key) : null;
      const pp = key ? prefMap.get(key) : undefined;

      const endpointEntity =
        endpoint.EndpointEntity ??
        adHocEndpointMap.get(endpoint.CommunicationEndpointID.toLowerCase()) ??
        (await this.loadEndpointEntity(endpoint.CommunicationEndpointID, contextUser));
      if (!endpointEntity) {
        blocked.push({ Principal: rec.Principal, Endpoint: endpoint, Reason: 'EndpointNotFound' });
        continue;
      }

      const gateResult = gate.Evaluate(
        {
          Sender: sender,
          SenderAncestors: senderChain.slice(1).map((s) => s.ID),
          Principal: rec.Principal,
          Endpoint: endpointEntity,
          Preference: preference,
          MessageClass: params.Envelope.MessageClass,
          ChannelID: params.Envelope.ChannelID,
          PrincipalPreference: pp,
          PrincipalAttributes: attrs,
          Now: now,
        },
        {
          Suppressions: suppressions,
          RecipientJurisdiction: jur,
          SenderJurisdiction: sender.JurisdictionID,
          InstanceEnforcementMode: this.config.InstanceEnforcementMode,
        },
      );

      if (gateResult.Decision === 'Blocked') {
        blocked.push({
          Principal: rec.Principal,
          Endpoint: endpoint,
          Reason: gateResult.Reason ?? 'Blocked',
          Detail: gateResult.Detail,
        });
      } else {
        sendable.push({
          Principal: rec.Principal,
          Endpoint: endpoint,
          Decision: gateResult.Decision,
          DeferUntil: gateResult.DeferUntil,
          Obligations: gateResult.Obligations,
          AuditSnapshot: gateResult.AuditSnapshot,
          SenderTemplateContext: senderTemplateContext,
          PrincipalAttributes: attrs,
        });
      }
    }

    return { Sendable: sendable, Blocked: blocked };
  }

  /**
   * Sends to the recipients. Checks the sender, the caller's sender permission, the provider and
   * (when the provider requires it) the verified sending domain; then either publishes
   * `comms.dispatch` chunks or evaluates and dispatches inline.
   *
   * @param getProvider - Returns the provider instance for a provider name.
   */
  public async Send(
    params: SendToPrincipalsParams,
    contextUser: UserInfo,
    getProvider: (name: string) => BaseCommunicationProvider,
  ): Promise<SendV2Result> {
    const sender = await this.resolveSender(params.Envelope.SenderID, contextUser);
    if (!sender) {
      return {
        Success: false,
        IsAsyncRun: false,
        TotalCount: params.Recipients.length,
        QueuedCount: 0,
        BlockedCount: params.Recipients.length,
        DeferredCount: 0,
        ErrorMessage: 'Sender not found',
      };
    }

    const senderPermCheck = await this.checkSenderPermission(sender, contextUser);
    if (!senderPermCheck.Allowed) {
      return {
        Success: false,
        IsAsyncRun: false,
        TotalCount: params.Recipients.length,
        QueuedCount: 0,
        BlockedCount: params.Recipients.length,
        DeferredCount: 0,
        ErrorMessage: senderPermCheck.ErrorMessage,
      };
    }

    const providerId = params.Envelope.ProviderID ?? sender.CommunicationProviderID;
    const providerEntity = CommunicationEngineBase.Instance.Providers.find((p) =>
      providerId ? UUIDsEqual(p.ID, providerId) : true,
    );
    if (!providerEntity) {
      return {
        Success: false,
        IsAsyncRun: false,
        TotalCount: params.Recipients.length,
        QueuedCount: 0,
        BlockedCount: params.Recipients.length,
        DeferredCount: 0,
        ErrorMessage: 'Communication provider not found',
      };
    }

    if (providerEntity.RequireVerifiedDomain) {
      const verified = await this.verifySendingDomain(
        providerEntity.ID,
        sender.SendingDomain,
        sender.CredentialID,
        contextUser,
      );
      if (!verified) {
        return {
          Success: false,
          IsAsyncRun: false,
          TotalCount: params.Recipients.length,
          QueuedCount: 0,
          BlockedCount: params.Recipients.length,
          DeferredCount: 0,
          ErrorMessage: `Verified sending domain required for '${sender.SendingDomain ?? 'unknown'}'`,
        };
      }
    }

    let run: MJCommunicationRunEntity | undefined;
    if (params.CommunicationRunID) {
      const rv = this.getRunView();
      const existingRun = await rv.RunView<MJCommunicationRunEntity>(
        {
          EntityName: 'MJ: Communication Runs',
          ExtraFilter: `ID='${EscapeSQLString(params.CommunicationRunID)}'`,
          MaxRows: 1,
          ResultType: 'entity_object',
        },
        contextUser,
      );
      if (!existingRun.Success) {
        return {
          Success: false,
          IsAsyncRun: false,
          TotalCount: params.Recipients.length,
          QueuedCount: 0,
          BlockedCount: 0,
          DeferredCount: 0,
          ErrorMessage: `Failed loading communication run '${params.CommunicationRunID}': ${existingRun.ErrorMessage ?? 'RunView failed'}`,
        };
      }
      if (existingRun.Results.length === 0) {
        return {
          Success: false,
          IsAsyncRun: false,
          TotalCount: params.Recipients.length,
          QueuedCount: 0,
          BlockedCount: 0,
          DeferredCount: 0,
          ErrorMessage: `Communication run '${params.CommunicationRunID}' was not found`,
        };
      }
      run = existingRun.Results[0];
    } else {
      run = await CommunicationEngineBase.Instance.StartRun();
    }
    if (!run) {
      return {
        Success: false,
        IsAsyncRun: false,
        TotalCount: params.Recipients.length,
        QueuedCount: 0,
        BlockedCount: 0,
        DeferredCount: 0,
        ErrorMessage: 'Failed to create communication run',
      };
    }

    const asyncThreshold = this.config.AsyncThreshold ?? DEFAULT_ASYNC_THRESHOLD;
    const chunkSize = this.config.ChunkSize ?? DEFAULT_CHUNK_SIZE;
    if (!params.CommunicationRunID && this.config.EnqueueWork && params.Recipients.length > asyncThreshold) {
      for (let i = 0; i < params.Recipients.length; i += chunkSize) {
        const chunk = params.Recipients.slice(i, i + chunkSize);
        await this.config.EnqueueWork('comms.dispatch', {
          CommunicationRunID: run.ID,
          Envelope: params.Envelope,
          Payload: params.Payload,
          Recipients: chunk,
        });
      }
      return {
        Success: true,
        CommunicationRunID: run.ID,
        IsAsyncRun: true,
        TotalCount: params.Recipients.length,
        QueuedCount: params.Recipients.length,
        BlockedCount: 0,
        DeferredCount: 0,
      };
    }

    return this.executeInlineSend(params, sender, providerEntity, run, contextUser, getProvider);
  }

  private async executeInlineSend(
    params: SendToPrincipalsParams,
    sender: MJCommunicationSenderEntity,
    providerEntity: CommunicationEngineBase['Providers'][number],
    run: MJCommunicationRunEntity,
    contextUser: UserInfo,
    getProvider: (name: string) => BaseCommunicationProvider,
  ): Promise<SendV2Result> {
    const eligibility = await this.EvaluateEligibility(
      { Envelope: params.Envelope, Recipients: params.Recipients },
      contextUser,
    );

    const outcomes: SendV2RecipientOutcome[] = eligibility.Blocked.map((b) => ({
      Principal: b.Principal,
      Endpoint: b.Endpoint,
      Status: 'Blocked',
      Reason: b.Reason,
      Detail: b.Detail,
    }));

    let queuedCount = 0;
    let deferredCount = 0;
    const provider = getProvider(providerEntity.Name);
    const senderCredentials = await this.resolveSenderCredentials(
      sender,
      CommunicationEngineBase.Instance.ContextUser ?? contextUser,
    );
    const pmt = providerEntity.MessageTypes.find((m) =>
      UUIDsEqual(m.CommunicationBaseMessageTypeID, params.Envelope.ChannelID),
    ) ?? providerEntity.MessageTypes[0];

    const scheduledAt = params.Envelope.ScheduledAt;
    const scheduledInFuture = scheduledAt != null && scheduledAt.getTime() > Date.now();
    const existingLogsByEndpoint = params.CommunicationRunID
      ? await this.batchLoadRunLogs(run.ID, CommunicationEngineBase.Instance.ContextUser ?? contextUser)
      : undefined;

    const deferredSaves: Array<{
      target: SendableRecipient;
      deferUntil: Date | undefined;
      deferredPayload: MessagePayload;
    }> = [];

    for (let i = 0; i < eligibility.Sendable.length; i++) {
      const target = eligibility.Sendable[i];
      const rawRecipient = params.Recipients.find((r) => {
        if (r.Principal && target.Principal) {
          return PrincipalRecordKey(r.Principal) === PrincipalRecordKey(target.Principal);
        }
        if (!r.Principal && !target.Principal && r.Endpoint?.Address) {
          const norm = NormalizeEndpointAddress(r.Endpoint.Address, params.Envelope.ChannelID);
          return norm?.NormalizedValue === target.Endpoint.NormalizedValue;
        }
        return false;
      });

      if (target.Decision === 'Deferred' || scheduledInFuture) {
        deferredCount++;
        const deferUntil =
          target.DeferUntil && scheduledAt && scheduledInFuture
            ? (target.DeferUntil.getTime() > scheduledAt.getTime() ? target.DeferUntil : scheduledAt)
            : (target.DeferUntil ?? (scheduledInFuture ? scheduledAt : undefined));
        target.DeferUntil = deferUntil;
        const deferredPayload: MessagePayload = {
          ...params.Payload,
          ...rawRecipient?.PayloadOverride,
          Headers: {
            ...(params.Payload?.Headers ?? {}),
            ...(rawRecipient?.PayloadOverride?.Headers ?? {}),
          },
        };
        deferredSaves.push({ target, deferUntil, deferredPayload });
        continue;
      }

      const outcome = await this.dispatchSingleRecipient(
        params,
        sender,
        providerEntity.ID,
        pmt,
        run.ID,
        target,
        rawRecipient?.PayloadOverride,
        provider,
        contextUser,
        senderCredentials,
        existingLogsByEndpoint,
      );
      if (outcome.Status === 'Sent' || outcome.Status === 'Queued') {
        queuedCount++;
      }
      outcomes.push(outcome);
    }

    const LOG_BATCH_SIZE = 20;
    for (let i = 0; i < deferredSaves.length; i += LOG_BATCH_SIZE) {
      const batch = deferredSaves.slice(i, i + LOG_BATCH_SIZE);
      const claims = await Promise.all(
        batch.map((item) =>
          this.claimOrCreateV2Log(
            params,
            sender,
            providerEntity.ID,
            pmt?.ID,
            run.ID,
            item.target,
            'Pending',
            contextUser,
            item.deferredPayload,
            existingLogsByEndpoint,
          ),
        ),
      );
      for (let j = 0; j < batch.length; j++) {
        outcomes.push({
          Principal: batch[j].target.Principal,
          Endpoint: batch[j].target.Endpoint,
          CommunicationLogID: claims[j].Log?.ID,
          Status: 'Deferred',
          DeferUntil: batch[j].deferUntil,
        });
      }
    }

    await CommunicationEngineBase.Instance.EndRun(run);
    return {
      Success: true,
      CommunicationRunID: run.ID,
      IsAsyncRun: false,
      TotalCount: params.Recipients.length,
      QueuedCount: queuedCount,
      BlockedCount: eligibility.Blocked.length,
      DeferredCount: deferredCount,
      Outcomes: outcomes,
    };
  }

  private async dispatchSingleRecipient(
    params: SendToPrincipalsParams,
    sender: MJCommunicationSenderEntity,
    providerID: string,
    pmt: CommunicationEngineBase['Providers'][number]['MessageTypes'][number] | undefined,
    runID: string,
    target: SendableRecipient,
    override: Partial<MessagePayload> | undefined,
    provider: BaseCommunicationProvider,
    contextUser: UserInfo,
    senderCredentials?: ProviderCredentialsBase,
    existingLogsByEndpoint?: Map<string, MJCommunicationLogEntity>,
  ): Promise<SendV2RecipientOutcome> {
    const claim = await this.claimOrCreateV2Log(
      params,
      sender,
      providerID,
      pmt?.ID,
      runID,
      target,
      'In-Progress',
      contextUser,
      undefined,
      existingLogsByEndpoint,
    );
    if (claim.AlreadySent) {
      return {
        Principal: target.Principal,
        Endpoint: target.Endpoint,
        CommunicationLogID: claim.Log?.ID,
        Status: 'Sent',
      };
    }
    if (!claim.Log) {
      return {
        Principal: target.Principal,
        Endpoint: target.Endpoint,
        Status: 'Failed',
        Reason: claim.FailureReason ?? 'LogCreationFailed',
        Detail: claim.FailureDetail,
      };
    }
    const log = claim.Log;

    const payload: MessagePayload = {
      ...params.Payload,
      ...override,
      Headers: {
        ...(params.Payload?.Headers ?? {}),
        ...(override?.Headers ?? {}),
      },
    };

    const trackingToken = log.TrackingToken ?? randomUUID();
    const unsubscribeToken = log.UnsubscribeToken ?? randomUUID();
    const baseUrl = this.config.BaseTrackingURL ?? '';
    const hmacSecret = this.config.TrackingHMACSecret ?? process.env.MJ_COMMS_HMAC_SECRET ?? '';

    const obligations = this.enrichObligations(target.Obligations, baseUrl, unsubscribeToken);
    const snapshot: ProtectedComplianceSnapshot = Object.freeze({
      From: sender.FromEmail ?? sender.FromPhone ?? '',
      To: target.Endpoint.NormalizedValue,
      ListUnsubscribe: obligations.RequireOneClickHeader && obligations.UnsubscribeURL
        ? `<${obligations.UnsubscribeURL}>`
        : undefined,
      ListUnsubscribePost: obligations.RequireOneClickHeader
        ? 'List-Unsubscribe=One-Click'
        : undefined,
      FooterHTML: this.buildComplianceFooterHTML(obligations),
      FooterText: this.buildComplianceFooterText(obligations),
      LogID: log.ID,
    });
    const expectedHash = ComputeProtectedElementsHash(snapshot);

    const driver = target.Principal ? this.getPrincipalDriver(target.Principal.EntityID) : undefined;
    const hookState = this.createMessageContext(params.Envelope, target, payload);

    if (driver && target.Principal) {
      await driver.PreProcess([hookState.Context], contextUser);
      await driver.PostProcess([hookState.Context], contextUser);
    }

    // Assert protected compliance elements were not tampered with by hooks
    if (ComputeProtectedElementsHash(snapshot) !== expectedHash) {
      throw new Error('Protected compliance elements failed SHA-256 integrity assertion after PostProcess');
    }

    const finalPayload = this.finalizePayload(
      payload,
      hookState,
      snapshot,
      obligations,
      params.Envelope,
      trackingToken,
      hmacSecret,
      baseUrl,
    );

    const enforcementMode =
      sender.EnforcementMode ?? this.config.InstanceEnforcementMode ?? 'Enforce';
    if (enforcementMode === 'Enforce') {
      const obligationError = this.validateBodyObligations(finalPayload, obligations);
      if (obligationError) {
        log.Status = 'Failed';
        log.ErrorMessage = obligationError;
        if (!(await log.Save())) {
          LogError(`V2SendService: failed to save failed CommunicationLog ${log.ID}: ${log.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }
        return {
          Principal: target.Principal,
          Endpoint: target.Endpoint,
          CommunicationLogID: log.ID,
          Status: 'Blocked',
          Reason: 'ObligationValidationFailed',
          Detail: obligationError,
        };
      }
    }

    this.assertProtectedElementsIntact(finalPayload, snapshot);

    const msg = new Message();
    msg.MessageType = pmt as NonNullable<typeof pmt>;
    msg.From = snapshot.From;
    msg.FromName = sender.FromName ?? sender.Name;
    msg.To = snapshot.To;
    msg.Subject = finalPayload.Subject;
    msg.Body = finalPayload.Body;
    msg.HTMLBody = finalPayload.HTMLBody;
    msg.Headers = finalPayload.Headers;
    msg.DryRun = params.Envelope.DryRun;
    msg.CorrelationLogID = log.ID;
    msg.DisableProviderTracking = true;

    const processed = new ProcessedMessageServer(msg);
    processed.ProcessedSubject = finalPayload.Subject ?? '';
    processed.ProcessedBody = finalPayload.Body ?? '';
    processed.ProcessedHTMLBody = finalPayload.HTMLBody ?? '';

    const sendRes = await provider.SendSingleMessage(processed, senderCredentials);
    log.Status = sendRes.Success ? 'Complete' : 'Failed';
    log.ProviderMessageID = sendRes.ProviderMessageID ?? log.ProviderMessageID;
    log.ErrorMessage = sendRes.Error || null;
    if (!(await log.Save())) {
      const saveErr = log.LatestResult?.CompleteMessage ?? 'unknown error';
      LogError(`V2SendService: failed to update CommunicationLog ${log.ID} after send: ${saveErr}`);
      return {
        Principal: target.Principal,
        Endpoint: target.Endpoint,
        CommunicationLogID: log.ID,
        Status: 'Failed',
        Reason: 'PostSendLogSaveFailed',
        Detail: saveErr,
      };
    }

    return {
      Principal: target.Principal,
      Endpoint: target.Endpoint,
      CommunicationLogID: log.ID,
      Status: sendRes.Success ? 'Sent' : 'Failed',
      Detail: sendRes.Error || undefined,
    };
  }

  private finalizePayload(
    payload: MessagePayload,
    hookState: ReturnType<V2SendService['createMessageContext']>,
    snapshot: ProtectedComplianceSnapshot,
    obligations: ComplianceObligations,
    envelope: SendingEnvelope,
    trackingToken: string,
    hmacSecret: string,
    baseUrl: string,
  ): MessagePayload {
    let html = `${hookState.HeaderHTML}${payload.HTMLBody ?? ''}${hookState.FooterHTML}`;
    let text = `${hookState.HeaderText}${payload.Body ?? ''}${hookState.FooterText}`;
    const hasHtml = html.trim().length > 0;

    if (hasHtml && obligations.AllowClickTracking && envelope.TrackClicks !== false && hmacSecret) {
      const excluded = [obligations.UnsubscribeURL, obligations.PreferenceCenterURL].filter(
        (u): u is string => Boolean(u),
      );
      html = RewriteLinksForTracking(html, trackingToken, hmacSecret, baseUrl, excluded);
    }

    if (hasHtml && snapshot.FooterHTML) {
      html = `${html}${snapshot.FooterHTML}`;
    }
    if (snapshot.FooterText) {
      text = `${text}${snapshot.FooterText}`;
    }

    if (hasHtml && obligations.AllowOpenPixel && envelope.TrackOpens !== false) {
      html = InjectOpenPixel(html, trackingToken, baseUrl);
    }

    const headers: Record<string, string> = {
      ...(payload.Headers ?? {}),
      ...hookState.CustomHeaders,
    };
    if (snapshot.ListUnsubscribe) {
      headers['List-Unsubscribe'] = snapshot.ListUnsubscribe;
    }
    if (snapshot.ListUnsubscribePost) {
      headers['List-Unsubscribe-Post'] = snapshot.ListUnsubscribePost;
    }

    return {
      Subject: hookState.SubjectOverride ?? payload.Subject,
      PreviewText: hookState.PreviewTextOverride ?? payload.PreviewText,
      Body: text,
      HTMLBody: hasHtml ? html : undefined,
      Headers: headers,
    };
  }

  private createMessageContext(
    envelope: SendingEnvelope,
    target: SendableRecipient,
    payload: MessagePayload,
  ): {
    Context: PrincipalMessageContext;
    HeaderHTML: string;
    FooterHTML: string;
    HeaderText: string;
    FooterText: string;
    CustomHeaders: Record<string, string>;
    SubjectOverride?: string;
    PreviewTextOverride?: string;
  } {
    const state = {
      HeaderHTML: '',
      FooterHTML: '',
      HeaderText: '',
      FooterText: '',
      CustomHeaders: {} as Record<string, string>,
      SubjectOverride: undefined as string | undefined,
      PreviewTextOverride: undefined as string | undefined,
      Context: {} as PrincipalMessageContext,
    };

    const protectedHeaderNames = new Set([
      'list-unsubscribe',
      'list-unsubscribe-post',
      'from',
      'to',
    ]);

    state.Context = {
      Envelope: envelope,
      Principal: target.Principal ?? { EntityID: '', RecordID: '' },
      Endpoint: target.Endpoint,
      Payload: payload,
      AddContent(location, content) {
        if (location === 'header') {
          if (content.html) state.HeaderHTML += content.html;
          if (content.text) state.HeaderText += content.text;
        } else {
          if (content.html) state.FooterHTML += content.html;
          if (content.text) state.FooterText += content.text;
        }
      },
      SetHeader(name, value) {
        if (!protectedHeaderNames.has(name.trim().toLowerCase())) {
          state.CustomHeaders[name] = value;
        }
      },
      RequestMutation(mutation) {
        if (mutation.Subject !== undefined) state.SubjectOverride = mutation.Subject;
        if (mutation.PreviewText !== undefined) state.PreviewTextOverride = mutation.PreviewText;
      },
    };

    return state;
  }

  private enrichObligations(
    obligations: ComplianceObligations,
    baseUrl: string,
    unsubscribeToken: string,
  ): ComplianceObligations {
    const unsubUrl =
      obligations.UnsubscribeURL ?? buildCommsRouteUrl(baseUrl, `/unsubscribe/${unsubscribeToken}`);
    return {
      ...obligations,
      UnsubscribeURL: unsubUrl,
    };
  }

  private buildComplianceFooterHTML(obligations: ComplianceObligations): string | undefined {
    const parts: string[] = [];
    if (obligations.RequireSenderPostalAddress && obligations.SenderPostalAddress) {
      parts.push(`<span>${obligations.SenderPostalAddress}</span>`);
    }
    if (obligations.RequireFooterUnsubscribe && obligations.UnsubscribeURL) {
      parts.push(`<a href="${obligations.UnsubscribeURL}">Unsubscribe</a>`);
    }
    if (parts.length === 0) return undefined;
    return `<div data-mj-compliance-footer="true">${parts.join(' | ')}</div>`;
  }

  private buildComplianceFooterText(obligations: ComplianceObligations): string | undefined {
    const parts: string[] = [];
    if (obligations.RequireSenderPostalAddress && obligations.SenderPostalAddress) {
      parts.push(obligations.SenderPostalAddress);
    }
    if (obligations.RequireFooterUnsubscribe && obligations.UnsubscribeURL) {
      parts.push(`Unsubscribe: ${obligations.UnsubscribeURL}`);
    }
    if (parts.length === 0) return undefined;
    return `\n\n---\n${parts.join(' | ')}`;
  }

  private getPrincipalDriver(entityID: string): BaseCommunicationPrincipal | undefined {
    const principal: MJCommunicationPrincipalEntity | undefined =
      CommunicationEngineBase.Instance.Principals.find(
        (p) => p.Status === 'Active' && UUIDsEqual(p.EntityID, entityID),
      );
    const driverClass = principal?.DriverClass ?? 'DefaultCommunicationPrincipal';
    return MJGlobal.Instance.ClassFactory.CreateInstance<BaseCommunicationPrincipal>(
      BaseCommunicationPrincipal,
      driverClass,
    );
  }

  private async resolveSender(
    senderID: string | undefined,
    contextUser: UserInfo,
  ): Promise<MJCommunicationSenderEntity | undefined> {
    const cacheKey = senderID ? senderID.toLowerCase() : '__default__';
    const cached = this.senderCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const rv = this.getRunView();
    const filter = senderID
      ? `ID='${EscapeSQLString(senderID)}' AND Status='Active'`
      : `IsDefault=1 AND Status='Active'`;
    const res = await rv.RunView<MJCommunicationSenderEntity>(
      {
        EntityName: 'MJ: Communication Senders',
        ExtraFilter: filter,
        ResultType: 'entity_object',
      },
      contextUser,
    );
    const found = res.Success && res.Results.length > 0 ? res.Results[0] : undefined;
    if (found) {
      const expiresAt = Date.now() + CACHE_TTL_MS;
      this.senderCache.set(cacheKey, { value: found, expiresAt });
      this.senderCache.set(found.ID.toLowerCase(), { value: found, expiresAt });
    }
    return found;
  }

  private async loadSenderAncestry(
    sender: MJCommunicationSenderEntity,
    contextUser: UserInfo,
  ): Promise<MJCommunicationSenderEntity[]> {
    const cacheKey = sender.ID.toLowerCase();
    const cached = this.senderAncestryCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const chain: MJCommunicationSenderEntity[] = [sender];
    const visited = new Set<string>([sender.ID.toLowerCase()]);
    let parentId = sender.ParentSenderID;

    while (parentId && !visited.has(parentId.toLowerCase())) {
      visited.add(parentId.toLowerCase());
      const parent = await this.resolveSender(parentId, contextUser);
      if (!parent) break;
      chain.push(parent);
      parentId = parent.ParentSenderID;
    }
    this.senderAncestryCache.set(cacheKey, { value: chain, expiresAt: Date.now() + CACHE_TTL_MS });
    return chain;
  }

  private async resolveSenderTemplateContext(
    chain: MJCommunicationSenderEntity[],
    contextUser: UserInfo,
  ): Promise<Record<string, unknown>> {
    const cacheKey = chain[0].ID.toLowerCase();
    const cached = this.senderTemplateCtxCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const merged: Record<string, unknown> = {};
    for (let i = chain.length - 1; i >= 0; i--) {
      const s = chain[i];
      if (s.TemplateContext) {
        try {
          Object.assign(merged, JSON.parse(s.TemplateContext) as Record<string, unknown>);
        } catch {
          // ignore malformed JSON
        }
      }
    }

    const senderType = CommunicationEngineBase.Instance.SenderTypes.find((st) =>
      UUIDsEqual(st.ID, chain[0].CommunicationSenderTypeID),
    );
    if (senderType?.DriverClass) {
      const driver = MJGlobal.Instance.ClassFactory.CreateInstance<BaseCommunicationSender>(
        BaseCommunicationSender,
        senderType.DriverClass,
      );
      if (driver) {
        const extra = await driver.ResolveTemplateContext(chain[0], chain.slice(1), contextUser);
        Object.assign(merged, extra);
      }
    }
    this.senderTemplateCtxCache.set(cacheKey, { value: merged, expiresAt: Date.now() + CACHE_TTL_MS });
    return merged;
  }

  private async loadPreference(
    preferenceID: string,
    contextUser: UserInfo,
  ): Promise<MJCommunicationPreferenceEntity> {
    const cacheKey = preferenceID.toLowerCase();
    const cached = this.preferenceCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const rv = this.getRunView();
    const res = await rv.RunView<MJCommunicationPreferenceEntity>(
      {
        EntityName: 'MJ: Communication Preferences',
        ExtraFilter: `ID='${EscapeSQLString(preferenceID)}'`,
        ResultType: 'entity_object',
      },
      contextUser,
    );
    if (!res.Success) {
      throw new Error(`Failed loading communication preference '${preferenceID}': ${res.ErrorMessage ?? 'RunView failed'}`);
    }
    if (res.Results.length === 0) {
      throw new Error(`Communication preference '${preferenceID}' was not found`);
    }
    this.preferenceCache.set(cacheKey, { value: res.Results[0], expiresAt: Date.now() + CACHE_TTL_MS });
    return res.Results[0];
  }

  private async resolveAllAttributes(
    records: PrincipalRecordRef[],
    contextUser: UserInfo,
  ): Promise<Map<string, PrincipalAttributes>> {
    const out = new Map<string, PrincipalAttributes>();
    if (records.length === 0) return out;
    const driver = this.getPrincipalDriver(records[0].EntityID);
    if (!driver) return out;
    return driver.ResolveAttributes(records, contextUser);
  }

  private async resolveAllJurisdictions(
    records: PrincipalRecordRef[],
    contextUser: UserInfo,
  ): Promise<Map<string, string | null>> {
    const out = new Map<string, string | null>();
    if (records.length === 0) return out;
    const driver = this.getPrincipalDriver(records[0].EntityID);
    if (!driver) return out;
    return driver.ResolveJurisdiction(records, contextUser);
  }

  private collectEndpointIds(
    resolvedMap: Map<string, ResolvedEndpoint[]>,
    recipients: EvaluateEligibilityParams['Recipients'],
  ): string[] {
    const ids = new Set<string>();
    for (const list of resolvedMap.values()) {
      for (const ep of list) ids.add(ep.CommunicationEndpointID);
    }
    for (const r of recipients) {
      if (r.Endpoint?.CommunicationEndpointID) {
        ids.add(r.Endpoint.CommunicationEndpointID);
      }
    }
    return Array.from(ids);
  }

  private async batchLoadAdHocEndpoints(
    recipients: EvaluateEligibilityParams['Recipients'],
    channelID: string,
    contextUser: UserInfo,
  ): Promise<Map<string, MJCommunicationEndpointEntity>> {
    const out = new Map<string, MJCommunicationEndpointEntity>();
    const ids = new Set<string>();
    const hashes = new Set<string>();

    for (const rec of recipients) {
      if (rec.Endpoint?.CommunicationEndpointID) {
        ids.add(rec.Endpoint.CommunicationEndpointID);
      } else if (rec.Endpoint?.Address) {
        const norm = NormalizeEndpointAddress(rec.Endpoint.Address);
        if (norm) {
          hashes.add(ComputeEndpointHash(norm.NormalizedValue));
        }
      }
    }

    if (ids.size === 0 && hashes.size === 0) {
      return out;
    }

    const clauses: string[] = [];
    if (ids.size > 0) {
      const idList = Array.from(ids).map((id) => `'${EscapeSQLString(id)}'`).join(',');
      clauses.push(`ID IN (${idList})`);
    }
    if (hashes.size > 0) {
      const hashList = Array.from(hashes).map((h) => `'${EscapeSQLString(h)}'`).join(',');
      clauses.push(`(BaseMessageTypeID='${EscapeSQLString(channelID)}' AND ValueHash IN (${hashList}))`);
    }

    const rv = this.getRunView();
    const res = await rv.RunView<MJCommunicationEndpointEntity>(
      {
        EntityName: 'MJ: Communication Endpoints',
        ExtraFilter: clauses.join(' OR '),
        ResultType: 'entity_object',
      },
      contextUser,
    );
    if (res.Success) {
      for (const ep of res.Results) {
        out.set(ep.ID.toLowerCase(), ep);
        if (ep.ValueHash) {
          out.set(`hash:${ep.ValueHash}`, ep);
        }
      }
    }
    return out;
  }

  private async pickEndpointForRecipient(
    rec: EvaluateEligibilityParams['Recipients'][number],
    channelID: string,
    resolvedMap: Map<string, ResolvedEndpoint[]>,
    contextUser: UserInfo,
    adHocEndpointMap?: Map<string, MJCommunicationEndpointEntity>,
  ): Promise<ResolvedEndpoint | undefined> {
    if (rec.Endpoint?.CommunicationEndpointID) {
      const entity =
        adHocEndpointMap?.get(rec.Endpoint.CommunicationEndpointID.toLowerCase()) ??
        (await this.loadEndpointEntity(rec.Endpoint.CommunicationEndpointID, contextUser));
      if (!entity) return undefined;
      return {
        CommunicationEndpointID: entity.ID,
        ChannelID: entity.BaseMessageTypeID,
        NormalizedValue: entity.NormalizedValue ?? '',
        ValueHash: entity.ValueHash,
        RawValue: entity.NormalizedValue ?? '',
        Domain: entity.Domain ?? undefined,
        EndpointEntity: entity,
      };
    }

    if (rec.Endpoint?.Address) {
      const norm = NormalizeEndpointAddress(rec.Endpoint.Address);
      if (!norm) return undefined;
      const hash = ComputeEndpointHash(norm.NormalizedValue);
      const cachedEp = adHocEndpointMap?.get(`hash:${hash}`);
      if (cachedEp) {
        return {
          CommunicationEndpointID: cachedEp.ID,
          ChannelID: cachedEp.BaseMessageTypeID,
          NormalizedValue: norm.NormalizedValue,
          ValueHash: hash,
          RawValue: norm.RawValue,
          Domain: norm.Domain,
          EndpointEntity: cachedEp,
        };
      }
      const rv = this.getRunView();
      const res = await rv.RunView<MJCommunicationEndpointEntity>(
        {
          EntityName: 'MJ: Communication Endpoints',
          ExtraFilter: `BaseMessageTypeID='${EscapeSQLString(channelID)}' AND ValueHash='${EscapeSQLString(hash)}'`,
          ResultType: 'entity_object',
        },
        contextUser,
      );
      if (res.Success && res.Results.length > 0) {
        const ep = res.Results[0];
        return {
          CommunicationEndpointID: ep.ID,
          ChannelID: ep.BaseMessageTypeID,
          NormalizedValue: norm.NormalizedValue,
          ValueHash: hash,
          RawValue: norm.RawValue,
          Domain: norm.Domain,
          EndpointEntity: ep,
        };
      }
    }

    if (rec.Principal) {
      return resolvedMap.get(PrincipalRecordKey(rec.Principal))?.[0];
    }

    return undefined;
  }

  private async loadEndpointEntity(
    endpointID: string,
    contextUser: UserInfo,
  ): Promise<MJCommunicationEndpointEntity | undefined> {
    const rv = this.getRunView();
    const res = await rv.RunView<MJCommunicationEndpointEntity>(
      {
        EntityName: 'MJ: Communication Endpoints',
        ExtraFilter: `ID='${EscapeSQLString(endpointID)}'`,
        ResultType: 'entity_object',
      },
      contextUser,
    );
    return res.Success && res.Results.length > 0 ? res.Results[0] : undefined;
  }

  private async loadSuppressions(
    endpointIds: string[],
    principals: PrincipalRecordRef[],
    contextUser: UserInfo,
  ): Promise<MJCommunicationSuppressionEntity[]> {
    const clauses: string[] = [];
    if (endpointIds.length > 0) {
      const quoted = endpointIds.map((id) => `'${EscapeSQLString(id)}'`).join(',');
      clauses.push(`CommunicationEndpointID IN (${quoted})`);
    }
    if (principals.length > 0) {
      const quoted = principals.map((p) => `'${EscapeSQLString(p.RecordID)}'`).join(',');
      clauses.push(`RecordID IN (${quoted})`);
    }
    if (clauses.length === 0) return [];

    const rv = this.getRunView();
    const res = await rv.RunView<MJCommunicationSuppressionEntity>(
      {
        EntityName: 'MJ: Communication Suppressions',
        ExtraFilter: `Status='Active' AND (${clauses.join(' OR ')})`,
        ResultType: 'entity_object',
      },
      contextUser,
    );
    if (!res.Success) {
      throw new Error(`Failed loading communication suppressions: ${res.ErrorMessage ?? 'RunView failed'}`);
    }
    return res.Results;
  }

  private async loadPrincipalPreferences(
    principals: PrincipalRecordRef[],
    preferenceID: string,
    senderID: string,
    contextUser: UserInfo,
  ): Promise<Map<string, MJCommunicationPrincipalPreferenceEntity>> {
    const out = new Map<string, MJCommunicationPrincipalPreferenceEntity>();
    if (principals.length === 0) return out;

    const quoted = principals.map((p) => `'${EscapeSQLString(p.RecordID)}'`).join(',');
    const rv = this.getRunView();
    const res = await rv.RunView<MJCommunicationPrincipalPreferenceEntity>(
      {
        EntityName: 'MJ: Communication Principal Preferences',
        ExtraFilter: `CommunicationPreferenceID='${EscapeSQLString(preferenceID)}' AND RecordID IN (${quoted}) AND (CommunicationSenderID='${EscapeSQLString(senderID)}' OR CommunicationSenderID IS NULL)`,
        ResultType: 'entity_object',
      },
      contextUser,
    );
    if (!res.Success) {
      throw new Error(`Failed loading communication principal preferences: ${res.ErrorMessage ?? 'RunView failed'}`);
    }
    if (res.Results) {
      for (const pp of res.Results) {
        const key = `${pp.EntityID.toLowerCase()}:${pp.RecordID}`;
        const existing = out.get(key);
        // Prefer sender-specific row over global (CommunicationSenderID === null) row
        if (!existing || pp.CommunicationSenderID !== null) {
          out.set(key, pp);
        }
      }
    }
    return out;
  }

  private async checkSenderPermission(
    sender: MJCommunicationSenderEntity,
    contextUser: UserInfo,
  ): Promise<{ Allowed: boolean; ErrorMessage?: string }> {
    const chain = await this.loadSenderAncestry(sender, contextUser);
    const ancestorIds = chain.slice(1).map((s) => `'${EscapeSQLString(s.ID)}'`);
    const filter =
      ancestorIds.length > 0
        ? `CommunicationSenderID='${EscapeSQLString(sender.ID)}' OR (CommunicationSenderID IN (${ancestorIds.join(',')}) AND AppliesToChildSenders=1)`
        : `CommunicationSenderID='${EscapeSQLString(sender.ID)}'`;

    const rv = this.getRunView();
    const res = await rv.RunView<MJCommunicationSenderPermissionEntity>(
      {
        EntityName: 'MJ: Communication Sender Permissions',
        ExtraFilter: filter,
        ResultType: 'entity_object',
      },
      contextUser,
    );
    if (!res.Success) {
      return {
        Allowed: false,
        ErrorMessage: `Failed verifying sender permissions: ${res.ErrorMessage ?? 'RunView failed'}`,
      };
    }
    if (res.Results.length === 0) {
      // No ACL rows configured on sender chain — sender is unrestricted
      return { Allowed: true };
    }

    const userRoleIds = new UUIDSet((contextUser.UserRoles ?? []).map((ur) => ur.RoleID));
    const hasSend = res.Results.some((perm) => {
      if (perm.PermissionLevel !== 'Send' && perm.PermissionLevel !== 'Manage') {
        return false;
      }
      if (perm.UserID !== null && UUIDsEqual(perm.UserID, contextUser.ID)) {
        return true;
      }
      return perm.RoleID !== null && userRoleIds.Has(perm.RoleID);
    });

    if (!hasSend) {
      return {
        Allowed: false,
        ErrorMessage: `User lacks Send permission for sender '${sender.Name}'`,
      };
    }
    return { Allowed: true };
  }

  private async verifySendingDomain(
    providerID: string,
    domain: string | null,
    credentialID: string | null,
    contextUser: UserInfo,
  ): Promise<boolean> {
    if (!domain) return false;
    const credClause = credentialID
      ? `CredentialID='${EscapeSQLString(credentialID)}'`
      : `CredentialID IS NULL`;
    const rv = this.getRunView();
    const res = await rv.RunView<MJCommunicationSendingDomainEntity>(
      {
        EntityName: 'MJ: Communication Sending Domains',
        ExtraFilter: `CommunicationProviderID='${EscapeSQLString(providerID)}' AND Domain='${EscapeSQLString(domain)}' AND ${credClause} AND Status='Verified'`,
        ResultType: 'simple',
        Fields: ['ID'],
      },
      contextUser,
    );
    return res.Success && res.Results.length > 0;
  }

  private async batchLoadRunLogs(
    runID: string,
    contextUser: UserInfo,
  ): Promise<Map<string, MJCommunicationLogEntity> | undefined> {
    const rv = this.getRunView();
    const res = await rv.RunView<MJCommunicationLogEntity>(
      {
        EntityName: 'MJ: Communication Logs',
        ExtraFilter: `CommunicationRunID='${EscapeSQLString(runID)}'`,
        ResultType: 'entity_object',
      },
      contextUser,
    );
    if (!res.Success) {
      return undefined;
    }
    const map = new Map<string, MJCommunicationLogEntity>();
    for (const log of res.Results) {
      if (log.CommunicationEndpointID) {
        map.set(log.CommunicationEndpointID.toLowerCase(), log);
      }
    }
    return map;
  }

  private async claimOrCreateV2Log(
    params: SendToPrincipalsParams,
    sender: MJCommunicationSenderEntity,
    providerID: string,
    pmtID: string | undefined,
    runID: string,
    target: SendableRecipient,
    initialStatus: 'In-Progress' | 'Pending',
    contextUser: UserInfo,
    deferredPayload?: MessagePayload,
    existingLogsByEndpoint?: Map<string, MJCommunicationLogEntity>,
  ): Promise<{
    Log?: MJCommunicationLogEntity;
    AlreadySent?: boolean;
    FailureReason?: string;
    FailureDetail?: string;
  }> {
    if (!pmtID) {
      return { FailureReason: 'MissingProviderMessageType', FailureDetail: 'No provider message type found for channel' };
    }

    const findExisting = async (): Promise<{
      Success: boolean;
      Log?: MJCommunicationLogEntity;
      ErrorMessage?: string;
    }> => {
      const rv = this.getRunView();
      const existingRes = await rv.RunView<MJCommunicationLogEntity>(
        {
          EntityName: 'MJ: Communication Logs',
          ExtraFilter: `CommunicationRunID='${EscapeSQLString(runID)}' AND CommunicationEndpointID='${EscapeSQLString(target.Endpoint.CommunicationEndpointID)}'`,
          MaxRows: 1,
          ResultType: 'entity_object',
        },
        contextUser,
      );
      if (!existingRes.Success) {
        return { Success: false, ErrorMessage: existingRes.ErrorMessage ?? 'RunView failed' };
      }
      return { Success: true, Log: existingRes.Results[0] };
    };

    const handleExisting = async (
      existing: MJCommunicationLogEntity,
    ): Promise<{
      Log?: MJCommunicationLogEntity;
      AlreadySent?: boolean;
      FailureReason?: string;
      FailureDetail?: string;
    }> => {
      if (existing.Status === 'Complete' || Boolean(existing.ProviderMessageID)) {
        return { Log: existing, AlreadySent: true };
      }
      if (initialStatus === 'Pending') {
        return { Log: existing };
      }
      if (existing.Status === 'In-Progress') {
        return {
          FailureReason: 'LogAlreadyInProgress',
          FailureDetail: `CommunicationLog ${existing.ID} is already In-Progress without a ProviderMessageID`,
        };
      }
      existing.Status = 'In-Progress';
      if (!(await existing.Save())) {
        const msg = existing.LatestResult?.CompleteMessage ?? 'Failed to claim CommunicationLog In-Progress';
        LogError(`V2SendService: ${msg}`);
        return { FailureReason: 'LogClaimFailed', FailureDetail: msg };
      }
      return { Log: existing };
    };

    if (params.CommunicationRunID) {
      const preloaded = existingLogsByEndpoint?.get(target.Endpoint.CommunicationEndpointID.toLowerCase());
      if (preloaded) {
        return handleExisting(preloaded);
      }
      if (!existingLogsByEndpoint) {
        const lookup = await findExisting();
        if (!lookup.Success) {
          return { FailureReason: 'LogLookupFailed', FailureDetail: lookup.ErrorMessage };
        }
        if (lookup.Log) {
          return handleExisting(lookup.Log);
        }
      }
    }

    const md = CommunicationEngineBase.Instance.ProviderToUse;
    const bookkeepingUser = CommunicationEngineBase.Instance.ContextUser ?? contextUser;
    const log = await md.GetEntityObject<MJCommunicationLogEntity>(
      'MJ: Communication Logs',
      bookkeepingUser,
    );
    log.CommunicationRunID = runID;
    log.CommunicationProviderID = providerID;
    log.CommunicationProviderMessageTypeID = pmtID;
    log.CommunicationSenderID = sender.ID;
    log.CommunicationPreferenceID = params.Envelope.PreferenceID ?? null;
    log.CommunicationEndpointID = target.Endpoint.CommunicationEndpointID;
    log.RecipientAddress = target.Endpoint.NormalizedValue;
    log.EntityID = target.Principal?.EntityID ?? null;
    log.RecordID = target.Principal?.RecordID ?? null;
    log.MessageClass = params.Envelope.MessageClass;
    log.ScheduledAt = target.DeferUntil ?? params.Envelope.ScheduledAt ?? null;
    log.UnsubscribeToken = randomUUID();
    log.TrackingToken = randomUUID();
    log.Direction = 'Sending';
    log.Status = initialStatus;
    log.MessageDate = new Date();
    const correlationPayload =
      initialStatus === 'Pending' && deferredPayload
        ? { ...(params.Envelope.CorrelationData ?? {}), __deferredPayload: deferredPayload }
        : params.Envelope.CorrelationData;
    log.CorrelationData = correlationPayload
      ? JSON.stringify(correlationPayload)
      : null;
    log.ComplianceDecision = JSON.stringify({
      Decision: target.Decision,
      Obligations: target.Obligations,
      ...target.AuditSnapshot,
    });

    if (await log.Save()) {
      return { Log: log };
    }

    const saveErr = log.LatestResult?.CompleteMessage ?? 'Failed to save CommunicationLog';
    // Re-check for a concurrent winner on (CommunicationRunID, CommunicationEndpointID)
    const winner = await findExisting();
    if (winner.Success && winner.Log) {
      return handleExisting(winner.Log);
    }
    LogError(`V2SendService: ${saveErr}`);
    return { FailureReason: 'LogCreationFailed', FailureDetail: saveErr };
  }

  private getRunView(): RunView {
    return RunView.FromMetadataProvider(CommunicationEngineBase.Instance.ProviderToUse);
  }

  /**
   * V1 gate: checks endpoint status and active suppressions for legacy SendSingleMessage / SendMessages callers.
   */
  public async CheckV1ComplianceGate(
    channelID: string,
    recipientAddress: string,
    messageClass: MessageClass,
    contextUser: UserInfo,
  ): Promise<{ Allowed: boolean; Reason?: string; Detail?: string }> {
    return this.CheckV1ComplianceGateBatch(channelID, [recipientAddress], messageClass, contextUser);
  }

  /**
   * Batched V1 gate: checks endpoint status and active suppressions across all recipient addresses
   * in at most two RunView calls instead of querying inside a per-recipient loop.
   */
  public async CheckV1ComplianceGateBatch(
    channelID: string,
    recipientAddresses: ReadonlyArray<string>,
    messageClass: MessageClass,
    contextUser: UserInfo,
  ): Promise<{ Allowed: boolean; Reason?: string; Detail?: string }> {
    const hashes = new Set<string>();
    for (const raw of recipientAddresses) {
      const trimmed = raw.trim();
      if (!trimmed) continue;
      const norm = NormalizeEndpointAddress(trimmed, channelID);
      hashes.add(norm?.ValueHash ?? ComputeEndpointHash(trimmed.toLowerCase()));
    }
    if (hashes.size === 0) {
      return { Allowed: true };
    }

    const hashList = Array.from(hashes)
      .map((h) => `'${EscapeSQLString(h)}'`)
      .join(',');
    const rv = this.getRunView();
    const epRes = await rv.RunView<MJCommunicationEndpointEntity>(
      {
        EntityName: 'MJ: Communication Endpoints',
        ExtraFilter: `BaseMessageTypeID='${EscapeSQLString(channelID)}' AND ValueHash IN (${hashList})`,
        ResultType: 'entity_object',
      },
      contextUser,
    );
    if (!epRes.Success) {
      return {
        Allowed: false,
        Reason: 'GateLookupFailed',
        Detail: epRes.ErrorMessage ?? 'Failed to query communication endpoints',
      };
    }
    if (epRes.Results.length === 0) {
      return { Allowed: true };
    }

    for (const endpoint of epRes.Results) {
      if (endpoint.Status === 'Hard Bounced' || endpoint.Status === 'Invalid' || endpoint.Status === 'Erased') {
        return {
          Allowed: false,
          Reason: endpoint.Status,
          Detail: `Blocked by endpoint status '${endpoint.Status}'`,
        };
      }
      if (endpoint.Status === 'Complained' && messageClass !== 'Transactional') {
        return {
          Allowed: false,
          Reason: 'Spam Complaint',
          Detail: `Blocked by endpoint status 'Complained'`,
        };
      }
    }

    const epIds = epRes.Results.map((e) => `'${EscapeSQLString(e.ID)}'`).join(',');
    const supRes = await rv.RunView<MJCommunicationSuppressionEntity>(
      {
        EntityName: 'MJ: Communication Suppressions',
        ExtraFilter: `CommunicationEndpointID IN (${epIds}) AND Status='Active'`,
        ResultType: 'entity_object',
      },
      contextUser,
    );
    if (!supRes.Success) {
      return {
        Allowed: false,
        Reason: 'GateLookupFailed',
        Detail: supRes.ErrorMessage ?? 'Failed to query communication suppressions',
      };
    }
    if (supRes.Results.length === 0) {
      return { Allowed: true };
    }

    const nowMs = Date.now();
    for (const s of supRes.Results) {
      if (s.ExpiresAt && s.ExpiresAt.getTime() <= nowMs) continue;
      if (s.Reason === 'Hard Bounce' || s.Reason === 'Invalid Address') {
        return {
          Allowed: false,
          Reason: s.Reason,
          Detail: `Suppressed by ${s.Reason}`,
        };
      }
      if (messageClass !== 'Transactional') {
        if (s.Reason === 'Spam Complaint' || s.Reason === 'Admin Block') {
          return {
            Allowed: false,
            Reason: s.Reason,
            Detail: `Suppressed by ${s.Reason}`,
          };
        }
        if (s.Reason === 'User Unsubscribe' || s.Reason === 'Policy') {
          return {
            Allowed: false,
            Reason: s.Reason,
            Detail: `Suppressed by ${s.Reason}`,
          };
        }
      }
    }

    return { Allowed: true };
  }

  private validateBodyObligations(
    finalPayload: MessagePayload,
    obligations: ComplianceObligations,
  ): string | undefined {
    if (obligations.RequireFooterUnsubscribe) {
      const unsubUrl = obligations.UnsubscribeURL?.trim();
      if (!unsubUrl) {
        return 'Missing required UnsubscribeURL for footer obligation';
      }
      const hasHtmlUnsub = finalPayload.HTMLBody ? finalPayload.HTMLBody.includes(unsubUrl) : false;
      const hasTextUnsub = finalPayload.Body ? finalPayload.Body.includes(unsubUrl) : false;
      if (finalPayload.HTMLBody && !hasHtmlUnsub) {
        return 'HTML body is missing required footer unsubscribe link';
      }
      if (!finalPayload.HTMLBody && !hasTextUnsub) {
        return 'Text body is missing required footer unsubscribe link';
      }
    }

    if (obligations.RequireSenderPostalAddress) {
      const postal = obligations.SenderPostalAddress?.trim();
      if (!postal) {
        return 'Missing required SenderPostalAddress for compliance footer obligation';
      }
      const hasHtmlPostal = finalPayload.HTMLBody ? finalPayload.HTMLBody.includes(postal) : false;
      const hasTextPostal = finalPayload.Body ? finalPayload.Body.includes(postal) : false;
      if (finalPayload.HTMLBody && !hasHtmlPostal) {
        return 'HTML body is missing required sender postal address';
      }
      if (!finalPayload.HTMLBody && !hasTextPostal) {
        return 'Text body is missing required sender postal address';
      }
    }

    return undefined;
  }

  private assertProtectedElementsIntact(
    finalPayload: MessagePayload,
    snapshot: ProtectedComplianceSnapshot,
  ): void {
    const headers = finalPayload.Headers ?? {};
    if (snapshot.ListUnsubscribe && headers['List-Unsubscribe'] !== snapshot.ListUnsubscribe) {
      throw new Error('Protected List-Unsubscribe header failed integrity check');
    }
    if (snapshot.ListUnsubscribePost && headers['List-Unsubscribe-Post'] !== snapshot.ListUnsubscribePost) {
      throw new Error('Protected List-Unsubscribe-Post header failed integrity check');
    }
    if (snapshot.FooterHTML && finalPayload.HTMLBody && !finalPayload.HTMLBody.includes(snapshot.FooterHTML)) {
      throw new Error('Protected compliance HTML footer failed integrity check');
    }
    if (snapshot.FooterText && !finalPayload.HTMLBody && finalPayload.Body && !finalPayload.Body.includes(snapshot.FooterText)) {
      throw new Error('Protected compliance text footer failed integrity check');
    }
  }

  private async resolveSenderCredentials(
    sender: MJCommunicationSenderEntity,
    contextUser: UserInfo,
  ): Promise<ProviderCredentialsBase | undefined> {
    if (!sender.CredentialID) {
      return undefined;
    }
    await CredentialEngine.Instance.Config(false, contextUser);
    const resolved = await CredentialEngine.Instance.GetCredential('', {
      credentialId: sender.CredentialID,
      contextUser,
      subsystem: 'Communication',
    });
    const values: ProviderCredentialsBase = { ...resolved.values };
    values.disableEnvironmentFallback = true;
    return values;
  }

  /**
   * Queries due `Pending` CommunicationLog rows (`ScheduledAt <= GETUTCDATE()`) created by
   * quiet-hours deferrals or future `Envelope.ScheduledAt`, re-evaluates compliance eligibility,
   * and dispatches each eligible message (or marks Failed / re-defers if still in quiet hours).
   */
  public async ProcessDueScheduledLogs(
    contextUser: UserInfo,
    getProvider: (name: string) => BaseCommunicationProvider,
    batchSize = 50,
  ): Promise<{ Processed: number; Sent: number; Failed: number; Redeferred: number }> {
    const bookkeepingUser = CommunicationEngineBase.Instance.ContextUser ?? contextUser;
    const rv = this.getRunView();
    const dueRes = await rv.RunView<MJCommunicationLogEntity>(
      {
        EntityName: 'MJ: Communication Logs',
        ExtraFilter: "Status='Pending' AND ScheduledAt IS NOT NULL AND ScheduledAt <= GETUTCDATE() AND Direction='Sending'",
        OrderBy: 'ScheduledAt ASC',
        MaxRows: batchSize,
        ResultType: 'entity_object',
      },
      bookkeepingUser,
    );
    if (!dueRes.Success || dueRes.Results.length === 0) {
      return { Processed: 0, Sent: 0, Failed: 0, Redeferred: 0 };
    }

    let sent = 0;
    let failed = 0;
    let redeferred = 0;

    for (const log of dueRes.Results) {
      const { payload, userCorrelationData } = parseDeferredCorrelationData(log.CorrelationData);
      if (!payload || !log.CommunicationSenderID || !log.RecipientAddress) {
        log.Status = 'Failed';
        log.ErrorMessage = 'Deferred log is missing payload, sender, or recipient address';
        await log.Save();
        failed++;
        continue;
      }

      const sender = await this.resolveSender(log.CommunicationSenderID, bookkeepingUser);
      const providerEntity = CommunicationEngineBase.Instance.Providers.find((p) =>
        UUIDsEqual(p.ID, log.CommunicationProviderID),
      );
      if (!sender || !providerEntity) {
        log.Status = 'Failed';
        log.ErrorMessage = 'Deferred log sender or provider no longer exists';
        await log.Save();
        failed++;
        continue;
      }

      const pmt = providerEntity.MessageTypes.find((m) =>
        UUIDsEqual(m.ID, log.CommunicationProviderMessageTypeID),
      ) ?? providerEntity.MessageTypes[0];
      const channelID = pmt?.CommunicationBaseMessageTypeID ?? '';
      if (!channelID) {
        log.Status = 'Failed';
        log.ErrorMessage = 'Unable to resolve channel for deferred communication log';
        await log.Save();
        failed++;
        continue;
      }

      const envelope: SendingEnvelope = {
        SenderID: sender.ID,
        ProviderID: providerEntity.ID,
        ChannelID: channelID,
        PreferenceID: log.CommunicationPreferenceID ?? undefined,
        MessageClass: (log.MessageClass as MessageClass) ?? 'Operational',
        CorrelationData: userCorrelationData,
      };
      const recipient = {
        Principal: log.EntityID && log.RecordID ? { EntityID: log.EntityID, RecordID: log.RecordID } : undefined,
        Endpoint: { Address: log.RecipientAddress },
      };

      const eligibility = await this.EvaluateEligibility(
        { Envelope: envelope, Recipients: [recipient] },
        bookkeepingUser,
      );
      if (eligibility.Blocked.length > 0 || eligibility.Sendable.length === 0) {
        const block = eligibility.Blocked[0];
        log.Status = 'Failed';
        log.ErrorMessage = block?.Detail ?? block?.Reason ?? 'Blocked during scheduled dispatch';
        await log.Save();
        failed++;
        continue;
      }

      const target = eligibility.Sendable[0];
      if (target.Decision === 'Deferred' && target.DeferUntil) {
        log.ScheduledAt = target.DeferUntil;
        await log.Save();
        redeferred++;
        continue;
      }

      const provider = getProvider(providerEntity.Name);
      const senderCredentials = await this.resolveSenderCredentials(sender, bookkeepingUser);

      const outcome = await this.dispatchSingleRecipient(
        {
          CommunicationRunID: log.CommunicationRunID ?? undefined,
          Envelope: envelope,
          Payload: payload,
          Recipients: [recipient],
        },
        sender,
        providerEntity.ID,
        pmt,
        log.CommunicationRunID ?? '',
        target,
        undefined,
        provider,
        bookkeepingUser,
        senderCredentials,
      );
      if (outcome.Status === 'Sent' || outcome.Status === 'Queued') {
        sent++;
      } else {
        failed++;
      }
    }

    return {
      Processed: dueRes.Results.length,
      Sent: sent,
      Failed: failed,
      Redeferred: redeferred,
    };
  }
}

function parseDeferredCorrelationData(raw: string | null | undefined): {
  payload?: MessagePayload;
  userCorrelationData?: Record<string, string>;
} {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return {};
    const deferred = parsed.__deferredPayload as MessagePayload | undefined;
    const userEntries = Object.entries(parsed).filter(([k, v]) => k !== '__deferredPayload' && typeof v === 'string');
    return {
      payload: deferred,
      userCorrelationData: userEntries.length > 0 ? (Object.fromEntries(userEntries) as Record<string, string>) : undefined,
    };
  } catch {
    return {};
  }
}
