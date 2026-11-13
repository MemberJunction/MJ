/**
 * The utilities-api-validation rule lists the API surface a component may call on `utilities`.
 * `utilities.ai.Decide` (typed decisions) is part of it; an unknown `ai` method is not.
 */
import { describe, it, expect } from 'vitest';
import { parse } from '@babel/parser';
import { UtilitiesApiValidationRule } from '../runtime-rules/utilities-api-validation';

function lint(code: string) {
  const ast = parse(code, { sourceType: 'module', plugins: ['jsx'] });
  return new UtilitiesApiValidationRule().Test(ast);
}

describe('utilities-api-validation: utilities.ai', () => {
  it('accepts utilities.ai.Decide', () => {
    const violations = lint(`
      async function triage(utilities, ticket) {
        if (utilities.ai?.Decide) {
          return await utilities.ai.Decide({
            State: ticket.Body,
            Questions: { urgent: { Kind: 'Likelihood', Instructions: 'Is this urgent?' } }
          });
        }
      }`);

    expect(violations).toEqual([]);
  });

  it('still accepts ExecutePrompt and EmbedText', () => {
    const violations = lint(`
      async function run(utilities) {
        await utilities.ai.ExecutePrompt({ systemPrompt: 'Summarize' });
        await utilities.ai.EmbedText({ textToEmbed: 'a', modelSize: 'small' });
      }`);

    expect(violations).toEqual([]);
  });

  it('flags a method utilities.ai does not have', () => {
    const violations = lint(`
      async function run(utilities) {
        await utilities.ai.Classify({ text: 'x' });
      }`);

    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].rule).toBe('utilities-api-validation');
  });
});
