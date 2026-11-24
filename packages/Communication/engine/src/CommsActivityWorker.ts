import { createHash } from 'node:crypto';
import {
  BaseCommunicationPrincipal,
  BaseCommunicationSuppressionPolicy,
  CommunicationEngineBase,
  NormalizedActivityEvent,
  SuppressionReason,
} from '@memberjunction/communication-types';
import {
  IMetadataProvider,
  LogError,
  RunView,
  UserInfo,
} from '@memberjunction/core';
import type {
  MJCommunicationActivityEntity,
  MJCommunicationConsentAuditLogEntity,
  MJCommunicationEndpointEntity,
  MJCommunicationLogEntity,
  MJCommunicationPrincipalEntity,
  MJCommunicationPrincipalPreferenceEntity,
  MJCommunicationProviderEventEntity,
  MJCommunicationSuppressionEntity,
  MJCommunicationSuppressionPolicyEntity,
} from '@memberjunction/core-entities';
import {
  EscapeSQLString,
  MJGlobal,
  RegisterClass,
  UUIDMap,
  UUIDsEqual,
} from '@memberjunction/global';
import {
  ComputeEndpointHash,
  NormalizeEndpointAddress,
} from './DefaultCommunicationPrincipal';

const DEFAULT_SOFT_BOUNCE_THRESHOLD = 5;
const DEFAULT_SOFT_BOUNCE_EXPIRY_DAYS = 30;
const MS_PER_DAY = 86_400_000;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Options for {@link CommsActivityWorker.ProcessActivityBatch}. */
export interface ProcessActivityOptions {
  /** Write an `MJ: Communication Activities` row per event. Defaults to `true`. */
  PersistActivity?: boolean;
}

/** Counts for one processed batch. */
export interface ProcessActivityBatchResult {
  /** Events applied. */
  ProcessedCount: number;
  /**
   * Events skipped because their `ProviderEventID` was already recorded or repeated in the batch.
   */
  DuplicateCount: number;
  /** Events that failed. Their deduplication claim is released so a retry can process them. */
  ErrorCount: number;
}

/** Result of {@link CommsActivityWorker.EraseEndpointPII}. */
export interface EraseEndpointPIIResult {
  /** Whether an endpoint matched. */
  Found: boolean;
  /** The erased endpoint. */
  CommunicationEndpointID?: string;
  /** Logs whose `RecipientAddress` was cleared. */
  ScrubbedLogs: number;
  /** Activity rows whose `IPAddress`, `UserAgent` and `RawPayload` were cleared. */
  ScrubbedActivities: number;
  /** Always 0: the consent audit log is append-only and is not changed by erasure. */
  ScrubbedAuditLogs: number;
}

interface SoftBouncePolicyConfig {
  PolicyID?: string;
  Threshold: number;
  ExpiryDays: number;
}

/**
 * Processes normalized provider activity events (`comms.activity` WorkQueue worker)
 * and implements GDPR endpoint PII erasure.
 */
export class CommsActivityWorker {
  /**
   * Processes a batch of normalized activity events: deduplicates by provider event ID,
   * correlates to logs/endpoints, detects machine opens/clicks, updates endpoint health
   * and suppressions/consent, invokes principal & policy drivers, and optionally persists
   * `MJ: Communication Activities` rows.
   */
  public async ProcessActivityBatch(
    events: NormalizedActivityEvent[],
    contextUser: UserInfo,
    options?: ProcessActivityOptions,
  ): Promise<ProcessActivityBatchResult> {
    if (events.length === 0) {
      return { ProcessedCount: 0, DuplicateCount: 0, ErrorCount: 0 };
    }

    const persistActivity = options?.PersistActivity ?? true;
    const preparedEvents = events.map((ev) => this.ensureFirstPartyEventId(ev));
    const deduped = await this.deduplicateEvents(preparedEvents, contextUser);
    const duplicateCount = events.length - deduped.length;

    let processedCount = 0;
    let errorCount = 0;
    let raceDuplicates = 0;
    const processedEvents: NormalizedActivityEvent[] = [];
    const provider = this.getProvider();
    const transactional = isTransactionalProvider(provider) ? provider : undefined;

    for (const event of deduped) {
      let claimedEvent: MJCommunicationProviderEventEntity | undefined;
      let inTx = false;
      try {
        if (transactional) {
          await transactional.BeginTransaction();
          inTx = true;
        }
        const preCorrelatedLog = !event.CommunicationProviderID
          ? await this.correlateEvent(event, contextUser)
          : undefined;
        if (event.ProviderEventID && event.CommunicationProviderID) {
          const claim = await this.claimProviderEvent(
            event.CommunicationProviderID,
            event.ProviderEventID,
            contextUser,
          );
          if (claim.Duplicate) {
            if (inTx && transactional) {
              await transactional.CommitTransaction();
              inTx = false;
            }
            raceDuplicates++;
            continue;
          }
          claimedEvent = claim.Entity;
        }
        await this.processSingleEvent(event, persistActivity, contextUser, preCorrelatedLog);
        if (inTx && transactional) {
          await transactional.CommitTransaction();
          inTx = false;
        }
        processedEvents.push(event);
        processedCount++;
      } catch (err) {
        if (inTx && transactional) {
          await transactional.RollbackTransaction().catch((rbErr) =>
            LogError(`CommsActivityWorker rollback failed: ${rbErr instanceof Error ? rbErr.message : String(rbErr)}`),
          );
        } else if (claimedEvent && typeof claimedEvent.Delete === 'function') {
          if (!(await claimedEvent.Delete().catch(() => false))) {
            LogError(`CommsActivityWorker failed to release claimed provider event ${claimedEvent.ID}`);
          }
        }
        errorCount++;
        LogError(
          `CommsActivityWorker failed processing event (${event.EventType}): ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    await this.dispatchDriverHooks(processedEvents, contextUser);

    return {
      ProcessedCount: processedCount,
      DuplicateCount: duplicateCount + raceDuplicates,
      ErrorCount: errorCount,
    };
  }

  /**
   * GDPR erasure routine: marks the endpoint `Erased`, clears `NormalizedValue`
   * while preserving `ValueHash` and all `CommunicationSuppression` rows, clears
   * `RecipientAddress` on the endpoint's logs, and clears `IPAddress`, `UserAgent` and
   * `RawPayload` on its activity rows. Consent audit log rows are append-only and are not changed.
   *
   * @param endpointIdOrAddress - An `MJ: Communication Endpoints` ID, or a raw address.
   * @param channelID - `MJ: Communication Base Message Types` ID, used when matching by address.
   */
  public async EraseEndpointPII(
    endpointIdOrAddress: string,
    channelID: string,
    contextUser: UserInfo,
  ): Promise<EraseEndpointPIIResult> {
    const endpoint = await this.findEndpointForErasure(
      endpointIdOrAddress,
      channelID,
      contextUser,
    );
    if (!endpoint) {
      return {
        Found: false,
        ScrubbedLogs: 0,
        ScrubbedActivities: 0,
        ScrubbedAuditLogs: 0,
      };
    }

    endpoint.Status = 'Erased';
    endpoint.NormalizedValue = null;
    if (!(await endpoint.Save())) {
      LogError(
        `Failed to update erased endpoint ${endpoint.ID}: ${
          endpoint.LatestResult?.CompleteMessage ?? 'unknown error'
        }`,
      );
    }

    const { scrubbedCount: scrubbedLogs } = await this.scrubLogsForEndpoint(
      endpoint.ID,
      contextUser,
    );
    const scrubbedActivities = await this.scrubActivitiesForEndpoint(
      endpoint.ID,
      contextUser,
    );

    return {
      Found: true,
      CommunicationEndpointID: endpoint.ID,
      ScrubbedLogs: scrubbedLogs,
      ScrubbedActivities: scrubbedActivities,
      // CommunicationConsentAuditLog is append-only (AllowUpdateAPI=false, AllowDeleteAPI=false); never mutated on erasure.
      ScrubbedAuditLogs: 0,
    };
  }

  /**
   * Determines whether an Opened/Clicked User-Agent represents an automated proxy
   * or link scanner (Apple MPP, GoogleImageProxy, Microsoft SafeLinks, Proofpoint, Barracuda).
   */
  public IsMachineUserAgent(userAgent?: string | null): boolean {
    if (!userAgent) return false;
    const trimmed = userAgent.trim();
    if (!trimmed) return false;
    const lower = trimmed.toLowerCase();

    if (lower === 'mozilla/5.0') return true;
    if (/apple\s*mail/.test(lower)) return true;
    const appleMailIdx = lower.indexOf('applemail');
    if (appleMailIdx !== -1 && lower.includes('proxy', appleMailIdx + 9)) return true;
    const appleIdx = lower.indexOf('apple');
    if (appleIdx !== -1 && lower.includes('mpp', appleIdx + 5)) return true;
    if (lower.includes('googleimageproxy')) return true;
    if (lower.includes('safelinks')) return true;
    if (lower.includes('proofpoint') || lower.includes('urldefense')) return true;
    if (lower.includes('barracuda')) return true;

    return false;
  }

  private getProvider(): IMetadataProvider {
    return CommunicationEngineBase.Instance.ProviderToUse;
  }

  private getRunView(): RunView {
    return RunView.FromMetadataProvider(this.getProvider());
  }

  private ensureFirstPartyEventId(event: NormalizedActivityEvent): NormalizedActivityEvent {
    if (event.ProviderEventID) {
      return event;
    }
    if (
      event.EventType !== 'Opened' &&
      event.EventType !== 'Clicked' &&
      event.EventType !== 'Unsubscribed'
    ) {
      return event;
    }
    const token = event.CommunicationLogID ?? event.UnsubscribeToken ?? event.TrackingToken;
    if (!token) {
      return event;
    }
    const occurredIso =
      event.OccurredAt instanceof Date
        ? event.OccurredAt.toISOString()
        : String(event.OccurredAt ?? '');
    const digest = createHash('sha256')
      .update(`${event.EventType}:${token}:${event.TargetURL ?? ''}:${occurredIso}`)
      .digest('hex')
      .slice(0, 32);
    event.ProviderEventID = `firstparty:${event.EventType.toLowerCase()}:${digest}`;
    return event;
  }

  private async processSingleEvent(
    event: NormalizedActivityEvent,
    persistActivity: boolean,
    contextUser: UserInfo,
    preCorrelatedLog?: MJCommunicationLogEntity,
  ): Promise<void> {
    const log = preCorrelatedLog ?? (await this.correlateEvent(event, contextUser));

    if (
      (event.EventType === 'Opened' || event.EventType === 'Clicked') &&
      !event.IsMachineEvent &&
      this.IsMachineUserAgent(event.UserAgent)
    ) {
      event.IsMachineEvent = true;
    }

    const endpoint = await this.resolveOrLoadEndpoint(event, contextUser);
    await this.applyComplianceAndHealth(event, log, endpoint, contextUser);

    if (persistActivity) {
      await this.persistActivityRow(event, contextUser);
    }
  }

  private async deduplicateEvents(
    events: NormalizedActivityEvent[],
    contextUser: UserInfo,
  ): Promise<NormalizedActivityEvent[]> {
    // An event with no provider yet (open, click and unsubscribe hits from MJ's own routes) takes
    // its provider from the log it is correlated to, later, per event. It cannot be looked up
    // here: an empty provider ID is not a valid key. The database claim made after correlation
    // still rejects a redelivery.
    const withProviderEventId = events.filter(
      (e): e is NormalizedActivityEvent & { ProviderEventID: string } =>
        Boolean(e.ProviderEventID) && Boolean(e.CommunicationProviderID),
    );
    const existingKeys = await this.loadExistingProviderEventKeys(
      withProviderEventId,
      contextUser,
    );

    const seenInBatch = new Set<string>();
    const accepted: NormalizedActivityEvent[] = [];

    for (const event of events) {
      if (!event.ProviderEventID) {
        accepted.push(event);
        continue;
      }

      const key = this.providerEventKey(
        event.CommunicationProviderID,
        event.ProviderEventID,
      );
      if (existingKeys.has(key) || seenInBatch.has(key)) {
        continue;
      }

      seenInBatch.add(key);
      accepted.push(event);
    }

    return accepted;
  }

  private providerEventKey(providerID: string, providerEventID: string): string {
    return `${providerID.toLowerCase()}:${providerEventID}`;
  }

  private async loadExistingProviderEventKeys(
    events: Array<NormalizedActivityEvent & { ProviderEventID: string }>,
    contextUser: UserInfo,
  ): Promise<Set<string>> {
    const keys = new Set<string>();
    if (events.length === 0) return keys;

    const byProvider = new UUIDMap<string[]>();
    for (const ev of events) {
      const list = byProvider.Get(ev.CommunicationProviderID) ?? [];
      list.push(ev.ProviderEventID);
      byProvider.Set(ev.CommunicationProviderID, list);
    }

    const rv = this.getRunView();
    for (const [providerID, eventIDs] of byProvider) {
      const uniqueIds = Array.from(new Set(eventIDs));
      const quoted = uniqueIds.map((id) => `'${EscapeSQLString(id)}'`).join(',');
      const res = await rv.RunView<{
        CommunicationProviderID: string;
        ProviderEventID: string;
      }>(
        {
          EntityName: 'MJ: Communication Provider Events',
          Fields: ['CommunicationProviderID', 'ProviderEventID'],
          ExtraFilter: `CommunicationProviderID='${EscapeSQLString(providerID)}' AND ProviderEventID IN (${quoted})`,
          ResultType: 'simple',
        },
        contextUser,
      );
      if (!res.Success) {
        throw new Error(
          `Failed querying Communication Provider Events for deduplication: ${res.ErrorMessage ?? 'RunView failed'}`,
        );
      }
      if (res.Results) {
        for (const row of res.Results) {
          keys.add(this.providerEventKey(row.CommunicationProviderID, row.ProviderEventID));
        }
      }
    }

    return keys;
  }

  private async claimProviderEvent(
    providerID: string,
    providerEventID: string,
    contextUser: UserInfo,
  ): Promise<{ Entity?: MJCommunicationProviderEventEntity; Duplicate: boolean }> {
    const md = this.getProvider();
    const entity = await md.GetEntityObject<MJCommunicationProviderEventEntity>(
      'MJ: Communication Provider Events',
      contextUser,
    );
    entity.CommunicationProviderID = providerID;
    entity.ProviderEventID = providerEventID;
    entity.ReceivedAt = new Date();
    if (await entity.Save()) {
      return { Entity: entity, Duplicate: false };
    }

    const saveErr = entity.LatestResult?.CompleteMessage ?? 'unknown error';
    const rv = this.getRunView();
    const existing = await rv.RunView<{ ID: string }>(
      {
        EntityName: 'MJ: Communication Provider Events',
        Fields: ['ID'],
        ExtraFilter: `CommunicationProviderID='${EscapeSQLString(providerID)}' AND ProviderEventID='${EscapeSQLString(providerEventID)}'`,
        MaxRows: 1,
        ResultType: 'simple',
      },
      contextUser,
    );
    if (existing.Success && existing.Results.length > 0) {
      return { Duplicate: true };
    }
    throw new Error(`Failed to claim Communication Provider Event (${providerEventID}): ${saveErr}`);
  }

  private async correlateEvent(
    event: NormalizedActivityEvent,
    contextUser: UserInfo,
  ): Promise<MJCommunicationLogEntity | undefined> {
    const filter = this.buildLogCorrelationFilter(event);
    if (!filter) return undefined;

    const rv = this.getRunView();
    const res = await rv.RunView<MJCommunicationLogEntity>(
      {
        EntityName: 'MJ: Communication Logs',
        ExtraFilter: filter,
        ResultType: 'entity_object',
      },
      contextUser,
    );

    if (!res.Success) {
      throw new Error(
        `Failed correlating activity event with CommunicationLog: ${res.ErrorMessage ?? 'RunView failed'}`,
      );
    }
    if (!res.Results || res.Results.length === 0) {
      return undefined;
    }

    const log = res.Results[0];
    this.hydrateEventFromLog(event, log);
    return log;
  }

  private buildLogCorrelationFilter(event: NormalizedActivityEvent): string | undefined {
    if (event.CommunicationLogID) {
      return `ID='${EscapeSQLString(event.CommunicationLogID)}'`;
    }
    if (event.UnsubscribeToken) {
      return `UnsubscribeToken='${EscapeSQLString(event.UnsubscribeToken)}'`;
    }
    if (event.TrackingToken) {
      return `TrackingToken='${EscapeSQLString(event.TrackingToken)}'`;
    }
    if (event.ProviderMessageID && event.CommunicationProviderID) {
      const filterIdx = event.ProviderMessageID.indexOf('.filter');
      if (filterIdx > 0) {
        const baseId = event.ProviderMessageID.slice(0, filterIdx);
        return `CommunicationProviderID='${EscapeSQLString(event.CommunicationProviderID)}' AND (ProviderMessageID='${EscapeSQLString(event.ProviderMessageID)}' OR ProviderMessageID='${EscapeSQLString(baseId)}')`;
      }
      return `CommunicationProviderID='${EscapeSQLString(event.CommunicationProviderID)}' AND ProviderMessageID='${EscapeSQLString(event.ProviderMessageID)}'`;
    }
    return undefined;
  }

  private hydrateEventFromLog(
    event: NormalizedActivityEvent,
    log: MJCommunicationLogEntity,
  ): void {
    event.CommunicationLogID = event.CommunicationLogID ?? log.ID;
    event.CommunicationProviderID =
      event.CommunicationProviderID || log.CommunicationProviderID || undefined!;
    event.CommunicationSenderID =
      event.CommunicationSenderID ?? log.CommunicationSenderID ?? undefined;
    event.CommunicationEndpointID =
      event.CommunicationEndpointID ?? log.CommunicationEndpointID ?? undefined;

    if (!event.Principal && log.EntityID && log.RecordID) {
      event.Principal = { EntityID: log.EntityID, RecordID: log.RecordID };
    }

    if (log.CorrelationData) {
      try {
        const parsed = JSON.parse(log.CorrelationData) as Record<string, unknown>;
        const sanitized = Object.fromEntries(
          Object.entries(parsed).filter(([k]) => !k.startsWith('__')),
        );
        if (Object.keys(sanitized).length > 0) {
          event.CorrelationData = {
            ...sanitized,
            ...(event.CorrelationData ?? {}),
          };
        }
      } catch {
        // Ignore malformed CorrelationData JSON on log
      }
    }
  }

  private async resolveOrLoadEndpoint(
    event: NormalizedActivityEvent,
    contextUser: UserInfo,
  ): Promise<MJCommunicationEndpointEntity | undefined> {
    const rv = this.getRunView();
    if (event.CommunicationEndpointID) {
      const res = await rv.RunView<MJCommunicationEndpointEntity>(
        {
          EntityName: 'MJ: Communication Endpoints',
          ExtraFilter: `ID='${EscapeSQLString(event.CommunicationEndpointID)}'`,
          ResultType: 'entity_object',
        },
        contextUser,
      );
      if (!res.Success) {
        throw new Error(
          `Failed loading CommunicationEndpoint ${event.CommunicationEndpointID}: ${res.ErrorMessage ?? 'RunView failed'}`,
        );
      }
      return res.Results.length > 0 ? res.Results[0] : undefined;
    }

    const hash =
      event.ValueHash ??
      (event.NormalizedAddress
        ? ComputeEndpointHash(event.NormalizedAddress.trim().toLowerCase())
        : undefined);
    if (!hash) return undefined;

    const res = await rv.RunView<MJCommunicationEndpointEntity>(
      {
        EntityName: 'MJ: Communication Endpoints',
        ExtraFilter: `ValueHash='${EscapeSQLString(hash)}'`,
        ResultType: 'entity_object',
      },
      contextUser,
    );
    if (!res.Success) {
      throw new Error(
        `Failed resolving CommunicationEndpoint by hash: ${res.ErrorMessage ?? 'RunView failed'}`,
      );
    }
    if (res.Results.length > 0) {
      event.CommunicationEndpointID = res.Results[0].ID;
      return res.Results[0];
    }
    return undefined;
  }

  private async applyComplianceAndHealth(
    event: NormalizedActivityEvent,
    log: MJCommunicationLogEntity | undefined,
    endpoint: MJCommunicationEndpointEntity | undefined,
    contextUser: UserInfo,
  ): Promise<void> {
    switch (event.EventType) {
      case 'Delivered':
        await this.handleDelivered(event, endpoint);
        break;
      case 'Soft Bounce':
        await this.handleSoftBounce(event, endpoint, contextUser);
        break;
      case 'Hard Bounce':
        await this.handleHardBounce(event, endpoint, contextUser);
        break;
      case 'Dropped':
        await this.handleDropped(event, endpoint, contextUser);
        break;
      case 'Spam Complaint':
        await this.handleSpamComplaint(event, endpoint, contextUser);
        break;
      case 'Unsubscribed':
        await this.handleUnsubscribed(event, log, endpoint, contextUser);
        break;
      case 'Opened':
      case 'Clicked':
        await this.handleEngagement(event, endpoint);
        break;
      default:
        break;
    }
  }

  private async handleDelivered(
    event: NormalizedActivityEvent,
    endpoint: MJCommunicationEndpointEntity | undefined,
  ): Promise<void> {
    if (!endpoint) return;

    if (!endpoint.LastDeliveredAt || event.OccurredAt > endpoint.LastDeliveredAt) {
      endpoint.LastDeliveredAt = event.OccurredAt;
    }

    if (!endpoint.LastBouncedAt || event.OccurredAt > endpoint.LastBouncedAt) {
      endpoint.SoftBounceCount = 0;
      if (endpoint.Status === 'Soft Bouncing') {
        endpoint.Status = 'Active';
      }
    }

    await this.saveEndpoint(endpoint);
  }

  private async handleSoftBounce(
    event: NormalizedActivityEvent,
    endpoint: MJCommunicationEndpointEntity | undefined,
    contextUser: UserInfo,
  ): Promise<void> {
    if (!endpoint) return;

    if (!endpoint.LastBouncedAt || event.OccurredAt > endpoint.LastBouncedAt) {
      endpoint.LastBouncedAt = event.OccurredAt;
    }

    endpoint.SoftBounceCount = (endpoint.SoftBounceCount ?? 0) + 1;
    if (endpoint.Status === 'Active') {
      endpoint.Status = 'Soft Bouncing';
    }
    await this.saveEndpoint(endpoint);
  }

  private resolveSoftBouncePolicyConfig(): SoftBouncePolicyConfig {
    const policy: MJCommunicationSuppressionPolicyEntity | undefined =
      CommunicationEngineBase.Instance.SuppressionPolicies.find(
        (p) =>
          p.Status === 'Active' &&
          (p.DriverClass === 'SoftBounceThresholdPolicy' ||
            p.Name === 'SoftBounceThresholdPolicy'),
      );

    let threshold = DEFAULT_SOFT_BOUNCE_THRESHOLD;
    let expiryDays = DEFAULT_SOFT_BOUNCE_EXPIRY_DAYS;

    if (policy?.Parameters) {
      try {
        const parsed = JSON.parse(policy.Parameters) as Record<string, unknown>;
        const thresholdCandidate = parsed.threshold ?? parsed.Threshold;
        if (typeof thresholdCandidate === 'number' && thresholdCandidate > 0) {
          threshold = thresholdCandidate;
        }
        const expiryCandidate = parsed.cooldownDays ?? parsed.ExpiryDays;
        if (typeof expiryCandidate === 'number' && expiryCandidate > 0) {
          expiryDays = expiryCandidate;
        }
      } catch {
        // Use defaults if Parameters JSON is malformed
      }
    }

    return {
      PolicyID: policy?.ID,
      Threshold: threshold,
      ExpiryDays: expiryDays,
    };
  }

  private async handleHardBounce(
    event: NormalizedActivityEvent,
    endpoint: MJCommunicationEndpointEntity | undefined,
    contextUser: UserInfo,
  ): Promise<void> {
    if (endpoint) {
      if (!endpoint.LastBouncedAt || event.OccurredAt > endpoint.LastBouncedAt) {
        endpoint.LastBouncedAt = event.OccurredAt;
      }
      endpoint.Status = 'Hard Bounced';
      await this.saveEndpoint(endpoint);
    }

    if (endpoint || event.Principal) {
      await this.createSuppression(
        {
          CommunicationEndpointID: endpoint?.ID ?? null,
          EntityID: endpoint ? null : event.Principal?.EntityID ?? null,
          RecordID: endpoint ? null : event.Principal?.RecordID ?? null,
          CommunicationSenderID: null,
          BaseMessageTypeID: endpoint?.BaseMessageTypeID ?? null,
          Reason: 'Hard Bounce',
          Source: event.Source ?? 'Provider Webhook',
          EffectiveAt: event.OccurredAt,
          CommunicationLogID: event.CommunicationLogID ?? null,
          Notes: event.BounceReason ?? null,
        },
        contextUser,
      );
    }
  }

  private async handleDropped(
    event: NormalizedActivityEvent,
    endpoint: MJCommunicationEndpointEntity | undefined,
    contextUser: UserInfo,
  ): Promise<void> {
    const mapped = this.mapDropReason(event.DropReason);
    if (!mapped) return;

    if (endpoint && mapped.EndpointStatus) {
      endpoint.Status = mapped.EndpointStatus;
      await this.saveEndpoint(endpoint);
    }

    if (endpoint || event.Principal) {
      await this.createSuppression(
        {
          CommunicationEndpointID: endpoint?.ID ?? null,
          EntityID: endpoint ? null : event.Principal?.EntityID ?? null,
          RecordID: endpoint ? null : event.Principal?.RecordID ?? null,
          CommunicationSenderID: mapped.Global
            ? null
            : event.CommunicationSenderID ?? null,
          BaseMessageTypeID: endpoint?.BaseMessageTypeID ?? null,
          Reason: mapped.Reason,
          Source: event.Source ?? 'Provider Webhook',
          EffectiveAt: event.OccurredAt,
          CommunicationLogID: event.CommunicationLogID ?? null,
          Notes: event.DropReason ?? null,
        },
        contextUser,
      );
    }
  }

  private mapDropReason(dropReason?: string):
    | {
        Reason: SuppressionReason;
        Global: boolean;
        EndpointStatus?: MJCommunicationEndpointEntity['Status'];
      }
    | undefined {
    const lower = (dropReason ?? '').toLowerCase();
    if (lower.includes('invalid')) {
      return { Reason: 'Invalid Address', Global: true, EndpointStatus: 'Invalid' };
    }
    if (lower.includes('bounced')) {
      return { Reason: 'Hard Bounce', Global: true, EndpointStatus: 'Hard Bounced' };
    }
    if (lower.includes('unsubscribed')) {
      return { Reason: 'User Unsubscribe', Global: false };
    }
    if (lower.includes('spam')) {
      return { Reason: 'Spam Complaint', Global: false, EndpointStatus: 'Complained' };
    }
    return undefined;
  }

  private async handleSpamComplaint(
    event: NormalizedActivityEvent,
    endpoint: MJCommunicationEndpointEntity | undefined,
    contextUser: UserInfo,
  ): Promise<void> {
    if (endpoint) {
      endpoint.Status = 'Complained';
      await this.saveEndpoint(endpoint);
    }

    if (endpoint || event.Principal) {
      await this.createSuppression(
        {
          CommunicationEndpointID: endpoint?.ID ?? null,
          EntityID: endpoint ? null : event.Principal?.EntityID ?? null,
          RecordID: endpoint ? null : event.Principal?.RecordID ?? null,
          CommunicationSenderID: event.CommunicationSenderID ?? null,
          BaseMessageTypeID: endpoint?.BaseMessageTypeID ?? null,
          Reason: 'Spam Complaint',
          Source: event.Source ?? 'Provider Webhook',
          EffectiveAt: event.OccurredAt,
          CommunicationLogID: event.CommunicationLogID ?? null,
        },
        contextUser,
      );
    }
  }

  private async handleUnsubscribed(
    event: NormalizedActivityEvent,
    log: MJCommunicationLogEntity | undefined,
    endpoint: MJCommunicationEndpointEntity | undefined,
    contextUser: UserInfo,
  ): Promise<void> {
    const preferenceID = log?.CommunicationPreferenceID ?? null;
    const senderID = event.CommunicationSenderID ?? null;

    if (event.Principal && preferenceID) {
      // Rule 1: Principal + Preference -> PrincipalPreference Opted Out + scoped suppression
      await this.upsertPrincipalPreferenceOptOut(
        event,
        preferenceID,
        senderID,
        contextUser,
      );
      await this.createSuppression(
        {
          CommunicationEndpointID: endpoint?.ID ?? null,
          EntityID: event.Principal.EntityID,
          RecordID: event.Principal.RecordID,
          CommunicationSenderID: senderID,
          CommunicationPreferenceID: preferenceID,
          BaseMessageTypeID: endpoint?.BaseMessageTypeID ?? null,
          Reason: 'User Unsubscribe',
          Source: event.Source ?? 'Provider Webhook',
          EffectiveAt: event.OccurredAt,
          CommunicationLogID: event.CommunicationLogID ?? null,
          IPAddress: event.IPAddress ?? null,
          UserAgent: event.UserAgent ?? null,
        },
        contextUser,
      );
      return;
    }

    if (event.Principal) {
      // Rule 2: Principal + No Preference -> sender-scoped unsubscribe-all
      await this.createSuppression(
        {
          CommunicationEndpointID: endpoint?.ID ?? null,
          EntityID: event.Principal.EntityID,
          RecordID: event.Principal.RecordID,
          CommunicationSenderID: senderID,
          CommunicationPreferenceID: null,
          BaseMessageTypeID: endpoint?.BaseMessageTypeID ?? null,
          Reason: 'User Unsubscribe',
          Source: event.Source ?? 'Provider Webhook',
          EffectiveAt: event.OccurredAt,
          CommunicationLogID: event.CommunicationLogID ?? null,
          IPAddress: event.IPAddress ?? null,
          UserAgent: event.UserAgent ?? null,
        },
        contextUser,
      );
      return;
    }

    // Rule 3: No Principal -> endpoint suppression only
    if (endpoint) {
      await this.createSuppression(
        {
          CommunicationEndpointID: endpoint.ID,
          EntityID: null,
          RecordID: null,
          CommunicationSenderID: senderID,
          CommunicationPreferenceID: preferenceID,
          BaseMessageTypeID: endpoint.BaseMessageTypeID,
          Reason: 'User Unsubscribe',
          Source: event.Source ?? 'Provider Webhook',
          EffectiveAt: event.OccurredAt,
          CommunicationLogID: event.CommunicationLogID ?? null,
          IPAddress: event.IPAddress ?? null,
          UserAgent: event.UserAgent ?? null,
        },
        contextUser,
      );
    }
  }

  private async upsertPrincipalPreferenceOptOut(
    event: NormalizedActivityEvent,
    preferenceID: string,
    senderID: string | null,
    contextUser: UserInfo,
  ): Promise<void> {
    if (!event.Principal) return;

    const senderClause = senderID
      ? `CommunicationSenderID='${EscapeSQLString(senderID)}'`
      : `CommunicationSenderID IS NULL`;
    const rv = this.getRunView();
    const res = await rv.RunView<MJCommunicationPrincipalPreferenceEntity>(
      {
        EntityName: 'MJ: Communication Principal Preferences',
        ExtraFilter: `EntityID='${EscapeSQLString(event.Principal.EntityID)}' AND RecordID='${EscapeSQLString(event.Principal.RecordID)}' AND CommunicationPreferenceID='${EscapeSQLString(preferenceID)}' AND ${senderClause}`,
        ResultType: 'entity_object',
      },
      contextUser,
    );

    const existing =
      res.Success && res.Results && res.Results.length > 0 ? res.Results[0] : undefined;
    // fls-guard: system-only audit log snapshot persisted internally, never egressed to a caller
    const previousValue = existing ? JSON.stringify(existing.GetAll()) : null;

    const md = this.getProvider();
    const pref =
      existing ??
      (await md.GetEntityObject<MJCommunicationPrincipalPreferenceEntity>(
        'MJ: Communication Principal Preferences',
        contextUser,
      ));

    if (!existing) {
      pref.EntityID = event.Principal.EntityID;
      pref.RecordID = event.Principal.RecordID;
      pref.CommunicationPreferenceID = preferenceID;
      pref.CommunicationSenderID = senderID;
    }

    pref.State = 'Opted Out';
    pref.ConsentSource = event.Source ?? 'Provider Webhook';
    pref.ConsentAt = event.OccurredAt;
    pref.CommunicationLogID = event.CommunicationLogID ?? null;
    pref.IPAddress = event.IPAddress ?? null;
    pref.UserAgent = event.UserAgent ?? null;

    if (!(await pref.Save())) {
      throw new Error(
        `Failed to save Principal Preference opt-out: ${
          pref.LatestResult?.CompleteMessage ?? 'unknown error'
        }`,
      );
    }

    await this.appendConsentAuditLog(
      {
        CommunicationPrincipalPreferenceID: pref.ID,
        Action: existing ? 'Updated' : 'Created',
        PreviousValue: previousValue,
        // fls-guard: system-only audit log snapshot persisted internally, never egressed to a caller
        NewValue: JSON.stringify(pref.GetAll()),
        event,
      },
      contextUser,
    );
  }

  private async appendConsentAuditLog(
    params: {
      CommunicationSuppressionID?: string;
      CommunicationPrincipalPreferenceID?: string;
      Action: MJCommunicationConsentAuditLogEntity['Action'];
      PreviousValue: string | null;
      NewValue: string;
      event: NormalizedActivityEvent;
    },
    contextUser: UserInfo,
  ): Promise<void> {
    const md = this.getProvider();
    const audit = await md.GetEntityObject<MJCommunicationConsentAuditLogEntity>(
      'MJ: Communication Consent Audit Logs',
      contextUser,
    );
    audit.CommunicationSuppressionID = params.CommunicationSuppressionID ?? null;
    audit.CommunicationPrincipalPreferenceID =
      params.CommunicationPrincipalPreferenceID ?? null;
    audit.Action = params.Action;
    audit.PreviousValue = params.PreviousValue;
    audit.NewValue = params.NewValue;
    audit.Source = params.event.Source ?? 'Provider Webhook';
    audit.CommunicationLogID = params.event.CommunicationLogID ?? null;
    audit.IPAddress = params.event.IPAddress ?? null;
    audit.UserAgent = params.event.UserAgent ?? null;
    audit.ChangedAt = params.event.OccurredAt;

    if (!(await audit.Save())) {
      throw new Error(
        `Failed to save Consent Audit Log: ${
          audit.LatestResult?.CompleteMessage ?? 'unknown error'
        }`,
      );
    }
  }

  private async handleEngagement(
    event: NormalizedActivityEvent,
    endpoint: MJCommunicationEndpointEntity | undefined,
  ): Promise<void> {
    if (!endpoint || event.IsMachineEvent) return;
    if (!endpoint.LastEngagedAt || event.OccurredAt > endpoint.LastEngagedAt) {
      endpoint.LastEngagedAt = event.OccurredAt;
      await this.saveEndpoint(endpoint);
    }
  }

  private async saveEndpoint(endpoint: MJCommunicationEndpointEntity): Promise<void> {
    if (!(await endpoint.Save())) {
      throw new Error(
        `Failed to save Communication Endpoint ${endpoint.ID}: ${
          endpoint.LatestResult?.CompleteMessage ?? 'unknown error'
        }`,
      );
    }
  }

  /**
   * Creates an active suppression and its consent audit entry. For use by suppression policy
   * drivers.
   *
   * @param fields - The suppression's scope (endpoint and/or principal, sender, preference,
   *   channel), reason, source and dates.
   * @returns The saved suppression. Throws when the save fails.
   */
  public async CreatePolicySuppression(
    fields: Parameters<CommsActivityWorker['createSuppression']>[0],
    contextUser: UserInfo,
  ): Promise<MJCommunicationSuppressionEntity | undefined> {
    return this.createSuppression(fields, contextUser);
  }

  private async createSuppression(
    fields: {
      CommunicationEndpointID?: string | null;
      EntityID?: string | null;
      RecordID?: string | null;
      CommunicationSenderID?: string | null;
      CommunicationPreferenceID?: string | null;
      BaseMessageTypeID?: string | null;
      Reason: MJCommunicationSuppressionEntity['Reason'];
      Source: MJCommunicationSuppressionEntity['Source'];
      EffectiveAt: Date;
      ExpiresAt?: Date | null;
      CommunicationLogID?: string | null;
      CommunicationSuppressionPolicyID?: string | null;
      IPAddress?: string | null;
      UserAgent?: string | null;
      Notes?: string | null;
    },
    contextUser: UserInfo,
  ): Promise<MJCommunicationSuppressionEntity | undefined> {
    const md = this.getProvider();
    const suppression = await md.GetEntityObject<MJCommunicationSuppressionEntity>(
      'MJ: Communication Suppressions',
      contextUser,
    );
    suppression.CommunicationEndpointID = fields.CommunicationEndpointID ?? null;
    suppression.EntityID = fields.EntityID ?? null;
    suppression.RecordID = fields.RecordID ?? null;
    suppression.CommunicationSenderID = fields.CommunicationSenderID ?? null;
    suppression.CommunicationPreferenceID = fields.CommunicationPreferenceID ?? null;
    suppression.BaseMessageTypeID = fields.BaseMessageTypeID ?? null;
    suppression.Reason = fields.Reason;
    suppression.Source = fields.Source;
    suppression.Status = 'Active';
    suppression.EffectiveAt = fields.EffectiveAt;
    suppression.ExpiresAt = fields.ExpiresAt ?? null;
    suppression.CommunicationLogID = fields.CommunicationLogID ?? null;
    suppression.CommunicationSuppressionPolicyID =
      fields.CommunicationSuppressionPolicyID ?? null;
    suppression.IPAddress = fields.IPAddress ?? null;
    suppression.UserAgent = fields.UserAgent ?? null;
    suppression.Notes = fields.Notes ?? null;

    if (!(await suppression.Save())) {
      throw new Error(
        `Failed to save Communication Suppression: ${
          suppression.LatestResult?.CompleteMessage ?? 'unknown error'
        }`,
      );
    }

    await this.appendConsentAuditLog(
      {
        CommunicationSuppressionID: suppression.ID,
        Action: 'Created',
        PreviousValue: null,
        // fls-guard: system-only audit log snapshot persisted internally, never egressed to a caller
        NewValue: JSON.stringify(suppression.GetAll()),
        event: {
          Source: fields.Source,
          CommunicationLogID: fields.CommunicationLogID ?? undefined,
          IPAddress: fields.IPAddress ?? undefined,
          UserAgent: fields.UserAgent ?? undefined,
          OccurredAt: fields.EffectiveAt,
        } as NormalizedActivityEvent,
      },
      contextUser,
    );

    return suppression;
  }

  private async persistActivityRow(
    event: NormalizedActivityEvent,
    contextUser: UserInfo,
  ): Promise<void> {
    const md = this.getProvider();
    const activity = await md.GetEntityObject<MJCommunicationActivityEntity>(
      'MJ: Communication Activities',
      contextUser,
    );
    activity.CommunicationLogID = event.CommunicationLogID ?? null;
    activity.CommunicationEndpointID = event.CommunicationEndpointID ?? null;
    activity.CommunicationSenderID = event.CommunicationSenderID ?? null;
    activity.CommunicationProviderID = event.CommunicationProviderID;
    activity.EventType = event.EventType;
    activity.OccurredAt = event.OccurredAt;
    activity.ReceivedAt = new Date();
    activity.ProviderEventID = event.ProviderEventID ?? null;
    activity.ProviderMessageID = event.ProviderMessageID ?? null;
    activity.TargetURL = event.TargetURL ?? null;
    activity.BounceCode = event.BounceCode ?? null;
    activity.BounceReason = event.BounceReason ?? null;
    activity.IsMachineEvent = event.IsMachineEvent;
    activity.IPAddress = event.IPAddress ?? null;
    activity.UserAgent = event.UserAgent ?? null;
    activity.CorrelationData = event.CorrelationData
      ? JSON.stringify(event.CorrelationData)
      : null;
    activity.RawPayload = event.RawPayload ? JSON.stringify(event.RawPayload) : null;

    if (!(await activity.Save())) {
      LogError(
        `Failed to save Communication Activity: ${
          activity.LatestResult?.CompleteMessage ?? 'unknown error'
        }`,
      );
    }
  }

  private async dispatchDriverHooks(
    events: NormalizedActivityEvent[],
    contextUser: UserInfo,
  ): Promise<void> {
    if (events.length === 0) return;

    const byEntity = new UUIDMap<NormalizedActivityEvent[]>();
    for (const ev of events) {
      if (!ev.Principal?.EntityID) continue;
      const list = byEntity.Get(ev.Principal.EntityID) ?? [];
      list.push(ev);
      byEntity.Set(ev.Principal.EntityID, list);
    }

    for (const [entityID, entityEvents] of byEntity) {
      const driver = this.getPrincipalDriver(entityID);
      if (driver) {
        try {
          await driver.OnActivity(entityEvents, contextUser);
        } catch (err) {
          LogError(
            `CommsActivityWorker principal driver hook failed (${entityID}): ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      }
    }

    const activePolicies = CommunicationEngineBase.Instance.SuppressionPolicies.filter(
      (p) => p.Status === 'Active',
    );
    let ranSoftBouncePolicy = false;
    for (const policy of activePolicies) {
      if (policy.DriverClass === 'SoftBounceThresholdPolicy' || policy.Name === 'SoftBounceThresholdPolicy') {
        ranSoftBouncePolicy = true;
      }
      let driver =
        MJGlobal.Instance.ClassFactory.CreateInstance<BaseCommunicationSuppressionPolicy>(
          BaseCommunicationSuppressionPolicy,
          policy.DriverClass,
        );
      if (!driver && policy.DriverClass === 'SoftBounceThresholdPolicy') {
        driver = new SoftBounceThresholdPolicy();
      }
      if (!driver || typeof driver.Evaluate !== 'function') continue;

      let params: Record<string, unknown> = {};
      if (policy.Parameters) {
        try {
          params = JSON.parse(policy.Parameters) as Record<string, unknown>;
        } catch {
          params = {};
        }
      }
      try {
        await driver.Evaluate(events, params, contextUser);
      } catch (err) {
        LogError(
          `CommsActivityWorker policy driver '${policy.DriverClass}' failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    if (!ranSoftBouncePolicy && events.some((e) => e.EventType === 'Soft Bounce')) {
      try {
        await new SoftBounceThresholdPolicy().Evaluate(events, {}, contextUser);
      } catch (err) {
        LogError(
          `CommsActivityWorker default SoftBounceThresholdPolicy failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
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

  private async findEndpointForErasure(
    endpointIdOrAddress: string,
    channelID: string,
    contextUser: UserInfo,
  ): Promise<MJCommunicationEndpointEntity | undefined> {
    const trimmed = endpointIdOrAddress.trim();
    if (!trimmed) return undefined;

    const rv = this.getRunView();
    if (UUID_REGEX.test(trimmed)) {
      const byId = await rv.RunView<MJCommunicationEndpointEntity>(
        {
          EntityName: 'MJ: Communication Endpoints',
          ExtraFilter: `ID='${EscapeSQLString(trimmed)}'`,
          ResultType: 'entity_object',
        },
        contextUser,
      );
      if (byId.Success && byId.Results.length > 0) {
        return byId.Results[0];
      }
    }

    const norm = NormalizeEndpointAddress(trimmed);
    const hash = norm?.ValueHash ?? ComputeEndpointHash(trimmed.toLowerCase());
    const byHash = await rv.RunView<MJCommunicationEndpointEntity>(
      {
        EntityName: 'MJ: Communication Endpoints',
        ExtraFilter: `BaseMessageTypeID='${EscapeSQLString(channelID)}' AND ValueHash='${EscapeSQLString(hash)}'`,
        ResultType: 'entity_object',
      },
      contextUser,
    );
    return byHash.Success && byHash.Results.length > 0 ? byHash.Results[0] : undefined;
  }

  private async scrubLogsForEndpoint(
    endpointID: string,
    contextUser: UserInfo,
  ): Promise<{ scrubbedCount: number; logIDs: string[] }> {
    const rv = this.getRunView();
    const res = await rv.RunView<MJCommunicationLogEntity>(
      {
        EntityName: 'MJ: Communication Logs',
        ExtraFilter: `CommunicationEndpointID='${EscapeSQLString(endpointID)}'`,
        ResultType: 'entity_object',
      },
      contextUser,
    );
    if (!res.Success || !res.Results) {
      return { scrubbedCount: 0, logIDs: [] };
    }

    let scrubbedCount = 0;
    const logIDs: string[] = [];
    for (const log of res.Results) {
      logIDs.push(log.ID);
      if (log.RecipientAddress !== null || log.CorrelationData !== null) {
        log.RecipientAddress = null;
        log.CorrelationData = null;
        if (await log.Save()) {
          scrubbedCount++;
        }
      }
    }
    return { scrubbedCount, logIDs };
  }

  private async scrubActivitiesForEndpoint(
    endpointID: string,
    contextUser: UserInfo,
  ): Promise<number> {
    const rv = this.getRunView();
    const res = await rv.RunView<MJCommunicationActivityEntity>(
      {
        EntityName: 'MJ: Communication Activities',
        ExtraFilter: `CommunicationEndpointID='${EscapeSQLString(endpointID)}'`,
        ResultType: 'entity_object',
      },
      contextUser,
    );
    if (!res.Success || !res.Results) return 0;

    let scrubbedCount = 0;
    for (const activity of res.Results) {
      if (
        activity.IPAddress !== null ||
        activity.UserAgent !== null ||
        activity.RawPayload !== null ||
        activity.CorrelationData !== null
      ) {
        activity.IPAddress = null;
        activity.UserAgent = null;
        activity.RawPayload = null;
        activity.CorrelationData = null;
        if (await activity.Save()) {
          scrubbedCount++;
        }
      }
    }
    return scrubbedCount;
  }
}

interface TransactionalProvider {
  BeginTransaction(): Promise<void>;
  CommitTransaction(): Promise<void>;
  RollbackTransaction(): Promise<void>;
}

function isTransactionalProvider(provider: unknown): provider is TransactionalProvider {
  return (
    typeof provider === 'object' &&
    provider !== null &&
    'BeginTransaction' in provider &&
    typeof (provider as { BeginTransaction?: unknown }).BeginTransaction === 'function' &&
    'CommitTransaction' in provider &&
    typeof (provider as { CommitTransaction?: unknown }).CommitTransaction === 'function' &&
    'RollbackTransaction' in provider &&
    typeof (provider as { RollbackTransaction?: unknown }).RollbackTransaction === 'function'
  );
}

/**
 * Built-in policy driver for `SoftBounceThresholdPolicy`: evaluates soft-bounce
 * counts against the configured threshold and creates a cooldown `Policy` suppression.
 */
@RegisterClass(BaseCommunicationSuppressionPolicy, 'SoftBounceThresholdPolicy')
export class SoftBounceThresholdPolicy extends BaseCommunicationSuppressionPolicy {
  public async Evaluate(
    events: NormalizedActivityEvent[],
    parameters: Record<string, unknown>,
    contextUser: UserInfo,
  ): Promise<void> {
    const softBounces = events.filter((e) => e.EventType === 'Soft Bounce' && e.CommunicationEndpointID);
    if (softBounces.length === 0) return;

    const thresholdCandidate = parameters.threshold ?? parameters.Threshold;
    const threshold =
      typeof thresholdCandidate === 'number' && thresholdCandidate > 0
        ? thresholdCandidate
        : DEFAULT_SOFT_BOUNCE_THRESHOLD;

    const expiryCandidate = parameters.cooldownDays ?? parameters.ExpiryDays;
    const expiryDays =
      typeof expiryCandidate === 'number' && expiryCandidate > 0
        ? expiryCandidate
        : DEFAULT_SOFT_BOUNCE_EXPIRY_DAYS;

    const policyId =
      CommunicationEngineBase.Instance.SuppressionPolicies.find(
        (p) =>
          p.Status === 'Active' &&
          (p.DriverClass === 'SoftBounceThresholdPolicy' || p.Name === 'SoftBounceThresholdPolicy'),
      )?.ID ?? null;
    if (!policyId) {
      // CK_CommunicationSuppression_PolicyLink requires a PolicyID when Reason = 'Policy'
      return;
    }

    const endpointIds = Array.from(
      new Set(softBounces.map((e) => e.CommunicationEndpointID as string)),
    );
    const rv = RunView.FromMetadataProvider(CommunicationEngineBase.Instance.ProviderToUse);
    const quoted = endpointIds.map((id) => `'${EscapeSQLString(id)}'`).join(',');
    const epRes = await rv.RunView<MJCommunicationEndpointEntity>(
      {
        EntityName: 'MJ: Communication Endpoints',
        ExtraFilter: `ID IN (${quoted})`,
        ResultType: 'entity_object',
      },
      contextUser,
    );
    if (!epRes.Success || !epRes.Results) return;

    const epMap = new UUIDMap<MJCommunicationEndpointEntity>();
    for (const ep of epRes.Results) {
      epMap.Set(ep.ID, ep);
    }

    const seenEndpoints = new Set<string>();
    const worker = new CommsActivityWorker();
    for (const ev of softBounces) {
      const epId = ev.CommunicationEndpointID as string;
      const key = epId.toLowerCase();
      if (seenEndpoints.has(key)) continue;
      const endpoint = epMap.Get(epId);
      if (!endpoint || endpoint.SoftBounceCount < threshold) continue;

      seenEndpoints.add(key);
      const expiresAt = new Date(ev.OccurredAt.getTime() + expiryDays * MS_PER_DAY);
      await worker.CreatePolicySuppression(
        {
          CommunicationEndpointID: endpoint.ID,
          BaseMessageTypeID: endpoint.BaseMessageTypeID,
          Reason: 'Policy',
          Source: 'Policy',
          EffectiveAt: ev.OccurredAt,
          ExpiresAt: expiresAt,
          CommunicationLogID: ev.CommunicationLogID ?? null,
          CommunicationSuppressionPolicyID: policyId,
          Notes: `Auto-suppressed after ${endpoint.SoftBounceCount} soft bounces`,
        },
        contextUser,
      );
    }
  }
}
