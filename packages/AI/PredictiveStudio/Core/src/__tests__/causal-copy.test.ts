import { describe, it, expect } from 'vitest';
import { CausalCopy } from '../causal-copy';

describe('CausalCopy.FindPhrases', () => {
  it('finds the phrases the assessment flagged', () => {
    expect(CausalCopy.FindPhrases('Explains about 31% of what drives the outcome.')).toEqual(['what drives', 'drives the outcome', 'explains about']);
    expect(CausalCopy.FindPhrases('Pull these levers to reduce churn')).toEqual(['lever']);
    expect(CausalCopy.FindPhrases("What's driving this: Tenure")).toEqual(["what's driving"]);
    expect(CausalCopy.FindPhrases('Key Decision Drivers (Explainability)')).toEqual(['decision drivers']);
    expect(CausalCopy.FindPhrases('## Top Influential Features')).toEqual(['influential']);
    expect(CausalCopy.FindPhrases('Trained with honest holdout evaluation to safeguard')).toEqual(['honest holdout evaluation']);
  });
  it('accepts associative wording and unrelated words', () => {
    expect(CausalCopy.FindPhrases('Accounts for about 31% of the variation in the outcome — an association, not a cause.')).toEqual([]);
    expect(CausalCopy.FindPhrases('Drivers: features associated with a lower renewal score. Leverage approved queries.')).toEqual([]);
  });
});
