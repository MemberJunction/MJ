import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderComponentFixture, query, queryAll, text, ExpectNoAxeViolations } from '@memberjunction/ng-test-utils';
import type { MediaDevice, MediaVideoSource } from '@memberjunction/ai-realtime-client/media';
import { CameraCheckComponent, type MediaCameraCheckChoices } from './camera-check.component';

/** An element source that records what it was attached to and how often it was detached. */
function elementSource(): MediaVideoSource & { Attached: HTMLVideoElement[]; Detaches: number } {
  const source = {
    Kind: 'element' as const,
    Attached: [] as HTMLVideoElement[],
    Detaches: 0,
    Attach: (element: HTMLVideoElement) => {
      source.Attached.push(element);
      return () => {
        source.Detaches++;
      };
    },
  };
  return source;
}

const DEVICES: MediaDevice[] = [
  { Kind: 'microphone', DeviceID: 'mic-1', Label: 'Built-in Mic', GroupID: '' },
  { Kind: 'microphone', DeviceID: 'mic-2', Label: 'USB Mic', GroupID: '' },
  { Kind: 'camera', DeviceID: 'cam-1', Label: 'FaceTime HD', GroupID: '' },
  { Kind: 'speaker', DeviceID: 'spk-1', Label: 'Speakers', GroupID: '' },
];

/** DOM spec for <mj-camera-check>: the preview, the meter, the buttons, the pickers, the name and the choices. */
describe('CameraCheckComponent (DOM)', () => {
  beforeEach(() => {
    // The meter polls on animation frames; the spec only checks that it is there.
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
  });
  afterEach(() => vi.unstubAllGlobals());

  const render = (inputs: Record<string, unknown> = {}) => renderComponentFixture(CameraCheckComponent, { inputs: { Devices: DEVICES, ...inputs } });
  const choices = (f: ReturnType<typeof render>) => {
    const emitted: MediaCameraCheckChoices[] = [];
    f.componentInstance.Confirmed.subscribe((c: MediaCameraCheckChoices) => emitted.push(c));
    return emitted;
  };

  it('shows the camera on its preview while the camera is on', () => {
    const camera = elementSource();
    const f = render({ CameraOn: true, CameraSource: camera });
    const video = query(f, '.check__video') as HTMLVideoElement;
    expect(camera.Attached).toEqual([video]);
    expect(video.classList.contains('check__video--hidden')).toBe(false);
    expect(query(f, '.check__camera-off')).toBeNull();
  });

  it('says the camera is starting before its source arrives, and off when it is off', () => {
    const f = render({ CameraOn: true });
    expect(text(f, '.check__camera-off')).toContain('Starting camera');
    f.componentRef.setInput('CameraOn', false);
    f.componentRef.setInput('CameraSource', elementSource());
    f.detectChanges();
    expect(text(f, '.check__camera-off')).toContain('Camera off');
    expect(query(f, '.check__video')?.classList.contains('check__video--hidden')).toBe(true);
  });

  it('meters the microphone only while it is on and the host gives a level', () => {
    const f = render({ MicrophoneOn: true });
    expect(query(f, 'mj-audio-meter')).toBeNull();
    f.componentRef.setInput('MicrophoneLevel', () => 0.4);
    f.detectChanges();
    expect(query(f, 'mj-audio-meter')).not.toBeNull();
    f.componentRef.setInput('MicrophoneOn', false);
    f.detectChanges();
    expect(query(f, 'mj-audio-meter')).toBeNull();
  });

  it('asks for the opposite microphone and camera state from its buttons, with no Share button', () => {
    const f = render({ MicrophoneOn: true, CameraOn: false });
    const mic = vi.fn();
    const camera = vi.fn();
    f.componentInstance.MicrophoneToggled.subscribe(mic);
    f.componentInstance.CameraToggled.subscribe(camera);
    (query(f, 'button[title="Mute microphone"]') as HTMLButtonElement).click();
    (query(f, 'button[title="Turn on camera"]') as HTMLButtonElement).click();
    expect(mic).toHaveBeenCalledWith(false);
    expect(camera).toHaveBeenCalledWith(true);
    expect(query(f, 'button[title="Share screen"]')).toBeNull();
  });

  it('offers microphones and cameras, not speakers, and reports a pick', () => {
    const f = render({ SelectedMicrophoneID: 'mic-1' });
    const picked = vi.fn();
    f.componentInstance.DeviceSelected.subscribe(picked);
    const [mics, cameras] = queryAll(f, 'select') as HTMLSelectElement[];
    expect(Array.from(mics.options).map((o) => o.value)).toEqual(['mic-1', 'mic-2']);
    expect(Array.from(cameras.options).map((o) => o.value)).toEqual(['cam-1']);
    mics.value = 'mic-2';
    mics.dispatchEvent(new Event('change'));
    cameras.value = 'cam-1';
    cameras.dispatchEvent(new Event('change'));
    expect(picked.mock.calls).toEqual([[{ Kind: 'microphone', DeviceID: 'mic-2' }], [{ Kind: 'camera', DeviceID: 'cam-1' }]]);
  });

  it('leaves out the pickers when the host turns them off', () => {
    expect(queryAll(render({ ShowDeviceSelection: false }), 'select')).toHaveLength(0);
  });

  it('asks for no name by default, and confirms the state and the picked devices', () => {
    const f = render({ MicrophoneOn: true, CameraOn: true, SelectedMicrophoneID: 'mic-2', SelectedCameraID: 'cam-1' });
    const emitted = choices(f);
    expect(query(f, 'input')).toBeNull();
    (query(f, '.check__confirm') as HTMLButtonElement).click();
    expect(emitted).toEqual([{ DisplayName: '', MicrophoneOn: true, CameraOn: true, MicrophoneID: 'mic-2', CameraID: 'cam-1' }]);
  });

  it('holds the confirm button until a required name is typed, and hands the name over trimmed', () => {
    const f = render({ ShowDisplayName: true, RequireDisplayName: true, InitialDisplayName: '' });
    const emitted = choices(f);
    const confirm = query(f, '.check__confirm') as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    const input = query(f, 'input') as HTMLInputElement;
    input.value = '  Grace Hopper ';
    input.dispatchEvent(new Event('input'));
    f.detectChanges();
    expect(confirm.disabled).toBe(false);
    confirm.click();
    expect(emitted[0].DisplayName).toBe('Grace Hopper');
  });

  it('starts the name field from the initial name', () => {
    const f = render({ ShowDisplayName: true, InitialDisplayName: 'Ada' });
    expect(f.componentInstance.DisplayName).toBe('Ada');
  });

  it('releases the preview when it goes away', () => {
    const camera = elementSource();
    const f = render({ CameraOn: true, CameraSource: camera });
    f.destroy();
    expect(camera.Detaches).toBe(1);
  });

  it('has no axe violations', async () => {
    await ExpectNoAxeViolations(render({ ShowDisplayName: true, InitialDisplayName: 'Ada', CameraOn: true, CameraSource: elementSource() }));
  });
});
