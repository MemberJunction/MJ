---
"@memberjunction/aiengine": minor
---

One speech-to-text model type instead of two.

`MJ: AI Model Types` had two rows for the same concept:
- `STT`, seeded by the v5 baseline, with **0 models** on a clean database;
- `Speech to Text`, added through `metadata/ai-model-types`, used by **every** shipped speech-to-text model.

The duplicate was harmless while a prompt's `AIModelTypeID` is advisory. It becomes a live bug once a model type is a hard floor (the typed-decision plan, #4660, Phase 0 Task 0.1): a floor matches one row and silently filters out every model filed under the other.

`Speech to Text` survives, because it is the row the shipped models already reference. Nothing in code looks up either row by name.

- **Migration** `V202609231300__v6.2.x__Repoint_STT_Model_Type_To_Speech_To_Text.sql` repoints any `AIModel` / `AIPrompt` row still referencing `STT`, so rows a customer created against it survive the delete. It runs only when both rows exist, and is idempotent and re-runnable.
- **Metadata**: `STT` gets a `deleteRecord` entry in `metadata/ai-model-types/.ai-model-types.json`. The delete ships declaratively, through the release-time metadata sync, like every other metadata change.
