import { LogError, UserInfo } from '@memberjunction/core';
import { MJAIBridgeAgentIdentityEntity } from '@memberjunction/core-entities';
import { CommunicationEngine } from '@memberjunction/communication-engine';
import { BaseCommunicationProvider, GetMessageMessage } from '@memberjunction/communication-types';
import { SafeJSONParse } from '@memberjunction/global';
import {
    InboundMailboxFetcher,
    RawInboundMailboxMessage,
} from './InboundUtilityMailboxIngestionService.js';

/** Canonical MJ communication provider names supported by {@link CommunicationProviderInboundMailboxFetcher}. */
export type SupportedInboundMailProviderName = 'Microsoft Graph' | 'Gmail';

/** Optional configuration keys read from `MJAIBridgeAgentIdentityEntity.Configuration`. */
interface BridgeIdentityMailConfig {
    communicationProviderName?: string;
    providerName?: string;
    provider?: string;
    unreadOnly?: boolean;
    markAsRead?: boolean;
}

/** Configuration options for {@link CommunicationProviderInboundMailboxFetcher}. */
export interface CommunicationProviderInboundMailboxFetcherOptions {
    /** Ordered preference of active mail providers when an identity does not pin one explicitly. */
    preferredProviders?: readonly SupportedInboundMailProviderName[];
    /** Maximum messages fetched per poll sweep per utility mailbox (default 25). */
    maxMessagesPerPoll?: number;
    /** Whether to request unread messages only from the mail provider (default false; dedup filters repeats). */
    unreadOnly?: boolean;
    /** Whether to mark fetched messages as read in the utility mailbox (default false). */
    markAsRead?: boolean;
    /** Optional provider resolver override (primarily for deterministic unit tests). */
    providerResolver?: (
        providerName: SupportedInboundMailProviderName,
        contextUser: UserInfo
    ) => Promise<BaseCommunicationProvider | null>;
}

/**
 * Extracts a bare lowercase email address from either `"alice@example.com"` or RFC-2822
 * `"Alice Executive <alice@example.com>"`.
 */
export function ExtractBareEmailAddress(raw: string | null | undefined): string {
    if (!raw) {
        return '';
    }
    const trimmed = raw.trim();
    const angleMatch = trimmed.match(/<([^<>@\s]+@[^<>@\s]+)>/);
    if (angleMatch && angleMatch[1]) {
        return angleMatch[1].trim().toLowerCase();
    }
    return trimmed.toLowerCase();
}

/**
 * Normalizes provider aliases (`MSGraph`, `Microsoft Graph`, `Gmail`, `Google Mail`) into
 * canonical `MJ: Communication Providers.Name` values.
 */
export function NormalizeInboundMailProviderName(
    raw: string | null | undefined
): SupportedInboundMailProviderName | null {
    if (!raw) {
        return null;
    }
    const lower = raw.trim().toLowerCase();
    if (
        lower === 'microsoft graph' ||
        lower === 'msgraph' ||
        lower === 'ms graph' ||
        lower === 'microsoft_graph' ||
        lower === 'graph'
    ) {
        return 'Microsoft Graph';
    }
    if (lower === 'gmail' || lower === 'google mail' || lower === 'google') {
        return 'Gmail';
    }
    return null;
}

/**
 * Production {@link InboundMailboxFetcher} backed by MJ's {@link CommunicationEngine} and
 * {@link BaseCommunicationProvider.GetMessages} / `GetSingleMessage`, supporting both
 * **Microsoft Graph (`MSGraph`)** and **Gmail (`Gmail`)** utility mailboxes.
 */
export class CommunicationProviderInboundMailboxFetcher implements InboundMailboxFetcher {
    private readonly preferredProviders: readonly SupportedInboundMailProviderName[];
    private readonly maxMessagesPerPoll: number;
    private readonly unreadOnly: boolean;
    private readonly markAsRead: boolean;
    private readonly providerResolver?: CommunicationProviderInboundMailboxFetcherOptions['providerResolver'];

    public constructor(options: CommunicationProviderInboundMailboxFetcherOptions = {}) {
        this.preferredProviders = options.preferredProviders ?? ['Microsoft Graph', 'Gmail'];
        this.maxMessagesPerPoll = Math.max(1, Math.min(100, options.maxMessagesPerPoll ?? 25));
        this.unreadOnly = options.unreadOnly ?? false;
        this.markAsRead = options.markAsRead ?? false;
        this.providerResolver = options.providerResolver;
    }

    public async FetchMessages(
        identity: MJAIBridgeAgentIdentityEntity,
        sinceISO: string | null,
        contextUser: UserInfo
    ): Promise<RawInboundMailboxMessage[]> {
        const mailboxAddress = (identity.IdentityValue ?? '').trim();
        if (!mailboxAddress) {
            return [];
        }

        const cfg = identity.Configuration
            ? SafeJSONParse<BridgeIdentityMailConfig>(identity.Configuration)
            : null;
        const explicitProvider =
            NormalizeInboundMailProviderName(cfg?.communicationProviderName) ??
            NormalizeInboundMailProviderName(cfg?.providerName) ??
            NormalizeInboundMailProviderName(cfg?.provider) ??
            NormalizeInboundMailProviderName(identity.Provider);

        return this.fetchMailboxInternal(
            mailboxAddress,
            sinceISO,
            contextUser,
            explicitProvider ?? undefined,
            identity.ProviderID ?? undefined,
            cfg?.unreadOnly ?? this.unreadOnly,
            cfg?.markAsRead ?? this.markAsRead
        );
    }

    public async FetchMessagesForMailbox(
        toAddress: string,
        sinceISO: string | null,
        contextUser: UserInfo,
        providerHint?: string
    ): Promise<RawInboundMailboxMessage[]> {
        const mailboxAddress = toAddress.trim();
        if (!mailboxAddress) {
            return [];
        }
        return this.fetchMailboxInternal(
            mailboxAddress,
            sinceISO,
            contextUser,
            NormalizeInboundMailProviderName(providerHint) ?? undefined,
            undefined,
            this.unreadOnly,
            this.markAsRead
        );
    }

    public async FetchSingleMessage(
        toAddress: string,
        messageID: string,
        contextUser: UserInfo,
        providerHint?: string
    ): Promise<RawInboundMailboxMessage | null> {
        const mailboxAddress = toAddress.trim();
        const trimmedMsgId = messageID.trim();
        if (!mailboxAddress || !trimmedMsgId) {
            return null;
        }

        const resolved = await this.resolveProviderInstance(
            contextUser,
            NormalizeInboundMailProviderName(providerHint) ?? undefined
        );
        if (!resolved) {
            return null;
        }

        const { provider } = resolved;
        if (typeof provider.GetSingleMessage === 'function' && provider.supportsOperation('GetSingleMessage')) {
            try {
                const res = await provider.GetSingleMessage({
                    MessageID: trimmedMsgId,
                    ContextData: { Email: mailboxAddress },
                });
                if (res.Success && res.Message) {
                    const mapped = this.mapProviderMessage(res.Message, mailboxAddress, undefined);
                    if (mapped) {
                        return mapped;
                    }
                }
            } catch (error) {
                LogError(
                    `[CommunicationProviderInboundMailboxFetcher] GetSingleMessage("${trimmedMsgId}") failed for ${mailboxAddress}: ${
                        error instanceof Error ? error.message : String(error)
                    }`
                );
            }
        }

        // Fallback: fetch recent messages and find by ID
        const recent = await this.fetchMailboxInternal(
            mailboxAddress,
            null,
            contextUser,
            resolved.providerName,
            undefined,
            false,
            this.markAsRead
        );
        return recent.find((m) => m.messageID === trimmedMsgId) ?? null;
    }

    private async fetchMailboxInternal(
        mailboxAddress: string,
        sinceISO: string | null,
        contextUser: UserInfo,
        preferredName: SupportedInboundMailProviderName | undefined,
        bridgeProviderID: string | undefined,
        unreadOnly: boolean,
        markAsRead: boolean
    ): Promise<RawInboundMailboxMessage[]> {
        const resolved = await this.resolveProviderInstance(contextUser, preferredName);
        if (!resolved) {
            return [];
        }

        const receivedAfter = sinceISO ? new Date(sinceISO) : undefined;
        const validReceivedAfter =
            receivedAfter && !Number.isNaN(receivedAfter.getTime()) ? receivedAfter : undefined;

        const result = await resolved.provider.GetMessages({
            Identifier: mailboxAddress,
            NumMessages: this.maxMessagesPerPoll,
            UnreadOnly: unreadOnly,
            ...(validReceivedAfter ? { ReceivedAfter: validReceivedAfter } : {}),
            ContextData: {
                Email: mailboxAddress,
                ReturnAsPlainText: true,
                MarkAsRead: markAsRead,
            },
        });

        if (!result.Success || !Array.isArray(result.Messages)) {
            if (result.ErrorMessage) {
                LogError(
                    `[CommunicationProviderInboundMailboxFetcher] ${resolved.providerName} GetMessages failed for "${mailboxAddress}": ${result.ErrorMessage}`
                );
            }
            return [];
        }

        const mapped: RawInboundMailboxMessage[] = [];
        for (const msg of result.Messages) {
            const normalized = this.mapProviderMessage(msg, mailboxAddress, bridgeProviderID);
            if (normalized) {
                mapped.push(normalized);
            }
        }
        return mapped;
    }

    private mapProviderMessage(
        msg: GetMessageMessage,
        mailboxAddress: string,
        bridgeProviderID: string | undefined
    ): RawInboundMailboxMessage | null {
        const normalizedMailbox = mailboxAddress.trim().toLowerCase();
        if (msg.Direction === 'Outbound') {
            return null;
        }
        const fromAddress = ExtractBareEmailAddress(msg.From);
        if (!fromAddress || fromAddress === normalizedMailbox) {
            return null;
        }

        const bodyText = typeof msg.Body === 'string' ? msg.Body.trim() : '';
        const receivedAt = msg.ReceivedAt ?? msg.CreatedAt ?? undefined;
        return {
            messageID: (msg.ExternalSystemRecordID ?? '').trim(),
            toAddress: mailboxAddress.trim(),
            fromAddress,
            subject: (msg.Subject ?? '').trim(),
            bodyPreview: bodyText.slice(0, 1000),
            ...(receivedAt ? { receivedAtISO: receivedAt.toISOString() } : {}),
            ...(bridgeProviderID ? { providerID: bridgeProviderID } : {}),
        };
    }

    private async resolveProviderInstance(
        contextUser: UserInfo,
        explicitName?: SupportedInboundMailProviderName
    ): Promise<{ providerName: SupportedInboundMailProviderName; provider: BaseCommunicationProvider } | null> {
        const candidates: SupportedInboundMailProviderName[] = explicitName
            ? [explicitName]
            : [...this.preferredProviders];

        if (this.providerResolver) {
            for (const name of candidates) {
                const resolved = await this.providerResolver(name, contextUser);
                if (resolved) {
                    return { providerName: name, provider: resolved };
                }
            }
            return null;
        }

        await CommunicationEngine.Instance.Config(false, contextUser);
        const activeNames = new Set(
            CommunicationEngine.Instance.Providers.filter((p) => p.Status === 'Active').map((p) =>
                p.Name.trim().toLowerCase()
            )
        );

        for (const name of candidates) {
            if (!activeNames.has(name.toLowerCase())) {
                continue;
            }
            try {
                const provider = CommunicationEngine.Instance.GetProvider(name);
                if (provider) {
                    return { providerName: name, provider };
                }
            } catch {
                // Provider class not loaded in this server process; continue to next candidate
            }
        }
        return null;
    }
}

/**
 * Pluggable in-memory {@link InboundMailboxFetcher} helper for unit tests, integration tests,
 * and local live UI testing without requiring live Microsoft Graph or Gmail credentials.
 */
export class InMemoryInboundMailboxFetcher implements InboundMailboxFetcher {
    private readonly messagesByMailbox = new Map<string, RawInboundMailboxMessage[]>();

    public SetMessages(toAddress: string, messages: RawInboundMailboxMessage[]): void {
        this.messagesByMailbox.set(toAddress.trim().toLowerCase(), [...messages]);
    }

    public AddMessages(toAddress: string, messages: RawInboundMailboxMessage[]): void {
        const key = toAddress.trim().toLowerCase();
        const existing = this.messagesByMailbox.get(key) ?? [];
        this.messagesByMailbox.set(key, [...existing, ...messages]);
    }

    public Clear(): void {
        this.messagesByMailbox.clear();
    }

    public async FetchMessages(
        identity: MJAIBridgeAgentIdentityEntity,
        sinceISO: string | null,
        contextUser: UserInfo
    ): Promise<RawInboundMailboxMessage[]> {
        return this.FetchMessagesForMailbox(identity.IdentityValue ?? '', sinceISO, contextUser);
    }

    public async FetchMessagesForMailbox(
        toAddress: string,
        sinceISO: string | null,
        _contextUser: UserInfo
    ): Promise<RawInboundMailboxMessage[]> {
        const list = this.messagesByMailbox.get(toAddress.trim().toLowerCase()) ?? [];
        if (!sinceISO) {
            return [...list];
        }
        const sinceMs = new Date(sinceISO).getTime();
        if (Number.isNaN(sinceMs)) {
            return [...list];
        }
        return list.filter((m) => !m.receivedAtISO || new Date(m.receivedAtISO).getTime() >= sinceMs);
    }

    public async FetchSingleMessage(
        toAddress: string,
        messageID: string,
        _contextUser: UserInfo
    ): Promise<RawInboundMailboxMessage | null> {
        const list = this.messagesByMailbox.get(toAddress.trim().toLowerCase()) ?? [];
        return list.find((m) => m.messageID.trim() === messageID.trim()) ?? null;
    }
}
