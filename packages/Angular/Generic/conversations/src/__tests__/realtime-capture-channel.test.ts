// The channels import their standalone Angular surface component (partial-compiled Angular libs require the JIT
// compiler in this node test environment), so load the compiler FIRST.
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventEmitter } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { MJGlobal } from '@memberjunction/global';
import type { IMetadataProvider } from '@memberjunction/core';
import {
  BaseRealtimeChannelClient,
  REALTIME_CAPTURES_OFF,
  type RealtimeCaptureKind,
  type RealtimeCaptureState,
  type RealtimeCaptureStates,
  type RealtimeChannelContext,
  type RealtimeChannelEvent,
} from '@memberjunction/realtime-runtime';
import {
  CONVERSATION_CALL_HOST_CHANNELS,
  ConversationCallStartOptions,
  LoadRealtimeCaptureChannels,
  RealtimeCameraChannel,
  RealtimeScreenShareChannel,
} from '../lib/components/realtime/capture/realtime-capture-channel';
import type { RealtimeCaptureSurfaceComponent } from '../lib/components/realtime/capture/realtime-capture-surface.component';

LoadRealtimeCaptureChannels();

const stream = (name: string): MediaStream => ({ id: name }) as unknown as MediaStream;

/** A session as the channel sees it: the captures, the user's clicks, the notes to the model. */
function session() {
  const captures = new BehaviorSubject<RealtimeCaptureStates>(REALTIME_CAPTURES_OFF);
  const started: RealtimeCaptureKind[] = [];
  const stopped: RealtimeCaptureKind[] = [];
  const notes: string[] = [];
  const ctx: RealtimeChannelContext = {
    AgentName: 'Sage',
    Provider: {} as unknown as IMetadataProvider,
    SendContextNote: (text) => notes.push(text),
    RequestSave: vi.fn(),
    SetFocusMode: vi.fn(),
    SaveAsArtifact: async () => null,
    AgentSessionID: 'session-1',
    ExecuteServerAction: async () => null,
    Captures$: captures.asObservable(),
    StartCapture: async (kind): Promise<RealtimeCaptureState> => {
      started.push(kind);
      return { Status: 'starting' };
    },
    StopCapture: (kind) => {
      stopped.push(kind);
    },
  };
  const set = (kind: RealtimeCaptureKind, state: RealtimeCaptureState) =>
    captures.next(kind === 'camera' ? { ...captures.value, Camera: state } : { ...captures.value, Screen: state });
  return { ctx, captures, set, started, stopped, notes };
}

/** A stand-in for the surface: its outputs, and what the channel binds to it. */
function surface() {
  return {
    Model: null,
    AgentName: '',
    StartRequested: new EventEmitter<void>(),
    DeclineRequested: new EventEmitter<void>(),
    StopRequested: new EventEmitter<void>(),
    ChangeRequested: new EventEmitter<void>(),
  } as unknown as RealtimeCaptureSurfaceComponent;
}

describe('the Camera and Screen Share channels', () => {
  let camera: RealtimeCameraChannel;
  let host: ReturnType<typeof session>;
  let events: RealtimeChannelEvent[];

  beforeEach(() => {
    camera = new RealtimeCameraChannel();
    host = session();
    events = [];
    camera.Events$.subscribe((e) => events.push(e));
    camera.Initialize(host.ctx);
  });

  const names = () => events.map((e) => e.Name).filter((n) => n !== 'state_changed');

  it('are resolvable from the ClassFactory by their registry keys, and front the camera and the screen', () => {
    const cam = MJGlobal.Instance.ClassFactory.CreateInstance<BaseRealtimeChannelClient>(BaseRealtimeChannelClient, 'RealtimeCameraChannel');
    const scr = MJGlobal.Instance.ClassFactory.CreateInstance<BaseRealtimeChannelClient>(BaseRealtimeChannelClient, 'RealtimeScreenShareChannel');
    expect(cam).toBeInstanceOf(RealtimeCameraChannel);
    expect(scr).toBeInstanceOf(RealtimeScreenShareChannel);
    expect([cam?.ChannelName, cam?.CaptureKind, cam?.TabTitle]).toEqual(['Camera', 'camera', 'Camera']);
    expect([scr?.ChannelName, scr?.CaptureKind, scr?.TabTitle]).toEqual(['ScreenShare', 'screen', 'Screen share']);
  });

  it('describe themselves as on-demand, opt-in channels that may show the agent pixels, opened with a reason', () => {
    const descriptor = camera.GetDescriptor();
    expect(descriptor).toMatchObject({ Key: 'Camera', DisplayPolicy: 'on-demand', DefaultAvailability: 'opt-in', MaxExposure: 'pixels', Verbs: [] });
    expect(descriptor.Inputs).toMatchObject({ properties: { reason: { type: 'string', maxLength: 200 } }, additionalProperties: false });
    expect(descriptor.Nouns.map((n) => n.Name)).toEqual(['status', 'reason', 'problem']);
    expect(new RealtimeScreenShareChannel().GetDescriptor().Nouns.map((n) => n.Name)).toEqual(['status', 'reason', 'problem', 'surface']);
  });

  it("are the conversations UI's host channels, in the options it starts every call with", () => {
    expect(CONVERSATION_CALL_HOST_CHANNELS).toEqual([{ ClientPluginClass: 'RealtimeCameraChannel' }, { ClientPluginClass: 'RealtimeScreenShareChannel' }]);
    const options = ConversationCallStartOptions();
    expect(options).toEqual({ HostChannels: [...CONVERSATION_CALL_HOST_CHANNELS] });
    expect(options.HostChannels).not.toBe(CONVERSATION_CALL_HOST_CHANNELS);
  });

  it("treat being opened as the agent's request, and answer it", async () => {
    const opened = await camera.Open({ reason: 'to see the label' });
    expect(opened).toMatchObject({ Success: true, Result: { opened: true, channel: 'Camera', asked: true, status: 'asked' } });
    expect(camera.GetState()).toEqual({ status: 'asked', reason: 'to see the label', problem: '' });
    expect(names()).toEqual(['asked', 'opened']);
    expect(host.notes.some((n) => n.includes('"status":"asked"'))).toBe(true);
  });

  it('refuse an open with inputs they do not take', async () => {
    expect(await camera.Open({ reason: 'x', device: 'front' })).toMatchObject({ Success: false, ErrorCode: 'invalid_params' });
  });

  it('do not ask again while the capture is on', async () => {
    host.set('camera', { Status: 'on', Stream: stream('cam') });
    expect(await camera.Open({ reason: 'again' })).toMatchObject({ Result: { asked: false, status: 'on' } });
  });

  it('follow their capture, and stream what happened', () => {
    host.set('screen', { Status: 'on', Stream: stream('scr') });
    expect(camera.GetState()['status']).toBe('off'); // the screen is not the camera's
    host.set('camera', { Status: 'starting' });
    host.set('camera', { Status: 'on', Stream: stream('cam') });
    host.set('camera', { Status: 'off' });
    expect(names()).toEqual(['started', 'stopped']);
  });

  it('say the agent can see the camera only while their exposure allows pixels', () => {
    host.set('camera', { Status: 'on', Stream: stream('cam') });
    expect(camera.Model.View.AgentCanSee).toBe(true);
    camera.ApplyExposure({ User: 'state' });
    expect(camera.Model.View.AgentCanSee).toBe(false);
    camera.ApplyExposure({});
    expect(camera.Model.View.AgentCanSee).toBe(true);
  });

  it("run the user's buttons on their surface: start, not now, stop", async () => {
    const view = surface();
    camera.BindSurface(view);
    expect(view.Model).toBe(camera.Model);
    expect(view.AgentName).toBe('Sage');
    await camera.Open({ reason: 'please' });
    view.DeclineRequested.emit();
    expect(camera.GetState()['status']).toBe('off');
    view.StartRequested.emit();
    view.StopRequested.emit();
    expect(host.started).toEqual(['camera']);
    expect(host.stopped).toEqual(['camera']);
    expect(names()).toContain('declined');
  });

  it("ask the browser's picker again when the user changes what they share", () => {
    const screen = new RealtimeScreenShareChannel();
    screen.Initialize(host.ctx);
    const view = surface();
    screen.BindSurface(view);
    view.ChangeRequested.emit();
    expect(host.stopped).toEqual(['screen']);
    expect(host.started).toEqual(['screen']);
  });

  it('let go of the surface and the captures when unbound or disposed', () => {
    const view = surface();
    camera.BindSurface(view);
    camera.UnbindSurface();
    view.StartRequested.emit();
    expect(host.started).toEqual([]);
    camera.Dispose();
    host.set('camera', { Status: 'on', Stream: stream('cam') });
    expect(camera.Model.View.Status).toBe('off');
  });
});
