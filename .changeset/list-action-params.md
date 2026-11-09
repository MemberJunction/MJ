---
"@memberjunction/core": minor
---

The 12 Lists / Communications actions (Materialize List From View, Add View Results To List, Refresh List From Source, Compose Lists, Share List, Invite To List, Unshare List, Revoke List Invitation, Resolve Audience, Move List Members, Bulk Update List Item Status, Send To Audience) now declare their `MJ: Action Params` and `MJ: Action Result Codes`. They were seeded with none, so a Scheduled Job (which passes values by ActionParamID) could not supply ListID/Mode/ConfirmDrops, and agents and the action UI saw actions with no inputs. The declared params match what each action reads; credential and invitation-token values are marked not to be logged.
