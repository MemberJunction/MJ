import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderComponentFixture, query, queryAll, text, capture, ExpectNoAxeViolations } from '@memberjunction/ng-test-utils';
import { RealtimeCaptureModel } from './realtime-capture-model';
import { RealtimeCaptureSurfaceComponent } from './realtime-capture-surface.component';

/**
 * DOM spec for <mj-realtime-capture-surface>: the Camera or Screen Share channel's surface. It owns no rules (the model
 * does; see its spec); it must show the ask while the capture is off, the user's own view while it is on, and send the
 * user's buttons out. Real template, real `mj-self-view` and `mj-share-preview`.
 */
const stream = (name: string): MediaStream => ({ id: name, getTracks: () => [] }) as unknown as MediaStream;

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
});
