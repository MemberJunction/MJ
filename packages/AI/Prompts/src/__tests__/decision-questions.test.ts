import { describe, it, expect } from 'vitest';
import type { DecisionQuestion } from '@memberjunction/ai';
import { ParseDecisionQuestions } from '../decision/decision-questions';

// ParseDecisionQuestions is the one validator behind both the `Run Decision` action and the
// `RunDecision` GraphQL mutation, so its messages are what both callers report.

const QUESTIONS: Record<string, DecisionQuestion> = {
  refund: { Kind: 'Likelihood', Instructions: 'Should this customer get a refund?' },
  route: {
    Kind: 'Choice',
    Instructions: 'Which department should handle this?',
    Options: [
      { Value: 'billing', Description: 'Billing issues' },
      { Value: 'technical', Description: 'Technical support' },
    ],
  },
  urgency: { Kind: 'Score', Instructions: 'Rate the urgency of this ticket', Levels: ['Low', 'Medium', 'High'] },
};

/** The message of an invalid input, failing the test if the input was accepted. */
function messageFor(raw: unknown): string {
  const result = ParseDecisionQuestions(raw);
  if (result.Valid) {
    throw new Error('expected the questions to be rejected');
  }
  return result.Message;
}

describe('ParseDecisionQuestions', () => {
  it('accepts a question map of every kind, as an object or as its JSON', () => {
    const fromObject = ParseDecisionQuestions(QUESTIONS);
    const fromJSON = ParseDecisionQuestions(JSON.stringify(QUESTIONS));

    expect(fromObject).toEqual({ Valid: true, Questions: QUESTIONS });
    expect(fromJSON).toEqual({ Valid: true, Questions: QUESTIONS });
  });

  it('drops members a question kind does not define', () => {
    const result = ParseDecisionQuestions({
      refund: { Kind: 'Likelihood', Instructions: 'Refund?', Options: [{ Value: 'x', Description: 'y' }], Extra: true },
    });

    expect(result).toEqual({ Valid: true, Questions: { refund: { Kind: 'Likelihood', Instructions: 'Refund?' } } });
  });

  it('rejects a missing, empty, unparseable or non-object input', () => {
    expect(messageFor(undefined)).toBe('Questions parameter is required');
    expect(messageFor('   ')).toBe('Questions string cannot be empty');
    expect(messageFor('{ refund: ')).toMatch(/^Questions JSON parsing failed: /);
    expect(messageFor('[]')).toBe('Questions must be an object');
    expect(messageFor({})).toBe('Questions object must have at least one question');
  });

  it('rejects a question that is not an object, or has an unknown kind or no instructions', () => {
    expect(messageFor({ refund: 'yes?' })).toBe("Question 'refund' must be an object");
    expect(messageFor({ refund: { Kind: 'YesNo', Instructions: 'Refund?' } }))
      .toBe("Question 'refund' must have a known Kind ('Likelihood', 'Choice', or 'Score')");
    expect(messageFor({ refund: { Kind: 'Likelihood', Instructions: '  ' } }))
      .toBe("Question 'refund' must have string Instructions");
  });

  it('rejects a Choice without an Options array, or with a malformed option', () => {
    expect(messageFor({ route: { Kind: 'Choice', Instructions: 'Which?' } }))
      .toBe("Question 'route' of Kind 'Choice' must have an Options array");
    expect(messageFor({ route: { Kind: 'Choice', Instructions: 'Which?', Options: [{ Value: 'billing' }] } }))
      .toBe("Question 'route' Options must contain objects with string Value and Description");
  });

  it('rejects a Score without a Levels array of strings', () => {
    expect(messageFor({ urgency: { Kind: 'Score', Instructions: 'How urgent?' } }))
      .toBe("Question 'urgency' of Kind 'Score' must have a Levels array");
    expect(messageFor({ urgency: { Kind: 'Score', Instructions: 'How urgent?', Levels: ['Low', 2] } }))
      .toBe("Question 'urgency' Levels must be an array of strings");
  });
});
