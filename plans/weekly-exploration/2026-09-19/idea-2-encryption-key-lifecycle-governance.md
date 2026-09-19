# Idea 2: Encryption Key Lifecycle & Envelope Governance

**Week of 2026-09-19 · Creative exploration · Framework-level (core, not a vertical app)**

## The problem, framed for the world, not the codebase

A small nonprofit's finance volunteer processes online gifts through a payment integration, and
somewhere in the sync path a bank routing number or a donor's SSN (for a matching-gift or grant
1099 record) gets encrypted at rest, the way it should be. Two years later the organization rotates
its encryption key — a routine, responsible thing to do, and something PCI DSS 4.0 explicitly
expects organizations to document as a defined schedule with a record of key changes. The rotation
runs, reports success, and quietly leaves that one column unreadable forever, because nothing told
it that column existed. Nobody notices until an auditor, a grant reconciliation, or a donor's estate
request needs that exact record years later — the moment "we rotated the key last spring" is
precisely when someone needs the value written under the key *before* that. For a mission-driven
organization with no dedicated security engineer, that failure is invisible right up until it is a
compliance incident, and by then it's unrecoverable: the plaintext is gone, not just hard to find.

This is the sector's actual risk profile, not a hypothetical: small nonprofits are frequently
targeted *because* attackers expect weaker controls and less monitoring than at large
organizations, PCI DSS 4.0 non-compliance exposes exactly this kind of donor-payment data to breach
risk, and studies cited in 2026 nonprofit-security guidance show donors measurably reduce giving to
organizations that suffer a publicized breach — meaning a cryptographic-hygiene gap doesn't just
risk data, it risks the mission's funding. MJ already ships a real field-level encryption engine
with versioned keys, key rotation, and pluggable key sources (env var, config file, Azure Key
Vault, AWS KMS) — a genuinely solid foundation most platforms this size don't bother building at
all. This proposal closes the one structural gap in it that turns "we rotated our keys" from a
guarantee into a hope.

## What already exists (and why this doesn't duplicate it — it closes a specific, found gap)

- **`packages/Encryption`** is real, working infrastructure: `EncryptionEngine` (`Encrypt`/`Decrypt`
  with AEAD support), `EncryptionKeySourceBase` with four provider implementations, and
  `RotateEncryptionKeyAction` that re-encrypts data transactionally and bumps a key's version. This
  proposal does not replace any of it — it fixes exactly the gap the repository's own backlog
  documented this week in **#4580**.
- **The gap is precise.** `RotateEncryptionKeyAction` finds fields to re-encrypt by querying
  `MJ: Entity Fields` for `Encrypt = 1` (`RotateEncryptionKeyAction.ts`) — which only ever finds
  *declared* fields. A value encrypted by calling `EncryptionEngine.Instance.Encrypt()` directly
  (documented as a legitimate, supported pattern for a package that wants to encrypt data without
  taking a runtime dependency on entity-field metadata — exactly what an audit-archive feature in a
  downstream package does today) is invisible to rotation. Worse, the envelope format itself —
  `$ENC$<keyId>$<algorithm>$<iv>$<ciphertext>[$<authTag>]`, per `interfaces.ts` — has no key
  *version* segment, even though `KeyConfiguration.keyVersion` already exists internally
  (`EncryptionEngine.ts:655`, `:807`, `:826`) and is used to select key material *at encryption
  time*. `Decrypt` has no way to know a value predates the current version, so a value silently
  skipped by rotation doesn't just stay on the old key — it becomes permanently unreadable the
  moment rotation completes, with no error at rotation time and no error until the next read.
- **Not the Consent & Data Rights primitive** (`plans/weekly-exploration/2026-08-14/idea-3-*`):
  that proposal governs *who is allowed to hold* a person's data and for how long, a policy
  question answered at the record/field level. This proposal governs whether data that policy
  already permitted to be held *stays cryptographically readable* through the platform's own key
  lifecycle — a mechanical integrity question underneath the policy layer, not a restatement of it.
- **Not the Data Access Sentinel** (`plans/weekly-exploration/2026-09-05/idea-3-*`): that proposal
  detects anomalous *access patterns* to data that's already readable. This proposal is about data
  becoming *unreadable through the platform's own maintenance operation* — a correctness bug in the
  crypto lifecycle, not an access-anomaly question.

## Proposed architecture

### 1. Version the envelope (the fix that helps data already in the database today)

Extend the encrypted-value format to `$ENC$<keyId>$<keyVersion>$<algorithm>$<iv>$<ciphertext>[$<authTag>]`.
`Decrypt` parses the version when present and selects key material for *that* version; when absent
(every value encrypted before this change ships), it falls back to the current version exactly as
it does today — fully backward compatible, no re-encryption required to adopt it. This is the
option the grounding issue itself identifies as "the only one that helps a value already in a
database today," because it makes every future value self-describing regardless of which code path
wrote it, closing the gap for hand-encrypted values without requiring anyone to register them
anywhere.

### 2. `EncryptedColumnRegistry` — make rotation see what it's rotating

A lightweight registry (extending, not replacing, the existing `Encrypt = 1` entity-field
enumeration) that any package can register a column or a non-entity-backed store against at
startup: `EncryptionEngine.RegisterEncryptedColumn(entityName, fieldName, keyId)` for declared
fields (already covered), plus a distinct `RegisterOutOfBandEncryptedStore(descriptor)` for the
audit-archive shape — hand-encrypted values that live outside the `EntityField` model entirely.
`RotateEncryptionKeyAction` enumerates the registry, not just `Encrypt = 1`, and — critically — logs
a named, visible warning for any registered store it could not re-encrypt, rather than the current
silent "rotation reports success and never touched it." Combined with envelope versioning, a
registry gap becomes "these values are still readable on the old key version, here's exactly which
ones" instead of "these values are now permanently gone."

### 3. `EncryptionHealthReport` — an audit surface, not just a fix

A scheduled (via the existing `ScheduledJobEngine`, no new scheduler) sweep that: (a) samples
encrypted values across every known `EncryptionKey` and reports how many distinct versions are
still live in the database — the concrete "how much of our encrypted data is on an old key" number
an auditor or a PCI assessor will eventually ask for; (b) flags any encrypted-looking value
($ENC$-prefixed) that doesn't match a registered column, surfacing exactly the hand-encryption gap
#4580 describes *before* the next rotation, not after; (c) tracks time-since-last-rotation per key
against the org's configured rotation policy, so "we rotate keys annually" is something the system
can actually confirm happened rather than something a departed staff member once set up in a
runbook nobody re-reads.

### UI

An **Encryption Health** admin dashboard (Angular, L2, `scaffold-mj-dashboard` pattern): one row per
`EncryptionKey` showing algorithm, current version, last-rotated date against policy, and a version
distribution bar (how much live data sits on each historical version); a registry coverage panel
listing every registered encrypted column/store plus any detected-but-unregistered `$ENC$` values;
and a one-click "run rotation" action that, post-fix, reports rotation coverage honestly — "412 of
412 registered values re-encrypted, 0 skipped" instead of today's undifferentiated success.

## Phased rollout

1. **Phase 1** — envelope versioning (`Decrypt` gains version-aware key selection, fully backward
   compatible). This alone prevents the *unrecoverable* failure mode; a value rotation missed stays
   readable on its original version even with zero other changes.
2. **Phase 2** — `EncryptedColumnRegistry` (both the declared-field path, which already works via
   `Encrypt = 1`, and the new out-of-band registration path) plus honest rotation-coverage logging.
3. **Phase 3** — `EncryptionHealthReport` scheduled sweep and the Encryption Health dashboard, so the
   coverage and rotation-currency story is visible on an ongoing basis, not just at rotation time.

## Open questions

- **Should out-of-band registration be mandatory or advisory?** A hand-encryption call with no
  registration should probably warn loudly (via `LogStatus`/`LogError`, the pattern already used
  elsewhere in the package) at encrypt time once the registry exists, rather than staying silent
  until the health sweep finds it later — leaning toward warn-now, since that's the cheapest point
  to catch the gap.
- **Retroactive versioning for pre-existing values.** Values encrypted before this ships have no
  version segment and fall back to "current version" on decrypt — correct only as long as no
  rotation has happened since they were written. A one-time backfill pass (stamp the version that
  was current when a value's owning record was last modified, where that's determinable) closes the
  remaining edge case but adds real migration complexity; Phase 1 ships without it and this is
  scoped as a fast-follow if the health report shows it's a live problem for any deployment.
- **Where does the registry live?** A `packages/Encryption`-owned in-memory registry populated at
  package-load time (mirroring how `ClassFactory` registrations already work) avoids a new metadata
  entity for Phase 2, but the Encryption Health dashboard needs a durable read of "what's currently
  registered" across a multi-instance deployment — likely a thin persisted mirror rather than a
  query against in-memory state from whichever instance happens to serve the dashboard request.

## Mockup

See [`mockups/encryption-health-dashboard.html`](./mockups/encryption-health-dashboard.html) — the
Encryption Health dashboard showing per-key version distribution, registry coverage (including a
detected unregistered value), and rotation history. Screenshot:
[`screenshots/idea-2-encryption-health-dashboard.png`](./screenshots/idea-2-encryption-health-dashboard.png).

## Sources

- MemberJunction repo issue **#4580** ("Key rotation skips hand-encrypted columns, and the
  ciphertext envelope records no key version to detect it") — filed 2026-09-18, open, includes the
  exact envelope format, the `RotateEncryptionKeyAction` enumeration logic, and the real downstream
  use case (an audit archive in `bizapps-common#147`) that exposed the gap. The primary grounding
  for this proposal; both "directions" it proposes are adopted here as complementary phases rather
  than alternatives.
- Internal analysis (this exploration, 2026-09-19): direct reading of
  `packages/Encryption/src/interfaces.ts`, `EncryptionEngine.ts`, and
  `actions/RotateEncryptionKeyAction.ts`.
- ["PCI Compliance for Nonprofits: The 2026 Guide"](https://www.engagingnetworks.net/blog/pci-compliance-nonprofit-guide/)
  and ["Nonprofit Donor Data Security: The Complete Guide for 2026"](https://stratuslive.com/blog/nonprofit-donor-data-security-guide/) —
  2026 sector guidance on PCI DSS 4.0 key-rotation documentation expectations, the finding that
  small nonprofits are frequently targeted for their weaker controls, and that publicized breaches
  measurably reduce donor giving.
