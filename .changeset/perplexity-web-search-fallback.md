---
"@memberjunction/core-actions": minor
---

Give web-research agents a second search provider ahead of the Google Custom Search shutdown.

Google's Custom Search JSON API is closed to new customers and is discontinued on 2027-01-01, and
every agent that searched the web was bound to that one action. Perplexity Search already shipped in
CoreActions but was unusable and unreachable: its default model, `llama-3.1-sonar-small-128k-online`,
was retired by Perplexity in February 2025, and no agent or skill was granted the action.

- Default the Perplexity Search action to `sonar`, and document the current model family
  (`sonar`, `sonar-pro`, `sonar-reasoning-pro`, `sonar-deep-research`) in the action and its
  Action Param metadata. A new test pins the default and fails on any `llama-3.1-sonar-*`
  identifier, so a retired model copied from an old example breaks the build rather than the
  runtime.
- Grant `Perplexity Search` alongside `Google Custom Search` to all 11 agent-action bindings across
  the Research Agent, Sage, Agent Manager and the core agents, plus the Web Research skill.
- Update the Web Research skill and the research/Sage prompt templates to treat web search as
  provider-agnostic: prefer Perplexity, fall back when one provider reports a missing API key, since
  a deployment may credential only one.
- Document the provider choice and the Custom Search end-of-life in the CoreActions README and the
  `config.ts` schema comments.

No behavior changes for deployments that have Custom Search access — configuring both providers is
supported, and the Google path is untouched.
