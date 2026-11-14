---
"@memberjunction/core": minor
"@memberjunction/ng-conversations": minor
"@memberjunction/ng-explorer-core": minor
"@memberjunction/core-entities": minor
"@memberjunction/core-entities-server": minor
"@memberjunction/integration-test-suite": minor
---

Chat search panel: debounce typed queries (250 ms), keep only the newest search's results, and look up artifact collections with two batched reads instead of one query per artifact.

Conversation export: every format now writes the output artifacts of each message (name, type, version, stored text content capped at 20,000 characters; MIME type for file-backed versions), with a deep link when the host supplies one. The export button is disabled when there is no conversation to export.

Conversations: only the server changes a saved conversation's owner (`UserID`); the owner is refused too, because messages with no `UserID` follow the owner.

Folders: the UI role can create, rename, move and delete its own folders (Private or Shared), bound to the new "UI: Own Projects" row-level filter (migration + entity-permission metadata). Deleting a folder moves its subfolders and conversations out as the system user in the delete's transaction. The folder dialog offers Public, and the sidebar offers Rename/Delete, only where the user's folder writes allow it.
