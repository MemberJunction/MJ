---
'@memberjunction/ai-mcp-server': patch
'@memberjunction/core-actions': patch
'@memberjunction/generic-database-provider': patch
'@memberjunction/export-engine': patch
'@memberjunction/server': patch
---

Security hardening sweep: Data Mapper refuses templates that reach JavaScript internals (SSTI defense) and drops nunjucks function globals; HTTP Request action strips credential headers on cross-origin redirects; /media serves only passive content types inline (attachment otherwise) and adds Referrer-Policy: no-referrer; /media/upload-stage verifies the upload token before buffering the request body; REST transport now enforces API-key scopes (entity:create/update/delete, view:run, view:batch) like GraphQL, including on the entity list route; multi-tenancy header mode rejects requests that omit the tenant header instead of degrading to an unscoped session (admin roles and the system user exempt); MCP server stops accepting API keys from query strings and compares the system key in constant time; CSV export neutralizes leading formula characters in text cells (signed numbers stay as they are); user-search terms refuse structural SQL characters when a UserSearchParamFormatAPI format splices the term outside a string literal.
