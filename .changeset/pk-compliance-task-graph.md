---
"@memberjunction/ng-explorer-core": patch
"@memberjunction/ng-conversations": patch
---

Opening a record from the Tasks Command Center now builds its key from the entity's real primary key, so a record whose key isn't a single `ID` column opens, and composite keys work. Opening a workflow step's agent run uses `CompositeKey.FromID` for the `MJ: AI Agent Runs` core entity. This clears the Primary Key Compliance gate that #5878 broke.
