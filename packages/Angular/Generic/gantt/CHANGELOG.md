# @memberjunction/ng-gantt

## 6.1.0-edge.4

### Patch Changes

- Updated dependencies [4586215]
- Updated dependencies [a5f92d2]
  - @memberjunction/global@6.1.0-edge.4

## 6.1.0-edge.3

### Patch Changes

- 815b9bc: feat(storage,core,forms): ephemeral staged binary upload pipeline, polymorphic related collections, and file record viewer
  - **Storage & Server**:
    - Implement Tier 2 ephemeral staged raw binary upload pipeline (UploadTokenManager, POST /media/upload-stage, CreateUploadStageToken mutation, UploadStorageFile token consumption).
    - Add single-use cryptographic token security, user identity ownership binding, automated TTL eviction, and memory bounds.
    - Sanitize paths/filenames and add X-Content-Type-Options: nosniff to /media endpoints.
  - **Core & ORM**:
    - Add support for polymorphic IS-A subtypes in RelatedRecordCollection and dirty state preservation across relationship chains.
    - Support IEntityConfiguration and entity hierarchy traversal.
  - **Angular & UI**:
    - Add 3-tier upload pipeline in RecordAttachmentsComponent with real-time wire progress.
    - Add dedicated MJ: Files custom record viewer form component in ng-core-entity-forms.
    - Add attachment count badges to base form container and toolbar.
    - Add ResizeObserver lifecycle handling to Gantt chart and OpenNewEntityRecord in SharedService.

- 05865ea: feat(angular): introduce `@memberjunction/ng-hierarchy-tree` visual hierarchy component and wire 15 core entity form hierarchy panels
  - **`@memberjunction/ng-hierarchy-tree`**: Reusable D3-based interactive visual hierarchy and taxonomy tree component with smooth pan/zoom, dynamic primary key metadata extraction, real-time path search and ancestor branch auto-expansion, subtree focus, cancelable lifecycle events, and `--mj-*` design token theming.
  - **`@memberjunction/ng-core-entity-forms`**: Adds 15 visual hierarchy form panels in the `after-related` slot for self-referencing and category entities in MJ Core (`AI Agent Categories`, `AI Prompt Categories`, `Action Categories`, `Dashboard Categories`, `Query Categories`, `Tags`, `Projects`, `Content Items`, `File Categories`, `List Categories`, `Record Process Categories`, `Skills`, `Template Categories`, `Test Suites`, `User View Categories`).
  - **`@memberjunction/ng-gantt`**: Polish host height layout on `MJGanttChartComponent`.

- 3eeab6d: The left Gantt grid can scroll independently of the timeline, has a splitter to change pane width, and supports user-resized columns. Callers get GridWidth / ColumnWidths inputs and Before/After resize events.
- c83f0d3: Gantt and Kanban emit double-click so host surfaces can open the underlying entity record without fighting DHTMLX's default lightbox.
- 01dd00c: Map DHTMLX `--dhx-gantt-*` theme variables onto MJ semantic tokens so the chart follows light/dark and white-label automatically.
- 5d29ece: Show the full Gantt item name on hover. DHTMLX column-border resize is PRO-only in the community build; tooltips cover truncated Name cells and bars.
- af0e32d: Expose DHTMLX timeline zoom on `<mj-gantt-chart>`: named levels (hour→year), ZoomIn/ZoomOut/SetZoomLevel, Ctrl/Cmd+wheel, and cancelable BeforeZoomChange / AfterZoomChange events.
- Updated dependencies [834f8d7]
- Updated dependencies [cefc302]
- Updated dependencies [be0bdb2]
- Updated dependencies [f5ec13b]
- Updated dependencies [1bd9674]
  - @memberjunction/global@6.1.0-edge.3

## 6.1.0-edge.2

### Patch Changes

- Updated dependencies [080f4cd]
- Updated dependencies [48ff99f]
- Updated dependencies [de343b5]
  - @memberjunction/global@6.1.0-edge.2

## 6.1.0-edge.1

### Patch Changes

- 394d276: Declare @angular/\* peer dependencies as ranges (^21.1.3) instead of exact pins across all Angular library packages. Peer declarations are compatibility claims, not install instructions: the exact pins falsely claimed incompatibility with every other Angular 21.x build, produced 502 peer-resolution errors under strict pnpm workspaces, and structurally blocked Angular security patches behind a full republish. Installed versions remain pinned by consuming apps and the era platform manifest; dependencies/devDependencies keep their exact pins.
  - @memberjunction/global@6.1.0-edge.1

## 6.1.0-edge.0

### Patch Changes

- @memberjunction/global@6.1.0-edge.0

## 6.0.0

### Patch Changes

- @memberjunction/global@6.0.0

## 5.51.0

### Patch Changes

- @memberjunction/global@5.51.0

## 5.50.0

### Patch Changes

- @memberjunction/global@5.50.0

## 5.49.0

### Patch Changes

- Updated dependencies [a8cb2b6]
- Updated dependencies [13d9b8e]
- Updated dependencies [9c07270]
  - @memberjunction/global@5.49.0

## 5.48.0

### Patch Changes

- @memberjunction/global@5.48.0

## 5.47.0

### Patch Changes

- @memberjunction/global@5.47.0

## 5.46.0

### Patch Changes

- @memberjunction/global@5.46.0

## 5.45.1

### Patch Changes

- @memberjunction/global@5.45.1

## 5.45.0

### Patch Changes

- Updated dependencies [c1f2d3d]
  - @memberjunction/global@5.45.0

## 5.44.0

### Patch Changes

- Updated dependencies [5396d90]
  - @memberjunction/global@5.44.0

## 5.43.0

### Patch Changes

- Updated dependencies [9f6aa87]
  - @memberjunction/global@5.43.0

## 5.42.0

### Patch Changes

- Updated dependencies [0fa3cbc]
  - @memberjunction/global@5.42.0

## 5.41.0

### Patch Changes

- @memberjunction/global@5.41.0

## 5.40.2

### Patch Changes

- @memberjunction/global@5.40.2

## 5.40.1

### Patch Changes

- @memberjunction/global@5.40.1

## 5.40.0

### Patch Changes

- @memberjunction/global@5.40.0

## 5.39.0

### Patch Changes

- Updated dependencies [ae74fd5]
  - @memberjunction/global@5.39.0

## 5.38.0

### Patch Changes

- Updated dependencies [30f598d]
- Updated dependencies [3d739a3]
  - @memberjunction/global@5.38.0

## 5.37.0

### Patch Changes

- @memberjunction/global@5.37.0

## 5.36.0

### Patch Changes

- @memberjunction/global@5.36.0

## 5.35.0

### Patch Changes

- Updated dependencies [ac4b9a5]
  - @memberjunction/global@5.35.0

## 5.34.1

### Patch Changes

- @memberjunction/global@5.34.1

## 5.34.0

### Patch Changes

- 7d8a0f9: Bound memory leaks: ResultHistory cap, QueueBase Stop/ IShutdownable, A2AServer, TaskStore, sweep, MJLruCache for provider / issuer caches, BaseLLM streaming reset, ShutdownRegister + SIGTERM contract.
- Updated dependencies [389d356]
  - @memberjunction/global@5.34.0

## 5.33.0

### Patch Changes

- Updated dependencies [5cc5326]
  - @memberjunction/global@5.33.0

## 5.32.0

### Patch Changes

- @memberjunction/global@5.32.0

## 5.31.0

### Patch Changes

- 7ed7a4b: no metadata/migration changes
- Updated dependencies [7ed7a4b]
  - @memberjunction/global@5.31.0

## 5.30.1

### Patch Changes

- @memberjunction/global@5.30.1

## 5.30.0

### Patch Changes

- @memberjunction/global@5.30.0

## 5.29.0

### Patch Changes

- @memberjunction/global@5.29.0

## 5.28.0

### Patch Changes

- @memberjunction/global@5.28.0

## 5.27.1

### Patch Changes

- Updated dependencies [d18aa6c]
  - @memberjunction/global@5.27.1

## 5.27.0

### Patch Changes

- @memberjunction/global@5.27.0

## 5.26.0

### Patch Changes

- @memberjunction/global@5.26.0

## 5.25.0

### Patch Changes

- @memberjunction/global@5.25.0

## 5.24.0

### Patch Changes

- @memberjunction/global@5.24.0

## 5.23.0

### Patch Changes

- 5bfe71f: New packages for Gantt and Kanban
- Updated dependencies [247df16]
  - @memberjunction/global@5.23.0
