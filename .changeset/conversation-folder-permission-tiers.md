---
"@memberjunction/core-entities": minor
"@memberjunction/core-entities-server": minor
"@memberjunction/ng-conversations": minor
"@memberjunction/ng-bootstrap": patch
"@memberjunction/ng-bootstrap-lite": patch
"@memberjunction/server-bootstrap": patch
"@memberjunction/server-bootstrap-lite": patch
---

Conversation folders (`MJ: Projects`) get a three-tier permission model: Private (the default for new folders, owner only), Shared (granted to users or roles through `MJ: Resource Permissions` with the new `Projects` resource type) and Public (`OwnerUserID` null). Conversations in a Shared or Public folder are listed for the people the folder is shared with, View-only by default, unless the conversation opts out with `inheritFolderAccess: false` in `AdditionalData`. Each folder is shared on its own: a subfolder does not inherit its parent's grants, the same rule the server's read filter applies.

Only a conversation's owner can move it to another folder, change its owner, or change whether it inherits its folder's access; `MJConversationEntityServer` refuses anyone else, and the list asks before moving a conversation into a Shared or Public folder. The upgrade migration backfills `OwnerUserID` on legacy folders (the folder's creator first), opts every existing conversation in a Public or other-owned folder out of inheritance so no conversation becomes visible to anyone who could not see it before, and widens the UI role's read filter on `MJ: Projects` to folders shared with the user or their roles.

Folder sharing decides which conversations appear in a person's list. It is not a read boundary on its own: core ships no UI-role row-level security on `MJ: Conversations` or `MJ: Conversation Details`, so a host that needs hard read isolation must supply that RLS.
