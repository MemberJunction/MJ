# Design Brief: Feature Pipeline Details Tab Redesign

## 1. Persona
- **Primary Persona**: AI/Data Engineer & System Administrator
  - Configures feature pipelines, prompt bindings, context queries, and feature schemas.
  - Needs clear understanding of what inputs feed the AI model, how outputs map to entity fields, and what constraints/validation rules are in effect.
- **Secondary Persona**: Business Analyst / Operations Manager
  - Reviews pipeline status, trigger frequency, scope coverage, and output feature semantics without wanting to decrypt raw JSON.
- **Tertiary Persona**: Core Framework Developer
  - Needs access to raw JSON for low-level debugging and manual configuration overrides when needed.

## 2. Job-to-be-Done (JTBD)
> "When I view or configure a Feature Pipeline (`WorkType = 'Infer'`), I want to clearly inspect the pipeline's execution logic—including context query, prompt model, feature output schema, constraints, scope filters, and ingestion settings—in a structured, visually coherent layout, so that I can audit, tune, and maintain features without deciphering or editing raw unformatted JSON."

## 3. Current Pain Points (Identified from Live App & User Screenshot)
1. **Raw JSON Dominance**: The Details tab renders `InputMapping`, `OutputMapping`, and `Configuration` as raw JSON strings inside monospace code editors.
2. **High Error Surface**: Editing pipeline specs requires manual JSON editing without inline schema validation, enum auto-complete, or constraint checks.
3. **Irrelevant Fields**: Fields intended for other work types (e.g. `ActionID`, `AgentID`) clutter the interface for `Infer` pipelines.
4. **Poor Information Density & Visual Hierarchy**: Flat label-value list with excessive white space and no categorization between prompt setup, feature schema, scope rules, and runtime caching.
5. **No Visual Feedback on Column Mappings**: Cannot easily verify whether extracted features (`SentimentScore`, `ActivityTags`) correctly bind to valid entity columns.

## 4. Success Criteria
- **Zero Mandatory JSON**: 100% of pipeline configuration (prompt, context query, output mappings, constraints, watermarks) is readable and editable via structured UI controls.
- **Raw JSON Escape Hatch**: Power users can toggle or view formatted raw JSON when needed for debugging or copy-pasting.
- **Visual Mapping Clarity**: Feature schema clearly displays feature name, data type, constraints (e.g., numeric range `[-1.0, 1.0]`, tag taxonomy), and target column binding.
- **Explorer Shell Fidelity**: Uses MJ Explorer chrome (`mj-collapsible-panel`, `--mj-*` design tokens, light/dark mode support, responsive grid).
- **Total Coherence with Visual Builder**: Complements the "Pipeline Configuration" builder tab by offering an authoritative, inspectable details view that feels native to the entity form.

## 5. Constraints & Non-Goals
- **Constraints**:
  - Must conform strictly to `@memberjunction/ng-base-forms` and custom form override conventions in `RecordProcesses`.
  - Must use only `--mj-*` semantic design tokens (no hardcoded color hexes).
  - Must support both Light and Dark themes seamlessly.
  - Must support both Read-only (view) mode and Edit mode.
- **Non-Goals**:
  - Replacing the visual step-by-step pipeline builder (`<mj-feature-pipeline-builder>`) in the "Pipeline Configuration" tab. The Details tab is the inspector/specification form.
  - Implementing execution run history (already handled in the "Prior Runs" panel).
