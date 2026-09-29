---
"@memberjunction/ai-agents": patch
---

Loop agents can opt in to a payload change check with the `payloadFeedbackCheck` prompt param (off by default): when the payload analyzer flags one of the agent's own changes, one typed decision call asks whether each change was intended, and the changes judged unintended are listed on the agent's next turn so it can confirm or restore them. Nothing is reverted automatically, and `PayloadFeedbackManager.QueryAgent` now asks typed decisions instead of the `Payload Change Feedback Query` prompt.
