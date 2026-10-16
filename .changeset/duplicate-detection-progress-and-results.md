---
"@memberjunction/ai-vector-dupe": patch
"@memberjunction/ai-vectors-memory": patch
"@memberjunction/core-entities-server": patch
"@memberjunction/server": patch
"@memberjunction/ng-dashboards": patch
---

Duplicate detection reports progress, finishes, and finds duplicates past the first 1,000 records; the Vectors tab saves what it shows.

- **Progress reaches the Duplicate Detection tab.** The tab subscribed to `PipelineProgress` before saving the new run, with the ID `NewRecord()` generated in the browser. A new record's create request carries no primary key, so the server gives the run a different ID: the subscription and the 15-second status check both watched a run that does not exist, the bar stayed at "Initializing… 0%", the check gave up after two minutes, and results appeared only after a page reload. The tab now subscribes after `Save()` with the saved ID and checks the run's status straight away, which still catches a run that finishes during the save.
- **Run-wide, monotonic progress** in `DuplicateRecordDetector`, and a run that fails (missing entity, no records to check, detector error) is marked `Failed` with its message instead of staying `In Progress`. The `PipelineProgress` filter compares IDs case-insensitively.
- **The in-memory vector store searches the whole index.** `SimpleVectorServiceProvider` loaded an entity document's vectors without `IgnoreMaxRows`, so the load stopped at `MJ: Entity Record Documents`' `UserViewMaxRows` (1,000): on an entity with more records, every vector past the first 1,000 was invisible to search and duplicate detection.
- **Matches carry the matched record's name.** When the vector store returns no metadata (the in-memory store returns only the record ID), the detector fills each match's `RecordMetadata` from the existence check it already runs, so match cards show names instead of record IDs.
- **A run prefers the entity's `Record Duplicate` document** over a newer document of another type, such as a `Search` document.
- **The Vectors tab saves the model, database and index it shows.** The first index was pre-selected on load, a chosen index stayed chosen when the database or model changed, and Save used that index's database and model in place of the dropdowns'. The index list now offers only indexes matching both the database and model shown, choosing one moves both dropdowns to it, changing either drops a non-matching index back to Auto, and both the suggestion and edit panels save only an index that matches.
- **Vector sync no longer reports "Synced" mid-run.** Five seconds without a progress event counted as success, while a remote embedding model can take longer than that per step. Only the server's `complete` or `error` event finishes a sync; two minutes of silence refreshes the row and says the result can't be confirmed.
- **A suggested document keeps the suggestion's match thresholds** instead of the defaults.
- The Duplicate Detection tab saves its threshold sliders to the selected document before a run, polls run status while idle, and no longer reconnects to finished or stale runs.
- **A duplicate-detection document may embed a date of birth.** The Vectors tab's sensitive-field refusal (#4437) refused `DateOfBirth`, `BirthDate` and `DOB` for every document, while a birth date is what tells two records for one person apart from two people who share a name: on More Cheese's People, the 22 strongest matches were all real duplicates with it and only the top 13 without it. Both refusal layers now take the document's purpose: birth-date fields are allowed for a `Record Duplicate` document and still refused for search and classification. Every other refused field is refused for every purpose.
