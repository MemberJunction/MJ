import { describe, it, expect, vi } from 'vitest';
import { CommonModule } from '@angular/common';
import { renderComponentFixture, query, queryAll, text } from '@memberjunction/ng-test-utils';
import { MJEmptyStateComponent } from '@memberjunction/ng-ui-components';
import {
  MentionDropdownComponent,
  SplitHighlightSegments,
} from './mention-dropdown.component';
import type {
  ComposerPopulationFilter,
  ComposerSearchField,
  MentionSuggestion,
} from '../../composer-trigger-provider';

/**
 * DOM spec for <mj-mention-dropdown> — the @mention autocomplete list.
 * Covers @if(visible) gating, the suggestions-vs-empty-state branch, per-type
 * badge rendering, the positioning modifier classes, the default-selection
 * highlight, and the mousedown → suggestionSelected output.
 */
describe('MentionDropdownComponent (DOM)', () => {
  const agent: MentionSuggestion = { type: 'agent', id: 'a1', name: 'sage', displayName: 'Sage', icon: 'fa-robot', description: 'Helper agent' };
  const user: MentionSuggestion = { type: 'user', id: 'u1', name: 'jdoe', displayName: 'Jane Doe' };
  const entity: MentionSuggestion = { type: 'entity', id: 'e1', name: 'customers', displayName: 'Customers' };

  const render = (inputs: Record<string, unknown>) =>
    renderComponentFixture(MentionDropdownComponent, {
      imports: [CommonModule, MJEmptyStateComponent],
      declarations: [MentionDropdownComponent],
      inputs: { visible: true, suggestions: [agent, user, entity], ...inputs },
    });

  it('renders nothing when not visible', () => {
    const f = render({ visible: false });
    expect(query(f, '.mention-dropdown')).toBeNull();
  });

  it('renders one row per suggestion with its display name', () => {
    const f = render({});
    const rows = queryAll(f, '.mention-suggestion');
    expect(rows.length).toBe(3);
    expect(rows.map((r) => r.textContent?.trim())).toEqual(expect.arrayContaining(['Agent', 'User', 'Entity'].map((b) => expect.stringContaining(b))));
    expect(text(f, '.mention-suggestions')).toContain('Sage');
    expect(text(f, '.mention-suggestions')).toContain('Jane Doe');
  });

  it('renders the empty state when there are no suggestions', () => {
    const f = render({ suggestions: [] });
    expect(query(f, 'mj-empty-state')).not.toBeNull();
    expect(query(f, '.mention-suggestion')).toBeNull();
    expect(text(f, 'mj-empty-state')).toContain('No matches found');
  });

  it('renders the per-type badge for each suggestion', () => {
    const f = render({});
    const badges = queryAll(f, '.suggestion-type-badge').map((b) => b.textContent?.trim());
    expect(badges).toEqual(['Agent', 'User', 'Entity']);
  });

  it('renders the description only when present', () => {
    const f = render({ suggestions: [agent, user] });
    const descriptions = queryAll(f, '.suggestion-description');
    expect(descriptions.length).toBe(1); // only the agent has a description
    expect(descriptions[0].textContent?.trim()).toBe('Helper agent');
  });

  it('applies the positioning modifier classes', () => {
    const f = render({ showAbove: true, useFixedPositioning: true });
    const dd = query(f, '.mention-dropdown');
    expect(dd?.classList.contains('show-above')).toBe(true);
    expect(dd?.classList.contains('fixed-position')).toBe(true);
  });

  it('highlights the first suggestion by default', () => {
    const f = render({});
    expect(queryAll(f, '.mention-suggestion')[0].classList.contains('selected')).toBe(true);
    expect(queryAll(f, '.mention-suggestion')[1].classList.contains('selected')).toBe(false);
  });

  it('emits suggestionSelected on mousedown of a row', () => {
    const f = render({});
    const spy = vi.fn();
    f.componentInstance.suggestionSelected.subscribe(spy);
    queryAll(f, '.mention-suggestion')[1].dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(spy).toHaveBeenCalledWith(user);
  });

  it('omits the smart filter toolbar for non-"@" triggers', () => {
    const nonAt = render({ ActiveTrigger: '#' });
    expect(query(nonAt, '.mention-toolbar')).toBeNull();
  });

  it('renders FK-style population & search-field toolbar when ActiveTrigger is "@", emits changes, and prevents default mousedown focus loss', () => {
    const f = render({ ActiveTrigger: '@', PopulationFilter: 'all', SearchField: 'all' });
    expect(query(f, '.mention-toolbar')).not.toBeNull();

    const popPills = queryAll(f, '.mention-pop-pill');
    expect(popPills.map((p) => p.textContent?.trim())).toEqual(['All', 'My Agents', 'Shared', 'People']);

    const popChanges: ComposerPopulationFilter[] = [];
    f.componentInstance.PopulationFilterChange.subscribe((val) => popChanges.push(val));
    const popEvent = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    popPills[1].dispatchEvent(popEvent);
    expect(popEvent.defaultPrevented).toBe(true);
    expect(popChanges).toEqual(['my-agents']);

    const fieldChanges: ComposerSearchField[] = [];
    f.componentInstance.SearchFieldChange.subscribe((val) => fieldChanges.push(val));
    const scopeBtn = query(f, '.mention-scope-trigger')!;
    const openEvt = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    scopeBtn.dispatchEvent(openEvt);
    expect(openEvt.defaultPrevented).toBe(true);
    f.detectChanges();

    const scopeOpts = queryAll(f, '.mention-scope-option');
    expect(scopeOpts.length).toBe(4);
    const pickEvt = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    scopeOpts[2].dispatchEvent(pickEvt);
    expect(pickEvt.defaultPrevented).toBe(true);
    expect(fieldChanges).toEqual(['capabilities']);
  });

  it('renders group headers, smart badges (Chat Default, In Thread, My Agent), lineage + description, and safe query highlights', () => {
    const pepper: MentionSuggestion = {
      type: 'agent',
      id: 'p1',
      name: 'Pepper',
      displayName: 'Pepper',
      description: 'Executive SQL & calendar partner',
      lineage: 'Chief of Staff · My Agent',
      group: 'frequent',
      groupLabel: 'Frequent & Recent',
      isMyAgent: true,
      isDefaultChatAgent: true,
      isInCurrentThread: true,
    };
    const queryBuilder: MentionSuggestion = {
      type: 'agent',
      id: 'q1',
      name: 'Query Builder',
      displayName: 'Query Builder',
      description: 'Writes SQL queries and joins',
      lineage: 'Shared',
      group: 'shared',
      groupLabel: 'Shared',
    };

    const f = render({
      ActiveTrigger: '@',
      SearchQuery: 'sql',
      suggestions: [pepper, queryBuilder],
    });

    const headers = queryAll(f, '.mention-group-header');
    expect(headers.length).toBe(2);
    expect(headers[0].textContent).toContain('Frequent & Recent');
    expect(headers[1].textContent).toContain('Shared');

    const chips = queryAll(f, '.mention-chip').map((c) => c.textContent?.trim());
    expect(chips).toEqual(['Chat Default', 'In Thread', 'My Agent']);

    const descriptions = queryAll(f, '.suggestion-description').map((d) => d.textContent?.trim());
    expect(descriptions[0]).toContain('Chief of Staff · My Agent — Executive SQL & calendar partner');

    const marks = queryAll(f, 'mark.mention-highlight').map((m) => m.textContent?.trim());
    expect(marks).toEqual(['SQL', 'SQL']);

    expect(SplitHighlightSegments('Pepper SQL', 'sql')).toEqual([
      { Text: 'Pepper ', Matched: false },
      { Text: 'SQL', Matched: true },
    ]);
  });
});
