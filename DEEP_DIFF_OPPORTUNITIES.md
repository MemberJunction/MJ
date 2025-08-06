# Deep Diff Component Opportunities

This document tracks opportunities to use the Deep Diff component (`@memberjunction/ng-deep-diff`) across the MemberJunction platform to visualize before/after states and data transformations.

## ✅ Implemented

1. **AI Agent Run Form** - Payload Diff
   - Location: `packages/Angular/Explorer/core-entity-forms/src/lib/custom/ai-agent-run/`
   - Shows: `StartingPayload` → `FinalPayload`
   - Use case: Visualize overall agent execution payload changes

2. **AI Agent Run Timeline** - Step Payload Diff
   - Location: `packages/Angular/Explorer/core-entity-forms/src/lib/custom/ai-agent-run/`
   - Shows: `PayloadAtStart` → `PayloadAtEnd` for each step
   - Use case: Debug individual step transformations in agent runs

## 🎯 High Priority Opportunities

### 1. AI Agent Run Steps - Data Transformation
- **Entity**: `AIAgentRunStepEntity`
- **Fields**: `InputData` → `OutputData`
- **Use case**: Show how step input was transformed to output
- **Implementation**: Add to step details view alongside payload diff

### 2. AI Agent Requests - Request/Response Comparison
- **Entity**: `AIAgentRequestEntity`
- **Fields**: `Request` → `Response`
- **Use case**: Compare what agent asked for vs what it received
- **Implementation**: Add to AI Agent Request form view

### 3. AI Prompt Runs - Model Failover Tracking
- **Entity**: `AIPromptRunEntity`  
- **Fields**: Compare runs with `OriginalModelID` vs `ModelID`
- **Use case**: Debug differences when failover occurs
- **Implementation**: Add comparison view when models differ

## 📊 Medium Priority Opportunities

### 4. Action Execution Logs - Input/Output Diff
- **Entity**: `ActionExecutionLogEntity`
- **Fields**: `Params` → `Message` (output)
- **Use case**: Debug action transformations
- **Implementation**: Add to Action Execution Log form

### 5. Template Content Versions
- **Entity**: `TemplateContentEntity` (with version tracking)
- **Use case**: Compare template versions when editing
- **Implementation**: Add "Compare Versions" button in template editor

### 6. Configuration Changes
- **Entities**: Any entity with JSON configuration fields
- **Examples**: Dashboards, Reports, Query Builders
- **Use case**: Review configuration changes before saving
- **Implementation**: Add preview diff before save operations

## 🔮 Future Opportunities

### 7. Data Context Evolution
- **Context**: Workflow execution contexts
- **Use case**: Track how data context changes through workflow steps
- **Implementation**: Add timeline view with diffs between steps

### 8. Migration Preview
- **Context**: Database migrations, data transformations
- **Use case**: Preview changes before applying migrations
- **Implementation**: Add diff view to migration tools

### 9. API Request/Response Debugging
- **Context**: External API integrations
- **Use case**: Debug API transformations and mappings
- **Implementation**: Add to API debugging tools

### 10. Form Data Changes
- **Context**: Complex form submissions
- **Use case**: Review changes before submitting forms
- **Implementation**: Add "Review Changes" step to multi-step forms

## 💡 Implementation Guidelines

### Quick Integration Pattern
```typescript
// 1. Import the module
import { DeepDiffModule } from '@memberjunction/ng-deep-diff';

// 2. Add to component template
<mj-deep-diff
  [oldValue]="originalData"
  [newValue]="modifiedData"
  [title]="'Data Changes'"
  [showSummary]="true"
  [expandAll]="false">
</mj-deep-diff>

// 3. For dialogs
<mj-deep-diff-dialog
  [(visible)]="showDiffDialog"
  [oldValue]="originalData"
  [newValue]="modifiedData"
  [title]="'Review Changes'">
</mj-deep-diff-dialog>
```

### Best Practices
1. Parse JSON strings to objects before passing to component
2. Use `showUnchanged="false"` for cleaner views
3. Adjust `maxDepth` based on data complexity
4. Consider `expandAll` for small diffs, avoid for large ones
5. Use the dialog component for user-triggered comparisons

## 📝 Notes

- The Deep Diff component is designed to be generic and reusable
- It handles complex nested objects, arrays, and primitives
- Performance is optimized for large objects with configurable depth limits
- The UI provides filtering and search capabilities for better usability
- Consider adding deep diff wherever users need to understand "what changed"