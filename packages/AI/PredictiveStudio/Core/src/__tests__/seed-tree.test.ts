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
const PUBLISHED_MODEL_DRIVERS = new Set(['xgboost', 'lightgbm', 'logistic_regression', 'random_forest', 'ridge', 'mlp', 'rubric', 'hmm']);
/** Mirror of the sidecar `composition.STRUCTURE_SLOTS` keys — structures compose, they do not fit. */
const PUBLISHED_STRUCTURE_DRIVERS = new Set(['bagging', 'stacking']);
const PUBLISHED_PREPROCESSING_DRIVERS = new Set(['impute', 'standardize', 'minmax', 'percentile', 'zscore', 'onehot', 'bin', 'logistic', 'banded', 'lookup', 'present']);
const PUBLISHED_INPUT_DRIVERS = new Set([
  'select', 'embedding', 'llm-derived', 'flow-agent', 'vision-llm',
  'asof_count', 'asof_sum', 'asof_avg', 'asof_min', 'asof_max', 'asof_distinct_count',
  'asof_recency', 'asof_exists', 'asof_rate_per_period', 'asof_trend_slope',
  'action',
  // Resolved by the executor's forecast step against the SEPARATE ForecastSidecar (TimesFM), not by
  // the tabular sidecar's `_REGISTRY` — hence its absence here when the leaf was first seeded.
  'forecast',
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

  /**
   * A `DefaultSpec` its OWN `SpecSchema` rejects is a type that cannot be instantiated with its
   * defaults — and nothing catches it until someone tries, because the server subclass validates on
   * save rather than at seed time. Checked here against the two rules that actually bite: required
   * properties, and `additionalProperties: false`.
   */
  it('every seeded DefaultSpec satisfies its own SpecSchema', () => {
    for (const node of nodes) {
      if (!node.SpecSchema || !node.DefaultSpec) continue;
      const file = /^@file:(.+)$/.exec(node.SpecSchema)?.[1];
      if (!file) continue;

      const schema = JSON.parse(readFileSync(resolve(TYPES_DIR, file), 'utf-8')) as {
        properties?: Record<string, unknown>;
        required?: string[];
        additionalProperties?: boolean;
      };
      const spec = JSON.parse(node.DefaultSpec) as Record<string, unknown>;

      for (const key of schema.required ?? []) {
        expect(Object.hasOwn(spec, key), `${node.Name}: DefaultSpec is missing required '${key}'`).toBe(true);
      }
      if (schema.additionalProperties === false) {
        const allowed = new Set(Object.keys(schema.properties ?? {}));
        for (const key of Object.keys(spec)) {
          expect(allowed.has(key), `${node.Name}: DefaultSpec has '${key}', which its schema forbids`).toBe(true);
        }
      }
    }
  });

  /**
   * The business-case archetypes are the "specific" end of the primitive→specific range. Each one
   * has to be a real narrowing of its parent rather than a renamed copy: same driver (it runs on the
   * same engine), stricter schema (it constrains what an instance may be), and a story of its own.
   */
  it('every business-case archetype narrows a primitive rather than renaming it', () => {
    for (const name of ['RFM Rubric', 'Retention Risk Rubric', 'Member Journey HMM']) {
      const node = nodes.find((n) => n.Name === name);
      expect(node, `${name} is not seeded`).toBeDefined();
      const parent = nodes.find((n) => n.ID === node!.ParentID);
      expect(parent, `${name} has no parent`).toBeDefined();

      // Runs on the same engine as the primitive it specializes.
      expect(node!.DriverClass, `${name} must keep its parent's driver`).toBe(parent!.DriverClass);
      // And constrains it — a schema identical to the parent's would be a rename, not an archetype.
      expect(node!.SpecSchema, `${name} must declare its own schema`).not.toBe(parent!.SpecSchema);
      expect(node!.SpecSchema).toBeTruthy();
      expect(node!.IsAbstract, `${name} must be instantiable`).toBe(false);
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

  it('resolves the rubric with exact explainability and its own two slots on top of the inherited one', () => {
    const profile = resolveComponentProfile(idByName.get('Glass-Box Rubric') as string, nodesById, groupByType(properties), groupByType(slots));
    expect(profile.Properties.Explainability?.[0].Value).toBe('per-record-exact');
    // `inputs` is declared on the abstract Model root — every model reads inputs, without
    // exception — so it arrives by inheritance, ahead of the rubric's own two.
    expect(profile.Slots.map((s) => s.Name)).toEqual(['inputs', 'weights', 'bands']);
    expect(profile.Leaf.Trainable).toBe(true);
  });

  it('gives every concrete model an `inputs` slot, because the property genuinely holds', () => {
    // The tree's whole discipline: a property belongs to a node only if it holds for every
    // descendant. A model with no inputs is not a model, so this must be true of all of them.
    const concreteModels = nodes.filter((n) => n.Kind === 'Model' && !n.IsAbstract);
    expect(concreteModels.length).toBeGreaterThan(0);
    for (const model of concreteModels) {
      const profile = resolveComponentProfile(model.ID, nodesById, groupByType(properties), groupByType(slots));
      const inputs = profile.Slots.find((s) => s.Name === 'inputs');
      expect(inputs, `${model.Name} has no inputs slot`).toBeDefined();
      // Unbounded and optional: a model may read one feature or a hundred.
      expect(inputs?.MinCount).toBe(0);
      expect(inputs?.MaxCount).toBeNull();
    }
  });

  it('has no Draft family left — everything seeded has a runtime behind it', () => {
    // Sequence/HMM were the last to graduate: they needed the ProblemType CHECK widened and
    // CodeGen re-run before a model could even hold the value.
    expect(nodes.filter((n) => n.Status === 'Draft').map((n) => n.Name)).toEqual([]);
  });

  it('publishes the structure wrappers, whose composition runtime now exists', () => {
    // The sidecar builds bagging/stacking graphs and loads reused children frozen, an approved
    // Action can be a feature, and `hmm` trains a sequence — so none of these are proposals now.
    for (const name of ['Bagging Wrapper', 'Stacking Wrapper', 'Code Feature', 'Hidden Markov Model']) {
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
