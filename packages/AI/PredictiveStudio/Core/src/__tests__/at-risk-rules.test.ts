import { describe, it, expect } from 'vitest';
import { AtRiskRules, AT_RISK_LIST_MIN_RISK_PCT, type AtRiskRow } from '../at-risk-rules';

describe('AtRiskRules.ParseAtRiskRows', () => {
  it('parses + ranks per-record predictions highest-risk first, with bands', () => {
    const rows = AtRiskRules.ParseAtRiskRows([
      { RecordID: 'a', ResultPayload: JSON.stringify({ score: 0.42, class: 'Active' }) },
      { RecordID: 'b', ResultPayload: JSON.stringify({ score: 0.88, class: 'Active' }) },
      { RecordID: 'c', ResultPayload: JSON.stringify({ score: 0.12, class: 'Active' }) },
    ]);
    expect(rows.map((r) => r.RecordID)).toEqual(['b', 'a', 'c']);
    expect(rows[0]).toMatchObject({ RiskPct: 88, Band: 'high' });
    expect(rows[1].Band).toBe('medium');
    expect(rows[2].Band).toBe('low');
  });

  it('inverts risk when the InvertedRisk option is true (e.g. renewal models predicting P(Renewed))', () => {
    const rows = AtRiskRules.ParseAtRiskRows([
      { RecordID: 'loyal', ResultPayload: JSON.stringify({ score: 0.98, class: 'Renewed' }) },
      { RecordID: 'borderline', ResultPayload: JSON.stringify({ score: 0.50, class: 'Renewed' }) },
      { RecordID: 'churning', ResultPayload: JSON.stringify({ score: 0.15, class: 'Lapsed' }) },
    ], { InvertedRisk: true });

    // Highest risk of churn is ranked first
    expect(rows.map((r) => r.RecordID)).toEqual(['churning', 'borderline', 'loyal']);
    expect(rows[0]).toMatchObject({ RecordID: 'churning', Score: 0.15, RiskPct: 85, Band: 'high' });
    expect(rows[1]).toMatchObject({ RecordID: 'borderline', Score: 0.50, RiskPct: 50, Band: 'medium' });
    expect(rows[2]).toMatchObject({ RecordID: 'loyal', Score: 0.98, RiskPct: 2, Band: 'low' });
  });

  it('parses per-record drivers: humanizes labels, KEEPS the one-hot category, and signs them', () => {
    const rows = AtRiskRules.ParseAtRiskRows([
      {
        RecordID: 'm1',
        ResultPayload: JSON.stringify({
          score: 0.9,
          class: 'Churn',
          drivers: [
            { feature: 'OverdueInvoices', value: 1.4 },
            { feature: 'MembershipType=Student', value: -0.8 },
          ],
        }),
      },
      { RecordID: 'm2', ResultPayload: JSON.stringify({ score: 0.3 }) }, // no drivers → null
    ]);
    expect(rows[0].Drivers).toEqual([
      { Label: 'Overdue Invoices', Value: 1.4, Up: true },
      // Per-record "why" keeps the category — "Membership Type = Student" is the actionable sentence;
      // collapsing to "Membership Type" is only right for GLOBAL importance (TopGlobalDrivers).
      { Label: 'Membership Type = Student', Value: -0.8, Up: false },
    ]);
    expect(rows[1].Drivers).toBeNull();
  });

  it('skips driver entries that are not objects or carry no usable feature/value', () => {
    expect(AtRiskRules.ParseRowDrivers([null, 'x', 7, { feature: 'A' }, { feature: 'Tenure', weight: 0.5 }], false)).toEqual([
      { Label: 'Tenure', Value: 0.5, Up: true },
    ]);
    expect(AtRiskRules.ParseRowDrivers('not an array', false)).toBeNull();
  });

  it('normalizes the write-back `output` nesting and skips junk', () => {
    const rows = AtRiskRules.ParseAtRiskRows([
      { RecordID: 'w', ResultPayload: JSON.stringify({ output: { score: 0.77, class: 'Active' }, writeBack: {} }) },
      { RecordID: 'x', ResultPayload: 'not json' },
      { RecordID: 'y', ResultPayload: null },
      { RecordID: 'z', ResultPayload: '42' },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ RecordID: 'w', RiskPct: 77 });
  });

  it('resolves status, badge color and icon from the outcome config; a custom band key maps to a RiskBand', () => {
    const customConfig = {
      ScoreLabel: 'Renewal Probability',
      StatusLabel: 'Renewal Status',
      Polarity: 'positive' as const,
      Bands: [
        { Key: 'super-safe', Label: 'Very Safe', Min: 0.8, Max: 1.0, BadgeColor: 'green' as const, Icon: 'fa-star' },
        { Key: 'medium', Label: 'Needs Watch', Min: 0.4, Max: 0.7999, BadgeColor: 'amber' as const, Icon: 'fa-eye' },
        { Key: 'danger', Label: 'Critical Danger', Min: 0.0, Max: 0.3999, BadgeColor: 'red' as const, Icon: 'fa-skull' },
      ],
    };

    const rows = AtRiskRules.ParseAtRiskRows([
      { RecordID: 'safe', ResultPayload: JSON.stringify({ score: 0.95, class: 'Renewed' }) },
      { RecordID: 'med', ResultPayload: JSON.stringify({ score: 0.55, class: 'Renewed' }) },
      { RecordID: 'crit', ResultPayload: JSON.stringify({ score: 0.10, class: 'Lapsed' }) },
    ], { OutcomeConfig: customConfig });

    expect(rows).toHaveLength(3);
    expect(rows.find((r) => r.RecordID === 'safe')).toMatchObject({ Band: 'low', Status: 'Very Safe', BadgeColor: 'green', Icon: 'fa-star' });
    expect(rows.find((r) => r.RecordID === 'med')).toMatchObject({ Band: 'medium', Status: 'Needs Watch' });
    expect(rows.find((r) => r.RecordID === 'crit')).toMatchObject({ Band: 'low', Status: 'Critical Danger', BadgeColor: 'red', Icon: 'fa-skull' });
  });

  it('respects pre-evaluated payload fields (status, band, badgeColor, icon) when present', () => {
    const rows = AtRiskRules.ParseAtRiskRows([
      {
        RecordID: 'pre-eval',
        ResultPayload: JSON.stringify({
          score: 0.88,
          class: 'Active',
          status: 'Custom High Status',
          band: 'high',
          badgeColor: 'blue',
          icon: 'fa-shield',
        }),
      },
    ]);

    expect(rows[0]).toMatchObject({ Band: 'high', Status: 'Custom High Status', BadgeColor: 'blue', Icon: 'fa-shield' });
  });
});

describe('AtRiskRules.TopGlobalDrivers', () => {
  it('collapses one-hot columns to plain features, ranked by importance, and humanizes the labels', () => {
    const json = JSON.stringify({ 'MembershipType=Student': 0.3, 'MembershipType=Corporate': 0.97, AutoRenew: 0.6, 'MembershipType=Retired': 0.1 });
    // camelCase base names are humanized for display: MembershipType → "Membership Type", AutoRenew → "Auto Renew".
    expect(AtRiskRules.TopGlobalDrivers(json, 2)).toEqual(['Membership Type', 'Auto Renew']);
  });

  it('handles the array form + signed weights, and tolerates junk', () => {
    expect(AtRiskRules.TopGlobalDrivers(JSON.stringify([{ feature: 'Tenure', importance: -0.9 }, { name: 'Logins', value: 0.4 }, null]), 5)).toEqual(['Tenure', 'Logins']);
    expect(AtRiskRules.TopGlobalDrivers('garbage')).toEqual([]);
    expect(AtRiskRules.TopGlobalDrivers(null)).toEqual([]);
  });
});

describe('AtRiskRules.HumanizeFeatureName', () => {
  it('spaces camelCase and title-cases', () => {
    expect(AtRiskRules.HumanizeFeatureName('RetentionOverdueInvoices')).toBe('Retention Overdue Invoices');
  });
  it('converts snake_case and kebab-case to spaced words', () => {
    expect(AtRiskRules.HumanizeFeatureName('overdue_invoices')).toBe('Overdue invoices');
    expect(AtRiskRules.HumanizeFeatureName('event-attendance')).toBe('Event attendance');
  });
  it('passes already-spaced labels through unchanged (aside from leading capitalization)', () => {
    expect(AtRiskRules.HumanizeFeatureName('Event Attendance')).toBe('Event Attendance');
  });
});

describe('AtRiskRules.BuildAtRiskOptions (one polarity rule)', () => {
  it('inverts risk for a model whose outcome config says the score is the good outcome', () => {
    const lineage = JSON.stringify({ outcomeConfig: { Polarity: 'positive' } });
    expect(AtRiskRules.BuildAtRiskOptions({ Lineage: lineage, TargetVariable: 'X', ProblemType: 'classification' }).InvertedRisk).toBe(true);
  });
  it('does not invert an adverse-polarity model', () => {
    const lineage = JSON.stringify({ outcomeConfig: { Polarity: 'adverse' } });
    expect(AtRiskRules.BuildAtRiskOptions({ Lineage: lineage, TargetVariable: 'X', ProblemType: 'classification' }).InvertedRisk).toBe(false);
  });
  it('no polarity → no inversion: nothing guessed from payload text', () => {
    expect(AtRiskRules.BuildAtRiskOptions({ Lineage: null, TargetVariable: 'Outcome', ProblemType: 'classification' }).InvertedRisk).toBe(false);
  });
  it('never inverts a regression model', () => {
    const lineage = JSON.stringify({ outcomeConfig: { Polarity: 'positive' } });
    expect(AtRiskRules.BuildAtRiskOptions({ Lineage: lineage, TargetVariable: 'X', ProblemType: 'regression' }).InvertedRisk).toBe(false);
  });
  it('carries the resolved outcome config', () => {
    expect(AtRiskRules.BuildAtRiskOptions({ Lineage: null, TargetVariable: 'Renewed', ProblemType: 'classification' }).OutcomeConfig?.Polarity).toBe('positive');
  });
});

describe('AtRiskRules.LabelFromRecord', () => {
  it('uses the entity name field', () => {
    expect(AtRiskRules.LabelFromRecord({ DisplayName: 'Ada', MemberName: 'ignored' }, 'DisplayName')).toBe('Ada');
  });
  it('falls back to FirstName/LastName/Email, then null', () => {
    expect(AtRiskRules.LabelFromRecord({ FirstName: 'Ada', LastName: 'L' }, null)).toBe('Ada L');
    expect(AtRiskRules.LabelFromRecord({}, null)).toBeNull();
  });
});

describe('driver direction follows the displayed risk (W1 → S9.4, F-UI-3)', () => {
  it('a positive contribution to P(renew) lowers risk', () => {
    expect(AtRiskRules.DriverRaisesRisk(1.135756, true)).toBe(false);
  });
  it('a positive contribution to P(lapse) raises risk', () => {
    expect(AtRiskRules.DriverRaisesRisk(0.42, false)).toBe(true);
  });
  it('AtRiskRules.ParseAtRiskRows signs drivers relative to the inverted risk', () => {
    const rows = AtRiskRules.ParseAtRiskRows(
      [{ RecordID: 'm1', ResultPayload: JSON.stringify({ score: 0.91, class: '1', drivers: [{ feature: 'AutoRenew', value: 1.135756 }, { feature: 'Plan=Basic', value: -0.301 }] }) }],
      { InvertedRisk: true },
    );
    expect(rows[0].Drivers?.map((d) => [d.Label, d.Up])).toEqual([['Auto Renew', false], ['Plan = Basic', true]]);
  });
});

describe('the At-Risk list is the highest-risk rows (W1 → S9.5, F-UI-4)', () => {
  // W1-shaped payloads: target "Renewed", classes "0"/"1", score = P("1") = P(renew).
  const truth: Record<string, number> = { a: 0.95, b: 0.9, c: 0.85, d: 0.6, e: 0.4, f: 0.3, g: 0.2 };
  const scores: Record<string, number> = { a: 0.96, b: 0.92, c: 0.88, d: 0.62, e: 0.41, f: 0.33, g: 0.18 };
  const details = Object.keys(scores).map((id) => ({ RecordID: id, ResultPayload: JSON.stringify({ score: scores[id], class: scores[id] >= 0.5 ? '1' : '0' }) }));
  const renewedModel = { Lineage: null, TargetVariable: 'Renewed', ProblemType: 'classification' };

  it('AtRiskRules.BuildAtRiskOptions inverts a P(renew) model', () => {
    expect(AtRiskRules.BuildAtRiskOptions(renewedModel).InvertedRisk).toBe(true);
    expect(AtRiskRules.BuildAtRiskOptions({ Lineage: null, TargetVariable: 'IsSLABreached', ProblemType: 'classification' }).InvertedRisk).toBe(false);
  });

  it('selects the highest-risk rows, at or above the minimum risk, up to the limit', () => {
    const rows = AtRiskRules.ParseAtRiskRows(details, AtRiskRules.BuildAtRiskOptions(renewedModel));
    const list = AtRiskRules.SelectAtRiskListMembers(rows, 3);
    expect(list.map((r) => r.RecordID)).toEqual(['g', 'f', 'e']);
    expect(list.every((r) => r.RiskPct >= AT_RISK_LIST_MIN_RISK_PCT)).toBe(true);
    const mean = (ids: string[]): number => ids.reduce((s, id) => s + truth[id], 0) / ids.length;
    expect(mean(list.map((r) => r.RecordID))).toBeLessThan(mean(Object.keys(truth)));
  });

  it('never pads the list with low-risk rows', () => {
    const rows: AtRiskRow[] = [10, 20, 39].map((riskPct, i) => ({ RecordID: `r${i}`, Label: null, Score: 1 - riskPct / 100, RiskPct: riskPct, Class: null, Band: 'low', Drivers: null }));
    expect(AtRiskRules.SelectAtRiskListMembers(rows, 200)).toEqual([]);
  });

  it('truncates long prediction titles so MJ: Lists.Name never exceeds 100 characters (F-R)', () => {
    const shortName = AtRiskRules.FormatAtRiskListName('Member Renewal Risk', '2026-10-22 10:50');
    expect(shortName).toBe('At-Risk: Member Renewal Risk (2026-10-22 10:50)');
    expect(shortName.length).toBeLessThanOrEqual(100);

    const longTitle = 'PSTruth: W3-leak logistic_regression pr-2026-10-21T23-37-12-954Z extra-long-suffix-for-test';
    const longName = AtRiskRules.FormatAtRiskListName(longTitle, '2026-10-22 10:50');
    expect(longName.length).toBeLessThanOrEqual(100);
    expect(longName.startsWith('At-Risk: PSTruth: W3-leak logistic_regression')).toBe(true);
    expect(longName.endsWith('… (2026-10-22 10:50)')).toBe(true);
  });
});
