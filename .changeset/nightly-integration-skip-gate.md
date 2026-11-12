---
'@memberjunction/integration-test-suite': patch
---

Unblock the nightly integration tier, which had failed every night for over a month.

Mutation-gated checks are allowed to skip by the driver only while the mutation tier is unarmed.
The nightly arms it, so those checks run and a secondary skip of their own is judged like any
other — and none had an allowlist entry, because every PR run skips them at the tier gate and
stays green. Allowlists the eight that skip structurally (`server-cache.S30`,
`role-elevation.RE6`, `entity-server-invariants.ESI9`, `realtime-session-verification.RSV1/2/4/5/6`)
with a specific reason each, and records the asymmetry in the allowlist's header so the next
mutation-gated check that self-skips is easier to place.

Also fixes the `server-cache.S34` race (#6537): a save maintains more than one cache slot with
background, fire-and-forget writes, so a late upsert could land after the delete and be read as
the delete's removal ("a delete upserts nothing — expected 0, got 1"). The check now locates each
`row_delta` write by its payload instead of taking the most recent one.
