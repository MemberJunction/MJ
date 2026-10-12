---
"@memberjunction/open-app-engine": patch
"@memberjunction/installer": patch
---

`mj app install` is more robust for clean installs: package installs run asynchronously with a 30-minute default ceiling (override with `MJ_APP_PACKAGE_INSTALL_TIMEOUT_MS`) instead of a blocking 5-minute `execFileSync`; transient GitHub failures (connection resets, timeouts, 502/503/504) are retried with backoff instead of failing the whole dependency chain; and an app left Disabled because its packages did not install is reported as such — with the real remedy — instead of "Successfully installed" and an "npm auth" guess.

`mj install --yes` no longer warns that config files were "created with default/empty values" when every value was supplied; it now names only the required connection values that are actually unset.
