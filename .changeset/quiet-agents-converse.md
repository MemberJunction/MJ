---
"@memberjunction/ai-agents": minor
---

Stop loop-agent JSON format drift and add infinite-loop guardrails. Framework action and sub-agent delegation records are now written to the conversation as user-role environment annotations instead of assistant-role prose, so models no longer imitate the framework's narration and drift out of the required JSON envelope. The unparseable-output retry feedback is now a directive demanding JSON-only output, and a consecutive-unproductive-retries guardrail (cap 10) prevents parse-failure retry loops. Also sets MaxIterationsPerRun=50 on the Query Strategist agent metadata.
