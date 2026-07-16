import { describe, it, expect } from 'vitest';
import { CommonModule } from '@angular/common';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { renderComponentFixture, query, queryAll, text, hasClass, capture } from '@memberjunction/ng-test-utils';
import type { MJActionCategoryEntity } from '@memberjunction/core-entities';
import type { MJActionEntityExtended } from '@memberjunction/actions-base';
import { ActionTreePanelComponent } from './action-tree-panel.component';
import { ActionExplorerStateService } from '../../services/action-explorer-state.service';

/**
 * DOM coverage for <mj-action-tree-panel> — the category tree (standalone:false, OnPush).
 * It builds its tree from the Categories/Actions @Inputs in ngOnInit. The real
 * ActionExplorerStateService is provided: its constructor only wires a debounced persistence
 * subscription (no UserInfoEngine call), and its BehaviorSubjects default to the collapsed=false /
 * selected='all' state the panel needs. CommonModule supplies *ngTemplateOutlet; mjButton is real.
 * selectCategory / onNewCategory drive the CategorySelected / NewCategoryClick outputs.
 */

const cat = (over: Partial<Record<string, unknown>>) =>
  ({ ID: '', Name: '', ParentID: null, ...over }) as unknown as MJActionCategoryEntity;

const action = (over: Partial<Record<string, unknown>>) =>
  ({ CategoryID: null, ...over }) as unknown as MJActionEntityExtended;

const render = (Categories: MJActionCategoryEntity[] = [], Actions: MJActionEntityExtended[] = []) =>
  renderComponentFixture(ActionTreePanelComponent, {
    imports: [CommonModule, MJButtonDirective],
    declarations: [ActionTreePanelComponent],
    providers: [ActionExplorerStateService],
    inputs: { Categories, Actions },
  });

describe('ActionTreePanelComponent (DOM)', () => {
  it('renders the root "All Actions" item with the total action count', () => {
    const fixture = render(
      [cat({ ID: 'c1', Name: 'Reports' })],
      [action({ CategoryID: 'c1' }), action({ CategoryID: 'c1' })],
    );
    const root = query(fixture, '.tree-item.root-item');
    expect(root).not.toBeNull();
    expect(text(fixture, '.root-item .item-name')).toBe('All Actions');
    expect(text(fixture, '.root-item .item-count')).toBe('2');
  });

  it('marks the root item selected by default (SelectedCategoryId === "all")', () => {
    const fixture = render([cat({ ID: 'c1', Name: 'Reports' })]);
    expect(hasClass(fixture, '.tree-item.root-item', 'selected')).toBe(true);
  });

  it('renders one tree node per category with its name', () => {
    const fixture = render([
      cat({ ID: 'c1', Name: 'Alpha' }),
      cat({ ID: 'c2', Name: 'Beta' }),
    ]);
    const names = queryAll(fixture, '.tree-categories .item-name').map(el => el.textContent?.trim());
    expect(names).toContain('Alpha');
    expect(names).toContain('Beta');
  });

  it('shows the Uncategorized item only when there are uncategorized actions', () => {
    const fixture = render([cat({ ID: 'c1', Name: 'Alpha' })], [action({ CategoryID: null })]);
    expect(query(fixture, '.tree-item.uncategorized-item')).not.toBeNull();
    expect(text(fixture, '.uncategorized-item .item-count')).toBe('1');
  });

  it('hides the Uncategorized item when every action has a category', () => {
    const fixture = render([cat({ ID: 'c1', Name: 'Alpha' })], [action({ CategoryID: 'c1' })]);
    expect(query(fixture, '.tree-item.uncategorized-item')).toBeNull();
  });

  it('emits CategorySelected when a category row is clicked', () => {
    const fixture = render([cat({ ID: 'c1', Name: 'Alpha' })]);
    const selected = capture(fixture.componentInstance.CategorySelected);
    (query(fixture, '.tree-categories .tree-item') as HTMLElement).click();
    expect(selected).toEqual(['c1']);
  });

  it('emits NewCategoryClick(null) from the footer "New Category" button', () => {
    const fixture = render([cat({ ID: 'c1', Name: 'Alpha' })]);
    const created = capture(fixture.componentInstance.NewCategoryClick);
    (query(fixture, '.new-category-btn') as HTMLElement).click();
    expect(created).toEqual([null]);
  });
});
