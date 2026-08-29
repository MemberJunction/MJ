---
"@memberjunction/core": patch
---

Hydrate an IS-A parent with only the columns it owns. Loading an Accounting Company Profile as an entity object used to SetMany the whole child view row onto MJ: Companies, which dumped a field-not-found warning for every profile column at MJAPI boot.
