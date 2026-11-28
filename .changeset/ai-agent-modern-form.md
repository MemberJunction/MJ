---
"@memberjunction/ng-core-entity-forms": minor
"@memberjunction/ng-bootstrap": patch
"@memberjunction/ng-bootstrap-lite": patch
---

Modernize the `MJ: AI Agents` entity form onto MemberJunction's modern forms architecture (`<mj-record-form-container>`, left-nav rail via `AIAgentFormPolicy`, modular `BaseFormPanel` contributions, and `BaseFormToolbarAction` buttons):

- Replace the 4,154-line monolithic custom AI Agent form override with a lightweight host (`MJAIAgentFormComponentExtended`) rendering through the CodeGen-generated form template and coordinating agent-type resolution + atomic `TransactionGroup` saves.
- Add Option B ("Overview Cockpit + Focused Rail") modular `BaseFormPanel` contributions under `src/lib/panels/ai-agents/`:
  - **Overview Cockpit** (`AgentOverviewPanel`): inline-editable hero in Edit Mode, 30-day async KPI strip, agent-type-aware architecture preview (Flow topology, 4-stage Loop Reasoning Blueprint, Realtime Voice & Bridge Pipeline), and clickable capability bento cards.
  - **Dynamic Agent-Type Studio** (`AgentTypeStudioPanel`): self-gates on `AgentType.UIFormSectionKey` (so Flow agents get Flow Studio right below Overview and future custom agent types plug in automatically, while Loop agents stay uncluttered), preserves canvas state across rail switches, participates in atomic save + dirty indicators, and adds an optional **Overlay Latest Run** trace ribbon.
  - **Prompts & Models**, **Capabilities** (tabbed Actions / Sub-Agents / Skills / Client Tools), **Knowledge & Memory**, **Guardrails & Payload** (replacing `runtimeLimitsExecutionSettings` & `payloadDataFlow` to avoid duplicate inputs), **Runs & Sessions**, and **Invocations & Rubrics**.
- Register `Run` and `Access` as declarative `BaseFormToolbarAction` buttons on `MJ: AI Agents`.
- Update generated Angular bootstrap class registration manifests and replace obsolete legacy form tests with focused unit and DOM test suites.
