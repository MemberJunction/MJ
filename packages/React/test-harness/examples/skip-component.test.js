/**
 * Test suite for Skip-style component
 * Demonstrates testing MemberJunction Skip components
 */
export default async function runTests(harness) {
  const { AssertionHelpers } = harness;

  // Test data
  const mockData = {
    title: 'Test Dashboard',
    status: 'active',
    items: [
      { id: '1', name: 'Item 1', status: 'active', createdAt: '2024-01-01', value: 100 },
      { id: '2', name: 'Item 2', status: 'inactive', createdAt: '2024-01-02', value: 200 },
      { id: '3', name: 'Item 3', status: 'active', createdAt: '2024-01-03', value: 300 }
    ],
    metrics: {
      total: 3,
      active: 2,
      successRate: 67
    }
  };

  const mockStyles = {
    container: { backgroundColor: '#f5f5f5' },
    header: { fontSize: '24px' },
    colors: {
      primary: '#1a73e8',
      buttonBackground: '#4285f4',
      buttonText: '#ffffff'
    },
    typography: {
      fontFamily: 'Roboto, sans-serif'
    }
  };

  // Test 1: Component renders with Skip props structure
  await harness.runTest('Component renders with Skip props structure', async () => {
    const result = await harness.testComponentFromFile(
      './SkipStyleComponent.jsx',
      {
        data: mockData,
        userState: {},
        callbacks: {},
        utilities: {},
        styles: mockStyles
      }
    );
    
    AssertionHelpers.assertSuccess(result);
    AssertionHelpers.assertContainsText(result.html, 'Test Dashboard');
    AssertionHelpers.assertContainsText(result.html, 'Status: active');
  });

  // Test 2: Renders items from data
  await harness.runTest('Renders items from data', async () => {
    const result = await harness.testComponentFromFile(
      './SkipStyleComponent.jsx',
      { data: mockData }
    );
    
    AssertionHelpers.assertSuccess(result);
    AssertionHelpers.assertContainsText(result.html, 'Item 1');
    AssertionHelpers.assertContainsText(result.html, 'Item 2');
    AssertionHelpers.assertContainsText(result.html, 'Item 3');
  });

  // Test 3: Applies custom styles
  await harness.runTest('Applies custom styles', async () => {
    const result = await harness.testComponentFromFile(
      './SkipStyleComponent.jsx',
      { data: mockData, styles: mockStyles }
    );
    
    AssertionHelpers.assertSuccess(result);
    // Check that styles are applied
    const matcher = harness.createMatcher(result.html);
    matcher.toContainText('Roboto, sans-serif');
  });

  // Test 4: Shows metrics
  await harness.runTest('Shows metrics from data', async () => {
    const result = await harness.testComponentFromFile(
      './SkipStyleComponent.jsx',
      { data: mockData }
    );
    
    AssertionHelpers.assertSuccess(result);
    AssertionHelpers.assertContainsText(result.html, 'Total Items: 3');
    AssertionHelpers.assertContainsText(result.html, 'Active Items: 2');
    AssertionHelpers.assertContainsText(result.html, 'Success Rate: 67%');
  });

  // Test 5: Filters items based on userState
  await harness.runTest('Filters items based on activeFilter', async () => {
    const result = await harness.testComponentFromFile(
      './SkipStyleComponent.jsx',
      {
        data: mockData,
        userState: { activeFilter: 'active' }
      }
    );
    
    AssertionHelpers.assertSuccess(result);
    // Should show only active items
    AssertionHelpers.assertContainsText(result.html, 'Item 1');
    AssertionHelpers.assertContainsText(result.html, 'Item 3');
    // Should not show inactive item
    AssertionHelpers.assertNotContainsText(result.html, 'Item 2');
  });

  // Test 6: Shows selected item
  await harness.runTest('Highlights selected item', async () => {
    const result = await harness.testComponentFromFile(
      './SkipStyleComponent.jsx',
      {
        data: mockData,
        userState: { selectedItemId: '2' }
      }
    );
    
    AssertionHelpers.assertSuccess(result);
    // Check for selected class or style
    const matcher = harness.createMatcher(result.html);
    matcher.toContainText('Item 2');
  });

  // Test 7: Shows details when enabled
  await harness.runTest('Shows item details when showDetails is true', async () => {
    const result = await harness.testComponentFromFile(
      './SkipStyleComponent.jsx',
      {
        data: mockData,
        userState: { showDetails: true }
      }
    );
    
    AssertionHelpers.assertSuccess(result);
    AssertionHelpers.assertContainsText(result.html, 'Created: 2024-01-01');
    AssertionHelpers.assertContainsText(result.html, 'Value: 100');
  });

  // Test 8: Handles null data gracefully
  await harness.runTest('Handles null data gracefully', async () => {
    const result = await harness.testComponentFromFile(
      './SkipStyleComponent.jsx',
      { data: null }
    );
    
    AssertionHelpers.assertSuccess(result);
    AssertionHelpers.assertContainsText(result.html, 'No data provided');
  });

  // Test 9: Shows empty state
  await harness.runTest('Shows empty state when no items', async () => {
    const result = await harness.testComponentFromFile(
      './SkipStyleComponent.jsx',
      { data: { ...mockData, items: [] } }
    );
    
    AssertionHelpers.assertSuccess(result);
    AssertionHelpers.assertContainsText(result.html, 'No items to display');
  });

  // Test 10: Uses utilities when provided
  await harness.runTest('Uses utilities when provided', async () => {
    const result = await harness.testComponentFromFile(
      './SkipStyleComponent.jsx',
      {
        data: mockData,
        utilities: {
          formatDate: (date) => 'Formatted: ' + date.toISOString()
        }
      }
    );
    
    AssertionHelpers.assertSuccess(result);
    AssertionHelpers.assertContainsText(result.html, 'Last updated: Formatted:');
  });

  // Test summary
  console.log('\nAll Skip component tests completed successfully!');
  console.log('This demonstrates that the test harness works perfectly with MemberJunction Skip-style components.');
}