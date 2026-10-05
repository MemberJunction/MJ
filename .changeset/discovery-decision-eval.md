---
"@memberjunction/ai-agents": patch
"@memberjunction/testing-engine": patch
"@memberjunction/integration-test-suite": patch
---

The Decision Eval harness can now measure Sage's agent-discovery decision (`agent-discovery`), beside a `semantic-search` baseline of what `Find Candidate Agents` ranked first, with a labelled-corpus generator and discovery metrics in the scorecard. `@memberjunction/ai-agents` now exports the discovery helpers, including `BuildDecisionDiscoveryOptionSet`, which `BaseAgent` and the harness both use to build the options. The discovery eval times the whole discovery, options and semantic search included, as production's 1,500 ms timeout does, and counts an answer that arrives later as not injected.
