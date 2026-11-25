---
"@memberjunction/storage": patch
"@memberjunction/ai-agents": patch
"@memberjunction/ai-mcp-server": patch
"@memberjunction/core-actions": patch
"@memberjunction/ng-dashboards": patch
"@memberjunction/mobile-app": patch
"@memberjunction/server": patch
"@memberjunction/actions-bizapps-social": patch
---

Fix escaping order in string handling flagged by CodeQL: Google Drive queries escape backslashes before quotes, and folder lookups, file-type filters and provider-specific values are escaped too (a name with a quote no longer breaks the query), skill frontmatter and `WWW-Authenticate` descriptions escape backslashes, Component Studio emits valid accessors for non-identifier display fields and quotes field names as string literals, HTML entity decoders decode each entity once (`&amp;lt;` stays `&lt;`), the mobile HTML renderer drops out-of-range numeric entities instead of throwing, new-user domain patterns treat regex metacharacters literally, and two no-op replaces in the LinkedIn article action are removed.
