/**
 * Basic Component Linter Rule Tests
 *
 * Tests core linter rules using inline code snippets.
 * No database connection required - these test AST-based rule logic directly.
 */

import { describe, it, expect } from 'vitest';
import { ComponentLinter } from '@memberjunction/react-linter';
import { ComponentSpec } from '@memberjunction/interactive-component-types';

// Base spec for query-based components
const baseQuerySpec = {
  name: 'TestComponent',
  type: 'chart' as const,
  title: 'Test Component',
  description: 'Test component for linter validation',
  code: '',
  location: 'embedded' as const,
  functionalRequirements: 'Test requirements',
  technicalDesign: 'Test design',
  exampleUsage: '<TestComponent />',
  dataRequirements: {
    mode: 'queries' as const,
    queries: [
      {
        name: 'TestQuery',
        categoryPath: 'Test',
        fields: [],
        entityNames: [],
      },
    ],
    entities: [],
  },
} as ComponentSpec;

describe('ComponentLinter - Optional Member Expression Invalid Properties', () => {
  it('should detect result?.records (lowercase) as invalid property', async () => {
    const code = `
      function TestComponent({ utilities }) {
        const [data, setData] = React.useState([]);

        const loadData = async () => {
          const result = await utilities.rq.RunQuery({
            QueryName: 'TestQuery'
          });
          const rows = result?.records ?? [];
          setData(rows);
        };

        return React.createElement('div', null, data.length + ' items');
      }
    `;

    const lintResult = await ComponentLinter.lintComponent(code, 'TestComponent', baseQuerySpec, true);

    const recordsViolation = lintResult.violations.find(
      (v) => v.message.includes('records') && v.message.includes('Results'),
    );

    expect(recordsViolation).toBeDefined();
    expect(recordsViolation?.severity).toBe('critical');
  });

  it('should detect result?.Rows (capitalized) as invalid property', async () => {
    const code = `
      function TestComponent({ utilities }) {
        const loadData = async () => {
          const result = await utilities.rq.RunQuery({
            QueryName: 'TestQuery'
          });
          return result?.Rows ?? [];
        };

        return React.createElement('div', null, 'Test');
      }
    `;

    const lintResult = await ComponentLinter.lintComponent(code, 'TestComponent', baseQuerySpec, true);

    const rowsViolation = lintResult.violations.find(
      (v) => v.message.includes('Rows') && v.message.includes('Results'),
    );

    expect(rowsViolation).toBeDefined();
    expect(rowsViolation?.severity).toBe('critical');
  });

  it('should NOT flag result?.Results as invalid (correct property)', async () => {
    const code = `
      function TestComponent({ utilities }) {
        const loadData = async () => {
          const result = await utilities.rq.RunQuery({
            QueryName: 'TestQuery'
          });
          const data = result?.Results ?? [];
          return data;
        };

        return React.createElement('div', null, 'Test');
      }
    `;

    const lintResult = await ComponentLinter.lintComponent(code, 'TestComponent', baseQuerySpec, true);

    const invalidViolations = lintResult.violations.filter(
      (v) => v.message.includes('.Results') && v.message.includes("don't have"),
    );

    expect(invalidViolations).toHaveLength(0);
  });
});

describe('ComponentLinter - Weak Fallback Chain Detection', () => {
  it('should detect result?.records ?? result?.Rows ?? [] fallback chain', async () => {
    const code = `
      function TestComponent({ utilities }) {
        const loadData = async () => {
          const result = await utilities.rq.RunQuery({
            QueryName: 'TestQuery'
          });
          const rows = result?.records ?? result?.Rows ?? [];
          return rows;
        };

        return React.createElement('div', null, 'Test');
      }
    `;

    const lintResult = await ComponentLinter.lintComponent(code, 'TestComponent', baseQuerySpec, true);

    const relevantViolations = lintResult.violations.filter(
      (v) =>
        (v.message.includes('records') || v.message.includes('Rows')) &&
        (v.message.includes('Results') || v.message.toLowerCase().includes('fallback')),
    );

    expect(relevantViolations.length).toBeGreaterThan(0);
  });
});

describe('ComponentLinter - Regression: Regular Member Access', () => {
  it('should catch result.records (no optional chaining) as invalid', async () => {
    const code = `
      function TestComponent({ utilities }) {
        const loadData = async () => {
          const result = await utilities.rq.RunQuery({
            QueryName: 'TestQuery'
          });
          const data = result.records || [];
          return data;
        };

        return React.createElement('div', null, 'Test');
      }
    `;

    const lintResult = await ComponentLinter.lintComponent(code, 'TestComponent', baseQuerySpec, true);

    const recordsViolation = lintResult.violations.find(
      (v) => v.message.includes('records') && v.message.includes('Results'),
    );

    expect(recordsViolation).toBeDefined();
    expect(recordsViolation?.severity).toBe('critical');
  });
});
