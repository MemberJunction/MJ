---
"@memberjunction/ng-skip-chat": patch
---

Fix auto-creation of new conversation when deleting the last
one

When all conversations are deleted, automatically create a new
empty conversation instead of showing just a loading spinner.
This provides better UX by allowing users to immediately start
typing without manually creating a new conversation.
