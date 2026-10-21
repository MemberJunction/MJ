import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import { getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { renderComponentFixture, query, queryAll, text } from '@memberjunction/ng-test-utils';
import { AtRiskRules } from '@memberjunction/predictive-studio-core';
import { PSRowDriversComponent } from './ps-row-drivers.component';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {
  // already initialized
}

const render = (inputs: Pick<PSRowDriversComponent, 'Drivers'>) => renderComponentFixture(PSRowDriversComponent, { inputs });

describe('PSRowDriversComponent (DOM) — W1 → S9.4', () => {
  it('renders "Lowers Risk" for AutoRenew on a P(renew) model', () => {
    const drivers = AtRiskRules.ParseRowDrivers([{ feature: 'AutoRenew', value: 1.135756 }], true) || [];
    const fixture = render({ Drivers: drivers });
    expect(text(fixture, '[data-testid="ps-row-driver-badge"]')).toBe('Lowers Risk');
    expect(query(fixture, '.ps-badge.green')).not.toBeNull();
  });

  it('renders "Increases Risk" for a contribution that raises the adverse score', () => {
    const drivers = AtRiskRules.ParseRowDrivers([{ feature: 'DaysLate', value: 0.7 }], false) || [];
    const fixture = render({ Drivers: drivers });
    expect(text(fixture, '[data-testid="ps-row-driver-badge"]')).toBe('Increases Risk');
  });

  it('shows the empty message when no per-row breakdown exists', () => {
    const fixture = render({ Drivers: [] });
    expect(query(fixture, '[data-testid="ps-row-drivers-empty"]')).not.toBeNull();
    expect(queryAll(fixture, '[data-testid="ps-row-driver-badge"]')).toHaveLength(0);
  });
});
