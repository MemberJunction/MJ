---
"@memberjunction/content-pipeline": minor
"@memberjunction/content-pipeline-base": minor
"@memberjunction/content-autotagging": minor
"@memberjunction/core-entities": minor
"@memberjunction/server": minor
"@memberjunction/ng-core-entity-forms": minor
---

Content pipeline: a Discover walk can run in parts, and a driver can report removals.

Walks in parts. A source too large to walk in one run had to finish in one go or start over every time. A driver's `Discover` may now end early by returning `{ ResumeToken }` (an `async *` generator's `return`), typically when the walk passes `DiscoverRequest.Deadline` (set from the new `Options.Tuning.DiscoverWalkBudgetMs`). The Discover stage keeps the token on the source in the new `ContentSource.DiscoverState` column (JSON, typed `IContentSourceDiscoverState`: `ResumeToken`, `WalkStartedAt`, `Mode`, `ItemsFound`) and hands it back as `DiscoverRequest.ResumeToken` on the next walk, which keeps the first part's `Since`. Until the walk finishes the source stays due (`ForceDiscovery` stays set, `LastDiscoveredAt` / `LastSyncedAt` do not move); the part that finishes stamps the first part's start and clears the state. The token is saved only when every item the part found commits: a part whose items could not be saved keeps the old token, so the next run walks that part again (and reports its removals again) instead of resuming past items that were never saved. A walk resumes only in the mode it started in. A Sync that runs in parts marks nothing for deletion by absence, since no single run saw the whole source.

Removals. A driver can yield `{ URL, Removed: true }` for a locator it knows is gone; once the walk's items have committed, the source's top-level item at that URL is marked `DeleteStatus = 'Pending'` for the Delete stage, without waiting for a Sync. Child items go with their parent, as with Sync.

Migration `V202611161607__v6.3.x__ContentPipeline_Discover_State` adds the column with its regenerated view, procedures, GraphQL type and form field.
