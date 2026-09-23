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
    ['title', '<input title="Quantity">'],
  ])('stays silent when the name comes from %s', (_source, html) => {
    withWarnSpy((warn) => {
      warnIfUnnamed(element(html), 'mj-numeric-input');
      expect(warn).not.toHaveBeenCalled();
    });
  });

  it('stays silent when aria-labelledby resolves to a real element', () => {
    withWarnSpy((warn) => {
      document.body.appendChild(element('<span id="qty-label">Quantity</span>'));
      warnIfUnnamed(element('<input aria-labelledby="qty-label">'), 'mj-numeric-input');
      expect(warn).not.toHaveBeenCalled();
    });
  });

  it('warns when aria-labelledby points at nothing — a dangling idref names nothing', () => {
    // The half-wiring case: the label was renamed or removed, the attribute stayed. The accessible
    // name computes to empty, so markup that looks correct leaves the control unnamed.
    withWarnSpy((warn) => {
      warnIfUnnamed(element('<input aria-labelledby="qty-label">'), 'mj-numeric-input');
      expect(warn).toHaveBeenCalledOnce();
    });
  });

  it('stays silent when ONE of several aria-labelledby ids resolves', () => {
    withWarnSpy((warn) => {
      document.body.appendChild(element('<span id="qty-label">Quantity</span>'));
      warnIfUnnamed(element('<input aria-labelledby="missing-word qty-label">'), 'mj-numeric-input');
      expect(warn).not.toHaveBeenCalled();
    });
  });

  it('does NOT count a placeholder as a name by default', () => {
    // A placeholder disappears the moment the user types. Counting it everywhere would silence the
    // guard for most of the controls it exists to catch: nearly every mj-combobox and mj-datepicker
    // call site in this repo already passes a Placeholder.
    withWarnSpy((warn) => {
      warnIfUnnamed(element('<input placeholder="Select a category">'), 'mj-combobox');
      expect(warn).toHaveBeenCalledOnce();
    });
  });

  it('counts a placeholder only for the control that opts in', () => {
    withWarnSpy((warn) => {
      warnIfUnnamed(element('<input placeholder="Search templates...">'), 'mj-page-search', { placeholderIsName: true });
      expect(warn).not.toHaveBeenCalled();
    });
  });

  it('stays silent when a <label for> points at a LABELABLE control', () => {
    withWarnSpy((warn) => {
      const el = element('<input id="qty-field">');
      document.body.appendChild(element('<label for="qty-field">Quantity</label>'));
      warnIfUnnamed(el, 'mj-numeric-input');
      expect(warn).not.toHaveBeenCalled();
    });
  });

  it('stays silent for a <button>, which is labelable too', () => {
    // mj-switch's trigger. label[for] both names it — outranking its own On/Off text — and, on
    // click, focuses and toggles it.
    withWarnSpy((warn) => {
      const el = element('<button id="notify-switch" role="switch">Off</button>');
      document.body.appendChild(element('<label for="notify-switch">Email notifications</label>'));
      warnIfUnnamed(el, 'mj-switch');
      expect(warn).not.toHaveBeenCalled();
    });
  });

  it('warns when a <label for> points at a NON-labelable element', () => {
    // mj-dropdown's trigger is a div[role=combobox]. label[for] associates only with labelable
    // elements, so this is the markup that looks correct and is not: Blink names the div anyway,
    // Gecko and WebKit do not, and a name that depends on the browser is the defect this guard is
    // for. InputId's own documentation warns callers off exactly this wiring.
    withWarnSpy((warn) => {
      const el = element('<div id="role-dd" role="combobox" tabindex="0">Administrator</div>');
      document.body.appendChild(element('<label for="role-dd">Role</label>'));
      warnIfUnnamed(el, 'mj-dropdown');
      expect(warn).toHaveBeenCalledOnce();
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
 * mj-page-search is deliberately absent from the table above: it is the one control that opts into
 * `placeholderIsName`, because its placeholder ("Search templates…") IS the caller's statement of
 * what the box searches and its default is never absent. Every other control warns without a real
 * name, placeholder or not.
 */
describe('mj-page-search and the placeholder fallback', () => {
  it('accepts a placeholder the caller chose', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    renderComponentFixture(MJPageSearchComponent, { inputs: { Placeholder: 'Search templates...' } });
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it.each([
    ['the generic default placeholder', {}],
    ['no placeholder at all', { Placeholder: '' }],
  ])('warns on %s', (_case, inputs) => {
    // Inheriting "Search..." is not naming the box: it tells a screen-reader user nothing about
    // what is being searched, and accepting it would leave this control's guard unable to fire.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    renderComponentFixture(MJPageSearchComponent, { inputs });
    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0][0])).toContain('mj-page-search');
    warn.mockRestore();
  });
});
