import { ComponentLinter } from '../src/lib/component-linter';
import { ComponentSpec } from '@memberjunction/interactivecomponents';

describe('ComponentLinter - Optional Chaining Result Property Validation', () => {
  let linter: ComponentLinter;

  beforeEach(() => {
    linter = new ComponentLinter();
  });

  const baseSpec: ComponentSpec = {
    name: 'TestComponent',
    type: 'chart',
    title: 'Test Component',
    dataRequirements: {
      mode: 'queries',
      queries: [{
        name: 'TestQuery',
        categoryPath: 'Test',
        fields: []
      }]
    }
  };

  describe('OptionalMemberExpression - Basic Invalid Properties', () => {
    it('should detect result?.records (lowercase) - invalid property', async () => {
      const code = `
        function TestComponent({ utilities }) {
          const [data, setData] = useState([]);

          const loadData = async () => {
            const result = await utilities.rq.RunQuery({
              QueryName: 'TestQuery'
            });

            // ❌ WRONG - using result?.records
            const rows = result?.records ?? [];
            setData(rows);
          };

          return <div>{data.length} items</div>;
        }
      `;

      const violations = await linter.lint(code, baseSpec);

      const recordsViolation = violations.find(v =>
        v.message.includes('records') &&
        v.message.includes('Results')
      );

      expect(recordsViolation).toBeDefined();
      expect(recordsViolation?.severity).toBe('critical');
      expect(recordsViolation?.message).toContain('.Results');
    });

    it('should detect result?.Rows (capitalized) - invalid property', async () => {
      const code = `
        function TestComponent({ utilities }) {
          const loadData = async () => {
            const result = await utilities.rq.RunQuery({
              QueryName: 'TestQuery'
            });

            // ❌ WRONG - using result?.Rows
            return result?.Rows ?? [];
          };

          return <div>Test</div>;
        }
      `;

      const violations = await linter.lint(code, baseSpec);

      const rowsViolation = violations.find(v =>
        v.message.includes('Rows') &&
        v.message.includes('Results')
      );

      expect(rowsViolation).toBeDefined();
      expect(rowsViolation?.severity).toBe('critical');
    });

    it('should detect result?.data (lowercase) - invalid property', async () => {
      const code = `
        function TestComponent({ utilities }) {
          const loadData = async () => {
            const result = await utilities.rq.RunQuery({
              QueryName: 'TestQuery'
            });

            // ❌ WRONG - using result?.data
            const items = result?.data || [];
            return items;
          };

          return <div>Test</div>;
        }
      `;

      const violations = await linter.lint(code, baseSpec);

      const dataViolation = violations.find(v =>
        v.message.includes('data') &&
        v.message.includes('Results')
      );

      expect(dataViolation).toBeDefined();
      expect(dataViolation?.severity).toBe('critical');
    });

    it('should detect result?.Data (capitalized) - invalid property', async () => {
      const code = `
        function TestComponent({ utilities }) {
          const loadData = async () => {
            const result = await utilities.rq.RunQuery({
              QueryName: 'TestQuery'
            });

            // ❌ WRONG - using result?.Data
            const items = result?.Data ?? [];
            return items;
          };

          return <div>Test</div>;
        }
      `;

      const violations = await linter.lint(code, baseSpec);

      const dataViolation = violations.find(v =>
        v.message.includes('Data') &&
        v.message.includes('Results')
      );

      expect(dataViolation).toBeDefined();
      expect(dataViolation?.severity).toBe('critical');
    });

    it('should NOT flag result?.Results - correct property', async () => {
      const code = `
        function TestComponent({ utilities }) {
          const loadData = async () => {
            const result = await utilities.rq.RunQuery({
              QueryName: 'TestQuery'
            });

            // ✅ CORRECT - using result?.Results
            const data = result?.Results ?? [];
            return data;
          };

          return <div>Test</div>;
        }
      `;

      const violations = await linter.lint(code, baseSpec);

      const invalidViolations = violations.filter(v =>
        v.message.includes('.Results') &&
        v.message.includes("don't have")
      );

      expect(invalidViolations).toHaveLength(0);
    });
  });

  describe('Weak Fallback Chain Detection', () => {
    it('should detect result?.records ?? result?.Rows ?? [] - EXACT BUG FROM broken-10.json', async () => {
      const code = `
        function TestComponent({ utilities }) {
          const loadData = async () => {
            const result = await utilities.rq.RunQuery({
              QueryName: 'TestQuery'
            });

            // ❌ WRONG - This is the EXACT bug pattern from broken-10.json
            const rows = result?.records ?? result?.Rows ?? [];
            return rows;
          };

          return <div>Test</div>;
        }
      `;

      const violations = await linter.lint(code, baseSpec);

      // Should detect EITHER individual invalid properties OR weak fallback pattern
      const relevantViolations = violations.filter(v =>
        (v.message.includes('records') || v.message.includes('Rows')) &&
        (v.message.includes('Results') || v.message.includes('fallback'))
      );

      expect(relevantViolations.length).toBeGreaterThan(0);

      // If weak fallback detection is implemented, should have that specific violation
      const weakFallbackViolation = violations.find(v =>
        v.message.toLowerCase().includes('weak fallback') ||
        v.message.toLowerCase().includes('multiple')
      );

      if (weakFallbackViolation) {
        expect(weakFallbackViolation.severity).toBe('critical');
        expect(weakFallbackViolation.message).toContain('Results');
      }
    });

    it('should detect result?.data ?? result?.rows ?? [] - multiple invalid properties', async () => {
      const code = `
        function TestComponent({ utilities }) {
          const loadData = async () => {
            const result = await utilities.rq.RunQuery({
              QueryName: 'TestQuery'
            });

            // ❌ WRONG - chaining multiple invalid properties
            const items = result?.data ?? result?.rows ?? [];
            return items;
          };

          return <div>Test</div>;
        }
      `;

      const violations = await linter.lint(code, baseSpec);

      const relevantViolations = violations.filter(v =>
        (v.message.includes('data') || v.message.includes('rows')) &&
        v.message.includes('Results')
      );

      expect(relevantViolations.length).toBeGreaterThan(0);
    });

    it('should detect result?.items ?? result?.values ?? [] - other common mistakes', async () => {
      const code = `
        function TestComponent({ utilities }) {
          const loadData = async () => {
            const result = await utilities.rq.RunQuery({
              QueryName: 'TestQuery'
            });

            // ❌ WRONG - items and values don't exist either
            const data = result?.items ?? result?.values ?? [];
            return data;
          };

          return <div>Test</div>;
        }
      `;

      const violations = await linter.lint(code, baseSpec);

      const relevantViolations = violations.filter(v =>
        (v.message.includes('items') || v.message.includes('values')) &&
        v.message.includes('Results')
      );

      expect(relevantViolations.length).toBeGreaterThan(0);
    });

    it('should NOT flag result?.Results ?? [] - correct fallback', async () => {
      const code = `
        function TestComponent({ utilities }) {
          const loadData = async () => {
            const result = await utilities.rq.RunQuery({
              QueryName: 'TestQuery'
            });

            // ✅ CORRECT - proper fallback with valid property
            const data = result?.Results ?? [];
            return data;
          };

          return <div>Test</div>;
        }
      `;

      const violations = await linter.lint(code, baseSpec);

      const invalidViolations = violations.filter(v =>
        v.message.includes('Results') &&
        (v.message.includes("don't have") || v.message.includes('fallback'))
      );

      expect(invalidViolations).toHaveLength(0);
    });
  });

  describe('RunView Results - Optional Chaining', () => {
    const viewSpec: ComponentSpec = {
      name: 'TestComponent',
      type: 'table',
      title: 'Test Component',
      dataRequirements: {
        mode: 'views',
        entities: [{
          name: 'Accounts',
          displayFields: ['ID', 'Name']
        }]
      }
    };

    it('should detect RunView result?.records - invalid property', async () => {
      const code = `
        function TestComponent({ utilities }) {
          const loadData = async () => {
            const viewResult = await utilities.rv.RunView({
              EntityName: 'Accounts'
            });

            // ❌ WRONG - using viewResult?.records
            return viewResult?.records ?? [];
          };

          return <div>Test</div>;
        }
      `;

      const violations = await linter.lint(code, viewSpec);

      const recordsViolation = violations.find(v =>
        v.message.includes('records') &&
        v.message.includes('Results')
      );

      expect(recordsViolation).toBeDefined();
      expect(recordsViolation?.severity).toBe('critical');
    });

    it('should detect RunView result?.Rows - invalid property', async () => {
      const code = `
        function TestComponent({ utilities }) {
          const loadData = async () => {
            const viewResult = await utilities.rv.RunView({
              EntityName: 'Accounts'
            });

            // ❌ WRONG - using viewResult?.Rows
            return viewResult?.Rows ?? [];
          };

          return <div>Test</div>;
        }
      `;

      const violations = await linter.lint(code, viewSpec);

      const rowsViolation = violations.find(v =>
        v.message.includes('Rows') &&
        v.message.includes('Results')
      );

      expect(rowsViolation).toBeDefined();
      expect(rowsViolation?.severity).toBe('critical');
    });

    it('should NOT flag RunView result?.Results - correct property', async () => {
      const code = `
        function TestComponent({ utilities }) {
          const loadData = async () => {
            const viewResult = await utilities.rv.RunView({
              EntityName: 'Accounts'
            });

            // ✅ CORRECT - using viewResult?.Results
            const accounts = viewResult?.Results ?? [];
            return accounts;
          };

          return <div>Test</div>;
        }
      `;

      const violations = await linter.lint(code, viewSpec);

      const invalidViolations = violations.filter(v =>
        v.message.includes('Results') &&
        v.message.includes("don't have")
      );

      expect(invalidViolations).toHaveLength(0);
    });
  });

  describe('Edge Cases', () => {
    it('should detect optional chaining with || fallback', async () => {
      const code = `
        function TestComponent({ utilities }) {
          const loadData = async () => {
            const result = await utilities.rq.RunQuery({
              QueryName: 'TestQuery'
            });

            // ❌ WRONG - using || instead of ?? but still wrong property
            const data = result?.records || [];
            return data;
          };

          return <div>Test</div>;
        }
      `;

      const violations = await linter.lint(code, baseSpec);

      const recordsViolation = violations.find(v =>
        v.message.includes('records') &&
        v.message.includes('Results')
      );

      expect(recordsViolation).toBeDefined();
    });

    it('should detect nested optional chaining', async () => {
      const code = `
        function TestComponent({ utilities }) {
          const loadData = async () => {
            const result = await utilities.rq.RunQuery({
              QueryName: 'TestQuery'
            });

            // ❌ WRONG - nested invalid property
            const count = result?.records?.length ?? 0;
            return count;
          };

          return <div>Test</div>;
        }
      `;

      const violations = await linter.lint(code, baseSpec);

      const recordsViolation = violations.find(v =>
        v.message.includes('records') &&
        v.message.includes('Results')
      );

      expect(recordsViolation).toBeDefined();
    });

    it('should handle ternary with optional chaining', async () => {
      const code = `
        function TestComponent({ utilities }) {
          const loadData = async () => {
            const result = await utilities.rq.RunQuery({
              QueryName: 'TestQuery'
            });

            // ❌ WRONG - ternary with invalid property
            const data = result?.records ? result.records : [];
            return data;
          };

          return <div>Test</div>;
        }
      `;

      const violations = await linter.lint(code, baseSpec);

      // Should catch at least one violation for .records access
      const recordsViolations = violations.filter(v =>
        v.message.includes('records') &&
        v.message.includes('Results')
      );

      expect(recordsViolations.length).toBeGreaterThan(0);
    });

    it('should NOT flag when variable is NOT from RunQuery/RunView', async () => {
      const code = `
        function TestComponent({ utilities }) {
          // Some other data source, not RunQuery/RunView
          const customData = { records: [1, 2, 3] };

          // This is OK - customData is not a RunQuery/RunView result
          const items = customData?.records ?? [];

          return <div>{items.length}</div>;
        }
      `;

      const violations = await linter.lint(code, baseSpec);

      // Should NOT flag this because customData is not from RunQuery/RunView
      const recordsViolations = violations.filter(v =>
        v.message.includes('customData') &&
        v.message.includes('records') &&
        v.message.includes('Results')
      );

      expect(recordsViolations).toHaveLength(0);
    });
  });

  describe('Regression Tests - Existing Patterns Should Still Work', () => {
    it('should still catch regular member access (no optional chaining)', async () => {
      const code = `
        function TestComponent({ utilities }) {
          const loadData = async () => {
            const result = await utilities.rq.RunQuery({
              QueryName: 'TestQuery'
            });

            // ❌ WRONG - regular member access (existing test case)
            const data = result.records || [];
            return data;
          };

          return <div>Test</div>;
        }
      `;

      const violations = await linter.lint(code, baseSpec);

      const recordsViolation = violations.find(v =>
        v.message.includes('records') &&
        v.message.includes('Results')
      );

      expect(recordsViolation).toBeDefined();
      expect(recordsViolation?.severity).toBe('critical');
    });

    it('should still catch destructuring with invalid properties', async () => {
      const code = `
        function TestComponent({ utilities }) {
          const loadData = async () => {
            const queryResult = await utilities.rq.RunQuery({
              QueryName: 'TestQuery'
            });

            // ❌ WRONG - destructuring invalid property (existing test case)
            const { Success, records } = queryResult;

            if (Success && records) {
              return records;
            }
            return [];
          };

          return <div>Test</div>;
        }
      `;

      const violations = await linter.lint(code, baseSpec);

      const destructuringViolation = violations.find(v =>
        v.message.includes('records') &&
        v.message.includes('Results')
      );

      expect(destructuringViolation).toBeDefined();
    });

    it('should still allow correct Result property access', async () => {
      const code = `
        function TestComponent({ utilities }) {
          const [data, setData] = useState([]);

          const loadData = async () => {
            const result = await utilities.rq.RunQuery({
              QueryName: 'TestQuery'
            });

            // ✅ CORRECT - proper pattern
            if (result.Success) {
              setData(result.Results || []);
            } else {
              console.error('Query failed:', result.ErrorMessage);
            }
          };

          return <div>{data.length} items</div>;
        }
      `;

      const violations = await linter.lint(code, baseSpec);

      // Should NOT have violations for valid properties
      const invalidViolations = violations.filter(v =>
        v.message.includes('Results') &&
        v.message.includes("don't have")
      );

      expect(invalidViolations).toHaveLength(0);
    });
  });
});
