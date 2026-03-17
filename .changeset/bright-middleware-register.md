---
"@memberjunction/core": patch
"@memberjunction/global": patch
"@memberjunction/server": patch
"@memberjunction/server-bootstrap": patch
---

Replace HookRegistry and DynamicPackageLoader with @RegisterClass + ClassFactory middleware pattern, and add GetResolverPaths() to BaseServerMiddleware for auto-discovery of middleware-contributed GraphQL resolvers
