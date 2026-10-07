/**
 * @fileoverview `CreateBridgeSessionTranscriptSink` — persists a bridged call's transcript into the
 * `MJ: Conversations` row that belongs to THAT session.
 *
 * The room sink ({@link CreateBridgeRoomTranscriptSink}) is the right shape for a multi-party meeting: one
 * "Meeting Room" conversation per room, written by an elected scribe. A phone call is the opposite — one
 * session, one remote party, a conversation the session manager already created. Routing a call through the
 * room sink wrote its transcript into a separate global conversation owned by the system user while the call's
 * own conversation stayed empty. This sink writes each final line to the session's own conversation, in order,
 * the same way the browser path does (`AgentSessionID` and `UserID` stamped on every turn).
 *
 * @module @memberjunction/ai-agents
 * @author MemberJunction.com
 */

import { IMetadataProvider, LogError, UserInfo } from '@memberjunction/core';
import { MJConversationDetailEntity } from '@memberjunction/core-entities';
import type { BridgeRoomTranscriptSink, BridgeTranscriptLineInput } from './bridge-room-transcript-sink';

/** What identifies the conversation a session's transcript belongs to. */
export interface BridgeSessionTranscriptSinkOptions {
    /** The `MJ: Conversations` row to write turns into (the one the session manager created for the call). */
    ConversationID: string;
    /** The `MJ: AI Agent Sessions` row the turns belong to. */
    AgentSessionID: string;
    /**
     * The agent attributed on the agent's own turns. Defaults to the line's agent (the voicing co-agent); a call
     * passes the TARGET agent instead, since that is the persona the caller believes they are talking to.
     */
    AgentID?: string;
}

const CONVERSATION_DETAIL_ENTITY = 'MJ: Conversation Details';

/**
 * Builds a transcript sink bound to one session's conversation. Pass the result as
 * `StartBridgeSessionParams.TranscriptSink`. Writes are serialized so turns land in the order they were spoken,
 * and a failed write is logged without blocking the ones behind it.
 *
 * @param options The conversation, session and (optional) agent attribution.
 * @returns The sink.
 */
export function CreateBridgeSessionTranscriptSink(options: BridgeSessionTranscriptSinkOptions): BridgeRoomTranscriptSink {
    let chain: Promise<void> = Promise.resolve();
    return (line, contextUser, provider) => {
        if (!contextUser || !provider) {
            return Promise.resolve(); // a server-side write needs a user + provider
        }
        const write = chain.then(() => WriteSessionTurn(options, line, contextUser, provider));
        chain = write.then(() => undefined, () => undefined);
        return write;
    };
}

/** Writes one `MJ: Conversation Details` row for a final transcript line. Never throws. */
async function WriteSessionTurn(
    options: BridgeSessionTranscriptSinkOptions,
    line: BridgeTranscriptLineInput,
    contextUser: UserInfo,
    provider: IMetadataProvider,
): Promise<void> {
    try {
        const detail = await provider.GetEntityObject<MJConversationDetailEntity>(CONVERSATION_DETAIL_ENTITY, contextUser);
        detail.NewRecord();
        detail.ConversationID = options.ConversationID;
        detail.Role = line.IsAgentSpeech ? 'AI' : 'User';
        detail.Message = line.Text;
        detail.AgentSessionID = options.AgentSessionID;
        detail.UserID = contextUser.ID;
        const agentID = options.AgentID ?? line.AgentID;
        if (line.IsAgentSpeech && agentID) {
            detail.AgentID = agentID;
        }
        if (!(await detail.Save())) {
            LogError(`CreateBridgeSessionTranscriptSink: failed to write a transcript turn for session ${options.AgentSessionID}: ${detail.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }
    } catch (error) {
        LogError(`CreateBridgeSessionTranscriptSink: transcript write threw for session ${options.AgentSessionID}: ${error instanceof Error ? error.message : String(error)}`);
    }
}
