/**
 * Tests for NavigationService's one-step tab history — the origin crumb's
 * Back button (#5221). Back goes to the LAST PLACE the user was (the most
 * recently accessed other tab, by the `lastAccessedAt` stamp every tab gets
 * on create and on each activation), not to where the record was opened;
 * that restore stays on the breadcrumb segments, and is Back's fallback when
 * no other tab is open.
 *
 * Mock preamble mirrors record-open-scope.test.ts — the Angular decorators
 * have to be inert before NavigationService can be imported at all.
 */
import { describe, it, expect, vi } from 'vitest';
import { NavigationService } from '../navigation.service';
import type { WorkspaceTab } from '@memberjunction/ng-base-application';

vi.mock(import('@angular/core'), async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    Directive: () => (target: Function) => target,
    Injectable: () => (target: Function) => target,
    inject: vi.fn(),
  };
});
vi.mock('@angular/router', () => ({}));
vi.mock('@memberjunction/ng-base-types', () => ({ BaseAngularComponent: class {} }));
vi.mock('@memberjunction/core', () => ({
  BaseEntity: class {},
  Metadata: class {},
  CompositeKey: class {},
  LogError: vi.fn(),
}));
vi.mock('@memberjunction/core-entities', () => ({ ResourceData: class {} }));
vi.mock('@memberjunction/global', () => ({
  UUIDsEqual: (a: string, b: string) => a === b,
  GetGlobalObjectStore: () => ({}),
}));

function tab(id: string, lastAccessedAt: string, extra: Partial<WorkspaceTab> = {}): WorkspaceTab {
  return {
    id, title: `Title ${id}`, applicationId: `app-${id}`, lastAccessedAt,
    configuration: {}, ...extra,
  } as WorkspaceTab;
}

function createService(tabs: WorkspaceTab[], activeTabId: string | null) {
  const setActiveTab = vi.fn();
  const setActiveApp = vi.fn().mockResolvedValue(undefined);
  const service = Object.create(NavigationService.prototype) as NavigationService;
  const internals = service as unknown as Record<string, unknown>;
  internals['workspaceManager'] = {
    GetConfiguration: () => ({ tabs }),
    GetActiveTabId: () => activeTabId,
    SetActiveTab: setActiveTab,
  };
  internals['appManager'] = { SetActiveApp: setActiveApp };
  const returnToRecordSource = vi.fn().mockResolvedValue(undefined);
  internals['ReturnToRecordSource'] = returnToRecordSource;
  return { service, setActiveTab, setActiveApp, returnToRecordSource };
}

const origin = { sourceAppId: 'app-1', sourceAppName: 'Data Explorer', sourceNavLabel: 'Entities', sourceTabId: 't-src' };

describe('NavigationService one-step Back (ReturnToPreviousTab)', () => {
  it('activates the most recently accessed tab other than the active one', async () => {
    const { service, setActiveTab, setActiveApp, returnToRecordSource } = createService([
      tab('record', '2026-10-15T10:05:00.000Z'),       // active, newest
      tab('older', '2026-10-15T10:01:00.000Z'),
      tab('dashboards', '2026-10-15T10:03:00.000Z'),   // the newer of the other two
    ], 'record');

    expect(service.GetPreviousTab('record')?.id).toBe('dashboards');
    await service.ReturnToPreviousTab(origin, 'record');

    expect(setActiveApp).toHaveBeenCalledWith('app-dashboards');
    expect(setActiveTab).toHaveBeenCalledWith('dashboards');
    // App first, then tab — same sequencing as ReturnToRecordSource's exact-tab path
    expect(setActiveApp.mock.invocationCallOrder[0]).toBeLessThan(setActiveTab.mock.invocationCallOrder[0]);
    expect(returnToRecordSource).not.toHaveBeenCalled();
  });

  it("never returns the caller's own tab (Back clicked in a pane that is not the active tab)", async () => {
    const { service, setActiveTab } = createService([
      tab('other-pane', '2026-10-15T10:05:00.000Z'),   // active
      tab('record', '2026-10-15T10:04:00.000Z'),       // the crumb's own tab
      tab('dashboards', '2026-10-15T10:02:00.000Z'),
    ], 'other-pane');

    await service.ReturnToPreviousTab(origin, 'record');
    expect(setActiveTab).toHaveBeenCalledWith('dashboards');
  });

  it('falls back to the origin restore when no other tab is open', async () => {
    const { service, setActiveTab, setActiveApp, returnToRecordSource } = createService([
      tab('record', '2026-10-15T10:05:00.000Z'),
    ], 'record');

    expect(service.GetPreviousTab('record')).toBeUndefined();
    await service.ReturnToPreviousTab(origin, 'record');

    expect(returnToRecordSource).toHaveBeenCalledWith(origin);
    expect(setActiveTab).not.toHaveBeenCalled();
    expect(setActiveApp).not.toHaveBeenCalled();
  });

  it('does nothing with no other tab and no origin to fall back to', async () => {
    const { service, setActiveTab, returnToRecordSource } = createService([
      tab('record', '2026-10-15T10:05:00.000Z'),
    ], 'record');

    await service.ReturnToPreviousTab(null, 'record');
    expect(setActiveTab).not.toHaveBeenCalled();
    expect(returnToRecordSource).not.toHaveBeenCalled();
  });

  it('does not flip the app when the previous tab is a record tab (record tabs live outside any app)', async () => {
    const { service, setActiveTab, setActiveApp } = createService([
      tab('record', '2026-10-15T10:05:00.000Z'),
      tab('other-record', '2026-10-15T10:03:00.000Z', { configuration: { resourceType: 'Records' } }),
    ], 'record');

    await service.ReturnToPreviousTab(origin, 'record');
    expect(setActiveTab).toHaveBeenCalledWith('other-record');
    expect(setActiveApp).not.toHaveBeenCalled();
  });
});
