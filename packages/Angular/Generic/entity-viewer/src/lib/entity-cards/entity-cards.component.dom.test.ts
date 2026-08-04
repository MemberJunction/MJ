import { describe, it, expect } from 'vitest';
import type { EntityInfo } from '@memberjunction/core';
import { renderComponentFixture, query, queryAll, text, capture, StubEmptyStateComponent } from '@memberjunction/ng-test-utils';
import { EntityCardsComponent } from './entity-cards.component';
import type { CardTemplate } from '../types';
import { buildPkString } from '../utils/record.util';

/**
 * DOM coverage for <mj-entity-cards> — the card view of an entity's records (~9×). When `records` is
 * provided it renders from them directly (no standalone RunView), and an explicit `cardTemplate` skips
 * metadata inference — so these drive the real buildCardViewModels path with a minimal entity + records
 * + template and verify: one card per record, the title from titleFields, the display-field values, the
 * selected-card highlight, click → recordSelected / open-button → recordOpened (with stopPropagation),
 * and the empty state.
 */

const ENTITY = { Name: 'Accounts', PrimaryKeys: [{ Name: 'ID' }] } as unknown as EntityInfo;

const TEMPLATE: CardTemplate = {
  titleFields: ['Name'],
  subtitleField: null,
  descriptionField: null,
  displayFields: [{ name: 'Status', type: 'text', label: 'Status' }],
  thumbnailFields: [],
  badgeField: null,
};

const RECORDS = [
  { ID: '1', Name: 'Acme', Status: 'Active' },
  { ID: '2', Name: 'Globex', Status: 'Inactive' },
];

const render = (inputs: Record<string, unknown> = {}) =>
  renderComponentFixture(EntityCardsComponent, {
    imports: [StubEmptyStateComponent],
    declarations: [EntityCardsComponent],
    inputs: { entity: ENTITY, records: RECORDS, cardTemplate: TEMPLATE, ...inputs },
  });
type Fx = ReturnType<typeof render>;
const cardEls = (f: Fx) => queryAll(f, '.data-card') as HTMLElement[];

describe('EntityCardsComponent (DOM)', () => {
  it('renders one card per provided record', () => {
    expect(cardEls(render()).length).toBe(2);
  });

  it('renders each card title from the template titleFields', () => {
    const f = render();
    const titles = queryAll(f, '.card-title').map((el) => el.textContent?.trim());
    expect(titles).toEqual(['Acme', 'Globex']);
  });

  it('renders the configured display field values', () => {
    const f = render();
    const values = queryAll(f, '.field-text-value').map((el) => el.textContent?.trim());
    expect(values).toEqual(['Active', 'Inactive']);
  });

  it('marks only the card matching selectedRecordId as selected', () => {
    const key2 = buildPkString(RECORDS[1], ENTITY);
    const cards = cardEls(render({ selectedRecordId: key2 }));
    expect(cards[0].classList.contains('selected')).toBe(false);
    expect(cards[1].classList.contains('selected')).toBe(true);
  });

  it('emits recordSelected with the clicked record when a card is clicked', () => {
    const f = render();
    const out = capture(f.componentInstance.recordSelected);
    cardEls(f)[0].click();
    expect(out.length).toBe(1);
    expect(out[0].record).toBe(RECORDS[0]);
  });

  it('emits recordOpened (not recordSelected) when the open button is clicked', () => {
    const f = render();
    const opened = capture(f.componentInstance.recordOpened);
    const selected = capture(f.componentInstance.recordSelected);
    (cardEls(f)[1].querySelector('.card-open-btn') as HTMLElement).click();
    expect(opened.length).toBe(1);
    expect(opened[0].record).toBe(RECORDS[1]);
    // stopPropagation prevents the card click from also firing recordSelected
    expect(selected.length).toBe(0);
  });

  it('renders the empty state when there are no records', () => {
    const f = render({ records: [] });
    expect(query(f, '.data-card')).toBeNull();
    expect(query(f, 'mj-empty-state')).not.toBeNull();
  });
});
