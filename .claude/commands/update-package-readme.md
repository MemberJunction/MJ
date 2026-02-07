---
packagePath: Path to the package -- examples: packages/AI/Core or packages/MJCore
---

# Update Package README

You are a documentation specialist for MemberJunction. Your task is to analyze a package and create or update its README.md to accurately reflect the current state of the code.

**Package Path**: {{packagePath}}

> Note: If `{{packagePath}}` appears literally above, the argument wasn't passed. Check the ARGUMENTS line below and use that path instead.

## Gold Standard

The documentation model for MemberJunction follows a **hub-and-spoke** pattern:
- **README.md** is the hub — overview, key concepts, links into deep-dive guides
- **docs/ folder** contains the spokes — topic-based canonical guides with mermaid diagrams, code examples, and cross-references

**Exemplar packages** (study these before writing):
- **MJCore** (`packages/MJCore/README.md` + `packages/MJCore/docs/`) - Best example of hub-and-spoke with deep-dive topic guides (`virtual-entities.md`, `isa-relationships.md`)
- **MetadataSync** (`packages/MetadataSync/README.md`) - Comprehensive single-README package
- **Actions** (`packages/Actions/README.md`) - Excellent architecture docs
- **AI Framework** (`packages/AI/README.md`) - Clear package structure overview
- **Communication** (`packages/Communication/README.md`) - Great capability matrix

## Process

### Phase 1: Analyze Package

1. **Read Existing README** (if exists):
   ```
   Read {{packagePath}}/README.md
   ```

2. **Read Package Configuration**:
   ```
   Read {{packagePath}}/package.json
   ```
   Extract: name, description, dependencies (especially @memberjunction/* ones), scripts

3. **Analyze Source Code Structure**:
   - Use Glob to find all TypeScript files: `{{packagePath}}/src/**/*.ts`
   - Read the main entry point (usually `index.ts` or file referenced in package.json main)
   - Identify exported classes, functions, and types
   - Look for existing JSDoc/TSDoc comments

4. **Check for CLAUDE.md** (development guidelines):
   ```
   Read {{packagePath}}/CLAUDE.md
   ```
   Incorporate relevant development guidelines if present.

5. **Check for Existing docs/ Folder**:
   ```
   Glob: {{packagePath}}/docs/**/*.md
   ```
   If guides already exist, review and update them alongside the README.

6. **Determine Documentation Strategy**:
   Choose one of these based on the package's **conceptual richness** (not just file count):

   - **Single README** — Package has a straightforward, single-purpose API (e.g., a single provider, a thin wrapper). Even with many files, if the concepts are simple, a README alone suffices.

   - **Hub-and-Spoke (README + docs/)** — Package has **multiple distinct concepts** that each deserve deep treatment. Triggers:
     - Package has 2+ major subsystems or patterns (e.g., virtual entities AND IS-A relationships in MJCore)
     - Package has complex lifecycle or orchestration (e.g., CodeGen pipeline stages)
     - Package serves as a framework that others extend (e.g., provider base classes)
     - Package has concepts that would make the README >300 lines if fully explained inline

### Phase 2: Generate README Structure

#### Required Sections (All Packages)

```markdown
# @memberjunction/{package-name}

{One-paragraph overview explaining what this package does and why it exists}

## Installation

\`\`\`bash
npm install @memberjunction/{package-name}
\`\`\`

## Overview

{2-3 paragraphs explaining the package's purpose, architecture, and key concepts.
Include a mermaid diagram here — see Mermaid Diagrams section below.}

## Key Features

- **Feature 1**: Description
- **Feature 2**: Description
- ...

## Usage

### Basic Example

\`\`\`typescript
import { ... } from '@memberjunction/{package-name}';

// Example code showing the most common use case
\`\`\`

### {Additional Examples as needed}

## API Reference

### {ClassName}

{Brief description}

| Method | Description |
|--------|-------------|
| `method()` | What it does |

## Dependencies

This package depends on:
- [@memberjunction/dep1](../dep1/README.md) - Description
- [@memberjunction/dep2](../dep2/README.md) - Description

## Related Packages

- [@memberjunction/related1](../related1/README.md) - How it relates
- [@memberjunction/related2](../related2/README.md) - How it relates

## Contributing

See the [MemberJunction Contributing Guide](../../CONTRIBUTING.md) for development setup and guidelines.
```

#### Hub-and-Spoke: docs/ Folder Guides

For packages that warrant deep-dive guides, create a `docs/` folder with **topic-based** guides (NOT generic categories):

```
{{packagePath}}/
├── README.md (hub — overview, links to guides)
├── docs/
│   ├── {topic-a}.md       (e.g., virtual-entities.md)
│   ├── {topic-b}.md       (e.g., isa-relationships.md)
│   └── {topic-c}.md       (e.g., field-sync.md)
```

**Each guide MUST include this header block:**

```markdown
# {Topic Title} in MemberJunction

> **Package**: [@memberjunction/{name}](../readme.md)
> **Related Guides**: [{Other Guide}](./other-guide.md) | [{Another}](./another.md)
> **Related Packages**: [@memberjunction/{pkg}](../../Pkg/README.md) | ...
```

The README hub should link to guides:

```markdown
## Documentation

For deep-dive guides on specific topics:

- [{Topic A}](./docs/topic-a.md) - One-sentence description
- [{Topic B}](./docs/topic-b.md) - One-sentence description
```

**Topic naming**: Name guides after the concept, not after generic categories. Use `virtual-entities.md` not `architecture.md`. Use `provider-pattern.md` not `api-reference.md`. Use `pipeline-stages.md` not `examples.md`.

### Phase 3: Mermaid Diagrams

**Mermaid diagrams are essential, not optional.** Every README of a non-trivial package and every docs/ guide should include at least one mermaid diagram. The gold standard (MJCore/docs/) uses multiple diagram types per guide.

Choose the right diagram type for the concept:

| Concept | Diagram Type | Example |
|---------|-------------|---------|
| Data flow / architecture layers | `flowchart TD` or `flowchart LR` | How components connect |
| Request/response lifecycle | `sequenceDiagram` | Save orchestration, API calls |
| Data model / entity relationships | `erDiagram` | IS-A hierarchies, FK relationships |
| State transitions | `stateDiagram-v2` | Entity lifecycle states |
| Class hierarchy | `classDiagram` | Provider pattern, inheritance |

**Example from gold standard:**

```markdown
\`\`\`mermaid
flowchart LR
    subgraph Regular["Regular Entity"]
        RT[Base Table] --> RV[Base View]
        RV --> RE[Entity Metadata]
    end
    subgraph Virtual["Virtual Entity"]
        VV[SQL View Only] --> VE[Entity Metadata]
    end
    RE --> API[GraphQL API / RunView]
    VE --> API
    style Virtual fill:#e8d5f5,stroke:#7b2d8e
    style Regular fill:#d5e8f5,stroke:#2d5f8e
\`\`\`
```

**Rules for mermaid diagrams:**
- Use colors/styling to distinguish different conceptual groups
- Keep diagrams focused — one concept per diagram
- Add labels that explain what's happening, not just box names
- For complex systems, use multiple smaller diagrams rather than one giant one

### Phase 4: Code Examples

Code examples should be:
- **Real** — Use actual MemberJunction APIs, not pseudocode
- **Complete** — Show imports, setup, and the core usage
- **Typed** — Never use `any` types
- **Annotated** — Comments explain the WHY, not the WHAT

```typescript
// GOOD: Real MJ pattern with context
import { Metadata } from '@memberjunction/core';
import { ProductEntity } from '@memberjunction/core-entities';

const md = new Metadata();
// Use GetEntityObject — never instantiate entity classes directly
const product = await md.GetEntityObject<ProductEntity>('Products');
product.Name = 'Conference Pass';
await product.Save();
```

### Phase 5: Cross-Linking

1. **Link to Dependencies**: Use relative paths to link to dependency READMEs
   ```markdown
   This package extends [@memberjunction/core](../MJCore/README.md)
   ```

2. **Link to Related Packages**: Identify packages that:
   - Depend on this package (consumers)
   - Are in the same functional area (siblings)
   - Provide complementary functionality

3. **Link to docs/ guides** in related packages when relevant:
   ```markdown
   See the [Virtual Entities Guide](../MJCore/docs/virtual-entities.md) for details on how virtual entities are defined.
   ```

4. **Use Relative Paths**: Always use relative paths like:
   - `../PackageName/README.md` for sibling packages
   - `../../OtherDir/PackageName/README.md` for packages in other directories
   - `./docs/file.md` for internal documentation

### Phase 6: Write README

1. **For New README**: Create comprehensive documentation following the template

2. **For Existing README**:
   - Preserve custom sections that are still relevant
   - Update outdated information (version numbers, API changes)
   - Add missing sections from the template
   - Fix broken links
   - Update code examples if APIs have changed
   - Add mermaid diagrams if missing
   - Create docs/ folder with topic guides if the package warrants it

3. **Validate Links**: Ensure all cross-references point to existing files

## Writing Guidelines

1. **Be Accurate**: Only document what actually exists in the code
2. **Be Concise**: Avoid redundant explanations
3. **Use Code Examples**: Show, don't just tell — real MJ patterns only
4. **Use Mermaid Diagrams**: Visualize architecture, data flow, and relationships
5. **Keep It Current**: Reflect the actual current state, not aspirations
6. **No Emojis**: Unless the existing README uses them
7. **Consistent Formatting**: Use consistent header levels and code block languages
8. **No "NEW" Annotations**: Don't use "New" or similar tags for various features/abilities in readme docs as those quickly get out of date. If you see them in packages you're updating, remove New/similar tag.

## What NOT to Include

- Auto-generated content markers (let the README look natural)
- "Last updated" timestamps (they get stale)
- Badges unless they're already present and meaningful
- Excessive boilerplate
- Documentation for private/internal APIs unless critical

## Final Steps

1. Write the README.md file
2. If hub-and-spoke, create/update docs/ folder with topic guides
3. Ensure every guide has the standard header block (Package, Related Guides, Related Packages)
4. Ensure at least one mermaid diagram per non-trivial doc
5. Report what was created/updated and key changes made
6. List any broken links or missing information that couldn't be resolved

## Example Cross-Link Patterns

```markdown
<!-- For a package at packages/AI/Core/ linking to packages/AI/Engine/ -->
See [@memberjunction/ai-engine](../Engine/README.md) for orchestration.

<!-- For a package at packages/AI/Core/ linking to packages/MJCore/ -->
Built on [@memberjunction/core](../../MJCore/README.md).

<!-- For internal docs -->
See the [Provider Pattern Guide](./docs/provider-pattern.md) for details.

<!-- For cross-package deep-dive links -->
For details on virtual entity behavior, see the [Virtual Entities Guide](../../MJCore/docs/virtual-entities.md).
```
