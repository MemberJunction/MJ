---
"@memberjunction/core": minor
"@memberjunction/ng-base-forms": minor
---

L3 Form Chrome Rules can now pin an admin Title on a related entity or contribution. The column is nullable and keyed by RelatedEntityID / ContributionKey, so a site-specific rail label ("Pmts") survives an OpenApp upgrade that changes the shipped DisplayName. Custom forms that hide related entities also stop inventing leftover More groups for unbaked relationships.
