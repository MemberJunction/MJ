# @memberjunction/ai-diagrams

Architecture, workflow, sequence, data-flow and lifecycle diagrams from a typed JSON spec. The renderer is a vendored copy of [archify](https://github.com/tt-a1i/archify) (MIT). It runs in-process: no CLI, no shell and no browser are needed to render.

The model writes a spec: nodes with explicit positions and sizes, plus edges. archify validates the spec against its JSON schemas and layout rules, and returns structured diagnostics the model can repair against. A spec that passes renders to:

- **a self-contained SVG.** Its styles are copied from archify's page and scoped to the SVG's own id, using the light theme with colors resolved to literal values. It has a solid background and no quotes or `--` in its `<style>`, so it is safe in report HTML and in a markdown ```` ```svg ```` fence.
- **the standalone interactive page.** It has themes, an animated trace, a node finder, a focus panel, and PNG/JPEG/WebP/SVG/WebM export.

```ts
import { ArchitectureDiagramRenderer, GetArchitectureDiagramReference } from '@memberjunction/ai-diagrams';

const schema = GetArchitectureDiagramReference('schema', 'dataflow');
const result = await ArchitectureDiagramRenderer.Instance.Render('dataflow', spec);
if (result.Success) {
    embed(result.Svg);
} else if (result.ErrorCode === 'VALIDATION_FAILED') {
    repair(result.Failure.diagnostics);
}
```

Agents use it through two actions in `@memberjunction/core-actions`, `Render Architecture Diagram` and `Get Architecture Diagram Reference`, and through the **Architecture & Flow Diagrams** skill.

## How it runs

archify's renderers are CLI scripts: importing one reads its input, renders, and writes the page as it loads. Each render therefore runs in a fresh worker thread, in the same process, that imports the renderer for the requested type. The worker has an empty environment and a capped heap, and it is stopped after 30 seconds.

## What is vendored

| Path | What |
|---|---|
| `vendor/archify/` | Upstream files, unmodified except for the shims: `renderers/`, `schemas/`, `examples/` (specs only), `references/`, `brand-marks/catalog.json`, `assets/template.html`, `SKILL.md`, `LICENSE`, `THIRD_PARTY_NOTICES.md`. The JetBrains Mono font is under the OFL; see `assets/JetBrainsMono-OFL.txt`. |
| `UPSTREAM.json` | The pinned release: tag, tree SHA, and the release zip's SHA-256. It also lists the vendored paths and the exclusions. |
| `archify-shims.patch` | The only change to upstream, all in `renderers/shared/cli.mjs`: input and output in memory, no repository-evidence reads, and no fetching of brand marks from URLs. |
| `assets/template.lite.html` | archify's page without its embedded fonts, using MJ's font stacks instead. Built by `npm run build:lite-template`. |

## Updating archify

A monthly sync job reads archify's release manifest and opens a PR when there is a new release. To update by hand:

1. Replace the vendored paths from the new release zip after checking its SHA-256.
2. Re-apply the shims from the repo root:
   `git apply --directory=packages/AI/Diagrams/vendor/archify packages/AI/Diagrams/archify-shims.patch`
3. Run `npm run build:lite-template`.
4. Update `UPSTREAM.json`.

`src/__tests__/upstream-examples.test.ts` renders every upstream example, so a release that breaks a renderer, the shims or the template fails there.

## License

The package code is BUSL-1.1, like the rest of MemberJunction. The vendored archify code is MIT, © tt-a1i; see `vendor/archify/LICENSE`.
