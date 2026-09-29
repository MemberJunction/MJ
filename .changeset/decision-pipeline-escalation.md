---
"@memberjunction/feature-pipelines": minor
"@memberjunction/record-set-processor": minor
---

A Decision Feature Pipeline can now escalate its borderline records to an LLM Feature Pipeline: set `Escalation` (the LLM pipeline's ID and a confidence floor) in its spec, and only the records whose confidence falls below the floor are re-run through the LLM pipeline, whose answers replace the decision's.
