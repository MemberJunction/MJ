---
"@memberjunction/graphql-dataprovider": patch
"@memberjunction/global": patch
"@memberjunction/integration-engine": patch
"@memberjunction/actions": patch
"@memberjunction/ai-mcp-client": patch
"@memberjunction/storage": patch
---

Stop error diagnostics from carrying credentials into the log.

**GraphQL transport.** `graphql-request`'s `ClientError` serialises the originating request — variables included — into its own `message` at construction, and V8 then embeds that message in `stack`. A mutation carrying a secret therefore holds it in three places on the error at once, and `ExecuteGQL` logged the object directly before calling `LogError(e)`, which stringifies it and re-emits the same payload. Redacting `request.variables` on a copy reaches none of that; spreading the error to redact it also drops `message` and `stack`, since both are non-enumerable on `Error`.

New `SanitizeGraphQLError` builds a fresh diagnostic object from an allowlist of safe fields instead — re-deriving the message from `response.errors[0]` and stripping the header line off `stack` — so a change to the upstream error shape cannot silently widen what is logged. Response status, GraphQL errors, error code, query text and stack frames are all preserved; only values are withheld, and the log gains the variables' *shape* (key names and value types, never values) so a redacted failure stays diagnosable. The caught error is never mutated, so JWT-expiry handling and every caller of the rethrown error are unaffected.

`GraphQLProviderConfigData.LogVariableValues` (default `false`) opts in to logging values during development, mirroring the server's existing `loggingSettings.graphql.logVariables` tier.

**OAuth2 token endpoints.** A token endpoint is the one call where a credential arrives in a response *body*. Five sites echoed that body into an `Error` message: the Integration and Actions OAuth2 managers, the MCP client's `TokenManager` and `ClientRegistration`, and the SharePoint storage driver's token refresh. RFC 6749 §5.2 says an error response carries no token, which makes this look safe — but token endpoints routinely echo the failing request back, and that request carries `client_secret` and the refresh token. The Integration site was reached on HTTP 200 as well, whenever the token sat somewhere its parser did not look, in which case the echoed body *was* the access token.

New `describeTokenEndpointFailure` in `@memberjunction/global`, shared by all five, surfaces only `error` and `error_description` and withholds everything else, including bodies that fail to parse.

No API removals and no behaviour change for callers: the only observable differences are the contents of log lines and the text of token-endpoint error messages.
