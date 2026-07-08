---
"@memberjunction/server": patch
---

Fix magic-link redemption on PostgreSQL. The atomic single-use consume SQL was T-SQL-only, so redemption on PG failed with a syntax error and minted no session. buildConsumeInviteSQL is now dialect-aware
