---
"@memberjunction/ng-dashboards": patch
"@memberjunction/ng-entity-viewer": patch
---

Fix view-config drawer overlapping the dashboard header in Data Explorer: stack `.content-body` above `.content-header`, position the sliding panel below the 60px shell header, and update view-workspace flex sizing to fill the new flex row.
