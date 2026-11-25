---
'@memberjunction/core': minor
'@memberjunction/ai': minor
'@memberjunction/ai-prompts': minor
'@memberjunction/ai-openai': minor
'@memberjunction/core-entities': minor
'@memberjunction/server': minor
'@memberjunction/ai-engine-base': minor
---

Model catalog fixes.

- Nano Banana 2.1 was defined twice and both rows were active (#6121). The row in `.gemini-image-models.json` stays; the later duplicate in `.ai-models.json` is retired (inactive, renamed "Nano Banana 2.1 (retired duplicate)", vendor rows Inactive, cost row Expired). Both rows shipped only in edge builds and nothing in `metadata/` references either; a deployment that pointed a prompt at the duplicate by ID should repoint it. A new catalog test fails when two active models share a name.
- `MJ: AI Models.APIName`, `DriverClass` and `DriverImportPath` now say that they come from the model's top-priority Active Inference Provider row and describe only that vendor (#3066).
- New catalog flag `LLM.ChatCompletionsToolsRequireNoReasoning` (#6210). When set on a model vendor row, the prompt runner passes `ChatParams.toolsRequireNoReasoning` and the OpenAI driver sends `reasoning_effort: 'none'` on the first request that declares tools, instead of learning it from a 400. Set on GPT-6 Luna's OpenAI row; the 400 fallback stays for unmarked models.
