import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import type { MintTokenParams, MintedToken } from '../livekit-token-service';
import { ROOM_AUDIO_SAMPLE_RATE, RoomAudioPlayer, type RoomAudioTokenMinter } from '../room-audio/room-audio-player';
import type { IRoomSpeechSynthesizer } from '../room-audio/room-speech-synthesizer';
import { BuildWav, FakePumpClock, FakeRoomModule, type FakeRoomClient } from './room-audio-test-helpers';

const { logError } = vi.hoisted(() => ({ logError: vi.fn() }));
vi.mock('@memberjunction/core', async () => {
  const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
  return { ...actual, LogError: logError, LogStatus: vi.fn() };
});

const user = { ID: 'user-1', Name: 'Alice', Email: 'alice@example.com' } as unknown as UserInfo;
const FRAME_BYTES = (ROOM_AUDIO_SAMPLE_RATE / 50) * 2; // 20 ms of PCM16
const LEAD = 8;

describe('RoomAudioPlayer', () => {
  const player = RoomAudioPlayer.Instance;
  let clock: FakePumpClock;
  let clients: FakeRoomClient[];
  let outboundRates: number[];
  let minted: MintTokenParams[];
  let specifiers: string[];

  const minter: RoomAudioTokenMinter = {
    MintToken: async (params: MintTokenParams): Promise<MintedToken> => {
      minted.push(params);
      return { ServerUrl: 'wss://lk.example.com', Token: `jwt-${params.Identity}`, Identity: params.Identity, RoomName: params.RoomName };
    },
  };

  function useModule(options: { ConnectError?: Error } = {}): void {
    player.SetNativeModuleLoader(async (specifier) => {
      specifiers.push(specifier);
      return FakeRoomModule(clients, { OutboundRates: outboundRates, ...options });
    });
  }

  beforeEach(() => {
    clock = new FakePumpClock();
    clients = [];
    outboundRates = [];
    minted = [];
    specifiers = [];
    logError.mockClear();
    player.SetClock(clock);
    player.SetTokenService(minter);
    player.SetNativeModuleSpecifier('fake-native');
    player.SetSpeechSynthesizer(undefined);
    player.ClearDecodeCache();
    useModule();
  });

  afterEach(async () => {
    await Promise.all(['room-a', 'room-b', 'ROOM-A'].map((room) => player.StopAllInRoom(room)));
  });

  it('joins as a publish-only bot and paces the comfort tone into the room at 48 kHz', async () => {
    const handle = await player.Start({ RoomName: 'room-a', Source: { Kind: 'ComfortTone' }, ContextUser: user });
    const client = clients[0];
    expect(specifiers).toEqual(['fake-native']);
    expect(outboundRates).toEqual([ROOM_AUDIO_SAMPLE_RATE]);
    expect(minted[0]).toMatchObject({ RoomName: 'room-a', Identity: `hold-${handle.PlaybackID}`, DisplayName: 'On hold', CanSubscribe: false, CanPublishData: false });
    expect(client.ConnectArgs).toEqual({ url: 'wss://lk.example.com', token: `jwt-hold-${handle.PlaybackID}`, name: 'On hold' });
    expect(client.Published.length).toBe(LEAD);
    expect(client.Published[0].byteLength).toBe(FRAME_BYTES);
    clock.Advance(1000);
    expect(client.Published.length).toBe(LEAD + 50);
    expect(handle.IsPlaying).toBe(true);
    expect(player.GetActive('ROOM-A')).toEqual([handle]);
  });

  it('honours an explicit identity and display name', async () => {
    await player.Start({ RoomName: 'room-a', Source: { Kind: 'ComfortTone' }, ContextUser: user, Identity: 'hold-queue-7', DisplayName: 'Music' });
    expect(minted[0]).toMatchObject({ Identity: 'hold-queue-7', DisplayName: 'Music' });
  });

  it('Stop disconnects the bot once, stops the frames, and deregisters', async () => {
    const handle = await player.Start({ RoomName: 'room-a', Source: { Kind: 'ComfortTone' }, ContextUser: user });
    await Promise.all([handle.Stop(), handle.Stop()]);
    const client = clients[0];
    expect(client.Disconnects).toBe(1);
    const sent = client.Published.length;
    clock.Advance(500);
    expect(client.Published.length).toBe(sent);
    expect(handle.IsPlaying).toBe(false);
    expect(player.GetActive('room-a')).toEqual([]);
  });

  it('StopAllInRoom stops only that room', async () => {
    await player.Start({ RoomName: 'room-a', Source: { Kind: 'ComfortTone' }, ContextUser: user });
    await player.Start({ RoomName: 'Room-A', Source: { Kind: 'ComfortTone' }, ContextUser: user });
    const other = await player.Start({ RoomName: 'room-b', Source: { Kind: 'ComfortTone' }, ContextUser: user });
    expect(await player.StopAllInRoom('ROOM-A')).toBe(2);
    expect(clients.map((c) => c.Disconnects)).toEqual([1, 1, 0]);
    expect(player.GetActive('room-b')).toEqual([other]);
  });

  it('stops and deregisters on its own when the server disconnects the bot', async () => {
    const handle = await player.Start({ RoomName: 'room-a', Source: { Kind: 'ComfortTone' }, ContextUser: user });
    clients[0].SimulateServerDisconnect();
    await handle.Stop(); // joins the stop already under way
    expect(player.GetActive('room-a')).toEqual([]);
    expect(clients[0].Disconnects).toBe(1);
  });

  it('pauses and resumes', async () => {
    const handle = await player.Start({ RoomName: 'room-a', Source: { Kind: 'ComfortTone' }, ContextUser: user });
    handle.Pause();
    expect(handle.IsPlaying).toBe(false);
    const sent = clients[0].Published.length;
    clock.Advance(500);
    expect(clients[0].Published.length).toBe(sent);
    handle.Resume();
    expect(handle.IsPlaying).toBe(true);
    expect(clients[0].Published.length).toBe(sent + LEAD);
  });

  it('leaves the room by itself when non-looping audio ends, once the audio sent ahead has played out', async () => {
    const pcm = new Int16Array(ROOM_AUDIO_SAMPLE_RATE / 10).fill(1000); // 100 ms: all 5 frames go out in the initial lead
    const handle = await player.Start({ RoomName: 'room-a', Source: { Kind: 'Pcm', Pcm: pcm, SampleRate: ROOM_AUDIO_SAMPLE_RATE }, Loop: false, ContextUser: user });
    expect(clients[0].Published.length).toBe(5);
    expect(clients[0].Disconnects).toBe(0); // the room is still playing the 100 ms just sent
    expect(handle.EndReason).toBeNull();
    clock.Advance(100);
    await expect(handle.Ended).resolves.toBe('Completed');
    expect(handle.EndReason).toBe('Completed');
    expect(clients[0].Disconnects).toBe(1);
    expect(player.GetActive('room-a')).toEqual([]);
  });

  describe('Ended', () => {
    const shortClip = (): { Kind: 'Pcm'; Pcm: Int16Array; SampleRate: number } => ({
      Kind: 'Pcm',
      Pcm: new Int16Array(ROOM_AUDIO_SAMPLE_RATE / 2).fill(500), // 500 ms
      SampleRate: ROOM_AUDIO_SAMPLE_RATE,
    });

    it('resolves Completed only after a non-looping clip has been sent in full and played out', async () => {
      const handle = await player.Start({ RoomName: 'room-a', Source: shortClip(), Loop: false, ContextUser: user });
      let reason: string | null = null;
      void handle.Ended.then((r) => (reason = r));
      clock.Advance(300);
      await Promise.resolve();
      expect(reason).toBeNull();
      clock.Advance(400); // last frame sent at ~350 ms of 500; the room finishes playing at 500 ms
      await expect(handle.Ended).resolves.toBe('Completed');
      expect(clients[0].Published.length).toBe(25); // 500 ms = 25 frames of 20 ms
    });

    it('resolves Stopped when stopped mid-clip, and Stop resolves after the bot has left', async () => {
      const handle = await player.Start({ RoomName: 'room-a', Source: shortClip(), Loop: false, ContextUser: user });
      clock.Advance(100);
      await handle.Stop();
      expect(clients[0].Disconnects).toBe(1);
      await expect(handle.Ended).resolves.toBe('Stopped');
      expect(handle.EndReason).toBe('Stopped');
    });

    it('resolves Stopped when stopped while the sent tail is still playing out', async () => {
      const handle = await player.Start({ RoomName: 'room-a', Source: shortClip(), Loop: false, ContextUser: user });
      clock.Advance(360); // every frame sent; the room has ~140 ms left to play
      expect(handle.EndReason).toBeNull();
      await handle.Stop();
      await expect(handle.Ended).resolves.toBe('Stopped');
      clock.Advance(500); // the cancelled drain must not flip the reason
      expect(handle.EndReason).toBe('Stopped');
    });

    it('resolves Failed when the outbound sink breaks', async () => {
      const handle = await player.Start({ RoomName: 'room-a', Source: shortClip(), Loop: false, ContextUser: user });
      clients[0].PublishError = new Error('sink gone');
      clock.Advance(40);
      await expect(handle.Ended).resolves.toBe('Failed');
      expect(clients[0].Disconnects).toBe(1);
      expect(player.GetActive('room-a')).toEqual([]);
    });

    it('resolves Disconnected when the server drops the bot', async () => {
      const handle = await player.Start({ RoomName: 'room-a', Source: shortClip(), Loop: false, ContextUser: user });
      clients[0].SimulateServerDisconnect();
      await expect(handle.Ended).resolves.toBe('Disconnected');
      await handle.Stop(); // a later Stop does not change the reason
      expect(handle.EndReason).toBe('Disconnected');
    });

    it('a looping playback never completes on its own; it resolves Stopped when stopped', async () => {
      const handle = await player.Start({ RoomName: 'room-a', Source: { Kind: 'ComfortTone' }, ContextUser: user });
      clock.Advance(30_000);
      expect(handle.EndReason).toBeNull();
      await player.StopAllInRoom('room-a');
      await expect(handle.Ended).resolves.toBe('Stopped');
    });
  });

  it('resamples caller PCM to the room rate', async () => {
    const pcm = new Int16Array(8000).fill(2000); // 1 s at 8 kHz
    await player.Start({ RoomName: 'room-a', Source: { Kind: 'Pcm', Pcm: pcm, SampleRate: 8000 }, ContextUser: user });
    expect(new Int16Array(clients[0].Published[0])[100]).toBe(2000);
  });

  describe('Announce', () => {
    it('returns false and logs once when no speech synthesizer is installed', async () => {
      const handle = await player.Start({ RoomName: 'room-a', Source: { Kind: 'ComfortTone' }, ContextUser: user });
      expect(await handle.Announce({ Text: 'You are caller number three.' })).toBe(false);
      expect(await handle.Announce({ Text: 'Still waiting.' })).toBe(false);
      expect(logError).toHaveBeenCalledTimes(1);
      expect(String(logError.mock.calls[0][0])).toMatch(/no speech synthesizer/);
    });

    it('plays ready-made PCM over the music and resolves once it has played', async () => {
      const handle = await player.Start({ RoomName: 'room-a', Source: { Kind: 'ComfortTone' }, ContextUser: user });
      const done = handle.Announce({ Pcm: new Int16Array(1600).fill(3000), SampleRate: 16000 }); // 100 ms
      clock.Advance(1000);
      expect(await done).toBe(true);
    });

    it('speaks text through the installed synthesizer as the playback user', async () => {
      const synthesizer: IRoomSpeechSynthesizer = { Synthesize: vi.fn(async () => ({ Pcm: new Int16Array(2400).fill(1000), SampleRate: 24000 })) };
      player.SetSpeechSynthesizer(synthesizer);
      const handle = await player.Start({ RoomName: 'room-a', Source: { Kind: 'ComfortTone' }, ContextUser: user });
      const done = handle.Announce({ Text: 'Thanks for waiting.' });
      expect(synthesizer.Synthesize).toHaveBeenCalledWith('Thanks for waiting.', user);
      await new Promise((resolve) => setTimeout(resolve, 0)); // let the synthesized clip reach the pump's queue
      clock.Advance(1000);
      expect(await done).toBe(true);
    });

    it('returns false when the synthesizer throws, and after Stop', async () => {
      player.SetSpeechSynthesizer({ Synthesize: async () => Promise.reject(new Error('TTS vendor down')) });
      const handle = await player.Start({ RoomName: 'room-a', Source: { Kind: 'ComfortTone' }, ContextUser: user });
      expect(await handle.Announce({ Text: 'Hello' })).toBe(false);
      await handle.Stop();
      expect(await handle.Announce({ Pcm: new Int16Array(10), SampleRate: 8000 })).toBe(false);
    });
  });

  describe('sources', () => {
    it('loads an MJ File through the file reader as the context user, and caches the decode', async () => {
      const reader = vi.fn(async () => ({ Bytes: BuildWav({ SampleRate: 16000, BitsPerSample: 16, Channels: [new Array<number>(1600).fill(0.25)] }), FileName: 'q.wav' }));
      player.SetFileReader(reader);
      await player.Start({ RoomName: 'room-a', Source: { Kind: 'File', FileID: 'ABCDEF00-0000-0000-0000-000000000001' }, ContextUser: user });
      await player.Start({ RoomName: 'room-b', Source: { Kind: 'File', FileID: 'abcdef00-0000-0000-0000-000000000001' }, ContextUser: user });
      expect(reader).toHaveBeenCalledTimes(1);
      expect(reader).toHaveBeenCalledWith('ABCDEF00-0000-0000-0000-000000000001', user, undefined);
      expect(new Int16Array(clients[0].Published[0])[10]).toBe(Math.round(0.25 * 32767));
    });

    it('rejects an http URL without fetching or joining', async () => {
      const fetcher = vi.fn();
      player.SetUrlFetcher(fetcher);
      await expect(player.Start({ RoomName: 'room-a', Source: { Kind: 'Url', Url: 'http://cdn.example.com/hold.mp3' }, ContextUser: user })).rejects.toThrow(/https/);
      expect(fetcher).not.toHaveBeenCalled();
      expect(clients).toEqual([]);
    });

    it('surfaces a fetcher failure (e.g. an oversize download) and joins nothing', async () => {
      player.SetUrlFetcher(async () => Promise.reject(new Error('Hold audio URL exceeded the 26214400-byte limit')));
      await expect(player.Start({ RoomName: 'room-a', Source: { Kind: 'Url', Url: 'https://cdn.example.com/huge.wav' }, ContextUser: user })).rejects.toThrow(/byte limit/);
      expect(clients).toEqual([]);
    });

    it('refuses undecodable bytes before joining', async () => {
      player.SetUrlFetcher(async () => ({ Bytes: new Uint8Array([1, 2, 3, 4]), MimeType: 'audio/ogg' }));
      await expect(player.Start({ RoomName: 'room-a', Source: { Kind: 'Url', Url: 'https://cdn.example.com/x.ogg' }, ContextUser: user })).rejects.toThrow(/Unsupported audio format/);
      expect(clients).toEqual([]);
    });
  });

  it('releases the client and registers nothing when the bot cannot join', async () => {
    useModule({ ConnectError: new Error('401 unauthorized') });
    await expect(player.Start({ RoomName: 'room-a', Source: { Kind: 'ComfortTone' }, ContextUser: user })).rejects.toThrow(/could not join room room-a: 401/);
    expect(clients[0].Disconnects).toBe(1);
    expect(player.GetActive('room-a')).toEqual([]);
  });

  it('validates its parameters', async () => {
    await expect(player.Start({ RoomName: ' ', Source: { Kind: 'ComfortTone' }, ContextUser: user })).rejects.toThrow(/RoomName/);
    await expect(player.Start({ RoomName: 'room-a', Source: { Kind: 'Pcm', Pcm: new Int16Array(0), SampleRate: 8000 }, ContextUser: user })).rejects.toThrow(/empty/);
  });
});
