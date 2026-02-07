---
arguments: The directory to analyze and optional format (e.g., "packages/AI summary" or "packages/AI detailed")
---

# Analyze README Health

You are auditing the documentation health of the MemberJunction monorepo. Your task is to analyze README coverage, quality, and freshness across all packages.

## Parse Arguments

First, parse the arguments from: `{{arguments}}`

**Expected format**: `[directory] [outputFormat]`
- `directory`: Path to analyze (default: `packages`)
- `outputFormat`: `summary` (default), `detailed`, or `json`

Extract these values and use them throughout this command. If arguments is empty, use defaults.

## Purpose

This command helps maintain documentation quality by:
1. Finding packages without READMEs
2. Identifying outdated or incomplete READMEs
3. Detecting broken cross-links
4. Scoring documentation quality (including mermaid diagrams and docs/ folders)
5. Prioritizing what needs updating
6. Measuring alignment with the hub-and-spoke documentation model

## Analysis Process

### Phase 1: Discovery

1. **Find All Packages**:
   ```
   Glob: {{directory}}/**/package.json
   ```
   Filter out node_modules, dist, build directories.

2. **Find All READMEs**:
   ```
   Glob: {{directory}}/**/README.md
   ```

3. **Find All docs/ Folders**:
   ```
   Glob: {{directory}}/**/docs/*.md
   ```

4. **Match Packages to READMEs**:
   - Package has README: check
   - Package missing README: missing
   - Package has docs/ folder: check
   - Complex package missing docs/ folder: flag

### Phase 2: Quality Analysis

For each README found, analyze:

#### 2.1 Content Completeness (0-100 score)

Check for required sections:
| Section | Weight | Check |
|---------|--------|-------|
| Title/Package Name | 5 | Has H1 with package name |
| Description/Overview | 10 | Has overview paragraph |
| Installation | 5 | Has npm install instructions |
| Usage/Examples | 15 | Has code examples |
| Mermaid Diagrams | 15 | Has at least one mermaid diagram |
| API Reference | 10 | Documents main exports |
| Dependencies | 5 | Lists @memberjunction deps |
| Related Packages | 5 | Cross-links to related packages |
| docs/ Folder | 15 | Has docs/ with topic guides (for complex packages) |
| Guide Header Blocks | 10 | docs/ guides have standard header format |
| Contributing | 5 | Has contributing section |

Score = Sum of weights for present sections

**Complexity determination** (for docs/ folder scoring):
- Count source files: `{{packagePath}}/src/**/*.ts`
- Check for 2+ major subsystems (look for distinct module directories)
- Check for framework/base class patterns
- If complex but no docs/ folder, deduct the 15 points

#### 2.2 Mermaid Diagram Quality

For packages that have mermaid diagrams, additionally check:
- **Diagram variety**: Does it use appropriate diagram types (flowchart, sequence, ER, etc.)?
- **Styling**: Do diagrams use colors/styling to distinguish groups?
- **Relevance**: Do diagrams illustrate key architectural concepts?

Flag packages that:
- Have no mermaid diagrams at all (critical for non-trivial packages)
- Use ASCII art instead of mermaid (should be migrated)
- Have only a single basic diagram when the package is complex

#### 2.3 Hub-and-Spoke Alignment

For packages with docs/ folders, check:
- **Guide header format**: Each guide should have the standard header block:
  ```
  > **Package**: [@memberjunction/{name}](../readme.md)
  > **Related Guides**: [...](...) | [...](...)
  > **Related Packages**: [...](...) | [...](...)
  ```
- **Topic-based naming**: Guides should be named after concepts (e.g., `virtual-entities.md`), not generic categories (e.g., `architecture.md`)
- **README hub links**: README should link to all docs/ guides in a Documentation section
- **Cross-references**: Guides should link to each other and to other package docs

#### 2.4 Freshness Analysis

Compare README content against:
- **package.json changes**: Has package.json been modified more recently?
- **Source file changes**: Have src/*.ts files been modified more recently?
- **Export alignment**: Do documented exports match actual exports?

Freshness indicators:
- **Fresh**: README modified after or within 30 days of source changes
- **Stale**: Source modified 30-90 days after README
- **Outdated**: Source modified >90 days after README

#### 2.5 Link Validation

Check all links in README:
- **Internal links**: `./path/to/file.md` - verify file exists
- **Cross-package links**: `../OtherPkg/README.md` - verify path exists
- **docs/ links**: `./docs/topic.md` - verify guide exists
- **External links**: URLs - note but don't validate (too slow)

Report:
- Total links
- Broken internal links
- Broken cross-package links
- Broken docs/ links

#### 2.6 Code Example Validation

For each code block:
- Check if imports reference the correct package name
- Flag examples using deprecated patterns (if detectable)
- Note if examples use `any` types (violation of codebase standards)
- Check that examples use real MJ patterns (not pseudocode)

### Phase 3: Generate Report

#### Summary Format (default)

```markdown
# README Health Report

**Generated**: {date}
**Scope**: {{directory}}

## Overview

| Metric | Value |
|--------|-------|
| Total Packages | 177 |
| With README | 145 |
| Missing README | 32 |
| Coverage | 82% |
| With Mermaid Diagrams | 45 |
| With docs/ Folder | 12 |
| Hub-and-Spoke Compliant | 8 |

## Quality Distribution

| Score Range | Count | Packages |
|-------------|-------|----------|
| 90-100 (Excellent) | 15 | MJCore, MetadataSync, ... |
| 70-89 (Good) | 45 | ... |
| 50-69 (Fair) | 50 | ... |
| 0-49 (Poor) | 35 | ... |
| Missing | 32 | ... |

## Diagram Coverage

| Status | Count |
|--------|-------|
| Has Mermaid Diagrams | 45 |
| Has ASCII Art (migrate to mermaid) | 20 |
| No Diagrams (non-trivial package) | 60 |
| Simple Package (diagram optional) | 52 |

## Hub-and-Spoke Status

| Status | Count |
|--------|-------|
| Full hub-and-spoke (README + docs/) | 8 |
| Has docs/ but missing standards | 4 |
| Complex package, should have docs/ | 15 |
| Simple package (single README fine) | 150 |

## Freshness

| Status | Count |
|--------|-------|
| Fresh | 60 |
| Stale | 45 |
| Outdated | 40 |
| Unknown | 32 |

## Critical Issues

### Packages Missing README (Priority: High)
1. `packages/AI/Providers/NewProvider` - New package, no docs
2. `packages/Angular/Generic/NewComponent` - Recently added
...

### Missing Mermaid Diagrams (Priority: High)
1. `packages/CodeGenLib/README.md` - Complex package, no diagrams
2. `packages/SQLServerDataProvider/README.md` - Provider pattern, needs class diagram
...

### Complex Packages Missing docs/ Folder (Priority: Medium)
1. `packages/AI/Engine` - Multi-subsystem, needs topic guides
2. `packages/Actions` - Framework with extensions, needs topic guides
...

### Broken Links (Priority: Medium)
1. `packages/MJCore/README.md` line 45: `../OldPackage/README.md` (deleted)
2. `packages/Actions/README.md` line 120: `./docs/old-guide.md` (moved)
...

### Severely Outdated (Priority: Medium)
1. `packages/Legacy/README.md` - Last updated 18 months ago
...

## Recommendations

1. **Immediate**: Add mermaid diagrams to top 10 core package READMEs
2. **Short-term**: Create docs/ folders for 5 most complex packages (AI/Engine, Actions, CodeGenLib, ...)
3. **Medium-term**: Migrate ASCII art diagrams to mermaid across 20 packages
4. **Ongoing**: Fix 23 broken links
```

#### Detailed Format

Includes everything in Summary plus:

```markdown
## Package-by-Package Analysis

### @memberjunction/core (packages/MJCore)

| Metric | Value |
|--------|-------|
| Quality Score | 92/100 |
| Freshness | Fresh |
| Links | 12 total, 0 broken |
| Mermaid Diagrams | 3 (flowchart, sequence, ER) |
| docs/ Folder | Yes (2 topic guides) |
| Hub-and-Spoke | Compliant |
| Last README Update | 2024-01-15 |
| Last Source Update | 2024-01-10 |

**Sections Present**: Title, Overview, Installation, Usage, API Reference, Dependencies, Documentation (hub links)
**docs/ Guides**: virtual-entities.md (header: compliant), isa-relationships.md (header: compliant)
**Recommendations**: None - gold standard

---

### @memberjunction/ai-core (packages/AI/Core)

| Metric | Value |
|--------|-------|
| Quality Score | 65/100 |
| Freshness | Stale |
| Links | 5 total, 1 broken |
| Mermaid Diagrams | 0 |
| docs/ Folder | No |
| Hub-and-Spoke | N/A |

**Sections Present**: Title, Overview, Installation, Usage
**Missing**: Mermaid diagrams, API Reference, Dependencies, Related Packages
**Recommendations**: Add mermaid diagram of provider pattern; consider docs/ folder for base class documentation
...
```

#### JSON Format

```json
{
  "generated": "2024-01-20T10:30:00Z",
  "scope": "packages",
  "summary": {
    "totalPackages": 177,
    "withReadme": 145,
    "missingReadme": 32,
    "coverage": 0.82,
    "withMermaidDiagrams": 45,
    "withDocsFolder": 12,
    "hubAndSpokeCompliant": 8
  },
  "packages": [
    {
      "name": "@memberjunction/core",
      "path": "packages/MJCore",
      "hasReadme": true,
      "qualityScore": 92,
      "freshness": "fresh",
      "sections": {
        "title": true,
        "overview": true,
        "installation": true,
        "usage": true,
        "apiReference": true,
        "dependencies": true,
        "mermaidDiagrams": true,
        "docsFolder": true,
        "guideHeaders": true
      },
      "mermaid": {
        "count": 3,
        "types": ["flowchart", "sequenceDiagram", "erDiagram"]
      },
      "docsFolder": {
        "exists": true,
        "guides": ["virtual-entities.md", "isa-relationships.md"],
        "headerCompliant": true,
        "topicNamed": true
      },
      "links": {
        "total": 12,
        "broken": []
      }
    }
  ],
  "issues": {
    "missingReadmes": ["packages/AI/Providers/NewProvider"],
    "missingMermaid": ["packages/CodeGenLib", "packages/SQLServerDataProvider"],
    "missingDocs": ["packages/AI/Engine", "packages/Actions"],
    "brokenLinks": [
      {"file": "packages/MJCore/README.md", "line": 45, "link": "../OldPackage/README.md"}
    ],
    "outdated": ["packages/Legacy"],
    "asciiArtToMigrate": ["packages/OldPackage/README.md"]
  }
}
```

### Phase 4: Prioritization

Rank packages for update priority:

**Priority Score Calculation**:
```
Priority = (Importance x 3) + (Staleness x 2) + (MissingDiagrams x 2) + (BrokenLinks x 1)

Where:
- Importance: 1-10 based on package centrality (how many packages depend on it)
- Staleness: 1-10 based on how outdated (10 = >1 year, 1 = fresh)
- MissingDiagrams: 0-5 based on complexity vs diagram coverage
- BrokenLinks: Count of broken links
```

Output top 20 packages to update:

```markdown
## Update Priority Queue

| Rank | Package | Priority Score | Key Issues |
|------|---------|----------------|------------|
| 1 | @memberjunction/core | 28 | Central package, 45 dependents, no mermaid |
| 2 | @memberjunction/ai-engine | 25 | High usage, outdated, needs docs/ folder |
| 3 | @memberjunction/actions-base | 22 | 3 broken links, missing sections, no diagrams |
...
```

## Usage Examples

```bash
# Quick health check
/analyze-readme-health packages

# Detailed report for AI packages
/analyze-readme-health packages/AI detailed

# JSON output for CI integration
/analyze-readme-health packages json

# Check just one area
/analyze-readme-health packages/MJCore detailed
```

## Integration with Other Commands

Use this command to:
1. **Plan batch updates**: Identify which packages need work, then run `/update-readmes-batch`
2. **Validate after updates**: Confirm improvements post-update
3. **Find docs/ candidates**: Identify complex packages that should have hub-and-spoke docs
4. **Track mermaid adoption**: Monitor diagram coverage over time
5. **CI/CD integration**: JSON format for automated checks
6. **Progress tracking**: Run periodically to track improvement

## Output

Provide:
1. Health report in requested format
2. Prioritized list of packages needing attention
3. Specific actionable recommendations (organized by: mermaid, docs/ folders, content, links)
4. Overall documentation coverage percentage
5. Hub-and-spoke adoption metrics
