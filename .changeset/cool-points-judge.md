---
"@memberjunction/codegen-lib": patch
---

CodeGen SQL Dependency Ordering and Cascade Delete Fixes Fix critical CodeGen bugs causing SQL dependency errors and preventing cascade delete regeneration for modified entities.
- Add TempBatchFile utility class for dependency-ordered SQL execution
- Temp batch files maintain CodeGen log order (correct dependency order) for execution
- Combined \_all_entities.sql files remain alphabetical for clean git diffs
- Add SQL Server severity handling with -V 17 flag (only fail on severity ≥17 system errors)
- Fix EntityField sequence collisions with dynamic offset based on max existing sequence per entity
- Skip self-referential FKs in cascade delete dependency analysis
Enhance topological sort to handle circular dependencies gracefully
- Add proper cleanup of temp files on success and error paths
