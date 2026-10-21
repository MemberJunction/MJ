---
"@memberjunction/ai-vector-sync": patch
"@memberjunction/ai-vector-dupe": patch
---

Duplicate detection now queries with the same text vector sync stored (#5198). It rendered each record's template from the record's own fields alone, so every `Entity` template param (a person's Phones, Emails, Addresses...) rendered empty, and dates came through as `Date` objects instead of the view's values. The query vector then described a shorter document than the stored one: duplicates that share contact data fell below the threshold, and records with no contact data over-matched.

- **One builder for both sides.** `EntityDocumentTemplateDataBuilder` (new export of `@memberjunction/ai-vector-sync`) loads a batch's related-entity rows and builds each record's template data. `EntityVectorSyncer.GetTemplateData` and `GetRelatedTemplateDataForBatch` keep their signatures and delegate to it.
- **Same row as sync.** The detector renders each saved record from its `RunView` row (`ResultType: 'simple'`), one query per sub-batch. An unsaved record (the entry-time check) renders from its own values with empty related rows, and runs no related-data query.
- **Fails loudly.** When a related param's rows can't be loaded, the batch throws instead of rendering the param empty. Rendering skips validation and suppresses its warnings, as sync does, which ends the "Template validation warnings (non-fatal) … Parameter Phones is required" log spam on every run.
- A page with no keys (an empty last page) no longer sends `IN ()` to the database for each related param.
