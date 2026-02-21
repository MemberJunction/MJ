# Computer Use Prompt Sync Script

This directory contains build scripts for the ComputerUse package.

## sync-prompts.mjs

Automatically syncs prompt templates from MemberJunction metadata to the package source code.

### Purpose

The ComputerUse package maintains default prompts for the controller and judge LLMs. These prompts are:
1. **Defined as metadata** in `metadata/prompts/templates/computer-use/` (source of truth)
2. **Copied to package source** in `packages/AI/ComputerUse/src/prompts/` (for MJ-independent distribution)

This script ensures that changes to the metadata prompts are automatically reflected in the package code.

### How It Works

1. **Reads** the template files from metadata:
   - `controller.template.md` → `default-controller.ts`
   - `judge.template.md` → `default-judge.ts`

2. **Converts** Nunjucks template syntax to simple placeholders:
   - Removes `{% if %}` / `{% for %}` conditional blocks
   - Replaces dynamic sections with `{{dynamicSections}}` placeholder
   - Removes spaces from template variables: `{{ goal }}` → `{{goal}}`

3. **Generates** TypeScript constant exports:
   - Escapes backticks for template literals
   - Adds proper JSDoc headers
   - Exports as `DEFAULT_CONTROLLER_PROMPT` / `DEFAULT_JUDGE_PROMPT`

### Template Syntax Differences

**Metadata templates** (Nunjucks syntax for MJ's AIPromptRunner):
```markdown
{% if toolDefinitions and toolDefinitions.length > 0 %}
## Available Tools
{% for tool in toolDefinitions %}
### {{ tool.Name }}
{% endfor %}
{% endif %}
```

**Package templates** (simple placeholders for ComputerUseEngine):
```markdown
{{dynamicSections}}
```

The `{{dynamicSections}}` placeholder is filled programmatically at runtime by `ComputerUseEngine.buildDynamicSections()`, which generates the tools, credentials, feedback, and step history sections based on the current request context.

### When It Runs

The script runs automatically as a **prebuild** step:

```json
{
  "scripts": {
    "prebuild": "node scripts/sync-prompts.mjs",
    "build": "tsc && tsc-alias -f"
  }
}
```

This ensures the prompts are always in sync before building.

### Manual Execution

You can also run the script manually:

```bash
# From package directory
npm run prebuild

# Or directly
node scripts/sync-prompts.mjs
```

### Why This Architecture?

- **Single Source of Truth**: Metadata files are the authoritative prompt definitions
- **MJ Integration**: Layer 2 (MJComputerUseEngine) uses MJ prompt entities via AIPromptRunner
- **Package Independence**: Layer 1 (ComputerUseEngine) includes default prompts for standalone use
- **Automatic Sync**: Prebuild script ensures metadata changes propagate to package
