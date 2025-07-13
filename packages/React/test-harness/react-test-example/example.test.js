// Example test using ReactTestHarness
export default async function runTests(harness) {
  const { AssertionHelpers } = harness;

  // Test 1: Basic rendering
  await harness.runTest('Component renders with default props', async () => {
    const result = await harness.testComponentFromFile(
      './ExampleComponent.jsx'
    );
    
    AssertionHelpers.assertSuccess(result);
    AssertionHelpers.assertContainsText(result.html, 'Hello, World!');
    AssertionHelpers.assertContainsText(result.html, 'Count: 0');
  });

  // Test 2: Rendering with custom props
  await harness.runTest('Component renders with custom props', async () => {
    const result = await harness.testComponentFromFile(
      './ExampleComponent.jsx',
      { name: 'MemberJunction', count: 42, showDetails: true }
    );
    
    AssertionHelpers.assertSuccess(result);
    AssertionHelpers.assertContainsText(result.html, 'Hello, MemberJunction!');
    AssertionHelpers.assertContainsText(result.html, 'Count: 42');
    AssertionHelpers.assertHasElement(result.html, '.details');
  });

  // Test 3: Check for button element
  await harness.runTest('Component has clickable button', async () => {
    const result = await harness.testComponentFromFile(
      './ExampleComponent.jsx'
    );
    
    const matcher = harness.createMatcher(result.html);
    matcher.toHaveElement('button');
    matcher.toContainText('Clicked 0 times');
  });

  // Get test summary
  const summary = await harness.runTests([
    {
      name: 'No console errors',
      fn: async () => {
        const result = await harness.testComponentFromFile('./ExampleComponent.jsx');
        AssertionHelpers.assertNoConsoleErrors(result.console);
      }
    }
  ]);

  console.log(`\nTest Summary: ${summary.passed}/${summary.total} passed`);
}