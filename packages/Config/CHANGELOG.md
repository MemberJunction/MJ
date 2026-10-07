# @memberjunction/config

## 6.2.0-edge.3

## 6.2.0-edge.2

## 6.2.0-edge.1

### Patch Changes

- 80905a1: Rename public class members and exported functions to PascalCase, per MJ's naming convention,
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

  **One wire-visible consequence, for version skew only.** `BaseInfo.toJSON` walks `_`-prefixed
  backing fields and emits them through their public getter, preferring the PascalCase one. Renaming
  the 23 field aliases in `MJCore/src/generic` therefore changes what `AllMetadata` carries:
  `EntityInfo.spCreate` and friends now serialize as `SpCreate`. A same-version client is unaffected —
  `copyInitData` accepts a value through a settable accessor, so either spelling lands on the right
  field. An OLDER client against a newer server has no such path in its `copyInitData` and drops those
  fields silently. Same-version deployments, which is the supported configuration, see no change.

  Each package was verified against its own pre-change baseline rather than against zero, because
  several packages in this repo do not typecheck cleanly to begin with. Angular packages were verified
  with `ngc`, not `tsc`: a plain typecheck does not compile templates, and an earlier write-only
  `@Input` alias passed `tsc` while breaking six template reads.

## 6.2.0-edge.0

## 6.1.0

## 6.1.0-edge.7

## 6.1.0-edge.6

## 6.1.0-edge.5

## 6.1.0-edge.4

## 6.1.0-edge.3

## 6.1.0-edge.2

## 6.1.0-edge.1

## 6.1.0-edge.0

## 6.0.0

## 5.51.0

## 5.50.0

### Patch Changes

- dd04a24: Widen the zod pin from `~3.24.4` to `^3.25.0` so it satisfies `@modelcontextprotocol/sdk`'s peer requirement (`zod ^3.25 || ^4.0`). The old tilde pin has no overlap with the SDK's peer range, which breaks strict package managers (pnpm) and MJCLI's oclif manifest generation under strict installs. zod 3.25.x keeps the classic v3 API at the root import, so this is a version-range correction with no behavior change.

## 5.49.0

## 5.48.0

## 5.47.0

## 5.46.0

## 5.45.1

## 5.45.0

## 5.44.0

## 5.43.0

## 5.42.0

## 5.41.0

## 5.40.2

## 5.40.1

## 5.40.0

## 5.39.0

## 5.38.0

## 5.37.0

## 5.36.0

## 5.35.0

## 5.34.1

## 5.34.0

### Patch Changes

- 7d8a0f9: Bound memory leaks: ResultHistory cap, QueueBase Stop/ IShutdownable, A2AServer, TaskStore, sweep, MJLruCache for provider / issuer caches, BaseLLM streaming reset, ShutdownRegister + SIGTERM contract.

## 5.33.0

## 5.32.0

## 5.31.0

### Patch Changes

- 7ed7a4b: no metadata/migration changes

## 5.30.1

## 5.30.0

## 5.29.0

## 5.28.0

## 5.27.1

## 5.27.0

## 5.26.0

## 5.25.0

## 5.24.0

## 5.23.0

## 5.22.0

## 5.21.0

## 5.20.0

## 5.19.0

## 5.18.0

## 5.17.0

## 5.16.0

## 5.15.0

## 5.14.0

## 5.13.0

## 5.12.0

## 5.11.0

## 5.10.1

## 5.10.0

## 5.9.0

## 5.8.0

## 5.7.0

## 5.6.0

## 5.5.0

### Patch Changes

- df2457c: no migration, just small code changes

## 5.4.1

## 5.4.0

## 5.3.1

## 5.3.0

## 5.2.0

## 5.1.0

## 5.0.0

### Major Changes

- 4aa1b54: breaking changes due to class name updates/approach

## 4.4.0

## 4.3.1

## 4.3.0

## 4.2.0

## 4.1.0

## 4.0.0

### Major Changes

- 8366d44: we goin' to 4.0!
- fe73344: Angular 21/Node 24/ESM everywhere, and more
- 5f6306c: 4.0

### Minor Changes

- e06f81c: changed SO much!

## 3.4.0

### Patch Changes

- 3a71e4e: Fix large text field corruptions, cross-platform improvements, more robust environment variable parsing for boolean values

## 3.3.0

## 3.2.0

## 3.1.1

## 3.0.0

### Major Changes

- f25f757: The foundation for MemberJunction v3.0's improved architecture, making it easier for developers to adopt and customize MJ for their needs.
