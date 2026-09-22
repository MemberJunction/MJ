---
"@memberjunction/core-entities": patch
---

Align the committed `MJAIAgentRunStepEntity` validator description with the `GeneratedCode` row seeded by #4651, so `CodeGen drift gate` can reproduce the artifact. The row supplies the text CodeGen writes into both the `Validate()` field list and the validator's JSDoc; the committed file still carried the wording from the original LLM run, leaving a permanent two-line drift (MemberJunction/MJ#4667).
