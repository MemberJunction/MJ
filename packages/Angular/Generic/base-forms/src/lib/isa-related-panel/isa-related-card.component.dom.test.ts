import { describe, it, expect } from 'vitest';
import { CommonModule } from '@angular/common';
import { renderComponentFixture, query, text } from '@memberjunction/ng-test-utils';
import { CompositeKey } from '@memberjunction/core';
import { MjIsaRelatedCardComponent } from './isa-related-card.component';
import type { EntityHierarchyNavigationEvent } from '../types/navigation-events';

/**
 * DOM-level spec for <mj-isa-related-card>. The card's data-loading path needs a
 * real provider returning a BaseEntity (GetEntityObject + InnerLoad + field
 * metadata) — that is exercised in a live/integration test, NOT mocked here (the
 * fake-provider seam only covers RunView). These tests cover the media-free,
 * data-free surface: the always-rendered header, the EntityName fallback for
 * DisplayName, the loading state, and the Open-link Navigate emission.
 *
 * With no PrimaryKey, ngOnInit's LoadRelatedRecord early-returns, so the card
 * stays in its initial IsLoading=true state and never touches a provider.
 */
function render(inputs: Record<string, unknown>, setup?: (c: MjIsaRelatedCardComponent) => void) {
  return renderComponentFixture(MjIsaRelatedCardComponent, {
    declarations: [MjIsaRelatedCardComponent],
    imports: [CommonModule],
    inputs,
    setup,
  });
}

describe('MjIsaRelatedCardComponent (DOM)', () => {
  it('always renders the card header with the Open link', () => {
    const f = render({ EntityName: 'Members' });
    expect(query(f, '.mj-isa-card__header')).not.toBeNull();
    expect(text(f, '.mj-isa-card__open-link')).toContain('Open');
  });

  it('falls back to EntityName for the display name when no metadata is loaded', () => {
    const f = render({ EntityName: 'Speakers' });
    expect(text(f, '.mj-isa-card__entity-name')).toBe('Speakers');
  });

  it('shows the loading state (loading bars) before a record resolves', () => {
    const f = render({ EntityName: 'Members' });
    expect(query(f, '.mj-isa-card__body--loading')).not.toBeNull();
    expect(query(f, '.mj-isa-card__loading-bar')).not.toBeNull();
  });

  it('applies the nested modifier class when Depth > 0', () => {
    const f = render({ EntityName: 'GoldMembers', Depth: 2 });
    expect(query(f, '.mj-isa-card')?.classList.contains('mj-isa-card--nested')).toBe(true);
  });

  it('does not apply the nested modifier at Depth 0', () => {
    const f = render({ EntityName: 'Members', Depth: 0 });
    expect(query(f, '.mj-isa-card')?.classList.contains('mj-isa-card--nested')).toBe(false);
  });

  it('emits a child-direction Navigate event with the PrimaryKey when Open is clicked', () => {
    const events: EntityHierarchyNavigationEvent[] = [];
    const pk = new CompositeKey([{ FieldName: 'ID', Value: 'abc' }]);
    // PrimaryKey is set, so OnOpenClick emits; EntityName left empty so
    // LoadRelatedRecord still early-returns (needs both) — no provider touched.
    const f = render({ PrimaryKey: pk, EntityName: '', Relationship: 'sibling' }, (c) => c.Navigate.subscribe((e) => events.push(e)));
    (query(f, '.mj-isa-card__open-link') as HTMLElement).click();

    expect(events.length).toBe(1);
    expect(events[0].Kind).toBe('entity-hierarchy');
    expect(events[0].Direction).toBe('child');
    expect(events[0].PrimaryKey).toBe(pk);
  });

  it('does not emit Navigate when Open is clicked with no PrimaryKey', () => {
    const events: EntityHierarchyNavigationEvent[] = [];
    const f = render({ EntityName: 'Members' }, (c) => c.Navigate.subscribe((e) => events.push(e)));
    (query(f, '.mj-isa-card__open-link') as HTMLElement).click();
    expect(events.length).toBe(0);
  });

  it('flags the card with the loading modifier in its initial (pre-load) state', () => {
    const f = render({ EntityName: 'Members' }); // no PrimaryKey -> LoadRelatedRecord early-returns, IsLoading stays true
    expect(query(f, '.mj-isa-card')?.classList.contains('mj-isa-card--loading')).toBe(true);
  });

  it('flags the card with the error modifier when LoadError is set', () => {
    const f = render({ EntityName: 'Members' }, (c) => {
      c.IsLoading = false;
      c.LoadError = true;
    });
    const card = query(f, '.mj-isa-card');
    expect(card?.classList.contains('mj-isa-card--error')).toBe(true);
    expect(card?.classList.contains('mj-isa-card--loading')).toBe(false);
  });
});
