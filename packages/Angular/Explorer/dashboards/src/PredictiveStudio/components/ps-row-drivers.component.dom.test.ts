import '@angular/compiler';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { renderComponentFixture, query, queryAll, text } from '@memberjunction/ng-test-utils';
import { AtRiskRules, type SemanticsCheckBinding } from '@memberjunction/predictive-studio-core';
import { PSRowDriversComponent } from './ps-row-drivers.component';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {
  // already initialized
}

const render = (inputs: Pick<PSRowDriversComponent, 'Drivers'>) => renderComponentFixture(PSRowDriversComponent, { inputs });

/** A raw per-record driver as a scoring payload stores it. */
interface RawDriver {
  feature: string;  // case-violation-ok-legacy-back-compat: stored scoring payload JSON key
  value: number;  // case-violation-ok-legacy-back-compat: stored scoring payload JSON key
}

/** What {@link RenderDrivers} renders: the binding row's fields under test, the raw drivers, and the model's polarity. */
interface RenderDriversOptions {
  binding: Partial<SemanticsCheckBinding>;
  drivers: RawDriver[];
  invertedRisk?: boolean;
}

/** A complete why-badge binding row: the defaults a classification model gets, overridden by `fields`. */
const whyBadge = (fields: Partial<SemanticsCheckBinding>): SemanticsCheckBinding => ({
  BindingID: 'B-why', Surface: 'why-badge', SortsBy: 'none', DriverDirectionRelativeTo: 'adverse-class', Label: 'Risk', ...fields,
});

/**
 * Renders the widget into `host` as the grid does: the raw drivers signed by Core for the binding row
 * (`AtRiskRules.ParseRowDrivers`), the row itself as `Binding`.
 */
async function RenderDrivers(host: HTMLElement, options: RenderDriversOptions): Promise<void> {
  const binding = whyBadge(options.binding);
  const drivers = AtRiskRules.ParseRowDrivers(options.drivers, options.invertedRisk === true, binding) || [];
  const fixture = renderComponentFixture(PSRowDriversComponent, { inputs: { Drivers: drivers, Binding: binding } });
  host.appendChild(fixture.nativeElement);
}

/** Each rendered driver's arrow: `up` or `down`. */
const DriverArrows = (host: HTMLElement): string[] =>
  Array.from(host.querySelectorAll('[data-testid="ps-row-driver-label"] i')).map((i) => (i.classList.contains('fa-arrow-up') ? 'up' : i.classList.contains('fa-arrow-down') ? 'down' : 'none'));

describe('PSRowDriversComponent (DOM)', () => {
  it('renders "Lowers Risk" for AutoRenew on a P(renew) model', () => {
    const drivers = AtRiskRules.ParseRowDrivers([{ feature: 'AutoRenew', value: 1.135756 }], true) || [];
    const fixture = render({ Drivers: drivers });
    expect(text(fixture, '[data-testid="ps-row-driver-badge"]')).toBe('Lowers Risk');
    expect(query(fixture, '.ps-badge.green')).not.toBeNull();
    const arrow = query(fixture, '[data-testid="ps-row-driver-label"] i');
    expect(arrow?.classList.contains('fa-arrow-down')).toBe(true);
    expect(arrow?.classList.contains('fa-arrow-up')).toBe(false);
  });

  it('renders "Increases Risk" for a contribution that raises the adverse score', () => {
    const drivers = AtRiskRules.ParseRowDrivers([{ feature: 'DaysLate', value: 0.7 }], false) || [];
    const fixture = render({ Drivers: drivers });
    expect(text(fixture, '[data-testid="ps-row-driver-badge"]')).toBe('Increases Risk');
    const arrow = query(fixture, '[data-testid="ps-row-driver-label"] i');
    expect(arrow?.classList.contains('fa-arrow-up')).toBe(true);
    expect(arrow?.classList.contains('fa-arrow-down')).toBe(false);
  });

  it('shows the empty message when no per-row breakdown exists', () => {
    const fixture = render({ Drivers: [] });
    expect(query(fixture, '[data-testid="ps-row-drivers-empty"]')).not.toBeNull();
    expect(queryAll(fixture, '[data-testid="ps-row-driver-badge"]')).toHaveLength(0);
  });
});

describe('PSRowDriversComponent (DOM) — from the why-badge binding row', () => {
  let fixture: HTMLElement;
  beforeEach(() => {
    fixture = document.createElement('div');
    document.body.appendChild(fixture);
  });
  afterEach(() => fixture.remove());

  it('labels the why-badge from the binding row and signs drivers relative to the adverse class', async () => {
    await RenderDrivers(fixture, { binding: { Surface: 'why-badge', DriverDirectionRelativeTo: 'adverse-class', Label: 'Lapse risk' }, drivers: [{ feature: 'Tenure', value: -0.4 }] });
    expect(fixture.textContent).toContain('Lapse risk');
    expect(DriverArrows(fixture)).toEqual(['down']);
  });

  it('a raw-contribution binding follows the raw sign whatever the polarity', async () => {
    const raw: Partial<SemanticsCheckBinding> = { Surface: 'why-badge', DriverDirectionRelativeTo: 'raw-contribution', Label: 'Predicted value' };
    const arrows: string[] = [];
    for (const invertedRisk of [false, true]) {
      // each render replaces the previous fixture, so the arrows are read after each one
      await RenderDrivers(fixture, { binding: raw, drivers: [{ feature: 'Tenure', value: -0.4 }], invertedRisk });
      arrows.push(...DriverArrows(fixture));
      expect(fixture.textContent).toContain('Lowers Predicted value');
    }
    expect(arrows).toEqual(['down', 'down']);
  });

  it('an adverse-class binding on a P(good outcome) model points a negative contribution up', async () => {
    await RenderDrivers(fixture, { binding: { DriverDirectionRelativeTo: 'adverse-class', Label: 'Lapse risk' }, drivers: [{ feature: 'Tenure', value: -0.4 }], invertedRisk: true });
    expect(DriverArrows(fixture)).toEqual(['up']);
  });
});
