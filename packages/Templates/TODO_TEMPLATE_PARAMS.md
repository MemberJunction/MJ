# Template Parameters Auto-Generation TODO List

## Overview
Implement automatic extraction and management of Nunjucks template parameters using AI to parse template content and maintain Template Params records.

## Tasks

### 1. Metadata and Prompt Setup
- [x] Create template parameter extraction prompt in `/metadata/prompts/.prompts.json`
- [x] Create prompt markdown file in `/metadata/prompts/templates/template-param-extraction.template.md`
- [x] Add prompt with category "MJ: System"

### 2. Server-Side Implementation
- [x] Move `TemplateContentEntity.server.ts` from `packages/Templates/engine/src` to `packages/MJCoreEntitiesServer/src/custom/`
- [x] Implement Save() override in TemplateContentEntity.server.ts
  - [x] Check if new record or TemplateText is dirty
  - [x] Call AI Prompt Runner to extract parameters
  - [x] Parse AI response to get parameter list
- [x] Implement parameter synchronization logic
  - [x] Handle single template content case (most common)
  - [x] Handle multiple template contents case
  - [x] Add/update/remove Template Params based on AI extraction

### 3. Angular UI - Template Forms
- [x] Update Templates form in `packages/Angular/Explorer/core-entity-forms`
  - [x] Display Template Params in editable grid/list
  - [x] Show parameter details (name, type, required, description)
- [x] Update AI Prompts form
  - [x] Add read-only Template Params section
  - [x] Pull params from underlying template
  - [x] Display in a clean, informative way

### 4. Runner UI Enhancements
- [x] Update Template Runner UI
  - [x] Pre-populate template parameters in test form
  - [x] Create appropriate input controls based on param type
- [x] Update AI Prompt Runner UI
  - [x] Pre-populate underlying template parameters
  - [x] Show params from the template referenced by the prompt

### 5. Testing and Validation
- [ ] Test with single template content
- [ ] Test with multiple template contents
- [ ] Test parameter updates when template text changes
- [ ] Verify UI displays params correctly
- [ ] Verify runners pre-populate params

## Implementation Notes

### Parameter Extraction Rules
1. Single template content → all params have TemplateContentID = NULL
2. Multiple contents → manage global vs content-specific params
3. Use LLM to identify param type (Scalar/Array/Object)
4. Extract descriptions from template context

### UI Considerations
- Templates: Full CRUD on params
- AI Prompts: Read-only display of template params
- Runners: Dynamic form generation based on param types

## Success Criteria
- [x] Template params auto-generate when template content is saved
- [x] Params update correctly when template text changes
- [x] UI shows params appropriately in all locations
- [x] Runners pre-populate param values for testing