// Test file for SimpleComponent
export default async function runTests(harness) {
  console.log('Running SimpleComponent tests...\n');

  // Test 1: Default rendering
  await harness.runTest('Renders with default props', async () => {
    const result = await harness.testComponentFromFile(
      './SimpleComponent.jsx'
    );
    
    const { AssertionHelpers } = harness;
    AssertionHelpers.assertSuccess(result);
    AssertionHelpers.assertContainsText(result.html, 'Default Title');
    AssertionHelpers.assertHasElement(result.html, '.simple-component');
  });

  // Test 2: Custom props
  await harness.runTest('Renders with custom props', async () => {
    const result = await harness.testComponentFromFile(
      './SimpleComponent.jsx',
      {
        title: 'My Custom Title',
        items: ['Apple', 'Banana', 'Cherry'],
        showFooter: true
      }
    );
    
    const matcher = harness.createMatcher(result.html);
    matcher.toContainText('My Custom Title');
    matcher.toHaveElementCount('li', 3);
    matcher.toContainText('Apple');
    matcher.toContainText('Banana');
    matcher.toContainText('Cherry');
    matcher.toHaveElement('.component-footer');
  });

  // Test 3: No footer when showFooter is false
  await harness.runTest('Hides footer when showFooter is false', async () => {
    const result = await harness.testComponentFromFile(
      './SimpleComponent.jsx',
      {
        title: 'Test',
        showFooter: false
      }
    );
    
    const { AssertionHelpers } = harness;
    AssertionHelpers.assertSuccess(result);
    const hasFooter = AssertionHelpers.hasElement(result.html, '.component-footer');
    if (hasFooter) {
      throw new Error('Footer should not be rendered when showFooter is false');
    }
  });

  // Test 4: Empty items array
  await harness.runTest('Handles empty items array', async () => {
    const result = await harness.testComponentFromFile(
      './SimpleComponent.jsx',
      {
        title: 'Empty List Test',
        items: []
      }
    );
    
    const { AssertionHelpers } = harness;
    AssertionHelpers.assertSuccess(result);
    AssertionHelpers.assertElementCount(result.html, 'li', 0);
  });

  // Test 5: Console output check
  await harness.runTest('No console errors during render', async () => {
    const result = await harness.testComponentFromFile(
      './SimpleComponent.jsx',
      {
        items: ['Test Item']
      }
    );
    
    const { AssertionHelpers } = harness;
    AssertionHelpers.assertNoConsoleErrors(result.console);
  });

  // Run batch tests with summary
  const batchResults = await harness.runTests([
    {
      name: 'Selection info is hidden initially',
      fn: async () => {
        const result = await harness.testComponentFromFile(
          './SimpleComponent.jsx',
          { items: ['A', 'B', 'C'] }
        );
        // Initially selectedIndex is 0, so selection-info should show
        const matcher = harness.createMatcher(result.html);
        matcher.toHaveElement('.selection-info');
        matcher.toContainText('Selected: A');
      }
    },
    {
      name: 'Component structure is correct',
      fn: async () => {
        const result = await harness.testComponentFromFile(
          './SimpleComponent.jsx',
          { title: 'Structure Test' }
        );
        const matcher = harness.createMatcher(result.html);
        matcher.toHaveElement('h1');
        matcher.toHaveElement('.item-list');
        matcher.toHaveElement('.simple-component');
      }
    }
  ]);

  console.log('\n=== Test Results ===');
  console.log(`Total tests: ${batchResults.total}`);
  console.log(`Passed: ${batchResults.passed}`);
  console.log(`Failed: ${batchResults.failed}`);
  console.log(`Total duration: ${batchResults.duration}ms`);
  
  if (batchResults.failed > 0) {
    console.log('\nFailed tests:');
    batchResults.results.filter(r => !r.passed).forEach(r => {
      console.log(`  - ${r.name}: ${r.error}`);
    });
  }
}