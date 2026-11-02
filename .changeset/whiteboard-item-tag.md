---
"@memberjunction/ng-whiteboard": patch
---

Whiteboard items gain an optional `Tag` (LXP P14.1). A host restyling the board from outside could only distinguish what the DOM distinguishes, and item KINDS were the only discriminator: one kind with two ROLES (a shape as a section head vs an empty "fill this in" slot, a sequence step done vs not yet reached) had no hook, so hosts resorted to content conventions like "a markdown item whose only child is a blockquote".

- `Tag?: string` on `WhiteboardItemBase`, persisted with the item and settable through an `UpdateItem` patch. No behavior attached.
- The board appends `wb-tag-<slug>` to every item wrapper (box kinds, ink paths, connector groups): lower-cased, runs of non-alphanumerics become one dash, capped at 32 characters, blank tags yield no class. The static-class wrappers became `[class]` bindings for it.
- Every `Whiteboard_Add*` tool takes an optional `tag`, a new `Whiteboard_SetTag` tool re-tags or clears an existing item of any kind (so the agent can mark a step done later), and the compact scene view carries `tag` so the agent can tell a slot from a heading without re-reading content. A blank tag is stored as no tag.
