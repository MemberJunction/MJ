---
"@memberjunction/ng-explorer-core": patch
"@memberjunction/ng-simple-record-list": patch
---

Explorer performance quick wins:

- **Omnibar `#` jump-to-record**: debounce trigger-mode keystrokes (150ms) instead of issuing a `RunView` on every character, which flooded MJAPI during a typing burst. The intentional empty-term "browse top 5" behavior is preserved, and the existing stale-response guard / on-destroy timer cleanup already cover the deferred fire.
- **List detail "Add from views"**: batch the per-view lookups into a single `RunViews` call instead of a sequential `RunView` per selected view (N round-trips → 1).
- **Simple record list**: use `EntityByName` (O(1), case-insensitive) instead of the O(N) `Entities.find` scan, per the metadata-lookup convention.

No API or behavior changes beyond the debounce timing.
