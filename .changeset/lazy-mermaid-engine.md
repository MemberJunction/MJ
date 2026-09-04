---
"@memberjunction/ng-markdown": patch
---

The mermaid engine loads when a diagram exists, not on every render.

`markdown.service.ts` imported `mermaid` statically and ran `initializeMermaid()` *before* the block-count check, so every markdown render in every host paid for a diagram engine most documents never use. Both guards already existed — the component gates on `enableMermaid && hasMermaid`, and `renderMermaid()` already early-returned on zero blocks — the engine was simply being loaded above both of them. It now finds the blocks first and imports the engine only if there are any.

Measured with esbuild `--splitting --format=esm` over the built `dist/public-api.js`, walking the metafile graph from the entry and counting only chunks reachable by **static** edges:

| | before | after |
|---|---|---|
| eager, raw | 2.421 MB | **1.439 MB** (−40.6%) |
| eager, gzipped | 0.509 MB | **0.313 MB** (−38.5%) |
| eager chunk count | 18 | 2 |

Both remaining eager chunks contain zero mermaid-family inputs. Nothing was removed — the deferred half grows by the same amount, plus 2 KB for one extra chunk boundary.

A failed chunk load never degrades silently: it logs the cause, tags every block it was going to render with `.mermaid-error`, and shows the existing red box (built from `--mj-status-error` tokens) captioned "Diagram engine failed to load", with the diagram source still readable underneath. A per-diagram render failure routes through the same helper with a distinct message, because a missing chunk and an unparseable diagram are different problems. `loadMermaid()` clears its cached promise and rethrows, so a later render retries.

`MarkdownService`'s public surface is unchanged — only private members moved.
