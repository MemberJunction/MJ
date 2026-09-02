/**
 * Certifies the SHIPPED component seed tree (metadata/ml-component-types + properties + slots):
 * it must lint with ZERO Errors/Warnings — the "principled partition" is enforced here, not by
 * convention — and its executable leaves must map onto drivers that actually exist.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ComponentKind,
  ComponentTypeNode,
  ComponentTypePropertyRow,
  ComponentTypeSlotRow,
} from '../component-model';
import { groupByType, lintComponentTree, resolveComponentProfile } from '../component-resolution';

const METADATA = resolve(__dirname, '../../../../../../metadata');
const TYPES_DIR = resolve(METADATA, 'ml-component-types');

/**
 * Mirror of the sidecar `_REGISTRY` keys plus the executor-side input/preprocessing driver keys a
 * Published leaf may name. Deliberately hard-coded: if the sidecar or executor drops a driver,
 * this test must fail rather than silently follow.
 */
const PUBLISHED_MODEL_DRIVERS = new Set(['xgboost', 'lightgbm', 'logistic_regression', 'random_forest', 'ridge', 'mlp', 'rubric']);
/** Mirror of the sidecar `composition.STRUCTURE_SLOTS` keys — structures compose, they do not fit. */
const PUBLISHED_STRUCTURE_DRIVERS = new Set(['bagging', 'stacking']);
const PUBLISHED_PREPROCESSING_DRIVERS = new Set(['impute', 'standardize', 'minmax', 'percentile', 'zscore', 'onehot', 'bin', 'logistic', 'banded', 'lookup', 'present']);
const PUBLISHED_INPUT_DRIVERS = new Set([
  'select', 'embedding', 'llm-derived', 'flow-agent', 'vision-llm',
  'asof_count', 'asof_sum', 'asof_avg', 'asof_min', 'asof_max', 'asof_distinct_count',
  'asof_recency', 'asof_exists', 'asof_rate_per_period', 'asof_trend_slope',
  'action',
]);

interface SeedRecord {
  fields: Record<string, unknown>;
  primaryKey: { ID: string };
}

function loadRecords(dir: string): SeedRecord[] {
  return readdirSync(dir)
    .filter((f) => f.startsWith('.') && f.endsWith('.json') && f !== '.mj-sync.json')
    .flatMap((f) => JSON.parse(readFileSync(resolve(dir, f), 'utf-8')) as SeedRecord[]);
}

/** Resolve an `@lookup:MJ: ML Component Types.Name=X` reference to the type's seeded ID. */
function resolveLookup(raw: unknown, idByName: Map<string, string>): string {
  const match = /^@lookup:MJ: ML Component Types\.Name=(.+)$/.exec(String(raw));
  if (!match) throw new Error(`Not a component-type lookup: ${String(raw)}`);
  const id = idByName.get(match[1]);
  if (!id) throw new Error(`@lookup names unknown component type "${match[1]}"`);
  return id;
}

function loadTree() {
  const typeRecords = loadRecords(TYPES_DIR);
  const idByName = new Map(typeRecords.map((r) => [String(r.fields.Name), r.primaryKey.ID]));

  const nodes: ComponentTypeNode[] = typeRecords.map((r) => ({
    ID: r.primaryKey.ID,
    ParentID: r.fields.ParentID != null ? resolveLookup(r.fields.ParentID, idByName) : null,
    Name: String(r.fields.Name),
    Kind: r.fields.Kind as ComponentKind,
    IsAbstract: Boolean(r.fields.IsAbstract),
    Trainable: Boolean(r.fields.Trainable),
    DriverClass: (r.fields.DriverClass as string | undefined) ?? null,
    SpecSchema: (r.fields.SpecSchema as string | undefined) ?? null,
    DefaultSpec: (r.fields.DefaultSpec as string | undefined) ?? null,
    Status: String(r.fields.Status),
  }));

  const properties: ComponentTypePropertyRow[] = loadRecords(resolve(METADATA, 'ml-component-type-properties')).map((r) => ({
    ComponentTypeID: resolveLookup(r.fields.ComponentTypeID, idByName),
    PropertyKey: r.fields.PropertyKey as ComponentTypePropertyRow['PropertyKey'],
    Operation: (r.fields.Operation as ComponentTypePropertyRow['Operation']) ?? 'Add',
    ItemKey: (r.fields.ItemKey as string | undefined) ?? null,
    Value: String(r.fields.Value),
    Sequence: Number(r.fields.Sequence ?? 0),
    Rationale: (r.fields.Rationale as string | undefined) ?? null,
  }));

  const slots: ComponentTypeSlotRow[] = loadRecords(resolve(METADATA, 'ml-component-type-slots')).map((r) => ({
    ComponentTypeID: resolveLookup(r.fields.ComponentTypeID, idByName),
    Name: String(r.fields.Name),
    Description: (r.fields.Description as string | undefined) ?? null,
    AcceptsComponentTypeID: resolveLookup(r.fields.AcceptsComponentTypeID, idByName),
    MinCount: Number(r.fields.MinCount ?? 1),
    MaxCount: r.fields.MaxCount != null ? Number(r.fields.MaxCount) : null,
    DefaultComponentTypeID: null,
    Sequence: Number(r.fields.Sequence ?? 0),
  }));

  return { nodes, properties, slots, idByName };
}

describe('the shipped component seed tree', () => {
  const { nodes, properties, slots, idByName } = loadTree();
  const nodesById = new Map(nodes.map((n) => [n.ID, n]));
  const childrenByParent = new Map<string, ComponentTypeNode[]>();
  for (const n of nodes) {
    if (n.ParentID) {
      childrenByParent.set(n.ParentID, [...(childrenByParent.get(n.ParentID) ?? []), n]);
    }
  }

  it('lints with zero Errors and zero Warnings — the principled partition holds', () => {
    const findings = lintComponentTree(nodes, properties, slots).filter((f) => f.Severity !== 'Info');
    expect(findings).toEqual([]);
  });

  it('has exactly the seven Kind roots', () => {
    const roots = nodes.filter((n) => n.ParentID == null);
    expect(roots.map((r) => r.Kind).sort()).toEqual(
      ['Input', 'Model', 'Output', 'Parameter', 'Preprocessing', 'Statistic', 'Structure'].sort(),
    );
    expect(roots).toHaveLength(7);
  });

  it('every Published executable leaf names a driver that exists', () => {
    for (const node of nodes) {
      const isLeaf = (childrenByParent.get(node.ID) ?? []).length === 0;
      if (!isLeaf || node.IsAbstract || node.Status !== 'Published' || node.DriverClass == null) continue;
      const registry =
        node.Kind === 'Model'
          ? PUBLISHED_MODEL_DRIVERS
          : node.Kind === 'Structure'
            ? PUBLISHED_STRUCTURE_DRIVERS
            : node.Kind === 'Preprocessing'
            ? PUBLISHED_PREPROCESSING_DRIVERS
            : node.Kind === 'Input'
              ? PUBLISHED_INPUT_DRIVERS
              : null;
      if (registry) {
        expect(registry.has(node.DriverClass), `${node.Name} → ${node.DriverClass}`).toBe(true);
      }
    }
  });

  it('resolves XGBoost to the inherited profile the guidance promises', () => {
    const profile = resolveComponentProfile(idByName.get('XGBoost') as string, nodesById, groupByType(properties), groupByType(slots));
    expect(profile.Chain.map((n) => n.Name)).toEqual(['Model', 'Tree Ensemble', 'Boosting', 'XGBoost']);
    const bank = (profile.Properties.PreprocessingBank ?? []).map((i) => i.ItemKey);
    expect(bank).toContain('impute');
    expect(profile.Properties.Explainability?.[0].Value).toBe('global-importance');
    const hyper = (profile.Properties.HyperparameterBank ?? []).map((i) => i.ItemKey);
    expect(hyper).toEqual(expect.arrayContaining(['n_estimators', 'max_depth', 'learning_rate', 'subsample']));
    expect(profile.Properties.CompatibleProblemTypes?.[0].Value).toEqual(['classification', 'regression']);
  });

  it('resolves the rubric with exact explainability and its two slots', () => {
    const profile = resolveComponentProfile(idByName.get('Glass-Box Rubric') as string, nodesById, groupByType(properties), groupByType(slots));
    expect(profile.Properties.Explainability?.[0].Value).toBe('per-record-exact');
    expect(profile.Slots.map((s) => s.Name)).toEqual(['weights', 'bands']);
    expect(profile.Leaf.Trainable).toBe(true);
  });

  it('keeps a subtree Draft until the runtime behind it actually ships', () => {
    // Sequence/HMM wait on the `sequence` problem type.
    for (const name of ['Sequence', 'Hidden Markov Model']) {
      const node = nodesById.get(idByName.get(name) as string) as ComponentTypeNode;
      expect(node.Status, name).toBe('Draft');
    }
  });

  it('publishes the structure wrappers, whose composition runtime now exists', () => {
    // The sidecar builds bagging/stacking graphs and loads reused children frozen, and an approved
    // Action can be a feature — so these are no longer proposals.
    for (const name of ['Bagging Wrapper', 'Stacking Wrapper', 'Code Feature']) {
      const node = nodesById.get(idByName.get(name) as string) as ComponentTypeNode;
      expect(node.Status, name).toBe('Published');
    }
  });

  it('the algorithm catalog bridges onto existing type leaves', () => {
    const algos = JSON.parse(readFileSync(resolve(METADATA, 'ml-algorithms/.ml-algorithms.json'), 'utf-8')) as SeedRecord[];
    for (const algo of algos) {
      const typeId = resolveLookup(algo.fields.ComponentTypeID, idByName);
      const node = nodesById.get(typeId) as ComponentTypeNode;
      expect(node, String(algo.fields.Name)).toBeDefined();
      expect(node.DriverClass).toBe(String(algo.fields.DriverClass));
    }
  });

  it('every node carries a Story and every property a Rationale — meaning is not optional here', () => {
    for (const node of nodes) expect(String(node.Name) && nodesById.get(node.ID), node.Name).toBeTruthy();
    const missingStory = loadRecords(TYPES_DIR).filter((r) => !r.fields.Story || String(r.fields.Story).length < 20);
    expect(missingStory.map((r) => r.fields.Name)).toEqual([]);
    const missingWhy = properties.filter((p) => p.Operation !== 'Remove' && (!p.Rationale || p.Rationale.length < 10));
    expect(missingWhy.map((p) => `${p.PropertyKey}[${p.ItemKey}]`)).toEqual([]);
  });
});
