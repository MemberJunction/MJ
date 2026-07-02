# Computer Use Prompt Build Scripts

This directory contains build scripts for the ComputerUse package.

## generate-prompt-parts.mjs

Generates the shared, single-source-of-truth prompt parts that both prompt
layers consume.

### The two layers

The ComputerUse controller and judge prompts exist in two layers:

1. **Layer 2 — metadata templates** (`metadata/prompts/templates/computer-use/`):
   Nunjucks templates (`controller.template.md`, `judge.template.md`) consumed
   by MJ's `AIPromptRunner`.
2. **Layer 1 — standalone defaults** (`packages/AI/ComputerUse/src/prompts/`):
   `default-controller.ts` / `default-judge.ts`, used by the MJ-independent
   `ComputerUseEngine` / `LLMJudge` when no custom prompt is supplied.

### Single source of truth

The behavioral text that is **identical** between the two layers (the
"## Available Actions" catalog, the controller "## Response Format" … "## Rules"
block, and the judge "## Visual Context" … output contract) lives **once** as
plain-markdown leaf partials under:

```
metadata/prompts/templates/computer-use/_includes/
├── controller-actions.md
├── controller-response-format.md
└── judge-core.md
```

- **Layer 2** pulls each partial in via the MetadataSync `{@include ./_includes/...}`
  directive, which inlines the file content at `mj sync push` time (pure text
  composition, no runtime dependency).
- **Layer 1** consumes the same partials through this script, which reads them
  and emits `src/prompts/prompt-parts.generated.ts` — each partial exported as a
  `JSON.stringify`-escaped string const (`CONTROLLER_ACTIONS`,
  `CONTROLLER_RESPONSE_FORMAT`, `JUDGE_CORE`). `default-controller.ts` /
  `default-judge.ts` then compose those consts with their per-layer top section
  (intro, goal, current state) and dynamic-section marker.

Because both layers ultimately read the same partials, they cannot silently
diverge. The drift-guard test (`src/__tests__/prompt-single-source.test.ts`)
asserts this invariant.

### When it runs

The script runs automatically as a **prebuild** step:

```json
{
  "scripts": {
    "prebuild": "node scripts/generate-prompt-parts.mjs",
    "build": "tsc && tsc-alias -f"
  }
}
```

### Manual execution

```bash
# From package directory
npm run prebuild

# Or directly
node scripts/generate-prompt-parts.mjs
```

### Editing prompt text

- To change shared text, edit the relevant `_includes/*.md` partial and re-run
  `npm run prebuild`. Both layers update from the single source.
- To change per-layer-only text (token spacing, the top intro/state section, or
  the Nunjucks dynamic sections), edit the template (`controller.template.md` /
  `judge.template.md`) for Layer 2 and the `default-*.ts` header const for
  Layer 1.
- **Never** hand-edit `src/prompts/prompt-parts.generated.ts` — it is
  regenerated on every build.
