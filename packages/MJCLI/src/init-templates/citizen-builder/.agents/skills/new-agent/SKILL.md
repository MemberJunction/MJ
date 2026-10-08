---
name: new-agent
description: Guides the coding agent to author a new MemberJunction agent and prompt metadata from user business intent.
---

# Skill: `new-agent` (authoring declarative agents)

Use this skill whenever the user asks to build, create or modify a MemberJunction AI agent.
`AGENTS.md` is the rulebook; this is the order of work.

## Step 1: Make sure the workspace is ready
Read `.mj-status.json`. If `state` is not `"ready"`, tell the user which step setup is on and how long
it usually takes, and keep them updated (AGENTS.md section 0) while you plan. If it says `"failed"`,
fix that first: its `error.whatToDo` says how.

## Step 2: Understand the goal, from the real data
1. **Goal**: what business problem does the agent solve, and for whom?
2. **Data**: find the entities in `CAPABILITIES.md`, then show the user what is really there (fields,
   row counts, a few sample values) before asking them to define business rules.
3. **Output, in their words**: a summary, ready-to-send drafts, a notification, a record? Ask when it
   is ambiguous: "drafts" and "recommendations" are different deliverables.
4. **Writes and sends**: does it create, update, delete or send anything? Each needs confirmation
   (AGENTS.md section 4).
5. **When it runs**: on request in chat, or on a schedule? A scheduled agent needs a delivery target.

## Step 3: Choose the pattern
- **Flow** (`"TypeID": "@lookup:MJ: AI Agent Types.Name=Flow"`) for a predictable sequence of steps.
  Data steps use `Get Records` or `Run Stored Query`, mapping their output parameters into the
  payload (AGENTS.md section 2E).
- **Loop** (`"TypeID": "@lookup:MJ: AI Agent Types.Name=Loop"`) for open-ended tool use.
- Always `"ModelSelectionMode": "Agent Type"` and `"ExposeAsAction": false`.
- Tier 2 (a sandboxed runtime action) only when no existing action can do it, with an explicit
  `allowedEntities` list.

If you later find the chosen pattern cannot work, explain why and ask before switching.

## Step 4: Author the files
1. **Prompt template**: `metadata/prompts/templates/<slug>.template.md`: role, instructions, rules,
   edge cases, and the exact output format. For a Flow step, ask for JSON with named keys, and read
   the payload with `{{ _CURRENT_PAYLOAD | jsonparse | json }}` (never `| json` alone).
2. **Prompt metadata**: `metadata/prompts/.<slug>-prompt.json`
   ```json
   [
     {
       "fields": {
         "Name": "<Agent Name> Prompt",
         "Description": "...",
         "TypeID": "@lookup:MJ: AI Prompt Types.Name=Chat",
         "Status": "Active",
         "ResponseFormat": "JSON",
         "TemplateText": "@file:templates/<slug>.template.md"
       },
       "primaryKey": { "ID": "<UUID, uppercase>" }
     }
   ]
   ```
3. **Agent metadata**: `metadata/agents/.<slug>-agent.json`, with its `MJ: AI Agent Steps` and, nested
   under each step, its `MJ: AI Agent Step Paths` (AGENTS.md section 2D has a complete example). A
   Loop agent instead lists its tools as `MJ: AI Agent Actions` and its prompt as `MJ: AI Agent Prompts`.
4. Every new record gets a fresh uppercase UUID: `uuidgen | tr '[:lower:]' '[:upper:]'`.

## Step 5: Validate and push
Check that the JSON parses, every `@file` exists, every `@lookup` names a real record, and every
non-starting step has a path into it. Then:
```bash
./scripts/sync-metadata.sh
```
It must report no errors. It restarts the API afterwards so the new prompts load.

## Step 6: Hand off to testing
Restate the settings the agent will use (windows, thresholds, recipients), then test it with the
`test-agent` skill.
