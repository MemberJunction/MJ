import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({ toJpeg: vi.fn<(node: HTMLElement, options: object) => Promise<string>>() }));

vi.mock('@angular/core', () => ({ Injectable: () => (target: Function) => target }));
vi.mock('html-to-image', () => ({ toJpeg: mocks.toJpeg }));
vi.mock('@memberjunction/core-entities', () => ({ UserInfoEngine: { Instance: { GetSetting: vi.fn(), SetSettingDebounced: vi.fn() } } }));

import { HomeAppPinService } from '../home-pin.service';

/** An element with a size and a few child nodes, as CaptureThumbnail reads it. */
function sizedElement(): HTMLElement {
  return { clientWidth: 800, clientHeight: 600, getElementsByTagName: () => ({ length: 10 }) } as unknown as HTMLElement;
}

/** Starts a capture whose screenshot never finishes, and reports its result once it settles. */
function startStalledCapture(timeoutMs?: number): { result: () => string | undefined | 'pending' } {
  mocks.toJpeg.mockReturnValue(new Promise<string>(() => undefined));
  let result: string | undefined | 'pending' = 'pending';
  const service = new HomeAppPinService();
  const capture = timeoutMs === undefined ? service.CaptureThumbnail(sizedElement()) : service.CaptureThumbnail(sizedElement(), timeoutMs);
  void capture.then(value => (result = value));
  return { result: () => result };
}

describe('HomeAppPinService.CaptureThumbnail', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.toJpeg.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the screenshot when it is ready within the timeout', async () => {
    mocks.toJpeg.mockResolvedValue('data:image/jpeg;base64,c2hvdA==');
    await expect(new HomeAppPinService().CaptureThumbnail(sizedElement(), 1500)).resolves.toBe('data:image/jpeg;base64,c2hvdA==');
  });

  it('gives up after the timeout it is given', async () => {
    const capture = startStalledCapture(1500);

    await vi.advanceTimersByTimeAsync(1499);
    expect(capture.result()).toBe('pending');

    await vi.advanceTimersByTimeAsync(1);
    expect(capture.result()).toBeUndefined();
  });

  it('waits 4 seconds when no timeout is given', async () => {
    const capture = startStalledCapture();

    await vi.advanceTimersByTimeAsync(3999);
    expect(capture.result()).toBe('pending');

    await vi.advanceTimersByTimeAsync(1);
    expect(capture.result()).toBeUndefined();
  });
});
