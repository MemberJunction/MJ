/**
 * Rules must not crash when the component name is missing.
 *
 * Callers pass `spec.name`, which is undefined for some specs at runtime. `no-data-prop`
 * threw "Cannot read properties of undefined (reading 'toLowerCase')" and
 * `component-name-mismatch` threw "(reading 'charAt')" on every such lint.
 */
import { describe, it, expect } from 'vitest';
import { parse } from '@babel/parser';
import type { File } from '@babel/types';
import type { ComponentSpec } from '@memberjunction/interactive-component-types';

import { NoDataPropRule } from './no-data-prop';
import { ComponentNameMismatchRule } from './component-name-mismatch';

function ast(code: string): File {
  return parse(code, { sourceType: 'module', plugins: ['jsx', 'typescript'] });
}

/** The name a caller passes when `spec.name` is absent. */
const MISSING_NAME = undefined as unknown as string;

const CODE = `function MemberList({ data, utilities }) {
  return <div>{data.length}</div>;
}`;

describe('rules with a missing component name', () => {
  it('no-data-prop returns no violations instead of throwing', () => {
    expect(() => new NoDataPropRule().Test(ast(CODE), MISSING_NAME)).not.toThrow();
    expect(new NoDataPropRule().Test(ast(CODE), MISSING_NAME)).toEqual([]);
  });

  it('no-data-prop still flags a named component that accepts data', () => {
    const violations = new NoDataPropRule().Test(ast(CODE), 'MemberList');
    expect(violations.map((v) => v.rule)).toEqual(['no-data-prop']);
  });

  it('component-name-mismatch returns no violations without a spec name or component name', () => {
    expect(() => new ComponentNameMismatchRule().Test(ast(CODE), MISSING_NAME)).not.toThrow();
    expect(new ComponentNameMismatchRule().Test(ast(CODE), MISSING_NAME, {} as ComponentSpec)).toEqual([]);
  });

  it('component-name-mismatch falls back to the spec name', () => {
    const spec = { name: 'MemberRoster' } as ComponentSpec;
    const violations = new ComponentNameMismatchRule().Test(ast(CODE), MISSING_NAME, spec);
    expect(violations).toHaveLength(1);
    expect(violations[0].message).toContain('"MemberRoster"');
  });
});
