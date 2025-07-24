---
"@memberjunction/graphql-dataprovider": minor
"@memberjunction/server": minor
---

This update brings the GraphQLSystemUserClient to feature parity with the
standard GraphQLDataProvider by adding full Parameters support for
templated queries, pagination capabilities, and the missing
GetQueryDataByNameSystemUser resolver.

Key Features:

- Parameters support for templated queries (enabling AI cost calculations)
- MaxRows and StartRow pagination support
- Complete resolver coverage for system user operations
- Fixed TypeScript compilation errors with missing TotalRowCount fields
- Updated both GetQueryDataSystemUser and GetQueryDataByNameSystemUser
  methods with full parameter support

  - Added missing GetQueryDataByNameSystemUser resolver with proper
    @RequireSystemUser decoration
  - Fixed error handling cases to include required TotalRowCount field
  - Updated GraphQL query strings to include TotalRowCount and
    AppliedParameters fields

  This enables system user clients to leverage MemberJunction v2.74's
  templated query functionality, particularly important for AI cost tracking
  and other parameterized operations.
