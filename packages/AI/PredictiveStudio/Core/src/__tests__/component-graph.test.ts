import { describe, it, expect } from 'vitest';
import {
  validateComponentGraph,
  flattenComponentGraph,
  type ComponentGraphNode,
  type GraphComponentType,
  type GraphResolver,
  type GraphSlot,
} from '../component-graph-spec';
import { validateArchitectureSpec } from '../component-graph-schema';

/**
 * Two independent guards sit between an LLM's architecture proposal and anything training:
 * `validateArchitectureSpec` proves the JSON is well-formed, and `validateComponentGraph` proves the
 * composition is buildable against the REAL component tree. Neither subsumes the other — a
 * perfectly-shaped object can name a type that doesn't exist, and a legal graph can arrive with no
 * rationale. These tests pin both, plus the fact that every error says what WOULD have been valid.
 */

// ---------------------------------------------------------------------------
// A miniature of the seeded tree: the two structure wrappers and the rubric.
// ---------------------------------------------------------------------------

const TYPES: Record<string, GraphComponentType> = {
  Model: { ID: 't-model', Name: 'Model', Kind: 'Model', IsAbstract: true },
  Linear: { ID: 't-linear', Name: 'Linear', Kind: 'Model', IsAbstract: true },
  'Logistic Regression': { ID: 't-logreg', Name: 'Logistic Regression', Kind: 'Model', IsAbstract: false },
  'Random Forest': { ID: 't-rf', Name: 'Random Forest', Kind: 'Model', IsAbstract: false },
  XGBoost: { ID: 't-xgb', Name: 'XGBoost', Kind: 'Model', IsAbstract: false },
  'Glass-Box Rubric': { ID: 't-rubric', Name: 'Glass-Box Rubric', Kind: 'Model', IsAbstract: false },
  'Bagging Wrapper': { ID: 't-bagging', Name: 'Bagging Wrapper', Kind: 'Structure', IsAbstract: false },
  'Stacking Wrapper': { ID: 't-stacking', Name: 'Stacking Wrapper', Kind: 'Structure', IsAbstract: false },
  'Weight Set': { ID: 't-weights', Name: 'Weight Set', Kind: 'Parameter', IsAbstract: false },
  'Score Band': { ID: 't-bands', Name: 'Score Band', Kind: 'Output', IsAbstract: false },
};

/** parent → children, matching the seeded shape closely enough for the Accepts rule. */
const PARENT_OF: Record<string, string | null> = {
  't-model': null,
  't-linear': 't-model',
  't-logreg': 't-linear',
  't-rf': 't-model',
  't-xgb': 't-model',
  't-rubric': 't-linear',
  't-bagging': null,
  't-stacking': null,
  't-weights': null,
  't-bands': null,
};

const SLOTS: Record<string, GraphSlot[]> = {
  't-bagging': [{ Name: 'base_estimator', AcceptsComponentTypeID: 't-model', MinCount: 1, MaxCount: 1 }],
  't-stacking': [
    { Name: 'estimators', AcceptsComponentTypeID: 't-model', MinCount: 2, MaxCount: null },
    { Name: 'final_estimator', AcceptsComponentTypeID: 't-linear', MinCount: 1, MaxCount: 1 },
  ],
  't-rubric': [
    { Name: 'weights', AcceptsComponentTypeID: 't-weights', MinCount: 1, MaxCount: 1 },
    { Name: 'bands', AcceptsComponentTypeID: 't-bands', MinCount: 0, MaxCount: 1 },
  ],
};

const RESOLVER: GraphResolver = {
  FindTypeByName: (name) => TYPES[name],
  SlotsFor: (id) => SLOTS[id] ?? [],
  IsDescendantOf: (typeID, ancestorID) => {
    let cur: string | null = typeID;
    while (cur) {
      if (cur === ancestorID) return true;
      cur = PARENT_OF[cur] ?? null;
    }
    return false;
  },
};

const validate = (g: ComponentGraphNode) => validateComponentGraph(g, RESOLVER);
const rules = (g: ComponentGraphNode) => validate(g).Findings.map((f) => f.Rule);

// ---------------------------------------------------------------------------

describe('validateComponentGraph — legal compositions', () => {
  it('accepts a single concrete leaf', () => {
    expect(validate({ ComponentTypeRef: 'XGBoost' })).toEqual({ Valid: true, Findings: [] });
  });

  it('accepts a bagging wrapper over a model', () => {
    const g: ComponentGraphNode = {
      ComponentTypeRef: 'Bagging Wrapper',
      Children: [{ ComponentTypeRef: 'Random Forest', SlotName: 'base_estimator' }],
    };
    expect(validate(g).Valid).toBe(true);
  });

  it('accepts a stacking wrapper with three estimators and a linear final', () => {
    const g: ComponentGraphNode = {
      ComponentTypeRef: 'Stacking Wrapper',
      Children: [
        { ComponentTypeRef: 'XGBoost', SlotName: 'estimators' },
        { ComponentTypeRef: 'Random Forest', SlotName: 'estimators' },
        { ComponentTypeRef: 'Glass-Box Rubric', SlotName: 'estimators', Children: [{ ComponentTypeRef: 'Weight Set', SlotName: 'weights' }] },
        { ComponentTypeRef: 'Logistic Regression', SlotName: 'final_estimator' },
      ],
    };
    expect(validate(g)).toEqual({ Valid: true, Findings: [] });
  });

  it('leaves an OPTIONAL slot empty without complaint', () => {
    // The rubric's `bands` slot is MinCount 0 — absent is a legitimate configuration, not a gap.
    const g: ComponentGraphNode = {
      ComponentTypeRef: 'Glass-Box Rubric',
      Children: [{ ComponentTypeRef: 'Weight Set', SlotName: 'weights' }],
    };
    expect(validate(g)).toEqual({ Valid: true, Findings: [] });
  });

  it('accepts a reused instance in a slot', () => {
    const g: ComponentGraphNode = {
      ComponentTypeRef: 'Bagging Wrapper',
      Children: [{ ComponentTypeRef: 'Random Forest', SlotName: 'base_estimator', ReuseInstanceID: '8C84CD07-FAD0-42AE-852A-586D9DCF1273' }],
    };
    expect(validate(g).Valid).toBe(true);
  });
});

describe('validateComponentGraph — rejections', () => {
  it('rejects an unknown type', () => {
    const result = validate({ ComponentTypeRef: 'Transformer' });
    expect(result.Valid).toBe(false);
    expect(result.Findings[0]).toMatchObject({ Rule: 'unknown-type', Path: 'root' });
    expect(result.Findings[0].Message).toContain('Transformer');
  });

  it('rejects instantiating an ABSTRACT type', () => {
    const result = validate({ ComponentTypeRef: 'Linear' });
    expect(result.Valid).toBe(false);
    expect(result.Findings[0].Rule).toBe('abstract-instantiation');
    expect(result.Findings[0].Message).toContain('concrete descendants');
  });

  it('rejects a root that names a slot', () => {
    expect(rules({ ComponentTypeRef: 'XGBoost', SlotName: 'estimators' })).toContain('root-in-slot');
  });

  it('rejects a child with no slot name, and lists the slots it could have used', () => {
    const result = validate({ ComponentTypeRef: 'Bagging Wrapper', Children: [{ ComponentTypeRef: 'XGBoost' }] });
    const finding = result.Findings.find((f) => f.Rule === 'missing-slot-name');
    expect(finding).toBeDefined();
    expect(finding!.Message).toContain('base_estimator');
  });

  it('rejects an unknown slot, and says which slots exist', () => {
    const result = validate({
      ComponentTypeRef: 'Bagging Wrapper',
      Children: [{ ComponentTypeRef: 'XGBoost', SlotName: 'estimators' }],
    });
    const finding = result.Findings.find((f) => f.Rule === 'unknown-slot');
    expect(finding!.Message).toContain("has no slot called 'estimators'");
    expect(finding!.Message).toContain('Its slots are: base_estimator');
  });

  it('says plainly when a type has no slots at all', () => {
    const result = validate({ ComponentTypeRef: 'XGBoost', Children: [{ ComponentTypeRef: 'Random Forest', SlotName: 'x' }] });
    expect(result.Findings.some((f) => f.Message.includes('declares no slots at all'))).toBe(true);
  });

  it("enforces the slot's Accepts type, allowing descendants", () => {
    // final_estimator accepts Linear; Logistic Regression is a descendant → fine.
    const ok: ComponentGraphNode = {
      ComponentTypeRef: 'Stacking Wrapper',
      Children: [
        { ComponentTypeRef: 'XGBoost', SlotName: 'estimators' },
        { ComponentTypeRef: 'Random Forest', SlotName: 'estimators' },
        { ComponentTypeRef: 'Logistic Regression', SlotName: 'final_estimator' },
      ],
    };
    expect(validate(ok).Valid).toBe(true);

    // XGBoost is NOT under Linear → refused.
    const bad: ComponentGraphNode = {
      ...ok,
      Children: [...ok.Children!.slice(0, 2), { ComponentTypeRef: 'XGBoost', SlotName: 'final_estimator' }],
    };
    const result = validate(bad);
    expect(result.Valid).toBe(false);
    expect(result.Findings.find((f) => f.Rule === 'slot-accepts')!.Message).toContain("does not accept a 'XGBoost'");
  });

  it('rejects an unfilled REQUIRED slot', () => {
    const result = validate({ ComponentTypeRef: 'Bagging Wrapper' });
    const finding = result.Findings.find((f) => f.Rule === 'slot-arity');
    expect(finding!.Message).toContain('it is empty');
    expect(finding!.Path).toBe('root.base_estimator');
  });

  it('rejects an under-filled multi-slot, quoting how many are there', () => {
    const result = validate({
      ComponentTypeRef: 'Stacking Wrapper',
      Children: [
        { ComponentTypeRef: 'XGBoost', SlotName: 'estimators' },
        { ComponentTypeRef: 'Logistic Regression', SlotName: 'final_estimator' },
      ],
    });
    const finding = result.Findings.find((f) => f.Path === 'root.estimators');
    expect(finding!.Message).toContain('at least 2');
    expect(finding!.Message).toContain('only 1 is filled in');
  });

  it('rejects an over-filled slot', () => {
    const result = validate({
      ComponentTypeRef: 'Bagging Wrapper',
      Children: [
        { ComponentTypeRef: 'XGBoost', SlotName: 'base_estimator' },
        { ComponentTypeRef: 'Random Forest', SlotName: 'base_estimator' },
      ],
    });
    expect(result.Findings.find((f) => f.Rule === 'slot-arity')!.Message).toContain('at most 1, but 2 were supplied');
  });

  it('leaves an unbounded slot unbounded', () => {
    const g: ComponentGraphNode = {
      ComponentTypeRef: 'Stacking Wrapper',
      Children: [
        ...Array.from({ length: 12 }, () => ({ ComponentTypeRef: 'XGBoost', SlotName: 'estimators' })),
        { ComponentTypeRef: 'Logistic Regression', SlotName: 'final_estimator' },
      ],
    };
    expect(validate(g).Valid).toBe(true);
  });

  it('reports a readable path for the offending sibling', () => {
    const result = validate({
      ComponentTypeRef: 'Stacking Wrapper',
      Children: [
        { ComponentTypeRef: 'XGBoost', SlotName: 'estimators' },
        { ComponentTypeRef: 'Nope', SlotName: 'estimators' },
        { ComponentTypeRef: 'Logistic Regression', SlotName: 'final_estimator' },
      ],
    });
    expect(result.Findings.find((f) => f.Rule === 'unknown-type')!.Path).toBe('root.estimators[1]');
  });

  it('bounds depth instead of blowing the stack on a self-referential graph', () => {
    // A hand-built 40-deep chain (each bagging wrapping another) — the cap must fire.
    let node: ComponentGraphNode = { ComponentTypeRef: 'Random Forest', SlotName: 'base_estimator' };
    for (let i = 0; i < 40; i++) {
      node = { ComponentTypeRef: 'Bagging Wrapper', SlotName: 'base_estimator', Children: [node] };
    }
    const result = validate({ ComponentTypeRef: 'Bagging Wrapper', Children: [node] });
    expect(result.Findings.some((f) => f.Rule === 'max-depth')).toBe(true);
  });
});

describe('flattenComponentGraph', () => {
  it('returns every node, root first', () => {
    const g: ComponentGraphNode = {
      ComponentTypeRef: 'Stacking Wrapper',
      Children: [
        { ComponentTypeRef: 'XGBoost', SlotName: 'estimators' },
        { ComponentTypeRef: 'Glass-Box Rubric', SlotName: 'estimators', Children: [{ ComponentTypeRef: 'Weight Set', SlotName: 'weights' }] },
      ],
    };
    expect(flattenComponentGraph(g).map((n) => n.ComponentTypeRef)).toEqual([
      'Stacking Wrapper',
      'XGBoost',
      'Glass-Box Rubric',
      'Weight Set',
    ]);
  });
});

// ---------------------------------------------------------------------------

describe('validateArchitectureSpec — the shape guard', () => {
  const commit = { Decision: 'commit', Rationale: 'the data is small and interpretability matters', Candidates: [{ ComponentTypeRef: 'Logistic Regression', Rationale: 'exact per-record contributions' }] };

  it('accepts a well-formed commit', () => {
    const result = validateArchitectureSpec(commit);
    expect(result.ok).toBe(true);
  });

  it('requires a rationale — an unexplained decision is not a decision', () => {
    const result = validateArchitectureSpec({ ...commit, Rationale: '' });
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ error: expect.stringContaining('Rationale') });
  });

  it('requires every candidate to be explained', () => {
    const result = validateArchitectureSpec({ ...commit, Candidates: [{ ComponentTypeRef: 'XGBoost' }] });
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ error: expect.stringContaining('rationale') });
  });

  it("makes 'commit' mean exactly one candidate", () => {
    const result = validateArchitectureSpec({
      ...commit,
      Candidates: [
        { ComponentTypeRef: 'XGBoost', Rationale: 'a' },
        { ComponentTypeRef: 'Random Forest', Rationale: 'b' },
      ],
    });
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ error: expect.stringContaining("Use 'defer' to race several") });
  });

  it("makes 'defer' mean at least two", () => {
    const result = validateArchitectureSpec({ ...commit, Decision: 'defer' });
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ error: expect.stringContaining('at least two') });
  });

  it("makes 'reify' name its parent", () => {
    const two = [
      { ComponentTypeRef: 'XGBoost', Rationale: 'a' },
      { ComponentTypeRef: 'LightGBM', Rationale: 'b' },
    ];
    expect(validateArchitectureSpec({ ...commit, Decision: 'reify', Candidates: two }).ok).toBe(false);
    expect(validateArchitectureSpec({ ...commit, Decision: 'reify', Candidates: two, ReifiedUnderComponentTypeRef: 'Boosting' }).ok).toBe(true);
  });

  it("makes 'compose' carry a graph", () => {
    expect(validateArchitectureSpec({ ...commit, Decision: 'compose' }).ok).toBe(false);
    const withGraph = {
      ...commit,
      Decision: 'compose',
      ComposedGraph: { ComponentTypeRef: 'Bagging Wrapper', Children: [{ ComponentTypeRef: 'Random Forest', SlotName: 'base_estimator' }] },
    };
    expect(validateArchitectureSpec(withGraph).ok).toBe(true);
  });

  it('rejects a graph node with no type reference, naming its path', () => {
    const bad = {
      ...commit,
      Decision: 'compose',
      ComposedGraph: { ComponentTypeRef: 'Bagging Wrapper', Children: [{ SlotName: 'base_estimator' }] },
    };
    const result = validateArchitectureSpec(bad);
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ error: expect.stringContaining('ComposedGraph.Children.0.ComponentTypeRef') });
  });

  it('rejects a non-uuid reuse id', () => {
    const bad = {
      ...commit,
      Decision: 'compose',
      ComposedGraph: { ComponentTypeRef: 'Bagging Wrapper', Children: [{ ComponentTypeRef: 'Random Forest', SlotName: 'base_estimator', ReuseInstanceID: 'the-good-one' }] },
    };
    expect(validateArchitectureSpec(bad).ok).toBe(false);
  });

  it('reports a cyclic payload once rather than thousands of times', () => {
    const node: Record<string, unknown> = { ComponentTypeRef: 'Bagging Wrapper' };
    node.Children = [node]; // genuinely cyclic
    const result = validateArchitectureSpec({ ...commit, Decision: 'compose', ComposedGraph: node });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('refers to itself');
      expect(result.error.split('refers to itself').length - 1).toBe(1);
    }
  });

  it('rejects an unknown decision label', () => {
    expect(validateArchitectureSpec({ ...commit, Decision: 'improvise' }).ok).toBe(false);
  });
});
