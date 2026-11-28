---
"@memberjunction/core-entities": patch
"@memberjunction/ai-agents": patch
"@memberjunction/ng-artifacts": patch
---

Upgrade MJ Docs with shared document design presets, paginated layout, atomic agent batch/preflight tools, and lossless `.docx` Track Changes, Comments, and `:::mj-block` round-trip, and fix overflow-menu clipping across Docs, Sheets, and Slides:

- **Shared Document Design Presets & Paginated Sheet View (`@memberjunction/core-entities`, `@memberjunction/ng-artifacts`)**: Added five presets (`modern-clean`, `executive-memo`, `technical-spec`, `client-proposal`, `editorial`) shared across canvas, `.docx`, and PDF print via YAML frontmatter (`designPreset`, `pageSize`, `orientation`, `watermark`, `runningHeader`, `runningFooter`), hidden raw frontmatter prose on canvas/print, added `Cmd/Ctrl+K` design/layout/export commands, and added a 28px status footer with a clickable Words / Characters / Characters (no spaces) cycler persisted via `UserInfoEngine`.
- **Agent Document Tool Ergonomics (`@memberjunction/ai-agents`)**: Added `get_design_options`, `set_design_preset`, `export_preflight`, and atomic `batch` (transactional rollback, nested-batch guard, revision-hash & lock checks) to `DocumentToolLibrary`, registered `set_design_preset` and `batch` in `MUTATING_ARTIFACT_TOOL_NAMES`, and added a hostile-parameter fuzz test suite.
- **Pragmatic `.docx` Interop & Export Studio (`@memberjunction/ng-artifacts`)**: Added zip-bomb-bounded OOXML inspection (`docProps/custom.xml`, native Word Track Changes `<w:ins>`/`<w:del>`, Margin Comments `word/comments.xml`, fidelity counters), preset-styled Clean vs. Markup `.docx` & PDF export, lossless `:::mj-block` and preset rehydration on `.docx` re-import with an Import Fidelity Banner, and a native `<dialog closedby="any">` Export & Preflight Studio with wide-table quick-fix and strict preflight mode.
- **Docs, Sheets & Slides Overflow Menu Clipping Fix (`@memberjunction/ng-artifacts`)**: Rendered `.mj-docs-more-menu`, `.mj-sheets-more-menu`, and `.mj-slides-more-menu` outside their `overflow-x: auto` toolbars at `z-index: 200` so the `...` Tools & View menu always floats cleanly above content.
