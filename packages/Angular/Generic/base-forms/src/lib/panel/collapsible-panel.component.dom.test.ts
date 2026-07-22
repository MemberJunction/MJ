import { describe, it, expect, vi } from 'vitest';
import { CommonModule } from '@angular/common';
import { renderComponentFixture, query, text, hasClass } from '@memberjunction/ng-test-utils';
import { CompositeKey } from '@memberjunction/core';
import { MjCollapsiblePanelComponent } from './collapsible-panel.component';
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

function render(inputs: Record<string, unknown>) {
  return renderComponentFixture(MjCollapsiblePanelComponent, {
    declarations: [MjCollapsiblePanelComponent],
    imports: [CommonModule],
    inputs,
  });
}

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

  it('applies the inherited variant class', () => {
    const f = render({ SectionName: 'Base', Variant: 'inherited', Form: formStub(true) });
    expect(hasClass(f, '.mj-forms-panel', 'mj-forms-panel--inherited')).toBe(true);
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
