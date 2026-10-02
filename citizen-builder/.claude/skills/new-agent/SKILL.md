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
  - If the agent follows a predictable sequence of steps, use **`TypeID: "@lookup:MJ: AI Agent Types.Name=Flow"`**.
  - If the agent needs dynamic problem solving or open-ended tool calling, use **`TypeID: "@lookup:MJ: AI Agent Types.Name=Loop"`**.
  - Always keep **`ModelSelectionMode: "Agent Type"`** and **`ExposeAsAction: false`**.
- **Tier 2 (Only if custom code is strictly necessary)**:
  - If custom JavaScript formatting or computation is required that no existing action supports, create a sandboxed Runtime Action.
  - Define an explicit `allowedEntities` list (never wildcards).

## Step 3: Author Prompt Template & Metadata
1. **Markdown Prompt Template**:
   Save to: `metadata/prompts/templates/<agent-slug>.template.md`
   Structure:
   - Clear persona and objective.
   - Exact instructions and step sequence.
   - Business rules and edge-case handling.
   - Explicit Markdown output formatting guidelines.

2. **Prompt Metadata JSON**:
   Save to: `metadata/prompts/.<agent-slug>-prompt.json`
   ```json
   [
     {
       "fields": {
         "Name": "<Agent Name> Prompt",
         "Description": "...",
         "CategoryID": "@lookup:MJ: AI Prompt Categories.Name=Agent Type System Prompts",
         "TypeID": "@lookup:MJ: AI Prompt Types.Name=Chat",
         "Status": "Active",
         "TemplateText": "@file:templates/<agent-slug>.template.md"
       },
       "primaryKey": { "ID": "<GENERATE-UUID-UPPERCASE>" }
     }
   ]
   ```

3. **Agent Metadata JSON**:
   Save to: `metadata/agents/.<agent-slug>-agent.json`
   Wire `MJ: AI Agent Prompts`, `MJ: AI Agent Steps`, and optional `MJ: AI Agent Actions`.

## Step 4: Sync to Database
Run:
```bash
./scripts/sync-metadata.sh
```
Verify that the sync command outputs success.

## Step 5: Hand off to Testing
Inform the user that the agent has been created and synced:
*"I've created your agent '**<Agent Name>**' and synced it to your local environment. You can test it now in Explorer or ask me to run a test execution."*
