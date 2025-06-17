# Execution Monitor Issues - Task List

## Remaining Issue

### Indentation Not Working Properly
**Problem**: 
- Node indentation is not applied until after the node is expanded
- Appears to be a timing issue where node.depth isn't being properly detected by Angular's style binding on initial render
- The margin-left style binding `[style.margin-left.px]="node.depth > 0 ? node.depth * 20 : 0"` doesn't apply until after user interaction

**Attempted Fixes**:
- Changed from spread operator to Object.assign for updating nodes
- Added markForCheck() and detectChanges() calls
- Verified depth is being set correctly in the data
- Issue persists - likely related to Angular change detection timing

**Next Steps**:
- May need to use a different approach for applying indentation
- Consider using CSS classes instead of inline styles
- Investigate Angular's OnPush change detection strategy interaction with dynamic components

---

## Completed Issues

## Issue #1 & #4: Spinner/Current Step Logic (PRIORITY) ✅ FIXED
**Problem**: 
- Nodes are being marked as complete (green check) too early - immediately after being added instead of when the next step arrives
- Current step indicator removes nodes too quickly
- When switching tabs, all nodes briefly show spinner
- When new items arrive, all nodes briefly show spinner

**Root Cause**: 
- The logic for marking nodes as "running" vs "completed" is flawed
- The `newlyAddedNodeIds` tracking may be getting cleared or modified incorrectly
- Tab switching may be triggering a full re-render

**Solution IMPLEMENTED**:
- Only mark a node as completed when NEW steps arrive that weren't previously processed
- Never remove spinner until next streaming update with new steps
- Fix the logic to properly track which nodes are truly "newly added" in the current update
- Ensure tab switching doesn't affect node status

**Changes Made**:
1. Added logic to identify "truly new" steps vs updates to existing steps
2. Only call `markPreviouslyNewNodesAsComplete` when truly new steps arrive
3. Modified `processExecutionData` to preserve state in live mode when switching tabs
4. Modified `setupLiveUpdates` to not recreate everything if data already exists
5. Ensured update subscription is only created once and properly cleaned up

## Issue #2: Indentation Not Working ✅ FIXED
**Problem**: 
- Indentation is happening within nodes (padding) instead of pushing entire nodes to the right
- Sub-agent steps should be visually nested under their parent delegation node

**Solution IMPLEMENTED**:
- Changed from `[style.padding-left.px]` to `[style.margin-left.px]` in agent-execution-node.component.ts
- This moves the entire node to the right instead of adding internal padding
- Also changed overflow-x from hidden to auto in execution-tree to allow horizontal scrolling for deeply nested nodes

**Changes Made**:
1. Added host binding to apply margin-left to the host element (mj-execution-node) instead of inner div
2. Set margin to 20px per depth level as requested
3. Updated execution-tree CSS to allow horizontal scrolling (overflow-x: auto)
4. Fixed issue where live nodes weren't cleared when execution completes - now properly clears old nodes when switching from live to historical mode

## Issue #3: Can't Click Details Arrow During Progress ✅ FIXED
**Problem**: 
- The down arrow to expand node details is not clickable while node is in progress

**Solution IMPLEMENTED**:
- Added explicit z-index and pointer-events to ensure button stays clickable during updates
- Added event.stopPropagation() and preventDefault() to properly handle click events
- The existing code already preserves detailsExpanded state during live updates

**Changes Made**:
1. Added `position: relative`, `z-index: 10`, and `pointer-events: all` to .details-toggle CSS
2. Added `event.preventDefault()` to onToggleDetails method to ensure proper event handling
3. Fixed double arrow issue - now only shows details arrow if node has no children
4. When node has children, details are shown in the expanded section instead
5. Added logic to clear execution monitor when starting a new agent run (empty liveSteps detected)

## Issue #5: Nodes Re-rendering on Each Update
**Problem**: 
- It appears all nodes are being recreated when new nodes arrive
- This causes performance issues and state loss

**Solution**:
- Verify that we're truly appending nodes vs recreating the entire tree
- Check if ViewContainerRef is being cleared unnecessarily
- Ensure we're using trackBy functions properly
- May need to optimize change detection strategy

## Issue #6: Better Icons for Node Types
**Problem**: 
- Need better icon for sub-agent delegation (org chart style)
- Chat icon should be for human interaction
- Need icon for internal processing/analysis

**Icon Mapping**:
- Sub-agent delegation: fa-sitemap or fa-project-diagram (hierarchy/org chart)
- Human chat: fa-comments (keep current)
- Internal processing: fa-brain or fa-microchip
- Keep existing icons for: validation, prompt, action, decision

## Issue #7: Analyze agent-run-example.json ✅ ANALYZED
**Problem**: 
- Suspected inefficiencies and redundancy in BaseAgent execution model

**Analysis Complete**:
- Created detailed analysis in `/packages/AI/Agents/agent-execution-analysis.md`
- Key findings:
  1. Duplicate prompt execution is intended behavior (for processing action results)
  2. Excessive sub-agent delegation depth causing overhead
  3. Redundant web searches between agents
  4. Non-sequential step numbers indicate complex flow
  5. Multiple initialization/finalization steps add overhead
  6. Every agent performs validation separately

**Recommendations**:
- Implement lighter "results processing" prompts
- Add caching layer for action results
- Optimize agent coordination and planning
- Create specialized agent types for common patterns
- Estimated impact: 40-60% token reduction, 30-50% faster execution

## Issue #8: Indentation Still Not Working
**Problem**:
- Node indentation is not working properly
- Depth appears to always be 0 for all nodes
- Need to investigate why depth values aren't being properly set or propagated

**Investigation Needed**:
- Check where depth is calculated in BaseAgent execution tree
- Verify depth is being passed correctly through the execution data
- Ensure depth is preserved during live updates and conversion to historical

## Issue #9: Duplicate Agent Prompt Execution  
**Problem**:
- Seeing duplicate execution of agent prompts in the execution path
- The agent logic itself shouldn't be executing prompts multiple times
- May indicate inefficiency in the BaseAgent execution loop

**Investigation Needed**:
- Analyze agent-run-example.json for duplicate prompt executions
- Check BaseAgent logic for any redundant prompt calls
- Ensure efficient agent loop without unnecessary re-executions
- May be related to re-executing prompts after action results

---

## Implementation Order:
1. Fix Issues #1 & #4 together (spinner/status logic) ✅
2. Fix Issue #2 (indentation) ✅ (partially - UI simplified but depth issue remains)
3. Fix Issue #3 (details arrow clicking) ✅
4. Fix Issue #8 (investigate depth always being 0)
5. Fix Issue #9 (diagnose duplicate agent prompt execution)
6. Fix Issue #5 (re-rendering optimization)
7. Fix Issue #6 (update icons)
8. Analyze Issue #7 (review JSON and suggest optimizations)