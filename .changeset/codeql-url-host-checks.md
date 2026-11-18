---
"@memberjunction/core-actions": patch
"@memberjunction/ai-mcp-server": patch
"@memberjunction/open-app-engine": patch
"@memberjunction/ng-file-storage": patch
---

Check hosts by parsed hostname instead of substring, as CodeQL flagged: the Teams webhook action accepts only https URLs on `webhook.office.com` or its subdomains (a URL with that text in its path or query no longer passes), and Azure AD issuer, Azure SQL host and Azure Blob upload detection match the host name itself.
