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
  @Input() IsRequiredEmpty = false;
  @Input() IsDirty = false;
  EditMode = true;
  IsFieldReadOnly = false;
  ShowErrors = false;
  ShowWarnings = false;
  StoredDateIsUnreadable = false;
  IsFieldReadableByUser = true;
  ShouldHideField = false;
  ValueChange = new EventEmitter<unknown>();
  Navigate = new EventEmitter<FormNavigationEvent>();
  get DisplayName(): string {
    return this.FieldName;
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
      <test-hosted-field FieldName="CompanyID" [IsRequiredEmpty]="RequiredEmpty"></test-hosted-field>
      <test-hosted-field FieldName="RevenueRecognitionTypeID" [IsRequiredEmpty]="RequiredEmpty"></test-hosted-field>
    </div>
  `,
})
class WidgetStub {
  @Input() RequiredEmpty = false;
}

@Component({
  standalone: false,
  selector: 'test-form-with-widget-section',
  template: `
    <mj-collapsible-panel SectionKey="accounting" SectionName="Accounting" [Form]="Form">
      <test-widget [RequiredEmpty]="RequiredEmpty"></test-widget>
    </mj-collapsible-panel>
  `,
})
class FormWithWidgetSection {
  Form = formStub(true);
  /** An input so a test can flip it through `setInput`, which marks the view dirty for the zoneless TestBed. */
  @Input() RequiredEmpty = true;
}

describe('MjCollapsiblePanelComponent — fields behind a component view boundary', () => {
  function renderWidgetSection() {
    const f = renderComponentFixture(FormWithWidgetSection, {
      declarations: [FormWithWidgetSection, MjCollapsiblePanelComponent],
      imports: [CommonModule, WidgetStub],
      providers: [FormSectionIndicatorCoordinator],
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
    f.componentRef.setInput('RequiredEmpty', false);
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

  it('ignores a registered field whose element is not inside the panel', () => {
    const { panel } = renderWidgetSection();
    const elsewhere = document.createElement('div');
    const stray = {
      FieldName: 'Stray', DisplayName: 'Stray', EditMode: true, IsFieldReadOnly: false,
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
