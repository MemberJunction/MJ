import { ReactTestHarness } from '@memberjunction/react-test-harness';

async function runExample() {
  // Create test harness with options
  const harness = new ReactTestHarness({
    headless: true,  // Set to false to see the browser
    debug: true,     // Enable debug output
    viewport: { width: 1024, height: 768 }
  });

  try {
    await harness.initialize();
    console.log('Test harness initialized');

    // Example 1: Test inline component
    console.log('\n--- Testing inline component ---');
    const inlineResult = await harness.testComponent(`
      const Component = ({ title, count }) => {
        return (
          <div className="counter">
            <h2>{title}</h2>
            <p>Current count: {count}</p>
            <button onClick={() => console.log('Button clicked!')}>
              Click me
            </button>
          </div>
        );
      };
    `, { title: 'My Counter', count: 42 });

    console.log('Render success:', inlineResult.success);
    console.log('Has button:', harness.getAssertionHelpers().hasElement(inlineResult.html, 'button'));
    
    // Example 2: Test with assertions
    console.log('\n--- Running assertions ---');
    await harness.runTest('Counter displays correct values', async () => {
      const result = await harness.testComponent(`
        const Component = ({ value }) => <div>Value: {value}</div>;
      `, { value: 100 });

      const { AssertionHelpers } = harness;
      AssertionHelpers.assertSuccess(result);
      AssertionHelpers.assertContainsText(result.html, 'Value: 100');
    });

    // Example 3: Test multiple scenarios
    console.log('\n--- Running multiple tests ---');
    const testResults = await harness.runTests([
      {
        name: 'Component renders without props',
        fn: async () => {
          const result = await harness.testComponent(`
            const Component = () => <div>Hello World</div>;
          `);
          harness.getAssertionHelpers().assertSuccess(result);
        }
      },
      {
        name: 'Component handles arrays',
        fn: async () => {
          const result = await harness.testComponent(`
            const Component = ({ items }) => (
              <ul>
                {items.map((item, i) => <li key={i}>{item}</li>)}
              </ul>
            );
          `, { items: ['A', 'B', 'C'] });
          
          const matcher = harness.createMatcher(result.html);
          matcher.toHaveElementCount('li', 3);
        }
      },
      {
        name: 'Component handles conditional rendering',
        fn: async () => {
          const result = await harness.testComponent(`
            const Component = ({ show }) => (
              <div>
                {show && <p className="conditional">Visible!</p>}
              </div>
            );
          `, { show: true });
          
          const matcher = harness.createMatcher(result.html);
          matcher.toHaveElement('.conditional');
        }
      }
    ]);

    console.log('\nTest Summary:');
    console.log(`- Total: ${testResults.total}`);
    console.log(`- Passed: ${testResults.passed}`);
    console.log(`- Failed: ${testResults.failed}`);
    console.log(`- Duration: ${testResults.duration}ms`);

    // Example 4: Take a screenshot
    console.log('\n--- Taking screenshot ---');
    await harness.testComponent(`
      const Component = () => (
        <div style={{padding: '20px', background: '#f0f0f0'}}>
          <h1 style={{color: '#333'}}>Screenshot Example</h1>
          <p>This component will be captured as a screenshot.</p>
        </div>
      );
    `);
    
    const screenshot = await harness.screenshot('./example-screenshot.png');
    console.log('Screenshot saved!');

  } catch (error) {
    console.error('Error during test execution:', error);
  } finally {
    // Always close the harness to free resources
    await harness.close();
    console.log('\nTest harness closed');
  }
}

// Run the example
runExample().catch(console.error);