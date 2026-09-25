import { describe, it, expect, vi, afterEach } from 'vitest';
import type { BaseEntity, EntityInfo } from '@memberjunction/core';
import { renderComponentFixture, query, queryAll, capture } from '@memberjunction/ng-test-utils';
import { MjFormToolbarComponent } from './form-toolbar.component';
import { DEFAULT_TOOLBAR_CONFIG } from '../types/toolbar-config';
import type { BeforeSaveEventArgs, BeforeRefreshEventArgs, BeforeCloneEventArgs } from '../types/form-events';
import { RecordCloneService, RecordCloneSlideInComponent } from '@memberjunction/ng-record-clone';
import { UserInfoEngine } from '@memberjunction/core-entities';
import { TOOLBAR_PINS_SETTING_KEY } from './form-toolbar.component';
import type { RecordNavigationEvent } from '../types/navigation-events';

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
/** Opens the More menu, where unpinned actions and Delete live. */
const openMore = (f: Fx) => { btn(f, 'button[title="More actions"]')?.click(); f.detectChanges(); };
/** Opens the View menu, where section and layout controls live. */
const openView = (f: Fx) => { btn(f, 'button[title="Sections and layout"]')?.click(); f.detectChanges(); };

describe('MjFormToolbarComponent (DOM)', () => {
  afterEach(() => vi.restoreAllMocks());
  describe('view mode', () => {
    it('renders the edit / delete / refresh / favorite / history / list / tags actions', () => {
      const f = render();
      expect(btn(f, 'button[title="Edit this Record"]')).not.toBeNull();
      openMore(f);
      expect(btn(f, 'button[title="Delete this Record"]')).not.toBeNull();
      expect(btn(f, 'button[title="Refresh record from database"]')).not.toBeNull();
      expect(btn(f, 'button[title="Make Favorite"]')).not.toBeNull();
      expect(btn(f, '.mj-forms-btn--history')).not.toBeNull();
      expect(btn(f, '.mj-forms-menu-item[title="Add to a list"]')).not.toBeNull();
    });

    it('hides the edit button when the user cannot edit, delete when they cannot delete', () => {
      const f = render({ UserCanEdit: false, UserCanDelete: false });
      expect(btn(f, 'button[title="Edit this Record"]')).toBeNull();
      openMore(f);
      expect(btn(f, 'button[title="Delete this Record"]')).toBeNull();
    });

    it('hides the refresh button when ShowRefreshButton is false', () => {
      const f = render({ Config: { ShowRefreshButton: false } });
      openMore(f);
      expect(btn(f, 'button[title="Refresh record from database"]')).toBeNull();
    });

    it('hides the refresh button when record is unsaved', () => {
      const f = render({ Record: { ...RECORD, IsSaved: false } });
      openMore(f);
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
      openMore(f);
      const refreshOut = capture(f.componentInstance.RefreshRequested);
      const beforeOut = capture(f.componentInstance.BeforeRefresh);
      btn(f, 'button[title="Refresh record from database"]')!.click();
      expect(beforeOut.length).toBe(1);
      expect(refreshOut.length).toBe(1);
    });

    it('does not emit RefreshRequested when BeforeRefresh handler cancels', () => {
      const f = render();
      openMore(f);
      f.componentInstance.BeforeRefresh.subscribe((e: BeforeRefreshEventArgs) => (e.Cancel = true));
      const refreshOut = capture(f.componentInstance.RefreshRequested);
      btn(f, 'button[title="Refresh record from database"]')!.click();
      expect(refreshOut.length).toBe(0);
    });

    it('disables the refresh button and shows spinner when IsRefreshing is true', () => {
      const f = render({ IsRefreshing: true });
      openMore(f);
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
      openMore(f);
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
      openMore(f);
      expect(queryAll(f, '.mj-forms-menu-badge').map((b) => b.textContent?.trim())).toEqual(expect.arrayContaining(['2', '5']));
    });
  });

  describe('delete confirmation', () => {
    it('opens the delete dialog on Delete click, then emits DeleteRequested on confirm', () => {
      const f = render();
      openMore(f);
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
      openView(f);
      const expand = capture(f.componentInstance.ExpandAllRequested);
      const collapse = capture(f.componentInstance.CollapseAllRequested);
      btn(f, 'button[title="Expand all sections"]')!.click();
      btn(f, 'button[title="Collapse all sections"]')!.click();
      expect(expand.length).toBe(1);
      expect(collapse.length).toBe(1);
    });

    it('hides expand/collapse-all in left-nav chrome', () => {
      const f = render({ ChromeLayout: 'left-nav', VisibleSectionCount: 3, ExpandedSectionCount: 1 });
      openView(f);
      expect(btn(f, 'button[title="Expand all sections"]')).toBeNull();
      expect(btn(f, 'button[title="Collapse all sections"]')).toBeNull();
    });

    it('hides expand/collapse-all in right-nav chrome', () => {
      const f = render({ ChromeLayout: 'right-nav', VisibleSectionCount: 3, ExpandedSectionCount: 1 });
      openView(f);
      expect(btn(f, 'button[title="Expand all sections"]')).toBeNull();
      expect(btn(f, 'button[title="Collapse all sections"]')).toBeNull();
    });

    it('emits FilterChange as the user types in the section filter', () => {
      const f = render();
      openView(f);
      const out = capture(f.componentInstance.FilterChange);
      const input = query(f, '.mj-forms-menu-search input') as HTMLInputElement;
      input.value = 'abc';
      input.dispatchEvent(new Event('input'));
      expect(out).toEqual(['abc']);
    });

    it('clears the filter (FilterChange="") via the clear button when a filter is set', () => {
      const f = render({ SearchFilter: 'x' });
      openView(f);
      const out = capture(f.componentInstance.FilterChange);
      const clear = queryAll(f, '.mj-clear-search')[0] as HTMLElement;
      clear.click();
      expect(out).toEqual(['']);
    });
  });

  describe('pinned actions', () => {
    const pinnedTitles = (f: Fx) =>
      queryAll(f, '.mj-forms-toolbar > .mj-forms-toolbar-group > button').map((b) => b.getAttribute('title'));

    it('shows Edit as an icon-only button, Favorite and History pinned, everything else in More', () => {
      vi.spyOn(UserInfoEngine.Instance, 'GetSetting').mockReturnValue(undefined);
      const f = render();
      const edit = btn(f, 'button[title="Edit this Record"]')!;
      expect(edit.querySelector('.mj-forms-btn-text')).toBeNull();
      expect(pinnedTitles(f)).toEqual(['Edit this Record', 'Make Favorite', 'Record Changes']);
      expect(btn(f, 'button[title="View tags"]')).toBeNull();
      openMore(f);
      expect(btn(f, '.mj-forms-menu-item[title="View tags"]')).not.toBeNull();
    });

    it('uses the pins the user saved', () => {
      vi.spyOn(UserInfoEngine.Instance, 'GetSetting').mockImplementation((key: string) =>
        key === TOOLBAR_PINS_SETTING_KEY ? JSON.stringify({ Version: 1, Pinned: ['tags'] }) : undefined
      );
      const f = render();
      expect(pinnedTitles(f)).toEqual(['Edit this Record', 'View tags']);
    });

    it('pins and unpins from the More menu and saves the choice for the user', () => {
      vi.spyOn(UserInfoEngine.Instance, 'GetSetting').mockReturnValue(undefined);
      const save = vi.spyOn(UserInfoEngine.Instance, 'SetSettingDebounced').mockImplementation(() => undefined);
      const f = render();
      openMore(f);

      btn(f, 'button[aria-label="Pin Tags"]')!.click();
      f.detectChanges();
      expect(pinnedTitles(f)).toContain('View tags');
      expect(save).toHaveBeenLastCalledWith(TOOLBAR_PINS_SETTING_KEY, JSON.stringify({ Version: 1, Pinned: ['favorite', 'history', 'tags'] }));

      btn(f, 'button[aria-label="Unpin Favorite"]')!.click();
      f.detectChanges();
      expect(pinnedTitles(f)).not.toContain('Make Favorite');
    });

    it('stops at MaxPinnedActions, the same for every user', () => {
      vi.spyOn(UserInfoEngine.Instance, 'GetSetting').mockReturnValue(undefined);
      vi.spyOn(UserInfoEngine.Instance, 'SetSettingDebounced').mockImplementation(() => undefined);
      const f = render({ Config: { ...DEFAULT_TOOLBAR_CONFIG, MaxPinnedActions: 2 } });
      openMore(f);
      const pinTags = btn(f, 'button[aria-label="Pin Tags"]') as HTMLButtonElement;
      expect(pinTags.disabled).toBe(true);
    });

    it('keeps custom items inline unless they opt in with Pinnable', () => {
      vi.spyOn(UserInfoEngine.Instance, 'GetSetting').mockReturnValue(undefined);
      const f = render({
        RegisteredItems: [
          { Key: 'confirm-order', Text: 'Confirm Order', Description: 'Confirm this order' },
          { Key: 'export', Text: 'Export', Description: 'Export record', Pinnable: true },
        ],
      });
      expect(pinnedTitles(f)).toContain('Confirm this order');
      expect(pinnedTitles(f)).not.toContain('Export record');
      openMore(f);
      expect(btn(f, '.mj-forms-menu-item[title="Export record"]')).not.toBeNull();
    });

    it('does not let pins for actions this form lacks use up slots', () => {
      vi.spyOn(UserInfoEngine.Instance, 'GetSetting').mockImplementation((key: string) =>
        key === TOOLBAR_PINS_SETTING_KEY ? JSON.stringify({ Version: 1, Pinned: ['clone', 'list', 'tags'] }) : undefined
      );
      const save = vi.spyOn(UserInfoEngine.Instance, 'SetSettingDebounced').mockImplementation(() => undefined);
      const f = render();
      expect(pinnedTitles(f)).toEqual(['Edit this Record', 'Add to a list', 'View tags']);
      openMore(f);
      const pinFav = btn(f, 'button[aria-label="Pin Favorite"]') as HTMLButtonElement;
      expect(pinFav.disabled).toBe(false);
      pinFav.click();
      expect(save).toHaveBeenLastCalledWith(TOOLBAR_PINS_SETTING_KEY, JSON.stringify({ Version: 1, Pinned: ['clone', 'list', 'tags', 'favorite'] }));
    });

    it('re-reads pins so a change made in another form shows up', () => {
      let stored: string | undefined;
      vi.spyOn(UserInfoEngine.Instance, 'GetSetting').mockImplementation(() => stored);
      const f = render();
      expect(pinnedTitles(f)).toContain('Make Favorite');
      stored = JSON.stringify({ Version: 1, Pinned: ['tags'] });
      expect(f.componentInstance.PinnedActionItems.map((i) => i.Key)).toEqual(['tags']);
    });

    it('does not render Delete twice when a host makes it an inline button', () => {
      const f = render({ RegisteredItems: [{ Key: 'delete', Pinnable: false }] });
      expect(queryAll(f, 'button[title="Delete this Record"]')).toHaveLength(1);
      openMore(f);
      expect(queryAll(f, 'button[title="Delete this Record"]')).toHaveLength(1);
    });

    it('lists Delete last in the More menu, apart from the pinnable actions', () => {
      const f = render();
      openMore(f);
      const items = queryAll(f, '.mj-forms-menu .mj-forms-menu-item');
      expect(items.at(-1)?.getAttribute('title')).toBe('Delete this Record');
      expect(btn(f, 'button[aria-label="Pin Delete record"]')).toBeNull();
    });
  });

  describe('keyboard and screen readers', () => {
    it('uses a disclosure panel: the trigger controls it by id, and nothing claims the menu role', () => {
      const f = render();
      openMore(f);
      const trigger = btn(f, 'button[title="More actions"]')!;
      expect(trigger.getAttribute('aria-expanded')).toBe('true');
      expect(trigger.hasAttribute('aria-haspopup')).toBe(false);
      const panel = query(f, `#${trigger.getAttribute('aria-controls')}`);
      expect(panel).not.toBeNull();
      expect(queryAll(f, '[role="menu"], [role="menuitem"]')).toHaveLength(0);
    });

    it('moves focus into the panel on open, and back to its trigger on Escape', async () => {
      const f = render();
      document.body.appendChild(f.nativeElement);
      openMore(f);
      await tick();
      const panelId = btn(f, 'button[title="More actions"]')!.getAttribute('aria-controls');
      expect(document.activeElement?.closest(`#${panelId}`)).not.toBeNull();

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      f.detectChanges();
      expect(document.activeElement).toBe(btn(f, 'button[title="More actions"]'));
      f.nativeElement.remove();
    });
  });

  describe('view menu', () => {
    it('keeps an active section filter visible, with a clear button, once the menu closes', () => {
      const f = render({ SearchFilter: 'addr' });
      expect(query(f, '.mj-forms-filter-chip')?.textContent).toContain('addr');
      const out = capture(f.componentInstance.FilterChange);
      btn(f, '.mj-forms-filter-chip-clear')!.click();
      expect(out).toEqual(['']);
    });

    it('closes after a form variant is picked', () => {
      const f = render({ Variants: [{ ID: 'v1', Label: 'Admin layout', Scope: 'Role', Status: 'Active' }] });
      openView(f);
      (queryAll(f, '.mj-form-variant-picker-row')[1] as HTMLElement).click();
      expect(f.componentInstance.ViewMenuOpen).toBe(false);
    });

    it('hides the View button when nothing inside it would render', () => {
      const f = render({
        ChromeLayout: 'left-nav',
        Config: { ...DEFAULT_TOOLBAR_CONFIG, ShowSectionFilter: false, ShowSectionManager: false, ShowWidthToggle: false, ShowFormVariantPicker: false },
      });
      expect(btn(f, 'button[title="Sections and layout"]')).toBeNull();
    });
  });

  describe('record cloning', () => {
    const CLONE_ENTITY = { ...ENTITY_INFO, Name: 'MJ: Users', DisplayNameOrName: 'Users', CloneConfig: { Enabled: true } } as unknown as EntityInfo;
    const CLONE_RECORD = { ...RECORD, EntityInfo: CLONE_ENTITY } as unknown as BaseEntity;
    const CLONE_ON = { ShowCloneButton: true, ShowEditButton: true };

    const renderClone = (canClone: boolean, inputs: Record<string, unknown> = {}) => {
      const service = {
        DescribeRecord: vi.fn().mockResolvedValue({ CanClone: canClone, Relationships: [] }),
        PlanClone: vi.fn(),
        ExecuteClone: vi.fn(),
        GetLineage: vi.fn(),
      };
      const f = renderComponentFixture(MjFormToolbarComponent, {
        declarations: [MjFormToolbarComponent],
        imports: [RecordCloneSlideInComponent],
        providers: [{ provide: RecordCloneService, useValue: service }],
        inputs: { Record: CLONE_RECORD, EntityInfo: CLONE_ENTITY, UserCanEdit: true, Config: CLONE_ON, ...inputs },
      });
      return { f, service };
    };
    const settle = async (f: Fx) => { f.detectChanges(); await tick(); f.detectChanges(); };
    const cloneBtn = (f: Fx) => { if (!btn(f, 'button[title^="Clone this"]')) openMore(f); return btn(f, 'button[title^="Clone this"]'); };

    it('shows Clone when the config turns it on and Describe allows it', async () => {
      const { f, service } = renderClone(true);
      await settle(f);
      expect(service.DescribeRecord.mock.calls[0][0]).toEqual({ EntityName: 'MJ: Users' });
      expect(cloneBtn(f)).not.toBeNull();
    });

    it('hides Clone when Describe refuses', async () => {
      const { f } = renderClone(false);
      await settle(f);
      expect(cloneBtn(f)).toBeNull();
    });

    it('hides Clone and skips the server call when ShowCloneButton is off', async () => {
      const { f, service } = renderClone(true, { Config: { ShowEditButton: true } });
      await settle(f);
      expect(service.DescribeRecord).not.toHaveBeenCalled();
      expect(cloneBtn(f)).toBeNull();
    });

    it('skips the server call for entities whose clone config is not enabled', async () => {
      const entity = { ...CLONE_ENTITY, CloneConfig: null } as unknown as EntityInfo;
      const { f, service } = renderClone(true, { Record: { ...RECORD, EntityInfo: entity }, EntityInfo: entity });
      await settle(f);
      expect(service.DescribeRecord).not.toHaveBeenCalled();
    });

    it('hides Clone for unsaved records', async () => {
      const { f } = renderClone(true, { Record: { ...CLONE_RECORD, IsSaved: false } });
      await settle(f);
      expect(cloneBtn(f)).toBeNull();
    });

    it('opens the slide-in on click unless BeforeClone cancels', async () => {
      const { f } = renderClone(true);
      await settle(f);

      const sub = f.componentInstance.BeforeClone.subscribe((e: BeforeCloneEventArgs) => (e.Cancel = true));
      cloneBtn(f)!.click();
      expect(f.componentInstance.IsClonePanelOpen).toBe(false);

      sub.unsubscribe();
      cloneBtn(f)!.click();
      expect(f.componentInstance.IsClonePanelOpen).toBe(true);
    });

    it('does not reopen the slide-in by itself after the record switches entity', async () => {
      const { f } = renderClone(true);
      await settle(f);
      cloneBtn(f)!.click();
      expect(f.componentInstance.IsClonePanelOpen).toBe(true);

      const other = { ...CLONE_ENTITY, Name: 'MJ: Roles' } as unknown as EntityInfo;
      f.componentInstance.Record = { ...RECORD, EntityInfo: other } as unknown as BaseEntity;
      await settle(f);

      expect(f.componentInstance.IsClonePanelOpen).toBe(false);
    });

    it('turns a clone navigation request into a record Navigate event', async () => {
      const { f } = renderClone(true);
      await settle(f);
      const out = capture(f.componentInstance.Navigate);

      f.componentInstance.OnCloneNavigate({ Kind: 'record', EntityName: 'MJ: Users', RecordKey: 'ID|u-2' });

      const nav = out[0] as RecordNavigationEvent;
      expect(nav.Kind).toBe('record');
      expect(nav.EntityName).toBe('MJ: Users');
      expect(nav.OpenInNewTab).toBe(true);
      expect(nav.PrimaryKey.KeyValuePairs).toEqual([{ FieldName: 'ID', Value: 'u-2' }]);
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
      expect(queryAll(f, 'button').some((b) => b.textContent?.includes('Confirm Order'))).toBe(false);
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
      expect(queryAll(f, 'button').some((b) => b.textContent?.includes('Confirm Order'))).toBe(true);
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
