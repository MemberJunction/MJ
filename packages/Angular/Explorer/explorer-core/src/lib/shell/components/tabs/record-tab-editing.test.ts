/**
 * Logic spec for the records-region edit guard's first link:
 * `TabContainerComponent.IsRecordTabEditing`.
 *
 * The shell folds this into the records temp-tab pool predicate (see
 * shell-records-edit-guard.test.ts). A tab whose live component reports
 * in-progress edits leaves the pool; a tab with no live component is NOT
 * editing — nothing is rendered, so there is nothing to lose. That fail-safe
 * is the documented contract and the thing this file pins.
 *
 * Node preset, Object.create harness, same mock block as the sibling
 * records-tab-reload.test.ts (vi.mock is hoisted per file and cannot be shared
 * through an import, and every @angular/core symbol the component file imports
 * must be present or the import throws).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@angular/core', () => ({
  Component: () => (target: Function) => target,
  ViewChild: () => () => undefined,
  Input: () => () => undefined,
  Output: () => () => undefined,
  HostListener: () => () => undefined,
  EventEmitter: class { emit() {} },
  ElementRef: class {},
  ApplicationRef: class {},
  EnvironmentInjector: class {},
  ChangeDetectorRef: class {},
  ComponentRef: class {},
  ViewEncapsulation: { None: 0 },
  runInInjectionContext: vi.fn(),
  createComponent: vi.fn(),
  inject: vi.fn(() => ({})),
}));
vi.mock('@memberjunction/ng-base-application', () => ({
  GoldenLayoutManager: class {},
  WorkspaceStateManager: class {},
  ApplicationManager: class {},
  FlattenLayoutToSingleStack: vi.fn(),
}));
vi.mock('@memberjunction/global', () => ({ MJGlobal: { Instance: { ClassFactory: {} } } }));
vi.mock('@memberjunction/ng-shared', () => ({
  BaseResourceComponent: class {},
  HomeAppPinService: class {},
  NavigationService: class {},
  ExplorerBreakpointService: class {},
  IsRecordTabsStyle: vi.fn(() => true),
  IsRecordsTabConfiguration: vi.fn(() => true),
  IsRecordsRegionTab: vi.fn(() => true),
  IsRecordDockedToWorkspace: vi.fn(() => false),
  RECORD_DOCKED_TO_WORKSPACE_KEY: 'recordDockedToWorkspace',
  GetRecordSourceContext: vi.fn(() => null),
  SafeDetectChanges: vi.fn(),
  ResolveRecordTypeIcon: vi.fn(() => ''),
}));
vi.mock('@memberjunction/core-entities', () => ({
  ResourceData: class {},
  MJResourceTypeEntity: class {},
  ResourcePermissionEngine: { Instance: {} },
}));
vi.mock('@memberjunction/core', () => ({
  BaseEntity: class {},
  Metadata: class {},
  LogError: vi.fn(),
}));
vi.mock('@memberjunction/ng-notifications', () => ({ MJNotificationService: class {} }));
vi.mock('@memberjunction/ng-base-types', () => ({ BaseAngularComponent: class {} }));
vi.mock('../record-open/record-origin-crumb.component', () => ({ RecordOriginCrumbComponent: class {} }));
vi.mock('../record-open/record-switcher.service', () => ({ RecordSwitcherService: class {} }));
vi.mock('../record-open/record-switcher-sheet.component', () => ({}));
vi.mock('./component-cache-manager', () => ({ ComponentCacheManager: class {} }));

import { TabContainerComponent } from './tab-container.component';

/** The minimum shape of a live resource the guard reads: just IsEditing(). */
interface LiveResource {
  IsEditing(): boolean;
}

/**
 * Build a container whose componentRefs map holds the given live resources,
 * keyed by tab id. Only the map is populated: IsRecordTabEditing reads nothing
 * else, and constructing the real component would drag in Golden Layout.
 */
function createContainer(live: Record<string, LiveResource>): TabContainerComponent {
  const component = Object.create(TabContainerComponent.prototype) as TabContainerComponent;
  const internals = component as unknown as Record<string, unknown>;
  internals['componentRefs'] = new Map(
    Object.entries(live).map(([tabId, instance]) => [tabId, { instance }])
  );
  return component;
}

describe('TabContainerComponent.IsRecordTabEditing', () => {
  beforeEach(() => vi.clearAllMocks());

  it('true when the live component for that tab reports editing', () => {
    const container = createContainer({ 'tab-1': { IsEditing: () => true } });
    expect(container.IsRecordTabEditing('tab-1')).toBe(true);
  });

  it('false when the live component is NOT editing (base-class default)', () => {
    // BaseResourceComponent.IsEditing() returns false; a resource that never
    // overrode it must not accidentally protect its tab from replacement.
    const container = createContainer({ 'tab-1': { IsEditing: () => false } });
    expect(container.IsRecordTabEditing('tab-1')).toBe(false);
  });

  it('false for a tab id that was never loaded (the documented fail-safe)', () => {
    // Nothing is rendered, so there is nothing to lose: an unknown id must
    // leave the tab IN the consumption pool, never protect it.
    const container = createContainer({});
    expect(container.IsRecordTabEditing('never-loaded')).toBe(false);
  });

  it('false for a tab that was loaded then unloaded (ref removed from the map)', () => {
    // cleanupTabComponent / detach paths delete the entry; after that the
    // tab is unloaded and the answer must flip back to "not editing".
    const container = createContainer({ 'tab-1': { IsEditing: () => true } });
    const internals = container as unknown as { componentRefs: Map<string, unknown> };
    internals.componentRefs.delete('tab-1');
    expect(container.IsRecordTabEditing('tab-1')).toBe(false);
  });

  it('answers per tab id: one editing tab does not protect its neighbours', () => {
    const container = createContainer({
      'editing': { IsEditing: () => true },
      'browsing': { IsEditing: () => false },
    });
    expect(container.IsRecordTabEditing('editing')).toBe(true);
    expect(container.IsRecordTabEditing('browsing')).toBe(false);
  });
});
