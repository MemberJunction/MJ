# React Component Registry Test Guide

## Overview
A temporary test button has been added to the Skip Chat component to test the new React Component Registry architecture.

## How to Use

1. **Start the Application**
   - Run your Angular application that includes the skip-chat component
   - Navigate to a conversation view where the skip-chat component is displayed

2. **Find the Test Button**
   - Look for a red button with a flask icon (🧪) in the button area
   - It appears after the sharing button

3. **Click the Test Button**
   - A dialog will open showing the React Component Registry Test
   - The console will show:
     - Unit test results for the GlobalComponentRegistry
     - Component registration logs
     - React component initialization status

4. **Test the Components**
   - Use the dropdown to switch between test components:
     - **SearchBox**: A text input with state management
     - **OrderList**: A paginated list with sorting
     - **CategoryChart**: A bar chart using Chart.js
   - All components demonstrate:
     - State management integration
     - Event handling
     - Style system usage
     - Registry-based component resolution

## What's Being Tested

1. **GlobalComponentRegistry**
   - Singleton pattern using BaseSingleton
   - Component registration with metadata
   - Fallback resolution (exact → context → global → name-only)
   - Unit tests for all registry operations

2. **Component Architecture**
   - Parent component receives child components via `components` prop
   - Child components accessed via destructuring
   - No direct registry access in generated components
   - Clean separation of concerns

3. **React Host Integration**
   - Dynamic React component loading
   - CDN library management
   - Error boundary handling
   - Angular-React state synchronization

## Console Output

Check the browser console for:
- Test results summary (e.g., "12 passed, 0 failed")
- Registered component keys
- State update logs
- Event notifications

## Cleanup

The test button and related code are temporary. Once testing is complete:
1. Remove the test button from the HTML template
2. Remove the `testButtonClick()` method
3. Remove the test-related imports

## Next Steps

After successful testing, the architecture can be used for:
- Real Skip report components
- Shared component libraries
- Dynamic component composition
- Component versioning and evolution