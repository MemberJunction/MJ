---
"@memberjunction/core": minor
"@memberjunction/core-entities": minor
"@memberjunction/server": minor
"@memberjunction/sqlserver-dataprovider": minor
---

feat: implement query audit logging and TTL-based caching

Add comprehensive audit logging and caching capabilities to the
MemberJunction Query system:

- Add ForceAuditLog and AuditLogDescription parameters to RunQuery for
  granular audit control
- Implement TTL-based result caching with LRU eviction strategy for
  improved performance
- Add cache configuration columns to Query and QueryCategory entities
- Support category-level cache configuration inheritance
- Update GraphQL resolvers to handle new audit and cache fields
- Refactor RunQuery method into logical helper methods for better
  maintainability
- Follow established RunView pattern for fire-and-forget audit logging
