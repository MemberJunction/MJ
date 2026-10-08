# Promotion and governance: reviewing packaged agents

For platform administrators, team leads and review boards who evaluate and deploy agents built with
the Citizen Agent Builder.

---

## 1. What arrives

A builder submits an archive such as `dist/invoice-audit-package.zip`, containing:

1. **`AGENT_MANIFEST.md`**: what the agent does and who built it; its tier (1 declarative, or 2 with
   runtime actions); the entities it reads and writes and anything it sends; the roles its users need;
   its schedule and delivery target; test receipts naming the identity and model each test ran with;
   known gaps.
2. **Metadata**, in the workspace's folder layout and with its `.mj-sync.json` files, so it installs as is:
   - `metadata/.mj-sync.json` and each folder's `.mj-sync.json`
   - `metadata/agents/.*<name>*.json`
   - `metadata/prompts/.*<name>*.json` and `metadata/prompts/templates/<name>*.md`
   - any other folders the agent uses (saved queries, scheduled jobs, Tier 2 actions)

---

## 2. Review

### Tier 1 (declarative): fast track
Tier 1 agents contain no executable code and no schema changes.

1. **Defaults:** `ModelSelectionMode` is `"Agent Type"`; `ExposeAsAction` is `false` unless the manifest
   explains why.
2. **Prompts:** no credentials, tokens, raw SQL, record IDs, personal names or hardcoded recipients.
3. **Writes and sends:** every write or send has a confirmation step or a documented approval. A step
   that delivers results must not run when the steps before it failed.
4. **Schedules:** ship as `Pending`; enable them deliberately after deployment.
5. **Users:** check the roles the manifest says users need against who will run it (see section 3).

### Tier 2 (runtime actions): code review
1. **Logic:** deterministic, handles errors, no obfuscated code or unexpected network calls.
2. **Permissions:** `allowedEntities` is an explicit, minimal list. **Reject `allowAnyEntity: true` or wildcards.**
3. **Graduation:** keep it as a sandboxed runtime action, or, if it is critical or widely reused, have
   an engineer reimplement it as a typed action in a package.

---

## 3. Deploy

### Option 1: commit to your organization's platform repository (recommended)
1. Copy the package's `metadata/` folders into your platform app's `metadata/`, keeping the layout.
2. Commit and push; your pipeline pushes the metadata to staging and production.

### Option 2: push directly to an instance
```bash
unzip invoice-audit-package.zip -d invoice-audit
mj sync push --dir invoice-audit/metadata
```

### After either: restart the API
The API loads AI prompts when it starts, so a newly pushed prompt fails ("Prompt … is not in the
engine's metadata") until the instance's MJAPI restarts. Restart it after every deployment that adds
or changes prompts.

### Check who can run it
Agents started from the web app run as the signed-in user. Users with only the basic `UI` role cannot
run Flow agents (creating their task records needs Create permission on `MJ: Tasks` and
`MJ: Task Dependencies`). Grant what the manifest lists to the role its users have, through your
normal permissions process, then run the agent once as such a user before announcing it.
