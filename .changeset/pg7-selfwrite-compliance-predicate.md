---
"@memberjunction/integration-test-suite": minor
---

IT56/PG7: gate self-write compliance on BOTH scripted writes, not just the restricted one.

`IT: Self-Write Restricted` is prompted to emit `notes.a` (allowed) and `config.b` (restricted) in a single `payloadChangeRequest`. PG7's `runWithCompliance` phase watched only for the restricted half, so a model that emitted `config.b` and dropped `notes.a` passed the compliance gate and then failed the next assertion with `the ALLOWED notes.a self-write did not land — expected "IT-NOTES-OK", got undefined` — a bare value assertion that reads as an engine defect.

It is not one. Driving the agent directly, a fully compliant response yields `FinalPayload {"notes":{"a":"IT-NOTES-OK"}}` with `config` correctly absent: the allowed path applies and the restricted path is blocked, exactly as designed. The failure was partial model non-compliance that the predicate could not see.

Requiring both markers makes that case report `model-noncompliance:` like the other eight checks in the bundle instead of accusing the engine.
