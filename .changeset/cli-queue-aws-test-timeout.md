---
"@memberjunction/cli": patch
---

Raise the timeout on the `mj queue` AWS-registration unit test to 120 seconds; its cold import exceeded 30 seconds on the release gate runner.
