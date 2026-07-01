import { describe, it, expect } from 'vitest';
import { CommonModule } from '@angular/common';
import { renderComponentFixture, query, text, attr, hasClass, click, typeInto, capture } from '@memberjunction/ng-test-utils';
import { SearchInputComponent } from './search-input.component';

/**
 * DOM tests for SearchInputComponent — a pure @Input/@Output leaf (module-declared,
 * configured via inputs, no projected children). We assert the template contract:
 * the clear-button @if gating on Query.length, the shortcut-hint @if gating
 * (ShowShortcutHint && !IsFocused && empty query), the [class.search-input-focused]
 * binding, bound attributes, and the @Output emissions wired to DOM events.
 */
describe('SearchInputComponent (DOM)', () => {
  const render = (inputs: Record<string, unknown> = {}) =>
    renderComponentFixture(SearchInputComponent, {
      imports: [CommonModule],
      declarations: [SearchInputComponent],
      inputs,
    });

  it('binds Placeholder and Query to the input element', () => {
    const fixture = render({ Placeholder: 'Find things…', Query: 'hello' });
    const input = query(fixture, 'input.search-input-field') as HTMLInputElement;
    expect(input.getAttribute('placeholder')).toBe('Find things…');
    expect(input.value).toBe('hello');
  });

  it('hides the clear button when the query is empty', () => {
    const fixture = render({ Query: '' });
    expect(query(fixture, 'button.search-input-clear')).toBeNull();
  });

  it('shows the clear button when the query is non-empty', () => {
    const fixture = render({ Query: 'abc' });
    expect(query(fixture, 'button.search-input-clear')).not.toBeNull();
  });

  it('shows the shortcut hint with its text when enabled, unfocused, and query empty', () => {
    const fixture = render({ ShowShortcutHint: true, ShortcutHint: 'Ctrl+K', Query: '' });
    expect(query(fixture, 'kbd.search-input-shortcut')).not.toBeNull();
    expect(text(fixture, 'kbd.search-input-shortcut')).toBe('Ctrl+K');
  });

  it('hides the shortcut hint when ShowShortcutHint is false', () => {
    const fixture = render({ ShowShortcutHint: false, Query: '' });
    expect(query(fixture, 'kbd.search-input-shortcut')).toBeNull();
  });

  it('hides the shortcut hint once the query is non-empty', () => {
    const fixture = render({ ShowShortcutHint: true, Query: 'x' });
    expect(query(fixture, 'kbd.search-input-shortcut')).toBeNull();
  });

  it('applies the search-input-focused class only when focused', () => {
    const fixture = render();
    expect(hasClass(fixture, '.search-input-container', 'search-input-focused')).toBe(false);

    const input = query(fixture, 'input.search-input-field') as HTMLInputElement;
    input.dispatchEvent(new Event('focus'));
    fixture.detectChanges();
    expect(hasClass(fixture, '.search-input-container', 'search-input-focused')).toBe(true);
  });

  it('emits QuerySubmit with the current query when Enter is pressed', () => {
    const fixture = render({ Query: 'report' });
    const submits = capture(fixture.componentInstance.QuerySubmit);
    const input = query(fixture, 'input.search-input-field') as HTMLInputElement;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(submits).toEqual(['report']);
  });

  it('emits InputEscaped when Escape is pressed', () => {
    const fixture = render({ Query: 'x' });
    const escapes = capture(fixture.componentInstance.InputEscaped);
    const input = query(fixture, 'input.search-input-field') as HTMLInputElement;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(escapes.length).toBe(1);
  });

  it('emits InputFocused on focus and InputBlurred on blur', () => {
    const fixture = render();
    const focuses = capture(fixture.componentInstance.InputFocused);
    const blurs = capture(fixture.componentInstance.InputBlurred);
    const input = query(fixture, 'input.search-input-field') as HTMLInputElement;
    input.dispatchEvent(new Event('focus'));
    input.dispatchEvent(new Event('blur'));
    expect(focuses.length).toBe(1);
    expect(blurs.length).toBe(1);
  });

  it('clears the query and emits QueryChange("") + InputCleared when the clear button is clicked', () => {
    const fixture = render({ Query: 'abc' });
    const queryChanges = capture(fixture.componentInstance.QueryChange);
    const cleared = capture(fixture.componentInstance.InputCleared);
    click(fixture, 'button.search-input-clear');
    expect(queryChanges).toEqual(['']);
    expect(cleared.length).toBe(1);
    expect(fixture.componentInstance.Query).toBe('');
  });

  it('updates the internal query as the user types (OnInput)', () => {
    const fixture = render({ Query: '' });
    typeInto(fixture, 'input.search-input-field', 'graph');
    expect(fixture.componentInstance.Query).toBe('graph');
  });

  it('exposes accessibility metadata on the clear button', () => {
    const fixture = render({ Query: 'x' });
    expect(attr(fixture, 'button.search-input-clear', 'aria-label')).toBe('Clear search');
    expect(attr(fixture, 'button.search-input-clear', 'type')).toBe('button');
  });
});
