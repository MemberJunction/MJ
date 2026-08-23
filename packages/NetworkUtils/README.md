# @memberjunction/network-utils

Low-level, **server-side only** network utilities for MemberJunction: an SSRF guard and a
dependency-free HTTP client built on Node's native `fetch`.

This package has **no MemberJunction dependencies and no third-party dependencies** — only
`node:dns` and `node:net`. That is deliberate: it sits below everything else so any server-side
package can use it without a dependency cycle.

> **Node only.** This package imports `node:dns` and `node:net` and must never be pulled into a
> browser bundle. That is precisely why the SSRF guard does not live in `@memberjunction/global`.

## Why this package exists

Two concerns live here, and they belong together:

1. **The SSRF guard.** Any code that fetches a caller-controlled URL is a read-SSRF risk. That is
   not an Actions-specific concern — it applies to any server-side package — so the guard belongs
   somewhere everything can reach.
2. **The HTTP client.** MJ used to reach for `axios` in a dozen packages. Replacing it with one
   native-`fetch` client removes supply-chain surface *and* puts every outbound request one option
   flag (`ValidateUrl`) away from the guard above. That is impossible to enforce when each package
   brings its own HTTP library.

## SSRF guard

```ts
import { SafeFetch, AssertPublicUrl, SSRFError } from '@memberjunction/network-utils';

// Validate without fetching
const url = await AssertPublicUrl(userSuppliedUrl);   // throws SSRFError if blocked

// Fetch with per-hop re-validation
const response = await SafeFetch(userSuppliedUrl, { MaxRedirects: 5 });
```

`AssertPublicUrl` rejects non-`http(s)` schemes, resolves the hostname to **all** of its IP
addresses via `dns.lookup(host, { all: true })`, and throws if **any** resolved address falls in a
private or reserved range. Resolving every address is what closes the DNS-rebinding bypass where
only one of several A/AAAA records is public. Hosts that do not resolve fail closed.

`SafeFetch` additionally disables automatic redirects (`redirect: 'manual'`) and re-runs
`AssertPublicUrl` on **every** hop, closing the redirect bypass.

### Blocked ranges

**IPv4** — `0.0.0.0/8`, `10/8`, `100.64/10` (CGNAT), `127/8`, `169.254/16` (includes the
`169.254.169.254` cloud-metadata endpoint), `172.16/12`, `192.0.0/24`, `192.0.2/24`, `192.88.99/24`,
`192.168/16`, `198.18/15`, `198.51.100/24`, `203.0.113/24`, `224/4`, `240/4`.

**IPv6** — `::1`, `::`, `fc00::/7`, `fe80::/10`, `ff00::/8`, plus IPv4-mapped and IPv4-compatible
addresses (`::ffff:a.b.c.d`, `::a.b.c.d`), which are unwrapped and run through the IPv4 rules.

## HTTP client

The shape mirrors the parts of axios MJ actually used, so call sites port over mechanically.

```ts
import { HttpGet, HttpPost, HttpClient, HttpError, IsHttpError } from '@memberjunction/network-utils';

// One-off requests
const response = await HttpGet<Payload>('https://api.example.com/things', {
    Query: { page: 1, tag: ['a', 'b'] },     // -> ?page=1&tag=a&tag=b
    Headers: { Authorization: `Bearer ${token}` },
    Timeout: 30000,
});
response.Data;      // parsed body
response.Status;    // 200
response.Headers;   // lower-cased keys

await HttpPost('https://api.example.com/things', { name: 'x' });   // JSON-encoded automatically
```

A configured client replaces `axios.create(...)`:

```ts
const client = new HttpClient({
    BaseURL: 'https://graph.facebook.com/v18.0',
    Timeout: 30000,
    Headers: { Accept: 'application/json' },

    // Replaces an axios request interceptor
    OnRequest: (config) => ({ ...config, Query: { ...config.Query, access_token: token } }),

    // Replaces the error half of an axios response interceptor
    OnRetry: async (error, attempt) => {
        if (error.Status !== 429) return false;
        await sleep(60000);
        return true;                 // bounded by MaxRetries (default 3)
    },
});

const feed = await client.Get<Feed>('/me/feed');
```

### Error handling

Non-2xx responses throw `HttpError` (matching axios's default), carrying `Status`, `StatusText`,
`Data`, `Headers`, `Url`, `Method`, and `IsTimeout`. Use `IsHttpError(e)` in place of
`isAxiosError(e)`. Pass `ThrowOnError: false` to get the response back instead — the equivalent of
axios's `validateStatus: () => true`.

```ts
try {
    await client.Get('/thing');
} catch (error) {
    if (IsHttpError(error) && error.Status === 404) { /* ... */ }
}
```

### Response types

`ResponseType` accepts `json` (default), `text`, `arraybuffer`, `blob`, `stream`, and `none`. The
`json` reader falls back to raw text when a server mislabels its content type, matching axios.

## SSRF defaults — read this before wiring a call site

`ValidateUrl` defaults to **`false`** on `HttpRequest` / `HttpClient`. This is intentional:

- Most MJ call sites talk to **fixed, well-known provider endpoints** (`api.twitter.com`,
  `graph.facebook.com`). Guarding those buys nothing and costs a DNS lookup per request.
- Some legitimately talk to **internal hosts** — MJServer posting to its own API, MetadataSync
  resolving an `@url:` reference on a dev box. Guarding those by default would break them.

Turn it on — or use `SafeFetch` / `SafeHttpRequest` — **wherever the URL is caller-controlled**,
which in practice means anything reachable by an AI agent, an Action parameter, or an API caller.

```ts
// Caller-controlled URL — guard it
const response = await HttpGet(userSuppliedUrl, { ValidateUrl: true });
```

## Exports

| Export | Purpose |
|---|---|
| `AssertPublicUrl(url)` | Validate a URL, resolving all addresses. Throws `SSRFError`. |
| `SafeFetch(url, init?)` | `fetch` with per-hop SSRF re-validation. |
| `IsBlockedIPAddress(addr)` | Classify a single IP literal. |
| `SSRFError` | Thrown when a URL is blocked. |
| `HttpRequest(config)` | Single request, full config. |
| `HttpGet` / `HttpPost` / `HttpPut` / `HttpPatch` / `HttpDelete` / `HttpHead` | Method shorthands. |
| `SafeHttpRequest(config)` | `HttpRequest` with `ValidateUrl: true`. |
| `HttpClient` | Configured client — replaces `axios.create(...)`. |
| `HttpError` / `IsHttpError` | Error type and guard — replaces `isAxiosError`. |
| `BuildQueryString(query)` | Query-string serialization used internally. |

## License

BUSL-1.1
