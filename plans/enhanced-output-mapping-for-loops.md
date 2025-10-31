# Enhanced Output Mapping for Loops and Sub-Agents

## Overview

This plan outlines enhancements to the MemberJunction AI Agent framework to support advanced output mapping patterns, particularly for ForEach and While loops, as well as both child and related sub-agents. The goal is to provide flexible, configurable ways to accumulate and structure outputs from iterative agent executions.

## Current Limitations

### ForEach/While Loop Issues
- **Overwrite Problem**: Each iteration overwrites the same output path instead of accumulating results
- **No Array Support**: No built-in mechanism to create arrays of results
- **Fixed Structure**: Cannot dynamically create indexed or named output structures

### Sub-Agent Output Mapping Issues
- **Static Mapping**: Output mappings are fixed and cannot adapt to runtime context
- **No Loop Awareness**: Sub-agents don't know they're running in a loop context
- **Limited Flexibility**: Cannot use iteration-specific variables in output paths

## Proposed Enhancements

### 1. Loop Configuration Extensions

#### New Configuration Properties
```json
{
  "collectionPath": "typeformResponses",
  "itemVariable": "response",
  "indexVariable": "index",
  "outputMapPrefix": "results.",
  "outputMapSuffix": "[{index}]",
  "outputMapTemplate": "processedSubmissions[{index}].{itemVariable}",
  "maxIterations": 1000,
  "continueOnError": true,
  "executionMode": "sequential"
}
```

#### Configuration Property Definitions
- **`outputMapPrefix`**: String prepended to all output paths
- **`outputMapSuffix`**: String appended to all output paths with template variable support
- **`outputMapTemplate`**: Complete template for output paths (overrides prefix/suffix)

#### Template Variables
- `{index}`: Current iteration index (0-based)
- `{index1}`: Current iteration index (1-based)
- `{itemVariable}`: Value of the itemVariable (e.g., "response")
- `{item}`: Actual current item being processed
- `{timestamp}`: Current timestamp
- `{guid}`: Generated unique identifier

### 2. Dynamic Output Mapping for Sub-Agents

#### Child Sub-Agents (ParentID Relationship)
- **Inherit Loop Context**: Child agents automatically receive loop context
- **Dynamic Path Resolution**: Output paths resolved at runtime with template variables
- **Payload Accumulation**: Results automatically accumulated in parent payload

#### Related Sub-Agents (AgentRelationships)
- **Context-Aware Mapping**: `SubAgentOutputMapping` supports template variables
- **Loop-Specific Overrides**: Temporary mapping overrides during loop execution
- **Flexible Targeting**: Can target different paths based on iteration context

### 3. Enhanced Mapping Syntax

#### Array Accumulation Syntax
```json
"SubAgentOutputMapping": {
  "*": "processedSubmissions[]"
}
```
- Automatically creates array if target doesn't exist
- Appends each iteration result to array

#### Indexed Object Syntax
```json
"SubAgentOutputMapping": {
  "*": "processedSubmissions[{index}]"
}
```
- Creates indexed object structure
- Supports template variables in path

#### Template-Based Syntax
```json
"SubAgentOutputMapping": {
  "submissionId": "submissions[{index}].id",
  "speakers": "submissions[{index}].speakers",
  "summary": "submissions[{index}].summary"
}
```
- Fine-grained control over individual field mapping
- Template variables in both source and target paths

### 4. Implementation Strategy

#### Phase 1: Core Infrastructure
1. **Extend Interface Definitions**
   - Update `ForEachOperation` and `WhileOperation` interfaces
   - Add new configuration properties
   - Define template variable system

2. **Template Engine Integration**
   - Create template variable resolver
   - Support for basic variable substitution
   - Error handling for invalid templates

#### Phase 2: Loop Execution Enhancements
1. **ForEach Loop Modifications**
   - Dynamic output mapping resolution
   - Array/object structure creation
   - Backward compatibility preservation

2. **While Loop Modifications**
   - Similar enhancements to ForEach
   - Iteration counting support
   - Conditional output mapping

#### Phase 3: Sub-Agent Integration
1. **Child Sub-Agent Enhancements**
   - Loop context propagation
   - Dynamic mapping application
   - Payload inheritance improvements

2. **Related Sub-Agent Enhancements**
   - Runtime mapping overrides
   - Temporary mapping restoration
   - Context path handling

#### Phase 4: Advanced Features
1. **Conditional Mapping**
   - Conditional output paths based on item properties
   - Error handling mapping
   - Success/failure path separation

2. **Transformation Functions**
   - Built-in transformation functions
   - Custom transformation support
   - Data validation and sanitization

### 5. Use Cases and Examples

#### Event Abstract Submission Demo
```json
{
  "StepType": "ForEach",
  "LoopBodyType": "Sub-Agent",
  "Configuration": {
    "collectionPath": "typeformResponses",
    "itemVariable": "response",
    "indexVariable": "index",
    "outputMapTemplate": "processedSubmissions[{index}]"
  },
  "SubAgentOutputMapping": {
    "*": "processedSubmissions[{index}]"
  }
}
```

**Result:**
```json
{
  "processedSubmissions": [
    { "submissionId": "123", "speakers": [...] },
    { "submissionId": "124", "speakers": [...] },
    { "submissionId": "125", "speakers": [...] }
  ]
}
```

#### Data Processing Pipeline
```json
{
  "StepType": "ForEach",
  "Configuration": {
    "collectionPath": "dataFiles",
    "outputMapPrefix": "processingResults.",
    "outputMapSuffix": "_{timestamp}"
  },
  "ActionOutputMapping": {
    "processedData": "processingResults.{item}_{timestamp}",
    "metadata": "processingResults.{item}_{timestamp}_meta"
  }
}
```

#### Batch Record Creation
```json
{
  "StepType": "ForEach",
  "Configuration": {
    "collectionPath": "newRecords",
    "outputMapTemplate": "createdRecords[{index}]"
  },
  "SubAgentOutputMapping": {
    "recordId": "createdRecords[{index}].id",
    "status": "createdRecords[{index}].creationStatus"
  }
}
```

### 6. Backward Compatibility

#### Preservation Strategy
- **Default Behavior**: Existing configurations work unchanged
- **Opt-In Features**: New features only activated with new configuration
- **Graceful Degradation**: Invalid templates fall back to original behavior

#### Migration Path
- **Automatic Detection**: Detect when new features would be beneficial
- **Configuration Upgrades**: Provide upgrade suggestions
- **Documentation**: Clear migration guides

### 7. Testing Strategy

#### Unit Tests
- Template variable resolution
- Array/object creation logic
- Backward compatibility verification

#### Integration Tests
- ForEach/While loop scenarios
- Child/related sub-agent interactions
- Complex mapping configurations

#### Performance Tests
- Large iteration counts
- Complex template processing
- Memory usage optimization

### 8. Documentation Requirements

#### Developer Documentation
- Configuration reference
- Template variable guide
- Migration instructions

#### User Documentation
- Use case examples
- Best practices
- Troubleshooting guide

## Implementation Timeline

### Phase 1: 2-3 weeks
- Interface definitions
- Template engine
- Basic ForEach support

### Phase 2: 2-3 weeks
- Complete ForEach/While implementation
- Child sub-agent integration
- Testing framework

### Phase 3: 2-3 weeks
- Related sub-agent integration
- Advanced features
- Documentation

### Phase 4: 1-2 weeks
- Performance optimization
- Final testing
- Release preparation

## Success Criteria

1. **Functional**: All use cases work as expected
2. **Compatible**: No breaking changes to existing configurations
3. **Performant**: No significant performance degradation
4. **Usable**: Clear documentation and examples
5. **Extensible**: Foundation for future enhancements

## Risks and Mitigations

### Technical Risks
- **Complexity**: Risk of over-engineering
  - *Mitigation*: Start with core features, iterate based on feedback
- **Performance**: Template processing overhead
  - *Mitigation*: Efficient template caching and optimization

### Adoption Risks
- **Learning Curve**: New configuration complexity
  - *Mitigation*: Comprehensive documentation and examples
- **Migration**: Existing user reluctance to migrate
  - *Mitigation*: Clear benefits and migration tools

## Conclusion

This enhancement will significantly improve the flexibility and power of the MemberJunction AI Agent framework, particularly for data processing and batch operation scenarios. The phased approach ensures manageable development while maintaining backward compatibility and providing immediate value to users.
