import { describe, it, expect } from 'vitest';
import type { ComponentTypeNode, ResolvedComponentProfile, TreeLintFinding } from '@memberjunction/predictive-studio-core';

import {
  buildComponentTree,
  buildProfileVM,
  describeArity,
  displayValue,
  lintByNode,
  pathToNode,
} from '../PredictiveStudio/component-tree.view-models';

/**
 * The Components panel exists to make INHERITANCE legible. XGBoost declares almost nothing itself —
 * it gets `impute` from Tree Ensemble, its boosting hyperparameters from Boosting, and the leakage
 * gate from the Model root — so a merged list presented as though the leaf declared it would be
 * actively misleading. These tests pin the provenance attribution that prevents that, plus the tree
 * shaping around it.
 */

function node(id: string, name: string, parentId: string | null, kind = 'Model', isAbstract = false, story: string | null = null): ComponentTypeNode {
  return {
    ID: id,
    Name: name,
    ParentID: parentId,
    Kind: kind as ComponentTypeNode['Kind'],
    IsAbstract: isAbstract,
    Trainable: !isAbstract,
    DriverClass: isAbstract ? null : `${name.toLowerCase()}-driver`,
    SpecSchema: null,
    DefaultSpec: null,
    Story: story,
    Status: 'Published',
  };
}

/** Model → { Tree Ensemble → Boosting → XGBoost, Linear }, plus a separate Input Kind root. */
const NODES: ComponentTypeNode[] = [
  node('model', 'Model', null, 'Model', true, 'Evidence in, judgment out.'),
  node('tree', 'Tree Ensemble', 'model', 'Model', true),
  node('boost', 'Boosting', 'tree', 'Model', true),
  node('xgb', 'XGBoost', 'boost'),
  node('linear', 'Linear', 'model', 'Model', true),
  node('input', 'Input', null, 'Input', true),
  node('column', 'Column', 'input', 'Input'),
];

const names = (ids: Set<string>, kind?: string) => buildComponentTree(NODES, ids, kind).map((n) => n.name);

describe('buildComponentTree', () => {
  it('shows only the roots when nothing is expanded', () => {
    expect(names(new Set())).toEqual(['Input', 'Model']);
  });

  it('omits a collapsed node\'s whole subtree, not just its children', () => {
    // Expanding Model but not Tree Ensemble must not leak Boosting or XGBoost into the list.
    expect(names(new Set(['model']))).toEqual(['Input', 'Model', 'Linear', 'Tree Ensemble']);
  });

  it('walks depth-first, alphabetical within a level', () => {
    const rendered = buildComponentTree(NODES, new Set(['model', 'tree', 'boost']), undefined);
    expect(rendered.map((n) => n.name)).toEqual(['Input', 'Model', 'Linear', 'Tree Ensemble', 'Boosting', 'XGBoost']);
    expect(rendered.map((n) => n.depth)).toEqual([0, 0, 1, 1, 2, 3]);
  });

  it('marks which nodes have children, so the expander is only rendered where it works', () => {
    const rendered = buildComponentTree(NODES, new Set(['model']), undefined);
    expect(rendered.find((n) => n.name === 'Linear')?.hasChildren).toBe(false);
    expect(rendered.find((n) => n.name === 'Tree Ensemble')?.hasChildren).toBe(true);
  });

  it('carries the archetype story as the node subtitle', () => {
    expect(buildComponentTree(NODES, new Set(), undefined).find((n) => n.name === 'Model')?.story).toBe('Evidence in, judgment out.');
  });

  it('narrows to one Kind', () => {
    expect(names(new Set(['input']), 'Input')).toEqual(['Input', 'Column']);
  });

  it('does not hang on a cycle — that is the linter\'s problem to report, not the UI\'s to crash on', () => {
    const cyclic = [node('a', 'A', 'b'), node('b', 'B', 'a')];
    expect(() => buildComponentTree(cyclic, new Set(['a', 'b']), undefined)).not.toThrow();
  });
});

describe('pathToNode', () => {
  it('returns every ancestor, root first, so selecting a leaf can open the path to it', () => {
    expect(pathToNode(NODES, 'xgb')).toEqual(['model', 'tree', 'boost']);
  });

  it('is empty for a root', () => {
    expect(pathToNode(NODES, 'model')).toEqual([]);
  });

  it('terminates on a cycle', () => {
    expect(() => pathToNode([node('a', 'A', 'b'), node('b', 'B', 'a')], 'a')).not.toThrow();
  });
});

describe('buildProfileVM — provenance is the point', () => {
  const profile: ResolvedComponentProfile = {
    Leaf: NODES.find((n) => n.ID === 'xgb') as ResolvedComponentProfile['Leaf'],
    Chain: [NODES[0], NODES[1], NODES[2], NODES[3]] as ResolvedComponentProfile['Chain'],
    Properties: {
      PreprocessingBank: [
        { ItemKey: 'impute', Value: { op: 'impute', strategy: 'median' }, Rationale: 'Trees tolerate missing values badly.', SourceTypeID: 'tree' },
      ],
      HyperparameterBank: [
        { ItemKey: 'learning_rate', Value: { name: 'learning_rate', range: [0.001, 0.3] }, Rationale: null, SourceTypeID: 'boost' },
        { ItemKey: 'own_knob', Value: 'declared here', Rationale: null, SourceTypeID: 'xgb' },
      ],
      Explainability: [{ ItemKey: null, Value: 'global-importance', Rationale: null, SourceTypeID: 'tree' }],
    },
    Slots: [
      { Name: 'base_estimator', Description: null, AcceptsComponentTypeID: 'model', MinCount: 1, MaxCount: 1, DefaultComponentTypeID: null, Sequence: 0, SourceTypeID: 'tree' },
    ],
    Provenance: {},
  };

  const vm = buildProfileVM(profile, new Map(NODES.map((n) => [n.ID, n.Name])));

  it('renders the chain root-first', () => {
    expect(vm.chain).toEqual(['Model', 'Tree Ensemble', 'Boosting', 'XGBoost']);
  });

  it('names the ancestor an inherited item came from', () => {
    const bank = vm.sections.find((s) => s.key === 'PreprocessingBank')!;
    expect(bank.items[0].inheritedFrom).toBe('Tree Ensemble');
    expect(bank.items[0].rationale).toContain('tolerate missing values');
  });

  it('leaves inheritedFrom NULL for the leaf\'s own declaration — no chip where none is warranted', () => {
    const hyper = vm.sections.find((s) => s.key === 'HyperparameterBank')!;
    expect(hyper.items.find((i) => i.itemKey === 'learning_rate')?.inheritedFrom).toBe('Boosting');
    expect(hyper.items.find((i) => i.itemKey === 'own_knob')?.inheritedFrom).toBeNull();
  });

  it('orders sections by decision-relevance, not by object key order', () => {
    // Explainability answers "can I show a user why" and belongs above the banks.
    expect(vm.sections.map((s) => s.key)).toEqual(['Explainability', 'PreprocessingBank', 'HyperparameterBank']);
  });

  it('gives sections English headings rather than field names', () => {
    expect(vm.sections.find((s) => s.key === 'PreprocessingBank')?.label).toBe('Preprocessing bank');
  });

  it('resolves a slot\'s Accepts to a readable name and states its arity', () => {
    expect(vm.slots[0]).toMatchObject({ name: 'base_estimator', acceptsName: 'Model', arity: 'exactly 1', inheritedFrom: 'Tree Ensemble' });
  });

  it('falls back to the id when a name cannot be resolved, rather than showing nothing', () => {
    const orphaned = buildProfileVM(profile, new Map());
    expect(orphaned.sections[0].items[0].inheritedFrom).toBe('tree');
  });

  it('omits sections that resolved to nothing', () => {
    expect(vm.sections.some((s) => s.items.length === 0)).toBe(false);
  });
});

describe('describeArity', () => {
  it('reads as English for each shape a slot can take', () => {
    expect(describeArity(1, 1)).toBe('exactly 1');
    expect(describeArity(0, 1)).toBe('0–1');
    expect(describeArity(2, null)).toBe('at least 2');
    expect(describeArity(0, null)).toBe('any number');
  });
});

describe('displayValue', () => {
  it('shows scalars as themselves and structures as tight JSON', () => {
    expect(displayValue('global-importance')).toBe('global-importance');
    expect(displayValue(5)).toBe('5');
    expect(displayValue(true)).toBe('true');
    expect(displayValue({ op: 'impute' })).toBe('{"op":"impute"}');
    expect(displayValue(['a', 'b'])).toBe('["a","b"]');
  });

  it('renders absence as empty rather than "null"', () => {
    expect(displayValue(null)).toBe('');
    expect(displayValue(undefined)).toBe('');
  });
});

describe('lintByNode', () => {
  const findings: TreeLintFinding[] = [
    { Severity: 'Warning', Rule: 'descendant-contradiction', NodeID: 'tree', Message: 'A descendant vetoes this.' },
    { Severity: 'Error', Rule: 'kind-consistency', NodeID: 'tree', Message: 'Kind differs from parent.' },
    { Severity: 'Info', Rule: 'hoist-suggestion', NodeID: 'boost', Message: 'Could move up.' },
  ];

  it('groups by node so the tree can badge them', () => {
    const byNode = lintByNode(findings);
    expect(byNode.get('tree')).toHaveLength(2);
  });

  it('drops Info findings — a suggestion is not a problem to flag in the tree', () => {
    expect(lintByNode(findings).has('boost')).toBe(false);
  });
});
