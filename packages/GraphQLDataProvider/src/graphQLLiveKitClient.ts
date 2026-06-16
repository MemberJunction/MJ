import { LogError } from '@memberjunction/core';
import { GraphQLDataProvider } from './graphQLDataProvider';
import { gql } from 'graphql-request';

/**
 * Typed client for the MemberJunction **LiveKit room** GraphQL surface (MJServer
 * `RealtimeBridgeResolver`). Lets a browser obtain a scoped LiveKit access token for an MJ-issued room
 * and, optionally, start an agent's presence in that room — the seam between the generic
 * `@memberjunction/ng-livekit-room` UI and the MJ realtime-bridge infrastructure.
 *
 * @example
 * ```typescript
 * const lk = new GraphQLLiveKitClient(GraphQLDataProvider.Instance);
 * const tok = await lk.MintClientToken({ RoomName: 'support-42', DisplayName: 'Amith' });
 * if (tok.Success) { component.ServerUrl = tok.ServerUrl; component.Token = tok.Token; }
 * ```
 */

/** Input for {@link GraphQLLiveKitClient.MintClientToken}. */
export interface MintLiveKitClientTokenInput {
    /** The room to join. */
    RoomName: string;
    /** The display name to publish (defaults to the current user's name server-side). */
    DisplayName?: string;
}

/** Result of minting a client token. */
export interface LiveKitClientTokenResult {
    /** Whether the operation succeeded. */
    Success: boolean;
    /** Error detail when {@link Success} is false. */
    ErrorMessage?: string;
    /** The LiveKit server URL to connect to. */
    ServerUrl: string;
    /** The signed access token to pass to the room UI. */
    Token: string;
    /** The participant identity embedded in the token. */
    Identity: string;
    /** The room the token authorizes. */
    RoomName: string;
}

/** Input for {@link GraphQLLiveKitClient.StartAgentRoomSession}. */
export interface StartLiveKitAgentRoomSessionInput {
    /** The agent to voice in the room. */
    AgentID?: string;
    /** The agent's display name (bot name + addressing). */
    AgentName?: string;
    /** The room to use. When omitted, the server generates one. */
    RoomName?: string;
    /** The MJ agent-session id. When omitted, the server generates one. */
    AgentSessionID?: string;
    /** Turn-taking mode. */
    TurnMode?: 'Passive' | 'Active' | 'Hybrid';
}

/** Result of starting an agent room session (includes a client token so the caller can immediately join). */
export interface LiveKitAgentRoomSessionResult {
    /** Whether the operation succeeded. */
    Success: boolean;
    /** Error detail when {@link Success} is false. */
    ErrorMessage?: string;
    /** The durable bridge-session row id. */
    SessionBridgeID: string;
    /** The room the agent joined. */
    RoomName: string;
    /** The LiveKit server URL. */
    ServerUrl: string;
    /** A scoped client token for the requesting user to join the same room. */
    ClientToken: string;
    /** The requesting user's participant identity. */
    Identity: string;
}

/** Typed wrapper over the LiveKit room GraphQL mutations. */
export class GraphQLLiveKitClient {
    private _dataProvider: GraphQLDataProvider;

    constructor(dataProvider: GraphQLDataProvider) {
        this._dataProvider = dataProvider;
    }

    /**
     * Mints a scoped LiveKit access token for the current user to join the given room.
     *
     * @param input The room + optional display name.
     * @returns The token + connection coordinates.
     */
    public async MintClientToken(input: MintLiveKitClientTokenInput): Promise<LiveKitClientTokenResult> {
        try {
            const mutation = gql`
                mutation MintLiveKitClientToken($input: MintLiveKitClientTokenInput!) {
                    MintLiveKitClientToken(input: $input) {
                        Success
                        ErrorMessage
                        ServerUrl
                        Token
                        Identity
                        RoomName
                    }
                }
            `;
            const result = await this._dataProvider.ExecuteGQL(mutation, { input });
            const raw: LiveKitClientTokenResult | undefined = result?.MintLiveKitClientToken;
            if (!raw) {
                throw new Error('Invalid response from server');
            }
            return raw;
        } catch (error: unknown) {
            const e = error as Error;
            LogError('GraphQLLiveKitClient.MintClientToken failed', undefined, e);
            return { Success: false, ErrorMessage: e.message || 'Unknown error', ServerUrl: '', Token: '', Identity: '', RoomName: input.RoomName };
        }
    }

    /**
     * Starts (or reuses) an agent's presence in a LiveKit room and returns a client token for the caller.
     *
     * @param input The agent + room parameters.
     * @returns The session handles + a client token to join.
     */
    public async StartAgentRoomSession(input: StartLiveKitAgentRoomSessionInput): Promise<LiveKitAgentRoomSessionResult> {
        try {
            const mutation = gql`
                mutation StartLiveKitAgentRoomSession($input: StartLiveKitAgentRoomSessionInput!) {
                    StartLiveKitAgentRoomSession(input: $input) {
                        Success
                        ErrorMessage
                        SessionBridgeID
                        RoomName
                        ServerUrl
                        ClientToken
                        Identity
                    }
                }
            `;
            const result = await this._dataProvider.ExecuteGQL(mutation, { input });
            const raw: LiveKitAgentRoomSessionResult | undefined = result?.StartLiveKitAgentRoomSession;
            if (!raw) {
                throw new Error('Invalid response from server');
            }
            return raw;
        } catch (error: unknown) {
            const e = error as Error;
            LogError('GraphQLLiveKitClient.StartAgentRoomSession failed', undefined, e);
            return { Success: false, ErrorMessage: e.message || 'Unknown error', SessionBridgeID: '', RoomName: '', ServerUrl: '', ClientToken: '', Identity: '' };
        }
    }
}
