---
"@memberjunction/ng-explorer-core": patch
"@memberjunction/ng-shared": patch
"@memberjunction/ng-bootstrap": patch
"@memberjunction/ng-bootstrap-lite": patch
"@memberjunction/ng-explorer-service-worker": patch
"@memberjunction/ng-base-forms": patch
"@memberjunction/ng-ui-components": patch
---

Align the Angular toolchain on the current 21.x patch line: framework packages 21.1.3 → 21.2.22,
CLI/builders 21.1.3 → 21.2.23, CDK 21.1.3 → 21.2.14, ng-packagr → 21.2.7, PrimeNG 21.1.1 → 21.1.9.

This is a patch-level move inside the supported Angular 21 LTS line, not a framework migration.
It closes every open Angular security advisory on the repository — fifteen distinct GHSAs
(i18n and template-sanitizer XSS bypasses, service-worker header leakage and credential
stripping, HttpTransferCache cross-request leakage, and formatDate/number-format DoS), all fixed
in 21.2.19 or earlier — which together accounted for 438 of the 749 open Dependabot alerts.

Every published `@memberjunction/ng-*` package's `@angular/*` peer range moves from `^21.1.3`
(or `^21.0.0`) to `^21.2.22`, so consumers must be on at least that patch. The era-6 platform
manifest in `release-lines.json` records the new pin; era 5 (the certified 5.51 line) is
unchanged.
