/**
 * validateCompositeSpec legal/illegal matrix + affordance helpers.
 *
 * The named illegal cases are the production forms of the Track-A `rd_loop.edge_legal`
 * demonstrations: cycle, port mismatch (survival-curve→probability), missing adapter,
 * unknown component, self-edge, unbound required input, slot under/over/wrong-type,
 * non-terminal exposed output, unknown adapter name, duplicate node IDs.
 */
import { describe, it, expect } from 'vitest';
import {
  validateCompositeSpec, findCompatibleSlots, findCompatibleFillers,
  type ComponentShape,
} from '../composite-schema';
import type { PortAdapterDef } from '../port-types';

// ---- fixture registry (mirrors the B3 catalog slice) ----
const XGB: ComponentShape = {
  Name: 'XGBoost Classifier',
  Ports: [
    { Name: 'X', Direction: 'Input', PortType: 'features:tabular' },
    { Name: 'p', Direction: 'Output', PortType: 'probability' },
    { Name: 'label', Direction: 'Output', PortType: 'class-label' },
  ],
};
const LOGIT: ComponentShape = {
  Name: 'Logistic Regression',
  Ports: [
    { Name: 'X', Direction: 'Input', PortType: 'features:tabular' },
    { Name: 'p', Direction: 'Output', PortType: 'probability' },
    { Name: 'coef', Direction: 'Output', PortType: 'coefficients' },
  ],
};
const KMEANS: ComponentShape = {
  Name: 'KMeans',
  Ports: [
    { Name: 'X', Direction: 'Input', PortType: 'features:tabular' },
    { Name: 'cluster', Direction: 'Output', PortType: 'cluster-id' },
  ],
};
const COX: ComponentShape = {
  Name: 'Cox Proportional Hazards',
  Ports: [
    { Name: 'X', Direction: 'Input', PortType: 'features:tabular' },
    { Name: 'hazard', Direction: 'Output', PortType: 'hazard' },
    { Name: 'curve', Direction: 'Output', PortType: 'survival-curve' },
  ],
};
const ISOTONIC: ComponentShape = {
  Name: 'Isotonic Calibrator',
  Ports: [
    { Name: 'p_in', Direction: 'Input', PortType: 'probability' },
    { Name: 'p_out', Direction: 'Output', PortType: 'probability' },
  ],
};
const CALIBRATOR_TPL: ComponentShape = {
  Name: 'Calibrator Template',
  Ports: [{ Name: 'p', Direction: 'Output', PortType: 'probability' }],
  Slots: [{ Name: 'model', RequiredPortType: 'probability', MinCount: 1, MaxCount: 1 }],
};
const BAGGING_TPL: ComponentShape = {
  Name: 'Bagging Template',
  Ports: [{ Name: 'p', Direction: 'Output', PortType: 'probability' }],
  Slots: [{ Name: 'model', RequiredPortType: 'probability', MinCount: 2, MaxCount: 3 }],
};
const REGISTRY = [XGB, LOGIT, KMEANS, COX, ISOTONIC, CALIBRATOR_TPL, BAGGING_TPL];

const ADAPTERS: PortAdapterDef[] = [
  { Name: 'Cluster ID One-Hot', FromPortType: 'cluster-id', ToPortType: 'features:tabular', Strategy: 'onehot' },
  { Name: 'Probability Column', FromPortType: 'probability', ToPortType: 'features:tabular', Strategy: 'column' },
];

const V = (raw: unknown) => validateCompositeSpec(raw, REGISTRY, ADAPTERS);

describe('validateCompositeSpec — legal graphs', () => {
  it('accepts a single node', () => {
    expect(V({ Nodes: [{ ID: 'a', Component: 'XGBoost Classifier' }], Edges: [], ExposedOutputNode: 'a' }).ok).toBe(true);
  });
  it('accepts calibrated classifier (probability → probability)', () => {
    const r = V({
      Nodes: [{ ID: 'm', Component: 'XGBoost Classifier' }, { ID: 'c', Component: 'Isotonic Calibrator' }],
      Edges: [{ From: 'm', FromPort: 'probability', To: 'c', ToPort: 'probability' }],
      ExposedOutputNode: 'c',
    });
    expect(r.ok).toBe(true);
  });
  it('accepts cluster-then-classify via the declared adapter', () => {
    const r = V({
      Nodes: [{ ID: 'k', Component: 'KMeans' }, { ID: 'm', Component: 'XGBoost Classifier' }],
      Edges: [{ From: 'k', FromPort: 'cluster-id', To: 'm', ToPort: 'features:tabular', Adapter: 'Cluster ID One-Hot' }],
      ExposedOutputNode: 'm',
    });
    expect(r.ok).toBe(true);
  });
  it('accepts an adapter edge without naming the adapter (resolved by From→To)', () => {
    const r = V({
      Nodes: [{ ID: 'k', Component: 'KMeans' }, { ID: 'm', Component: 'Logistic Regression' }],
      Edges: [{ From: 'k', FromPort: 'cluster-id', To: 'm', ToPort: 'features:tabular' }],
      ExposedOutputNode: 'm',
    });
    expect(r.ok).toBe(true);
  });
  it('accepts stacking (two models → adapter columns → meta model)', () => {
    const r = V({
      Nodes: [
        { ID: 'a', Component: 'XGBoost Classifier' }, { ID: 'b', Component: 'Logistic Regression' },
        { ID: 'meta', Component: 'XGBoost Classifier' },
      ],
      Edges: [
        { From: 'a', FromPort: 'probability', To: 'meta', ToPort: 'features:tabular', Adapter: 'Probability Column' },
        { From: 'b', FromPort: 'probability', To: 'meta', ToPort: 'features:tabular', Adapter: 'Probability Column' },
      ],
      ExposedOutputNode: 'meta',
    });
    expect(r.ok).toBe(true);
  });
  it('accepts template slot filled exactly (Calibrator: 1 model)', () => {
    const r = V({
      Nodes: [{ ID: 'm', Component: 'XGBoost Classifier' }, { ID: 't', Component: 'Calibrator Template' }],
      Edges: [{ From: 'm', FromPort: 'probability', To: 't', ToPort: 'probability' }],
      ExposedOutputNode: 't',
    });
    expect(r.ok).toBe(true);
  });
  it('accepts bagging within Min/MaxCount (2 fills of 2..3)', () => {
    const r = V({
      Nodes: [
        { ID: 'a', Component: 'XGBoost Classifier' }, { ID: 'b', Component: 'Logistic Regression' },
        { ID: 't', Component: 'Bagging Template' },
      ],
      Edges: [
        { From: 'a', FromPort: 'probability', To: 't', ToPort: 'probability' },
        { From: 'b', FromPort: 'probability', To: 't', ToPort: 'probability' },
      ],
      ExposedOutputNode: 't',
    });
    expect(r.ok).toBe(true);
  });
  it('accepts a 3-deep chain (cluster → classifier → calibrator)', () => {
    const r = V({
      Nodes: [
        { ID: 'k', Component: 'KMeans' }, { ID: 'm', Component: 'XGBoost Classifier' },
        { ID: 'c', Component: 'Isotonic Calibrator' },
      ],
      Edges: [
        { From: 'k', FromPort: 'cluster-id', To: 'm', ToPort: 'features:tabular' },
        { From: 'm', FromPort: 'probability', To: 'c', ToPort: 'probability' },
      ],
      ExposedOutputNode: 'c',
    });
    expect(r.ok).toBe(true);
  });
});

describe('validateCompositeSpec — named illegal graphs', () => {
  const base = { Nodes: [{ ID: 'a', Component: 'XGBoost Classifier' }, { ID: 'b', Component: 'Isotonic Calibrator' }] };

  it('rejects a cycle', () => {
    const r = V({
      ...base,
      Edges: [
        { From: 'a', FromPort: 'probability', To: 'b', ToPort: 'probability' },
        { From: 'b', FromPort: 'probability', To: 'a', ToPort: 'features:tabular', Adapter: 'Probability Column' },
      ],
      ExposedOutputNode: 'b',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/cycle|outgoing/);
  });

  it('rejects the survival-curve→probability temptation (the rd_loop illegal case)', () => {
    const r = V({
      Nodes: [{ ID: 's', Component: 'Cox Proportional Hazards' }, { ID: 'c', Component: 'Isotonic Calibrator' }],
      Edges: [{ From: 's', FromPort: 'survival-curve', To: 'c', ToPort: 'probability' }],
      ExposedOutputNode: 'c',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("port mismatch 'survival-curve'→'probability'");
  });

  it('rejects a port mismatch with no adapter', () => {
    const r = V({
      Nodes: [{ ID: 'k', Component: 'KMeans' }, { ID: 'c', Component: 'Isotonic Calibrator' }],
      Edges: [{ From: 'k', FromPort: 'cluster-id', To: 'c', ToPort: 'probability' }],
      ExposedOutputNode: 'c',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('no declared adapter');
  });

  it('rejects an unknown adapter name', () => {
    const r = V({
      Nodes: [{ ID: 'k', Component: 'KMeans' }, { ID: 'm', Component: 'XGBoost Classifier' }],
      Edges: [{ From: 'k', FromPort: 'cluster-id', To: 'm', ToPort: 'features:tabular', Adapter: 'Nonexistent' }],
      ExposedOutputNode: 'm',
    });
    expect(r.ok).toBe(false);
  });

  it('rejects an unknown component reference', () => {
    const r = V({ Nodes: [{ ID: 'a', Component: 'Quantum Annealer' }], Edges: [], ExposedOutputNode: 'a' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("unknown component 'Quantum Annealer'");
  });

  it('rejects a self-edge', () => {
    const r = V({
      Nodes: [{ ID: 'a', Component: 'XGBoost Classifier' }],
      Edges: [{ From: 'a', FromPort: 'probability', To: 'a', ToPort: 'features:tabular', Adapter: 'Probability Column' }],
      ExposedOutputNode: 'a',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('self-edge');
  });

  it('rejects duplicate node IDs', () => {
    const r = V({
      Nodes: [{ ID: 'a', Component: 'XGBoost Classifier' }, { ID: 'a', Component: 'KMeans' }],
      Edges: [], ExposedOutputNode: 'a',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("duplicate node ID 'a'");
  });

  it('rejects an unbound required non-feature input (calibrator with nothing wired in)', () => {
    const r = V({
      Nodes: [{ ID: 'c', Component: 'Isotonic Calibrator' }],
      Edges: [], ExposedOutputNode: 'c',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('required input port');
  });

  it('rejects slot underfill (Bagging min 2, given 1)', () => {
    const r = V({
      Nodes: [{ ID: 'a', Component: 'XGBoost Classifier' }, { ID: 't', Component: 'Bagging Template' }],
      Edges: [{ From: 'a', FromPort: 'probability', To: 't', ToPort: 'probability' }],
      ExposedOutputNode: 't',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('underfilled');
  });

  it('rejects slot overfill (Calibrator max 1, given 2)', () => {
    const r = V({
      Nodes: [
        { ID: 'a', Component: 'XGBoost Classifier' }, { ID: 'b', Component: 'Logistic Regression' },
        { ID: 't', Component: 'Calibrator Template' },
      ],
      Edges: [
        { From: 'a', FromPort: 'probability', To: 't', ToPort: 'probability' },
        { From: 'b', FromPort: 'probability', To: 't', ToPort: 'probability' },
      ],
      ExposedOutputNode: 't',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('overfilled');
  });

  it('rejects a non-terminal exposed output', () => {
    const r = V({
      Nodes: [{ ID: 'm', Component: 'XGBoost Classifier' }, { ID: 'c', Component: 'Isotonic Calibrator' }],
      Edges: [{ From: 'm', FromPort: 'probability', To: 'c', ToPort: 'probability' }],
      ExposedOutputNode: 'm',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('must be terminal');
  });

  it('rejects an exposed output that is not a node', () => {
    const r = V({ Nodes: [{ ID: 'a', Component: 'KMeans' }], Edges: [], ExposedOutputNode: 'zz' });
    expect(r.ok).toBe(false);
  });

  it('rejects structurally-malformed input (zod pass)', () => {
    expect(V({ Nodes: 'nope' }).ok).toBe(false);
    expect(V(null).ok).toBe(false);
  });
});

describe('affordance helpers — there-is-and-can-be, computed', () => {
  it('findCompatibleSlots: a probability emitter fits Calibrator + Bagging', () => {
    const slots = findCompatibleSlots(LOGIT, [CALIBRATOR_TPL, BAGGING_TPL], ADAPTERS);
    expect(slots.map((s) => s.TemplateName).sort()).toEqual(['Bagging Template', 'Calibrator Template']);
  });

  it('findCompatibleSlots: KMeans fits nothing here (no cluster-id slot declared)', () => {
    expect(findCompatibleSlots(KMEANS, [CALIBRATOR_TPL, BAGGING_TPL], ADAPTERS)).toHaveLength(0);
  });

  it('affordance EXPANSION: registering a new template grows can-be with zero component edits', () => {
    const before = findCompatibleSlots(KMEANS, [CALIBRATOR_TPL, BAGGING_TPL], ADAPTERS);
    const CLUSTER_TPL: ComponentShape = {
      Name: 'Cluster-then-Classify',
      Ports: [{ Name: 'p', Direction: 'Output', PortType: 'probability' }],
      Slots: [
        { Name: 'cluster', RequiredPortType: 'cluster-id', MinCount: 1, MaxCount: 1 },
        { Name: 'classifier', RequiredPortType: 'probability', MinCount: 1, MaxCount: 1 },
      ],
    };
    const after = findCompatibleSlots(KMEANS, [CALIBRATOR_TPL, BAGGING_TPL, CLUSTER_TPL], ADAPTERS);
    expect(before).toHaveLength(0);
    expect(after).toEqual([
      { TemplateName: 'Cluster-then-Classify', SlotName: 'cluster', PortType: 'cluster-id' },
    ]);
  });

  it('findCompatibleFillers: probability slot → all probability emitters (not Cox/KMeans)', () => {
    const fillers = findCompatibleFillers(
      { Name: 'model', RequiredPortType: 'probability' }, REGISTRY, ADAPTERS);
    const names = fillers.map((f) => f.Name);
    expect(names).toContain('XGBoost Classifier');
    expect(names).toContain('Logistic Regression');
    expect(names).not.toContain('Cox Proportional Hazards');
    expect(names).not.toContain('KMeans');
  });

  it('findCompatibleSlots via adapter: probability emitter can fill a features:tabular slot through the adapter', () => {
    const STACK_TPL: ComponentShape = {
      Name: 'Stacking Template',
      Ports: [{ Name: 'p', Direction: 'Output', PortType: 'probability' }],
      Slots: [{ Name: 'base', RequiredPortType: 'features:tabular', MinCount: 2 }],
    };
    const slots = findCompatibleSlots(XGB, [STACK_TPL], ADAPTERS);
    expect(slots).toEqual([{
      TemplateName: 'Stacking Template', SlotName: 'base',
      PortType: 'features:tabular', ViaAdapter: 'Probability Column',
    }]);
  });
});
