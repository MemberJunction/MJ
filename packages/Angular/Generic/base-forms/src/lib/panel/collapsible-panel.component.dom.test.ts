import { By } from '@angular/platform-browser';
import { describe, it, expect, vi } from 'vitest';
import { Subject, of } from 'rxjs';
import { CommonModule } from '@angular/common';
import { Component, ElementRef, EventEmitter, Input, inject, type OnChanges } from '@angular/core';
import { renderComponentFixture, query, text, hasClass } from '@memberjunction/ng-test-utils';
import { CompositeKey } from '@memberjunction/core';
import { ValidationErrorInfo } from '@memberjunction/global';
import { MjCollapsiblePanelComponent } from './collapsible-panel.component';
import type { MjFormFieldComponent } from '../field/form-field.component';
import { FormChromeCoordinator } from '../chrome/form-chrome-coordinator.service';
import { FormSectionIndicatorCoordinator } from '../section-indicators/form-section-indicator-coordinator.service';
import { FORM_SECTION_FIELD_HOST, type FormSectionFieldHost } from '../section-indicators/form-section-field-host';
import { ParseValidationSource } from '../section-indicators/form-section-indicators';
import type { FormNavigationEvent } from '../types/navigation-events';
import type { FormContext } from '../types/form-types';

/**
 * DOM-level spec for <mj-collapsible-panel> — the form-section card with three
 * visual variants (default / related-entity / inherited), a row-count badge, an
 * "Inherited from X" badge, and a collapse chevron whose presence is driven by
 * FormContext.collapsibleSections. Expand/Toggle state is DELEGATED to a parent
 * `Form` object, so tests pass a small stub exposing the methods the template
 * reads. The component declares @ContentChildren(MjFormFieldComponent) but we
 * project no fields here — the empty QueryList is the valid header-only case.
 */

/** Minimal stub of the parent form contract the panel delegates expand/collapse to. */
function formStub(expanded: boolean) {
  return {
    IsSectionExpanded: () => expanded,
    SetSectionExpanded: vi.fn(),
    getSectionDisplayOrder: () => 0,
  };
}

/**
 * Duck-typed stand-in for the @ContentChildren QueryList of mj-form-field children. The panel
 * reads `length`, `forEach`, `toArray()`, `some()` and `changes` off the list, and each child's
 * `Navigate` / `DisplayName` / `IsFieldReadableByUser` / `ShouldHideField` — that is the whole
 * contract, and projecting real form-field components would drag their entire dependency graph
 * in for a visibility assertion.
 *
 * `ShouldHideField` mirrors the real component: a field the user cannot read reports itself
 * hidden WITHOUT reading its value, because BaseEntity.Get() throws for a denied field and
 * hasRenderableContent() sweeps this property on every change-detection cycle.
 */
function fieldChildren(readable: boolean[]) {
  // `Navigate` and `ValueChange` are both stubbed because `ngAfterContentInit` subscribes to
  // every projected field's outputs. They are irrelevant to what these tests assert, but a
  // missing one is not inert — it throws inside content-init, before any assertion runs.
  const items = readable.map((r, i) => ({
    DisplayName: `Field ${i}`,
    IsFieldReadableByUser: r,
    ShouldHideField: !r,
    Navigate: of(),
    ValueChange: of(),
  }));
  return {
    length: items.length,
    toArray: () => items,
    forEach: (fn: (item: unknown) => void) => items.forEach(fn),
    some: (fn: (item: unknown) => boolean) => items.some(fn),
    changes: new Subject(),
  };
}

function render(inputs: Record<string, unknown>) {
  return renderComponentFixture(MjCollapsiblePanelComponent, {
    declarations: [MjCollapsiblePanelComponent],
    imports: [CommonModule],
    inputs,
  });
}

describe('MjCollapsiblePanelComponent — field-level security', () => {
  /** Render, attach the projected-field stub, then run the content-init pass that reads it. */
  function renderWithFields(readable: boolean[]) {
    const f = render({ SectionName: 'Compensation', SectionKey: 'comp', Form: formStub(true) });
    (f.componentInstance as unknown as { FieldComponents: unknown }).FieldComponents = fieldChildren(readable);
    f.componentInstance.ngAfterContentInit();
    f.detectChanges();
    return f;
  }

  it('hides a section whose every field is denied — an empty card reads as a broken screen', () => {
    const f = renderWithFields([false, false]);
    expect(f.componentInstance.IsVisible).toBe(false);
  });

  it('keeps a section with at least one readable field', () => {
    const f = renderWithFields([false, true]);
    expect(f.componentInstance.IsVisible).toBe(true);
  });

  it('keeps a section that projects NO fields at all', () => {
    // Related-entity grids, IS-A cards and slot-injected panels legitimately have no
    // mj-form-field children. "No fields" and "no readable fields" are different states.
    const f = renderWithFields([]);
    expect(f.componentInstance.IsVisible).toBe(true);
  });
});

describe('MjCollapsiblePanelComponent (DOM)', () => {
  it('renders the section name (DisplayName) and the data-section-key attribute', () => {
    const f = render({ SectionName: 'Product Details', SectionKey: 'prod', Form: formStub(true) });
    expect(text(f, '.mj-forms-panel-title span')).toBe('Product Details');
    expect(query(f, '.mj-forms-panel')?.getAttribute('data-section-key')).toBe('prod');
  });

  it('applies the related-entity variant class', () => {
    const f = render({ SectionName: 'Orders', Variant: 'related-entity', Form: formStub(true) });
    expect(hasClass(f, '.mj-forms-panel', 'mj-forms-panel--related')).toBe(true);
    expect(hasClass(f, '.mj-forms-panel', 'mj-forms-panel--inherited')).toBe(false);
  });

  it('does not pin a persisted pixel height when left-nav hides accordion chrome', () => {
    const form = {
      ...formStub(true),
      GetSectionPanelHeight: () => 48,
    };
    const f = renderComponentFixture(MjCollapsiblePanelComponent, {
      declarations: [MjCollapsiblePanelComponent],
      imports: [CommonModule],
      providers: [{
        provide: FormChromeCoordinator,
        useValue: {
          HidesAccordionChrome: () => true,
          IsRelatedSectionVisible: () => true,
          IsFirstClassSectionVisible: () => true,
          Spec: { RelatedRoles: new Map() },
          Changes: new Subject<void>(),
        },
      }],
      inputs: {
        SectionName: 'Payments',
        SectionKey: 'payments',
        Variant: 'related-entity',
        Form: form,
      },
    });
    const content = query(f, '.mj-forms-panel-content') as HTMLElement;
    expect(content.style.height).toBe('');
  });

  it('does not pin a toolbar-only persisted height in accordion', () => {
    const form = {
      ...formStub(true),
      GetSectionPanelHeight: () => 52,
    };
    const f = render({
      SectionName: 'Products',
      SectionKey: 'products',
      Variant: 'related-entity',
      Form: form,
    });
    const content = query(f, '.mj-forms-panel-content') as HTMLElement;
    expect(content.style.height).toBe('');
  });

  it('honors a user-resized accordion height at or above the min', () => {
    const form = {
      ...formStub(true),
      GetSectionPanelHeight: () => 240,
    };
    const f = render({
      SectionName: 'Products',
      SectionKey: 'products',
      Variant: 'related-entity',
      Form: form,
    });
    const content = query(f, '.mj-forms-panel-content') as HTMLElement;
    expect(content.style.height).toBe('240px');
  });

  it('does not pin a persisted pixel height when the host has mj-chrome-show', () => {
    const form = {
      ...formStub(true),
      GetSectionPanelHeight: () => 48,
    };
    const f = renderComponentFixture(MjCollapsiblePanelComponent, {
      declarations: [MjCollapsiblePanelComponent],
      imports: [CommonModule],
      inputs: {
        SectionName: 'Payments',
        SectionKey: 'payments',
        Variant: 'related-entity',
        Form: form,
      },
      setup: (_c, ref) => {
        ref.location.nativeElement.classList.add('mj-chrome-show');
      },
    });
    const content = query(f, '.mj-forms-panel-content') as HTMLElement;
    expect(content.style.height).toBe('');
  });

  it('applies the inherited variant class', () => {
    const f = render({ SectionName: 'Base', Variant: 'inherited', Form: formStub(true) });
    expect(hasClass(f, '.mj-forms-panel', 'mj-forms-panel--inherited')).toBe(true);
  });

  it('MatchesSearch hits section name, key, and field names without requiring chrome visibility', () => {
    const f = render({ SectionName: 'Orders', SectionKey: 'orders', Form: formStub(false) });
    const panel = f.componentInstance;
    expect(panel.MatchesSearch('ord')).toBe(true);
    expect(panel.MatchesSearch('orders')).toBe(true);
    expect(panel.MatchesSearch('xyz')).toBe(false);
    panel.FieldNames = 'order date total gross';
    expect(panel.MatchesSearch('gross')).toBe(true);
  });

  it('omits the row-count badge when BadgeCount is undefined', () => {
    const none = render({ SectionName: 'X', Form: formStub(true) });
    expect(query(none, '.mj-forms-row-count-badge')).toBeNull();
  });

  it('renders the row-count badge value with no zero-modifier for a positive count', () => {
    const five = render({ SectionName: 'X', BadgeCount: 5, Form: formStub(true) });
    expect(text(five, '.mj-forms-row-count-badge')).toBe('5');
    expect(hasClass(five, '.mj-forms-row-count-badge', 'mj-forms-row-count-badge--zero')).toBe(false);
  });

  it('applies the zero-modifier on the row-count badge at count 0', () => {
    const zero = render({ SectionName: 'X', BadgeCount: 0, Form: formStub(true) });
    expect(hasClass(zero, '.mj-forms-row-count-badge', 'mj-forms-row-count-badge--zero')).toBe(true);
  });

  it('omits the "Inherited from X" badge for non-inherited variants', () => {
    const noBadge = render({ SectionName: 'X', Variant: 'default', InheritedFromEntity: 'Products', Form: formStub(true) });
    expect(query(noBadge, '.mj-forms-inherited-badge')).toBeNull();
  });

  it('renders the "Inherited from X" badge for the inherited variant with an entity set', () => {
    const withBadge = render({ SectionName: 'X', Variant: 'inherited', InheritedFromEntity: 'Products', Form: formStub(true) });
    expect(text(withBadge, '.mj-forms-inherited-badge')).toContain('Inherited from Products');
  });

  it('emits Navigate (Direction=parent) when the inherited badge is clicked', () => {
    const events: FormNavigationEvent[] = [];
    const pk = new CompositeKey([{ FieldName: 'ID', Value: '123' }]);
    const f = renderComponentFixture(MjCollapsiblePanelComponent, {
      declarations: [MjCollapsiblePanelComponent],
      imports: [CommonModule],
      inputs: { SectionName: 'X', Variant: 'inherited', InheritedFromEntity: 'Products', InheritedRecordPrimaryKey: pk, Form: formStub(true) },
      setup: (c) => c.Navigate.subscribe((e: FormNavigationEvent) => events.push(e)),
    });
    (query(f, '.mj-forms-inherited-badge') as HTMLElement).click();
    expect(events.length).toBe(1);
    expect(events[0].Kind).toBe('entity-hierarchy');
    // EntityName/Direction live on the entity-hierarchy variant of the FormNavigationEvent union;
    // narrow via a cast (same pattern as Direction below) rather than widening the event type.
    expect((events[0] as { EntityName: string }).EntityName).toBe('Products');
    expect((events[0] as { Direction: string }).Direction).toBe('parent');
  });

  it('shows the chevron and is collapsible by default; up-chevron when expanded', () => {
    const f = render({ SectionName: 'X', Form: formStub(true) });
    expect(query(f, '.mj-forms-panel-chevron')).not.toBeNull();
    expect(query(f, '.mj-forms-panel-chevron i')?.className).toContain('fa-chevron-up');
  });

  it('shows a down-chevron when the form reports the section collapsed', () => {
    const f = render({ SectionName: 'X', Form: formStub(false) });
    expect(query(f, '.mj-forms-panel-chevron i')?.className).toContain('fa-chevron-down');
  });

  it('hides the chevron and marks the header static when collapsibleSections is false', () => {
    const ctx: FormContext = { collapsibleSections: false };
    const f = render({ SectionName: 'X', FormContext: ctx, Form: formStub(true) });
    expect(query(f, '.mj-forms-panel-chevron')).toBeNull();
    expect(hasClass(f, '.mj-forms-panel-header', 'mj-forms-panel-header--static')).toBe(true);
  });

  it('shows the drag handle by default', () => {
    const withHandle = render({ SectionName: 'X', Form: formStub(true) });
    expect(query(withHandle, '.mj-forms-drag-handle')).not.toBeNull();
  });

  it('hides the drag handle when reorder is disabled via FormContext', () => {
    const ctx: FormContext = { allowSectionReorder: false };
    const noHandle = render({ SectionName: 'X', FormContext: ctx, Form: formStub(true) });
    expect(query(noHandle, '.mj-forms-drag-handle')).toBeNull();
  });

  it('calls the form delegate SetSectionExpanded when the header is clicked', () => {
    const stub = formStub(false);
    const f = render({ SectionName: 'X', SectionKey: 'k', Form: stub });
    (query(f, '.mj-forms-panel-header') as HTMLElement).click();
    expect(stub.SetSectionExpanded).toHaveBeenCalledWith('k', true);
  });
});


/**
 * A panel's flex order decides where it lands. Three sources can answer: the user's own
 * placement, an `Order` its host supplied (a contribution derives one from its slot),
 * and the form's declared section list. Taking the host's answer first meant a user
 * could drag a contribution panel, a new order would be written, nothing would read it,
 * and the panel would sit exactly where it was.
 */
describe('MjCollapsiblePanelComponent — where a panel sits', () => {
  const form = (over: Record<string, unknown> = {}) => ({
    ...formStub(true),
    getSectionDisplayOrder: (key: string) => (key === 'known' ? 2 : 9),
    getSectionOrderIndex: (_key: string): number | null => null,
    ...over,
  });

  it('uses the order its host supplied when the user has placed nothing', () => {
    const f = render({ SectionKey: 'skip:stats', Order: -1000000, Form: form() });
    expect(f.componentInstance.CssOrder).toBe(-1000000);
  });

  it('lets the user’s own placement win over the host’s order', () => {
    const f = render({
      SectionKey: 'skip:stats',
      Order: -1000000,
      Form: form({ getSectionOrderIndex: (k: string) => (k === 'skip:stats' ? 1 : null) }),
    });
    expect(f.componentInstance.CssOrder).toBe(1);
  });

  it('falls back to the form’s section order when neither applies', () => {
    const f = render({ SectionKey: 'known', Form: form() });
    expect(f.componentInstance.CssOrder).toBe(2);
  });

  it('works against a form that predates the index lookup', () => {
    const f = render({ SectionKey: 'known', Form: formStub(true) });
    expect(f.componentInstance.CssOrder).toBe(0);
  });
});

/**
 * Reordering works on the panels that are drawn, not on the form's declared sections. A
 * contribution panel is in no declared list, so a drag touching one used to match no
 * index and return having done nothing.
 */
describe('MjCollapsiblePanelComponent — dragging a panel that is not a declared section', () => {
  function setUp(declared: string[], drawn: Array<{ key: string; order: number }>) {
    const setSectionOrder = vi.fn();
    const f = render({
      SectionKey: 'skip:stats',
      Form: { ...formStub(true), getSectionOrder: () => declared, setSectionOrder },
    });
    // The real column holds baked panels and slot-wrapped contribution panels alike,
    // so the lookup is over descendants; the contribution here is nested to match.
    const host = f.nativeElement as HTMLElement;
    const column = document.createElement('div');
    column.className = 'mj-forms-all-panels';
    document.body.appendChild(column);
    const slot = document.createElement('mj-form-panel-slot');
    column.appendChild(slot);
    slot.appendChild(host);
    host.setAttribute('data-section-key', 'skip:stats');
    for (const panel of drawn) {
      const el = document.createElement('mj-collapsible-panel');
      el.setAttribute('data-section-key', panel.key);
      el.style.order = String(panel.order);
      column.appendChild(el);
    }
    return { f, setSectionOrder };
  }

  const reorder = (f: ReturnType<typeof render>, from: string, to: string) =>
    (f.componentInstance as unknown as { reorderSections(a: string, b: string): void })
      .reorderSections(from, to);

  it('moves a contribution panel into the declared sections', () => {
    const { f, setSectionOrder } = setUp(
      ['certificationDetails', 'configuration'],
      [{ key: 'certificationDetails', order: 0 }, { key: 'configuration', order: 1 }],
    );
    (f.nativeElement as HTMLElement).style.order = '1000000';
    reorder(f, 'skip:stats', 'configuration');
    expect(setSectionOrder).toHaveBeenCalledWith(['certificationDetails', 'skip:stats', 'configuration']);
  });

  // Dropping downward lands after the target: the target index is taken before the
  // source is lifted out. That is the existing behaviour for any two panels.
  it('moves a declared section past a contribution panel', () => {
    const { f, setSectionOrder } = setUp(
      ['certificationDetails', 'configuration'],
      [{ key: 'certificationDetails', order: 0 }, { key: 'configuration', order: 1 }],
    );
    (f.nativeElement as HTMLElement).style.order = '1000000';
    reorder(f, 'certificationDetails', 'skip:stats');
    expect(setSectionOrder).toHaveBeenCalledWith(['configuration', 'skip:stats', 'certificationDetails']);
  });

  // A section the form declares but does not currently draw must not fall out of the order.
  it('keeps a declared section the DOM did not show', () => {
    const { f, setSectionOrder } = setUp(
      ['certificationDetails', 'configuration', 'systemMetadata'],
      [{ key: 'certificationDetails', order: 0 }, { key: 'configuration', order: 1 }],
    );
    (f.nativeElement as HTMLElement).style.order = '1000000';
    reorder(f, 'skip:stats', 'certificationDetails');
    expect(setSectionOrder.mock.calls[0][0]).toContain('systemMetadata');
  });
});

/**
 * A contribution can stand in for one field rather than a whole section. The panel then
 * belongs INSIDE the section that held the field, at the top — so the section, which is
 * the only thing that knows which fields it draws, is what hosts it.
 */
@Component({ standalone: true, selector: 'mj-form-field-panel-slot', template: '' })
class FieldPanelSlotStub {
  @Input() Entity = '';
  @Input() FieldNames: readonly string[] = [];
  @Input() SectionKey = '';
  @Input() Position: 'start' | 'end' = 'start';
  @Input() Record: unknown;
  @Input() FormComponent: unknown;
  @Input() FormContext: unknown;
}

/** A projected field, as the panel reads one: a name, a label, and inert outputs. */
function namedFields(names: string[]) {
  const items = names.map((name) => ({
    FieldName: name,
    HostFieldLabel: `${name} label`,
    DisplayName: name,
    IsFieldReadableByUser: true,
    ShouldHideField: false,
    Navigate: of(),
    ValueChange: of(),
  }));
  return {
    length: items.length,
    toArray: () => items,
    forEach: (fn: (item: unknown) => void) => items.forEach(fn),
    some: (fn: (item: unknown) => boolean) => items.some(fn),
    changes: new Subject(),
  };
}

describe('MjCollapsiblePanelComponent — hosting a panel that stands in for a field', () => {
  function renderWithFields(fields: string[], form: unknown) {
    const f = renderComponentFixture(MjCollapsiblePanelComponent, {
      declarations: [MjCollapsiblePanelComponent],
      imports: [CommonModule, FieldPanelSlotStub],
      inputs: { SectionKey: 'details', SectionName: 'Details', Form: form },
    });
    (f.componentInstance as unknown as { FieldComponents: unknown }).FieldComponents = namedFields(fields);
    f.componentInstance.ngAfterContentInit();
    f.detectChanges();
    return f;
  }

  const formWithRecord = {
    ...formStub(true),
    record: { EntityInfo: { Name: 'MoreCheese: Courses' } },
  };

  it('names the fields it draws, so a claim can be matched against them', () => {
    const f = renderWithFields(['Name', 'SeatLimit'], formWithRecord);
    expect(f.componentInstance.ClaimableFieldNames).toEqual(['Name', 'SeatLimit']);
    expect(f.componentInstance.ClaimableFields[0]).toEqual({ Name: 'Name', Label: 'Name label' });
  });

  it('renders the host above its own content, so the panel lands at the top', () => {
    const f = renderWithFields(['Name'], formWithRecord);
    const content = query(f, '.mj-forms-panel-content');
    expect(content?.firstElementChild?.tagName.toLowerCase()).toBe('mj-form-field-panel-slot');
  });

  it('renders a second host below its content, for a panel placed at the end of the section', () => {
    const f = renderWithFields(['Name'], formWithRecord);
    const content = query(f, '.mj-forms-panel-content')!;
    const hosts = Array.from(content.querySelectorAll('mj-form-field-panel-slot'));
    expect(hosts.length).toBe(2);
    expect(content.lastElementChild?.tagName.toLowerCase()).toBe('mj-form-field-panel-slot');
    const stubs = f.debugElement.queryAll(By.directive(FieldPanelSlotStub)).map((d) => d.componentInstance as FieldPanelSlotStub);
    expect(stubs.map((s) => [s.SectionKey, s.Position])).toEqual([['details', 'start'], ['details', 'end']]);
  });

  it('passes the entity and the fields down', () => {
    const f = renderWithFields(['Name'], formWithRecord);
    const slot = query(f, 'mj-form-field-panel-slot');
    expect(slot).not.toBeNull();
    expect(f.componentInstance.FieldPanelEntity).toBe('MoreCheese: Courses');
  });

  it('renders no host when the panel draws no fields', () => {
    const f = renderWithFields([], formWithRecord);
    expect(query(f, 'mj-form-field-panel-slot')).toBeNull();
  });

  it('renders no host outside a form, where there is no record to hand it', () => {
    const f = renderWithFields(['Name'], formStub(true));
    expect(f.componentInstance.HostsFieldPanels).toBe(false);
    expect(query(f, 'mj-form-field-panel-slot')).toBeNull();
  });
});

/**
 * golive #255 — the panel's field set is the union of its content query and the fields that
 * reach it through {@link FORM_SECTION_FIELD_HOST}.
 *
 * A field declared inside a widget component's OWN template, with the widget projected into the
 * panel, is behind a view boundary the content query cannot cross. The Accounting section of the
 * Product form was exactly that: four required fields the section could not see, so it reported
 * no required-and-empty count before a save and owned none of the field errors after the failed
 * one, and the rail never badged it. The injector does cross that boundary.
 *
 * The field here is a duck-typed stand-in registered through the token, not a real
 * `mj-form-field`: the panel reads `EditMode`, `IsFieldReadOnly`, `IsRequiredEmpty`, `ShowErrors`,
 * `IsDirty`, `FieldName`, `DisplayName`, `ShouldHideField`, `IsFieldReadableByUser`, `ValueChange`
 * and `HostElement` off it, and that is the whole contract. The REAL field's side — that it
 * registers on construction and withdraws on destroy — is pinned in form-field.component.dom.test.ts.
 */
@Component({
  standalone: true,
  selector: 'test-hosted-field',
  template: '<span class="hosted-field">{{ FieldName }}</span>',
})
class HostedFieldStub implements OnChanges {
  @Input() FieldName = '';
  /** Bound by the widget AFTER the panel is first evaluated — exactly like the real field's inputs. */
  @Input() EditMode = false;
  @Input() Value: unknown = null;
  @Input() IsDirty = false;
  IsFieldReadOnly = false;
  ShowErrors = false;
  ShowWarnings = false;
  StoredDateIsUnreadable = false;
  IsFieldReadableByUser = true;
  /** False until ngOnChanges, mirroring MjFormFieldComponent.InputsBound. */
  InputsBound = false;
  ValueChange = new EventEmitter<unknown>();
  Navigate = new EventEmitter<FormNavigationEvent>();
  get DisplayName(): string {
    return this.FieldName;
  }
  private get isEmpty(): boolean {
    return this.Value === null || this.Value === undefined || this.Value === '';
  }
  /** The real rule: a required field, in edit mode, with nothing in it. */
  get IsRequiredEmpty(): boolean {
    return this.EditMode && this.isEmpty;
  }
  /** The real rule: hidden only in read mode when empty. Before inputs bind this is TRUE. */
  get ShouldHideField(): boolean {
    return !this.EditMode && this.isEmpty;
  }
  private readonly host = inject(FORM_SECTION_FIELD_HOST, { optional: true });
  private readonly el = inject(ElementRef<HTMLElement>);
  get HostElement(): HTMLElement {
    return this.el.nativeElement;
  }
  constructor() {
    this.host?.RegisterField(this as unknown as MjFormFieldComponent);
  }
  ngOnChanges(): void {
    this.InputsBound = true;
    this.host?.NotifyFieldChanged(this as unknown as MjFormFieldComponent);
  }
}

/** A widget with its own view: the boundary a content query stops at. */
@Component({
  standalone: true,
  selector: 'test-widget',
  imports: [HostedFieldStub],
  template: `
    <div class="widget-shell">
      <test-hosted-field FieldName="CompanyID" [EditMode]="EditMode" [Value]="Value"></test-hosted-field>
      <test-hosted-field FieldName="RevenueRecognitionTypeID" [EditMode]="EditMode" [Value]="Value"></test-hosted-field>
    </div>
  `,
})
class WidgetStub {
  @Input() EditMode = false;
  @Input() Value: unknown = null;
}

@Component({
  standalone: false,
  selector: 'test-form-with-widget-section',
  template: `
    <mj-collapsible-panel SectionKey="accounting" SectionName="Accounting" [Form]="Form">
      <test-widget [EditMode]="EditMode" [Value]="Value"></test-widget>
    </mj-collapsible-panel>
  `,
})
class FormWithWidgetSection {
  Form = formStub(true);
  /** Inputs so a test can flip them through `setInput`, which marks the view dirty for the zoneless TestBed. */
  @Input() EditMode = true;
  @Input() Value: unknown = null;
}

describe('MjCollapsiblePanelComponent — fields behind a component view boundary', () => {
  function renderWidgetSection(inputs: { EditMode?: boolean; Value?: unknown } = {}) {
    const f = renderComponentFixture(FormWithWidgetSection, {
      declarations: [FormWithWidgetSection, MjCollapsiblePanelComponent],
      imports: [CommonModule, WidgetStub],
      providers: [FormSectionIndicatorCoordinator],
      inputs,
    });
    const panel = f.debugElement.children[0].componentInstance as MjCollapsiblePanelComponent;
    return { f, panel };
  }

  it('counts a required-and-empty field the content query cannot see', () => {
    const { f, panel } = renderWidgetSection();
    // The content query genuinely sees nothing — that is the situation being fixed.
    expect(panel.FieldComponents.length).toBe(0);
    expect(panel.SectionIndicators.ErrorCount).toBe(2);
    expect(query(f, 'mj-collapsible-panel')?.getAttribute('data-error-count')).toBe('2');
    expect(hasClass(f, 'mj-collapsible-panel', 'mj-panel-has-errors')).toBe(true);
  });

  it('owns the field-named validation errors a failed save publishes for those fields', () => {
    const { panel } = renderWidgetSection();
    expect(panel.OwnsValidationSource(ParseValidationSource('CompanyID'))).toBe(true);
    expect(panel.OwnsValidationSource(ParseValidationSource('RevenueRecognitionTypeID'))).toBe(true);
    expect(panel.OwnsValidationSource(ParseValidationSource('SKU'))).toBe(false);
  });

  it('reports through the coordinator the rail reads, so the group badge follows', () => {
    const { f } = renderWidgetSection();
    const coordinator = f.debugElement.injector.get(FormSectionIndicatorCoordinator);
    expect(coordinator.IndicatorsFor('accounting').ErrorCount).toBe(2);
    const orphan = new ValidationErrorInfo('CompanyID', 'Company cannot be null', null);
    expect(coordinator.UnroutedValidationErrors([orphan])).toEqual([]);
  });

  it('clears once the fields are filled, on the same pass', () => {
    // The widget's view refreshes AFTER the panel's host bindings and the rail. Without the
    // field's NotifyFieldChanged this pass would end with the section still counting 2 and, in
    // dev mode, an ExpressionChangedAfterItHasBeenChecked error on data-error-count.
    const { f, panel } = renderWidgetSection();
    f.componentRef.setInput('Value', 'filled');
    f.detectChanges();
    expect(panel.SectionIndicators.ErrorCount).toBe(0);
    expect(query(f, 'mj-collapsible-panel')?.getAttribute('data-error-count')).toBe('0');
    expect(hasClass(f, 'mj-collapsible-panel', 'mj-panel-has-errors')).toBe(false);
  });

  it('finds hosted fields by name in section search, and does not hide a section that has them', () => {
    const { panel } = renderWidgetSection();
    expect(panel.MatchesSearch('revenue')).toBe(true);
    expect(panel.IsVisible).toBe(true);
  });

  /**
   * Review finding on this change: the panel first evaluates hide-when-empty in
   * `ngAfterContentInit`, BEFORE a widget's view has bound its fields' inputs. An unbound field
   * reports itself hidden (read mode, empty), so a section whose fields all sit behind the
   * boundary latched `IsVisible = false` and never recovered. Two rules fix it: a hosted field is
   * not read until its inputs are bound, and a change to the hosted set recomputes visibility.
   */
  it('is not hidden by its own fields before they have bound their inputs', () => {
    const { f, panel } = renderWidgetSection();
    f.detectChanges();
    f.detectChanges();
    expect(panel.IsVisible).toBe(true);
    expect(hasClass(f, 'mj-collapsible-panel', 'mj-panel-empty')).toBe(false);
    expect(hasClass(f, 'mj-collapsible-panel', 'mj-search-hidden')).toBe(false);
  });

  it('still hides when every hosted field is empty in read mode, and comes back when editing starts', () => {
    const { f, panel } = renderWidgetSection({ EditMode: false });
    expect(panel.IsVisible).toBe(false);
    expect(hasClass(f, 'mj-collapsible-panel', 'mj-panel-empty')).toBe(true);

    f.componentRef.setInput('EditMode', true);
    f.detectChanges();
    expect(panel.IsVisible).toBe(true);
    expect(hasClass(f, 'mj-collapsible-panel', 'mj-panel-empty')).toBe(false);
    expect(panel.SectionIndicators.ErrorCount).toBe(2);
  });

  it('ignores a registered field whose element is not inside the panel', () => {
    const { panel } = renderWidgetSection();
    const elsewhere = document.createElement('div');
    const stray = {
      FieldName: 'Stray', DisplayName: 'Stray', EditMode: true, IsFieldReadOnly: false, InputsBound: true,
      Navigate: new EventEmitter<FormNavigationEvent>(),
      IsRequiredEmpty: true, ShowErrors: false, IsDirty: false, ShouldHideField: false,
      IsFieldReadableByUser: true, ValueChange: new EventEmitter<unknown>(), HostElement: elsewhere,
    } as unknown as MjFormFieldComponent;
    (panel as FormSectionFieldHost).RegisterField(stray);
    expect(panel.SectionIndicators.ErrorCount).toBe(2);
    expect(panel.OwnsValidationSource(ParseValidationSource('Stray'))).toBe(false);
    (panel as FormSectionFieldHost).UnregisterField(stray);
  });
});
