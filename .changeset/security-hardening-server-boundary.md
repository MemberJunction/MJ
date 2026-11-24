---
"@memberjunction/ai-mcp-server": patch
"@memberjunction/api-keys": patch
"@memberjunction/cli": patch
"@memberjunction/core-actions": patch
"@memberjunction/esignature": patch
"@memberjunction/ng-ai-test-harness": patch
"@memberjunction/server": patch
---

Security hardening across MCP Server, MJServer resolvers/dev-auth, eSignature webhooks, CoreActions, API keys, and Docker configurations.

- MCP Server: auth mode `none` is refused when `NODE_ENV=production` and binds strictly to `127.0.0.1` otherwise; session IDs are logged as truncated prefixes; API keys in URL query parameters log a warning and are ignored; API-key scope lookup escapes `apiKeyId` and passes `systemUser` as `contextUser`; OAuth `user_not_found` / `user_inactive` resolutions return a generic 403 `Access denied` without echoing the probed email.
- MJServer: `CheckEntityPermissionsSystemUser` is gated with `@RequireSystemUser()`; `UserFavoriteResolver` verifies that the requested `UserID` matches the caller (system user excepted); `SqlLoggingConfigResolver` rejects `fileName`s containing path separators or `..` and validates containment with `path.relative`; `localDevAuth` trusts Docker bridge source IPs only when `MJ_DEV_AUTH_ALLOW_DOCKER_BRIDGE=true` is explicitly set (never inferred from `/.dockerenv`).
- eSignature: webhooks where `VerifyWebhookSignature === 'NotConfigured'` are refused by default unless `MJ_ESIGNATURE_ALLOW_UNVERIFIED_WEBHOOKS=true` is explicitly enabled.
- CoreActions & APIKeys: `URLLinkValidatorAction.checkSSL` routes through `SafeFetch` for SSRF protection on redirects; `APIKeyEngine` escapes `apiKey.UserID` in its `RunView` filter.
- Angular AI Test Harness: `RenderMarkdown` restricts anchor emission to `http:`, `https:`, and `mailto:` URLs with `rel="noopener noreferrer"` before `bypassSecurityTrustHtml`.
- Docker: MJAPI image no longer bakes `root:Docker!` into image layers (set at container startup only when `WEBSITE_INSTANCE_ID` starts Azure App Service `sshd`); regression compose binds test SQL Server port `11433` to `127.0.0.1`.
