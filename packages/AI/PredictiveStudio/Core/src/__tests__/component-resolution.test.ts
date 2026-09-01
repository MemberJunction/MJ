import { describe, expect, it } from 'vitest';
import {
  ComponentTypeNode,
  ComponentTypePropertyRow,
  ComponentTypeSlotRow,
} from '../component-model';
import {
  chainToRoot,
  groupByType,
  isDescendantOrSelf,
  lintComponentTree,
  resolveComponentProfile,
} from '../component-resolution';

/** Shorthand node builder — the synthetic tree: Model → Ensemble → Boosting → XGBoost. */
function node(partial: Partial<ComponentTypeNode> & Pick<ComponentTypeNode, 'ID' | 'Name' | 'Kind'>): ComponentTypeNode {
  return {
    ParentID: null,
    IsAbstract: false,
    Trainable: false,
    DriverClass: null,
    SpecSchema: null,
    DefaultSpec: null,
    Status: 'Published',
    ...partial,
  };
}

function prop(
  partial: Partial<ComponentTypePropertyRow> & Pick<ComponentTypePropertyRow, 'ComponentTypeID' | 'PropertyKey' | 'Value'>,
): ComponentTypePropertyRow {
  return { Operation: 'Add', ItemKey: null, Sequence: 0, Rationale: null, ...partial };
}

const MODEL = node({ ID: 'model', Name: 'Model', Kind: 'Model', IsAbstract: true });
const ENSEMBLE = node({ ID: 'ens', Name: 'Tree Ensemble', Kind: 'Model', ParentID: 'model', IsAbstract: true });
const BOOSTING = node({ ID: 'boost', Name: 'Boosting', Kind: 'Model', ParentID: 'ens', IsAbstract: true });
const XGB = node({ ID: 'xgb', Name: 'XGBoost', Kind: 'Model', ParentID: 'boost', DriverClass: 'xgboost', Trainable: true });

const NODES = [MODEL, ENSEMBLE, BOOSTING, XGB];
const byId = new Map(NODES.map((n) => [n.ID, n]));

function resolve(props: ComponentTypePropertyRow[], slots: ComponentTypeSlotRow[] = [], leaf = 'xgb') {
  return resolveComponentProfile(leaf, byId, groupByType(props), groupByType(slots));
}

describe('chainToRoot', () => {
  it('returns the chain root-first, ending at the leaf', () => {
    expect(chainToRoot('xgb', byId).map((n) => n.ID)).toEqual(['model', 'ens', 'boost', 'xgb']);
  });

  it('throws on a cycle', () => {
    const a = node({ ID: 'a', Name: 'A', Kind: 'Model', ParentID: 'b' });
    const b = node({ ID: 'b', Name: 'B', Kind: 'Model', ParentID: 'a' });
    expect(() => chainToRoot('a', new Map([['a', a], ['b', b]]))).toThrow(/cycle/i);
  });

  it('throws on a dangling parent', () => {
    const orphan = node({ ID: 'o', Name: 'O', Kind: 'Model', ParentID: 'ghost' });
    expect(() => chainToRoot('o', new Map([['o', orphan]]))).toThrow(/not found/);
  });
});

describe('resolveComponentProfile — merge modes', () => {
  it('union: merges by ItemKey down the chain and honors a Remove veto', () => {
    const props = [
      prop({ ComponentTypeID: 'model', PropertyKey: 'PreprocessingBank', ItemKey: 'impute', Value: '{"op":"impute"}' }),
      prop({ ComponentTypeID: 'ens', PropertyKey: 'PreprocessingBank', ItemKey: 'standardize', Value: '{"op":"standardize"}' }),
      prop({ ComponentTypeID: 'boost', PropertyKey: 'PreprocessingBank', ItemKey: 'standardize', Value: '', Operation: 'Remove' }),
    ];
    const items = resolve(props).Properties.PreprocessingBank ?? [];
    expect(items.map((i) => i.ItemKey)).toEqual(['impute']);
  });

  it('union: a deeper Add with the same ItemKey overrides the inherited item', () => {
    const props = [
      prop({ ComponentTypeID: 'model', PropertyKey: 'StatisticalGate', ItemKey: 'min-rows', Value: '{"threshold":100}' }),
      prop({ ComponentTypeID: 'xgb', PropertyKey: 'StatisticalGate', ItemKey: 'min-rows', Value: '{"threshold":500}' }),
    ];
    const items = resolve(props).Properties.StatisticalGate ?? [];
    expect(items).toHaveLength(1);
    expect(items[0].Value).toEqual({ threshold: 500 });
    expect(items[0].SourceTypeID).toBe('xgb');
  });

  it('append: keeps root→leaf order and lets Replace swap in place', () => {
    const props = [
      prop({ ComponentTypeID: 'model', PropertyKey: 'HyperparameterBank', ItemKey: 'lr', Value: '{"range":[0.001,0.3]}', Sequence: 0 }),
      prop({ ComponentTypeID: 'ens', PropertyKey: 'HyperparameterBank', ItemKey: 'n_estimators', Value: '{"range":[50,500]}', Sequence: 0 }),
      prop({ ComponentTypeID: 'boost', PropertyKey: 'HyperparameterBank', ItemKey: 'lr', Value: '{"range":[0.01,0.1]}', Operation: 'Replace' }),
    ];
    const items = resolve(props).Properties.HyperparameterBank ?? [];
    expect(items.map((i) => i.ItemKey)).toEqual(['lr', 'n_estimators']);
    expect(items[0].Value).toEqual({ range: [0.01, 0.1] });
    expect(items[0].SourceTypeID).toBe('boost');
  });

  it('override: the deepest node carrying the key wins', () => {
    const props = [
      prop({ ComponentTypeID: 'model', PropertyKey: 'Explainability', Value: '"none"' }),
      prop({ ComponentTypeID: 'ens', PropertyKey: 'Explainability', Value: '"global-importance"' }),
    ];
    const items = resolve(props).Properties.Explainability ?? [];
    expect(items).toHaveLength(1);
    expect(items[0].Value).toBe('global-importance');
  });

  it('narrow: resolution takes the nearest set (legality is lint business)', () => {
    const props = [
      prop({ ComponentTypeID: 'model', PropertyKey: 'CompatibleProblemTypes', Value: '["classification","regression"]' }),
      prop({ ComponentTypeID: 'xgb', PropertyKey: 'CompatibleProblemTypes', Value: '["classification"]' }),
    ];
    const items = resolve(props).Properties.CompatibleProblemTypes ?? [];
    expect(items[0].Value).toEqual(['classification']);
  });

  it('mergeObject: shallow-merges root→leaf, deeper keys overriding', () => {
    const props = [
      prop({ ComponentTypeID: 'model', PropertyKey: 'ValidationDefaults', Value: '{"Strategy":"train_test_split","TestSize":0.2}' }),
      prop({ ComponentTypeID: 'boost', PropertyKey: 'ValidationDefaults', Value: '{"TestSize":0.25}' }),
    ];
    const items = resolve(props).Properties.ValidationDefaults ?? [];
    expect(items[0].Value).toEqual({ Strategy: 'train_test_split', TestSize: 0.25 });
  });

  it('records provenance root-first for the UI chips', () => {
    const props = [
      prop({ ComponentTypeID: 'model', PropertyKey: 'PreprocessingBank', ItemKey: 'impute', Value: '{}' }),
      prop({ ComponentTypeID: 'xgb', PropertyKey: 'PreprocessingBank', ItemKey: 'bin', Value: '{}' }),
    ];
    expect(resolve(props).Provenance.PreprocessingBank).toEqual(['model', 'xgb']);
  });

  it('keeps an unparseable payload as the raw string instead of dropping it', () => {
    const props = [prop({ ComponentTypeID: 'xgb', PropertyKey: 'GuidanceRationale', Value: 'not json at all' })];
    const items = resolve(props).Properties.GuidanceRationale ?? [];
    expect(items[0].Value).toBe('not json at all');
  });
});

describe('resolveComponentProfile — slots', () => {
  const slot = (over: Partial<ComponentTypeSlotRow> & Pick<ComponentTypeSlotRow, 'ComponentTypeID' | 'Name' | 'AcceptsComponentTypeID'>): ComponentTypeSlotRow => ({
    MinCount: 1,
    MaxCount: 1,
    DefaultComponentTypeID: null,
    Sequence: 0,
    ...over,
  });

  it('unions slots by Name down the chain, deeper redeclaration replacing', () => {
    const slots = [
      slot({ ComponentTypeID: 'ens', Name: 'base_estimator', AcceptsComponentTypeID: 'model' }),
      slot({ ComponentTypeID: 'boost', Name: 'base_estimator', AcceptsComponentTypeID: 'ens' }),
      slot({ ComponentTypeID: 'boost', Name: 'weights', AcceptsComponentTypeID: 'model', Sequence: 1, MinCount: 0 }),
    ];
    const resolved = resolve([], slots).Slots;
    expect(resolved.map((s) => s.Name)).toEqual(['base_estimator', 'weights']);
    expect(resolved[0].AcceptsComponentTypeID).toBe('ens');
    expect(resolved[0].SourceTypeID).toBe('boost');
  });
});

describe('lintComponentTree', () => {
  it('passes a clean tree with zero findings', () => {
    const props = [
      prop({ ComponentTypeID: 'model', PropertyKey: 'CompatibleProblemTypes', Value: '["classification","regression"]' }),
      prop({ ComponentTypeID: 'xgb', PropertyKey: 'CompatibleProblemTypes', Value: '["classification"]' }),
    ];
    expect(lintComponentTree(NODES, props, [])).toEqual([]);
  });

  it('flags a kind mismatch between child and parent', () => {
    const wrong = node({ ID: 'w', Name: 'Wrong', Kind: 'Preprocessing', ParentID: 'model', DriverClass: 'x' });
    const findings = lintComponentTree([...NODES, wrong], [], []);
    expect(findings.some((f) => f.Rule === 'kind-consistency' && f.NodeID === 'w')).toBe(true);
  });

  it('flags a dangling parent', () => {
    const orphan = node({ ID: 'o', Name: 'Orphan', Kind: 'Model', ParentID: 'ghost', DriverClass: 'x' });
    const findings = lintComponentTree([...NODES, orphan], [], []);
    expect(findings.some((f) => f.Rule === 'dangling-parent' && f.NodeID === 'o')).toBe(true);
  });

  it('flags an abstract node carrying a DriverClass', () => {
    const bad = node({ ID: 'b', Name: 'Bad Family', Kind: 'Model', ParentID: 'model', IsAbstract: true, DriverClass: 'oops' });
    const child = node({ ID: 'c', Name: 'Child', Kind: 'Model', ParentID: 'b', DriverClass: 'ok' });
    const findings = lintComponentTree([...NODES, bad, child], [], []);
    expect(findings.some((f) => f.Rule === 'abstract-with-driver' && f.NodeID === 'b')).toBe(true);
  });

  it('flags a concrete executable leaf without a DriverClass', () => {
    const bad = node({ ID: 'nodrv', Name: 'No Driver', Kind: 'Model', ParentID: 'boost' });
    const findings = lintComponentTree([...NODES, bad], [], []);
    expect(findings.some((f) => f.Rule === 'leaf-without-driver' && f.NodeID === 'nodrv')).toBe(true);
  });

  it('does NOT require a driver on non-executable kinds (Output leaf without one is fine)', () => {
    const outRoot = node({ ID: 'out', Name: 'Output', Kind: 'Output', IsAbstract: true });
    const band = node({ ID: 'band', Name: 'Score Band', Kind: 'Output', ParentID: 'out' });
    expect(lintComponentTree([outRoot, band], [], []).filter((f) => f.Severity === 'Error')).toEqual([]);
  });

  it('warns on a descendant Remove contradicting an ancestor Add (the partition smell)', () => {
    const props = [
      prop({ ComponentTypeID: 'model', PropertyKey: 'PreprocessingBank', ItemKey: 'standardize', Value: '{}' }),
      prop({ ComponentTypeID: 'boost', PropertyKey: 'PreprocessingBank', ItemKey: 'standardize', Value: '', Operation: 'Remove' }),
    ];
    const findings = lintComponentTree(NODES, props, []);
    const hit = findings.find((f) => f.Rule === 'descendant-contradiction');
    expect(hit?.NodeID).toBe('model');
    expect(hit?.RelatedNodeID).toBe('boost');
    expect(hit?.Severity).toBe('Warning');
  });

  it('errors when a child widens a narrow-mode set beyond its ancestors', () => {
    const props = [
      prop({ ComponentTypeID: 'ens', PropertyKey: 'CompatibleProblemTypes', Value: '["classification"]' }),
      prop({ ComponentTypeID: 'xgb', PropertyKey: 'CompatibleProblemTypes', Value: '["classification","regression"]' }),
    ];
    const findings = lintComponentTree(NODES, props, []);
    expect(findings.some((f) => f.Rule === 'narrow-widening' && f.NodeID === 'xgb')).toBe(true);
  });

  it('errors when a slot redeclaration widens instead of narrowing', () => {
    const slots: ComponentTypeSlotRow[] = [
      { ComponentTypeID: 'ens', Name: 's', AcceptsComponentTypeID: 'boost', MinCount: 1, MaxCount: 1, DefaultComponentTypeID: null, Sequence: 0 },
      { ComponentTypeID: 'boost', Name: 's', AcceptsComponentTypeID: 'model', MinCount: 1, MaxCount: 1, DefaultComponentTypeID: null, Sequence: 0 },
    ];
    const findings = lintComponentTree(NODES, [], slots);
    expect(findings.some((f) => f.Rule === 'slot-widening' && f.NodeID === 'boost')).toBe(true);
  });

  it('errors when a slot accepts a nonexistent node', () => {
    const slots: ComponentTypeSlotRow[] = [
      { ComponentTypeID: 'ens', Name: 's', AcceptsComponentTypeID: 'ghost', MinCount: 1, MaxCount: 1, DefaultComponentTypeID: null, Sequence: 0 },
    ];
    const findings = lintComponentTree(NODES, [], slots);
    expect(findings.some((f) => f.Rule === 'slot-accepts-missing')).toBe(true);
  });
});

describe('isDescendantOrSelf', () => {
  it('walks the parent chain', () => {
    expect(isDescendantOrSelf('xgb', 'model', byId)).toBe(true);
    expect(isDescendantOrSelf('xgb', 'xgb', byId)).toBe(true);
    expect(isDescendantOrSelf('model', 'xgb', byId)).toBe(false);
  });
});
