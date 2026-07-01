import { describe, it, expect, vi } from 'vitest';
import { renderComponentFixture, query, queryAll } from '@memberjunction/ng-test-utils';
import { LiveKitDeviceMenuComponent } from './livekit-device-menu.component';
import type { LiveKitDeviceLists } from '../models';

/**
 * DOM spec for <mj-livekit-device-menu> — a standalone, presentational picker (emits a
 * selection; the host calls the controller). Covers the per-kind selects + options, the
 * change → DeviceSelected output, the optional noise-filter / background-blur toggles and
 * their gates, and the Close output.
 */
describe('LiveKitDeviceMenuComponent (DOM)', () => {
  const devices: LiveKitDeviceLists = {
    Microphones: [
      { Kind: 'audioinput', DeviceId: 'mic-1', Label: 'Built-in Mic' },
      { Kind: 'audioinput', DeviceId: 'mic-2', Label: 'USB Mic' },
    ],
    Cameras: [{ Kind: 'videoinput', DeviceId: 'cam-1', Label: 'FaceTime HD' }],
    Speakers: [{ Kind: 'audiooutput', DeviceId: 'spk-1', Label: 'Speakers' }],
  };

  const render = (inputs: Record<string, unknown> = {}) => renderComponentFixture(LiveKitDeviceMenuComponent, { inputs: { Devices: devices, ...inputs } });

  it('renders a select per device kind with the available options', () => {
    const f = render();
    const selects = queryAll(f, 'select');
    expect(selects.length).toBe(3);
    // microphone select has both mic options
    expect(queryAll(f, 'select')[0].querySelectorAll('option').length).toBe(2);
  });

  it('emits DeviceSelected with the kind and id when a microphone is picked', () => {
    const f = render();
    const spy = vi.fn();
    f.componentInstance.DeviceSelected.subscribe(spy);
    const micSelect = queryAll(f, 'select')[0] as HTMLSelectElement;
    micSelect.value = 'mic-2';
    micSelect.dispatchEvent(new Event('change'));
    expect(spy).toHaveBeenCalledWith({ Kind: 'audioinput', DeviceId: 'mic-2' });
  });

  it('hides the noise-filter and background-blur toggles by default', () => {
    const f = render();
    expect(query(f, '.lk-devices__switch')).toBeNull();
    expect(query(f, '.lk-devices__sep')).toBeNull();
  });

  it('shows the noise-filter toggle and emits NoiseFilterToggled when enabled', () => {
    const f = render({ ShowNoiseFilter: true });
    const toggle = query(f, '.lk-devices__switch input[type="checkbox"]') as HTMLInputElement;
    expect(toggle).not.toBeNull();
    const spy = vi.fn();
    f.componentInstance.NoiseFilterToggled.subscribe(spy);
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change'));
    expect(spy).toHaveBeenCalledWith(true);
  });

  it('emits Close when the close button is clicked', () => {
    const f = render();
    const spy = vi.fn();
    f.componentInstance.Close.subscribe(spy);
    (query(f, '.lk-devices__close') as HTMLButtonElement).click();
    expect(spy).toHaveBeenCalled();
  });
});
