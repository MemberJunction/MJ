import { describe, it, expect } from 'vitest';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { renderComponentFixture, query, queryAll, text, capture } from '@memberjunction/ng-test-utils';
import type { MJActionCategoryEntity } from '@memberjunction/core-entities';
import type { MJActionEntityExtended } from '@memberjunction/actions-base';
import { ActionListItemComponent } from './action-list-item.component';

/**
 * DOM coverage for <mj-action-list-item> — a presentational action row. Action is a plain stand-in
 * exposing the fields the template reads (Name/Description/Type/Status/Params/CategoryID); the
 * Categories map resolves the category name. Row/category/edit/run clicks emit their outputs.
 * mjButton is imported for the Edit/Run buttons. No DI/async; single synchronous render.
 */

const makeAction = (over: Partial<Record<string, unknown>> = {}) =>
  ({ Name: 'Send Email', Description: 'Sends an email', Type: 'Custom', Status: 'Active', Params: [], CategoryID: 'c1', ...over }) as unknown as MJActionEntityExtended;

const CATEGORIES = new Map<string, MJActionCategoryEntity>([['c1', { Name: 'Communication' } as MJActionCategoryEntity]]);

const render = (action = makeAction(), IsCompact = false) =>
  renderComponentFixture(ActionListItemComponent, {
    imports: [MJButtonDirective],
    declarations: [ActionListItemComponent],
    inputs: { Action: action, Categories: CATEGORIES, IsCompact },
  });

describe('ActionListItemComponent (DOM)', () => {
  it('renders the action name and status', () => {
    const fixture = render();
    expect(text(fixture, '.item-name')).toBe('Send Email');
    expect(text(fixture, '.status-chip')).toContain('Active');
  });

  it('shows the AI badge for Generated actions', () => {
    expect(query(render(makeAction({ Type: 'Generated' })), '.type-badge.ai')).not.toBeNull();
  });

  it('shows the Custom badge for non-generated actions', () => {
    expect(query(render(makeAction({ Type: 'Custom' })), '.type-badge.custom')).not.toBeNull();
  });

  it('hides the description in compact mode', () => {
    expect(query(render(makeAction(), true), '.item-description')).toBeNull();
  });

  it('resolves the category name from the Categories map', () => {
    expect(text(render(), '.item-category')).toContain('Communication');
  });

  it('emits ActionClick with the action when the row is clicked', () => {
    const fixture = render();
    const clicks = capture(fixture.componentInstance.ActionClick);
    (query(fixture, '.action-list-item') as HTMLElement).click();
    expect(clicks.length).toBe(1);
  });

  it('emits CategoryClick with the category id when the category chip is clicked', () => {
    const fixture = render();
    const cat = capture(fixture.componentInstance.CategoryClick);
    (query(fixture, '.item-category') as HTMLElement).click();
    expect(cat).toEqual(['c1']);
  });

  it('emits RunClick and EditClick from the action buttons', () => {
    const fixture = render();
    const runs = capture(fixture.componentInstance.RunClick);
    const edits = capture(fixture.componentInstance.EditClick);
    const actionButtons = queryAll(fixture, 'button.mj-btn');
    (actionButtons[0] as HTMLElement).click(); // Run
    (actionButtons[1] as HTMLElement).click(); // Edit
    expect(runs.length).toBe(1);
    expect(edits.length).toBe(1);
  });
});
