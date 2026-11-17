---
"@memberjunction/content-pipeline": minor
"@memberjunction/content-pipeline-base": minor
"@memberjunction/content-autotagging": minor
---

Content pipeline: a driver can fetch a page of its own locators in one session. A driver may implement `FetchBatch({ URLs, ... })`, returning one result per locator (its bytes, or the error its fetch ended in). Stages gain an optional bulk step, `Prepare(records, context)`, that the processor runs over a page before any record runs (only for the run's first stage); Extract uses it to call `FetchBatch` once per source in the page, and each item then reads what came back for it. An item the batch did not return is fetched alone; one whose batch fetch failed fails (a permanent 4xx) or retries (anything else) alone, as a single fetch would; a `Prepare` that fails is logged and every record runs as before. The processor now pages a run whose first stage has a `Prepare` even when its last stage has no `Finalize`, finishing each record exactly as a single-record run does.
