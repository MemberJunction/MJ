---
"@memberjunction/ng-explorer-core": patch
---

Redesign query browser with multiple view modes and improved UX

- Add three view modes: category (hierarchical folders), list (table),
  and panel (cards with SQL preview)
- Implement breadcrumb navigation for category hierarchy with
  folder-based organization
- Add search, status filter, and sort functionality with proper state
  management
- Fix navigation to use proper MJ routing pattern (/resource/record/) for
  entity forms
- Fix delete functionality to handle BaseEntity objects from RunView
  correctly
- Add "New Query" button that navigates to empty form with optional
  CategoryID pre-population
- Remove edit buttons in favor of single-click navigation to query form
- Show query counts in category folders for better organization
  visibility
- Fix SQL syntax errors caused by double-quoted GUIDs in query parameters
- Improve performance with batch data loading and client-side filtering
