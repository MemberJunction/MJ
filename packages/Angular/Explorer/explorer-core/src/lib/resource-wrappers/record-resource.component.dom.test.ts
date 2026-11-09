import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, Subject, of } from 'rxjs';
import { NavigationService } from '@memberjunction/ng-shared';
import { WorkspaceStateManager } from '@memberjunction/ng-base-application';
import { ResourceData } from '@memberjunction/core-entities';
import type { AppContextSnapshot } from '@memberjunction/ai-core-plus';
import type { FormCompositionSnapshot } from '@memberjunction/ng-base-forms';
import { EntityRecordResource } from './record-resource.component';

/**
 * The record tab reports the form to the agent as `AdditionalContext.Form`, in compact form. The
 * shell keeps one app-wide context, rebuilt without `AdditionalContext` on every tab switch, so the
 * tab keeps what it reported: it publishes only while it is the tab on screen, and publishes again
 * when it comes back on screen.
 */

/** The shell: SetAgentContext folds the context into the app context and publishes it. */
function shell() {
  const nav = {
    AppContextSnapshot$: new BehaviorSubject<AppContextSnapshot | null>({ App: { Name: 'Sales' } } as AppContextSnapshot),
    ResourceReattached$: new Subject<unknown>(),
    QueryParamChanged$: new Subject<unknown>(),
    ObserveTabQueryParams: () => of({}),
    detached: new Set<unknown>(),
    IsResourceDetached: (resource: unknown) => nav.detached.has(resource),
    SetAgentContext: vi.fn((_caller: unknown, context: Record<string, unknown>) => {
      const current = nav.AppContextSnapshot$.value;
      if (current) nav.AppContextSnapshot$.next({ ...current, AdditionalContext: context });
    }),
    /** The shell rebuilding the app context after a tab switch, which drops AdditionalContext. */
    Rebuild: () => nav.AppContextSnapshot$.next({ App: { Name: 'Sales' } } as AppContextSnapshot),
  };
  return nav;
}

const workspace = { activeTabId: 'tab-accounts' as string | null, GetActiveTabId: () => workspace.activeTabId };

function snapshot(): FormCompositionSnapshot {
  return {
    Entity: 'Accounts', RecordPrimaryKey: 'ID|7',
    FormChoice: { FullCustomForm: false, OverrideID: null, Label: 'Default form' },
    Layout: 'accordion',
    Sections: [{ Key: 'details', Title: 'Details', Variant: 'default', Group: null, Hidden: false, Fields: [{ Name: 'Name', Label: 'Name' }] }],
    Related: [], Contributions: [], Rail: [{ Key: 'details', Title: 'Details', Icon: '', SectionKeys: ['details'], IsMore: false }],
    SlotsPresent: ['before-fields'], ChromeRuleCount: 0,
  };
}

/** Lets the deferred re-publish run. */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

let nav: ReturnType<typeof shell>;

function tab(tabId = 'tab-accounts'): EntityRecordResource {
  TestBed.configureTestingModule({
    providers: [
      { provide: NavigationService, useValue: nav },
      { provide: WorkspaceStateManager, useValue: workspace },
    ],
  });
  const resource = TestBed.runInInjectionContext(() => new EntityRecordResource());
  resource.Data = new ResourceData({ ResourceRecordID: '7', Configuration: { Entity: 'Accounts', tabId } });
  resource.ngOnInit();
  return resource;
}

const formContext = () => nav.AppContextSnapshot$.value?.AdditionalContext?.['Form'] as Record<string, unknown> | undefined;

beforeEach(() => {
  nav = shell();
  workspace.activeTabId = 'tab-accounts';
});
afterEach(() => TestBed.resetTestingModule());

describe('EntityRecordResource — the form context it reports', () => {
  it('reports the compact form context, without fields or rail', async () => {
    const resource = tab();
    resource.OnCompositionChanged(snapshot());
    expect(formContext()).toEqual({
      Entity: 'Accounts', RecordPrimaryKey: 'ID|7',
      FormChoice: { FullCustomForm: false, OverrideID: null, Label: 'Default form' },
      Sections: [{ Key: 'details', Title: 'Details', Variant: 'default', Hidden: false, ContributionKey: null }],
    });
    resource.ngOnDestroy();
  });

  it('reports it again when the shell rebuilds the app context without it', async () => {
    const resource = tab();
    resource.OnCompositionChanged(snapshot());
    nav.Rebuild();
    expect(formContext()).toBeUndefined();
    await settle();
    expect(formContext()?.['Entity']).toBe('Accounts');
    resource.ngOnDestroy();
  });

  it('does not report while detached, then reports what it kept when reattached', async () => {
    const resource = tab();
    nav.detached.add(resource);
    resource.OnCompositionChanged(snapshot());
    await settle();
    expect(nav.SetAgentContext).not.toHaveBeenCalled();
    nav.detached.delete(resource);
    nav.ResourceReattached$.next(resource);
    await settle();
    expect(nav.SetAgentContext).toHaveBeenCalledTimes(1);
    expect(formContext()?.['RecordPrimaryKey']).toBe('ID|7');
    resource.ngOnDestroy();
  });

  it('leaves the active surface\'s context alone while its tab is in the background', async () => {
    workspace.activeTabId = 'tab-dashboard';
    const resource = tab();
    resource.OnCompositionChanged(snapshot());
    nav.Rebuild();
    await settle();
    expect(nav.SetAgentContext).not.toHaveBeenCalled();
    workspace.activeTabId = 'tab-accounts';
    nav.Rebuild();
    await settle();
    expect(formContext()?.['Entity']).toBe('Accounts');
    resource.ngOnDestroy();
  });

  it('does not report again while the shell already holds its context', async () => {
    const resource = tab();
    resource.OnCompositionChanged(snapshot());
    await settle();
    expect(nav.SetAgentContext).toHaveBeenCalledTimes(1);
    resource.ngOnDestroy();
  });
});
