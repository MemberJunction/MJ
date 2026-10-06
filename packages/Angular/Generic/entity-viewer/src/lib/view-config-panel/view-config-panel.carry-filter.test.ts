import { describe, it, expect, vi } from 'vitest';
import { SimpleChange, type ChangeDetectorRef } from '@angular/core';
import type { EntityInfo, IMetadataProvider } from '@memberjunction/core';
import { CompositeFilterDescriptor } from '@memberjunction/ng-filter-builder';
import { ViewConfigPanelComponent } from './view-config-panel.component';

/**
 * Issue #4220 follow-up — reopening the config panel from the quick-save name prompt
 * ("Customize columns, filters & sorting…") must hand back the filter the user already built.
 *
 * On open the panel re-initializes from the entity and, for the default (unsaved) view, resets its
 * filter. `ExternalFilterState` can't carry the filter back: the staged filter is the same object
 * the panel was already bound to, so the input never registers a change. These tests drive the
 * panel through the same `ngOnChanges` sequence Angular does.
 */

const traditionalFilter: CompositeFilterDescriptor = {
  logic: 'and',
  filters: [{ field: 'Status', operator: 'eq', value: 'Active' }],
} as unknown as CompositeFilterDescriptor;

function makeEntity(): EntityInfo {
  return {
    ID: 'entity-1',
    Name: 'Accounts',
    DisplayNameOrName: 'Accounts',
    Fields: [
      { ID: 'f1', Name: 'AccountName', DisplayNameOrName: 'Account Name', DefaultInView: true, DefaultColumnWidth: 200, Type: 'nvarchar', EntityFieldValues: [] },
      { ID: 'f2', Name: 'Status', DisplayNameOrName: 'Status', DefaultInView: true, DefaultColumnWidth: 120, Type: 'nvarchar', EntityFieldValues: [] },
    ],
  } as unknown as EntityInfo;
}

function makePanel(): ViewConfigPanelComponent {
  const cdr = { detectChanges: vi.fn(), markForCheck: vi.fn() } as unknown as ChangeDetectorRef;
  const panel = new ViewConfigPanelComponent(cdr);
  panel.Provider = { CurrentUser: null } as unknown as IMetadataProvider;
  panel.Entity = makeEntity();
  panel.ViewEntity = null;
  return panel;
}

/** Open the panel the way the workspace does: only IsOpen flips; ExternalFilterState keeps its reference. */
function open(panel: ViewConfigPanelComponent): void {
  panel.IsOpen = true;
  panel.ngOnChanges({ IsOpen: new SimpleChange(false, true, false) });
}

describe('ViewConfigPanelComponent — carrying a staged filter back from the name prompt', () => {
  it('restores a carried traditional filter in traditional mode', () => {
    const panel = makePanel();
    panel.ExternalFilterState = traditionalFilter;
    panel.DefaultSaveAsNew = true;
    panel.PendingNewViewFilterState = traditionalFilter;

    open(panel);

    expect(panel.FilterState).toEqual(traditionalFilter);
    expect(panel.FilterMode).toBe('traditional');
    expect(panel.SmartFilterEnabled).toBe(false);
  });

  it('saves a new view carrying that traditional filter', () => {
    const panel = makePanel();
    panel.DefaultSaveAsNew = true;
    panel.PendingNewViewName = 'Active Accounts';
    panel.PendingNewViewFilterState = traditionalFilter;
    open(panel);

    const emitted: Array<{ FilterState: CompositeFilterDescriptor | null; SmartFilterEnabled: boolean }> = [];
    panel.Save.subscribe(e => emitted.push(e));
    panel.OnSaveAsNew();

    expect(emitted).toHaveLength(1);
    expect(emitted[0].FilterState).toEqual(traditionalFilter);
    expect(emitted[0].SmartFilterEnabled).toBe(false);
  });

  it('restores a carried smart filter in smart mode', () => {
    const panel = makePanel();
    panel.DefaultSaveAsNew = true;
    panel.PendingNewViewSmartFilterEnabled = true;
    panel.PendingNewViewSmartFilterPrompt = 'active west coast accounts';

    open(panel);

    expect(panel.FilterMode).toBe('smart');
    expect(panel.SmartFilterEnabled).toBe(true);
    expect(panel.SmartFilterPrompt).toBe('active west coast accounts');
  });

  it('still opens clean in smart mode when nothing is carried', () => {
    const panel = makePanel();
    panel.ExternalFilterState = traditionalFilter;
    open(panel);

    expect(panel.FilterState.filters).toHaveLength(0);
    expect(panel.FilterMode).toBe('smart');
  });

  it('ignores a carried filter when not continuing a new-view flow', () => {
    const panel = makePanel();
    panel.DefaultSaveAsNew = false;
    panel.PendingNewViewFilterState = traditionalFilter;
    open(panel);

    expect(panel.FilterState.filters).toHaveLength(0);
    expect(panel.FilterMode).toBe('smart');
  });
});
