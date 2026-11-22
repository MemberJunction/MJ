import crypto from 'node:crypto';
import { IMetadataProvider, LogError, LogStatus, Metadata, RunView, UserInfo } from '@memberjunction/core';
import { BaseSingleton, EscapeSQLString } from '@memberjunction/global';
import { MJAIBridgeAgentIdentityEntity, MJUserSettingEntity } from '@memberjunction/core-entities';
import { UserCache } from '@memberjunction/generic-database-provider';
import {
    AgentWakeTriggerResult,
    AgentWakeTriggerService,
    InboundUtilityMailboxEmailInput,
    WakeStartupGuard,
} from '@memberjunction/ai-agents';

/**
 * Normalized inbound email message produced by a mail provider webhook or poller
 * (Microsoft Graph change notifications, Gmail push, or 1-minute scheduled poll fallback).
 */
export interface RawInboundMailboxMessage {
    messageID: string;
    toAddress: string;
    fromAddress: string;
    subject: string;
    bodyPreview?: string;
    receivedAtISO?: string;
    providerID?: string;
}

/**
 * Abstraction for fetching unseen messages from an active utility mailbox identity.
 * Implemented by {@link CommunicationProviderInboundMailboxFetcher} (Microsoft Graph & Gmail)
 * or {@link InMemoryInboundMailboxFetcher} for unit/integration/UI testing.
 */
export interface InboundMailboxFetcher {
    FetchMessages(
        identity: MJAIBridgeAgentIdentityEntity,
        sinceISO: string | null,
        contextUser: UserInfo
    ): Promise<RawInboundMailboxMessage[]>;

    /** Optional single-message fetch used by hint-mode webhooks (for example Microsoft Graph `resourceData.id`). */
    FetchSingleMessage?(
        toAddress: string,
        messageID: string,
        contextUser: UserInfo,
        providerHint?: string
    ): Promise<RawInboundMailboxMessage | null>;

    /** Optional mailbox-address sweep used by hint-mode webhooks (for example Gmail Pub/Sub `{ emailAddress, historyId }`). */
    FetchMessagesForMailbox?(
        toAddress: string,
        sinceISO: string | null,
        contextUser: UserInfo,
        providerHint?: string
    ): Promise<RawInboundMailboxMessage[]>;
}

/**
 * Result of a single inbound mailbox ingestion sweep or webhook dispatch.
 */
export interface InboundMailboxIngestionResult {
    identitiesScanned: number;
    messagesSeen: number;
    wakesScheduled: number;
    duplicatesSkipped: number;
    rejectedCount: number;
    results: AgentWakeTriggerResult[];
}

const DEDUP_SETTING_PREFIX = 'cos.inbound-email.dedup.';

function isDuplicateConstraintFailure(message: string): boolean {
    const lower = message.toLowerCase();
    return (
        lower.includes('unique') ||
        lower.includes('duplicate') ||
        lower.includes('2627') ||
        lower.includes('2601') ||
        lower.includes('23505') ||
        lower.includes('uq_') ||
        lower.includes('constraint')
    );
}

/**
 * Inbound email channel ingestion coordinator connecting active
 * `MJ: AI Bridge Agent Identities` utility email mailboxes (`IdentityType = 'Email'`, `IsActive = 1`)
 * to {@link AgentWakeTriggerService.RouteInboundUtilityMailboxWake}.
 *
 * Deduplication uses two layers:
 * - **L1**: bounded in-memory LRU set (5,000 entries) for zero-latency duplicate filtering.
 * - **L2**: durable DB-backed claim stored in `MJ: User Settings` under System User
 *   (`Setting = 'cos.inbound-email.dedup.<sha256(toAddress::messageID)>'`) so deduplication
 *   survives process restarts and multi-instance concurrency without requiring a new table.
 */
export class InboundUtilityMailboxIngestionService extends BaseSingleton<InboundUtilityMailboxIngestionService> {
    private static readonly MAX_SEEN_IDS = 5_000;
    private readonly seenMessageIds = new Set<string>();
    private readonly lastPollWatermark = new Map<string, string>();
    private fetcher: InboundMailboxFetcher | null = null;

    public constructor() {
        super();
    }

    public static get Instance(): InboundUtilityMailboxIngestionService {
        return InboundUtilityMailboxIngestionService.getInstance<InboundUtilityMailboxIngestionService>();
    }

    /**
     * Computes the deterministic `MJ: User Settings.Setting` key used for durable DB deduplication
     * of `(toAddress, messageID)` pairs. Length is 88 chars (prefix + 64-hex SHA-256).
     */
    public static BuildDedupSettingKey(toAddress: string, messageID: string): string {
        const normalized = `${toAddress.trim().toLowerCase()}::${messageID.trim()}`;
        const digest = crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
        return `${DEDUP_SETTING_PREFIX}${digest}`;
    }

    /** Registers the provider-specific mailbox fetcher used by the poll fallback and hint-mode webhooks. */
    public RegisterFetcher(fetcher: InboundMailboxFetcher): void {
        this.fetcher = fetcher;
    }

    /** Clears the currently registered fetcher (primarily for tests). */
    public ClearFetcher(): void {
        this.fetcher = null;
    }

    /** Returns the currently registered mailbox fetcher, or `null` when none is registered. */
    public get RegisteredFetcher(): InboundMailboxFetcher | null {
        return this.fetcher;
    }

    /** Returns true when a mailbox fetcher has been registered for poll sweeps. */
    public get HasRegisteredFetcher(): boolean {
        return this.fetcher !== null;
    }

    /** Clears in-memory L1 deduplication & watermark state (primarily for tests). */
    public ResetState(): void {
        this.seenMessageIds.clear();
        this.lastPollWatermark.clear();
    }

    /**
     * Processes a single inbound email message delivered by a Graph/Gmail webhook or poller.
     * Deduplicates across both L1 memory and L2 `MJ: User Settings` durable storage before
     * routing verified internal senders to {@link AgentWakeTriggerService.RouteInboundUtilityMailboxWake}.
     */
    public async HandleWebhookMessage(
        message: RawInboundMailboxMessage,
        contextUser?: UserInfo,
        metadataProvider?: IMetadataProvider
    ): Promise<{ duplicate: boolean; wakeResult: AgentWakeTriggerResult | null }> {
        const trimmedMsgId = message.messageID.trim();
        const normalizedTo = message.toAddress.trim().toLowerCase();
        const dedupKey = `${normalizedTo}::${trimmedMsgId}`;
        if (trimmedMsgId && this.seenMessageIds.has(dedupKey)) {
            return { duplicate: true, wakeResult: null };
        }

        const effectiveUser = contextUser ?? UserCache.Instance.GetSystemUser();
        if (!effectiveUser) {
            LogError('[InboundUtilityMailboxIngestionService] No contextUser or cached system user available.');
            return {
                duplicate: false,
                wakeResult: {
                    triggered: false,
                    resultCode: 'POLICY_DENIED',
                    reason: 'No system user or contextUser available to route inbound utility mailbox email.',
                    routineID: null,
                    targetUserID: null,
                    targetAgentID: null,
                    workstreamKey: null,
                    nextRunAtISO: null,
                },
            };
        }

        const md: IMetadataProvider | undefined = metadataProvider ?? Metadata.Provider;
        if (trimmedMsgId && md) {
            const dedupOwner = UserCache.Instance.GetSystemUser() ?? effectiveUser;
            const claimedOrDuplicate = await this.claimDurableDedup(
                normalizedTo,
                trimmedMsgId,
                message.receivedAtISO,
                dedupOwner,
                md
            );
            if (claimedOrDuplicate === 'duplicate') {
                this.rememberMessageId(dedupKey);
                return { duplicate: true, wakeResult: null };
            }
        }

        const input: InboundUtilityMailboxEmailInput = {
            toAddress: message.toAddress,
            fromAddress: message.fromAddress,
            subject: message.subject,
            bodyPreview: message.bodyPreview,
            messageID: message.messageID,
            receivedAtISO: message.receivedAtISO,
            providerID: message.providerID,
            systemContextUser: effectiveUser,
            metadataProvider,
        };

        const wakeResult = await AgentWakeTriggerService.Instance.RouteInboundUtilityMailboxWake(input);
        if (trimmedMsgId) {
            this.rememberMessageId(dedupKey);
        }
        return { duplicate: false, wakeResult };
    }

    /**
     * Sweeps all active `MJ: AI Bridge Agent Identities` with `IdentityType = 'Email'`
     * using the registered {@link InboundMailboxFetcher} (or an explicit per-call `fetcherOverride`).
     */
    public async PollActiveUtilityMailboxes(
        contextUser?: UserInfo,
        metadataProvider?: IMetadataProvider,
        fetcherOverride?: InboundMailboxFetcher
    ): Promise<InboundMailboxIngestionResult> {
        const activeFetcher = fetcherOverride ?? this.fetcher;
        const outcome: InboundMailboxIngestionResult = {
            identitiesScanned: 0,
            messagesSeen: 0,
            wakesScheduled: 0,
            duplicatesSkipped: 0,
            rejectedCount: 0,
            results: [],
        };

        if (!activeFetcher || WakeStartupGuard.Instance.IsStartupInProgress()) {
            return outcome;
        }

        const effectiveUser = contextUser ?? UserCache.Instance.GetSystemUser();
        if (!effectiveUser) {
            LogError('[InboundUtilityMailboxIngestionService] Poll skipped: no system user available.');
            return outcome;
        }

        const md = metadataProvider ?? Metadata.Provider;
        const rv = RunView.FromMetadataProvider(md);
        const identityRes = await rv.RunView<MJAIBridgeAgentIdentityEntity>(
            {
                EntityName: 'MJ: AI Bridge Agent Identities',
                ExtraFilter: `IsActive=1 AND IdentityType='${EscapeSQLString('Email')}'`,
                ResultType: 'entity_object',
            },
            effectiveUser
        );

        if (!identityRes.Success || identityRes.Results.length === 0) {
            return outcome;
        }

        const startupBaselineISO = WakeStartupGuard.Instance.BaselineWatermark?.toISOString() ?? null;
        for (const identity of identityRes.Results) {
            outcome.identitiesScanned++;
            const sinceISO = this.lastPollWatermark.get(identity.ID) ?? startupBaselineISO;
            const pollStartedISO = new Date().toISOString();
            try {
                const messages = await activeFetcher.FetchMessages(identity, sinceISO, effectiveUser);
                for (const msg of messages) {
                    outcome.messagesSeen++;
                    const dispatched = await this.HandleWebhookMessage(msg, effectiveUser, md);
                    if (dispatched.duplicate) {
                        outcome.duplicatesSkipped++;
                        continue;
                    }
                    if (dispatched.wakeResult) {
                        outcome.results.push(dispatched.wakeResult);
                        if (dispatched.wakeResult.triggered) {
                            outcome.wakesScheduled++;
                        } else {
                            outcome.rejectedCount++;
                        }
                    }
                }
                this.lastPollWatermark.set(identity.ID, pollStartedISO);
            } catch (error) {
                LogError(
                    `[InboundUtilityMailboxIngestionService] Failed polling mailbox identity "${identity.IdentityValue}": ${
                        error instanceof Error ? error.message : String(error)
                    }`
                );
            }
        }

        if (outcome.wakesScheduled > 0) {
            LogStatus(
                `[InboundUtilityMailboxIngestionService] Scheduled ${outcome.wakesScheduled} wake(s) across ${outcome.identitiesScanned} utility mailbox(es).`
            );
        }

        return outcome;
    }

    /**
     * Checks and atomically claims the durable `MJ: User Settings` dedup record under System User.
     * Returns `'duplicate'` if the message was already processed (including when another server
     * instance wins a concurrent insert race), or `'claimed'` when this call may proceed.
     */
    private async claimDurableDedup(
        normalizedTo: string,
        messageID: string,
        receivedAtISO: string | undefined,
        ownerUser: UserInfo,
        md: IMetadataProvider
    ): Promise<'claimed' | 'duplicate'> {
        const settingKey = InboundUtilityMailboxIngestionService.BuildDedupSettingKey(normalizedTo, messageID);
        if (await this.existsDurableDedupRecord(ownerUser, settingKey, md)) {
            return 'duplicate';
        }

        if (typeof md.GetEntityObject !== 'function') {
            return 'claimed';
        }

        try {
            const settingEntity = await md.GetEntityObject<MJUserSettingEntity>('MJ: User Settings', ownerUser);
            if (!settingEntity) {
                return 'claimed';
            }
            if (typeof settingEntity.NewRecord === 'function') {
                settingEntity.NewRecord();
            }
            settingEntity.UserID = ownerUser.ID;
            settingEntity.Setting = settingKey;
            settingEntity.Value = JSON.stringify({
                receivedAt: receivedAtISO ?? new Date().toISOString(),
                toAddress: normalizedTo,
                messageID,
            });

            const saved = await settingEntity.Save();
            if (saved) {
                return 'claimed';
            }

            const saveErr = settingEntity.LatestResult?.CompleteMessage ?? '';
            if (
                isDuplicateConstraintFailure(saveErr) ||
                (await this.existsDurableDedupRecord(ownerUser, settingKey, md))
            ) {
                return 'duplicate';
            }
            LogError(
                `[InboundUtilityMailboxIngestionService] Failed saving durable dedup key "${settingKey}": ${saveErr || 'unknown error'}`
            );
            return 'claimed';
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            if (
                isDuplicateConstraintFailure(msg) ||
                (await this.existsDurableDedupRecord(ownerUser, settingKey, md))
            ) {
                return 'duplicate';
            }
            LogError(`[InboundUtilityMailboxIngestionService] Durable dedup error for "${settingKey}": ${msg}`);
            return 'claimed';
        }
    }

    private async existsDurableDedupRecord(
        ownerUser: UserInfo,
        settingKey: string,
        md: IMetadataProvider
    ): Promise<boolean> {
        try {
            const rv = RunView.FromMetadataProvider(md);
            const res = await rv.RunView<{ ID?: string; Setting?: string }>(
                {
                    EntityName: 'MJ: User Settings',
                    ExtraFilter: `UserID='${EscapeSQLString(ownerUser.ID)}' AND Setting='${EscapeSQLString(settingKey)}'`,
                    Fields: ['ID', 'Setting'],
                    MaxRows: 1,
                    SkipTotalRowCount: true,
                    ResultType: 'simple',
                },
                ownerUser
            );
            if (!res.Success || !Array.isArray(res.Results) || res.Results.length === 0) {
                return false;
            }
            return res.Results.some((row) => typeof row.Setting === 'string' && row.Setting === settingKey);
        } catch {
            return false;
        }
    }

    private rememberMessageId(key: string): void {
        if (this.seenMessageIds.size >= InboundUtilityMailboxIngestionService.MAX_SEEN_IDS) {
            const first = this.seenMessageIds.values().next().value;
            if (first !== undefined) {
                this.seenMessageIds.delete(first);
            }
        }
        this.seenMessageIds.add(key);
    }
}
