---
"@memberjunction/a2aserver": patch
"@memberjunction/actions-apollo": patch
"@memberjunction/ai": patch
"@memberjunction/ai-agents": patch
"@memberjunction/ai-bridge-base": patch
"@memberjunction/ai-bridge-discord": patch
"@memberjunction/ai-bridge-googlemeet": patch
"@memberjunction/ai-bridge-livekit": patch
"@memberjunction/ai-bridge-ringcentral": patch
"@memberjunction/ai-bridge-server": patch
"@memberjunction/ai-bridge-slack": patch
"@memberjunction/ai-bridge-teams": patch
"@memberjunction/ai-bridge-twilio": patch
"@memberjunction/ai-bridge-vonage": patch
"@memberjunction/ai-bridge-webex": patch
"@memberjunction/ai-bridge-zoom": patch
"@memberjunction/ai-cli": patch
"@memberjunction/ai-core-plus": patch
"@memberjunction/ai-mcp-client": patch
"@memberjunction/ai-mcp-server": patch
"@memberjunction/ai-prompts": patch
"@memberjunction/ai-vector-sync": patch
"@memberjunction/api-keys": patch
"@memberjunction/auth-providers": patch
"@memberjunction/cli": patch
"@memberjunction/codegen-lib": patch
"@memberjunction/component-registry-server": patch
"@memberjunction/content-autotagging": patch
"@memberjunction/conversations-runtime": patch
"@memberjunction/core": patch
"@memberjunction/core-actions": patch
"@memberjunction/core-entities": patch
"@memberjunction/core-entities-server": patch
"@memberjunction/db-auto-doc": patch
"@memberjunction/esignature": patch
"@memberjunction/global": patch
"@memberjunction/graphql-dataprovider": patch
"@memberjunction/installer": patch
"@memberjunction/integration-engine": patch
"@memberjunction/integration-progress-artifacts": patch
"@memberjunction/integration-test-suite": patch
"@memberjunction/interactive-component-types": patch
"@memberjunction/materialization": patch
"@memberjunction/messaging-adapters": patch
"@memberjunction/metadata-sync": patch
"@memberjunction/mobile-app": patch
"@memberjunction/ng-base-forms": patch
"@memberjunction/ng-credentials": patch
"@memberjunction/predictive-studio": patch
"@memberjunction/query-gen": patch
"@memberjunction/react-linter": patch
"@memberjunction/react-runtime": patch
"@memberjunction/react-test-harness": patch
"@memberjunction/server": patch
"@memberjunction/sql-converter": patch
"@memberjunction/sql-dialect": patch
"@memberjunction/storage": patch
"@memberjunction/telephony-adapters": patch
"@memberjunction/testing-cli": patch
"@memberjunction/testing-engine": patch
"@memberjunction/testing-integration": patch
"@memberjunction/theme-engine": patch
"@memberjunction/unit-testing": patch
"@memberjunction/version-history": patch
---

Rename public class members and exported functions to PascalCase, per MJ's naming convention,
**without breaking a single consumer**.

Every renamed symbol keeps its old name beside the new one as a `@deprecated` stub that forwards to
it — a delegating method or function, a getter/setter pair for a property, and for Angular a
readable accessor pair for an `@Input` and a second `@Output` sharing the same `EventEmitter`, so a
template still binding the old name keeps receiving events. Old names still compile, still resolve,
and still behave identically; the deprecation tag rides through to the published `.d.ts`, so editors
point callers at the replacement. Where a package re-exports through an explicit `export { … }`
list, the new name is added alongside the old, so the correct name is actually on the public surface
rather than merely declared.

The rename is deliberately refused wherever a mechanical stub would not be equivalent, because
several of those shapes change a type contract while still compiling in the package that declares
them:

- an **optional** property or parameter property — TypeScript has no optional accessor, so a stub
  would promote `foo?` to a required member and break every object literal that omits it;
- a class that is a **data shape** (no methods, or `@ObjectType`/`@InputType`) — object literals are
  assigned to it, and an accessor stub changes what they must supply;
- a property whose **subclass redeclares it**, since TypeScript forbids a property overriding an
  accessor (TS2610);
- a name whose PascalCase form is **already bound** in that file or class;
- decorated members, `get`/`set` pairs behind a decorator, generators, destructured parameters,
  overload sets and abstract members.

Each package was verified against its own pre-change baseline rather than against zero, because
several packages in this repo do not typecheck cleanly to begin with. Angular packages were verified
with `ngc`, not `tsc`: a plain typecheck does not compile templates, and an earlier write-only
`@Input` alias passed `tsc` while breaking six template reads.
