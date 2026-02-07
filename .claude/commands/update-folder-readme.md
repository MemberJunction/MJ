---
folderPath: Path to the folder containing packages -- examples: packages/AI or packages/Actions
---

# Update Folder-Level README

You are creating or updating a folder-level README that serves as an overview and navigation hub for a collection of related packages.

**Folder Path**: {{folderPath}}

> Note: If `{{folderPath}}` appears literally above, the argument wasn't passed. Check the ARGUMENTS line below and use that path instead.

## Purpose

Folder-level READMEs provide:
1. **Overview**: What this family of packages does together
2. **Navigation**: Quick access to all sub-packages
3. **Architecture**: How packages relate to each other (using mermaid diagrams)
4. **Getting Started**: Entry points for new developers

## Gold Standard

Reference these folder READMEs:
- `packages/AI/README.md` - AI framework overview
- `packages/Actions/README.md` - Actions framework overview
- `packages/Communication/README.md` - Communication framework overview

Also study the hub-and-spoke model in `packages/MJCore/` where the README points to deep-dive `docs/` guides. Folder-level READMEs should similarly point to individual package READMEs and any docs/ folders within those packages.

## Process

### Phase 1: Analyze Folder Contents

1. **Find All Sub-Packages**:
   ```
   Glob: {{folderPath}}/*/package.json
   Glob: {{folderPath}}/*/*/package.json  (for nested like Providers/*)
   ```

2. **Read Existing Folder README** (if exists):
   ```
   Read {{folderPath}}/README.md
   ```

3. **Read Each Sub-Package**:
   For each package found:
   - Read its package.json (name, description)
   - Read its README.md (extract key purpose)
   - Note its dependencies on other packages in this folder
   - Check for docs/ folder with deep-dive guides

4. **Check for CLAUDE.md**:
   ```
   Read {{folderPath}}/CLAUDE.md
   ```
   Include development guidelines if present.

### Phase 2: Build Package Inventory

Create a structured inventory:

```
AI Framework Packages:
├── Core (@memberjunction/ai-core)
│   Purpose: Base abstractions and interfaces
│   Dependencies: [global, core]
│
├── Engine (@memberjunction/ai-engine)
│   Purpose: Main orchestration engine
│   Dependencies: [ai-core, core]
│
├── Providers/
│   ├── OpenAI (@memberjunction/ai-openai)
│   ├── Anthropic (@memberjunction/ai-anthropic)
│   └── ...
```

### Phase 3: Generate Folder README

#### Template Structure

```markdown
# {Framework Name}

{One paragraph overview - what problem does this family of packages solve?}

## Overview

{2-3 paragraphs explaining:
- The overall architecture
- Key concepts
- How packages work together
- When to use this framework}

## Architecture

{**Use a mermaid diagram** to show how packages relate to each other.
Choose the diagram type that best fits the architecture.}

\`\`\`mermaid
flowchart TD
    subgraph Core["Core Layer"]
        C[ai-core<br/>Base Abstractions]
    end
    subgraph Engine["Orchestration"]
        E[ai-engine<br/>Model Selection & Routing]
    end
    subgraph Providers["Provider Layer"]
        P1[OpenAI]
        P2[Anthropic]
        P3[Google]
    end
    E --> C
    P1 --> C
    P2 --> C
    P3 --> C
    Consumer[Your Application] --> E
    style Core fill:#d5e8f5,stroke:#2d5f8e
    style Engine fill:#d5f5e8,stroke:#2d8e5f
    style Providers fill:#f5e8d5,stroke:#8e5f2d
\`\`\`

## Package Structure

\`\`\`
{folderName}/
├── Core/                  # {brief description}
├── Engine/                # {brief description}
├── Providers/             # {brief description}
│   ├── OpenAI/
│   ├── Anthropic/
│   └── ...
└── {other packages}
\`\`\`

## Packages

| Package | Description | Key Exports |
|---------|-------------|-------------|
| [@memberjunction/pkg1](./Pkg1/README.md) | {description} | `Class1`, `Class2` |
| [@memberjunction/pkg2](./Pkg2/README.md) | {description} | `Class3` |

## Getting Started

### Installation

\`\`\`bash
# Install core packages
npm install @memberjunction/{main-package}

# Install specific providers/extensions as needed
npm install @memberjunction/{provider-package}
\`\`\`

### Quick Start

\`\`\`typescript
import { ... } from '@memberjunction/{main-package}';

// Basic usage example — real MJ patterns, no pseudocode
\`\`\`

## Key Concepts

### {Concept 1}
{Explanation with code example or mermaid diagram if helpful}

### {Concept 2}
{Explanation}

## Common Use Cases

1. **{Use Case 1}**: {Brief description and which packages to use}
2. **{Use Case 2}**: {Brief description and which packages to use}

## Deep-Dive Guides

{If any sub-packages have docs/ folders with topic guides, link to them here:}

- [{Topic from Package A}](./PackageA/docs/topic-guide.md) - Description
- [{Topic from Package B}](./PackageB/docs/another-guide.md) - Description

## Development

{Link to CLAUDE.md if exists, or summarize key development guidelines}

See [{folderName} Development Guide](./CLAUDE.md) for development guidelines.

## Related Frameworks

- [{Related Framework}](../{path}/README.md) - {how it relates}

## Contributing

See the [MemberJunction Contributing Guide](../../CONTRIBUTING.md).
```

### Phase 4: Package Table Generation

Create a comprehensive package table, grouped by function:

```markdown
## Packages

### Core Packages

| Package | Description | Dependencies |
|---------|-------------|--------------|
| [@memberjunction/ai-core](./Core/README.md) | Base AI abstractions | core, global |
| [@memberjunction/ai-engine](./Engine/README.md) | Orchestration engine | ai-core |

### Provider Packages

| Package | Description | Supported Models |
|---------|-------------|------------------|
| [@memberjunction/ai-openai](./Providers/OpenAI/README.md) | OpenAI integration | GPT-4, GPT-3.5 |
| [@memberjunction/ai-anthropic](./Providers/Anthropic/README.md) | Anthropic integration | Claude 4, Claude 3.5 |
```

### Phase 5: Mermaid Diagrams

**Every folder-level README must include at least one mermaid diagram** showing the package architecture. Use mermaid instead of ASCII art for all diagrams.

Recommended diagram types for folder READMEs:

| Purpose | Diagram Type |
|---------|-------------|
| Package dependency graph | `flowchart TD` |
| Data flow through framework | `flowchart LR` |
| Request lifecycle | `sequenceDiagram` |
| Class hierarchy (providers) | `classDiagram` |

**Style the diagram** with colors to group related packages:
- Core/base packages: blue tones (`fill:#d5e8f5,stroke:#2d5f8e`)
- Engine/orchestration: green tones (`fill:#d5f5e8,stroke:#2d8e5f`)
- Provider/plugin layer: orange tones (`fill:#f5e8d5,stroke:#8e5f2d`)
- Consumer/application: neutral (`fill:#f5f5f5,stroke:#666`)

### Phase 6: Cross-Linking

1. **Link to All Sub-Package READMEs**:
   - Use relative paths: `./PackageName/README.md`
   - For nested: `./Providers/OpenAI/README.md`

2. **Link to docs/ Guides in Sub-Packages**:
   - If a sub-package has docs/ with topic guides, surface those in the folder README
   - Example: `See the [Virtual Entities Guide](./MJCore/docs/virtual-entities.md)`

3. **Link to Related Folders**:
   - Use relative paths: `../Actions/README.md`
   - Link to parent: `../README.md` (if exists at packages/ level)

4. **Link to Root Documentation**:
   - `../../CLAUDE.md` for development guide
   - `../../CONTRIBUTING.md` for contribution guide

### Phase 7: Handle Special Folder Structures

#### Nested Package Directories

For folders like `packages/AI/Providers/`:
```
Providers/
├── README.md (optional - provider overview)
├── OpenAI/
├── Anthropic/
└── ...
```

Create sub-folder README if >5 packages in subfolder.

#### Mixed Content Folders

For folders with both packages and non-package directories:
- Only document actual packages (have package.json)
- Note utility directories if relevant

## Writing Guidelines

1. **Focus on "Why"**: Explain why packages are organized this way
2. **Show Relationships**: Make dependencies and data flow clear with mermaid diagrams
3. **Provide Entry Points**: Help developers know where to start
4. **Keep Current**: Only document what exists
5. **Use Mermaid, Not ASCII**: All architecture diagrams should use mermaid for consistency
6. **Link Generously**: Every package should link to its README; surface docs/ guides from sub-packages
7. **No "NEW" Annotations**: Don't use "New" or similar tags for various features/abilities in readme docs as those quickly get out of date. If you see them in packages you're updating, remove New/similar tag.

## Output

1. Write the folder README.md
2. Optionally create sub-folder READMEs for large nested directories
3. Report:
   - Packages documented
   - Links created
   - Deep-dive guides surfaced from sub-packages
   - Any packages missing READMEs (flag for follow-up)
