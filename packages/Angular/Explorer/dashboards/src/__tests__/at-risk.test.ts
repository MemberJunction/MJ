import { describe, it, expect } from 'vitest';
import { parseAtRiskRows, topGlobalDrivers } from '../PredictiveStudio/at-risk.view-models';

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
  it('collapses one-hot columns to plain features, ranked by importance', () => {
    const json = JSON.stringify({ 'MembershipType=Student': 0.3, 'MembershipType=Corporate': 0.97, AutoRenew: 0.6, 'MembershipType=Retired': 0.1 });
    expect(topGlobalDrivers(json, 2)).toEqual(['MembershipType', 'AutoRenew']);
  });

  it('handles the array form + signed weights, and tolerates junk', () => {
    expect(topGlobalDrivers(JSON.stringify([{ feature: 'Tenure', importance: -0.9 }, { name: 'Logins', value: 0.4 }]), 5)).toEqual(['Tenure', 'Logins']);
    expect(topGlobalDrivers('garbage')).toEqual([]);
    expect(topGlobalDrivers(null)).toEqual([]);
  });
});
