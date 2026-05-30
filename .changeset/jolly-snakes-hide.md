---
"@memberjunction/ng-bootstrap": minor
"@memberjunction/ng-auth-services": minor
"@memberjunction/ng-core-entity-forms": minor
"@memberjunction/ng-explorer-core": minor
"@memberjunction/auth-providers": minor
"@memberjunction/communication-engine": minor
"@memberjunction/core-entities": minor
"@memberjunction/server": minor
---

Add magic-link authentication passwordless, single-use, app scoped invite links that sign external users into MJExplorer, confined to one application and a per-link role. MJ issues and validates its own RS256 session tokens (published via JWKS, accepted by the standard auth provider path), so there's no external IdP dependency or per-user IdP cost for the link. Invite scope (app, role, expiry, max uses) is configured per link
