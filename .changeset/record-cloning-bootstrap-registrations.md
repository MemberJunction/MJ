---
"@memberjunction/ng-bootstrap-lite": patch
"@memberjunction/server-bootstrap": patch
"@memberjunction/server-bootstrap-lite": patch
---

Register the record-cloning classes at startup: the server bootstraps depend on `@memberjunction/record-cloning` and load its `RecordClone.*` remote operations (and, through them, the `Clone` record-process work type). All three register the new `MJ: Record Clone Logs` and `MJ: Record Clone Log Items` entity classes.
