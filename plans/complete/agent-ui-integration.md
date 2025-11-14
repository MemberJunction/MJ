# Agent UI Integration - Response Forms & Commands

**Date:** 2025-11-03
**Status:** Implementation
**Branch:** `claude/study-agent-framework-011CUkyixvnUcdT9oHLPP7WR`

## Executive Summary

This plan details the implementation of enhanced UI integration for MemberJunction agents, enabling rich user interactions through response forms and UI commands. This replaces the simple `suggestedResponses` pattern with a comprehensive, type-safe system for collecting user input and providing actionable next steps.

## Problem Statement

Currently, agents have limited UI interaction capabilities:
- Simple suggested responses (not widely adopted yet)
- No structured way to collect complex user input
- No mechanism to provide navigation/actions after completing work
- No way to trigger UI refreshes after system modifications

## Goals

1. **Rich User Input Collection**: Enable agents to request structured information via forms with various input types
2. **Smart UI Rendering**: Automatically render simple choices as buttons, complex forms as full forms
3. **Actionable Commands**: Allow agents to provide navigation to created/modified resources
4. **Automatic UI Updates**: Enable agents to trigger cache refreshes and notifications
5. **Type Safety**: Full TypeScript support throughout
6. **Backward Compatibility**: Clean implementation without legacy baggage (since suggestedResponses is new)

## Architecture

### Design Principles

1. **Semantic Intent Over Implementation**: Agents describe *what* they need, UI decides *how* to render
2. **Progressive Enhancement**: Simple cases (single button choice) render simply, complex cases get full form UI
3. **Type Safety First**: Full TypeScript generics and union types
4. **UI Agnostic Framework**: Core framework has no Angular dependencies
5. **Extensible**: Easy to add new question types and command types

### Component Layers

```
┌─────────────────────────────────────────────────────────────┐
│ Angular UI Layer (packages/Angular/Generic/Conversations)  │
│ - Smart form renderer                                       │
│ - Command handler service                                   │
│ - Conversation component integration                        │
└─────────────────────────────────────────────────────────────┘
                              ↑
                              │ Uses types from
                              │
┌─────────────────────────────────────────────────────────────┐
│ AI Core Plus (packages/AI/CorePlus)                        │
│ - Type definitions (response-forms.ts, ui-commands.ts)     │
│ - ExecuteAgentResult interface extensions                  │
│ - BaseAgentNextStep interface extensions                   │
└─────────────────────────────────────────────────────────────┘
                              ↑
                              │ Used by
                              │
┌─────────────────────────────────────────────────────────────┐
│ AI Agents Framework (packages/AI/Agents)                   │
│ - LoopAgentType parses new response fields                 │
│ - FlowAgentType support (if needed)                        │
│ - BaseAgent propagates commands through result             │
└─────────────────────────────────────────────────────────────┘
                              ↑
                              │ Configured by
                              │
┌─────────────────────────────────────────────────────────────┐
│ Prompt Templates (metadata/prompts/templates)              │
│ - Loop agent system prompt examples                        │
│ - Sage agent examples                                      │
│ - Agent Manager examples                                   │
└─────────────────────────────────────────────────────────────┘
```

## Detailed Design

### 1. Response Forms

**Purpose**: Collect structured user input with various question types

**Types:**
- `text`, `textarea`, `email` - Text input
- `number`, `currency` - Numeric input with formatting
- `date`, `datetime` - Date/time pickers
- `buttongroup`, `radio`, `dropdown`, `checkbox` - Choice selection

**Smart Rendering:**
- Single question + buttongroup/radio + no title → Render as simple buttons (like old suggestedResponses)
- Everything else → Render as full form with title, validation, submit button

**Example - Simple Choice:**
```json
{
  "responseForm": {
    "questions": [
      {
        "id": "choice",
        "label": "Which customer?",
        "type": {
          "type": "buttongroup",
          "options": [
            { "value": "cust-123", "label": "Acme Corp" },
            { "value": "cust-456", "label": "Acme Industries" }
          ]
        }
      }
    ]
  }
}
```

**Example - Full Form:**
```json
{
  "responseForm": {
    "title": "New Customer",
    "submitLabel": "Create Customer",
    "questions": [
      {
        "id": "name",
        "label": "Company Name",
        "type": { "type": "text", "placeholder": "Acme Corp" },
        "required": true
      },
      {
        "id": "industry",
        "label": "Industry",
        "type": {
          "type": "dropdown",
          "options": [
            { "value": "tech", "label": "Technology" },
            { "value": "finance", "label": "Finance" }
          ]
        },
        "required": true
      },
      {
        "id": "revenue",
        "label": "Annual Revenue",
        "type": { "type": "currency", "prefix": "$" },
        "required": false,
        "helpText": "Estimated annual revenue in USD"
      }
    ]
  }
}
```

### 2. Actionable Commands

**Purpose**: Provide user-clickable actions to navigate to created/modified resources

**Command Types:**

#### OpenResourceCommand
```typescript
{
  type: 'open:resource';
  label: string;
  icon?: string;
  resourceType: 'Record' | 'Dashboard' | 'Report' | 'Form' | 'View';
  resourceId: string;
  mode?: 'view' | 'edit';
  parameters?: Record<string, any>;
}
```

**Example:**
```json
{
  "type": "open:resource",
  "label": "Open Customer Record",
  "icon": "fa-user",
  "resourceType": "Record",
  "resourceId": "abc-123",
  "mode": "view"
}
```

#### OpenURLCommand
```typescript
{
  type: 'open:url';
  label: string;
  icon?: string;
  url: string;
  newTab?: boolean;
}
```

**Example:**
```json
{
  "type": "open:url",
  "label": "Visit Company Website",
  "icon": "fa-external-link",
  "url": "https://example.com",
  "newTab": true
}
```

### 3. Automatic Commands

**Purpose**: Execute UI updates immediately without user interaction

**Command Types:**

#### RefreshDataCommand
```typescript
{
  type: 'refresh:data';
  scope: 'entity' | 'cache';
  entityNames?: string[];
  cacheName?: 'Core' | 'AI' | 'Actions';
}
```

**Examples:**
```json
// Refresh entities
{
  "type": "refresh:data",
  "scope": "entity",
  "entityNames": ["Customers", "Contacts"]
}

// Refresh cache
{
  "type": "refresh:data",
  "scope": "cache",
  "cacheName": "AI"
}
```

#### ShowNotificationCommand
```typescript
{
  type: 'notification';
  message: string;
  severity?: 'success' | 'info' | 'warning' | 'error';
  duration?: number;
}
```

**Example:**
```json
{
  "type": "notification",
  "message": "Customer 'Acme Corp' created successfully",
  "severity": "success",
  "duration": 3000
}
```

### 4. Integration Points

#### ExecuteAgentResult Extension
```typescript
interface ExecuteAgentResult<R = any> {
  // ... existing fields ...
  responseForm?: AgentResponseForm;
  actionableCommands?: ActionableCommand[];
  automaticCommands?: AutomaticCommand[];
}
```

#### BaseAgentNextStep Extension
```typescript
interface BaseAgentNextStep<P = any> {
  // ... existing fields ...
  responseForm?: AgentResponseForm;
  actionableCommands?: ActionableCommand[];
  automaticCommands?: AutomaticCommand[];
}
```

#### LoopAgentResponse Extension
```typescript
interface LoopAgentResponse {
  taskComplete: boolean;
  reasoning?: string;
  message?: string;
  nextStep?: NextStepDefinition;
  payloadChangeRequest?: AgentPayloadChangeRequest;

  // NEW
  responseForm?: AgentResponseForm;
  actionableCommands?: ActionableCommand[];
  automaticCommands?: AutomaticCommand[];
}
```

## Implementation Plan

### Phase 1: Type Definitions (Core Framework)

**Location:** `packages/AI/CorePlus/src/generic/`

**Files to Create:**
1. `response-forms.ts` - Form and question type definitions
2. `ui-commands.ts` - Command type definitions

**Files to Modify:**
1. `types.ts` - Add exports, extend ExecuteAgentResult and BaseAgentNextStep
2. `index.ts` - Export new modules

**Deliverables:**
- Complete TypeScript interfaces with JSDoc comments
- Union types for extensibility
- All types exported from package

### Phase 2: Agent Framework Integration

**Location:** `packages/AI/Agents/src/`

**Files to Modify:**
1. `agent-types/loop-agent-type.ts` - Parse responseForm, actionableCommands, automaticCommands from prompt results
2. `base-agent.ts` - Propagate commands from steps to final ExecuteAgentResult
3. `agent-types/flow-agent-type.ts` - Support if needed (likely minimal)

**Deliverables:**
- LoopAgentType correctly parses new fields from AI responses
- BaseAgent includes commands in return value
- Compilation succeeds with no TypeScript errors

### Phase 3: Angular UI Components

**Location:** `packages/Angular/Generic/Conversations/src/lib/`

**Files to Create:**
1. `components/agent-response-form/agent-response-form.component.ts` - Full form renderer
2. `components/agent-response-form/agent-response-form.component.html`
3. `components/agent-response-form/agent-response-form.component.scss`
4. `components/simple-response-buttons/simple-response-buttons.component.ts` - Simple button renderer
5. `components/simple-response-buttons/simple-response-buttons.component.html`
6. `components/simple-response-buttons/simple-response-buttons.component.scss`
7. `components/actionable-commands/actionable-commands.component.ts` - Command button list
8. `components/actionable-commands/actionable-commands.component.html`
9. `components/actionable-commands/actionable-commands.component.scss`
10. `services/ui-command-handler.service.ts` - Command execution service

**Files to Modify:**
1. `conversation-view.component.ts` - Integrate new components
2. `conversation-view.component.html` - Add component templates
3. `conversation-view.component.scss` - Styling
4. Module declarations and exports

**Deliverables:**
- Fully functional form rendering with validation
- Smart detection of simple vs. full form
- Command buttons with proper icons
- Command handler service that executes all command types
- Proper integration with existing conversation flow

### Phase 4: Prompt Template Updates

**Location:** `metadata/prompts/templates/`

**Files to Modify:**
1. `system/loop-agent-type-system-prompt.template.md` - Add comprehensive examples
2. `sage/sage.template.md` - Add Sage-specific examples
3. `agent-manager/agent-manager.template.md` - Add Agent Manager examples

**Deliverables:**
- Clear documentation of response format
- Multiple examples for different scenarios
- Examples for simple and complex forms
- Examples for all command types
- Best practices guidance

### Phase 5: Testing & Validation

**Actions:**
1. Build all affected packages
2. Test with existing agents (Sage, Agent Manager)
3. Verify backward compatibility
4. Test all form question types
5. Test all command types
6. Test smart rendering logic

**Deliverables:**
- All packages compile without errors
- Manual testing confirms functionality
- No regressions in existing agent behavior

## Task List

### ✅ Phase 1: Type Definitions (Core Framework)

- [ ] 1.1 Create `packages/AI/CorePlus/src/generic/response-forms.ts`
  - [ ] Define `AgentResponseForm` interface
  - [ ] Define `FormQuestion` interface
  - [ ] Define all question type interfaces (`TextQuestionType`, `NumberQuestionType`, etc.)
  - [ ] Define `FormOption` interface
  - [ ] Add comprehensive JSDoc comments

- [ ] 1.2 Create `packages/AI/CorePlus/src/generic/ui-commands.ts`
  - [ ] Define `ActionableCommand` union type
  - [ ] Define `OpenResourceCommand` interface with `ResourceType`
  - [ ] Define `OpenURLCommand` interface
  - [ ] Define `AutomaticCommand` union type
  - [ ] Define `RefreshDataCommand` interface with `CacheName`
  - [ ] Define `ShowNotificationCommand` interface
  - [ ] Add comprehensive JSDoc comments

- [ ] 1.3 Update `packages/AI/CorePlus/src/generic/types.ts`
  - [ ] Import new types
  - [ ] Add `responseForm?: AgentResponseForm` to `ExecuteAgentResult`
  - [ ] Add `actionableCommands?: ActionableCommand[]` to `ExecuteAgentResult`
  - [ ] Add `automaticCommands?: AutomaticCommand[]` to `ExecuteAgentResult`
  - [ ] Add same three fields to `BaseAgentNextStep`
  - [ ] Remove any references to `suggestedResponses` if they exist

- [ ] 1.4 Update `packages/AI/CorePlus/src/generic/index.ts`
  - [ ] Export all types from `response-forms.ts`
  - [ ] Export all types from `ui-commands.ts`

- [ ] 1.5 Build and verify
  - [ ] Run `npm run build` in CorePlus package
  - [ ] Verify no TypeScript errors
  - [ ] Verify exports are correct

### ✅ Phase 2: Agent Framework Integration

- [ ] 2.1 Update `packages/AI/Agents/src/agent-types/loop-agent-type.ts`
  - [ ] Update `LoopAgentResponse` interface to include new fields
  - [ ] Update `DetermineNextStep()` to extract `responseForm` from prompt result
  - [ ] Update `DetermineNextStep()` to extract `actionableCommands` from prompt result
  - [ ] Update `DetermineNextStep()` to extract `automaticCommands` from prompt result
  - [ ] Include all three in returned `BaseAgentNextStep` object

- [ ] 2.2 Update `packages/AI/Agents/src/base-agent.ts`
  - [ ] In `Execute()` method, propagate `responseForm` from final step to result
  - [ ] In `Execute()` method, propagate `actionableCommands` from final step to result
  - [ ] In `Execute()` method, propagate `automaticCommands` from final step to result

- [ ] 2.3 Review `packages/AI/Agents/src/agent-types/flow-agent-type.ts`
  - [ ] Determine if any changes needed (likely none for initial implementation)
  - [ ] Document decision in code comments

- [ ] 2.4 Build and verify
  - [ ] Run `npm run build` in Agents package
  - [ ] Verify no TypeScript errors
  - [ ] Verify all imports resolve correctly

### ✅ Phase 3: Angular UI Components

- [ ] 3.1 Create form question renderer component
  - [ ] Create `packages/Angular/Generic/Conversations/src/lib/components/form-question/form-question.component.ts`
  - [ ] Create `packages/Angular/Generic/Conversations/src/lib/components/form-question/form-question.component.html`
  - [ ] Create `packages/Angular/Generic/Conversations/src/lib/components/form-question/form-question.component.scss`
  - [ ] Implement renderer for all question types
  - [ ] Support validation display
  - [ ] Support help text display

- [ ] 3.2 Create simple response buttons component
  - [ ] Create `packages/Angular/Generic/Conversations/src/lib/components/simple-response-buttons/simple-response-buttons.component.ts`
  - [ ] Create `packages/Angular/Generic/Conversations/src/lib/components/simple-response-buttons/simple-response-buttons.component.html`
  - [ ] Create `packages/Angular/Generic/Conversations/src/lib/components/simple-response-buttons/simple-response-buttons.component.scss`
  - [ ] Implement button group rendering
  - [ ] Support icons
  - [ ] Emit selection events

- [ ] 3.3 Create full response form component
  - [ ] Create `packages/Angular/Generic/Conversations/src/lib/components/agent-response-form/agent-response-form.component.ts`
  - [ ] Create `packages/Angular/Generic/Conversations/src/lib/components/agent-response-form/agent-response-form.component.html`
  - [ ] Create `packages/Angular/Generic/Conversations/src/lib/components/agent-response-form/agent-response-form.component.scss`
  - [ ] Build FormGroup from questions
  - [ ] Implement validation
  - [ ] Use mj-form-question for rendering
  - [ ] Emit submit/cancel events

- [ ] 3.4 Create actionable commands component
  - [ ] Create `packages/Angular/Generic/Conversations/src/lib/components/actionable-commands/actionable-commands.component.ts`
  - [ ] Create `packages/Angular/Generic/Conversations/src/lib/components/actionable-commands/actionable-commands.component.html`
  - [ ] Create `packages/Angular/Generic/Conversations/src/lib/components/actionable-commands/actionable-commands.component.scss`
  - [ ] Render command buttons with icons
  - [ ] Emit command click events

- [ ] 3.5 Create UI command handler service
  - [ ] Create `packages/Angular/Generic/Conversations/src/lib/services/ui-command-handler.service.ts`
  - [ ] Implement `executeCommands()` method
  - [ ] Implement handler for `open:resource` command
  - [ ] Implement handler for `open:url` command
  - [ ] Implement handler for `refresh:data` command
  - [ ] Implement handler for `notification` command
  - [ ] Add error handling for unknown command types

- [ ] 3.6 Update conversation view component
  - [ ] Update `packages/Angular/Generic/Conversations/src/lib/conversation-view.component.ts`
  - [ ] Add `currentResponseForm` property
  - [ ] Add `currentActionableCommands` property
  - [ ] Implement `isSimpleChoice()` method
  - [ ] Implement `onSimpleChoiceSelect()` method
  - [ ] Implement `onFormSubmit()` method
  - [ ] Implement `onFormCancel()` method
  - [ ] Implement `onCommandClick()` method
  - [ ] Execute automatic commands on agent result receipt
  - [ ] Update `packages/Angular/Generic/Conversations/src/lib/conversation-view.component.html`
  - [ ] Add simple response buttons template
  - [ ] Add full response form template
  - [ ] Add actionable commands template
  - [ ] Update `packages/Angular/Generic/Conversations/src/lib/conversation-view.component.scss`
  - [ ] Add styling for response UI

- [ ] 3.7 Update module declarations
  - [ ] Add all new components to declarations
  - [ ] Add UICommandHandler service to providers
  - [ ] Export components if needed by Explorer

- [ ] 3.8 Build and verify
  - [ ] Run `npm run build` in Conversations package
  - [ ] Verify no TypeScript errors
  - [ ] Verify no template errors
  - [ ] Verify styling is correct

### ✅ Phase 4: Prompt Template Updates

- [ ] 4.1 Update Loop Agent System Prompt
  - [ ] Edit `metadata/prompts/templates/system/loop-agent-type-system-prompt.template.md`
  - [ ] Add section on "Getting User Input"
  - [ ] Add example for simple choice (buttongroup)
  - [ ] Add example for collecting information (full form)
  - [ ] Add section on "Providing Next Actions"
  - [ ] Add example for opening resources
  - [ ] Add example for opening URLs
  - [ ] Add section on "Refreshing UI After Changes"
  - [ ] Add example for refreshing entity data
  - [ ] Add example for refreshing caches
  - [ ] Add example for notifications
  - [ ] Add complete example combining multiple features

- [ ] 4.2 Update Sage Prompt
  - [ ] Edit `metadata/prompts/templates/sage/sage.template.md`
  - [ ] Add section on "Smart Engagement Examples"
  - [ ] Add example for clarifying user intent with simple choice
  - [ ] Add example for collecting information
  - [ ] Add example for providing navigation after creating something
  - [ ] Add example for opening external resources

- [ ] 4.3 Update Agent Manager Prompt
  - [ ] Edit `metadata/prompts/templates/agent-manager/agent-manager.template.md`
  - [ ] Add section on "After Creating/Modifying Agents"
  - [ ] Add example for opening created agent
  - [ ] Add example for refreshing AI cache
  - [ ] Add section on "Gathering Requirements"
  - [ ] Add example form for collecting agent requirements

- [ ] 4.4 Sync metadata changes
  - [ ] If using mj-sync, run sync to update database
  - [ ] Or manually update prompt records if needed

### ✅ Phase 5: Testing & Validation

- [ ] 5.1 Build all packages
  - [ ] Build CorePlus: `cd packages/AI/CorePlus && npm run build`
  - [ ] Build Agents: `cd packages/AI/Agents && npm run build`
  - [ ] Build Conversations: `cd packages/Angular/Generic/Conversations && npm run build`
  - [ ] Build from root: `npm run build` (verify no errors)

- [ ] 5.2 Manual testing
  - [ ] Start API: `npm run start:api`
  - [ ] Start Explorer: `npm run start:explorer`
  - [ ] Test simple response buttons rendering
  - [ ] Test full form rendering
  - [ ] Test form validation
  - [ ] Test form submission
  - [ ] Test actionable commands
  - [ ] Test automatic commands
  - [ ] Test with existing agents (Sage, Agent Manager)

- [ ] 5.3 Verification
  - [ ] Verify no console errors
  - [ ] Verify proper styling
  - [ ] Verify mobile responsiveness
  - [ ] Verify accessibility (keyboard navigation, screen readers)
  - [ ] Verify no regressions in existing functionality

### ✅ Phase 6: Documentation & Cleanup

- [ ] 6.1 Code documentation
  - [ ] Verify all new interfaces have JSDoc comments
  - [ ] Verify all new components have component documentation
  - [ ] Verify all methods have proper comments

- [ ] 6.2 Final review
  - [ ] Review all code changes
  - [ ] Check for TODO comments
  - [ ] Check for console.log statements
  - [ ] Verify proper error handling

- [ ] 6.3 Commit and push
  - [ ] Final commit with all changes
  - [ ] Push to remote branch
  - [ ] Verify all changes are in remote

## Success Criteria

1. ✅ All TypeScript builds without errors
2. ✅ Simple button choices render correctly
3. ✅ Complex forms render with proper validation
4. ✅ Actionable commands execute correctly
5. ✅ Automatic commands refresh UI appropriately
6. ✅ Prompt templates include comprehensive examples
7. ✅ No regressions in existing agent behavior
8. ✅ Code is well-documented and maintainable

## Future Enhancements

1. **Conditional Questions**: Show/hide questions based on other answers
2. **Multi-step Forms**: Wizards with multiple pages
3. **Custom Validators**: More sophisticated validation rules
4. **File Upload**: Allow agents to request file uploads
5. **Rich Text**: Support markdown/HTML in form descriptions
6. **Form Templates**: Reusable form configurations
7. **Additional Commands**: More command types as needs arise
8. **Analytics**: Track form completion rates and command usage

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Breaking existing agents | Comprehensive testing with all production agents |
| Complex form rendering issues | Start with simple types, add complexity incrementally |
| Command handler errors | Robust error handling and logging |
| Mobile responsiveness | Use Kendo responsive components, test on mobile |
| Type safety issues | Strict TypeScript configuration, comprehensive types |

## References

- MemberJunction Agent Framework: `packages/AI/Agents/`
- MemberJunction CorePlus Types: `packages/AI/CorePlus/src/generic/`
- Angular Conversations: `packages/Angular/Generic/Conversations/`
- Loop Agent System Prompt: `metadata/prompts/templates/system/loop-agent-type-system-prompt.template.md`
