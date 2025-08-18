# Component Review Plan

## Objective
Perform a comprehensive audit of all MemberJunction components to ensure consistency between component specifications, code implementation, and metadata definitions.

## Review Scope
Each component in the `.components.json` registry will be analyzed for:
1. Specification file existence and validity
2. Dependency structure compliance
3. Property definitions accuracy
4. Event declarations completeness
5. Documentation quality and accuracy

## Detailed Review Instructions for Sub-Agents

### Task Assignment
Each sub-agent will be assigned ONE component to review. The component name and its entry from `.components.json` will be provided.

### Review Steps

#### 1. Verify Specification File
- **Check**: Confirm the spec file path in `Specification` field exists
- **Path Format**: Should be `@file:spec/[component-name].spec.json`
- **Report**: Note if file is missing or path is incorrect

#### 2. Analyze Dependencies
- **Read**: Open the spec.json file and check the `dependencies` array
- **Valid Format**: Dependencies should use `@include:[filename].spec.json`
- **Invalid Format**: Direct component definitions (inline objects) instead of @include
- **Report**: List any violations where components are defined directly instead of referenced

#### 3. Validate Properties
- **Compare**: Match properties between spec.json and code implementation
- **Check Required Fields**:
  - If spec says `required: true`, verify code enforces this
  - If code requires a prop (no default value, used without checking), verify spec marks it required
  - Check prop types match (string, number, array, object, function)
- **Code Analysis**:
  - Look for destructuring patterns: `function Component({ prop1, prop2 })`
  - Check for default values: `prop1 = defaultValue`
  - Look for prop validation: `if (!prop1) throw error` or similar
- **Report**: List mismatches between spec and implementation

#### 4. Verify Events
- **Identify in Code**: Search for event emissions in the code
  - Look for: `callbacks.eventName()`, `onEventName()`, or similar patterns
  - Common events: `OpenEntityRecord`, `onFilterChange`, `onSaveUserSettings`
- **Match with Spec**: Ensure all emitted events are declared in spec.json `events` array
- **Report**: List any undeclared events or unused event declarations

#### 5. Review Documentation Quality
- **FunctionalRequirements**: 
  - Should describe WHAT the component does from user perspective
  - Should list key features and capabilities
  - Should be meaningful, not generic
- **TechnicalDesign**:
  - Should describe HOW it's implemented
  - Should mention key technical decisions
  - Should reference sub-components if applicable
- **Match with Code**:
  - Verify described functionality exists in code
  - Check if major features mentioned are implemented
  - Ensure technical approach matches actual implementation
- **Report**: Note any significant discrepancies or missing documentation

### Output Format for Sub-Agents

Each sub-agent should produce a structured report:

```markdown
## Component: [ComponentName]

### 1. Specification File
- **Status**: ✅ Found / ❌ Missing
- **Path**: [actual path]
- **Issues**: [if any]

### 2. Dependencies Analysis
- **Total Dependencies**: [count]
- **Valid @include References**: [count]
- **Invalid Inline Definitions**: [count]
- **Violations**: 
  - [List each violation with details]

### 3. Properties Validation
- **Properties in Spec**: [count]
- **Properties in Code**: [count]
- **Mismatches**:
  - **Missing Required Flag**: [prop name] - required in code but not in spec
  - **Incorrect Required Flag**: [prop name] - marked required in spec but has default in code
  - **Type Mismatch**: [prop name] - spec says [type1], code expects [type2]
  - **Undocumented Props**: [prop name] - used in code but not in spec

### 4. Events Verification
- **Events in Spec**: [count]
- **Events in Code**: [count]
- **Issues**:
  - **Undeclared Events**: [event name] - emitted in code but not in spec
  - **Unused Events**: [event name] - in spec but never emitted

### 5. Documentation Review
- **FunctionalRequirements**: 
  - Quality: ⭐⭐⭐⭐⭐ [1-5 stars]
  - Accuracy: ✅ Matches / ⚠️ Partial / ❌ Incorrect
  - Issues: [specific problems]
- **TechnicalDesign**:
  - Quality: ⭐⭐⭐⭐⭐ [1-5 stars]
  - Accuracy: ✅ Matches / ⚠️ Partial / ❌ Incorrect
  - Issues: [specific problems]

### Summary
- **Critical Issues**: [count and brief description]
- **Warnings**: [count and brief description]
- **Recommendations**: [specific fixes needed]
```

## Execution Plan

### Phase 1: Preparation
1. Parse `.components.json` to extract all component entries
2. Create batches of 5 components each
3. Prepare sub-agent prompts with specific component assignments

### Phase 2: Parallel Review
1. Spawn 5 sub-agents per batch
2. Each agent reviews one component following the instructions above
3. Collect individual reports

### Phase 3: Compilation
1. Aggregate all sub-agent reports
2. Create summary statistics
3. Prioritize issues by severity
4. Generate final `component-analysis.md` report

## Sub-Agent Prompt Template

```
You are a component auditor for MemberJunction. Your task is to review the following component:

Component Name: [NAME]
Component Entry: [JSON]

Follow these steps:
1. Read the specification file at [SPEC_PATH]
2. Read the code file referenced in the spec
3. Analyze dependencies, properties, events, and documentation
4. Produce a structured report following the format provided

Be thorough but concise. Focus on identifying actual issues rather than stylistic preferences.
```

## Success Criteria
- All components reviewed
- All discrepancies documented
- Clear recommendations for fixes
- Prioritized issue list for remediation

## Timeline
- Estimated components: ~80-100
- Batches: ~16-20 (at 5 components per batch)
- Time per batch: ~2-3 minutes
- Total time: ~30-40 minutes

This plan ensures comprehensive, systematic review of all components with parallel processing for efficiency.