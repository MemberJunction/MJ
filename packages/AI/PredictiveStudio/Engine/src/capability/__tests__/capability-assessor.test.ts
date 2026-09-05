import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MJMLComponentTypeEntity } from '@memberjunction/core-entities';

import {
  CapabilityAssessor,
  type ICapabilityJudge,
  type IObjectiveEmbedder,
  type JudgeCandidateSet,
  type JudgedObjective,
} from '../capability-assessor';
import type { MLComponentEngine } from '../../components/ml-component-engine';

/**
 * The diagnosis is what a client sees first, so the tests are about not misleading them:
 *
 *  - the two axes must stay separate, because "we can measure it but have learned nothing" and
 *    "we know something but cannot recompute it" imply different work;
 *  - a gap must be reported with the size of the corpus behind it, since early on a gap usually
 *    means nobody wrote the description rather than that the capability is missing;
 *  - nothing may be inferred when the corpus is empty.
 *
 * Vectors here are unit basis vectors, so similarity is exactly controllable. Note the scale:
 * `SimpleVectorService` maps cosine [-1,1] onto [0,1], so orthogonal (unrelated) scores **0.5**,
 * not 0 — which is precisely the trap the default thresholds are calibrated against.
 */

const mockRunView = vi.fn();
vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();
  return {
    ...actual,
    RunView: Object.assign(
      class {
        RunView = (...args: unknown[]) => mockRunView(...args);
      },
      { FromMetadataProvider: () => ({ RunView: (...args: unknown[]) => mockRunView(...args) }) },
    ),
  };
});

const INPUT_TYPE = { ID: 't-recency', Name: 'As-Of Recency', Kind: 'Input', DriverClass: 'asof_recency' };

function engine(types = [INPUT_TYPE]): MLComponentEngine {
  return { TypesByKind: (kind: string) => types.filter((t) => t.Kind === kind) as unknown as MJMLComponentTypeEntity[] } as unknown as MLComponentEngine;
}

/** Embeds by keyword, so "engagement" and "lapse" land on different axes. */
const embedder: IObjectiveEmbedder = {
  embed: async (text: string) => {
    if (/engagement/i.test(text)) return [1, 0, 0];
    if (/lapse/i.test(text)) return [0, 1, 0];
    return [0, 0, 1];
  },
};

/** A judge that returns a fixed verdict for every objective it is shown. */
function judgeSaying(verdict: JudgedObjective['Verdict']): ICapabilityJudge & { Seen: JudgeCandidateSet[] } {
  const seen: JudgeCandidateSet[] = [];
  return {
    Seen: seen,
    judge: async (candidates) => {
      seen.push(...candidates);
      return candidates.map((c) => ({ Index: c.Objective.Index, Verdict: verdict, Rationale: 'because the test says so' }));
    },
  };
}

/** Answer the signal read first, the finding read second — the assessor loads both in parallel. */
function corpus(signals: unknown[], findings: unknown[]): void {
  mockRunView.mockImplementation((params: { EntityName: string }) =>
    Promise.resolve({
      Success: true,
      Results: params.EntityName === 'MJ: ML Components' ? signals : findings,
    }),
  );
}

const ENGAGEMENT_SIGNAL = {
  ID: 's-1', Name: 'Model v1 › days_since_last_act', ComponentType: 'As-Of Recency',
  Story: 'How long ago someone last engaged.', StoryVector: '[1,0,0]',
};
const LAPSE_FINDING = {
  ID: 'f-1', Name: 'Committee membership and Renewed', EvidenceType: 'Predictive Contribution',
  Statement: 'Committee membership is associated with lower lapse.', StoryVector: '[0,1,0]',
};

describe('CapabilityAssessor', () => {
  // Braces matter: a concise arrow would RETURN the mock, and vitest calls a beforeEach's
  // return value as a teardown hook — invoking the mock with no arguments.
  beforeEach(() => {
    mockRunView.mockReset();
  });

  const assess = (text: string, judge?: ICapabilityJudge, types = [INPUT_TYPE]) =>
    new CapabilityAssessor().assess({ Text: text }, embedder, undefined, undefined, engine(types), judge);

  it('shortlists by similarity but does not decide from it', async () => {
    corpus([ENGAGEMENT_SIGNAL], [LAPSE_FINDING]);

    const result = await assess('- Improve member engagement across chapters');

    // A candidate was retrieved...
    expect(result.Objectives[0].Signals).toHaveLength(1);
    // ...but with no judge, no verdict is claimed from the number.
    expect(result.Objectives[0].Verdict).toBe('Undetermined');
    expect(result.Objectives[0].NextStep).toContain('not a verdict');
    expect(result.Warnings.join(' ')).toContain('cannot tell coverage from coincidence');
  });

  it('shows the judge only the candidates retrieval found, so it cannot invent a signal', async () => {
    corpus([ENGAGEMENT_SIGNAL], [LAPSE_FINDING]);
    const judge = judgeSaying('Covered');

    await assess('- Improve member engagement across chapters', judge);

    expect(judge.Seen).toHaveLength(1);
    expect(judge.Seen[0].Signals.map((s) => s.ID)).toEqual(['s-1']);
  });

  it('keeps the two axes separate, because each implies different work', async () => {
    corpus([ENGAGEMENT_SIGNAL], [LAPSE_FINDING]);

    const measurable = await assess('- Improve member engagement across chapters', judgeSaying('Measurable'));
    expect(measurable.Objectives[0].NextStep).toContain('study, not instrumentation');

    const evidenced = await assess('- Improve member engagement across chapters', judgeSaying('Evidenced'));
    expect(evidenced.Objectives[0].NextStep).toContain('instrumentation');
  });

  it("refuses 'Covered' when no finding was in front of the judge", async () => {
    // Signals only — 'Covered' is structurally impossible however persuasive the judge is.
    corpus([ENGAGEMENT_SIGNAL], []);

    const result = await assess('- Improve member engagement across chapters', judgeSaying('Covered'));

    expect(result.Objectives[0].Verdict).toBe('Measurable');
  });

  it("refuses 'Evidenced' when no finding was in front of the judge", async () => {
    corpus([ENGAGEMENT_SIGNAL], []);

    const result = await assess('- Improve member engagement across chapters', judgeSaying('Evidenced'));

    expect(result.Objectives[0].Verdict).toBe('Gap');
  });

  it('carries the judge\'s rationale, which is what the reader actually reads', async () => {
    corpus([ENGAGEMENT_SIGNAL], [LAPSE_FINDING]);

    const result = await assess('- Improve member engagement across chapters', judgeSaying('Covered'));

    expect(result.Objectives[0].Verdict).toBe('Covered');
    expect(result.Objectives[0].Rationale).toBe('because the test says so');
  });

  it('never asks the judge about an objective with no candidates at all', async () => {
    corpus([], []);
    const judge = judgeSaying('Covered');

    const result = await assess('- Improve member engagement across chapters', judge);

    // An empty corpus is a gap by construction; asking would only invite one to be invented.
    expect(judge.Seen).toHaveLength(0);
    expect(result.Objectives[0].Verdict).toBe('Gap');
    expect(result.Objectives[0].Rationale).toContain('close enough to shortlist');
  });

  it('reports a failed judge rather than falling back to a guess', async () => {
    corpus([ENGAGEMENT_SIGNAL], [LAPSE_FINDING]);
    const broken: ICapabilityJudge = { judge: async () => { throw new Error('model unavailable'); } };

    const result = await assess('- Improve member engagement across chapters', broken);

    expect(result.Objectives[0].Verdict).toBe('Undetermined');
    expect(result.Warnings.join(' ')).toContain('model unavailable');
  });

  it('carries the corpus sizes, so a gap can be read as "not catalogued"', async () => {
    corpus([ENGAGEMENT_SIGNAL], [LAPSE_FINDING]);

    const result = await assess('- Improve member engagement across chapters', judgeSaying('Gap'));

    expect(result.SignalsConsidered).toBe(1);
    expect(result.FindingsConsidered).toBe(1);
    expect(result.Objectives[0].NextStep).toContain('or only that nobody has described it yet');
  });

  it('strips the owning model from a matched signal name', async () => {
    corpus([ENGAGEMENT_SIGNAL], []);

    const result = await assess('- Improve member engagement across chapters');

    expect(result.Objectives[0].Signals[0].Name).toBe('days_since_last_act');
  });

  it('says plainly when there are no Input types at all', async () => {
    corpus([], []);

    const result = await assess('- Improve member engagement across chapters', undefined, []);

    expect(result.Warnings.join(' ')).toContain('no Input types');
  });

  it('skips an objective it cannot embed, and says which', async () => {
    corpus([ENGAGEMENT_SIGNAL], []);
    const failing: IObjectiveEmbedder = { embed: async () => null };

    const result = await new CapabilityAssessor().assess(
      { Text: '- Improve member engagement across chapters' },
      failing, undefined, undefined, engine(),
    );

    expect(result.Objectives).toHaveLength(0);
    expect(result.Warnings.join(' ')).toContain('could not be embedded');
  });

  it('returns a stable summary with every verdict key present', async () => {
    corpus([ENGAGEMENT_SIGNAL], [LAPSE_FINDING]);

    const result = await assess(
      '- Improve member engagement across chapters\n- Reduce first-year lapse among members',
      judgeSaying('Measurable'),
    );

    expect(Object.keys(result.Summary).sort()).toEqual(['Covered', 'Evidenced', 'Gap', 'Measurable', 'Partial', 'Undetermined']);
    expect(result.Summary.Measurable).toBe(2);
  });

  it('reads nothing from a document with no objectives', async () => {
    const result = await assess('Overview\nGoals');

    expect(mockRunView).not.toHaveBeenCalled();
    expect(result.Warnings[0]).toContain('No objectives could be read');
  });
});
