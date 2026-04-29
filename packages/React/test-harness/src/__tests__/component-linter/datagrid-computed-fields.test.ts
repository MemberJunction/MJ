/**
 * Tests for datagrid-field-validation handling of computed/renamed fields.
 *
 * Regression tests for false positives where DataGrid/SingleRecordView
 * fields referenced computed display objects (renamed/aggregated fields)
 * rather than raw entity columns, and the rule flagged them as nonexistent.
 */

import { describe, it, expect } from 'vitest';
import { ComponentLinter, LintResult, Violation } from '../../lib/component-linter';
import { ComponentSpec } from '@memberjunction/interactive-component-types';

const specWithEntity: ComponentSpec = {
  name: 'TestComponent',
  properties: [],
  events: [],
  dataRequirements: {
    mode: 'views',
    entities: [{
      name: 'MJ: Employees',
      type: 'view',
      fieldMetadata: [
        { name: 'ID', type: 'uniqueidentifier' },
        { name: 'FirstName', type: 'nvarchar' },
        { name: 'LastName', type: 'nvarchar' },
        { name: 'Email', type: 'nvarchar' },
        { name: 'MembershipType', type: 'nvarchar' },
        { name: 'EngagementScore', type: 'int' },
      ],
    }],
  },
} as ComponentSpec;

function wrapCode(body: string): string {
  return `async function TestComponent({ utilities, components }) {\n${body}\n}`;
}

async function lint(code: string, spec?: ComponentSpec): Promise<LintResult> {
  return ComponentLinter.lintComponent(code, 'TestComponent', spec ?? specWithEntity, true);
}

function datagridViolations(result: LintResult): Violation[] {
  return result.violations.filter(v => v.rule === 'datagrid-field-validation');
}

describe('datagrid-field-validation: computed/renamed fields', () => {
  it('should NOT flag renamed fields in a constructed display object (no entityName)', async () => {
    const code = wrapCode(`
      const result = await utilities.rv.RunView({ EntityName: 'MJ: Employees' });
      if (result?.Success) {
        const record = {
          Name: result.Results[0].FirstName + ' ' + result.Results[0].LastName,
          Membership: result.Results[0].MembershipType,
          Engagement: result.Results[0].EngagementScore
        };
        const { SingleRecordView } = components;
        return <SingleRecordView record={record} fields={['Name', 'Membership', 'Engagement']} />;
      }
    `);
    const result = await lint(code);
    expect(datagridViolations(result)).toHaveLength(0);
  });

  it('should NOT flag mapped/aggregated fields on DataGrid without entityName', async () => {
    const code = wrapCode(`
      const result = await utilities.rv.RunView({ EntityName: 'MJ: Employees' });
      const summary = result?.Results?.map(d => ({ category: d.MembershipType, total: d.EngagementScore })) || [];
      const { DataGrid } = components;
      return <DataGrid data={summary} columns={[{ field: 'category' }, { field: 'total' }]} />;
    `);
    const result = await lint(code);
    expect(datagridViolations(result)).toHaveLength(0);
  });

  it('should NOT flag fields on DataTable without entityName', async () => {
    const code = wrapCode(`
      const data = [{ label: 'Active', count: 42 }, { label: 'Inactive', count: 8 }];
      const { DataTable } = components;
      return <DataTable data={data} fields={['label', 'count']} />;
    `);
    const result = await lint(code);
    expect(datagridViolations(result)).toHaveLength(0);
  });
});

describe('datagrid-field-validation: entity-bound grids', () => {
  it('should flag nonexistent field on EntityGrid', async () => {
    const code = wrapCode(`
      const result = await utilities.rv.RunView({ EntityName: 'MJ: Employees' });
      const { EntityGrid } = components;
      return <EntityGrid entityName="MJ: Employees" fields={['FirstName', 'FakeField', 'Email']} />;
    `);
    const result = await lint(code);
    const v = datagridViolations(result);
    expect(v.some(x => x.message.includes('FakeField'))).toBe(true);
  });

  it('should flag nonexistent field on DataGrid WITH entityName', async () => {
    const code = wrapCode(`
      const result = await utilities.rv.RunView({ EntityName: 'MJ: Employees' });
      const { DataGrid } = components;
      return <DataGrid entityName="MJ: Employees" data={result?.Results} fields={['FirstName', 'NonExistent']} />;
    `);
    const result = await lint(code);
    const v = datagridViolations(result);
    expect(v.some(x => x.message.includes('NonExistent'))).toBe(true);
  });

  it('should NOT flag valid fields on EntityGrid', async () => {
    const code = wrapCode(`
      const { EntityGrid } = components;
      return <EntityGrid entityName="MJ: Employees" fields={['FirstName', 'LastName', 'Email']} />;
    `);
    const result = await lint(code);
    expect(datagridViolations(result)).toHaveLength(0);
  });
});
