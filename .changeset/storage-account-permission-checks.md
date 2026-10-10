---
"@memberjunction/integration-test-suite": patch
---

Add storage checks ST7 (an unknown account is refused with the same access-denied message as a restricted one) and ST8 (on a fixture account: zero permission rows are open, a role restriction refuses the seeded no-grant user while the context user passes, CanWrite is decided separately, and a grant added or revoked mid-check is seen on the next call; fixture rows are deleted and asserted gone). The storage bundle count is now 8.
