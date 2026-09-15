# @memberjunction/web-search-engine

Metadata-driven **web search** for MemberJunction: a set of external search vendors behind one
interface, with administrator-controlled priority and automatic failover.

The administrator picks the vendor. The agent never does.

```typescript
import { WebSearchEngine } from '@memberjunction/web-search-engine';

await WebSearchEngine.Instance.Config(false, contextUser);
const result = await WebSearchEngine.Instance.Search({ Query: 'association management trends' }, contextUser);

if (result.Success) {
  for (const hit of result.Hits) console.log(hit.Title, hit.URL);
  console.log('served by', result.ProviderUsed);
}
```

---

## Why this exists

Google discontinues the Custom Search JSON API on **2027-01-01** and has already closed it to new
customers. Microsoft retired the Bing Search APIs on **2025-08-11**. Both replaced a commodity SERP
API with an answer-shaped grounding product locked to their own agent stack. Selling raw ranked web
results to developers is a business both companies have chosen to exit.

The lesson is not "pick a different vendor". It is that **any single web-search dependency has an
expiry date**, so the architecture has to make the next shutdown a configuration change.

Before this package, MJ had four independent web-search Actions — Google, Tavily, Perplexity,
DuckDuckGo — with three incompatible output contracts (`Items`, `Results`, `Content`). Nothing could
transparently fall back onto a different shape, so "Perplexity as a backup" was never actually a
backup. Swapping vendors meant editing every agent that named one.

Now it is a row in a table.

---

## How it differs from `@memberjunction/search-engine`

They sound alike and are not interchangeable. **`search-engine` searches content MJ owns**;
this package searches the open web.

|  | `search-engine` | `web-search-engine` |
|---|---|---|
| Searches | entity records, vectors, full-text, storage files | the public web, via external vendors |
| Result identity | `EntityName` + `RecordID` — a row you can open | a URL |
| Result type | `SearchResultItem` | `WebSearchHit` |
| Multiple sources | queried **together**, fused with RRF | tried **in order**, first success wins |
| Cost per query | a database query | real money at a vendor |
| Failure mode | a slow query | a rate limit, an expired key, a discontinued API |
| Provider table | `__mj.SearchProvider` | `__mj.WebSearchProvider` |

The decisive detail is the result contract: `SearchResultItem` **requires** `ID`, `EntityName` and
`RecordID` — the primary key of a source record — and the pipeline ends in `SearchEnricher`, which
resolves entity icons and record display names by entity lookup. A web hit has none of those.
Fitting one in would mean lying in the type and dragging it through enrichment designed to decorate
entity records.

What the two **do** share is the plugin pattern, and this package reuses all of it: a provider table
carrying `DriverClass` / `Priority` / `Status` / `CredentialID`, ClassFactory resolution, and the
`Initialize()` → `CheckAvailability()` → `IsAvailable()` lifecycle.

> **Blending the two** — web results and internal records in one ranked list — is reachable through
> the existing RRF fusion, but it needs a result type that does not require `EntityName`. That is a
> deliberate future step, not a side effect of this package.

---

## Three ways in

Pick by who is calling.

| Caller | Use | Why |
|---|---|---|
| Server-side TypeScript | `WebSearchEngine.Instance.Search()` | Direct, typed, no indirection |
| Browser / Angular | the `WebSearch.Query` Remote Operation | Keys never leave the server; typed end to end |
| An AI agent | the `Web Search` **Action** | Discoverable from metadata, one tool instead of four |

All three land in the same engine and obey the same provider configuration.

---

## Who uses this

All core AI agents (`Agent Manager`, `Demo Loop Agent`, `Demo Multi-Step Agent`, `Research Agent`, `Sage`) and the `Web Research` skill route their web lookups through the provider-neutral `Web Search` Action.

The legacy vendor actions (`Google Custom Search` and `Perplexity Search`) remain registered for direct or manual execution, but **carry no agent or skill bindings**. Any new agent, skill, or workflow step must bind `Web Search` instead of a specific vendor.

---

## Selection: how a provider is chosen

### Without an explicit provider

1. Filter to providers that are `Active`, report themselves available, and can do what was asked
2. Order by `Priority` **ascending — lower wins**
3. Try each in turn until one succeeds

Failover is **conditional**, and the condition is the part that matters:

| Failure | Engine does | Why |
|---|---|---|
| `transient` — rate limit, 5xx, timeout, bad key | try the next provider | another vendor may well succeed |
| `permanent` — the request itself is rejected | **stop** | every other vendor will reject it too; retrying costs four more paid calls and buries the real error behind four identical ones |

**Zero hits is a success.** A narrow query legitimately matches nothing. Treating that as failure
makes the engine retry a query that will keep returning nothing, at four vendors' expense.

### With an explicit provider

`Provider` pins the search to one vendor, by `Name` or `DriverClass`, case-insensitively. There is
**no failover** — the call fails, with a code that says exactly why:

| Code | Meaning | Fix |
|---|---|---|
| `PROVIDER_NOT_FOUND` | no such provider in metadata | add the row |
| `PROVIDER_NOT_ACTIVE` | the row exists, `Status` is not `Active` | flip the status |
| `PROVIDER_UNAVAILABLE` | Active, but not operational — usually no credential | set the key |
| `PROVIDER_LACKS_CAPABILITY` | e.g. `IncludeAnswer` on a hits-only provider | ask a different provider, or drop the flag |

Those are four different problems with four different fixes, which is why they are four codes and
not one. And the reason a pinned provider never silently falls back: a substitution is invisible.
Results keep arriving, from a vendor nobody chose, until something eventually surfaces it — usually
an invoice.

### `Attempts` — read this one

Every provider tried is recorded in `result.Attempts`, **including on the success path**.

If the primary provider rate-limits every call and the secondary quietly serves everything, the
system looks completely healthy. Nothing else makes that visible while the spend moves to a vendor
nobody selected.

```typescript
const result = await WebSearchEngine.Instance.Search({ Query: 'q' }, user);
// result.ProviderUsed === 'Tavily'
// result.Attempts === [
//   { ProviderName: 'Brave',  Succeeded: false, FailureKind: 'transient', ErrorMessage: '429 …' },
//   { ProviderName: 'Tavily', Succeeded: true,  HitCount: 10 },
// ]
```

---

## Configuring providers

Rows live in `__mj.WebSearchProvider`, seeded from `metadata/web-search-providers/`.

| Column | Purpose |
|---|---|
| `Name` | Admin-facing name, and what `Provider` matches. Unique |
| `DriverClass` | ClassFactory key — `@RegisterClass(BaseWebSearchProvider, …)` |
| `Status` | `Pending` / `Active` / `Terminated`. Only `Active` loads |
| `Priority` | **Lower is tried first** |
| `CredentialID` | FK to `Credential`; falls back to an env var when null |
| `ProviderConfig` | JSON of non-secret driver settings |
| `MaxResultsOverride` | Per-provider cap for pay-per-query vendors |
| `AllowResultCaching` | Defaults to **0**. See *Caching rights*, below |
| `DisplayName` / `Icon` / `Comments` | Admin UI and notes |

**Capabilities are not columns.** Whether a driver can synthesize an answer or honour a domain
filter is a property of the *implementation*, declared on the class — exactly as `search-engine`
declares `SourceType`. The table holds configuration: on/off, order, credentials, limits.

To change the primary vendor, edit one row's `Priority` and run `mj sync push`. No code change, no
agent change, no redeploy.

### Bundled drivers

| Driver | Default priority | Answer | Notes |
|---|---|---|---|
| `BraveWebSearchProvider` | 10 | no | **Own index** — not a Google or Bing reseller, so it fails independently of everything else here. Default primary |
| `TavilyWebSearchProvider` | 20 | yes | Returns extracted page content rather than snippets plus links. Aggregator |
| `PerplexityWebSearchProvider` | 30 | yes | Hits from the raw `/search` endpoint; Sonar only when an answer is asked for |
| `GoogleCustomSearchWebSearchProvider` | 40 | no | **Discontinued 2027-01-01.** Present so existing keys keep working through the transition |
| `DuckDuckGoWebSearchProvider` | 90 | no | Keyless last resort, Instant Answer API only. Answers a minority of queries — treat reliance on it as *unconfigured*. No HTML fallback, [by design](#why-duckduckgo-has-no-html-fallback) |

### Why DuckDuckGo has no HTML fallback

An earlier revision fell back to fetching and regex-parsing DuckDuckGo's HTML results page, which
answered far more queries than the Instant Answer API does. It was removed deliberately.

Running regular expressions over remote HTML is running them over **attacker-influenceable input**,
and CodeQL flagged the parser with two high-severity findings: polynomial backtracking in the result
patterns (the `[^"]*…[^"]*` shape) and incomplete sanitization in its tag-stripping.

Hardening those patterns would have *narrowed* the surface; deleting the parser *removes* it. For a
fallback inside a last-resort provider this engine already tells operators not to rely on, the
capability was not worth the exposure — and "the regex looks safe now" is exactly the kind of claim
that is true when written and wrong later.

**If you need real web coverage, configure a provider with an API.** That is what the rest of this
package is for.

### Credentials

Each driver reads its key from the linked `Credential` record first, then falls back to an
environment variable:

| Driver | Credential key(s) | Environment fallback |
|---|---|---|
| Brave | `apiKey` | `BRAVE_SEARCH_API_KEY` |
| Tavily | `apiKey` | `TAVILY_API_KEY` |
| Perplexity | `apiKey` | `PERPLEXITY_API_KEY` |
| Google Custom Search | `apiKey`, `cx` | `GOOGLE_CUSTOM_SEARCH_API_KEY`, `GOOGLE_CUSTOM_SEARCH_CX` |
| DuckDuckGo | — | — |

The fallback exists so a host upgrading from the per-vendor Actions does not have to migrate its
secrets into the Credential store on the same day it gains the engine.

A driver with no key **self-disables** rather than throwing. An unconfigured vendor is a normal
state in a product shipped to many hosts, not an error — the engine simply routes around it.

### ⚠️ Caching rights

`AllowResultCaching` defaults to `0`, and that default is deliberate.

Caching rights differ sharply between vendors: some sell result storage as a distinct plan tier,
others forbid persistent caching outright, and at least one major grounding product's terms prohibit
caching, syndicating or analysing results at all. Violating any of it is **silent** — nothing fails,
you are simply in breach.

Nothing in this engine caches today. The column exists so that the first caching layer reads a
per-provider gate instead of inventing one, and so the contractual answer lives next to the
credential it applies to. **Confirm your plan's terms before setting it to 1.**

---

## Writing a driver

```typescript
import { RegisterClass } from '@memberjunction/global';
import { BaseWebSearchProvider, WebSearchCapabilities } from '@memberjunction/web-search-engine';

@RegisterClass(BaseWebSearchProvider, 'AcmeWebSearchProvider')
export class AcmeWebSearchProvider extends BaseWebSearchProvider {
  public readonly Capabilities: WebSearchCapabilities = {
    Answer: false, DomainFilter: true, Freshness: true, Region: true, MaxResultsCap: 25,
  };

  private apiKey: string | undefined;

  public async CheckAvailability(): Promise<void> {
    this.apiKey = this.GetSecret('apiKey', 'ACME_API_KEY');
    this.apiKey ? this.MarkAvailable() : this.MarkUnavailable('No Acme API key.');
  }

  public async ExecuteSearch(params: WebSearchParams): Promise<WebSearchProviderResponse> {
    try {
      const response = await HttpGet<AcmeResponse>(ENDPOINT, { /* … */ });
      return { Success: true, Hits: (response.Data?.results ?? []).map(toHit) };
    } catch (e) {
      return classifyHttpFailure(e, 'Acme');   // sets FailureKind for you
    }
  }
}
```

Four rules, each of which has a failure mode if ignored:

1. **Declare capabilities honestly.** Claiming `DomainFilter: true` and then ignoring the filter
   returns confident results for a different question than the one asked.
2. **Classify failures correctly.** `classifyHttpFailure` handles the common cases; the distinction
   that matters is 400/422 (`permanent`) versus everything else (`transient`).
3. **Self-disable, don't throw**, when the driver is simply not configured on this host.
4. **Export a `Load…()` anchor** and call it from the package index. Bundlers drop a module whose
   exports are unused, and a dropped module never runs its decorator — so the driver silently
   vanishes from `ClassFactory` and the engine reports "no registered driver" for a `DriverClass`
   that plainly exists in the source.

---

## Result codes

| Code | `Success` | Meaning |
|---|:---:|---|
| `SUCCESS` | ✅ | Served. `Hits` may legitimately be empty |
| `MISSING_QUERY` | ❌ | `Query` was blank |
| `NO_PROVIDERS_CONFIGURED` | ❌ | No provider rows at all — a setup problem, not a search failure |
| `PROVIDER_LOAD_FAILED` | ❌ | The provider list could not be **read** — query failed, entity missing from metadata, or no permission. Distinct from the row above on purpose: a failed read also leaves the list empty, and telling an operator to "add a record" when the read never succeeded sends them to fix configuration that is fine |
| `NO_ELIGIBLE_PROVIDER` | ❌ | Providers exist, none is available and capable of this request |
| `PROVIDER_NOT_FOUND` / `_NOT_ACTIVE` / `_UNAVAILABLE` / `_LACKS_CAPABILITY` | ❌ | An explicit `Provider` could not serve — see the table above |
| `ALL_PROVIDERS_FAILED` | ❌ | Every eligible provider was tried; see `Attempts` |
| `INVALID_REQUEST` | ❌ | The request itself was rejected; retrying elsewhere cannot help |

`Search()` **never throws** for a search-level failure — branch on `Success`, as with `RunView`.
Exceptions escaping a driver are caught, recorded as a transient attempt, and failed over.

---

## Setup after the migration

> **This package does not compile until CodeGen has run.** The engine types its provider records as
> `MJWebSearchProviderEntity`, the generated subclass for `MJ: Web Search Providers` — deliberately,
> because a hand-written projection is a frozen copy that silently stops matching the table. Until
> the migration and CodeGen have run, `tsc` reports exactly one error: that the entity does not
> exist yet. That is expected, and it resolves with the same step that clears `check:codegen-tail`.


The `WebSearchProvider` migration ships with an empty CodeGen tail, because it was authored without
a database. To complete it locally:

```bash
pnpm mj sync push --dir metadata     # metadata FIRST — remote ops generate from rows, not schema
pnpm run mj:migrate                  # creates __mj.WebSearchProvider
pnpm mj codegen                      # entity subclass, resolvers, form, remote_operations.ts
# append the CodeGen_Run_*.sql output under the migration's banner, then delete that file
pnpm run build
```

Then add the Remote Operation's server half, which needs the base class CodeGen has just emitted:

```typescript
// packages/WebSearchEngine/src/operations/WebSearchQueryOperation.ts
import { RegisterClass } from '@memberjunction/global';
import { BaseRemotableOperation, IMetadataProvider, UserInfo } from '@memberjunction/core';
import { WebSearchQueryOperation, type WebSearchQueryInput, type WebSearchQueryOutput }
  from '@memberjunction/core-entities';
import { WebSearchEngine } from '../WebSearchEngine';

@RegisterClass(BaseRemotableOperation, 'WebSearch.Query')
export class WebSearchQueryServerOperation extends WebSearchQueryOperation {
  protected async InternalExecute(
    input: WebSearchQueryInput,
    provider: IMetadataProvider,
    user: UserInfo,
  ): Promise<WebSearchQueryOutput> {
    if (!input?.query?.trim()) throw new Error('query is required');   // no validation framework — guard clauses are it

    await WebSearchEngine.Instance.Config(false, user, provider);
    const result = await WebSearchEngine.Instance.Search({ /* map input */ } , user);
    if (!result.Success) throw new Error(`${result.ResultCode}: ${result.ErrorMessage}`);
    return { /* map output */ };
  }
}

export function LoadWebSearchOperations(): void { void WebSearchQueryServerOperation; }
```

Three things that fail quietly if skipped:

- **Extend the *generated* base**, never `BaseRemotableOperation` directly — extending it directly
  drops `RequiredScope` from the class, which turns the resolver's scope gate into a no-op for
  API-key callers.
- **Call `LoadWebSearchOperations()` from the host bootstrap**, and export it from the package
  index, or the registration is tree-shaken away.
- **Throw on failure** rather than returning a second `Success` flag. The framework's
  `RemoteOpResult` is the envelope a client inspects; two nested envelopes is one too many.

Verify before committing:

```bash
node .github/scripts/check-migration-entityfield-sequence.mjs   # apply-time MAX(Sequence)+1, never a literal
npm run check:codegen-tail                                      # generated entity/resolvers/form are committed
```

The PostgreSQL counterpart is **not** authored per-PR — conversion is build-engineer work at release
time.

---

## Testing

```bash
cd packages/WebSearchEngine && pnpm test
```

The selection tests are the ones that matter. Each pins a property with a way of passing while
broken: conditional failover, an explicit provider never being substituted, and `Attempts` being
recorded on the **success** path.

---

## Related

- [`guides/SEARCH_OVERVIEW_GUIDE.md`](../../guides/SEARCH_OVERVIEW_GUIDE.md) — which search API to reach for
- [`@memberjunction/search-engine`](../SearchEngine) — internal search over content MJ owns
- [`packages/Actions/CLAUDE.md`](../Actions/CLAUDE.md) — why the Action is a thin wrapper
