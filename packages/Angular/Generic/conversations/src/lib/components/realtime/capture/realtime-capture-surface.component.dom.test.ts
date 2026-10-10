import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Component, Input } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import type { VideoSourceState } from '@memberjunction/ai-realtime-client';
import { REALTIME_CAPTURES_OFF, type RealtimeCaptureStates } from '@memberjunction/realtime-runtime';
import { renderComponentFixture, query, queryAll, text, capture, ExpectNoAxeViolations } from '@memberjunction/ng-test-utils';
import { RealtimePerceptionChipComponent } from '../realtime-perception-chip.component';
import { RealtimeCameraChannel } from './realtime-capture-channel';
import { RealtimeCaptureModel } from './realtime-capture-model';
import { RealtimeCaptureSurfaceComponent } from './realtime-capture-surface.component';

/**
 * DOM spec for <mj-realtime-capture-surface>: the Camera or Screen Share channel's surface. It owns no rules (the model
 * does; see its spec); it must show the ask while the capture is off, the user's own view while it is on, and send the
 * user's buttons out. Real template, real `mj-self-view` and `mj-share-preview`.
 */
const stream = (name: string): MediaStream => ({ id: name, getTracks: () => [] }) as unknown as MediaStream;

/** The camera's surface beside the "Agent can see" chip, as a call shows them, both fed from the session. */
@Component({
  standalone: true,
  imports: [RealtimeCaptureSurfaceComponent, RealtimePerceptionChipComponent],
  template: `
    <mj-realtime-perception-chip [Sources]="Sources"></mj-realtime-perception-chip>
    <mj-realtime-capture-surface [Model]="Model" AgentName="Sage"></mj-realtime-capture-surface>
  `,
})
class CameraBesideChipHost {
  @Input() public Model: RealtimeCaptureModel | null = null;
  @Input() public Sources: readonly VideoSourceState[] = [];
}

function render(kind: 'camera' | 'screen' = 'camera', configure: (m: RealtimeCaptureModel) => void = () => undefined) {
  const model = new RealtimeCaptureModel(kind);
  configure(model);
  const fixture = renderComponentFixture(RealtimeCaptureSurfaceComponent, { inputs: { Model: model, AgentName: 'Sage' } });
  return { fixture, model };
}

const buttons = (fixture: ReturnType<typeof render>['fixture']) => queryAll(fixture, 'button').map((b) => b.textContent?.trim());

describe('RealtimeCaptureSurfaceComponent (DOM)', () => {
  // jsdom has no media playback; a live stream's <video> calls play() and, when the fixture is torn down, pause().
  // The stubs stay in place through the teardown that follows each test.
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  });

  it('shows nothing until a model is bound', () => {
    const fixture = renderComponentFixture(RealtimeCaptureSurfaceComponent, {});
    expect(query(fixture, '.capture')).toBeNull();
  });

  it("shows the agent's request with its reason, and the user's two answers, the affirmative first", () => {
    const { fixture } = render('camera', (m) => m.Ask('to see the label on the box'));
    expect(text(fixture, '.capture__title')).toBe('Sage asks to see your camera');
    expect(text(fixture, '.capture__reason')).toBe('to see the label on the box');
    expect(buttons(fixture)).toEqual(['Turn on camera', 'Not now']);
    expect(text(fixture, '.capture__hint')).toBe('Only you can turn your camera on or off.');
  });

  it('offers to turn it on with no "Not now" when the agent has not asked', () => {
    const { fixture } = render('screen');
    expect(text(fixture, '.capture__title')).toBe('Nothing is shared');
    expect(buttons(fixture)).toEqual(['Share your screen']);
  });

  it("sends the user's answers out", () => {
    const { fixture } = render('camera', (m) => m.Ask('please'));
    const starts = capture(fixture.componentInstance.StartRequested);
    const declines = capture(fixture.componentInstance.DeclineRequested);
    (queryAll(fixture, 'button')[0] as HTMLButtonElement).click();
    (queryAll(fixture, 'button')[1] as HTMLButtonElement).click();
    expect(starts).toHaveLength(1);
    expect(declines).toHaveLength(1);
  });

  it('says why a start failed, as an alert, and lets the user try again', () => {
    const { fixture, model } = render('camera', (m) => m.Ask('please'));
    model.FollowCapture({ Status: 'failed', Failure: 'denied', Message: 'Camera permission was denied.' });
    fixture.detectChanges();
    expect(query(fixture, '.capture__problem')?.getAttribute('role')).toBe('alert');
    expect(text(fixture, '.capture__problem')).toBe('Camera permission was denied.');
    expect(buttons(fixture)).toEqual(['Turn on camera', 'Not now']);
  });

  it('waits while the capture starts', () => {
    const { fixture } = render('screen', (m) => m.FollowCapture({ Status: 'starting' }));
    expect(query(fixture, '.capture--card')?.getAttribute('role')).toBe('status');
    expect(text(fixture, '.mj-loading-text')).toBe("Choose what to share in your browser's window.");
    expect(buttons(fixture)).toEqual([]);
  });

  it('shows the camera as the self-view once on, says whether the agent sees it, and turns it off', () => {
    const { fixture, model } = render('camera', (m) => {
      m.FollowCapture({ Status: 'on', Stream: stream('cam') });
      m.SetAgentCanSee(true);
    });
    expect(query(fixture, 'mj-self-view')).not.toBeNull();
    expect(query(fixture, '.self__badge')).not.toBeNull();
    const stops = capture(fixture.componentInstance.StopRequested);
    (query(fixture, '.capture__bar button') as HTMLButtonElement).click();
    expect(stops).toHaveLength(1);
    model.SetAgentCanSee(false);
    fixture.detectChanges();
    expect(query(fixture, '.self__badge')).toBeNull();
  });

  it('shows a share as its preview once on, with Stop sharing and Change', () => {
    const { fixture } = render('screen', (m) => m.FollowCapture({ Status: 'on', Stream: stream('scr'), Surface: 'window' }));
    expect(text(fixture, '.share__label')).toBe('Sharing a window');
    const stops = capture(fixture.componentInstance.StopRequested);
    const changes = capture(fixture.componentInstance.ChangeRequested);
    const [stop, change] = queryAll(fixture, '.share__actions button') as HTMLButtonElement[];
    stop.click();
    change.click();
    expect(stops).toHaveLength(1);
    expect(changes).toHaveLength(1);
  });

  it('names the shared panel in the preview while the user shares one panel', () => {
    const { fixture } = render('screen', (m) => m.FollowCapture({ Status: 'on', Stream: stream('scr'), Surface: 'tab', PanelLabel: 'Whiteboard' }));
    expect(text(fixture, '.share__label')).toBe('Sharing a panel: Whiteboard');
  });

  it('has no accessibility violations while asking', async () => {
    const { fixture } = render('camera', (m) => m.Ask('please'));
    await ExpectNoAxeViolations(fixture);
  });

  describe('"Agent can see this" while the camera is on, following the frames the model is sent (#5373)', () => {
    /** A capture's source as the session's video source arbiter lists it: on and sent to the model unless the test says otherwise. */
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

    /**
     * A call with the camera on and the Camera channel in it. The session's captures and video sources reach the channel
     * through its context; `publish` hands a source list to the channel and, as the call overlay does, to the chip.
     */
    function cameraOnInCall() {
      const captures = new BehaviorSubject<RealtimeCaptureStates>({ ...REALTIME_CAPTURES_OFF, Camera: { Status: 'on', Stream: stream('cam') } });
      const sources = new BehaviorSubject<readonly VideoSourceState[]>([]);
      const camera = new RealtimeCameraChannel();
      camera.Initialize({
        AgentName: 'Sage',
        Provider: null,
        SendContextNote: () => undefined,
        RequestSave: () => undefined,
        SetFocusMode: () => undefined,
        SaveAsArtifact: async () => null,
        AgentSessionID: 'session-1',
        ExecuteServerAction: async () => null,
        Captures$: captures.asObservable(),
        VideoSources$: sources.asObservable(),
      });
      const fixture = renderComponentFixture(CameraBesideChipHost, { inputs: { Model: camera.Model } });
      const publish = (list: readonly VideoSourceState[]): void => {
        sources.next(list);
        fixture.componentRef.setInput('Sources', list);
        fixture.detectChanges();
      };
      return { fixture, publish };
    }

    const badge = (fixture: ReturnType<typeof cameraOnInCall>['fixture']) => query(fixture, 'mj-self-view .self__badge');
    const chip = (fixture: ReturnType<typeof cameraOnInCall>['fixture']) => text(fixture, '.perception-chip__summary');

    it('shows the badge while the camera is on and nothing else is shared', () => {
      const { fixture, publish } = cameraOnInCall();
      publish([source('camera')]);
      expect(query(fixture, 'mj-self-view')).not.toBeNull();
      expect(text(fixture, 'mj-self-view .self__badge')).toBe('Agent can see this');
      expect(chip(fixture)).toBe('Agent can see: Camera');
    });

    it('takes it away while a screen share on a one-stream model is what the model is sent, as the chip says', () => {
      const { fixture, publish } = cameraOnInCall();
      publish([source('camera')]);
      publish([source('camera', { Active: false }), source('screen')]);
      expect(query(fixture, 'mj-self-view')).not.toBeNull();
      expect(badge(fixture)).toBeNull();
      expect(chip(fixture)).toBe('Agent sees: Shared screen');
    });

    it('brings it back when the user picks the camera under "Agent sees"', () => {
      const { fixture, publish } = cameraOnInCall();
      publish([source('camera', { Active: false }), source('screen')]);
      publish([source('camera', { Picked: true }), source('screen', { Active: false })]);
      expect(text(fixture, 'mj-self-view .self__badge')).toBe('Agent can see this');
      expect(chip(fixture)).toBe('Agent sees: Camera');
    });

    it('shows no badge while the user has turned the camera off for the agent', () => {
      const { fixture, publish } = cameraOnInCall();
      publish([source('camera', { Enabled: false, Active: false }), source('screen')]);
      expect(badge(fixture)).toBeNull();
      expect(chip(fixture)).toBe('Agent can see: Shared screen');
    });
  });
});
