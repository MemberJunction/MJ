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

  it('takes status, badge color and icon from the risk band, so the badge and the High/Medium/Low count agree', () => {
    const rows = AtRiskRules.ParseAtRiskRows([
      { RecordID: 'safe', ResultPayload: JSON.stringify({ score: 0.95, class: 'Renewed' }) },
      { RecordID: 'med', ResultPayload: JSON.stringify({ score: 0.55, class: 'Renewed' }) },
      { RecordID: 'crit', ResultPayload: JSON.stringify({ score: 0.10, class: 'Lapsed' }) },
    ], { InvertedRisk: true });

    expect(rows.find((r) => r.RecordID === 'safe')).toMatchObject({ RiskPct: 5, Band: 'low', Status: 'Low risk', BadgeColor: 'green', Icon: 'fa-circle-check' });
    expect(rows.find((r) => r.RecordID === 'med')).toMatchObject({ RiskPct: 45, Band: 'medium', Status: 'Medium risk', BadgeColor: 'amber' });
    expect(rows.find((r) => r.RecordID === 'crit')).toMatchObject({ RiskPct: 90, Band: 'high', Status: 'High risk', BadgeColor: 'red', Icon: 'fa-circle-exclamation' });
  });

  it('a renewal score of 0.35 is medium risk with a medium-risk badge, not a red "Low" renewal badge (I1)', () => {
    const rows = AtRiskRules.ParseAtRiskRows(
      [{ RecordID: 'r', ResultPayload: JSON.stringify({ score: 0.35 }) }],
      AtRiskRules.BuildAtRiskOptions({ Lineage: null, TargetVariable: 'Renewed', ProblemType: 'classification' }),
    );
    expect(rows[0]).toMatchObject({ RiskPct: 65, Band: 'medium', Status: 'Medium risk', BadgeColor: 'amber' });
  });

  it('clamps a score outside 0–1 (a regression value) to risk 100 instead of 250000%', () => {
    const rows = AtRiskRules.ParseAtRiskRows([{ RecordID: 'ltv', ResultPayload: JSON.stringify({ score: 2500 }) }]);
    expect(rows[0]).toMatchObject({ Score: 2500, RiskPct: 100, Band: 'high' });
  });

  it('respects pre-evaluated payload display fields (status, badgeColor, icon); a payload band never overrides the risk band', () => {
    const rows = AtRiskRules.ParseAtRiskRows([
      {
        RecordID: 'pre-eval',
        ResultPayload: JSON.stringify({
          score: 0.88,
          class: 'Active',
          status: 'Custom High Status',
          band: 'low',
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
  it('bands a positive-polarity (renewal) model on risk, not on the raw score', () => {
    const rows = AtRiskRules.ParseAtRiskRows(
      [
        { RecordID: 'loyal', ResultPayload: JSON.stringify({ score: 0.98 }) },
        { RecordID: 'lapsing', ResultPayload: JSON.stringify({ score: 0.10 }) },
      ],
      AtRiskRules.BuildAtRiskOptions({ Lineage: null, TargetVariable: 'Renewed', ProblemType: 'classification' }),
    );
    expect(rows.find((r) => r.RecordID === 'loyal')).toMatchObject({ RiskPct: 2, Band: 'low' });
    expect(rows.find((r) => r.RecordID === 'lapsing')).toMatchObject({ RiskPct: 90, Band: 'high' });
  });
  it('carries the resolved outcome config', () => {
    expect(AtRiskRules.BuildAtRiskOptions({ Lineage: null, TargetVariable: 'Renewed', ProblemType: 'classification' }).OutcomeConfig.Polarity).toBe('positive');
  });

  const inverted = (target: string): boolean | undefined =>
    AtRiskRules.BuildAtRiskOptions({ Lineage: null, TargetVariable: target, ProblemType: 'classification' }).InvertedRisk;

  it('an adverse word beats a renewal word: RenewalRisk, NonRenewal, WillNotRenew and RetentionRisk are not inverted (I2)', () => {
    for (const target of ['RenewalRisk', 'NonRenewal', 'WillNotRenew', 'RetentionRisk', 'ChurnFlag']) {
      expect({ target, inverted: inverted(target) }).toEqual({ target, inverted: false });
      expect(AtRiskRules.BuildAtRiskOptions({ Lineage: null, TargetVariable: target, ProblemType: 'classification' }).OutcomeConfig.Polarity).toBe('adverse');
    }
  });

  it('a plain renewal target is inverted, a plain Status target is neutral', () => {
    expect(inverted('Renewed')).toBe(true);
    expect(inverted('Status')).toBe(false);
    expect(AtRiskRules.BuildAtRiskOptions({ Lineage: null, TargetVariable: 'Status', ProblemType: 'classification' }).OutcomeConfig.Polarity).toBeUndefined();
  });

  it('matches whole words, so IsRelated, DefaultPlan and Calculated are not adverse', () => {
    for (const target of ['IsRelated', 'DefaultPlan', 'Calculated']) {
      expect({ target, polarity: AtRiskRules.BuildAtRiskOptions({ Lineage: null, TargetVariable: target, ProblemType: 'classification' }).OutcomeConfig.Polarity })
        .toEqual({ target, polarity: undefined });
    }
    expect(AtRiskRules.BuildAtRiskOptions({ Lineage: null, TargetVariable: 'LoanDefault', ProblemType: 'classification' }).OutcomeConfig.Polarity).toBe('adverse');
  });

  it('gives monetary bands only to a regression model, never to a classifier with a money word (M5)', () => {
    const classifier = AtRiskRules.BuildAtRiskOptions({ Lineage: null, TargetVariable: 'HighSpender', ProblemType: 'classification' });
    expect(classifier.OutcomeConfig.Format).toBe('percentage');
    expect(classifier.InvertedRisk).toBe(false);
    const regression = AtRiskRules.BuildAtRiskOptions({ Lineage: null, TargetVariable: 'CustomerLTV', ProblemType: 'regression' });
    expect(regression.OutcomeConfig.Format).toBe('currency');
    expect(regression.InvertedRisk).toBe(false);
  });

  it('reads the regression problem type case-insensitively, the same way the trust verdict does', () => {
    const lineage = JSON.stringify({ outcomeConfig: { Polarity: 'positive' } });
    expect(AtRiskRules.BuildAtRiskOptions({ Lineage: lineage, TargetVariable: 'X', ProblemType: ' Regression ' }).InvertedRisk).toBe(false);
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
  it('never uses a UUID (the row ID) as the last-resort label', () => {
    expect(AtRiskRules.LabelFromRecord({ ID: 'A1B2C3D4-E5F6-7890-ABCD-EF1234567890', Code: 'M-17' }, null)).toBe('M-17');
    expect(AtRiskRules.LabelFromRecord({ ID: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' }, null)).toBeNull();
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

  it('lists the same records whatever the read order when the limit falls inside a run of equal risks', () => {
    const row = (id: string, riskPct: number): AtRiskRow => ({ RecordID: id, Label: null, Score: 1 - riskPct / 100, RiskPct: riskPct, Class: null, Band: 'high', Status: 'At risk', BadgeColor: 'red', Icon: 'fa-triangle-exclamation', Drivers: null });
    const tied = ['0C1D-B', '0c1d-a', '9F2E-D', '0C1D-C', '5A5A-E'].map((id) => row(id, 61));
    const rows = [row('ffff-top', 90), ...tied, row('aaaa-low', 45)];
    const expected = ['ffff-top', '0c1d-a', '0C1D-B', '0C1D-C'];
    // Every rotation and the reverse of the input give the same members, in the same order.
    const orders = [...rows.map((_, k) => [...rows.slice(k), ...rows.slice(0, k)]), [...rows].reverse()];
    for (const order of orders) expect(AtRiskRules.SelectAtRiskListMembers(order, 4).map((r) => r.RecordID)).toEqual(expected);
  });

  it('never pads the list with low-risk rows', () => {
    const rows: AtRiskRow[] = [10, 20, 39].map((riskPct, i) => ({ RecordID: `r${i}`, Label: null, Score: 1 - riskPct / 100, RiskPct: riskPct, Class: null, Band: 'low', Status: 'Low risk', BadgeColor: 'green', Icon: 'fa-circle-check', Drivers: null }));
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

describe('AtRiskRules.RiskOf / RiskBandFor / RiskBands (one risk rule for every surface)', () => {
  it('risk is the score for adverse polarity and 1 - score for positive polarity', () => {
    expect(AtRiskRules.RiskOf(0.8, false)).toBe(0.8);
    expect(AtRiskRules.RiskOf(0.8, true)).toBeCloseTo(0.2, 10);
    expect(AtRiskRules.RiskOf(1.4, true)).toBe(0);
  });

  it('clamps the non-inverted path to 0–1 too', () => {
    expect(AtRiskRules.RiskOf(1.4, false)).toBe(1);
    expect(AtRiskRules.RiskOf(-0.2, false)).toBe(0);
  });

  it('bands risk at 0.7 and 0.4', () => {
    expect(AtRiskRules.RiskBandFor(0.7)).toBe('high');
    expect(AtRiskRules.RiskBandFor(0.69)).toBe('medium');
    expect(AtRiskRules.RiskBandFor(0.4)).toBe('medium');
    expect(AtRiskRules.RiskBandFor(0.39)).toBe('low');
  });

  it('a renewal model\'s most likely renewer is low risk, so its band and the list agree', () => {
    const rows = AtRiskRules.ParseAtRiskRows(
      [{ RecordID: 'r1', ResultPayload: JSON.stringify({ score: 0.95 }) }],
      { InvertedRisk: true },
    );
    expect(rows[0].Band).toBe(AtRiskRules.RiskBandFor(AtRiskRules.RiskOf(0.95, true)));
    expect(rows[0].Band).toBe('low');
  });

  it('lists the three bands highest risk first, red at the top', () => {
    expect(AtRiskRules.RiskBands.map((b) => b.Key)).toEqual(['high', 'medium', 'low']);
    expect(AtRiskRules.RiskBands[0].BadgeColor).toBe('red');
  });

  it('looks up a band\'s display entry', () => {
    expect(AtRiskRules.RiskBandDisplayFor('medium')).toEqual({ Key: 'medium', Label: 'Medium risk', BadgeColor: 'amber', Icon: 'fa-triangle-exclamation' });
  });
});

