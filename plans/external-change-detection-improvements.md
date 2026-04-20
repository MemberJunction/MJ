# Plan: External Change Detection Improvements

This plan outlines the enhancements for the `@memberjunction/external-change-detection` package and its associated MJ Action to improve performance, reliability, and ease of scheduling.

## 1. Overview
The current implementation of External Change Detection has potential bottlenecks in SQL performance, lacks robust concurrency handling for distributed environments, and requires manual setup for scheduling. We will address these issues by optimizing database indexes, hardening the execution engine, refining the Action metadata, and providing a standardized scheduled job configuration.

## 2. Goals
- Optimize change detection performance for large datasets.
- Implement robust locking and stale-run detection.
- Improve date precision handling in SQL queries.
- Enable seamless scheduling via the MJ Scheduling Engine.
- Add configurable batch processing and auto-replay options to the action wrapper.

## 3. Detailed Task List

### Phase 1: Database Optimization
- [ ] **Task 1.1: Create Migration for Optimized Index**
    - Create a v5.6 migration script to add a composite index on the `RecordChange` table.
    - Target fields: `EntityID`, `RecordID`, `Type`, `ChangedAt`.
    - Purpose: Drastically speed up `MAX(ChangedAt)` lookups used during update detection.
    - SQL: `CREATE NONCLUSTERED INDEX [IX_RecordChange_Detection_Optimized] ON [__mj].[RecordChange] ([EntityID], [RecordID], [Type], [ChangedAt]) INCLUDE ([FullRecordJSON]);`

### Phase 2: Engine Hardening (`ChangeDetector.ts`)
- [ ] **Task 2.1: Implement Stale Run Detection**
    - Update `StartRun()` to check for "stuck" runs (e.g., In Progress for > 24 hours).
    - Automatically mark stale runs as `Error` with a "Stalled" message to allow new runs to proceed.
- [ ] **Task 2.2: Optimize Update Detection Query**
    - Refactor `generateDetectUpdatesQuery` to remove `FORMAT()` string conversions.
    - Use direct `datetimeoffset` comparisons for better index utilization.
- [ ] **Task 2.3: Enhance Concurrency Logic**
    - Improve the "In Progress" check to use a more robust locking mechanism if possible, or at least ensure atomic status updates.

### Phase 3: Action & Metadata Enhancements
- [ ] **Task 3.1: Extract Action Metadata to dedicated file**
    - Move `Run External Change Detection` action metadata from `.actions.json` to a new `metadata/actions/.external-change-detection.json` file for better maintainability.
- [ ] **Task 3.2: Define Action Parameters in Metadata**
    - Add the following parameters to the action metadata:
        - `EntityList` (Existing): Optional comma-separated list of entities.
        - `BatchSize` (New): Integer, default 20. Number of concurrent replays.
        - `AutoReplay` (New): Boolean, default true. Whether to automatically replay detected changes.
- [ ] **Task 3.3: Update Action Code (`ExternalChangeDetectionAction.ts`)**
    - Refactor `InternalRunAction` to:
        - Parse `BatchSize` (handling string-to-number conversion).
        - Parse `AutoReplay` boolean.
        - Respect `AutoReplay` flag (if false, just return the count of detected changes).
        - Pass `BatchSize` to `ExternalChangeDetectorEngine.Instance.ReplayChanges()`.

### Phase 4: Scheduling Integration
- [ ] **Task 4.1: Create Scheduled Job Metadata**
    - Add a new metadata file `metadata/scheduled-jobs/.external-change-detection-job.json`.
    - Configure it to use `ActionScheduledJobDriver` targeting the `__RunExternalChangeDetection` action.
    - Set a default daily schedule (e.g., 2 AM UTC).

### Phase 5: Validation & Testing
- [ ] **Task 5.1: Performance Benchmarking**
    - Verify query execution plan improvements with the new index.
- [ ] **Task 5.2: Concurrency Testing**
    - Simulate a stalled run and verify the engine recovers automatically.
- [ ] **Task 5.3: Action Parameter Validation**
    - Test the action with various `BatchSize` and `AutoReplay` configurations.
- [ ] **Task 5.4: Integration Testing**
    - Trigger the action via the Scheduling Engine and verify successful end-to-end execution.

## 4. Metadata Specifications

### New Action Parameters (JSON fragment)
```json
[
  {
    "fields": {
      "Name": "BatchSize",
      "Type": "Input",
      "ValueType": "Scalar",
      "DefaultValue": "20",
      "Description": "Number of concurrent record replays to process at once.",
      "IsRequired": false
    }
  },
  {
    "fields": {
      "Name": "AutoReplay",
      "Type": "Input",
      "ValueType": "Scalar",
      "DefaultValue": "true",
      "Description": "If true, detected changes will be automatically replayed through the entity system.",
      "IsRequired": false
    }
  }
]
```

## 5. Implementation Notes
- When refactoring `ChangeDetector.ts`, ensure `datetimeoffset` is compared correctly in T-SQL to avoid precision loss (use `>=` instead of `>` if necessary, or ensure the DB-stored `UpdatedAt` has sufficient precision).
- Stale run detection should be configurable or use a sensible default (24 hours).
