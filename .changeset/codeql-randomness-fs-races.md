---
"@memberjunction/open-app-engine": patch
"@memberjunction/core-actions": patch
"@memberjunction/telephony-adapters": patch
"@memberjunction/ai-agent-harness": patch
"@memberjunction/server": patch
---

Fix CodeQL insecure-randomness and filesystem-race findings in runtime code (#5574).

- **Open App installs** download migration and teardown SQL into a fresh private temp directory (`mkdtempSync`) instead of a predictable `mj-app-<name>-<timestamp>` path that reused any directory already there.
- **Password generation** picks and shuffles characters with `crypto.randomInt`, removing the modulo bias of `randomBytes % length`.
- **Number pool `Random` selection** and the **Pi harness session id** use `node:crypto` instead of `Math.random`.
- **SQL log reads** drop the existence check before reading; a missing file is still reported through the existing `ENOENT` handling.
