---
"@memberjunction/ng-shared": patch
"@memberjunction/ng-base-application": patch
"@memberjunction/ng-explorer-core": patch
"@memberjunction/ng-dashboards": patch
"@memberjunction/ng-bootstrap": patch
"@memberjunction/ng-bootstrap-lite": patch
---

Fix several entity-record save flow issues in MJ Explorer: re-key the tab and component cache when a "Create New Record" form transitions to a saved record so subsequent new-record clicks open a blank form; correct the URL-segment format used by ResourceRecordSaved so the form no longer fails to reload after save with a doubled-prefix key; wire up the previously no-op tab title refresh after save (including refreshing the Home app's dynamic nav-item label) so the user sees the latest entity name without navigating away.
