/**
 * @fileoverview {@link LiveKitEgressService} — starts/stops room recording (composite egress) via the
 * LiveKit `EgressClient` (`livekit-server-sdk`). Recording is a server-authorized action, so it lives in
 * the server package and is invoked through the GraphQL surface — never directly from the browser.
 *
 * Egress output storage (S3 / GCS / Azure / LiveKit Cloud bucket) is a deployment concern configured on
 * the LiveKit project; this service starts a composite MP4 egress with a filepath template and returns the
 * egress id so the caller can stop it later.
 *
 * @module @memberjunction/livekit-room-server
 */

import { EgressClient, EncodedFileOutput, EncodedFileType, type EgressInfo } from 'livekit-server-sdk';
import { LiveKitTokenService, type LiveKitServerConfig } from './livekit-token-service';

/** Parameters for starting a room recording. */
export interface StartRecordingParams {
  /** The room to record. */
  RoomName: string;
  /** The composite layout (e.g. `'speaker'`, `'grid'`). Default: `'speaker-dark'`. */
  Layout?: string;
  /** The output filepath template (provider-specific). Default: `<room>/<timestamp>.mp4`. */
  Filepath?: string;
}

/** The subset of {@link EgressClient} the service drives — an injectable seam for unit testing. */
export type EgressClientLike = Pick<EgressClient, 'startRoomCompositeEgress' | 'stopEgress' | 'listEgress'>;

/** Converts a `ws(s)://` server URL to its `http(s)://` form for the egress client. */
export function wsToHttpUrl(url: string): string {
  return url.replace(/^ws/i, 'http');
}

/** A normalized recording (egress) status. */
export interface RecordingInfo {
  /** The egress id (pass to {@link LiveKitEgressService.StopRecording}). */
  EgressID: string;
  /** The room being recorded. */
  RoomName: string;
  /** The raw egress status string. */
  Status: string;
  /**
   * The output file's path/key in the egress storage sink, once the egress has produced a result
   * (populated on stop/complete). This is what a caller copies into MJStorage + records as the
   * Conversation's recording. `undefined` while the recording is still in progress.
   */
  OutputLocation?: string;
  /** The output file size in bytes, when the egress result reports it. */
  OutputSizeBytes?: number;
  /** The recording duration in milliseconds, when the egress result reports it. */
  OutputDurationMs?: number;
}

/** Starts/stops/lists LiveKit room recordings (composite egress). */
export class LiveKitEgressService {
  private readonly client: EgressClientLike;

  /**
   * @param config Explicit credentials; omitted fields fall back to environment variables (via
   *   {@link LiveKitTokenService}). The egress client uses the HTTP(S) form of the server URL.
   * @param client An injectable egress client (primarily for unit testing); defaults to a real
   *   `EgressClient` built from the resolved credentials.
   */
  constructor(config?: Partial<LiveKitServerConfig>, client?: EgressClientLike) {
    const token = new LiveKitTokenService(config);
    const httpUrl = wsToHttpUrl(token.ServerUrl);
    this.client = client ?? new EgressClient(httpUrl, config?.ApiKey ?? process.env.LIVEKIT_API_KEY, config?.ApiSecret ?? process.env.LIVEKIT_API_SECRET);
  }

  /**
   * Starts a composite recording of a room.
   *
   * @param params The recording parameters.
   * @returns The started recording info.
   */
  public async StartRoomRecording(params: StartRecordingParams): Promise<RecordingInfo> {
    const filepath = params.Filepath ?? `${params.RoomName}/${Date.now()}.mp4`;
    const output = new EncodedFileOutput({ fileType: EncodedFileType.MP4, filepath });
    const info = await this.client.startRoomCompositeEgress(params.RoomName, { file: output }, { layout: params.Layout ?? 'speaker-dark' });
    return this.toRecordingInfo(info, params.RoomName);
  }

  /**
   * Stops a recording.
   *
   * @param egressId The egress id returned by {@link StartRoomRecording}.
   * @returns The final recording info.
   */
  public async StopRecording(egressId: string): Promise<RecordingInfo> {
    const info = await this.client.stopEgress(egressId);
    return this.toRecordingInfo(info, info.roomName);
  }

  /**
   * Lists active recordings for a room.
   *
   * @param roomName The room to query.
   * @returns The active recordings.
   */
  public async ListActiveRecordings(roomName: string): Promise<RecordingInfo[]> {
    const list = await this.client.listEgress({ roomName, active: true });
    return list.map((info) => this.toRecordingInfo(info, roomName));
  }

  /** Maps an SDK `EgressInfo` to the normalized {@link RecordingInfo}. */
  private toRecordingInfo(info: EgressInfo, roomName: string): RecordingInfo {
    const result: RecordingInfo = {
      EgressID: info.egressId,
      RoomName: info.roomName || roomName,
      Status: String(info.status ?? 'unknown'),
    };
    // Once the egress has produced its file (on stop/complete), surface the output path + size +
    // duration so a caller can copy the MP4 into MJStorage and record it on the Conversation.
    const fileResult = info.fileResults?.[0];
    if (fileResult) {
      if (fileResult.filename) {
        result.OutputLocation = fileResult.filename;
      }
      if (fileResult.size != null) {
        result.OutputSizeBytes = Number(fileResult.size);
      }
      if (fileResult.duration != null) {
        // EncodedFileResult.duration is reported in nanoseconds — normalize to milliseconds.
        result.OutputDurationMs = Math.round(Number(fileResult.duration) / 1_000_000);
      }
    }
    return result;
  }
}
