/**
 * Array methods that other types also have
 *
 * The type rules report an array method called on a value known not to be an array. Some
 * of those methods exist on other types with the same meaning — `Map#forEach`, `Set#forEach`,
 * `String#slice` — and calling them there is correct.
 */
import { describe, it, expect } from 'vitest';
import { ComponentLinter } from '@memberjunction/react-linter';

const TYPE_RULES = ['type-mismatch-operation', 'type-compatibility'];

async function typeViolations(body: string): Promise<string[]> {
  const code = `function Widget() {\n  ${body}\n  return <div />;\n}`;
  const result = await ComponentLinter.lintComponent(code, 'Widget', undefined, true);
  return result.violations.filter(v => TYPE_RULES.includes(v.rule)).map(v => `${v.rule}: ${v.message}`);
}

describe('array methods on other types', () => {
  it.each([
    ['Map#forEach', `const totals = new Map(); totals.forEach((value, key) => console.log(key, value));`],
    ['Set#forEach', `const seen = new Set(); seen.forEach(value => console.log(value));`],
    ['String#slice', `const label = 'Revenue'; console.log(label.slice(0, 3));`],
    ['String#concat', `const label = 'Revenue'; console.log(label.concat(' total'));`],
    ['String#includes', `const label = 'Revenue'; console.log(label.includes('Rev'));`],
  ])('does not report %s', async (_name, body) => {
    expect(await typeViolations(body)).toEqual([]);
  });

  it.each([
    ['Map#map', `const totals = new Map(); totals.map(v => v);`, 'map'],
    ['String#forEach', `const label = 'Revenue'; label.forEach(c => c);`, 'forEach'],
  ])('still reports %s, which does not exist', async (_name, body, method) => {
    const violations = await typeViolations(body);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.every(v => v.includes(`"${method}()"`))).toBe(true);
  });
});
