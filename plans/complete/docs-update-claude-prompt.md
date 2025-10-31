# MemberJunction Documentation Update Process

## Overview
This is a comprehensive documentation update process for the MemberJunction project that ensures all README.md files are accurate and complete, and identifies necessary updates to the documentation website.

## Prerequisites
- Access to the MemberJunction repository
- Access to https://docs.memberjunction.org
- Claude with Task/Agent capabilities
- Understanding that CODE is the source of truth

## Process Steps

### Phase 1: Repository Documentation Update

#### 1.1 Explore Repository Structure
```
Task: Identify all packages in the repository
- Use Glob to find all package.json files
- Map out the complete package structure
- Note any packages without README.md files
```

#### 1.2 Update Package README.md Files
```
Task: Update all package-level README.md files
- Launch parallel agents (max 50 concurrent) for each package
- Each agent should:
  1. Read and analyze all source code in the package
  2. Examine package.json for dependencies and scripts
  3. Identify exported functions, classes, and interfaces
  4. Document:
     - Package purpose and functionality
     - Installation instructions
     - Usage examples with code snippets
     - API reference
     - Configuration options
     - Dependencies
     - Common use cases
     - Integration with other MJ packages
  5. Ensure TypeScript examples where applicable
  6. Include any special build or deployment considerations
```

#### 1.3 Update Directory-Level README.md Files
```
Task: Update README.md files for directories containing multiple packages
- Summarize the purpose of each package group
- Explain relationships between packages
- Provide navigation guides
```

#### 1.4 Update Root README.md
```
Task: Update the repository root README.md
- Provide project overview
- List all major package categories
- Include getting started guide
- Document build and development workflows
- Reference key documentation
```

### Phase 2: Documentation Site Analysis

#### 2.1 Crawl Documentation Site
```
Task: Systematically crawl https://docs.memberjunction.org
- Start from the homepage
- Follow all internal links
- Record every URL and its content
- Note the site structure and navigation
```

#### 2.2 Compare and Generate To-Do
```
Task: Create docs-to-do.md
- For each URL on the docs site:
  - Compare content with corresponding README.md files
  - Identify outdated information
  - Note missing information
  - Flag incorrect information
- Include sections for:
  - URLs requiring updates (with specific changes needed)
  - URLs that should be removed
  - New URLs that should be created
  - Navigation/structure improvements
  - Priority levels (High/Medium/Low)
```

## Quality Checks

### For README.md Updates:
- ✓ All exported members documented
- ✓ Code examples are runnable
- ✓ TypeScript types are accurate
- ✓ Dependencies are current
- ✓ Links work correctly
- ✓ Formatting is consistent
- ✓ No placeholder text remains

### For Documentation Site Analysis:
- ✓ Every URL has been visited
- ✓ All content has been compared
- ✓ Suggestions are actionable
- ✓ Priorities are logical

## Output Files

1. **Updated README.md files** throughout the repository
2. **docs-to-do.md** in repository root with:
   - Complete URL-by-URL analysis
   - Specific change requirements
   - New page suggestions
   - Priority assignments
3. **docs-update-claude-prompt.md** (this file) with any process improvements

## Important Principles

1. **Code is Truth**: The actual source code determines what should be documented
2. **README.md as Local Truth**: Once updated, README.md files become the reference for docs site updates
3. **Completeness**: Every package must have comprehensive documentation
4. **Accuracy**: All code examples must work
5. **Consistency**: Use consistent formatting and structure across all documentation

## Parallel Processing Guidelines

- Maximum 50 concurrent agents
- Each agent works on one package
- Agents should not modify files outside their assigned package
- Main process reviews all agent outputs before committing

## Error Handling

- If a package has no clear purpose, flag for human review
- If code examples can't be verified, mark with [NEEDS VERIFICATION]
- If dependencies are unclear, check package.json and imports

## Re-running This Process

To re-run this process:
1. Copy this entire prompt to Claude
2. Ensure you're in the repository root
3. Have Claude execute the process
4. Review the generated docs-to-do.md
5. Implement changes as needed

## Notes Section

### Learnings from Execution

1. **Package Scale**: MemberJunction contains 101 packages, requiring batch processing (50 concurrent agents max)
2. **Documentation Quality**: Most packages had minimal or outdated READMEs that needed complete rewrites
3. **Common Issues Found**:
   - Incorrect package names in documentation
   - Missing API documentation
   - Outdated code examples
   - Missing dependency information
   - No build/development instructions
4. **Parent Directory Structure**: Clear hierarchy with README files needed at:
   - /packages/Actions
   - /packages/AI (with subdirs: Providers, Vectors, Recommendations)
   - /packages/Angular (with subdirs: Explorer, Generic)
   - /packages/Communication (with subdir: providers)
   - /packages/Templates
5. **Documentation Site Gaps**: The docs site exists but is missing ~80% of package documentation

### Process Improvements for Next Run

1. **Pre-Analysis Phase**: Run a quick analysis to identify packages with missing/minimal READMEs first
2. **Template Variations**: Create different README templates for:
   - Core packages
   - Provider packages (AI, Communication)
   - UI component packages
   - Utility packages
3. **Dependency Mapping**: Build a dependency graph first to ensure correct cross-references
4. **Validation Step**: Add automated checks for:
   - Correct package names matching package.json
   - Valid TypeScript in code examples
   - Proper import statements
   - Working build commands
5. **Documentation Site Integration**: Include steps to generate documentation site content from README files

### Time Estimates

- Initial setup and exploration: 30 minutes
- Package README updates: 3-4 hours (for 100+ packages)
- Parent directory READMEs: 30 minutes
- Root README update: 15 minutes
- Documentation site analysis: 30 minutes
- Total process time: ~5 hours

---
Last Updated: December 27, 2024
Process Version: 1.1