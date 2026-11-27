---
"@memberjunction/ng-explorer-settings": patch
---

User Management: a non-Owner sees the list read-only with a note, since the server refuses their create, delete and status changes of other users; they can still edit their own record and open others read-only. Row and bulk failures show as a toast and keep the list. A failed bulk enable/disable restores each user's own prior status and reloads the list.
