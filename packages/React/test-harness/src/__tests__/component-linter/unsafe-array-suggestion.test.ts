/**
 * The unsafe-array-operations suggestion must make every bracket access optional, not only
 * the first: `data[0][1]` becomes `data?.[0]?.[1]`.
 */
import { describe, it, expect } from 'vitest';
import { ComponentLinter } from '@memberjunction/react-linter';

async function suggestionFor(expression: string): Promise<string | undefined> {
  const code = `function Grid({ data }) {\n  return <div>{${expression}}</div>;\n}`;
  const result = await ComponentLinter.lintComponent(code, 'Grid', undefined, true);
  return result.violations.find(v => v.rule === 'unsafe-array-operations' && v.message.includes('optional chaining'))?.message;
}

describe('unsafe-array-operations suggestion', () => {
  it('makes every bracket access optional', async () => {
    const message = await suggestionFor('data[0][1]');
    expect(message).toBeDefined();
    expect(message).toContain('data?.[0]?.[1]');
  });

  it('leaves an access that is already optional alone', async () => {
    const message = await suggestionFor('data[0]?.[1]');
    if (message) expect(message).not.toContain('??.[');
  });
});
