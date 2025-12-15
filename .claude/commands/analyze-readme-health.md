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
4. Scoring documentation quality
5. Prioritizing what needs updating

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

3. **Match Packages to READMEs**:
   - Package has README: ✓
   - Package missing README: ✗

### Phase 2: Quality Analysis

For each README found, analyze:

#### 2.1 Content Completeness (0-100 score)

Check for required sections:
| Section | Weight | Check |
|---------|--------|-------|
| Title/Package Name | 10 | Has H1 with package name |
| Description/Overview | 15 | Has overview paragraph |
| Installation | 10 | Has npm install instructions |
| Usage/Examples | 20 | Has code examples |
| API Reference | 15 | Documents main exports |
| Dependencies | 10 | Lists @memberjunction deps |
| Related Packages | 10 | Cross-links to related packages |
| Contributing | 10 | Has contributing section |

Score = Sum of weights for present sections

#### 2.2 Freshness Analysis

Compare README content against:
- **package.json changes**: Has package.json been modified more recently?
- **Source file changes**: Have src/*.ts files been modified more recently?
- **Export alignment**: Do documented exports match actual exports?

Freshness indicators:
- **Fresh**: README modified after or within 30 days of source changes
- **Stale**: Source modified 30-90 days after README
- **Outdated**: Source modified >90 days after README

#### 2.3 Link Validation

Check all links in README:
- **Internal links**: `./path/to/file.md` - verify file exists
- **Cross-package links**: `../OtherPkg/README.md` - verify path exists
- **External links**: URLs - note but don't validate (too slow)

Report:
- Total links
- Broken internal links
- Broken cross-package links

#### 2.4 Code Example Validation

For each code block:
- Check if imports reference the correct package name
- Flag examples using deprecated patterns (if detectable)
- Note if examples use `any` types (violation of codebase standards)

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

## Quality Distribution

| Score Range | Count | Packages |
|-------------|-------|----------|
| 90-100 (Excellent) | 15 | MetadataSync, Actions, ... |
| 70-89 (Good) | 45 | ... |
| 50-69 (Fair) | 50 | ... |
| 0-49 (Poor) | 35 | ... |
| Missing | 32 | ... |

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

### Broken Links (Priority: Medium)
1. `packages/MJCore/README.md` line 45: `../OldPackage/README.md` (deleted)
2. `packages/Actions/README.md` line 120: `./docs/old-guide.md` (moved)
...

### Severely Outdated (Priority: Medium)
1. `packages/Legacy/README.md` - Last updated 18 months ago
...

## Recommendations

1. **Immediate**: Create READMEs for 5 high-traffic packages
2. **Short-term**: Update 15 stale READMEs for core packages
3. **Ongoing**: Fix 23 broken links
```

#### Detailed Format

Includes everything in Summary plus:

```markdown
## Package-by-Package Analysis

### @memberjunction/core (packages/MJCore)

| Metric | Value |
|--------|-------|
| Quality Score | 85/100 |
| Freshness | Fresh |
| Links | 12 total, 0 broken |
| Last README Update | 2024-01-15 |
| Last Source Update | 2024-01-10 |

**Sections Present**: ✓ Title, ✓ Overview, ✓ Installation, ✓ Usage, ✗ API Reference, ✓ Dependencies
**Missing**: API Reference section
**Recommendations**: Add API reference for Metadata class

---

### @memberjunction/ai-core (packages/AI/Core)
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
    "coverage": 0.82
  },
  "packages": [
    {
      "name": "@memberjunction/core",
      "path": "packages/MJCore",
      "hasReadme": true,
      "qualityScore": 85,
      "freshness": "fresh",
      "sections": {
        "title": true,
        "overview": true,
        "installation": true,
        "usage": true,
        "apiReference": false,
        "dependencies": true
      },
      "links": {
        "total": 12,
        "broken": []
      }
    }
  ],
  "issues": {
    "missingReadmes": ["packages/AI/Providers/NewProvider"],
    "brokenLinks": [
      {"file": "packages/MJCore/README.md", "line": 45, "link": "../OldPackage/README.md"}
    ],
    "outdated": ["packages/Legacy"]
  }
}
```

### Phase 4: Prioritization

Rank packages for update priority:

**Priority Score Calculation**:
```
Priority = (Importance × 3) + (Staleness × 2) + (BrokenLinks × 1)

Where:
- Importance: 1-10 based on package centrality (how many packages depend on it)
- Staleness: 1-10 based on how outdated (10 = >1 year, 1 = fresh)
- BrokenLinks: Count of broken links
```

Output top 20 packages to update:

```markdown
## Update Priority Queue

| Rank | Package | Priority Score | Reason |
|------|---------|----------------|--------|
| 1 | @memberjunction/core | 28 | Central package, 45 dependents, stale |
| 2 | @memberjunction/ai-engine | 25 | High usage, outdated examples |
| 3 | @memberjunction/actions-base | 22 | 3 broken links, missing sections |
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
```

## Integration with Other Commands

Use this command to:
1. **Plan batch updates**: Identify which packages need work
2. **Validate after updates**: Confirm improvements
3. **CI/CD integration**: JSON format for automated checks
4. **Progress tracking**: Run periodically to track improvement

## Output

Provide:
1. Health report in requested format
2. Prioritized list of packages needing attention
3. Specific actionable recommendations
4. Overall documentation coverage percentage
