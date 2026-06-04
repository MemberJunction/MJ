---
"@memberjunction/ai-agents": minor
"@memberjunction/ai-core-plus": minor
---

agents can run a multi-step, server-side dataflow over their Actions and artifact tools in a single turn, with only the final result entering the context window. Stages pass structured JSON (PowerShell-style) and bind to fields via a safe, eval-free path grammar; operators include where/select/sort/groupBy/distinct/first/last/count/jsonpath/lines/grep/head/tail, plus map and let. Requested via nextStep.type: 'Pipeline'.
