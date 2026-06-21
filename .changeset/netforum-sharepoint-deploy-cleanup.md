---
"@memberjunction/integration-connectors": minor
---

Clean-deploy metadata for the NetForum and SharePoint connectors. Add the baseline Integration `primaryKey` to each per-folder connector (so `mj sync push` updates the surviving baked Integration instead of inserting a duplicate — avoids the `UQ_Integration_Name` collision), add delete-seeds that `deleteRecord` the old baked IOs (18 NetForum + 13 SharePoint, keyed on their deterministic baseline IDs), and remove the leftover flat-file duplicates (`.netforum.json` / `.sharepoint.json` — per-folder is canonical). Mirrors the existing GrowthZone/iMIS/Nimble/PropFuel/Salesforce clean-deploy pattern so a fresh install deploys these two connectors without collisions or orphaned objects.
