---
name: new-agent
description: Guides the coding agent to author a new MemberJunction agent and prompt metadata from user business intent.
---

# Skill: `new-agent` (Authoring Declarative Agents)

Use this skill whenever the user asks to build, create, or modify a MemberJunction AI Agent.

## Step 1: Elicit & Scope Business Intent
Ask clarifying questions if the requirement is ambiguous:
1. **Goal**: What specific business problem does the agent solve?
2. **Inputs & Subjects**: What input does the user provide (e.g. an account ID, order number, or topic)?
3. **Data Sources**: Which entities does it read or check? (Cross-reference against `CAPABILITIES.md`).
4. **Output / Action**: Does it produce an answer, a formatted summary, a notification, or trigger a downstream action?

## Step 2: Determine Tier & Agent Type
- **Tier 1 (Preferred)**:
  - **Recommended Default (`Loop`)**: Use **`TypeID: "@lookup:MJ: AI Agent Types.Name=Loop"`** for interactive, conversational, and exploratory Citizen Builder agents where the agent synthesizes user input or calls bound actions (`MJ: AI Agent Actions`).
  - **Deterministic Task Graphs (`Flow`)**: Use **`TypeID: "@lookup:MJ: AI Agent Types.Name=Flow"`** only when the user wants a fixed, non-interactive sequence of steps (`MJ: AI Agent Steps`).
  - Always keep **`ModelSelectionMode: "Agent Type"`**, **`ExposeAsAction: false`**, and **`ArtifactCreationMode: "Never"`** (valid values: `"Never"`, `"Always"`, `"System Only"`).
- **Tier 2 (Only if custom code is strictly necessary)**:
  - If custom JavaScript formatting or computation is required that no existing action supports, create a sandboxed Runtime Action.
  - Define an explicit `allowedEntities` list (never wildcards).

## Step 3: Author Prompt Template & Metadata
1. **Markdown Prompt Template**:
   Save to: `metadata/prompts/templates/<agent-slug>.template.md`
   Structure:
   - Clear persona and objective.
   - Exact instructions, business rules, and edge-case handling.
   - Explicit Markdown output formatting guidelines.
   - *(For `Flow` agent `Prompt` steps, also include `{{ userMessage }}` and `{{ payload | dump(2) }}` to read upstream step outputs).*

2. **Prompt Metadata JSON**:
   Save to: `metadata/prompts/.<agent-slug>-prompt.json`
   - **For a `Loop` agent (Recommended Default)** — the prompt is injected as a system child prompt (`PromptRole: "System"`, `PromptPosition: "First"`):
   ```json
   [
     {
       "fields": {
         "Name": "<Agent Name> Prompt",
         "Description": "...",
         "CategoryID": "@lookup:MJ: AI Prompt Categories.Name=Agent Type System Prompts",
         "PromptRole": "System",
         "PromptPosition": "First",
         "TypeID": "@lookup:MJ: AI Prompt Types.Name=Chat",
         "Status": "Active",
         "TemplateText": "@file:templates/<agent-slug>.template.md"
       },
       "primaryKey": { "ID": "<GENERATE-UUID-UPPERCASE>" }
     }
   ]
   ```
   - **For a `Flow` agent `Prompt` step** — the prompt runs standalone (`ResponseFormat: "Markdown"`, `OutputType: "string"`, `ValidationBehavior: "None"`).

3. **Agent Metadata JSON**:
   Save to: `metadata/agents/.<agent-slug>-agent.json`
   - **For a `Loop` agent (Recommended Default)**:
     Wire `MJ: AI Agent Prompts` (`ExecutionOrder: 0`) and optional `MJ: AI Agent Actions` (e.g. `Run Ad-hoc Query`, `Run Stored Query`). See `metadata/agents/.customer-insight-agent.json` for a complete reference.
   - **For a `Flow` agent**:
     Wire `MJ: AI Agent Prompts` and `MJ: AI Agent Steps` (with nested `MJ: AI Agent Step Paths` on origin steps):
     - For `Action` steps using `Run Ad-hoc Query` or `Run Stored Query`:
       - Use native JSON objects (never escaped strings) for `ActionInputMapping` and `ActionOutputMapping`.
       - Prefix literal inputs with `static:` (e.g. `"Query": "static:SELECT ..."`, `"DataFormat": "static:markdown"`).
       - Map structured action outputs (`Results`, `FormattedResults`, `RowCount`, `ExecutionTimeMs`) to payload keys in `ActionOutputMapping` (e.g. `{"Results": "rows", "FormattedResults": "tableMarkdown", "RowCount": "rowCount"}`).
     - Connect each origin step to its next step via `relatedEntities["MJ: AI Agent Step Paths"]` with `"OriginStepID": "@parent:ID"` and `"DestinationStepID": "@lookup:MJ: AI Agent Steps.Name=<Next Step Name>&AgentID=@parent:AgentID"`.

## Step 4: Sync to Database
Run:
```bash
./scripts/sync-metadata.sh
```
*(Note: `./scripts/sync-metadata.sh` runs `mj sync push --dir /work/metadata` so `@file:` templates create and link `TemplateID` records on first push, and `metadata/.mj-sync.json` ensures `prompts` are pushed before `agents`).*
Verify that the sync command outputs success.

## Step 5: Hand off to Testing
Inform the user that the agent has been created and synced:
*"I've created your agent '**<Agent Name>**' and synced it to your local environment. You can test it now in Explorer or ask me to run a test execution."*
