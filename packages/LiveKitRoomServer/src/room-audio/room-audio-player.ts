/**
 * @fileoverview {@link RoomAudioPlayer} — joins a LiveKit room as a small publish-only bot and plays audio into it:
 * contact-center hold music, with spoken announcements ducked over the top ("you are caller number three").
 *
 * The audio comes from an `MJ: Files` row, an https URL, raw PCM, or the built-in comfort tone. It is decoded once
 * (WAV or MP3), resampled to {@link ROOM_AUDIO_SAMPLE_RATE}, cached by source, and paced into the room in 20 ms
 * frames by a {@link PcmFramePump}. Each playback is a {@link RoomAudioHandle} the caller pauses, resumes, announces
 * through and stops; the player keeps a registry so a room's playbacks can be found and stopped together (the
 * `room_finished` webhook does this), and a playback whose bot is disconnected by the server removes itself.
 *
 * It reuses the agent bridge's plumbing rather than its own: bot tokens from {@link LiveKitTokenService}, the native
 * room client through `@memberjunction/ai-bridge-livekit`'s module loader at the same specifier the agent coordinator
 * resolves, and the PCM16 resampler from `@memberjunction/ai-bridge-base`.
 *
 * @module @memberjunction/livekit-room-server
 */

import { randomUUID } from 'node:crypto';
import { BaseSingleton, NormalizeUUID } from '@memberjunction/global';
import { LogError, LogStatus, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { ResamplePcm16 } from '@memberjunction/ai-bridge-base';
import { DefaultNativeLoader, type NativeModuleLoader, type NativeRoomClient } from '@memberjunction/ai-bridge-livekit';
import { LiveKitTokenService, type MintedToken } from '../livekit-token-service';
import { ResolveLiveKitNativeModuleSpecifier } from '../livekit-native-module';
import { AssertAudioDurationWithinCap, DecodeAudio, type DecodedAudio } from './audio-decoder';
import { GenerateComfortTone } from './comfort-tone';
import { PcmFramePump, SystemPumpClock, type PumpClock } from './pcm-frame-pump';
import { RoomAudioDecodeCache } from './room-audio-decode-cache';
import {
  AssertHttpsAudioUrl,
  FetchRoomAudioUrl,
  ReadMJFileAudio,
  type RoomAudioFileContent,
  type RoomAudioFileReader,
  type RoomAudioUrlFetcher,
} from './room-audio-sources';
import type { IRoomSpeechSynthesizer } from './room-speech-synthesizer';

/** The rate the player publishes at (Hz). Music sounds noticeably duller at the 24 kHz the agent voice uses. */
export const ROOM_AUDIO_SAMPLE_RATE = 48000;

/** What to play: an `MJ: Files` row, an https URL, raw mono PCM16, or the built-in comfort tone. */
export type RoomAudioSource =
  | { Kind: 'File'; FileID: string }
  | { Kind: 'Url'; Url: string }
  | { Kind: 'Pcm'; Pcm: Int16Array; SampleRate: number }
  | { Kind: 'ComfortTone' };

/** Parameters for {@link RoomAudioPlayer.Start}. */
export interface StartRoomAudioParams {
  /** The LiveKit room to play into. */
  RoomName: string;
  /** What to play. */
  Source: RoomAudioSource;
  /** Loop the audio until stopped. Default `true`; when `false` the bot leaves the room once the audio ends. */
  Loop?: boolean;
  /** The bot's display name in the room. Default `'On hold'`. */
  DisplayName?: string;
  /** The bot's participant identity. Default `hold-<playback id>`. */
  Identity?: string;
  /** The user the file load (and any announcement synthesis) runs as. */
  ContextUser: UserInfo;
  /** The metadata provider for the file load. Default: the global provider. */
  Provider?: IMetadataProvider;
}

/** An announcement: text to speak through the speech synthesizer, or ready-made mono PCM16. */
export type RoomAudioClip = { Text: string } | { Pcm: Int16Array; SampleRate: number };

/** A live playback in one room. */
export interface RoomAudioHandle {
  /** This playback's id (also the default identity suffix of its bot). */
  readonly PlaybackID: string;
  /** The room it plays into. */
  readonly RoomName: string;
  /** True while audio is being sent (false once paused or stopped). */
  readonly IsPlaying: boolean;
  /**
   * Plays a clip over the music, ducking the music while it plays. Resolves `true` once the clip has been sent in
   * full; `false` when it could not be played (no speech synthesizer installed, synthesis failed, or the playback
   * stopped first). Never rejects.
   */
  Announce(clip: RoomAudioClip): Promise<boolean>;
  /** Stops sending audio, keeping the position. */
  Pause(): void;
  /** Continues after {@link Pause}. */
  Resume(): void;
  /** Stops playback and disconnects the bot. Idempotent; never rejects. */
  Stop(): Promise<void>;
}

/** The part of {@link LiveKitTokenService} the player uses — a seam for tests. */
export type RoomAudioTokenMinter = Pick<LiveKitTokenService, 'MintToken'>;

/** What a playback needs from the player that owns it. */
interface PlaybackOwner {
  Synthesize(text: string, contextUser: UserInfo): Promise<DecodedAudio | null>;
  Deregister(playback: RoomAudioPlayback): void;
}

/** One playback: its bot's room client and its frame pump. Created only by {@link RoomAudioPlayer}. */
class RoomAudioPlayback implements RoomAudioHandle {
  private pump: PcmFramePump | null = null;
  private stopPromise: Promise<void> | null = null;

  constructor(
    public readonly PlaybackID: string,
    public readonly RoomName: string,
    private readonly client: NativeRoomClient,
    private readonly contextUser: UserInfo,
    private readonly owner: PlaybackOwner,
  ) {}

  public get IsPlaying(): boolean {
    return this.stopPromise === null && this.pump !== null && this.pump.IsRunning && !this.pump.IsPaused;
  }

  /** True once {@link Stop} has begun. */
  public get IsStopped(): boolean {
    return this.stopPromise !== null;
  }

  /** Attaches and starts the pump (once the bot is in the room). */
  public Play(pump: PcmFramePump): void {
    this.pump = pump;
    pump.Start();
  }

  public async Announce(clip: RoomAudioClip): Promise<boolean> {
    if (this.IsStopped || !this.pump) {
      return false;
    }
    try {
      const audio = 'Text' in clip ? await this.owner.Synthesize(clip.Text, this.contextUser) : validateClipPcm(clip);
      if (!audio || this.IsStopped) {
        return false;
      }
      return await this.pump.InsertClip(ResamplePcm16(audio.Pcm, audio.SampleRate, ROOM_AUDIO_SAMPLE_RATE));
    } catch (err) {
      LogError(`[RoomAudioPlayer] announcement in room ${this.RoomName} (playback ${this.PlaybackID}) failed: ${errorText(err)}`);
      return false;
    }
  }

  public Pause(): void {
    this.pump?.Pause();
  }

  public Resume(): void {
    this.pump?.Resume();
  }

  public Stop(): Promise<void> {
    this.stopPromise ??= this.stopOnce();
    return this.stopPromise;
  }

  /** Stops the pump, then always disconnects the bot and leaves the registry, whatever failed before. */
  private async stopOnce(): Promise<void> {
    try {
      this.pump?.Stop();
    } catch (err) {
      LogError(`[RoomAudioPlayer] stopping the pump for playback ${this.PlaybackID} failed: ${errorText(err)}`);
    } finally {
      try {
        await this.client.disconnect();
      } catch (err) {
        LogError(`[RoomAudioPlayer] disconnecting playback ${this.PlaybackID} from room ${this.RoomName} failed: ${errorText(err)}`);
      } finally {
        this.owner.Deregister(this);
      }
    }
  }
}

/**
 * Plays audio into LiveKit rooms. A process-wide singleton so the playback registry (and the `room_finished` cleanup
 * that reads it) is shared by every caller.
 */
export class RoomAudioPlayer extends BaseSingleton<RoomAudioPlayer> {
  private readonly active = new Map<string, RoomAudioPlayback>();
  private readonly decodeCache = new RoomAudioDecodeCache();
  private tokenMinter: RoomAudioTokenMinter = new LiveKitTokenService();
  private loadNativeModule: NativeModuleLoader = DefaultNativeLoader;
  private nativeModuleSpecifierOverride?: string;
  private fileReader: RoomAudioFileReader = ReadMJFileAudio;
  private urlFetcher: RoomAudioUrlFetcher = FetchRoomAudioUrl;
  private clock: PumpClock = SystemPumpClock;
  private speechSynthesizer?: IRoomSpeechSynthesizer;
  private warnedNoSynthesizer = false;
  private comfortTone?: Int16Array;

  /** BaseSingleton requires a protected constructor. */
  protected constructor() {
    super();
  }

  /** The process-wide player. */
  public static get Instance(): RoomAudioPlayer {
    return super.getInstance<RoomAudioPlayer>();
  }

  /**
   * Installs the text-to-speech used by {@link RoomAudioHandle.Announce} with `{ Text }` — e.g. an
   * `MJRoomSpeechSynthesizer`. None is installed by default (a voice is vendor-specific); without one a text
   * announcement returns `false` and the player logs the omission once.
   *
   * @param synthesizer The synthesizer, or `undefined` to remove it.
   */
  public SetSpeechSynthesizer(synthesizer: IRoomSpeechSynthesizer | undefined): void {
    this.speechSynthesizer = synthesizer;
    this.warnedNoSynthesizer = false;
  }

  /** Overrides where bot tokens come from (tests; a host with its own credentials). */
  public SetTokenService(minter: RoomAudioTokenMinter): void {
    this.tokenMinter = minter;
  }

  /** Overrides the native room-module loader (tests inject a fake module). */
  public SetNativeModuleLoader(loader: NativeModuleLoader): void {
    this.loadNativeModule = loader;
  }

  /** Overrides the native room-module specifier; `undefined` returns to `LIVEKIT_NATIVE_MODULE` / the default. */
  public SetNativeModuleSpecifier(specifier: string | undefined): void {
    this.nativeModuleSpecifierOverride = specifier;
  }

  /** Overrides how `MJ: Files` bytes are read (tests). */
  public SetFileReader(reader: RoomAudioFileReader): void {
    this.fileReader = reader;
  }

  /** Overrides how URLs are fetched (tests). */
  public SetUrlFetcher(fetcher: RoomAudioUrlFetcher): void {
    this.urlFetcher = fetcher;
  }

  /** Overrides the pacing clock (tests). */
  public SetClock(clock: PumpClock): void {
    this.clock = clock;
  }

  /** Forgets every cached decode (e.g. after a hold file is replaced under the same id). */
  public ClearDecodeCache(): void {
    this.decodeCache.Clear();
  }

  /**
   * Starts playing `params.Source` into `params.RoomName`: loads and decodes it (cached by source), joins the room as
   * a publish-only bot, and paces the audio in.
   *
   * @returns The live playback.
   * @throws {Error} when the source cannot be loaded or decoded, LiveKit is not configured, or the bot cannot join.
   */
  public async Start(params: StartRoomAudioParams): Promise<RoomAudioHandle> {
    assertStartParams(params);
    const pcm = await this.resolvePcm(params);
    return this.joinAndPlay(params, pcm);
  }

  /** The live playbacks in a room (room names compare case-insensitively). */
  public GetActive(roomName: string): RoomAudioHandle[] {
    const key = roomKey(roomName);
    return [...this.active.values()].filter((playback) => roomKey(playback.RoomName) === key);
  }

  /**
   * Stops every playback in a room. Never throws.
   *
   * @returns How many playbacks were stopped.
   */
  public async StopAllInRoom(roomName: string): Promise<number> {
    const playbacks = this.GetActive(roomName);
    await Promise.all(playbacks.map((playback) => playback.Stop()));
    if (playbacks.length > 0) {
      LogStatus(`[RoomAudioPlayer] stopped ${playbacks.length} playback(s) in room ${roomName}`);
    }
    return playbacks.length;
  }

  // ── Loading ────────────────────────────────────────────────────────────────────────────────────────────────────

  /** Resolves the source to mono PCM16 at {@link ROOM_AUDIO_SAMPLE_RATE}, through the decode cache where it can. */
  private async resolvePcm(params: StartRoomAudioParams): Promise<Int16Array> {
    const source = params.Source;
    switch (source.Kind) {
      case 'ComfortTone':
        this.comfortTone ??= GenerateComfortTone(ROOM_AUDIO_SAMPLE_RATE);
        return this.comfortTone;
      case 'Pcm':
        return resampleToRoomRate(validateClipPcm(source));
      case 'File':
        return this.decodeCache.GetOrLoad(`file:${NormalizeUUID(source.FileID)}`, async () =>
          this.decodeContent(await this.fileReader(source.FileID, params.ContextUser, params.Provider)),
        );
      case 'Url': {
        const url = AssertHttpsAudioUrl(source.Url).href; // refuse plain http before anything is fetched
        return this.decodeCache.GetOrLoad(`url:${url}`, async () => this.decodeContent(await this.urlFetcher(url)));
      }
      default:
        return assertNeverSource(source);
    }
  }

  private async decodeContent(content: RoomAudioFileContent): Promise<Int16Array> {
    const decoded = await DecodeAudio(content.Bytes, { MimeType: content.MimeType, FileName: content.FileName });
    return resampleToRoomRate(decoded);
  }

  // ── Joining ────────────────────────────────────────────────────────────────────────────────────────────────────

  /** Joins the room as the playback's bot, registers the playback, and starts the pump. */
  private async joinAndPlay(params: StartRoomAudioParams, pcm: Int16Array): Promise<RoomAudioHandle> {
    const playbackID = randomUUID();
    const displayName = params.DisplayName ?? 'On hold';
    const token = await this.mintBotToken(params.RoomName, params.Identity ?? `hold-${playbackID}`, displayName);
    const roomModule = await this.loadNativeModule(ResolveLiveKitNativeModuleSpecifier(this.nativeModuleSpecifierOverride));
    const client = roomModule.createRoomClient({ OutboundSampleRate: ROOM_AUDIO_SAMPLE_RATE, InboundSampleRate: ROOM_AUDIO_SAMPLE_RATE });
    const playback = new RoomAudioPlayback(playbackID, params.RoomName, client, params.ContextUser, this.playbackOwner());
    client.onDisconnected(() => this.handleServerDisconnect(playback));
    await this.connectClient(client, token, displayName);
    if (playback.IsStopped) {
      throw new Error(`Room audio bot was disconnected from room ${params.RoomName} as soon as it joined.`);
    }
    this.active.set(playbackID, playback);
    playback.Play(this.createPump(playback, client, pcm, params.Loop ?? true));
    LogStatus(`[RoomAudioPlayer] playing ${describeSource(params.Source)} into room ${params.RoomName} (playback ${playbackID})`);
    return playback;
  }

  /** A publish-only bot token: it never needs to hear the room, and it carries no data channel. */
  private mintBotToken(roomName: string, identity: string, displayName: string): Promise<MintedToken> {
    return this.tokenMinter.MintToken({
      RoomName: roomName,
      Identity: identity,
      DisplayName: displayName,
      Role: 'agent',
      CanSubscribe: false,
      CanPublishData: false,
      Metadata: { mjRoomAudio: true },
    });
  }

  /** Connects the bot; on failure always releases the client before rethrowing. */
  private async connectClient(client: NativeRoomClient, token: MintedToken, displayName: string): Promise<void> {
    try {
      await client.connect({ url: token.ServerUrl, token: token.Token, name: displayName });
    } catch (err) {
      try {
        await client.disconnect();
      } catch (disconnectErr) {
        LogError(`[RoomAudioPlayer] releasing a client that failed to join room ${token.RoomName} also failed: ${errorText(disconnectErr)}`);
      }
      throw new Error(`Room audio could not join room ${token.RoomName}: ${errorText(err)}`);
    }
  }

  private createPump(playback: RoomAudioPlayback, client: NativeRoomClient, pcm: Int16Array, loop: boolean): PcmFramePump {
    return new PcmFramePump({
      Music: pcm,
      SampleRate: ROOM_AUDIO_SAMPLE_RATE,
      Loop: loop,
      Clock: this.clock,
      Sink: (frame) => client.publishAudio(frame.buffer),
      OnEnded: (reason) => {
        if (reason !== 'Stopped') {
          void playback.Stop(); // the audio ran out (no loop) or the sink broke: leave the room
        }
      },
    });
  }

  // ── Registry + speech ──────────────────────────────────────────────────────────────────────────────────────────

  private playbackOwner(): PlaybackOwner {
    return {
      Synthesize: (text, contextUser) => this.synthesize(text, contextUser),
      Deregister: (playback) => this.deregister(playback),
    };
  }

  private deregister(playback: RoomAudioPlayback): void {
    if (this.active.get(playback.PlaybackID) === playback) {
      this.active.delete(playback.PlaybackID);
    }
  }

  /** The server dropped the bot (room closed, participant removed): stop and forget the playback. */
  private handleServerDisconnect(playback: RoomAudioPlayback): void {
    if (!playback.IsStopped) {
      LogStatus(`[RoomAudioPlayer] playback ${playback.PlaybackID} was disconnected from room ${playback.RoomName}; stopping it`);
      void playback.Stop();
    }
  }

  private async synthesize(text: string, contextUser: UserInfo): Promise<DecodedAudio | null> {
    if (!this.speechSynthesizer) {
      if (!this.warnedNoSynthesizer) {
        this.warnedNoSynthesizer = true;
        LogError(
          '[RoomAudioPlayer] a text announcement was requested but no speech synthesizer is installed; it was skipped. ' +
            'Call RoomAudioPlayer.Instance.SetSpeechSynthesizer(new MJRoomSpeechSynthesizer({ Voice: ... })) at startup.',
        );
      }
      return null;
    }
    try {
      return await this.speechSynthesizer.Synthesize(text, contextUser);
    } catch (err) {
      LogError(`[RoomAudioPlayer] the speech synthesizer failed: ${errorText(err)}`);
      return null;
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────────────────────────────────────────

function assertStartParams(params: StartRoomAudioParams): void {
  if (!params.RoomName?.trim()) {
    throw new Error('RoomAudioPlayer.Start needs a RoomName.');
  }
  if (!params.ContextUser) {
    throw new Error('RoomAudioPlayer.Start needs a ContextUser (the user the audio is loaded as).');
  }
  if (!params.Source) {
    throw new Error('RoomAudioPlayer.Start needs a Source.');
  }
}

/** Checks caller-supplied PCM: non-empty, a positive rate, and within the duration cap. */
function validateClipPcm(clip: { Pcm: Int16Array; SampleRate: number }): DecodedAudio {
  if (!(clip.SampleRate > 0)) {
    throw new Error(`Room audio PCM needs a positive SampleRate; got ${clip.SampleRate}.`);
  }
  if (clip.Pcm.length === 0) {
    throw new Error('Room audio PCM is empty.');
  }
  AssertAudioDurationWithinCap(clip.Pcm.length, clip.SampleRate);
  return { Pcm: clip.Pcm, SampleRate: clip.SampleRate };
}

function resampleToRoomRate(audio: DecodedAudio): Int16Array {
  return ResamplePcm16(audio.Pcm, audio.SampleRate, ROOM_AUDIO_SAMPLE_RATE);
}

function describeSource(source: RoomAudioSource): string {
  switch (source.Kind) {
    case 'File':
      return `file ${source.FileID}`;
    case 'Url':
      return `url ${source.Url}`;
    case 'Pcm':
      return 'caller-supplied PCM';
    default:
      return 'the comfort tone';
  }
}

function assertNeverSource(source: never): never {
  throw new Error(`Unknown room audio source kind: ${JSON.stringify(source)}`);
}

function roomKey(roomName: string): string {
  return roomName.trim().toLowerCase();
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
