import { describe, it, expect, vi } from 'vitest';
import { renderComponentFixture, query, queryAll } from '@memberjunction/ng-test-utils';
import type { MediaDevice } from '@memberjunction/ai-realtime-client/media';
import { MediaDeviceMenuComponent } from './media-device-menu.component';

/** Moved from ng-livekit-room's device-menu spec, with the device lists as one `/media` list. */
describe('MediaDeviceMenuComponent (DOM)', () => {
  const devices: MediaDevice[] = [
    { Kind: 'microphone', DeviceID: 'mic-1', Label: 'Built-in Mic', GroupID: '' },
    { Kind: 'microphone', DeviceID: 'mic-2', Label: 'USB Mic', GroupID: '' },
    { Kind: 'camera', DeviceID: 'cam-1', Label: 'FaceTime HD', GroupID: '' },
    { Kind: 'speaker', DeviceID: 'spk-1', Label: 'Speakers', GroupID: '' },
  ];

  const render = (inputs: Record<string, unknown> = {}) => renderComponentFixture(MediaDeviceMenuComponent, { inputs: { Devices: devices, ...inputs } });

  it('renders a select per device kind with its options', () => {
    const f = render();
    const selects = queryAll(f, 'select');
    expect(selects.length).toBe(3);
    expect(selects[0].querySelectorAll('option').length).toBe(2);
  });

  it('leaves out a kind with no devices', () => {
    const f = render({ Devices: devices.filter((d) => d.Kind !== 'speaker') });
    expect(queryAll(f, 'select').length).toBe(2);
  });

  it('emits DeviceSelected with the kind and id when a microphone is picked', () => {
    const f = render();
    const spy = vi.fn();
    f.componentInstance.DeviceSelected.subscribe(spy);
    const micSelect = queryAll(f, 'select')[0] as HTMLSelectElement;
    micSelect.value = 'mic-2';
    micSelect.dispatchEvent(new Event('change'));
    expect(spy).toHaveBeenCalledWith({ Kind: 'microphone', DeviceID: 'mic-2' });
  });

  it('hides the noise-filter and background-blur toggles by default', () => {
    const f = render();
    expect(query(f, '.menu__switch')).toBeNull();
    expect(query(f, '.menu__sep')).toBeNull();
  });

  it('shows the noise-filter toggle and emits NoiseFilterToggled', () => {
    const f = render({ ShowNoiseFilter: true });
    const toggle = query(f, '.menu__switch input[type="checkbox"]') as HTMLInputElement;
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
    (query(f, '.menu__close') as HTMLButtonElement).click();
    expect(spy).toHaveBeenCalled();
  });
});
