---
arguments: Directory to process and optional max parallel count -- examples: "packages/AI" or "packages/AI 5"
---

# Batch Update Package READMEs

You are orchestrating README updates across multiple packages in the MemberJunction monorepo. Your task is to update READMEs in topological order (dependencies first) while maximizing parallelism.

## Parse Arguments

Parse the arguments from: `{{arguments}}`

**Expected format**: `[directory] [maxParallel]`
- `directory`: Directory to process (e.g., `packages/AI`, `packages/Actions`, or `packages` for all)
- `maxParallel`: Maximum parallel tasks (default: `5`)

Extract these values and use them throughout this command.

## Documentation Model

All package READMEs should follow MemberJunction's **hub-and-spoke** documentation model:
- **README.md** is the hub — overview, key features, mermaid diagrams, links to deep-dive guides
- **docs/ folder** (for complex packages) contains topic-based canonical guides
- **Mermaid diagrams are essential** — every non-trivial package needs at least one
- **Cross-linking** — packages link to each other's READMEs and docs/ guides

The gold standard is `packages/MJCore/` (README + docs/ with virtual-entities.md, isa-relationships.md). Each sub-agent running `/update-package-readme` has full details on this model.

## Process

### Phase 1: Discover Packages

1. **Find All Packages** in the target directory:
   ```
   Glob: {{directory}}/**/package.json
   ```

2. **Filter to MemberJunction Packages**:
   - Only process packages with `@memberjunction/` scope
   - Skip `node_modules` directories
   - Skip `dist` and `build` directories

3. **Build Package List**:
   For each package.json found, extract:
   - Package name (from `name` field)
   - Package path (directory containing package.json)
   - Dependencies (filter to `@memberjunction/*` only)
   - Whether docs/ folder exists (flag for reporting)

### Phase 2: Build Dependency Graph

1. **Create Adjacency List**:
   ```
   {
     "@memberjunction/core": [],  // No MJ dependencies = root
     "@memberjunction/ai-core": ["@memberjunction/core", "@memberjunction/global"],
     "@memberjunction/ai-engine": ["@memberjunction/ai-core", "@memberjunction/core"],
     ...
   }
   ```

2. **Topological Sort** (Kahn's Algorithm):
   - Find packages with no dependencies (roots)
   - Process in waves: each wave contains packages whose dependencies are all processed
   - This ensures we update dependency READMEs before dependent packages

3. **Group Into Processing Waves**:
   ```
   Wave 0: [packages with no MJ dependencies - roots]
   Wave 1: [packages depending only on Wave 0]
   Wave 2: [packages depending only on Wave 0 and 1]
   ...
   ```

### Phase 3: Execute Updates

For each wave, spawn parallel Task agents (up to {{maxParallel}}):

```
For each package in wave:
  Spawn Task agent with subagent_type="general-purpose":
    prompt: "Execute the /update-package-readme command for package at {packagePath}.

             Context: This is part of a batch README update. Dependencies have already
             been updated: {list of dependency paths}.

             When creating cross-links, these dependency READMEs are now up-to-date
             and can be linked to. Also check if any dependency has a docs/ folder
             with topic guides — if so, link to relevant guides.

             Return: Summary of what was updated, whether docs/ folder was created/updated,
             how many mermaid diagrams were added, and any issues encountered."
```

**Important Parallelization Rules**:
- Wait for all tasks in a wave to complete before starting next wave
- Within a wave, run up to {{maxParallel}} packages in parallel
- If a wave has more packages than {{maxParallel}}, batch them

### Phase 4: Update Folder READMEs

After all package READMEs are updated, update folder-level READMEs:

1. **Identify Folder README Locations**:
   - `packages/AI/README.md` - AI framework overview
   - `packages/Actions/README.md` - Actions framework overview
   - `packages/Angular/README.md` - Angular components overview
   - `packages/Communication/README.md` - Communication framework overview
   - Any other directory containing multiple packages

2. **Update Folder READMEs**:
   ```
   Spawn Task agent:
     prompt: "Execute the /update-folder-readme command for {folderPath}"
   ```

### Phase 5: Generate Report

Create a summary report:

```markdown
# README Batch Update Report

## Summary
- **Packages Processed**: X
- **Waves**: Y
- **Duration**: Z minutes

## Documentation Model Adoption
- **Mermaid diagrams added**: N new diagrams across M packages
- **docs/ folders created**: N new docs/ folders
- **Hub-and-spoke packages**: N total (X new in this run)
- **Cross-links created**: N inter-package links

## Processing Order

### Wave 0 (Root Packages)
- @memberjunction/global [check] (mermaid: 1, docs/: no)
- @memberjunction/core [check] (mermaid: 3, docs/: yes - 2 guides)

### Wave 1
- @memberjunction/ai-core [check] (mermaid: 1, docs/: no)
- @memberjunction/actions-base [check] (mermaid: 2, docs/: yes - 1 guide)

### Wave 2
...

## Issues Encountered
- Package X: {issue description}

## Folder READMEs Updated
- packages/AI/README.md [check]
- packages/Actions/README.md [check]

## Packages Needing Follow-Up
- @memberjunction/legacy-pkg: Complex but no docs/ created (time constraint)
- @memberjunction/xyz: Missing source docs for API reference
```

## Handling Special Cases

### Circular Dependencies
If a circular dependency is detected:
1. Log a warning
2. Break the cycle by processing alphabetically
3. Include in report

### Missing package.json
Skip directories without package.json - they're not packages.

### Packages Outside Target Directory
If a dependency is outside the target directory:
- Don't try to update it
- Still link to it if it exists
- Note in report if README is missing

### Sub-Packages
Handle nested package structures like:
```
packages/AI/
├── README.md (folder-level)
├── Core/
│   ├── package.json
│   ├── README.md (package-level)
│   └── docs/ (topic guides if complex)
├── Engine/
│   ├── package.json
│   └── README.md (package-level)
```

## Example Execution

For `directory: packages/AI`:

1. **Discover**: Find 15 packages in packages/AI/*
2. **Graph**: Build dependency graph
3. **Sort**:
   - Wave 0: [Core] (no MJ deps in scope)
   - Wave 1: [BaseAIEngine, CorePlus] (depend on Core)
   - Wave 2: [Engine, Prompts] (depend on CorePlus)
   - Wave 3: [Agents] (depends on Engine, Prompts)
   - Wave 4: [Providers/*] (depend on Core, Engine)
4. **Execute**: Process each wave with parallel tasks (each adds mermaid diagrams, creates docs/ if warranted)
5. **Folder**: Update packages/AI/README.md (with mermaid architecture diagram, surfacing docs/ guides from sub-packages)
6. **Report**: Generate summary with adoption metrics

## Dry Run Mode

If user requests dry run (add `--dry-run` or `dryRun: true`):
- Build the dependency graph
- Show the processing order
- Identify which packages need docs/ folders
- Don't actually update any files
- Useful for planning and verification

## Output

Report the following when complete:
1. Total packages processed
2. Processing order (waves)
3. Mermaid diagram adoption (added/total)
4. docs/ folder adoption (created/total complex packages)
5. Any issues or warnings
6. List of all files created/modified
7. Summary of cross-links added
