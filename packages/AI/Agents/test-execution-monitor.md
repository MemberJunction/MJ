# Test Plan: Agent Execution Monitor Live Updates

## Overview
This test plan verifies that the AgentExecutionMonitor component properly displays live updates during agent execution.

## Changes Made

### 1. AgentExecutionMonitorComponent (`agent-execution-monitor.component.ts`)
- Added `convertLiveStepsToTree()` method to convert live streaming data format to execution tree nodes
- Updated `setupLiveUpdates()` to handle live steps data and poll for updates
- Enhanced `ngOnChanges()` to handle mode changes and empty data
- Modified `buildTreeFromHistoricalData()` to handle both executionTree and liveSteps formats

### 2. AI Test Harness Component (`ai-test-harness.component.ts`)
- Initialize execution monitor data when agent execution starts: `this.currentExecutionData = { liveSteps: [] }`
- Set mode to 'live' when execution begins
- Properly format live step data in the streaming subscription

## Test Steps

1. **Navigate to AI Agents**
   - Open MJ Explorer
   - Go to AI Agents entity

2. **Open Test Harness**
   - Select an AI Agent record
   - Click the "Test Harness" button

3. **Switch to Execution Monitor Tab**
   - In the test harness sidebar, click "Execution Monitor" tab
   - Should see "Waiting for execution to begin..." message

4. **Execute Agent**
   - Type a message in the chat input
   - Click Send or press Enter

5. **Verify Live Updates**
   - Execution Monitor should switch from "Waiting for execution to begin..." to showing live steps
   - Should see "LIVE" indicator in the header
   - Steps should appear as they are executed with:
     - Step name from progress messages
     - Running status (spinner icon)
     - Agent hierarchy path
     - Auto-expanded nodes

6. **Verify Completion**
   - When execution completes, monitor should switch to historical mode
   - Final execution tree should be displayed
   - Statistics should show total steps, tokens, etc.

## Expected Behavior

### During Execution
- Monitor shows "LIVE" indicator
- Steps appear in real-time as they are executed
- All steps show "running" status with spinner icon
- Tree structure reflects agent hierarchy

### After Execution
- Monitor switches to historical mode
- Complete execution tree is displayed
- Steps show appropriate status (completed/failed)
- Duration and token usage are displayed

## Key Implementation Details

1. **Data Format**: Live steps use `{ liveSteps: [] }` format
2. **Polling**: Updates every 500ms during live mode
3. **Tree Building**: Constructs hierarchy based on depth and agent path
4. **Auto-expansion**: Live nodes are auto-expanded for visibility