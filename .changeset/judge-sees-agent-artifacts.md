---
"@memberjunction/testing-engine": patch
---

Agent Eval judges now see the agent's final message and output artifacts, not just its final payload. When a run has both a payload and a message, or produced artifacts, the llm-judge, decision-judge and rubric oracles receive a labeled, size-bounded evidence block (message, payload, each artifact). An artifact that is a `location: "registry"` component manifest is replaced by the full spec (code, data requirements, dependencies) fetched from its component registry. Runs whose payload alone is the answer are judged exactly as before; `actualOutput` is unchanged for structural oracles. Configure with `Configuration.judgeEvidence` (`enabled`, `includeArtifacts`, `resolveRegistryComponents`, `maxCharsPerItem`, `maxTotalChars`).
