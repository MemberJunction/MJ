# DBAutoDoc Enhancement Tasks

This task list tracks all improvements and fixes needed for the DBAutoDoc package based on user feedback from the 2025-11-08 test run.

## Critical Bugs

- [x] **Fix State File Location Bug** ✅ COMPLETED
  - Current: `db-doc-state.json` saves to test-run directory
  - Expected: Save to `output/run-N/state.json` subdirectory
  - Files affected: `src/commands/analyze.ts`, state management logic
  - Priority: HIGH - Core functionality broken
  - **Solution**: Modified analyze.ts to create run folder at start and use it for all state saves

- [ ] **Fix Wasteful Re-Analysis of Descriptions**
  - Current: Generating near-identical descriptions across iterations (e.g., IsActive column with 4 identical iterations)
  - Expected: Skip re-analysis if no qualitative improvement possible
  - Implement similarity checking for descriptions
  - Review convergence detection logic
  - Don't waste tokens on unnecessary re-generation
  - Files affected: `src/core/AnalysisEngine.ts`, convergence logic
  - Priority: HIGH - Major token waste

## Data Optimization

- [ ] **Optimize Bit Column Handling**
  - Current: Collecting statistics and sample values for bit/boolean columns
  - Expected: Skip statistics and samples for bit columns (wasteful)
  - Files affected: Schema introspection, statistics collection
  - Priority: MEDIUM

- [ ] **Add Run Number to AnalysisRun Objects**
  - Current: analysisRun objects don't have explicit run number
  - Expected: Each analysisRun should have a `runNumber` property
  - Tie to the run-N folder structure
  - Files affected: `src/types/state.ts`, `src/state/StateManager.ts`
  - Priority: MEDIUM

## JSON Output Enhancements

- [x] **Add Summary Section to JSON Output** ✅ COMPLETED
  - Current: No summary at top level
  - Expected: Add summary section BEFORE "schemas" array containing:
    - Total prompts run
    - Total input tokens
    - Total output tokens
    - Total schemas processed
    - Total tables processed
    - Total columns processed
  - Update continuously during run so user can monitor progress
  - Files affected: `src/types/state.ts`, state management
  - Priority: HIGH - Important for monitoring
  - **Solution**: Added `AnalysisSummary` interface and `summary` field to `DatabaseDocumentation`. Added `updateSummary()` method to StateManager that's called after each level and at end of run.

## CLI/UX Enhancements

- [ ] **Add MJ Header to CLI**
  - Reference implementation in `packages/MJCLI`
  - Add branded MemberJunction header
  - Files affected: `src/commands/analyze.ts`
  - Priority: LOW

- [ ] **Enhance Progress Display with oclif**
  - Current: Basic spinner
  - Expected: Beautiful status updates with:
    - Colors and icons
    - Current table being processed
    - % progress per level
    - Clear table output when moving to next (each table clears)
    - Persistent level output (each level stays visible)
  - Use oclif's progress indicators
  - Files affected: `src/commands/analyze.ts`
  - Priority: MEDIUM

- [ ] **Investigate Interactive Mode Feasibility**
  - Question: Is this possible with CLI/oclif?
  - Features needed:
    - Pause/continue functionality
    - Interactive schema selection
    - Interactive table selection
  - Research oclif capabilities
  - Document findings
  - Priority: LOW - Nice to have

## Algorithm Review & Documentation

- [ ] **Review and Document Convergence Logic**
  - Current: User questions how it works
  - Expected:
    - Explain algorithm clearly
    - Document what determines convergence
    - Should NOT just be "exact match" checking
    - Should NOT just burn tokens until limit hit
    - Improve logic based on findings
  - Files affected: Convergence detection code, documentation
  - Priority: HIGH - Fundamental to tool effectiveness

- [ ] **Review and Document Backpropagation Logic**
  - User question: "What is the logic gate for determining if there is anything USEFUL we want to backprop versus we have done enough?"
  - Expected:
    - Explain when backpropagation is triggered
    - Document usefulness criteria
    - Ensure we're not over-doing it
  - Files affected: Backpropagation logic, documentation
  - Priority: HIGH - Fundamental to tool effectiveness

## Architecture Review

- [ ] **Review Prompting Strategy**
  - Current: May be requesting re-analysis without good reason
  - Expected: Only re-run inference when there's a real reason
  - Keep existing descriptions if they're qualitatively sufficient
  - Files affected: `src/prompts/PromptEngine.ts`, prompt templates
  - Priority: HIGH - Tied to wasteful re-analysis issue

## Notes

- Current run is ongoing - don't interrupt it
- Many of these tasks are interconnected (e.g., convergence logic affects re-analysis waste)
- Focus on HIGH priority items first, especially those that waste tokens
- Document all algorithm improvements for future reference

## Completed Tasks

✅ Added AI model parameter tracking (vendor, temperature, topP, topK)
✅ Implemented full prompt I/O logging in processingLog
✅ Created run-numbered folder export structure (run-1/, run-2/, etc.)
✅ Added Mermaid ERD diagrams to markdown output
✅ Updated package dependencies from workspace:* to standard npm versions
