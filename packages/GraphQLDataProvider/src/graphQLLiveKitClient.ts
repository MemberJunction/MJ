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
  /** The agent to voice in the room (the Realtime Co-Agent / voice front-end). */
  AgentID?: string;
  /** The agent's display name (bot name + addressing). */
  AgentName?: string;
  /** The TARGET agent the co-agent voices — the one being "called". Without it the agent stays idle. */
  TargetAgentID?: string;
  /** Optional per-session Realtime MODEL override (an `MJ: AI Models` Name or ID) — dev model picker. */
  RealtimeModelID?: string;
  /** Optional per-session VOICE override (provider-native voice id, e.g. OpenAI `echo`) — dev voice picker. */
  RealtimeVoice?: string;
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

/** A selectable provider-native voice (dev voice picker). */
export interface RealtimeVoiceOption {
  /** The provider-native voice id sent to the model (e.g. `echo`). */
  ID: string;
  /** The human label shown in the picker (e.g. `Echo`). */
  Name: string;
}

/** An active Realtime model with the voices its driver supports (dev model/voice picker). */
export interface RealtimeModelVoices {
  /** The `MJ: AI Models` row id. */
  ModelID: string;
  /** The model's display name. */
  ModelName: string;
  /** The provider-native voices the model supports (empty when the driver declares none). */
  Voices: RealtimeVoiceOption[];
}

/** Result of a recording (egress) operation. */
export interface LiveKitRecordingResult {
  /** Whether the operation succeeded. */
  Success: boolean;
  /** Error detail when {@link Success} is false. */
  ErrorMessage?: string;
  /** The egress id (pass to {@link GraphQLLiveKitClient.StopRecording}). */
  EgressID: string;
  /** The raw egress status. */
  Status: string;
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

  /**
   * Removes one agent from a room (the bot leaves) — identified by the `SessionBridgeID` from
   * {@link StartAgentRoomSession}. Returns `true` when stopped. Best-effort: any failure resolves `false`.
   *
   * @param sessionBridgeID The agent's bridge row id.
   */
  public async StopAgentRoomSession(sessionBridgeID: string): Promise<boolean> {
    try {
      const mutation = gql`
        mutation StopLiveKitAgentRoomSession($sessionBridgeID: String!) {
          StopLiveKitAgentRoomSession(sessionBridgeID: $sessionBridgeID)
        }
      `;
      const result = await this._dataProvider.ExecuteGQL(mutation, { sessionBridgeID });
      return result?.StopLiveKitAgentRoomSession === true;
    } catch (e: any) {
      LogError('GraphQLLiveKitClient.StopAgentRoomSession failed', undefined, e);
      return false;
    }
  }

  /**
   * Invites MJ users to a room — the server sends each a "Live Room Invite" notification (in-app +
   * MJ Comms when configured) whose in-app entry joins the room when clicked. Best-effort.
   *
   * @param roomName The room to invite into.
   * @param userIDs The `MJ: Users` ids to invite.
   * @returns `true` when at least one invite was delivered.
   */
  public async InviteUsers(roomName: string, userIDs: string[]): Promise<boolean> {
    try {
      const mutation = gql`
        mutation InviteUsersToLiveKitRoom($roomName: String!, $userIDs: [String!]!) {
          InviteUsersToLiveKitRoom(roomName: $roomName, userIDs: $userIDs)
        }
      `;
      const result = await this._dataProvider.ExecuteGQL(mutation, { roomName, userIDs });
      return result?.InviteUsersToLiveKitRoom === true;
    } catch (e: any) {
      LogError('GraphQLLiveKitClient.InviteUsers failed', undefined, e);
      return false;
    }
  }

  /**
   * Fetches active Realtime models with each driver's supported voices — populates the dev model/voice
   * picker. Best-effort: any failure resolves to `[]` so the picker simply offers no overrides.
   *
   * @returns The active realtime models + their voices.
   */
  public async GetRealtimeModelVoices(): Promise<RealtimeModelVoices[]> {
    try {
      const query = gql`
        query GetRealtimeModelVoices {
          GetRealtimeModelVoices {
            ModelID
            ModelName
            Voices {
              ID
              Name
            }
          }
        }
      `;
      const result = await this._dataProvider.ExecuteGQL(query, {});
      return (result?.GetRealtimeModelVoices as RealtimeModelVoices[] | undefined) ?? [];
    } catch (e: any) {
      LogError('GraphQLLiveKitClient.GetRealtimeModelVoices failed', undefined, e);
      return [];
    }
  }

  /**
   * Starts recording a room (server-authorized composite egress).
   *
   * @param roomName The room to record.
   * @param layout Optional composite layout.
   * @returns The recording info (incl. the egress id to stop it later).
   */
  public async StartRecording(roomName: string, layout?: string): Promise<LiveKitRecordingResult> {
    return this.runRecordingMutation(
      gql`
        mutation StartLiveKitRecording($input: LiveKitRecordingInput!) {
          StartLiveKitRecording(input: $input) {
            Success
            ErrorMessage
            EgressID
            Status
          }
        }
      `,
      { input: { RoomName: roomName, Layout: layout } },
      'StartLiveKitRecording',
      '',
    );
  }

  /**
   * Stops a recording by egress id.
   *
   * @param egressID The egress id from {@link StartRecording}.
   * @returns The final recording info.
   */
  public async StopRecording(egressID: string): Promise<LiveKitRecordingResult> {
    return this.runRecordingMutation(
      gql`
        mutation StopLiveKitRecording($egressID: String!) {
          StopLiveKitRecording(egressID: $egressID) {
            Success
            ErrorMessage
            EgressID
            Status
          }
        }
      `,
      { egressID },
      'StopLiveKitRecording',
      egressID,
    );
  }

  /** Runs a recording mutation and normalizes the result/error shape. */
  private async runRecordingMutation(mutation: string, variables: Record<string, unknown>, field: string, egressID: string): Promise<LiveKitRecordingResult> {
    try {
      const result = await this._dataProvider.ExecuteGQL(mutation, variables);
      const raw: LiveKitRecordingResult | undefined = result?.[field];
      if (!raw) {
        throw new Error('Invalid response from server');
      }
      return raw;
    } catch (error: unknown) {
      const e = error as Error;
      LogError(`GraphQLLiveKitClient.${field} failed`, undefined, e);
      return { Success: false, ErrorMessage: e.message || 'Unknown error', EgressID: egressID, Status: '' };
    }
  }
}
