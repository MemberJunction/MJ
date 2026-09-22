import { describe, it, expect, vi } from 'vitest';
import { Component, Input } from '@angular/core';
import { Subject, of } from 'rxjs';
import { CommonModule } from '@angular/common';
import { renderComponentFixture, query, text, hasClass } from '@memberjunction/ng-test-utils';
import { CompositeKey } from '@memberjunction/core';
import { MjCollapsiblePanelComponent } from './collapsible-panel.component';
import { FormChromeCoordinator } from '../chrome/form-chrome-coordinator.service';
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
    (f.componentInstance as unknown as { ReorderSections(a: string, b: string): void })
      .ReorderSections(from, to);

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
