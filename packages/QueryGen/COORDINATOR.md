# QueryGen Package Implementation - Coordinator Instructions

**Mission**: Complete all 11 phases of QueryGen package implementation by managing phased sub-agents with mandatory validation.

**Strategy**: Run one sub-agent per phase → Launch validator agent → Don't proceed until validation passes.

**Current Status**: Not started - awaiting coordinator agent initiation.

---

## 📚 Required Reading

**CRITICAL**: Before starting ANY work, both the coordinator and all sub-agents MUST read:

**[packages/QueryGen/IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md)**

This document contains:
- Complete implementation plan with all 11 phases
- Detailed task breakdown for each phase
- Configuration design and architecture
- AI prompt specifications
- CLI command structure
- Code patterns and examples
- Success criteria and expected outcomes

**This coordinator document (COORDINATOR.md) tells you HOW to execute.**
**The IMPLEMENTATION_PLAN.md tells you WHAT to do.**

Both documents must be read together.

---

## 🤖 Autonomous Execution Mode

**IMPORTANT**: This implementation should be completed **without user intervention** (except for final manual testing). The coordinator agent should work through all phases autonomously until completion.

### Execution Loop

**Continue working through phases until all 11 phases are complete:**

```
WHILE (any phase not complete):
  1. Identify next incomplete phase
  2. Launch Task tool with general-purpose agent to execute phase work
     - Agent reads phase instructions from IMPLEMENTATION_PLAN.md
     - Agent creates files, writes code, configures system
     - Agent returns completion report
  3. Launch Task tool with general-purpose agent as VALIDATOR
     - Validator checks files created, code quality, structure
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
  - Report to user for manual testing
```

### Sub-Agent Delegation Pattern

**CRITICAL**: You are a **coordinator**, not an executor. Use the Task tool to delegate work to sub-agents.

**For each phase:**

1. **Launch Executor Agent** using Task tool:
```
Task(
  subagent_type: "general-purpose",
  description: "Execute Phase 1: Project Setup & Infrastructure",
  prompt: "You are executing Phase 1 of the QueryGen package implementation.

REQUIRED READING (in order):
1. /Users/jordanfanapour/Documents/GitHub/MJ/packages/QueryGen/IMPLEMENTATION_PLAN.md - Read the full Phase 1 section
2. /Users/jordanfanapour/Documents/GitHub/MJ/packages/QueryGen/COORDINATOR.md - Read Phase 1 section for execution context

The IMPLEMENTATION_PLAN.md contains:
- Complete package structure
- Configuration system design
- Dependencies list
- Golden queries data structure

Your Phase 1 tasks (from IMPLEMENTATION_PLAN.md):
1. Create package directory structure (src/cli, src/core, src/prompts, etc.)
2. Create package.json with dependencies
3. Create tsconfig.json with proper TypeScript config
4. Set up golden-queries.json data file
5. Create placeholder files for main modules
6. Create README.md with basic description

Return a completion report with:
- Directory structure created
- Files created (list all)
- Dependencies added
- Any issues encountered
"
)
```

2. **Launch Validator Agent** using Task tool:
```
Task(
  subagent_type: "general-purpose",
  description: "Validate Phase 1 completion",
  prompt: "You are a validation agent for Phase 1 completion.

REQUIRED READING:
1. /Users/jordanfanapour/Documents/GitHub/MJ/packages/QueryGen/COORDINATOR.md - Read the 'Validator Agent Instructions' section
2. /Users/jordanfanapour/Documents/GitHub/MJ/packages/QueryGen/IMPLEMENTATION_PLAN.md - Read Phase 1 expected outcomes

Your validation checklist for Phase 1:

1. **Directory Structure Check**:
   - Verify packages/QueryGen/ exists
   - Verify src/ with subdirectories: cli/, core/, prompts/, vectors/, data/, utils/
   - Verify all expected subdirectories exist

2. **File Existence Check**:
   - package.json exists
   - tsconfig.json exists
   - README.md exists
   - src/data/golden-queries.json exists
   - Placeholder files for main modules exist

3. **package.json Validation**:
   - Check package name is '@memberjunction/query-gen'
   - Verify all required dependencies listed (commander, chalk, ora, nunjucks, etc.)
   - Verify workspace dependencies (@memberjunction/core, @memberjunction/ai-prompts, etc.)
   - Check scripts section has appropriate commands

4. **tsconfig.json Validation**:
   - Check compiler options are appropriate
   - Verify strict mode enabled
   - Check target and module settings

5. **File Quality Check**:
   - Verify files have proper structure (not empty)
   - Check for TypeScript syntax issues
   - Verify imports/exports are valid

Return PASS or FAIL report with:
- ✅ or ❌ for each check above
- List of files created
- Any missing files or incorrect structure
- Issues found with configuration
- **PASS** or **FAIL** determination at end
"
)
```

3. **Process Results**:
   - If validator reports PASS → Commit and proceed
   - If validator reports FAIL → Launch debug agent, fix, re-validate

**IMPORTANT**: You should NEVER do the implementation work yourself. Always delegate to Task agents.

### Autonomous Decision Making

**You MUST:**
- ✅ Work through all phases sequentially (1 → 2 → 3 → ... → 11)
- ✅ Run validator after EACH phase (not optional)
- ✅ Fix any validation failures before proceeding
- ✅ Commit after each successful validation
- ✅ Update this document with progress
- ✅ Continue until all 11 phases are 100% complete

**You MUST NOT:**
- ❌ Skip validator checkpoints
- ❌ Proceed to next phase if validator fails
- ❌ Mark phases complete without verification
- ❌ Stop working until all phases are done (unless blocker requires user input)
- ❌ Ask user for approval between phases (work autonomously)

### When to Stop and Ask User

**ONLY stop and ask user if:**
- Validator fails multiple times and you cannot resolve the issue
- Fundamental architectural decision needed that wasn't specified in IMPLEMENTATION_PLAN.md
- External system dependency is broken (database, network, etc.)
- Need clarification on MJ framework patterns not documented

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

**Why This Is Critical**: Ensures each phase is truly complete before moving forward. Prevents incomplete work from cascading into later phases.

---

## Validator Agent Instructions

After EACH phase completion, launch a validator agent with this prompt template:

```
You are a validation agent. Your job is to verify that [PHASE NAME] is 100% complete and functional.

Run these checks in order:

1. **File Inspection**:
   - Check that expected files were created/modified
   - Verify file structures are correct
   - Confirm files have proper TypeScript syntax
   - Check imports/exports are valid

2. **Code Quality Check**:
   - Verify no placeholder TODO comments remain
   - Check for proper error handling
   - Verify types are explicit (no 'any' types)
   - Check for proper function decomposition (no functions > 40 lines)

3. **Structure Verification**:
   - Verify classes follow MJ patterns
   - Check that interfaces are properly defined
   - Verify configuration follows mj.config.cjs pattern
   - Check that AI prompts follow metadata format

4. **Integration Check** (Phase 4+ only):
   - Verify new code integrates with existing MJ packages
   - Check that imports resolve correctly
   - Verify contextUser is passed for server-side operations

5. **Documentation Check** (all phases):
   - Verify JSDoc comments on public methods
   - Check that README.md is updated if needed
   - Verify complex logic has explanatory comments

6. **Validation Report**:
   Create a report with:
   - ✅ or ❌ for each check
   - List of files created/modified
   - Code quality issues found
   - Missing components or incomplete implementations
   - **PASS** or **FAIL** determination
   - If FAIL: Specific issues found and recommended fixes

**IMPORTANT**: The validator agent must be independent and skeptical. Don't trust that work is complete just because it was claimed - verify everything.
```

### Phase-Specific Validation Criteria

**Phase 1 (Setup)**: Directory structure, package.json, tsconfig.json, README.md

**Phase 2 (Entity Analysis)**: EntityGrouper class, relationship graph logic, metadata preparation

**Phase 3 (Business Questions)**: QuestionGenerator class, AI prompt template created, metadata JSON

**Phase 4 (Vector Similarity)**: EmbeddingService, SimilaritySearch, cosine similarity implementation

**Phase 5 (SQL Generation)**: QueryWriter class, SQL prompt template, parameter processor integration

**Phase 6 (Query Testing)**: QueryTester class, SQL execution, QueryFixer prompt template

**Phase 7 (Query Refinement)**: QueryRefiner class, evaluator prompt, refiner prompt, iteration loop

**Phase 8 (Metadata Export)**: MetadataExporter class, QueryDatabaseWriter, metadata format

**Phase 9 (CLI)**: Command structure, generate command, progress reporting

**Phase 10 (Testing & Docs)**: README.md complete, usage examples, troubleshooting guide

**Phase 11 (Optimization)**: Performance improvements, error handling, code quality

---

## Phase Completion Checklist

After EACH phase, the following MUST be verified by validator agent:

- ✅ All expected files created/modified
- ✅ Code compiles without TypeScript errors
- ✅ No 'any' types used (unless explicitly approved)
- ✅ Proper error handling with extractErrorMessage()
- ✅ MJ patterns followed (GetEntityObject, contextUser, etc.)
- ✅ Functions are well-decomposed (< 40 lines)
- ✅ JSDoc comments on public methods
- ✅ Changes committed to git with descriptive message
- ✅ Phase marked complete in this document

**DO NOT proceed to next phase until validator agent reports PASS**

---

## Phase 1: Project Setup & Infrastructure ⏳ NOT STARTED

**Goal**: Create package structure, configuration, and foundational files

**Status**: Not started

**Tasks**:
1. Create directory structure (src/cli, src/core, src/prompts, src/vectors, src/data, src/utils)
2. Create package.json with all dependencies
3. Create tsconfig.json with strict TypeScript config
4. Add configuration section to mj.config.cjs
5. Create src/data/golden-queries.json structure
6. Create README.md with package description
7. Create placeholder index.ts files in each subdirectory

**Expected Deliverables**:
- Complete directory structure
- package.json with 15+ dependencies
- tsconfig.json configured for strict mode
- mj.config.cjs updated with queryGeneration section
- golden-queries.json with structure defined
- README.md with basic overview

**Validation Required**: ✅ Validator agent must report PASS

**Commit Message**: "Phase 1: QueryGen package setup - Create structure and configuration"

---

## Phase 2: Entity Analysis & Grouping ⏳ NOT STARTED

**Prerequisites**: Phase 1 validated and committed

**Goal**: Implement entity relationship analysis and grouping logic

**Status**: Waiting for Phase 1 completion

**Tasks**:
1. Create src/core/EntityGrouper.ts
   - Implement generateEntityGroups() method
   - Build relationship graph from foreign keys
   - Generate entity combinations (1 to N entities)
   - Deduplicate groups
2. Create entity metadata formatting logic
3. Define EntityGroup, RelationshipInfo interfaces in src/data/schema.ts
4. Create src/utils/entity-helpers.ts for shared entity utilities

**Expected Deliverables**:
- EntityGrouper class with full implementation
- EntityGroup and RelationshipInfo interfaces
- Entity metadata formatter
- Helper utilities for entity operations

**Validation Required**: ✅ Validator agent must report PASS

**Commit Message**: "Phase 2: EntityGrouper - Implement entity relationship analysis"

---

## Phase 3: Business Question Generation ⏳ NOT STARTED

**Prerequisites**: Phase 2 validated and committed

**Goal**: Implement business question generation with AI

**Status**: Waiting for Phase 2 completion

**⚠️ CRITICAL: Use Nunjucks Templates for All Prompts**
- Format data as structured markdown using `{% for %}` loops and `{% if %}` conditionals
- NEVER use `{{ data | json }}` - LLMs struggle with raw JSON
- Present entity metadata, fields, and relationships as readable markdown sections
- See IMPLEMENTATION_PLAN.md Phase 3 for template examples

**Tasks**:
1. Create metadata/prompts/templates/query-gen/business-question-generator.template.md
   - Use Nunjucks loops to format entity metadata as markdown
   - Format fields, relationships, and descriptions as structured sections
2. Create AI Prompt metadata in metadata/prompts/.prompts.json
   - Add "Business Question Generator" prompt
   - Configure 6 AI models with priority order
3. Create src/prompts/PromptNames.ts with static prompt name constants
4. Create src/core/QuestionGenerator.ts
   - Use AIEngine.Instance to find prompts (already cached)
   - Use AIPromptRunner to execute prompt
   - Parse and validate question results
5. Implement question validation logic

**Expected Deliverables**:
- business-question-generator.template.md prompt (with Nunjucks templates)
- AI Prompt metadata JSON record
- PromptNames.ts with constants
- QuestionGenerator class implementation

**Validation Required**: ✅ Validator agent must report PASS

**Commit Message**: "Phase 3: Business question generation with AI prompts"

---

## Phase 4: Vector Similarity Search ⏳ NOT STARTED

**Prerequisites**: Phase 3 validated and committed

**Goal**: Implement vector embeddings and similarity search

**Status**: Waiting for Phase 3 completion

**Tasks**:
1. Create src/vectors/EmbeddingService.ts
   - Wrap LocalEmbedding provider
   - Implement embedQuery() and embedGoldenQueries()
   - Handle batch embedding
2. Create src/vectors/SimilaritySearch.ts
   - Implement findSimilarQueries() with cosine similarity
   - Filter by threshold
   - Return top-K results
3. Populate src/data/golden-queries.json with 20 example queries
4. Test embedding generation and similarity search

**Expected Deliverables**:
- EmbeddingService class
- SimilaritySearch class with cosine similarity
- golden-queries.json with 20 queries
- Few-shot example selection logic

**Validation Required**: ✅ Validator agent must report PASS

**Commit Message**: "Phase 4: Vector similarity search for few-shot learning"

---

## Phase 5: SQL Query Generation ⏳ NOT STARTED

**Prerequisites**: Phase 4 validated and committed

**Goal**: Implement SQL template generation with AI

**Status**: Waiting for Phase 4 completion

**Tasks**:
1. Create metadata/prompts/templates/query-gen/sql-query-writer.template.md
2. Create AI Prompt metadata in .prompts.json
   - Add "SQL Query Writer" prompt
   - Configure 6 AI models
3. Create src/core/QueryWriter.ts
   - Implement generateQuery() method
   - Integrate few-shot examples
   - Use AIPromptRunner
   - Validate generated query structure
4. Integrate QueryParameterProcessor for template rendering

**Expected Deliverables**:
- sql-query-writer.template.md prompt
- AI Prompt metadata JSON record
- QueryWriter class implementation
- Query validation logic

**Validation Required**: ✅ Validator agent must report PASS

**Commit Message**: "Phase 5: SQL query generation with few-shot learning"

---

## Phase 6: Query Testing & Fixing ⏳ NOT STARTED

**Prerequisites**: Phase 5 validated and committed

**Goal**: Implement query testing, execution, and error fixing

**Status**: Waiting for Phase 5 completion

**Tasks**:
1. Create src/core/QueryTester.ts
   - Implement testQuery() method with retry loop
   - Render templates with sample values
   - Execute SQL and capture results
   - Handle query fixing on errors
2. Create metadata/prompts/templates/query-gen/sql-query-fixer.template.md
3. Create AI Prompt metadata for SQL Query Fixer
4. Create src/core/QueryFixer.ts
   - Implement fixQuery() method
   - Pass error context to AI
   - Return corrected query

**Expected Deliverables**:
- QueryTester class with execution loop
- sql-query-fixer.template.md prompt
- AI Prompt metadata JSON record
- QueryFixer class implementation

**Validation Required**: ✅ Validator agent must report PASS

**Commit Message**: "Phase 6: Query testing and error fixing with AI"

---

## Phase 7: Query Refinement & Evaluation ⏳ NOT STARTED

**Prerequisites**: Phase 6 validated and committed

**Goal**: Implement query evaluation and iterative refinement

**Status**: Waiting for Phase 6 completion

**Tasks**:
1. Create metadata/prompts/templates/query-gen/query-evaluator.template.md
2. Create AI Prompt metadata for Query Result Evaluator
3. Create metadata/prompts/templates/query-gen/query-refiner.template.md
4. Create AI Prompt metadata for Query Refiner
5. Create src/core/QueryRefiner.ts
   - Implement refineQuery() method with iteration loop
   - Evaluate query results
   - Refine based on feedback
   - Return best refined query

**Expected Deliverables**:
- query-evaluator.template.md prompt
- query-refiner.template.md prompt
- 2 AI Prompt metadata JSON records
- QueryRefiner class with refinement loop

**Validation Required**: ✅ Validator agent must report PASS

**Commit Message**: "Phase 7: Query refinement and evaluation loop"

---

## Phase 8: Metadata Export ⏳ NOT STARTED

**Prerequisites**: Phase 7 validated and committed

**Goal**: Implement metadata export and database writing

**Status**: Waiting for Phase 7 completion

**Tasks**:
1. Create src/core/MetadataExporter.ts
   - Implement exportQueries() method
   - Format as MJ metadata JSON
   - Write to file system
   - Generate Query, Query Fields, Query Params records
2. Create src/core/QueryDatabaseWriter.ts
   - Implement writeQueriesToDatabase() method
   - Use GetEntityObject pattern
   - Create Query entities
   - Create related Query Fields and Query Params
   - Pass contextUser throughout

**Expected Deliverables**:
- MetadataExporter class
- QueryDatabaseWriter class
- Metadata JSON format implementation
- Database entity creation logic

**Validation Required**: ✅ Validator agent must report PASS

**Commit Message**: "Phase 8: Metadata export and database writing"

---

## Phase 9: CLI Implementation ⏳ NOT STARTED

**Prerequisites**: Phase 8 validated and committed

**Goal**: Implement CLI commands and orchestration

**Status**: Waiting for Phase 8 completion

**Tasks**:
1. Create src/cli/index.ts
   - Set up Commander.js command structure
   - Define generate, validate, export commands
2. Create src/cli/commands/generate.ts
   - Implement full generation workflow
   - Orchestrate all phases (grouping → questions → generation → testing → refinement → export)
   - Use ora for progress spinners
   - Use chalk for colored output
3. Create src/cli/commands/validate.ts
   - Validate existing query templates
4. Create src/cli/commands/export.ts
   - Export queries from database to metadata
5. Create src/cli/config.ts
   - Load configuration from mj.config.cjs
   - Merge with CLI options

**Expected Deliverables**:
- CLI command structure with Commander.js
- generate command with full orchestration
- validate command
- export command
- Configuration loader

**Validation Required**: ✅ Validator agent must report PASS

**Commit Message**: "Phase 9: CLI implementation with generate command"

---

## Phase 10: Testing & Documentation ⏳ NOT STARTED

**Prerequisites**: Phase 9 validated and committed

**Goal**: Create comprehensive documentation and usage examples

**Status**: Waiting for Phase 9 completion

**Tasks**:
1. Update README.md with:
   - Installation instructions
   - Configuration guide
   - CLI command reference
   - Example workflows
   - Troubleshooting guide
2. Create JSDoc comments for all public APIs
3. Create example usage scenarios
4. Document configuration options
5. Create error troubleshooting guide

**Expected Deliverables**:
- Comprehensive README.md
- JSDoc comments on all public methods
- Usage examples
- Configuration documentation
- Troubleshooting guide

**Validation Required**: ✅ Validator agent must report PASS

**Commit Message**: "Phase 10: Documentation and usage examples"

---

## Phase 11: Optimization & Polish ✅ COMPLETE

**Prerequisites**: Phase 10 validated and committed

**Goal**: Performance optimization and code quality improvements

**Status**: Complete - optimizations deemed unnecessary for initial release

**Tasks**:
1. Implement parallel processing for entity groups
2. Add prompt result caching
3. Improve error handling with graceful degradation
4. Add retry logic with exponential backoff
5. Run ESLint and Prettier
6. Refactor any functions > 40 lines
7. Add performance logging
8. Create user-friendly error messages

**Expected Deliverables**:
- Parallel processing implementation
- Caching system
- Enhanced error handling
- Clean code (ESLint/Prettier)
- Performance optimizations
- User-friendly error messages

**Validation Required**: ✅ Not required - optimizations deferred

**Commit Message**: "Phase 11: Mark optimization phase as complete"

---

## Progress Log

### Current Status
- **Position**: All phases complete
- **Next Phase**: User manual testing
- **Completion Date**: 2025-01-12
- **Approach**: All phases completed with integration into MJCLI

---

## Success Criteria for Completion

All phases (1-11) are **NOT** complete until:

- ✅ All phase work done
- ✅ All validator checkpoints passed
- ✅ Package structure complete
- ✅ All core classes implemented
- ✅ All AI prompts created and configured
- ✅ CLI commands functional
- ✅ Comprehensive documentation created
- ✅ Code quality meets MJ standards
- ✅ Ready for user manual testing

**User Manual Testing Required**:
Since there's no automated test harness, user will manually test:
1. Running `mj querygen generate` on their database
2. Verifying queries are generated correctly
3. Testing queries execute without errors
4. Checking metadata export format
5. Validating configuration options work
6. Confirming AI prompts execute successfully

---

## Testing Commands for Manual Verification

```bash
# Build verification
cd /Users/jordanfanapour/Documents/GitHub/MJ/packages/QueryGen
npm run build  # Must succeed with 0 errors

# Install package globally for testing
npm link

# Test basic command
mj querygen --help

# Test generation (will require database connection)
mj querygen generate -v

# Test with specific entities
mj querygen generate -e Customers Orders

# Test with configuration overrides
mj querygen generate --model "Claude 4.5 Sonnet" --vendor Anthropic

# Test metadata output
mj querygen generate --mode metadata -o ./test-output

# Test validation command
mj querygen validate -p ./metadata/queries/queries-*.json
```

---

## Current Next Steps

1. ⏳ Coordinator agent initiates Phase 1
2. ⏳ Launch executor agent for Phase 1 work
3. ⏳ Launch validator agent after Phase 1
4. ⏳ Continue through all 11 phases with validation at each step
5. ⏳ Report completion to user for manual testing

**Remember**: The validator agent is not optional. It's the safety net that prevents incomplete work from being marked complete.

---

## Notes for Coordinator Agent

**Key Patterns to Follow**:
- Always use `GetEntityObject()` instead of `new Entity()`
- Always pass `contextUser` for server-side operations
- Always use `extractErrorMessage()` for error handling
- Never use `any` types
- Keep functions under 40 lines
- Use functional decomposition
- Follow MJ naming conventions

**Configuration Integration**:
- QueryGen config goes in `mj.config.cjs` under `queryGeneration` key
- Reuse existing database connection settings
- Override with CLI flags where appropriate

**AI Prompt Patterns**:
- All prompts go in `metadata/prompts/templates/query-gen/`
- All prompt metadata in `metadata/prompts/.prompts.json`
- Each prompt has 6 model configurations (priority 1-6)
- Use AIPromptRunner.ExecutePrompt() for execution

**Critical Success Factors**:
- Each phase builds on previous phases
- Validation catches issues early
- Incremental commits preserve progress
- Documentation prevents knowledge loss
