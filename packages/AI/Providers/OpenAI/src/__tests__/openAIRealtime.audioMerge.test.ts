import { describe, it, expect, vi } from 'vitest';

// Same module mocks as openAIRealtime.test.ts: no-op @RegisterClass, base classes only, no network.
vi.mock('@memberjunction/global', () => ({
  RegisterClass: () => (target: unknown) => target,
}));
vi.mock('@memberjunction/ai', async () => {
  class BaseModel {
    protected _apiKey: string;
    constructor(apiKey: string) {
      this._apiKey = apiKey;
    }
  }
  class BaseRealtimeModel extends BaseModel {}
  const RealtimeDiagLog = () => { /* no-op in tests */ };
  const { IsTranscriptContinuation } = await import('../../../../Core/src/generic/transcriptContinuation');
  const { ResolveResponseDoneUsage } = await import('../../../../Core/src/generic/realtimeUsage');
  const { RealtimeDroppedInputReporter } = await import('../../../../Core/src/generic/realtimeDroppedInputReporter');
  return { BaseModel, BaseRealtimeModel, RealtimeDiagLog, IsTranscriptContinuation, ResolveResponseDoneUsage, RealtimeDroppedInputReporter };
});
vi.mock('openai/realtime/websocket', () => ({ OpenAIRealtimeWebSocket: vi.fn() }));
vi.mock('openai', () => ({
  OpenAI: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    return this;
  }),
}));

import {
  MergeAudioOverride, BuildSessionPayload, ExtractRealtimeFeatures, OpenAIRealtime, OPENAI_REALTIME_PROFILE,
  type IOpenAIRealtimeConnection,
} from '../models/openAIRealtime.js';
import type { RealtimeSessionParams, IRealtimeSession } from '@memberjunction/ai';
import type { OpenAIRealtimeError } from 'openai/realtime/index';
import type { RealtimeServerEvent, RealtimeClientEvent } from 'openai/resources/realtime/realtime';
import type { ClientSecretCreateParams, ClientSecretCreateResponse } from 'openai/resources/realtime/client-secrets';

const built = {
  input: { transcription: { model: 'gpt-4o-mini-transcribe' },
           turn_detection: { type: 'server_vad', silence_duration_ms: 700, create_response: true, interrupt_response: true } },
  output: { voice: 'alloy' },
} as const;

describe('MergeAudioOverride', () => {
  it('merges a leaf into the built turn_detection and keeps transcription', () => {
    const out = MergeAudioOverride(built, { input: { turn_detection: { idle_timeout_ms: 8000 } } }, false);
    expect(out?.input?.transcription).toEqual({ model: 'gpt-4o-mini-transcribe' });
    expect(out?.input?.turn_detection).toEqual({ ...built.input.turn_detection, idle_timeout_ms: 8000 });
    expect(out?.output).toEqual({ voice: 'alloy' });
  });
  it('replaces turn_detection when the override changes its type', () => {
    const out = MergeAudioOverride(built, { input: { turn_detection: { type: 'semantic_vad', eagerness: 'low' } } }, false);
    expect(out?.input?.turn_detection).toEqual({ type: 'semantic_vad', eagerness: 'low' });
    expect(out?.input?.transcription).toEqual({ model: 'gpt-4o-mini-transcribe' });
  });
  it('keeps the meeting-mode floor create_response:false', () => {
    const meeting = { input: { turn_detection: { type: 'server_vad', create_response: false, interrupt_response: true } } } as const;
    const out = MergeAudioOverride(meeting, { input: { turn_detection: { create_response: true } } }, true);
    expect(out?.input?.turn_detection?.create_response).toBe(false);
  });
  it('lets the bag set create_response outside meeting mode', () => {
    const out = MergeAudioOverride(built, { input: { turn_detection: { create_response: false } } }, false);
    expect(out?.input?.turn_detection?.create_response).toBe(false);
  });
  it('ignores a non-object override', () => {
    expect(MergeAudioOverride(built, 'off', false)).toEqual(built);
    expect(MergeAudioOverride(built, null, false)).toEqual(built);
    expect(MergeAudioOverride(built, [], false)).toEqual(built);
  });
  it('a null leaf removes the built key', () => {
    const out = MergeAudioOverride(built, { input: { transcription: null } }, false);
    expect(out?.input?.transcription).toBeUndefined();
    expect(out?.input?.turn_detection).toEqual(built.input.turn_detection);
  });
  it('returns the override alone when nothing was built', () => {
    expect(MergeAudioOverride(undefined, { input: { turn_detection: { type: 'server_vad' } } }, false))
      .toEqual({ input: { turn_detection: { type: 'server_vad' } } });
  });

  describe('meeting-mode floor cannot be bypassed', () => {
    const meetingBuilt = { input: { transcription: { model: 'm' },
      turn_detection: { type: 'server_vad', create_response: false, interrupt_response: true } } } as const;
    const bypasses: Array<[string, unknown]> = [
      ['turn_detection null', { input: { turn_detection: null } }],
      ['input null', { input: null }],
      ['input string', { input: 'x' }],
      ['turn_detection string', { input: { turn_detection: 'off' } }],
    ];
    for (const [name, bag] of bypasses) {
      it(`restores the floor for ${name}`, () => {
        const out = MergeAudioOverride(meetingBuilt, bag, true);
        expect(out?.input?.turn_detection).toEqual(meetingBuilt.input.turn_detection);
      });
    }
    it('uses a default server_vad block when nothing was built', () => {
      const out = MergeAudioOverride(undefined, { input: { turn_detection: null } }, true);
      expect(out?.input?.turn_detection).toEqual({ type: 'server_vad', create_response: false, interrupt_response: true });
    });
    it('does not restore outside meeting mode', () => {
      const out = MergeAudioOverride(built, { input: { turn_detection: null } }, false);
      expect(out?.input?.turn_detection).toBeUndefined();
    });
    it('applies the floor after a cross-type replace', () => {
      const out = MergeAudioOverride(meetingBuilt, { input: { turn_detection: { type: 'semantic_vad', create_response: true } } }, true);
      expect(out?.input?.turn_detection).toEqual({ type: 'semantic_vad', create_response: false });
    });
  });
  it('does not mutate built or override', () => {
    const b = structuredClone(built);
    const o = { input: { turn_detection: { idle_timeout_ms: 1, type: 'semantic_vad' }, transcription: null } };
    const oCopy = structuredClone(o);
    MergeAudioOverride(b, o, true);
    expect(b).toEqual(built);
    expect(o).toEqual(oCopy);
  });
  it('ignores prototype-polluting keys', () => {
    const o = JSON.parse('{"__proto__":{"polluted":1},"input":{"constructor":{"x":1}}}');
    const out = MergeAudioOverride(built, o, false);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(out, 'polluted')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(out?.input, 'constructor')).toBe(false);
  });
});


/** Minimal fake connection: records outbound frames and can fire server events (no network). */
class RecordingConnection implements IOpenAIRealtimeConnection {
  public Sent: RealtimeClientEvent[] = [];
  private listeners: Array<(event: RealtimeServerEvent) => void> = [];
  public on(event: 'event', listener: (event: RealtimeServerEvent) => void): void;
  public on(event: 'error', listener: (error: OpenAIRealtimeError) => void): void;
  public on(event: 'event' | 'error', listener: ((event: RealtimeServerEvent) => void) | ((error: OpenAIRealtimeError) => void)): void {
    if (event === 'event') {
      this.listeners.push(listener as (event: RealtimeServerEvent) => void);
    }
  }
  public off(event: 'event', listener: (event: RealtimeServerEvent) => void): void;
  public off(event: 'error', listener: (error: OpenAIRealtimeError) => void): void;
  public off(): void { /* teardown not exercised */ }
  public Fire(event: RealtimeServerEvent): void {
    for (const l of this.listeners) {
      l(event);
    }
  }
  public send(event: RealtimeClientEvent): void {
    this.Sent.push(event);
  }
  public close(): void { /* nothing to release */ }
}

/** Driver that captures both the mint body and the session.update frame (no network). */
class PayloadCapture extends OpenAIRealtime {
  public Fake = new RecordingConnection();
  public MintBody: ClientSecretCreateParams | null = null;
  protected override createConnection(): IOpenAIRealtimeConnection {
    return this.Fake;
  }
  /** The driver defers its session.update to the server's session.created frame; fire it as the real socket would. */
  public override async StartSession(params: RealtimeSessionParams): Promise<IRealtimeSession> {
    const session = await super.StartSession(params);
    this.Fake.Fire({ type: 'session.created' } as RealtimeServerEvent);
    return session;
  }
  protected override async mintClientSecret(body: ClientSecretCreateParams): Promise<ClientSecretCreateResponse> {
    this.MintBody = body;
    return { value: 'v', expires_at: 1893456000, session: { type: 'realtime' } as ClientSecretCreateResponse['session'] };
  }
  /** The `session` of the first session.update the server-bridged path sent. */
  public SentSession(): Record<string, unknown> {
    const update = this.Fake.Sent.find((e) => e.type === 'session.update');
    if (update?.type !== 'session.update') {
      throw new Error('no session.update was sent');
    }
    return update.session as Record<string, unknown>;
  }
  public MintedSession(): Record<string, unknown> {
    return this.MintBody?.session as Record<string, unknown>;
  }
}

type AudioShape = { input?: { transcription?: { model?: string }; turn_detection?: Record<string, unknown> }; output?: unknown };

describe('session payload', () => {
  const bag = {
    audio: { input: { turn_detection: { idle_timeout_ms: 8000 } } },
    turnDetection: { Mode: 'serverVad', SilenceDurationMs: 700 },
  };

  it('mint path: merged audio keeps transcription and built turn detection and adds idle_timeout_ms', async () => {
    const driver = new PayloadCapture('k');
    await driver.CreateClientSession({ Model: 'gpt-realtime', SystemPrompt: 'hi', Config: bag });
    const body = driver.MintedSession();
    const audio = body.audio as AudioShape;
    expect(audio.input?.transcription?.model).toBe(OPENAI_REALTIME_PROFILE.inputTranscriptionModel);
    expect(audio.input?.turn_detection).toMatchObject({ type: 'server_vad', silence_duration_ms: 700, idle_timeout_ms: 8000 });
    expect(body).not.toHaveProperty('turnDetection');
  });

  it('session.update path: the same merged block is sent', async () => {
    const driver = new PayloadCapture('k');
    await driver.StartSession({ Model: 'gpt-realtime', SystemPrompt: 'hi', Config: bag });
    const audio = driver.SentSession().audio as AudioShape;
    expect(audio.input?.transcription?.model).toBe(OPENAI_REALTIME_PROFILE.inputTranscriptionModel);
    expect(audio.input?.turn_detection).toMatchObject({ type: 'server_vad', silence_duration_ms: 700, idle_timeout_ms: 8000 });
  });

  it('does not add output on a profile without voice output', () => {
    const profile = { ...OPENAI_REALTIME_PROFILE, supportsVoiceOutput: false };
    const session = BuildSessionPayload(profile, ExtractRealtimeFeatures({ audio: { output: { voice: 'alloy' } } }), 'hi');
    expect(session.audio?.output).toBeUndefined();
  });

  it('omits instructions when undefined and keeps type realtime', () => {
    const session = BuildSessionPayload(OPENAI_REALTIME_PROFILE, ExtractRealtimeFeatures({}), undefined);
    expect(session.type).toBe('realtime');
    expect(session).not.toHaveProperty('instructions');
  });

  it('a bag audio override of a different type replaces the built turn_detection on both paths', async () => {
    const swap = {
      audio: { input: { turn_detection: { type: 'semantic_vad' } } },
      turnDetection: { Mode: 'serverVad', SilenceDurationMs: 700 },
    };
    const driver = new PayloadCapture('k');
    await driver.CreateClientSession({ Model: 'gpt-realtime', SystemPrompt: 'hi', Config: swap });
    await driver.StartSession({ Model: 'gpt-realtime', SystemPrompt: 'hi', Config: swap });
    for (const session of [driver.MintedSession(), driver.SentSession()]) {
      expect((session.audio as AudioShape).input?.turn_detection).toEqual({ type: 'semantic_vad' });
    }
  });
});
