import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Type } from '@angular/core';
import { renderComponentFixture, clearOverlayContainers } from '@memberjunction/ng-test-utils';
import { warnIfUnnamed } from './unnamed-control-guard';
import type { MJNamedControlBase } from './named-control.base';
import { MJDropdownComponent } from '../dropdown/dropdown.component';
import { MJComboboxComponent } from '../combobox/combobox.component';
import { MJSwitchComponent } from '../switch/switch.component';
import { MJNumericInputComponent } from '../numeric-input/numeric-input.component';
import { MJDatepickerComponent } from '../datepicker/datepicker.component';
import { MJPageSearchComponent } from '../page-search/page-search.component';

/**
 * The dev-mode unnamed-control guard — #3860's prevention question, answered (#4116).
 *
 * Two halves: what the guard counts as a name, and the fact that every named control actually
 * calls it. The second half is what keeps the guard from quietly covering five controls and
 * missing the sixth.
 */
describe('warnIfUnnamed', () => {
  const withWarnSpy = (fn: (warn: ReturnType<typeof vi.spyOn>) => void): void => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      fn(warn);
    } finally {
      warn.mockRestore();
    }
  };

  const element = (html: string): HTMLElement => {
    const host = document.createElement('div');
    host.innerHTML = html;
    document.body.appendChild(host);
    return host.firstElementChild as HTMLElement;
  };

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('warns for a control with no naming attribute at all', () => {
    withWarnSpy((warn) => {
      warnIfUnnamed(element('<input type="text">'), 'mj-page-search');
      expect(warn).toHaveBeenCalledOnce();
      expect(String(warn.mock.calls[0][0])).toContain('mj-page-search');
    });
  });

  it.each([
    ['aria-label', '<input aria-label="Quantity">'],
    ['aria-labelledby', '<input aria-labelledby="qty-label">'],
    ['title', '<input title="Quantity">'],
    ['placeholder', '<input placeholder="Search templates...">'],
  ])('stays silent when the name comes from %s', (_source, html) => {
    withWarnSpy((warn) => {
      warnIfUnnamed(element(html), 'mj-numeric-input');
      expect(warn).not.toHaveBeenCalled();
    });
  });

  it('stays silent when a <label for> in the document points at the control', () => {
    withWarnSpy((warn) => {
      const el = element('<input id="qty-field">');
      document.body.appendChild(element('<label for="qty-field">Quantity</label>'));
      warnIfUnnamed(el, 'mj-numeric-input');
      expect(warn).not.toHaveBeenCalled();
    });
  });

  it('warns for an id that no label points at — an id is not a name', () => {
    withWarnSpy((warn) => {
      warnIfUnnamed(element('<input id="qty-field">'), 'mj-numeric-input');
      expect(warn).toHaveBeenCalledOnce();
    });
  });

  it('does NOT count text content, which on these controls is the value or the state', () => {
    // A div[role=combobox]'s text is the selected value and a role=switch's is its state. Counting
    // it would silence the guard for exactly the controls it exists to catch.
    withWarnSpy((warn) => {
      warnIfUnnamed(element('<div role="combobox">Gamma</div>'), 'mj-dropdown');
      expect(warn).toHaveBeenCalledOnce();
    });
  });

  it('treats an empty attribute as no name — absent and empty are the same thing here', () => {
    withWarnSpy((warn) => {
      warnIfUnnamed(element('<input aria-label="   ">'), 'mj-page-search');
      expect(warn).toHaveBeenCalledOnce();
    });
  });

  it('is a no-op for a missing element rather than throwing', () => {
    withWarnSpy((warn) => {
      expect(() => warnIfUnnamed(null, 'mj-switch')).not.toThrow();
      expect(() => warnIfUnnamed(undefined, 'mj-switch')).not.toThrow();
      expect(warn).not.toHaveBeenCalled();
    });
  });
});

describe('every named control is wired to the guard', () => {
  afterEach(() => clearOverlayContainers());

  const controls: { name: string; component: Type<MJNamedControlBase> }[] = [
    { name: 'mj-dropdown', component: MJDropdownComponent },
    { name: 'mj-combobox', component: MJComboboxComponent },
    { name: 'mj-switch', component: MJSwitchComponent },
    { name: 'mj-numeric-input', component: MJNumericInputComponent },
    { name: 'mj-datepicker', component: MJDatepickerComponent },
  ];

  it.each(controls)('$name warns when it renders unnamed', ({ name, component }) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    renderComponentFixture(component, {});
    expect(warn, `${name} must warn when it renders with no accessible name`).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0][0])).toContain(name);
    warn.mockRestore();
  });

  it.each(controls)('$name stays silent once it is named', ({ name, component }) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    renderComponentFixture(component, { inputs: { AriaLabel: 'Something' } });
    expect(warn, `${name} must not warn once a caller has named it`).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

/**
 * mj-page-search is deliberately absent from the table above: its `Placeholder` defaults to
 * "Search...", which IS the fallback the name computation uses, so an unconfigured page-search has
 * a name and the guard is correctly silent. Its wiring is covered by the placeholder-less case.
 */
describe('mj-page-search and the placeholder fallback', () => {
  it('stays silent on the default placeholder and warns once the placeholder is cleared', () => {
    const quiet = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    renderComponentFixture(MJPageSearchComponent, {});
    expect(quiet).not.toHaveBeenCalled();
    quiet.mockRestore();

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    renderComponentFixture(MJPageSearchComponent, { inputs: { Placeholder: '' } });
    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0][0])).toContain('mj-page-search');
    warn.mockRestore();
  });
});
