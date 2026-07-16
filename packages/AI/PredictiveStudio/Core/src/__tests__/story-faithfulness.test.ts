import { describe, it, expect } from 'vitest';
import { checkStoryFaithfulness, type FeatureSynonyms } from '../story-faithfulness';

const IMPORTANCES = {
  tenure_days: 0.42,
  event_recency_days: 0.31,
  prior_periods: 0.18,
  dues_amount: 0.05,
  auto_renew: 0.02,
};

const SYNONYMS: FeatureSynonyms = {
  tenure_days: ['tenure', 'membership length'],
  event_recency_days: ['recency', 'last event', 'recently'],
  prior_periods: ['renewal history', 'past periods'],
};

describe('checkStoryFaithfulness', () => {
  it('selects the top-K features by absolute importance', () => {
    const r = checkStoryFaithfulness('', IMPORTANCES, { topK: 3 });
    expect(r.topFeatures).toEqual(['tenure_days', 'event_recency_days', 'prior_periods']);
  });

  it('is faithful when the narrative names ≥2 top drivers (via synonyms)', () => {
    const r = checkStoryFaithfulness(
      'Members with longer tenure who attended an event recently are far likelier to renew.',
      IMPORTANCES,
      { synonyms: SYNONYMS },
    );
    expect(r.faithful).toBe(true);
    expect(r.namedFeatures).toContain('tenure_days');
    expect(r.namedFeatures).toContain('event_recency_days');
  });

  it('matches a raw feature name with underscores → spaces', () => {
    const r = checkStoryFaithfulness('driven by prior periods and tenure days', IMPORTANCES);
    expect(r.namedFeatures).toContain('prior_periods');
    expect(r.namedFeatures).toContain('tenure_days');
    expect(r.faithful).toBe(true);
  });

  it('flags a post-hoc narrative that names features the model does NOT use', () => {
    const r = checkStoryFaithfulness(
      'This model keys on the member’s zodiac sign and favorite color.',
      IMPORTANCES,
      { synonyms: SYNONYMS },
    );
    expect(r.faithful).toBe(false);
    expect(r.namedFeatures).toHaveLength(0);
    expect(r.missedFeatures).toEqual(['tenure_days', 'event_recency_days', 'prior_periods']);
  });

  it('names only ONE top driver → not faithful at the default threshold of 2', () => {
    const r = checkStoryFaithfulness('It mostly looks at tenure.', IMPORTANCES, { synonyms: SYNONYMS });
    expect(r.namedFeatures).toEqual(['tenure_days']);
    expect(r.faithful).toBe(false);
  });

  it('honors a custom minNamed threshold', () => {
    const r = checkStoryFaithfulness('It mostly looks at tenure.', IMPORTANCES, {
      synonyms: SYNONYMS,
      minNamed: 1,
    });
    expect(r.faithful).toBe(true);
  });
});
