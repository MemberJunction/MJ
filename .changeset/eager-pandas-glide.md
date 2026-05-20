---
"@memberjunction/ng-core-entity-forms": patch
---

Add an inline save/edit experience to the custom Test and Test Suite forms: editable Name, Description, Status, Parent Suite / Test Type, and tag-chip editor, plus a sticky save bar that slides up from the bottom whenever the record is dirty (Save/Discard, ⌘S shortcut, beforeunload guard, success/error toasts). Test Suite forms also gain in-place membership management — a searchable picker dialog for bulk-adding tests, hover-revealed remove with inline confirm, and drag-to-reorder via CDK with sequence persistence.
