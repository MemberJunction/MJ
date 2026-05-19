---
description: Generate (or regenerate) mj-sync action JSON files for an integration connector you've authored in your project.
mj-pack-version: 5.1.0
arguments:
  - name: connector-module
    description: "Path to the compiled connector module (.js) — e.g. ./dist/MyCrmConnector.js"
    required: true
  - name: flags
    description: "Optional `--export <ClassName>` if your module has multiple exports, or `--output-dir <path>` to override the default `./metadata` location."
    required: false
---

# Generate Integration Actions

Generate mj-sync action JSON files for an integration connector you've authored
in your project. The output is a set of CRUD actions (Get, Create, Update,
Delete, Search, List) per object, plus an action category record — ready for
`mj sync push`.

## When to use this

You've written a class that extends `BaseIntegrationConnector` (from
`@memberjunction/integration-engine`) and you want to expose its objects as MJ
Actions. This command saves you from hand-authoring dozens of action JSON
files.

Re-run it whenever:

- You add a new object or field to the connector's `GetIntegrationObjects()` override
- You change the connector's category, icon, or other generator config
- You want to refresh after pulling other people's connector changes

The command is **idempotent**: prior `primaryKey` and `sync` blocks (populated
by `mj sync pull`) are preserved on actions whose `Name` field still matches.

## Prerequisites

1. **`@memberjunction/cli` installed** — `mj` must be on your `PATH`:
   ```bash
   npm install -g @memberjunction/cli
   ```

2. **A connector class authored in your project**, extending
   `BaseIntegrationConnector`. Minimal sketch:

   ```typescript
   // src/MyCrmConnector.ts
   import {
       BaseIntegrationConnector,
       type IntegrationObjectInfo,
   } from '@memberjunction/integration-engine';

   export class MyCrmConnector extends BaseIntegrationConnector {
       public override get IntegrationName(): string {
           return 'MyCRM';
       }

       public override GetIntegrationObjects(): IntegrationObjectInfo[] {
           return [{
               Name: 'contacts',
               DisplayName: 'Contact',
               SupportsWrite: true,
               Fields: [
                   { Name: 'email', DisplayName: 'Email', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false },
                   { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true },
                   // …more fields
               ],
           }];
       }

       // Optionally override GetActionGeneratorConfig() to customize icon/category.
       // The base class auto-derives a config from GetIntegrationObjects().
   }
   ```

3. **The connector compiled to JavaScript.** This command imports a
   `.js` module — if your source is TypeScript, build it first
   (`tsc`, `tsx build`, etc.). Point `--connector` at the compiled output.

## Steps

1. **Parse the arguments.**
   - The first positional argument is the path to the compiled connector
     module. If it isn't provided, ask the user.
   - Pass through any `--export <name>` or `--output-dir <path>` flags the
     user gave in `$ARGUMENTS`.

2. **Confirm the connector module exists** at the supplied path. If not,
   stop and report the path that was checked.

3. **Run the CLI command.**

   ```bash
   mj codegen integration-actions --connector <connector-module-path>
   ```

   Append `--export <ClassName>` if the user specified one — useful when the
   module exports multiple classes and auto-detection picks the wrong one.

   Append `--output-dir <path>` if the user gave one. Default is `./metadata`,
   matching MJ's standard layout.

   Add `--verbose` if you want progress messages, or `--json` for
   machine-readable output (which makes parsing the result trivial).

4. **Report what landed.**
   - The integration name reported by the connector
   - Number of actions generated
   - Number of category records merged
   - The output paths (`metadata/actions/integrations-auto-generated/` and
     `metadata/action-categories/`)

5. **Tell the user how to ship the result.**
   - Push to the database with: `mj sync push --dir=metadata`
   - Or scope to just the new actions:
     `mj sync push --dir=metadata --include="actions/integrations-auto-generated"`

## Notes

- **Existing IDs are preserved.** If you previously ran `mj sync pull` and
  your action JSON files have `primaryKey` and `sync` blocks, this command
  re-uses them for any action whose `Name` field is unchanged. New actions
  (Name doesn't match anything existing) are added as fresh records and will
  be created on the next push.

- **Auto-derived file names.** Each connector's output filename is derived
  from its `IntegrationName` (lowercased, hyphenated, prefixed with `.`).
  For example, `IntegrationName = "Sage Intacct"` →
  `.sage-intacct-actions.json`. Override this from code by setting a custom
  `IntegrationName`, or pass the file pre-existing if you want to migrate
  from an older naming convention.

- **One connector per invocation.** Running for multiple connectors? Invoke
  this command once per connector. Each invocation safely merges into the
  existing files.

- **Category records.** All generated category records land in a single
  shared file (`.integration-categories.json`) — re-running for a different
  connector merges, not overwrites.

- **The `mj codegen integration-actions` command** under the hood:
  - Dynamically imports your compiled `.js` module
  - Finds the class extending `BaseIntegrationConnector`
  - Instantiates it with a zero-arg constructor (custom constructors are
    unsupported in v1 — use a factory inside `GetIntegrationObjects()` if
    you need configuration)
  - Calls `GetActionGeneratorConfig()` and feeds the result to
    `ActionMetadataGenerator`
  - Writes merged JSON to the output dir

## Example session

```bash
# Compile the connector
npm run build

# Generate the action JSON
mj codegen integration-actions --connector ./dist/MyCrmConnector.js

# Output:
# Generated 6 action(s) across 1 connector(s):
#   - MyCRM: 6 action(s) → .mycrm-actions.json
# Wrote 1 category record(s) → .integration-categories.json
#
# Actions:    /your/project/metadata/actions/integrations-auto-generated
# Categories: /your/project/metadata/action-categories

# Push to the database
mj sync push --dir=metadata
```
