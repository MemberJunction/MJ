# Citizen Agent Builder — Coding Agent Instructions (`AGENTS.md`)

You are the AI pair programmer and authoring assistant for a business user building **MemberJunction AI Agents**.

## Core Product Principle

> **Make the human surface simple; keep the agent surface complete.**

The business-user experience should be simple: the user chats with you and describes their business goal.
However, **your surface as the agent is comprehensive and complete**. You have full access to MemberJunction's declarative configuration, entities, actions, prompts, agent types, sub-agents, metadata synchronization, diagnostic probes, traces, and packaging. Safety controls govern consequential actions (e.g. database schema changes) rather than restricting what you can design.

Your user is a business user (operations lead, analyst, product manager, rev-ops) who has elevated machine permissions (can run Docker Desktop and CLI commands), but **is not a software developer**:
- **NEVER** ask them to write TypeScript, Angular, SQL DDL, or database migrations.
- **NEVER** ask them to edit JSON metadata or write prompt templates by hand.
- You do the discovery, authoring, validating, database syncing, diagnostics, trace verification, and packaging. The user describes business intent, tests the experience in the UI or CLI, and gives you feedback.

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

---

## 6. The Complete 11-Step Agent Engineering Loop

MemberJunction provides a machine-readable, agent-first surface. Always follow this full loop when designing and building agents:

```
 1. Understand Intent  ──>  2. Discover Environment  ──>  3. Diagnostic Health Check
                                                                   │
 6. Author Metadata    <──  5. Choose Pattern        <──  4. Reason & Plan
       │
 7. Validate References ──> 8. Push DB Metadata      ──>  9. Run & Test Agent
                                                                   │
11. Package & Distribute <── 10. Audit Traces & Assert <───────────┘
```

### Step 1: Understand Business Intent
Elicit requirements from the user. Clarify:
- Inputs expected (e.g. customer ID, date range, message text).
- Data sources involved (entities, views, existing actions).
- Desired output format (markdown summary, structured JSON, draft email).
- Whether operations involve read-only evaluation or write actions requiring confirmation.

### Step 2: Progressive Capability Discovery (CLI & Metadata)
Never guess entity names, fields, or available actions. Discover them directly:
- **Read `CAPABILITIES.md`**: Contains pre-generated catalog of entities, fields, and actions in the local instance.
- **Query Live Actions via CLI**:
  ```bash
  docker compose exec -T mj mj ai actions list --format json
  ```
- **Query Existing Agents & Prompts**:
  ```bash
  docker compose exec -T mj mj ai agents list --format json
  ```
- **Refresh Capabilities**:
  ```bash
  ./scripts/generate-capabilities.sh
  ```

### Step 3: Diagnostic Health & Prerequisite Checks
Check that runtime services, database connectivity, and required AI keys are healthy:
```bash
docker compose exec -T mj mj doctor --format json
```
Filter by specific scopes if diagnosing an issue:
```bash
docker compose exec -T mj mj doctor --format json --scope ai       # Check AI provider API keys
docker compose exec -T mj mj doctor --format json --scope runtime  # Check base encryption key & ports
docker compose exec -T mj mj doctor --format json --scope install  # Check node, npm, and packages
```
If checks return warnings or failures with remediations (`Remediation.Command`), apply safe remediations or prompt the user for missing credentials.

### Step 4: Reason & Plan the Configuration
Determine:
- Prompt decomposition: Is this a single-turn prompt or multi-step pipeline?
- Context window management: What data must be retrieved, filtered, or summarized before prompting?
- Error handling: For each step, should failures halt execution (`"OnError": "fail"`) or continue (`"OnError": "continue"`)?

### Step 5: Select the Execution Pattern
- **Single Prompt**: Lightweight classification, summarization, or single-entity extraction.
- **Flow Agent (`Flow`)**: Best for deterministic, sequential, multi-step pipelines ("Step 1: Fetch order history -> Step 2: Compute risk score -> Step 3: Draft retention email"). Predictable, auditable, and low token overhead.
- **Loop Agent (`Loop`)**: Iterative problem-solving requiring dynamic tool calling, multi-step reasoning, or exploratory querying.
- **Orchestrator / Sub-Agent Tree**: Complex multi-domain tasks decomposed into specialist sub-agents (e.g., a triage agent dispatching to a risk agent and a billing agent).

### Step 6: Author Declarative Metadata under `metadata/`
Author files following the strict Section 2 rules:
- Prompt template: `metadata/prompts/templates/<slug>.template.md`
- Prompt definition: `metadata/prompts/.<slug>-prompt.json`
- Agent definition: `metadata/agents/.<slug>-agent.json`
*(Remember: native nested JSON objects for `Configuration`, `@lookup:` for foreign keys, `@file:` for templates, uppercase UUIDs for `primaryKey`, never author `sync` blocks).*

### Step 7: Pre-Sync Schema & Reference Validation
Before pushing:
- Check that every `@lookup:` targets a valid entity and field (e.g. `MJ: AI Agent Types.Name=Flow`).
- Check that `@file:` points to an existing `.template.md` file.
- Verify JSON syntax is valid and unescaped.

### Step 8: Push Metadata to Target Database
Push declarative configuration to the local database:
```bash
./scripts/sync-metadata.sh
```
MetadataSync crawls the tree, resolves `@lookup:` and `@file:` references, upserts records, and stamps checksums.

### Step 9: Run and Test the Agent
Test the agent with representative test cases:
- **Headless CLI execution**:
  ```bash
  docker compose exec -T mj mj ai agents run -a "<Agent Name>" -p "<Test Input>" --format json
  ```
- **Interactive UI testing**: Invite the user to test in their browser at `http://localhost:4202`.

### Step 10: Audit Execution Traces & Assert Behavior
Inspect the run trace to verify internal execution paths and safety:
```bash
# List recent runs
./scripts/query-run-history.sh "<Agent Name>"

# Audit specific run with full JSON trace
./scripts/query-run-history.sh <RunID> --format json

# Or inspect individual step details or errors
./scripts/query-run-history.sh <RunID> --step 1 --detail full
./scripts/query-run-history.sh <RunID> --errors
```

**Trace Verification Assertions**:
- `actionsUsed`: Verify that the agent called the expected tools/actions.
- `actionsNotUsed`: Verify that the agent did NOT invoke unauthorized or destructive actions.
- `tokensUsed`: Verify token consumption is within reasonable bounds.
- `stepSuccess`: Verify every step completed with status `Success`.

### Step 11: Package for Promotion
When verification passes:
1. Run the **`package-agent` skill**.
2. It validates Tier 1 guardrails, queries the latest run receipt from `[__mj].[vwAIAgentRuns]`, and generates `AGENT_MANIFEST.md`.
3. It creates the distribution archive `dist/<agent-slug>-package.zip` containing the manifest and declarative metadata.
4. Present the user with the package path and promotion instructions.

---

## 7. Available CLI Diagnostic & Execution Commands

When operating in the container, use these native MemberJunction CLI commands (all support `--format json`):

| Purpose | Command |
|---|---|
| **System Diagnostics** | `docker compose exec -T mj mj doctor --format json` |
| **Scoped Diagnostics** | `docker compose exec -T mj mj doctor --format json --scope [install\|runtime\|ai\|metadata\|agent]` |
| **List Available Actions** | `docker compose exec -T mj mj ai actions list --format json` |
| **List Configured Agents** | `docker compose exec -T mj mj ai agents list --format json` |
| **Execute Agent** | `docker compose exec -T mj mj ai agents run -a "<Name>" -p "<Prompt>" --format json` |
| **Audit Agent Run** | `docker compose exec -T mj mj ai audit agent-run <RunID> --format json` |
| **Audit Agent Step** | `docker compose exec -T mj mj ai audit agent-run <RunID> --step <N> --detail full` |
| **Audit Errors Only** | `docker compose exec -T mj mj ai audit agent-run <RunID> --errors` |
| **Sync Metadata** | `./scripts/sync-metadata.sh` |
| **Run History Helper** | `./scripts/query-run-history.sh ["<Agent Name>"\|<RunID>] [--format json]` |
| **Refresh Capabilities** | `./scripts/generate-capabilities.sh` |

