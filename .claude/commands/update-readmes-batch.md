---
arguments: Directory to process and optional max parallel count -- examples: "packages/AI" or "packages/AI 5"
---

# Batch Update Package READMEs

You are orchestrating README updates across multiple packages in the MemberJunction monorepo. Your task is to update all three tiers of documentation — leaf packages, branch directories, and root — in the correct order while maximizing parallelism.

## Parse Arguments

Parse the arguments from: `{{arguments}}`

**Expected format**: `[directory] [maxParallel]`
- `directory`: Directory to process (packages/AI, packages/Actions, or packages for all)
- `maxParallel`: Maximum parallel tasks (default: `5`)

Extract these values and use them throughout this command.

## Three-Tier Documentation Model

MemberJunction docs follow a three-tier tree structure:

```
Root (repo or packages/ README)
├── Branch nodes (directory READMEs with auto-TOC — packages/AI/, packages/Actions/, etc.)
│   ├── Sub-branch nodes (nested directories — packages/AI/Providers/)
│   └── Leaf nodes (package READMEs — packages/AI/Core/, packages/Actions/Engine/, etc.)
```

**Processing order is bottom-up:**
1. **Leaf packages first** (topological order by dependency)
2. **Branch directories next** (bottom-up — sub-branches before parent branches)
3. **Root last** (after all branches are updated, so its TOC is accurate)

This ensures each tier can link to already-updated content below it.

## Documentation Model

All package READMEs should follow MemberJunction's **hub-and-spoke** documentation model:
- **README.md** is the hub — overview, key features, mermaid diagrams, links to deep-dive guides
- **docs/ folder** (for complex packages) contains topic-based canonical guides
- **Mermaid diagrams are essential** — every non-trivial package needs at least one
- **Cross-linking** — packages link to each other's READMEs and docs/ guides

The gold standard is `packages/MJCore/` (README + docs/ with virtual-entities.md, isa-relationships.md). Each sub-agent running `/update-package-readme` has full details on this model.

## Process

### Phase 1: Discover Everything

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

4. **Discover Branch Nodes**:
   Identify all directories that are branch nodes (contain 2+ child packages or child directories with packages). Walk the directory tree:
   ```
   {{directory}}/          ← root (or branch if scoped like packages/AI)
   ├── AI/                 ← branch node (has child packages)
   │   ├── Providers/      ← sub-branch node (has 6+ child packages)
   │   │   ├── OpenAI/     ← leaf
   │   │   └── ...
   │   ├── Core/           ← leaf
   │   └── Engine/         ← leaf
   ├── Actions/            ← branch node
   │   ├── Engine/         ← leaf
   │   ├── Base/           ← leaf
   │   └── ...
   ```

   **Rules for branch node detection**:
   - Directory has 2+ immediate child directories that contain `package.json`
   - OR directory has child directories that are themselves branch nodes
   - Directories that contain only a single package are NOT branch nodes (that package's README suffices)

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

4. **Build Branch Node Processing Order** (bottom-up):
   ```
   Level 0 (deepest sub-branches): packages/AI/Providers/, packages/Angular/Explorer/
   Level 1 (parent branches): packages/AI/, packages/Actions/, packages/Angular/
   Level 2 (root): packages/  (or repo root)
   ```

### Phase 3: Execute Leaf Package Updates

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

### Phase 4: Execute Branch Node Updates (Bottom-Up)

After all leaf packages are updated, process branch directories bottom-up so that each branch's TOC reflects already-updated children.

```
For each level (deepest first):
  For each branch node in this level (parallelizable within level):
    Spawn Task agent with subagent_type="general-purpose":
      prompt: "Execute the /update-folder-readme command for {folderPath}.

               Context: This is part of a batch README update. All child package
               READMEs have been updated and are up-to-date. Build the auto-generated
               TOC from the current child packages and their descriptions.

               Return: Summary of what was updated, how many packages in the TOC,
               mermaid diagrams added, and any child packages missing READMEs."
```

**Processing order example:**
1. Sub-branches first: `packages/AI/Providers/`, `packages/AI/Vectorize/`
2. Parent branches next: `packages/AI/`, `packages/Actions/`, `packages/Angular/`
3. Root last: `packages/` (if running at repo level)

### Phase 5: Execute Root Update (if applicable)

If the target directory is `packages` or the repo root, update the root-level README last:

```
Spawn Task agent with subagent_type="general-purpose":
  prompt: "Execute the /update-folder-readme command for {rootPath}.

           Context: This is the root of a batch README update. All child branches
           and packages have been updated. Generate the root TOC with directory-level
           entries showing package counts. Use MemberJunction branding.
           Include a top-level architecture mermaid diagram showing how major areas relate.

           Return: Summary of the root TOC structure."
```

### Phase 6: Generate Report

Create a summary report:

```markdown
# README Batch Update Report

## Summary
- **Packages Processed**: X leaf packages
- **Branch Directories Updated**: Y branch-node READMEs (with auto-TOC)
- **Root Updated**: Yes/No
- **Waves**: Z processing waves
- **Duration**: T minutes

## Three-Tier Coverage

### Leaf Packages (Package READMEs)
- **Total**: X packages
- **Created**: N new READMEs
- **Updated**: M existing READMEs
- **Mermaid diagrams added**: D new diagrams
- **docs/ folders created**: F new docs/ folders

### Branch Directories (Folder READMEs with TOC)
- **Total**: Y branch directories
- **Created**: N new folder READMEs
- **Updated**: M existing folder READMEs
- **Packages in TOCs**: P total package entries across all TOCs

### Root
- **Updated**: Yes/No
- **Directory entries in TOC**: R areas listed

## Processing Order

### Leaf Packages

#### Wave 0 (Root Packages)
- @memberjunction/global [check] (mermaid: 1, docs/: no)
- @memberjunction/core [check] (mermaid: 3, docs/: yes - 2 guides)

#### Wave 1
- @memberjunction/ai-core [check] (mermaid: 1, docs/: no)
- @memberjunction/actions-base [check] (mermaid: 2, docs/: yes - 1 guide)

#### Wave 2
...

### Branch Directories (Bottom-Up)

#### Level 0 (Sub-Branches)
- packages/AI/Providers/README.md [check] (TOC: 6 packages)
- packages/AI/Vectorize/README.md [check] (TOC: 4 packages)

#### Level 1 (Parent Branches)
- packages/AI/README.md [check] (TOC: 15 packages, 2 subdirectories)
- packages/Actions/README.md [check] (TOC: 8 packages)

#### Level 2 (Root)
- packages/README.md [check] (TOC: 12 areas)

## Issues Encountered
- Package X: {issue description}

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
├── README.md (branch-node with auto-TOC)
├── Core/
│   ├── package.json
│   ├── README.md (leaf-node package docs)
│   └── docs/ (topic guides if complex)
├── Engine/
│   ├── package.json
│   └── README.md (leaf-node package docs)
├── Providers/
│   ├── README.md (sub-branch with auto-TOC of providers)
│   ├── OpenAI/
│   │   ├── package.json
│   │   └── README.md (leaf-node)
│   └── Anthropic/
│       ├── package.json
│       └── README.md (leaf-node)
```

### Single-Package Directories
If a directory contains exactly one package (no siblings), it is NOT a branch node. The package README itself is sufficient. Don't create a redundant folder README.

## Example Execution

For `directory: packages/AI`:

1. **Discover**: Find 15 leaf packages + 2 branch directories (Providers/, Vectorize/)
2. **Graph**: Build dependency graph for leaves
3. **Leaves** (topological waves):
   - Wave 0: [Core] (no MJ deps in scope)
   - Wave 1: [BaseAIEngine, CorePlus] (depend on Core)
   - Wave 2: [Engine, Prompts] (depend on CorePlus)
   - Wave 3: [Agents] (depends on Engine, Prompts)
   - Wave 4: [Providers/*] (depend on Core, Engine)
4. **Sub-branches**: Update Providers/README.md, Vectorize/README.md (auto-TOC of their children)
5. **Parent branch**: Update packages/AI/README.md (auto-TOC of all 15 packages + 2 subdirectories)
6. **Report**: Generate summary with three-tier coverage metrics

For `directory: packages` (full repo):

1. **Discover**: Find all leaf packages + all branch directories + root
2. **Leaves**: Process in topological waves
3. **Sub-branches**: Process deepest directories first (packages/AI/Providers/, etc.)
4. **Branches**: Process packages/AI/, packages/Actions/, packages/Angular/, etc.
5. **Root**: Update packages/README.md with directory-level TOC
6. **Report**: Full three-tier report

## Dry Run Mode

If user requests dry run (add `--dry-run` or `dryRun: true`):
- Build the dependency graph
- Show the processing order for all three tiers
- Identify which packages need docs/ folders
- List all branch nodes that would get auto-TOCs
- Don't actually update any files
- Useful for planning and verification

## Output

Report the following when complete:
1. Total packages processed (leaf nodes)
2. Branch directories updated (with TOC package counts)
3. Root updated (if applicable)
4. Processing order (waves for leaves, levels for branches)
5. Mermaid diagram adoption (added/total)
6. docs/ folder adoption (created/total complex packages)
7. Any issues or warnings
8. List of all files created/modified
9. Summary of cross-links added
