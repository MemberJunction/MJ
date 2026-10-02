---
'@memberjunction/core-entities': patch
'@memberjunction/ng-conversations': patch
'@memberjunction/ng-resource-permissions': patch
---

feat: the conversation sidebar gains multi-select (keyboard, mouse and touch), bulk actions, sorting, a search clear button, and multi-resource sharing

**Selecting.** Ctrl/Cmd-click toggles one conversation, and Shift-click selects the range from the last row picked. A range follows the order the list renders and never reaches rows hidden inside a collapsed folder or section. A Ctrl-click that starts a selection takes the open conversation along, and a Shift-click with nothing picked yet ranges from it. Selecting needs no keyboard: a checkbox appears in a row's left padding when the pointer is over the row, and on every row while a selection exists. On touch, a long-press on a row selects it, after which a tap adds or removes a row. A selected row shows a ticked checkbox and an accent tint; the open conversation keeps its solid fill. Escape, a click on empty space, or deselecting the last row ends selection mode. The ⋯ menu's "Select Conversations" entry is gone.

**The selection only holds rows on screen.** Select All picks the visible rows. A search edit, a collapse or a grouping change drops the selected rows it hides, and a conversation that leaves the list leaves the selection.

**The selection bar.** While a selection exists, the search row becomes a bar with the count, Pin or Unpin, Move to folder, Share, Delete and a clear button. The sort buttons stay in place, so the list does not jump.

**One right-click menu.** It replaces the per-row ⋯ menu's contents and the old bottom selection bar. On a selected row it acts on the whole selection ("3 selected", Pin, Unpin, Move to folder ▸, Share, Delete 3). On any other row it acts on that row alone and leaves the selection untouched. On a folder it offers New Subfolder, Rename and Delete, so the hover icons on folder rows are gone. On empty space it offers New Conversation, New Folder and Select All. The ⋯ button opens the same menu and is always shown on touch screens. The menu stays inside the window, opening upward or moving left near an edge.

**Who can do what.** Share needs ownership or an Owner grant, the same rule the chat header uses. Move and Pin need ownership or an Edit/Owner grant. Each action is disabled when none of its targets qualify. A row you hold only View access to cannot be dragged into a folder. The conversations an action leaves out are named, with the reason. Folder and pin are still stored on the conversation itself, so a person with Edit access changes them for the owner too; per-user folder and pin is tracked in #4742.

**Bulk actions and dragging.** Move and Pin keep the selection so a second action can follow. Delete removes only the deleted rows from the selection, so deleting a row outside the selection leaves it alone. Bulk actions report any conversations they could not change. Grabbing a selected row drags the whole selection onto a folder, onto Ungrouped, or onto the conversations inside a folder; grabbing an unselected row drags that row alone. Conversations already in the destination are skipped rather than re-saved.

**Sorting and search.** A Date / Name button pair sorts the Pinned section, every folder and the Ungrouped list together; clicking the active button flips the direction. The choice is saved with the folder collapse state and group-by mode. The search box gains a clear button, and Escape inside it clears the query.

**Sharing several resources — `ng-resource-permissions`.** `mj-resource-share-dialog` gains a `Contexts` input for sharing several resources at once. It merges everyone's access across them, labels a person whose access covers only some ("2 of 3") or differs in level ("Mixed"), and applies add, level change and removal across the whole set. `Context` is unchanged, so dashboards and the chat header are not affected. `ResourceLabel` sets the noun in the title, and `Notice` shows a caller-supplied line (the sidebar uses it to report conversations left out). The dialog leaves every resource's owner out of "Add people", and a retry after a partly failed save picks up where it stopped.

**Engine — `core-entities`.** `ConversationEngine` gains `CanShareConversation` and `CanEditConversation`, the rules above, shared by the chat header and the sidebar. It also gains `MoveMultipleConversationsToProject` and `PinMultipleConversations`. They refuse a View-only conversation without saving it, save one conversation at a time so a single rejection cannot fail the batch, roll a failed conversation's fields back in memory, and emit the updated list once per batch.
