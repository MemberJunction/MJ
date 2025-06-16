# MetadataSync Validation Implementation Tasks

## Phase 1: Core Validation Infrastructure
- [x] Create ValidationService class in src/services/ValidationService.ts
- [x] Add validation types and interfaces in src/types/validation.ts
- [x] Create EntityDependencyGraph class for dependency analysis
- [x] Implement circular reference detection with hierarchical exception
- [x] Add nesting depth checker (warn at >10 levels)

## Phase 2: Entity Validation Logic
- [x] Implement validateEntity method to check entity names exist
- [x] Implement validateFields method to check field names and types
- [x] Implement validateFieldValues method for type checking
- [x] Add check for settable fields only (exclude system fields)
- [x] Implement validateRelatedEntities for recursive validation

## Phase 3: Reference Validation
- [x] Implement @file: reference validator
- [x] Implement @lookup: reference validator
- [x] Implement @template: reference validator
- [x] Implement @parent: and @root: context validators
- [x] Add validation for @lookup:?create syntax

## Phase 4: Dependency Order Validation
- [x] Build dependency graph from entity relationships
- [x] Implement topological sort for dependency ordering
- [x] Check if current directoryOrder satisfies dependencies
- [x] Suggest corrected order when dependencies are violated

## Phase 5: CLI Command Integration
- [x] Add 'validate' command to src/commands/validate.ts
- [x] Add --no-validate flag to push command
- [x] Add --no-validate flag to pull command
- [x] Integrate validation into push workflow
- [x] Integrate validation into pull workflow

## Phase 6: Output Formatting
- [x] Research and add terminal markdown renderer package (using chalk for formatting)
- [x] Create FormattingService for consistent output
- [x] Implement validation report formatter
- [x] Implement push/pull summary report formatter
- [x] Add color coding for errors/warnings/success
- [x] Reduce verbosity of push/pull output

## Phase 7: Error Reporting
- [x] Create ValidationError and ValidationWarning classes
- [x] Implement detailed error messages with file/line info
- [x] Add suggestions for common errors
- [x] Create summary statistics for validation results
- [x] Add JSON output format option for CI/CD

## Phase 8: Testing
- [x] Test validate command with /metadata directory
- [x] Test various error scenarios
- [x] Test dependency ordering validation
- [x] Test circular reference detection
- [x] Test deep nesting warnings
- [x] Verify all reference types validate correctly

## Phase 9: Documentation
- [x] Update README.md with validate command documentation
- [x] Document --no-validate flag for push/pull
- [x] Add validation examples and common errors
- [x] Document output format changes
- [x] Add troubleshooting section for validation errors

## Phase 10: Final Verification
- [x] Review all tasks completed
- [x] Run full test suite against /metadata
- [x] Ensure all error messages are clear
- [x] Verify documentation is complete
- [x] Clean up any debug code
- [x] Self-verify task completion