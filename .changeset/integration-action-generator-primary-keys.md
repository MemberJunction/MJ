---
"@memberjunction/integration-engine": patch
---

`ActionMetadataGenerator` writes a `primaryKey` on every generated Action, Action Param and Action Result Code. Before, its records carried only `fields`, so `mj sync push` inserted every action again on each push of regenerated metadata. A new optional `ExistingActionRecords` config takes the previously generated records and reuses their IDs: actions match by `Name`, params by `Name` + `Type`, result codes by `ResultCode`. A regenerated file then updates the rows it created before. No ID is handed out twice.
