---
"@memberjunction/ai-prompts": patch
---

Refactor the prompt-run persistence lifecycle: the chat-specific request and result fields move from `BaseModelRunner` to `AIPromptRunner`, and `BaseModelRunner` gains `CreateRunRecord` and `FinalizeRunRecord` for prompt-based runners.

- `FinalizeRunRecord` takes the call's outcome and writes `Success` and `Status` (`Completed` or `Failed`) itself, before the runner's result callback runs, so no runner can leave a row at `Running`.
- Every `MJ: AI Prompt Runs` field the chat runner writes has the same value as before. The one difference is on an error path: if the chat runner's result callback throws, the row now ends `Completed` or `Failed` instead of staying `Running` (the error is still logged under `PromptRunUpdate`).
- `createPromptRun` and `updatePromptRun` keep their signatures and are `private` again, as they were before `BaseModelRunner`.
