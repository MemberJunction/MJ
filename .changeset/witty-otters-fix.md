---
"@memberjunction/generic-database-provider": patch
---

Repair createViewUserSearchSQL.test.ts so its assertions actually run. The test factory was setting EntityInfo's getter-only properties (FirstPrimaryKey, Fields) via Object.assign, which threw TypeError before any assertion executed. Switched to seeding the private _Fields backing store with a synthetic primary-key field so both getters resolve naturally, and corrected each assertion's parenthesization to match the SUT's actual (defensive, pre-existing) per-field paren wrap.
