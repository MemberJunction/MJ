import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  BaseCommunicationPrincipal,
  BaseCommunicationProvider,
  BaseCommunicationSender,
  BlockedRecipient,
  CommunicationEngineBase,
  ComplianceGateResult,
  ComplianceObligations,
  DeliveryGuarantee,
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
  RunChunkPosition,
  SendToPrincipalsParams,
  SendV2RecipientOutcome,
  SendV2Result,
} from '@memberjunction/communication-types';
import { AuthorizationEvaluator, LogError, Metadata, RunView, UserInfo } from '@memberjunction/core';
import type {
  MJCommunicationEndpointEntity,
  MJCommunicationLogEntity,
  MJCommunicationPreferenceEntity,
  MJCommunicationPrincipalEntity,
  MJCommunicationPrincipalPreferenceEntity,
  MJCommunicationRunChunkEntity,
  MJCommunicationRunEntity,
  MJCommunicationSenderEntity,
  MJCommunicationSenderPermissionEntity,
  MJCommunicationSendingDomainEntity,
  MJCommunicationSuppressionEntity,
} from '@memberjunction/core-entities';
import { EscapeSQLString, IndexByUUID, MJGlobal, NormalizeUUID, UUIDSet, UUIDsEqual } from '@memberjunction/global';
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

const DEFAULT_CHUNK_SIZE = 50; // recipients per queued comms.dispatch chunk when V2DispatchConfig.ChunkSize is unset
const DEFAULT_ASYNC_THRESHOLD = 100; // recipient count above which a send is queued in chunks, when V2DispatchConfig.AsyncThreshold is unset

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

/**
 * What an open-pixel signature signs in place of a click target. It is not an `http(s)` URL, so an
 * open signature can never pass as a click signature for the same tracking token.
 */
const OPEN_PIXEL_SIGNATURE_SCOPE = 'open';

/**
 * Returns the `sig` parameter of an open-pixel URL: the hex HMAC-SHA256 of
 * `trackingToken + ':open'`. With it the `/comms/open` route can tell a pixel this system issued
 * from a guessed token without reading the database.
 */
export function ComputeOpenPixelSignature(trackingToken: string, secret: string): string {
  return ComputeTrackingSignature(trackingToken, OPEN_PIXEL_SIGNATURE_SCOPE, secret);
}

/** Checks an open-pixel signature in constant time. */
export function VerifyOpenPixelSignature(
  trackingToken: string,
  signature: string,
  secret: string,
): boolean {
  return VerifyTrackingSignature(trackingToken, OPEN_PIXEL_SIGNATURE_SCOPE, signature, secret);
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
 * Longest tracked link `RewriteLinksForTracking` will produce. The target travels inside the
 * tracked link, so the tracked link is always the longer of the two. Past this length links fail
 * in practice: some mail clients cap links near 2,000 characters, proxies reject long request
 * lines, and `MJ: Communication Activities.TargetURL` holds 2,000 characters.
 */
export const MAX_TRACKED_LINK_LENGTH = 2000;

/**
 * Rewrites every absolute `http(s)` link in `<a href>` tags to
 * `<baseUrl>/comms/click/<trackingToken>?u=<target>&sig=<signature>`. Links listed in
 * `excludedUrls` (the unsubscribe and preference-center links) are left as they are, and so is a
 * link whose tracked form would be longer than `MAX_TRACKED_LINK_LENGTH`: it still works for the
 * recipient, but its clicks are not recorded.
 */
export function RewriteLinksForTracking(
  html: string,
  trackingToken: string,
  secret: string,
  baseUrl: string = '',
  excludedUrls: ReadonlyArray<string> = [],
): string {
  const excluded = new Set(excludedUrls.filter(Boolean));
  const lower = html.toLowerCase();
  const out: string[] = [];
  let pos = 0;

  while (pos < html.length) {
    const idx = lower.indexOf('<a', pos);
    if (idx === -1) {
      out.push(html.slice(pos));
      break;
    }

    const afterTag = lower[idx + 2];
    if (afterTag !== undefined && !/\s|>/.test(afterTag)) {
      out.push(html.slice(pos, idx + 2));
      pos = idx + 2;
      continue;
    }

    const closeIdx = html.indexOf('>', idx + 2);
    if (closeIdx === -1) {
      out.push(html.slice(pos));
      break;
    }

    out.push(html.slice(pos, idx));
    const attrs = html.slice(idx + 2, closeIdx);
    const updatedAttrs = attrs.replace(
      /\bhref\s*=\s*(["'])(https?:\/\/[^"']+)\1/i,
      (hrefMatch: string, quote: string, url: string) => {
        const decodedUrl = url.replace(/&amp;/gi, '&');
        if (excluded.has(decodedUrl) || excluded.has(url)) {
          return hrefMatch;
        }
        const sig = ComputeTrackingSignature(trackingToken, decodedUrl, secret);
        const tracked = `${buildCommsRouteUrl(baseUrl, `/click/${trackingToken}`)}?u=${encodeURIComponent(decodedUrl)}&sig=${sig}`;
        if (tracked.length > MAX_TRACKED_LINK_LENGTH) {
          return hrefMatch;
        }
        return `href=${quote}${tracked}${quote}`;
      },
    );
    out.push(`<a${updatedAttrs}>`);
    pos = closeIdx + 1;
  }

  return out.join('');
}

/**
 * Adds the 1x1 open-tracking image (`<baseUrl>/comms/open/<trackingToken>.gif?sig=<signature>`)
 * before `</body>`, or at the end when there is no body tag. The signature is left off when no
 * `secret` is given; the route then has to look the token up before it records the open.
 */
export function InjectOpenPixel(
  html: string,
  trackingToken: string,
  baseUrl: string = '',
  secret: string = '',
): string {
  const signature = secret ? `?sig=${ComputeOpenPixelSignature(trackingToken, secret)}` : '';
  const pixel = `<img src="${buildCommsRouteUrl(baseUrl, `/open/${trackingToken}.gif`)}${signature}" width="1" height="1" alt="" style="display:none;" />`;
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
    const endpointIdSet = new UUIDSet(endpointIds);
    const adHocEndpointMap = await this.batchLoadAdHocEndpoints(params.Recipients, params.Envelope.ChannelID, contextUser);
    for (const ep of adHocEndpointMap.values()) {
      if (!endpointIdSet.Has(ep.ID)) {
        endpointIdSet.Add(ep.ID);
        endpointIds.push(ep.ID);
      }
    }
    const suppressions = await this.loadSuppressions(endpointIds, principalRefs, contextUser);
    const prefMap = preference
      ? await this.loadPrincipalPreferences(principalRefs, preference.ID, senderChain, contextUser)
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
    let result: SendV2Result | undefined;
    let thrown: unknown;
    try {
      result = await this.sendUnrecorded(params, contextUser, getProvider);
      return result;
    } catch (err) {
      thrown = err;
      throw err;
    } finally {
      // Every exit of a positioned chunk counts toward its run: early pre-send refusals and thrown
      // errors included, or one refused chunk would hold the run open forever. Recorded here and
      // only here; a redelivered chunk updates its existing row instead of adding one.
      if (params.CommunicationRunID && params.RunChunk) {
        await this.RecordRunChunkDone(
          params.CommunicationRunID,
          params.RunChunk,
          DescribeChunkOutcome(params.Recipients.length, result, thrown),
          CommunicationEngineBase.Instance.ContextUser ?? contextUser,
        );
      }
    }
  }

  private async sendUnrecorded(
    params: SendToPrincipalsParams,
    contextUser: UserInfo,
    getProvider: (name: string) => BaseCommunicationProvider,
  ): Promise<SendV2Result> {
    let sender: MJCommunicationSenderEntity | undefined;
    try {
      sender = await this.resolveSender(params.Envelope.SenderID, contextUser);
    } catch (err) {
      return {
        Success: false,
        IsAsyncRun: false,
        TotalCount: params.Recipients.length,
        QueuedCount: 0,
        BlockedCount: params.Recipients.length,
        DeferredCount: 0,
        ErrorMessage: err instanceof Error ? err.message : String(err),
      };
    }
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

    let senderPermCheck: { Allowed: boolean; ErrorMessage?: string };
    try {
      senderPermCheck = await this.checkSenderPermission(sender, contextUser);
    } catch (err) {
      return {
        Success: false,
        IsAsyncRun: false,
        TotalCount: params.Recipients.length,
        QueuedCount: 0,
        BlockedCount: params.Recipients.length,
        DeferredCount: 0,
        ErrorMessage: err instanceof Error ? err.message : String(err),
      };
    }
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

    if (params.Envelope.MessageClass === 'Transactional') {
      const authCheck = this.checkTransactionalAuthorization(contextUser);
      if (!authCheck.Allowed) {
        return {
          Success: false,
          IsAsyncRun: false,
          TotalCount: params.Recipients.length,
          QueuedCount: 0,
          BlockedCount: params.Recipients.length,
          DeferredCount: 0,
          ErrorMessage: authCheck.ErrorMessage,
        };
      }
    }

    const providerPick = this.selectProvider(params.Envelope, sender);
    if (!providerPick.Provider) {
      return {
        Success: false,
        IsAsyncRun: false,
        TotalCount: params.Recipients.length,
        QueuedCount: 0,
        BlockedCount: params.Recipients.length,
        DeferredCount: 0,
        ErrorMessage: providerPick.ErrorMessage,
      };
    }
    const providerEntity = providerPick.Provider;

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
      const chunkCount = Math.ceil(params.Recipients.length / chunkSize);
      const prepared = await this.prepareChunkedRun(run, chunkCount, params.Envelope.DeliveryGuarantee);
      if (!prepared.Success) {
        return {
          Success: false,
          CommunicationRunID: run.ID,
          IsAsyncRun: false,
          TotalCount: params.Recipients.length,
          QueuedCount: 0,
          BlockedCount: 0,
          DeferredCount: 0,
          ErrorMessage: prepared.ErrorMessage,
        };
      }
      for (let i = 0; i < params.Recipients.length; i += chunkSize) {
        const chunk = params.Recipients.slice(i, i + chunkSize);
        // ActingUserID makes the worker run the chunk as the caller, not as its own system user,
        // so principal lookups and permission checks keep the caller's row-level security.
        await this.config.EnqueueWork('comms.dispatch', {
          CommunicationRunID: run.ID,
          Envelope: params.Envelope,
          Payload: params.Payload,
          Recipients: chunk,
          ActingUserID: contextUser.ID,
          RunChunk: { Index: i / chunkSize, Count: chunkCount },
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

  /**
   * Picks the provider for a send: the envelope's, else the sender's. With neither named, only an
   * unambiguous choice is accepted: exactly one active, sending provider that supports the channel.
   * Picking one of several would route mail through an account nobody chose.
   */
  private selectProvider(
    envelope: SendToPrincipalsParams['Envelope'],
    sender: MJCommunicationSenderEntity,
  ): { Provider?: CommunicationEngineBase['Providers'][number]; ErrorMessage?: string } {
    const providers = CommunicationEngineBase.Instance.Providers;
    const providerId = envelope.ProviderID ?? sender.CommunicationProviderID;
    if (providerId) {
      const named = providers.find((p) => UUIDsEqual(p.ID, providerId));
      return named ? { Provider: named } : { ErrorMessage: 'Communication provider not found' };
    }
    const channelKey = NormalizeUUID(envelope.ChannelID);
    const candidates = providers.filter(
      (p) =>
        p.Status === 'Active' &&
        p.SupportsSending &&
        p.MessageTypes.some((m) => NormalizeUUID(m.CommunicationBaseMessageTypeID) === channelKey),
    );
    if (candidates.length === 1) {
      return { Provider: candidates[0] };
    }
    return {
      ErrorMessage:
        candidates.length === 0
          ? 'Communication provider not found: no active sending provider supports this channel'
          : `Ambiguous communication provider: ${candidates.length} active providers support this channel; set Envelope.ProviderID or the sender's CommunicationProviderID`,
    };
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
    let dryRunCount = 0;
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
    // Only this chunk's endpoints: a run can hold every log of a 100k-recipient send.
    const existingLogsByEndpoint = params.CommunicationRunID
      ? await this.batchLoadRunLogs(
          run.ID,
          eligibility.Sendable.map((s) => s.Endpoint.CommunicationEndpointID),
          CommunicationEngineBase.Instance.ContextUser ?? contextUser,
        )
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
      } else if (outcome.Status === 'DryRun') {
        dryRunCount++;
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
        const claim = claims[j];
        if (!claim.Log) {
          outcomes.push({
            Principal: batch[j].target.Principal,
            Endpoint: batch[j].target.Endpoint,
            Status: 'Failed',
            Reason: claim.FailureReason ?? 'LogCreationFailed',
            Detail: claim.FailureDetail,
          });
          continue;
        }
        deferredCount++;
        outcomes.push({
          Principal: batch[j].target.Principal,
          Endpoint: batch[j].target.Endpoint,
          CommunicationLogID: claim.Log.ID,
          Status: 'Deferred',
          DeferUntil: batch[j].deferUntil,
        });
      }
    }

    // A run passed in belongs to the caller (a comms.dispatch chunk, a templated batch); ending it
    // here would mark it finished while other chunks are still queued or sending. A positioned
    // chunk is recorded by Send()'s finally, and the last one to finish ends the run.
    if (!params.CommunicationRunID && !(await CommunicationEngineBase.Instance.EndRun(run))) {
      LogError(`V2SendService: failed to finalize CommunicationRun ${run.ID}`);
    }
    return {
      Success: true,
      CommunicationRunID: run.ID,
      IsAsyncRun: false,
      TotalCount: params.Recipients.length,
      QueuedCount: queuedCount,
      BlockedCount: eligibility.Blocked.length,
      DeferredCount: deferredCount,
      DryRunCount: dryRunCount,
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
    preclaimedLog?: MJCommunicationLogEntity,
  ): Promise<SendV2RecipientOutcome> {
    const claim = preclaimedLog
      ? { Log: preclaimedLog }
      : await this.claimOrCreateV2Log(
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

    try {
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
      const isDryRun = Boolean(params.Envelope.DryRun) && sendRes.Success;
      log.Status = sendRes.Success ? 'Complete' : 'Failed';
      log.ProviderMessageID = sendRes.ProviderMessageID ?? log.ProviderMessageID;
      log.ErrorMessage = sendRes.Error || null;
      log.IsDryRun = isDryRun;
      const saveErr = await this.saveLogAfterSend(log);
      if (saveErr) {
        // The provider has the message; the log does not say so. The log stays In-Progress, and a
        // retry reports it OutcomeUnknown instead of sending again (at most once).
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
        Status: isDryRun ? 'DryRun' : sendRes.Success ? 'Sent' : 'Failed',
        Detail: sendRes.Error || undefined,
      };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      log.Status = 'Failed';
      log.ErrorMessage = detail;
      if (!(await log.Save())) {
        LogError(`V2SendService: failed to save Failed CommunicationLog ${log.ID}: ${log.LatestResult?.CompleteMessage ?? 'unknown error'}`);
      }
      return {
        Principal: target.Principal,
        Endpoint: target.Endpoint,
        CommunicationLogID: log.ID,
        Status: 'Failed',
        Reason: 'DispatchException',
        Detail: detail,
      };
    }
  }

  /**
   * Saves a log after the provider call, retrying a bounded number of times: the message has
   * already left, so losing this write is what turns a retry into a duplicate. Returns the last
   * error, or `undefined` on success.
   */
  private async saveLogAfterSend(log: MJCommunicationLogEntity): Promise<string | undefined> {
    let lastError = 'unknown error';
    for (let attempt = 1; attempt <= MAX_POST_SEND_SAVE_ATTEMPTS; attempt++) {
      if (await log.Save()) {
        return undefined;
      }
      lastError = log.LatestResult?.CompleteMessage ?? 'unknown error';
      LogError(
        `V2SendService: failed to update CommunicationLog ${log.ID} after send (attempt ${attempt}/${MAX_POST_SEND_SAVE_ATTEMPTS}): ${lastError}`,
      );
    }
    return lastError;
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
      html = InjectOpenPixel(html, trackingToken, baseUrl, hmacSecret);
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
    if (!res.Success) {
      throw new Error(
        `Failed loading communication sender '${senderID ?? 'default'}': ${res.ErrorMessage ?? 'RunView failed'}`,
      );
    }
    const found = res.Results.length > 0 ? res.Results[0] : undefined;
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

  /**
   * Loads each principal's choice for a preference across the whole sender chain (the sender, its
   * ancestors, and sender-less rows), the same reach suppressions have. See
   * {@link PickEffectivePrincipalPreference} for which row wins.
   */
  private async loadPrincipalPreferences(
    principals: PrincipalRecordRef[],
    preferenceID: string,
    senderChain: MJCommunicationSenderEntity[],
    contextUser: UserInfo,
  ): Promise<Map<string, MJCommunicationPrincipalPreferenceEntity>> {
    const out = new Map<string, MJCommunicationPrincipalPreferenceEntity>();
    if (principals.length === 0) return out;

    const quoted = principals.map((p) => `'${EscapeSQLString(p.RecordID)}'`).join(',');
    const senderIds = senderChain.map((s) => `'${EscapeSQLString(s.ID)}'`).join(',');
    const rv = this.getRunView();
    const res = await rv.RunView<MJCommunicationPrincipalPreferenceEntity>(
      {
        EntityName: 'MJ: Communication Principal Preferences',
        ExtraFilter: `CommunicationPreferenceID='${EscapeSQLString(preferenceID)}' AND RecordID IN (${quoted}) AND (CommunicationSenderID IN (${senderIds}) OR CommunicationSenderID IS NULL)`,
        ResultType: 'entity_object',
      },
      contextUser,
    );
    if (!res.Success) {
      throw new Error(`Failed loading communication principal preferences: ${res.ErrorMessage ?? 'RunView failed'}`);
    }
    const byPrincipal = new Map<string, MJCommunicationPrincipalPreferenceEntity[]>();
    for (const pp of res.Results) {
      const key = `${pp.EntityID.toLowerCase()}:${pp.RecordID}`;
      byPrincipal.set(key, [...(byPrincipal.get(key) ?? []), pp]);
    }
    const chainIds = senderChain.map((s) => s.ID);
    for (const [key, rows] of byPrincipal) {
      const winner = PickEffectivePrincipalPreference(rows, chainIds);
      if (winner) out.set(key, winner);
    }
    return out;
  }

  private checkTransactionalAuthorization(
    contextUser: UserInfo,
  ): { Allowed: boolean; ErrorMessage?: string } {
    if (contextUser.Type === 'Owner') {
      return { Allowed: true };
    }
    const authorizations = CommunicationEngineBase.Instance.ProviderToUse?.Authorizations ?? [];
    const targetAuth =
      authorizations.find((a) => a.Name?.trim().toLowerCase() === 'communications: send transactional') ??
      authorizations.find((a) => a.Name?.trim().toLowerCase() === 'communications: admin');
    if (targetAuth && new AuthorizationEvaluator().UserCanExecuteWithAncestors(targetAuth, contextUser, authorizations)) {
      return { Allowed: true };
    }
    return {
      Allowed: false,
      ErrorMessage: 'Owner privileges or "Communications: Send Transactional" authorization required for Transactional sends',
    };
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

  /**
   * Loads the run's existing logs for these endpoints only (one read per 200 endpoints, so a
   * normal chunk is one read). Returns `undefined` when a read fails; callers then look each log
   * up individually.
   */
  private async batchLoadRunLogs(
    runID: string,
    endpointIds: string[],
    contextUser: UserInfo,
  ): Promise<Map<string, MJCommunicationLogEntity> | undefined> {
    const map = new Map<string, MJCommunicationLogEntity>();
    const unique = [...new UUIDSet(endpointIds)];
    const rv = this.getRunView();
    for (let i = 0; i < unique.length; i += RUN_LOG_ENDPOINT_CHUNK) {
      const quoted = unique.slice(i, i + RUN_LOG_ENDPOINT_CHUNK).map((id) => `'${EscapeSQLString(id)}'`).join(',');
      const res = await rv.RunView<MJCommunicationLogEntity>(
        {
          EntityName: 'MJ: Communication Logs',
          ExtraFilter: `CommunicationRunID='${EscapeSQLString(runID)}' AND CommunicationEndpointID IN (${quoted})`,
          ResultType: 'entity_object',
        },
        contextUser,
      );
      if (!res.Success) {
        return undefined;
      }
      for (const log of res.Results) {
        if (log.CommunicationEndpointID) {
          map.set(log.CommunicationEndpointID.toLowerCase(), log);
        }
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
      let reclaimStale = false;
      if (existing.Status === 'In-Progress') {
        if (!IsStaleInProgressLog(existing)) {
          return {
            FailureReason: 'LogAlreadyInProgress',
            FailureDetail: `CommunicationLog ${existing.ID} is already In-Progress without a ProviderMessageID`,
          };
        }
        const guarantee = await this.ResolveDeliveryGuarantee(params.Envelope, runID, sender, providerID, contextUser);
        if (guarantee !== 'At Least Once') {
          return {
            FailureReason: 'OutcomeUnknown',
            FailureDetail: `CommunicationLog ${existing.ID} has been In-Progress for over ${STALE_IN_PROGRESS_MINUTES} minutes without a ProviderMessageID. The provider may already have the message, and the delivery guarantee is ${guarantee}, so it was not resent.`,
          };
        }
        reclaimStale = true;
      }
      const claimed = await this.tryAtomicClaimLog(existing.ID, contextUser, reclaimStale);
      if (claimed.Result === 'claimed') {
        existing.Status = 'In-Progress';
        return { Log: existing };
      }
      if (claimed.Result === 'already-claimed') {
        return {
          FailureReason: 'LogAlreadyInProgress',
          FailureDetail: `CommunicationLog ${existing.ID} was claimed concurrently`,
        };
      }
      LogError(`V2SendService: could not claim CommunicationLog ${existing.ID}: ${claimed.Detail}`);
      return { FailureReason: 'LogClaimFailed', FailureDetail: claimed.Detail };
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
    log.IsDryRun = Boolean(params.Envelope.DryRun);
    log.DeferredPayload = initialStatus === 'Pending' && deferredPayload ? JSON.stringify(deferredPayload) : null;
    log.CorrelationData = params.Envelope.CorrelationData ? JSON.stringify(params.Envelope.CorrelationData) : null;
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

  /**
   * Records that one chunk of a run has finished, as a `MJ: Communication Run Chunks` row, and ends
   * the run when every chunk is recorded.
   *
   * - A redelivered chunk finds its existing row (unique on run and chunk index) and is not counted
   *   twice. A chunk that was refused (`Failed`) and later succeeds on a retry has its row updated.
   * - When the run's `ChunkCount` chunks are recorded, the run's `Status` becomes `Complete`, or
   *   `Failed` if any chunk was refused, and `EndedAt` is set. Two chunks finishing together may
   *   both write that same final state, which is harmless.
   * - Logs cannot be counted instead: blocked recipients write none, and recipients sharing an
   *   address share one.
   *
   * Failures are logged and leave the run open; they never fail the chunk's send.
   *
   * @returns `true` when this call ended the run.
   */
  public async RecordRunChunkDone(
    runID: string,
    chunk: RunChunkPosition,
    outcome: RunChunkOutcome,
    contextUser: UserInfo,
  ): Promise<boolean> {
    try {
      const recorded = await this.upsertRunChunk(runID, chunk, outcome, contextUser);
      if (!recorded) return false;
      return await this.endRunIfAllChunksRecorded(runID, chunk.Count, contextUser);
    } catch (err) {
      LogError(`V2SendService: failed recording chunk ${chunk.Index} of run ${runID}: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  /** Creates or updates the chunk's row. Returns false (already logged) when it could not be saved. */
  private async upsertRunChunk(
    runID: string,
    chunk: RunChunkPosition,
    outcome: RunChunkOutcome,
    contextUser: UserInfo,
  ): Promise<boolean> {
    const existing = await this.loadRunChunk(runID, chunk.Index, contextUser);
    if (existing) {
      if (existing.Status === 'Complete' || outcome.Status === 'Failed') return true;
      return this.saveRunChunk(existing, outcome, runID, chunk);
    }
    const md = CommunicationEngineBase.Instance.ProviderToUse;
    const row = await md.GetEntityObject<MJCommunicationRunChunkEntity>('MJ: Communication Run Chunks', contextUser);
    row.CommunicationRunID = runID;
    row.ChunkIndex = chunk.Index;
    if (await this.saveRunChunk(row, outcome, runID, chunk)) return true;
    // Lost a race with a concurrent redelivery of the same chunk: its row now exists.
    return (await this.loadRunChunk(runID, chunk.Index, contextUser)) !== undefined;
  }

  private async saveRunChunk(
    row: MJCommunicationRunChunkEntity,
    outcome: RunChunkOutcome,
    runID: string,
    chunk: RunChunkPosition,
  ): Promise<boolean> {
    row.Status = outcome.Status;
    row.RecipientCount = outcome.RecipientCount;
    row.ErrorMessage = outcome.ErrorMessage ?? null;
    row.CompletedAt = new Date();
    if (await row.Save()) return true;
    LogError(`V2SendService: failed saving chunk ${chunk.Index} of run ${runID}: ${row.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    return false;
  }

  private async loadRunChunk(
    runID: string,
    chunkIndex: number,
    contextUser: UserInfo,
  ): Promise<MJCommunicationRunChunkEntity | undefined> {
    const res = await this.getRunView().RunView<MJCommunicationRunChunkEntity>(
      {
        EntityName: 'MJ: Communication Run Chunks',
        ExtraFilter: `CommunicationRunID='${EscapeSQLString(runID)}' AND ChunkIndex=${Math.trunc(chunkIndex)}`,
        MaxRows: 1,
        ResultType: 'entity_object',
        BypassCache: true,
      },
      contextUser,
    );
    if (!res.Success) throw new Error(res.ErrorMessage || 'Failed loading the communication run chunk');
    return res.Results[0];
  }

  /** Ends the run when every chunk is recorded. Returns true when this call changed the run. */
  private async endRunIfAllChunksRecorded(runID: string, chunkCount: number, contextUser: UserInfo): Promise<boolean> {
    const rv = this.getRunView();
    const [runRes, chunksRes] = await rv.RunViews(
      [
        {
          EntityName: 'MJ: Communication Runs',
          ExtraFilter: `ID='${EscapeSQLString(runID)}'`,
          MaxRows: 1,
          ResultType: 'entity_object',
          BypassCache: true,
        },
        {
          EntityName: 'MJ: Communication Run Chunks',
          ExtraFilter: `CommunicationRunID='${EscapeSQLString(runID)}'`,
          Fields: ['ID', 'Status'],
          ResultType: 'simple',
          IgnoreMaxRows: true,
          BypassCache: true,
        },
      ],
      contextUser,
    );
    if (!runRes.Success || !chunksRes.Success) {
      throw new Error(runRes.ErrorMessage || chunksRes.ErrorMessage || 'Failed loading run progress');
    }
    const run = runRes.Results[0] as MJCommunicationRunEntity | undefined;
    if (!run) throw new Error('run not found');
    const chunks = chunksRes.Results as Array<{ ID: string; Status: MJCommunicationRunChunkEntity['Status'] }>;
    const expected = run.ChunkCount ?? chunkCount;
    if (chunks.length < expected) return false;
    const finalStatus: MJCommunicationRunEntity['Status'] = chunks.some((c) => c.Status === 'Failed') ? 'Failed' : 'Complete';
    if (run.Status === finalStatus && run.EndedAt) return false;
    run.Status = finalStatus;
    run.EndedAt = run.EndedAt ?? new Date();
    if (run.ChunkCount == null) run.ChunkCount = expected;
    if (await run.Save()) return true;
    throw new Error(run.LatestResult?.CompleteMessage || 'Failed ending the communication run');
  }

  /**
   * Stores the chunk count (and the envelope's delivery guarantee, when it sets one) on a run before
   * its chunks are queued, so the last chunk knows when the run is finished.
   */
  private async prepareChunkedRun(
    run: MJCommunicationRunEntity,
    chunkCount: number,
    deliveryGuarantee: DeliveryGuarantee | undefined,
  ): Promise<{ Success: boolean; ErrorMessage?: string }> {
    run.ChunkCount = chunkCount;
    if (deliveryGuarantee) run.DeliveryGuarantee = deliveryGuarantee;
    if (await run.Save()) return { Success: true };
    return {
      Success: false,
      ErrorMessage: `Failed to record the chunk count on communication run ${run.ID}: ${run.LatestResult?.CompleteMessage ?? 'unknown error'}`,
    };
  }

  /**
   * Resolves the delivery guarantee for a send: the envelope's, then the run's, then the sender's
   * and its ancestors' (nearest first), then the provider's, then {@link DEFAULT_DELIVERY_GUARANTEE}.
   * A lookup that fails resolves to At Most Once, the setting that never sends twice.
   */
  public async ResolveDeliveryGuarantee(
    envelope: SendingEnvelope,
    runID: string | undefined,
    sender: MJCommunicationSenderEntity,
    providerID: string,
    contextUser: UserInfo,
  ): Promise<DeliveryGuarantee> {
    if (envelope.DeliveryGuarantee) return envelope.DeliveryGuarantee;
    try {
      const runGuarantee = runID ? await this.loadRunDeliveryGuarantee(runID, contextUser) : null;
      const chain = await this.loadSenderAncestry(sender, contextUser);
      const provider = CommunicationEngineBase.Instance.Providers.find((p) => UUIDsEqual(p.ID, providerID));
      return PickDeliveryGuarantee([runGuarantee, ...chain.map((c) => c.DeliveryGuarantee), provider?.DeliveryGuarantee]);
    } catch (err) {
      LogError(`V2SendService: could not resolve the delivery guarantee; using At Most Once: ${err instanceof Error ? err.message : String(err)}`);
      return 'At Most Once';
    }
  }

  private async loadRunDeliveryGuarantee(runID: string, contextUser: UserInfo): Promise<DeliveryGuarantee | null> {
    const res = await this.getRunView().RunView<{ ID: string; DeliveryGuarantee: DeliveryGuarantee | null }>(
      {
        EntityName: 'MJ: Communication Runs',
        ExtraFilter: `ID='${EscapeSQLString(runID)}'`,
        Fields: ['ID', 'DeliveryGuarantee'],
        MaxRows: 1,
        ResultType: 'simple',
      },
      contextUser,
    );
    if (!res.Success) throw new Error(res.ErrorMessage || 'Failed loading the communication run');
    return res.Results[0]?.DeliveryGuarantee ?? null;
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

    const supRes = await this.loadV1Suppressions(epRes.Results.map((e) => e.ID), contextUser);
    if (!supRes.Suppressions) {
      return { Allowed: false, Reason: 'GateLookupFailed', Detail: supRes.ErrorMessage };
    }
    return this.evaluateV1Suppressions(supRes.Suppressions, messageClass);
  }

  /**
   * Active suppressions that reach these endpoints: those on the endpoint itself, and those on any
   * principal that has used it (through `MJ: Communication Endpoint Principals`), so a principal
   * that unsubscribed is not mailed at an address recorded under it. Fails closed on any read error.
   */
  private async loadV1Suppressions(
    endpointIds: string[],
    contextUser: UserInfo,
  ): Promise<{ Suppressions?: MJCommunicationSuppressionEntity[]; ErrorMessage?: string }> {
    const rv = this.getRunView();
    const epList = endpointIds.map((id) => `'${EscapeSQLString(id)}'`).join(',');
    const linkRes = await rv.RunView<{ ID: string; EntityID: string; RecordID: string }>(
      {
        EntityName: 'MJ: Communication Endpoint Principals',
        ExtraFilter: `CommunicationEndpointID IN (${epList})`,
        Fields: ['ID', 'EntityID', 'RecordID'],
        ResultType: 'simple',
      },
      contextUser,
    );
    if (!linkRes.Success) {
      return { ErrorMessage: linkRes.ErrorMessage ?? 'Failed to query communication endpoint principals' };
    }
    const clauses = [`CommunicationEndpointID IN (${epList})`];
    for (const link of linkRes.Results) {
      clauses.push(`(EntityID='${EscapeSQLString(link.EntityID)}' AND RecordID='${EscapeSQLString(link.RecordID)}')`);
    }
    const supRes = await rv.RunView<MJCommunicationSuppressionEntity>(
      {
        EntityName: 'MJ: Communication Suppressions',
        ExtraFilter: `Status='Active' AND (${clauses.join(' OR ')})`,
        ResultType: 'entity_object',
      },
      contextUser,
    );
    if (!supRes.Success) {
      return { ErrorMessage: supRes.ErrorMessage ?? 'Failed to query communication suppressions' };
    }
    return { Suppressions: supRes.Results };
  }

  private evaluateV1Suppressions(
    suppressions: MJCommunicationSuppressionEntity[],
    messageClass: MessageClass,
  ): { Allowed: boolean; Reason?: string; Detail?: string } {
    const nowMs = Date.now();
    for (const s of suppressions) {
      if (s.ExpiresAt && s.ExpiresAt.getTime() <= nowMs) continue;
      const alwaysBlocks = s.Reason === 'Hard Bounce' || s.Reason === 'Invalid Address';
      if (alwaysBlocks || messageClass !== 'Transactional') {
        return { Allowed: false, Reason: s.Reason, Detail: `Suppressed by ${s.Reason}` };
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
    const claimedLogs = await this.claimDueDeferredLogs(batchSize, bookkeepingUser);
    if (claimedLogs.length === 0) {
      return { Processed: 0, Sent: 0, Failed: 0, Redeferred: 0 };
    }

    let sent = 0;
    let failed = 0;
    let redeferred = 0;
    const providersById = IndexByUUID(CommunicationEngineBase.Instance.Providers, (p) => p.ID);
    const pmtsById = IndexByUUID(
      CommunicationEngineBase.Instance.Providers.flatMap((p) => p.MessageTypes),
      (m) => m.ID,
    );

    const saveLogChecked = async (log: MJCommunicationLogEntity, context: string): Promise<void> => {
      if (!(await log.Save())) {
        LogError(`V2SendService.ProcessDueScheduledLogs (${context}) failed to save log ${log.ID}: ${log.LatestResult?.CompleteMessage ?? 'unknown error'}`);
      }
    };

    for (const log of claimedLogs) {
      try {
        const payload = parseDeferredPayload(log.DeferredPayload);
        const dryRun = log.IsDryRun;
        const correlationData = parseCorrelationData(log.CorrelationData);
        if (!payload || !log.CommunicationSenderID || !log.RecipientAddress) {
          log.Status = 'Failed';
          log.ErrorMessage = 'Deferred log is missing payload, sender, or recipient address';
          log.DeferredPayload = null;
          await saveLogChecked(log, 'invalid-payload');
          failed++;
          continue;
        }

        const sender = await this.resolveSender(log.CommunicationSenderID, bookkeepingUser);
        const providerEntity = log.CommunicationProviderID
          ? providersById.Get(log.CommunicationProviderID)
          : undefined;
        if (!sender || !providerEntity) {
          log.Status = 'Failed';
          log.ErrorMessage = 'Deferred log sender or provider no longer exists';
          log.DeferredPayload = null;
          await saveLogChecked(log, 'missing-sender-or-provider');
          failed++;
          continue;
        }

        const pmt = (log.CommunicationProviderMessageTypeID
          ? pmtsById.Get(log.CommunicationProviderMessageTypeID)
          : undefined) ?? providerEntity.MessageTypes[0];
        const channelID = pmt?.CommunicationBaseMessageTypeID ?? '';
        if (!channelID) {
          log.Status = 'Failed';
          log.ErrorMessage = 'Unable to resolve channel for deferred communication log';
          log.DeferredPayload = null;
          await saveLogChecked(log, 'missing-channel');
          failed++;
          continue;
        }

        const envelope: SendingEnvelope = {
          SenderID: sender.ID,
          ProviderID: providerEntity.ID,
          ChannelID: channelID,
          PreferenceID: log.CommunicationPreferenceID ?? undefined,
          MessageClass: (log.MessageClass as MessageClass) ?? 'Operational',
          DryRun: dryRun || undefined,
          CorrelationData: correlationData,
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
          log.DeferredPayload = null;
          await saveLogChecked(log, 'eligibility-blocked');
          failed++;
          continue;
        }

        const target = eligibility.Sendable[0];
        if (target.Decision === 'Deferred' && target.DeferUntil) {
          log.Status = 'Pending';
          log.ScheduledAt = target.DeferUntil;
          await saveLogChecked(log, 'redefer');
          redeferred++;
          continue;
        }

        const provider = getProvider(providerEntity.Name);
        const senderCredentials = await this.resolveSenderCredentials(sender, bookkeepingUser);

        // Clear the stored body before dispatch so the rendered message is not kept on the log.
        log.DeferredPayload = null;

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
          undefined,
          log,
        );
        if (outcome.Status === 'Sent' || outcome.Status === 'Queued') {
          sent++;
        } else if (outcome.Status !== 'DryRun') {
          failed++;
        }
      } catch (err) {
        log.Status = 'Failed';
        log.ErrorMessage = err instanceof Error ? err.message : String(err);
        await saveLogChecked(log, 'unexpected-error');
        failed++;
      }
    }

    return {
      Processed: claimedLogs.length,
      Sent: sent,
      Failed: failed,
      Redeferred: redeferred,
    };
  }

  /**
   * Claims a Pending or Failed log for sending with one conditional UPDATE, so two workers cannot
   * both win. With `reclaimStale` (delivery guarantee At Least Once) it may also take over a log
   * stuck In-Progress, with no ProviderMessageID, for longer than {@link STALE_IN_PROGRESS_MINUTES}.
   * There is no fallback: without `ExecuteSQL` a claim would be read-then-write, which cannot
   * exclude a concurrent sender, so the claim fails and nothing is sent.
   */
  private async tryAtomicClaimLog(
    logId: string,
    contextUser: UserInfo,
    reclaimStale = false,
  ): Promise<{ Result: 'claimed' | 'already-claimed' | 'failed'; Detail?: string }> {
    const provider = CommunicationEngineBase.Instance.ProviderToUse;
    if (!isSqlCapableProvider(provider)) {
      return { Result: 'failed', Detail: 'Atomic log claim needs a provider with ExecuteSQL; refusing a non-atomic claim' };
    }
    const schema = provider.MJCoreSchemaName ?? '__mj';
    try {
      const rows = await provider.ExecuteSQL<{ ID: string }>(
        // OUTPUT goes INTO a table variable: CommunicationLog has CodeGen's update trigger, and
        // SQL Server refuses a bare OUTPUT clause on a table with an enabled trigger.
        `DECLARE @Claimed TABLE (ID UNIQUEIDENTIFIER);
         UPDATE [${schema}].[CommunicationLog]
         SET Status = 'In-Progress', __mj_UpdatedAt = GETUTCDATE()
         OUTPUT INSERTED.ID INTO @Claimed
         WHERE ID = @p0
           AND (Status IN ('Pending', 'Failed')
                OR (@p1 = 1 AND Status = 'In-Progress' AND ProviderMessageID IS NULL
                    AND __mj_UpdatedAt < DATEADD(MINUTE, -@p2, GETUTCDATE())));
         SELECT ID FROM @Claimed;`,
        [logId, reclaimStale ? 1 : 0, STALE_IN_PROGRESS_MINUTES],
        { isMutation: true, description: 'V2SendService.tryAtomicClaimLog' },
        contextUser,
      );
      return { Result: rows.length > 0 ? 'claimed' : 'already-claimed' };
    } catch (err) {
      return { Result: 'failed', Detail: err instanceof Error ? err.message : String(err) };
    }
  }

  private async claimDueDeferredLogs(
    batchSize: number,
    bookkeepingUser: UserInfo,
  ): Promise<MJCommunicationLogEntity[]> {
    const provider = CommunicationEngineBase.Instance.ProviderToUse;
    const rv = this.getRunView();
    if (isSqlCapableProvider(provider)) {
      const schema = provider.MJCoreSchemaName ?? '__mj';
      const claimedIds = await provider.ExecuteSQL<{ ID: string }>(
        // OUTPUT INTO a table variable for the same trigger reason as tryAtomicClaimLog.
        `DECLARE @Claimed TABLE (ID UNIQUEIDENTIFIER);
         WITH Due AS (
           SELECT TOP (@p0) ID
           FROM [${schema}].[CommunicationLog]
           WHERE Status = 'Pending' AND ScheduledAt IS NOT NULL AND ScheduledAt <= GETUTCDATE() AND Direction = 'Sending'
           ORDER BY ScheduledAt ASC
         )
         UPDATE target
         SET Status = 'In-Progress', __mj_UpdatedAt = GETUTCDATE()
         OUTPUT INSERTED.ID INTO @Claimed
         FROM [${schema}].[CommunicationLog] target
         INNER JOIN Due ON target.ID = Due.ID;
         SELECT ID FROM @Claimed;`,
        [batchSize],
        { isMutation: true, description: 'V2SendService.claimDueDeferredLogs' },
        bookkeepingUser,
      );
      if (claimedIds.length === 0) {
        return [];
      }
      const idList = claimedIds.map((r) => `'${EscapeSQLString(r.ID)}'`).join(',');
      const loadedRes = await rv.RunView<MJCommunicationLogEntity>(
        {
          EntityName: 'MJ: Communication Logs',
          ExtraFilter: `ID IN (${idList})`,
          OrderBy: 'ScheduledAt ASC',
          ResultType: 'entity_object',
        },
        bookkeepingUser,
      );
      if (!loadedRes.Success) {
        throw new Error(`Failed loading claimed deferred logs: ${loadedRes.ErrorMessage ?? 'RunView failed'}`);
      }
      return loadedRes.Results;
    }

    // Without ExecuteSQL two sweepers could both read-then-save the same due log and both send it.
    LogError('V2SendService.claimDueDeferredLogs: the provider has no ExecuteSQL, so due logs cannot be claimed atomically; none were sent');
    return [];
  }
}

/**
 * Minutes a log may stay In-Progress with no ProviderMessageID before it is treated as stuck: its
 * worker died, or saving the log failed after the provider call, so the send's outcome is unknown.
 */
const STALE_IN_PROGRESS_MINUTES = 15;

/** Delivery guarantee used when no envelope, run, sender or provider sets one. */
export const DEFAULT_DELIVERY_GUARANTEE: DeliveryGuarantee = 'At Most Once';

/** True when an In-Progress log with no ProviderMessageID has been stuck past the stale threshold. */
export function IsStaleInProgressLog(log: MJCommunicationLogEntity, now: number = Date.now()): boolean {
  const updatedAtMs = log.__mj_UpdatedAt ? new Date(log.__mj_UpdatedAt).getTime() : NaN;
  return Number.isFinite(updatedAtMs) && now - updatedAtMs > STALE_IN_PROGRESS_MINUTES * 60_000;
}

/**
 * Returns the first delivery guarantee that is set, in precedence order (envelope, run, sender,
 * ancestor senders nearest first, provider), or {@link DEFAULT_DELIVERY_GUARANTEE}.
 */
export function PickDeliveryGuarantee(
  candidates: ReadonlyArray<DeliveryGuarantee | null | undefined>,
): DeliveryGuarantee {
  for (const candidate of candidates) {
    if (candidate) return candidate;
  }
  return DEFAULT_DELIVERY_GUARANTEE;
}
/**
 * Picks the principal-preference row that governs a send, from rows for the sending sender, its
 * ancestors (`senderChainIds[0]` is the sender itself) and sender-less rows.
 *
 * - An opt-out anywhere in the chain wins: someone who opted out under a parent sender has not
 *   opted back in just because a child sender sends.
 * - Otherwise the nearest row wins: the sender's own, then the closest ancestor, then sender-less.
 */
export function PickEffectivePrincipalPreference(
  rows: MJCommunicationPrincipalPreferenceEntity[],
  senderChainIds: string[],
): MJCommunicationPrincipalPreferenceEntity | undefined {
  if (rows.length === 0) return undefined;
  const optOut = rows.find((r) => r.State === 'Opted Out');
  if (optOut) return optOut;
  const chainDepth = new Map<string, number>();
  senderChainIds.forEach((id, index) => {
    const key = NormalizeUUID(id);
    if (!chainDepth.has(key)) chainDepth.set(key, index);
  });
  const depth = (r: MJCommunicationPrincipalPreferenceEntity): number => {
    if (r.CommunicationSenderID === null) return senderChainIds.length;
    return chainDepth.get(NormalizeUUID(r.CommunicationSenderID)) ?? senderChainIds.length + 1;
  };
  return [...rows].sort((a, b) => depth(a) - depth(b))[0];
}

/** Attempts to record a send's result on its log before giving up (see `saveLogAfterSend`). */
const MAX_POST_SEND_SAVE_ATTEMPTS = 3;
/** What a chunk did, as recorded on its `MJ: Communication Run Chunks` row. */
export interface RunChunkOutcome {
  Status: MJCommunicationRunChunkEntity['Status'];
  RecipientCount: number;
  ErrorMessage?: string;
}

/**
 * Describes a finished chunk from its send result. A chunk is `Failed` only when it was refused
 * before any recipient was processed (a pre-send check failed, or the send threw); a chunk whose
 * recipients were individually blocked or failed is still `Complete`.
 */
export function DescribeChunkOutcome(
  recipientCount: number,
  result: SendV2Result | undefined,
  thrown: unknown,
): RunChunkOutcome {
  if (thrown !== undefined) {
    return { Status: 'Failed', RecipientCount: recipientCount, ErrorMessage: thrown instanceof Error ? thrown.message : String(thrown) };
  }
  if (!result) {
    return { Status: 'Failed', RecipientCount: recipientCount, ErrorMessage: 'The chunk returned no result' };
  }
  // An inline chunk that reached its recipients always reports per-recipient Outcomes; a pre-send
  // refusal reports none (and counts every recipient as blocked), so the counts cannot be used here.
  const processed = (result.Outcomes?.length ?? 0) > 0;
  if (!result.Success && !processed) {
    return { Status: 'Failed', RecipientCount: recipientCount, ErrorMessage: result.ErrorMessage ?? 'The chunk was refused' };
  }
  return { Status: 'Complete', RecipientCount: recipientCount };
}

/** Endpoint IDs per `IN (...)` list when preloading a run's logs. */
const RUN_LOG_ENDPOINT_CHUNK = 200;

interface SqlCapableProvider {
  MJCoreSchemaName?: string;
  ExecuteSQL<T = Record<string, unknown>>(
    sql: string,
    parameters?: unknown[],
    options?: { isMutation?: boolean; description?: string },
    contextUser?: UserInfo,
  ): Promise<T[]>;
}

function isSqlCapableProvider(provider: unknown): provider is SqlCapableProvider {
  return (
    typeof provider === 'object' &&
    provider !== null &&
    'ExecuteSQL' in provider &&
    typeof (provider as { ExecuteSQL?: unknown }).ExecuteSQL === 'function'
  );
}

/** Reads a deferred log's stored message. Undefined when it is missing or not valid JSON. */
function parseDeferredPayload(raw: string | null | undefined): MessagePayload | undefined {
  if (!raw) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as MessagePayload) : undefined;
  } catch {
    return undefined;
  }
}

/** Reads a log's caller correlation data back into the object the caller passed. */
function parseCorrelationData(raw: string | null | undefined): Record<string, unknown> | undefined {
  if (!raw) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}
