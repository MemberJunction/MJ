import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({ toJpeg: vi.fn<(node: HTMLElement, options: object) => Promise<string>>() }));

vi.mock('@angular/core', () => ({ Injectable: () => (target: Function) => target }));
vi.mock('html-to-image', () => ({ toJpeg: mocks.toJpeg }));
vi.mock('@memberjunction/core-entities', () => ({ UserInfoEngine: { Instance: { GetSetting: vi.fn(), SetSettingDebounced: vi.fn() } } }));

import { HomeAppPinService } from '../home-pin.service';
import { BuildDashboardPinInput } from '../dashboard-pin';
import type { HomeAppPinnedItem } from '../home-pin.types';

const REVENUE_ID = 'D1000000-0000-4000-8000-0000000000AB';
const QUOTA_ID = 'D1000000-0000-4000-8000-0000000000CD';

/** A dashboard pin as the service stores it, with this configuration. */
const dashboardPin = (Id: string, Configuration: Record<string, unknown>): HomeAppPinnedItem => ({
  Id,
  DisplayName: 'Revenue',
  ResourceType: 'Dashboards',
  Configuration,
  Sequence: 0,
  PinnedAt: '2026-10-06T12:00:00.000Z',
});

/** A pin service that holds these pins. */
function serviceWith(...pins: HomeAppPinnedItem[]): HomeAppPinService {
  const service = new HomeAppPinService();
  service.Pins$.next(pins);
  return service;
}

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

describe('HomeAppPinService: finding a dashboard pin', () => {
  it('matches a pin that stores the dashboard ID only in recordId, in any letter case', () => {
    const recordIdPin = dashboardPin('P-1', { resourceType: 'Dashboards', recordId: REVENUE_ID });
    const service = serviceWith(recordIdPin);

    expect(service.IsPinned('Dashboards', { dashboardId: REVENUE_ID.toLowerCase() })).toBe(true);
    expect(service.FindPin('Dashboards', { dashboardId: REVENUE_ID.toLowerCase() })).toBe(recordIdPin);
    expect(service.IsPinned('Dashboards', { dashboardId: QUOTA_ID })).toBe(false);
  });

  it("matches a pin from Home's Add Pin panel, which stores only dashboardId, to the shared dashboard pin shape", () => {
    const panelPin = dashboardPin('P-2', { dashboardId: REVENUE_ID });
    const service = serviceWith(panelPin);
    const sharedPin = BuildDashboardPinInput({ ID: REVENUE_ID.toLowerCase(), Name: 'Revenue' });

    expect(service.FindPin('Dashboards', sharedPin.Configuration)).toBe(panelPin);
    expect(service.AddPin(sharedPin)).toBe(false);
    expect(service.Pins$.value).toEqual([panelPin]);
  });

  it('tells apart pins that store different dashboards only in recordId', () => {
    const service = serviceWith(dashboardPin('P-3', { resourceType: 'Dashboards', recordId: REVENUE_ID, isAppDefault: true }));

    expect(service.IsPinned('Dashboards', { resourceType: 'Dashboards', recordId: QUOTA_ID, isAppDefault: true })).toBe(false);
    expect(service.IsPinned('Dashboards', { resourceType: 'Dashboards', recordId: REVENUE_ID.toLowerCase(), isAppDefault: true })).toBe(true);
  });
});
