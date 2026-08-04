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
