/**
 * @fileoverview Whether a connected call tells the user it shows no avatar, and why.
 *
 * The server decides the reasons it can see at mint (the model renders no avatar, the persona has no face for it, a
 * custom avatar, an app that said at mint it shows no agent video: `host`) and returns them as the session's avatar
 * status. Two more show only in the browser, once the call is connected: the app asked for no agent video (`host`), or
 * it asked and the browser could not play it (`browser`). {@link ResolveAvatarNotice} puts the three facts together; the
 * runtime publishes the result once per call.
 *
 * @module @memberjunction/realtime-runtime
 */

import type { ClientRealtimeSessionConfig, JSONValue, ParsedRealtimeAvatarStatus, RealtimeAvatarUnavailableReason } from '@memberjunction/ai';
import { REQUESTED_TRACKS_SESSION_KEY } from '@memberjunction/ai-realtime-client';

/** Why a call shows no avatar, told once after it connects. A host turns the reason into words. */
export interface RealtimeAvatarNotice {
  /**
   * Why the call is audio only. Absent when the mint gave a reason this version doesn't know, such as a newer server's:
   * the avatar was asked for and isn't shown, and a host says so without a reason.
   */
  readonly Reason?: RealtimeAvatarUnavailableReason;
}

/**
 * Whether a connected call should say it shows no avatar, and why.
 *
 * - No status, or the session asked for no avatar: nothing to say.
 * - Asked for and not granted: the status's reason; a notice without one when the reason is one this version doesn't
 *   know (`ReasonUnknown`); nothing when the status gives no reason.
 * - Granted, but the app asked for no agent video: `host`.
 * - Granted and asked for, but the agent's video track is not live: `browser`.
 * - Granted, asked for and live: nothing to say; the avatar shows.
 *
 * @param status The mint's avatar status as `ParseRealtimeAvatarStatus` reads it, or `null` when the mint reported none.
 * @param requested Whether the session asked for the agent's video (an outbound video track).
 * @param established Whether the agent's video track is live once connected.
 * @returns The notice, or `null` when there is nothing to say.
 */
export function ResolveAvatarNotice(status: ParsedRealtimeAvatarStatus | null, requested: boolean, established: boolean): RealtimeAvatarNotice | null {
  if (!status?.Requested) {
    return null;
  }
  if (!status.Granted) {
    if (status.Reason) {
      return { Reason: status.Reason };
    }
    return status.ReasonUnknown ? {} : null;
  }
  if (!requested) {
    return { Reason: 'host' };
  }
  return established ? null : { Reason: 'browser' };
}

/**
 * Whether a client config asks for the agent's video: an outbound video track among the tracks the session requests.
 *
 * @param config The config the session connected with.
 */
export function RequestsAgentVideo(config: ClientRealtimeSessionConfig): boolean {
  const tracks = config.SessionConfig[REQUESTED_TRACKS_SESSION_KEY];
  return Array.isArray(tracks) && tracks.some(isAgentVideoTrack);
}

/** Whether a requested-track entry is the agent's video: outbound, video. */
function isAgentVideoTrack(raw: JSONValue): boolean {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return false;
  }
  const modality = raw['Modality'];
  return raw['Direction'] === 'outbound' && typeof modality === 'string' && modality.trim().toLowerCase() === 'video';
}
