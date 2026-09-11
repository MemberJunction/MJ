---
"@memberjunction/credentials": minor
"@memberjunction/ai-prompts": patch
---

Enforce credential expiration in `CredentialEngine`.

`Credential.ExpiresAt` has existed since v2.129, the credential editor lets you set it, and the Credentials dashboard counts expired and expiring-soon credentials. Nothing enforced it. `CredentialEngine.getCredential()` filtered on `IsActive` only, so an expired credential resolved and was handed to callers exactly like a live one — despite the column's own description promising that "expired credentials are treated as inactive". Operators could see an expiry date in the UI and reasonably believe it meant something.

**Enforcement.** Expiry is now evaluated in `getCredential()`, at resolution time rather than at cache-load time — the engine caches credential rows for the life of the process, so a credential that lapses between two calls is caught on the second call rather than staying live until the next refresh. The check runs before the values are decrypted, so a blocked credential never reaches the caller.

**Policy** is configurable via `CredentialEngine.Instance.ExpirationConfig`:

- `policy: 'block'` (default) throws `CredentialExpiredError`.
- `policy: 'warn'` returns the credential flagged and logged — an escape hatch for cleaning up stale expiry dates, not a safe steady state.
- `graceMs` (default `0`) lets a `'block'` policy tolerate a short, noisy overrun where a hard cutoff at the expiry instant is riskier than the overrun. Grace never changes the reported status: a credential inside grace still reports `expired`, so dashboards and audit logs stay truthful.
- `warningWindowMs` (default 30 days, matching the dashboard's existing "expiring soon" KPI window) controls when a credential begins reporting `expiring-soon` and warning. It never blocks.

**Typed errors.** `CredentialExpiredError` and `CredentialNotFoundError` (both extending `CredentialResolutionError`) let callers tell a credential that needs rotating from one that does not exist — previously both surfaced as "Credential not found", sending operators hunting for a record that was sitting right there. `CredentialNotFoundError`'s message is byte-identical to the string thrown before, so callers matching on message text keep working.

**Lookup semantics.** `getCredentialByName()` and `getDefaultCredentialForType()` now exclude expired credentials. `getCredentialById()` deliberately does not: addressing by primary key is an exact request, and rotation tooling must be able to load an expired record in order to replace it. The same need is served per-call by the new `expirationPolicy` option.

**Consolidation.** `AIPromptRunner` had hand-rolled `new Date(c.ExpiresAt) < new Date()` comparisons in two places and none on its resolve-by-ID path — the inconsistency that having no shared primitive produces. Both now call `CredentialEngine.getExpirationStatus()`, so the failover path honors the same window and grace period the engine applies.

`ResolvedCredential` gains `expirationStatus` and `daysUntilExpiration`, and every resolution records its expiration status in the audit log so an auditor can answer "was any credential used while expired?".

⚠️ **Behavior change.** Under the default `'block'` policy, an expired credential that previously resolved now throws. Any deployment carrying stale `ExpiresAt` values will see failures on upgrade where it previously saw silent success. This is the intended correction — the credential was already expired and the platform was ignoring it — but it is worth an inventory query before rolling out:

```sql
SELECT ID, Name, ExpiresAt FROM __mj.Credential
WHERE IsActive = 1 AND ExpiresAt IS NOT NULL AND ExpiresAt <= SYSDATETIMEOFFSET();
```

Deployments that need a staged rollout can start on `policy: 'warn'` (or a non-zero `graceMs`) and tighten once that query comes back empty.
