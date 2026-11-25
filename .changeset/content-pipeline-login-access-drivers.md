---
"@memberjunction/content-pipeline": minor
"@memberjunction/content-pipeline-base": minor
"@memberjunction/server-bootstrap": minor
---

Two login Access drivers open a cookie session for a members-only site, with the user name and password from MJ: Credentials (mapped by `Configuration.AccessCredentials`, as for `Credential`) and the rest from the source's settings.

`FormLogin` posts the login form (optionally after a GET of the login page for its cookies and hidden fields, as a form or JSON, with `LoginUsernameField` / `LoginPasswordField` / `LoginExtraFields`, and `LoginSuccessMarker` / `LoginFailureMarker`), following redirects through the SSRF guard and keeping their cookies. `BrowserLogin` drives the login page in the Headless renderer's browser (pre-click, user name, continue, password, submit, confirm, success selector, cookie marker). Both return `Headers.Cookie` for `SessionOrigins` (default the source's origin), expiring with the first cookie or `SessionTtlMinutes`. `BrowserLogin` checks every redirect hop against the SSRF guard (a redirected navigation becomes a checked navigation; other requests' redirects are followed hop by hop). It also puts the browser's storage state, cut to the session's origins (their cookies and `localStorage`; an identity provider's own cookies stay behind), in `AccessArtifact.Extensions.StorageState` (`SessionStorageState` in content-pipeline-base), and the `Headless` renderer restores it, cookies and localStorage, into each page on the session's origins. The server-bootstrap class manifest registers both drivers.
