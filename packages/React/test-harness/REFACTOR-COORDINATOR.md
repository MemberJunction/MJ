# Component Linter Refactor - Coordinator Instructions

**Mission**: Complete all 6 phases of component linter refactoring by managing phased sub-agents with mandatory validation.

**Strategy**: Run one sub-agent per phase → Launch validator agent → Don't proceed until validation passes.

**Current Status**: Phase 3 complete, restarting Phase 4 with revised incremental approach.

---

## 📚 Required Reading

**CRITICAL**: Before starting ANY work, both the coordinator and all sub-agents MUST read:

**[@packages/React/test-harness/COMPONENT-LINTER-REFACTOR.md](./COMPONENT-LINTER-REFACTOR.md)**

This document contains:
- Complete refactoring plan with all 6 phases
- Detailed task breakdown for each phase
- Architecture diagrams and target structure
- Rule inventory (all 99 rules organized by category)
- Testing strategy and validation approach
- Success criteria and expected outcomes

**This coordinator document (REFACTOR-COORDINATOR.md) tells you HOW to execute.**
**The COMPONENT-LINTER-REFACTOR.md tells you WHAT to do.**

Both documents must be read together.

---

## 🤖 Autonomous Execution Mode

**IMPORTANT**: This refactoring should be completed **without user intervention**. The coordinator agent should work through all phases autonomously until completion.

### Execution Loop

**Continue working through phases until all 6 phases are complete:**

```
WHILE (any phase not complete):
  1. Identify next incomplete phase/sub-phase
  2. Launch Task tool with general-purpose agent to execute phase work
     - Agent reads phase instructions from this document
     - Agent extracts rules, integrates code, runs tests
     - Agent returns completion report
  3. Launch Task tool with general-purpose agent as VALIDATOR
     - Validator checks build, tests, integration, file sizes
     - Validator returns PASS or FAIL report
  4. IF validator PASS:
       - Commit changes
       - Mark phase complete in this document
       - Continue to next phase
  5. IF validator FAIL:
       - Launch Task tool to debug and fix issues
       - Re-run validator
       - Do NOT proceed until validator passes
  6. Update progress log in this document
END WHILE

When all phases complete:
  - Create final completion report
  - Verify all success criteria met
  - Report completion to user
```

### Sub-Agent Delegation Pattern

**CRITICAL**: You are a **coordinator**, not an executor. Use the Task tool to delegate work to sub-agents.

**For each phase/sub-phase:**

1. **Launch Executor Agent** using Task tool:
```
Task(
  subagent_type: "general-purpose",
  description: "Execute Phase 4A: Foundation & Runtime Rules",
  prompt: "You are executing Phase 4A of the component linter refactoring.

REQUIRED READING (in order):
1. @packages/React/test-harness/COMPONENT-LINTER-REFACTOR.md - Read the full Phase 4A section for detailed tasks
2. @packages/React/test-harness/REFACTOR-COORDINATOR.md - Read Phase 4A section for execution context

The COMPONENT-LINTER-REFACTOR.md contains:
- Complete list of 13 runtime rules to extract
- Target file structure
- Code patterns and examples
- Integration requirements

Your Phase 4A tasks (from COMPONENT-LINTER-REFACTOR.md):
1. Create lint-rule.ts, lint-context.ts, lint-utils.ts (infrastructure)
2. Create rule-registry.ts (singleton pattern)
3. Extract 13 runtime rules to runtime-rules/ directory
4. INTEGRATE with component-linter.ts (import RuleRegistry, use for runtime rules ONLY)
5. Remove runtime rules from monolithic array (keep rest for now)
6. Build and test (must get 255/303 passing)

Return a completion report with:
- Files created/modified
- Line count changes (component-linter.ts should go from 10,782 → ~10,500 lines)
- Test results (must be 255/303 passing)
- Integration verification (RuleRegistry imported and used)
"
)
```

2. **Launch Validator Agent** using Task tool:
```
Task(
  subagent_type: "general-purpose",
  description: "Validate Phase 4A completion",
  prompt: "You are a validation agent for Phase 4A completion.

REQUIRED READING:
1. @packages/React/test-harness/REFACTOR-COORDINATOR.md - Read the 'Validator Agent Instructions' section
2. @packages/React/test-harness/COMPONENT-LINTER-REFACTOR.md - Read Phase 4A expected outcomes

Your validation checklist for Phase 4A:

1. **File Inspection**:
   - Verify 16 new files created (3 infrastructure + 13 runtime rules)
   - Check lint-rule.ts, lint-context.ts, lint-utils.ts exist
   - Check rule-registry.ts exists with RuleRegistry class
   - Check runtime-rules/ directory has 13 rule files
   - Verify all files have proper exports and structure

2. **Build Verification**:
   cd /Users/jordanfanapour/Documents/GitHub/MJ/packages/React/test-harness
   npm run build
   - Must compile with 0 TypeScript errors
   - If errors, FAIL validation and report details

3. **Test Baseline**:
   cd /Users/jordanfanapour/Documents/GitHub/MJ/tests/component-linter-tests
   npm run test:fixtures
   - Must show EXACTLY 255/303 passing (84.2%)
   - Must show EXACTLY 48 failures (15.8%)
   - If different, FAIL validation and report which tests changed

4. **Integration Check**:
   - Search component-linter.ts for 'import.*RuleRegistry'
   - Verify RuleRegistry.getInstance() is called in lintComponent()
   - Verify runtime rules are loaded from registry
   - Verify old runtime rules removed from monolithic array

5. **File Size Check**:
   wc -l component-linter.ts
   - Should be ~10,500 lines (down from 10,782)
   - If still 10,782, integration didn't happen - FAIL

Return PASS or FAIL report with:
- ✅ or ❌ for each check above
- File list with sizes
- Test results comparison (expected vs actual)
- Build output (if errors)
- Integration verification results
- **PASS** or **FAIL** determination at end
"
)
```

3. **Process Results**:
   - If validator reports PASS → Commit and proceed
   - If validator reports FAIL → Launch debug agent, fix, re-validate

**IMPORTANT**: You should NEVER do the extraction/integration work yourself. Always delegate to Task agents.

### Autonomous Decision Making

**You MUST:**
- ✅ Work through all sub-phases sequentially (4A → 4B → 4C → 4D → 4E → Phase 5 → Phase 6)
- ✅ Run validator after EACH sub-phase (not optional)
- ✅ Fix any validation failures before proceeding
- ✅ Commit after each successful validation
- ✅ Update this document with progress
- ✅ Continue until all 6 phases are 100% complete

**You MUST NOT:**
- ❌ Skip validator checkpoints
- ❌ Proceed to next phase if validator fails
- ❌ Mark phases complete without verification
- ❌ Stop working until all phases are done (unless blocker requires user input)
- ❌ Ask user for approval between phases (work autonomously)

### When to Stop and Ask User

**ONLY stop and ask user if:**
- Validator fails multiple times and you cannot resolve the issue
- Fundamental architectural decision needed that wasn't specified
- External system dependency is broken (database, network, etc.)
- Test baseline regresses and root cause is unclear

**Otherwise: Keep working autonomously through all phases.**

---

## 🚨 CRITICAL: Validator Agent Required After Each Phase

**MANDATORY PROCESS**:
1. Sub-agent completes phase work
2. **STOP** - Do not proceed
3. **Launch validator agent** to verify completion
4. Validator agent runs comprehensive checks
5. If validator passes → Commit and proceed to next phase
6. If validator fails → **STOP**, debug, fix, re-validate

**Why This Is Critical**: Previous Phase 4 attempt was marked complete but validator was never run. Work was incomplete (51 of 99 rules extracted) and never integrated. This was only discovered later when switching to modular rules caused test failures.

---

## Validator Agent Instructions

After EACH phase/sub-phase completion, launch a validator agent with this prompt:

```
You are a validation agent. Your job is to verify that [PHASE NAME] is 100% complete and functional.

Run these checks in order:

1. **File Inspection**:
   - Check that expected files were created/modified
   - Verify file sizes are reasonable (e.g., component-linter.ts should shrink if rules extracted)
   - Confirm new files have proper structure and exports

2. **Build Verification**:
   cd /Users/jordanfanapour/Documents/GitHub/MJ/packages/React/test-harness
   npm run build
   - Must compile with 0 TypeScript errors
   - If errors, FAIL validation and report

3. **Test Baseline**:
   cd /Users/jordanfanapour/Documents/GitHub/MJ/tests/component-linter-tests
   npm run test:fixtures
   - Must show 255/303 passing (84.2%)
   - Must show 48 failures (15.8%)
   - If different, FAIL validation and report

4. **Integration Check** (Phase 4+ only):
   - Search component-linter.ts for old code patterns
   - Verify new code is actually being used (not just created)
   - Example: If RuleRegistry created, verify it's imported and used in lintComponent()

5. **Unit Tests** (if applicable):
   cd /Users/jordanfanapour/Documents/GitHub/MJ/packages/React/test-harness
   npm test
   - Check for new failures (ignore pre-existing example file failures)

6. **Validation Report**:
   Create a report with:
   - ✅ or ❌ for each check
   - File size comparisons (before/after)
   - Test results (actual vs expected)
   - Integration verification results
   - **PASS** or **FAIL** determination
   - If FAIL: Specific issues found and recommended fixes

**IMPORTANT**: The validator agent must be independent and skeptical. Don't trust that work is complete just because it was claimed - verify everything.
```

---

## Phase Completion Checklist

After EACH phase, the following MUST be verified by validator agent:

- ✅ All fixture tests pass (255/303 passing, 48 expected failures)
- ✅ No new test failures introduced
- ✅ Package builds without TypeScript errors
- ✅ Expected files created/modified
- ✅ File sizes match expectations (e.g., monolithic file shrinks if rules extracted)
- ✅ New code is actually integrated (not just created but unused)
- ✅ Changes committed to git with descriptive message
- ✅ Phase marked complete in this document

**DO NOT proceed to next phase until validator agent reports PASS**

---

## Phase 1: Extract Type System ✅ COMPLETE

**Completion Date**: December 11, 2024
**Commit**: `47740efca` ("Phase 1: Extract Type System - Consolidate type checking into TypeCompatibilityRule")
**Status**: ✅ Verified complete

**What Was Done**:
- Created TypeCompatibilityRule to consolidate type checking
- Moved type inference logic to dedicated rule
- Reduced duplication in main linter

**Validation Status**: ✅ PASSED
- Tests: 255/303 passing (baseline maintained)
- Build: Clean compile
- Integration: TypeCompatibilityRule properly used in component-linter.ts

---

## Phase 2: Rename & Reorganize Validators ✅ COMPLETE

**Completion Date**: December 11, 2024
**Commit**: `6ba9b4852` ("Phase 2: Rename & Reorganize Validators - Clarify semantic validation architecture")
**Status**: ✅ Verified complete

**What Was Done**:
- Renamed constraint-validators → semantic-validators
- Clarified semantic validation vs constraint validation
- Improved naming for clarity

**Validation Status**: ✅ PASSED
- Tests: 255/303 passing (baseline maintained)
- Build: Clean compile
- Files: Properly renamed and organized

---

## Phase 3: Merge Property Validation ✅ COMPLETE

**Completion Date**: December 11, 2024
**Commit**: `0d85596ed` ("Phase 3: Merge Property Validation - Unify component prop validation")
**Status**: ✅ Verified complete

**What Was Done**:
- Unified component property validation into ComponentPropRule
- Consolidated multiple property validation approaches
- Reduced complexity in main linter

**Validation Status**: ✅ PASSED
- Tests: 255/303 passing (baseline maintained)
- Build: Clean compile
- Integration: ComponentPropRule properly integrated

---

## Phase 4: Split Rules Into Files ⚠️ IN PROGRESS (RESTARTED)

**Previous Attempt**: December 12, 2024 - **FAILED VALIDATION**
**Restart Date**: December 12, 2024
**Status**: ⚠️ Restarting with revised incremental approach

### What Went Wrong in Previous Attempt

**Claims**:
- 51 modular rules created
- RuleRegistry implemented
- Phase 4 complete

**Reality Discovered by Validation**:
- ❌ Only 51 of ~99 rules extracted (48 rules missing)
- ❌ RuleRegistry created but NEVER integrated
- ❌ component-linter.ts still using old monolithic array at line 8535
- ❌ File still 10,782 lines (should be ~500 lines after Phase 4)
- ❌ Tests would fail (207/303 passing instead of 255/303) if monolithic code removed

**Root Cause**: Validator agent was never run. Work was marked complete without verification.

**Recovery Actions Taken**:
- Reverted to Phase 3 commit (`d0d77537e`)
- Stashed incomplete work to `stash@{0}`
- Baseline restored: 255/303 passing ✅
- Created [VALIDATION-REPORT.md](../../tests/component-linter-tests/VALIDATION-REPORT.md)
- Created [RECOVERY-SUMMARY.md](../../tests/component-linter-tests/RECOVERY-SUMMARY.md)

### Revised Phase 4 Strategy: 5 Sub-Phases with Validation

**Context Window Issue**: Cannot extract all 99 rules at once. Breaking into manageable batches.

---

#### Phase 4A: Foundation & Runtime Rules ⏳ NOT STARTED

**Goal**: Set up infrastructure and extract simplest rules first

**Tasks**:
1. Create shared interfaces:
   - `lint-rule.ts` - LintRule interface
   - `lint-context.ts` - LintContext interface
   - `lint-utils.ts` - Shared helpers
2. Create `rule-registry.ts` - RuleRegistry singleton
3. Extract 13 runtime rules to `runtime-rules/` directory:
   - no-import-statements.ts
   - no-export-statements.ts
   - no-require-statements.ts
   - no-iife-wrapper.ts
   - single-function-only.ts
   - use-function-declaration.ts
   - react-component-naming.ts
   - no-react-destructuring.ts
   - use-unwrap-components.ts
   - callbacks-passthrough-only.ts
   - callbacks-usage-validation.ts
   - pass-standard-props.ts
   - no-return-component.ts
4. **INTEGRATE**: Update component-linter.ts:
   - Import RuleRegistry
   - Use `RuleRegistry.getInstance().getRuntimeRules()` for runtime rules
   - Remove runtime rules from monolithic array (keep rest for now)
5. **VALIDATOR CHECKPOINT**: Launch validator agent
6. **COMMIT**: "Phase 4A: Extract runtime rules and create RuleRegistry"

**Expected Changes**:
- +16 files (3 infrastructure + 13 runtime rules)
- component-linter.ts: 10,782 lines → ~10,500 lines (~300 lines removed)
- Tests: 255/303 passing (must maintain baseline)

**Validation Required Before Proceeding**: ✅ Validator agent must report PASS

---

#### Phase 4B: Schema Validation Rules ⏳ NOT STARTED

**Goal**: Extract and integrate all schema validation rules

**Prerequisites**: Phase 4A validated and committed

**Tasks**:
1. Extract ~15 schema validation rules to `schema-validation/` directory
2. Add schema rules to RuleRegistry
3. **INTEGRATE**: Update component-linter.ts to use schema rules from registry
4. Remove schema rules from monolithic array
5. **VALIDATOR CHECKPOINT**: Launch validator agent
6. **COMMIT**: "Phase 4B: Extract schema validation rules"

**Expected Changes**:
- +15 files (schema validation rules)
- component-linter.ts: ~10,500 lines → ~8,500 lines (~2,000 lines removed)
- Tests: 255/303 passing (must maintain baseline)

**Validation Required Before Proceeding**: ✅ Validator agent must report PASS

---

#### Phase 4C: Best Practice Rules - Part 1 ⏳ NOT STARTED

**Goal**: Extract first batch of best practice rules

**Prerequisites**: Phase 4B validated and committed

**Tasks**:
1. Extract 15 simpler best practice rules to `best-practice-rules/` directory
2. Add to RuleRegistry
3. **INTEGRATE**: Update component-linter.ts
4. Remove these rules from monolithic array
5. **VALIDATOR CHECKPOINT**: Launch validator agent
6. **COMMIT**: "Phase 4C: Extract best practice rules (part 1)"

**Expected Changes**:
- +15 files
- component-linter.ts: ~8,500 lines → ~7,000 lines (~1,500 lines removed)
- Tests: 255/303 passing (must maintain baseline)

**Validation Required Before Proceeding**: ✅ Validator agent must report PASS

---

#### Phase 4D: Best Practice Rules - Part 2 ⏳ NOT STARTED

**Goal**: Extract remaining best practice rules

**Prerequisites**: Phase 4C validated and committed

**Tasks**:
1. Extract remaining 15+ best practice rules
2. Add to RuleRegistry
3. **INTEGRATE**: Update component-linter.ts
4. Remove these rules from monolithic array
5. **VALIDATOR CHECKPOINT**: Launch validator agent
6. **COMMIT**: "Phase 4D: Extract best practice rules (part 2)"

**Expected Changes**:
- +15 files
- component-linter.ts: ~7,000 lines → ~5,000 lines (~2,000 lines removed)
- Tests: 255/303 passing (must maintain baseline)

**Validation Required Before Proceeding**: ✅ Validator agent must report PASS

---

#### Phase 4E: Final Integration & Cleanup ⏳ NOT STARTED

**Goal**: Remove old monolithic array and finalize orchestrator

**Prerequisites**: Phases 4A-4D all validated and committed

**Tasks**:
1. **VERIFY**: Count all rules in RuleRegistry (should be ~99 total)
2. **VERIFY**: No rules remain in monolithic array
3. **REMOVE**: Delete lines 364-8430 (old `universalComponentRules` array)
4. **REFACTOR**: component-linter.ts becomes thin orchestrator
5. Update imports and remove deprecated code
6. **VALIDATOR CHECKPOINT**: Launch validator agent with EXTRA scrutiny
7. **COMMIT**: "Phase 4E: Remove monolithic rules array and finalize orchestrator"

**Expected Changes**:
- component-linter.ts: ~5,000 lines → ~500 lines (95% reduction)
- Total rule files: ~58 files
- Tests: 255/303 passing (must maintain baseline)

**Critical Validation Points**:
- ✅ File size reduced to ~500 lines
- ✅ Old universalComponentRules array completely removed
- ✅ All 99 rules accounted for in RuleRegistry
- ✅ component-linter.ts actually using RuleRegistry (not monolithic array)
- ✅ Tests still passing (255/303)
- ✅ Build clean
- ✅ No performance regression

**Validation Required Before Proceeding to Phase 5**: ✅ Validator agent must report PASS

---

## Phase 5: Consolidate Related Rules ⏳ NOT STARTED

**Prerequisites**: Phase 4 (all sub-phases) validated and committed

**Goal**: Merge rules that validate the same domain

**Status**: Waiting for Phase 4 completion

**Tasks**:
1. Merge related query/entity rules
2. Merge related styles rules
3. Merge related array/string operation rules
4. Update RuleRegistry
5. **VALIDATOR CHECKPOINT**: Launch validator agent
6. **COMMIT**: "Phase 5: Consolidate related rules"

**Validation Required Before Proceeding**: ✅ Validator agent must report PASS

---

## Phase 6: Documentation & Polish ⏳ NOT STARTED

**Prerequisites**: Phase 5 validated and committed

**Goal**: Create comprehensive documentation

**Status**: Waiting for Phase 5 completion

**Tasks**:
1. Create ARCHITECTURE.md
2. Create RULES-CATALOG.md
3. Create DEVELOPER-GUIDE.md
4. Create PERFORMANCE.md
5. **VALIDATOR CHECKPOINT**: Launch validator agent
6. **COMMIT**: "Phase 6: Documentation and polish"

**Validation Required Before Final Sign-off**: ✅ Validator agent must report PASS

---

## Progress Log

### December 11, 2024 - Phases 1-3 Complete
- ✅ Phase 1: Extract Type System (commit `47740efca`)
- ✅ Phase 2: Rename & Reorganize Validators (commit `6ba9b4852`)
- ✅ Phase 3: Merge Property Validation (commit `0d85596ed`)
- All phases validated with baseline maintained

### December 12, 2024 - Phase 4 Attempted (FAILED)
- Phase 4 attempted but never validated
- Marked complete but was actually incomplete
- 51 rules extracted but never integrated
- RuleRegistry created but unused
- No file size reduction (still 10,782 lines)

### December 12, 2024 - Discovery & Recovery
- Validator checks run (too late)
- Discovered Phase 4 incomplete
- Would break tests if monolithic code removed
- **REVERTED** to Phase 3 commit (`d0d77537e`)
- Stashed incomplete work to `stash@{0}`
- Created validation report and recovery docs
- Baseline restored: 255/303 passing ✅

### December 12, 2024 - Current Status
- **Position**: Phase 3 complete, restarting Phase 4
- **Approach**: Revised with 5 sub-phases (4A-4E)
- **Strategy**: Extract → Integrate → Validate → Commit
- **Key Change**: Validator agent mandatory after EACH sub-phase

---

## Stashed Work Reference

The incomplete Phase 4 work is available in `stash@{0}`:

```bash
# View stashed files
git stash show stash@{0}

# Extract specific file for reference
git show stash@{0}:path/to/file.ts > /tmp/reference.ts
```

**Stash Contents** (51 rules + infrastructure):
- 13 runtime rule files
- 8 schema rule files
- 30 best-practice rule files
- RuleRegistry implementation
- LintRule interface
- Various docs

**Use as reference** when re-implementing Phase 4, but start fresh with proper integration.

---

## Success Criteria for Completion

Phase 4 is **NOT** complete until:

- ✅ All 99 rules extracted to individual files (~58 files)
- ✅ RuleRegistry managing all rules
- ✅ component-linter.ts is thin orchestrator (~500 lines)
- ✅ Old monolithic array completely removed
- ✅ component-linter.ts actually using RuleRegistry (verified by validator)
- ✅ 255/303 test baseline maintained throughout
- ✅ 5 clean commits (one per sub-phase 4A-4E)
- ✅ Validator agent PASSED after each sub-phase
- ✅ No performance regression

All phases (1-6) are **NOT** complete until:

- ✅ All phase work done
- ✅ All validator checkpoints passed
- ✅ Comprehensive documentation created
- ✅ Final validation shows 255/303 passing
- ✅ Production ready

---

## Testing Commands for Validator Agent

```bash
# Build verification
cd /Users/jordanfanapour/Documents/GitHub/MJ/packages/React/test-harness
npm run build  # Must succeed with 0 errors

# Test baseline verification
cd /Users/jordanfanapour/Documents/GitHub/MJ/tests/component-linter-tests
npm run test:fixtures  # Must show 255/303 passing

# Unit tests (if applicable)
cd /Users/jordanfanapour/Documents/GitHub/MJ/packages/React/test-harness
npm test  # Check for new failures

# File size check
wc -l component-linter.ts  # Should shrink after rule extraction

# Integration check (Phase 4+)
grep -n "universalComponentRules" component-linter.ts  # Should reduce or disappear
grep -n "RuleRegistry" component-linter.ts  # Should appear and be used
```

---

## Current Next Steps

1. ✅ Recovery complete - reverted to Phase 3
2. ⏳ Start Phase 4A: Foundation & Runtime Rules
3. ⏳ Launch validator agent after Phase 4A
4. ⏳ Continue through 4B, 4C, 4D, 4E with validation at each step
5. ⏳ Complete Phases 5 & 6 with validation

**Remember**: The validator agent is not optional. It's the safety net that prevents incomplete work from being marked complete.
