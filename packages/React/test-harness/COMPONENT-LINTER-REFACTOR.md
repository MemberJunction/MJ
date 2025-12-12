# Component Linter Refactoring Plan

**Status**: Planning Phase
**Started**: 2025-01-14
**Target Completion**: 5 weeks
**Current Phase**: Phase 0 - Documentation & Planning

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current State Analysis](#current-state-analysis)
3. [Target Architecture](#target-architecture)
4. [Refactoring Phases](#refactoring-phases)
5. [File Structure](#file-structure)
6. [Testing Strategy](#testing-strategy)
7. [Implementation Guide](#implementation-guide)
8. [Reference Materials](#reference-materials)

---

## Executive Summary

### Problem Statement

The component-linter.ts has grown to **10,718 lines** with **~60 rules** in a single file. It suffers from:
- Multiple overlapping validation systems (rule-based, type inference, constraint validators)
- Unclear separation of concerns
- Performance issues (60+ AST traversals per lint)
- Difficult maintenance and testing
- Redundant work across rules

### Solution Overview

Refactor into a **three-phase architecture** with clear separation:

1. **Phase 1: Parse & Build Context** (runs once)
   - Parse AST
   - Run type inference engine
   - Build complete type context

2. **Phase 2: Rule Execution** (organized by category)
   - Runtime Rules (MJ-specific constraints)
   - Type Rules (type compatibility checks)
   - Schema Rules (entity/query/component validation)
   - Best Practice Rules (code quality)

3. **Phase 3: Report Violations**
   - Aggregate violations
   - Sort by severity
   - Return results

### Success Criteria

- ✅ All existing tests pass
- ✅ No regression in violation detection
- ✅ 50%+ reduction in lines per file
- ✅ Type inference runs once (not per rule)
- ✅ New rules can be added in <100 lines
- ✅ Clear documentation for each subsystem

---

## Current State Analysis

### File Statistics

```
Location: packages/React/test-harness/src/lib/component-linter.ts
Lines: 10,718
Rules: ~60
Rule Definitions: Lines 363-8421 (8,058 lines)
Class Definition: Lines 280-10718
```

### Supporting Files

```
packages/React/test-harness/src/lib/
├── component-linter.ts                      (10,718 lines) ⚠️
├── type-inference-engine.ts                 (existing)
├── type-context.ts                          (existing)
├── control-flow-analyzer.ts                 (existing)
├── styles-type-analyzer.ts                  (existing)
├── prop-value-extractor.ts                  (existing)
├── library-lint-cache.ts                    (existing)
├── constraint-validators/
│   ├── base-constraint-validator.ts
│   ├── validation-context.ts
│   ├── subset-of-entity-fields-validator.ts
│   ├── sql-where-clause-validator.ts
│   └── required-when-validator.ts
```

### Test Files

```
packages/React/test-harness/tests/
├── linter-dependency-events.spec.ts
├── linter-optional-chaining-validation.spec.ts
├── linter-runquery-validation.spec.ts
├── linter-type-validation.spec.ts           (newly added)
├── test-dependency-shadowing.ts
├── test-harness.spec.ts
├── test-runquery-data-bug.ts
└── test-whitelist-validation.ts
```

### Current Rule Categories (60 rules)

#### Runtime Rules (13 rules) - MJ-specific constraints
```
no-import-statements
no-require-statements
no-export-statements
no-iife-wrapper
single-function-only
use-function-declaration
react-component-naming
no-react-destructuring
use-unwrap-components
callbacks-passthrough-only
callbacks-usage-validation
pass-standard-props
no-return-component
```

#### Type Rules (5 rules) - Type checking
```
type-inference-errors
type-mismatch-operation
component-props-validation         (partial)
dependency-prop-validation         (partial)
validate-component-props          (partial - NEW: includes type validation)
```

#### Schema Rules (19 rules) - Entity/Query/Component validation
```
runview-entity-validation
entity-field-validation
query-field-validation
query-parameter-type-validation
runquery-parameters-validation
runquery-missing-categorypath
runquery-runview-validation
runview-runquery-result-validation
runview-runquery-valid-properties
required-queries-not-called
dependency-prop-validation        (overlap with type rules)
validate-component-props          (overlap with type rules)
component-not-in-dependencies
undefined-component-usage
undefined-jsx-component
validate-component-references
unused-component-dependencies
component-usage-without-destructuring
property-name-consistency
```

#### Best Practice Rules (23 rules) - Code quality
```
prefer-async-await
prefer-jsx-syntax
no-use-reducer
no-window-access
no-child-implementation
no-data-prop
noisy-settings-updates
saved-user-settings-pattern
prop-state-sync
callback-parameter-validation
event-invocation-pattern
library-variable-names
unused-libraries
styles-invalid-path
styles-unsafe-access
unsafe-array-operations
unsafe-formatting-methods
string-template-validation
string-replace-all-occurrences
useeffect-unstable-dependencies
utilities-api-validation
utilities-no-direct-instantiation
server-reload-on-client-operation
dependency-shadowing
runquery-runview-spread-operator
```

### Key Problems Identified

#### 1. **Dual Property Validation**
- `dependency-prop-validation` (line ~7800) checks prop existence
- `validate-component-props` (line ~8172) checks constraints + types
- **Issue**: Two rules doing overlapping work, unclear responsibilities

#### 2. **Type Validation Fragmentation**
- `type-inference-errors` - reports engine errors
- `type-mismatch-operation` - validates operations
- `validate-component-props` - NOW also validates types (just added)
- **Issue**: No single source of truth for type checking

#### 3. **RunView/RunQuery Validation Split**
Seven separate rules handle data access validation:
- `runview-entity-validation`
- `runquery-parameters-validation`
- `runquery-missing-categorypath`
- `runview-runquery-result-validation`
- `runview-runquery-valid-properties`
- `query-field-validation`
- `entity-field-validation`

#### 4. **Constraint Validators Misnamed**
- Called "Constraint Validators" but they're actually **semantic validators**
- They validate semantic correctness against schemas (entities, queries, components)
- Not integrated with TypeInferenceEngine
- Only used in one rule (`validate-component-props`)

#### 5. **Performance Issues**
- Each rule traverses AST independently (~60 traversals)
- Type inference runs multiple times
- No caching between rules
- Entity/query lookups repeated across rules

---

## Target Architecture

### Three-Phase Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│                    Component Linter                          │
│                      (Orchestrator)                          │
└──────────────────────────┬──────────────────────────────────┘
                           │
        ┌──────────────────┴─────────────────┐
        │                                    │
   ┌────▼─────┐                        ┌────▼────────┐
   │  Phase 1 │                        │   Phase 2   │
   │  Parse   │───────────────────────▶│   Build     │
   │   AST    │                        │   Context   │
   └──────────┘                        └────┬────────┘
                                            │
                    ┌───────────────────────┴────────────────────┐
                    │                                            │
             ┌──────▼──────────┐                         ┌──────▼──────┐
             │ Type Inference  │                         │   Metadata  │
             │     Engine      │                         │   Loading   │
             └──────┬──────────┘                         └──────┬──────┘
                    │                                           │
                    └─────────────┬─────────────────────────────┘
                                  │
                            ┌─────▼─────────┐
                            │ TypeContext   │
                            │ + Metadata    │
                            └─────┬─────────┘
                                  │
                      ┌───────────┴────────────┐
                      │       Phase 3          │
                      │   Rule Execution       │
                      └───────────┬────────────┘
                                  │
                ┌─────────────────┼─────────────────┬─────────────────┐
                │                 │                 │                 │
           ┌────▼─────┐      ┌───▼────┐      ┌────▼─────┐     ┌────▼─────┐
           │ Runtime  │      │  Type  │      │  Schema  │     │   Best   │
           │  Rules   │      │  Rules │      │  Rules   │     │ Practice │
           │          │      │        │      │          │     │  Rules   │
           └──────────┘      └───┬────┘      └────┬─────┘     └──────────┘
                                 │                │
                                 │          ┌─────▼──────────┐
                                 └─────────▶│   Semantic     │
                                            │   Validators   │
                                            │   (plugins)    │
                                            └────────────────┘
```

### Rule Interface

```typescript
export interface LintRule {
  name: string;
  category: 'runtime' | 'type' | 'schema' | 'best-practice';
  severity: 'critical' | 'high' | 'medium' | 'low';
  appliesTo: 'all' | 'root' | 'child';

  validate(
    ast: t.File,
    context: LintContext
  ): Promise<Violation[]> | Violation[];
}

export interface LintContext {
  componentName: string;
  componentSpec: ComponentSpec;
  typeContext: TypeContext;
  metadata: {
    entities: Map<string, EntityInfo>;
    queries: Map<string, QueryInfo>;
    components: Map<string, ComponentSpec>;
  };
  semanticValidators: Map<string, SemanticValidator>;
}
```

### Semantic Validators (Renamed from Constraint Validators)

```typescript
export abstract class SemanticValidator {
  abstract type: string;

  abstract validate(
    context: ValidationContext,
    config: ValidatorConfig
  ): SemanticViolation[];
}

// Existing validators (renamed):
// - SubsetOfEntityFieldsValidator
// - SQLWhereClauseValidator
// - RequiredWhenValidator

// New validators to add:
// - TypeDefinitionValidator (for custom TypeDefinitions in ComponentSpec)
// - EnumValueValidator (for enum constraints)
```

---

## Refactoring Phases

### Phase 0: Documentation & Planning ⏳ IN PROGRESS
**Duration**: 1 week
**Status**: Creating refactor document

**Tasks**:
- [x] Create comprehensive refactor document
- [ ] Review and approve architecture
- [ ] Create branch: `refactor/component-linter-architecture`
- [ ] Baseline all existing tests (ensure 100% pass)
- [ ] Document current behavior for each rule

**Deliverables**:
- ✅ This document (COMPONENT-LINTER-REFACTOR.md)
- [ ] Test baseline report
- [ ] Rule behavior documentation

---

### Phase 1: Extract Type System
**Duration**: 1 week
**Goal**: Make type inference a first-class phase

**Tasks**:
1. Create `type-rules/` directory
2. Extract all type-checking logic into `TypeCompatibilityRule`
3. Make TypeInferenceEngine run once before all rules
4. Update rules to consume TypeContext instead of running inference
5. Remove type checking from existing rules

**Changes**:

```typescript
// NEW: type-rules/type-compatibility-rule.ts
export class TypeCompatibilityRule implements LintRule {
  name = 'type-compatibility';
  category = 'type';

  validate(ast: t.File, context: LintContext): Violation[] {
    // Report ALL type violations in one place:
    // - Variable assignments
    // - Function calls
    // - Binary operations
    // - Property access
    // - Array operations
    // - Component prop types

    return this.typeContext.getAllViolations();
  }
}
```

**Migration Strategy**:
- Keep existing type-related rules but mark as `@deprecated`
- New rule aggregates all type violations
- After Phase 1, remove deprecated rules

**Testing**:
- Run all existing tests
- Ensure same violations are detected
- Verify type inference runs only once (performance test)

---

### Phase 2: Rename & Reorganize Validators
**Duration**: 1 week
**Goal**: Clarify semantic validation architecture

**Tasks**:
1. Rename `constraint-validators/` → `semantic-validators/`
2. Rename `BaseConstraintValidator` → `SemanticValidator`
3. Update terminology throughout codebase
4. Move to `schema-validation/semantic-validators/`
5. Create `SemanticValidatorRegistry` for plugin management
6. Update documentation

**Changes**:

```
packages/React/test-harness/src/lib/
├── schema-validation/
│   ├── semantic-validators/
│   │   ├── semantic-validator.ts              (base class)
│   │   ├── semantic-validator-registry.ts     (NEW: plugin registry)
│   │   ├── validation-context.ts
│   │   ├── semantic-violation.ts              (NEW: typed violation)
│   │   ├── subset-of-entity-fields-validator.ts
│   │   ├── sql-where-clause-validator.ts
│   │   ├── required-when-validator.ts
│   │   └── type-definition-validator.ts       (NEW: for ComponentSpec.TypeDefinitions)
│   └── index.ts
```

**Testing**:
- Run all constraint validator tests
- Update test terminology
- Ensure no behavioral changes

---

### Phase 3: Merge Property Validation
**Duration**: 1 week
**Goal**: Unify property validation into single rule

**Tasks**:
1. Create `ComponentPropRule` that handles:
   - Prop existence (from `dependency-prop-validation`)
   - Prop type checking (from type system)
   - Semantic validation (from `validate-component-props`)
2. Merge logic from both existing rules
3. Remove `dependency-prop-validation` rule
4. Remove `validate-component-props` rule
5. Update tests

**Changes**:

```typescript
// NEW: schema-validation/component-prop-rule.ts
export class ComponentPropRule implements LintRule {
  name = 'component-props';
  category = 'schema';

  validate(ast: t.File, context: LintContext): Violation[] {
    const violations: Violation[] = [];

    // For each component usage in AST:
    //   1. Check prop exists in component spec (schema validation)
    //   2. Check prop type matches (type validation via context)
    //   3. Run semantic validators for prop constraints
    //   4. Check required props are provided
    //   5. Warn on unknown props

    return violations;
  }
}
```

**Testing**:
- Merge tests from both old rules
- Ensure all prop violations still detected
- Add integration tests

---

### Phase 4: Split Rules Into Files
**Duration**: 1.5 weeks
**Goal**: Break monolithic file into manageable pieces

**Tasks**:
1. Create directory structure
2. Extract each rule to its own file
3. Create rule registry system
4. Update component-linter.ts to be thin orchestrator
5. Update imports across codebase

**Target Structure**:

```
packages/React/test-harness/src/lib/
├── component-linter.ts                  (~500 lines - orchestrator only)
│
├── lint-context.ts                      (NEW: LintContext interface)
├── lint-rule.ts                         (NEW: LintRule interface)
├── lint-result.ts                       (NEW: LintResult, Violation types)
│
├── type-system/
│   ├── type-inference-engine.ts         (existing)
│   ├── type-context.ts                  (existing)
│   ├── control-flow-analyzer.ts         (existing)
│   └── type-rules/
│       └── type-compatibility-rule.ts   (NEW: from Phase 1)
│
├── schema-validation/
│   ├── semantic-validators/             (from Phase 2)
│   │   ├── semantic-validator.ts
│   │   ├── semantic-validator-registry.ts
│   │   ├── validation-context.ts
│   │   ├── semantic-violation.ts
│   │   ├── subset-of-entity-fields-validator.ts
│   │   ├── sql-where-clause-validator.ts
│   │   ├── required-when-validator.ts
│   │   └── type-definition-validator.ts
│   ├── entity-schema-rule.ts            (NEW: consolidates entity rules)
│   ├── query-schema-rule.ts             (NEW: consolidates query rules)
│   └── component-prop-rule.ts           (from Phase 3)
│
├── runtime-rules/
│   ├── no-import-statements.ts
│   ├── no-require-statements.ts
│   ├── no-export-statements.ts
│   ├── no-iife-wrapper.ts
│   ├── single-function-only.ts
│   ├── use-function-declaration.ts
│   ├── react-component-naming.ts
│   ├── no-react-destructuring.ts
│   ├── use-unwrap-components.ts
│   ├── callbacks-passthrough-only.ts
│   ├── callbacks-usage-validation.ts
│   ├── pass-standard-props.ts
│   └── no-return-component.ts
│
├── best-practice-rules/
│   ├── prefer-async-await.ts
│   ├── prefer-jsx-syntax.ts
│   ├── no-use-reducer.ts
│   ├── no-window-access.ts
│   ├── no-child-implementation.ts
│   ├── no-data-prop.ts
│   ├── noisy-settings-updates.ts
│   ├── saved-user-settings-pattern.ts
│   ├── prop-state-sync.ts
│   ├── callback-parameter-validation.ts
│   ├── event-invocation-pattern.ts
│   ├── library-variable-names.ts
│   ├── unused-libraries.ts
│   ├── styles-validation.ts             (consolidates styles-* rules)
│   ├── array-operations.ts              (consolidates array rules)
│   ├── string-operations.ts             (consolidates string rules)
│   ├── useeffect-dependencies.ts
│   ├── utilities-validation.ts          (consolidates utilities-* rules)
│   ├── server-reload-prevention.ts
│   └── dependency-shadowing.ts
│
└── util/
    ├── prop-value-extractor.ts          (existing)
    ├── library-lint-cache.ts            (existing)
    └── styles-type-analyzer.ts          (existing)
```

**Rule Registration Pattern**:

```typescript
// component-linter.ts (NEW orchestrator)
export class ComponentLinter {
  private runtimeRules: LintRule[] = [];
  private typeRules: LintRule[] = [];
  private schemaRules: LintRule[] = [];
  private bestPracticeRules: LintRule[] = [];

  constructor() {
    this.registerRules();
  }

  private registerRules(): void {
    // Auto-discover and register rules
    this.runtimeRules = loadRulesFromDirectory('./runtime-rules');
    this.typeRules = loadRulesFromDirectory('./type-system/type-rules');
    this.schemaRules = loadRulesFromDirectory('./schema-validation');
    this.bestPracticeRules = loadRulesFromDirectory('./best-practice-rules');
  }

  async lint(code: string, spec: ComponentSpec): Promise<LintResult> {
    // Phase 1: Parse
    const ast = parser.parse(code);

    // Phase 2: Build Context
    const context = await this.buildContext(ast, spec);

    // Phase 3: Run Rules (in order)
    const violations: Violation[] = [];

    for (const rule of [...this.runtimeRules, ...this.typeRules, ...this.schemaRules, ...this.bestPracticeRules]) {
      if (this.shouldApplyRule(rule, spec)) {
        violations.push(...await rule.validate(ast, context));
      }
    }

    return this.buildResult(violations);
  }

  private async buildContext(ast: t.File, spec: ComponentSpec): Promise<LintContext> {
    // Run type inference ONCE
    const typeEngine = new TypeInferenceEngine(spec);
    const typeContext = await typeEngine.analyze(ast);

    // Load metadata ONCE
    const metadata = await this.loadMetadata(spec);

    // Load semantic validators
    const semanticValidators = SemanticValidatorRegistry.getInstance().getAll();

    return {
      componentName: spec.name,
      componentSpec: spec,
      typeContext,
      metadata,
      semanticValidators
    };
  }
}
```

**Testing**:
- Run full test suite after each file extraction
- Create integration test that validates all rules still work
- Performance test to ensure no regression

---

### Phase 5: Consolidate Related Rules
**Duration**: 1 week
**Goal**: Merge rules that validate the same domain

**Tasks**:
1. Merge 7 RunQuery/RunView rules into 2 rules:
   - `QueryExecutionRule` (handles RunQuery validation)
   - `EntityAccessRule` (handles RunView validation)
2. Merge entity/query field validation
3. Merge styles rules
4. Merge array operation rules
5. Merge string operation rules
6. Update tests

**Consolidation Plan**:

```typescript
// NEW: schema-validation/query-execution-rule.ts
// Consolidates:
// - runquery-parameters-validation
// - runquery-missing-categorypath
// - query-field-validation
// - query-parameter-type-validation
// - required-queries-not-called
export class QueryExecutionRule implements LintRule {
  name = 'query-execution';
  category = 'schema';

  validate(ast: t.File, context: LintContext): Violation[] {
    // Single rule that validates ALL RunQuery usage
  }
}

// NEW: schema-validation/entity-access-rule.ts
// Consolidates:
// - runview-entity-validation
// - entity-field-validation
// - runview-runquery-result-validation
// - runview-runquery-valid-properties
export class EntityAccessRule implements LintRule {
  name = 'entity-access';
  category = 'schema';

  validate(ast: t.File, context: LintContext): Violation[] {
    // Single rule that validates ALL RunView usage
  }
}
```

**Testing**:
- Ensure all violations from old rules still detected
- Update test descriptions to match new rule names

---

### Phase 6: Documentation & Polish
**Duration**: 1 week
**Goal**: Complete documentation and cleanup

**Tasks**:
1. Write comprehensive architecture documentation
2. Create developer guide for adding new rules
3. Document each rule with examples
4. Add inline code documentation
5. Create rule catalog (markdown)
6. Update README.md
7. Add performance benchmarks
8. Final code review and cleanup

**Deliverables**:

```
packages/React/test-harness/
├── ARCHITECTURE.md                      (NEW: architecture overview)
├── RULES-CATALOG.md                     (NEW: all rules documented)
├── DEVELOPER-GUIDE.md                   (NEW: how to add rules/validators)
├── COMPONENT-LINTER-REFACTOR.md         (this document)
└── README.md                            (updated)
```

**Documentation Content**:

1. **ARCHITECTURE.md**: Three-phase pipeline, subsystems, data flow
2. **RULES-CATALOG.md**: Each rule with description, examples, rationale
3. **DEVELOPER-GUIDE.md**:
   - How to add a new rule
   - How to add a semantic validator
   - How to write tests
   - Performance considerations

---

## File Structure

### Before Refactor (Current)

```
packages/React/test-harness/src/lib/
├── component-linter.ts                          10,718 lines ⚠️
├── type-inference-engine.ts
├── type-context.ts
├── control-flow-analyzer.ts
├── styles-type-analyzer.ts
├── prop-value-extractor.ts
├── library-lint-cache.ts
└── constraint-validators/
    ├── base-constraint-validator.ts
    ├── validation-context.ts
    ├── subset-of-entity-fields-validator.ts
    ├── sql-where-clause-validator.ts
    └── required-when-validator.ts
```

### After Refactor (Target)

```
packages/React/test-harness/src/lib/
├── component-linter.ts                          ~500 lines ✅
│
├── lint-context.ts                              ~50 lines
├── lint-rule.ts                                 ~50 lines
├── lint-result.ts                               ~50 lines
│
├── type-system/
│   ├── type-inference-engine.ts                 (existing)
│   ├── type-context.ts                          (existing)
│   ├── control-flow-analyzer.ts                 (existing)
│   └── type-rules/
│       └── type-compatibility-rule.ts           ~200 lines
│
├── schema-validation/
│   ├── semantic-validators/
│   │   ├── semantic-validator.ts                ~100 lines
│   │   ├── semantic-validator-registry.ts       ~100 lines
│   │   ├── validation-context.ts                (existing)
│   │   ├── semantic-violation.ts                ~50 lines
│   │   ├── subset-of-entity-fields-validator.ts (existing)
│   │   ├── sql-where-clause-validator.ts        (existing)
│   │   ├── required-when-validator.ts           (existing)
│   │   └── type-definition-validator.ts         ~150 lines
│   ├── entity-access-rule.ts                    ~300 lines
│   ├── query-execution-rule.ts                  ~300 lines
│   └── component-prop-rule.ts                   ~250 lines
│
├── runtime-rules/                               (~100 lines each)
│   ├── no-import-statements.ts
│   ├── no-require-statements.ts
│   ├── no-export-statements.ts
│   ├── no-iife-wrapper.ts
│   ├── single-function-only.ts
│   ├── use-function-declaration.ts
│   ├── react-component-naming.ts
│   ├── no-react-destructuring.ts
│   ├── use-unwrap-components.ts
│   ├── callbacks-passthrough-only.ts
│   ├── callbacks-usage-validation.ts
│   ├── pass-standard-props.ts
│   └── no-return-component.ts
│
├── best-practice-rules/                         (~100 lines each)
│   ├── prefer-async-await.ts
│   ├── prefer-jsx-syntax.ts
│   ├── no-use-reducer.ts
│   ├── no-window-access.ts
│   ├── no-child-implementation.ts
│   ├── no-data-prop.ts
│   ├── noisy-settings-updates.ts
│   ├── saved-user-settings-pattern.ts
│   ├── prop-state-sync.ts
│   ├── callback-parameter-validation.ts
│   ├── event-invocation-pattern.ts
│   ├── library-variable-names.ts
│   ├── unused-libraries.ts
│   ├── styles-validation.ts
│   ├── array-operations.ts
│   ├── string-operations.ts
│   ├── useeffect-dependencies.ts
│   ├── utilities-validation.ts
│   ├── server-reload-prevention.ts
│   └── dependency-shadowing.ts
│
└── util/
    ├── prop-value-extractor.ts                  (existing)
    ├── library-lint-cache.ts                    (existing)
    └── styles-type-analyzer.ts                  (existing)
```

**Metrics**:
- **Before**: 1 file, 10,718 lines
- **After**: ~50 files, avg ~150 lines each
- **Total Lines**: Similar (accounting for interfaces/documentation)
- **Maintainability**: Dramatically improved

---

## Testing Strategy

### 🚨 PRIMARY VALIDATION: Fixture-Based Testing

**THE MOST CRITICAL TESTING MECHANISM** for this refactor is the fixture-based test suite at `/Users/jordanfanapour/Documents/GitHub/MJ/tests/component-linter-tests/`.

#### Fixture Test Suite Overview

**303 Real Production Components** (as of 2025-01-14):
- **166 broken components** (`fixtures/broken-components/`) - MUST detect violations
- **96 fixed components** (`fixtures/fixed-components/`) - MUST have ZERO violations
- **41 valid components** (`fixtures/valid-components/`) - MUST have ZERO violations (regression)

**Fixture Organization** (Phase A + Phase B):
- **Phase A** (189 fixtures): Migrated production bugs from flat structure
  - 103 broken (70 intentionally unpaired - real production bugs)
  - 33 fixed
  - 41 valid (regression testing)
- **Phase B** (114 fixtures): Newly generated systematic type safety coverage
  - 57 broken (all properly paired with -broken suffix)
  - 57 fixed (all properly paired with -fixed suffix)

**Why This Is Critical**:
- Tests against REAL production components, not synthetic test cases
- Validates linter catches actual bugs found in production
- Ensures fixes work correctly
- Prevents regressions on known-good components
- Database-connected testing with full metadata context

#### Current Test Results (2025-01-14 Baseline)

**Test Execution Summary**:
```
Total Fixtures:  303
Total Tests:     303
Passed:          255 ✅ (84.2%)
Failed:          48 ❌ (15.8%)
Duration:        7293ms
```

**Breakdown by Category**:
- **Broken Components**: 118/166 passing (71.1%)
  - ✅ Expected: Should detect violations
  - ❌ 48 failing: Missing validation rules (not yet implemented)
- **Fixed Components**: 96/96 passing (100%) ✅
  - ✅ All passing: Zero violations as expected
- **Valid Components**: 41/41 passing (100%) ✅
  - ✅ All passing: No regressions detected

**Failed Tests Analysis** (48 fixtures expecting violations but getting 0):

These failures indicate **missing validation rules** that need to be implemented during refactor:

1. **Optional Chaining Field Validation** (3 failures):
   - `optional-chain-array-access-broken`
   - `optional-chain-deep-path-broken`
   - `optional-chain-invalid-field-broken`
   - **Missing Rule**: Entity field validation for optional chaining expressions

2. **Spread Operator Field Tracking** (1 failure):
   - `spread-field-name-conflict-broken`
   - **Missing Rule**: Track field names through spread operations

3. **Chart Property Validation** (5 failures):
   - `chart-aggregate-field-wrong-broken`
   - `chart-data-empty-fields-broken`
   - `chart-groupby-field-invalid-broken`
   - `chart-series-field-invalid-broken`
   - `chart-valuefield-missing-broken`
   - **Missing Rule**: Chart component property validation with PropValueExtractor

4. **Component Property Validation** (7 failures):
   - `component-prop-name-case-broken`
   - `component-prop-name-nonexistent-broken`
   - `component-prop-name-typo-broken`
   - `component-prop-type-*-broken` (4 type mismatch fixtures)
   - **Missing Rule**: Component property name/type validation using ComponentMetadataEngine

5. **DataGrid Field Validation** (8 failures):
   - `datagrid-entity-field-*-broken` (3 fixtures)
   - `datagrid-entity-strings-invalid-broken`
   - `datagrid-mixed-source-invalid-broken`
   - `datagrid-query-field-*-broken` (3 fixtures)
   - **Missing Rule**: DataGrid column validation for both entity and query sources

6. **Entity Field Validation** (8 failures):
   - `entity-array-*-invalid-broken` (4 fixtures: filter, map, reduce, sort)
   - `entity-field-case-broken`
   - `entity-field-nonexistent-broken`
   - `entity-field-type-coercion-broken`
   - `entity-field-typo-broken`
   - **Missing Rule**: Entity field access validation in array operations

7. **Query Parameter Type Validation** (4 failures):
   - `query-param-computed-wrong-type-broken`
   - `query-param-required-null-broken`
   - `query-param-state-wrong-type-broken`
   - `query-param-type-array-to-scalar-broken`
   - **Missing Rule**: Deep type checking for query parameter values (computed, state, arrays)

8. **Query Result Field Validation** (3 failures):
   - `query-result-filter-invalid-field-broken`
   - `query-result-map-invalid-field-broken`
   - `query-result-reduce-invalid-field-broken`
   - **Missing Rule**: Query result field access validation in array operations

9. **Cross-Component Data Flow** (7 failures):
   - `cross-component-aggregate-field-type-broken`
   - `cross-component-computed-field-typo-broken`
   - `cross-component-entity-to-grid-broken`
   - `cross-component-field-mismatch-broken`
   - `cross-component-filter-field-access-broken`
   - `cross-component-multiple-transforms-broken`
   - `cross-component-transform-field-lost-broken`
   - **Missing Rule**: Type inference for data transformations across component boundaries

10. **Pipeline Data Flow** (2 failures):
    - `pipeline-entity-to-filter-to-grid-broken`
    - `pipeline-query-to-transform-to-chart-broken`
    - **Missing Rule**: End-to-end data flow analysis through transformation pipelines

**Success Stories** (118 rules working correctly):
- ✅ All runtime rules working (component structure, lifecycle, React restrictions)
- ✅ Result access validation working (`.Results` vs `.records`)
- ✅ Query parameter existence validation working
- ✅ Entity name validation working
- ✅ Component dependency validation working
- ✅ Best practice rules working (callbacks, dependencies, state management, etc.)

**Refactor Priority** (based on test failures):
1. **High Priority** (16 failures): Entity/Query field validation in array operations
2. **High Priority** (15 failures): Component/Chart/DataGrid property validation
3. **Medium Priority** (9 failures): Cross-component data flow analysis
4. **Medium Priority** (4 failures): Deep query parameter type validation
5. **Low Priority** (4 failures): Optional chaining field validation and spread tracking

#### Fixture Testing Commands

```bash
# Run ALL fixture tests (PRIMARY validation after each phase)
cd /Users/jordanfanapour/Documents/GitHub/MJ/tests/component-linter-tests
npm run test:fixtures

# Test a single fixture (useful during development)
npm run test:fixture fixtures/broken-components/broken-10.json
npm run test:fixture fixtures/fixed-components/fix-10.json
npm run test:fixture fixtures/valid-components/win-loss-analysis.json

# Run all tests (basic + fixtures)
npm run test:all
```

#### Expected Fixture Behavior

```typescript
// ✅ CORRECT: Broken fixtures must detect violations
describe('Broken Components - Should Detect Violations', () => {
  it('broken-10.json - should detect result?.records ?? result?.Rows pattern', async () => {
    const result = await lintFixture('broken', 'broken-10');
    expect(result.violations.length).toBeGreaterThan(0);
    // Verify specific violations are caught
  });
});

// ✅ CORRECT: Fixed/valid fixtures must pass cleanly
describe('Fixed Components - Should Have No Violations', () => {
  it('fix-10.json - should NOT detect violations (uses correct .Results)', async () => {
    const result = await lintFixture('fixed', 'fix-10');
    expect(result.violations.length).toBe(0);
  });
});
```

### Test Baseline (Phase 0)

Before starting refactor, establish baseline for BOTH package tests AND fixtures:

```bash
# 1. Run package-level tests
cd /Users/jordanfanapour/Documents/GitHub/MJ/packages/React/test-harness
npm test > package-test-baseline.txt 2>&1

# 2. Run fixture tests (PRIMARY VALIDATION)
cd /Users/jordanfanapour/Documents/GitHub/MJ/tests/component-linter-tests
npm run test:fixtures > fixture-test-baseline.txt 2>&1

# 3. Count violations by rule from fixtures
grep "Rule:" fixture-test-baseline.txt | sort | uniq -c > fixture-violation-counts.txt

# 4. Save baseline for comparison
cp fixture-test-baseline.txt fixture-test-baseline-phase0.txt
```

### Test Categories

1. **Fixture Tests** (PRIMARY) - Real production components with known bugs/fixes
2. **Package Unit Tests** - Test individual rules in isolation
3. **Integration Tests** - Test rule interactions and pipeline
4. **Performance Tests** - Validate improvements

### Existing Test Files

**Package-Level Tests** (`packages/React/test-harness/tests/`):
```
tests/
├── linter-dependency-events.spec.ts        (dependency validation)
├── linter-optional-chaining-validation.spec.ts (RunQuery/RunView result access)
├── linter-runquery-validation.spec.ts      (RunQuery validation)
├── linter-type-validation.spec.ts          (type checking - NEW)
├── test-dependency-shadowing.ts            (variable shadowing)
├── test-harness.spec.ts                    (component execution)
├── test-runquery-data-bug.ts               (RunQuery edge cases)
└── test-whitelist-validation.ts            (entity/query whitelisting)
```

**Fixture Tests** (`tests/component-linter-tests/`):
```
tests/component-linter-tests/
├── fixtures/
│   ├── broken-components/                     (166 components with known bugs)
│   │   ├── runtime-rules/                     (22 fixtures - Phase A)
│   │   │   ├── component-structure/
│   │   │   ├── component-lifecycle/
│   │   │   ├── utilities-usage/
│   │   │   └── react-restrictions/
│   │   ├── schema-validation/                 (62 fixtures - Phase A + Phase B)
│   │   │   ├── entity-validation/             (8 broken Phase A + 8 broken Phase B)
│   │   │   ├── query-validation/              (14 broken Phase A + 14 broken Phase B)
│   │   │   ├── component-validation/          (7 broken Phase A + 7 broken Phase B)
│   │   │   ├── data-grid-validation/          (8 broken Phase A + 8 broken Phase B)
│   │   │   ├── chart-validation/              (5 broken Phase A + 5 broken Phase B)
│   │   │   └── result-access-validation/      (9 fixtures - Phase A)
│   │   ├── type-rules/                        (9 fixtures - Phase B)
│   │   │   ├── cross-component/               (7 broken Phase B)
│   │   │   └── pipeline/                      (2 broken Phase B)
│   │   └── best-practice-rules/               (35 fixtures - Phase A + Phase B)
│   │       ├── async-patterns/
│   │       ├── callbacks/
│   │       ├── data-operations/               (includes 3 spread + 3 optional Phase B)
│   │       ├── dependencies/
│   │       ├── jsx-patterns/
│   │       ├── misc/
│   │       ├── parameters/
│   │       ├── state-management/
│   │       ├── string-operations/
│   │       └── styling/
│   ├── fixed-components/                      (96 corrected versions)
│   │   ├── schema-validation/                 (57 fixtures - Phase B only)
│   │   │   ├── entity-validation/             (8 fixed Phase B)
│   │   │   ├── query-validation/              (14 fixed Phase B)
│   │   │   ├── component-validation/          (7 fixed Phase B)
│   │   │   ├── data-grid-validation/          (8 fixed Phase B)
│   │   │   ├── chart-validation/              (5 fixed Phase B)
│   │   │   └── result-access-validation/      (3 fixtures - Phase A)
│   │   ├── type-rules/                        (9 fixtures - Phase B)
│   │   │   ├── cross-component/               (7 fixed Phase B)
│   │   │   └── pipeline/                      (2 fixed Phase B)
│   │   └── best-practice-rules/               (18 fixtures - Phase A + Phase B)
│   │       ├── data-operations/               (includes 3 spread + 3 optional Phase B)
│   │       ├── dependencies/
│   │       └── parameters/
│   └── valid-components/                      (41 production components - Phase A)
├── src/
│   ├── run-basic-tests.ts                     (inline code tests)
│   ├── run-fixture-tests.ts                   (fixture test runner)
│   ├── lint-single-fixture.ts                 (single fixture linter)
│   └── tests/
│       └── fixture-tests.ts                   (fixture test suite)
└── README.md
```

### New Tests to Add

```
packages/React/test-harness/tests/
├── integration/
│   ├── full-pipeline.spec.ts               (test complete lint process)
│   ├── type-context-sharing.spec.ts        (verify single type inference)
│   └── semantic-validators.spec.ts         (validator plugin system)
│
├── unit/
│   ├── type-rules/
│   │   └── type-compatibility-rule.spec.ts
│   ├── schema-rules/
│   │   ├── entity-access-rule.spec.ts
│   │   ├── query-execution-rule.spec.ts
│   │   └── component-prop-rule.spec.ts
│   └── runtime-rules/
│       └── [one test per rule].spec.ts
│
└── performance/
    ├── baseline.spec.ts                    (current performance)
    ├── post-refactor.spec.ts               (new performance)
    └── benchmarks.ts                       (perf utilities)
```

### Testing Process Per Phase

**MANDATORY: After EVERY phase, run fixture tests to prevent regressions**

Each phase must:
1. ✅ **Run fixture tests** (`npm run test:fixtures`) - MUST pass with same violation counts
2. ✅ Run package unit tests (`npm test`) - must pass
3. ✅ Add new tests for new code
4. ✅ Update tests for changed behavior
5. ✅ Run performance benchmarks
6. ✅ Document any changes

Example workflow:
```bash
# After completing Phase 1 (Extract Type System)
cd /Users/jordanfanapour/Documents/GitHub/MJ/tests/component-linter-tests

# Run all fixture tests
npm run test:fixtures

# Compare with baseline
diff fixture-test-baseline-phase0.txt fixture-test-phase1.txt

# MUST see:
# - Same violation counts for broken fixtures
# - Zero violations for fixed/valid fixtures
# - No new unexpected violations
```

### Regression Prevention

**Fixture-Based Regression Testing** (PRIMARY):
```typescript
// tests/component-linter-tests/src/tests/regression.spec.ts
describe('Regression: Fixture Violation Parity', () => {
  it('should detect same violations as baseline for broken fixtures', async () => {
    const baseline = loadBaselineFixtureViolations(); // From Phase 0
    const brokenFixtures = await loadFixturesByCategory('broken');

    for (const fixture of brokenFixtures) {
      const result = await lintFixture('broken', fixture.name);
      const expectedCount = baseline[fixture.name];

      expect(result.violations.length).toBe(expectedCount);
    }
  });

  it('should have zero violations for all fixed fixtures', async () => {
    const fixedFixtures = await loadFixturesByCategory('fixed');

    for (const fixture of fixedFixtures) {
      const result = await lintFixture('fixed', fixture.name);
      expect(result.violations.length).toBe(0);
    }
  });

  it('should have zero violations for all valid fixtures', async () => {
    const validFixtures = await loadFixturesByCategory('valid');

    for (const fixture of validFixtures) {
      const result = await lintFixture('valid', fixture.name);
      expect(result.violations.length).toBe(0);
    }
  });
});
```

**Package-Level Regression Testing** (SECONDARY):
```typescript
// packages/React/test-harness/tests/regression/violation-parity.spec.ts
describe('Regression: Package Test Violation Parity', () => {
  it('should detect same violations as baseline', async () => {
    const baseline = loadBaselineViolations();
    const current = await runLinterOnTestCases();

    for (const [rule, count] of baseline.entries()) {
      expect(current.get(rule)).toBe(count);
    }
  });
});
```

### Validation Checklist Per Phase

After each phase, verify:

- [ ] All 110 broken fixtures still detect violations (no false negatives)
- [ ] All 39 fixed fixtures pass with zero violations (no false positives)
- [ ] All 41 valid fixtures pass with zero violations (no regressions)
- [ ] Package unit tests pass
- [ ] No performance degradation (< 5% slowdown acceptable)
- [ ] New code has test coverage
- [ ] Documentation updated

---

## Implementation Guide

### Getting Started

```bash
# 1. Create refactor branch
git checkout -b refactor/component-linter-architecture

# 2. Baseline tests
cd packages/React/test-harness
npm test > ../../REFACTOR-test-baseline.txt 2>&1

# 3. Create tracking document
# (This file serves as the tracking document)
```

### Phase-by-Phase Workflow

For each phase:

```bash
# 1. Create phase branch
git checkout -b refactor/phase-N-description

# 2. Make changes (see phase tasks above)

# 3. Run tests continuously
npm test -- --watch

# 4. Run full test suite
npm test

# 5. Compare with baseline
diff test-baseline.txt current-test-output.txt

# 6. Update this document with progress

# 7. Commit and push
git add .
git commit -m "Phase N: [description] - [what was done]"
git push origin refactor/phase-N-description

# 8. Create PR for review
# 9. Merge to refactor/component-linter-architecture
# 10. Continue to next phase
```

### Code Style Guidelines

When extracting rules:

```typescript
// 1. Each rule in its own file
// 2. Use consistent structure:

import { LintRule, LintContext, Violation } from '../lint-rule';
import * as t from '@babel/types';
import traverse from '@babel/traverse';

/**
 * RuleName - Description of what this rule validates
 *
 * @category runtime|type|schema|best-practice
 * @severity critical|high|medium|low
 *
 * ## Rationale
 * Why this rule exists
 *
 * ## Examples
 *
 * ### ❌ Violation
 * ```typescript
 * // Bad code example
 * ```
 *
 * ### ✅ Correct
 * ```typescript
 * // Good code example
 * ```
 */
export class RuleNameRule implements LintRule {
  name = 'rule-name';
  category = 'runtime';
  severity = 'critical';
  appliesTo = 'all';

  validate(ast: t.File, context: LintContext): Violation[] {
    const violations: Violation[] = [];

    traverse(ast, {
      // Visitor methods
    });

    return violations;
  }
}
```

### Commit Message Format

```
Phase N: [Category] - [Short description]

- [Detailed change 1]
- [Detailed change 2]
- [Detailed change 3]

Tests: [pass/fail]
Performance: [improved/same/regressed]
```

Example:
```
Phase 1: Type System - Extract type compatibility rule

- Created type-rules/type-compatibility-rule.ts
- Consolidated type checking from 3 rules into one
- Made TypeInferenceEngine run once before rules
- Updated component-linter.ts to inject TypeContext

Tests: ✅ All pass (47/47)
Performance: ✅ 23% faster (type inference runs once)
```

---

## Reference Materials

### Key Files to Understand

#### 1. Component Linter (Current)
```
Location: packages/React/test-harness/src/lib/component-linter.ts
Lines: 10,718
Key Sections:
  - Line 280: ComponentLinter class definition
  - Line 363-8421: Rule definitions (universalComponentRules array)
  - Line 8458: lintComponent method (entry point)
  - Line 8630: Helper methods
```

#### 2. Type Inference Engine
```
Location: packages/React/test-harness/src/lib/type-inference-engine.ts
Purpose: Infers types from AST
Key Methods:
  - analyze(ast): Main entry point
  - inferVariableType(): Variable type inference
  - inferExpressionType(): Expression type inference
```

#### 3. Type Context
```
Location: packages/React/test-harness/src/lib/type-context.ts
Purpose: Stores and manages type information
Key Methods:
  - setVariableType(): Record variable type
  - getVariableType(): Retrieve variable type
  - isAssignmentCompatible(): Check type compatibility
```

#### 4. Constraint Validators (to be renamed)
```
Location: packages/React/test-harness/src/lib/constraint-validators/
Files:
  - base-constraint-validator.ts: Base class
  - validation-context.ts: Context for validators
  - subset-of-entity-fields-validator.ts: Entity field validation
  - sql-where-clause-validator.ts: SQL clause validation
  - required-when-validator.ts: Conditional requirements
```

#### 5. Prop Value Extractor
```
Location: packages/React/test-harness/src/lib/prop-value-extractor.ts
Purpose: Extracts static values from JSX props
Key Methods:
  - extract(): Extract value from JSX attribute
  - inferType(): Infer JavaScript type (just added)
  - isTypeCompatible(): Check type compatibility (just added)
```

### Component Spec Structure

Understanding the ComponentSpec is crucial for validation:

```typescript
interface ComponentSpec {
  name: string;
  type: 'chart' | 'table' | 'form' | 'component';
  title?: string;

  // Data requirements
  dataRequirements?: {
    mode: 'entities' | 'queries' | 'hybrid';
    entities?: EntityRequirement[];
    queries?: QueryRequirement[];
  };

  // Dependencies (other components)
  dependencies?: ComponentDependency[];

  // Libraries (external JS libraries)
  libraries?: LibraryRequirement[];

  // Component properties
  properties?: PropertyDefinition[];

  // NEW: Custom type definitions
  TypeDefinitions?: Record<string, TypeDefinition>;

  // Code
  code: string;
}

interface PropertyDefinition {
  name: string;
  type: string;
  required?: boolean;
  description?: string;

  // Constraint validators (to be renamed semantic validators)
  constraints?: PropertyConstraint[];
}

interface PropertyConstraint {
  type: string;  // e.g., 'subset-of-entity-fields', 'sql-where-clause'
  parameters?: Record<string, any>;
}
```

### MJ Runtime Context

Rules validate that components work with the MJ runtime:

```typescript
// Standard props passed to all components
interface MJComponentProps {
  utilities: {
    rv: RunViewAPI;
    rq: RunQueryAPI;
    md: MetadataAPI;
  };
  styles: StylesObject;
  components: Record<string, React.ComponentType>;
  callbacks: {
    OpenEntityRecord: (entityName: string, keys: KeyValuePair[]) => void;
    // ... other callbacks
  };
  savedUserSettings: any;
  onSaveUserSettings: (settings: any) => void;
}
```

### AST Traversal Patterns

Common patterns used in rules:

```typescript
// Pattern 1: Find all function declarations
traverse(ast, {
  FunctionDeclaration(path) {
    // Validate function
  }
});

// Pattern 2: Find specific API calls
traverse(ast, {
  CallExpression(path) {
    const callee = path.node.callee;
    if (t.isMemberExpression(callee) &&
        t.isIdentifier(callee.property) &&
        callee.property.name === 'RunQuery') {
      // Validate RunQuery call
    }
  }
});

// Pattern 3: Find JSX component usage
traverse(ast, {
  JSXElement(path) {
    const elementName = getElementName(path.node.openingElement);
    // Validate component usage
  }
});

// Pattern 4: Track variable types
const binding = path.scope.getBinding(variableName);
if (binding) {
  const variableType = inferTypeFromBinding(binding);
}
```

### Useful Babel AST Utilities

```typescript
import * as t from '@babel/types';

// Type checking
t.isIdentifier(node)
t.isMemberExpression(node)
t.isCallExpression(node)
t.isJSXElement(node)
t.isFunctionDeclaration(node)

// Node creation
t.identifier('name')
t.memberExpression(obj, prop)
t.callExpression(callee, args)

// Node information
node.loc?.start.line       // Line number
node.loc?.start.column     // Column number
path.toString()            // Code as string
path.scope.getBinding()    // Variable binding
```

### Violation Severity Guidelines

```
critical: Prevents component from running
  - Syntax errors
  - Import/export statements
  - Missing required props
  - Type mismatches that cause runtime errors

high: Likely to cause runtime errors
  - Undefined variables
  - Invalid entity/query access
  - Incorrect API usage

medium: May cause issues or poor performance
  - Missing optional validations
  - Suboptimal patterns
  - Potential edge cases

low: Style/convention violations
  - Naming conventions
  - Prefer patterns
  - Code organization
```

---

## Progress Tracking

### Phase 0: Documentation & Planning
- [x] Create COMPONENT-LINTER-REFACTOR.md
- [x] Baseline all tests (303 fixtures: 255 passing, 48 expected failures)
- [x] Document missing validation rules (48 failures analyzed)
- [x] Update fixture directory structure documentation
- [ ] Review and approve architecture
- [ ] Create refactor branch
- [ ] Document current rule behaviors in detail

### Phase 1: Extract Type System ✅ COMPLETE
- [x] Create type-rules/ directory
- [x] Implement TypeCompatibilityRule
- [x] Update ComponentLinter to run type inference once
- [x] TypeContext shared across all rules via centralized inference
- [x] Mark deprecated rules (type-inference-errors, type-mismatch-operation)
- [x] Tests pass (255/303 fixtures passing - same baseline)
- [x] Performance improved (type inference runs once, not per rule)

**Completion Date**: 2025-12-11
**Changes**:
- Created `/src/lib/type-rules/type-compatibility-rule.ts`
- Updated `lintComponent()` to run TypeInferenceEngine once before all rules
- Created LintContext interface with TypeContext, TypeEngine, and ControlFlowAnalyzer
- TypeCompatibilityRule consolidates: type inference errors, binary operations, array/string method calls
- Old type rules marked as deprecated (will be removed after validation)
- Build successful with no compilation errors
- Fixture tests: 255/303 passing (48 expected failures match baseline)

### Phase 2: Rename & Reorganize Validators
- [ ] Rename constraint-validators → semantic-validators
- [ ] Rename BaseConstraintValidator → SemanticValidator
- [ ] Update all terminology
- [ ] Create SemanticValidatorRegistry
- [ ] Move to schema-validation/
- [ ] Tests pass

### Phase 3: Merge Property Validation
- [ ] Create ComponentPropRule
- [ ] Merge dependency-prop-validation logic
- [ ] Merge validate-component-props logic
- [ ] Remove old rules
- [ ] Update tests
- [ ] Tests pass

### Phase 4: Split Rules Into Files
- [ ] Create directory structure
- [ ] Extract runtime rules (13 files)
- [ ] Extract schema rules (3 files)
- [ ] Extract best practice rules (19 files)
- [ ] Update component-linter.ts orchestrator
- [ ] Create rule registry system
- [ ] Tests pass

### Phase 5: Consolidate Related Rules
- [ ] Create QueryExecutionRule (7 rules → 1)
- [ ] Create EntityAccessRule (4 rules → 1)
- [ ] Merge styles rules
- [ ] Merge array/string rules
- [ ] Update tests
- [ ] Tests pass

### Phase 6: Documentation & Polish
- [ ] Write ARCHITECTURE.md
- [ ] Write RULES-CATALOG.md
- [ ] Write DEVELOPER-GUIDE.md
- [ ] Update README.md
- [ ] Add performance benchmarks
- [ ] Code review
- [ ] Final cleanup

---

## Success Metrics

At completion, we should achieve:

### Code Quality
- ✅ No file over 500 lines
- ✅ Average rule file: ~150 lines
- ✅ Clear separation of concerns
- ✅ Consistent code style
- ✅ Comprehensive documentation

### Performance
- ✅ Type inference runs once (not per rule)
- ✅ 30%+ improvement in lint time
- ✅ Reduced memory usage

### Maintainability
- ✅ New rules can be added in <100 lines
- ✅ Rules are independently testable
- ✅ Clear extension points documented

### Testing
- ✅ 100% of existing tests pass
- ✅ No regression in violation detection
- ✅ New integration tests added
- ✅ Performance benchmarks established

### Documentation
- ✅ Architecture documented
- ✅ All rules documented with examples
- ✅ Developer guide for extensions
- ✅ Migration guide for rule authors

---

## Risk Mitigation

### Risk 1: Breaking Existing Functionality
**Mitigation**:
- Baseline all tests before starting
- Run tests after each change
- Keep old rules marked @deprecated during transition
- Use feature flags to gradually roll out changes

### Risk 2: Performance Regression
**Mitigation**:
- Establish performance baseline
- Run benchmarks after each phase
- Profile type inference engine
- Monitor memory usage

### Risk 3: Incomplete Migration
**Mitigation**:
- Complete phases sequentially
- Don't start next phase until current is 100% done
- Maintain checklist in this document
- Regular code reviews

### Risk 4: Breaking Tests in Other Packages
**Mitigation**:
- Run full monorepo test suite: `npm test` from root
- Check for import usage across packages
- Update imports incrementally
- Communicate changes to team

---

## Questions & Decisions

### Open Questions

1. **Q**: Should we keep backward compatibility with old rule names?
   **A**: TBD - discuss with team

2. **Q**: Should semantic validators be auto-discovered or explicitly registered?
   **A**: TBD - explicit registration is safer

3. **Q**: Should we add rule categories to ComponentSpec for selective linting?
   **A**: TBD - could be useful for performance

### Architectural Decisions

1. **AD-001**: Type inference runs once before all rules
   - **Rationale**: Performance, consistency
   - **Status**: ✅ Approved

2. **AD-002**: Rename constraint validators to semantic validators
   - **Rationale**: Clearer terminology
   - **Status**: ✅ Approved

3. **AD-003**: Split into 4 rule categories (runtime, type, schema, best-practice)
   - **Rationale**: Clear separation of concerns
   - **Status**: ✅ Approved

4. **AD-004**: Each rule in its own file
   - **Rationale**: Maintainability
   - **Status**: ✅ Approved

---

## Notes & Learnings

### 2025-01-14: Initial Planning
- Identified 60 rules in monolithic file
- Found overlap between dependency-prop-validation and validate-component-props
- Type validation scattered across 3+ rules
- Constraint validators underutilized (only 1 rule uses them)

### Tips for Implementer

1. **Don't rush**: Each phase builds on the previous. Ensure stability before moving forward.

2. **Test constantly**: Run tests after every significant change, not just at phase end.

3. **Use git branches**: One branch per phase makes rollback easier if needed.

4. **Document as you go**: Update this document with discoveries and decisions.

5. **Preserve behavior**: The goal is refactoring, not changing functionality.

6. **Ask for reviews**: Complex architectural changes benefit from multiple perspectives.

---

## Appendix

### A. Full Rule List (Current)

See "Current Rule Categories" section above for complete list of 60 rules.

### B. Type Inference Engine Interface

```typescript
interface TypeInferenceEngine {
  analyze(ast: t.File): Promise<TypeInferenceResult>;
  inferVariableType(node: t.Node): TypeInfo;
  inferExpressionType(expr: t.Expression): TypeInfo;
}

interface TypeInferenceResult {
  typeContext: TypeContext;
  errors: TypeInferenceError[];
}

interface TypeContext {
  getVariableType(name: string): TypeInfo | undefined;
  setVariableType(name: string, type: TypeInfo): void;
  isAssignmentCompatible(source: TypeInfo, target: TypeInfo): boolean;
  getAllViolations(): TypeViolation[];
}
```

### C. Semantic Validator Interface

```typescript
interface SemanticValidator {
  type: string;
  validate(context: ValidationContext, config: ValidatorConfig): SemanticViolation[];
}

interface ValidationContext {
  node: t.Node;
  path: NodePath<t.Node>;
  componentName: string;
  componentSpec: ComponentSpec;
  propertyName: string;
  propertyValue: any;
  siblingProps: Map<string, any>;
  getEntityFields(entityName: string): EntityFieldInfo[];
  getQueryParameters(queryName: string): QueryParameter[];
  // ... other helpers
}

interface SemanticViolation {
  severity: 'critical' | 'high' | 'medium' | 'low';
  message: string;
  suggestion?: string;
}
```

### D. Useful Commands

```bash
# Count rules
grep "name: '" component-linter.ts | wc -l

# Find rule definition
grep -n "name: 'rule-name'" component-linter.ts

# Count lines in rule
sed -n 'START,END p' component-linter.ts | wc -l

# Run specific test
npm test -- linter-runquery-validation.spec.ts

# Run tests in watch mode
npm test -- --watch

# Build package
npm run build

# Check TypeScript errors
npx tsc --noEmit
```

---

**Document Status**: ✅ Complete with Test Baseline
**Current Phase**: Phase 0 - Documentation & Planning (60% complete)
**Next Step**: Review architecture and create refactor branch
**Owner**: Jordan Fanapour
**Reviewers**: TBD

---

## Recent Updates

### 2025-01-14: Test Baseline Complete
- ✅ Ran all 303 fixture tests
- ✅ Results: 255 passing (84.2%), 48 expected failures (15.8%)
- ✅ Analyzed 48 failures → identified 10 categories of missing validation rules
- ✅ Updated fixture directory structure documentation (Phase A + Phase B)
- ✅ Established refactor priorities based on test failures
- 📊 High priority: Field validation in array operations (31 failures)
- 📊 Medium priority: Cross-component and query parameter validation (13 failures)
- 📊 Low priority: Optional chaining and spread tracking (4 failures)

**Key Insight**: 71% of broken fixture tests passing shows current linter is catching most bugs. The 48 failures represent advanced validation capabilities (field-level type checking, cross-component data flow) that will be added during refactor.

---

*This document will be updated throughout the refactoring process to track progress, decisions, and learnings.*
