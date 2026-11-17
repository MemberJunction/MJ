import { describe, it, expect } from 'vitest';
import type { DecisionAnswer } from '@memberjunction/ai';
import {
  BuildFeedbackQuestions,
  BuildFeedbackState,
  CompareFeedbackClassification,
  ReadFeedbackClassification,
  SeverityForCategory,
} from '../services/FeedbackClassificationDecision.js';

function choice(value: string): DecisionAnswer {
  return { Kind: 'Choice', Value: value, Probabilities: { [value]: 1 }, Confidence: 1 };
}

describe('FeedbackClassificationDecision', () => {
  it('asks two Choices with the allowed values', () => {
    const q = BuildFeedbackQuestions();
    expect(Object.keys(q)).toEqual(['category', 'severity']);
    expect(q.category.Options.map((o) => o.Value).sort()).toEqual(['bug', 'feature', 'other', 'question']);
    expect(q.severity.Options.map((o) => o.Value)).toEqual(['critical', 'major', 'minor', 'trivial']);
    expect(q.category.Options.every((o) => o.Description.length > 0)).toBe(true);
  });

  it('states the feedback as title and description', () => {
    expect(BuildFeedbackState('Crash', 'It crashes')).toBe('Title: Crash\nDescription: It crashes');
  });

  describe('SeverityForCategory', () => {
    it('applies the fixed severities for non-bugs and keeps the decision for bugs', () => {
      expect(SeverityForCategory('question', 'critical')).toBe('trivial');
      expect(SeverityForCategory('feature', 'critical')).toBe('minor');
      expect(SeverityForCategory('other', 'trivial')).toBe('minor');
      expect(SeverityForCategory('bug', 'major')).toBe('major');
    });
  });

  describe('ReadFeedbackClassification', () => {
    it('reads both choices', () => {
      expect(ReadFeedbackClassification({ category: choice('bug'), severity: choice('critical') })).toEqual({
        Category: 'bug',
        Severity: 'critical',
      });
    });

    it('overrides a bug severity the rules fix for a question', () => {
      expect(ReadFeedbackClassification({ category: choice('Question'), severity: choice('major') })).toEqual({
        Category: 'question',
        Severity: 'trivial',
      });
    });

    it('is unsure when an answer is missing, not a Choice, or not allowed', () => {
      expect(ReadFeedbackClassification({ category: choice('bug') })).toBeNull();
      expect(ReadFeedbackClassification({ category: { Kind: 'Likelihood', Probability: 1 }, severity: choice('minor') })).toBeNull();
      expect(ReadFeedbackClassification({ category: choice('rant'), severity: choice('minor') })).toBeNull();
    });
  });

  describe('CompareFeedbackClassification', () => {
    const answers = { category: choice('bug'), severity: choice('minor') };

    it('agrees on the same category and severity', () => {
      const c = CompareFeedbackClassification(answers, { Category: 'Bug', Severity: 'minor' });
      expect(c.Agreed).toBe(true);
      expect(c.Summary).toBe('decision chose bug/minor, LLM chose bug/minor');
    });

    it('disagrees on a different severity', () => {
      expect(CompareFeedbackClassification(answers, { Category: 'bug', Severity: 'major' }).Agreed).toBe(false);
    });

    it('never agrees with a classifier that failed', () => {
      const c = CompareFeedbackClassification(answers, null);
      expect(c.Agreed).toBe(false);
      expect(c.Summary).toBe('decision chose bug/minor, LLM chose nothing');
    });
  });
});
