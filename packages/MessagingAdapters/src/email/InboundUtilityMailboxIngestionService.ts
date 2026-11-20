import { IMetadataProvider, LogError, LogStatus, Metadata, RunView, UserInfo } from '@memberjunction/core';
import { BaseSingleton, EscapeSQLString } from '@memberjunction/global';
import { MJAIBridgeAgentIdentityEntity } from '@memberjunction/core-entities';
import { UserCache } from '@memberjunction/generic-database-provider';
import {
    AgentWakeTriggerResult,
    AgentWakeTriggerService,
    InboundUtilityMailboxEmailInput,
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
 * Implemented by Graph/Gmail provider adapters or injected in unit/integration tests.
 */
export interface InboundMailboxFetcher {
    FetchMessages(
        identity: MJAIBridgeAgentIdentityEntity,
        sinceISO: string | null,
        contextUser: UserInfo
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

/**
 * Inbound email channel ingestion coordinator connecting active
 * `MJ: AI Bridge Agent Identities` utility email mailboxes (`IdentityType = 'Email'`, `IsActive = 1`)
 * to {@link AgentWakeTriggerService.RouteInboundUtilityMailboxWake}.
 *
 * Lives in `@memberjunction/messaging-adapters` alongside the Slack and Teams messaging
 * adapters so `@memberjunction/ai-agents` remains transport-agnostic.
 *
 * Supports both:
 * - **Push / Webhook delivery** ({@link HandleWebhookMessage}): invoked by
 *   {@link EmailUtilityMailboxExtension} or provider webhook handlers (Microsoft Graph
 *   change notifications, Gmail push).
 * - **Poll fallback** ({@link PollActiveUtilityMailboxes}): sweeps every active Email
 *   bridge identity via a registered {@link InboundMailboxFetcher}, deduplicates by `messageID`,
 *   and wakes the verified internal sender's agent.
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

    /** Registers the provider-specific mailbox fetcher used by the poll fallback. */
    public RegisterFetcher(fetcher: InboundMailboxFetcher): void {
        this.fetcher = fetcher;
    }

    /** Returns true when a mailbox fetcher has been registered for poll sweeps. */
    public get HasRegisteredFetcher(): boolean {
        return this.fetcher !== null;
    }

    /** Clears in-memory deduplication & watermark state (primarily for tests). */
    public ResetState(): void {
        this.seenMessageIds.clear();
        this.lastPollWatermark.clear();
    }

    /**
     * Processes a single inbound email message delivered by a Graph/Gmail webhook or poller.
     * Deduplicates by `messageID` and routes verified internal senders to
     * {@link AgentWakeTriggerService.RouteInboundUtilityMailboxWake}.
     */
    public async HandleWebhookMessage(
        message: RawInboundMailboxMessage,
        contextUser?: UserInfo,
        metadataProvider?: IMetadataProvider
    ): Promise<{ duplicate: boolean; wakeResult: AgentWakeTriggerResult | null }> {
        const dedupKey = `${message.toAddress.trim().toLowerCase()}::${message.messageID.trim()}`;
        if (message.messageID.trim() && this.seenMessageIds.has(dedupKey)) {
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
        if (message.messageID.trim()) {
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

        if (!activeFetcher) {
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

        for (const identity of identityRes.Results) {
            outcome.identitiesScanned++;
            const sinceISO = this.lastPollWatermark.get(identity.ID) ?? null;
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
