/**
 * Tests for SQL injection detection in runquery-call-validation.
 *
 * Regression tests for false positives where query names containing
 * business domain terms (like "Join Year", "Revenue From Events")
 * were incorrectly flagged as SQL injection because the detector
 * used substring matching on individual SQL keywords.
 */

import { describe, it, expect } from 'vitest';
import { ComponentLinter, LintResult, Violation } from '../../lib/component-linter';
import { ComponentSpec } from '@memberjunction/interactive-component-types';

function makeSpec(queryNames: string[]): ComponentSpec {
  return {
    name: 'TestComponent',
    properties: [],
    events: [],
    dataRequirements: {
      mode: 'queries',
      queries: queryNames.map(name => ({
        name,
        categoryPath: 'Test/Reports',
        parameters: [],
      })),
    },
  } as ComponentSpec;
}

function wrapCode(body: string): string {
  return `async function TestComponent({ utilities }) {\n${body}\n}`;
}

async function lint(code: string, spec: ComponentSpec): Promise<LintResult> {
  return ComponentLinter.lintComponent(code, 'TestComponent', spec, true);
}

function sqlViolations(result: LintResult): Violation[] {
  return result.violations.filter(v =>
    v.rule === 'runquery-call-validation' && v.message.includes('SQL')
  );
}

describe('SQL injection detection: false positives', () => {
  it('should NOT flag "Average Lifetime Value By Join Year" (contains JOIN)', async () => {
    const name = 'Average Lifetime Value By Join Year';
    const code = wrapCode(`
      await utilities.rq.RunQuery({
        QueryName: '${name}',
        CategoryPath: 'Test/Reports',
        Parameters: {}
      });
    `);
    const result = await lint(code, makeSpec([name]));
    expect(sqlViolations(result)).toHaveLength(0);
  });

  it('should NOT flag "Members From Northwest Region" (contains FROM)', async () => {
    const name = 'Members From Northwest Region';
    const code = wrapCode(`
      await utilities.rq.RunQuery({
        QueryName: '${name}',
        CategoryPath: 'Test/Reports'
      });
    `);
    const result = await lint(code, makeSpec([name]));
    expect(sqlViolations(result)).toHaveLength(0);
  });

  it('should NOT flag "Last Updated Invoices" (contains UPDATE)', async () => {
    const name = 'Last Updated Invoices';
    const code = wrapCode(`
      await utilities.rq.RunQuery({
        QueryName: '${name}',
        CategoryPath: 'Test/Reports'
      });
    `);
    const result = await lint(code, makeSpec([name]));
    expect(sqlViolations(result)).toHaveLength(0);
  });

  it('should NOT flag "Selected Event Registrations" (contains SELECT)', async () => {
    const name = 'Selected Event Registrations';
    const code = wrapCode(`
      await utilities.rq.RunQuery({
        QueryName: '${name}',
        CategoryPath: 'Test/Reports'
      });
    `);
    const result = await lint(code, makeSpec([name]));
    expect(sqlViolations(result)).toHaveLength(0);
  });

  it('should NOT flag "Deleted Records Audit" (contains DELETE)', async () => {
    const name = 'Deleted Records Audit';
    const code = wrapCode(`
      await utilities.rq.RunQuery({
        QueryName: '${name}',
        CategoryPath: 'Test/Reports'
      });
    `);
    const result = await lint(code, makeSpec([name]));
    expect(sqlViolations(result)).toHaveLength(0);
  });

  it('should NOT flag "New Joins By Month" (contains JOIN)', async () => {
    const name = 'New Joins By Month';
    const code = wrapCode(`
      await utilities.rq.RunQuery({
        QueryName: '${name}',
        CategoryPath: 'Test/Reports'
      });
    `);
    const result = await lint(code, makeSpec([name]));
    expect(sqlViolations(result)).toHaveLength(0);
  });
});

describe('SQL injection detection: true positives', () => {
  it('should flag "SELECT * FROM Members WHERE Status = Active"', async () => {
    const sql = "SELECT * FROM Members WHERE Status = 'Active'";
    const code = wrapCode(`
      await utilities.rq.RunQuery({
        QueryName: "${sql}",
        CategoryPath: 'Test/Reports'
      });
    `);
    // Not in spec — unknown query with SQL structure
    const result = await lint(code, makeSpec([]));
    expect(sqlViolations(result).length).toBeGreaterThan(0);
  });

  it('should flag "SELECT COUNT(*) FROM Invoices"', async () => {
    const sql = 'SELECT COUNT(*) FROM Invoices';
    const code = wrapCode(`
      await utilities.rq.RunQuery({
        QueryName: '${sql}',
        CategoryPath: 'Test/Reports'
      });
    `);
    const result = await lint(code, makeSpec([]));
    expect(sqlViolations(result).length).toBeGreaterThan(0);
  });

  it('should flag "DELETE FROM Members WHERE ID = 1"', async () => {
    const sql = 'DELETE FROM Members WHERE ID = 1';
    const code = wrapCode(`
      await utilities.rq.RunQuery({
        QueryName: '${sql}',
        CategoryPath: 'Test/Reports'
      });
    `);
    const result = await lint(code, makeSpec([]));
    expect(sqlViolations(result).length).toBeGreaterThan(0);
  });

  it('should flag "UPDATE Members SET Status = Active"', async () => {
    const sql = "UPDATE Members SET Status = 'Active'";
    const code = wrapCode(`
      await utilities.rq.RunQuery({
        QueryName: "${sql}",
        CategoryPath: 'Test/Reports'
      });
    `);
    const result = await lint(code, makeSpec([]));
    expect(sqlViolations(result).length).toBeGreaterThan(0);
  });

  it('should flag "INSERT INTO Members VALUES (1)"', async () => {
    const sql = "INSERT INTO Members VALUES (1)";
    const code = wrapCode(`
      await utilities.rq.RunQuery({
        QueryName: '${sql}',
        CategoryPath: 'Test/Reports'
      });
    `);
    const result = await lint(code, makeSpec([]));
    expect(sqlViolations(result).length).toBeGreaterThan(0);
  });
});

describe('SQL injection detection: known query bypass', () => {
  it('should NOT flag a known query even if it structurally resembles SQL', async () => {
    // Contrived edge case: query name that looks like SQL but is in the spec
    const name = 'Select From Delete Report';
    const code = wrapCode(`
      await utilities.rq.RunQuery({
        QueryName: '${name}',
        CategoryPath: 'Test/Reports'
      });
    `);
    const result = await lint(code, makeSpec([name]));
    expect(sqlViolations(result)).toHaveLength(0);
  });
});
