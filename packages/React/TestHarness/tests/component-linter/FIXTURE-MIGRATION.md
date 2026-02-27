# Fixture Directory Migration Guide

## Overview

This document provides step-by-step instructions for reorganizing the component linter test fixtures to align with the refactored linter architecture. The migration reorganizes 110 broken and 39 fixed component fixtures into a structured hierarchy based on rule categories.

## Goals

1. **Mirror Linter Architecture**: Organize fixtures by the 4 rule types (runtime, type, schema, best-practice)
2. **Parallel Structure**: Broken and fixed directories use identical organization
3. **Preserve Valid Components**: Leave the 41 valid production components unchanged
4. **Maintain Test Compatibility**: All existing tests must pass after migration

## Current State

```
fixtures/
├── broken-components/    (110 flat files + README.md)
├── fixed-components/     (39 flat files)
└── valid-components/     (41 files - DO NOT CHANGE)
```

## Target State

```
fixtures/
├── broken-components/
│   ├── README.md                    (keep at root)
│   ├── runtime-rules/
│   │   ├── component-structure/     (6 files)
│   │   ├── component-lifecycle/     (3 files)
│   │   ├── utilities-usage/         (6 files)
│   │   └── react-restrictions/      (7 files)
│   ├── type-rules/                  (6 files)
│   ├── schema-validation/
│   │   ├── entity-validation/       (6 files)
│   │   ├── query-validation/        (14 files)
│   │   ├── component-validation/    (7 files)
│   │   ├── data-grid-validation/    (7 files)
│   │   ├── chart-validation/        (3 files)
│   │   └── result-access-validation/ (9 files)
│   └── best-practice-rules/
│       ├── async-patterns/          (1 file)
│       ├── jsx-patterns/            (1 file)
│       ├── state-management/        (3 files)
│       ├── callbacks/               (4 files)
│       ├── dependencies/            (6 files)
│       ├── data-operations/         (8 files)
│       ├── string-operations/       (2 files)
│       ├── styling/                 (2 files)
│       ├── parameters/              (6 files)
│       └── misc/                    (5 files)
│
├── fixed-components/
│   ├── runtime-rules/               (parallel structure)
│   ├── type-rules/                  (4 files)
│   ├── schema-validation/
│   │   ├── entity-validation/       (2 files)
│   │   ├── query-validation/        (9 files)
│   │   ├── data-grid-validation/    (12 files)
│   │   └── result-access-validation/ (5 files)
│   └── best-practice-rules/
│       └── parameters/              (1 file)
│
└── valid-components/                (UNCHANGED - 41 files)
```

## File Mapping

### Broken Components → New Locations

#### Runtime Rules - Component Structure (6 files)
```
component-name-mismatch.json          → runtime-rules/component-structure/
no-export-statements.json             → runtime-rules/component-structure/
no-import-statements.json             → runtime-rules/component-structure/
no-return-component.json              → runtime-rules/component-structure/
single-function-only.json             → runtime-rules/component-structure/
use-function-declaration.json         → runtime-rules/component-structure/
```

#### Runtime Rules - Component Lifecycle (3 files)
```
library-cleanup.json                  → runtime-rules/component-lifecycle/
library-initialization.json           → runtime-rules/component-lifecycle/
library-lifecycle.json                → runtime-rules/component-lifecycle/
```

#### Runtime Rules - Utilities Usage (6 files)
```
utilities-ai-methods.json             → runtime-rules/utilities-usage/
utilities-metadata-methods.json       → runtime-rules/utilities-usage/
utilities-no-direct-instantiation.json → runtime-rules/utilities-usage/
utilities-runquery-methods.json       → runtime-rules/utilities-usage/
utilities-runview-methods.json        → runtime-rules/utilities-usage/
utilities-valid-properties.json       → runtime-rules/utilities-usage/
```

#### Runtime Rules - React Restrictions (7 files)
```
no-iife-wrapper.json                  → runtime-rules/react-restrictions/
no-react-destructuring.json           → runtime-rules/react-restrictions/
no-require-statements.json            → runtime-rules/react-restrictions/
no-use-reducer.json                   → runtime-rules/react-restrictions/
no-window-access.json                 → runtime-rules/react-restrictions/
react-component-naming.json           → runtime-rules/react-restrictions/
react-hooks-rules.json                → runtime-rules/react-restrictions/
```

#### Type Rules (6 files)
```
dependency-prop-type-mismatch.json    → type-rules/
dependency-prop-variable-type-mismatch.json → type-rules/
function-scope-type-mismatch.json     → type-rules/
query-param-variable-type-mismatch.json → type-rules/
type-mismatch-array-methods.json      → type-rules/
type-operation-mismatch.json          → type-rules/
```

#### Schema Validation - Entity Validation (6 files)
```
entity-field-destructuring.json       → schema-validation/entity-validation/
entity-field-invalid.json             → schema-validation/entity-validation/
entity-field-optional-chaining.json   → schema-validation/entity-validation/
entity-name-mismatch.json             → schema-validation/entity-validation/
runview-entity-validation.json        → schema-validation/entity-validation/
field-not-in-requirements.json        → schema-validation/entity-validation/
```

#### Schema Validation - Query Validation (14 files)
```
query-bit-param-invalid.json          → schema-validation/query-validation/
query-extra-unknown-params.json       → schema-validation/query-validation/
query-field-invalid.json              → schema-validation/query-validation/
query-field-typo.json                 → schema-validation/query-validation/
query-name-mismatch.json              → schema-validation/query-validation/
query-param-type-invalid.json         → schema-validation/query-validation/
missing-query-parameter.json          → schema-validation/query-validation/
unknown-query-parameter.json          → schema-validation/query-validation/
required-queries-not-called.json      → schema-validation/query-validation/
runquery-missing-categorypath.json    → schema-validation/query-validation/
runquery-parameters-validation.json   → schema-validation/query-validation/
```

#### Schema Validation - Component Validation (7 files)
```
component-not-in-dependencies.json    → schema-validation/component-validation/
dependency-prop-validation.json       → schema-validation/component-validation/
undefined-component-usage.json        → schema-validation/component-validation/
undefined-jsx-component.json          → schema-validation/component-validation/
validate-component-references.json    → schema-validation/component-validation/
unused-component-dependencies.json    → schema-validation/component-validation/
component-usage-without-destructuring.json → schema-validation/component-validation/
```

#### Schema Validation - Data Grid Validation (7 files)
```
data-grid-columndef-unknown-prop.json → schema-validation/data-grid-validation/
data-grid-invalid-columns.json        → schema-validation/data-grid-validation/
entity-grid-case-mismatch.json        → schema-validation/data-grid-validation/
entity-grid-case-sensitivity.json     → schema-validation/data-grid-validation/
entity-grid-fielddef-missing-field.json → schema-validation/data-grid-validation/
entity-grid-invalid-fields.json       → schema-validation/data-grid-validation/
simple-drilldown-invalid-gridfields.json → schema-validation/data-grid-validation/
```

#### Schema Validation - Chart Validation (3 files)
```
simple-chart-average-missing-valuefield.json → schema-validation/chart-validation/
simple-chart-min-missing-valuefield.json → schema-validation/chart-validation/
simple-chart-missing-valuefield.json  → schema-validation/chart-validation/
```

#### Schema Validation - Result Access Validation (9 files)
```
broken-10.json                        → schema-validation/result-access-validation/
optional-chain-fallback.json          → schema-validation/result-access-validation/
optional-chain-records.json           → schema-validation/result-access-validation/
result-field-invalid.json             → schema-validation/result-access-validation/
runquery-runview-direct-setstate.json → schema-validation/result-access-validation/
runquery-runview-result-structure.json → schema-validation/result-access-validation/
runview-runquery-result-direct-usage.json → schema-validation/result-access-validation/
runview-runquery-valid-properties.json → schema-validation/result-access-validation/
validate-runview-runquery-result-access.json → schema-validation/result-access-validation/
```

#### Best Practice Rules - Async Patterns (1 file)
```
prefer-async-await.json               → best-practice-rules/async-patterns/
```

#### Best Practice Rules - JSX Patterns (1 file)
```
prefer-jsx-syntax.json                → best-practice-rules/jsx-patterns/
```

#### Best Practice Rules - State Management (3 files)
```
noisy-settings-updates.json           → best-practice-rules/state-management/
saved-user-settings-pattern.json      → best-practice-rules/state-management/
prop-state-sync.json                  → best-practice-rules/state-management/
```

#### Best Practice Rules - Callbacks (4 files)
```
callback-parameter-validation.json    → best-practice-rules/callbacks/
callbacks-passthrough-only.json       → best-practice-rules/callbacks/
callbacks-usage-validation.json       → best-practice-rules/callbacks/
event-invocation-pattern.json         → best-practice-rules/callbacks/
```

#### Best Practice Rules - Dependencies (6 files)
```
dependency-shadowing.json             → best-practice-rules/dependencies/
library-variable-names.json           → best-practice-rules/dependencies/
unused-libraries.json                 → best-practice-rules/dependencies/
useeffect-object-default-param.json   → best-practice-rules/dependencies/
useeffect-unstable-callbacks.json     → best-practice-rules/dependencies/
useeffect-unstable-utilities.json     → best-practice-rules/dependencies/
```

#### Best Practice Rules - Data Operations (8 files)
```
runquery-runview-spread-operator.json → best-practice-rules/data-operations/
runquery-runview-ternary-array-check.json → best-practice-rules/data-operations/
runview-sql-function.json             → best-practice-rules/data-operations/
unsafe-array-operations.json          → best-practice-rules/data-operations/
unsafe-formatting-methods.json        → best-practice-rules/data-operations/
orderby-field-not-sortable.json       → best-practice-rules/data-operations/
sql-where-invalid-field.json          → best-practice-rules/data-operations/
server-reload-on-client-operation.json → best-practice-rules/data-operations/
```

#### Best Practice Rules - String Operations (2 files)
```
string-replace-all-occurrences.json   → best-practice-rules/string-operations/
string-template-validation.json       → best-practice-rules/string-operations/
```

#### Best Practice Rules - Styling (2 files)
```
styles-invalid-path.json              → best-practice-rules/styling/
styles-unsafe-access.json             → best-practice-rules/styling/
```

#### Best Practice Rules - Parameters (6 files)
```
date-param-empty-string.json          → best-practice-rules/parameters/
date-param-invalid-format.json        → best-practice-rules/parameters/
date-param-logical-expression.json    → best-practice-rules/parameters/
date-param-with-variable.json         → best-practice-rules/parameters/
missing-parameters-object.json        → best-practice-rules/parameters/
pass-standard-props.json              → best-practice-rules/parameters/
```

#### Best Practice Rules - Miscellaneous (5 files)
```
no-child-implementation.json          → best-practice-rules/misc/
no-data-prop.json                     → best-practice-rules/misc/
parse-error.json                      → best-practice-rules/misc/
property-name-consistency.json        → best-practice-rules/misc/
syntax-error.json                     → best-practice-rules/misc/
```

### Fixed Components → New Locations

#### Type Rules (4 files)
```
dependency-prop-correct.json          → type-rules/
dependency-prop-variable-correct.json → type-rules/
function-scope-type-inference.json    → type-rules/
full-type-safe-component.json         → type-rules/
```

#### Schema Validation - Entity Validation (2 files)
```
entity-field-correct.json             → schema-validation/entity-validation/
entity-field-destructuring-correct.json → schema-validation/entity-validation/
```

#### Schema Validation - Query Validation (9 files)
```
query-bit-param-correct.json          → schema-validation/query-validation/
query-extra-filter-correct.json       → schema-validation/query-validation/
query-field-correct.json              → schema-validation/query-validation/
query-multiple-params.json            → schema-validation/query-validation/
query-optional-params-all-provided.json → schema-validation/query-validation/
query-optional-params-none-provided.json → schema-validation/query-validation/
query-optional-params-some-provided.json → schema-validation/query-validation/
query-required-and-optional-params.json → schema-validation/query-validation/
runquery-parameters-correct.json      → schema-validation/query-validation/
```

#### Schema Validation - Data Grid Validation (12 files)
```
data-grid-columndef-mixed.json        → schema-validation/data-grid-validation/
data-grid-columndef-valid-props.json  → schema-validation/data-grid-validation/
data-grid-no-entityname-columndef.json → schema-validation/data-grid-validation/
data-grid-no-entityname-strings.json  → schema-validation/data-grid-validation/
data-grid-valid-columns.json          → schema-validation/data-grid-validation/
entity-grid-case-correct.json         → schema-validation/data-grid-validation/
entity-grid-correct-case.json         → schema-validation/data-grid-validation/
entity-grid-empty-arrays.json         → schema-validation/data-grid-validation/
entity-grid-fielddef-complete.json    → schema-validation/data-grid-validation/
entity-grid-fielddef-mixed.json       → schema-validation/data-grid-validation/
entity-grid-valid-fields.json         → schema-validation/data-grid-validation/
```

#### Schema Validation - Result Access Validation (5 files)
```
fix-10.json                           → schema-validation/result-access-validation/
optional-chain-results.json           → schema-validation/result-access-validation/
runquery-result-correct.json          → schema-validation/result-access-validation/
runview-result-correct.json           → schema-validation/result-access-validation/
runview-runquery-correct.json         → schema-validation/result-access-validation/
```

#### Best Practice Rules - Parameters (1 file)
```
date-param-correct.json               → best-practice-rules/parameters/
```

## Migration Steps

### Phase 1: Backup and Prepare

1. **Create backup**:
   ```bash
   cd /Users/jordanfanapour/Documents/GitHub/MJ/tests/component-linter-tests

   # Backup entire fixtures directory
   cp -r fixtures fixtures-backup-$(date +%Y%m%d-%H%M%S)
   ```

2. **Run baseline tests**:
   ```bash
   # Capture current test results
   npm run test:fixtures > fixture-test-baseline-pre-migration.txt 2>&1

   # Save violation counts
   grep "Rule:" fixture-test-baseline-pre-migration.txt | sort | uniq -c > violation-counts-pre-migration.txt
   ```

3. **Verify file counts**:
   ```bash
   # Should be 110 files + 1 README
   ls -1 fixtures/broken-components/ | wc -l

   # Should be 39 files
   ls -1 fixtures/fixed-components/ | wc -l

   # Should be 41 files (DO NOT TOUCH)
   ls -1 fixtures/valid-components/ | wc -l
   ```

### Phase 2: Create Directory Structure

Create all subdirectories for broken components:

```bash
cd /Users/jordanfanapour/Documents/GitHub/MJ/tests/component-linter-tests/fixtures

# Runtime rules directories
mkdir -p broken-components/runtime-rules/component-structure
mkdir -p broken-components/runtime-rules/component-lifecycle
mkdir -p broken-components/runtime-rules/utilities-usage
mkdir -p broken-components/runtime-rules/react-restrictions

# Type rules directory
mkdir -p broken-components/type-rules

# Schema validation directories
mkdir -p broken-components/schema-validation/entity-validation
mkdir -p broken-components/schema-validation/query-validation
mkdir -p broken-components/schema-validation/component-validation
mkdir -p broken-components/schema-validation/data-grid-validation
mkdir -p broken-components/schema-validation/chart-validation
mkdir -p broken-components/schema-validation/result-access-validation

# Best practice rules directories
mkdir -p broken-components/best-practice-rules/async-patterns
mkdir -p broken-components/best-practice-rules/jsx-patterns
mkdir -p broken-components/best-practice-rules/state-management
mkdir -p broken-components/best-practice-rules/callbacks
mkdir -p broken-components/best-practice-rules/dependencies
mkdir -p broken-components/best-practice-rules/data-operations
mkdir -p broken-components/best-practice-rules/string-operations
mkdir -p broken-components/best-practice-rules/styling
mkdir -p broken-components/best-practice-rules/parameters
mkdir -p broken-components/best-practice-rules/misc
```

Create all subdirectories for fixed components:

```bash
# Type rules directory
mkdir -p fixed-components/type-rules

# Schema validation directories
mkdir -p fixed-components/schema-validation/entity-validation
mkdir -p fixed-components/schema-validation/query-validation
mkdir -p fixed-components/schema-validation/data-grid-validation
mkdir -p fixed-components/schema-validation/result-access-validation

# Best practice rules directory
mkdir -p fixed-components/best-practice-rules/parameters
```

### Phase 3: Move Broken Components

**IMPORTANT**: Use `git mv` instead of `mv` to preserve git history.

```bash
cd /Users/jordanfanapour/Documents/GitHub/MJ/tests/component-linter-tests/fixtures/broken-components

# Runtime Rules - Component Structure
git mv component-name-mismatch.json runtime-rules/component-structure/
git mv no-export-statements.json runtime-rules/component-structure/
git mv no-import-statements.json runtime-rules/component-structure/
git mv no-return-component.json runtime-rules/component-structure/
git mv single-function-only.json runtime-rules/component-structure/
git mv use-function-declaration.json runtime-rules/component-structure/

# Runtime Rules - Component Lifecycle
git mv library-cleanup.json runtime-rules/component-lifecycle/
git mv library-initialization.json runtime-rules/component-lifecycle/
git mv library-lifecycle.json runtime-rules/component-lifecycle/

# Runtime Rules - Utilities Usage
git mv utilities-ai-methods.json runtime-rules/utilities-usage/
git mv utilities-metadata-methods.json runtime-rules/utilities-usage/
git mv utilities-no-direct-instantiation.json runtime-rules/utilities-usage/
git mv utilities-runquery-methods.json runtime-rules/utilities-usage/
git mv utilities-runview-methods.json runtime-rules/utilities-usage/
git mv utilities-valid-properties.json runtime-rules/utilities-usage/

# Runtime Rules - React Restrictions
git mv no-iife-wrapper.json runtime-rules/react-restrictions/
git mv no-react-destructuring.json runtime-rules/react-restrictions/
git mv no-require-statements.json runtime-rules/react-restrictions/
git mv no-use-reducer.json runtime-rules/react-restrictions/
git mv no-window-access.json runtime-rules/react-restrictions/
git mv react-component-naming.json runtime-rules/react-restrictions/
git mv react-hooks-rules.json runtime-rules/react-restrictions/

# Type Rules
git mv dependency-prop-type-mismatch.json type-rules/
git mv dependency-prop-variable-type-mismatch.json type-rules/
git mv function-scope-type-mismatch.json type-rules/
git mv query-param-variable-type-mismatch.json type-rules/
git mv type-mismatch-array-methods.json type-rules/
git mv type-operation-mismatch.json type-rules/

# Schema Validation - Entity Validation
git mv entity-field-destructuring.json schema-validation/entity-validation/
git mv entity-field-invalid.json schema-validation/entity-validation/
git mv entity-field-optional-chaining.json schema-validation/entity-validation/
git mv entity-name-mismatch.json schema-validation/entity-validation/
git mv runview-entity-validation.json schema-validation/entity-validation/
git mv field-not-in-requirements.json schema-validation/entity-validation/

# Schema Validation - Query Validation
git mv query-bit-param-invalid.json schema-validation/query-validation/
git mv query-extra-unknown-params.json schema-validation/query-validation/
git mv query-field-invalid.json schema-validation/query-validation/
git mv query-field-typo.json schema-validation/query-validation/
git mv query-name-mismatch.json schema-validation/query-validation/
git mv query-param-type-invalid.json schema-validation/query-validation/
git mv missing-query-parameter.json schema-validation/query-validation/
git mv unknown-query-parameter.json schema-validation/query-validation/
git mv required-queries-not-called.json schema-validation/query-validation/
git mv runquery-missing-categorypath.json schema-validation/query-validation/
git mv runquery-parameters-validation.json schema-validation/query-validation/

# Schema Validation - Component Validation
git mv component-not-in-dependencies.json schema-validation/component-validation/
git mv dependency-prop-validation.json schema-validation/component-validation/
git mv undefined-component-usage.json schema-validation/component-validation/
git mv undefined-jsx-component.json schema-validation/component-validation/
git mv validate-component-references.json schema-validation/component-validation/
git mv unused-component-dependencies.json schema-validation/component-validation/
git mv component-usage-without-destructuring.json schema-validation/component-validation/

# Schema Validation - Data Grid Validation
git mv data-grid-columndef-unknown-prop.json schema-validation/data-grid-validation/
git mv data-grid-invalid-columns.json schema-validation/data-grid-validation/
git mv entity-grid-case-mismatch.json schema-validation/data-grid-validation/
git mv entity-grid-case-sensitivity.json schema-validation/data-grid-validation/
git mv entity-grid-fielddef-missing-field.json schema-validation/data-grid-validation/
git mv entity-grid-invalid-fields.json schema-validation/data-grid-validation/
git mv simple-drilldown-invalid-gridfields.json schema-validation/data-grid-validation/

# Schema Validation - Chart Validation
git mv simple-chart-average-missing-valuefield.json schema-validation/chart-validation/
git mv simple-chart-min-missing-valuefield.json schema-validation/chart-validation/
git mv simple-chart-missing-valuefield.json schema-validation/chart-validation/

# Schema Validation - Result Access Validation
git mv broken-10.json schema-validation/result-access-validation/
git mv optional-chain-fallback.json schema-validation/result-access-validation/
git mv optional-chain-records.json schema-validation/result-access-validation/
git mv result-field-invalid.json schema-validation/result-access-validation/
git mv runquery-runview-direct-setstate.json schema-validation/result-access-validation/
git mv runquery-runview-result-structure.json schema-validation/result-access-validation/
git mv runview-runquery-result-direct-usage.json schema-validation/result-access-validation/
git mv runview-runquery-valid-properties.json schema-validation/result-access-validation/
git mv validate-runview-runquery-result-access.json schema-validation/result-access-validation/

# Best Practice Rules - Async Patterns
git mv prefer-async-await.json best-practice-rules/async-patterns/

# Best Practice Rules - JSX Patterns
git mv prefer-jsx-syntax.json best-practice-rules/jsx-patterns/

# Best Practice Rules - State Management
git mv noisy-settings-updates.json best-practice-rules/state-management/
git mv saved-user-settings-pattern.json best-practice-rules/state-management/
git mv prop-state-sync.json best-practice-rules/state-management/

# Best Practice Rules - Callbacks
git mv callback-parameter-validation.json best-practice-rules/callbacks/
git mv callbacks-passthrough-only.json best-practice-rules/callbacks/
git mv callbacks-usage-validation.json best-practice-rules/callbacks/
git mv event-invocation-pattern.json best-practice-rules/callbacks/

# Best Practice Rules - Dependencies
git mv dependency-shadowing.json best-practice-rules/dependencies/
git mv library-variable-names.json best-practice-rules/dependencies/
git mv unused-libraries.json best-practice-rules/dependencies/
git mv useeffect-object-default-param.json best-practice-rules/dependencies/
git mv useeffect-unstable-callbacks.json best-practice-rules/dependencies/
git mv useeffect-unstable-utilities.json best-practice-rules/dependencies/

# Best Practice Rules - Data Operations
git mv runquery-runview-spread-operator.json best-practice-rules/data-operations/
git mv runquery-runview-ternary-array-check.json best-practice-rules/data-operations/
git mv runview-sql-function.json best-practice-rules/data-operations/
git mv unsafe-array-operations.json best-practice-rules/data-operations/
git mv unsafe-formatting-methods.json best-practice-rules/data-operations/
git mv orderby-field-not-sortable.json best-practice-rules/data-operations/
git mv sql-where-invalid-field.json best-practice-rules/data-operations/
git mv server-reload-on-client-operation.json best-practice-rules/data-operations/

# Best Practice Rules - String Operations
git mv string-replace-all-occurrences.json best-practice-rules/string-operations/
git mv string-template-validation.json best-practice-rules/string-operations/

# Best Practice Rules - Styling
git mv styles-invalid-path.json best-practice-rules/styling/
git mv styles-unsafe-access.json best-practice-rules/styling/

# Best Practice Rules - Parameters
git mv date-param-empty-string.json best-practice-rules/parameters/
git mv date-param-invalid-format.json best-practice-rules/parameters/
git mv date-param-logical-expression.json best-practice-rules/parameters/
git mv date-param-with-variable.json best-practice-rules/parameters/
git mv missing-parameters-object.json best-practice-rules/parameters/
git mv pass-standard-props.json best-practice-rules/parameters/

# Best Practice Rules - Miscellaneous
git mv no-child-implementation.json best-practice-rules/misc/
git mv no-data-prop.json best-practice-rules/misc/
git mv parse-error.json best-practice-rules/misc/
git mv property-name-consistency.json best-practice-rules/misc/
git mv syntax-error.json best-practice-rules/misc/
```

### Phase 4: Move Fixed Components

```bash
cd /Users/jordanfanapour/Documents/GitHub/MJ/tests/component-linter-tests/fixtures/fixed-components

# Type Rules
git mv dependency-prop-correct.json type-rules/
git mv dependency-prop-variable-correct.json type-rules/
git mv function-scope-type-inference.json type-rules/
git mv full-type-safe-component.json type-rules/

# Schema Validation - Entity Validation
git mv entity-field-correct.json schema-validation/entity-validation/
git mv entity-field-destructuring-correct.json schema-validation/entity-validation/

# Schema Validation - Query Validation
git mv query-bit-param-correct.json schema-validation/query-validation/
git mv query-extra-filter-correct.json schema-validation/query-validation/
git mv query-field-correct.json schema-validation/query-validation/
git mv query-multiple-params.json schema-validation/query-validation/
git mv query-optional-params-all-provided.json schema-validation/query-validation/
git mv query-optional-params-none-provided.json schema-validation/query-validation/
git mv query-optional-params-some-provided.json schema-validation/query-validation/
git mv query-required-and-optional-params.json schema-validation/query-validation/
git mv runquery-parameters-correct.json schema-validation/query-validation/

# Schema Validation - Data Grid Validation
git mv data-grid-columndef-mixed.json schema-validation/data-grid-validation/
git mv data-grid-columndef-valid-props.json schema-validation/data-grid-validation/
git mv data-grid-no-entityname-columndef.json schema-validation/data-grid-validation/
git mv data-grid-no-entityname-strings.json schema-validation/data-grid-validation/
git mv data-grid-valid-columns.json schema-validation/data-grid-validation/
git mv entity-grid-case-correct.json schema-validation/data-grid-validation/
git mv entity-grid-correct-case.json schema-validation/data-grid-validation/
git mv entity-grid-empty-arrays.json schema-validation/data-grid-validation/
git mv entity-grid-fielddef-complete.json schema-validation/data-grid-validation/
git mv entity-grid-fielddef-mixed.json schema-validation/data-grid-validation/
git mv entity-grid-valid-fields.json schema-validation/data-grid-validation/

# Schema Validation - Result Access Validation
git mv fix-10.json schema-validation/result-access-validation/
git mv optional-chain-results.json schema-validation/result-access-validation/
git mv runquery-result-correct.json schema-validation/result-access-validation/
git mv runview-result-correct.json schema-validation/result-access-validation/
git mv runview-runquery-correct.json schema-validation/result-access-validation/

# Best Practice Rules - Parameters
git mv date-param-correct.json best-practice-rules/parameters/
```

### Phase 5: Verify Migration

```bash
cd /Users/jordanfanapour/Documents/GitHub/MJ/tests/component-linter-tests/fixtures

# Verify broken-components only has README.md and subdirectories
ls -la broken-components/
# Should show: README.md, runtime-rules/, type-rules/, schema-validation/, best-practice-rules/

# Verify fixed-components only has subdirectories (no files at root)
ls -la fixed-components/
# Should show: type-rules/, schema-validation/, best-practice-rules/

# Count all files recursively (should match original counts)
find broken-components -type f -name "*.json" | wc -l
# Should be: 110

find fixed-components -type f -name "*.json" | wc -l
# Should be: 39

find valid-components -type f -name "*.json" | wc -l
# Should be: 41
```

### Phase 6: Update Fixture Loader

The fixture loader (`src/fixtures/fixture-loader.ts`) needs to be updated to support nested paths. Update the `loadFixture()` function:

```typescript
// Before (flat structure):
// loadFixture('broken', 'entity-field-invalid')
// Looks for: fixtures/broken-components/entity-field-invalid.json

// After (nested structure):
// loadFixture('broken', 'schema-validation/entity-validation/entity-field-invalid')
// Looks for: fixtures/broken-components/schema-validation/entity-validation/entity-field-invalid.json

// The function should support both formats during transition for backward compatibility
```

**Key changes needed**:

1. Update `loadFixture()` to accept nested paths with forward slashes
2. Update `loadFixturesByCategory()` to recursively search subdirectories
3. Keep backward compatibility by searching for files if nested path not found

### Phase 7: Run Post-Migration Tests

```bash
cd /Users/jordanfanapour/Documents/GitHub/MJ/tests/component-linter-tests

# Run all fixture tests
npm run test:fixtures > fixture-test-post-migration.txt 2>&1

# Compare with baseline
diff fixture-test-baseline-pre-migration.txt fixture-test-post-migration.txt

# Verify violation counts match
grep "Rule:" fixture-test-post-migration.txt | sort | uniq -c > violation-counts-post-migration.txt
diff violation-counts-pre-migration.txt violation-counts-post-migration.txt

# Should show NO DIFFERENCES in violation counts
```

**Expected outcome**: All tests pass with identical results to pre-migration baseline.

### Phase 8: Update Documentation

1. **Update README.md** in `broken-components/` to reflect new structure
2. **Update main README.md** at `/tests/component-linter-tests/README.md` with new paths
3. **Add migration notes** documenting the change

Example documentation update for README.md:

```markdown
## Fixture Organization

Fixtures are organized by rule category to mirror the linter architecture:

### Broken Components
- `runtime-rules/` - MJ platform requirements (22 files)
  - `component-structure/` - Component structure validation
  - `component-lifecycle/` - Lifecycle method validation
  - `utilities-usage/` - Utilities API validation
  - `react-restrictions/` - React usage restrictions
- `type-rules/` - Type compatibility checks (6 files)
- `schema-validation/` - Entity/Query/Component schema (46 files)
  - `entity-validation/` - Entity field/name validation
  - `query-validation/` - Query parameter/field validation
  - `component-validation/` - Component dependency validation
  - `data-grid-validation/` - DataGrid property validation
  - `chart-validation/` - Chart property validation
  - `result-access-validation/` - RunView/RunQuery result access
- `best-practice-rules/` - Code quality patterns (36 files)
  - `async-patterns/`, `jsx-patterns/`, `state-management/`, etc.

### Using Nested Fixtures

```bash
# Test a specific fixture with nested path
npm run test:fixture fixtures/broken-components/schema-validation/entity-validation/entity-field-invalid.json

# Test all fixtures in a category
npm run test:fixture fixtures/broken-components/type-rules/*.json
```
```

## Rollback Plan

If migration fails or causes issues:

```bash
cd /Users/jordanfanapour/Documents/GitHub/MJ/tests/component-linter-tests

# Find your backup
ls -la | grep fixtures-backup

# Restore from backup
rm -rf fixtures
cp -r fixtures-backup-YYYYMMDD-HHMMSS fixtures

# Verify restoration
npm run test:fixtures
```

## Success Criteria

Migration is successful when:

- [ ] All 110 broken components moved to nested directories
- [ ] All 39 fixed components moved to nested directories
- [ ] All 41 valid components remain unchanged
- [ ] `npm run test:fixtures` produces identical results to pre-migration baseline
- [ ] Violation counts by rule match exactly
- [ ] No files remain at root of broken-components/ (except README.md)
- [ ] No files remain at root of fixed-components/
- [ ] Git history preserved (files show as moved, not deleted/added)
- [ ] Documentation updated to reflect new structure

## Timeline

Estimated time: **30-45 minutes** for careful execution

- Phase 1 (Backup/Baseline): 5 minutes
- Phase 2 (Create directories): 2 minutes
- Phase 3 (Move broken components): 10 minutes
- Phase 4 (Move fixed components): 5 minutes
- Phase 5 (Verify migration): 3 minutes
- Phase 6 (Update fixture loader): 10 minutes
- Phase 7 (Test): 5 minutes
- Phase 8 (Documentation): 5 minutes

## Notes for Claude Code Agent

- **Use `git mv` not `mv`** to preserve git history
- **Test frequently** - run `npm run test:fixtures` after each phase if unsure
- **Keep README.md** at root of broken-components/ directory
- **Do NOT touch** valid-components/ directory
- **Verify counts** at every step - numbers must match exactly
- **Create backup first** - this is a large structural change
- **Document as you go** - update this file with any issues encountered

## Reference Files

- Linter refactor plan: `/packages/React/test-harness/COMPONENT-LINTER-REFACTOR.md`
- Fixture loader: `src/fixtures/fixture-loader.ts`
- Test runner: `src/run-fixture-tests.ts`
- Main README: `README.md`
