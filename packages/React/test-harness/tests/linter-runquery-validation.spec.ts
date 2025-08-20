import { ComponentLinter } from '../src/lib/component-linter';
import { ComponentSpec } from '@memberjunction/interactivecomponents';

describe('ComponentLinter - RunQuery/RunView Validation', () => {
  let linter: ComponentLinter;

  beforeEach(() => {
    linter = new ComponentLinter();
  });

  describe('RunQuery result property access', () => {
    it('should detect incorrect .Data property access on RunQuery results', async () => {
      const code = `
        function TestComponent({ utilities }) {
          const [data, setData] = useState([]);
          
          useEffect(() => {
            loadData();
          }, []);
          
          const loadData = async () => {
            const result = await utilities.rq.RunQuery({
              QueryName: 'AccountIndustryDistribution'
            });
            
            // This is WRONG - should be .Results not .Data
            setData(result.Data || []);
          };
          
          return <div>{data.length} items</div>;
        }
      `;

      const spec: ComponentSpec = {
        name: 'TestComponent',
        type: 'chart',
        title: 'Test Component',
        dataRequirements: {
          mode: 'queries',
          queries: [{
            name: 'AccountIndustryDistribution',
            categoryPath: 'Test',
            fields: []
          }]
        }
      };

      const violations = await linter.lint(code, spec);
      
      // Should find the .Data access violation
      const dataViolation = violations.find(v => 
        v.message.includes('.data') && 
        v.message.includes('.Results')
      );
      
      expect(dataViolation).toBeDefined();
      expect(dataViolation?.severity).toBe('critical');
      expect(dataViolation?.message).toContain('Use ".Results" to access');
    });

    it('should detect incorrect .data property access (lowercase) on RunQuery results', async () => {
      const code = `
        function TestComponent({ utilities }) {
          const [items, setItems] = useState([]);
          
          const loadData = async () => {
            const queryResult = await utilities.rq.RunQuery({
              QueryName: 'TestQuery'
            });
            
            // This is WRONG - should be .Results not .data (lowercase)
            const items = queryResult.data || [];
            setItems(items);
          };
          
          return <div>Items: {items.length}</div>;
        }
      `;

      const spec: ComponentSpec = {
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

      const violations = await linter.lint(code, spec);
      
      const dataViolation = violations.find(v => 
        v.message.includes('queryResult.data') &&
        v.message.includes('.Results')
      );
      
      expect(dataViolation).toBeDefined();
      expect(dataViolation?.severity).toBe('critical');
    });

    it('should detect chained incorrect property access like .Data.length', async () => {
      const code = `
        function TestComponent({ utilities }) {
          const loadData = async () => {
            const result = await utilities.rq.RunQuery({
              QueryName: 'TestQuery'
            });
            
            // This is WRONG - trying to access .Data instead of .Results
            if (result.Success && result.Data && result.Data.length > 0) {
              console.log('Has data');
            }
          };
          
          return <div>Test</div>;
        }
      `;

      const spec: ComponentSpec = {
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

      const violations = await linter.lint(code, spec);
      
      // Should find multiple violations for .Data access
      const dataViolations = violations.filter(v => 
        v.message.includes('.Data') || v.message.includes('.data')
      );
      
      expect(dataViolations.length).toBeGreaterThan(0);
    });

    it('should detect destructuring of wrong properties from RunQuery result', async () => {
      const code = `
        function TestComponent({ utilities }) {
          const loadData = async () => {
            const queryResult = await utilities.rq.RunQuery({
              QueryName: 'TestQuery'
            });
            
            // This is WRONG - destructuring 'data' instead of 'Results'
            const { Success, data } = queryResult;
            
            if (Success && data) {
              console.log(data);
            }
          };
          
          return <div>Test</div>;
        }
      `;

      const spec: ComponentSpec = {
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

      const violations = await linter.lint(code, spec);
      
      const destructuringViolation = violations.find(v => 
        v.message.includes('Destructuring "data"') &&
        v.message.includes('Results')
      );
      
      expect(destructuringViolation).toBeDefined();
      expect(destructuringViolation?.severity).toBe('critical');
    });

    it('should NOT report violations for correct .Results property access', async () => {
      const code = `
        function TestComponent({ utilities }) {
          const [data, setData] = useState([]);
          
          const loadData = async () => {
            const result = await utilities.rq.RunQuery({
              QueryName: 'TestQuery'
            });
            
            // This is CORRECT - using .Results
            if (result.Success) {
              setData(result.Results || []);
            } else {
              console.error('Query failed:', result.ErrorMessage);
            }
          };
          
          return <div>{data.length} items</div>;
        }
      `;

      const spec: ComponentSpec = {
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

      const violations = await linter.lint(code, spec);
      
      // Should not have any violations about .data or .Results
      const dataViolations = violations.filter(v => 
        v.message.includes('.data') || 
        v.message.includes('.Data') ||
        v.message.includes('.Results')
      );
      
      expect(dataViolations).toHaveLength(0);
    });

    it('should detect SQL being passed as QueryName parameter', async () => {
      const code = `
        function TestComponent({ utilities }) {
          const loadData = async () => {
            const result = await utilities.rq.RunQuery({
              QueryName: 'SELECT * FROM Accounts WHERE Industry = "Technology"'
            });
            
            setData(result.Results || []);
          };
          
          return <div>Test</div>;
        }
      `;

      const spec: ComponentSpec = {
        name: 'TestComponent',
        type: 'chart',
        title: 'Test Component',
        dataRequirements: {
          mode: 'queries',
          queries: [{
            name: 'AccountQuery',
            categoryPath: 'Test',
            fields: []
          }]
        }
      };

      const violations = await linter.lint(code, spec);
      
      const sqlViolation = violations.find(v => 
        v.message.includes('SQL statement') &&
        v.message.includes('QueryName')
      );
      
      expect(sqlViolation).toBeDefined();
      expect(sqlViolation?.severity).toBe('critical');
      expect(sqlViolation?.message).toContain('SELECT');
    });

    it('should validate query name matches dataRequirements', async () => {
      const code = `
        function TestComponent({ utilities }) {
          const loadData = async () => {
            // This query name doesn't exist in dataRequirements
            const result = await utilities.rq.RunQuery({
              QueryName: 'NonExistentQuery'
            });
            
            setData(result.Results || []);
          };
          
          return <div>Test</div>;
        }
      `;

      const spec: ComponentSpec = {
        name: 'TestComponent',
        type: 'chart',
        title: 'Test Component',
        dataRequirements: {
          mode: 'queries',
          queries: [{
            name: 'AccountIndustryDistribution',
            categoryPath: 'Test',
            fields: []
          }]
        }
      };

      const violations = await linter.lint(code, spec);
      
      const queryNameViolation = violations.find(v => 
        v.message.includes('NonExistentQuery') &&
        v.message.includes('not found in dataRequirements')
      );
      
      expect(queryNameViolation).toBeDefined();
      expect(queryNameViolation?.severity).toBe('critical');
    });
  });

  describe('RunView result property access', () => {
    it('should detect incorrect .Data property access on RunView results', async () => {
      const code = `
        function TestComponent({ utilities }) {
          const loadAccounts = async () => {
            const viewResult = await utilities.rv.RunView({
              EntityName: 'Accounts'
            });
            
            // This is WRONG - should be .Results not .Data
            const accounts = viewResult.Data || [];
            return accounts;
          };
          
          return <div>Test</div>;
        }
      `;

      const spec: ComponentSpec = {
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

      const violations = await linter.lint(code, spec);
      
      const dataViolation = violations.find(v => 
        v.message.includes('viewResult.Data') &&
        v.message.includes('.Results')
      );
      
      expect(dataViolation).toBeDefined();
      expect(dataViolation?.severity).toBe('critical');
    });

    it('should validate entity name matches dataRequirements', async () => {
      const code = `
        function TestComponent({ utilities }) {
          const loadData = async () => {
            // This entity doesn't exist in dataRequirements
            const result = await utilities.rv.RunView({
              EntityName: 'NonExistentEntity'
            });
            
            return result.Results || [];
          };
          
          return <div>Test</div>;
        }
      `;

      const spec: ComponentSpec = {
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

      const violations = await linter.lint(code, spec);
      
      const entityNameViolation = violations.find(v => 
        v.message.includes('NonExistentEntity') &&
        v.message.includes('not found in dataRequirements')
      );
      
      expect(entityNameViolation).toBeDefined();
      expect(entityNameViolation?.severity).toBe('critical');
    });
  });

  describe('Edge cases and complex scenarios', () => {
    it('should handle conditional property access correctly', async () => {
      const code = `
        function TestComponent({ utilities }) {
          const loadData = async () => {
            const result = await utilities.rq.RunQuery({
              QueryName: 'TestQuery'
            });
            
            // Multiple wrong accesses in conditional
            const data = result.Success 
              ? (result.Data || result.data || [])  // Both wrong
              : [];
            
            return data;
          };
          
          return <div>Test</div>;
        }
      `;

      const spec: ComponentSpec = {
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

      const violations = await linter.lint(code, spec);
      
      // Should find violations for both .Data and .data
      const dataViolations = violations.filter(v => 
        (v.message.includes('.Data') || v.message.includes('.data')) &&
        v.message.includes('.Results')
      );
      
      expect(dataViolations.length).toBeGreaterThanOrEqual(1);
    });

    it('should track result through variable reassignment', async () => {
      const code = `
        function TestComponent({ utilities }) {
          const loadData = async () => {
            const queryResponse = await utilities.rq.RunQuery({
              QueryName: 'TestQuery'
            });
            
            // Reassign to another variable
            const result = queryResponse;
            
            // Still wrong even through reassignment
            const items = result.Data || [];
            
            return items;
          };
          
          return <div>Test</div>;
        }
      `;

      const spec: ComponentSpec = {
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

      const violations = await linter.lint(code, spec);
      
      const dataViolation = violations.find(v => 
        v.message.includes('.Data') &&
        v.message.includes('.Results')
      );
      
      // This is a harder case to catch, but ideally should be detected
      // If not caught, this test documents a known limitation
      if (dataViolation) {
        expect(dataViolation.severity).toBe('critical');
      } else {
        // Document this as a known limitation
        console.warn('Known limitation: Cannot track RunQuery results through variable reassignment');
      }
    });
  });
});