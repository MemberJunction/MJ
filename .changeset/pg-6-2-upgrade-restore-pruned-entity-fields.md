---
"@memberjunction/core": patch
---

Fix PostgreSQL upgrades from 6.1.x to 6.2 failing in `V202611012253__v6.2.x__Metadata_Sync` with `FK_QueryField_SourceEntityField` (#6557). The migration now restores the 27 virtual EntityField rows that `R__RefreshMetadata` removes at the end of a 6.1.x run.
