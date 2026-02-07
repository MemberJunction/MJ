---
folderPath: Path to the folder containing packages -- examples: packages/AI or packages/Actions
---

# Update Folder-Level README

You are creating or updating a folder-level README that serves as a **branch node** in the documentation tree. Branch nodes sit between the root and the leaf-node package READMEs, providing navigation, architecture context, and an **auto-generated table of contents** for all child packages and subdirectories.

**Folder Path**: {{folderPath}}

> Note: If `{{folderPath}}` appears literally above, the argument wasn't passed. Check the ARGUMENTS line below and use that path instead.

## Three-Tier Documentation Model

MemberJunction docs follow a three-tier tree:

```
Root (repo README)
├── Branch nodes (directory READMEs — packages/AI/, packages/Actions/, etc.)
│   └── Leaf nodes (package READMEs — packages/AI/Core/, packages/Actions/Engine/, etc.)
```

**This command handles branch nodes.** The primary job of a branch-node README is:
1. **Auto-generated TOC** of every child package and subdirectory (the #1 requirement)
2. **Architecture overview** of how the children relate (mermaid diagram)
3. **Getting started** guidance for the framework/area
4. **Cross-links** to related branch nodes and the root

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

2. **Find All Child Directories** (potential sub-branch nodes):
   ```
   Glob: {{folderPath}}/*/
   ```
   A child directory is a sub-branch if it contains 2+ packages or has its own subdirectories with packages. These get their own row in the TOC.

3. **Read Existing Folder README** (if exists):
   ```
   Read {{folderPath}}/README.md
   ```

4. **Read Each Sub-Package**:
   For each package found:
   - Read its package.json (name, description)
   - Read its README.md (extract key purpose)
   - Note its dependencies on other packages in this folder
   - Check for docs/ folder with deep-dive guides

5. **Check for CLAUDE.md**:
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
├── Providers/  (sub-branch — 6 packages)
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
    style Core fill:#2d6a9f,stroke:#1a4971,color:#fff
    style Engine fill:#2d8659,stroke:#1a5c3a,color:#fff
    style Providers fill:#b8762f,stroke:#8a5722,color:#fff
\`\`\`

## Packages

{Auto-generated TOC — see Phase 4 below for exact format.
This is the MOST IMPORTANT section of a branch-node README.}

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

## Deep-Dive Guides

{If any sub-packages have docs/ folders with topic guides, surface them here:}

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

### Phase 4: Auto-Generated Table of Contents (CRITICAL)

The **Packages** section is the primary value of a branch-node README. It must be auto-generated from the actual folder contents.

#### Format: Grouped by Function

Group packages logically (core, engine, providers, extensions, etc.) rather than alphabetically. Each group gets a sub-heading and a table:

```markdown
## Packages

### Core

| Package | npm | Description |
|---------|-----|-------------|
| [Core](./Core/README.md) | `@memberjunction/ai-core` | Base AI abstractions and provider interfaces |
| [CorePlus](./CorePlus/README.md) | `@memberjunction/ai-core-plus` | Extended AI utilities and prompt params |

### Engine & Orchestration

| Package | npm | Description |
|---------|-----|-------------|
| [Engine](./Engine/README.md) | `@memberjunction/aiengine` | Model selection, routing, and orchestration |
| [Prompts](./Prompts/README.md) | `@memberjunction/ai-prompts` | AI prompt execution framework |
| [Agents](./Agents/README.md) | `@memberjunction/ai-agents` | AI agent framework |

### Providers

| Package | npm | Description |
|---------|-----|-------------|
| [OpenAI](./Providers/OpenAI/README.md) | `@memberjunction/ai-openai` | OpenAI GPT integration |
| [Anthropic](./Providers/Anthropic/README.md) | `@memberjunction/ai-anthropic` | Anthropic Claude integration |
| [Mistral](./Providers/Mistral/README.md) | `@memberjunction/ai-mistral` | Mistral AI integration |
```

#### Format: Subdirectories as Rows

If the folder contains child directories that are themselves branch nodes (have 2+ packages), include them in the TOC with a package count:

```markdown
### Subdirectories

| Directory | Description | Packages |
|-----------|-------------|----------|
| [Providers](./Providers/README.md) | AI model provider integrations | 6 packages |
| [Vectorize](./Vectorize/README.md) | Vector embedding providers | 4 packages |
```

#### Rules for the TOC

1. **Every child package MUST appear** — no exceptions. The TOC is exhaustive.
2. **Link to each package's README** — use `./PackageName/README.md` relative paths
3. **Show the npm package name** — helps consumers find the right install target
4. **Pull descriptions from package.json** `description` field, trim to one line
5. **Group logically** — by function/layer, not alphabetically. Use your judgment based on the architecture.
6. **Flag missing READMEs** — if a child package lacks a README, still list it but note "(no README)" so it's visible

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
Use medium-brightness fills with explicit white text so diagrams are readable in both dark and light mode. Avoid light pastels (wash out in dark mode) and very dark fills (disappear in light mode).

- Core/base packages: blue (`fill:#2d6a9f,stroke:#1a4971,color:#fff`)
- Engine/orchestration: green (`fill:#2d8659,stroke:#1a5c3a,color:#fff`)
- Provider/plugin layer: orange (`fill:#b8762f,stroke:#8a5722,color:#fff`)
- Consumer/application: gray (`fill:#64748b,stroke:#475569,color:#fff`)

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
├── README.md (sub-branch with its own TOC)
├── OpenAI/
├── Anthropic/
└── ...
```

Create sub-folder README if the subfolder contains 2+ packages.

#### Mixed Content Folders

For folders with both packages and non-package directories:
- Only document actual packages (have package.json)
- Note utility directories if relevant

#### Root-Level Handling

When the target is the repo root or `packages/` directory:
- Use MemberJunction branding in the H1
- Group child directories by functional area
- Focus the TOC on directory-level entries (not individual packages — those are too numerous)
- Include a top-level architecture diagram showing how the major areas relate

Example root-level TOC:

```markdown
## Project Structure

| Area | Description | Packages |
|------|-------------|----------|
| [AI](./AI/README.md) | AI framework — models, providers, agents, prompts | 15 packages |
| [Actions](./Actions/README.md) | Metadata-driven action system for workflows and agents | 8 packages |
| [Angular](./Angular/README.md) | Angular UI components and Explorer application | 25 packages |
| [Communication](./Communication/README.md) | Email, SMS, and messaging framework | 6 packages |
| [MJCore](./MJCore/README.md) | Core framework — entities, metadata, providers | 1 package |
| [MJServer](./MJServer/README.md) | Server-side infrastructure and GraphQL API | 1 package |
```

## Writing Guidelines

1. **Focus on "Why"**: Explain why packages are organized this way
2. **Show Relationships**: Make dependencies and data flow clear with mermaid diagrams
3. **Provide Entry Points**: Help developers know where to start
4. **Keep Current**: Only document what exists
5. **Use Mermaid, Not ASCII**: All architecture diagrams should use mermaid for consistency
6. **Link Generously**: Every package should link to its README; surface docs/ guides from sub-packages
7. **No "NEW" Annotations**: Don't use "New" or similar tags for various features/abilities in readme docs as those quickly get out of date. If you see them in packages you're updating, remove New/similar tag.
8. **TOC is Exhaustive**: Every child package must appear in the Packages section. No orphans.

## Output

1. Write the folder README.md
2. Optionally create sub-folder READMEs for large nested directories (2+ packages)
3. Report:
   - Packages documented
   - Links created
   - Deep-dive guides surfaced from sub-packages
   - Any packages missing READMEs (flag for follow-up)
