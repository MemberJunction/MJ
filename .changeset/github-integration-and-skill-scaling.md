---
"@memberjunction/core-actions": minor
"@memberjunction/ai-agents": minor
"@memberjunction/ai-agent-harness": minor
"@memberjunction/ai-mcp-client": minor
"@memberjunction/credentials": minor
"@memberjunction/server-bootstrap": minor
"@memberjunction/server-bootstrap-lite": minor
---

Add first-class GitHub integration across Actions, AgentHarness CLI sandboxes, MCPClient, and Credentials, along with large-scale AI Skill semantic discovery and hybrid catalog prioritization:

- **GitHub Credential Types & Resolver (`@memberjunction/credentials`, `@memberjunction/core-actions`)**:
  - Add `GitHub App` (`GitHubAppCredentialValues`) and `GitHub Personal Access Token` (`GitHubPATCredentialValues`) credential schemas and TypeScript interfaces.
  - Add `GitHubCredentialResolver`, `GitHubAppAuth` (zero-dependency RS256 JWT signing and repo-scoped installation token exchange), and resilient `GitHubClient` with retry/backoff, repository allowlists, protected-branch enforcement, and App-Token-Never-Merges guardrails.
  - Support 4-tier credential resolution: explicit `CredentialID`/`CredentialName`, per-user 3LO OAuth (`UserOAuth3LO:GitHub:<userId>` when `UseUserDelegatedAuth=true`), default `GitHub App` / `GitHub Personal Access Token` credential, and environment variable fallback.

- **14 Native GitHub Actions & Portable Skill (`@memberjunction/core-actions`, `metadata/`)**:
  - Add 6 read-only discovery actions (`GitHub: Get Repository Context`, `GitHub: Search Code`, `GitHub: Read File Content`, `GitHub: List Issues and PRs`, `GitHub: Get Issue or PR Details`, `GitHub: Get Workflow Runs and Logs`) and 8 governed write actions (`GitHub: Create or Update Issue`, `GitHub: Add Issue or PR Comment`, `GitHub: Commit Files and Create PR`, `GitHub: Commit Files to Branch`, `GitHub: Submit PR Review`, `GitHub: Merge Pull Request`, `GitHub: Trigger Workflow Dispatch`, `GitHub: Re-run Failed Workflow`).
  - Seed the `GitHub Engineering & Repository Steward` skill (`MJ: AI Skills`) and grant read-only GitHub discovery actions to `Research Agent`, `ActionSmith`, and `SkillSmith`.

- **Agent Harness CLI & MCP GitHub Auth (`@memberjunction/ai-agent-harness`, `@memberjunction/ai-mcp-client`)**:
  - Add `HarnessCredentialResolver` routing sandbox credential lookups through `CredentialEngine.Instance.getCredential()` (preserving audit logs, `LastUsedAt`, and expiry checks), extracting scalar tokens from encrypted JSON values, minting short-lived installation tokens for `GitHub App` credentials without exposing private keys in containers, mirroring `GH_TOKEN`/`GITHUB_TOKEN`, and enforcing per-user 3LO isolation (`GH_TOKEN_USER_3LO`) with `GIT_AUTHOR_*`/`GIT_COMMITTER_*` attribution.
  - Update `MCPClientManager` to mint short-lived installation tokens when an MCP server connection uses a `GitHub App` credential.

- **AI Skill Semantic Discovery & Hybrid Prioritization (`@memberjunction/core-actions`, `@memberjunction/ai-agents`, `metadata/`)**:
  - Add the `"AI Skills Search"` `MJ: Entity Documents` Nunjucks template for vector indexing `MJ: AI Skills`.
  - Add `Find Candidate Skills`, `Find Best Skill`, and `Get Skill Details` actions for hybrid vector + lexical skill discovery and progressive-disclosure inspection.
  - Add `maxSkillsInPrompt` and `maxSkillDecisionCandidates` to `LoopAgentPromptParams` and implement two-stage hybrid skill catalog narrowing (`RankSkillsByHybridRelevance` + `PreFilterSkillCandidatesForDecision` + `NarrowSkillsWithDecision`) combining query relevance (`0.55`), agent/global run-step usage frequency (`0.25`), and 7-day exponential recency decay (`0.20`), while pinning active/requested skills and surfacing discovery guidance in `BuildCatalogNarrowingNote`.
