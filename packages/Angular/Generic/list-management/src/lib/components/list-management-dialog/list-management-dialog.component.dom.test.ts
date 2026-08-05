import { describe, it, expect } from 'vitest';
import { FormsModule } from '@angular/forms';
import { renderComponentFixture, query, queryAll, text, capture, StubEmptyStateComponent, StubLoadingComponent } from '@memberjunction/ng-test-utils';
import { ListManagementDialogComponent } from './list-management-dialog.component';
import { ListManagementService } from '../../services/list-management.service';
import type { ListManagementDialogConfig } from '../../models/list-management.models';

/**
 * DOM coverage for <mj-list-management-dialog> — the add/remove-to-lists dialog (~6×). Its data load
 * runs through ListManagementService; a fake service returning empties lets the dialog open on an empty
 * state without a backend. Covers the visible gate, the header title/subtitle, the filter tabs + active
 * switching, the create-list affordance, the empty state, and the cancel/close/overlay → cancel output.
 */

const CONFIG: ListManagementDialogConfig = {
  mode: 'manage',
  entityId: 'e1',
  entityName: 'Accounts',
  recordIds: ['r1'],
  dialogTitle: 'Manage Lists',
  allowCreate: true,
} as unknown as ListManagementDialogConfig;

/** Fake service — every load method returns empty so initializeDialog completes on an empty state. */
function fakeService() {
  return {
    Provider: null,
    getListsForEntity: async () => [],
    getRecordMembership: async () => [],
    getListCategories: async () => [],
    buildListViewModels: async () => [],
  };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

async function render(inputs: Record<string, unknown>) {
  const f = renderComponentFixture(ListManagementDialogComponent, {
    imports: [FormsModule, StubEmptyStateComponent, StubLoadingComponent],
    declarations: [ListManagementDialogComponent],
    providers: [{ provide: ListManagementService, useValue: fakeService() }],
    inputs,
  });
  // initializeDialog / loadData chain several async service calls — flush a few microtask turns
  await tick();
  await tick();
  await tick();
  f.detectChanges(false);
  return f;
}
type Fx = Awaited<ReturnType<typeof render>>;
const tabs = (f: Fx) => queryAll(f, '.tab-button') as HTMLElement[];

describe('ListManagementDialogComponent (DOM)', () => {
  it('renders nothing when not visible', async () => {
    expect(query(await render({ visible: false, config: CONFIG }), '.dialog-container')).toBeNull();
  });

  it('renders the dialog with its title when visible', async () => {
    const f = await render({ config: CONFIG, visible: true });
    expect(query(f, '.dialog-container')).not.toBeNull();
    expect(text(f, '.dialog-title')).toBe('Manage Lists');
  });

  it('renders the filter tabs and moves the active class when a tab is clicked', async () => {
    const f = await render({ config: CONFIG, visible: true });
    expect(tabs(f).length).toBeGreaterThanOrEqual(2);
    tabs(f)[1].click();
    f.detectChanges(false);
    expect(tabs(f)[0].classList.contains('active')).toBe(false);
    expect(tabs(f)[1].classList.contains('active')).toBe(true);
  });

  it('shows the create-list button and reveals the create form when clicked', async () => {
    const f = await render({ config: CONFIG, visible: true });
    const createBtn = query(f, '.create-button') as HTMLButtonElement;
    expect(createBtn).not.toBeNull();
    createBtn.click();
    f.detectChanges(false);
    expect(f.componentInstance.showCreateForm).toBe(true);
  });

  it('shows an empty state when there are no lists', async () => {
    const f = await render({ config: CONFIG, visible: true });
    expect(query(f, 'mj-empty-state')).not.toBeNull();
    expect(query(f, '.list-item')).toBeNull();
  });

  it('emits cancel and hides when the close button is clicked', async () => {
    const f = await render({ config: CONFIG, visible: true });
    const out = capture(f.componentInstance.cancel);
    (query(f, '.close-button') as HTMLElement).click();
    expect(out.length).toBe(1);
    expect(f.componentInstance.visible).toBe(false);
  });

  it('emits cancel when the overlay backdrop is clicked', async () => {
    const f = await render({ config: CONFIG, visible: true });
    const out = capture(f.componentInstance.cancel);
    (query(f, '.dialog-overlay') as HTMLElement).click();
    expect(out.length).toBe(1);
  });
});
