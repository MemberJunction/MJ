import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Component, Input } from '@angular/core';
import type { ComponentFixture } from '@angular/core/testing';
import { NEVER, type Observable } from 'rxjs';
import { RegisterClass } from '@memberjunction/global';
import { Fmp4PieceToVideoFrame, type JSONObject, type RealtimeVideoFrame } from '@memberjunction/ai';
import { BaseRealtimeClient, type IRealtimePcmPlayback } from '@memberjunction/ai-realtime-client';
import type { IAvatarVideoPlayout, MediaPlacement, VideoPlayoutOptions } from '@memberjunction/ai-realtime-client/media';
import {
  CONFORMANCE_FMP4_FRAME_SECONDS,
  ConformanceFmp4InitSegment,
  ConformanceFmp4VideoFragment,
  ConformancePcm,
  CreateConformanceMicrophone,
  RealtimeVideoConformanceTimeline,
  RecordingPcmPlayback,
  RecordingVideoPlayout,
} from '@memberjunction/ai-realtime-client/testing';
import { BaseRealtimeChannelClient, RealtimeSessionRuntime, type StartRealtimeClientSessionResult } from '@memberjunction/realtime-runtime';
import { CreateFakeProvider, Query, QueryAll, Text, renderComponentFixture } from '@memberjunction/ng-test-utils';
// The conformance kit's own synthetic provider: its client driver and its wire, from the kit's tests in
// ai-realtime-client. Not published (the kit's /testing entry exports only the kit), so it is imported from source.
import {
  SyntheticVideoClient,
  type SyntheticVideoMode,
} from '../../../../../../../../AI/RealtimeClient/src/__tests__/video-conformance/synthetic-video-client';
import {
  SYNTHETIC_FRAME_TYPES,
  SyntheticAvatarPact,
  SyntheticWire,
} from '../../../../../../../../AI/RealtimeClient/src/__tests__/video-conformance/synthetic-wire';
import { RealtimeChannelPaneComponent } from '../channels/realtime-channel-pane.component';
import { REALTIME_AVATAR_CHANNEL_CLASS, REALTIME_AVATAR_CHANNEL_NAME, RealtimeAvatarChannel } from './realtime-avatar-channel';
import { AGENT_VIDEO_STALL_MS } from './realtime-avatar-surface.component';

/**
 * The agent's video on MJ's side of a call, end to end, from a provider that passes the video conformance kit. The kit
 * (`@memberjunction/ai-realtime-client/testing`) checks a client driver up to the video it hands over; this spec runs the
 * kit's synthetic provider through what comes after: the realtime session runtime negotiates the agent's video for the
 * Avatar channel (read from its registry row), the channel's surface is hosted the way the call's stage hosts every
 * channel surface, and the surface's `mj-media-tile` shows the video. A barge-in stops it, and the seconds of video the
 * provider reports reach the session's usage on the server.
 *
 * Real: the runtime, the Avatar channel, the channel pane, the surface, the tile, and the synthetic provider's client
 * driver, unchanged. Stand-ins: the synthetic model's side of its in-memory wire; the kit's recorders as the browser's
 * player and voice playback, through the driver's creation seams, as in the kit's own runs; the server's mint (a
 * launcher) and the GraphQL calls after it; and the frames the tile's `<video>` paints, which jsdom does not paint.
 *
 * Both forms of agent video run: a player the driver feeds (the form a Gemini avatar takes, the one a barge-in flushes
 * and whose seconds the driver reports), and a live stream (the form a WebRTC provider hands over). Nothing here decodes
 * or plays media; playback stays a live check.
 */

/** The synthetic provider's key: what its server's mint names, and what the runtime resolves its client driver by. */
const SYNTHETIC_PROVIDER = 'synthetic';

/** The synthetic model's frame rate, as the kit's harness grants it: the kit's frames are this many to the second. */
const SYNTHETIC_FRAME_RATE = Math.round(1 / CONFORMANCE_FMP4_FRAME_SECONDS);

/** The session the mint creates. */
const AGENT_SESSION_ID = 'session-1';

/**
 * The provider's end of one call: the wire its model talks over, the kit's recorders standing in for the browser's
 * voice playback and video players, and, in stream mode, the live stream the driver hands over.
 */
class SyntheticProviderEnd {
  public readonly Wire = new SyntheticWire();
  public readonly Timeline = new RealtimeVideoConformanceTimeline();
  public readonly Voice = new RecordingPcmPlayback(this.Timeline);
  public readonly Players: RecordingVideoPlayout[] = [];
  /** The avatar's live stream, in stream mode. jsdom has no `MediaStream`; the tile only hands it to its `<video>`. */
  public readonly Stream: MediaStream;
  private nextFragment = 1;

  constructor(public readonly Mode: SyntheticVideoMode) {
    const stream = { id: 'synthetic-avatar', getTracks: (): MediaStreamTrack[] => [] } satisfies Pick<MediaStream, 'id' | 'getTracks'>;
    this.Stream = stream as unknown as MediaStream;
  }

  /**
   * What the provider's server mints: an avatar. When the driver plays it, its video is fragmented MP4 that carries the
   * voice; in stream mode the voice comes beside the stream as PCM. The kit's harnesses grant the same.
   */
  public Mint(): StartRealtimeClientSessionResult {
    const pact = SyntheticAvatarPact(SYNTHETIC_FRAME_TYPES.fmp4, this.Mode === 'playout', false, SYNTHETIC_FRAME_RATE);
    return {
      AgentSessionId: AGENT_SESSION_ID,
      ConversationId: 'conversation-1',
      Provider: SYNTHETIC_PROVIDER,
      Model: 'synthetic-avatar-1',
      EphemeralToken: 'synthetic-token',
      ExpiresAt: '2030-01-01T00:00:00Z',
      SessionConfigJson: JSON.stringify(pact),
      ModelName: 'Synthetic Avatar',
      NarrationInstructionsTemplate: null,
      PriorChannelStatesJson: null,
    };
  }

  /** A player the driver created, recording on this call's timeline. */
  public CreatePlayer(options: VideoPlayoutOptions): RecordingVideoPlayout {
    const player = new RecordingVideoPlayout(options, this.Timeline, this.Players.length);
    this.Players.push(player);
    return player;
  }

  /** The video player of the call: the one the driver created when it connected. */
  public get Player(): RecordingVideoPlayout {
    const player = this.Players[0];
    if (!player) {
      throw new Error('The driver created no video player.');
    }
    return player;
  }

  /** Whether the agent's video has frames to paint: a live stream always, a player while it plays. */
  public get VideoPlaying(): boolean {
    return this.Mode === 'stream' || this.Players.some((player) => player.IsPlaying);
  }

  /** The model starts its video: the init segment, with the voice's audio track. */
  public StartVideo(): void {
    this.Wire.Send({ Kind: 'frame', Frame: fmp4Frame(ConformanceFmp4InitSegment(true)) });
  }

  /**
   * The model's first words, transcribed: its answer is under way. Video that comes outside an answer is idle (a provider
   * may stream it between answers): it plays, but is not the agent speaking.
   */
  public AnswerStarted(): void {
    this.Wire.Send({ Kind: 'transcript', Text: 'Here is what I found.' });
  }

  /** The model sends `count` frames of video, each a one-frame fragment of 1/24 s. */
  public SendFrames(count: number): void {
    for (let i = 0; i < count; i++) {
      this.Wire.Send({ Kind: 'frame', Frame: fmp4Frame(ConformanceFmp4VideoFragment(1, this.nextFragment++)) });
    }
  }

  /** The model sends a chunk of its voice as PCM. */
  public SendVoice(): void {
    this.Wire.Send({ Kind: 'voice', Data: ConformancePcm() });
  }

  /** The model has generated its whole turn. */
  public GenerationComplete(): void {
    this.Wire.Send({ Kind: 'generation-complete' });
  }

  /** The model's turn is over. */
  public TurnComplete(): void {
    this.Wire.Send({ Kind: 'turn-complete' });
  }

  /** The user barged in, and the provider stopped the model's turn. */
  public Interrupted(): void {
    this.Wire.Send({ Kind: 'interrupted' });
  }
}

/** A piece of the kit's fragmented MP4 as the frame the synthetic model's wire carries. */
function fmp4Frame(piece: ArrayBuffer): RealtimeVideoFrame {
  const frame = Fmp4PieceToVideoFrame(piece, 'video/mp4', null);
  if (!frame) {
    throw new Error('The piece is not fragmented MP4.');
  }
  return frame;
}

/** The provider end of the call starting now. The runtime creates the client driver itself, through the ClassFactory. */
let provider: SyntheticProviderEnd;

/**
 * The synthetic provider's client driver as a host resolves it, by the provider key the mint names, with the kit's
 * recorders in its creation seams, as the kit's harness wires them.
 */
@RegisterClass(BaseRealtimeClient, SYNTHETIC_PROVIDER)
class SyntheticCallClient extends SyntheticVideoClient {
  private readonly providerEnd: SyntheticProviderEnd = provider;

  constructor() {
    super(provider.Wire, provider.Mode);
  }

  protected override CreatePlayback(): IRealtimePcmPlayback {
    return this.providerEnd.Voice;
  }

  protected override CreateVideoPlayout(options: VideoPlayoutOptions): IAvatarVideoPlayout {
    return this.providerEnd.CreatePlayer(options);
  }

  /** The kit's recorder plays any type; jsdom has no Media Source Extensions to ask. */
  protected override CanPlay(_mimeType: string): boolean {
    return true;
  }

  protected override CreateRemoteStream(): MediaStream {
    return this.providerEnd.Stream;
  }
}

/** One GraphQL request the call sent after the mint. */
interface ServerRequest {
  Query: string;
  Variables: JSONObject;
}

/**
 * The server as the call reaches it after the mint. It has no entity metadata, so the runtime reads the channel registry
 * over GraphQL, where it finds the Avatar row. It records every request the call sends.
 */
function fakeServer() {
  const requests: ServerRequest[] = [];
  const avatarRow = {
    ID: 'avatar-channel',
    Name: REALTIME_AVATAR_CHANNEL_NAME,
    ClientPluginClass: REALTIME_AVATAR_CHANNEL_CLASS,
    IsActive: true,
    UIConfig: JSON.stringify({ Placement: 'stage' }),
  };
  const metadataProvider = Object.assign(CreateFakeProvider(), {
    sessionId: 'transport-session-1',
    ExecuteGQL: async (query: string, variables: JSONObject): Promise<JSONObject> => {
      requests.push({ Query: query, Variables: variables });
      return query.includes('RunDynamicView') ? { RunDynamicView: { Success: true, Results: [{ Data: JSON.stringify(avatarRow) }] } } : {};
    },
    PushStatusUpdates: (): Observable<string> => NEVER,
  });
  return { Provider: metadataProvider, Requests: requests };
}

/** A call under way: the runtime, the server it talks to, and the Avatar channel it mounted. */
interface Call {
  Runtime: RealtimeSessionRuntime;
  Server: ReturnType<typeof fakeServer>;
  Avatar: RealtimeAvatarChannel;
}

/** Every call a test started, ended after it. */
const calls: RealtimeSessionRuntime[] = [];

/** The runtime starts a call with Sage on the synthetic provider, as a host does. */
async function startCall(mode: SyntheticVideoMode): Promise<Call> {
  provider = new SyntheticProviderEnd(mode);
  const server = fakeServer();
  const runtime = new RealtimeSessionRuntime({ AcquireMicrophone: async () => CreateConformanceMicrophone() });
  runtime.Provider = server.Provider;
  runtime.Launcher = { Launch: async () => provider.Mint() };
  calls.push(runtime);
  await runtime.StartRealtimeSession('agent-1', null, null, 'Sage', null, null, null, null, false);
  if (!runtime.IsActive) {
    throw new Error(`The call did not start: ${runtime.LastStartError?.message ?? 'no reason given'}`);
  }
  const avatar = runtime.ActiveChannels.find((channel) => channel.ChannelName === REALTIME_AVATAR_CHANNEL_NAME);
  if (!(avatar instanceof RealtimeAvatarChannel)) {
    throw new Error('The call did not mount the Avatar channel.');
  }
  return { Runtime: runtime, Server: server, Avatar: avatar };
}

/** Where the call's stage puts a channel's surface: a frame holding the channel pane, which creates and binds it. */
@Component({
  standalone: true,
  imports: [RealtimeChannelPaneComponent],
  template: `<div class="stage-frame"><mj-realtime-channel-pane [Plugin]="Plugin" [Placement]="Placement"></mj-realtime-channel-pane></div>`,
})
class StageFrameComponent {
  @Input({ required: true }) public Plugin!: BaseRealtimeChannelClient;
  @Input() public Placement: MediaPlacement = 'tab';
}

/** Shows the Avatar channel's surface where its registry row places it, as the call's stage does. */
function showAvatar(call: Call): ComponentFixture<StageFrameComponent> {
  const fixture = renderComponentFixture(StageFrameComponent, { inputs: { Plugin: call.Avatar, Placement: call.Avatar.SurfacePlacement.Default } });
  fixture.detectChanges();
  return fixture;
}

/** The labels on the agent's tile, in order. */
const chips = (fixture: ComponentFixture<StageFrameComponent>): Array<string | undefined> =>
  QueryAll(fixture, 'mj-realtime-avatar-surface .tile__chip').map((chip) => chip.textContent?.trim());

/** The turn the orb in the tile's placeholder shows, or `null` when the video shows instead. */
const orbState = (fixture: ComponentFixture<StageFrameComponent>): string | null =>
  Query(fixture, 'mj-realtime-avatar-surface .tile__placeholder mj-realtime-agent-orb .orb')?.getAttribute('data-state') ?? null;

/** The tile's `<video>`. */
const tileVideo = (fixture: ComponentFixture<StageFrameComponent>): HTMLVideoElement => {
  const video = Query(fixture, 'mj-realtime-avatar-surface video');
  if (!(video instanceof HTMLVideoElement)) {
    throw new Error('The tile has no <video>.');
  }
  return video;
};

/** The usage the call relayed to its session, each update's details parsed. */
const relayedUsage = (call: Call): Array<{ Session: string; Details: JSONObject }> =>
  call.Server.Requests.filter((request) => request.Query.includes('RelayRealtimeUsage')).map((request) => ({
    Session: String(request.Variables['agentSessionId']),
    Details: JSON.parse(String(request.Variables['usageDetailsJson'])),
  }));

/** The video seconds in a relayed update's details. */
const videoSeconds = (details: JSONObject): number => {
  const output = details['Output'];
  const seconds = output !== null && typeof output === 'object' && !Array.isArray(output) ? output['VideoSeconds'] : undefined;
  return typeof seconds === 'number' ? seconds : 0;
};

/** Frame callbacks the tile's `<video>` registered: jsdom paints no frames of its own. */
let frames: Array<() => void> = [];

/** The tile's `<video>` paints a frame, as a browser does while the agent's video has frames to show. */
const paint = (): void => {
  if (!provider.VideoPlaying) {
    return;
  }
  const pending = frames;
  frames = [];
  pending.forEach((callback) => callback());
};

describe("The agent's video from a provider that passes the conformance kit, through the runtime, the Avatar channel and its tile (DOM)", () => {
  beforeEach(() => {
    frames = [];
    Object.defineProperty(HTMLVideoElement.prototype, 'requestVideoFrameCallback', {
      configurable: true,
      value: (callback: () => void) => frames.push(callback),
    });
    Object.defineProperty(HTMLVideoElement.prototype, 'cancelVideoFrameCallback', { configurable: true, value: () => undefined });
    // The tile's frame watch runs on an interval and the page's clock; the tests move both.
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
  });

  afterEach(async () => {
    for (const runtime of calls.splice(0)) {
      await runtime.EndRealtimeSession();
    }
    Reflect.deleteProperty(HTMLVideoElement.prototype, 'requestVideoFrameCallback');
    Reflect.deleteProperty(HTMLVideoElement.prototype, 'cancelVideoFrameCallback');
    vi.useRealTimers();
  });

  describe('as a player the driver feeds (the kit records it)', () => {
    it("negotiates the agent's video for the Avatar channel and shows it in the channel's tile, labelled as AI-generated", async () => {
      const call = await startCall('playout');

      expect(call.Runtime.Client).toBeInstanceOf(SyntheticCallClient);
      expect(call.Runtime.IsTrackEstablished('video', 'outbound')).toBe(true);
      expect(provider.Wire.RequestedVideo).toBe(true);
      expect(call.Runtime.HasChannelBeenUsed(REALTIME_AVATAR_CHANNEL_NAME)).toBe(true);

      const source = provider.Player.Source;
      if (source.Kind !== 'element') {
        throw new Error('The player hands over a stream.');
      }
      const attach = vi.spyOn(source, 'Attach');
      const fixture = showAvatar(call);
      expect(attach.mock.calls).toEqual([[tileVideo(fixture)]]);
      // Until the model sends video, the orb holds the agent's place.
      paint();
      fixture.detectChanges();
      expect(orbState(fixture)).toBe('listening');
      expect(chips(fixture)).toEqual(['Listening']);

      provider.StartVideo();
      provider.AnswerStarted();
      provider.SendFrames(12);
      paint();
      fixture.detectChanges();

      expect(orbState(fixture)).toBeNull();
      expect(chips(fixture)).toEqual(['AI-generated video', 'Speaking']);
      expect(Text(fixture, 'mj-realtime-avatar-surface .tile__name')).toContain('Sage');
      expect(Text(fixture, 'mj-realtime-avatar-surface .tile__role')).toBe('AI');
    });

    it("stops the video at a barge-in: the player is flushed, the turn's late frames are dropped, and the orb holds the tile until the next turn's video", async () => {
      const call = await startCall('playout');
      const source = provider.Player.Source;
      if (source.Kind !== 'element') {
        throw new Error('The player hands over a stream.');
      }
      const attach = vi.spyOn(source, 'Attach');
      const fixture = showAvatar(call);
      provider.StartVideo();
      provider.AnswerStarted();
      provider.SendFrames(6);
      paint();
      fixture.detectChanges();
      expect(chips(fixture)).toEqual(['AI-generated video', 'Speaking']);

      const bargeIn = provider.Timeline.Mark();
      provider.Interrupted();
      provider.SendFrames(6);
      paint();
      vi.advanceTimersByTime(AGENT_VIDEO_STALL_MS + 300);
      fixture.detectChanges();

      expect(provider.Timeline.Of('player-flush', bargeIn)).toHaveLength(1);
      expect(provider.Timeline.Of('voice-flush', bargeIn)).toHaveLength(1);
      expect(provider.Timeline.Of('player-append', bargeIn)).toEqual([]);
      expect(provider.Player.IsPlaying).toBe(false);
      expect(orbState(fixture)).toBe('listening');
      expect(chips(fixture)).toEqual(['Listening']);
      expect(Query(fixture, '.avatar')?.classList.contains('avatar--speaking')).toBe(false);

      provider.TurnComplete();
      provider.AnswerStarted();
      provider.SendFrames(3);
      paint();
      fixture.detectChanges();

      expect(orbState(fixture)).toBeNull();
      expect(chips(fixture)).toEqual(['AI-generated video', 'Speaking']);
      expect(attach).toHaveBeenCalledTimes(1);
    });

    it("puts the seconds of video the provider reports into the session's usage, without the frames a turn sent after its barge-in", async () => {
      const call = await startCall('playout');
      provider.StartVideo();
      provider.SendFrames(12);
      provider.GenerationComplete();
      provider.TurnComplete();
      provider.SendFrames(6);
      provider.Interrupted();
      provider.SendFrames(6);
      provider.TurnComplete();

      await call.Runtime.EndRealtimeSession();

      const relayed = relayedUsage(call);
      expect(relayed.map((update) => update.Session)).toEqual([AGENT_SESSION_ID]);
      expect(videoSeconds(relayed[0].Details)).toBeCloseTo(18 * CONFORMANCE_FMP4_FRAME_SECONDS, 9);
      const order = call.Server.Requests.map((request) => request.Query).filter((query) => /RelayRealtimeUsage|CloseAgentSession/.test(query));
      expect(order.map((query) => (query.includes('RelayRealtimeUsage') ? 'usage' : 'close'))).toEqual(['usage', 'close']);
    });
  });

  describe('as a live stream the driver hands over', () => {
    it("shows the stream in the Avatar channel's tile, labelled as AI-generated, and keeps it through a barge-in that stops the voice", async () => {
      // jsdom plays no media: a stream's <video> calls play(), and pause() when it lets the stream go.
      vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
      const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
      const call = await startCall('stream');
      expect(call.Runtime.IsTrackEstablished('video', 'outbound')).toBe(true);
      const fixture = showAvatar(call);
      paint();
      fixture.detectChanges();

      expect(tileVideo(fixture).srcObject).toBe(provider.Stream);
      expect(chips(fixture)).toEqual(['AI-generated video', 'Listening']);

      provider.SendVoice();
      fixture.detectChanges();
      expect(chips(fixture)).toEqual(['AI-generated video', 'Speaking']);

      const bargeIn = provider.Timeline.Mark();
      provider.Interrupted();
      paint();
      fixture.detectChanges();

      expect(provider.Timeline.Of('voice-flush', bargeIn)).toHaveLength(1);
      expect(chips(fixture)).toEqual(['AI-generated video', 'Listening']);
      expect(tileVideo(fixture).srcObject).toBe(provider.Stream);
      expect(pause).not.toHaveBeenCalled();
    });
  });
});
