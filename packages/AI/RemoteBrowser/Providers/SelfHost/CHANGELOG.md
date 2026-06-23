# @memberjunction/remote-browser-selfhost

## 5.42.0

### Patch Changes

- Updated dependencies [9b9b484]
- Updated dependencies [3080b58]
- Updated dependencies [e7c2437]
- Updated dependencies [2f225e4]
- Updated dependencies [0fa3cbc]
- Updated dependencies [e4235fd]
  - @memberjunction/core@5.42.0
  - @memberjunction/computer-use@5.42.0
  - @memberjunction/remote-browser-cdp@5.42.0
  - @memberjunction/remote-browser-base@5.42.0
  - @memberjunction/global@5.42.0

## 5.41.0

### Minor Changes

- a5f5472: Remote Browser channel + new realtime voice providers + computer-use enrichment.
  - **Remote Browser channel** (`@memberjunction/remote-browser-*`): an in-house realtime channel where an agent drives a live, CDP-connected browser while it talks (sales demos, support walkthroughs, trainer agents). New `AIRemoteBrowserProvider` registry (migration V202606161000) with JSONType capability gating; a universal `remote-browser-base` (driver family + `RemoteBrowserEngineBase`), a shared `remote-browser-cdp` kit (one lossless action mapper + `CdpRemoteBrowserSession`), a `remote-browser-server` engine + `RemoteBrowserChannel` (control arbiter, control modes AgentOnly/ViewOnly/Collaborative vs strategies ComputerUse/NativeAI), and five thin backends (Self-Hosted Chrome, Browserbase, Steel, Browserless, Hyperbrowser).
  - **computer-use** enriched additively into a complete browser-I/O + perception engine: CSS-selector-aware actions, CDP screencast, MouseMove, accessibility-snapshot/QueryElement/GetVisibleText/GetTitle/WaitForLoadState — every consumer benefits, existing vision/coordinate path unchanged.
  - **New realtime model providers**: xAI Grok Voice (`@memberjunction/ai-xai`, OpenAI-Realtime-compatible) and Inworld (`@memberjunction/ai-inworld`), with vendor/model seeds.
  - **Console logging improvements** across `@memberjunction/ai-core-plus`, `ai-engine-base`, `ai-prompts`, `aiengine`, `cli`, `generic-database-provider`, `metadata-sync`, and the bootstrap/forms packages.

### Patch Changes

- Updated dependencies [8fd6f59]
- Updated dependencies [cd6c5f0]
- Updated dependencies [8c8b658]
- Updated dependencies [659ee5b]
- Updated dependencies [cc604aa]
- Updated dependencies [15b743b]
- Updated dependencies [a5f5472]
- Updated dependencies [ddaa30e]
  - @memberjunction/core@5.41.0
  - @memberjunction/computer-use@5.41.0
  - @memberjunction/remote-browser-base@5.41.0
  - @memberjunction/remote-browser-cdp@5.41.0
  - @memberjunction/global@5.41.0
