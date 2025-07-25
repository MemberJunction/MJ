---
"@memberjunction/ng-core-entity-forms": patch
"@memberjunction/core": patch
"@memberjunction/sqlserver-dataprovider": patch
---

feat: add hierarchical CategoryName support for query lookup

Adds support for hierarchical category paths in query lookup operations.
The CategoryName parameter now accepts filesystem-like paths (e.g.,
"/MJ/AI/Agents/") that walk through the QueryCategory parent-child
relationships.

### New Features

- **Hierarchical Path Resolution**: CategoryName now supports paths like
  "/MJ/AI/Agents/" that are parsed by splitting on "/" and walking down the
  category hierarchy using ParentID relationships
- **CategoryPath Property**: Added CategoryPath getter to QueryInfo class
  that returns the full hierarchical path for any query
- **Backward Compatibility**: Existing simple CategoryName usage (e.g.,
  "Agents") continues to work unchanged
