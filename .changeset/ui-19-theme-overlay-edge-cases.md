---
"@memberjunction/ng-shared-generic": patch
"@memberjunction/ng-dashboards": patch
---

Theme overlay edge cases: re-applying a restored but unregistered brand overlay restores it instead of leaving a Theme Studio draft painted, the Studio never records its own preview as the overlay to return to, and the theme service records the resolved page background for a head pre-paint script so dark-mode users no longer see a light first frame in production builds.
