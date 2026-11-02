---
"@memberjunction/codegen-lib": patch
---

On PostgreSQL, enabling full-text search for an entity now creates its search objects, and no longer fails the CodeGen run.

- **The DDL runs.** The PostgreSQL phased executor had no full-text phase, so the generated search
  function and index were written to a file and never created. A full-text phase now runs between
  CRUD and view permissions. It must follow the view, because the search function returns rows of
  the base view.
- **A missing function no longer fails the run.** The permissions phase granted `EXECUTE` on the
  search function even when it did not exist, and PostgreSQL's `42883` failed the whole run, not
  one entity. Each grant is now guarded by a `pg_proc` existence check and raises a `NOTICE` when
  the function is absent.
- **The stored name matches the function.** `Entity.FullTextSearchFunction` was written back as
  `fnSearch<CodeName>`, the SQL Server name, while PostgreSQL creates `fn_search_<base_table>`. The
  provider now supplies the name, and a stored name that differs is corrected on the next run.
  SQL Server is unaffected.
