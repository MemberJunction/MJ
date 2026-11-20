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
  ResolvedEndpoint,
  SendableRecipient,
  SendingEnvelope,
  SendToPrincipalsParams,
  SendV2RecipientOutcome,
  SendV2Result,
} from '@memberjunction/communication-types';
import { Metadata, RunView, UserInfo } from '@memberjunction/core';
import type {
  MJCommunicationEndpointEntity,
  MJCommunicationLogEntity,
  MJCommunicationPreferenceEntity,
  MJCommunicationPrincipalEntity,
  MJCommunicationPrincipalPreferenceEntity,
  MJCommunicationRunEntity,
  MJCommunicationSenderEntity,
  MJCommunicationSendingDomainEntity,
  MJCommunicationSuppressionEntity,
} from '@memberjunction/core-entities';
import { EscapeSQLString, MJGlobal, UUIDsEqual } from '@memberjunction/global';
import { ProcessedMessageServer } from './BaseProvider';
import { ComplianceGate } from './compliance/ComplianceGate';
import { JurisdictionResolver } from './compliance/JurisdictionResolver';
import {
  ComputeEndpointHash,
  NormalizeEndpointAddress,
  PrincipalRecordKey,
} from './DefaultCommunicationPrincipal';

export interface V2DispatchConfig {
  ChunkSize?: number;
  AsyncThreshold?: number;
  BaseTrackingURL?: string;
  TrackingHMACSecret?: string;
  InstanceEnforcementMode?: EnforcementMode;
  EnqueueWork?: (
    taskType: 'comms.dispatch' | 'comms.send',
    payload: Record<string, unknown>,
  ) => Promise<void>;
}

export interface ProtectedComplianceSnapshot {
  From: string;
  To: string;
  ListUnsubscribe?: string;
  ListUnsubscribePost?: string;
  FooterHTML?: string;
  FooterText?: string;
  LogID: string;
}

const DEFAULT_CHUNK_SIZE = 50;
const DEFAULT_ASYNC_THRESHOLD = 100;

export function ComputeTrackingSignature(
  trackingToken: string,
  targetUrl: string,
  secret: string,
): string {
  return createHmac('sha256', secret)
    .update(`${trackingToken}:${targetUrl}`, 'utf8')
    .digest('hex');
}

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
  const cleanBase = baseUrl.replace(/\/+$/, '');
  if (!cleanBase) {
    return `/comms${subpath}`;
  }
  return cleanBase.endsWith('/comms')
    ? `${cleanBase}${subpath}`
    : `${cleanBase}/comms${subpath}`;
}

export function RewriteLinksForTracking(
  html: string,
  trackingToken: string,
  secret: string,
  baseUrl: string = '',
  excludedUrls: ReadonlyArray<string> = [],
): string {
  const excluded = new Set(excludedUrls.filter(Boolean));
  return html.replace(
    /(<a\b[^>]*?\bhref\s*=\s*)(["'])(https?:\/\/[^"']+)\2/gi,
    (fullMatch, prefix: string, quote: string, url: string) => {
      const decodedUrl = url.replace(/&amp;/gi, '&');
      if (excluded.has(decodedUrl) || excluded.has(url)) {
        return fullMatch;
      }
      const sig = ComputeTrackingSignature(trackingToken, decodedUrl, secret);
      const tracked = `${buildCommsRouteUrl(baseUrl, `/click/${trackingToken}`)}?u=${encodeURIComponent(decodedUrl)}&sig=${sig}`;
      return `${prefix}${quote}${tracked}${quote}`;
    },
  );
}

export function InjectOpenPixel(
  html: string,
  trackingToken: string,
  baseUrl: string = '',
): string {
  const pixel = `<img src="${buildCommsRouteUrl(baseUrl, `/open/${trackingToken}.gif`)}" width="1" height="1" alt="" style="display:none;" />`;
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${pixel}</body>`);
  }
  return `${html}${pixel}`;
}

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

/**
 * Orchestrates Communications V2 endpoint resolution, pre-flight compliance eligibility,
 * protected compliance injection, tracking instrumentation, and chunked/inline dispatch.
 */
export class V2SendService {
  private config: V2DispatchConfig = {};

  public Configure(config: V2DispatchConfig): void {
    this.config = { ...this.config, ...config };
  }

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

      const endpointEntity = await this.loadEndpointEntity(endpoint.CommunicationEndpointID, contextUser);
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
      const rv = new RunView();
      const existingRun = await rv.RunView<MJCommunicationRunEntity>(
        {
          EntityName: 'MJ: Communication Runs',
          ExtraFilter: `ID='${EscapeSQLString(params.CommunicationRunID)}'`,
          MaxRows: 1,
          ResultType: 'entity_object',
        },
        contextUser,
      );
      if (existingRun.Success && existingRun.Results.length > 0) {
        run = existingRun.Results[0];
      }
    }
    if (!run) {
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
    const pmt = providerEntity.MessageTypes.find((m) =>
      UUIDsEqual(m.CommunicationBaseMessageTypeID, params.Envelope.ChannelID),
    ) ?? providerEntity.MessageTypes[0];

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

      if (target.Decision === 'Deferred') {
        deferredCount++;
        const log = await this.createV2Log(params, sender, providerEntity.ID, pmt?.ID, run.ID, target, contextUser);
        outcomes.push({
          Principal: target.Principal,
          Endpoint: target.Endpoint,
          CommunicationLogID: log?.ID,
          Status: 'Deferred',
          DeferUntil: target.DeferUntil,
        });
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
      );
      if (outcome.Status === 'Sent' || outcome.Status === 'Queued') {
        queuedCount++;
      }
      outcomes.push(outcome);
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
  ): Promise<SendV2RecipientOutcome> {
    const log = await this.createV2Log(params, sender, providerID, pmt?.ID, runID, target, contextUser);
    if (!log) {
      return {
        Principal: target.Principal,
        Endpoint: target.Endpoint,
        Status: 'Failed',
        Reason: 'LogCreationFailed',
      };
    }

    // Idempotency guard: skip if already In-Progress, Complete, or ProviderMessageID is set
    if (log.Status === 'In-Progress' || log.Status === 'Complete' || Boolean(log.ProviderMessageID)) {
      return {
        Principal: target.Principal,
        Endpoint: target.Endpoint,
        CommunicationLogID: log.ID,
        Status: 'Sent',
      };
    }

    log.Status = 'In-Progress';
    await log.Save();

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
        await log.Save();
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
    msg.ContextData = {
      mj_log_id: log.ID,
      CommunicationLogID: log.ID,
    };

    const processed = new ProcessedMessageServer(msg);
    processed.ProcessedSubject = finalPayload.Subject ?? '';
    processed.ProcessedBody = finalPayload.Body ?? '';
    processed.ProcessedHTMLBody = finalPayload.HTMLBody ?? '';

    const sendRes = await provider.SendSingleMessage(processed);
    log.Status = sendRes.Success ? 'Complete' : 'Failed';
    log.ProviderMessageID = sendRes.ProviderMessageID ?? log.ProviderMessageID;
    log.ErrorMessage = sendRes.Error || null;
    await log.Save();

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
    const rv = new RunView();
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
    return res.Success && res.Results.length > 0 ? res.Results[0] : undefined;
  }

  private async loadSenderAncestry(
    sender: MJCommunicationSenderEntity,
    contextUser: UserInfo,
  ): Promise<MJCommunicationSenderEntity[]> {
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
    return chain;
  }

  private async resolveSenderTemplateContext(
    chain: MJCommunicationSenderEntity[],
    contextUser: UserInfo,
  ): Promise<Record<string, unknown>> {
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
    return merged;
  }

  private async loadPreference(
    preferenceID: string,
    contextUser: UserInfo,
  ): Promise<MJCommunicationPreferenceEntity | undefined> {
    const rv = new RunView();
    const res = await rv.RunView<MJCommunicationPreferenceEntity>(
      {
        EntityName: 'MJ: Communication Preferences',
        ExtraFilter: `ID='${EscapeSQLString(preferenceID)}'`,
        ResultType: 'entity_object',
      },
      contextUser,
    );
    return res.Success && res.Results.length > 0 ? res.Results[0] : undefined;
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

  private async pickEndpointForRecipient(
    rec: EvaluateEligibilityParams['Recipients'][number],
    channelID: string,
    resolvedMap: Map<string, ResolvedEndpoint[]>,
    contextUser: UserInfo,
  ): Promise<ResolvedEndpoint | undefined> {
    if (rec.Endpoint?.CommunicationEndpointID) {
      const entity = await this.loadEndpointEntity(rec.Endpoint.CommunicationEndpointID, contextUser);
      if (!entity) return undefined;
      return {
        CommunicationEndpointID: entity.ID,
        ChannelID: entity.BaseMessageTypeID,
        NormalizedValue: entity.NormalizedValue ?? '',
        ValueHash: entity.ValueHash,
        RawValue: entity.NormalizedValue ?? '',
        Domain: entity.Domain ?? undefined,
      };
    }

    if (rec.Endpoint?.Address) {
      const norm = NormalizeEndpointAddress(rec.Endpoint.Address);
      if (!norm) return undefined;
      const hash = ComputeEndpointHash(norm.NormalizedValue);
      const rv = new RunView();
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
    const rv = new RunView();
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

    const rv = new RunView();
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
    const rv = new RunView();
    const res = await rv.RunView<MJCommunicationPrincipalPreferenceEntity>(
      {
        EntityName: 'MJ: Communication Principal Preferences',
        ExtraFilter: `CommunicationPreferenceID='${EscapeSQLString(preferenceID)}' AND RecordID IN (${quoted}) AND (CommunicationSenderID='${EscapeSQLString(senderID)}' OR CommunicationSenderID IS NULL)`,
        ResultType: 'entity_object',
      },
      contextUser,
    );
    if (res.Success && res.Results) {
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
    const rv = new RunView();
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

  private async createV2Log(
    params: SendToPrincipalsParams,
    sender: MJCommunicationSenderEntity,
    providerID: string,
    pmtID: string | undefined,
    runID: string,
    target: SendableRecipient,
    contextUser: UserInfo,
  ): Promise<MJCommunicationLogEntity | undefined> {
    if (!pmtID) return undefined;
    if (params.CommunicationRunID) {
      const rv = new RunView();
      const existingRes = await rv.RunView<MJCommunicationLogEntity>(
        {
          EntityName: 'MJ: Communication Logs',
          ExtraFilter: `CommunicationRunID='${EscapeSQLString(runID)}' AND CommunicationEndpointID='${EscapeSQLString(target.Endpoint.CommunicationEndpointID)}'`,
          MaxRows: 1,
          ResultType: 'entity_object',
        },
        contextUser,
      );
      if (existingRes.Success && existingRes.Results.length > 0) {
        return existingRes.Results[0];
      }
    }
    const md = CommunicationEngineBase.Instance.ProviderToUse;
    const log = await md.GetEntityObject<MJCommunicationLogEntity>(
      'MJ: Communication Logs',
      contextUser,
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
    log.Status = 'Pending';
    log.MessageDate = new Date();
    log.CorrelationData = params.Envelope.CorrelationData
      ? JSON.stringify(params.Envelope.CorrelationData)
      : null;
    log.ComplianceDecision = JSON.stringify({
      Decision: target.Decision,
      Obligations: target.Obligations,
      ...target.AuditSnapshot,
    });

    return (await log.Save()) ? log : undefined;
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
    const trimmed = recipientAddress.trim();
    if (!trimmed) {
      return { Allowed: true };
    }
    const norm = NormalizeEndpointAddress(trimmed, channelID);
    const hash = norm?.ValueHash ?? ComputeEndpointHash(trimmed.toLowerCase());

    const rv = new RunView();
    const epRes = await rv.RunView<MJCommunicationEndpointEntity>(
      {
        EntityName: 'MJ: Communication Endpoints',
        ExtraFilter: `BaseMessageTypeID='${EscapeSQLString(channelID)}' AND ValueHash='${EscapeSQLString(hash)}'`,
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

    const endpoint = epRes.Results[0];
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

    const supRes = await rv.RunView<MJCommunicationSuppressionEntity>(
      {
        EntityName: 'MJ: Communication Suppressions',
        ExtraFilter: `CommunicationEndpointID='${EscapeSQLString(endpoint.ID)}' AND Status='Active'`,
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
        if ((s.Reason === 'User Unsubscribe' || s.Reason === 'Policy') && messageClass === 'Marketing') {
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
}
