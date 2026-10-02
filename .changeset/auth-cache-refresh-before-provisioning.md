---
"@memberjunction/server": patch
---

Look for an existing user before provisioning a new one, and stop resolving ambiguous logins by row order.

`verifyUserRecord` matches a verified identity to a `User` record by case-insensitive email. Two defects in that path let a single sign-in silently strand a user's entire history.

**1. The cache refresh ran after auto-provisioning instead of before it.** The `updateCacheWhenNotFound` block was gated on `!user` and placed below the `autoCreateNewUsers` block, so it could only execute when creation had already failed or was never attempted — dead code in precisely the case it exists for: a user who is in the database but not yet in this process's `UserCache`. Users provisioned out of band (an admin, an invite, a direct insert) are absent from the cache until it is rebuilt, so the lookup missed and a *second* record was created for someone who already had one. The refresh-and-retry now runs first; auto-provisioning of genuinely new users is unchanged, because the recursive call passes `attemptCacheUpdateIfNeeded=false` and falls through to creation when the refreshed cache still has no match.

**2. `.find()` resolved duplicate emails by cache order.** With two records sharing an email case-insensitively, the login resolved to whichever sat earlier in `UserCache.Instance.Users` — database row order, which changes when the cache is rebuilt. An API restart therefore moved a user onto a different record, and everything user-scoped disappeared together: conversations and artifacts are keyed by `UserID`, shares target a `UserID`, and the profile picture (`UserImageURL`) lives on the `User` row itself. It reads as catastrophic data loss while nothing has been deleted, and it reverts if the order flips back. Matching now collects all candidates, tie-breaks on a stable ID sort so every process and every restart agree, and logs an error naming each colliding record plus the query that finds every affected user.

Both were observed in production: three users created within 30 seconds of each other, a duplicate for one of them created on that user's next sign-in seven hours later, and an API restart four weeks on moving them to the empty record mid-week.

Operators can find existing collisions with:

```sql
SELECT LOWER(Email), COUNT(*) FROM __mj.[User] GROUP BY LOWER(Email) HAVING COUNT(*) > 1;
```

Note that deactivating a duplicate does not remove it from the lookup — the match does not check `IsActive` — so remediation must change the duplicate's email.
