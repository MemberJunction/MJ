import { describe, it, expect } from 'vitest';
import type { RunActionParams, ActionParam, ActionResultSimple } from '@memberjunction/actions-base';
import type { MJMLComponentTypeEntity } from '@memberjunction/core-entities';
import type { ResolvedComponentProfile } from '@memberjunction/predictive-studio-core';

import {
  PredictiveStudioBrowseComponentTreeAction,
  PredictiveStudioFindReusableComponentsAction,
  PredictiveStudioValidateComponentGraphAction,
} from '../component-tree.actions';
import type { MLComponentEngine } from '../../components/ml-component-engine';
import type { ReuseFinder } from '../../stories/reuse-finder';

/**
 * The three component-tree actions are the agent-facing surface over the typed component model.
 * They are deliberately thin, so these tests are about the boundary: parameter validation that
 * refuses an unusable call BEFORE touching the tree, and result mapping an agent can act on.
 *
 * The one that matters most is the query vector. The stories were embedded with a specific model; a
 * vector from a different one produces distances that look like numbers and mean nothing. The action
 * refuses anything that is not a clean numeric array rather than passing it through.
 */

function params(list: ActionParam[]): RunActionParams {
  return { Params: list } as RunActionParams;
}
function out(p: RunActionParams, name: string): unknown {
  return p.Params.find((x) => x.Name === name)?.Value;
}

// ---------------------------------------------------------------------------
// A miniature tree: one abstract root, one concrete leaf with a slot.
// ---------------------------------------------------------------------------

const ROOT = { ID: 't-model', Name: 'Model', Kind: 'Model', IsAbstract: true, ParentID: null, Story: 'Evidence in, judgment out.' };
const LEAF = { ID: 't-bagging', Name: 'Bagging Wrapper', Kind: 'Structure', IsAbstract: false, ParentID: null, Story: 'Averages many of the same model.' };

const PROFILE: ResolvedComponentProfile = {
  Leaf: { ID: LEAF.ID, Name: LEAF.Name, Kind: 'Structure', IsAbstract: false, ParentID: null, Trainable: false, DriverClass: 'bagging', Status: 'Published' } as ResolvedComponentProfile['Leaf'],
  Chain: [
    { ID: ROOT.ID, Name: ROOT.Name } as ResolvedComponentProfile['Chain'][number],
    { ID: LEAF.ID, Name: LEAF.Name } as ResolvedComponentProfile['Chain'][number],
  ],
  Properties: { PreprocessingBank: [{ ItemKey: 'impute', Value: { op: 'impute' }, Rationale: null, SourceTypeID: ROOT.ID }] },
  Slots: [{ Name: 'base_estimator', Description: null, AcceptsComponentTypeID: ROOT.ID, MinCount: 1, MaxCount: 1, DefaultComponentTypeID: null, Sequence: 0, SourceTypeID: LEAF.ID }],
  Provenance: { PreprocessingBank: [ROOT.ID] },
};

function fakeEngine(): MLComponentEngine {
  return {
    ComponentTypes: [ROOT, LEAF] as unknown as MJMLComponentTypeEntity[],
    FindTypeByName: (name: string) => ([ROOT, LEAF] as unknown as MJMLComponentTypeEntity[]).find((t) => t.Name === name),
    TypesByKind: (kind: string) => ([ROOT, LEAF] as unknown as MJMLComponentTypeEntity[]).filter((t) => t.Kind === kind),
    ResolveProfile: () => PROFILE,
    IsDescendantOf: (typeID: string, ancestorID: string) => typeID === ancestorID || ancestorID === ROOT.ID,
  } as unknown as MLComponentEngine;
}

class TestableBrowse extends PredictiveStudioBrowseComponentTreeAction {
  protected override async loadEngine(): Promise<MLComponentEngine> {
    return fakeEngine();
  }
  public run(p: RunActionParams): Promise<ActionResultSimple> {
    return this.Run(p);
  }
}

class TestableValidate extends PredictiveStudioValidateComponentGraphAction {
  protected override async loadEngine(): Promise<MLComponentEngine> {
    return fakeEngine();
  }
  public run(p: RunActionParams): Promise<ActionResultSimple> {
    return this.Run(p);
  }
}

class TestableFind extends PredictiveStudioFindReusableComponentsAction {
  public LastRequest: Parameters<ReuseFinder['find']>[0] | null = null;
  protected override async loadEngine(): Promise<MLComponentEngine> {
    return fakeEngine();
  }
  protected override createFinder(): ReuseFinder {
    return {
      find: async (request) => {
        this.LastRequest = request;
        return {
          Matches: [
            { InstanceID: 'c1', Name: 'Activity recency', ComponentTypeID: ROOT.ID, ComponentTypeName: 'Recency', Similarity: 0.91, Story: 'Days since last activity.', PromotionState: 'Approved' },
          ],
          CandidatesConsidered: 4,
          Warnings: [],
        };
      },
    } as unknown as ReuseFinder;
  }
  public run(p: RunActionParams): Promise<ActionResultSimple> {
    return this.Run(p);
  }
}

// ---------------------------------------------------------------------------

describe('Browse ML Component Tree', () => {
  it('lists every type when nothing is narrowed', async () => {
    const p = params([]);
    const result = await new TestableBrowse().run(p);
    expect(result.Success).toBe(true);
    expect((out(p, 'ComponentTypes') as unknown[]).length).toBe(2);
  });

  it('narrows by Kind', async () => {
    const p = params([{ Name: 'Kind', Type: 'Input', Value: 'Structure' }]);
    await new TestableBrowse().run(p);
    expect((out(p, 'ComponentTypes') as Array<{ Name: string }>).map((t) => t.Name)).toEqual(['Bagging Wrapper']);
  });

  it('returns the RESOLVED profile with its chain and provenance, not just the row', async () => {
    // A leaf's real capabilities are the ones it INHERITS, so provenance is the answer to
    // "where did this constraint come from" — which is what makes the tree explainable.
    const p = params([{ Name: 'ComponentTypeName', Type: 'Input', Value: 'Bagging Wrapper' }]);
    const result = await new TestableBrowse().run(p);
    expect(result.Success).toBe(true);
    const profile = out(p, 'Profile') as { Chain: string[]; Provenance: Record<string, string[]>; Slots: unknown[] };
    expect(profile.Chain).toEqual(['Model', 'Bagging Wrapper']);
    expect(profile.Provenance.PreprocessingBank).toEqual([ROOT.ID]);
    expect(profile.Slots).toHaveLength(1);
    expect(result.Message).toContain('Model → Bagging Wrapper');
  });

  it('fails cleanly on an unknown type name', async () => {
    const result = await new TestableBrowse().run(params([{ Name: 'ComponentTypeName', Type: 'Input', Value: 'Transformer' }]));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('NOT_FOUND');
  });
});

describe('Find Reusable Components — validation', () => {
  it('refuses a missing query vector, naming the embedding-model requirement', async () => {
    const result = await new TestableFind().run(params([]));
    expect(result.Success).toBe(false);
    expect(result.Message).toContain('SAME model');
  });

  it('refuses a vector that is not a clean numeric array', async () => {
    // A malformed vector would produce distances that look like numbers and mean nothing.
    for (const bad of ['[]', '[1,"two"]', '{"a":1}', 'not json', '[1,null]']) {
      const result = await new TestableFind().run(params([{ Name: 'QueryVector', Type: 'Input', Value: bad }]));
      expect(result.Success, bad).toBe(false);
    }
  });

  it('refuses a half-specified slot filter', async () => {
    const result = await new TestableFind().run(
      params([
        { Name: 'QueryVector', Type: 'Input', Value: [1, 0] },
        { Name: 'ForComponentTypeID', Type: 'Input', Value: 't-bagging' },
      ]),
    );
    expect(result.Success).toBe(false);
    expect(result.Message).toContain('must be supplied together');
  });
});

describe('Find Reusable Components — delegation', () => {
  it('threads every constraint through and returns the matches', async () => {
    const action = new TestableFind();
    const p = params([
      { Name: 'QueryVector', Type: 'Input', Value: '[1,0,0]' },
      { Name: 'TopK', Type: 'Input', Value: 3 },
      { Name: 'MinSimilarity', Type: 'Input', Value: 0.8 },
      { Name: 'ForComponentTypeID', Type: 'Input', Value: 't-bagging' },
      { Name: 'ForSlotName', Type: 'Input', Value: 'base_estimator' },
      { Name: 'PromotionStates', Type: 'Input', Value: '["Approved","InReview"]' },
    ]);
    const result = await action.run(p);

    expect(result.Success).toBe(true);
    expect(action.LastRequest).toMatchObject({
      QueryVector: [1, 0, 0],
      TopK: 3,
      MinSimilarity: 0.8,
      ForSlot: { ComponentTypeID: 't-bagging', SlotName: 'base_estimator' },
      PromotionStates: ['Approved', 'InReview'],
      TrainedOnly: true,
    });
    expect((out(p, 'Matches') as unknown[]).length).toBe(1);
    expect(out(p, 'CandidatesConsidered')).toBe(4);
  });

  it('defaults to trained components only — reusing untrained work is not a default', async () => {
    const action = new TestableFind();
    await action.run(params([{ Name: 'QueryVector', Type: 'Input', Value: [1, 0] }]));
    expect(action.LastRequest?.TrainedOnly).toBe(true);
    // …and PromotionStates left to the finder's own Approved-only default.
    expect(action.LastRequest?.PromotionStates).toBeUndefined();
  });
});

describe('Validate Component Graph', () => {
  const legal = { ComponentTypeRef: 'Bagging Wrapper', Children: [{ ComponentTypeRef: 'Model', SlotName: 'base_estimator' }] };

  it('requires a graph or an architecture', async () => {
    const result = await new TestableValidate().run(params([]));
    expect(result.Success).toBe(false);
    expect(result.Message).toContain('Either a Graph or an Architecture');
  });

  it('rejects a Graph with no ComponentTypeRef', async () => {
    const result = await new TestableValidate().run(params([{ Name: 'Graph', Type: 'Input', Value: { Children: [] } }]));
    expect(result.Success).toBe(false);
    expect(result.Message).toContain('ComponentTypeRef');
  });

  it('validates a bare graph and reports the findings', async () => {
    const p = params([{ Name: 'Graph', Type: 'Input', Value: legal }]);
    const result = await new TestableValidate().run(p);
    // 'Model' is abstract in the fixture tree, so the composition is refused — and the caller is
    // told exactly which node and which rule.
    expect(out(p, 'Valid')).toBe(false);
    expect((out(p, 'Findings') as Array<{ Rule: string }>).some((f) => f.Rule === 'abstract-instantiation')).toBe(true);
    expect(result.Message).toContain('not buildable');
  });

  it('pulls the graph out of a whole ArchitectureSpec', async () => {
    const architecture = {
      Decision: 'compose',
      Rationale: 'a bagged model suits the variance here',
      Candidates: [{ ComponentTypeRef: 'Bagging Wrapper', Rationale: 'reduces variance' }],
      ComposedGraph: legal,
    };
    const p = params([{ Name: 'Architecture', Type: 'Input', Value: architecture }]);
    await new TestableValidate().run(p);
    expect(out(p, 'Findings')).toBeDefined();
  });

  it('says plainly when an architecture carries no composition to check', async () => {
    const commit = {
      Decision: 'commit',
      Rationale: 'interpretability is the requirement',
      Candidates: [{ ComponentTypeRef: 'Glass-Box Rubric', Rationale: 'explains itself' }],
    };
    const result = await new TestableValidate().run(params([{ Name: 'Architecture', Type: 'Input', Value: commit }]));
    expect(result.Success).toBe(false);
    expect(result.Message).toContain("'commit' decision, which carries no composition");
  });

  it('rejects a malformed architecture before touching the tree', async () => {
    const result = await new TestableValidate().run(params([{ Name: 'Architecture', Type: 'Input', Value: { Decision: 'compose' } }]));
    expect(result.Success).toBe(false);
    expect(result.Message).toContain('malformed');
  });
});
