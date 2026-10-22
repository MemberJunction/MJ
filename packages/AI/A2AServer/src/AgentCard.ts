/**
 * The A2A agent card: the public discovery document served at `/a2a/agent-card`.
 *
 * The card is served without authentication, so its reader is anonymous. Entity and agent names
 * are listed only when a service identity is configured (`a2aServerSettings.userEmail`). The names
 * listed are the ones the `entityCapabilities` and `agentCapabilities` settings match; they are not
 * filtered by the service user's permissions, so those settings must name only what may be
 * advertised publicly. Without a service identity the card is minimal: name, description,
 * protocol capabilities and how to authenticate.
 */
import type { UserInfo } from '@memberjunction/core';

/** One entity the card advertises, with the operations allowed on it. */
export interface AgentCardEntityCapability {
    name: string;
    schema: string;
    operations: string[];
}

/** One agent (or the `_general` pseudo-agent) the card advertises, with its operations. */
export interface AgentCardAgentCapability {
    name: string;
    operations: string[];
}

export interface AgentCard {
    name: string;
    description: string;
    version: string;
    endpoints: {
        tasks: string;
        agentCard: string;
    };
    authentication?: {
        type: string;
        scheme: string;
    };
    capabilities: {
        streaming: boolean;
        asynchronous: boolean;
        multimedia: boolean;
        /** Absent on the minimal card. */
        entities?: AgentCardEntityCapability[];
        /** Absent on the minimal card. */
        agents?: AgentCardAgentCapability[];
    };
}

/** The `a2aServerSettings` values the agent card reads. */
export interface AgentCardSettings {
    agentName?: string;
    agentDescription?: string;
    streamingEnabled?: boolean;
    userEmail?: string;
}

/**
 * Who the agent card is built as: no one (the minimal card), the configured service user, or a
 * configured email that matches no user, which is a configuration error rather than a reason to
 * pick some other identity.
 */
export type AgentCardIdentity =
    | { Kind: 'anonymous' }
    | { Kind: 'service'; User: UserInfo }
    | { Kind: 'unresolved'; Email: string };

/**
 * Resolves the identity the agent card is built as from `settings.userEmail`, matched
 * case-insensitively against `users`.
 */
export function ResolveAgentCardIdentity(settings: AgentCardSettings | undefined, users: UserInfo[]): AgentCardIdentity {
    const email = settings?.userEmail?.trim();
    if (!email) {
        return { Kind: 'anonymous' };
    }
    const user = users.find(u => u.Email?.trim().toLowerCase() === email.toLowerCase());
    return user ? { Kind: 'service', User: user } : { Kind: 'unresolved', Email: email };
}

/**
 * Builds the agent card. With no `lists` the card is minimal and carries no entity or agent
 * names; pass the lists only when they were computed as the configured service user.
 */
export function BuildAgentCard(
    settings: AgentCardSettings | undefined,
    lists?: { entities: AgentCardEntityCapability[]; agents: AgentCardAgentCapability[] }
): AgentCard {
    const card: AgentCard = {
        name: settings?.agentName || "MemberJunction",
        description: settings?.agentDescription || "MemberJunction A2A Agent",
        version: "1.0.0",
        endpoints: {
            tasks: `/a2a/tasks`,
            agentCard: `/a2a/agent-card`
        },
        authentication: {
            type: "apiKey",
            scheme: "X-API-Key"
        },
        capabilities: {
            streaming: !!settings?.streamingEnabled,
            asynchronous: false,
            multimedia: false
        }
    };
    if (lists) {
        card.capabilities.entities = lists.entities;
        card.capabilities.agents = lists.agents;
    }
    return card;
}
