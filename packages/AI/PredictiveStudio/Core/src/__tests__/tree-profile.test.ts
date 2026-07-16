/**
 * resolveLeafProfile — walk-up union, same-Name override, conjunctive gates,
 * priority ordering. Fixture mirrors the U3 mechanism tree's node-seeded banks
 * (root → weighted-sum → a linear leaf).
 */
import { describe, it, expect } from 'vitest';
import { resolveLeafProfile, type TreeNode, type TreeBankEntry } from '../tree-profile';

const nodes: TreeNode[] = [
  { Id: 'root', ParentId: null, Name: 'estimator-mechanism' },
  { Id: 'ws', ParentId: 'root', Name: 'weighted-sum' },
  { Id: 'ridge', ParentId: 'ws', Name: 'ridge', ComponentId: 'comp-ridge' },
];

const banks: TreeBankEntry[] = [
  // root: a default impute all mechanisms inherit
  { NodeId: 'root', BankType: 'Preprocessing', Name: 'impute', Payload: { op: 'median' }, Priority: 1 },
  // weighted-sum: standardize (required for linear) + a VIF gate
  { NodeId: 'ws', BankType: 'Preprocessing', Name: 'scale', Payload: { op: 'standardize' }, Priority: 1 },
  { NodeId: 'ws', BankType: 'GatingRule', Name: 'vif', Payload: { rule: 'flag VIF>10' }, Priority: 1 },
  // ridge leaf: OVERRIDE the impute with a leaf-specific one + add a hp prior + another gate
  { NodeId: 'ridge', BankType: 'Preprocessing', Name: 'impute', Payload: { op: 'mean' }, Priority: 1 },
  { NodeId: 'ridge', BankType: 'HyperparameterPrior', Name: 'alpha', Payload: { prior: 'log-uniform[0.01,10]' }, Priority: 1 },
  { NodeId: 'ridge', BankType: 'GatingRule', Name: 'n-min', Payload: { rule: 'n>=20' }, Priority: 2 },
];

describe('resolveLeafProfile', () => {
  const profile = resolveLeafProfile(nodes, banks, 'ridge');

  it('walks the full root→leaf path', () => {
    expect(profile.path).toEqual(['root', 'ws', 'ridge']);
  });

  it('unions preprocessing down the path with same-Name override (leaf wins)', () => {
    const pre = profile.banks.Preprocessing;
    const impute = pre.find((e) => e.Name === 'impute');
    const scale = pre.find((e) => e.Name === 'scale');
    // impute overridden by the ridge leaf (mean, from ridge) — NOT the root median
    expect(impute?.Payload).toEqual({ op: 'mean' });
    expect(impute?.fromNodeId).toBe('ridge');
    // scale inherited from weighted-sum
    expect(scale?.Payload).toEqual({ op: 'standardize' });
    expect(scale?.fromNodeId).toBe('ws');
    expect(pre).toHaveLength(2);
  });

  it('accumulates gates conjunctively (no override) — every gate on the path applies', () => {
    const gates = profile.banks.GatingRule;
    expect(gates.map((g) => g.Name).sort()).toEqual(['n-min', 'vif']);
    expect(gates).toHaveLength(2);
    // priority-sorted (vif Priority 1 before n-min Priority 2)
    expect(gates[0].Name).toBe('vif');
  });

  it('carries the leaf-local hyperparameter prior', () => {
    expect(profile.banks.HyperparameterPrior).toHaveLength(1);
    expect(profile.banks.HyperparameterPrior[0].Name).toBe('alpha');
  });

  it('throws on an unknown leaf', () => {
    expect(() => resolveLeafProfile(nodes, banks, 'nope')).toThrow();
  });
});
