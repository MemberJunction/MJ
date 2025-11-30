---
arguments: Directory to process and optional max parallel count (e.g., "packages/AI" or "packages/AI 5")
---

# Batch Update Package READMEs

You are orchestrating README updates across multiple packages in the MemberJunction monorepo. Your task is to update READMEs in topological order (dependencies first) while maximizing parallelism.

## Parse Arguments

Parse the arguments from: `{{arguments}}`

**Expected format**: `[directory] [maxParallel]`
- `directory`: Directory to process (e.g., `packages/AI`, `packages/Actions`, or `packages` for all)
- `maxParallel`: Maximum parallel tasks (default: `5`)

Extract these values and use them throughout this command.

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
             and can be linked to.

             Return: Summary of what was updated and any issues encountered."
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

## Processing Order

### Wave 0 (Root Packages)
- @memberjunction/global ✓
- @memberjunction/core ✓

### Wave 1
- @memberjunction/ai-core ✓
- @memberjunction/actions-base ✓

### Wave 2
...

## Issues Encountered
- Package X: {issue description}

## Folder READMEs Updated
- packages/AI/README.md ✓
- packages/Actions/README.md ✓

## Cross-Links Created
- 45 inter-package links added
- 12 broken links fixed
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
│   └── README.md (package-level)
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
4. **Execute**: Process each wave with parallel tasks
5. **Folder**: Update packages/AI/README.md
6. **Report**: Generate summary

## Dry Run Mode

If user requests dry run (add `--dry-run` or `dryRun: true`):
- Build the dependency graph
- Show the processing order
- Don't actually update any files
- Useful for planning and verification

## Output

Report the following when complete:
1. Total packages processed
2. Processing order (waves)
3. Any issues or warnings
4. List of all files created/modified
5. Summary of cross-links added
