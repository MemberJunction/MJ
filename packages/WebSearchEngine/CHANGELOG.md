# @memberjunction/web-search-engine

## 6.2.0-edge.3

### Patch Changes

- Updated dependencies [25bb295]
- Updated dependencies [dfe40a4]
- Updated dependencies [131f3c4]
- Updated dependencies [0f04590]
- Updated dependencies [41c2c08]
- Updated dependencies [29b6ec3]
- Updated dependencies [66fd011]
- Updated dependencies [196160a]
- Updated dependencies [60bd774]
- Updated dependencies [35da130]
- Updated dependencies [28c92e0]
- Updated dependencies [ec97ad4]
- Updated dependencies [49e0bd8]
  - @memberjunction/core-entities@6.2.0-edge.3
  - @memberjunction/global@6.2.0-edge.3
  - @memberjunction/core@6.2.0-edge.3
  - @memberjunction/credentials@6.2.0-edge.3
  - @memberjunction/network-utils@6.2.0-edge.3

## 6.2.0-edge.2

### Patch Changes

- Updated dependencies [e97d95c]
- Updated dependencies [2552b1e]
- Updated dependencies [21f9e15]
- Updated dependencies [4248fb3]
- Updated dependencies [0adaf76]
- Updated dependencies [ef43cf3]
- Updated dependencies [b44c7cf]
- Updated dependencies [705ab4e]
- Updated dependencies [7e57b48]
- Updated dependencies [7e57b48]
- Updated dependencies [5986939]
- Updated dependencies [4d647e6]
- Updated dependencies [c35f7e5]
- Updated dependencies [369e229]
- Updated dependencies [d13cf6b]
- Updated dependencies [2854a2e]
  - @memberjunction/core@6.2.0-edge.2
  - @memberjunction/core-entities@6.2.0-edge.2
  - @memberjunction/global@6.2.0-edge.2
  - @memberjunction/credentials@6.2.0-edge.2
  - @memberjunction/network-utils@6.2.0-edge.2

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

- Updated dependencies [a50948e]
- Updated dependencies [0eeb89d]
- Updated dependencies [a3539d2]
- Updated dependencies [41274aa]
- Updated dependencies [67f6c85]
- Updated dependencies [eb3a8d3]
- Updated dependencies [e1dd673]
- Updated dependencies [307da67]
- Updated dependencies [a7da50b]
- Updated dependencies [17cc774]
- Updated dependencies [80905a1]
- Updated dependencies [6b08ebf]
  - @memberjunction/core-entities@6.2.0-edge.1
  - @memberjunction/core@6.2.0-edge.1
  - @memberjunction/credentials@6.2.0-edge.1
  - @memberjunction/global@6.2.0-edge.1
  - @memberjunction/network-utils@6.2.0-edge.1

## 6.2.0-edge.0

### Minor Changes

- 666c4e6: Add `@memberjunction/web-search-engine` — metadata-driven web search with provider failover.

  Google discontinues the Custom Search JSON API on 2027-01-01 and Microsoft retired the Bing Search
  APIs in 2025. MJ had four independent web-search Actions with three incompatible output contracts,
  so nothing could transparently fall back and swapping vendors meant editing every agent that named
  one. This makes the vendor a row in a table.
  - **New `__mj.WebSearchProvider` table** — `DriverClass`, `Status`, `Priority`, `CredentialID`,
    `ProviderConfig`, `MaxResultsOverride`, `AllowResultCaching`. A near-mirror of `SearchProvider`,
    deliberately, so the two are learnable together.
  - **New `WebSearchEngine`** — orders providers by `Priority` and serves from the first Active,
    available one. Failover is conditional: a transient failure (rate limit, 5xx, timeout, a
    rejected credential) moves to the next provider; a permanent one — the query itself rejected —
    stops, because every other vendor will reject it too. That distinction is drawn from the
    response body rather than the status code alone, since Google answers an invalid API key with
    HTTP 400 while Perplexity uses 401. An explicitly named `Provider` never falls back, and
    fails with a code that distinguishes never-configured, parked, uncredentialed and incapable.
  - **Five drivers** — Brave (own index, default primary), Tavily, Perplexity (`/search`, not the
    chat models), Google Custom Search (retiring), DuckDuckGo (keyless last resort).
  - **`Web Search` Action is now a provider-neutral router**, so agents bind to one stable tool and
    never make the vendor decision. DuckDuckGo becomes one driver behind it rather than the
    implementation. Its HTML-scraping fallback was **removed**, not carried over: CodeQL flagged
    polynomial ReDoS and incomplete sanitization in the parser's regexes over remote HTML, and for a
    fallback inside a last-resort provider the capability was not worth the exposure. The driver now
    answers only what DuckDuckGo's Instant Answer API returns, which is a minority of queries. The
    regression test was removed with the code it tested. No regex runs over remote input anywhere in
    the package.
  - **`WebSearch.Query` Remote Operation** — metadata, the `websearch:execute` scope, and the server
    implementation, so browser clients get the same capability without API keys leaving the server.
  - **Agents and skills rebound.** Every agent and skill that does web lookups now binds the
    provider-neutral `Web Search` Action and leaves `Provider` unset so the engine can fail over.
    `Google Custom Search` and `Perplexity Search` remain registered for direct or manual execution
    but carry no agent or skill bindings, and the rows removed from metadata are annotated for
    deletion so existing databases lose them too.

### Patch Changes

- Updated dependencies [38c4a81]
- Updated dependencies [e51296c]
- Updated dependencies [7be1684]
- Updated dependencies [e1fd4c1]
- Updated dependencies [d122a41]
- Updated dependencies [6e6e3f1]
- Updated dependencies [9b5b489]
- Updated dependencies [683f652]
- Updated dependencies [a8be410]
- Updated dependencies [f48dffc]
- Updated dependencies [630bb88]
- Updated dependencies [44faf83]
- Updated dependencies [bfd67c6]
- Updated dependencies [a17a228]
- Updated dependencies [ee1f0d9]
- Updated dependencies [104125c]
- Updated dependencies [5513c2a]
- Updated dependencies [8a5d2c0]
- Updated dependencies [2c590b0]
  - @memberjunction/core-entities@6.2.0-edge.0
  - @memberjunction/core@6.2.0-edge.0
  - @memberjunction/credentials@6.2.0-edge.0
  - @memberjunction/global@6.2.0-edge.0
  - @memberjunction/network-utils@6.2.0-edge.0
