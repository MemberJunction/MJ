import { describe, it, expect, vi } from 'vitest';
import { CommonModule } from '@angular/common';
import { renderComponentFixture, query, queryAll, text } from '@memberjunction/ng-test-utils';
import { MentionDropdownComponent } from './mention-dropdown.component';
import type { MentionSuggestion } from '../../services/mention-autocomplete.service';

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
      imports: [CommonModule],
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
    expect(query(f, '.mention-empty-state')).not.toBeNull();
    expect(query(f, '.mention-suggestion')).toBeNull();
    expect(text(f, '.mention-empty-state')).toContain('No matches found');
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
});
