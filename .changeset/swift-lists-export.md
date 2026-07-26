---
"@memberjunction/core": minor
"@memberjunction/ai": patch
"@memberjunction/core-entities": patch
"@memberjunction/core-entities-server": patch
"@memberjunction/ng-dashboards": patch
"@memberjunction/ng-entity-viewer": patch
"@memberjunction/ng-explorer-core": patch
"@memberjunction/ng-query-viewer": patch
---

Client-issue batch fixes. Exports (Query viewer, Data Explorer, and User Views) now cover the FULL result set — capped at 100k with an over-cap warning — instead of just the on-screen page, and the Data Explorer toolbar Export button opens a unified Excel/CSV/JSON dialog for every view type (Grid/Cards/Map/Timeline). UI-role users can now create and manage Lists, with owner-scoped delete (or Developer/Integration) enforced server-side on BOTH Lists and List Details — a List Detail's authorization is scoped through its parent List's owner, so a user can't delete membership rows of lists they don't own. Also: grid quick-filter matches hidden columns, primary-key integer columns render without thousands separators, the Queries search-box icon/placeholder overlap is fixed, and the streaming thinking-tag stripper no longer leaks partial `<think>`/`</think>` tags split across chunks — and now flushes a genuine trailing tag-prefix (e.g. a response ending in `<`) at end of stream instead of dropping it.
