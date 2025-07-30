# AI Agents and Actions UI Improvements Plan

## Overview
This document outlines the plan for improving the UI/UX for AI Agents and Actions within the MemberJunction Angular application. The improvements focus on making it easier to find, create, manage, and test AI agents and actions.

## Key Improvements

### 1. New Generic Packages
Create two new reusable packages under `/packages/Angular/Generic/`:

#### 1.1 AI Test Harness Package (`@memberjunction/ng-ai-test-harness`)
- **Purpose**: Provide a reusable test harness component that can be embedded anywhere
- **Features**:
  - Two modes: Agent and Prompt
  - Can be used as embedded component or dialog
  - Unified testing interface for AI capabilities
  - Real-time execution monitoring
  - Result display with proper formatting

#### 1.2 Action Gallery Package (`@memberjunction/ng-action-gallery`)
- **Purpose**: Provide a beautiful, filterable gallery view of actions
- **Features**:
  - Category/subcategory navigation
  - Expandable cards showing action details
  - Search and filter capabilities
  - Can be used standalone or in dialog mode
  - Action selection for agent configuration

### 2. Actions Dashboard Improvements

#### 2.1 Enhanced Action Discovery
- Replace current list view with category-based navigation
- Visual hierarchy: Category → Subcategory → Actions
- Quick filters and search
- Visual cards with action icons and descriptions
- Preview of parameters and result codes on hover/expand

#### 2.2 Action Gallery Integration
- Use the new Action Gallery component
- Allow quick testing from gallery view
- Show execution history per action
- Visual indicators for action status and usage

### 3. AI Agents Improvements

#### 3.1 Agent Creation Workflow
- **New Agent Form** (popup dialog):
  - Basic fields: Name, Description, Model, Category
  - Option to clone from existing agent
  - Quick-start templates
  - Immediate redirect to full form after creation
  
#### 3.2 Sub-Agent Management
- Add "Create Sub-Agent" button in agent form
- Use same creation dialog with parent context
- Live refresh of sub-agents list
- Drag-and-drop reordering of sub-agents
- Visual hierarchy display

#### 3.3 Action Management within Agents
- Add/Remove actions using Action Gallery dialog
- Visual action cards within agent form
- Parameter mapping interface
- Execution order management
- Action dependency visualization

#### 3.4 Quick Test from Dashboard
- Direct "Test Agent" button in dashboard
- Opens AI Test Harness in dialog mode
- No need to navigate to form first
- Results displayed inline

## Implementation Plan

### Phase 1: Create Generic Packages (Week 1)

#### 1.1 Create AI Test Harness Package
```
/packages/Angular/Generic/ai-test-harness/
├── src/
│   ├── lib/
│   │   ├── ai-test-harness.component.ts
│   │   ├── ai-test-harness.component.html
│   │   ├── ai-test-harness.component.scss
│   │   ├── ai-test-harness-dialog.service.ts
│   │   ├── ai-test-harness.module.ts
│   │   └── models/
│   │       └── test-harness.models.ts
│   ├── public-api.ts
│   └── index.ts
├── package.json
├── tsconfig.json
├── tsconfig.lib.json
├── tsconfig.spec.json
└── ng-package.json
```

**Key Features**:
- Mode selector (Agent/Prompt)
- Entity selector based on mode
- Parameter inputs with validation
- Execution button with loading states
- Results display with formatting
- Error handling and display
- History of recent runs

#### 1.2 Create Action Gallery Package
```
/packages/Angular/Generic/action-gallery/
├── src/
│   ├── lib/
│   │   ├── action-gallery.component.ts
│   │   ├── action-gallery.component.html
│   │   ├── action-gallery.component.scss
│   │   ├── action-card.component.ts
│   │   ├── action-card.component.html
│   │   ├── action-card.component.scss
│   │   ├── action-gallery-dialog.service.ts
│   │   ├── action-gallery.module.ts
│   │   └── models/
│   │       └── action-gallery.models.ts
│   ├── public-api.ts
│   └── index.ts
├── package.json
├── tsconfig.json
├── tsconfig.lib.json
├── tsconfig.spec.json
└── ng-package.json
```

**Key Features**:
- Category/subcategory navigation sidebar
- Grid/list view toggle
- Action cards with:
  - Icon and name
  - Description
  - Category badges
  - Expandable details (parameters, result codes)
- Search and filter bar
- Selection mode for agent configuration
- Quick test button per action

### Phase 2: Update Existing Components (Week 2)

#### 2.1 Actions Dashboard Updates
- Replace action list with Action Gallery component
- Add view mode toggle (list/gallery)
- Integrate quick test functionality
- Update styling for consistency

#### 2.2 AI Agent Form Enhancements
- Add "New Agent" dialog component
- Add "Add Sub-Agent" functionality
- Integrate Action Gallery for action selection
- Add visual hierarchy for sub-agents
- Improve action parameter mapping UI

#### 2.3 AI Dashboard Updates
- Add "Create Agent" button with dialog
- Add "Test Agent" quick action
- Update agent list with better categorization
- Add usage statistics per agent

### Phase 3: Integration and Polish (Week 3)

#### 3.1 Cross-Package Integration
- Update Explorer forms to use new test harness
- Update dashboards to use new components
- Ensure consistent styling
- Add proper loading states

#### 3.2 User Experience Enhancements
- Keyboard shortcuts for common actions
- Tooltips and help text
- Validation messages
- Success/error notifications
- Performance optimizations

#### 3.3 Testing and Documentation
- Unit tests for new components
- Integration tests
- Update documentation
- Create usage examples

## Technical Considerations

### 1. Package Structure
- Follow existing package patterns from dashboards
- Use Angular 18 features
- Maintain consistency with MJ design system

### 2. Dependencies
- Reuse existing MJ core libraries
- Leverage Kendo UI components
- Use existing GraphQL services

### 3. State Management
- Use RxJS for reactive updates
- Implement proper cleanup
- Handle concurrent operations

### 4. Performance
- Lazy load heavy components
- Implement virtual scrolling for large lists
- Optimize change detection
- Cache frequently accessed data

### 5. Accessibility
- ARIA labels and roles
- Keyboard navigation
- Screen reader support
- High contrast mode support

## Migration Strategy

### 1. Backward Compatibility
- Existing forms continue to work
- Gradual migration to new components
- Feature flags for rollout

### 2. Data Migration
- No database changes required
- Use existing entities and APIs
- Maintain data integrity

## Success Metrics

### 1. User Experience
- Reduced clicks to test agents/actions
- Faster action discovery
- Improved agent creation workflow
- Better visibility of agent structure

### 2. Developer Experience
- Reusable components across packages
- Consistent patterns
- Clear separation of concerns
- Easy to extend and maintain

### 3. Performance
- Fast initial load times
- Smooth interactions
- Efficient data loading
- Minimal memory footprint

## Timeline

- **Week 1**: Create generic packages with core functionality
- **Week 2**: Update existing components and integrate
- **Week 3**: Polish, test, and document
- **Week 4**: Deploy and monitor

## Next Steps

1. Review and approve this plan
2. Create package scaffolding
3. Migrate existing test harness code
4. Build Action Gallery component
5. Update dashboards and forms
6. Test and iterate

## Questions for Review

1. Should we include preset agent templates for common use cases?
2. Do we need versioning for agents (similar to prompts)?
3. Should the Action Gallery support favorite/recently used actions?
4. Do we need bulk operations (e.g., add multiple actions at once)?
5. Should we add import/export functionality for agent configurations?