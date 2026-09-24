---
"@memberjunction/ng-base-forms": patch
---

The "Panels on this form" button survives turning a panel off.

The button was offered when the form carried a contribution that was rendering. Turning
a panel off is one of the things the manager does, so that gate locked the door behind
the user: switching off the last panel took the button with it, and there was no way
back in to switch it on again.

It now reads every contribution row on the entity, whatever its status — the same source
the drawer itself lists from, so the button and its contents can no longer disagree. A
form that has never carried a contribution still does not show it.

`FormPanelAdminService.HasRowsForEntity` answers it without projecting the rows, because
the container asks on every change-detection pass.
