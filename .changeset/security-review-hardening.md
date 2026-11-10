---
"@memberjunction/ai-mcp-server": patch
"@memberjunction/ng-ai-test-harness": patch
"@memberjunction/server": patch
"@memberjunction/esignature": patch
"@memberjunction/esignature-docusign": patch
"@memberjunction/esignature-pandadoc": patch
"@memberjunction/sqlserver-dataprovider": patch
"@memberjunction/generic-database-provider": patch
"@memberjunction/ng-auth-services": patch
"@memberjunction/cli": patch
---

Security hardening from the repo-wide review.

- **MCP server**: the system API key is read from `MCP_SYSTEM_API_KEY`, must be at least 16 characters, and the old `MY_API_KEY_FOR_MCP_SERVER` placeholder is refused. API keys are no longer accepted in the URL (`?apiKey=` / `?api_key=`); send a header. Startup no longer logs the first characters of `MJ_API_KEY`.
- **AI test harness**: markdown links render as anchors only for `http`, `https`, `mailto` or scheme-less targets, including when the scheme is hidden behind characters a browser strips.
- **Local dev auth**: a request from a Docker bridge address is no longer treated as loopback just because the server runs in a container. It needs `MJ_DEV_AUTH_ALLOW_DOCKER_BRIDGE=true`, `MJ_DEV_AUTH_BRIDGE_SECRET` (16+ characters) and the same value in the `X-MJ-Dev-Auth-Secret` header. The Explorer local-dev provider sends it from `LOCAL_DEV_BRIDGE_SECRET`, and the citizen-builder container generates one per start.
- **eSignature webhooks**: only a verified event changes a request's status. An account with no webhook secret now gets a 503; `ESIGNATURE_ALLOW_UNVERIFIED_WEBHOOKS=true` restores the old behaviour outside production.
- **SQL Server provider**: the `SaveViewResults` call to `spCreateUserViewRunWithDetail` binds the view ID and email as parameters.
