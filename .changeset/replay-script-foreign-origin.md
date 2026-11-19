---
'@memberjunction/computer-use': patch
'@memberjunction/computer-use-engine': patch
---

A recorded replay script stores URLs on other origins than the app's (for example the Auth0 login pages) as path fragments, so the script replays on any identity-provider tenant and does not contain the tenant name. `RecordTrace` takes an `appOrigin` option (default: the first step's origin), and the Computer Use test driver passes the test's start URL.
