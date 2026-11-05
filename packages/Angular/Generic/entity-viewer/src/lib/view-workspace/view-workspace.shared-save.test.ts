import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { ChangeDetectorRef } from '@angular/core';
import type { MJUserViewEntityExtended } from '@memberjunction/core-entities';
import { ViewWorkspaceComponent } from './view-workspace.component';
import type { ViewSaveEvent } from '../view-config-panel/view-config-panel.component';
import type { QuickSaveEvent } from '../types';

/**
 * - A view passed in through `[SelectedView]` is the one the view selector highlights (#5836).
 * - Saving a shared view from the config panel shows the shared-view warning, the same as quick
 *   save, and saves only once the user picks an action (#5837). Quick save still warns once.
 */

function makeView(id: string, isShared: boolean): MJUserViewEntityExtended {
  return { ID: id, Name: 'Sample View', IsShared: isShared } as unknown as MJUserViewEntityExtended;
}

function makeSaveEvent(overrides: Partial<ViewSaveEvent> = {}): ViewSaveEvent {
  return {
    Name: 'Sample View',
    Description: '',
    IsShared: true,
    SaveAsNew: false,
    Columns: [],
    SortField: null,
    SortDirection: 'asc',
    SortItems: [],
    SmartFilterEnabled: false,
    SmartFilterPrompt: '',
    FilterState: null,
    AggregatesConfig: null,
    ...overrides,
  };
}

type WorkspaceInternals = {
  parseViewGridState(view: MJUserViewEntityExtended): unknown;
  loadUserDefaultGridState(): unknown;
};

describe('ViewWorkspaceComponent — selected view and shared-view saves', () => {
  let component: ViewWorkspaceComponent;
  let saveView: ReturnType<typeof vi.fn<(event: ViewSaveEvent) => Promise<boolean>>>;

  beforeEach(() => {
    const cdr = { detectChanges: vi.fn(), markForCheck: vi.fn() } as unknown as ChangeDetectorRef;
    component = new ViewWorkspaceComponent(cdr);
    const internals = component as unknown as WorkspaceInternals;
    vi.spyOn(internals, 'parseViewGridState').mockReturnValue(null);
    vi.spyOn(internals, 'loadUserDefaultGridState').mockReturnValue(null);
    saveView = vi.fn<(event: ViewSaveEvent) => Promise<boolean>>().mockResolvedValue(true);
    component.OnSaveView = saveView;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('highlights a view passed through SelectedView, and clears it when the input is cleared', () => {
    component.SelectedView = makeView('view-1', false);
    expect(component.SelectedViewId).toBe('view-1');

    component.SelectedView = null;
    expect(component.SelectedViewId).toBeNull();
  });

  it('saves a non-shared view from the config panel straight away', async () => {
    component.SelectedView = makeView('view-1', false);
    await component.OnConfigPanelSave(makeSaveEvent({ IsShared: false }));
    expect(saveView).toHaveBeenCalledTimes(1);
    expect(component.ShowSharedViewWarning).toBe(false);
  });

  it('saves a shared view as new without the warning', async () => {
    component.SelectedView = makeView('view-1', true);
    await component.OnConfigPanelSave(makeSaveEvent({ SaveAsNew: true }));
    expect(saveView).toHaveBeenCalledTimes(1);
    expect(component.ShowSharedViewWarning).toBe(false);
  });

  it('warns before updating a shared view from the config panel and saves after update-shared', async () => {
    component.SelectedView = makeView('view-1', true);
    const event = makeSaveEvent();
    await component.OnConfigPanelSave(event);
    expect(component.ShowSharedViewWarning).toBe(true);
    expect(saveView).not.toHaveBeenCalled();

    await component.OnSharedViewAction('update-shared');
    expect(component.ShowSharedViewWarning).toBe(false);
    expect(saveView).toHaveBeenCalledTimes(1);
    expect(saveView).toHaveBeenCalledWith(event);
  });

  it('saves a private copy on save-as-copy', async () => {
    component.SelectedView = makeView('view-1', true);
    await component.OnConfigPanelSave(makeSaveEvent());
    await component.OnSharedViewAction('save-as-copy');
    expect(saveView).toHaveBeenCalledWith(expect.objectContaining({ SaveAsNew: true, IsShared: false }));
  });

  it('saves nothing when the warning is cancelled', async () => {
    component.SelectedView = makeView('view-1', true);
    await component.OnConfigPanelSave(makeSaveEvent());
    component.OnSharedViewWarningCancel();
    expect(component.ShowSharedViewWarning).toBe(false);

    // A later action has nothing pending.
    await component.OnSharedViewAction('update-shared');
    expect(saveView).not.toHaveBeenCalled();
  });

  it('quick save of a shared view still warns once and saves once', async () => {
    component.SelectedView = makeView('view-1', true);
    const quick: QuickSaveEvent = { Name: 'Sample View', Description: '', IsShared: true, SaveAsNew: false } as QuickSaveEvent;
    await component.OnQuickSave(quick);
    expect(component.ShowSharedViewWarning).toBe(true);
    expect(saveView).not.toHaveBeenCalled();

    await component.OnSharedViewAction('update-shared');
    expect(saveView).toHaveBeenCalledTimes(1);
    expect(component.ShowSharedViewWarning).toBe(false);
  });
});
