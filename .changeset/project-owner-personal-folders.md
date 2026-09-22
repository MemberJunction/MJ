---
"@memberjunction/core-entities": minor
"@memberjunction/server": minor
"@memberjunction/ng-conversations": minor
"@memberjunction/ng-core-entity-forms": minor
---

`Project.OwnerUserID`: conversation folders can be personal. One additive, nullable column — NULL keeps a folder shared with the environment exactly as today; set, the folder belongs to that user.

Ownership is enforced server-side, not by convention: the migration attaches a row-level-security filter (`OwnerUserID IS NULL OR OwnerUserID = '{{UserID}}'`) to the UI role's read permission on `MJ: Projects`, so a personal folder's NAME is unreadable to other users through any reader — `RunView`, the entity browser, the Projects grid on the User form — and not merely absent from the sidebar. Developer and Integration stay unfiltered, so entity-admin surfaces are unaffected.

What it does NOT change: a SHARED folder is readable by everyone in the environment, which is what shared means and is the state every folder that already exists is in. This makes personal folders possible and private; it is not a tenancy model, and tenant separation stays the host's Environment or its own row-level security.

Visibility is a create-time choice, and one-way afterwards. A personal folder can be shared; a shared folder cannot be taken private, because NULL-means-shared conflates "shared" with "unowned" — sharing erases the owner, so the system cannot tell reclaiming from appropriating, and every folder that exists today would otherwise be one click from belonging to whoever opened its settings first.

Also: `ConversationEngine` keys its folder cache by user as well as environment, its remote-save handler drops a folder that just became someone else's, and `DeleteProject` reads a folder's children by `ParentID` instead of trusting the now-narrowed cache — an unseen subfolder still holds the RESTRICT foreign key.
