# Instructions for Claude Code: Fixture Migration & Coverage Enhancement

## Overview

You are tasked with reorganizing and enhancing the component linter test fixtures in two sequential phases:

1. **Phase A: Fixture Migration** - Reorganize existing 149 fixtures into structured directories
2. **Phase B: Coverage Enhancement** - Generate 228 new fixtures for systematic type safety coverage

**Total Time Estimate**: 4-6 hours of careful work

---

## Context

The MemberJunction component linter validates React components for runtime compatibility. It currently has 149 organically collected test fixtures (110 broken, 39 fixed, 41 valid) in flat directories. These need to be:

1. Reorganized to mirror the refactored linter architecture (4 rule categories)
2. Enhanced with systematic coverage of all type safety patterns

**Important Files to Read**:
- `/Users/jordanfanapour/Documents/GitHub/MJ/tests/component-linter-tests/FIXTURE-MIGRATION.md` - Complete migration instructions
- `/Users/jordanfanapour/Documents/GitHub/MJ/tests/component-linter-tests/FIXTURE-COVERAGE-ANALYSIS.md` - Coverage gaps and new fixtures needed
- `/Users/jordanfanapour/Documents/GitHub/MJ/tests/component-linter-tests/README.md` - Test infrastructure documentation
- `/Users/jordanfanapour/Documents/GitHub/MJ/packages/React/test-harness/COMPONENT-LINTER-REFACTOR.md` - Linter refactor plan (context)

---

## PHASE A: Fixture Migration (Steps 1-8)

**Goal**: Reorganize 149 existing fixtures into structured directories that mirror the linter architecture.

### Step A1: Read Documentation

Read these files in order:
1. `FIXTURE-MIGRATION.md` - Your primary guide
2. `README.md` - Test infrastructure
3. Current fixture directory structure

### Step A2: Create Backup and Baseline

```bash
cd /Users/jordanfanapour/Documents/GitHub/MJ/tests/component-linter-tests

# Create timestamped backup
cp -r fixtures fixtures-backup-$(date +%Y%m%d-%H%M%S)

# Run baseline tests
npm run test:fixtures > fixture-test-baseline-pre-migration.txt 2>&1

# Count violations
grep "Rule:" fixture-test-baseline-pre-migration.txt | sort | uniq -c > violation-counts-pre-migration.txt

# Verify file counts
echo "Broken: $(ls -1 fixtures/broken-components/*.json 2>/dev/null | wc -l)"
echo "Fixed: $(ls -1 fixtures/fixed-components/*.json 2>/dev/null | wc -l)"
echo "Valid: $(ls -1 fixtures/valid-components/*.json 2>/dev/null | wc -l)"
```

**Expected Output**:
- Broken: 110
- Fixed: 39
- Valid: 41

### Step A3: Create Directory Structure

Follow the directory creation commands in `FIXTURE-MIGRATION.md` Phase 2. Create all subdirectories for:
- `broken-components/` (4 main categories with subcategories)
- `fixed-components/` (3 main categories with subcategories)

**DO NOT touch `valid-components/`** - leave it completely unchanged.

### Step A4: Move Broken Components

**CRITICAL**: Use `git mv` (not `mv`) to preserve git history.

Execute all `git mv` commands from `FIXTURE-MIGRATION.md` Phase 3. This moves 110 files from flat structure into nested directories:

```bash
cd /Users/jordanfanapour/Documents/GitHub/MJ/tests/component-linter-tests/fixtures/broken-components

# Example commands (follow all commands in FIXTURE-MIGRATION.md):
git mv component-name-mismatch.json runtime-rules/component-structure/
git mv entity-field-invalid.json schema-validation/entity-validation/
# ... (continue for all 110 files)
```

**Verification After Each Category**:
```bash
# Check files moved successfully
find . -name "*.json" | wc -l  # Should decrease as you move files
```

### Step A5: Move Fixed Components

Execute all `git mv` commands from `FIXTURE-MIGRATION.md` Phase 4 for the 39 fixed fixtures:

```bash
cd /Users/jordanfanapour/Documents/GitHub/MJ/tests/component-linter-tests/fixtures/fixed-components

git mv dependency-prop-correct.json type-rules/
# ... (continue for all 39 files)
```

### Step A6: Verify Migration

```bash
cd /Users/jordanfanapour/Documents/GitHub/MJ/tests/component-linter-tests/fixtures

# Verify broken-components structure
ls -la broken-components/
# Should show: README.md, runtime-rules/, type-rules/, schema-validation/, best-practice-rules/

# Verify fixed-components structure
ls -la fixed-components/
# Should show: type-rules/, schema-validation/, best-practice-rules/

# Count files recursively - MUST MATCH ORIGINAL COUNTS
echo "Broken: $(find broken-components -type f -name '*.json' | wc -l)"  # Should be 110
echo "Fixed: $(find fixed-components -type f -name '*.json' | wc -l)"   # Should be 39
echo "Valid: $(find valid-components -type f -name '*.json' | wc -l)"   # Should be 41

# Verify no files left at root (except README.md in broken-components)
ls broken-components/*.json 2>/dev/null || echo "✅ No JSON files at broken root"
ls fixed-components/*.json 2>/dev/null || echo "✅ No JSON files at fixed root"
```

### Step A7: Update Fixture Loader

The fixture loader needs to support nested paths. Update `/Users/jordanfanapour/Documents/GitHub/MJ/tests/component-linter-tests/src/fixtures/fixture-loader.ts`:

**Required Changes**:
1. `loadFixture()` must accept nested paths: `loadFixture('broken', 'schema-validation/entity-validation/entity-field-invalid')`
2. `loadFixturesByCategory()` must recursively search subdirectories
3. Maintain backward compatibility (search for files if nested path not found)

**Test the loader**:
```bash
# Test loading a nested fixture
npm run test:fixture fixtures/broken-components/schema-validation/entity-validation/entity-field-invalid.json
```

### Step A8: Run Post-Migration Tests

```bash
cd /Users/jordanfanapour/Documents/GitHub/MJ/tests/component-linter-tests

# Run all fixture tests
npm run test:fixtures > fixture-test-post-migration.txt 2>&1

# Compare with baseline
diff fixture-test-baseline-pre-migration.txt fixture-test-post-migration.txt

# Compare violation counts
grep "Rule:" fixture-test-post-migration.txt | sort | uniq -c > violation-counts-post-migration.txt
diff violation-counts-pre-migration.txt violation-counts-post-migration.txt
```

**SUCCESS CRITERIA**:
- ✅ Diffs should show NO DIFFERENCES in violation counts
- ✅ All tests pass
- ✅ File counts match (110 broken, 39 fixed, 41 valid)

### Step A9: Update Documentation

Update `README.md` to reflect new structure:

1. Add "Fixture Organization" section describing the new directory structure
2. Update examples to use nested paths
3. Document the migration date and reason

---

## PHASE B: Coverage Enhancement (Steps 1-5)

**Goal**: Generate 228 new fixtures (114 broken + 114 fixed pairs) for systematic type safety coverage.

### Step B1: Read Coverage Analysis

Read `/Users/jordanfanapour/Documents/GitHub/MJ/tests/component-linter-tests/FIXTURE-COVERAGE-ANALYSIS.md` thoroughly. This document defines:

- 10 pattern categories
- Exact broken/fixed code examples for each pattern
- Expected violations
- Fixture placement in directory structure

### Step B2: Create Coverage Tracking Matrix

Create `/Users/jordanfanapour/Documents/GitHub/MJ/tests/component-linter-tests/FIXTURE-COVERAGE-MATRIX.md`:

```markdown
# Fixture Coverage Matrix

## Legend
- ⬜ Not Created
- 🟡 In Progress (broken or fixed created, not both)
- ✅ Complete (both broken and fixed created and tested)
- ❌ Failed (fixture created but tests failing)

## Coverage Status

### 1. Entity Field Validation (16 fixtures)

#### Direct Entity Field Access (8 fixtures)
- [ ] entity-field-typo (broken + fixed)
- [ ] entity-field-nonexistent (broken + fixed)
- [ ] entity-field-case-mismatch (broken + fixed)
- [ ] entity-field-type-coercion (broken + fixed)

#### Entity Field in Array Operations (8 fixtures)
- [ ] entity-array-filter-invalid-field (broken + fixed)
- [ ] entity-array-map-invalid-field (broken + fixed)
- [ ] entity-array-reduce-invalid-field (broken + fixed)
- [ ] entity-array-sort-invalid-field (broken + fixed)

... (continue for all 10 categories)
```

### Step B3: Generate High-Priority Fixtures First

**Priority 1: Entity Field Validation** (16 fixtures)

For each pattern in FIXTURE-COVERAGE-ANALYSIS.md Section 1:

1. **Create broken fixture**:
   ```bash
   # Create file at appropriate location
   # Example: fixtures/broken-components/type-rules/entity-field-typo-broken.json
   ```

2. **Use this fixture template**:
   ```json
   {
     "name": "EntityFieldTypoBroken",
     "type": "generic",
     "title": "Entity Field Typo - Broken Pattern",
     "description": "Tests linter detection of typo in entity field name (FristName vs FirstName)",
     "code": "function EntityFieldTypoBroken({ utilities }) {\n  const [members, setMembers] = React.useState([]);\n\n  React.useEffect(() => {\n    async function loadData() {\n      const result = await utilities.RunView({ EntityName: 'Members' });\n      if (result?.Success) {\n        // ❌ Typo: FristName should be FirstName\n        const names = result.Results.map(m => m.FristName);\n        setMembers(names);\n      }\n    }\n    loadData();\n  }, []);\n\n  return (\n    <div>\n      {members.map((name, i) => <div key={i}>{name}</div>)}\n    </div>\n  );\n}",
     "location": "embedded",
     "namespace": "test/fixtures",
     "version": "1.0.0",
     "registry": "MJ",
     "status": "Active",
     "requirements": {
       "entity": "Members",
       "expectedFields": ["FirstName", "LastName", "Email", "MembershipType"]
     }
   }
   ```

3. **Create fixed fixture**:
   ```json
   {
     "name": "EntityFieldTypoFixed",
     "type": "generic",
     "title": "Entity Field Typo - Fixed Pattern",
     "description": "Corrected version using proper entity field name",
     "code": "function EntityFieldTypoFixed({ utilities }) {\n  const [members, setMembers] = React.useState([]);\n\n  React.useEffect(() => {\n    async function loadData() {\n      const result = await utilities.RunView({ EntityName: 'Members' });\n      if (result?.Success) {\n        // ✅ Correct: FirstName\n        const names = result.Results.map(m => m.FirstName);\n        setMembers(names);\n      }\n    }\n    loadData();\n  }, []);\n\n  return (\n    <div>\n      {members.map((name, i) => <div key={i}>{name}</div>)}\n    </div>\n  );\n}",
     "location": "embedded",
     "namespace": "test/fixtures",
     "version": "1.0.0",
     "registry": "MJ",
     "status": "Active"
   }
   ```

4. **Test the pair**:
   ```bash
   # Test broken (should detect violation)
   npm run test:fixture fixtures/broken-components/type-rules/entity-field-typo-broken.json

   # Test fixed (should pass with zero violations)
   npm run test:fixture fixtures/fixed-components/type-rules/entity-field-typo-fixed.json
   ```

5. **Update coverage matrix**:
   ```markdown
   - [x] ✅ entity-field-typo (broken + fixed) - PASSING
   ```

**Repeat for all patterns in priority order**:
1. Entity Field Validation (16 fixtures)
2. Query Parameter Validation (16 fixtures)
3. Query Field Validation (12 fixtures)
4. Component Property Validation (14 fixtures)
5. DataGrid Column Validation (16 fixtures)
6. Cross-Component Data Flow (14 fixtures)
7. Chart Component Fields (10 fixtures)
8. Spread Operator Safety (6 fixtures)
9. Optional Chaining Safety (6 fixtures)
10. Complex Pipelines (4 fixtures)

### Step B4: Use Parallel Task Execution

**IMPORTANT**: Generate fixtures in PARALLEL when possible. Create multiple fixtures simultaneously:

```bash
# Example: Create 4 entity field fixtures in parallel
# (Create the JSON files, then test them)
```

Work in batches of 5-10 fixtures to maximize efficiency.

### Step B5: Validate Coverage Completion

After all fixtures are created:

```bash
cd /Users/jordanfanapour/Documents/GitHub/MJ/tests/component-linter-tests

# Count new fixtures created
echo "Total broken: $(find fixtures/broken-components -type f -name '*.json' | wc -l)"  # Should be 110 + 114 = 224
echo "Total fixed: $(find fixtures/fixed-components -type f -name '*.json' | wc -l)"   # Should be 39 + 114 = 153

# Run full test suite
npm run test:fixtures > fixture-test-full-coverage.txt 2>&1

# Verify all new fixtures
grep "✅" fixture-test-full-coverage.txt | wc -l
```

**SUCCESS CRITERIA**:
- ✅ All 228 new fixtures created (114 broken + 114 fixed)
- ✅ All broken fixtures detect expected violations
- ✅ All fixed fixtures pass with zero violations
- ✅ Coverage matrix shows 100% completion
- ✅ All fixtures organized in correct directories

---

## Working Approach

### Recommended Strategy

1. **Work sequentially**: Complete Phase A fully before starting Phase B
2. **Test frequently**: Run `npm run test:fixtures` after every major step
3. **Use parallel execution**: Create multiple fixtures simultaneously when working on Phase B
4. **Update tracking**: Keep FIXTURE-COVERAGE-MATRIX.md updated as you progress
5. **Commit regularly**: Commit after completing each pattern category

### Time Management

**Phase A (Migration)**: 45-60 minutes
- A1-A2: 10 minutes (backup, baseline)
- A3-A5: 20 minutes (create dirs, move files)
- A6: 5 minutes (verify)
- A7: 10 minutes (update fixture loader)
- A8-A9: 10 minutes (test, document)

**Phase B (Coverage)**: 3-4 hours
- B1-B2: 15 minutes (read docs, create matrix)
- B3: 2.5-3 hours (generate 228 fixtures in priority order)
- B4: (parallel with B3)
- B5: 15 minutes (validate completion)

### Handling Errors

**If migration tests fail**:
1. Compare violation counts carefully
2. Check if fixture loader updated correctly
3. Verify all files moved (count must be exact)
4. Restore from backup if needed: `cp -r fixtures-backup-YYYYMMDD-HHMMSS fixtures`

**If new fixtures fail tests**:
1. Check entity/query names exist in test database
2. Verify field names match entity metadata
3. Review expected violation messages
4. Compare with similar existing fixtures

---

## Key Files You'll Work With

### Reading (Context)
- `FIXTURE-MIGRATION.md` - Migration instructions
- `FIXTURE-COVERAGE-ANALYSIS.md` - Coverage patterns
- `README.md` - Test infrastructure
- `COMPONENT-LINTER-REFACTOR.md` - Linter architecture

### Modifying
- `src/fixtures/fixture-loader.ts` - Update for nested paths
- `README.md` - Update documentation
- `FIXTURE-COVERAGE-MATRIX.md` - Create and track progress

### Creating
- `fixtures/broken-components/**/*.json` - New broken fixtures
- `fixtures/fixed-components/**/*.json` - New fixed fixtures

---

## Success Criteria

### Phase A Complete
- [ ] All 110 broken fixtures moved to nested directories
- [ ] All 39 fixed fixtures moved to nested directories
- [ ] All 41 valid fixtures remain unchanged
- [ ] No files at root of broken/fixed directories (except README.md)
- [ ] Fixture loader supports nested paths
- [ ] Post-migration tests produce identical results to baseline
- [ ] Documentation updated

### Phase B Complete
- [ ] 228 new fixtures created (114 broken + 114 fixed pairs)
- [ ] All broken fixtures detect expected violations
- [ ] All fixed fixtures pass with zero violations
- [ ] FIXTURE-COVERAGE-MATRIX.md shows 100% completion
- [ ] All fixtures placed in correct directories per migration structure
- [ ] Full test suite passes with 377 total fixtures (110+114 broken, 39+114 fixed, 41 valid)

---

## Final Deliverables

When complete, you should have:

1. ✅ Reorganized fixture directories (Phase A)
2. ✅ Updated fixture loader with nested path support
3. ✅ 228 new fixtures for systematic type safety coverage (Phase B)
4. ✅ FIXTURE-COVERAGE-MATRIX.md tracking completion
5. ✅ Updated README.md with new structure and examples
6. ✅ All tests passing (377 total fixtures)
7. ✅ Git commits preserving file history (using `git mv`)

---

## Questions to Ask if Stuck

- "Should I verify file counts match after each move operation?"
- "Do I need to update fixture loader before testing migration?"
- "Which entity/query names are available in the test database?"
- "Can I see an example of an existing fixture to use as a template?"
- "Should I create fixtures in batches or one at a time?"

---

## Notes

- **Use `git mv` not `mv`** for all file moves
- **Test frequently** - catch issues early
- **Work in batches** - create 5-10 fixtures, test, commit, repeat
- **Preserve history** - git should show files as moved, not deleted/added
- **Don't touch valid-components/** - these are real production components
- **Follow naming conventions** - use descriptive names with pattern + violation + broken/fixed

Good luck! This is important foundational work for the component linter refactor.
