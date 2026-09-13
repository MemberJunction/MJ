import { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { MJAIAgentSessionEntity, MJConversationEntity } from '@memberjunction/core-entities';

/**
 * Parameters for creating an agent session.
 */
export interface CreateSessionInput {
    agentID: string;
    userID: string;
    conversationID?: string;
    lastSessionID?: string;
    config?: string;
}

/**
 * Interface for managing agent session lifecycle from telephony services.
 */
export interface IAgentSessionManager {
    CreateSession(
        input: CreateSessionInput,
        contextUser: UserInfo,
        provider: IMetadataProvider
    ): Promise<MJAIAgentSessionEntity>;
}

/**
 * Default agent session manager for telephony services when no custom host session manager is provided.
 * Directly manages conversation creation and active session record creation.
 */
export class DefaultAgentSessionManager implements IAgentSessionManager {
    public async CreateSession(
        input: CreateSessionInput,
        contextUser: UserInfo,
        provider: IMetadataProvider
    ): Promise<MJAIAgentSessionEntity> {
        let conversationID = input.conversationID;
        if (!conversationID) {
            const conversation = await provider.GetEntityObject<MJConversationEntity>('MJ: Conversations', contextUser);
            conversation.NewRecord();
            conversation.UserID = input.userID;
            conversation.Name = 'Agent Session';
            const savedConv = await conversation.Save();
            if (!savedConv) {
                throw new Error(
                    `Failed to create Conversation for agent session: ${conversation.LatestResult?.CompleteMessage ?? 'unknown error'}`
                );
            }
            conversationID = conversation.ID;
        }

        const session = await provider.GetEntityObject<MJAIAgentSessionEntity>('MJ: AI Agent Sessions', contextUser);
        session.NewRecord();
        session.AgentID = input.agentID;
        session.UserID = input.userID;
        session.ConversationID = conversationID;
        session.Status = 'Active';
        if (input.config) {
            session.Config_ = input.config;
        }
        if (input.lastSessionID) {
            session.LastSessionID = input.lastSessionID;
        }
        const savedSession = await session.Save();
        if (!savedSession) {
            throw new Error(
                `Failed to create agent session record: ${session.LatestResult?.CompleteMessage ?? 'unknown error'}`
            );
        }
        return session;
    }
}
