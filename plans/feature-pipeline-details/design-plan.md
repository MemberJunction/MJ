# Design Plan: Feature Pipeline Details Tab Redesign (Option A)

## 1. Locked Direction
- **Chosen Direction**: **Option A — Structured Semantic Cards**
- **Derived From Locked Mockup**: `plans/feature-pipeline-details/mockups/option-a-structured-cards.html`
- **Hybrid Additions**: Incorporate the Configuration Health & Schema Audit Bar from Option B at the top of the Details tab to provide instant validation diagnostics.

---

## 2. Component Architecture & Structure
The implementation enhances `RecordProcessFormComponentExtended` (`packages/Angular/Explorer/core-entity-forms/src/lib/custom/RecordProcesses/`):

1. **Discriminator Logic**:
   - When `record.WorkType === 'Infer'` (Feature Pipeline):
     - Details tab displays the specialized, structured cards:
       - **Configuration Health & Schema Audit Bar**: Status chip, bound features count, context validation chip.
       - **Process Identity & Target**: Process Name, Description, Category, Target Entity link, Status pill.
       - **Scope & Record Filter**: SQL Scope filter with syntax formatting, estimated row count badge, and test scope verification button.
       - **AI Model & Context Query**: Bound AI Prompt card (Prompt link, Model name, Temperature, Max Tokens), Prompt parameter mapping table (`@ParamName` &larr; Entity Column), and Context SQL Query.
       - **Feature Output Schema & Storage Mappings**: Interactive table with Feature Name, Data Type chip, Validation Constraints pills (e.g. range `[-1.0, 1.0]`, null-on-violation, taxonomy root), Target Entity Field binding (with column type and validation checkmark), and Reasoning capture target.
       - **Ingestion & Optimization**: Watermark strategy (Checksum/UpdatedAt), Batch Size, Max Concurrency, and Skip Unchanged row status.
       - **Developer Raw JSON Drawer**: Collapsible panel with syntax-highlighted JSON viewer, Copy JSON button, and two-way sync for editing.
   - When `record.WorkType !== 'Infer'`:
     - Preserves the existing standard field panels (`processDefinition`, `executionLogic`, `scopeConfiguration`, `triggers`, `performanceAndOptimization`, `systemMetadata`) unchanged.

---

## 3. Data & Engine Wiring
- **Spec Parser & Reactive Model**:
  - `DataFeatureSpec` from `@memberjunction/feature-pipelines`.
  - Parsed synchronously from `record.Configuration` via `SafeJSONParse<DataFeatureSpec>()`.
  - Validation executed via `validateSpec(spec, entityMetadataStub)` from `@memberjunction/feature-pipelines`.
- **Entity Metadata Integration**:
  - Target entity fields resolved via `this.ProviderToUse.EntityByID(record.EntityID)` or `EntityByName(record.TargetEntity)`.
  - Field existence, data type matching, and nullability validated against `EntityInfo.Fields`.
- **Two-way Sync**:
  - Updates in UI or the Raw JSON drawer reflect immediately into `record.Configuration` and `record.OutputMapping` (via `syncOutputMappingToRecord`).
- **Prompt Metadata**:
  - Prompt name and details loaded via `ProviderToUse.LookupItem('MJ: AI Prompts', record.PromptID)` or cached prompt entity list.

---

## 4. MemberJunction Standards & Conventions
- **Design Tokens**: 100% `--mj-*` tokens for colors, surfaces, borders, shadows, and typography. Zero hardcoded hexes.
- **Theme Support**: Seamless automatic adaptation between Light and Dark mode.
- **Angular Conventions**:
  - Standalone template syntax (`@if`, `@for`, `@switch`).
  - Strict type safety: ZERO `any` types.
  - Derived types using indexed access (e.g. `MJRecordProcessEntity['WorkType']`).
- **Form Chrome Integration**:
  - Preserves BaseForm navigation rail (`Overview & Status`, `Details`, `Pipeline Configuration`, `Prior Runs`, related collections).

---

## 5. Build Sequence & Verification Plan
1. **Step 1: TypeScript Engine & Helper Methods**:
   - Add `DataFeatureSpec` parsing, validation issue tracking, prompt resolution, and output field binding helpers to `RecordProcessFormComponentExtended`.
   - Add unit tests verifying parsing, validation issue calculation, and field binding status.
2. **Step 2: Template & Card Layout**:
   - Update `record-process-form.component.html` with the Option A structured cards for `WorkType === 'Infer'`.
   - Ensure fallback for other `WorkType`s (`FieldRules`, `Action`, `Agent`, `ML Model`).
3. **Step 3: Component CSS & Responsive Tokens**:
   - Add semantic card styles to `record-process-form.component.css` matching the locked mockup.
4. **Step 4: Package Build & Unit Test Verification**:
   - Run `npm run build` and `npm run test` in `packages/Angular/Explorer/core-entity-forms`.
5. **Step 5: Live App Verification**:
   - Verify visually in MJ Explorer on `http://localhost:4201` with real Feature Pipeline records in both Light and Dark modes.
