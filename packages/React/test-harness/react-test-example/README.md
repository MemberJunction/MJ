# React Test Example

This directory contains example React components and tests demonstrating how to test components with the MemberJunction React Test Harness, including Skip-style components.

## Examples

### 1. Basic Example Component
- **File**: `ExampleComponent.jsx`
- **Test**: `example.test.js` (uses harness API)
- A simple component with state, props, and click interactions

### 2. Skip-Style Component
- **File**: `examples/SkipStyleComponent.jsx`
- **Test**: `examples/skip-component.test.js` (uses Jest/React Testing Library)
- A complex component following the MemberJunction Skip component pattern

## Skip Component Props Structure

Skip components in MemberJunction follow a standard props structure:

```javascript
{
  data: {           // Component data
    title: string,
    description: string,
    items: Array,
    summary: string
  },
  userState: {      // User-controlled state
    viewMode: 'list' | 'grid',
    activeFilter: string
  },
  callbacks: {      // Callback functions
    RefreshData: async () => void,
    UpdateUserState: (newState) => void
  },
  utilities: {      // Utility functions
    logEvent: (event) => void,
    formatDate: (date) => string
  },
  styles: {         // Custom styles
    container: object,
    header: object,
    button: object,
    item: object
  }
}
```

## Running Tests

```bash
# Install dependencies
npm install

# Run all tests
npm test

# Run specific test file
npm test examples/skip-component.test.js

# Run tests in watch mode
npm test -- --watch

# Run tests with coverage
npm test -- --coverage
```

## Test Features Demonstrated

### Skip Component Test Coverage

1. **Data Rendering**
   - Renders title and description from data prop
   - Displays all items with filtering
   - Shows summary section
   - Handles empty states

2. **Callbacks**
   - RefreshData callback invocation
   - UpdateUserState for view mode changes
   - Filter updates through callbacks
   - Error handling for failed operations

3. **Styles**
   - Custom style application
   - Dynamic layout (grid/list)
   - Active state styling

4. **State Management**
   - Responds to userState changes
   - Maintains filter on data updates
   - Handles state transitions

5. **Edge Cases**
   - Null/undefined data handling
   - Missing callbacks/utilities
   - Items without IDs
   - Loading states

## Key Testing Patterns

### 1. Testing Data Flow
```javascript
const propsWithFilter = {
  ...defaultProps,
  userState: { ...mockUserState, activeFilter: 'category1' }
};
render(<SkipStyleComponent {...propsWithFilter} />);
// Verify filtered results
```

### 2. Testing Callbacks
```javascript
fireEvent.click(screen.getByTestId('refresh-button'));
await waitFor(() => {
  expect(mockCallbacks.RefreshData).toHaveBeenCalledTimes(1);
});
```

### 3. Testing Style Application
```javascript
const container = screen.getByTestId('skip-component');
expect(container).toHaveStyle({ backgroundColor: '#f0f0f0' });
```

### 4. Testing State Updates
```javascript
const { rerender } = render(<SkipStyleComponent {...defaultProps} />);
rerender(<SkipStyleComponent {...updatedProps} />);
// Verify UI reflects new state
```

## Best Practices

1. **Mock All External Dependencies**: Create comprehensive mocks for data, callbacks, utilities, and styles
2. **Test User Interactions**: Simulate clicks, filters, and state changes
3. **Verify Visual States**: Test loading, error, and empty states
4. **Check Edge Cases**: Test with missing or malformed data
5. **Ensure Accessibility**: Use data-testid attributes for reliable element selection

## Integration with MemberJunction

This example demonstrates how to test components that will be used in the MemberJunction Skip system:
- Components receive standardized props
- Callbacks integrate with MJ's data layer
- Styles allow for theme customization
- State management follows MJ patterns

The test harness ensures these components work correctly before integration into the larger MemberJunction ecosystem.