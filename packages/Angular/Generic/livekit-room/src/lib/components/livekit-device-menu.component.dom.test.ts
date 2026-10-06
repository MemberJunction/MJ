import { describe, it, expect, vi } from 'vitest';
import { renderComponentFixture, query, queryAll } from '@memberjunction/ng-test-utils';
import { LiveKitDeviceMenuComponent } from './livekit-device-menu.component';
import type { LiveKitDeviceLists } from '../models';

/**
 * DOM spec for the deprecated <mj-livekit-device-menu> wrapper: it renders `mj-media-device-menu` (whose own spec,
 * in ng-realtime-media, covers the pickers and toggles) and maps LiveKit's device lists in and selections out.
 */
describe('LiveKitDeviceMenuComponent (DOM, deprecated wrapper)', () => {
  const devices: LiveKitDeviceLists = {
    Microphones: [
      { Kind: 'audioinput', DeviceId: 'mic-1', Label: 'Built-in Mic' },
      { Kind: 'audioinput', DeviceId: 'mic-2', Label: 'USB Mic' },
    ],
    Cameras: [{ Kind: 'videoinput', DeviceId: 'cam-1', Label: 'FaceTime HD' }],
    Speakers: [{ Kind: 'audiooutput', DeviceId: 'spk-1', Label: 'Speakers' }],
  };

  const render = (inputs: Record<string, unknown> = {}) => renderComponentFixture(LiveKitDeviceMenuComponent, { inputs: { Devices: devices, ...inputs } });

  it('renders a picker per LiveKit device list', () => {
    const selects = queryAll(render(), 'mj-media-device-menu select');
    expect(selects.length).toBe(3);
    expect(selects[0].querySelectorAll('option').length).toBe(2);
  });

  it('hands a pick back as a LiveKit selection', () => {
    const f = render();
    const spy = vi.fn();
    f.componentInstance.DeviceSelected.subscribe(spy);
    const camera = queryAll(f, 'select')[1] as HTMLSelectElement;
    camera.value = 'cam-1';
    camera.dispatchEvent(new Event('change'));
    expect(spy).toHaveBeenCalledWith({ Kind: 'videoinput', DeviceId: 'cam-1' });
  });

  it('maps ShowBackgroundEffects to the blur toggle and re-emits its change', () => {
    const f = render({ ShowBackgroundEffects: true });
    const toggle = query(f, '.menu__switch input[type="checkbox"]') as HTMLInputElement;
    const spy = vi.fn();
    f.componentInstance.BackgroundBlurToggled.subscribe(spy);
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change'));
    expect(spy).toHaveBeenCalledWith(true);
  });

  it('re-emits Close', () => {
    const f = render();
    const spy = vi.fn();
    f.componentInstance.Close.subscribe(spy);
    (query(f, '.menu__close') as HTMLButtonElement).click();
    expect(spy).toHaveBeenCalled();
  });
});
