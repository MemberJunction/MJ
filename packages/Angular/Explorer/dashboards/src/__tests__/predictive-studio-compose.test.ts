/**
 * Compose panel view-models.
 *
 * The pivotal test is the path one. `validateComponentGraph` reports findings against dotted paths,
 * and the view-model rebuilds those paths independently to hang each finding on its node. If the two
 * derivations ever drift, every finding silently lands nowhere and the panel shows a clean graph
 * that will not build — so the invariant is pinned by diffing the VM's paths against the real
 * validator's output rather than against a hardcoded list.
 */

import { describe, it, expect } from 'vitest';
import type {
  ComponentGraphNode,
  GraphComponentType,
  GraphResolver,
  GraphSlot,
} from '@memberjunction/predictive-studio-core';
import { validateComponentGraph } from '@memberjunction/predictive-studio-core';

import {
  buildComposeVM,
  candidateTypesForSlot,
  composeChildPath,
  describeSlotArity,
  fillSlot,
  flattenComposeVM,
  removeNodeAt,
  setParamsAt,
  setRootType,
} from '../PredictiveStudio/compose.view-models';

// A miniature of the seeded tree: Model(abstract) → Linear(abstract) → Logistic Regression,
// Tree Ensemble(abstract) → Random Forest, plus the two Structure wrappers.
const TYPES: GraphComponentType[] = [
  { ID: 't-model', Name: 'Model', Kind: 'Model', IsAbstract: true },
  { ID: 't-linear', Name: 'Linear', Kind: 'Model', IsAbstract: true },
  { ID: 't-logreg', Name: 'Logistic Regression', Kind: 'Model', IsAbstract: false },
  { ID: 't-ensemble', Name: 'Tree Ensemble', Kind: 'Model', IsAbstract: true },
  { ID: 't-rf', Name: 'Random Forest', Kind: 'Model', IsAbstract: false },
  { ID: 't-bag', Name: 'Bagging Wrapper', Kind: 'Structure', IsAbstract: false },
  { ID: 't-stack', Name: 'Stacking Wrapper', Kind: 'Structure', IsAbstract: false },
];

const PARENT: Record<string, string | null> = {
  't-model': null,
  't-linear': 't-model',
  't-logreg': 't-linear',
  't-ensemble': 't-model',
  't-rf': 't-ensemble',
  't-bag': null,
  't-stack': null,
};

const SLOTS: Record<string, GraphSlot[]> = {
  't-bag': [{ Name: 'base_estimator', AcceptsComponentTypeID: 't-model', MinCount: 1, MaxCount: 1 }],
  't-stack': [
    { Name: 'estimators', AcceptsComponentTypeID: 't-model', MinCount: 2, MaxCount: null },
    { Name: 'final_estimator', AcceptsComponentTypeID: 't-linear', MinCount: 1, MaxCount: 1 },
  ],
};

const resolver: GraphResolver = {
  FindTypeByName: (name) => TYPES.find((t) => t.Name.toLowerCase() === name.trim().toLowerCase()),
  SlotsFor: (id) => SLOTS[id] ?? [],
  IsDescendantOf: (typeID, ancestorID) => {
    let cur: string | null = typeID;
    while (cur) {
      if (cur === ancestorID) return true;
      cur = PARENT[cur] ?? null;
    }
    return false;
  },
};

const BAGGED_FOREST: ComponentGraphNode = {
  ComponentTypeRef: 'Bagging Wrapper',
  Children: [{ ComponentTypeRef: 'Random Forest', SlotName: 'base_estimator' }],
};

const STACK: ComponentGraphNode = {
  ComponentTypeRef: 'Stacking Wrapper',
  Children: [
    { ComponentTypeRef: 'Random Forest', SlotName: 'estimators' },
    { ComponentTypeRef: 'Logistic Regression', SlotName: 'estimators' },
    { ComponentTypeRef: 'Logistic Regression', SlotName: 'final_estimator' },
  ],
};

function vmFor(graph: ComponentGraphNode) {
  const result = validateComponentGraph(graph, resolver);
  return { vm: buildComposeVM(graph, resolver, result.Findings, TYPES), result };
}

describe('compose view-models — paths agree with the validator', () => {
  it('rebuilds exactly the paths the validator reports findings against', () => {
    // Deliberately broken in three places at once, so several finding paths exist to match.
    const broken: ComponentGraphNode = {
      ComponentTypeRef: 'Stacking Wrapper',
      Children: [
        { ComponentTypeRef: 'Random Forest', SlotName: 'estimators' },
        { ComponentTypeRef: 'Linear', SlotName: 'estimators' }, // abstract
        { ComponentTypeRef: 'Imaginary Forest', SlotName: 'final_estimator' }, // unknown
      ],
    };
    const { vm, result } = vmFor(broken);

    expect(result.Findings.length).toBeGreaterThan(0);
    const vmPaths = new Set(flattenComposeVM(vm).map((n) => n.Path));
    // Every finding on a NODE must land on a node the panel actually renders. (Slot-arity findings
    // are reported against `<path>.<slot>`, which is a slot rather than a node — excluded here.)
    const nodeFindings = result.Findings.filter((f) => f.Rule !== 'slot-arity');
    for (const f of nodeFindings) {
      expect(vmPaths.has(f.Path), `finding path '${f.Path}' (${f.Rule}) matched no rendered node`).toBe(true);
    }
  });

  it('indexes siblings within their own slot, not across all children', () => {
    const children = STACK.Children!;
    expect(composeChildPath('root', children, 0)).toBe('root.estimators[0]');
    expect(composeChildPath('root', children, 1)).toBe('root.estimators[1]');
    // final_estimator is child #2 overall but the FIRST in its own slot.
    expect(composeChildPath('root', children, 2)).toBe('root.final_estimator[0]');
  });

  it('falls back to a children[] path for a node that names no slot', () => {
    const children: ComponentGraphNode[] = [{ ComponentTypeRef: 'Random Forest' }];
    expect(composeChildPath('root', children, 0)).toBe('root.children[0]');
  });

  it('attaches each finding to its own node and marks the branch above it', () => {
    const broken: ComponentGraphNode = {
      ComponentTypeRef: 'Bagging Wrapper',
      Children: [{ ComponentTypeRef: 'Imaginary Forest', SlotName: 'base_estimator' }],
    };
    const { vm } = vmFor(broken);
    const child = vm.Slots[0].Children[0];

    expect(child.Findings.some((f) => f.Rule === 'unknown-type')).toBe(true);
    expect(vm.Findings).toEqual([]); // the root itself is fine...
    expect(vm.HasErrorBelow).toBe(true); // ...but something under it is not
  });
});

describe('compose view-models — structure', () => {
  it('renders a declared slot even when nothing fills it yet', () => {
    // An empty slot must be a labelled target, not an absence — otherwise there is nothing to
    // click, and the model cannot be built at all.
    const { vm } = vmFor({ ComponentTypeRef: 'Bagging Wrapper' });
    expect(vm.Slots.map((s) => s.Name)).toEqual(['base_estimator']);
    expect(vm.Slots[0].Children).toEqual([]);
    expect(vm.Slots[0].IsUnderfilled).toBe(true);
    expect(vm.Slots[0].AcceptsName).toBe('Model');
  });

  it('groups children under the slot each one fills', () => {
    const { vm } = vmFor(STACK);
    const byName = new Map(vm.Slots.map((s) => [s.Name, s]));
    expect(byName.get('estimators')!.Children.map((c) => c.TypeRef)).toEqual(['Random Forest', 'Logistic Regression']);
    expect(byName.get('final_estimator')!.Children.map((c) => c.TypeRef)).toEqual(['Logistic Regression']);
  });

  it('closes a 1-arity slot once filled, and never closes an unbounded one', () => {
    const { vm } = vmFor(STACK);
    const byName = new Map(vm.Slots.map((s) => [s.Name, s]));
    expect(byName.get('final_estimator')!.CanAddMore).toBe(false);
    expect(byName.get('estimators')!.CanAddMore).toBe(true);
    expect(byName.get('estimators')!.IsUnderfilled).toBe(false); // 2 of a 2-minimum
  });

  it('still shows a child parked in a slot the type does not declare', () => {
    // The validator flags it; if the panel hid it there would be no way to remove it.
    const { vm } = vmFor({
      ComponentTypeRef: 'Bagging Wrapper',
      Children: [{ ComponentTypeRef: 'Random Forest', SlotName: 'nonsense' }],
    });
    const orphan = vm.Slots.find((s) => s.Name === '(unrecognized)');
    expect(orphan?.Children.map((c) => c.TypeRef)).toEqual(['Random Forest']);
  });

  it('shows an unknown root type without slots rather than throwing', () => {
    const { vm } = vmFor({ ComponentTypeRef: 'Imaginary Forest' });
    expect(vm.Type).toBeNull();
    expect(vm.Slots).toEqual([]);
  });
});

describe('describeSlotArity', () => {
  it.each([
    [{ MinCount: 1, MaxCount: 1 }, 'exactly 1'],
    [{ MinCount: 2, MaxCount: null }, '2 or more'],
    [{ MinCount: 0, MaxCount: 3 }, 'up to 3'],
    [{ MinCount: 1, MaxCount: 3 }, '1–3'],
    [{ MinCount: 0, MaxCount: null }, 'any number'],
  ])('describes %o as "%s"', (slot, expected) => {
    expect(describeSlotArity(slot)).toBe(expected);
  });
});

describe('candidateTypesForSlot', () => {
  it('offers only what the slot accepts, by the validator’s own descendant rule', () => {
    const { vm } = vmFor({ ComponentTypeRef: 'Stacking Wrapper' });
    const final = vm.Slots.find((s) => s.Name === 'final_estimator')!;
    // final_estimator accepts Linear, so a Random Forest must not be offered there.
    expect(candidateTypesForSlot(final, TYPES, resolver).map((c) => c.Name)).toEqual(['Logistic Regression', 'Linear']);
  });

  it('shows an abstract type disabled, with the reason, instead of hiding it', () => {
    const { vm } = vmFor({ ComponentTypeRef: 'Bagging Wrapper' });
    const base = vm.Slots[0];
    const abstract = candidateTypesForSlot(base, TYPES, resolver).find((c) => c.Name === 'Model')!;
    expect(abstract.DisabledReason).toContain('abstract');
    const concrete = candidateTypesForSlot(base, TYPES, resolver).find((c) => c.Name === 'Random Forest')!;
    expect(concrete.DisabledReason).toBeNull();
  });

  it('disables every candidate for a slot that is already full', () => {
    const { vm } = vmFor(BAGGED_FOREST);
    const base = vm.Slots[0];
    expect(base.CanAddMore).toBe(false);
    expect(candidateTypesForSlot(base, TYPES, resolver).every((c) => c.DisabledReason !== null)).toBe(true);
  });
});

describe('compose edits are immutable', () => {
  it('fills a slot without mutating the original graph', () => {
    const before = JSON.stringify(BAGGED_FOREST);
    const next = fillSlot(BAGGED_FOREST, [], 'base_estimator', 'Logistic Regression');
    expect(JSON.stringify(BAGGED_FOREST)).toBe(before);
    expect(next.Children).toHaveLength(2);
    expect(next.Children![1]).toEqual({ ComponentTypeRef: 'Logistic Regression', SlotName: 'base_estimator' });
  });

  it('fills a slot on a NESTED node via its trail', () => {
    const nested: ComponentGraphNode = {
      ComponentTypeRef: 'Bagging Wrapper',
      Children: [{ ComponentTypeRef: 'Stacking Wrapper', SlotName: 'base_estimator' }],
    };
    const next = fillSlot(nested, [0], 'estimators', 'Random Forest');
    expect(next.Children![0].Children![0]).toEqual({ ComponentTypeRef: 'Random Forest', SlotName: 'estimators' });
  });

  it('removes a node by trail, leaving siblings in order', () => {
    const next = removeNodeAt(STACK, [1]);
    expect(next.Children!.map((c) => c.ComponentTypeRef)).toEqual(['Random Forest', 'Logistic Regression']);
    expect(next.Children!.map((c) => c.SlotName)).toEqual(['estimators', 'final_estimator']);
  });

  it('refuses to remove the root — there would be no graph left', () => {
    expect(removeNodeAt(STACK, [])).toBe(STACK);
  });

  it('leaves the graph untouched for a stale trail', () => {
    // A trail can go stale between render and click; silently editing the wrong node is worse
    // than doing nothing.
    expect(removeNodeAt(BAGGED_FOREST, [7])).toEqual(BAGGED_FOREST);
    expect(fillSlot(BAGGED_FOREST, [7], 'x', 'y')).toEqual(BAGGED_FOREST);
  });

  it('sets params on a node', () => {
    const next = setParamsAt(BAGGED_FOREST, [0], { n_estimators: 10 });
    expect(next.Children![0].Params).toEqual({ n_estimators: 10 });
  });

  it('discards children when the root type changes — they filled the OLD type’s slots', () => {
    const next = setRootType(BAGGED_FOREST, 'Stacking Wrapper');
    expect(next).toEqual({ ComponentTypeRef: 'Stacking Wrapper' });
  });

  it('is a no-op when the root type is unchanged', () => {
    expect(setRootType(BAGGED_FOREST, 'Bagging Wrapper')).toBe(BAGGED_FOREST);
  });
});
