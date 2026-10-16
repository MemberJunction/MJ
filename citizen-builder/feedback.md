# Citizen Agent Builder — Developer Feedback & Evaluation Log

This document serves as the feedback hub for the **MemberJunction Citizen Agent Builder**.
When testing the citizen builder workflow with an AI coding agent, please post your feedback, agent transcripts, and observations as comments on the GitHub Pull Request.

---

## 🎯 Testing Objective

Test the citizen agent builder workflow using an autonomous AI coding agent (Claude Code, Cowork, Cursor, Codex, Windsurf, ChatGPT, etc.) that has **zero prior knowledge or memory of MemberJunction**.

We want to observe:
1. Does the agent understand the 11-step engineering loop and 3-tier boundaries?
2. Can the agent discover entities and actions without guessing?
3. Does the agent use the machine-readable CLI commands (`--format json`, `mj doctor`, `mj ai audit agent-run`)?
4. Where does the agent experience friction, error out, or require human intervention?

---

## 📝 Feedback Submission Template

Please copy this template and post it as a comment on the Pull Request:

```markdown
### Tester & Environment
- **Tester Name / Handle:** 
- **Agent Tool Used:** (e.g. Claude Code, Cowork, Cursor, Windsurf, ChatGPT desktop, Codex)
- **Underlying LLM:** (e.g. Claude 3.7 Sonnet, GPT-4o, Gemini 2.0 Flash)
- **OS Platform:** (macOS / Linux / Windows WSL2)
- **Total Time from Prompt to Packaged Bundle:** ~XX minutes

### Evaluation Checklist
- [ ] **Workspace Setup**: Agent created directory in `~/Documents` and pulled template files cleanly.
- [ ] **Docker Initialization**: Stack started with `docker compose up -d` and health was verified.
- [ ] **Discovery**: Agent used `CAPABILITIES.md` or CLI commands (`mj ai actions list`, etc.) instead of guessing.
- [ ] **Metadata Authoring**: Agent authored valid JSON metadata under `metadata/` (native JSON, @lookup, @file).
- [ ] **Database Sync**: `./scripts/sync-metadata.sh` succeeded without reference errors.
- [ ] **Headless Testing**: Agent executed test runs via CLI.
- [ ] **Trace Auditing**: Agent audited execution traces via `./scripts/query-run-history.sh` or `mj ai audit agent-run`.
- [ ] **Packaging**: Agent generated `AGENT_MANIFEST.md` and packaged files into `dist/*.zip`.

### Friction Points & Blockers
1. *Where did the agent struggle or hallucinate?*
2. *Did you need to intervene manually at any point? If so, why?*
3. *Were any error messages ambiguous or misleading to the agent?*

### Observations & Suggestions
- *What worked exceptionally well?*
- *What additional CLI commands or metadata helpers would make the agent more effective?*

### Attachments (Optional)
- Attach or link agent transcript logs or the generated `AGENT_MANIFEST.md`.
```
