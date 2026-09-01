import { describe, it, expect } from 'vitest';
import type { UserInfo, IMetadataProvider } from '@memberjunction/core';
import type { AIPromptParams, AIPromptRunResult } from '@memberjunction/ai-core-plus';
import type { MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import type { MJMLModelEntity, MJMLComponentEntity } from '@memberjunction/core-entities';
import type { ModelStory, TrustVerdict } from '@memberjunction/predictive-studio-core';

import {
  ModelStoryTagger,
  tagModelStoryBestEffort,
  modelStoryText,
  type IStoryPromptLoader,
  type StoryTaggerDeps,
} from '../model-story-tagger';
import type { IStoryPromptRunner } from '../seams';
import { attributeImportance, readImportance, readMetrics, type IStoryContextLoader, type ModelStoryContext } from '../story-context-loader';

/**
 * The tagger is the only generative step in the promotion path, so the tests are mostly about what
 * it REFUSES to do: attribute a contribution to a component the model does not have, let a bad
 * story reach the database, or fail a promotion that already succeeded.
 */

const ROOT_ID = '11111111-1111-4111-8111-111111111111';
const CHILD_ID = '22222222-2222-4222-8222-222222222222';
const GHOST_ID = '33333333-3333-4333-8333-333333333333';

const TRUST: TrustVerdict = {
  grade: 'Good',
  score01: 0.8,
  oneLiner: 'Right about 8 out of 10 times.',
  explanation: 'Reliable enough to act on.',
  canAct: true,
  gateReason: null,
  headlineMetric: { key: 'AUC', value: 0.82 },
  unmeasured: false,
};

function context(over: Partial<ModelStoryContext> = {}): ModelStoryContext {
  return {
    ModelID: 'model-1',
    ModelName: 'Member Renewal Predictor v5',
    TargetEntityName: 'Members',
    TargetVariable: 'Renewed',
    ProblemType: 'classification',
    Trust: TRUST,
    Metrics: { auc: 0.82 },
    MetricsAreHoldout: true,
    FeatureImportance: [{ Feature: 'tenure', Share: 0.7 }],
    TrainingRowCount: 800,
    Components: [
      { InstanceID: ROOT_ID, Name: 'root', ComponentTypeName: 'XGBoost', TypeStory: null, Bindings: [] },
      { InstanceID: CHILD_ID, Name: 'tenure', ComponentTypeName: 'Column', TypeStory: null, Bindings: [] },
    ],
    Warnings: [],
    ...over,
  };
}

function story(over: Partial<ModelStory> = {}): ModelStory {
  return {
    Headline: 'Which members are likely to renew',
    Story: 'Scores each member on how likely they are to renew, mostly from how long they have been a member.',
    DataStory: '800 members, one in five of whom lapsed.',
    BusinessConnection: 'Lets the team focus outreach on the members most at risk of leaving.',
    Components: [
      {
        InstanceID: CHILD_ID,
        Headline: 'Membership tenure',
        Story: 'How long this person has been a member.',
        Contribution: { Role: 'primary-driver', Weight: 0.7, Evidence: '0.70 of total importance', ReusePotential: 'high', ReuseWhen: 'Any model about member loyalty.' },
      },
    ],
    Caveats: ['Trained on members who joined before 2026; newer cohorts may behave differently.'],
    TrustGrade: 'Good',
    ...over,
  };
}

/** A model fake exposing only what the tagger reads. */
class FakeModel {
  public ID = 'model-1';
  public RootComponentID: string | null = ROOT_ID;
  public Version = 5;
  public Pipeline: string | null = 'Members';
  public TargetVariable = 'Renewed';
  public ProblemType: 'classification' | 'regression' = 'classification';
  public TrainingRowCount: number | null = 800;
  public Metrics: string | null = JSON.stringify({ auc: 0.8 });
  public HoldoutMetrics: string | null = JSON.stringify({ auc: 0.82 });
  public FeatureImportance: string | null = JSON.stringify({ tenure: 0.7, city: 0.3 });
}

class FakeContextLoader implements IStoryContextLoader {
  constructor(private readonly ctx: ModelStoryContext) {}
  async load(): Promise<ModelStoryContext> {
    return this.ctx;
  }
}

class FakePromptLoader implements IStoryPromptLoader {
  constructor(private readonly found = true) {}
  async load(): Promise<MJAIPromptEntityExtended | null> {
    return this.found ? ({ ID: 'prompt-1', Name: 'Model Story Tagger - Main Prompt' } as unknown as MJAIPromptEntityExtended) : null;
  }
}

/** A runner returning a canned payload, capturing what it was asked. */
class FakeRunner implements IStoryPromptRunner {
  public Calls: AIPromptParams[] = [];
  constructor(private readonly payload: unknown, private readonly success = true) {}
  async ExecutePrompt<T = unknown>(params: AIPromptParams): Promise<AIPromptRunResult<T>> {
    this.Calls.push(params);
    return { success: this.success, result: this.payload, errorMessage: this.success ? undefined : 'model unavailable' } as unknown as AIPromptRunResult<T>;
  }
}

/** In-memory component rows, so persistence is observable without a DB. */
class FakeComponent {
  public Story: string | null = null;
  public StoryContribution: string | null = null;
  public LatestResult: { CompleteMessage: string } | null = null;
  public SaveOk = true;
  constructor(public ID: string) {}
  async Load(id: string): Promise<boolean> {
    return id === this.ID;
  }
  async Save(): Promise<boolean> {
    if (!this.SaveOk) {
      this.LatestResult = { CompleteMessage: 'refused' };
      return false;
    }
    return true;
  }
}

/** A tagger whose component lookup is in-memory. */
class TestTagger extends ModelStoryTagger {
  public readonly Components = new Map<string, FakeComponent>();
  constructor(ids: string[]) {
    super();
    for (const id of ids) this.Components.set(id.toLowerCase(), new FakeComponent(id));
  }
  protected override async getComponent(componentId: string): Promise<MJMLComponentEntity | null> {
    return (this.Components.get(componentId.toLowerCase()) ?? null) as unknown as MJMLComponentEntity | null;
  }
}

function deps(over: Partial<StoryTaggerDeps> = {}): StoryTaggerDeps {
  return {
    runner: new FakeRunner(story()),
    promptLoader: new FakePromptLoader(),
    contextLoader: new FakeContextLoader(context()),
    contextUser: undefined as unknown as UserInfo,
    provider: undefined as unknown as IMetadataProvider,
    ...over,
  };
}

const model = () => new FakeModel() as unknown as MJMLModelEntity;

describe('ModelStoryTagger.tag — the happy path', () => {
  it('writes the model story to the ROOT component and each component story to its own row', async () => {
    const tagger = new TestTagger([ROOT_ID, CHILD_ID]);
    const result = await tagger.tag(model(), TRUST, deps());

    expect(result.Tagged).toBe(true);
    expect(result.ComponentsUpdated).toBe(2);

    const root = tagger.Components.get(ROOT_ID.toLowerCase())!;
    expect(root.Story).toContain('Which members are likely to renew');
    expect(root.Story).toContain('Lets the team focus outreach');
    // The whole validated story is kept as structured data alongside the prose.
    expect(JSON.parse(root.StoryContribution!).Headline).toBe('Which members are likely to renew');

    // A component found by a similarity search months later must carry its OWN meaning, independent
    // of the model it was born in — which is why the story lands on its own row.
    const child = tagger.Components.get(CHILD_ID.toLowerCase())!;
    expect(child.Story).toBe('Membership tenure — How long this person has been a member.');
    expect(JSON.parse(child.StoryContribution!).Role).toBe('primary-driver');
  });

  it('hands the writer the computed FACTS rather than asking it to recall them', async () => {
    const runner = new FakeRunner(story());
    await new TestTagger([ROOT_ID, CHILD_ID]).tag(model(), TRUST, deps({ runner }));
    const sent = runner.Calls[0].data as { storyContext: ModelStoryContext };
    expect(sent.storyContext.Trust.grade).toBe('Good');
    expect(sent.storyContext.Metrics).toEqual({ auc: 0.82 });
    expect(sent.storyContext.MetricsAreHoldout).toBe(true);
  });

  it('does not write the child story twice when the root is also listed as a component', async () => {
    const withRoot = story({
      Components: [
        { InstanceID: ROOT_ID, Headline: 'root', Story: 'r', Contribution: { Role: 'structural', Evidence: 'e', ReusePotential: 'low', ReuseWhen: 'w' } },
        ...story().Components,
      ],
    });
    const tagger = new TestTagger([ROOT_ID, CHILD_ID]);
    const result = await tagger.tag(model(), TRUST, deps({ runner: new FakeRunner(withRoot) }));
    // Root + child, not root + root + child — the root already carries the model-level story.
    expect(result.ComponentsUpdated).toBe(2);
    expect(tagger.Components.get(ROOT_ID.toLowerCase())!.Story).toContain('Which members are likely to renew');
  });

  it('parses a story returned as raw JSON text', async () => {
    const result = await new TestTagger([ROOT_ID, CHILD_ID]).tag(model(), TRUST, deps({ runner: new FakeRunner(JSON.stringify(story())) }));
    expect(result.Tagged).toBe(true);
  });
});

describe('ModelStoryTagger.tag — what it refuses', () => {
  it('DISCARDS a story that attributes a contribution to a component the model does not have', async () => {
    // Prose cannot be verified; attribution can. A mis-attributed component would surface in a later
    // reuse-by-meaning search as though it were real.
    const misattributed = story({
      Components: [{ InstanceID: GHOST_ID, Headline: 'ghost', Story: 's', Contribution: { Role: 'supporting', Evidence: 'e', ReusePotential: 'low', ReuseWhen: 'w' } }],
    });
    const tagger = new TestTagger([ROOT_ID, CHILD_ID]);
    const result = await tagger.tag(model(), TRUST, deps({ runner: new FakeRunner(misattributed) }));

    expect(result.Tagged).toBe(false);
    expect(result.Reasons[0]).toContain('does not have');
    expect(result.Reasons[0]).toContain(GHOST_ID);
    // Nothing was written — a partially-correct story is not written partially.
    expect(tagger.Components.get(ROOT_ID.toLowerCase())!.Story).toBeNull();
  });

  it('discards a story with no caveats', async () => {
    const noCaveats = story({ Caveats: [] });
    const result = await new TestTagger([ROOT_ID, CHILD_ID]).tag(model(), TRUST, deps({ runner: new FakeRunner(noCaveats) }));
    expect(result.Tagged).toBe(false);
    expect(result.Reasons[0]).toContain('marketing');
  });

  it('discards a malformed payload', async () => {
    const result = await new TestTagger([ROOT_ID]).tag(model(), TRUST, deps({ runner: new FakeRunner({ Headline: 'x' }) }));
    expect(result.Tagged).toBe(false);
  });

  it('does nothing when the story prompt is not seeded', async () => {
    const result = await new TestTagger([ROOT_ID]).tag(model(), TRUST, deps({ promptLoader: new FakePromptLoader(false) }));
    expect(result.Tagged).toBe(false);
    expect(result.Reasons[0]).toContain('not seeded');
  });

  it('does nothing when the model call fails', async () => {
    const result = await new TestTagger([ROOT_ID]).tag(model(), TRUST, deps({ runner: new FakeRunner(null, false) }));
    expect(result.Tagged).toBe(false);
  });
});

describe('ModelStoryTagger.tag — degradation', () => {
  it('still writes what it can when one component will not save', async () => {
    const tagger = new TestTagger([ROOT_ID, CHILD_ID]);
    tagger.Components.get(CHILD_ID.toLowerCase())!.SaveOk = false;
    const result = await tagger.tag(model(), TRUST, deps());
    expect(result.Tagged).toBe(true);
    expect(result.ComponentsUpdated).toBe(1);
    expect(result.Reasons.some((r) => r.includes('was not saved'))).toBe(true);
  });

  it('reports a model with no root component instead of silently skipping the model story', async () => {
    const noRoot = new FakeModel();
    noRoot.RootComponentID = null;
    const result = await new TestTagger([CHILD_ID]).tag(noRoot as unknown as MJMLModelEntity, TRUST, deps());
    expect(result.Reasons.some((r) => r.includes('no root component'))).toBe(true);
  });

  it('carries the context loader warnings through', async () => {
    const withWarning = context({ Warnings: ['The model reports no feature importance.'] });
    const result = await new TestTagger([ROOT_ID, CHILD_ID]).tag(model(), TRUST, deps({ contextLoader: new FakeContextLoader(withWarning) }));
    expect(result.Reasons).toContain('The model reports no feature importance.');
  });
});

describe('tagModelStoryBestEffort', () => {
  it('swallows a throw — a promotion that already succeeded must not be undone by a story', async () => {
    const exploding: IStoryContextLoader = {
      load: async () => {
        throw new Error('context store is down');
      },
    };
    const result = await tagModelStoryBestEffort(new TestTagger([ROOT_ID]), model(), TRUST, deps({ contextLoader: exploding }));
    expect(result.Tagged).toBe(false);
    expect(result.Reasons[0]).toContain('context store is down');
  });
});

describe('story context helpers', () => {
  it('prefers the LOCKED HOLDOUT metrics and says which it used', () => {
    const warnings: string[] = [];
    expect(readMetrics(model(), warnings)).toEqual({ metrics: { auc: 0.82 }, areHoldout: true });

    const noHoldout = new FakeModel();
    noHoldout.HoldoutMetrics = null;
    // Falling back is fine; silently calling validation metrics "honest" would not be.
    expect(readMetrics(noHoldout as unknown as MJMLModelEntity, warnings)).toEqual({ metrics: { auc: 0.8 }, areHoldout: false });
  });

  it('warns when a model has no usable metrics at all', () => {
    const warnings: string[] = [];
    const bare = new FakeModel();
    bare.HoldoutMetrics = null;
    bare.Metrics = null;
    readMetrics(bare as unknown as MJMLModelEntity, warnings);
    expect(warnings[0]).toContain('cannot describe how well it performs');
  });

  it('normalizes feature importance into shares, descending', () => {
    const importance = readImportance(model(), []);
    expect(importance.map((i) => i.Feature)).toEqual(['tenure', 'city']);
    expect(importance[0].Share).toBeCloseTo(0.7, 6);
    expect(importance.reduce((s, i) => s + i.Share, 0)).toBeCloseTo(1, 6);
  });

  it('warns rather than inventing importance when the model reports none', () => {
    const warnings: string[] = [];
    const bare = new FakeModel();
    bare.FeatureImportance = null;
    expect(readImportance(bare as unknown as MJMLModelEntity, warnings)).toEqual([]);
    expect(warnings[0]).toContain('cannot be attributed');
  });

  it('attributes importance over INPUT bindings only, summing several', () => {
    const shares = new Map([['tenure', 0.5], ['events', 0.2], ['score', 0.9]]);
    expect(attributeImportance([{ Role: 'Input', Name: 'tenure' }, { Role: 'Input', Name: 'events' }], shares)).toBeCloseTo(0.7, 6);
    // An Output binding named after a feature must not be counted as contributing to itself.
    expect(attributeImportance([{ Role: 'Output', Name: 'score' }], shares)).toBeUndefined();
  });

  it('returns undefined — not 0 — when nothing matched', () => {
    // "We could not attribute this" and "this contributes nothing" are different statements.
    expect(attributeImportance([{ Role: 'Input', Name: 'unknown' }], new Map([['tenure', 1]]))).toBeUndefined();
  });
});

describe('modelStoryText', () => {
  it('joins the four prose fields — the text the embedding is built from', () => {
    const text = modelStoryText(story());
    expect(text.split('\n\n')).toHaveLength(4);
    expect(text).toContain('Which members are likely to renew');
    expect(text).toContain('one in five of whom lapsed');
  });
});
