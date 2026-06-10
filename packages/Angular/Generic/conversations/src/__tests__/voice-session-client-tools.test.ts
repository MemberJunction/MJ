import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VoiceSessionService } from '../lib/services/voice-session.service';

/**
 * CLIENT-EXECUTED UI TOOL routing (the live whiteboard's `Whiteboard_*` path).
 *
 * The registry + routing live behind the service's private tool-call handler, so these tests
 * reach it through a narrow typed seam: a fake realtime client capturing `SendToolResult`, and
 * direct invocation of `handleToolCall` with a synthetic provider tool-call frame.
 */

/** The private surface the tests drive — no `any`, just the members under test. */
interface VoiceSessionInternals {
  client: FakeRealtimeClient | null;
  handleToolCall(call: { CallID: string; ToolName: string; ArgumentsJson: string }): Promise<void>;
}

class FakeRealtimeClient {
  public ToolResults: Array<{ CallID: string; ResultJson: string }> = [];
  public ContextNotes: string[] = [];
  public SendToolResult(callId: string, resultJson: string): void {
    this.ToolResults.push({ CallID: callId, ResultJson: resultJson });
  }
  public SendContextNote(text: string): void {
    this.ContextNotes.push(text);
  }
}

function internals(service: VoiceSessionService): VoiceSessionInternals {
  return service as unknown as VoiceSessionInternals;
}

describe('VoiceSessionService — client-executed UI tool routing', () => {
  let service: VoiceSessionService;
  let fakeClient: FakeRealtimeClient;

  beforeEach(() => {
    service = new VoiceSessionService();
    fakeClient = new FakeRealtimeClient();
    internals(service).client = fakeClient;
  });

  it('routes a prefix-matched tool call to the LOCAL handler and feeds its result back', async () => {
    const handler = vi.fn((toolName: string, argsJson: string) =>
      JSON.stringify({ success: true, summary: `${toolName}:${argsJson}` })
    );
    service.RegisterClientToolHandler('Whiteboard_', handler);

    await internals(service).handleToolCall({
      CallID: 'call-1',
      ToolName: 'Whiteboard_AddNote',
      ArgumentsJson: '{"text":"hi"}'
    });

    expect(handler).toHaveBeenCalledWith('Whiteboard_AddNote', '{"text":"hi"}');
    expect(fakeClient.ToolResults).toEqual([
      { CallID: 'call-1', ResultJson: JSON.stringify({ success: true, summary: 'Whiteboard_AddNote:{"text":"hi"}' }) }
    ]);
  });

  it('supports async handlers', async () => {
    service.RegisterClientToolHandler('Whiteboard_', async () => '{"success":true}');

    await internals(service).handleToolCall({ CallID: 'call-2', ToolName: 'Whiteboard_MoveItem', ArgumentsJson: '{}' });

    expect(fakeClient.ToolResults).toEqual([{ CallID: 'call-2', ResultJson: '{"success":true}' }]);
  });

  it('wraps a thrown handler error as { success:false, error } so the model can narrate it', async () => {
    service.RegisterClientToolHandler('Whiteboard_', () => {
      throw new Error('board offline');
    });

    await internals(service).handleToolCall({ CallID: 'call-3', ToolName: 'Whiteboard_AddShape', ArgumentsJson: '{}' });

    expect(fakeClient.ToolResults).toHaveLength(1);
    expect(JSON.parse(fakeClient.ToolResults[0].ResultJson)).toEqual({ success: false, error: 'board offline' });
  });

  it('does NOT capture non-matching tool names (they take the server-relay path)', async () => {
    const handler = vi.fn(() => '{"success":true}');
    service.RegisterClientToolHandler('Whiteboard_', handler);

    // No agentSessionId is minted, so the server path fails fast — the point is the
    // local handler is never consulted and the model still receives an error result.
    await internals(service).handleToolCall({ CallID: 'call-4', ToolName: 'invoke-target-agent', ArgumentsJson: '{}' });

    expect(handler).not.toHaveBeenCalled();
    expect(fakeClient.ToolResults).toHaveLength(1);
    expect(JSON.parse(fakeClient.ToolResults[0].ResultJson)).toMatchObject({
      error: expect.stringContaining('No active agent session')
    });
  });

  it('UnregisterClientToolHandler removes the route — later calls fall through to the server path', async () => {
    const handler = vi.fn(() => '{"success":true}');
    service.RegisterClientToolHandler('Whiteboard_', handler);
    service.UnregisterClientToolHandler('Whiteboard_');

    await internals(service).handleToolCall({ CallID: 'call-5', ToolName: 'Whiteboard_AddNote', ArgumentsJson: '{}' });

    expect(handler).not.toHaveBeenCalled();
    expect(JSON.parse(fakeClient.ToolResults[0].ResultJson)).toMatchObject({
      error: expect.stringContaining('No active agent session')
    });
  });

  it('re-registering the same prefix replaces the handler', async () => {
    service.RegisterClientToolHandler('Whiteboard_', () => '{"v":1}');
    service.RegisterClientToolHandler('Whiteboard_', () => '{"v":2}');

    await internals(service).handleToolCall({ CallID: 'call-6', ToolName: 'Whiteboard_AddText', ArgumentsJson: '{}' });

    expect(fakeClient.ToolResults).toEqual([{ CallID: 'call-6', ResultJson: '{"v":2}' }]);
  });
});

describe('VoiceSessionService — SendContextNote guard', () => {
  it('is a no-op when no session is live (no client / closed state)', () => {
    const service = new VoiceSessionService();
    const fakeClient = new FakeRealtimeClient();
    internals(service).client = fakeClient;

    // ConnectionState is 'closed' by default — the note must NOT reach the client.
    service.SendContextNote('[whiteboard] {"added":[]}');
    expect(fakeClient.ContextNotes).toEqual([]);
  });

  it('ignores empty / whitespace-only notes', () => {
    const service = new VoiceSessionService();
    const fakeClient = new FakeRealtimeClient();
    internals(service).client = fakeClient;

    service.SendContextNote('   ');
    expect(fakeClient.ContextNotes).toEqual([]);
  });
});

describe('VoiceSessionService — SaveChannelState guards', () => {
  it('returns false when no session id is available (live or explicit)', async () => {
    const service = new VoiceSessionService();
    const saved = await service.SaveChannelState('Whiteboard', '{"items":[]}');
    expect(saved).toBe(false);
  });
});
