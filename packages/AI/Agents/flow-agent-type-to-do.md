# Flow Agent Type - TODO List

This document tracks remaining features and enhancements needed for the Flow Agent Type implementation.

## High Priority

### 1. Prompt Steps in Flow
Currently, prompt steps are marked with a 'Retry' step and `flowPromptStepId`, but the full implementation needs:
- Proper handling of the prompt execution within the flow context
- Ability to use prompt results to make branching decisions
- Support for different prompt types (decision prompts, data gathering prompts, etc.)
- Integration with the flow state to track prompt results

### 2. Action Parameter Mapping Enhancement
While `ActionInputMapping` is implemented, we need to enhance:
- Support for complex parameter types (arrays, objects)
- Parameter validation before action execution
- Better error handling for missing or invalid parameters
- Support for dynamic parameter values from flow context

## Medium Priority

### 3. Parallel Step Execution
Support for executing multiple steps in parallel:
- Multiple starting steps that can run concurrently
- Fork/join patterns in the flow
- Proper state management for parallel execution paths
- Result aggregation from parallel branches
- Error handling strategies (fail-fast vs. wait-for-all)

### 4. Multiple Action Output Mapping
Current limitation: "Flow agent action output mapping currently only supports single action steps"
- Support mapping outputs from multiple actions executed in sequence
- Aggregate results from multiple actions
- Support for array/collection outputs
- Conflict resolution when multiple actions write to same payload path

### 5. Advanced Path Conditions
Enhance the path condition evaluation:
- Support for more complex boolean expressions
- Access to historical step results (not just the last one)
- Time-based conditions
- External data source conditions

## Low Priority

### 6. Flow Visualization Enhancements
- Real-time execution tracking in the diagram
- Visual indicators for completed/active/pending steps
- Path condition visualization
- Execution history overlay

### 7. Flow Templates
- Ability to save flow patterns as reusable templates
- Template parameters for customization
- Template composition (flows within flows)

### 8. Debugging and Monitoring
- Step-by-step debugging mode
- Breakpoints on specific steps
- Payload inspection at each step
- Performance metrics per step

### 9. Error Recovery
- Retry strategies for failed steps
- Compensation/rollback flows
- Error handling paths
- Circuit breaker patterns

### 10. Dynamic Flow Modification
- Ability to modify flow during execution based on conditions
- Dynamic step injection
- Conditional step skipping
- Runtime flow optimization

## Technical Debt

### 11. Type Safety Improvements
- Stronger typing for ActionInputMapping and ActionOutputMapping
- Type-safe payload transformations
- Compile-time validation of flow configurations

### 12. Performance Optimizations
- Lazy loading of step configurations
- Caching of frequently used flows
- Optimized path evaluation
- Reduced memory footprint for long-running flows

## Notes

- The current implementation provides a solid foundation for deterministic workflow execution
- Priority should be given to prompt step implementation as it enables more complex decision flows
- Parallel execution would significantly enhance the capability for complex workflows
- Consider implementing a Flow Builder UI for visual flow creation