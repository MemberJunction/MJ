---
"@memberjunction/core-actions": minor
---

Find-agent actions (Find Candidate Agents / Find Best Agent) now search in **hybrid** mode
(semantic + lexical) so agents the daily vector sync hasn't embedded yet are still
discoverable, and Agent Manager now loads existing agent specs by calling the **Load Agent
Spec** action directly instead of delegating to the Flow-based **Agent Spec Loader**
sub-agent (which the runtime refuses — a Flow agent cannot run as a sub-agent). The Load
Agent Spec action's `AgentSpec` output is now the complete spec (truncation applies only to
the human-readable message), so loading and re-saving an agent no longer risks overwriting
its sub-agents' prompt templates.

Scope of the hybrid change — it **narrows** the vector-sync staleness window, it does not
close it:

- The window affects **updates to already-vectorized agents**, not only new ones. An agent
  whose name or description was edited keeps matching the old text in semantic search until
  the next daily sync re-embeds it.
- The lexical fallback matches only when the search text appears **verbatim as a substring**
  of the agent's name/other searchable field (it is not tokenized). A short query like
  `"invoice"` finds `"Invoice Reconciler"`; a full task description generally will not.
