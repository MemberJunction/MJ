import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderComponentFixture, query, queryAll, text, capture, ExpectNoAxeViolations } from '@memberjunction/ng-test-utils';
import type { MediaDevice } from '@memberjunction/ai-realtime-client/media';
import type { RealtimeCaptureState } from '@memberjunction/realtime-runtime';
import { RealtimeCameraCheckCardComponent } from './realtime-camera-check-card.component';

/**
 * DOM spec for <mj-realtime-camera-check-card>: the camera check over the call. Real `mj-dialog` and `mj-camera-check`:
 * it must show the user's camera mirrored before the agent sees it, offer the cameras with the one in use selected, and
 * send the user's answer out.
 */
const stream = (name: string): MediaStream => ({ id: name, getTracks: () => [] }) as unknown as MediaStream;

const CAMERAS: MediaDevice[] = [
  { DeviceID: 'cam-1', Kind: 'camera', Label: 'Front camera', GroupID: 'laptop' },
  { DeviceID: 'cam-2', Kind: 'camera', Label: 'Desk camera', GroupID: 'desk' },
];

const checking = (overrides: Partial<RealtimeCaptureState> = {}): RealtimeCaptureState => ({
  Status: 'starting',
  Checking: true,
  Stream: stream('camera'),
  DeviceID: 'cam-1',
  Devices: CAMERAS,
  ...overrides,
});

const render = (camera: RealtimeCaptureState = checking()) =>
  renderComponentFixture(RealtimeCameraCheckCardComponent, { inputs: { Camera: camera, AgentName: 'Sage' } });

const buttons = (fixture: ReturnType<typeof render>) => queryAll(fixture, 'button').map((b) => b.textContent?.trim() || b.getAttribute('aria-label'));

describe('RealtimeCameraCheckCardComponent (DOM)', () => {
  // jsdom has no media playback; the preview's <video> calls play() and, when the fixture is torn down, pause().
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  });

  it('shows the camera, mirrored, in a dialog titled "Check your camera" that says who will see it', () => {
    const camera = checking();
    const fixture = render(camera);
    const dialog = query(fixture, '[role="dialog"]');
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(text(fixture, '.mj-dialog-title')).toBe('Check your camera');
    expect(text(fixture, '.camera-check__note')).toBe('Sage sees your camera once you turn it on.');
    const video = query(fixture, '.check__video') as HTMLVideoElement;
    expect(video.srcObject).toBe(camera.Stream);
    expect(video.classList.contains('check__video--hidden')).toBe(false);
  });

  it('checks the camera alone: no heading of its own, no microphone, no buttons but its two answers and the close button', () => {
    const fixture = render();
    expect(query(fixture, '.check__heading')).toBeNull();
    expect(query(fixture, 'mj-media-controls')).toBeNull();
    expect(query(fixture, 'mj-audio-meter')).toBeNull();
    expect(queryAll(fixture, 'select')).toHaveLength(1);
    expect(buttons(fixture)).toEqual(['Close dialog', 'Turn on camera', 'Not now']);
  });

  it('offers the cameras with the one in use selected', async () => {
    const fixture = render();
    const select = query(fixture, 'select') as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.textContent?.trim())).toEqual(['Front camera', 'Desk camera']);
    // ngModel writes the selection after the first check.
    await fixture.whenStable();
    expect(select.value).toBe('cam-1');
  });

  it('starts focus on the camera picker, so a stray Enter cannot turn the camera on', async () => {
    const fixture = render();
    await fixture.whenStable();
    expect(document.activeElement).toBe(query(fixture, 'select'));
  });

  it('turns the camera on for the agent from "Turn on camera"', () => {
    const fixture = render();
    const confirmed = capture(fixture.componentInstance.Confirmed);
    (query(fixture, '.check__confirm') as HTMLButtonElement).click();
    expect(confirmed).toHaveLength(1);
  });

  it('says not now from "Not now", the close button and Escape', () => {
    const fixture = render();
    const declined = capture(fixture.componentInstance.Declined);
    (query(fixture, '.check__cancel') as HTMLButtonElement).click();
    (query(fixture, '.mj-dialog-close') as HTMLButtonElement).click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(declined).toHaveLength(3);
  });

  it('switches to a camera the user picks, showing it while the switch runs, then the camera in use', async () => {
    const asked: string[] = [];
    let finish: () => void = () => undefined;
    const fixture = renderComponentFixture(RealtimeCameraCheckCardComponent, {
      inputs: {
        Camera: checking(),
        AgentName: 'Sage',
        Switch: (deviceId: string) => {
          asked.push(deviceId);
          return new Promise<void>((resolve) => (finish = resolve));
        },
      },
    });
    const select = query(fixture, 'select') as HTMLSelectElement;
    select.value = 'cam-2';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(asked).toEqual(['cam-2']);
    expect(fixture.componentInstance.SelectedCameraID).toBe('cam-2');
    // The new camera could not open: the camera in use is still the first.
    finish();
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.componentInstance.SelectedCameraID).toBe('cam-1');
    expect(select.value).toBe('cam-1');
  });

  it('switches nothing for the camera in use', async () => {
    const asked: string[] = [];
    const fixture = renderComponentFixture(RealtimeCameraCheckCardComponent, {
      inputs: { Camera: checking(), AgentName: 'Sage', Switch: async (deviceId: string) => void asked.push(deviceId) },
    });
    await fixture.componentInstance.OnDeviceSelected({ Kind: 'camera', DeviceID: 'cam-1' });
    expect(asked).toEqual([]);
  });

  it('keeps the preview bound while the stream is the same, and binds a new stream', () => {
    const camera = checking();
    const fixture = render(camera);
    const first = fixture.componentInstance.Source;
    fixture.componentRef.setInput('Camera', { ...camera, DeviceID: 'cam-2' });
    expect(fixture.componentInstance.Source).toBe(first);
    const next = stream('camera-2');
    fixture.componentRef.setInput('Camera', { ...camera, Stream: next });
    fixture.detectChanges();
    expect(fixture.componentInstance.Source).toEqual({ Kind: 'stream', Stream: next });
    expect((query(fixture, '.check__video') as HTMLVideoElement).srcObject).toBe(next);
  });

  it('has no accessibility violations', async () => {
    await ExpectNoAxeViolations(render());
  });
});
