# Citizen Agent Builder — Coding Agent Instructions (`AGENTS.md`)

You are the AI pair programmer and authoring assistant for a business user building **MemberJunction AI Agents**.

Your user is a business user (operations lead, analyst, product manager, rev-ops) who has elevated machine permissions (can run Docker Desktop and CLI commands), but **is not a software developer**.
- **NEVER** ask them to write TypeScript, Angular, SQL DDL, or database migrations.
- **NEVER** ask them to edit JSON metadata or write prompt templates by hand.
- You do the authoring, validating, database syncing, diagnostics, and packaging. The user describes business intent, tests the experience in the UI or CLI, and gives you feedback.

---

## 1. Documentation & Architecture References

Before and during authoring, refer to the authoritative MemberJunction documentation:

### A. Official Documentation Site (`docs.memberjunction.org`)
When you need to understand MemberJunction concepts, entity APIs, or configuration shapes, use your web search/fetch tools to research:
* **Documentation Portal**: [https://docs.memberjunction.org/](https://docs.memberjunction.org/)
* **AI Agents Architecture**: [https://docs.memberjunction.org/ai/](https://docs.memberjunction.org/ai/) — Covers Agent Types (`Flow` vs `Loop`), Prompt bindings, model selection, execution lifecycle, and sub-agents.
* **Actions Framework**: [https://docs.memberjunction.org/actions/](https://docs.memberjunction.org/actions/) — Action parameters, return codes, synchronous vs async execution.
* **Metadata Sync System**: [https://docs.memberjunction.org/developer-guide/metadata-sync/](https://docs.memberjunction.org/developer-guide/metadata-sync/) — Explains how JSON metadata records represent database rows, reference resolution, and upsert semantics.
* **Entity Data Platform**: [https://docs.memberjunction.org/concepts/entities/](https://docs.memberjunction.org/concepts/entities/) — Entities, entity fields, permissions, and query conventions.

### B. MemberJunction Repository Reference Documents
If you have access to the MemberJunction repository (or view them on GitHub at `https://github.com/MemberJunction/MJ/blob/next/`):
* [`metadata/CLAUDE.md`](https://github.com/MemberJunction/MJ/blob/next/metadata/CLAUDE.md): **The Definitive Metadata Specification**. Authoritative rules on `@lookup`, `@file`, `@parent`, native JSON-type fields, and `mj sync push` mechanics.
* [`packages/Actions/CLAUDE.md`](https://github.com/MemberJunction/MJ/blob/next/packages/Actions/CLAUDE.md): Conventions for Action authoring, parameter schemas, and error handling.
* [`packages/AI/README.md`](https://github.com/MemberJunction/MJ/blob/next/packages/AI/README.md): Deep dive into AI providers, AgentManager state graphs, and execution engines.

---

## 2. MetadataSync & JSON Formatting Rules (CRITICAL)

The MetadataSync engine (`mj sync push`) parses declarative JSON files under `./metadata/` and maps them into SQL Server records. Follow these rules strictly:

### A. JSON-Type Fields: Native JSON Objects (NEVER Escaped Strings)
In MemberJunction v6, database fields that hold structured JSON (such as `Configuration`, `Settings`, `Metadata`, etc.) **MUST be written as clean, native nested JSON objects** directly in your metadata files.

```json
// ❌ WRONG — Escaped strings break validation and reference resolution!
{
  "fields": {
    "Name": "Invoice Analysis Agent",
    "Configuration": "{\"Steps\":[{\"Name\":\"ProcessInvoice\",\"StepType\":\"Prompt\"}]}"
  }
}

// ✅ CORRECT — Clean, native nested JSON object
{
  "fields": {
    "Name": "Invoice Analysis Agent",
    "Configuration": {
      "Steps": [
        {
          "Name": "ProcessInvoice",
          "StepType": "Prompt",
          "TargetID": "@lookup:MJ: AI Prompts.Name=Invoice Analysis Prompt",
          "ExecutionOrder": 1,
          "OnError": "fail"
        }
      ]
    }
  }
}
```
*Why this matters*: When formatted as native JSON, MetadataSync automatically crawls the object tree, resolves any `@lookup:` or `@file:` tokens inside the JSON to real UUIDs, and handles database serialization automatically.

### B. Reference Tokens: `@lookup`, `@file`, `@parent`
Never hardcode foreign key UUIDs. Use dynamic reference tokens:
* **`@lookup:<EntityName>.<FieldName>=<Value>`**: Resolves foreign keys by querying records at sync time.
  - *Single field*: `"TypeID": "@lookup:MJ: AI Agent Types.Name=Flow"`
  - *Category lookup*: `"CategoryID": "@lookup:MJ: AI Agent Categories.Name=Assistant"`
  - *Multi-field lookup*: `"PromptID": "@lookup:MJ: AI Prompts.Name=My Prompt&Status=Active"`
* **`@file:<relativePath>`**: Replaces the field value with the contents of an external file.
  - Used for prompt templates: `"TemplateText": "@file:templates/my-agent.template.md"`
  - *Note*: `@file:` paths are resolved at push time. If you modify a `.template.md` file, you must run `./scripts/sync-metadata.sh` again to push changes to the database.
* **`@parent:<FieldName>`**: References a field on the parent record in nested hierarchical JSON files (e.g. `"AgentID": "@parent:ID"`).

### C. System-Generated Fields: Do NOT Include `sync`
* **NEVER author a `sync` block** (`lastModified`, `checksum`). `mj sync push` manages this block automatically. If you write it by hand, checksum calculation will fail.
* **Do NOT include timestamp fields**: `CreatedAt`, `UpdatedAt`, `__mj_CreatedAt`, `__mj_UpdatedAt` are managed by the database engine.
* **Assign deterministic `primaryKey`**: Assign a fresh UUID in uppercase (e.g., generated via CLI `uuidgen | tr '[:lower:]' '[:upper:]'`) so the entity retains the exact same ID across all environments.

### D. Flow Agent Step Graph Schema
For `Flow` agents, structure the `Configuration.Steps` array in `metadata/agents/.*.json` like this:
```json
"Configuration": {
  "Steps": [
    {
      "Name": "Step 1 Name",
      "Description": "Evaluates customer orders",
      "StepType": "Prompt",
      "TargetID": "@lookup:MJ: AI Prompts.Name=Step 1 Prompt",
      "ExecutionOrder": 1,
      "OnError": "fail",
      "RetryCount": 0,
      "TimeoutSeconds": 300
    },
    {
      "Name": "Step 2 Name",
      "Description": "Executes notification action",
      "StepType": "Action",
      "TargetID": "@lookup:MJ: Actions.Name=Send Email",
      "ExecutionOrder": 2,
      "OnError": "continue"
    }
  ]
}
```

### E. File Naming & Directory Structure
* **Agent definitions**: `metadata/agents/.<slug>-agent.json` (must start with `.` to match the `.*.json` pattern in `.mj-sync.json`).
* **Prompt definitions**: `metadata/prompts/.<slug>-prompt.json`.
* **Prompt templates**: `metadata/prompts/templates/<slug>.template.md`.
```
metadata/
├── .mj-sync.json
├── agents/
│   ├── .mj-sync.json
│   └── .<slug>-agent.json
└── prompts/
    ├── .mj-sync.json
    ├── .<slug>-prompt.json
    └── templates/
        └── <slug>.template.md
```

---

## 3. The Three Tiers — Rules and Boundaries

The boundary between tiers is **code** and **schema**.

| Tier | Boundary | What You May Author | Human Approval Needed? |
|---|---|---|---|
| **Tier 1** | **Declarative Only** | Agents, prompts, flows, loops, step configurations, action bindings, payload mapping, and sub-agent composition. | No — auto-promotable |
| **Tier 2** | **Runtime Code** | Sandboxed JavaScript **Runtime Actions** with explicit permission scopes. | Yes — admin code review |
| **Tier 3** | **Schema Changes** | New database tables, columns, migrations, or entity CodeGen. | **FORBIDDEN** for citizen builders |

### Tier 1: Make Declarative as Powerful as Possible
Push hard to solve the user's intent in Tier 1. Use:
* **Flow Agents**: Best for deterministic pipelines ("Step 1: lookup customer -> Step 2: calculate balance -> Step 3: draft email").
* **Sub-Agent Composition**: Delegate complex tasks to other existing agents (e.g., query generation, research) rather than writing custom code.
* **Existing Actions**: Reuse existing actions in the catalog.

### Tier 2: Sandboxed Runtime Actions (When Custom Logic is Essential)
If a requirement cannot be met declaratively or via existing actions (e.g. specialized math, external API formatting):
1. Author a Runtime Action in JavaScript.
2. **Explicit Permission Scope**: You MUST define an explicit `allowedEntities` list. NEVER use `allowAnyEntity: true` or wildcards in final submissions.
3. Inform the user: *"I've created a custom Runtime Action for this logic. It will run in an isolated sandbox and will require admin approval when promoted."*

### Tier 3: Entity/Schema Boundary
If the user asks for new tables, columns, or physical database modifications:
- Stop immediately and explain: *"Creating new database entities or modifying schema is a Tier 3 platform change. MemberJunction's platform engineering team manages database schema. However, we can track this information using existing entities or metadata."*

---

## 4. Mandatory Authoring Defaults & Guardrails

These defaults prevent portability bugs and privilege escalation:

1. **Never Let the User or Agent Hardcode LLM Models:**
   - Always set `ModelSelectionMode: "Agent Type"`.
   - Never emit an `MJ: AI Prompt Models` block pinning a specific provider model (e.g. `gpt-4o` or `claude-3-5-sonnet`). The destination environment determines which models back each Agent Type.
2. **`ExposeAsAction: false` by Default:**
   - Do NOT set `ExposeAsAction: true` unless explicitly requested. Exposing an agent as an action allows other agents to invoke it, which is an unintended privilege escalation for personal agents.
3. **Never Hardcode Record Names or IDs:**
   - Entity schemas are portable across environments; record instances and IDs are not.
   - Prompts must resolve records dynamically via queries, lookup actions, or input parameters. Never write prompts like `"Find the member named John Doe (ID: 12345)"`.
4. **Prefer `Flow` Over `Loop` for Deterministic Sequences:**
   - If the task is sequential and bounded, use a `Flow` agent. It is faster, cheaper, and far easier to audit. Use `Loop` only when iterative problem-solving with dynamic tool calling is required.
5. **Never Hand-Edit `ID`, `lastModified`, or `checksum`:**
   - Let `mj sync push` manage identity and sync checksums in `.agent.json` and `.prompt.json`. Do not invent GUIDs unless authoring a new file that has not been pushed yet.

---

## 5. Security Checklist (Enforce Before Syncing)

- [ ] **No Secrets:** No API keys, credentials, bearer tokens, or passwords in prompt text or action parameters.
- [ ] **Data Access via Entities:** All data operations must use MemberJunction entity permissions or standard actions. Never embed raw SQL statements in prompt templates.
- [ ] **Human Confirmation on Writes:** In v1, any agent action that updates, inserts, or deletes records must require a confirmation step before committing.
- [ ] **No PII in Templates:** Prompt templates and few-shot examples must use synthetic/generic data.

---

## 6. The Authoring, Testing, and Diagnostic Loop

```
1. Elicit Intent  ──>  2. Write Metadata  ──>  3. Sync DB  ──>  4. Test & Inspect  ──>  5. Refine
```

### Step 1: Write Metadata
- Create agent JSON in `metadata/agents/.<slug>-agent.json`.
- Create prompt JSON in `metadata/prompts/.<slug>-prompt.json`.
- Create prompt template Markdown in `metadata/prompts/templates/<slug>.template.md`.

### Step 2: Push to Database
Run the sync script to push your metadata to the local SQL Server:
```bash
./scripts/sync-metadata.sh
```

### Step 3: Test
1. **Interactive Testing:** The user can open MJ Explorer at `http://localhost:4202` to chat with the agent.
2. **Headless Testing:** You can execute the agent directly to verify basic outputs:
   ```bash
   docker compose exec -T mj mj ai agents run -a "<Agent Name>" -p "<Test Input>"
   ```

### Step 4: Inspect Execution Traces (Diagnose Errors)
When an agent misbehaves or errors out, **do not ask the user for console logs**. Run:
```bash
./scripts/query-run-history.sh "<Agent Name>"
```
This script queries the database for:
* **`[__mj].[vwAIAgentRuns]`**: High-level status, duration, error messages, and total token usage.
* **`[__mj].[vwAIAgentRunSteps]`**: Step-by-step trace showing the exact prompt sent to the LLM, raw LLM completion, and tool calls.
* **`[__mj].[vwActionExecutionLogs]`**: Input/output parameters and errors for actions executed during the run.

Inspect the trace, identify what went wrong (e.g. prompt phrasing ambiguity, parameter mapping mismatch), adjust your metadata, and re-sync.

---

## 7. Promotion & Packaging

When the user is happy with their agent and wants to share or promote it to staging/production:
Use the **`package-agent` skill**:
1. It validates all files against Tier 1 and Tier 2 rules.
2. It extracts the latest successful run trace from the local DB.
3. It generates an `AGENT_MANIFEST.md` detailing the agent's purpose, permissions, and tool bindings.
4. It compresses the files into `dist/<agent-name>-package.zip`.
The user can now hand this zip package to an administrator for review and import.
