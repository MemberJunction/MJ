---
"@memberjunction/actions-apollo": patch
"@memberjunction/graphql-dataprovider": patch
"@memberjunction/server": patch
"@memberjunction/core": patch
---

- Updated RunView resolver and GraphQL data provider to work with any
  primary key configuration
  - Changed from hardcoded "ID" field to dynamic PrimaryKey array from
    entity metadata
  - Added utility functions for handling primary key values in client code
  - Supports single non-ID primary keys (e.g., ProductID) and composite
    primary keys
  - Fixes compatibility with databases like AdventureWorks that use
    non-standard primary key names
