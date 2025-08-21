#!/usr/bin/env ts-node

import { ComponentLinter, Violation, LintResult } from '../src/lib/component-linter';
import { ComponentSpec } from '@memberjunction/interactive-component-types';

async function testWhitelistValidation() {
  console.log('🔍 Testing WHITELIST approach for RunQuery/RunView validation...\n');
  
  // Test various incorrect property accesses that should be caught
  const testCases = [
    {
      name: '.Data (uppercase)',
      code: 'result.Data',
      expected: true
    },
    {
      name: '.data (lowercase)',
      code: 'result.data',
      expected: true
    },
    {
      name: '.rows',
      code: 'result.rows',
      expected: true
    },
    {
      name: '.Rows',
      code: 'result.Rows',
      expected: true
    },
    {
      name: '.records',
      code: 'result.records',
      expected: true
    },
    {
      name: '.items',
      code: 'result.items',
      expected: true
    },
    {
      name: '.dataset',
      code: 'result.dataset',
      expected: true
    },
    {
      name: '.response',
      code: 'result.response',
      expected: true
    },
    {
      name: '.count (not a valid property)',
      code: 'result.count',
      expected: true
    },
    {
      name: '.length (array property on result object)',
      code: 'result.length',
      expected: true
    },
    {
      name: '.Results (correct)',
      code: 'result.Results',
      expected: false
    },
    {
      name: '.Success (correct)',
      code: 'result.Success',
      expected: false
    },
    {
      name: '.RowCount (correct)',
      code: 'result.RowCount',
      expected: false
    },
    {
      name: '.ErrorMessage (correct)',
      code: 'result.ErrorMessage',
      expected: false
    }
  ];
  
  const spec = {
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
  } as any as ComponentSpec;  // Use any to bypass missing required fields for testing
  
  let passCount = 0;
  let failCount = 0;
  
  for (const testCase of testCases) {
    const code = `
      function TestComponent({ utilities }) {
        const [data, setData] = useState([]);
        
        const loadData = async () => {
          const result = await utilities.rq.RunQuery({
            QueryName: 'TestQuery'
          });
          
          // Test access
          const testData = ${testCase.code};
          setData(testData || []);
        };
        
        return <div>Test</div>;
      }
    `;
    
    const lintResult: LintResult = await ComponentLinter.lintComponent(code, 'TestComponent', spec, true);
    const violations = lintResult.violations;
    
    // Check for property access violations
    const propertyViolations = violations.filter((v: Violation) => 
      v.message.toLowerCase().includes('property') &&
      (v.message.includes('result.') || v.message.includes('Results'))
    );
    
    const hasViolation = propertyViolations.length > 0;
    const passed = hasViolation === testCase.expected;
    
    if (passed) {
      console.log(`✅ ${testCase.name}: ${hasViolation ? 'Correctly caught' : 'Correctly allowed'}`);
      passCount++;
    } else {
      console.log(`❌ ${testCase.name}: ${hasViolation ? 'Incorrectly caught' : 'Should have been caught'}`);
      if (hasViolation) {
        console.log(`   Found violations: ${propertyViolations.map(v => v.message).join('; ')}`);
      }
      failCount++;
    }
  }
  
  console.log('\n---\nSummary:');
  console.log(`✅ Passed: ${passCount}/${testCases.length}`);
  console.log(`❌ Failed: ${failCount}/${testCases.length}`);
  
  // Test destructuring with whitelist approach
  console.log('\n---\nTesting destructuring validation...\n');
  
  const destructuringCode = `
    function TestComponent({ utilities }) {
      const loadData = async () => {
        const queryResult = await utilities.rq.RunQuery({
          QueryName: 'TestQuery'
        });
        
        // Try to destructure various invalid properties
        const { Success, data, rows, items, Results } = queryResult;
        
        return Results;
      };
      
      return <div>Test</div>;
    }
  `;
  
  const destructResult = await ComponentLinter.lintComponent(destructuringCode, 'TestComponent', spec, true);
  const destructViolations = destructResult.violations.filter((v: Violation) =>
    v.message.includes('Destructuring')
  );
  
  console.log(`Found ${destructViolations.length} destructuring violations:`);
  destructViolations.forEach((v: Violation) => {
    console.log(`  - ${v.message.split('.')[0]}`);
  });
  
  // The whitelist approach should catch 'data', 'rows', 'items' but allow 'Success' and 'Results'
  const invalidProps = ['data', 'rows', 'items'];
  const validProps = ['Success', 'Results'];
  
  for (const prop of invalidProps) {
    const found = destructViolations.some(v => v.message.includes(`"${prop}"`));
    if (found) {
      console.log(`✅ Correctly caught destructuring of invalid property: ${prop}`);
    } else {
      console.log(`❌ Failed to catch destructuring of invalid property: ${prop}`);
    }
  }
  
  for (const prop of validProps) {
    // Check if there's a violation specifically about this property being invalid
    const found = destructViolations.some(v => 
      v.message.includes(`invalid property "${prop}"`) ||
      v.message.includes(`Destructuring "${prop}" from`)
    );
    if (!found) {
      console.log(`✅ Correctly allowed destructuring of valid property: ${prop}`);
    } else {
      console.log(`❌ Incorrectly caught destructuring of valid property: ${prop}`);
      const violation = destructViolations.find(v => 
        v.message.includes(`invalid property "${prop}"`) ||
        v.message.includes(`Destructuring "${prop}" from`)
      );
      if (violation) {
        console.log(`   Violation message: ${violation.message}`);
      }
    }
  }
}

// Run the test
testWhitelistValidation().catch(console.error);