---
name: package-agent
description: Validates, packages, and exports an agent into a promotion bundle with an AGENT_MANIFEST.md for admin review.
---

# Skill: `package-agent` (exporting for promotion)

Use this skill when the user is satisfied with their agent and wants to share it or submit it for
promotion to staging or production.

## Step 1: Pre-flight checks
- [ ] `ModelSelectionMode: "Agent Type"` (no pinned provider model).
- [ ] `ExposeAsAction: false`, or the reason it is true is documented.
- [ ] No hardcoded record IDs, people's names or recipient email addresses in prompts or steps.
- [ ] No API keys, tokens or secrets anywhere in the metadata.
- [ ] Every write or send has a confirmation step or the user's recorded approval.
- [ ] Any schedule ships with `Status: "Pending"`, so installing the package does not start it.
- [ ] Tier 2 runtime actions have an explicit `allowedEntities` list.

## Step 2: Gather the test evidence
```bash
./scripts/query-run-history.sh "<Agent Name>"
./scripts/query-run-history.sh <RunID> --format json
```
Record, for the latest successful run of **each** path you tested (CLI, Explorer chat, schedule): when
it ran, **which user it ran as**, the model that served it, tokens, duration, the actions it used,
and a sample input with a summary of the output.

## Step 3: Write `AGENT_MANIFEST.md`
1. **Agent**: name, purpose, author, date, Flow or Loop.
2. **Tier**: Tier 1 (declarative), or Tier 2 with each runtime action listed for code review.
3. **Data footprint**: entities read, entities written, actions bound, anything it sends.
4. **Who can run it**: the roles and permissions its users need, and which identities it was tested as.
5. **Schedule and delivery**: when it runs, where results go, and whether the schedule ships enabled.
6. **Test receipts**: from step 2, one per path.
7. **Known gaps**: anything that does not work yet, and what is needed.

## Step 4: Build the archive
The package must install as is in another environment, so it keeps the folder layout and includes the
`.mj-sync.json` files that set the entity and push order:
```bash
mkdir -p dist
AGENT_SLUG="<agent-slug>"
zip -r "dist/${AGENT_SLUG}-package.zip" \
  AGENT_MANIFEST.md \
  metadata/.mj-sync.json \
  metadata/*/.mj-sync.json \
  metadata/agents/.*"${AGENT_SLUG}"*.json \
  metadata/prompts/.*"${AGENT_SLUG}"*.json \
  metadata/prompts/templates/"${AGENT_SLUG}"*.md
```
Add any other folder the agent uses (saved queries, scheduled jobs) the same way, then list the
archive (`unzip -l`) to check nothing is missing.

## Step 5: Tell the user
1. The path to the package.
2. A short summary of the manifest, including what users need to run it.
3. That their platform team reviews and deploys it with `docs/PROMOTION_GUIDE.md`.
