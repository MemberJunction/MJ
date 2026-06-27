import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IMetadataProvider } from '@memberjunction/core';
import { JSONObject } from '@memberjunction/ai';
import { RealtimeSessionService, VoiceCaption, VoiceConnectionState } from '../lib/services/realtime-session.service';

/**
 * Provider-agnostic POLICY surfaces of the voice session service that no other suite
 * covered: typed-text injection (`SendText`), mic mute toggling, the client→UI
 * connection-state mapping (incl. the 'connected' suppression and the error latch),
 * session-config parsing resilience, and the `SaveChannelState` failure paths.
 *
 * Same narrow typed-seam approach as the sibling voice-session suites: a fake realtime
 * client + fake Provider, with private members reached through a typed internals cast.
 */

class FakeRealtimeClient {
  public TextsSent: string[] = [];
  public MuteCalls: boolean[] = [];
  public ToolResults: Array<{ CallID: string; ResultJson: string }> = [];
  public SendText(text: string): void {
    this.TextsSent.push(text);
  }
  public SetMuted(muted: boolean): void {
    this.MuteCalls.push(muted);
  }
  public SendToolResult(callId: string, resultJson: string): void {
    this.ToolResults.push({ CallID: callId, ResultJson: resultJson });
  }
  public async Disconnect(): Promise<void> {
    // no-op
  }
}

/** A minimal MediaStreamTrack stand-in (node tests have no real media stack). */
interface FakeTrack {
  enabled: boolean;
  stop(): void;
}

/** The private surface the tests drive — no `any`, just the members under test. */
interface RealtimeSessionPolicyInternals {
  client: FakeRealtimeClient | null;
  agentSessionId: string | null;
  localStream: { getAudioTracks(): FakeTrack[]; getTracks(): FakeTrack[] } | null;
  onClientStateChange(state: 'connecting' | 'connected' | 'listening' | 'speaking' | 'closed' | 'error'): void;
  parseSessionConfig(sessionConfigJson: string | null): JSONObject;
}

function internals(service: RealtimeSessionService): RealtimeSessionPolicyInternals {
  return service as unknown as RealtimeSessionPolicyInternals;
}

function latestState(service: RealtimeSessionService): VoiceConnectionState {
  let state: VoiceConnectionState = 'closed';
  service.ConnectionState$.subscribe(s => (state = s)).unsubscribe();
  return state;
}

describe('RealtimeSessionService — SendText (typed turn injection)', () => {
  let service: RealtimeSessionService;
  let client: FakeRealtimeClient;
  let executeGQL: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    service = new RealtimeSessionService();
    client = new FakeRealtimeClient();
    executeGQL = vi.fn(async () => ({}));
    service.Provider = { ExecuteGQL: executeGQL } as unknown as IMetadataProvider;
    internals(service).client = client;
    internals(service).agentSessionId = 'sess-1';
  });

  it('injects the trimmed text and relays it through the SAME user-turn path as speech', async () => {
    internals(service).onClientStateChange('listening');

    service.SendText('  hello there  ');
    await vi.waitFor(() => expect(executeGQL).toHaveBeenCalled());

    expect(client.TextsSent).toEqual(['hello there']);
    let captions: VoiceCaption[] = [];
    service.Captions$.subscribe(c => (captions = c)).unsubscribe();
    expect(captions).toEqual([{ Role: 'User', Text: 'hello there' }]);
    expect(executeGQL).toHaveBeenCalledWith(
      expect.stringContaining('RelayRealtimeTranscript'),
      expect.objectContaining({ agentSessionId: 'sess-1', role: 'user', text: 'hello there' })
    );
  });

  it('is a no-op for empty / whitespace-only text', () => {
    internals(service).onClientStateChange('listening');

    service.SendText('');
    service.SendText('   ');

    expect(client.TextsSent).toEqual([]);
    expect(executeGQL).not.toHaveBeenCalled();
  });

  it('is a no-op when the session is not live (state closed)', () => {
    service.SendText('hello');

    expect(client.TextsSent).toEqual([]);
    expect(executeGQL).not.toHaveBeenCalled();
  });

  it('is a no-op when there is no client', () => {
    internals(service).onClientStateChange('listening');
    internals(service).client = null;

    service.SendText('hello');

    expect(executeGQL).not.toHaveBeenCalled();
  });

  it('still captions the turn when no agent session id exists (relay silently skipped)', async () => {
    internals(service).onClientStateChange('listening');
    internals(service).agentSessionId = null;

    service.SendText('typed while minting');
    await Promise.resolve(); // let the relay microtask settle

    expect(client.TextsSent).toEqual(['typed while minting']);
    let captions: VoiceCaption[] = [];
    service.Captions$.subscribe(c => (captions = c)).unsubscribe();
    expect(captions).toEqual([{ Role: 'User', Text: 'typed while minting' }]);
    expect(executeGQL).not.toHaveBeenCalled();
  });
});

describe('RealtimeSessionService — ToggleMute', () => {
  let service: RealtimeSessionService;
  let client: FakeRealtimeClient;

  beforeEach(() => {
    service = new RealtimeSessionService();
    client = new FakeRealtimeClient();
    internals(service).client = client;
  });

  it('returns false and touches nothing when there is no local stream', () => {
    expect(service.ToggleMute()).toBe(false);
    expect(client.MuteCalls).toEqual([]);
  });

  it('returns false when the stream has no audio tracks', () => {
    internals(service).localStream = { getAudioTracks: () => [], getTracks: () => [] };
    expect(service.ToggleMute()).toBe(false);
    expect(client.MuteCalls).toEqual([]);
  });

  it('mutes via the client when the track is currently enabled', () => {
    const track: FakeTrack = { enabled: true, stop: () => undefined };
    internals(service).localStream = { getAudioTracks: () => [track], getTracks: () => [track] };

    expect(service.ToggleMute()).toBe(true);
    expect(client.MuteCalls).toEqual([true]);
  });

  it('unmutes via the client when the track is currently disabled', () => {
    const track: FakeTrack = { enabled: false, stop: () => undefined };
    internals(service).localStream = { getAudioTracks: () => [track], getTracks: () => [track] };

    expect(service.ToggleMute()).toBe(false);
    expect(client.MuteCalls).toEqual([false]);
  });
});

describe('RealtimeSessionService — client→UI connection-state mapping', () => {
  let service: RealtimeSessionService;

  beforeEach(() => {
    service = new RealtimeSessionService();
  });

  it("maps 'connecting' / 'listening' / 'speaking' straight through", () => {
    internals(service).onClientStateChange('connecting');
    expect(latestState(service)).toBe('connecting');

    internals(service).onClientStateChange('listening');
    expect(latestState(service)).toBe('listening');

    internals(service).onClientStateChange('speaking');
    expect(latestState(service)).toBe('speaking');
  });

  it("suppresses 'connected' — the UI stays in its prior state until the control channel opens", () => {
    internals(service).onClientStateChange('connecting');
    internals(service).onClientStateChange('connected');
    expect(latestState(service)).toBe('connecting');
  });

  it("maps 'closed' through when no error was recorded", () => {
    internals(service).onClientStateChange('listening');
    internals(service).onClientStateChange('closed');
    expect(latestState(service)).toBe('closed');
  });

  it("never lets a trailing 'closed' overwrite a terminal 'error'", () => {
    internals(service).onClientStateChange('error');
    internals(service).onClientStateChange('closed');
    expect(latestState(service)).toBe('error');
  });
});

describe('RealtimeSessionService — parseSessionConfig resilience', () => {
  let service: RealtimeSessionService;

  beforeEach(() => {
    service = new RealtimeSessionService();
  });

  it('parses a valid config JSON', () => {
    expect(internals(service).parseSessionConfig('{"instructions":"be brief"}')).toEqual({ instructions: 'be brief' });
  });

  it('returns an empty config for null (nothing to apply — the session still opens)', () => {
    expect(internals(service).parseSessionConfig(null)).toEqual({});
  });

  it('returns an empty config (logged) for malformed JSON', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(internals(service).parseSessionConfig('{not json')).toEqual({});
    expect(error).toHaveBeenCalledWith(expect.stringContaining('SessionConfigJson'), expect.any(Error));
  });
});

describe('RealtimeSessionService — EndVoiceSession / teardown lifecycle', () => {
  let service: RealtimeSessionService;
  let client: FakeRealtimeClient;
  let executeGQL: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    service = new RealtimeSessionService();
    client = new FakeRealtimeClient();
    executeGQL = vi.fn(async () => ({}));
    service.Provider = { ExecuteGQL: executeGQL } as unknown as IMetadataProvider;
  });

  it('is a safe no-op when no session is active and none was minted', async () => {
    await service.EndVoiceSession();
    expect(executeGQL).not.toHaveBeenCalled();
    expect(latestState(service)).toBe('closed');
  });

  it('closes the server session, disconnects the client, stops the mic, and resets state', async () => {
    const track: FakeTrack = { enabled: true, stop: vi.fn() };
    const disconnect = vi.spyOn(client, 'Disconnect');
    internals(service).client = client;
    internals(service).agentSessionId = 'sess-9';
    internals(service).localStream = { getAudioTracks: () => [track], getTracks: () => [track] };
    internals(service).onClientStateChange('listening');
    service.SetMinimized(true);

    await service.EndVoiceSession();

    expect(executeGQL).toHaveBeenCalledWith(expect.stringContaining('CloseAgentSession'), { agentSessionId: 'sess-9' });
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(track.stop).toHaveBeenCalled();
    expect(service.CurrentAgentSessionId).toBeNull();
    expect(service.IsMinimized).toBe(false);
    expect(service.IsActive).toBe(false);
    expect(latestState(service)).toBe('closed');
  });

  it('teardown clears the client-tool handler registry', async () => {
    internals(service).agentSessionId = 'sess-9';
    const handler = vi.fn(() => '{"success":true}');
    service.RegisterClientToolHandler('Whiteboard_', handler);

    await service.EndVoiceSession();

    // After teardown the prefix no longer routes locally — the registry was cleared.
    internals(service).client = client;
    internals(service).agentSessionId = 'sess-10';
    await (service as unknown as { handleToolCall(c: { CallID: string; ToolName: string; ArgumentsJson: string }): Promise<void> })
      .handleToolCall({ CallID: 'c1', ToolName: 'Whiteboard_AddNote', ArgumentsJson: '{}' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('a CloseAgentSession failure is contained (logged) and teardown still completes', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    executeGQL.mockRejectedValueOnce(new Error('server gone'));
    internals(service).agentSessionId = 'sess-9';

    await service.EndVoiceSession();

    expect(service.CurrentAgentSessionId).toBeNull();
    expect(error).toHaveBeenCalledWith(expect.stringContaining('Failed to close server session'), expect.any(Error));
  });

  it("teardown preserves a terminal 'error' state instead of overwriting it with 'closed'", async () => {
    internals(service).agentSessionId = 'sess-9';
    internals(service).onClientStateChange('error');

    await service.EndVoiceSession();

    expect(latestState(service)).toBe('error');
  });
});

describe('RealtimeSessionService — SaveChannelState (explicit id + failure paths)', () => {
  let service: RealtimeSessionService;
  let executeGQL: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    service = new RealtimeSessionService();
    executeGQL = vi.fn(async () => ({ SaveSessionChannelState: true }));
    service.Provider = { ExecuteGQL: executeGQL } as unknown as IMetadataProvider;
  });

  it('uses the EXPLICIT session id even when no live session exists (the teardown-flush case)', async () => {
    const saved = await service.SaveChannelState('Whiteboard', '{"v":1}', 'closed-session-7');

    expect(saved).toBe(true);
    expect(executeGQL).toHaveBeenCalledWith(
      expect.stringContaining('SaveSessionChannelState'),
      { agentSessionId: 'closed-session-7', channelName: 'Whiteboard', stateJson: '{"v":1}' }
    );
  });

  it('prefers the explicit id over the live session id', async () => {
    internals(service).agentSessionId = 'live-session';

    await service.SaveChannelState('Whiteboard', '{}', 'captured-session');

    expect(executeGQL.mock.calls[0][1]).toMatchObject({ agentSessionId: 'captured-session' });
  });

  it('returns false (logged, never thrown) when the mutation throws', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    executeGQL.mockRejectedValueOnce(new Error('network down'));

    const saved = await service.SaveChannelState('Whiteboard', '{}', 'sess-1');

    expect(saved).toBe(false);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('Failed to save channel state'), expect.any(Error));
  });

  it('returns false when the server reports a falsy result', async () => {
    executeGQL.mockResolvedValueOnce({ SaveSessionChannelState: false });
    expect(await service.SaveChannelState('Whiteboard', '{}', 'sess-1')).toBe(false);

    executeGQL.mockResolvedValueOnce({});
    expect(await service.SaveChannelState('Whiteboard', '{}', 'sess-1')).toBe(false);
  });
});

describe('RealtimeSessionService — transcript correction (ReplacesPrevious)', () => {
  let service: RealtimeSessionService;
  let executeGQL: ReturnType<typeof vi.fn>;

  /** The private transcript entry point the client driver feeds. */
  interface TranscriptInternals {
    onClientTranscript(t: {
      Role: 'User' | 'Assistant'; Text: string; IsFinal: boolean;
      Kind: 'normal' | 'narration'; ReplacesPrevious?: boolean;
    }): Promise<void>;
  }

  function transcriptInternals(s: RealtimeSessionService): TranscriptInternals {
    return s as unknown as TranscriptInternals;
  }

  function captionsOf(s: RealtimeSessionService): VoiceCaption[] {
    let captions: VoiceCaption[] = [];
    s.Captions$.subscribe(c => (captions = c)).unsubscribe();
    return captions;
  }

  beforeEach(() => {
    service = new RealtimeSessionService();
    executeGQL = vi.fn(async () => ({}));
    service.Provider = { ExecuteGQL: executeGQL } as unknown as IMetadataProvider;
    internals(service).agentSessionId = 'sess-1';
  });

  it('a correction REPLACES the last assistant caption in place and relays update semantics', async () => {
    const t = transcriptInternals(service);
    await t.onClientTranscript({ Role: 'Assistant', Text: 'The answer is forty-two and', IsFinal: true, Kind: 'normal' });
    await t.onClientTranscript({ Role: 'Assistant', Text: 'The answer is', IsFinal: true, Kind: 'normal', ReplacesPrevious: true });

    expect(captionsOf(service)).toEqual([{ Role: 'Assistant', Text: 'The answer is' }]); // replaced, not appended
    expect(executeGQL).toHaveBeenLastCalledWith(
      expect.stringContaining('RelayRealtimeTranscript'),
      expect.objectContaining({ role: 'assistant', text: 'The answer is', replacesPrevious: true })
    );
  });

  it('a correction replaces the LAST assistant caption, leaving later user turns alone', async () => {
    const t = transcriptInternals(service);
    await t.onClientTranscript({ Role: 'Assistant', Text: 'truncated turn that', IsFinal: true, Kind: 'normal' });
    await t.onClientTranscript({ Role: 'User', Text: 'wait, stop', IsFinal: true, Kind: 'normal' });
    await t.onClientTranscript({ Role: 'Assistant', Text: 'truncated turn', IsFinal: true, Kind: 'normal', ReplacesPrevious: true });

    expect(captionsOf(service)).toEqual([
      { Role: 'Assistant', Text: 'truncated turn' },
      { Role: 'User', Text: 'wait, stop' }
    ]);
  });

  it('a correction with NO prior assistant caption appends (never lost)', async () => {
    await transcriptInternals(service).onClientTranscript({
      Role: 'Assistant', Text: 'orphan correction', IsFinal: true, Kind: 'normal', ReplacesPrevious: true
    });
    expect(captionsOf(service)).toEqual([{ Role: 'Assistant', Text: 'orphan correction' }]);
  });

  it('ordinary finals relay with replacesPrevious=false', async () => {
    await transcriptInternals(service).onClientTranscript({
      Role: 'Assistant', Text: 'normal turn', IsFinal: true, Kind: 'normal'
    });
    expect(executeGQL).toHaveBeenLastCalledWith(
      expect.stringContaining('RelayRealtimeTranscript'),
      expect.objectContaining({ replacesPrevious: false })
    );
  });
});

describe('RealtimeSessionService — per-turn recording timing across a tool-call gap', () => {
  let service: RealtimeSessionService;
  let executeGQL: ReturnType<typeof vi.fn>;
  let now: number; // the fake recorder's current recording-relative offset (ms), advanced by tests

  /** The transcript entry point + the recorder seam the timing logic reads. */
  interface TimingInternals {
    onClientTranscript(t: {
      Role: 'User' | 'Assistant'; Text: string; IsFinal: boolean;
      Kind: 'normal' | 'narration'; ReplacesPrevious?: boolean;
    }): Promise<void>;
    recorder: { NowOffsetMs(): number } | null;
    currentTurnStartMs: number | null;
    turnAudioStartCaptured: boolean;
  }

  function timing(s: RealtimeSessionService): TimingInternals {
    return s as unknown as TimingInternals;
  }

  /** The {utteranceStartMs, utteranceEndMs} the LAST RelayRealtimeTranscript carried. */
  function lastTiming(): { utteranceStartMs: number | null; utteranceEndMs: number | null } {
    const calls = executeGQL.mock.calls;
    for (let i = calls.length - 1; i >= 0; i--) {
      if (typeof calls[i][0] === 'string' && (calls[i][0] as string).includes('RelayRealtimeTranscript')) {
        const vars = calls[i][1] as { utteranceStartMs: number | null; utteranceEndMs: number | null };
        return { utteranceStartMs: vars.utteranceStartMs, utteranceEndMs: vars.utteranceEndMs };
      }
    }
    throw new Error('no RelayRealtimeTranscript call recorded');
  }

  beforeEach(() => {
    service = new RealtimeSessionService();
    executeGQL = vi.fn(async () => ({}));
    service.Provider = { ExecuteGQL: executeGQL } as unknown as IMetadataProvider;
    internals(service).agentSessionId = 'sess-1';
    now = 0;
    // Inject a fake recorder whose offset is whatever the test set `now` to, mirroring how the
    // real RealtimeAudioRecorder reports wall-clock-relative offsets during a live recording.
    timing(service).recorder = { NowOffsetMs: () => now };
    // Seed as the live recorder path does: first turn starts at ~0, guard not yet captured.
    timing(service).currentTurnStartMs = 0;
    timing(service).turnAudioStartCaptured = false;
  });

  it('stamps a post-gap assistant answer at the offset its AUDIO begins, not the prior turn end', async () => {
    const t = timing(service);

    // 0:28 — agent says "checking the latest price now". Its audio started flowing at ~0:25
    // (first interim), finalized at 0:28.
    now = 25000; await t.onClientTranscript({ Role: 'Assistant', Text: 'checking', IsFinal: false, Kind: 'normal' });
    now = 28000; await t.onClientTranscript({ Role: 'Assistant', Text: 'checking the latest price now', IsFinal: true, Kind: 'normal' });
    expect(lastTiming()).toEqual({ utteranceStartMs: 25000, utteranceEndMs: 28000 });

    // ~40s web-search tool call runs (no transcript events during the gap).
    // 1:08–1:18 — the ANSWER turn: its audio begins at 1:08 (first interim), finalized at 1:18.
    now = 68000; await t.onClientTranscript({ Role: 'Assistant', Text: 'I found it', IsFinal: false, Kind: 'normal' });
    now = 78000; await t.onClientTranscript({ Role: 'Assistant', Text: 'I found it, SPCX is $153.23', IsFinal: true, Kind: 'normal' });

    // The fix: start reflects where the answer audio actually is (68000), NOT the prior turn's
    // end (28000) that the old inherit-previous-end model would have stamped.
    expect(lastTiming()).toEqual({ utteranceStartMs: 68000, utteranceEndMs: 78000 });
  });

  it('only the FIRST interim of a turn sets the start (mid-turn deltas do not move it)', async () => {
    const t = timing(service);
    now = 10000; await t.onClientTranscript({ Role: 'Assistant', Text: 'one', IsFinal: false, Kind: 'normal' });
    now = 12000; await t.onClientTranscript({ Role: 'Assistant', Text: 'two', IsFinal: false, Kind: 'normal' });
    now = 15000; await t.onClientTranscript({ Role: 'Assistant', Text: 'one two three', IsFinal: true, Kind: 'normal' });
    expect(lastTiming()).toEqual({ utteranceStartMs: 10000, utteranceEndMs: 15000 });
  });

  it('narration interims never claim the next real turn start slot', async () => {
    const t = timing(service);
    // An ephemeral progress narration speaks during the gap — its interim must NOT stamp the start.
    now = 40000; await t.onClientTranscript({ Role: 'Assistant', Text: 'still working', IsFinal: false, Kind: 'narration' });
    expect(t.currentTurnStartMs).toBe(0); // unchanged by narration
    // The real answer turn then starts at 68000 and must own the start.
    now = 68000; await t.onClientTranscript({ Role: 'Assistant', Text: 'done', IsFinal: false, Kind: 'normal' });
    now = 70000; await t.onClientTranscript({ Role: 'Assistant', Text: 'done, here it is', IsFinal: true, Kind: 'normal' });
    expect(lastTiming()).toEqual({ utteranceStartMs: 68000, utteranceEndMs: 70000 });
  });

  it('a correction (replacesPrevious) carries no start and does not open a new turn', async () => {
    const t = timing(service);
    now = 5000; await t.onClientTranscript({ Role: 'Assistant', Text: 'hi', IsFinal: false, Kind: 'normal' });
    now = 8000; await t.onClientTranscript({ Role: 'Assistant', Text: 'hi there friend', IsFinal: true, Kind: 'normal' });
    now = 9000; await t.onClientTranscript({ Role: 'Assistant', Text: 'hi there', IsFinal: true, Kind: 'normal', ReplacesPrevious: true });
    // The correction relays start=null (it doesn't reopen a turn) while end tracks finalization.
    expect(lastTiming()).toEqual({ utteranceStartMs: null, utteranceEndMs: 9000 });
  });

  it('omits timing entirely when the session is not being recorded', async () => {
    const t = timing(service);
    t.recorder = null;
    await t.onClientTranscript({ Role: 'Assistant', Text: 'no recording', IsFinal: true, Kind: 'normal' });
    expect(lastTiming()).toEqual({ utteranceStartMs: null, utteranceEndMs: null });
  });
});
