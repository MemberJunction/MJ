---
"@memberjunction/codegen-lib": patch
---

fix(codegen): two robustness fixes that surfaced under large schemas

1. Native geo-field detection now excludes virtual fields. The view-introspection pass synthesizes virtual `__mj_Latitude`/`__mj_Longitude` EntityField rows that an in-file UPDATE intentionally tags with `ExtendedType=GeoLatitude/Longitude`. Without this fix, the next view regeneration mistook those tags for real native columns, switched to native-path DDL, and tried to `SELECT e.__mj_Longitude` from the underlying table — which doesn't have that column. CodeGen drops the existing view before recreating, so the failed CREATE left the entity with no view at all, cascading into broken stored procs. Native-DDL detection now requires `ExtendedType=Geo*` AND `IsVirtual=false`.

2. Related-entity tabs are now capped per generated form. Salesforce supertype entities (User, Account, Contact) carry 1000+ inbound FKs; emitting one collapsible panel per FK blew past TypeScript's template-checker complexity limit (TS2563). Default cap is 100, configurable via `MJ_CODEGEN_MAX_RELATED_ENTITY_TABS`. Truncation logged loudly.
