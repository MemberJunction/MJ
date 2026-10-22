---
name: package-agent
description: Validates, packages, and exports an agent into a promotion bundle with an AGENT_MANIFEST.md for admin review.
---

# Skill: `package-agent` (Exporting for Promotion)

Use this skill when the user is satisfied with their agent and wants to share, export, or submit it for promotion to staging or production.

## Step 1: Pre-Flight Safety Validation
Inspect the agent's files and verify against the security rules:
- [ ] `ModelSelectionMode: "Agent Type"` is set (no pinned provider models).
- [ ] `ExposeAsAction: false` (or explicitly documented if true).
- [ ] No hardcoded record IDs or personal names in prompts.
- [ ] No API keys, credentials, or secrets embedded in metadata.
- [ ] If Tier 2 Runtime Actions are included, ensure an explicit `allowedEntities` list is specified.

## Step 2: Extract Last Successful Execution Receipt
Run `./scripts/query-run-history.sh` to grab the ID and metrics of the latest successful run:
```bash
# List recent runs for the agent
./scripts/query-run-history.sh "<Agent Name>"

# Fetch structured JSON audit for the target RunID
./scripts/query-run-history.sh <RunID> --format json
```
Record:
- Timestamp of test run
- Total tokens consumed
- Verified actions executed (`actionsUsed`)
- Sample input and generated output summary

## Step 3: Generate `AGENT_MANIFEST.md`
Create a clean manifest file documenting:
1. **Agent Metadata**:
   - Name & Description
   - Author (User name) & Creation Date
   - Agent Type (Flow vs Loop)
2. **Tier Classification**:
   - **Tier 1 (Declarative)**: Safe for immediate auto-approval.
   - **Tier 2 (Runtime Action)**: Highlight any custom JavaScript files that require admin review.
3. **Data Footprint**:
   - Entities Read (e.g. `Orders`, `Customers`)
   - Entities Written (e.g. `None` or `Invoices`)
   - Actions and Tools Bound
4. **Sample Test Results**:
   - The verified test inputs and outputs from Step 2.

## Step 4: Bundle into Archive
Create the `dist/` directory and package the agent's files:
```bash
mkdir -p dist
AGENT_SLUG="<agent-slug>"
PACKAGE_NAME="${AGENT_SLUG}-package.zip"

# Create archive containing the manifest, metadata files, and prompt templates
zip -r "dist/${PACKAGE_NAME}" \
  AGENT_MANIFEST.md \
  metadata/agents/.*"${AGENT_SLUG}"*.json \
  metadata/prompts/.*"${AGENT_SLUG}"*.json \
  metadata/prompts/templates/"${AGENT_SLUG}"*.md \
  2>/dev/null || tar -czf "dist/${AGENT_SLUG}-package.tar.gz" AGENT_MANIFEST.md metadata/
```

## Step 5: Inform the User
Provide the user with:
1. The path to the export package (`dist/<package-name>`).
2. A summary of `AGENT_MANIFEST.md`.
3. Instructions on sharing the bundle with their organization's platform team or administrator.
