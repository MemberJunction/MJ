/**
 * Model-story view-models.
 *
 * `StoryContribution` is written by an LLM through a validated schema and read back here, so the
 * tests lean on what happens when the blob is wrong: an unrecognized role or reuse potential must be
 * DROPPED rather than displayed, because rendering an invented role beside measured evidence would
 * lend the invention the same authority.
 */

import { describe, it, expect } from 'vitest';
import {
  buildModelStoryVM,
  describeRole,
  parseContribution,
  type StoryComponentRow,
} from '../PredictiveStudio/model-story.view-models';

const contribution = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    Role: 'primary-driver',
    Weight: 0.42,
    Evidence: '0.42 of total importance',
    ReusePotential: 'high',
    ReuseWhen: 'Any model scoring member engagement.',
    ...over,
  });

const ROWS: StoryComponentRow[] = [
  { ID: 'root', Name: 'Renewal model root v5', ComponentType: 'XGBoost', ParentComponentID: null, Story: 'Scores members on renewal likelihood.' },
  { ID: 'c1', Name: 'Recent activity', ComponentType: 'Count', ParentComponentID: 'root', SlotName: 'inputs', Story: 'Engagement in the last 90 days.', StoryContribution: contribution() },
  { ID: 'c2', Name: 'Tenure', ComponentType: 'Column', ParentComponentID: 'root', SlotName: 'inputs', Story: 'How long they have been a member.', StoryContribution: contribution({ Role: 'supporting', Weight: 0.11, ReusePotential: 'medium' }) },
];

describe('buildModelStoryVM', () => {
  it('takes the model-level prose from the ROOT component', () => {
    const vm = buildModelStoryVM(ROWS, 'root');
    expect(vm.ModelStory).toBe('Scores members on renewal likelihood.');
    // The root is the model's own story, not one of its parts.
    expect(vm.Components.map((c) => c.ID)).toEqual(['c1', 'c2']);
  });

  it('falls back to the parentless row when no RootComponentID is known', () => {
    expect(buildModelStoryVM(ROWS, null).ModelStory).toBe('Scores members on renewal likelihood.');
  });

  it('orders components by measured share, most explanatory first', () => {
    expect(buildModelStoryVM(ROWS, 'root').Components.map((c) => c.Name)).toEqual(['Recent activity', 'Tenure']);
  });

  it('sorts a component with NO measured weight after every one that has it', () => {
    // A missing weight defaulting to zero would be fine; defaulting to the TOP would be a lie.
    const rows = [...ROWS, { ID: 'c3', Name: 'Unweighted', ParentComponentID: 'root', Story: 'x', StoryContribution: contribution({ Weight: undefined }) }];
    expect(buildModelStoryVM(rows, 'root').Components.map((c) => c.Name)).toEqual(['Recent activity', 'Tenure', 'Unweighted']);
  });

  it('counts the components worth reusing', () => {
    expect(buildModelStoryVM(ROWS, 'root').HighReuseCount).toBe(1);
  });

  it('reports empty when the tagger has not run, so the card can say so', () => {
    const untagged: StoryComponentRow[] = [
      { ID: 'root', Name: 'Root', ParentComponentID: null, Story: null },
      { ID: 'c1', Name: 'A', ParentComponentID: 'root', Story: null },
    ];
    expect(buildModelStoryVM(untagged, 'root').IsEmpty).toBe(true);
    expect(buildModelStoryVM(ROWS, 'root').IsEmpty).toBe(false);
  });

  it('names a component even when the row has none', () => {
    const rows: StoryComponentRow[] = [
      { ID: 'root', Name: 'Root', ParentComponentID: null, Story: 'x' },
      { ID: 'c1', Name: null, ComponentType: 'Standardize', ParentComponentID: 'root', Story: 'y' },
    ];
    expect(buildModelStoryVM(rows, 'root').Components[0].Name).toBe('Standardize');
  });
});

describe('parseContribution', () => {
  it('parses a well-formed contribution, converting the share to whole percent', () => {
    const c = parseContribution(contribution())!;
    expect(c.Role).toBe('primary-driver');
    expect(c.WeightPercent).toBe(42);
    expect(c.ReusePotential).toBe('high');
    expect(c.Evidence).toBe('0.42 of total importance');
  });

  it.each([[null], [undefined], [''], ['   '], ['not json'], ['[1,2]'], ['"a string"'], ['{}'], ['{"Role":"nonsense"}']])(
    'returns null for unusable input (%p)',
    (json) => {
      // Including the shapes that PARSE but say nothing: an array, an empty object, and one whose
      // only field fails validation. Each would otherwise render as an empty contribution block.
      expect(parseContribution(json as string | null)).toBeNull();
    },
  );

  it('drops an unrecognized role rather than displaying it', () => {
    // An invented role rendered beside real evidence would borrow its authority.
    expect(parseContribution(contribution({ Role: 'super-important' }))!.Role).toBeNull();
  });

  it('drops an unrecognized reuse potential', () => {
    expect(parseContribution(contribution({ ReusePotential: 'enormous' }))!.ReusePotential).toBeNull();
  });

  it('reports no share rather than zero when the weight is missing or unusable', () => {
    expect(parseContribution(contribution({ Weight: undefined }))!.WeightPercent).toBeNull();
    expect(parseContribution(contribution({ Weight: 'lots' }))!.WeightPercent).toBeNull();
    expect(parseContribution(contribution({ Weight: NaN }))!.WeightPercent).toBeNull();
  });

  it('clamps an out-of-range share into 0–100', () => {
    expect(parseContribution(contribution({ Weight: 1.8 }))!.WeightPercent).toBe(100);
    expect(parseContribution(contribution({ Weight: -0.5 }))!.WeightPercent).toBe(0);
  });

  it('keeps the parts it can vouch for when others are missing', () => {
    const c = parseContribution(JSON.stringify({ Evidence: 'measured' }))!;
    expect(c.Evidence).toBe('measured');
    expect(c.Role).toBeNull();
    expect(c.ReuseWhen).toBeNull();
  });
});

describe('describeRole', () => {
  it.each([
    ['primary-driver', 'Primary driver'],
    ['supporting', 'Supporting'],
    ['marginal', 'Marginal'],
  ])('phrases %s as "%s"', (role, expected) => {
    expect(describeRole(role as never)).toBe(expected);
  });

  it('says nothing for an absent role', () => {
    expect(describeRole(null)).toBe('');
  });
});
