---
"@memberjunction/core": minor
"@memberjunction/core-entities": minor
"@memberjunction/graphql-dataprovider": minor
"@memberjunction/codegen-lib": minor
"@memberjunction/server-extensions-core": minor
"@memberjunction/server": minor
---

Enhance `BaseRemotableOperation` with transport context (`requestOrigin`, `clientIp`, `sessionId`, `apiKeyHash`), 3-arg `Authorize(input, user, context)`, 4-arg CodeGen `InternalExecute`, structured `RemoteOperationError`, end-to-end `ContractFingerprint` validation, and opt-in Agent/MCP tool discovery; extend `ServerExtensionServiceRegistry` and `MagicLinkService` with programmatic invite management (`RedirectUrl` with RS256 binding, `SendEmail` control, `RevokeInvite`, `UpdateInviteExpiry`, `VerifySessionToken`) and host runtime services (`CreateIsolatedProvider`, `GetSystemUser`, `ResolvePrincipal`).
