import { describe, it, expect } from 'vitest';
import {
  ParseAtRiskRows,
  ResolveRenewalPolarity,
  TopGlobalDrivers,
  HumanizeFeatureName,
} from '../PredictiveStudio/at-risk.view-models';

describe('parseAtRiskRows', () => {
  it('parses + ranks per-record predictions highest-risk first, with bands', () => {
    const rows = ParseAtRiskRows([
      { recordId: 'a', ResultPayload: JSON.stringify({ score: 0.42, class: 'Active' }) },
      { recordId: 'b', ResultPayload: JSON.stringify({ score: 0.88, class: 'Active' }) },
      { recordId: 'c', ResultPayload: JSON.stringify({ score: 0.12, class: 'Active' }) },
    ]);
    expect(rows.map((r) => r.recordId)).toEqual(['b', 'a', 'c']);
    expect(rows[0]).toMatchObject({ riskPct: 88, band: 'high' });
    expect(rows[1].band).toBe('medium');
    expect(rows[2].band).toBe('low');
  });

  it('inverts risk when invertedRisk option is true (e.g. renewal models predicting P(Renewed))', () => {
    const rows = ParseAtRiskRows([
      { recordId: 'loyal', ResultPayload: JSON.stringify({ score: 0.98, class: 'Renewed' }) },
      { recordId: 'borderline', ResultPayload: JSON.stringify({ score: 0.50, class: 'Renewed' }) },
      { recordId: 'churning', ResultPayload: JSON.stringify({ score: 0.15, class: 'Lapsed' }) },
    ], { InvertedRisk: true });

    // Highest risk of churn is ranked first
    expect(rows.map((r) => r.recordId)).toEqual(['churning', 'borderline', 'loyal']);
    expect(rows[0]).toMatchObject({ recordId: 'churning', score: 0.15, riskPct: 85, band: 'high' });
    expect(rows[1]).toMatchObject({ recordId: 'borderline', score: 0.50, riskPct: 50, band: 'medium' });
    expect(rows[2]).toMatchObject({ recordId: 'loyal', score: 0.98, riskPct: 2, band: 'low' });
  });

  it('parses per-record drivers: humanizes labels, KEEPS the one-hot category, and signs them', () => {
    const rows = ParseAtRiskRows([
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
      // Per-record "why" keeps the category — "Membership Type = Student" is the actionable sentence;
      // collapsing to "Membership Type" is only right for GLOBAL importance (topGlobalDrivers).
      { label: 'Membership Type = Student', value: -0.8, up: false },
    ]);
    expect(rows[1].drivers).toBeNull();
  });

  it('normalizes the write-back `output` nesting and skips junk', () => {
    const rows = ParseAtRiskRows([
      { recordId: 'w', ResultPayload: JSON.stringify({ output: { score: 0.77, class: 'Active' }, writeBack: {} }) },
      { recordId: 'x', ResultPayload: 'not json' },
      { recordId: 'y', ResultPayload: null },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ recordId: 'w', riskPct: 77 });
  });

  it('resolves dynamic band, status, badgeColor, and icon from outcomeConfig', () => {
    const customConfig = {
      ScoreLabel: 'Renewal Probability',
      StatusLabel: 'Renewal Status',
      Polarity: 'positive' as const,
      Bands: [
        { Key: 'super-safe', Label: 'Very Safe', Min: 0.8, Max: 1.0, BadgeColor: 'green' as const, Icon: 'fa-star' },
        { Key: 'watch', Label: 'Needs Watch', Min: 0.4, Max: 0.7999, BadgeColor: 'amber' as const, Icon: 'fa-eye' },
        { Key: 'danger', Label: 'Critical Danger', Min: 0.0, Max: 0.3999, BadgeColor: 'red' as const, Icon: 'fa-skull' },
      ],
    };

    const rows = ParseAtRiskRows([
      { recordId: 'safe', ResultPayload: JSON.stringify({ score: 0.95, class: 'Renewed' }) },
      { recordId: 'med', ResultPayload: JSON.stringify({ score: 0.55, class: 'Renewed' }) },
      { recordId: 'crit', ResultPayload: JSON.stringify({ score: 0.10, class: 'Lapsed' }) },
    ], { OutcomeConfig: customConfig });

    expect(rows).toHaveLength(3);
    const safeRow = rows.find((r) => r.recordId === 'safe');
    expect(safeRow).toMatchObject({
      band: 'super-safe',
      status: 'Very Safe',
      badgeColor: 'green',
      icon: 'fa-star',
    });

    const critRow = rows.find((r) => r.recordId === 'crit');
    expect(critRow).toMatchObject({
      band: 'danger',
      status: 'Critical Danger',
      badgeColor: 'red',
      icon: 'fa-skull',
    });
  });

  it('respects pre-evaluated payload fields (status, band, badgeColor, icon) when present', () => {
    const rows = ParseAtRiskRows([
      {
        recordId: 'pre-eval',
        ResultPayload: JSON.stringify({
          score: 0.88,
          class: 'Active',
          status: 'Custom High Status',
          band: 'custom-band',
          badgeColor: 'blue',
          icon: 'fa-shield',
        }),
      },
    ]);

    expect(rows[0]).toMatchObject({
      band: 'custom-band',
      status: 'Custom High Status',
      badgeColor: 'blue',
      icon: 'fa-shield',
    });
  });
});

describe('topGlobalDrivers', () => {
  it('collapses one-hot columns to plain features, ranked by importance, and humanizes the labels', () => {
    const json = JSON.stringify({ 'MembershipType=Student': 0.3, 'MembershipType=Corporate': 0.97, AutoRenew: 0.6, 'MembershipType=Retired': 0.1 });
    // camelCase base names are humanized for display: MembershipType → "Membership Type", AutoRenew → "Auto Renew".
    expect(TopGlobalDrivers(json, 2)).toEqual(['Membership Type', 'Auto Renew']);
  });

  it('handles the array form + signed weights, and tolerates junk', () => {
    expect(TopGlobalDrivers(JSON.stringify([{ feature: 'Tenure', importance: -0.9 }, { name: 'Logins', value: 0.4 }]), 5)).toEqual(['Tenure', 'Logins']);
    expect(TopGlobalDrivers('garbage')).toEqual([]);
    expect(TopGlobalDrivers(null)).toEqual([]);
  });
});

describe('humanizeFeatureName', () => {
  it('spaces camelCase and title-cases', () => {
    expect(HumanizeFeatureName('RetentionOverdueInvoices')).toBe('Retention Overdue Invoices');
  });
  it('converts snake_case and kebab-case to spaced words', () => {
    expect(HumanizeFeatureName('overdue_invoices')).toBe('Overdue invoices');
    expect(HumanizeFeatureName('event-attendance')).toBe('Event attendance');
  });
  it('passes already-spaced labels through unchanged (aside from leading capitalization)', () => {
    expect(HumanizeFeatureName('Event Attendance')).toBe('Event Attendance');
  });
});

describe('resolveRenewalPolarity', () => {
  it('detects adverse lapse risk models (score is P(Lapse), low score for Renewed records)', () => {
    const payloads = [
      JSON.stringify({ output: { score: 0.0112, class: 'Renewed', target: 'Renewal Risk' } }),
      JSON.stringify({ output: { score: 0.0245, class: 'Renewed', target: 'Renewal Risk' } }),
      JSON.stringify({ output: { score: 0.8912, class: 'Lapsed', target: 'Renewal Risk' } }),
    ];
    const result = ResolveRenewalPolarity(payloads, 'Renewal Risk', 'MoreCheese: Member Renewal Risk');
    expect(result.IsRenewalModel).toBe(true);
    expect(result.ScoreIsLapseRisk).toBe(true);
  });

  it('detects positive outcome renewal models (score is P(Renewed), high score for Renewed records)', () => {
    const payloads = [
      JSON.stringify({ score: 0.985, class: 'Renewed' }),
      JSON.stringify({ score: 0.920, class: 'Renewed' }),
      JSON.stringify({ score: 0.150, class: 'Lapsed' }),
    ];
    const result = ResolveRenewalPolarity(payloads, 'Status', 'Contract Renewal Propensity');
    expect(result.IsRenewalModel).toBe(true);
    expect(result.ScoreIsLapseRisk).toBe(false);
  });

  it('correctly marks non-renewal models as isRenewalModel = false', () => {
    const payloads = [
      JSON.stringify({ score: 0.75, class: 'Breached' }),
      JSON.stringify({ score: 0.12, class: 'OnTrack' }),
    ];
    const result = ResolveRenewalPolarity(payloads, 'IsSLABreached', 'Tasks: SLA Breach Risk');
    expect(result.IsRenewalModel).toBe(false);
    expect(result.ScoreIsLapseRisk).toBe(false);
  });
});
