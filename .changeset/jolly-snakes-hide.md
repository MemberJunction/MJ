---
"@memberjunction/ng-bootstrap": minor
"@memberjunction/ng-auth-services": minor
"@memberjunction/ng-core-entity-forms": minor
"@memberjunction/ng-explorer-core": minor
"@memberjunction/auth-providers": minor
"@memberjunction/communication-engine": minor
"@memberjunction/core-entities": minor
"@memberjunction/server": minor
"@memberjunction/core": patch
---

Add magic-link authentication passwordless, single-use, app scoped invite links that sign external users into MJExplorer, confined to one application and a per-link role. MJ issues and validates its own RS256 session tokens (published via JWKS, accepted by the standard auth provider path), so there's no external IdP dependency or per-user IdP cost for the link. Invite scope (app, role, expiry, max uses) is configured per link

BaseEngine also now degrades gracefully under restricted roles: a config load that fails because the current user lacks Read permission is treated as a permanent condition — the property loads empty and the engine is marked loaded — instead of looping on "not marking as loaded", which previously hung the MJExplorer shell for least-privilege users (e.g. magic-link guests). Only genuinely transient failures (network, server restart) keep retrying.
