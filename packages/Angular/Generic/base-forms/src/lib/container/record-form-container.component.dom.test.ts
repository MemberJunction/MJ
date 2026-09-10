import { describe, it, expect, vi } from 'vitest';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { By } from '@angular/platform-browser';
import type { BaseEntity } from '@memberjunction/core';
import { renderComponentFixture, query, capture } from '@memberjunction/ng-test-utils';
import { MjRecordFormContainerComponent } from './record-form-container.component';
import { FormChromeCoordinator } from '../chrome/form-chrome-coordinator.service';
import { DETAILS_SECTION_KEY } from '../chrome/form-chrome';
import type { FormChromeSpec } from '../chrome/form-chrome';
import type { BaseFormComponent } from '../base-form-component';
import { UserInfoEngine } from '@memberjunction/core-entities';
import { Subject } from 'rxjs';
import { ValidationErrorInfo, ValidationErrorType } from '@memberjunction/global';
import { FormSectionIndicatorCoordinator, type FormSectionIndicatorSource } from '../section-indicators/form-section-indicator-coordinator.service';
import { ParseValidationSource, SumSectionIndicators, type FormSectionIndicators, type ParsedValidationSource } from '../section-indicators/form-section-indicators';

/**
 * DOM coverage for <mj-record-form-container> — the form host CodeGen wraps every entity form in
 * (~407×). The 8 heavy children (toolbar, section-manager, panel-slot, isa-panel, record-changes/tags,
 * list-management-dialog, empty-state) are stubbed to their bound surfaces. With no FormComponent
 * bound, the Effective* getters fall back to the @Inputs and the toolbar-event handlers re-emit the
 * container's own outputs — so these verify the layout-class logic, the toolbar input wiring, and the
 * toolbar → container output forwarding (the container's actual job).
 */

// --- child stubs: declare every INPUT the template binds (errorOnUnknownProperties is on);
//     unknown outputs fall back to native event listeners, so only tested outputs are declared. ---
@Component({ standalone: true, selector: 'mj-form-toolbar', template: '' })
class ToolbarStub {
  @Input() Record: unknown; @Input() EditMode = false; @Input() UserCanEdit = false; @Input() UserCanDelete = false;
  @Input() IsFavorite = false; @Input() FavoriteInitDone = false; @Input() IsDirty = false; @Input() DirtyFieldNames: unknown;
  @Input() ListCount = 0; @Input() TagCount = 0; @Input() AttachmentCount = 0; @Input() AttachmentsAvailable = false; @Input() IsAttachmentsPanelOpen = false; @Input() VersionCount = 0; @Input() EntityInfo: unknown; @Input() Config: unknown;
  @Input() IsSaving = false; @Input() IsRefreshing = false; @Input() VisibleSectionCount = 0; @Input() TotalSectionCount = 0; @Input() ExpandedSectionCount = 0;
  @Input() SearchFilter = ''; @Input() ShowEmptyFields = false; @Input() WidthMode = ''; @Input() HasCustomSectionOrder = false;
  @Input() Variants: unknown; @Input() CurrentVariantID: unknown;
  @Input() RegisteredItems: unknown; @Input() ItemOverrides: unknown; @Input() FormComponent: unknown;
  @Input() ChromeLayout = 'accordion';
  @Output() Navigate = new EventEmitter<unknown>();
  @Output() EditModeChange = new EventEmitter<boolean>();
  @Output() BeforeSave = new EventEmitter<unknown>();
  @Output() SaveRequested = new EventEmitter<void>();
  @Output() BeforeRefresh = new EventEmitter<unknown>();
  @Output() RefreshRequested = new EventEmitter<void>();
  @Output() CancelRequested = new EventEmitter<void>();
  @Output() DeleteRequested = new EventEmitter<void>();
  @Output() ToolbarItemClick = new EventEmitter<unknown>();
}
@Component({ standalone: true, selector: 'mj-section-manager', template: '' })
class SectionManagerStub {
  @Input() Sections: unknown;
  @Input() SectionOrder: unknown;
  @Input() MoreSectionKeys: unknown;
  @Input() LockedMoreKeys: unknown;
  @Input() Visible = false;
}
@Component({ standalone: true, selector: 'mj-form-panel-slot', template: '' })
class PanelSlotStub { @Input() Entity: unknown; @Input() Record: unknown; @Input() FormComponent: unknown; }
@Component({ standalone: true, selector: 'mj-empty-state', template: '' })
class EmptyStateStub { @Input() Message = ''; }
@Component({ standalone: true, selector: 'mj-isa-related-panel', template: '' })
class IsaPanelStub { @Input() Record: unknown; @Input() EditMode = false; @Input() Collapsed = false; }
@Component({ standalone: true, selector: 'mj-record-changes', template: '' })
class RecordChangesStub { @Input() record: unknown; @Input() AllowRestore = false; }
@Component({ standalone: true, selector: 'mj-record-tags', template: '' })
class RecordTagsStub { @Input() Record: unknown; @Input() WidthPx = 0; }
@Component({ standalone: true, selector: 'mj-record-attachments', template: '' })
class RecordAttachmentsStub { @Input() Record: unknown; @Input() Visible = false; }
@Component({ standalone: true, selector: 'mj-list-management-dialog', template: '' })
class ListMgmtStub { @Input() visible = false; @Input() config: unknown; }
@Component({ standalone: true, selector: 'mj-form-contributions', template: '' })
class FormContributionsStub { @Input() Record: unknown; @Input() FormComponent: unknown; @Input() FormContext: unknown; @Input() BakedSectionKeys: unknown; @Input() ShowRelatedEntities = true; }

const CHILD_STUBS = [ToolbarStub, SectionManagerStub, PanelSlotStub, EmptyStateStub, IsaPanelStub, RecordChangesStub, RecordTagsStub, RecordAttachmentsStub, ListMgmtStub, FormContributionsStub];

const RECORD = { EntityInfo: { Name: 'Accounts' } } as unknown as BaseEntity;

const render = (inputs: Record<string, unknown> = {}) =>
  renderComponentFixture(MjRecordFormContainerComponent, {
    imports: CHILD_STUBS,
    declarations: [MjRecordFormContainerComponent],
    inputs: { Record: RECORD, EntityInfo: { Name: 'Accounts' }, ...inputs },
  });
const toolbar = (f: ReturnType<typeof render>) => f.debugElement.query(By.directive(ToolbarStub)).componentInstance as ToolbarStub;
const panels = (f: ReturnType<typeof render>) => query(f, '.mj-forms-panels-container') as HTMLElement;

describe('MjRecordFormContainerComponent (DOM)', () => {
  it('has no full-width layout class in centered mode', () => {
    expect(panels(render({ WidthMode: 'centered' })).classList.contains('mj-forms-panels--full-width')).toBe(false);
  });

  it('applies the full-width layout class in full-width mode', () => {
    expect(panels(render({ WidthMode: 'full-width' })).classList.contains('mj-forms-panels--full-width')).toBe(true);
  });

  it('applies the edit-mode layout class when EditMode is on', () => {
    expect(panels(render({ EditMode: true })).classList.contains('mj-forms-panels--edit-mode')).toBe(true);
  });

  it('wires the effective state inputs onto the toolbar', () => {
    const t = toolbar(render({ EditMode: true, UserCanEdit: true, IsDirty: true, IsRefreshing: true }));
    expect(t.EditMode).toBe(true);
    expect(t.UserCanEdit).toBe(true);
    expect(t.IsDirty).toBe(true);
    expect(t.IsRefreshing).toBe(true);
    expect(t.Record).toBe(RECORD);
  });

  it('re-emits SaveRequested from the toolbar (no FormComponent → container emits)', () => {
    const f = render();
    const out = capture(f.componentInstance.SaveRequested);
    toolbar(f).SaveRequested.emit();
    expect(out.length).toBe(1);
  });

  it('re-emits RefreshRequested from the toolbar (no FormComponent → container emits)', () => {
    const f = render();
    const out = capture(f.componentInstance.RefreshRequested);
    toolbar(f).RefreshRequested.emit();
    expect(out.length).toBe(1);
  });

  it('re-emits CancelRequested from the toolbar', () => {
    const f = render();
    const out = capture(f.componentInstance.CancelRequested);
    toolbar(f).CancelRequested.emit();
    expect(out.length).toBe(1);
  });

  it('re-emits DeleteRequested from the toolbar', () => {
    const f = render();
    const out = capture(f.componentInstance.DeleteRequested);
    toolbar(f).DeleteRequested.emit();
    expect(out.length).toBe(1);
  });

  it('passes the BeforeSave event straight through', () => {
    const f = render();
    const out = capture(f.componentInstance.BeforeSave);
    const evt = { cancel: false } as unknown as Parameters<typeof f.componentInstance.BeforeSave.emit>[0];
    toolbar(f).BeforeSave.emit(evt);
    expect(out).toEqual([evt]);
  });

  it('passes the BeforeRefresh event straight through', () => {
    const f = render();
    const out = capture(f.componentInstance.BeforeRefresh);
    const evt = { Cancel: false } as unknown as Parameters<typeof f.componentInstance.BeforeRefresh.emit>[0];
    toolbar(f).BeforeRefresh.emit(evt);
    expect(out).toEqual([evt]);
  });
  // ---- Left-nav rail section indicators (unsaved-changes dot + invalid-field badge) ----

  /**
   * A rail item must say WHICH section holds an edit or a failure. The container reads
   * each section's live counts through `FormSectionIndicatorCoordinator` — fed by the
   * panels themselves (from their own fields), here stood in for by fixed sources.
   */
  describe('left-nav section indicators', () => {
    const LEFT_NAV_SPEC: FormChromeSpec = {
      Layout: 'left-nav',
      Groups: [
        { Key: 'details', Title: 'Details', Icon: 'fa-solid fa-list', SectionKeys: ['identity', 'notes'], IsMore: false },
        { Key: 'payments', Title: 'Payments', Icon: 'fa-solid fa-table', SectionKeys: ['payments'], IsMore: false },
        { Key: '__mj_form_more', Title: 'More', Icon: 'fa-solid fa-folder', SectionKeys: ['audit'], IsMore: true },
      ],
      RelatedRoles: new Map(),
      MoreSectionKeys: ['audit'],
    };

    function failure(source: string): ValidationErrorInfo {
      return new ValidationErrorInfo(source, 'required', null, ValidationErrorType.Failure);
    }

    /** Fixed-count stand-in for a panel: owns the plain field names it is given. */
    function source(key: string, counts: Partial<FormSectionIndicators>, fields: string[] = []): FormSectionIndicatorSource {
      return {
        SectionKey: key,
        GetSectionIndicators: () => SumSectionIndicators(counts),
        OwnsValidationSource: (p: ParsedValidationSource) => p.Collection === undefined && fields.includes(p.Field),
      };
    }

    function formStub(showValidation: boolean, errors: ValidationErrorInfo[]): BaseFormComponent {
      return {
        record: RECORD,
        formContext: { showValidation, validationErrors: errors },
        RecordReady: new Subject<void>(),
        RecordRefreshed: new Subject<unknown>(),
      } as unknown as BaseFormComponent;
    }

    interface RailSetup {
      sources?: FormSectionIndicatorSource[];
      showValidation?: boolean;
      errors?: ValidationErrorInfo[];
    }

    /**
     * Chrome spec + sources are seeded in `setup`, BEFORE the single render: the
     * container is `OnPush` and, as the root component here, nothing marks it dirty
     * afterwards. In the app both arrive through `ResolveChrome()` and the panels'
     * own `ngOnInit`, which mark it dirty themselves.
     */
    function renderRail(setup: RailSetup = {}) {
      return renderComponentFixture(MjRecordFormContainerComponent, {
        imports: CHILD_STUBS,
        declarations: [MjRecordFormContainerComponent],
        inputs: {
          Record: RECORD,
          EntityInfo: { Name: 'Accounts' },
          FormComponent: formStub(setup.showValidation ?? false, setup.errors ?? []),
        },
        setup: (_instance, ref) => {
          ref.injector.get(FormChromeCoordinator).Apply(LEFT_NAV_SPEC);
          const coordinator = ref.injector.get(FormSectionIndicatorCoordinator);
          for (const s of setup.sources ?? []) coordinator.Register(s);
        },
      });
    }

    type RailFixture = ReturnType<typeof renderRail>;

    const railItems = (f: RailFixture): HTMLElement[] => Array.from(f.nativeElement.querySelectorAll('.mj-forms-chrome-rail-item')) as HTMLElement[];
    const railItem = (f: RailFixture, title: string): HTMLElement => {
      const items = railItems(f);
      const item = items.find((el) => el.querySelector('.mj-forms-chrome-rail-label')?.textContent?.trim() === title);
      if (!item) throw new Error(`no rail item titled "${title}"`);
      return item;
    };
    const errorBadge = (f: RailFixture, title: string) => railItem(f, title).querySelector('.mj-forms-chrome-rail-error');
    const dirtyDot = (f: RailFixture, title: string) => railItem(f, title).querySelector('.mj-forms-chrome-rail-dirty');

    it('renders no indicator on a clean form', () => {
      const f = renderRail({ sources: [source('identity', {}), source('payments', {})] });
      expect(f.nativeElement.querySelector('.mj-forms-chrome-rail-error')).toBeNull();
      expect(f.nativeElement.querySelector('.mj-forms-chrome-rail-dirty')).toBeNull();
    });

    it('badges the rail group that owns the invalid field, and only that one', () => {
      const f = renderRail({ sources: [source('identity', { ErrorCount: 1 }), source('payments', {})] });
      expect(errorBadge(f, 'Details')?.textContent?.trim()).toBe('1');
      expect(errorBadge(f, 'Details')?.getAttribute('title')).toBe('1 field in Details needs attention');
      expect(railItem(f, 'Details').classList.contains('has-errors')).toBe(true);
      expect(errorBadge(f, 'Payments')).toBeNull();
      expect(railItem(f, 'Payments').classList.contains('has-errors')).toBe(false);
    });

    it('sums across every section key the group fronts', () => {
      const f = renderRail({ sources: [source('identity', { ErrorCount: 1 }), source('notes', { ErrorCount: 2 })] });
      expect(errorBadge(f, 'Details')?.textContent?.trim()).toBe('3');
    });

    it('dots the rail group that holds unsaved edits, and only that one', () => {
      const f = renderRail({ sources: [source('identity', {}), source('payments', { DirtyCount: 2 })] });
      expect(dirtyDot(f, 'Payments')?.getAttribute('title')).toBe('2 unsaved changes in Payments');
      expect(railItem(f, 'Payments').classList.contains('is-dirty')).toBe(true);
      expect(dirtyDot(f, 'Details')).toBeNull();
    });

    it('shows both the dot and the badge when a section is edited AND invalid', () => {
      const f = renderRail({ sources: [source('identity', { DirtyCount: 1, ErrorCount: 1 })] });
      expect(dirtyDot(f, 'Details')).not.toBeNull();
      expect(errorBadge(f, 'Details')).not.toBeNull();
    });

    it('shows a warning badge only when the group has warnings and no failures', () => {
      const f = renderRail({ sources: [source('identity', { WarningCount: 1 }), source('payments', { WarningCount: 1, ErrorCount: 1 })] });
      expect(railItem(f, 'Details').querySelector('.mj-forms-chrome-rail-warning')?.textContent?.trim()).toBe('1');
      expect(railItem(f, 'Payments').querySelector('.mj-forms-chrome-rail-warning')).toBeNull();
      expect(errorBadge(f, 'Payments')?.textContent?.trim()).toBe('1');
    });

    it('rolls a More child\'s failures up onto the More folder', () => {
      const f = renderRail({ sources: [source('audit', { ErrorCount: 1 })] });
      expect(errorBadge(f, 'More')?.textContent?.trim()).toBe('1');
      expect(railItem(f, 'More').classList.contains('has-errors')).toBe(true);
    });

    it('re-reads live counts on the next pass when a section reports a change', () => {
      let errors = 0;
      const live: FormSectionIndicatorSource = {
        SectionKey: 'identity',
        GetSectionIndicators: () => ({ DirtyCount: 0, ErrorCount: errors, WarningCount: 0 }),
        OwnsValidationSource: () => false,
      };
      const f = renderRail({ sources: [live] });
      expect(errorBadge(f, 'Details')).toBeNull();
      errors = 2;
      f.componentRef.injector.get(FormSectionIndicatorCoordinator).NotifyChanged();
      f.detectChanges();
      expect(errorBadge(f, 'Details')?.textContent?.trim()).toBe('2');
    });

    it('keeps a failure no section claims in the form-wide total instead of dropping it', () => {
      const f = renderRail({ sources: [source('identity', {}, ['Name'])], showValidation: true, errors: [failure('Name'), failure('Orphan')] });
      expect(f.componentInstance.UnroutedValidationErrorCount).toBe(1);
      expect(f.componentInstance.FormIndicators.ErrorCount).toBe(1);
      expect(f.nativeElement.querySelector('.mj-forms-chrome-rail-error')).toBeNull();
    });

    it('renders the related-grid row count only when it is non-zero', () => {
      const f = renderComponentFixture(MjRecordFormContainerComponent, {
        imports: CHILD_STUBS,
        declarations: [MjRecordFormContainerComponent],
        inputs: {
          Record: RECORD,
          EntityInfo: { Name: 'Accounts' },
          FormComponent: {
            ...formStub(false, []),
            GetSectionRowCount: (key: string) => (key === 'payments' ? 0 : key === 'audit' ? 3 : undefined),
          } as unknown as BaseFormComponent,
        },
        setup: (_instance, ref) => {
          ref.injector.get(FormChromeCoordinator).Apply(LEFT_NAV_SPEC);
          ref.injector.get(FormChromeCoordinator).MoreExpanded = true;
        },
      });
      expect(railItem(f, 'Payments').querySelector('.mj-forms-chrome-rail-count')).toBeNull();
      expect(railItem(f, 'Details').querySelector('.mj-forms-chrome-rail-count')).toBeNull();
      const audit = railItems(f).find((el) => el.classList.contains('is-more-child'));
      expect(audit?.querySelector('.mj-forms-chrome-rail-count')?.textContent?.trim()).toBe('3');
    });

    it('spine totals cover only sections that are on the rail — a panel the chrome dropped is not counted', () => {
      const f = renderRail({ sources: [source('identity', { ErrorCount: 1 }), source('systemMetadata', { ErrorCount: 2, DirtyCount: 1 })] });
      expect(f.componentInstance.FormIndicators).toEqual({ DirtyCount: 0, ErrorCount: 1, WarningCount: 0 });
      f.componentInstance.OnChromeRailCollapse();
      expect(f.nativeElement.querySelector('.mj-forms-chrome-rail-error.is-spine')?.textContent?.trim()).toBe('1');
    });

    it('shows the whole-form totals on the collapsed rail spine', () => {
      const f = renderRail({ sources: [source('identity', { DirtyCount: 1, ErrorCount: 2 }), source('payments', { ErrorCount: 1 })] });
      f.componentInstance.OnChromeRailCollapse();
      const spine = f.nativeElement.querySelector('.mj-forms-chrome-rail-spine') as HTMLElement | null;
      expect(spine).not.toBeNull();
      expect(spine?.querySelector('.mj-forms-chrome-rail-error.is-spine')?.textContent?.trim()).toBe('3');
      expect(spine?.querySelector('.mj-forms-chrome-rail-error.is-spine')?.getAttribute('title')).toBe('3 fields in this record need attention');
      expect(spine?.querySelector('.mj-forms-chrome-rail-dirty.is-spine')).not.toBeNull();
    });
  });

  // NOTE: the <mj-form-panel-slot> host renders only when the form has resolved sections/panels
  // (data wiring beyond this container's own contract); its own coverage lives in
  // form-panel-slot.component.dom.test.ts. PanelSlotStub is imported only so the template compiles.
});

/**
 * Left-nav chrome classes on the panels in the live DOM (`applyChromeDomVisibility`). The container
 * reaches panels by tag + data attributes precisely so slot-mounted panels (never ContentChildren)
 * get the same hide/show, so plain <mj-collapsible-panel> elements appended to the panels column are
 * the honest fixture here — no projection needed.
 */
describe('MjRecordFormContainerComponent (DOM) — left-nav Details card classes', () => {
  const railSpec = (): FormChromeSpec => ({
    Layout: 'left-nav',
    Groups: [
      { Key: DETAILS_SECTION_KEY, Title: 'Details', Icon: 'fa fa-id-card', SectionKeys: ['identity', 'history', 'physical', 'pinnedGrid'], IsMore: false },
      { Key: 'careLogs', Title: 'Care Logs', Icon: 'fa fa-notes-medical', SectionKeys: ['careLogs'], IsMore: false },
    ],
    RelatedRoles: new Map(),
    MoreSectionKeys: [],
  });

  function setUp(order: Record<string, number>) {
    // Persisting the active group goes through UserInfoEngine; keep it out of the DOM test.
    vi.spyOn(UserInfoEngine.Instance, 'SetSettingDebounced').mockImplementation(() => undefined);
    const form = {
      getSectionDisplayOrder: (key: string) => order[key] ?? 0,
      formContext: {},
      RecordReady: new Subject<void>(),
      RecordRefreshed: new Subject<void>(),
    } as unknown as BaseFormComponent;
    const f = render({ FormComponent: form });
    const column = query(f, '.mj-forms-all-panels') as HTMLElement;
    const add = (key: string, variant: 'default' | 'related-entity') => {
      const el = document.createElement('mj-collapsible-panel');
      el.setAttribute('data-section-key', key);
      el.setAttribute('data-variant', variant);
      column.appendChild(el);
      return el;
    };
    const el = {
      identity: add('identity', 'default'),
      history: add('history', 'default'),
      physical: add('physical', 'default'),
      pinnedGrid: add('pinnedGrid', 'related-entity'),
      careLogs: add('careLogs', 'related-entity'),
    };
    f.debugElement.injector.get(FormChromeCoordinator).Apply(railSpec());
    return { f, el };
  }
  const classes = (e: HTMLElement) => Array.from(e.classList).filter((c) => c.startsWith('mj-chrome') || c.startsWith('mj-form-role')).sort();

  it('marks Details field panels as one card with first/last on the visual edges (display order, not DOM order)', () => {
    const { f, el } = setUp({ identity: 2, history: 0, physical: 1 });
    f.componentInstance.OnChromeGroupActivate(DETAILS_SECTION_KEY);
    expect(classes(el.history)).toEqual(['mj-chrome-details', 'mj-chrome-details-first', 'mj-chrome-show']);
    expect(classes(el.physical)).toEqual(['mj-chrome-details', 'mj-chrome-show']);
    expect(classes(el.identity)).toEqual(['mj-chrome-details', 'mj-chrome-details-last', 'mj-chrome-show']);
    // The other rail item is hidden and carries none of the card classes.
    expect(classes(el.careLogs)).toEqual(['mj-chrome-hidden']);
  });

  it('keeps a related grid pinned into Details outside the card (shown, chrome-less, never an edge)', () => {
    const { f, el } = setUp({});
    f.componentInstance.OnChromeGroupActivate(DETAILS_SECTION_KEY);
    expect(classes(el.pinnedGrid)).toEqual(['mj-chrome-show']);
    // DOM order wins on tied display order, and the grid is skipped when picking the edges.
    expect(el.identity.classList.contains('mj-chrome-details-first')).toBe(true);
    expect(el.physical.classList.contains('mj-chrome-details-last')).toBe(true);
  });

  it('never gives a card edge to a panel that hid itself (section filter / no renderable content)', () => {
    const { f, el } = setUp({ identity: 0, history: 1, physical: 2 });
    // The panel's own host class when IsVisible is false — display: none via the panel CSS.
    el.identity.classList.add('mj-search-hidden');
    f.componentInstance.OnChromeGroupActivate(DETAILS_SECTION_KEY);
    expect(el.identity.classList.contains('mj-chrome-details-first')).toBe(false);
    expect(el.identity.classList.contains('mj-chrome-details-last')).toBe(false);
    // The first VISIBLE segment closes the top of the card instead.
    expect(classes(el.history)).toEqual(['mj-chrome-details', 'mj-chrome-details-first', 'mj-chrome-show']);
    expect(classes(el.physical)).toEqual(['mj-chrome-details', 'mj-chrome-details-last', 'mj-chrome-show']);

    // It comes back when the panel shows again.
    el.identity.classList.remove('mj-search-hidden');
    f.componentInstance.OnChromeGroupActivate(DETAILS_SECTION_KEY);
    expect(el.identity.classList.contains('mj-chrome-details-first')).toBe(true);
    expect(el.history.classList.contains('mj-chrome-details-first')).toBe(false);
  });

  it('moves the card edges when the display order changes, and clears them when Details is not active', () => {
    const order: Record<string, number> = { identity: 0, history: 1, physical: 2 };
    const { f, el } = setUp(order);
    f.componentInstance.OnChromeGroupActivate(DETAILS_SECTION_KEY);
    expect(el.identity.classList.contains('mj-chrome-details-first')).toBe(true);
    expect(el.physical.classList.contains('mj-chrome-details-last')).toBe(true);

    // Reorder: physical now sorts first, identity last.
    order.physical = -1; order.identity = 5;
    f.componentInstance.OnChromeGroupActivate(DETAILS_SECTION_KEY);
    expect(classes(el.physical)).toEqual(['mj-chrome-details', 'mj-chrome-details-first', 'mj-chrome-show']);
    expect(classes(el.identity)).toEqual(['mj-chrome-details', 'mj-chrome-details-last', 'mj-chrome-show']);
    expect(classes(el.history)).toEqual(['mj-chrome-details', 'mj-chrome-show']);

    // Switch to the grid's rail item: Details panels hide and drop every card class.
    f.componentInstance.OnChromeGroupActivate('careLogs');
    expect(classes(el.identity)).toEqual(['mj-chrome-hidden']);
    expect(classes(el.physical)).toEqual(['mj-chrome-hidden']);
    expect(classes(el.careLogs)).toEqual(['mj-chrome-show']);
  });
});
