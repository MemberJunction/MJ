import { describe, it, expect, vi, afterEach } from 'vitest';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { By } from '@angular/platform-browser';
import { CompositeKey, type BaseEntity } from '@memberjunction/core';
import { renderComponentFixture, query, capture } from '@memberjunction/ng-test-utils';
import { MjRecordFormContainerComponent } from './record-form-container.component';
import { FormChromeCoordinator } from '../chrome/form-chrome-coordinator.service';
import { FormCompositionRegistry } from '../chrome/form-composition-registry';
import type { FormCompositionSnapshot } from '../chrome/form-composition-snapshot';
import { DETAILS_SECTION_KEY } from '../chrome/form-chrome';
import type { FormChromeSpec } from '../chrome/form-chrome';
import type { BaseFormComponent } from '../base-form-component';
import { UserInfoEngine } from '@memberjunction/core-entities';
import { Subject } from 'rxjs';
import { FORM_PLACEMENT_PREVIEW, FormPlacementPreview, PLACEMENT_PREVIEW_KEY } from '../panel-slot/placement-preview';
import { ForgetHiddenPanelsSettings } from '../panel-slot/panel-hides';
import type { FormContributionRegistration } from '../panel-slot/form-contribution';
import { InteractiveFormPanelComponent } from '../interactive-form/interactive-form-panel.component';
import { ValidationErrorInfo, ValidationErrorType } from '@memberjunction/global';
import { FormSectionIndicatorCoordinator, type FormSectionIndicatorSource } from '../section-indicators/form-section-indicator-coordinator.service';
import { ParseValidationSource, SumSectionIndicators, type FormSectionIndicators, type ParsedValidationSource } from '../section-indicators/form-section-indicators';
import type { CollectFormContributionRegistrations, CollectFormContributionOptions } from '../panel-slot/collect-form-contribution-registrations';

/** Lets a test answer the collector's call; every other test gets the real collector. */
const collector = vi.hoisted(() => ({
  answer: null as null | ((options: CollectFormContributionOptions | undefined) => FormContributionRegistration[]),
  options: [] as Array<CollectFormContributionOptions | undefined>,
}));
vi.mock('../panel-slot/collect-form-contribution-registrations', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown> & {
    CollectFormContributionRegistrations: typeof CollectFormContributionRegistrations;
  }>();
  return {
    ...actual,
    CollectFormContributionRegistrations: (...args: Parameters<typeof CollectFormContributionRegistrations>) => {
      if (!collector.answer) return actual.CollectFormContributionRegistrations(...args);
      collector.options.push(args[2]);
      return collector.answer(args[2]);
    },
  };
});

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
@Component({ standalone: true, selector: 'mj-panel-manager', template: '' })
class PanelManagerStub {
  @Input() Visible = false;
  @Input() Entity: unknown;
  @Input() Compiled: unknown;
  @Input() StockGrids: unknown;
  @Input() FullCustomForm = false;
  @Input() TitleByKey: unknown;
  @Input() Related: unknown;
  @Input() Provider: unknown;
  @Input() Variants: unknown;
  @Input() CurrentFormID: unknown;
  @Input() RecordKey: unknown;
  @Output() FormChosen = new EventEmitter<string | null>();
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

const CHILD_STUBS = [ToolbarStub, SectionManagerStub, PanelManagerStub, PanelSlotStub, EmptyStateStub, IsaPanelStub, RecordChangesStub, RecordTagsStub, RecordAttachmentsStub, ListMgmtStub, FormContributionsStub];

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
      expect((f.nativeElement.querySelector('[aria-live="polite"]') as HTMLElement).textContent?.trim()).toBe('');
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
      // No GROUP owns it, so no rail item is badged …
      expect(f.nativeElement.querySelector('.mj-forms-chrome-rail-item .mj-forms-chrome-rail-error')).toBeNull();
      // … but the expanded rail still shows it on its own row. Before this row existed the
      // unrouted count reached only the collapsed spine, so an expanded rail sat clean over a
      // form whose save had just been refused.
      const row = f.nativeElement.querySelector('.mj-forms-chrome-rail-unrouted') as HTMLElement | null;
      expect(row).not.toBeNull();
      expect(row?.querySelector('.mj-forms-chrome-rail-error')?.textContent?.trim()).toBe('1');
      expect(row?.getAttribute('title')).toBe('1 problem is not in any section shown here');
    });

    it('renders no unrouted row when every failure has a section', () => {
      const f = renderRail({ sources: [source('identity', { ErrorCount: 1 }, ['Name'])], showValidation: true, errors: [failure('Name')] });
      expect(f.nativeElement.querySelector('.mj-forms-chrome-rail-unrouted')).toBeNull();
      expect(errorBadge(f, 'Details')?.textContent?.trim()).toBe('1');
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

    it('a registered section in no rail group cannot claim a failure — it stays in the whole-form total', () => {
      const f = renderRail({ sources: [source('identity', {}, ['Name']), source('hiddenExtras', {}, ['Code'])], showValidation: true, errors: [failure('Code')] });
      expect(f.componentInstance.UnroutedValidationErrorCount).toBe(1);
      expect(f.componentInstance.FormIndicators.ErrorCount).toBe(1);
    });

    it('announces the whole-form totals through one persistent polite live region, and badges are plain indicators', () => {
      const f = renderRail({ sources: [source('identity', { ErrorCount: 2, DirtyCount: 1 })] });
      const region = f.nativeElement.querySelector('[aria-live="polite"].mj-forms-visually-hidden') as HTMLElement | null;
      expect(region?.textContent?.trim()).toBe('2 fields in this record need attention. 1 unsaved change in this record');
      expect(f.nativeElement.querySelector('[role="status"]')).toBeNull();
      expect(errorBadge(f, 'Details')?.getAttribute('role')).toBe('img');
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

  /**
   * A contribution filed into Details is in no section list, so `getSectionDisplayOrder`
   * answers with the section count — the highest order there is — while the panel lays
   * itself out by its slot band, well above every field section. Taking the order from
   * the form drew the card's top edge under the panel, so the panel read as loose and the
   * fields as a separate card below it.
   */
  it('takes the card edges from the order each panel carries, not from the form section list', () => {
    const { f, el } = setUp({ identity: 0, history: 1, physical: 2 });
    const panel = document.createElement('mj-collapsible-panel');
    panel.setAttribute('data-section-key', 'panel:OrgMemberOverviewPanel');
    panel.setAttribute('data-variant', 'default');
    // before-fields: the band the slot gives it, far above any field section.
    panel.style.order = '-1000000';
    (query(f, '.mj-forms-all-panels') as HTMLElement).appendChild(panel);
    f.debugElement.injector.get(FormChromeCoordinator).Apply({
      Layout: 'left-nav',
      Groups: [
        { Key: DETAILS_SECTION_KEY, Title: 'Details', Icon: 'fa fa-id-card',
          SectionKeys: ['panel:OrgMemberOverviewPanel', 'identity', 'history', 'physical'], IsMore: false },
      ],
      RelatedRoles: new Map(),
      MoreSectionKeys: [],
    });
    f.componentInstance.OnChromeGroupActivate(DETAILS_SECTION_KEY);

    expect(panel.classList.contains('mj-chrome-details-first')).toBe(true);
    expect(panel.classList.contains('mj-chrome-details-last')).toBe(false);
    expect(el.identity.classList.contains('mj-chrome-details-first')).toBe(false);
    expect(el.physical.classList.contains('mj-chrome-details-last')).toBe(true);
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

/**
 * The related-grid fill-in exists to close CodeGen drift: a relationship added after the
 * form was generated has no baked grid, so the container supplies one. A form that renders
 * its own body bakes nothing by design, so every relationship would read as drift and the
 * container would compose grids the author never asked for.
 */
describe('MjRecordFormContainerComponent (DOM) — form that owns its body', () => {
  const withForm = (form: Partial<BaseFormComponent>) => {
    const f = render();
    f.componentInstance.FormComponent = form as BaseFormComponent;
    return f;
  };

  it('turns the related-grid fill-in off', () => {
    expect(withForm({ OwnsEntireFormBody: true }).componentInstance.EffectiveShowRelatedEntities).toBe(false);
  });

  it('leaves the fill-in on for an ordinary form', () => {
    expect(withForm({ OwnsEntireFormBody: false }).componentInstance.EffectiveShowRelatedEntities).toBe(true);
  });

  it('still honours an explicit ShowRelatedEntities: false on an ordinary form', () => {
    const form = { OwnsEntireFormBody: false, Config: { ShowRelatedEntities: false } };
    expect(withForm(form as Partial<BaseFormComponent>).componentInstance.EffectiveShowRelatedEntities).toBe(false);
  });
});

/**
 * A contribution naming a rail TAB's key stands in for that whole tab. A tab is built at
 * render time, so its key matches no panel one-to-one and has to be expanded here. No tab
 * is privileged — Details is one key among the rail's — and the expansion never reaches
 * the other tabs, which is what separates this from replacing the whole form.
 */
describe('MjRecordFormContainerComponent (DOM) — a contribution that replaces a whole tab', () => {
  const hiddenKeys = (f: ReturnType<typeof render>) =>
    (f.componentInstance as unknown as { railTabSectionKeys(): string[] }).railTabSectionKeys();

  it('hides nothing when no contribution claims a tab', () => {
    expect(hiddenKeys(render())).toEqual([]);
  });
});

/**
 * On a form with a side rail, a panel shows only on the tab its key belongs to, and the rail is
 * worked out from the panels on the page. The placement dialog's preview mounts and re-mounts its
 * panel without any of the container's own triggers firing, so the rail has to be worked out again
 * when the preview changes, or the panel belongs to no tab and shows on none.
 */
describe('MjRecordFormContainerComponent (DOM) — the placement preview', () => {
  type Resolving = { resolveChrome(): void };

  it('works out the rail again when the previewed panel changes', () => {
    vi.useFakeTimers();
    // The stub entity cannot be resolved for real; only whether a resolve happens matters here.
    const resolve = vi.spyOn(MjRecordFormContainerComponent.prototype as unknown as Resolving, 'resolveChrome')
      .mockImplementation(() => undefined);
    try {
      const preview = new FormPlacementPreview();
      renderComponentFixture(MjRecordFormContainerComponent, {
        imports: CHILD_STUBS,
        declarations: [MjRecordFormContainerComponent],
        providers: [{ provide: FORM_PLACEMENT_PREVIEW, useValue: preview }],
        inputs: { Record: RECORD, EntityInfo: { Name: 'Accounts' } },
      });
      vi.advanceTimersByTime(10);
      const before = resolve.mock.calls.length;
      preview.Show('Accounts', { presentation: 'panel', title: 'New', slot: 'before-fields' });
      vi.advanceTimersByTime(10);
      expect(resolve.mock.calls.length).toBeGreaterThan(before);
    } finally {
      resolve.mockRestore();
      vi.useRealTimers();
    }
  });

  function renderPreviewForm(spec: FormChromeSpec) {
    const preview = new FormPlacementPreview();
    const f = renderComponentFixture(MjRecordFormContainerComponent, {
      imports: CHILD_STUBS,
      declarations: [MjRecordFormContainerComponent],
      providers: [{ provide: FORM_PLACEMENT_PREVIEW, useValue: preview }],
      inputs: { Record: RECORD, EntityInfo: { Name: 'Accounts' } },
      setup: (_instance, ref) => ref.injector.get(FormChromeCoordinator).Apply(spec),
    });
    return { f, preview, chrome: f.componentRef.injector.get(FormChromeCoordinator) };
  }

  const RAILED: FormChromeSpec = {
    Layout: 'left-nav',
    Groups: [
      { Key: 'details', Title: 'Details', Icon: '', SectionKeys: ['identity', PLACEMENT_PREVIEW_KEY], IsMore: false },
      { Key: 'certifications', Title: 'Certifications', Icon: '', SectionKeys: ['certifications'], IsMore: false },
    ],
    RelatedRoles: new Map(),
    MoreSectionKeys: [],
  };

  it('shows the tab that holds the previewed panel, whatever tab it opened on', () => {
    vi.useFakeTimers();
    const resolve = vi.spyOn(MjRecordFormContainerComponent.prototype as unknown as Resolving, 'resolveChrome')
      .mockImplementation(() => undefined);
    try {
      const { preview, chrome } = renderPreviewForm(RAILED);
      chrome.SetActiveGroup('certifications');
      preview.Show('Accounts', { presentation: 'panel', title: 'New', slot: 'after-fields' });
      vi.advanceTimersByTime(10);
      expect(chrome.ActiveGroupKey).toBe('details');
    } finally {
      resolve.mockRestore();
      vi.useRealTimers();
    }
  });

  // A bare strip draws no collapsible panel, so it is in no tab at all.
  const RAILED_NO_STRIP: FormChromeSpec = {
    ...RAILED,
    Groups: [
      { Key: 'overview', Title: 'Overview', Icon: '', SectionKeys: ['overview'], IsMore: false },
      { Key: 'details', Title: 'Details', Icon: '', SectionKeys: ['identity'], IsMore: false },
      { Key: 'certifications', Title: 'Certifications', Icon: '', SectionKeys: ['certifications'], IsMore: false },
    ],
  };

  it('shows the tab a bare strip that replaces blocks belongs to', () => {
    vi.useFakeTimers();
    const resolve = vi.spyOn(MjRecordFormContainerComponent.prototype as unknown as Resolving, 'resolveChrome')
      .mockImplementation(() => undefined);
    try {
      const { preview, chrome } = renderPreviewForm({
        ...RAILED_NO_STRIP,
        // The rail counts a replacing strip as a member of the replaced blocks' tab.
        Groups: RAILED_NO_STRIP.Groups.map((g) => g.Key === 'details' ? { ...g, SectionKeys: [PLACEMENT_PREVIEW_KEY] } : g),
      });
      chrome.SetActiveGroup('certifications');
      preview.Show('Accounts', { presentation: 'bare', title: 'Hero', slot: 'before-fields', replacesSectionKey: 'identity' });
      vi.advanceTimersByTime(10);
      expect(chrome.ActiveGroupKey).toBe('details');
    } finally {
      resolve.mockRestore();
      vi.useRealTimers();
    }
  });

  it('shows the first tab for a bare strip that replaces nothing, where it sits above everything', () => {
    vi.useFakeTimers();
    const resolve = vi.spyOn(MjRecordFormContainerComponent.prototype as unknown as Resolving, 'resolveChrome')
      .mockImplementation(() => undefined);
    try {
      const { preview, chrome } = renderPreviewForm(RAILED_NO_STRIP);
      chrome.SetActiveGroup('certifications');
      preview.Show('Accounts', { presentation: 'bare', title: 'Hero', slot: 'before-fields' });
      vi.advanceTimersByTime(10);
      expect(chrome.ActiveGroupKey).toBe('overview');
    } finally {
      resolve.mockRestore();
      vi.useRealTimers();
    }
  });
});

/**
 * A bare strip draws no collapsible panel, so the rail cannot see it by the usual marker. One that
 * replaces blocks marks itself with the tab key it belongs to; the container shows it only on that
 * tab, as it does any member.
 */
describe('MjRecordFormContainerComponent (DOM) — a bare strip that replaces blocks', () => {
  const RAILED: FormChromeSpec = {
    Layout: 'left-nav',
    Groups: [
      { Key: 'details', Title: 'Details', Icon: '', SectionKeys: ['hero'], IsMore: false },
      { Key: 'certifications', Title: 'Certifications', Icon: '', SectionKeys: ['certifications'], IsMore: false },
    ],
    RelatedRoles: new Map(),
    MoreSectionKeys: [],
  };

  it('shows the strip only on the tab it belongs to', () => {
    const f = renderComponentFixture(MjRecordFormContainerComponent, {
      imports: CHILD_STUBS,
      declarations: [MjRecordFormContainerComponent],
      inputs: { Record: RECORD, EntityInfo: { Name: 'Accounts' } },
      setup: (_instance, ref) => ref.injector.get(FormChromeCoordinator).Apply(RAILED),
    });
    const strip = document.createElement('div');
    strip.setAttribute('data-bare-section-key', 'hero');
    (f.nativeElement as HTMLElement).appendChild(strip);

    f.componentInstance.OnChromeGroupActivate('certifications');
    expect(strip.style.display).toBe('none');
    f.componentInstance.OnChromeGroupActivate('details');
    expect(strip.style.display).toBe('');
  });
});

/**
 * The container reads the form's contributions through the same collapse the slots use. These
 * drive it with a fixed list and read the rail, count and warning decisions it derives.
 */
describe('MjRecordFormContainerComponent (DOM) — contributions it files and reports', () => {
  type Internals = {
    formContributionRegistrations(): FormContributionRegistration[];
    allChromePanels(): Array<{ SectionKey: string; SectionName: string; Variant: string; ClaimableFields: Array<{ Name: string }> }>;
    contributionSectionKeys(): string[];
    countContributions(): Array<{ SectionKey: string }>;
    warnUnmatchedReplaceKeys(): void;
    warnUnmatchedFieldClaims(): void;
  };
  const internals = (f: ReturnType<typeof render>) => f.componentInstance as unknown as Internals;
  const proto = MjRecordFormContainerComponent.prototype as unknown as Internals;

  const row = (meta: Partial<FormContributionRegistration['Metadata']>): FormContributionRegistration => ({
    Priority: 0, Source: 'metadata', Scope: 'User', RowID: 'row-1', ComponentID: 'comp-1', Presentation: 'panel',
    Metadata: { entity: 'Accounts', slot: 'after-related', ...meta },
  });

  function renderWith(registrations: FormContributionRegistration[]) {
    vi.spyOn(proto, 'formContributionRegistrations').mockReturnValue(registrations);
    vi.spyOn(proto, 'allChromePanels').mockReturnValue([
      { SectionKey: 'identity', SectionName: 'Identity', Variant: 'default', ClaimableFields: [{ Name: 'FirstName' }] },
    ]);
    return render();
  }

  function warnings(run: () => void): string[] {
    const out: string[] = [];
    const warn = vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => { out.push(args.map(String).join(' ')); });
    try { run(); } finally { warn.mockRestore(); }
    return out;
  }

  afterEach(() => vi.restoreAllMocks());

  it('files a related-grid row with no key of its own under the section key its panel draws', () => {
    const claim = row({ relatedEntity: 'Orders', relatedJoinField: 'AccountID' });
    const panel = Object.create(InteractiveFormPanelComponent.prototype) as InteractiveFormPanelComponent;
    panel.Contribution = claim;
    const f = renderWith([claim]);
    expect(internals(f).contributionSectionKeys()).toEqual([panel.SectionKey]);
    expect(internals(f).countContributions().map((c) => c.SectionKey)).toEqual([panel.SectionKey]);
  });

  it('files a compiled grid panel with no key under the section key its template names', () => {
    const compiled: FormContributionRegistration = {
      Priority: 0, Source: 'class',
      Metadata: { entity: 'Accounts', slot: 'after-related', relatedEntity: 'MJ_BizApps_Common: Contact Methods', relatedJoinField: 'AccountID' },
    };
    const f = renderWith([compiled]);
    expect(internals(f).contributionSectionKeys()).toEqual(['contactMethods']);
    expect(internals(f).countContributions().map((c) => c.SectionKey)).toEqual(['contactMethods']);
  });

  it('files the compiled panel, not a row it ties with, for a key both hold', () => {
    const compiled: FormContributionRegistration = {
      Priority: 0, Source: 'class', Metadata: { entity: 'Accounts', slot: 'after-fields', contributionKey: 'summary', inclusion: 'Primary' },
    };
    const tied = row({ contributionKey: 'summary', inclusion: 'None' });
    const f = renderWith([compiled, tied]);
    const inclusion = (f.componentInstance as unknown as { contributionInclusionByKey(): Map<string, string> }).contributionInclusionByKey();
    expect(inclusion.get('summary')).toBe('Primary');
  });

  it('hides a whole tab for the entity\'s own claim on it, and nothing for a wildcard\'s', () => {
    type Tabs = { railTabSectionKeys(): string[] };
    const own = renderWith([row({ contributionKey: 'k', replacesSectionKey: DETAILS_SECTION_KEY })]);
    expect((own.componentInstance as unknown as Tabs).railTabSectionKeys()).toEqual(['identity']);
  });

  it('hides nothing for a wildcard panel that claims a whole tab', () => {
    type Tabs = { railTabSectionKeys(): string[] };
    const wildcard: FormContributionRegistration = {
      Priority: 0, Source: 'class', Metadata: { entity: '*', slot: 'before-fields', contributionKey: 'w', replacesSectionKey: DETAILS_SECTION_KEY },
    };
    const f = renderWith([wildcard]);
    expect((f.componentInstance as unknown as Tabs).railTabSectionKeys()).toEqual([]);
  });

  it('does not warn for a wildcard panel\'s section or field the form lacks', () => {
    const f = renderWith([
      { Priority: 0, Source: 'class', Metadata: { entity: '*', slot: 'after-fields', contributionKey: 'w1', replacesSectionKey: 'ghost' } },
      { Priority: 0, Source: 'class', Metadata: { entity: '*', slot: 'after-fields', contributionKey: 'w2', replacesFieldNames: ['Nope'] } },
      { Priority: 0, Source: 'class', Metadata: { entity: '*', slot: 'after-fields', contributionKey: 'w3', inSectionKey: 'ghost' } },
    ]);
    expect(warnings(() => {
      internals(f).warnUnmatchedReplaceKeys();
      internals(f).warnUnmatchedFieldClaims();
    })).toEqual([]);
  });

  it('does not warn for a claim on a whole rail tab', () => {
    const f = renderWith([row({ contributionKey: 'k', replacesSectionKey: DETAILS_SECTION_KEY })]);
    expect(warnings(() => internals(f).warnUnmatchedReplaceKeys())).toEqual([]);
  });

  it('warns for a section in a claimed list that the form does not draw', () => {
    const f = renderWith([row({ contributionKey: 'k', replacesSectionKeys: ['identity', 'ghost'] })]);
    const out = warnings(() => internals(f).warnUnmatchedReplaceKeys());
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('"ghost"');
  });

  it('does not warn for a panel placed in a section the form draws, whatever fields it names', () => {
    const f = renderWith([row({ contributionKey: 'k', inSectionKey: 'identity', replacesFieldNames: ['Nope'] })]);
    expect(warnings(() => internals(f).warnUnmatchedFieldClaims())).toEqual([]);
  });

  it('warns for a panel placed in a section the form does not draw', () => {
    const f = renderWith([row({ contributionKey: 'k', inSectionKey: 'ghost' })]);
    const out = warnings(() => internals(f).warnUnmatchedFieldClaims());
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('"ghost"');
  });
});

/**
 * The snapshot names the open record in the form `CompositeKey.FromURLSegment` reads, so the
 * placement dialog can preview it. A record not saved yet has no key to name.
 */
describe('MjRecordFormContainerComponent (DOM) — the record the snapshot names', () => {
  type Publishing = { publishCompositionSnapshot(spec: FormChromeSpec): void };
  const SPEC: FormChromeSpec = { Layout: 'accordion', Groups: [], RelatedRoles: new Map(), MoreSectionKeys: [] };

  function publish(record: Partial<BaseEntity>): string | null | undefined {
    const f = render();
    const form = {
      record,
      EntityInfo: { Name: 'Accounts', RelatedEntities: [], ChildEntities: [] },
      OwnsEntireFormBody: true,
      CompositionChanged: { emit: () => undefined },
      CompositionSnapshot: null as { RecordPrimaryKey: string | null } | null,
    };
    f.componentInstance.FormComponent = form as unknown as BaseFormComponent;
    (f.componentInstance as unknown as Publishing).publishCompositionSnapshot(SPEC);
    return form.CompositionSnapshot?.RecordPrimaryKey;
  }

  it('names a saved record by its URL segment', () => {
    const key = CompositeKey.FromKeyValuePair('ID', 'acct-7');
    expect(publish({ IsSaved: true, PrimaryKey: key } as Partial<BaseEntity>)).toBe('ID|acct-7');
  });

  it('lists a compiled panel the user hid, marked hidden, as the apply flow sees it', () => {
    const summary: FormContributionRegistration = {
      Priority: 0, Source: 'class', Title: 'Summary',
      Registration: { Key: 'accounts:summary' } as FormContributionRegistration['Registration'],
      Metadata: { entity: 'Accounts', slot: 'after-fields', contributionKey: 'summary' },
    };
    collector.options = [];
    collector.answer = (options) => (options?.IncludeHidden ? [summary] : []);
    vi.spyOn(UserInfoEngine.Instance, 'GetSetting')
      .mockImplementation((key: string) => (key === 'mj.formPanels.hidden.accounts' ? JSON.stringify(['summary']) : undefined));
    // The hide list is remembered until the settings change; this test changes them behind its back.
    ForgetHiddenPanelsSettings();
    try {
      const f = render();
      const form = {
        record: { IsSaved: true, PrimaryKey: CompositeKey.FromKeyValuePair('ID', 'acct-7') },
        EntityInfo: { Name: 'Accounts', RelatedEntities: [], ChildEntities: [] },
        OwnsEntireFormBody: false,
        CompositionChanged: { emit: () => undefined },
        CompositionSnapshot: null as { Contributions: Array<{ Key: string; Source: string; Hidden: boolean }> } | null,
      };
      f.componentInstance.FormComponent = form as unknown as BaseFormComponent;
      (f.componentInstance as unknown as Publishing).publishCompositionSnapshot(SPEC);
      expect(collector.options.some((options) => options?.IncludeHidden === true)).toBe(true);
      expect(form.CompositionSnapshot?.Contributions).toEqual([
        expect.objectContaining({ Key: 'summary', Source: 'class', Hidden: true }),
      ]);
    } finally {
      collector.answer = null;
      vi.restoreAllMocks();
    }
  });

  it('names no record for one not saved yet', () => {
    const key = CompositeKey.FromKeyValuePair('ID', 'generated-uuid');
    expect(publish({ IsSaved: false, PrimaryKey: key } as Partial<BaseEntity>)).toBeNull();
  });
});

/**
 * The snapshot lists every section, so a section a contribution or the form's config hides reads
 * as hidden rather than absent. It is published only when it changed, and into the registry the
 * apply flow reads, which forgets it when the form goes away.
 */
describe('MjRecordFormContainerComponent (DOM) — publishing the composition', () => {
  type Publishing = { publishCompositionSnapshot(spec: FormChromeSpec): void };
  const SPEC: FormChromeSpec = { Layout: 'accordion', Groups: [], RelatedRoles: new Map(), MoreSectionKeys: [] };

  function fakeForm(over: Record<string, unknown> = {}) {
    const emitted: FormCompositionSnapshot[] = [];
    const form = {
      record: { IsSaved: true, PrimaryKey: CompositeKey.FromKeyValuePair('ID', 'acct-7') },
      EntityInfo: { Name: 'Accounts', RelatedEntities: [], ChildEntities: [] },
      OwnsEntireFormBody: false,
      CompositionChanged: { emit: (snapshot: FormCompositionSnapshot) => { emitted.push(snapshot); } },
      CompositionSnapshot: null as FormCompositionSnapshot | null,
      ...over,
    };
    return { form, emitted };
  }

  /** Adds sections the way a generated form draws them. */
  function addSections(f: ReturnType<typeof render>, keys: string[]): void {
    for (const key of keys) {
      const el = document.createElement('mj-collapsible-panel');
      el.setAttribute('data-section-key', key);
      f.nativeElement.appendChild(el);
    }
  }

  const publish = (f: ReturnType<typeof render>) => (f.componentInstance as unknown as Publishing).publishCompositionSnapshot(SPEC);

  it('lists a section the form hides, marked hidden', () => {
    const f = render();
    addSections(f, ['details', 'notes']);
    const { form } = fakeForm({ formContext: { hiddenSectionKeys: ['notes'] } });
    f.componentInstance.FormComponent = form as unknown as BaseFormComponent;
    publish(f);
    expect(form.CompositionSnapshot?.Sections.map((s) => [s.Key, s.Hidden])).toEqual([['details', false], ['notes', true]]);
  });

  it('says which form the user sees', () => {
    const f = render();
    const { form } = fakeForm();
    f.componentInstance.FormComponent = form as unknown as BaseFormComponent;
    publish(f);
    expect(form.CompositionSnapshot?.FormChoice).toEqual({ FullCustomForm: false, OverrideID: null, Label: 'Default form' });
  });

  it('does not publish a snapshot equal to the last one', () => {
    const f = render();
    addSections(f, ['details']);
    const { form, emitted } = fakeForm();
    f.componentInstance.FormComponent = form as unknown as BaseFormComponent;
    publish(f);
    publish(f);
    expect(emitted).toHaveLength(1);
    addSections(f, ['notes']);
    publish(f);
    expect(emitted).toHaveLength(2);
  });

  it('registers the snapshot for the apply flow, and forgets it when the form goes away', () => {
    const f = render();
    const registry = f.debugElement.injector.get(FormCompositionRegistry);
    const { form } = fakeForm();
    f.componentInstance.FormComponent = form as unknown as BaseFormComponent;
    publish(f);
    expect(registry.Get('Accounts', 'ID|acct-7')).toBe(form.CompositionSnapshot);
    f.destroy();
    expect(registry.Get('Accounts', 'ID|acct-7')).toBeNull();
  });
});

/**
 * A count or chrome-rule result can land after the form is closed. It must not schedule a chrome
 * pass on a destroyed container or draw it.
 */
describe('MjRecordFormContainerComponent (DOM) — after the form is closed', () => {
  type Internals = { scheduleChromeResolve(): void; chromeResolveTimer: unknown; countRequestToken: number; chromeRulesForEntityId: string | null };

  it('schedules no chrome pass and drops results still in flight', () => {
    const f = render();
    const inst = f.componentInstance as unknown as Internals;
    inst.chromeRulesForEntityId = 'entity-1';
    const token = inst.countRequestToken;
    f.destroy();
    inst.scheduleChromeResolve();
    expect(inst.chromeResolveTimer).toBeNull();
    expect(inst.countRequestToken).not.toBe(token);
    expect(inst.chromeRulesForEntityId).toBeNull();
  });
});
