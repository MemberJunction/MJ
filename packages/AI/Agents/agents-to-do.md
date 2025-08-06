# AI Agents To-Do List

## Overview
This document outlines the next steps for testing and refining the new change-based state management system implemented for the MemberJunction AI Agent framework.

## Immediate Testing Priorities

### 1. Update Loop Agent Type Prompt Template ⚡ HIGH PRIORITY
- [ ] Update the Loop Agent Type system prompt template to include the `AgentPayloadChangeRequest` type definition
- [ ] Modify prompt instructions to clearly explain how to return change requests instead of full payloads
- [ ] Add examples of common change patterns (add, update, delete) in the prompt
- [ ] Test that the LLM correctly understands and follows the new format

### 2. Create Test Agent for State Management 🧪
- [ ] Create a simple test agent that exercises all state change operations
- [ ] Test scenarios:
  - [ ] Adding new properties to empty state
  - [ ] Updating existing properties
  - [ ] Deleting properties with "_DELETE_"
  - [ ] Complex nested object changes
  - [ ] Array manipulations (add, update, delete elements)
  - [ ] Mixed operations in single request
- [ ] Verify state integrity across multiple execution steps

### 3. Test Token Usage Reduction 📊
- [ ] Create a test with large payload (e.g., 5KB of JSON data)
- [ ] Compare token usage:
  - [ ] Old approach: Full payload returned each time
  - [ ] New approach: Only changes returned
- [ ] Document actual token savings percentages
- [ ] Verify cost reduction in real-world scenarios

### 3.5. Implement Payload Feedback Manager 🔄 NEW
- [ ] Create AI Prompt template for payload change feedback
  - [ ] Design prompt that presents suspicious changes and asks for confirmation
  - [ ] Support batching multiple questions in single prompt
  - [ ] Return structured JSON with yes/no answers for each change
- [ ] Implement PayloadFeedbackManager.queryAgent using MJ prompt system
  - [ ] Load feedback prompt from database by ID
  - [ ] Use AIPromptRunner to execute with proper template parameters
  - [ ] Parse structured response and map to PayloadFeedbackResponse[]
- [ ] Integrate feedback loop into BaseAgent workflow
  - [ ] Check PayloadManagerResult.requiresFeedback flag
  - [ ] If true, query agent about suspicious changes
  - [ ] Handle rejected changes (revert, retry, or continue with warning)
- [ ] Test feedback system with common scenarios:
  - [ ] Content truncation (>70% reduction)
  - [ ] Non-empty key removal
  - [ ] Type changes (object→primitive)
  - [ ] Pattern anomalies (placeholder replacements)
- [ ] Configuration and tuning
  - [ ] Make feedback thresholds configurable
  - [ ] Add option to disable feedback for specific agents
  - [ ] Configure batch size for feedback questions

## Integration Testing

### 4. Sub-Agent State Management Testing 🔄
- [ ] Create parent-child agent setup
- [ ] Test upstream path restrictions work correctly with change requests
- [ ] Verify sub-agent changes are properly filtered
- [ ] Test scenarios:
  - [ ] Sub-agent tries to modify unauthorized paths
  - [ ] Sub-agent makes valid changes within allowed paths
  - [ ] Multiple sub-agents modifying different parts of state
- [ ] Verify warning logs for unauthorized changes

### 5. Error Handling and Edge Cases 🚨
- [ ] Test malformed change requests:
  - [ ] Invalid path syntax
  - [ ] Type mismatches
  - [ ] Missing required fields
- [ ] Test LLM truncation scenarios:
  - [ ] Simulate LLM returning "..." in values
  - [ ] Test detection of abbreviated responses
- [ ] Array edge cases:
  - [ ] Empty arrays
  - [ ] Single element arrays
  - [ ] Large arrays (100+ elements)
  - [ ] Nested array structures

### 6. Backwards Compatibility Testing 🔧
- [ ] Ensure existing agents still work if they return full payloads
- [ ] Test migration path for existing agent types
- [ ] Verify no breaking changes for current production agents

## Performance Testing

### 7. Load Testing 🏃
- [ ] Test with large payloads (>100KB)
- [ ] Measure performance of change application
- [ ] Profile memory usage during state mutations
- [ ] Test with deeply nested structures (10+ levels)
- [ ] Concurrent agent execution with shared state

### 8. Real-World Agent Testing 🌍
- [ ] Convert Marketing Agent to use change requests
- [ ] Test complex multi-agent workflows
- [ ] Verify state consistency across agent hierarchy
- [ ] Document any issues or improvements needed

## Documentation and Examples

### 9. Create Example Agents 📚
- [ ] Simple calculator agent (demonstrates basic state updates)
- [ ] Data processing agent (demonstrates array manipulation)
- [ ] Multi-step workflow agent (demonstrates complex state evolution)
- [ ] Error recovery agent (demonstrates state rollback patterns)

### 10. Update Agent Development Guide 📖
- [ ] Add section on state management best practices
- [ ] Include common patterns and anti-patterns
- [ ] Provide troubleshooting guide for state issues
- [ ] Add performance optimization tips

## Tooling and Developer Experience

### 11. Developer Tools 🛠️
- [ ] Create state diff visualizer for debugging
- [ ] Add VS Code snippets for common change patterns
- [ ] Create unit test helpers for state management
- [ ] Build state validation utilities

### 12. Logging and Monitoring 📊
- [ ] Enhance state change logging format
- [ ] Add metrics for:
  - [ ] Average change request size
  - [ ] Most commonly changed paths
  - [ ] Failed change attempts
- [ ] Create dashboard for state management analytics

## Advanced Features (Future)

### 13. State Schema Validation 🔒
- [ ] Define schema for agent payloads
- [ ] Validate change requests against schema
- [ ] Provide helpful error messages for schema violations
- [ ] Auto-generate TypeScript types from schema

### 14. Conflict Resolution 🤝
- [ ] Design conflict resolution for concurrent modifications
- [ ] Implement optimistic locking patterns
- [ ] Create merge strategies for conflicting changes
- [ ] Test with multiple agents modifying same state

### 15. State History and Rollback ⏮️
- [ ] Implement state snapshot capability
- [ ] Create rollback mechanism for failed operations
- [ ] Add time-travel debugging for state changes
- [ ] Build state replay functionality

## Bug Fixes and Refinements

### 16. Known Issues to Address 🐛
- [ ] Improve error messages for invalid change requests
- [ ] Handle edge case: empty objects in arrays (`{}` vs actual empty)
- [ ] Optimize deep clone operations for large payloads
- [ ] Fix any TypeScript strict mode issues

### 17. Code Cleanup 🧹
- [ ] Remove any deprecated payload handling code
- [ ] Update all agent type interfaces consistently
- [ ] Add comprehensive JSDoc comments
- [ ] Ensure consistent error handling patterns

## Testing Checklist

### Unit Tests ✅
- [ ] PayloadManager.applyAgentChangeRequest
- [ ] PayloadManager.applySubAgentChangeRequest
- [ ] Array manipulation edge cases
- [ ] Nested object changes
- [ ] Truncation detection
- [ ] Path validation

### Integration Tests ✅
- [ ] BaseAgent with state changes
- [ ] Sub-agent execution with guardrails
- [ ] Multi-step agent workflows
- [ ] Error recovery scenarios

### End-to-End Tests ✅
- [ ] Complete agent execution with state evolution
- [ ] Multi-agent collaboration scenarios
- [ ] Production-like workloads
- [ ] Performance benchmarks

## Success Criteria

The new state management system will be considered successful when:

1. ✅ All tests pass without breaking existing functionality
2. ✅ Token usage is reduced by >90% for typical agents
3. ✅ No data loss occurs during state mutations
4. ✅ Developer experience is improved (easier to debug, understand)
5. ✅ Performance is equal or better than previous approach
6. ✅ All production agents successfully migrated

## Next Session Priorities

For our next working session, we should focus on:

1. **Update Loop Agent Type prompt template** (most critical)
2. **Create basic test agent** to verify the system works
3. **Test token usage reduction** to validate the main benefit
4. **Fix any immediate issues** discovered during testing

## Notes

- Keep this document updated as we complete tasks
- Add new items as we discover edge cases
- Mark items with ✅ when complete
- Use 🚧 for work in progress
- Use ❌ for items that are blocked or need discussion

---

*Last Updated: 2024-01-16*
*Version: 1.1* - Added Payload Feedback Manager implementation task