---
"@memberjunction/ng-artifacts": patch
---

The spreadsheet preview now uses SheetJS 0.20.3 (from the SheetJS CDN, pinned with an integrity hash in the lockfile) instead of 0.18.5, which has a prototype-pollution and a ReDoS advisory. The interactive-component library registry reports `xlsx` 0.20.3.
