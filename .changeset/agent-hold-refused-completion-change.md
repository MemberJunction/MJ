---
"@memberjunction/ai-agents": patch
"@memberjunction/integration-test-suite": patch
---

A refused completion's payload change is now held instead of discarded. Since 6.2, a completion refused by Success validation (minimum executions, `FinalPayloadValidation`, a self-check) had its `payloadChangeRequest` thrown away and the model was asked to send it again. Models answer a refusal with the correction, not the whole change, so the next completion was validated against a payload that had lost the rest of it and was refused again for fields it had already sent. Now the change is held: the next prompt sees the payload with it applied, the next completion is applied on top of it, and both are committed when a completion is accepted. Held changes are dropped if the run ends without an accepted completion, so the final payload still never contains an unaccepted change. A resent change identical to a held one (key order aside) is not applied twice. The refusal tells the model the change is held and to send only corrections. The step's `OutputData` records `payloadChangeHeld` (previously `payloadChangeDiscarded`). Integration check NTL14 is updated for this.
