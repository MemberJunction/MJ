---
'@memberjunction/communication-ms-graph': patch
---

MS Graph: a stored Azure Service Principal credential could not drive a single operation.

`azure-service-principal.schema.json` declares three fields and requires all three. `resolveCredentials`
validated **four**, demanding an `accountEmail` the credential type has no way to carry — so any
credential created through the Credentials engine failed with
`Missing required credential: accountEmail` before doing any work.

It went unnoticed because `resolveCredentialValue` falls back to `AZURE_ACCOUNT_EMAIL`, so a host that
sets that variable never sees it. The failure appears exactly when a credential is meant to stand on
its own — which is what the Credentials engine is for, and is now reachable deliberately through
`disableEnvironmentFallback: true`.

**The guard was wrong, not the schema.** A mailbox is not part of a service principal: the same
credential legitimately drives Azure OpenAI and Blob Storage, where a mailbox means nothing, and the
type's own description says so. The provider's own interface already declared `accountEmail?: string`
— only the validator forced it. And almost nothing needs it: every read path already treated it as a
last-resort fallback behind `params.Identifier` or `ContextData.Email`, so an operation that named
its own mailbox was refused over a field it would never have read.

`accountEmail` is now a DEFAULT, resolved per operation:

- `resolveCredentials` validates the three authentication fields, which is what a principal is.
- A new `resolveMailbox(operation, creds, ...preferred)` picks the first mailbox the request named and
  falls back to `accountEmail`, so anything specific to a request outranks the deployment default.
- When nothing resolves, it refuses with a message naming the operation and both ways to supply one.

**It refuses rather than returning `undefined` on purpose.** Every caller interpolates the result into
a Graph path, so `undefined` would put the literal string "undefined" in the URL and come back as a
404 that reads like "message not found" — a wrong answer wearing the costume of a real one. This
package does not enable `strictNullChecks`, so nothing would have caught that: not the compiler, and
not a test asserting only on success.

Three `catch` blocks (`SendSingleMessage`, `ForwardMessage`, `CreateDraft`) discarded the exception's
message entirely and now include it. Harmless while nothing inside had anything specific to say; the
mailbox guard does.

Verified against a live tenant with a three-field credential and the environment fallback disabled: an
explicit `Identifier` reads mail, no mailbox anywhere refuses with the full message, `accountEmail`
alone works as the default, and a request-supplied mailbox beats that default.
