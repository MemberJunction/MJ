---
"@memberjunction/open-app-engine": patch
"@memberjunction/installer": patch
"@memberjunction/cli": patch
---

`mj app install` is more robust for clean installs: package installs run asynchronously with a 30-minute default ceiling (override with `MJ_APP_PACKAGE_INSTALL_TIMEOUT_MS`) instead of a blocking 5-minute `execFileSync`; transient GitHub failures (connection resets, timeouts, 502/503/504) are retried with backoff instead of failing the whole dependency chain; and an app left Disabled because its packages did not install is reported as such — with the real remedy — instead of "Successfully installed" and an "npm auth" guess.

`mj install --yes` no longer warns that config files were "created with default/empty values" when every value was supplied; it now names only the required connection values that are actually unset.

On macOS, `mj install`, `mj app install`, `mj app upgrade` and `mj migrate` keep the machine awake while they run (a `caffeinate` assertion tied to the CLI process; `MJ_ALLOW_SLEEP=1` opts out). Sleeping mid-install paused the local database and every connection, and on wake in-flight migration batches reported spurious 300-second timeouts and downloads reported `ECONNRESET` — the cause of every intermittent chained-install failure seen in clean-install testing.
