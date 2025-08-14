---
"@memberjunction/sqlserver-dataprovider": patch
"@memberjunction/graphql-dataprovider": patch
"@memberjunction/server": patch
---

Fix RunView pagination implementation

- Added StartRow parameter support for server-side pagination
- Fixed SQL generation to prevent TOP and OFFSET/FETCH conflicts
- Improved total row count calculation for paginated queries
- Ensures proper parameter passing through GraphQL to SQL layer

Fixes issue where pagination parameters were lost in the RunView processing chain, preventing proper
server-side pagination from working.
