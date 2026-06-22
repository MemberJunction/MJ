---
"@memberjunction/integration-connectors": minor
"@memberjunction/integration-engine": patch
---

Add MemberSuite (AMS) integration connector — REST API v2, 196 objects / ~6,000 fields extracted credential-free from MemberSuite's public module swaggers (CRM/membership/events/fundraising/financial). Signed-request auth via auth-helpers, narrow Activity/Certification write surface, runtime custom-field/saved-search discovery, full-record pass-through. Adds the `MemberSuite API` credential type. Also adds the additive `OAuth2TokenRequest.ExtraParams` field required by the existing RhythmConnector (engine patch).
