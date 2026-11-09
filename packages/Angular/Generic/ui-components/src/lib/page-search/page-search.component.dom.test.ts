import { describe, it, expect, vi } from 'vitest';
import { ComponentFixture } from '@angular/core/testing';
import { renderComponentFixture } from '@memberjunction/ng-test-utils';
import { MJPageSearchComponent } from './page-search.component';

/** DOM-level spec for <mj-page-search> — placeholder/value rendering, typing output, focus class. */
describe('MJPageSearchComponent (DOM)', () => {
  const inputOf = (f: ComponentFixture<MJPageSearchComponent>) =>
    f.nativeElement.querySelector('input') as HTMLInputElement;

  it('renders the placeholder', () => {
    const f = renderComponentFixture(MJPageSearchComponent, { inputs: { Placeholder: 'Find...' } });
    expect(inputOf(f).placeholder).toBe('Find...');
  });

  it('renders the current Value', () => {
    const f = renderComponentFixture(MJPageSearchComponent, { inputs: { Value: 'hello' } });
    expect(inputOf(f).value).toBe('hello');
  });

  it('emits ValueChange with the typed text', () => {
    const spy = vi.fn();
    const input = inputOf(renderComponentFixture(MJPageSearchComponent, { setup: (c) => c.ValueChange.subscribe(spy) }));
    input.value = 'abc';
    input.dispatchEvent(new Event('input'));
    expect(spy).toHaveBeenCalledWith('abc');
  });

  it('adds the focused class when the input is focused', () => {
    const f = renderComponentFixture(MJPageSearchComponent);
    inputOf(f).dispatchEvent(new Event('focus'));
    f.detectChanges();
    expect(
      f.nativeElement.querySelector('.mj-page-search')?.classList.contains('mj-page-search--focused'),
    ).toBe(true);
  });
});

describe('MJPageSearchComponent — accessible name (#4116)', () => {
  const render = (inputs: Record<string, unknown> = {}) =>
    renderComponentFixture(MJPageSearchComponent, { inputs });
  const input = (f: ComponentFixture<MJPageSearchComponent>) =>
    f.nativeElement.querySelector('input') as HTMLInputElement;

  it('names the search box with AriaLabel', () => {
    expect(input(render({ AriaLabel: 'Search templates' })).getAttribute('aria-label')).toBe('Search templates');
  });

  it('names the search box from a visible label via AriaLabelledBy', () => {
    expect(input(render({ AriaLabelledBy: 'search-label' })).getAttribute('aria-labelledby')).toBe('search-label');
  });

  it('puts InputId on the real <input>, which IS a valid <label for> target', () => {
    const f = render({ InputId: 'template-search' });
    expect(input(f).getAttribute('id')).toBe('template-search');
    expect(input(f).tagName).toBe('INPUT');
  });

  it('passes AriaDescribedBy through for hint and error text', () => {
    expect(input(render({ AriaDescribedBy: 'search-hint' })).getAttribute('aria-describedby')).toBe('search-hint');
  });

  it('renders NO empty name attributes when nothing is configured — absent beats empty', () => {
    const el = input(render());
    expect(el.hasAttribute('aria-label')).toBe(false);
    expect(el.hasAttribute('aria-labelledby')).toBe(false);
    expect(el.hasAttribute('id')).toBe(false);
    expect(el.hasAttribute('aria-describedby')).toBe(false);
  });

  it('hides the decorative magnifier from the accessibility tree', () => {
    expect(render().nativeElement.querySelector('i')?.getAttribute('aria-hidden')).toBe('true');
  });
});
