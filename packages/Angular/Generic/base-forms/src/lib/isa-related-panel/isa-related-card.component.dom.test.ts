import { describe, it, expect } from 'vitest';
import { CommonModule } from '@angular/common';
import { renderComponentFixture, query, text } from '@memberjunction/ng-test-utils';
import { CompositeKey } from '@memberjunction/core';
import type { EntityFieldInfo } from '@memberjunction/core';
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

describe('a date-only field renders its stored calendar day (MJ#4210)', () => {
  /**
   * A `date` column arrives as UTC midnight. Formatting it in the reader's local zone lands on
   * the previous day for everyone west of Greenwich. The card has the field's metadata in hand,
   * so a `date` is pinned to its stored day and a timestamp keeps local rendering. Pinned to New
   * York: at Greenwich this bug is invisible. The formatter is private; the test reaches it
   * through a structural handle rather than widening the class.
   */
  const AT = (tz: string, fn: () => void) => {
    const original = process.env.TZ;
    process.env.TZ = tz;
    try {
      fn();
    } finally {
      process.env.TZ = original;
    }
  };
  type Internals = { FormatFieldValue(value: unknown, field: EntityFieldInfo): string };
  const formatter = (): Internals => render({ EntityName: 'Animals' }).componentInstance as unknown as Internals;
  const field = (name: string, type: string): EntityFieldInfo => ({ Name: name, Type: type } as unknown as EntityFieldInfo);

  it('shows the 20th for a stored 2026-11-20, not the 19th', () => {
    AT('America/New_York', () => {
      const shown = formatter().FormatFieldValue(new Date('2026-11-20T00:00:00.000Z'), field('IntakeDate', 'date'));
      expect(shown, `got ${shown}`).toContain('20');
      expect(shown).not.toContain('19');
    });
  });

  it('keeps a timestamp field in local time', () => {
    AT('America/New_York', () => {
      expect(formatter().FormatFieldValue(new Date('2026-11-20T02:00:00.000Z'), field('LaunchAt', 'datetimeoffset'))).toContain('19');
    });
  });
});
