import { describe, it, expect, vi } from 'vitest';
import { ComponentFixture } from '@angular/core/testing';
import { renderComponentFixture } from '@memberjunction/ng-test-utils';
import { MJNumericInputComponent } from './numeric-input.component';

/** DOM-level spec for <mj-numeric-input> — attributes, CVA value/disabled, typing + clamping. */
describe('MJNumericInputComponent (DOM)', () => {
  const inputOf = (f: ComponentFixture<MJNumericInputComponent>) =>
    f.nativeElement.querySelector('input.mj-numeric-input') as HTMLInputElement;

  it('reflects Min/Max/Step into the input attributes', () => {
    const input = inputOf(renderComponentFixture(MJNumericInputComponent, { inputs: { Min: 0, Max: 10, Step: 2 } }));
    expect(input.getAttribute('min')).toBe('0');
    expect(input.getAttribute('max')).toBe('10');
    expect(input.getAttribute('step')).toBe('2');
  });

  it('renders the placeholder', () => {
    const f = renderComponentFixture(MJNumericInputComponent, { inputs: { Placeholder: 'Enter a number' } });
    expect(inputOf(f).getAttribute('placeholder')).toBe('Enter a number');
  });

  it('shows the value written through the CVA', () => {
    const f = renderComponentFixture(MJNumericInputComponent, { setup: (c) => c.writeValue(42) });
    expect(inputOf(f).value).toBe('42');
  });

  it('emits the typed value through the CVA onChange', () => {
    const spy = vi.fn();
    const input = inputOf(renderComponentFixture(MJNumericInputComponent, { setup: (c) => c.registerOnChange(spy) }));
    input.value = '7';
    input.dispatchEvent(new Event('input'));
    expect(spy).toHaveBeenCalledWith(7);
  });

  it('clamps a typed value above Max', () => {
    const spy = vi.fn();
    const input = inputOf(
      renderComponentFixture(MJNumericInputComponent, { inputs: { Max: 10 }, setup: (c) => c.registerOnChange(spy) }),
    );
    input.value = '50';
    input.dispatchEvent(new Event('input'));
    expect(spy).toHaveBeenCalledWith(10);
  });

  it('reflects the disabled state set via the CVA', () => {
    const f = renderComponentFixture(MJNumericInputComponent, { setup: (c) => c.setDisabledState(true) });
    expect(inputOf(f).disabled).toBe(true);
  });
});
