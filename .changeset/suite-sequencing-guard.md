---
"@memberjunction/integration-test-suite": patch
---

Enforce the #3251 deterministic-suite ordering invariant with a test rather than a convention: every
server-transport bundle must sequence before every client-transport one, so a client-bundle failure
is unambiguously a client-seam failure and not fallout from server-transport state left behind
earlier in the run.

The rule had already been violated once (IT71 at sequence 34, tied with the first client bundle) and
went unnoticed until a program wrap-up. Three companion assertions stop the interesting one passing
vacuously — non-empty membership, a declared transport on every member, and a real sequence on every
member. Verified by reproducing the original mistake and confirming it fails.
