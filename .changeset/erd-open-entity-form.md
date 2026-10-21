---
"@memberjunction/ng-dashboards": patch
---

Entity Admin (ERD): the details panel's Open button now opens the entity's form. The dashboard navigates through NavigationService instead of emitting `OpenEntityRecord`, which the Admin app's host never subscribed to.
