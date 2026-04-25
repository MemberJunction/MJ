/**
 * Tests for runquery-call-validation handling of variable references.
 *
 * Regression tests for the false positive where `Parameters: params` (an Identifier)
 * was incorrectly flagged as "must be object" because the rule only handled
 * ArrayExpression and ObjectExpression, not Identifier nodes.
 */

import { describe, it, expect } from 'vitest';
import { ComponentLinter, LintResult } from '../../lib/component-linter';
import { ComponentSpec } from '@memberjunction/interactive-component-types';

/** Spec with a query that has optional parameters */
const specWithOptionalParams: Partial<ComponentSpec> = {
  name: 'TestComponent',
  properties: [],
  events: [],
  dataRequirements: {
    mode: 'queries',
    queries: [{
      name: 'Quarterly Event Attendance Trends',
      categoryPath: 'Golden-Queries/Program Analytics',
      parameters: [
        { name: 'EventType', value: '', testValue: 'Conference' },
        { name: 'StartDate', value: '', testValue: '2024-01-01' },
        { name: 'EndDate', value: '', testValue: '2024-12-31' },
      ],
    }],
  },
} as ComponentSpec;

function wrapCode(body: string): string {
  return `async function TestComponent({ utilities }) {\n${body}\n}`;
}

async function lint(code: string, spec?: Partial<ComponentSpec>): Promise<LintResult> {
  return ComponentLinter.lintComponent(
    code,
    'TestComponent',
    (spec ?? specWithOptionalParams) as ComponentSpec,
    true,
  );
}

function getParamViolations(result: LintResult) {
  return result.violations.filter(v => v.rule === 'runquery-call-validation');
}

describe('runquery-call-validation: variable references', () => {
  // ═══════════════════════════════════════════════════════════════════════
  // FALSE POSITIVES — valid code that should NOT produce violations
  // ═══════════════════════════════════════════════════════════════════════

  it('should allow empty object variable conditionally extended', async () => {
    const code = wrapCode(`
      const params = {};
      if (true) { params.EventType = 'Conference'; }
      const result = await utilities.rq.RunQuery({
        QueryName: 'Quarterly Event Attendance Trends',
        CategoryPath: 'Golden-Queries/Program Analytics',
        Parameters: params
      });
    `);
    const result = await lint(code);
    expect(getParamViolations(result)).toHaveLength(0);
  });

  it('should allow object variable with properties conditionally extended', async () => {
    const code = wrapCode(`
      const params = { StartDate: '2024-01-01', EndDate: '2024-12-31' };
      if (true) { params.EventType = 'Workshop'; }
      const result = await utilities.rq.RunQuery({
        QueryName: 'Quarterly Event Attendance Trends',
        CategoryPath: 'Golden-Queries/Program Analytics',
        Parameters: params
      });
    `);
    const result = await lint(code);
    expect(getParamViolations(result)).toHaveLength(0);
  });

  it('should allow simple variable alias for object literal', async () => {
    const code = wrapCode(`
      const queryParams = { StartDate: '2024-01-01', EndDate: '2024-12-31' };
      const result = await utilities.rq.RunQuery({
        QueryName: 'Quarterly Event Attendance Trends',
        CategoryPath: 'Golden-Queries/Program Analytics',
        Parameters: queryParams
      });
    `);
    const result = await lint(code);
    expect(getParamViolations(result)).toHaveLength(0);
  });

  it('should allow variable when no spec query info is available', async () => {
    const noSpecQuery: Partial<ComponentSpec> = {
      name: 'TestComponent',
      properties: [],
      events: [],
    } as ComponentSpec;

    const code = wrapCode(`
      const params = { SomeParam: 'value' };
      const result = await utilities.rq.RunQuery({
        QueryName: 'Unknown Query',
        CategoryPath: 'Some/Path',
        Parameters: params
      });
    `);
    const result = await lint(code, noSpecQuery);
    expect(getParamViolations(result)).toHaveLength(0);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // TRUE POSITIVES — variable with unknown param names SHOULD be flagged
  // ═══════════════════════════════════════════════════════════════════════

  it('should flag variable with unknown parameter names', async () => {
    const code = wrapCode(`
      const params = { from: '2024-01-01', to: '2024-12-31' };
      const result = await utilities.rq.RunQuery({
        QueryName: 'Quarterly Event Attendance Trends',
        CategoryPath: 'Golden-Queries/Program Analytics',
        Parameters: params
      });
    `);
    const result = await lint(code);
    expect(getParamViolations(result).length).toBeGreaterThan(0);
  });

  it('should allow variable with conditionally-added known parameter', async () => {
    // The TypeInferenceEngine tracks the initializer fields but not
    // subsequent obj.prop = value mutations. This is the pattern from
    // the original bug report — conditionally adding a VALID param.
    const code = wrapCode(`
      const params = { StartDate: '2024-01-01' };
      if (true) { params.EventType = 'Conference'; }
      const result = await utilities.rq.RunQuery({
        QueryName: 'Quarterly Event Attendance Trends',
        CategoryPath: 'Golden-Queries/Program Analytics',
        Parameters: params
      });
    `);
    const result = await lint(code);
    expect(getParamViolations(result)).toHaveLength(0);
  });

  it('should flag variable initialized with all unknown parameter names', async () => {
    // Unknown params in the initializer ARE detected by TypeInferenceEngine
    const code = wrapCode(`
      const params = { from: '2024-01-01', to: '2024-12-31', bogus: true };
      const result = await utilities.rq.RunQuery({
        QueryName: 'Quarterly Event Attendance Trends',
        CategoryPath: 'Golden-Queries/Program Analytics',
        Parameters: params
      });
    `);
    const result = await lint(code);
    expect(getParamViolations(result).length).toBeGreaterThan(0);
  });
});
