/**
 * @fileoverview {@link LiveKitParticipantService} — changes a participant in a live room through LiveKit's
 * `RoomServiceClient` (`livekit-server-sdk`). Today it records whether a person lets agents see their camera and shared
 * screen. A participant's token can't change its own attributes: MJ's tokens carry no `canUpdateOwnMetadata`, because
 * the same right would let anyone rename themselves and rewrite the metadata that carries their role. So the server
 * sets the attribute for them, once MJAPI has worked out who is asking.
 *
 * @module @memberjunction/livekit-room-server
 */

import { RoomServiceClient, TwirpError } from 'livekit-server-sdk';
import { AgentVisionAttributes } from '@memberjunction/ai';
import { LiveKitTokenService, type LiveKitServerConfig } from './livekit-token-service';
import { WsToHttpUrl } from './livekit-egress-service';

/** The subset of {@link RoomServiceClient} the service drives — an injectable seam for unit testing. */
export type ParticipantUpdateClientLike = Pick<RoomServiceClient, 'updateParticipant'>;

/** The outcome of changing a participant. */
export interface ParticipantUpdateResult {
  /** Whether LiveKit applied the change. */
  Success: boolean;
  /** `true` when LiveKit refused because that participant (or the room) does not exist. */
  NotInRoom?: boolean;
  /** What went wrong, when it failed. */
  ErrorMessage?: string;
}

/** Changes participants in live LiveKit rooms, on the server's authority. */
export class LiveKitParticipantService {
  private readonly configured: boolean;
  private readonly client: ParticipantUpdateClientLike;

  /**
   * @param config Explicit credentials; omitted fields fall back to environment variables (via
   *   {@link LiveKitTokenService}). The room service client uses the HTTP(S) form of the server URL.
   * @param client An injectable room service client (primarily for unit testing); defaults to a real
   *   `RoomServiceClient` built from the resolved credentials.
   */
  constructor(config?: Partial<LiveKitServerConfig>, client?: ParticipantUpdateClientLike) {
    const token = new LiveKitTokenService(config);
    this.configured = token.IsConfigured;
    this.client =
      client ?? new RoomServiceClient(WsToHttpUrl(token.ServerUrl), config?.ApiKey ?? process.env.LIVEKIT_API_KEY, config?.ApiSecret ?? process.env.LIVEKIT_API_SECRET);
  }

  /**
   * Records whether a person lets agents see their camera and shared screen: sets their `mj.agentCanSee` attribute to
   * `'true'`, or removes it. The caller must already have established that `identity` is the person asking.
   *
   * @param roomName The room the person is in.
   * @param identity The person's participant identity.
   * @param allow `true` to let agents see, `false` to stop.
   * @returns Whether LiveKit applied it; never throws.
   */
  public async SetAgentVision(roomName: string, identity: string, allow: boolean): Promise<ParticipantUpdateResult> {
    return this.updateAttributes(roomName, identity, AgentVisionAttributes(allow));
  }

  /** Sets (or, with `''`, removes) a participant's attributes; reports LiveKit's refusal instead of throwing. */
  private async updateAttributes(roomName: string, identity: string, attributes: Record<string, string>): Promise<ParticipantUpdateResult> {
    if (!this.configured) {
      return { Success: false, ErrorMessage: 'LiveKit is not configured on this server.' };
    }
    try {
      await this.client.updateParticipant(roomName, identity, { attributes });
      return { Success: true };
    } catch (error) {
      if (isNotFound(error)) {
        return { Success: false, NotInRoom: true, ErrorMessage: `${identity} is not in room ${roomName}.` };
      }
      return { Success: false, ErrorMessage: error instanceof Error ? error.message : String(error) };
    }
  }
}

/**
 * Whether LiveKit refused because the room or the participant does not exist. Only LiveKit's own `not_found` code
 * counts: a bare HTTP 404 more likely means the server URL is wrong.
 */
function isNotFound(error: unknown): boolean {
  return error instanceof TwirpError && error.code === 'not_found';
}
