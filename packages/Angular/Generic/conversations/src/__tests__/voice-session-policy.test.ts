import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IMetadataProvider } from '@memberjunction/core';
import { JSONObject } from '@memberjunction/ai';
import { VoiceSessionService, VoiceCaption, VoiceConnectionState } from '../lib/services/voice-session.service';

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
interface VoiceSessionPolicyInternals {
  client: FakeRealtimeClient | null;
  agentSessionId: string | null;
  localStream: { getAudioTracks(): FakeTrack[]; getTracks(): FakeTrack[] } | null;
  onClientStateChange(state: 'connecting' | 'connected' | 'listening' | 'speaking' | 'closed' | 'error'): void;
  parseSessionConfig(sessionConfigJson: string | null): JSONObject;
}

function internals(service: VoiceSessionService): VoiceSessionPolicyInternals {
  return service as unknown as VoiceSessionPolicyInternals;
}

function latestState(service: VoiceSessionService): VoiceConnectionState {
  let state: VoiceConnectionState = 'closed';
  service.ConnectionState$.subscribe(s => (state = s)).unsubscribe();
  return state;
}

describe('VoiceSessionService — SendText (typed turn injection)', () => {
  let service: VoiceSessionService;
  let client: FakeRealtimeClient;
  let executeGQL: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    service = new VoiceSessionService();
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

describe('VoiceSessionService — ToggleMute', () => {
  let service: VoiceSessionService;
  let client: FakeRealtimeClient;

  beforeEach(() => {
    service = new VoiceSessionService();
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

describe('VoiceSessionService — client→UI connection-state mapping', () => {
  let service: VoiceSessionService;

  beforeEach(() => {
    service = new VoiceSessionService();
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

describe('VoiceSessionService — parseSessionConfig resilience', () => {
  let service: VoiceSessionService;

  beforeEach(() => {
    service = new VoiceSessionService();
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

describe('VoiceSessionService — EndVoiceSession / teardown lifecycle', () => {
  let service: VoiceSessionService;
  let client: FakeRealtimeClient;
  let executeGQL: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    service = new VoiceSessionService();
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
    service.RegisterClientToolHandler('Whiteboard.', handler);

    await service.EndVoiceSession();

    // After teardown the prefix no longer routes locally — the registry was cleared.
    internals(service).client = client;
    internals(service).agentSessionId = 'sess-10';
    await (service as unknown as { handleToolCall(c: { CallID: string; ToolName: string; ArgumentsJson: string }): Promise<void> })
      .handleToolCall({ CallID: 'c1', ToolName: 'Whiteboard.AddNote', ArgumentsJson: '{}' });
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

describe('VoiceSessionService — SaveChannelState (explicit id + failure paths)', () => {
  let service: VoiceSessionService;
  let executeGQL: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    service = new VoiceSessionService();
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
