---
"@memberjunction/ai-prompts": minor
---

Retires the AI Prompt "Job Function and Seniority Derivation" (`7C46041F`) from MJ core (#4918). bizapps-common ships the same prompt with the same ID, so installing common on MJ 6.2 failed with a duplicate primary key. The prompt and its template, template content and template parameter are marked `deleteRecord`; the next metadata sync deletes them, and the prompt's two AI Prompt Models go with it through `spDeleteAIPrompt`'s cascade.

Known gap: a database that already has bizapps-common 5.47 installed cannot upgrade to 6.2, because `V202609221852__v6.2.x__Metadata_Sync.sql` inserts a prompt model that duplicates common's on `UQ_AIPromptModel_Prompt_Model_Vendor_ConfigID` before this delete can run. Don't work around it by deleting common's prompt model, and don't fix it by guarding that migration's inserts alone. Once the migration completes on such a database, it overwrites common's prompt with MJ's version, and the metadata sync's `spDeleteAIPrompt` then deletes it: the prompt, its prompt models, prompt runs and result cache. It also sets `PromptID` to NULL on common's record processes. Tracked in #4939.
