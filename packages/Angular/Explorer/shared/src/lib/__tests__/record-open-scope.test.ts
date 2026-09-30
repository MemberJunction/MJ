/**
 * Tests for how NavigationService routes record opens into the RECORDS
 * temp-tab pool (TabRequest.TempScope) — the preview-tab behavior.
 *
 * What these pin down is the fork itself: which workspace-manager entry point
 * a gesture reaches, and what scope/pin flags ride on the request. The pool
 * mechanics that consume the request live in WorkspaceStateManager and are
 * covered by base-application's own suite.
 *
 * Mock preamble mirrors navigation-framework.test.ts — the Angular decorators
 * have to be inert before NavigationService can be imported at all. Note that
 * record-open-style is deliberately NOT mocked: it exposes a real
 * SetRecordOpenStyle setter, so the style can be flipped for real.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NavigationService } from '../navigation.service';
import { SetRecordOpenStyle } from '../record-open-style';
import { Metadata } from '@memberjunction/core';
import type { CompositeKey } from '@memberjunction/core';
import type { TabRequest } from '@memberjunction/ng-base-application';
import { fakeMetadataProvider } from '@memberjunction/ng-test-utils';

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
  CompositeKey: class MockCompositeKey {
    SimpleLoadFromURLSegment() { /* no-op for these specs */ }
    static FromURLSegment() { return new MockCompositeKey(); }
  },
  LogError: vi.fn(),
}));
vi.mock('@memberjunction/core-entities', () => ({
  ResourceData: class {
    Configuration: Record<string, unknown> = {};
    constructor(data?: Record<string, unknown>) { if (data) Object.assign(this, data); }
  },
}));
// record-open-style keeps the resolved style in the MJ global object store,
// so the mock has to provide a real (per-file) store for SetRecordOpenStyle
// to write into — otherwise flipping the style throws.
vi.mock('@memberjunction/global', () => {
  const store: Record<string, unknown> = {};
  return {
    UUIDsEqual: (a: string, b: string) => a === b,
    GetGlobalObjectStore: () => store,
  };
});

/** The collaborators OpenEntityRecord reaches for, all stubbed. */
interface ServiceStubs {
  openTab: ReturnType<typeof vi.fn>;
  openTabForced: ReturnType<typeof vi.fn>;
  setActiveTab: ReturnType<typeof vi.fn>;
  updateTabTitle: ReturnType<typeof vi.fn>;
  getTab: ReturnType<typeof vi.fn>;
  updateTabConfiguration: ReturnType<typeof vi.fn>;
}

function createService(opts?: { shift?: boolean; existingTab?: { id: string } | null }): {
  service: NavigationService;
  stubs: ServiceStubs;
} {
  const stubs: ServiceStubs = {
    openTab: vi.fn(() => 'tab-opened'),
    openTabForced: vi.fn(() => 'tab-forced'),
    setActiveTab: vi.fn(),
    updateTabTitle: vi.fn(),
    getTab: vi.fn((id: string) => ({ id, title: 'Widget' })),
    updateTabConfiguration: vi.fn(),
  };
  const service = Object.create(NavigationService.prototype) as NavigationService;
  const internals = service as unknown as Record<string, unknown>;
  internals['workspaceManager'] = {
    OpenTab: stubs.openTab,
    OpenTabForced: stubs.openTabForced,
    SetActiveTab: stubs.setActiveTab,
    UpdateTabTitle: stubs.updateTabTitle,
    GetTab: stubs.getTab,
    UpdateTabConfiguration: stubs.updateTabConfiguration,
  };
  internals['appManager'] = { GetActiveApp: () => ({ ID: 'app-1', GetColor: () => '#ff0000' }) };
  // Real shouldForceNewTab runs against this — the shift state is what a
  // capture-phase mousedown listener would have recorded.
  internals['shiftKeyPressed'] = opts?.shift === true;
  internals['findOpenRecordTab'] = () => opts?.existingTab ?? null;
  internals['refreshSourceContext'] = () => undefined;
  internals['assertRecordActivation'] = () => undefined;
  internals['resolveSourceContext'] = () => ({});
  internals['getDefaultApplicationId'] = () => 'app-default';
  internals['getDefaultAppColor'] = () => '#000000';
  // Pass-through: single-resource-mode transitions are their own concern.
  internals['handleSingleResourceModeTransition'] = (forceNew: boolean) => forceNew;
  return { service, stubs };
}

const pkey = { ToURLSegment: () => 'ID|123' } as unknown as CompositeKey;
const requestFrom = (fn: ReturnType<typeof vi.fn>): TabRequest => fn.mock.calls[0][0] as TabRequest;

describe('NavigationService record opens — temp-tab scope', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('records style', () => {
    beforeEach(() => SetRecordOpenStyle('records'));

    it('a plain click goes through OpenTab, scoped to the records pool', () => {
      const { service, stubs } = createService();
      service.OpenEntityRecord('Widgets', pkey);
      // The whole point: no longer an unconditional OpenTabForced.
      expect(stubs.openTabForced).not.toHaveBeenCalled();
      expect(stubs.openTab).toHaveBeenCalledTimes(1);
      expect(requestFrom(stubs.openTab).TempScope).toBe('records');
    });

    it('a shift-click forces a new tab, still scoped to the records pool', () => {
      const { service, stubs } = createService({ shift: true });
      service.OpenEntityRecord('Widgets', pkey);
      expect(stubs.openTab).not.toHaveBeenCalled();
      expect(stubs.openTabForced).toHaveBeenCalledTimes(1);
      // Scope still records, so the cascade promotes the region's previous
      // temp rather than pinning the nav tab.
      expect(requestFrom(stubs.openTabForced).TempScope).toBe('records');
    });

    it('an explicit forceNewTab does the same — single-record "Open in New Tab" was inert before', () => {
      const { service, stubs } = createService();
      service.OpenEntityRecord('Widgets', pkey, { forceNewTab: true });
      expect(stubs.openTabForced).toHaveBeenCalledTimes(1);
      expect(stubs.openTab).not.toHaveBeenCalled();
    });

    it('does not carry the legacy PreservePinState opt-out', () => {
      const { service, stubs } = createService();
      service.OpenEntityRecord('Widgets', pkey);
      // Scoping replaced it; leaving both on would disable the cascade the
      // records pool now relies on to keep exactly one temp.
      expect(requestFrom(stubs.openTab).PreservePinState).toBeUndefined();
    });

    it('dedup wins: an already-open record is focused, not re-opened', () => {
      const { service, stubs } = createService({ existingTab: { id: 'tab-existing' } });
      const id = service.OpenEntityRecord('Widgets', pkey);
      expect(id).toBe('tab-existing');
      expect(stubs.setActiveTab).toHaveBeenCalledWith('tab-existing');
      expect(stubs.openTab).not.toHaveBeenCalled();
      expect(stubs.openTabForced).not.toHaveBeenCalled();
    });

    it('a NEW record is forced AND pinned so replacement can never eat it', () => {
      const { service, stubs } = createService();
      service.OpenNewEntityRecord('Widgets');
      expect(stubs.openTabForced).toHaveBeenCalledTimes(1);
      const request = requestFrom(stubs.openTabForced);
      expect(request.IsPinned).toBe(true);
      expect(request.TempScope).toBe('records');
    });
  });

  describe('classic style (must be untouched)', () => {
    beforeEach(() => SetRecordOpenStyle('classic'));

    it('a plain click still opens through OpenTab in the main pool', () => {
      const { service, stubs } = createService();
      service.OpenEntityRecord('Widgets', pkey);
      expect(stubs.openTab).toHaveBeenCalledTimes(1);
      expect(requestFrom(stubs.openTab).TempScope).toBe('main');
    });

    it('shift still forces a new tab', () => {
      const { service, stubs } = createService({ shift: true });
      service.OpenEntityRecord('Widgets', pkey);
      expect(stubs.openTabForced).toHaveBeenCalledTimes(1);
      expect(requestFrom(stubs.openTabForced).TempScope).toBe('main');
    });

    it('a new record is NOT auto-pinned', () => {
      const { service, stubs } = createService();
      service.OpenNewEntityRecord('Widgets');
      const fn = stubs.openTabForced.mock.calls.length ? stubs.openTabForced : stubs.openTab;
      expect(requestFrom(fn).IsPinned).toBe(false);
    });
  });
});


// ===================== Standard-form escape hatch (MJ#4755) =====================
// A custom form registered at a higher priority hides the CodeGen form. The
// requested form mode travels as the tab's `form=standard` QUERY PARAM — the
// channel the shell mirrors into the URL and BaseResourceComponent delivers
// live to a mounted record (OnQueryParamsChanged). Every open path has to land
// it on the tab the open actually reaches: a new tab, a forced tab, or an
// existing tab that dedup focused instead.
describe('NavigationService record opens — formMode', () => {
  const STANDARD_PARAMS = { queryParams: { form: 'standard' } };

  beforeEach(() => {
    vi.clearAllMocks();
    SetRecordOpenStyle('records');
  });

  it('OpenNewEntityRecord puts form=standard on the new tab', () => {
    const { service, stubs } = createService();
    service.OpenNewEntityRecord('Widgets', { formMode: 'standard' });
    expect(stubs.updateTabConfiguration).toHaveBeenCalledWith('tab-forced', STANDARD_PARAMS);
    // The query param is the ONLY channel — no parallel Configuration key to drift.
    expect('FormMode' in requestFrom(stubs.openTabForced).Configuration).toBe(false);
  });

  it('OpenNewEntityRecord without formMode leaves the tab params alone', () => {
    const { service, stubs } = createService();
    service.OpenNewEntityRecord('Widgets');
    expect(stubs.updateTabConfiguration).not.toHaveBeenCalled();
  });

  it('OpenNewEntityRecord lands form=standard on whichever tab the open reached (classic dedup)', () => {
    // Classic style does not force: OpenTab can hand back an EXISTING new-record
    // tab — the dead-end custom form the user is escaping. The param must land there.
    SetRecordOpenStyle('classic');
    const { service, stubs } = createService();
    stubs.openTab.mockReturnValue('tab-dead-end');
    service.OpenNewEntityRecord('Widgets', { formMode: 'standard' });
    expect(stubs.updateTabConfiguration).toHaveBeenCalledWith('tab-dead-end', STANDARD_PARAMS);
  });

  it('OpenEntityRecord puts form=standard on a new tab', () => {
    const { service, stubs } = createService();
    service.OpenEntityRecord('Widgets', pkey, { formMode: 'standard' });
    expect(stubs.updateTabConfiguration).toHaveBeenCalledWith('tab-opened', STANDARD_PARAMS);
    expect('FormMode' in requestFrom(stubs.openTab).Configuration).toBe(false);
  });

  it('OpenEntityRecord puts form=standard on a forced (shift) tab', () => {
    const { service, stubs } = createService({ shift: true });
    service.OpenEntityRecord('Widgets', pkey, { formMode: 'standard' });
    expect(stubs.updateTabConfiguration).toHaveBeenCalledWith('tab-forced', STANDARD_PARAMS);
  });

  it('OpenEntityRecord without formMode leaves the tab params alone', () => {
    const { service, stubs } = createService();
    service.OpenEntityRecord('Widgets', pkey);
    expect(stubs.updateTabConfiguration).not.toHaveBeenCalled();
  });

  it('re-opening an already-open record in standard form applies form=standard to the EXISTING tab', () => {
    const { service, stubs } = createService({ existingTab: { id: 'tab-existing' } });
    // The existing tab already carries another param — it must survive the merge.
    stubs.getTab.mockReturnValue({ id: 'tab-existing', configuration: { queryParams: { other: 'x' } } });
    service.OpenEntityRecord('Widgets', pkey, { formMode: 'standard' });
    expect(stubs.updateTabConfiguration).toHaveBeenCalledWith('tab-existing', { queryParams: { other: 'x', form: 'standard' } });
    expect(stubs.setActiveTab).toHaveBeenCalledWith('tab-existing');
  });

  it('a plain re-open does not touch the existing tab params', () => {
    const { service, stubs } = createService({ existingTab: { id: 'tab-existing' } });
    service.OpenEntityRecord('Widgets', pkey);
    expect(stubs.updateTabConfiguration).not.toHaveBeenCalled();
  });
});


// ===================== Record origin chain (crumb ping-pong) =====================
// Under the preview-tab model an in-record link CONSUMES the parent's tab, so
// returning to the parent re-opens it rather than reactivating its tab. A
// re-open that RECAPTURES the origin makes the child the parent's origin — the
// two records point at each other and the real entry point is unreachable.
// The chain is what makes the return restore instead of recapture.
describe('record origin chain', () => {
  it('caps the ancestor chain so the persisted config cannot grow without bound', async () => {
    const { TruncateRecordOriginChain, MAX_RECORD_ORIGIN_DEPTH } = await import('../record-open-style');
    // Build a chain deeper than the cap.
    let origin: Record<string, unknown> = { sourceLabel: 'gen0' };
    for (let i = 1; i <= MAX_RECORD_ORIGIN_DEPTH + 3; i++) {
      origin = { sourceLabel: `gen${i}`, sourceParentOrigin: origin };
    }
    let depth = 0;
    let cursor = TruncateRecordOriginChain(origin as never);
    while (cursor) {
      depth++;
      cursor = cursor.sourceParentOrigin;
    }
    expect(depth).toBe(MAX_RECORD_ORIGIN_DEPTH);
  });

  it('round-trips a nested chain through the tab configuration reader', async () => {
    const { GetRecordSourceContext } = await import('../record-open-style');
    const context = GetRecordSourceContext({
      sourceAppId: 'app-1',
      sourceLabel: 'System',
      sourceRecordEntity: 'MJ: Action Categories',
      sourceRecordId: 'ID|child',
      sourceParentOrigin: {
        sourceAppId: 'app-1',
        sourceAppName: 'Data Explorer',
        sourceNavLabel: 'Data',
      },
    });
    // The grandparent survives serialization — that value IS the restored crumb.
    expect(context?.sourceParentOrigin?.sourceNavLabel).toBe('Data');
    expect(context?.sourceParentOrigin?.sourceAppName).toBe('Data Explorer');
  });

  it('returning to the parent RESTORES its origin instead of capturing the child', async () => {
    SetRecordOpenStyle('records');
    const { service } = createService();
    const internals = service as unknown as Record<string, unknown>;
    // The parent's tab was consumed by the link click, so the reactivate
    // fast path must miss and the re-open path must run.
    internals['workspaceManager'] = { GetConfiguration: () => ({ tabs: [] }) };
    const openEntityRecord = vi.fn();
    internals['OpenEntityRecord'] = openEntityRecord;

    const entryPoint = { sourceAppId: 'app-1', sourceAppName: 'Data Explorer', sourceNavLabel: 'Data' };
    await service.ReturnToRecordSource({
      sourceLabel: 'User Management',
      sourceRecordEntity: 'MJ: Action Categories',
      sourceRecordId: 'ID|parent',
      sourceParentOrigin: entryPoint,
    });

    expect(openEntityRecord).toHaveBeenCalledTimes(1);
    const options = openEntityRecord.mock.calls[0][2];
    // Not undefined — undefined would let resolveSourceContext capture the
    // CHILD as the parent's new origin, which is the ping-pong bug.
    expect(options?.recordSource).toEqual(entryPoint);
  });

  it("falls back to 'none' rather than a circular crumb when there is no chain", async () => {
    SetRecordOpenStyle('records');
    const { service } = createService();
    const internals = service as unknown as Record<string, unknown>;
    internals['workspaceManager'] = { GetConfiguration: () => ({ tabs: [] }) };
    const openEntityRecord = vi.fn();
    internals['OpenEntityRecord'] = openEntityRecord;

    await service.ReturnToRecordSource({
      sourceLabel: 'User Management',
      sourceRecordEntity: 'MJ: Action Categories',
      sourceRecordId: 'ID|parent',
    });

    // A missing crumb beats one that points back at where you just came from.
    expect(openEntityRecord.mock.calls[0][2]?.recordSource).toBe('none');
  });

  describe('tab title resolution and fire-and-forget update', () => {
    beforeEach(() => SetRecordOpenStyle('records'));

    it('uses cached title immediately and does not fire background lookup when name is cached', () => {
      const { service, stubs } = createService();
      const getEntityRecordName = vi.fn().mockResolvedValue('Async Name');
      (Metadata as unknown as { Provider: unknown }).Provider = {
        ...fakeMetadataProvider([{ Name: 'Widgets', DisplayName: 'Widget' }]),
        HasCachedRecordName: vi.fn().mockReturnValue(true),
        GetCachedRecordNameOnlyIfCached: vi.fn().mockReturnValue('Widget #42'),
        GetEntityRecordName: getEntityRecordName,
      };

      service.OpenEntityRecord('Widgets', pkey);

      expect(requestFrom(stubs.openTab).Title).toBe('Widget #42');
      expect(getEntityRecordName).not.toHaveBeenCalled();
      expect(stubs.updateTabTitle).not.toHaveBeenCalled();
    });

    it('uses entity friendly name initially and fires async update when name is not cached', async () => {
      const { service, stubs } = createService();
      let resolveLookup!: (value: string) => void;
      const lookupPromise = new Promise<string>(res => { resolveLookup = res; });
      const getEntityRecordName = vi.fn().mockReturnValue(lookupPromise);

      (Metadata as unknown as { Provider: unknown }).Provider = {
        ...fakeMetadataProvider([{ Name: 'Widgets', DisplayName: 'Widget' }]),
        HasCachedRecordName: vi.fn().mockReturnValue(false),
        GetCachedRecordNameOnlyIfCached: vi.fn().mockReturnValue(undefined),
        GetEntityRecordName: getEntityRecordName,
      };

      service.OpenEntityRecord('Widgets', pkey);

      // Initial tab open uses friendly entity name without stalling
      expect(requestFrom(stubs.openTab).Title).toBe('Widget');
      expect(getEntityRecordName).toHaveBeenCalledTimes(1);
      expect(stubs.updateTabTitle).not.toHaveBeenCalled();

      // Once lookup completes, tab title updates in workspace
      resolveLookup('Resolved Widget #42');
      await lookupPromise;
      await Promise.resolve();

      expect(stubs.updateTabTitle).toHaveBeenCalledWith('tab-opened', 'Resolved Widget #42');
    });
  });
});
