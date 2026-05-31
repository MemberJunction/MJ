/**
 * Mints a short-lived LiveKit participant access token. Standalone helper —
 * does NOT connect to a room. Designed to be called from MJServer's
 * `IssueChannelParticipantToken` GraphQL mutation (Phase 1(c)(viii)).
 *
 * Pure token signing via `livekit-server-sdk`'s `AccessToken`. Returns the JWT
 * string the browser hands to the LiveKit client SDK to join the room.
 *
 * See `plans/audio-agent-architecture.md` section 3.1.
 */
import { AccessToken } from 'livekit-server-sdk';

export interface IssueLiveKitTokenOptions {
    /** LiveKit API key (server-side). */
    ApiKey: string;
    /** LiveKit API secret (server-side). */
    ApiSecret: string;
    /** Room the participant is allowed to join. */
    RoomName: string;
    /** Stable identity for the participant (often a user ID). */
    ParticipantIdentity: string;
    /** Optional human-readable display name for the participant. */
    ParticipantName?: string;
    /** Token TTL in seconds. Defaults to 3600 (1 hour). */
    TtlSeconds?: number;
    /** Permission to publish tracks. Defaults to `true`. */
    CanPublish?: boolean;
    /** Permission to subscribe to other participants' tracks. Defaults to `true`. */
    CanSubscribe?: boolean;
    /** Permission to publish data messages. Defaults to `true`. */
    CanPublishData?: boolean;
}

/**
 * Mint a JWT a browser client can use to join the given LiveKit room.
 *
 * The returned token embeds the `roomJoin` grant plus the requested publish/subscribe
 * permissions. Callers SHOULD prefer short TTLs (5–60 minutes) for browser-facing
 * use and pair each issuance with an MJ permission check before signing.
 */
export async function IssueLiveKitParticipantToken(
    options: IssueLiveKitTokenOptions
): Promise<string> {
    const ttlSeconds = options.TtlSeconds ?? 3600;
    const at = new AccessToken(options.ApiKey, options.ApiSecret, {
        identity: options.ParticipantIdentity,
        name: options.ParticipantName,
        ttl: `${ttlSeconds}s`,
    });
    at.addGrant({
        roomJoin: true,
        room: options.RoomName,
        canPublish: options.CanPublish ?? true,
        canSubscribe: options.CanSubscribe ?? true,
        canPublishData: options.CanPublishData ?? true,
    });
    return await at.toJwt();
}
