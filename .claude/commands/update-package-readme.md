---
packagePath: Path to the package (e.g., packages/AI/Core or packages/MJCore)
---

# Update Package README

You are a documentation specialist for MemberJunction. Your task is to analyze a package and create or update its README.md to accurately reflect the current state of the code.

**Package Path**: {{packagePath}}

## Quality Standards

Base your README on the best examples in this repo:
- **MetadataSync** (`packages/MetadataSync/README.md`) - Most comprehensive
- **Actions** (`packages/Actions/README.md`) - Excellent architecture docs
- **AI Framework** (`packages/AI/README.md`) - Clear package structure
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

5. **Determine Package Complexity**:
   - **Simple** (<10 source files): Single README is sufficient
   - **Medium** (10-30 source files): Consider sections with internal links
   - **Complex** (>30 source files or sub-packages): Create sub-docs with TOC

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

{2-3 paragraphs explaining the package's purpose, architecture, and key concepts}

## Key Features

- **Feature 1**: Description
- **Feature 2**: Description
- ...

## Usage

### Basic Example

\`\`\`typescript
import { ... } from '@memberjunction/{package-name}';

// Example code
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

#### Additional Sections for Complex Packages

For packages with >30 files or sub-packages, create a docs/ folder:

```
{{packagePath}}/
├── README.md (overview with TOC)
├── docs/
│   ├── architecture.md
│   ├── api-reference.md
│   ├── examples.md
│   └── migration-guide.md (if applicable)
```

Main README should have:
```markdown
## Documentation

- [Architecture Overview](./docs/architecture.md)
- [API Reference](./docs/api-reference.md)
- [Examples](./docs/examples.md)
```

### Phase 3: Cross-Linking

1. **Link to Dependencies**: Use relative paths to link to dependency READMEs
   ```markdown
   This package extends [@memberjunction/core](../MJCore/README.md)
   ```

2. **Link to Related Packages**: Identify packages that:
   - Depend on this package (consumers)
   - Are in the same functional area (siblings)
   - Provide complementary functionality

3. **Use Relative Paths**: Always use relative paths like:
   - `../PackageName/README.md` for sibling packages
   - `../../OtherDir/PackageName/README.md` for packages in other directories
   - `./docs/file.md` for internal documentation

### Phase 4: Write README

1. **For New README**: Create comprehensive documentation following the template

2. **For Existing README**:
   - Preserve custom sections that are still relevant
   - Update outdated information (version numbers, API changes)
   - Add missing sections from the template
   - Fix broken links
   - Update code examples if APIs have changed

3. **Validate Links**: Ensure all cross-references point to existing files

## Writing Guidelines

1. **Be Accurate**: Only document what actually exists in the code
2. **Be Concise**: Avoid redundant explanations
3. **Use Code Examples**: Show, don't just tell
4. **Keep It Current**: Reflect the actual current state, not aspirations
5. **No Emojis**: Unless the existing README uses them
6. **Consistent Formatting**: Use consistent header levels and code block languages

## What NOT to Include

- Auto-generated content markers (let the README look natural)
- "Last updated" timestamps (they get stale)
- Badges unless they're already present and meaningful
- Excessive boilerplate
- Documentation for private/internal APIs unless critical

## Final Steps

1. Write the README.md file
2. If complex package, create docs/ folder with sub-documents
3. Report what was created/updated and key changes made
4. List any broken links or missing information that couldn't be resolved

## Example Cross-Link Patterns

```markdown
<!-- For a package at packages/AI/Core/ linking to packages/AI/Engine/ -->
See [@memberjunction/ai-engine](../Engine/README.md) for orchestration.

<!-- For a package at packages/AI/Core/ linking to packages/MJCore/ -->
Built on [@memberjunction/core](../../MJCore/README.md).

<!-- For internal docs -->
See the [Architecture Guide](./docs/architecture.md) for details.
```
