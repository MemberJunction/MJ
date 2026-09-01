import { describe, it, expect } from 'vitest';
import { validateModelStory } from '../story-schema';
import type { ModelStory } from '../story-spec';

/**
 * A story is prose, so almost nothing in it can be verified. Two things can, and this is where they
 * are enforced: that every contribution is attributed to a component the model ACTUALLY has, and
 * that the caveats are not empty. The first keeps a later reuse-by-meaning search honest; the second
 * keeps the publish moment honest.
 */

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const GHOST = '99999999-9999-4999-8999-999999999999';

function story(over: Partial<ModelStory> = {}): ModelStory {
  return {
    Headline: 'Which members are likely to renew',
    Story: 'Scores each member on renewal likelihood.',
    DataStory: '1,840 members, one in five lapsed.',
    BusinessConnection: 'Focuses outreach on members at risk.',
    Components: [
      {
        InstanceID: A,
        Headline: 'Membership tenure',
        Story: 'How long this person has been a member.',
        Contribution: { Role: 'primary-driver', Weight: 0.62, Evidence: '0.62 of total importance', ReusePotential: 'high', ReuseWhen: 'Any model about member loyalty.' },
      },
    ],
    Caveats: ['Predicts likelihood, not certainty.'],
    TrustGrade: 'Good',
    ...over,
  };
}

describe('validateModelStory — attribution', () => {
  it('accepts a story whose components all exist', () => {
    const result = validateModelStory(story(), [A, B]);
    expect(result.ok).toBe(true);
  });

  it('REJECTS a story attributing a contribution to a component the model does not have', () => {
    const bad = story({ Components: [{ ...story().Components[0], InstanceID: GHOST }] });
    const result = validateModelStory(bad, [A, B]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain(GHOST);
      expect(result.error).toContain('does not have');
    }
  });

  it('matches instance ids case-insensitively', () => {
    const upper = story({ Components: [{ ...story().Components[0], InstanceID: A.toUpperCase() }] });
    expect(validateModelStory(upper, [A.toLowerCase(), B]).ok).toBe(true);
  });

  it('skips the cross-check when no known ids are supplied', () => {
    // A model trained before materialization existed has no component rows to check against; the
    // story is then shape-validated only, rather than rejected for a check that cannot apply.
    expect(validateModelStory(story(), []).ok).toBe(true);
  });

  it('rejects a non-uuid instance id', () => {
    const bad = story({ Components: [{ ...story().Components[0], InstanceID: 'the-tenure-one' }] });
    expect(validateModelStory(bad, [A]).ok).toBe(false);
  });
});

describe('validateModelStory — honesty', () => {
  it('rejects a story with no caveats', () => {
    const result = validateModelStory(story({ Caveats: [] }), [A]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('marketing');
  });

  it('requires every prose field', () => {
    for (const field of ['Headline', 'Story', 'DataStory', 'BusinessConnection'] as const) {
      const bad = { ...story(), [field]: '' };
      const result = validateModelStory(bad, [A]);
      expect(result.ok, field).toBe(false);
      if (!result.ok) expect(result.error).toContain(field);
    }
  });

  it('requires evidence and a reuse situation on every contribution', () => {
    const noEvidence = story({ Components: [{ ...story().Components[0], Contribution: { ...story().Components[0].Contribution, Evidence: '' } }] });
    expect(validateModelStory(noEvidence, [A]).ok).toBe(false);

    const noReuseWhen = story({ Components: [{ ...story().Components[0], Contribution: { ...story().Components[0].Contribution, ReuseWhen: '' } }] });
    expect(validateModelStory(noReuseWhen, [A]).ok).toBe(false);
  });

  it('rejects an unknown role or reuse potential rather than coercing it', () => {
    const badRole = story({ Components: [{ ...story().Components[0], Contribution: { ...story().Components[0].Contribution, Role: 'the-main-one' as never } }] });
    expect(validateModelStory(badRole, [A]).ok).toBe(false);

    const badReuse = story({ Components: [{ ...story().Components[0], Contribution: { ...story().Components[0].Contribution, ReusePotential: 'enormous' as never } }] });
    expect(validateModelStory(badReuse, [A]).ok).toBe(false);
  });

  it('keeps Weight optional but bounded — an unattributed component omits it rather than guessing', () => {
    const noWeight = story({ Components: [{ ...story().Components[0], Contribution: { Role: 'marginal', Evidence: 'not attributable', ReusePotential: 'low', ReuseWhen: 'rarely' } }] });
    expect(validateModelStory(noWeight, [A]).ok).toBe(true);

    const overOne = story({ Components: [{ ...story().Components[0], Contribution: { ...story().Components[0].Contribution, Weight: 1.4 } }] });
    expect(validateModelStory(overOne, [A]).ok).toBe(false);
  });

  it('allows a story with no component entries at all', () => {
    expect(validateModelStory(story({ Components: [] }), [A]).ok).toBe(true);
  });

  it('rejects a payload that is not an object', () => {
    for (const bad of [null, 'a story', 42, []]) {
      expect(validateModelStory(bad, [A]).ok, JSON.stringify(bad)).toBe(false);
    }
  });
});
