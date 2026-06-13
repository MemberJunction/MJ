---
"@memberjunction/core": minor
"@memberjunction/core-entities": minor
"@memberjunction/server": minor
"@memberjunction/computer-use": minor
"@memberjunction/remote-browser-base": minor
"@memberjunction/remote-browser-cdp": minor
"@memberjunction/remote-browser-server": minor
"@memberjunction/remote-browser-selfhost": minor
"@memberjunction/remote-browser-browserbase": minor
"@memberjunction/remote-browser-steel": minor
"@memberjunction/remote-browser-browserless": minor
"@memberjunction/remote-browser-hyperbrowser": minor
"@memberjunction/ai-xai": minor
"@memberjunction/ai-inworld": minor
"@memberjunction/ai-core-plus": minor
"@memberjunction/ai-engine-base": minor
"@memberjunction/ai-prompts": minor
"@memberjunction/aiengine": minor
"@memberjunction/cli": minor
"@memberjunction/generic-database-provider": minor
"@memberjunction/metadata-sync": minor
"@memberjunction/ng-bootstrap": minor
"@memberjunction/ng-bootstrap-lite": minor
"@memberjunction/ng-core-entity-forms": minor
"@memberjunction/server-bootstrap": minor
"@memberjunction/server-bootstrap-lite": minor
---

Remote Browser channel + new realtime voice providers + computer-use enrichment.

- **Remote Browser channel** (`@memberjunction/remote-browser-*`): an in-house realtime channel where an agent drives a live, CDP-connected browser while it talks (sales demos, support walkthroughs, trainer agents). New `AIRemoteBrowserProvider` registry (migration V202606161000) with JSONType capability gating; a universal `remote-browser-base` (driver family + `RemoteBrowserEngineBase`), a shared `remote-browser-cdp` kit (one lossless action mapper + `CdpRemoteBrowserSession`), a `remote-browser-server` engine + `RemoteBrowserChannel` (control arbiter, control modes AgentOnly/ViewOnly/Collaborative vs strategies ComputerUse/NativeAI), and five thin backends (Self-Hosted Chrome, Browserbase, Steel, Browserless, Hyperbrowser).
- **computer-use** enriched additively into a complete browser-I/O + perception engine: CSS-selector-aware actions, CDP screencast, MouseMove, accessibility-snapshot/QueryElement/GetVisibleText/GetTitle/WaitForLoadState — every consumer benefits, existing vision/coordinate path unchanged.
- **New realtime model providers**: xAI Grok Voice (`@memberjunction/ai-xai`, OpenAI-Realtime-compatible) and Inworld (`@memberjunction/ai-inworld`), with vendor/model seeds.
- **Console logging improvements** across `@memberjunction/ai-core-plus`, `ai-engine-base`, `ai-prompts`, `aiengine`, `cli`, `generic-database-provider`, `metadata-sync`, and the bootstrap/forms packages.
