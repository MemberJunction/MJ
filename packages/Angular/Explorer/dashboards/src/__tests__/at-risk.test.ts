import { describe, it, expect } from 'vitest';
import { parseAtRiskRows, topGlobalDrivers, humanizeFeatureName } from '../PredictiveStudio/at-risk.view-models';

describe('parseAtRiskRows', () => {
  it('parses + ranks per-record predictions highest-risk first, with bands', () => {
    const rows = parseAtRiskRows([
      { recordId: 'a', ResultPayload: JSON.stringify({ score: 0.42, class: 'Active' }) },
      { recordId: 'b', ResultPayload: JSON.stringify({ score: 0.88, class: 'Active' }) },
      { recordId: 'c', ResultPayload: JSON.stringify({ score: 0.12, class: 'Active' }) },
    ]);
    expect(rows.map((r) => r.recordId)).toEqual(['b', 'a', 'c']);
    expect(rows[0]).toMatchObject({ riskPct: 88, band: 'high' });
    expect(rows[1].band).toBe('medium');
    expect(rows[2].band).toBe('low');
  });

  it('parses per-record drivers: collapses one-hot, humanizes labels, and signs them', () => {
    const rows = parseAtRiskRows([
      {
        recordId: 'm1',
        ResultPayload: JSON.stringify({
          score: 0.9,
          class: 'Churn',
          drivers: [
            { feature: 'OverdueInvoices', value: 1.4 },
            { feature: 'MembershipType=Student', value: -0.8 },
          ],
        }),
      },
      { recordId: 'm2', ResultPayload: JSON.stringify({ score: 0.3 }) }, // no drivers → null
    ]);
    expect(rows[0].drivers).toEqual([
      { label: 'Overdue Invoices', value: 1.4, up: true },
      { label: 'Membership Type', value: -0.8, up: false },
    ]);
    expect(rows[1].drivers).toBeNull();
  });

  it('normalizes the write-back `output` nesting and skips junk', () => {
    const rows = parseAtRiskRows([
      { recordId: 'w', ResultPayload: JSON.stringify({ output: { score: 0.77, class: 'Active' }, writeBack: {} }) },
      { recordId: 'x', ResultPayload: 'not json' },
      { recordId: 'y', ResultPayload: null },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ recordId: 'w', riskPct: 77 });
  });
});

describe('topGlobalDrivers', () => {
  it('collapses one-hot columns to plain features, ranked by importance, and humanizes the labels', () => {
    const json = JSON.stringify({ 'MembershipType=Student': 0.3, 'MembershipType=Corporate': 0.97, AutoRenew: 0.6, 'MembershipType=Retired': 0.1 });
    // camelCase base names are humanized for display: MembershipType → "Membership Type", AutoRenew → "Auto Renew".
    expect(topGlobalDrivers(json, 2)).toEqual(['Membership Type', 'Auto Renew']);
  });

  it('handles the array form + signed weights, and tolerates junk', () => {
    expect(topGlobalDrivers(JSON.stringify([{ feature: 'Tenure', importance: -0.9 }, { name: 'Logins', value: 0.4 }]), 5)).toEqual(['Tenure', 'Logins']);
    expect(topGlobalDrivers('garbage')).toEqual([]);
    expect(topGlobalDrivers(null)).toEqual([]);
  });
});

describe('humanizeFeatureName', () => {
  it('spaces camelCase and title-cases', () => {
    expect(humanizeFeatureName('RetentionOverdueInvoices')).toBe('Retention Overdue Invoices');
  });
  it('converts snake_case and kebab-case to spaced words', () => {
    expect(humanizeFeatureName('overdue_invoices')).toBe('Overdue invoices');
    expect(humanizeFeatureName('event-attendance')).toBe('Event attendance');
  });
  it('passes already-spaced labels through unchanged (aside from leading capitalization)', () => {
    expect(humanizeFeatureName('Event Attendance')).toBe('Event Attendance');
  });
});
