import { describe, it, expect } from 'vitest';
import type { MJMLModelEntity, MJMLFindingEntity } from '@memberjunction/core-entities';
import type { TrustVerdict } from '@memberjunction/predictive-studio-core';

import { FindingWriter, findingContentHash, type FindingWriterDeps } from '../finding-writer';
import type { IStoryContextLoader, ModelStoryContext } from '../story-context-loader';

/**
 * Findings exist to be CITED — by agents, in board papers, by the next person asking the same
 * question. That makes over-claiming the failure mode that matters, and these tests are mostly
 * about the guards against it:
 *
 *  - a direction is only claimed when the numbers can support one (tree importances are unsigned,
 *    so "Increases" would be fabricated on every tree model ever promoted);
 *  - "out-of-sample" is only claimed when the metrics came from the locked holdout;
 *  - an input measured and found not to matter is RECORDED rather than dropped, because the
 *    alternative is the next person re-testing it;
 *  - nothing is written for a component the model never attributed explanation to.
 *
 * Everything here is deterministic: no LLM is involved in any number a finding carries.
 */

const TRUST: TrustVerdict = { grade: 'B', reasons: [], holdoutGap: 0.04 } as unknown as TrustVerdict;

function model(): MJMLModelEntity {
  return { ID: 'model-1', Pipeline: 'Renewal Risk', Version: 3, TargetVariable: 'Renewed' } as MJMLModelEntity;
}

function context(overrides: Partial<ModelStoryContext> = {}): ModelStoryContext {
  return {
    ModelID: 'model-1',
    ModelName: 'Renewal Risk v3',
    TargetEntityName: 'Members',
    TargetVariable: 'Renewed',
    ProblemType: 'classification',
    Trust: TRUST,
    Metrics: { auc: 0.741, accuracy: 0.69 },
    MetricsAreHoldout: true,
    FeatureImportance: [
      { Feature: 'acts_90d', Share: 0.42 },
      { Feature: 'tenure_years', Share: 0.005 },
    ],
    TrainingRowCount: 2180,
    Components: [
      {
        InstanceID: 'c-acts',
        Name: 'acts_90d',
        ComponentTypeName: 'As-Of Count',
        TypeStory: null,
        Bindings: [{ Role: 'Input', Name: 'acts_90d', Entity: 'Activities', EntityField: 'ID', Meaning: null }],
        ImportanceShare: 0.42,
      },
      {
        InstanceID: 'c-tenure',
        Name: 'tenure_years',
        ComponentTypeName: 'Column',
        TypeStory: null,
        Bindings: [],
        ImportanceShare: 0.005,
      },
      {
        // Never attributed anything — a structural part, not a measured claim.
        InstanceID: 'c-scaler',
        Name: 'Standardize',
        ComponentTypeName: 'Standardize',
        TypeStory: null,
        Bindings: [],
      },
    ],
    Warnings: [],
    ...overrides,
  };
}

/** Captures every finding instead of touching a database. */
class TestableWriter extends FindingWriter {
  public Saved: Array<Record<string, unknown>> = [];
  public SupersededIds: string[] = [];
  public PriorActive: string[] = [];

  protected override async supersedePrior(contentHash: string): Promise<number> {
    const matching = this.PriorActive.filter((h) => h === contentHash);
    this.SupersededIds.push(...matching);
    return matching.length;
  }

  protected override async newFinding(): Promise<MJMLFindingEntity> {
    const record: Record<string, unknown> = {};
    const captured = this.Saved;
    return new Proxy(
      {
        NewRecord: () => true,
        Save: async () => {
          captured.push({ ...record });
          return true;
        },
        Load: async () => true,
        LatestResult: null,
      },
      {
        get: (target, prop) => (prop in target ? (target as Record<string | symbol, unknown>)[prop] : record[String(prop)]),
        set: (_t, prop, value) => {
          record[String(prop)] = value;
          return true;
        },
      },
    ) as unknown as MJMLFindingEntity;
  }
}

function deps(ctx: ModelStoryContext, extra: Partial<FindingWriterDeps> = {}): FindingWriterDeps {
  const loader: IStoryContextLoader = { load: async () => ctx };
  return { contextLoader: loader, provider: {} as FindingWriterDeps['provider'], now: () => new Date('2026-09-03T00:00:00Z'), ...extra };
}

describe('FindingWriter', () => {
  it('writes one finding per measured component and skips components nothing was attributed to', async () => {
    const writer = new TestableWriter();
    const result = await writer.write(model(), TRUST, deps(context()));

    expect(result.Written).toBe(2);
    // The scaler is real and necessary, but no claim was ever measured about it.
    expect(writer.Saved.map((f) => f['ComponentID'])).toEqual(['c-acts', 'c-tenure']);
  });

  it('refuses to claim a direction from unsigned importances', async () => {
    const writer = new TestableWriter();
    await writer.write(model(), TRUST, deps(context()));

    const acts = writer.Saved[0];
    // 0.42 is a magnitude, not a coefficient — "Increases" here would be invented.
    expect(acts['Direction']).toBe('Unknown');
    expect(String(acts['Statement'])).toContain('not which way it pushes');
  });

  it('reads a direction when the importance map proves it is signed', async () => {
    const signed = context({
      FeatureImportance: [
        { Feature: 'acts_90d', Share: 0.42 },
        { Feature: 'tenure_years', Share: -0.31 },
      ],
      Components: [
        { InstanceID: 'c-acts', Name: 'acts_90d', ComponentTypeName: 'Column', TypeStory: null, Bindings: [], ImportanceShare: 0.42 },
        { InstanceID: 'c-tenure', Name: 'tenure_years', ComponentTypeName: 'Column', TypeStory: null, Bindings: [], ImportanceShare: -0.31 },
      ],
    });
    const writer = new TestableWriter();
    await writer.write(model(), TRUST, deps(signed));

    expect(writer.Saved[0]['Direction']).toBe('Increases');
    expect(writer.Saved[1]['Direction']).toBe('Decreases');
    // Magnitude is always the size of the effect; the sign lives in Direction.
    expect(writer.Saved[1]['Magnitude']).toBeCloseTo(0.31);
  });

  it('records an input that was measured and found not to matter', async () => {
    const writer = new TestableWriter();
    await writer.write(model(), TRUST, deps(context()));

    const tenure = writer.Saved[1];
    expect(tenure['Direction']).toBe('None');
    // The value of a negative result is that nobody re-tests it.
    expect(String(tenure['Statement'])).toContain('does not need testing again');
  });

  it('only claims a predictive contribution when the metrics are out-of-sample', async () => {
    const holdout = new TestableWriter();
    await holdout.write(model(), TRUST, deps(context()));
    expect(holdout.Saved[0]['EvidenceType']).toBe('Predictive Contribution');
    expect(holdout.Saved[0]['HoldoutMetric']).toBe('auc');
    expect(String(holdout.Saved[0]['Statement'])).toContain('never seen');

    const validationOnly = new TestableWriter();
    await validationOnly.write(model(), TRUST, deps(context({ MetricsAreHoldout: false })));
    expect(validationOnly.Saved[0]['EvidenceType']).toBe('Observed Association');
    expect(validationOnly.Saved[0]['HoldoutMetric']).toBeNull();
    expect(String(validationOnly.Saved[0]['Statement'])).toContain('not yet confirmed out of sample');
  });

  it('grades confidence down on a thin population even with a holdout', async () => {
    const writer = new TestableWriter();
    await writer.write(model(), TRUST, deps(context({ TrainingRowCount: 120 })));

    expect(writer.Saved[0]['Confidence']).toBe('Low');
    expect(writer.Saved[0]['PopulationSize']).toBe(120);
  });

  it('grades a substantial, holdout-backed contribution as high confidence', async () => {
    const writer = new TestableWriter();
    await writer.write(model(), TRUST, deps(context()));

    expect(writer.Saved[0]['Confidence']).toBe('High');
    expect(writer.Saved[1]['Confidence']).toBe('Moderate');
  });

  it('supersedes the prior measurement of the same relationship', async () => {
    const writer = new TestableWriter();
    const hash = findingContentHash('c-acts', 'Renewed', 'Predictive Contribution');
    writer.PriorActive = [hash];

    const result = await writer.write(model(), TRUST, deps(context()));

    expect(result.Superseded).toBe(1);
    // The identity is the CLAIM, not the measurement — so a retrain chains rather than duplicates.
    expect(writer.Saved[0]['ContentHash']).toBe(hash);
  });

  it('writes findings with no story at all — nothing here needs an LLM', async () => {
    const writer = new TestableWriter();
    const result = await writer.write(model(), TRUST, deps(context(), { story: null }));

    expect(result.Written).toBe(2);
    expect(writer.Saved[0]['Magnitude']).toBeCloseTo(0.42);
    // The prose degrades to plain fact, naming where the measure comes from.
    expect(String(writer.Saved[0]['Story'])).toContain('Activities.ID');
  });

  it('uses the story prose when one was written, but takes no number from it', async () => {
    const writer = new TestableWriter();
    await writer.write(
      model(),
      TRUST,
      deps(context(), {
        story: {
          Headline: 'Renewal risk',
          Story: '',
          DataStory: '',
          BusinessConnection: '',
          Caveats: [],
          TrustGrade: 'B',
          Components: [
            {
              InstanceID: 'c-acts',
              Headline: 'Recent activity count',
              Story: 'How often a member showed up lately.',
              Contribution: { Role: 'primary-driver', Weight: 0.99, Evidence: 'invented', ReusePotential: 'high', ReuseWhen: 'any engagement model' },
            },
          ],
        } as never,
      }),
    );

    expect(String(writer.Saved[0]['Story'])).toContain('Recent activity count');
    expect(String(writer.Saved[0]['Story'])).toContain('any engagement model');
    // The story claimed a weight of 0.99; the finding keeps the MEASURED 0.42.
    expect(writer.Saved[0]['Magnitude']).toBeCloseTo(0.42);
  });

  it('says plainly when nothing was measured, rather than writing empty findings', async () => {
    const writer = new TestableWriter();
    const result = await writer.write(
      model(),
      TRUST,
      deps(context({ Components: [{ InstanceID: 'c-x', Name: 'x', ComponentTypeName: 'Standardize', TypeStory: null, Bindings: [] }] })),
    );

    expect(result.Written).toBe(0);
    expect(result.Reasons[0]).toContain('nothing measured to record');
  });
});
