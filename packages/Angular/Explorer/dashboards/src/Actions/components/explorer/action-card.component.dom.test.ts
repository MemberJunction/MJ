import { describe, it, expect } from 'vitest';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { renderComponentFixture, query, queryAll, text, attr, hasClass, capture } from '@memberjunction/ng-test-utils';
import type { MJActionCategoryEntity } from '@memberjunction/core-entities';
import type { MJActionEntityExtended } from '@memberjunction/actions-base';
import { ActionCardComponent } from './action-card.component';

/**
 * DOM coverage for <mj-action-card> — a presentational (standalone:false, OnPush) action card.
 * Action is a plain stand-in exposing the fields the template reads (Name/Description/Status/Type/
 * Params/CategoryID/CodeApprovalStatus). Categories resolves the category name. Row/category/run/
 * edit clicks emit their outputs. The expanded stats section (which triggers a RunView) is NOT
 * exercised — every test keeps the card collapsed, so no data path or mj-loading child is hit.
 * mjButton is imported real for the button row. Single synchronous render per test.
 */

const makeAction = (over: Partial<Record<string, unknown>> = {}) =>
  ({
    Name: 'Send Email',
    Description: 'Sends an email',
    Status: 'Active',
    Type: 'Custom',
    Params: [],
    CategoryID: 'c1',
    CodeApprovalStatus: null,
    IconClass: null,
    __mj_UpdatedAt: null,
    ...over,
  }) as unknown as MJActionEntityExtended;

const CATEGORIES = new Map<string, MJActionCategoryEntity>([['c1', { Name: 'Communication' } as MJActionCategoryEntity]]);

const render = (action = makeAction()) =>
  renderComponentFixture(ActionCardComponent, {
    imports: [MJButtonDirective],
    declarations: [ActionCardComponent],
    inputs: { Action: action, Categories: CATEGORIES },
  });

describe('ActionCardComponent (DOM)', () => {
  it('renders the action name, status and resolved category', () => {
    const fixture = render();
    expect(text(fixture, '.action-name')).toBe('Send Email');
    expect(text(fixture, '.status-chip')).toContain('Active');
    expect(text(fixture, '.meta-item.category')).toContain('Communication');
  });

  it('reflects an Active status color (success) into the data-color attribute', () => {
    expect(attr(render(), '.status-chip', 'data-color')).toBe('success');
  });

  it('reflects a Disabled status color (error) into the data-color attribute', () => {
    expect(attr(render(makeAction({ Status: 'Disabled' })), '.status-chip', 'data-color')).toBe('error');
  });

  it('shows a single status chip and no ai-generated icon for Custom actions', () => {
    const custom = render(makeAction({ Type: 'Custom' }));
    expect(queryAll(custom, '.status-chip').length).toBe(1);
    expect(hasClass(custom, '.action-icon', 'ai-generated')).toBe(false);
  });

  it('shows the AI chip and ai-generated icon class for Generated actions', () => {
    const generated = render(makeAction({ Type: 'Generated' }));
    expect(queryAll(generated, '.status-chip').length).toBe(2);
    expect(text(generated, '.status-chip[data-color="info"]')).toContain('AI');
    expect(hasClass(generated, '.action-icon', 'ai-generated')).toBe(true);
  });

  it('hides the approval-status meta for Custom actions even with a CodeApprovalStatus', () => {
    expect(query(render(makeAction({ Type: 'Custom', CodeApprovalStatus: 'Approved' })), '.meta-item[data-status]')).toBeNull();
  });

  it('renders the approval-status meta for Generated actions with a CodeApprovalStatus', () => {
    const approved = render(makeAction({ Type: 'Generated', CodeApprovalStatus: 'Approved' }));
    expect(attr(approved, '.meta-item[data-status]', 'data-status')).toBe('Approved');
  });

  it('starts collapsed (no expanded stats section)', () => {
    const fixture = render();
    expect(hasClass(fixture, '.action-card', 'expanded')).toBe(false);
    expect(query(fixture, '.card-expanded')).toBeNull();
  });

  it('emits ActionClick when the card is clicked', () => {
    const fixture = render();
    const clicks = capture(fixture.componentInstance.ActionClick);
    (query(fixture, '.action-card') as HTMLElement).click();
    expect(clicks.length).toBe(1);
    expect(clicks[0].Name).toBe('Send Email');
  });

  it('emits CategoryClick with the category id when the category button is clicked', () => {
    const fixture = render();
    const cats = capture(fixture.componentInstance.CategoryClick);
    (query(fixture, '.meta-item.category') as HTMLElement).click();
    expect(cats).toEqual(['c1']);
  });

  it('emits RunClick and EditClick from the action buttons', () => {
    const fixture = render();
    const runs = capture(fixture.componentInstance.RunClick);
    const edits = capture(fixture.componentInstance.EditClick);
    const buttons = queryAll(fixture, '.action-buttons button.mj-btn');
    // order: [stats toggle, Run (primary), Edit]
    (buttons[1] as HTMLElement).click();
    (buttons[2] as HTMLElement).click();
    expect(runs.length).toBe(1);
    expect(edits.length).toBe(1);
  });

  it('disables the Run button when the action is not Active', () => {
    const fixture = render(makeAction({ Status: 'Pending' }));
    const runBtn = queryAll(fixture, '.action-buttons button.mj-btn')[1] as HTMLButtonElement;
    expect(runBtn.disabled).toBe(true);
  });
});
