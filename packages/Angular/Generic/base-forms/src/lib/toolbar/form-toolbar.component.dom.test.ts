import { describe, it, expect } from 'vitest';
import type { BaseEntity, EntityInfo } from '@memberjunction/core';
import { renderComponentFixture, query, queryAll, capture } from '@memberjunction/ng-test-utils';
import { MjFormToolbarComponent } from './form-toolbar.component';
import type { BeforeSaveEventArgs, BeforeRefreshEventArgs } from '../types/form-events';

/**
 * DOM coverage for <mj-form-toolbar> — the action bar CodeGen renders on every entity form (~6× direct,
 * but the container wraps it into every generated form). It's a pure presentational component (only dep
 * is ChangeDetectorRef): the click handlers dispatch to a bound Form ref if present, else emit the
 * matching output. With no Form bound these verify the two toolbar modes (view vs. edit banner), the
 * config/permission-gated buttons, the count badges, and the click → output wiring including the
 * delete/discard confirm dialogs and the section-filter controls.
 */

const ENTITY_INFO = { TrackRecordChanges: true, ParentChain: [], ChildEntities: [], Fields: [], NameField: null } as unknown as EntityInfo;
const RECORD = {
  EntityInfo: ENTITY_INFO,
  IsSaved: true,
  ISAChild: null,
  ISAChildren: [],
  Get: () => null,
  PrimaryKey: { ToConcatenatedString: () => 'PK1' },
} as unknown as BaseEntity;

const tick = () => new Promise((r) => setTimeout(r, 0));

const render = (inputs: Record<string, unknown> = {}) =>
  renderComponentFixture(MjFormToolbarComponent, {
    declarations: [MjFormToolbarComponent],
    inputs: {
      Record: RECORD,
      EntityInfo: ENTITY_INFO,
      UserCanEdit: true,
      UserCanDelete: true,
      FavoriteInitDone: true,
      ...inputs,
    },
  });

type Fx = ReturnType<typeof render>;
const btn = (f: Fx, sel: string) => query(f, sel) as HTMLElement | null;

describe('MjFormToolbarComponent (DOM)', () => {
  describe('view mode', () => {
    it('renders the edit / delete / refresh / favorite / history / list / tags actions', () => {
      const f = render();
      expect(btn(f, 'button[title="Edit this Record"]')).not.toBeNull();
      expect(btn(f, 'button[title="Delete this Record"]')).not.toBeNull();
      expect(btn(f, 'button[title="Refresh record from database"]')).not.toBeNull();
      expect(btn(f, 'button[title="Make Favorite"]')).not.toBeNull();
      expect(btn(f, '.mj-forms-btn--history')).not.toBeNull();
      expect(btn(f, '.mj-forms-btn--list')).not.toBeNull();
    });

    it('hides the edit button when the user cannot edit, delete when they cannot delete', () => {
      const f = render({ UserCanEdit: false, UserCanDelete: false });
      expect(btn(f, 'button[title="Edit this Record"]')).toBeNull();
      expect(btn(f, 'button[title="Delete this Record"]')).toBeNull();
    });

    it('hides the refresh button when ShowRefreshButton is false', () => {
      const f = render({ Config: { ShowRefreshButton: false } });
      expect(btn(f, 'button[title="Refresh record from database"]')).toBeNull();
    });

    it('hides the refresh button when record is unsaved', () => {
      const f = render({ Record: { ...RECORD, IsSaved: false } });
      expect(btn(f, 'button[title="Refresh record from database"]')).toBeNull();
    });

    it('hides the history button when the entity does not track changes', () => {
      const f = render({ EntityInfo: { TrackRecordChanges: false, ParentChain: [], ChildEntities: [], Fields: [] } as unknown as EntityInfo });
      expect(btn(f, '.mj-forms-btn--history')).toBeNull();
    });

    it('emits EditModeChange(true) when Edit is clicked', () => {
      const f = render();
      const out = capture(f.componentInstance.EditModeChange);
      btn(f, 'button[title="Edit this Record"]')!.click();
      expect(out).toEqual([true]);
    });

    it('emits RefreshRequested and BeforeRefresh when refresh is clicked', () => {
      const f = render();
      const refreshOut = capture(f.componentInstance.RefreshRequested);
      const beforeOut = capture(f.componentInstance.BeforeRefresh);
      btn(f, 'button[title="Refresh record from database"]')!.click();
      expect(beforeOut.length).toBe(1);
      expect(refreshOut.length).toBe(1);
    });

    it('does not emit RefreshRequested when BeforeRefresh handler cancels', () => {
      const f = render();
      f.componentInstance.BeforeRefresh.subscribe((e: BeforeRefreshEventArgs) => (e.Cancel = true));
      const refreshOut = capture(f.componentInstance.RefreshRequested);
      btn(f, 'button[title="Refresh record from database"]')!.click();
      expect(refreshOut.length).toBe(0);
    });

    it('disables the refresh button and shows spinner when IsRefreshing is true', () => {
      const f = render({ IsRefreshing: true });
      const refreshBtn = btn(f, 'button[title="Refresh record from database"]');
      expect(refreshBtn).not.toBeNull();
      expect((refreshBtn as HTMLButtonElement).disabled).toBe(true);
      expect(query(f, 'button[title="Refresh record from database"] .fa-spinner')).not.toBeNull();
    });

    it('emits FavoriteToggled when the favorite button is clicked', () => {
      const f = render();
      const out = capture(f.componentInstance.FavoriteToggled);
      btn(f, 'button[title="Make Favorite"]')!.click();
      expect(out.length).toBe(1);
    });

    it('emits TagsPanelToggled when the tags button is clicked', () => {
      const f = render();
      const out = capture(f.componentInstance.TagsPanelToggled);
      btn(f, 'button[title="View tags"]')!.click();
      expect(out.length).toBe(1);
    });

    it('emits HistoryRequested when history is clicked (BeforeHistoryView not cancelled)', () => {
      const f = render();
      const out = capture(f.componentInstance.HistoryRequested);
      btn(f, '.mj-forms-btn--history')!.click();
      expect(out.length).toBe(1);
    });

    it('renders the version / list / tag count badges when counts are positive', () => {
      const f = render({ VersionCount: 3, ListCount: 2, TagCount: 5 });
      expect(query(f, '.mj-version-count-badge')?.textContent?.trim()).toBe('v3');
      expect(query(f, '.mj-list-count-badge')).not.toBeNull();
    });
  });

  describe('delete confirmation', () => {
    it('opens the delete dialog on Delete click, then emits DeleteRequested on confirm', () => {
      const f = render();
      const out = capture(f.componentInstance.DeleteRequested);
      btn(f, 'button[title="Delete this Record"]')!.click();
      f.detectChanges();
      const confirm = btn(f, '.mj-dialog .mj-forms-btn--danger');
      expect(confirm).not.toBeNull();
      confirm!.click();
      expect(out.length).toBe(1);
    });
  });

  describe('edit-banner mode', () => {
    it('renders Save + Discard and hides the view-mode actions', () => {
      const f = render({ EditMode: true });
      expect(btn(f, 'button[title="Save Changes"]')).not.toBeNull();
      expect(btn(f, 'button[title="Discard Changes"]')).not.toBeNull();
      expect(btn(f, 'button[title="Edit this Record"]')).toBeNull();
      expect(btn(f, 'button[title="Refresh record from database"]')).toBeNull();
    });

    it('emits SaveRequested (after the microtask) when Save is clicked with no Form bound', async () => {
      const f = render({ EditMode: true });
      const save = capture(f.componentInstance.SaveRequested);
      const before = capture(f.componentInstance.BeforeSave);
      btn(f, 'button[title="Save Changes"]')!.click();
      await tick();
      expect(before.length).toBe(1);
      expect(save.length).toBe(1);
    });

    it('does not emit SaveRequested when a BeforeSave handler cancels', async () => {
      const f = render({ EditMode: true });
      f.componentInstance.BeforeSave.subscribe((e: BeforeSaveEventArgs) => (e.Cancel = true));
      const save = capture(f.componentInstance.SaveRequested);
      btn(f, 'button[title="Save Changes"]')!.click();
      await tick();
      expect(save.length).toBe(0);
    });

    it('emits CancelRequested immediately on Discard when not dirty', () => {
      const f = render({ EditMode: true, IsDirty: false });
      const out = capture(f.componentInstance.CancelRequested);
      btn(f, 'button[title="Discard Changes"]')!.click();
      expect(out.length).toBe(1);
    });

    it('routes Discard through a confirm dialog when there are unsaved changes', () => {
      const f = render({ EditMode: true, IsDirty: true });
      const out = capture(f.componentInstance.CancelRequested);
      btn(f, 'button[title="Discard Changes"]')!.click();
      f.detectChanges();
      // dirty → confirmation dialog instead of an immediate cancel
      expect(out.length).toBe(0);
      const confirm = btn(f, '.mj-dialog .mj-forms-btn--danger');
      expect(confirm).not.toBeNull();
      confirm!.click();
      expect(out.length).toBe(1);
    });
  });

  describe('section controls', () => {
    it('emits ExpandAll / CollapseAll from the section control buttons', () => {
      // counts chosen so both buttons are enabled (expand disabled when all expanded, collapse when none)
      const f = render({ VisibleSectionCount: 3, ExpandedSectionCount: 1 });
      const expand = capture(f.componentInstance.ExpandAllRequested);
      const collapse = capture(f.componentInstance.CollapseAllRequested);
      btn(f, 'button[title="Expand all sections"]')!.click();
      btn(f, 'button[title="Collapse all sections"]')!.click();
      expect(expand.length).toBe(1);
      expect(collapse.length).toBe(1);
    });

    it('hides expand/collapse-all in left-nav chrome', () => {
      const f = render({ ChromeLayout: 'left-nav', VisibleSectionCount: 3, ExpandedSectionCount: 1 });
      expect(btn(f, 'button[title="Expand all sections"]')).toBeNull();
      expect(btn(f, 'button[title="Collapse all sections"]')).toBeNull();
    });

    it('hides expand/collapse-all in right-nav chrome', () => {
      const f = render({ ChromeLayout: 'right-nav', VisibleSectionCount: 3, ExpandedSectionCount: 1 });
      expect(btn(f, 'button[title="Expand all sections"]')).toBeNull();
      expect(btn(f, 'button[title="Collapse all sections"]')).toBeNull();
    });

    it('emits FilterChange as the user types in the section filter', () => {
      const f = render();
      const out = capture(f.componentInstance.FilterChange);
      const input = query(f, 'input') as HTMLInputElement;
      input.value = 'abc';
      input.dispatchEvent(new Event('input'));
      expect(out).toEqual(['abc']);
    });

    it('clears the filter (FilterChange="") via the clear button when a filter is set', () => {
      const f = render({ SearchFilter: 'x' });
      const out = capture(f.componentInstance.FilterChange);
      const clear = queryAll(f, '.mj-clear-search')[0] as HTMLElement;
      clear.click();
      expect(out).toEqual(['']);
    });
  });

  describe('dynamic toolbar customization & items', () => {
    it('renders registered custom action buttons with text, icon, and primary styling', () => {
      const registeredItems = [
        {
          Key: 'confirm-order',
          Text: 'Confirm Order',
          Icon: 'fa-solid fa-check-double',
          Variant: 'primary' as const,
          Order: 5,
        },
      ];

      const f = render({ RegisteredItems: registeredItems });
      const confirmBtn = btn(f, '.mj-forms-btn--primary');
      expect(confirmBtn).not.toBeNull();
      expect(confirmBtn?.textContent?.trim()).toContain('Confirm Order');
      expect(confirmBtn?.querySelector('.fa-check-double')).not.toBeNull();
    });

    it('orders custom items before standard items when Order is lower', () => {
      const registeredItems = [
        {
          Key: 'confirm-order',
          Text: 'Confirm Order',
          Icon: 'fa-solid fa-check-double',
          Variant: 'primary' as const,
          Order: 5, // before Edit (Order 10)
        },
      ];

      const f = render({ RegisteredItems: registeredItems });
      const buttons = queryAll(f, '.mj-forms-toolbar-group > button');
      expect(buttons.length).toBeGreaterThan(1);
      expect(buttons[0].textContent?.trim()).toContain('Confirm Order');
      expect(buttons[1].getAttribute('title')).toBe('Edit this Record');
    });

    it('evaluates dynamic Visible predicate function to hide items', () => {
      const registeredItems = [
        {
          Key: 'confirm-order',
          Text: 'Confirm Order',
          Visible: () => false,
        },
      ];

      const f = render({ RegisteredItems: registeredItems });
      expect(btn(f, 'button:has(.mj-forms-btn-text)')).toBeNull();
    });

    it('evaluates dynamic Visible predicate function to show items', () => {
      const registeredItems = [
        {
          Key: 'confirm-order',
          Text: 'Confirm Order',
          Visible: () => true,
        },
      ];

      const f = render({ RegisteredItems: registeredItems });
      expect(btn(f, 'button:has(.mj-forms-btn-text)')).not.toBeNull();
    });

    it('evaluates dynamic Disabled reason string predicate and sets tooltip', () => {
      const registeredItems = [
        {
          Key: 'confirm-order',
          Text: 'Confirm Order',
          Disabled: () => 'Order must have at least one line',
        },
      ];

      const f = render({ RegisteredItems: registeredItems });
      const confirmBtn = btn(f, 'button:has(.mj-forms-btn-text)');
      expect(confirmBtn).not.toBeNull();
      expect(confirmBtn?.hasAttribute('disabled')).toBe(true);
      expect(confirmBtn?.getAttribute('title')).toBe('Order must have at least one line');
    });

    it('renders loading spinner and disables button when IsLoading is true', () => {
      const registeredItems = [
        {
          Key: 'confirm-order',
          Text: 'Confirm Order',
          IsLoading: true,
        },
      ];

      const f = render({ RegisteredItems: registeredItems });
      const confirmBtn = btn(f, 'button:has(.mj-forms-btn-text)');
      expect(confirmBtn?.hasAttribute('disabled')).toBe(true);
      expect(confirmBtn?.querySelector('.fa-spinner.fa-spin')).not.toBeNull();
    });

    it('applies dynamic item overrides to hide delete and disable edit', () => {
      const overrides = new Map([
        ['delete', { Visible: false }],
        ['edit', { Disabled: 'Cannot edit posted record' }],
      ]);

      const f = render({ ItemOverrides: overrides });
      expect(btn(f, 'button[title="Delete this Record"]')).toBeNull();

      const editBtn = btn(f, 'button[title="Cannot edit posted record"]');
      expect(editBtn).not.toBeNull();
      expect(editBtn?.hasAttribute('disabled')).toBe(true);
    });

    it('triggers ToolbarItemClick and OnClick handler when custom button is clicked', async () => {
      let clicked = false;
      const registeredItems = [
        {
          Key: 'custom-action',
          Text: 'Custom Action',
          OnClick: () => {
            clicked = true;
          },
        },
      ];

      const f = render({ RegisteredItems: registeredItems });
      const out = capture(f.componentInstance.ToolbarItemClick);
      const customBtn = btn(f, 'button:has(.mj-forms-btn-text)');
      customBtn?.click();

      expect(clicked).toBe(true);
      expect(out.length).toBe(1);
      expect(out[0].ItemKey).toBe('custom-action');
    });
  });
});
