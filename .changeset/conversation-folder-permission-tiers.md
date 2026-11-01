---
"@memberjunction/core-entities": minor
"@memberjunction/core-entities-server": minor
"@memberjunction/ng-conversations": minor
"@memberjunction/ng-bootstrap": patch
"@memberjunction/ng-bootstrap-lite": patch
"@memberjunction/server-bootstrap": patch
"@memberjunction/server-bootstrap-lite": patch
"@memberjunction/server": patch
---

Conversation folders (`MJ: Projects`) get a three-tier permission model: Private (the default for new folders, owner only), Shared (granted to users or roles through `MJ: Resource Permissions` with the new `Projects` resource type) and Public (`OwnerUserID` null). A conversation in a Shared or Public folder is listed for the people the folder is shared with, at the folder's level (View for a Public folder), only when its owner opts in with `inheritFolderAccess: true` in `AdditionalData`; by default it stays visible only to its owner and the people it is shared with. Each folder is shared on its own: a subfolder does not inherit its parent's grants, the same rule the server's read filter applies.

Only a conversation's owner can move it to another folder, change its owner, or change whether it inherits its folder's access; `MJConversationEntityServer` refuses anyone else, and the list and chat header ask before moving an inheriting conversation into a Shared or Public folder. Only a folder's owner can change its owner or parent, including making it Public; the new `MJProjectEntityServer` refuses anyone else, and nobody can claim a Public folder. `MJ: Projects` updates always baseline on the stored row, so the owner check holds even if a host turns off record-change tracking for folders. Nobody, the server included, can move a folder into itself or one of its subfolders. The server saves `AdditionalData` as compact JSON and refuses a value the list's SQL filter and the parser would read differently, so they agree on whether a conversation inherits. Both checks exempt the server itself and the system user, so agent runs as the system user (for example a widget agent using an update-record action) can still move or change these. The upgrade migration backfills `OwnerUserID` on legacy folders (the folder's creator first), so they do not all become Public, and widens the UI role's read filter on `MJ: Projects` to folders shared with the user or their roles. It leaves conversations alone: inheritance is off until an owner turns it on, so none becomes visible to anyone who could not see it before.

Folder sharing decides which conversations appear in a person's list. It is not a read boundary on its own: core ships no UI-role row-level security on `MJ: Conversations` or `MJ: Conversation Details`, so a host that needs hard read isolation must supply that RLS.
