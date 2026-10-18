# Promotion & Governance Guide: Reviewing Packaged Agents

This guide is for MemberJunction platform administrators, team leads, and review boards responsible for evaluating and deploying agents authored via the Citizen Agent Builder.

---

## 1. What Arrives at Promotion

A citizen builder submits an export archive (e.g. `dist/InvoiceAuditAgent-package.zip`), which contains:

1. **`AGENT_MANIFEST.md`**: An executive summary describing:
   - What the agent does and who built it.
   - Classification: **Tier 1 (Declarative)** vs **Tier 2 (Runtime Action)**.
   - Data Footprint: Explicit list of entities read and entities modified.
   - Sample Execution Receipt: Verification trace from a test run.
2. **Metadata Files**:
   - `metadata/agents/.*<name>*.json`
   - `metadata/prompts/.*<name>*.json`
   - `metadata/prompts/templates/<name>*.md`
   - (If Tier 2) `metadata/actions/.*<name>*.json`

---

## 2. The Review Process

### Tier 1 (Declarative Agents) — Fast Track (5-Minute Review)
Tier 1 agents contain **zero executable code** and **zero schema changes**. Reviewing them is straightforward:

1. **Check Defaults in Manifest**:
   - `ModelSelectionMode` is `"Agent Type"` (no hardcoded models).
   - `ExposeAsAction` is `false` (unless a valid business rationale is documented).
2. **Scan Prompts**:
   - Verify no credentials, tokens, or raw SQL queries are embedded in prompt templates.
   - Verify no hardcoded record IDs or personal names are used.
3. **Approve**:
   - Tier 1 submissions that satisfy these checks can be approved and imported immediately.

### Tier 2 (Runtime Actions) — Code Review Gate
Tier 2 agents include custom JavaScript actions running in the MemberJunction sandboxed runtime:

1. **Review JavaScript Logic**:
   - Inspect the code inside the action's metadata definition.
   - Ensure the logic is deterministic, handles errors, and contains no obfuscated operations or network calls.
2. **Review & Narrow Permissions**:
   - Verify that `allowedEntities` is an explicit, minimal list of required entities.
   - **Reject any submission with `allowAnyEntity: true` or wildcard entity grants.**
3. **Decide Graduation**:
   - **Keep as Runtime Action**: Approve the action metadata for deployment as sandboxed JS.
   - **Promote to Package**: If the action is mission-critical or widely reused, have an engineer reimplement it as a strongly-typed TypeScript action in an `@mj-biz-apps/*` package.

---

## 3. Deploying the Agent

### Option 1: Commit to the Organization's Platform Repo (Recommended)
1. Extract the metadata files into your organization's repository (e.g. `bc-platform/metadata/`).
2. Commit and push the changes:
   ```bash
   git add metadata/
   git commit -m "feat(agents): add InvoiceAuditAgent from citizen builder"
   git push
   ```
3. Your CI/CD deployment pipeline will push the metadata to staging and production.

### Option 2: Direct Sync Push to Target Instance
If deploying directly to a staging or production instance via CLI:
```bash
mj sync push --dir /path/to/extracted/metadata
```
The agent is now active and ready for end users.
