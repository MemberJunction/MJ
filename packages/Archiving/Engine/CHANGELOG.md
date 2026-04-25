# @memberjunction/archiving-engine

## 5.29.0

### Minor Changes

- 1b0e04f: feat: MJ Archiving Engine - metadata-driven database archiving system

  New packages for archiving large field data from high-growth tables to cold object storage:
  - @memberjunction/archiving-engine: Core engine with BaseSingleton orchestrator, plugin driver model, batch processing, and recovery
  - @memberjunction/archiving-action: Archive Data and Restore Archived Record actions for workflow/agent integration
  - @memberjunction/ng-archive-manager: Angular UI components (status badge, restore timeline, config admin, run viewer)

### Patch Changes

- Updated dependencies [e02e24e]
- Updated dependencies [7006276]
  - @memberjunction/core@5.29.0
  - @memberjunction/core-entities@5.29.0
  - @memberjunction/storage@5.29.0
  - @memberjunction/global@5.29.0
