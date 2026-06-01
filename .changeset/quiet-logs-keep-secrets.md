---
"@memberjunction/server": patch
---

Redact GraphQL variables logging to prevent secret leaks (#2638). Strips the
`variables` field from the always-on request log so credentials submitted via
GraphQL mutations (HubSpot tokens, API keys, etc.) no longer reach stdout in
default config. Adds an opt-in verbose-echo path behind
`loggingSettings.graphql.logVariables` (env override `MJ_LOG_GRAPHQL_VARIABLES`,
default off) that emits a separate redacted variables block per root resolver
call via a new type-graphql middleware. Redaction is metadata-driven via
`EntityFieldInfo.Encrypt`; custom resolvers get a new `@NoLog` decorator
(parameter + property forms) for non-metadata-bound args. Also tightens
`GetDataResolver` and `MCPResolver` log sites to stop emitting user-supplied
payloads.
