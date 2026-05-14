# @memberjunction/archiving-action

## 5.34.0

### Patch Changes

- 7d8a0f9: Bound memory leaks: ResultHistory cap, QueueBase Stop/ IShutdownable, A2AServer, TaskStore, sweep, MJLruCache for provider / issuer caches, BaseLLM streaming reset, ShutdownRegister + SIGTERM contract.
- Updated dependencies [7d8a0f9]
- Updated dependencies [003317f]
- Updated dependencies [cfffb6d]
- Updated dependencies [e999e0d]
- Updated dependencies [389d356]
- Updated dependencies [ae5cfbd]
- Updated dependencies [6d8ee1a]
- Updated dependencies [72cb92e]
  - @memberjunction/actions-base@5.34.0
  - @memberjunction/actions@5.34.0
  - @memberjunction/archiving-engine@5.34.0
  - @memberjunction/core@5.34.0
  - @memberjunction/global@5.34.0

## 5.33.0

### Patch Changes

- Updated dependencies [95eb27e]
- Updated dependencies [74b0be0]
- Updated dependencies [5cc5326]
- Updated dependencies [7e4957d]
  - @memberjunction/core@5.33.0
  - @memberjunction/global@5.33.0
  - @memberjunction/actions-base@5.33.0
  - @memberjunction/actions@5.33.0
  - @memberjunction/archiving-engine@5.33.0

## 5.32.0

### Patch Changes

- Updated dependencies [a7e8b3b]
- Updated dependencies [b9c67ac]
  - @memberjunction/core@5.32.0
  - @memberjunction/actions-base@5.32.0
  - @memberjunction/actions@5.32.0
  - @memberjunction/archiving-engine@5.32.0
  - @memberjunction/global@5.32.0

## 5.31.0

### Patch Changes

- 7ed7a4b: no metadata/migration changes
- Updated dependencies [7ed7a4b]
- Updated dependencies [60e7541]
- Updated dependencies [18be074]
- Updated dependencies [17b8087]
- Updated dependencies [6779c1e]
- Updated dependencies [de34786]
- Updated dependencies [5db36d9]
  - @memberjunction/actions-base@5.31.0
  - @memberjunction/actions@5.31.0
  - @memberjunction/archiving-engine@5.31.0
  - @memberjunction/core@5.31.0
  - @memberjunction/global@5.31.0

## 5.30.1

### Patch Changes

- @memberjunction/actions-base@5.30.1
- @memberjunction/actions@5.30.1
- @memberjunction/archiving-engine@5.30.1
- @memberjunction/core@5.30.1
- @memberjunction/global@5.30.1

## 5.30.0

### Patch Changes

- Updated dependencies [68bf87f]
- Updated dependencies [963f2df]
- Updated dependencies [4729398]
- Updated dependencies [b1f32a4]
- Updated dependencies [c199f3b]
  - @memberjunction/core@5.30.0
  - @memberjunction/actions-base@5.30.0
  - @memberjunction/actions@5.30.0
  - @memberjunction/archiving-engine@5.30.0
  - @memberjunction/global@5.30.0

## 5.29.0

### Minor Changes

- 1b0e04f: feat: MJ Archiving Engine - metadata-driven database archiving system

  New packages for archiving large field data from high-growth tables to cold object storage:
  - @memberjunction/archiving-engine: Core engine with BaseSingleton orchestrator, plugin driver model, batch processing, and recovery
  - @memberjunction/archiving-action: Archive Data and Restore Archived Record actions for workflow/agent integration
  - @memberjunction/ng-archive-manager: Angular UI components (status badge, restore timeline, config admin, run viewer)

### Patch Changes

- Updated dependencies [1b0e04f]
- Updated dependencies [e02e24e]
  - @memberjunction/archiving-engine@5.29.0
  - @memberjunction/core@5.29.0
  - @memberjunction/actions-base@5.29.0
  - @memberjunction/actions@5.29.0
  - @memberjunction/global@5.29.0
