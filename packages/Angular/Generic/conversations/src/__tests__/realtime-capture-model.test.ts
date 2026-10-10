import { describe, it, expect } from 'vitest';
import type { VideoSourceState } from '@memberjunction/ai-realtime-client/media';
import { RealtimeCaptureModel, type RealtimeCaptureChange } from '../lib/components/realtime/capture/realtime-capture-model';

/** A stream the model only passes on. */
const stream = (name: string): MediaStream => ({ id: name }) as unknown as MediaStream;

/**
 * A capture's source as the session's video source arbiter lists it: on and sent to the model unless the test says
 * otherwise. The ids are the arbiter's for the camera and the screen share.
 */
const source = (kind: 'camera' | 'screen', state: Partial<VideoSourceState> = {}): VideoSourceState => ({
  SourceID: `capture:${kind}`,
  Label: kind === 'camera' ? 'Camera' : 'Shared screen',
  Kind: kind,
  ChannelKey: kind === 'camera' ? 'Camera' : 'ScreenShare',
  Enabled: true,
  Active: true,
  FramesSent: 0,
  ...state,
});

function model(kind: 'camera' | 'screen' = 'camera') {
  const m = new RealtimeCaptureModel(kind);
  const events: string[] = [];
  const changes: RealtimeCaptureChange[] = [];
  m.OnChange((change) => {
    changes.push(change);
    if (change.Event) {
      events.push(change.Event.Name);
    }
  });
  return { m, events, changes };
}

describe('RealtimeCaptureModel', () => {
  it('starts off, with nothing to show', () => {
    const { m } = model();
    expect(m.View).toEqual({
      Kind: 'camera',
      Status: 'off',
      Reason: null,
      Problem: null,
      Participant: null,
      Source: null,
      Surface: 'unknown',
      PanelLabel: null,
      AgentCanSee: false,
    });
    expect(m.ToState()).toEqual({ status: 'off', reason: '', problem: '' });
  });

  it("shows the agent's request with its reason, and says it", () => {
    const { m, changes } = model();
    expect(m.Ask('  to see the device you are holding ')).toBe(true);
    expect(m.View).toMatchObject({ Status: 'asked', Reason: 'to see the device you are holding' });
    expect(changes.at(-1)?.Event).toEqual({ Name: 'asked', Payload: { reason: 'to see the device you are holding' } });
    expect(m.Ask(null)).toBe(true);
    expect(m.View).toMatchObject({ Status: 'asked', Reason: '' });
    expect(changes.at(-1)?.Event).toEqual({ Name: 'asked', Payload: {} });
  });

  it('ignores a request while the capture is starting or on', () => {
    const { m, events } = model();
    m.FollowCapture({ Status: 'starting' });
    expect(m.Ask('again')).toBe(false);
    m.FollowCapture({ Status: 'on', Stream: stream('cam') });
    expect(m.Ask('again')).toBe(false);
    expect(m.View.Reason).toBeNull();
    expect(events).toEqual(['started']);
  });

  it("takes a camera check that ends with the camera off as the user declining the agent's request", () => {
    const { m, events } = model();
    m.Ask('to see the label');
    m.FollowCapture({ Status: 'starting' });
    m.FollowCapture({ Status: 'starting', Checking: true, Stream: stream('cam') });
    expect(m.View).toMatchObject({ Status: 'starting', Participant: null });
    m.FollowCapture({ Status: 'off' });
    expect(events).toEqual(['asked', 'declined']);
    expect(m.View).toMatchObject({ Status: 'off', Reason: null });
    expect(m.ToState()).toEqual({ status: 'off', reason: '', problem: '' });
  });

  it("leaves the agent's request standing when a start without a check is stopped before it opens", () => {
    const { m, events } = model();
    m.Ask('to see the label');
    m.FollowCapture({ Status: 'starting' });
    m.FollowCapture({ Status: 'off' });
    expect(events).toEqual(['asked']);
    expect(m.View).toMatchObject({ Status: 'asked', Reason: 'to see the label' });
  });

  it('streams nothing when a check the user started alone ends with the camera off, and starts when it is confirmed', () => {
    const { m, events } = model();
    m.FollowCapture({ Status: 'starting', Checking: true, Stream: stream('cam') });
    m.FollowCapture({ Status: 'off' });
    expect(events).toEqual([]);
    m.Ask('please');
    m.FollowCapture({ Status: 'starting', Checking: true, Stream: stream('cam') });
    m.FollowCapture({ Status: 'on', Stream: stream('cam') });
    expect(events).toEqual(['asked', 'started']);
  });

  it('declines a standing request, and has nothing to decline otherwise', () => {
    const { m, events } = model();
    m.Decline();
    expect(events).toEqual([]);
    m.Ask('please');
    m.Decline();
    expect(m.View).toMatchObject({ Status: 'off', Reason: null });
    expect(events).toEqual(['asked', 'declined']);
  });

  it('answers the request when the camera comes on, and shows it as the same participant while the stream stays', () => {
    const { m, events } = model();
    m.Ask('please');
    m.FollowCapture({ Status: 'starting' });
    expect(m.View).toMatchObject({ Status: 'starting', Reason: 'please' });
    const cam = stream('cam');
    m.FollowCapture({ Status: 'on', Stream: cam });
    const participant = m.View.Participant;
    expect(m.View).toMatchObject({ Status: 'on', Reason: null, Source: null });
    expect(participant).toEqual({ Identity: 'self', DisplayName: 'You', Role: 'self', IsSpeaking: false, Video: { camera: { Kind: 'stream', Stream: cam } } });
    m.SetAgentCanSee(true);
    expect(m.View.Participant).toBe(participant);
    m.FollowCapture({ Status: 'on', Stream: stream('another') });
    expect(m.View.Participant).not.toBe(participant);
    expect(events).toEqual(['asked', 'started']);
  });

  it('shows a share as a source with what it shares, and reports the surface to the agent', () => {
    const { m, changes } = model('screen');
    const screen = stream('screen');
    m.FollowCapture({ Status: 'on', Stream: screen, Surface: 'tab' });
    expect(m.View).toMatchObject({ Kind: 'screen', Status: 'on', Participant: null, Source: { Kind: 'stream', Stream: screen }, Surface: 'tab' });
    expect(changes.at(-1)?.Event).toEqual({ Name: 'started', Payload: { surface: 'tab' } });
    expect(m.ToState()).toEqual({ status: 'on', reason: '', problem: '', surface: 'tab' });
  });

  it('names a shared panel while it is shared, and tells the agent no more than that a tab is shared', () => {
    const { m, changes } = model('screen');
    m.FollowCapture({ Status: 'on', Stream: stream('screen'), Surface: 'tab', PanelLabel: 'Whiteboard' });
    expect(m.View).toMatchObject({ Surface: 'tab', PanelLabel: 'Whiteboard' });
    expect(changes.at(-1)?.Event).toEqual({ Name: 'started', Payload: { surface: 'tab' } });
    expect(m.ToState()).toEqual({ status: 'on', reason: '', problem: '', surface: 'tab' });
    m.FollowCapture({ Status: 'off' });
    expect(m.View.PanelLabel).toBeNull();
  });

  it('says when it stops, and what went wrong when a start fails', () => {
    const { m, changes, events } = model();
    m.FollowCapture({ Status: 'on', Stream: stream('cam') });
    m.FollowCapture({ Status: 'off' });
    expect(m.View).toMatchObject({ Status: 'off', Participant: null });
    m.Ask('please');
    m.FollowCapture({ Status: 'failed', Failure: 'denied', Message: 'Camera permission was denied.' });
    expect(m.View).toMatchObject({ Status: 'failed', Problem: 'Camera permission was denied.', Reason: 'please' });
    expect(changes.at(-1)?.Event).toEqual({ Name: 'failed', Payload: { failure: 'denied', message: 'Camera permission was denied.' } });
    m.FollowCapture({ Status: 'failed', Failure: 'denied', Message: 'Camera permission was denied.' });
    expect(events).toEqual(['started', 'stopped', 'asked', 'failed']);
    expect(m.ToState()).toEqual({ status: 'failed', reason: 'please', problem: 'Camera permission was denied.' });
  });

  it('says the agent can see the capture only while it is on and the channel allows pixels, on a host that reports no sources', () => {
    const { m, changes } = model();
    m.SetAgentCanSee(true);
    expect(m.View.AgentCanSee).toBe(false);
    m.FollowCapture({ Status: 'on', Stream: stream('cam') });
    expect(m.View.AgentCanSee).toBe(true);
    m.SetAgentCanSee(false);
    expect(m.View.AgentCanSee).toBe(false);
    expect(changes.at(-1)?.Event).toBeNull();
  });

  describe('whether the model is sent the frames (#5373)', () => {
    /** A camera that is on, on a channel that lets the agent see pixels. */
    const cameraOn = () => {
      const result = model();
      result.m.SetAgentCanSee(true);
      result.m.FollowCapture({ Status: 'on', Stream: stream('cam') });
      return result;
    };

    it("says the agent can see the camera while the camera's source is on and active", () => {
      const { m } = cameraOn();
      m.FollowVideoSources([source('camera')]);
      expect(m.View.AgentCanSee).toBe(true);
    });

    it('stops saying so while a screen share started after it is the one the model is sent, and says so again once the user picks the camera', () => {
      const { m } = cameraOn();
      m.FollowVideoSources([source('camera')]);
      m.FollowVideoSources([source('camera', { Active: false }), source('screen')]);
      expect(m.View.AgentCanSee).toBe(false);
      m.FollowVideoSources([source('camera', { Picked: true }), source('screen', { Active: false })]);
      expect(m.View.AgentCanSee).toBe(true);
    });

    it("changes only the view: the channel's state, and so what the agent is told, stays the same", () => {
      const { m, changes } = cameraOn();
      const before = changes.length;
      const state = m.ToState();
      m.FollowVideoSources([source('camera')]);
      m.FollowVideoSources([source('camera', { Active: false }), source('screen')]);
      expect(changes).toHaveLength(before);
      expect(m.ToState()).toEqual(state);
    });

    it("does not say so while the camera's source is off, or not listed", () => {
      const { m } = cameraOn();
      m.FollowVideoSources([source('camera', { Enabled: false, Active: false })]);
      expect(m.View.AgentCanSee).toBe(false);
      m.FollowVideoSources([source('camera')]);
      m.FollowVideoSources([source('screen')]);
      expect(m.View.AgentCanSee).toBe(false);
      m.FollowVideoSources([]);
      expect(m.View.AgentCanSee).toBe(false);
    });

    it('still needs the capture on and the channel to allow pixels, whatever the sources say', () => {
      const { m } = model();
      m.FollowVideoSources([source('camera')]);
      m.SetAgentCanSee(true);
      expect(m.View.AgentCanSee).toBe(false);
      m.FollowCapture({ Status: 'on', Stream: stream('cam') });
      expect(m.View.AgentCanSee).toBe(true);
      m.SetAgentCanSee(false);
      expect(m.View.AgentCanSee).toBe(false);
    });

    it("reads a screen share's own source", () => {
      const { m } = model('screen');
      m.SetAgentCanSee(true);
      m.FollowCapture({ Status: 'on', Stream: stream('scr'), Surface: 'window' });
      m.FollowVideoSources([source('screen', { Active: false }), source('camera')]);
      expect(m.View.AgentCanSee).toBe(false);
      m.FollowVideoSources([source('camera', { Active: false }), source('screen')]);
      expect(m.View.AgentCanSee).toBe(true);
    });

    it('shows a new view only when the answer changes', () => {
      const { m } = cameraOn();
      m.FollowVideoSources([source('camera')]);
      const views: boolean[] = [];
      m.View$.subscribe((view) => views.push(view.AgentCanSee));
      m.FollowVideoSources([source('camera', { FramesSent: 4 }), source('screen', { Enabled: false, Active: false })]);
      m.FollowVideoSources([source('camera', { Active: false }), source('screen')]);
      m.FollowVideoSources([source('camera', { Active: false }), source('screen', { FramesSent: 9 })]);
      expect(views).toEqual([true, false]);
    });
  });
});
