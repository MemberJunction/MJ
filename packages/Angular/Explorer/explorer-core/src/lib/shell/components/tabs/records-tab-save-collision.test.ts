/**
 * Saving a record whose saved id is already cached for ANOTHER tab (a workspace restored with two
 * tabs on one record, one under the bare URL id and one under the saved `ID|<UPPER>` form). The
 * saved tab must keep its own cache key and component: nothing is moved onto the other tab's key,
 * overwritten or detached under the wrong tab. Runs over the real ComponentCacheManager.
 */
import { describe, expect, it, vi } from 'vitest';

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
vi.mock('@memberjunction/global', async () => ({
  ...(await vi.importActual<typeof import('@memberjunction/global')>('@memberjunction/global')),
  MJGlobal: { Instance: { ClassFactory: {} } },
}));
vi.mock('@memberjunction/ng-shared', async () => ({
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
vi.mock('@memberjunction/core', async () => ({
  BaseEntity: class {},
  Metadata: class {},
  LogError: vi.fn(),
  CompositeKey: (await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core')).CompositeKey,
}));
vi.mock('@memberjunction/ng-notifications', () => ({ MJNotificationService: class {} }));
vi.mock('@memberjunction/ng-base-types', () => ({ BaseAngularComponent: class {} }));
vi.mock('../record-open/record-origin-crumb.component', () => ({ RecordOriginCrumbComponent: class {} }));
vi.mock('../record-open/record-switcher.service', () => ({ RecordSwitcherService: class {} }));
vi.mock('../record-open/record-switcher-sheet.component', () => ({}));

import type { ApplicationRef } from '@angular/core';
import { TabContainerComponent } from './tab-container.component';
import { ComponentCacheManager } from './component-cache-manager';

const DRIVER = 'RecordResource';
const APP = 'app-1';
const BARE = 'd8a9b7ab-7450-48e5-a0ea-acd1d86acf70';
const SAVED = 'ID|D8A9B7AB-7450-48E5-A0EA-ACD1D86ACF70';

type CacheArgs = Parameters<ComponentCacheManager['CacheComponent']>;

function setup() {
  const appRef: Pick<ApplicationRef, 'detachView'> = { detachView: vi.fn() };
  const cache = new ComponentCacheManager(appRef as ApplicationRef);
  const ref = (name: string) => ({ instance: { name }, destroy: vi.fn() }) as unknown as CacheArgs[0] & { destroy: ReturnType<typeof vi.fn> };
  const attach = (recordId: string, tabId: string) => {
    const componentRef = ref(tabId);
    const data = { ResourceType: 'Records', ResourceRecordID: recordId, Configuration: { applicationId: APP, resourceTypeDriverClass: DRIVER, Entity: 'Widgets' } } as unknown as CacheArgs[2];
    cache.CacheComponent(componentRef, {} as HTMLElement, data, tabId);
    return componentRef;
  };
  const refA = attach(BARE, 'tab-1');
  const refB = attach(SAVED, 'tab-2');

  const component = Object.create(TabContainerComponent.prototype) as TabContainerComponent;
  const internals = component as unknown as Record<string, unknown>;
  const tab1 = { id: 'tab-1', applicationId: APP, title: 'T', resourceRecordId: BARE, isPinned: true, configuration: { resourceType: 'Records', Entity: 'Widgets', recordId: BARE } };
  const updateTabResourceRecordId = vi.fn();
  internals['cacheManager'] = cache;
  internals['workspaceManager'] = { GetTab: (id: string) => (id === 'tab-1' ? tab1 : undefined), UpdateTabResourceRecordId: updateTabResourceRecordId };
  internals['UseSingleResourceMode'] = false;
  internals['currentSingleResourceSignature'] = null;
  internals['singleResourceCacheIdentity'] = { driverClass: DRIVER, recordId: BARE, appId: APP, tabId: 'tab-1' };
  internals['refreshTabTitleAfterSave'] = vi.fn(async () => undefined);

  const save = () => (component as unknown as { handleResourceRecordSaved(d: string, a: string, t: string, i: unknown, e: unknown): void })
    .handleResourceRecordSaved(DRIVER, APP, 'tab-1', {}, { PrimaryKey: { ToURLSegment: () => SAVED } });
  return { cache, refA, refB, internals, updateTabResourceRecordId, save };
}

describe('saving a record whose saved id is cached for another tab', () => {
  it('does not move the saved tab onto the other tab\'s key', () => {
    const { updateTabResourceRecordId, internals, save } = setup();
    save();
    expect(updateTabResourceRecordId).not.toHaveBeenCalled();
    expect(internals['singleResourceCacheIdentity']).toMatchObject({ recordId: BARE, tabId: 'tab-1' });
  });

  it('leaves each tab\'s component attached to its own tab', () => {
    const { cache, refA, refB, save } = setup();
    save();
    expect(cache.FindAndDetachByTabId('tab-1')?.componentRef).toBe(refA);
    expect(cache.FindAndDetachByTabId('tab-2')?.componentRef).toBe(refB);
  });

  it('closing one tab destroys only its own component', () => {
    const { cache, refA, refB, save } = setup();
    save();
    cache.DestroyComponentByTabId('tab-1');
    expect(refA.destroy).toHaveBeenCalledTimes(1);
    expect(refB.destroy).not.toHaveBeenCalled();
    expect(cache.FindAndDetachByTabId('tab-2')?.componentRef).toBe(refB);
  });
});
