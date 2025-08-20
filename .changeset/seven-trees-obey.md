---
"@memberjunction/ng-skip-chat": patch
---

Fixed critical issues in Skip Chat component including orphaned artifact cleanup and UI update problems. When deleting conversation messages,
associated ConversationArtifact and ConversationArtifactVersion records are now properly deleted to prevent orphaned database records. Fixed UI not
updating immediately after message deletion by adding proper change detection. Resolved ExpressionChangedAfterItHasBeenCheckedError in elapsed time
display by initializing values correctly and deferring updates to the next microtask.
